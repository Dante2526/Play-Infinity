const https = require('https');

function fetch(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
  });
}

async function main() {
  const html = await fetch("https://anroll.net/");
  console.log("Title:", html.match(/<title>([^<]+)<\/title>/i)?.[1]);
  // Find anime or episode links
  const links = html.match(/href=["'](\/[^"']+|https?:\/\/[^"']+)["']/g) || [];
  console.log("Anroll links:", links.filter(l => l.includes('anime') || l.includes('e/')).slice(0, 15));
}

main();
