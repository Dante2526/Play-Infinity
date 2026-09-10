const fs = require("fs");

async function simulateProxy() {
  const targetUrl = "https://v1.watchplay.shop/tvshow/30984/1/1";
  const upstreamRes = await fetch(targetUrl, {
    headers: {
      Referer: "https://v1.watchplay.shop/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
  });

  let html = await upstreamRes.text();

  // 1. Ativar AUTO_PLAY_ENABLED no player oficial
  html = html.replace(/var AUTO_PLAY_ENABLED = false;/g, "var AUTO_PLAY_ENABLED = true;");
  html = html.replace(/AUTO_PLAY_ENABLED && options\.length == 1/g, "true");

  // 2. Redirecionar requisições da API interna para o proxy local
  html = html.replace(/var HOME_URL = ['"]https:\/\/v1\.watchplay\.shop['"];/g, "var HOME_URL = '/api/watchplay-proxy';");
  html = html.replace(/\$\{HOME_URL\}\/api/g, "/api/watchplay-proxy-api");

  // 3. Remover rastreadores, banners conhecidos e loaders nativos
  html = html.replace(/_wau\.push\([^)]*\);?/g, "");
  html = html.replace(/<div[^>]*class=["'][^"']*changeOptions[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");
  html = html.replace(/Mostrar\s*Op[çc][õo]es/gi, "");
  html = html.replace(/\$\('body'\)\.append\(`<div class="player_loading">[\s\S]*?<\/div>`\);/g, "/* player_loading bloqueado */");
  html = html.replace(/\$\('body'\)\.append\(textoContexto\);/g, "/* notify bloqueado */");

  // 4. Inutilizar todos os controles e overlays nativos do Artplayer na própria inicialização
  html = html.replace(/setting:\s*true,/g, "setting: false,");
  html = html.replace(/pip:\s*true,/g, "pip: false,");
  html = html.replace(/playbackRate:\s*true,/g, "playbackRate: false,");
  html = html.replace(/aspectRatio:\s*true,/g, "aspectRatio: false,");
  html = html.replace(/lock:\s*true,/g, "lock: false,");
  html = html.replace(/fastForward:\s*true,/g, "fastForward: false,");
  html = html.replace(/autoOrientation:\s*true,/g, "autoOrientation: false,");
  html = html.replace(/fullscreen:\s*true,/g, "fullscreen: false,");
  html = html.replace(/fullscreenWeb:\s*true,/g, "fullscreenWeb: false,");

  html = html.replace(
    /artInstance = new Artplayer\(\{/g,
    `artInstance = new Artplayer({
        controls: [],
        hotkey: false,
        gesture: false,
        miniProgressBar: false,
        backdrop: false,
        playsInline: true,
        icons: { state: '' },`
  );

  fs.writeFileSync("scratch_bleach_simulated.html", html, "utf-8");
  console.log("Salvo scratch_bleach_simulated.html!");

  // Now let's check: HOW does autoplay work in WatchPlay when the page loads?
  // Is getepi(current) called automatically on page load?
  const hasAutoCall = html.includes("getepi") || html.includes("getOptions");
  console.log("Has getepi / getOptions in HTML:", hasAutoCall);

  // Search for how getepi is called in the original page!
  const idx = html.indexOf("getepi");
  console.log("Snippet around getepi:", html.slice(idx - 100, idx + 300));
}

simulateProxy();
