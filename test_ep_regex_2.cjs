async function test() {
  const headers = { "User-Agent": "Mozilla/5.0" };
  const res = await fetch("https://www.embedplay.one/serie/66732/1/1", { headers });
  const html = await res.text();
  console.log("data-contentid:", html.match(/data-contentid=["']([^"']+)["']/gi));
}
test();
