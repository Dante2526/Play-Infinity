async function test() {
  const url = "https://www.embedplay.one/filme/tt4154796";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  console.log(html.substring(html.indexOf("players_select"), html.indexOf("<!-- PlayerBG -->")));
}
test();
