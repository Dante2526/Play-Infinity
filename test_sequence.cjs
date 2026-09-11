const https = require("https");
async function test() {
  const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0" };
  const res1 = await fetch("https://embedplayapi.top/embed/1617852", { headers });
  const html1 = await res1.text();
  const cookies = res1.headers.get("set-cookie");
  const ids = html1.match(/data-id=["']([^"']+)["']/gi);
  if (ids && ids.length > 1) {
    const id = ids[1].match(/["']([^"']+)["']/)[1];
    const res2 = await fetch(`https://embedplayapi.top/ajax/get_stream_link?id=${id}&movie=1617852&is_init=false&captcha=&ref=`, {
      headers: { ...headers, "X-Requested-With": "XMLHttpRequest", "Referer": "https://embedplayapi.top/embed/1617852", "Cookie": cookies || "" }
    });
    console.log("Response:", await res2.text());
  }
}
test();
