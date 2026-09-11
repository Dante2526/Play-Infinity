async function test() {
  const url = "https://embedplayapi.top/api";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  console.log(html.substring(0, 500));
}
test();
