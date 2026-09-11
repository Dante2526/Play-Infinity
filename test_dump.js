async function test() {
  const url = "https://embedplayapi.top/embed/1617852";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  console.log(html);
}
test();
