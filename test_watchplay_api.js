async function test() {
  const url = "https://v1.watchplay.shop/api";
  const res = await fetch(url, {
    method: "POST",
    headers: {
       "Content-Type": "application/x-www-form-urlencoded",
       "User-Agent": "Mozilla/5.0",
       "Origin": "https://v1.watchplay.shop",
       "Referer": "https://v1.watchplay.shop/movie/299534"
    },
    body: "action=getPlayer&video_id=..." // wait we need video_id
  });
}
