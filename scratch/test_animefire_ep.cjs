const https = require('https');

function fetch(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', e => resolve({ error: e.message }));
  });
}

async function main() {
  console.log("Fetching animefire.io home...");
  const af = await fetch("https://animefire.io/");
  console.log("AnimeFire.io status:", af.status, "Title:", af.body?.match(/<title>([^<]+)<\/title>/i)?.[1]);
  
  // Find recent episode links
  const episodeLinks = af.body?.match(/href=["'](https:\/\/animefire\.io\/animes\/[^"']+)["']/g) || [];
  console.log("AnimeFire episode links (first 5):", episodeLinks.slice(0, 5));

  if (episodeLinks.length > 0) {
    const testEp = episodeLinks[0].replace(/href=["']/, '').replace(/["']$/, '');
    console.log("Testing episode page:", testEp);
    const epPage = await fetch(testEp);
    console.log("Ep status:", epPage.status, "Length:", epPage.body.length);
    
    // Look for video tags, iframe, sources, data-video, etc.
    const videos = epPage.body.match(/<video[^>]*>[\s\S]*?<\/video>/gi) || [];
    console.log("Videos:", videos);

    const iframes = epPage.body.match(/<iframe[^>]*>/gi) || [];
    console.log("Iframes:", iframes);

    const dataVideos = epPage.body.match(/data-video-src=["']([^"']+)["']/gi) || [];
    console.log("data-video-src:", dataVideos);

    const videoUrls = epPage.body.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)[^\s"'<>]*/gi) || [];
    console.log("Direct video URLs:", videoUrls);

    // Search for player scripts or api calls
    const playerScripts = epPage.body.match(/(.{0,100}(?:video-content|my-video|jwplayer|artplayer|v-player|player|sources).{0,100})/gi) || [];
    console.log("Player snippets (sample 3):", playerScripts.slice(0, 3));
  }
}

main().catch(console.error);
