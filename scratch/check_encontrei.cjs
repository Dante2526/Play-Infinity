const https = require('https');

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
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
  console.log("Checking encontrei.info...");
  const res = await fetchUrl("https://encontrei.info/episodios/online/o-incrivel-mundo-de-gumball-5x36-dublado-55147/");
  console.log("Status:", res.status);
  console.log("Location:", res.headers.location);
  console.log("Set-Cookie:", res.headers['set-cookie']);
  console.log("Body length:", res.body.length);
  console.log("Title snippet:", res.body.match(/<title>([^<]+)<\/title>/i)?.[1]);
  
  // Search for iframes, embeds, byse, q8y5z, video, player, file_code, etc.
  const iframes = res.body.match(/<iframe[^>]+>/gi) || [];
  console.log("Iframes:", iframes);

  const byseMatches = res.body.match(/(https?:\/\/[^\s"'<>]*(?:q8y5z|byse)[^\s"'<>]*)/gi) || [];
  console.log("Byse / q8y5z matches:", byseMatches);

  // Search for any embed or video player scripts
  const scripts = res.body.match(/<script[^>]*src=["']([^"']+)["']/gi) || [];
  console.log("Scripts:", scripts.slice(0, 10));

  // Search for any player or stream URLs
  const videoUrls = res.body.match(/(https?:\/\/[^\s"'<>]*(?:\/e\/|\/embed\/|\/v\/|\/d\/)[^\s"'<>]*)/gi) || [];
  console.log("Video/embed URLs:", videoUrls);
}

main().catch(console.error);
