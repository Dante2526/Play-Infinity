const fs = require("fs");
const html = fs.readFileSync("scratch_bleach_simulated.html", "utf-8");
const idx = html.indexOf("maxBufferLength");
console.log(html.slice(idx - 50, idx + 400));
