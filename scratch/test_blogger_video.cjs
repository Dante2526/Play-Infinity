const https = require('https');

function fetch(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://animesonlinecc.to/'
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
  });
}

async function main() {
  const tokenUrl = "https://www.blogger.com/video.g?token=AD6v5dxhDIJjGq0iZs_IGq78Po9k_qZpwZR0r5uCPBYa25_LvTuEWmCtFq7BAaGB7mPEIkQI5R_1JmHj1WUfwML5SunhMLShHBM9GbAuEQgvoOYXXb8HCH2dahr-X9R59TSMD0PW438";
  const r = await fetch(tokenUrl);
  console.log("Status:", r.status, "Length:", r.body.length);
  console.log("Headers:", r.headers);
  // Find video sources or stream URLs in body
  const streamUrls = r.body.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8|webm)[^\s"'<>]*/gi) || [];
  console.log("Stream URLs found in Blogger:", streamUrls);

  // Search for VIDEO_CONFIG or streams JSON in blogger video page
  const videoConfig = r.body.match(/VIDEO_CONFIG\s*=\s*({[\s\S]*?});/);
  if (videoConfig) {
    console.log("VIDEO_CONFIG:", videoConfig[1]);
  } else {
    console.log("Snippet:", r.body.slice(0, 500));
  }
}

main();
