const fs = require('fs');
let code = fs.readFileSync('src/components/VideoPlayerModal.tsx', 'utf8');

// For Series
code = code.replace(
  'buildUrl: (id: string, s: number, e: number) => `https://embedplayapi.top/embed/${id}/${s}/${e}`',
  'buildUrl: (id: string, s: number, e: number) => `/api/embedplay-direct?tmdb=${id}&s=${s}&e=${e}&type=series`'
);
code = code.replace(
  /isMatch: \(u: string\) => u.includes\("embedplayapi.top"\)/g,
  'isMatch: (u: string) => u.includes("embedplay-direct")'
);
code = code.replace(
  'buildUrl: (id: string) => `https://embedplayapi.top/embed/${id}`',
  'buildUrl: (id: string) => `/api/embedplay-direct?tmdb=${id}&type=movie`'
);

// We need to fix the badge to highlight that we bypassed it
code = code.replace(
  /badge: "EmbedPlayAPI • Acervo Completo Dublado\/Legendado"/g,
  'badge: "Stream Nativo EmbedPlay • Dublado PT-BR Direto"'
);

fs.writeFileSync('src/components/VideoPlayerModal.tsx', code);
console.log("Updated VideoPlayerModal!");
