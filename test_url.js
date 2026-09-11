async function test() {
  const tmdb = "299534";
  const url = `https://v1.watchplay.shop/movie/${tmdb}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const matches = html.match(/(?:const|let|var)?\s*(?:videoUrl|file|source|url|stream_url)\s*=\s*['"]([^'"]+)['"]/gi) || [];
  console.log("Matches:", matches);
}
test();
