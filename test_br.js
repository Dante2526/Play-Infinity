async function test() {
  const domains = [
    "https://embed.warezcdn.com/filme/299534",
    "https://embed.ruy.to/filme/299534",
    "https://embed.ova.one/filme/299534",
    "https://embed.donte.com.br/filme/299534"
  ];
  for (const d of domains) {
    try {
      console.log("Fetching:", d);
      const res = await fetch(d, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
      console.log(d, res.status);
    } catch(e) {
      console.log(d, e.message);
    }
  }
}
test();
