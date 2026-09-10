async function getBeginning() {
  const url = "https://v1.watchplay.shop/tvshow/30984/1/1";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();
  const idx = html.indexOf("var AUTO_PLAY_ENABLED");
  console.log(html.slice(idx, idx + 1800));
}

getBeginning();
