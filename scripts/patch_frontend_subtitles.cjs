const fs = require('fs');
const path = require('path');

const modalPath = path.join(__dirname, 'src', 'components', 'VideoPlayerModal.tsx');
const skinPath = path.join(__dirname, 'src', 'components', 'NetflixPlayerSkin.tsx');

let modalContent = fs.readFileSync(modalPath, 'utf8');

// Pass props to NetflixPlayerSkin
if (!modalContent.includes('subtitleUrl={subtitleUrl}')) {
  modalContent = modalContent.replace(
    /<NetflixPlayerSkin\s+mediaId=\{resolvedId\}/,
    '<NetflixPlayerSkin\n                subtitleUrl={subtitleUrl}\n                isAnime={isAnimeMedia}\n                mediaId={resolvedId}'
  );
  fs.writeFileSync(modalPath, modalContent, 'utf8');
  console.log('Patched VideoPlayerModal.tsx NetflixPlayerSkin tag');
}

let skinContent = fs.readFileSync(skinPath, 'utf8');
if (!skinContent.includes('subtitleUrl?')) {
  skinContent = skinContent.replace(
    /passThroughClicks\?: boolean;\n}/,
    'passThroughClicks?: boolean;\n  subtitleUrl?: string | null;\n  isAnime?: boolean;\n}'
  );
  
  skinContent = skinContent.replace(
    /isMiniPlayer,\n\s*passThroughClicks/,
    'isMiniPlayer,\n  passThroughClicks,\n  subtitleUrl,\n  isAnime'
  );

  // Add state for subtitles
  skinContent = skinContent.replace(
    /const \[showEpisodes, setShowEpisodes\] = useState\(false\);/,
    `const [showEpisodes, setShowEpisodes] = useState(false);\n  const [isSubtitleVisible, setIsSubtitleVisible] = useState(!!isAnime);`
  );

  // Add effects to send postMessages
  const msgCode = `
  // Post messages para legendas
  useEffect(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'SET_SUBTITLE_URL',
        url: subtitleUrl || null,
        label: 'Português (Brasil)'
      }, '*');
    }
  }, [subtitleUrl]);

  useEffect(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'SHOW_SUBTITLE',
        show: isSubtitleVisible
      }, '*');
    }
  }, [isSubtitleVisible]);
`;
  skinContent = skinContent.replace(
    /useEffect\(\(\) => \{\n\s*const preventDef/,
    msgCode + '\n  useEffect(() => {\n    const preventDef'
  );

  // Update CC button
  skinContent = skinContent.replace(
    /<span className="text-white\/60 font-medium whitespace-nowrap">Áudio e Legendas<\/span>/,
    `<span className="text-white/60 font-medium whitespace-nowrap">
      Legendas: {subtitleUrl ? (isSubtitleVisible ? 'PT-BR' : 'Desativado') : 'Indisponível'}
    </span>`
  );

  skinContent = skinContent.replace(
    /className="p-2 hover:bg-white\/10 rounded-full transition-colors flex items-center gap-2"/g,
    `className="p-2 hover:bg-white/10 rounded-full transition-colors flex items-center gap-2"
     onClick={() => subtitleUrl && setIsSubtitleVisible(!isSubtitleVisible)}
     style={{ opacity: subtitleUrl ? 1 : 0.5, cursor: subtitleUrl ? 'pointer' : 'not-allowed' }}`
  );

  fs.writeFileSync(skinPath, skinContent, 'utf8');
  console.log('Patched NetflixPlayerSkin.tsx');
}
