const https = require('https');

async function checkEpisode(id, s, e) {
  return new Promise((resolve) => {
    const url = `https://v1.watchplay.shop/tvshow/${id}/${s}/${e}`;
    const req = https.get(url, (res) => {
      resolve(res.statusCode === 200);
      req.destroy();
    });
    req.on('error', () => resolve(false));
  });
}

async function run() {
  const tmdbId = 30984; // Bleach
  const season = 2;
  const maxEpisodes = 50;
  
  console.log(`Checking Bleach S${season}...`);
  for (let e = maxEpisodes; e >= 1; e--) {
    const isAvail = await checkEpisode(tmdbId, season, e);
    if (isAvail) {
      console.log(`Max available episode is ${e}`);
      break;
    } else {
      console.log(`Episode ${e} not available`);
    }
  }
}
run();
