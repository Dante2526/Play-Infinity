const fs = require('fs');
const path = require('path');

// 1. Fix server.ts
let serverPath = path.join(__dirname, 'server.ts');
let serverContent = fs.readFileSync(serverPath, 'utf8');
serverContent = serverContent.replace(/import\s*nuvixRouter\s*from\s*['"]\.\/server\/routes\/nuvixRoutes['"];?\n?/, '');
serverContent = serverContent.replace(/app\.use\(\s*nuvixRouter\s*\);?\n?/, '');
fs.writeFileSync(serverPath, serverContent, 'utf8');

// 2. Fix VideoPlayerModal.tsx
let modalPath = path.join(__dirname, 'src', 'components', 'VideoPlayerModal.tsx');
let modalContent = fs.readFileSync(modalPath, 'utf8');

const injectedCode = `  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !tmdbId) return;
    const s = mediaType === "series" ? season : 1;
    const e = mediaType === "series" ? episode : 1;
    setSubtitleUrl(null);
    const fetchSubtitle = async () => {
      try {
        const url = \`/api/subtitles?tmdb=\${tmdbId}&type=\${mediaType === "series" ? 'tv' : 'movie'}&season=\${s}&episode=\${e}&lang=pt-BR\`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.url) {
            setSubtitleUrl(data.url);
          }
        }
      } catch (err) {
        console.warn("Subtitle fetch error", err);
      }
    };
    fetchSubtitle();
  }, [isOpen, tmdbId, mediaType, episode, season]);
`;

if (modalContent.includes('const [subtitleUrl')) {
  // Remove it from the current position
  modalContent = modalContent.replace(injectedCode, '');
  
  // Insert it after episode declaration
  const target = 'const [episode, setEpisode] = useState<number>(initialEpisode);\n';
  modalContent = modalContent.replace(target, target + injectedCode);
  fs.writeFileSync(modalPath, modalContent, 'utf8');
  console.log('Fixed VideoPlayerModal.tsx');
}
