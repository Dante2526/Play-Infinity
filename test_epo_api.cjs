async function test() {
  const url = "https://www.embedplay.one/api";
  const res = await fetch(url, {
    method: "POST",
    headers: {
       "Content-Type": "application/x-www-form-urlencoded",
       "User-Agent": "Mozilla/5.0",
       "Referer": "https://www.embedplay.one/filme/tt4154796",
       "X-Requested-With": "XMLHttpRequest"
    },
    body: "action=getPlayer&video_id=127805"
  });
  console.log("Status:", res.status);
  const json = await res.json();
  console.log("JSON:", json);
}
test();
