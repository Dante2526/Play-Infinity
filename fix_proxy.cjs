const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetStr = `            if ($firstItem.length) {
                $firstItem.click();
            }
        }, 100);
    }
});`;

const replaceStr = `            if ($firstItem.length) {
                $firstItem.click();
            } else {
                // FALLBACK SE O FILME NÃO EXISTIR
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "no_options" }, "*");
                } catch(e){}
            }
        }, 100);
    }
});`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('server.ts', code);
  console.log("Fixed server.ts");
} else {
  console.log("Could not find targetStr");
}
