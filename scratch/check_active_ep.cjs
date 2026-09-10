const cheerio = require("cheerio");

async function checkActiveEp() {
  const url = "https://v1.watchplay.shop/tvshow/30984/1/1";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const active = $('.episodeOption.active');
  console.log("Active episodeOption count:", active.length);
  if (active.length > 0) {
    console.log("Active ep data:", {
      contentid: active.data("contentid") || active.attr("data-contentid"),
      season: active.data("season") || active.attr("data-season"),
      episode: active.data("episode") || active.attr("data-episode"),
      text: active.text().trim()
    });
  } else {
    console.log("First ep data:", {
      contentid: $('.episodeOption').first().data("contentid") || $('.episodeOption').first().attr("data-contentid"),
      season: $('.episodeOption').first().data("season") || $('.episodeOption').first().attr("data-season"),
      episode: $('.episodeOption').first().data("episode") || $('.episodeOption').first().attr("data-episode"),
    });
  }
}

checkActiveEp();
