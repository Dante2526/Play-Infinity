async function test() {
  const url = "https://www.embedplay.one/api";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://www.embedplay.one/filme/tt4154796",
      "X-Requested-With": "XMLHttpRequest"
    },
    body: `action=getPlayer&video_id=127806` // 127806 is UPNS
  });
  const json = await res.json();
  console.log(json);
}
test();
