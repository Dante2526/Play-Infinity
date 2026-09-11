const fs = require('fs');
let code = fs.readFileSync('src/components/VideoPlayerModal.tsx', 'utf8');

// For Series
code = code.replace(
  `        {
          key: "srv_vidlink",
          label: "Player 3 (VidLink HD)",
          badge: "VidLink Multi-Stream • Legendas / Áudio PT-BR",
          buildUrl: (id: string, s: number, e: number) =>
            \`https://vidlink.pro/tv/\${id}/\${s}/\${e}?primaryColor=e50914&sub=pt\`,
          isMatch: (u: string) => u.includes("vidlink.pro"),
          name: "Player 3 (VidLink HD)"
        },
        {
          key: "srv_videasy",
          label: "Player 4 (Videasy Multi)",
          badge: "Videasy CDN • Alta Velocidade",
          buildUrl: (id: string, s: number, e: number) =>
            \`https://player.videasy.net/tv/\${id}/\${s}/\${e}\`,
          isMatch: (u: string) => u.includes("videasy.net"),
          name: "Player 4 (Videasy Multi)"
        }`,
  `        {
          key: "srv_videasy",
          label: "Player 3 (Videasy Multi)",
          badge: "Videasy CDN • Múltiplos Idiomas / Alta Velocidade",
          buildUrl: (id: string, s: number, e: number) =>
            \`https://player.videasy.net/tv/\${id}/\${s}/\${e}\`,
          isMatch: (u: string) => u.includes("videasy.net"),
          name: "Player 3 (Videasy Multi)"
        },
        {
          key: "srv_vidlink",
          label: "Player 4 (VidLink HD)",
          badge: "VidLink Multi-Stream • Legendas PT-BR",
          buildUrl: (id: string, s: number, e: number) =>
            \`https://vidlink.pro/tv/\${id}/\${s}/\${e}?primaryColor=e50914&sub=pt\`,
          isMatch: (u: string) => u.includes("vidlink.pro"),
          name: "Player 4 (VidLink HD)"
        },
        {
          key: "srv_autoembed",
          label: "Player 5 (AutoEmbed)",
          badge: "AutoEmbed • Servidor Global",
          buildUrl: (id: string, s: number, e: number) =>
            \`https://player.autoembed.cc/embed/tv/\${id}/\${s}/\${e}\`,
          isMatch: (u: string) => u.includes("autoembed"),
          name: "Player 5 (AutoEmbed)"
        }`
);

// For Movies
code = code.replace(
  `        {
          key: "srv_vidlink",
          label: "Player 3 (VidLink HD)",
          badge: "VidLink Multi-Stream • Legendas / Áudio PT-BR",
          buildUrl: (id: string) => \`https://vidlink.pro/movie/\${id}?primaryColor=e50914&sub=pt\`,
          isMatch: (u: string) => u.includes("vidlink.pro"),
          name: "Player 3 (VidLink HD)"
        },
        {
          key: "srv_videasy",
          label: "Player 4 (Videasy Multi)",
          badge: "Videasy CDN • Alta Velocidade",
          buildUrl: (id: string) => \`https://player.videasy.net/movie/\${id}\`,
          isMatch: (u: string) => u.includes("videasy.net"),
          name: "Player 4 (Videasy Multi)"
        }`,
  `        {
          key: "srv_videasy",
          label: "Player 3 (Videasy Multi)",
          badge: "Videasy CDN • Múltiplos Idiomas / Alta Velocidade",
          buildUrl: (id: string) => \`https://player.videasy.net/movie/\${id}\`,
          isMatch: (u: string) => u.includes("videasy.net"),
          name: "Player 3 (Videasy Multi)"
        },
        {
          key: "srv_vidlink",
          label: "Player 4 (VidLink HD)",
          badge: "VidLink Multi-Stream • Legendas PT-BR",
          buildUrl: (id: string) => \`https://vidlink.pro/movie/\${id}?primaryColor=e50914&sub=pt\`,
          isMatch: (u: string) => u.includes("vidlink.pro"),
          name: "Player 4 (VidLink HD)"
        },
        {
          key: "srv_autoembed",
          label: "Player 5 (AutoEmbed)",
          badge: "AutoEmbed • Servidor Global",
          buildUrl: (id: string) => \`https://player.autoembed.cc/embed/movie/\${id}\`,
          isMatch: (u: string) => u.includes("autoembed"),
          name: "Player 5 (AutoEmbed)"
        }`
);

fs.writeFileSync('src/components/VideoPlayerModal.tsx', code);
console.log("Servers swapped in VideoPlayerModal.tsx");
