async function check() {
  try {
    const res = await fetch("https://v1.watchplay.shop/movie/299534", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const html = await res.text();
    console.log("Status:", res.status);
    console.log("HTML length:", html.length);
    
    // Check buttons, links or player elements
    const buttonMatches = html.match(/<button[^>]*>[\s\S]*?<\/button>/gi) || [];
    console.log("Buttons:", buttonMatches);

    const divItems = html.match(/class=["'][^"']*(?:player|select|dublado|audio|server)[^"']*["'][^>]*>/gi) || [];
    console.log("Div elements with classes:", divItems);

    const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    scripts.forEach((s, idx) => {
      if (s.includes("VIDEO_HASH") || s.includes("loadArtPlayer") || s.includes("select_language") || s.includes("players_select_items") || s.includes("artInstance")) {
        console.log("=== SCRIPT " + idx + " ===");
        console.log(s);
      }
    });
  } catch (err) {
    console.error(err);
  }
}
check();
