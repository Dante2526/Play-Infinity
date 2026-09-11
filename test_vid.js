async function test() {
  const url = `https://v1.watchplay.shop/movie/tt4154796`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  console.log("length:", html.length);
  const m = html.match(/videoUrl\s*=\s*['"]([^'"]+)['"]/);
  if(m) console.log("videoUrl:", m[1]);
  else console.log("videoUrl not found");
}
test();
