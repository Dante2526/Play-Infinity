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
  const animes = [
    { name: "Jujutsu Kaisen", id: 95479 },
    { name: "One Piece", id: 37854 },
    { name: "Dragon Ball Z", id: 12971 },
    { name: "Bleach", id: 30984 },
    { name: "Chainsaw Man", id: 114410 },
    { name: "Spy x Family", id: 120089 },
    { name: "Naruto Clássico", id: 46260 },
  ];
  for (const a of animes) {
    const res = await test(a.id);
    console.log(`${a.name} (${a.id}): Status ${res.status} ${res.location || ''}`);
  }
}
main();
