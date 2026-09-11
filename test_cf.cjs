const https = require("https");
async function test() {
  const url = "https://embedplayapi.top/embed/1617852";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" } });
  const html = await res.text();
  console.log("HTML length:", html.length);
  const match = html.match(/iframe.*?src=["']([^"']+)["']/i);
  console.log("Iframe:", match ? match[1] : "None");
}
test();
