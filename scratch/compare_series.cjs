const cheerio = require("cheerio");

async function compare(id, name) {
  console.log(`\n================== ${name} (${id}) ==================`);
  const url = `https://v1.watchplay.shop/tvshow/${id}/1/1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const activeEp = $('.episodeOption.active');
  console.log("Total episodeOption:", $('.episodeOption').length);
  console.log("Active episodeOption:", activeEp.length ? {
    contentid: activeEp.data("contentid") || activeEp.attr("data-contentid"),
    season: activeEp.data("season") || activeEp.attr("data-season"),
    episode: activeEp.data("episode") || activeEp.attr("data-episode"),
    text: activeEp.text().trim()
  } : "NENHUM");

  const contentid = activeEp.length ? (activeEp.data("contentid") || activeEp.attr("data-contentid")) : null;
  if (contentid) {
    const optRes = await fetch("https://v1.watchplay.shop/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://v1.watchplay.shop/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      },
      body: new URLSearchParams({
        action: "getOptions",
        contentid: String(contentid)
      })
    });
    const optData = await optRes.json();
    console.log("Options count:", optData.data?.options?.length, "Options:", optData.data?.options);

    if (optData.data?.options?.length > 0) {
      const vid = optData.data.options[0].ID;
      const playerRes = await fetch("https://v1.watchplay.shop/api", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "https://v1.watchplay.shop/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        },
        body: new URLSearchParams({
          action: "getPlayer",
          video_id: String(vid)
        })
      });
      const playerData = await playerRes.json();
      console.log("Player data:", playerData);
    }
  }
}

async function main() {
  await compare(66732, "Stranger Things");
  await compare(30984, "Bleach");
}

main();
