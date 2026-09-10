async function testSign() {
  const targetUrl = "https://v1.watchplay.shop/tvshow/30984/1/1";
  const rawUrl = "https://vid7102402.hclod.qzz.io/_s3_/animes/a02/30984/s1e1/playlist.m3u8";

  const signTarget = new URL(targetUrl);
  signTarget.searchParams.set("action_secure_sign", "1");
  signTarget.searchParams.set("raw_url", rawUrl);

  console.log("Chamando:", signTarget.toString());
  const signRes = await fetch(signTarget.toString(), {
    headers: {
      "Referer": targetUrl,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  });

  console.log("Status assinatura:", signRes.status);
  const data = await signRes.text();
  console.log("Resposta assinatura:", data);

  try {
    const json = JSON.parse(data);
    if (json.signed_url) {
      console.log("Testando URL assinada:", json.signed_url);
      const vRes = await fetch(json.signed_url, {
        headers: {
          "Referer": targetUrl,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        }
      });
      console.log("Status stream assinado:", vRes.status);
      const m3u8 = await vRes.text();
      console.log("Conteúdo m3u8 (primeiros 300 chars):", m3u8.slice(0, 300));
    }
  } catch (e) {
    console.log("Erro parse JSON:", e.message);
  }
}

testSign();
