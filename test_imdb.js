async function test() {
  const url = `https://v1.watchplay.shop/movie/tt4154796`;
  console.log("Fetching:", url);
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const playerMatches = html.match(/data-id=["']([^"']+)["']/gi) || [];
  console.log("Player IDs:", playerMatches);
}
test();
