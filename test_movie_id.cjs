async function test() {
  const res = await fetch("https://embedplayapi.top/embed/1617852", { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const m = html.match(/data-movie-id=["']([^"']+)["']/i);
  console.log("Movie ID:", m ? m[1] : "not found");
}
test();
