const fs = require('fs');
const path = 'src/data.ts';
let content = fs.readFileSync(path, 'utf8');

const regex = /export const UNAVAILABLE_TITLES_OR_IDS = \[/;
const replacement = `export const UNAVAILABLE_TITLES_OR_IDS = [
  939243,  // A Ilha Esquecida
  1059955, // The Last Photograph`;

content = content.replace(regex, replacement);
fs.writeFileSync(path, content);
