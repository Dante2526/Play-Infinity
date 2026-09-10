const https = require('https');

function test(id) {
  return new Promise(resolve => {
    https.get(`https://v1.watchplay.shop/tvshow/${id}/1/1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    }, res => {
      resolve({ id, status: res.statusCode, location: res.headers.location });
    });
  });
}

async function main() {
  console.log(await test(209867)); // Solo Leveling
  console.log(await test(1399));   // Death Note
}
main();
