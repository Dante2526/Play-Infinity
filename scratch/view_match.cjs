const fs = require("fs");
const html = fs.readFileSync("scratch_bleach_simulated.html", "utf-8");
console.log(html.slice(31300, 31550));
