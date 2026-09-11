async function test() {
  const headers = { "User-Agent": "Mozilla/5.0" };
  const res = await fetch("https://www.embedplay.one/filme/tt4154796", { headers });
  const html = await res.text();
  console.log("data-id:", html.match(/data-id=["']([^"']+)["']/gi));
  console.log("ajax:", html.match(/ajax\(\{[\s\S]*?\}/gi));
}
test();
