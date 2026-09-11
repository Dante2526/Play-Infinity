async function test() {
  const tmdb = "299534";
  const url = `https://v1.watchplay.shop/movie/${tmdb}`;
  console.log("Fetching:", url);
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  console.log("HTML length:", html.length);
  // look for iframe or scripts
  const matches = html.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
  console.log("iframes:", matches);
  
  const scriptMatches = html.match(/src=["']([^"']+\.js)["']/gi) || [];
  console.log("scripts:", scriptMatches.slice(0,5));
  
  const data = html.match(/var\s+[a-zA-Z0-9_]+\s*=\s*({.*?});/g) || [];
  console.log("JSON objects in script:", data.length);
}
test();
