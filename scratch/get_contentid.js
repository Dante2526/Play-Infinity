async function getAroundContentId() {
  const url = "https://v1.watchplay.shop/tvshow/30984/1/1";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();
  const idx = html.indexOf("{ action: 'getOptions'");
  console.log(html.slice(idx - 600, idx + 400));
}

getAroundContentId();
