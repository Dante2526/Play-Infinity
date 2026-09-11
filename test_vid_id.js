async function test() {
  const tmdb = "299534";
  const url = `https://v1.watchplay.shop/movie/${tmdb}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const playerMatches = html.match(/data-id=["']([^"']+)["']/gi) || [];
  console.log("Player IDs:", playerMatches);
}
test();
