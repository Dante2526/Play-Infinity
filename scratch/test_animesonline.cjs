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
  const ao = await fetch("https://animesonlinecc.to/");
  console.log("AnimesOnlineCC Title:", ao.match(/<title>([^<]+)<\/title>/i)?.[1]);
  const epLinks = ao.match(/href=["'](https:\/\/animesonlinecc\.to\/episodio\/[^"']+)["']/g) || [];
  console.log("AnimesOnlineCC Ep Links:", epLinks.slice(0, 5));

  if (epLinks.length > 0) {
    const epUrl = epLinks[0].replace(/href=["']/, '').replace(/["']$/, '');
    console.log("Fetching episode:", epUrl);
    const epHtml = await fetch(epUrl);
    const iframes = epHtml.match(/<iframe[^>]+>/gi) || [];
    console.log("Iframes:", iframes);
    const srcMatches = epHtml.match(/src=["']([^"']*(?:player|embed|video|stream)[^"']*)["']/gi) || [];
    console.log("Src matches:", srcMatches);
  }
}

main();
