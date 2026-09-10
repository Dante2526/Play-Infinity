async function testLocalStream() {
  const streamUrl = "http://localhost:3000/api/watchplayer-stream?url=https%3A%2F%2Fv1.watchplay.shop%2Ftvshow%2F30984%2F1%2F1";
  console.log("Chamando stream local:", streamUrl);
  const res = await fetch(streamUrl);
  console.log("Status stream local:", res.status);
  console.log("Content-Type:", res.headers.get("content-type"));
  const html = await res.text();
  console.log("Tamanho HTML retornado:", html.length);

  // Agora testar a chamada de assinatura pelo servidor local!
  const signUrl = `http://localhost:3000/api/watchplayer-stream?url=https%3A%2F%2Fv1.watchplay.shop%2Ftvshow%2F30984%2F1%2F1&action_secure_sign=1&raw_url=${encodeURIComponent("https://vid7102402.hclod.qzz.io/_s3_/animes/a02/30984/s1e1/playlist.m3u8")}`;
  console.log("\nChamando assinatura local:", signUrl);
  const signRes = await fetch(signUrl);
  console.log("Status assinatura local:", signRes.status);
  const signData = await signRes.text();
  console.log("Retorno assinatura local:", signData);
}

testLocalStream();
