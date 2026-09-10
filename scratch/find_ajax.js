async function findAjax() {
  const url = "https://v1.watchplay.shop/tvshow/30984/1/1";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();
  let pos = 0;
  while ((pos = html.indexOf("$.ajax", pos)) !== -1) {
    console.log(`\n=== AJAX AT ${pos} ===`);
    console.log(html.slice(pos - 150, pos + 400));
    pos += 6;
  }
}

findAjax();
