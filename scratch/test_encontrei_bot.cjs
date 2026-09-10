const https = require('https');

function fetch(path, headers = {}) {
  return new Promise((resolve) => {
    https.get({
      hostname: 'encontrei.info',
      path,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', (e) => resolve({ error: e.message }));
  });
}

async function main() {
  const home = await fetch('/');
  console.log("Home status:", home.status, "Location:", home.headers?.location);
  
  const googlebot = await fetch('/episodios/online/o-incrivel-mundo-de-gumball-5x36-dublado-55147/', {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
  });
  console.log("Googlebot status:", googlebot.status, "Location:", googlebot.headers?.location, "Length:", googlebot.body?.length);
  if (googlebot.body && googlebot.body.length > 500) {
    console.log("Googlebot snippet:", googlebot.body.slice(0, 1000));
    // search for byse / embed / q8y5z / iframe / video / file_code
    const matches = googlebot.body.match(/(https?:\/\/[^\s"'<>]+(?:byse|q8y5z|filemoon|stream|embed|player)[^\s"'<>]*)/gi) || [];
    console.log("Matches:", matches);
  }
}

main().catch(console.error);
