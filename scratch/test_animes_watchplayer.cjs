const https = require('https');

function testUrl(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://v1.watchplay.shop/'
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const hasVideo = data.includes('artInstance') || data.includes('source') || data.includes('options') || data.includes('player_container');
        const is404 = res.statusCode === 404 || data.includes('superflix') || data.includes('Não encontrado') || data.includes('404');
        resolve({ url, status: res.statusCode, hasVideo, is404, len: data.length });
      });
    }).on('error', e => resolve({ url, error: e.message }));
  });
}

async function main() {
  const urls = [
    "https://v1.watchplay.shop/tvshow/1429/1/1", // Attack on Titan
    "https://v1.watchplay.shop/tvshow/85937/1/1", // Demon Slayer
    "https://v1.watchplay.shop/tvshow/31911/1/1", // Naruto Shippuden
    "https://v1.watchplay.shop/tvshow/37606/5/36", // Gumball S05E36
    "https://v1.watchplay.shop/tvshow/37606/1/1", // Gumball S01E01
  ];

  for (const u of urls) {
    const r = await testUrl(u);
    console.log(u, "-> Status:", r.status, "hasVideo:", r.hasVideo, "is404:", r.is404);
  }
}

main().catch(console.error);
