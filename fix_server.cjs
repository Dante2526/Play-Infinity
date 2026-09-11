const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(
  "// C) Clica na opção de player assim que surgir\\n              if (!optionClicked) {\\n                var option = document.querySelector('.players_select_items.visible .player_select_item') || \\n                              document.querySelector('.player_select_item');\\n                if (option) {\\n                  optionClicked = true;\\n                  option.click();\\n                }\\n              }",
  "// C) Clica na opção de player assim que surgir\\n              if (!optionClicked) {\\n                var option = document.querySelector('.players_select_items.visible .player_select_item') || document.querySelector('.player_select_item');\\n                if (option) {\\n                  optionClicked = true;\\n                  option.click();\\n                } else if (tries > 15 && document.querySelectorAll('.player_select_item').length === 0) {\\n                  clearInterval(autoStartTimer);\\n                  try { window.parent.postMessage({ type: 'WATCHPLAY_UNAVAILABLE', reason: 'no_sources' }, '*'); } catch(e){}\\n                  return;\\n                }\\n              }"
);
fs.writeFileSync('server.ts', code);
console.log("Fixed");
