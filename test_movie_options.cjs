async function test() {
  const url = "https://www.embedplay.one/filme/tt4154796";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const regexOptions = /player_select_item["'][^>]*data-id=["'](\d+)["'][^>]*>[\s\S]*?<div[^>]*player_select_name[^>]*>([^<]+)<\/div>/gi;
  let match;
  const options = [];
  while ((match = regexOptions.exec(html)) !== null) {
     options.push({ id: match[1], name: match[2].trim() });
  }
  console.log(options);
}
test();
