async function test() {
  const url = "https://embedplayapi.top/embed/299534";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  console.log(html.match(/data-id=["']([^"']+)["']/gi));
  console.log(html.match(/class=["'][^"']*server[^"']*["'][^>]*>/gi));
}
test();
