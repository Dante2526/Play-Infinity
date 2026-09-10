async function getMore() {
  const url = "https://v1.watchplay.shop/tvshow/30984/1/1";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();
  const idx = html.indexOf("loadEpisode");
  if (idx !== -1) {
    console.log(html.slice(idx - 100, idx + 1500));
  } else {
    const idx2 = html.indexOf("getEpisode");
    console.log(html.slice(idx2 - 100, idx2 + 1500));
  }
}

getMore();
