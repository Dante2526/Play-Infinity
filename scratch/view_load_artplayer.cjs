const fs = require("fs");
const html = fs.readFileSync("scratch_bleach_simulated.html", "utf-8");
const start = html.indexOf("function loadArtPlayer");
console.log(html.slice(start, start + 3000));
