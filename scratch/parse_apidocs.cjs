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

  // Let's find all string literals that look like endpoints or parameters
  const regex = /"(\/[^"]+)"/g;
  let match;
  const paths = new Set();
  while ((match = regex.exec(js)) !== null) {
    if (match[1].length < 60 && !match[1].includes('<') && (match[1].startsWith('/file') || match[1].startsWith('/upload') || match[1].startsWith('/account') || match[1].startsWith('/folder') || match[1].startsWith('/e/'))) {
      paths.add(match[1]);
    }
  }
  console.log("Byse API Paths:", Array.from(paths));

  // Find the exact text around API documentation
  const apiDocStart = js.indexOf('apiReference');
  if (apiDocStart !== -1) {
    console.log("Snippet around apiReference:", js.slice(apiDocStart - 500, apiDocStart + 2500));
  }
}

main().catch(console.error);
