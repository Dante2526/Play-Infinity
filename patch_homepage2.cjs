const fs = require('fs');
const path = 'src/pages/HomePage.tsx';
let content = fs.readFileSync(path, 'utf8');

// Ensure isMediaAvailable is also applied to kidsContent if it isn't already
const regexKids = /\.filter\(\(k: TMDBItem\) => k\.poster_path && \(k\.title \|\| k\.name\)\)/;
const replacementKids = `.filter((k: TMDBItem) => k.poster_path && (k.title || k.name) && isMediaAvailable(k))`;
content = content.replace(regexKids, replacementKids);

const regexKidsSeries = /\.filter\(\(ks: TMDBItem\) => ks\.poster_path && \(ks\.title \|\| ks\.name\)\)/;
const replacementKidsSeries = `.filter((ks: TMDBItem) => ks.poster_path && (ks.title || ks.name) && isMediaAvailable(ks))`;
content = content.replace(regexKidsSeries, replacementKidsSeries);

fs.writeFileSync(path, content);
