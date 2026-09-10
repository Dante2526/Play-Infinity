const fs = require("fs");

const html = fs.readFileSync("scratch_bleach_simulated.html", "utf-8");
let pos = 0;
while ((pos = html.indexOf("player_select_item", pos)) !== -1) {
  console.log(`\n=== MATCH AT ${pos} ===`);
  console.log(html.slice(pos - 40, pos + 180));
  pos += 18;
}
