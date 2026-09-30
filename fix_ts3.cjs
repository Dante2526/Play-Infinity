const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'components', 'VideoPlayerModal.tsx');
let content = fs.readFileSync(file, 'utf8');

const targetStr = `const [episode, setEpisode] = useState<number>(initialEpisode);`;
const insertPos = content.indexOf(targetStr);

if (insertPos !== -1) {
    const afterPos = insertPos + targetStr.length;
    
    const codeToInsert = `
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);

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

    content = content.substring(0, afterPos) + codeToInsert + content.substring(afterPos);
    
    // Also patch the NetflixPlayerSkin component tag
    content = content.replace(
      /<NetflixPlayerSkin\s+mediaId=\{resolvedId\}/,
      '<NetflixPlayerSkin\n                subtitleUrl={subtitleUrl}\n                isAnime={isAnimeMedia}\n                mediaId={resolvedId}'
    );

    fs.writeFileSync(file, content, 'utf8');
    console.log("Successfully patched VideoPlayerModal with indexOf");
} else {
    console.log("Could not find the target string.");
}
