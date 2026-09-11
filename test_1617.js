async function test() {
  const url = "https://embedplayapi.top/embed/1617852";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const allIds = html.match(/data-id=["']([^"']+)["']/gi) || [];
  console.log("All data-ids for 1617852:", allIds);
}
test();
