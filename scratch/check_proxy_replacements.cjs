const fs = require("fs");

const html = fs.readFileSync("scratch_bleach_simulated.html", "utf-8");
let pos = 0;
while ((pos = html.indexOf("watchplay-proxy", pos)) !== -1) {
  console.log(`\n=== MATCH AT ${pos} ===`);
  console.log(html.slice(pos - 60, pos + 100));
  pos += 15;
}
