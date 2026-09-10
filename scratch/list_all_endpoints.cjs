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
  const js = await fetchUrl("https://q8y5z.com/assets/frontPagesBundle-C5WdTgs_.js");
  const idx = js.indexOf('apiReference.totalEndpoints');
  // Find where W starts
  const wStart = js.lastIndexOf('=[{id:"account"', idx);
  console.log("Found wStart at:", wStart);
  if (wStart !== -1) {
    const rawW = js.slice(wStart + 1, idx);
    // Find all paths and methods
    const matches = rawW.matchAll(/method:"([A-Z]+)",path:"([^"]+)"(?:,description:"([^"]+)")?/g);
    for (const m of matches) {
      console.log(`${m[1]} https://api.byse.sx${m[2]} - ${m[3] || ''}`);
    }
  }
}

main().catch(console.error);
