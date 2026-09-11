async function test() {
  const url = 'https://embedplayapi.top/ajax/get_stream_link?id=86Avo&movie=1617852&is_init=false&captcha=&ref=';
  const res = await fetch(url, { 
     headers: { 
         "X-Requested-With": "XMLHttpRequest",
         "User-Agent": "Mozilla/5.0 (Linux; Android 10; K)",
         "Referer": "https://embedplayapi.top/embed/1617852"
     }
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Result:", text);
}
test();
