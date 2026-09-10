const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const js = await fetchUrl("https://q8y5z.com/assets/index-DocunfmE.js");
  const p0Index = js.indexOf('path:"api-docs",element:');
  console.log("Snippet around api-docs:", js.slice(p0Index - 200, p0Index + 200));

  // Find all assets lazy loaded
  const dynamicImports = js.match(/assets\/[a-zA-Z0-9_\-]+\.js/g) || [];
  console.log("Dynamic JS imports:", [...new Set(dynamicImports)]);
}

main().catch(console.error);
