async function test() {
  const url = 'https://embedplayapi.top/embed/299534';
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const matches = html.match(/class=["'][^"']*server[^"']*["'][^>]*data-id=["']([^"']+)["']/gi) || [];
  console.log("Servers:", matches);
  
  const allIds = html.match(/data-id=["']([^"']+)["']/gi) || [];
  console.log("All data-ids:", allIds);
}
test();
