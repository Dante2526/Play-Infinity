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
  console.log("Length:", js.length);

  // Look for api-docs texts
  const idx = js.indexOf("api-docs");
  console.log("Index of api-docs in frontPagesBundle:", idx);

  // Search for endpoints or documentation texts in frontPagesBundle
  const matches = js.match(/"[^"]*api[^"]*"/gi) || [];
  console.log("Quotes with api:", [...new Set(matches)].slice(0, 30));

  // Search for urls or endpoints
  const urls = js.match(/https?:\/\/[^\s"']+/g) || [];
  console.log("URLs in bundle:", [...new Set(urls)]);

  // Let's dump text that looks like documentation
  const docText = js.match(/(?:GET|POST|DELETE|PATCH)\s+[^"'\s]+/g) || [];
  console.log("HTTP methods found:", docText);

  // Search for parameters, video/file endpoints
  const fileEndpoints = js.match(/(?:\/api\/|\/v1\/|\/file\/|\/video\/|\/e\/)[a-zA-Z0-9_\-\/]+/g) || [];
  console.log("Potential endpoints:", [...new Set(fileEndpoints)]);
}

main().catch(console.error);
