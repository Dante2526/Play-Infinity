const https = require('https');

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function main() {
  console.log("Fetching q8y5z JS...");
  const jsRes = await fetchUrl("https://q8y5z.com/assets/index-DocunfmE.js");
  console.log("JS Status:", jsRes.status, "Length:", jsRes.body.length);
  
  // Search for API endpoints or docs in the JS bundle
  const endpoints = jsRes.body.match(/(\/api\/[a-zA-Z0-9_\-\/]+)/g) || [];
  console.log("API endpoints found in JS:", [...new Set(endpoints)].slice(0, 30));

  // Search for mentions of api-docs or endpoints or byse/basing
  const docsMentions = jsRes.body.match(/(.{0,100}api-docs.{0,100})/gi) || [];
  console.log("Mentions of api-docs:", docsMentions.slice(0, 5));

  // Check routes or documentation text
  const docRoutes = jsRes.body.match(/(.{0,80}(?:swagger|openapi|documentation|endpoint|video|embed|upload|token).{0,80})/gi) || [];
  console.log("Doc snippet matches (sample 5):", docRoutes.slice(0, 5));
}

main().catch(console.error);
