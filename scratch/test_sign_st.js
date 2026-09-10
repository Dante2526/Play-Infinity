async function testSignST() {
  const targetUrl = "https://v1.watchplay.shop/tvshow/66732/1/1";
  const rawUrl = "https://vid7102402.hclod.qzz.io/st/_s3_/1/66732/s1e1/playlist.m3u8";

  const signTarget = new URL(targetUrl);
  signTarget.searchParams.set("action_secure_sign", "1");
  signTarget.searchParams.set("raw_url", rawUrl);

  const signRes = await fetch(signTarget.toString(), {
    headers: {
      "Referer": targetUrl,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  });

  console.log("Status ST:", signRes.status);
  const data = await signRes.text();
  console.log("Resposta ST:", data);
}

testSignST();
