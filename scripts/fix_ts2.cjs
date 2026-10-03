const fs = require('fs');
const path = require('path');
let modalPath = path.join(__dirname, 'src', 'components', 'VideoPlayerModal.tsx');
let modalContent = fs.readFileSync(modalPath, 'utf8');

const target1 = `  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);

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
  }, [isOpen, tmdbId, mediaType, episode, season]);`;

const target2 = `  // Series Season & Episode State
  const [season, setSeason] = useState<number>(initialSeason);
  const [episode, setEpisode] = useState<number>(initialEpisode);`;

modalContent = modalContent.replace(target1, '');
modalContent = modalContent.replace(target2, target2 + '\n' + target1);

fs.writeFileSync(modalPath, modalContent, 'utf8');
console.log('Fixed VideoPlayerModal');
