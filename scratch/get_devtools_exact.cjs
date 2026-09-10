const fs = require("fs");
const html = fs.readFileSync("scratch_bleach_simulated.html", "utf-8");
const idx = html.indexOf("devtoolsDetector");
console.log(html.slice(idx - 200, idx + 300));
