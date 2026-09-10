const cheerio = require("cheerio");

async function checkEpisodes() {
  const url = "https://v1.watchplay.shop/tvshow/30984/1/1";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  console.log("Total episodeOption:", $(".episodeOption").length);
  const options = [];
  $(".episodeOption").each((i, el) => {
    options.push({
      season: $(el).data("season") || $(el).attr("data-season"),
      episode: $(el).data("episode") || $(el).attr("data-episode"),
      contentid: $(el).data("contentid") || $(el).attr("data-contentid"),
      text: $(el).text().trim()
    });
  });

  console.log("Primeiros 5 episódios:", options.slice(0, 5));

  // If we have contentid, let's call WatchPlay API with action: 'getOptions', contentid
  if (options.length > 0 && options[0].contentid) {
    console.log(`\n=== CHAMANDO getOptions PARA contentid: ${options[0].contentid} ===`);
    const apiRes = await fetch("https://v1.watchplay.shop/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://v1.watchplay.shop/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      },
      body: new URLSearchParams({
        action: "getOptions",
        contentid: String(options[0].contentid)
      })
    });
    const apiJson = await apiRes.json();
    console.log("Resposta getOptions:", JSON.stringify(apiJson, null, 2));

    // If options are returned, let's test getPlayer for the first video_id!
    if (apiJson.data?.options?.length > 0) {
      const vid = apiJson.data.options[0].ID;
      console.log(`\n=== CHAMANDO getPlayer PARA video_id: ${vid} ===`);
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
      const playerJson = await playerRes.json();
      console.log("Resposta getPlayer:", JSON.stringify(playerJson, null, 2));

      if (playerJson.data?.video_url) {
        console.log("\nTestando URL do vídeo...");
        const vRes = await fetch(playerJson.data.video_url, {
          method: "HEAD",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer": "https://v1.watchplay.shop/"
          }
        });
        console.log(`Status do vídeo stream (${playerJson.data.video_url}):`, vRes.status);
      }
    }
  }
}

checkEpisodes();
