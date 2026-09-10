async function testCors() {
  const targetUrl = "https://v1.watchplay.shop/tvshow/30984/1/1";
  const rawUrl = "https://vid7102402.hclod.qzz.io/_s3_/animes/a02/30984/s1e1/playlist.m3u8";

  const signTarget = new URL(targetUrl);
  signTarget.searchParams.set("action_secure_sign", "1");
  signTarget.searchParams.set("raw_url", rawUrl);

  const signRes = await fetch(signTarget.toString(), {
    headers: {
      "Referer": targetUrl,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  });

  const json = await signRes.json();
  console.log("Signed URL:", json.signed_url);

  // Agora testar com Origin http://localhost:3000 exatamente como o browser faz!
  const corsRes = await fetch(json.signed_url, {
    headers: {
      "Origin": "http://localhost:3000",
      "Referer": "http://localhost:3000/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    }
  });

  console.log("Status com Origin localhost:3000:", corsRes.status);
  console.log("Access-Control-Allow-Origin:", corsRes.headers.get("access-control-allow-origin"));
  console.log("Headers completos:");
  for (const [k, v] of corsRes.headers.entries()) {
    console.log(`  ${k}: ${v}`);
  }

  const m3u8Text = await corsRes.text();
  console.log("m3u8 status:", corsRes.status, "text length:", m3u8Text.length);
  if (corsRes.status !== 200) {
    console.log("Corpo erro:", m3u8Text);
  } else {
    console.log("Trecho m3u8:\n", m3u8Text.slice(0, 200));

    // Testar primeiro segmento .ts com Origin localhost:3000
    const firstSegment = m3u8Text.split("\n").find(l => l.trim().endsWith(".ts"));
    if (firstSegment) {
      const segUrl = new URL(firstSegment.trim(), json.signed_url).toString();
      console.log("\nTestando segmento TS:", segUrl);
      const segRes = await fetch(segUrl, {
        headers: {
          "Origin": "http://localhost:3000",
          "Referer": "http://localhost:3000/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
      });
      console.log("Status segmento TS:", segRes.status);
      console.log("TS Access-Control-Allow-Origin:", segRes.headers.get("access-control-allow-origin"));
    }
  }
}

testCors();
