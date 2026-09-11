async function test() {
  const url = "https://abysscdn.com/?v=iqrvvFoGz";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  console.log("length:", html.length);
  const match = html.match(/file\s*:\s*["']([^"']+)["']/i);
  if (match) console.log("Stream:", match[1]);
  else {
      console.log(html.substring(0, 1000));
  }
}
test();
