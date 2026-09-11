async function test() {
  const url = 'https://embedplayapi.top/ajax/get_stream_link?id=BYSE&movie=299534&is_init=false&captcha=&ref=';
  const res = await fetch(url, { 
     headers: { 
         "X-Requested-With": "XMLHttpRequest",
         "User-Agent": "Mozilla/5.0",
         "Referer": "https://embedplayapi.top/embed/299534"
     }
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Result:", text);
}
test();
