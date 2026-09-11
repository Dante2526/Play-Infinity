async function test() {
  const optRes = await fetch("https://www.embedplay.one/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest"
    },
    body: `action=getOptions&contentid=17243`
  });
  const optJson = await optRes.json();
  console.log(JSON.stringify(optJson, null, 2));
}
test();
