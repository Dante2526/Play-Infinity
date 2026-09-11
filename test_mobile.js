async function test() {
  const url = "https://embedplayapi.top/embed/1617852";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36" } });
  const html = await res.text();
  console.log(html.substring(0, 1000));
}
test();
