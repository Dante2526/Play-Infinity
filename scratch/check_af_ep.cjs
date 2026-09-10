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
  const animePage = await fetch("https://animefire.io/anime/OZLtRqzPHBm");
  console.log("Title:", animePage.match(/<title>([^<]+)<\/title>/i)?.[1]);
  const epLinks = animePage.match(/href=["'](\/video\/[^"']+)["']/g) || animePage.match(/href=["'](\/anime\/[^"']+\/[^"']+)["']/g) || [];
  console.log("Episode links:", epLinks.slice(0, 10));

  if (epLinks.length > 0) {
    const epUrl = "https://animefire.io" + epLinks[0].replace(/href=["']/, '').replace(/["']$/, '');
    console.log("Fetching episode:", epUrl);
    const epPage = await fetch(epUrl);
    console.log("Ep Title:", epPage.match(/<title>([^<]+)<\/title>/i)?.[1]);
    
    // Look for video tags, iframe, sources, data-video, etc.
    const videos = epPage.match(/<video[^>]*>[\s\S]*?<\/video>/gi) || [];
    console.log("Videos:", videos);

    const iframes = epPage.match(/<iframe[^>]*>/gi) || [];
    console.log("Iframes:", iframes);

    const videoUrls = epPage.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)[^\s"'<>]*/gi) || [];
    console.log("Direct video URLs:", videoUrls);

    // Look for api or stream endpoints in scripts
    const scriptUrls = epPage.match(/(https?:\/\/[^\s"'<>]+(?:api|stream|video|player)[^\s"'<>]*)/gi) || [];
    console.log("Script URLs:", scriptUrls.slice(0, 10));
  }
}

main();
