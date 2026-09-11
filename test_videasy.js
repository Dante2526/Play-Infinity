async function test() {
  const url = `https://player.videasy.net/movie/299534`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  console.log("length:", html.length);
  console.log(html.substring(0, 2000));
}
test();
