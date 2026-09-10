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
  console.log("Before totalEndpoints:", js.slice(idx - 1500, idx));
}

main().catch(console.error);
