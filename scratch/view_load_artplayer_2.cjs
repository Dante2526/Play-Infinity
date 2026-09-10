const fs = require("fs");
const html = fs.readFileSync("scratch_bleach_simulated.html", "utf-8");
const start = html.indexOf("subtitle: subtitles.length > 0 ? subtitles[0] : null,");
console.log(html.slice(start, start + 2000));
