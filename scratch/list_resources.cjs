const cheerio = require("cheerio");
const fs = require("fs");

const html = fs.readFileSync("scratch_bleach_simulated.html", "utf-8");
const $ = cheerio.load(html);

console.log("Scripts:");
$("script").each((i, el) => {
  const src = $(el).attr("src");
  if (src) console.log("  script src:", src);
});

console.log("Stylesheets:");
$('link[rel="stylesheet"]').each((i, el) => {
  console.log("  css href:", $(el).attr("href"));
});

console.log("Images:");
$("img").each((i, el) => {
  console.log("  img src:", $(el).attr("src"));
});
