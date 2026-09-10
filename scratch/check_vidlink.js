async function checkVidlink() {
  const res = await fetch("https://vidlink.pro/tv/30984/1/1", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Referer": "https://vidlink.pro/"
    }
  });
  console.log("VidLink Status:", res.status);
  const text = await res.text();
  console.log("VidLink HTML length:", text.length);
  console.log("VidLink preview:", text.slice(0, 500));
}

checkVidlink();
