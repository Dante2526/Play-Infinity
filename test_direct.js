async function test() {
  const contentIdMatch = null;
  const pageUrl = "https://v1.watchplay.shop/movie/tt4154796";
  const htmlRes = await fetch(pageUrl);
  const html = await htmlRes.text();
  const match = html.match(/data-contentid=["'](\d+)["']/i) || html.match(/contentid\s*:\s*['"]?(\d+)['"]?/i);
  console.log("Content ID Match:", match?.[1]);
  
  if (!match) {
    const optMatch = html.match(/player_select_item["'][^>]*data-id=["'](\d+)["']/i);
    console.log("Option Match:", optMatch?.[1]);
  }
}
test();
