const https = require('https');

function checkRedirect(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    }, (res) => {
      resolve({ status: res.statusCode, location: res.headers.location });
    }).on('error', e => resolve({ error: e.message }));
  });
}

async function main() {
  console.log("31911:", await checkRedirect("https://v1.watchplay.shop/tvshow/31911/1/1"));
  console.log("37606:", await checkRedirect("https://v1.watchplay.shop/tvshow/37606/1/1"));
}
main();
