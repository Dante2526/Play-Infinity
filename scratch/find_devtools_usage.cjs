const fs = require("fs");
const html = fs.readFileSync("scratch_bleach_simulated.html", "utf-8");
const idx = html.indexOf("devtools");
while (idx !== -1) {
  console.log("Match:", html.slice(idx, idx + 200));
  break;
}
const idx2 = html.indexOf("devtoolsDetector");
if (idx2 !== -1) {
  console.log("devtoolsDetector snippet:", html.slice(idx2 - 100, idx2 + 400));
} else {
  console.log("No devtoolsDetector in inline HTML.");
}
