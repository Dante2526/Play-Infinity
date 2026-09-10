async function getFullScript() {
  const url = "https://v1.watchplay.shop/tvshow/30984/1/1";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();
  const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  for (const s of scripts) {
    if (s.includes("CURRENT_SEASON") || s.includes("loadArtPlayer") || s.includes("options")) {
      console.log("=== SCRIPT FOUND ===");
      console.log(s);
    }
  }
}

getFullScript();
