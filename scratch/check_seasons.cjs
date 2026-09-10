const cheerio = require("cheerio");
const fs = require("fs");

const html = fs.readFileSync("scratch_bleach_simulated.html", "utf-8");
const $ = cheerio.load(html);

console.log("Seasons count:", $(".seasonOption").length);
$(".seasonOption").each((i, el) => {
  console.log(`  Temporada ${$(el).data("season") || $(el).attr("data-season")}: ${$(el).text().trim()} | active: ${$(el).hasClass("active")}`);
});

console.log("\nEpisode groups (.episodeSelector):", $(".episodeSelector").length);
$(".episodeSelector").each((i, el) => {
  const s = $(el).data("season") || $(el).attr("data-season");
  const visible = $(el).hasClass("visible");
  const eps = $(el).find(".episodeOption").length;
  console.log(`  Grupo Temporada ${s}: ${eps} episódios | visible: ${visible}`);
});
