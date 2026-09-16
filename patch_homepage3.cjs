const fs = require('fs');
const path = 'src/pages/HomePage.tsx';
let content = fs.readFileSync(path, 'utf8');

// Ensure isMediaAvailable is also applied to trending content
const regexTrending = /\.filter\(\(item: any\) => item\.backdrop_path && item\.poster_path && \(item\.title \|\| item\.name\)\)/;
const replacementTrending = `.filter((item: any) => item.backdrop_path && item.poster_path && (item.title || item.name) && isMediaAvailable(item))`;
content = content.replace(regexTrending, replacementTrending);

fs.writeFileSync(path, content);
