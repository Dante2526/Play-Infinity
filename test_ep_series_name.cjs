async function test() {
  const url = "https://www.embedplay.one/serie/66732/1/1";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const match = html.match(/class=["']player_select_name["']>\s*([^<]+)\s*<\/div>/g);
  console.log(match);
}
test();
