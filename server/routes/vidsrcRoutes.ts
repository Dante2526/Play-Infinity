/**
 * Vidsrc Routes — Stream URL decifrado + proxy de segmentos com CORS
 *
 * Arquitetura:
 * 1. /api/vidsrc-stream?tmdb=X&season=Y&episode=Z
 *    - vs_src.php → cloudorchestranova → playerUrl → streamBase
 *    - API + &stream_urls → encrypted stream_urls + WASM URL
 *    - WASM decrypt → 3 m3u8 URLs
 *    - generate.php → token (VPS IP)
 *    - Fetch master.m3u8 → rewrite URLs to go through proxy
 *    - Return rewritten m3u8 (hls.js loads this)
 *
 * 2. /api/vidsrc-proxy?url=BASE64
 *    - Generic proxy for comityofcognomen.site
 *    - If m3u8: rewrite URLs inside to also go through proxy
 *    - If segment: proxy bytes with CORS * + Range support
 *    - All requests use VPS IP (token IP-bound to VPS)
 */
import { Router } from "express";

const router = Router();
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Origin, Accept, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

// Whitelist de domínios que o proxy pode acessar
const ALLOWED_HOSTS = ["comityofcognomen.site", "data.vidsrc.sh"];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ===== Cache em memória (5 min) =====
const streamCache = new Map<string, { m3u8: string; expires: number }>();
const STREAM_CACHE_TTL = 5 * 60 * 1000;

// ===== Função: cadeia completa de decrypt =====
async function getRewrittenM3u8(tmdb: string, season: string, episode: string): Promise<string> {
  const cacheKey = `${tmdb}:${season}:${episode}`;
  const cached = streamCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.m3u8;

  // 1. vs_src.php
  const r1 = await fetch(
    `https://vidsrc.sh/vs_src.php?type=tv&id=${tmdb}&season=${season}&episode=${episode}`,
    { headers: { "User-Agent": UA, Referer: "https://vidsrc.sh/" } }
  );
  const d1 = await r1.json();
  const cloudUrl = d1.src;

  // 2. cloudorchestranova shell → playerUrl
  const r2 = await fetch(cloudUrl, { headers: { "User-Agent": UA, Referer: "https://vidsrc.sh/" } });
  const h2 = await r2.text();
  const pm = h2.match(/"playerUrl":"([^"]+)"/);
  if (!pm) throw new Error("playerUrl not found");
  const playerUrl = "https://cloudorchestranova.com" + pm[1].replace(/\\u0026/g, "&");

  // 3. player page → streamBase (PRECISA de Referer do cloudUrl!)
  const r3 = await fetch(playerUrl, { headers: { "User-Agent": UA, Referer: cloudUrl } });
  const h3 = await r3.text();
  const sbm = h3.match(/"streamBase":"([^"]+)"/);
  if (!sbm) throw new Error("streamBase not found");
  const streamBase = sbm[1].replace(/\\u0026/g, "&");

  // 4. API + &stream_urls → encrypted + WASM
  const streamApiUrl = `${streamBase}&season=${season}&episode=${episode}&stream_urls`;
  const r4 = await fetch(streamApiUrl, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  const d4 = await r4.json();
  if (!d4.data?.stream_urls || !d4.vs?.wasm_url) throw new Error("no stream_urls");

  // 5. WASM decrypt
  const enc = Buffer.from(d4.data.stream_urls, "base64");
  const wasmResp = await fetch(d4.vs.wasm_url, { headers: { "User-Agent": UA } });
  const wasmBuf = await wasmResp.arrayBuffer();
  const mod = await WebAssembly.compile(wasmBuf);
  const inst = await WebAssembly.instantiate(mod, {});
  const ptr = (inst.exports as any).alloc(enc.length);
  new Uint8Array((inst.exports as any).memory.buffer, ptr, enc.length).set(enc);
  const outLen = (inst.exports as any).decrypt(ptr, enc.length);
  const txt = new TextDecoder().decode(
    new Uint8Array((inst.exports as any).memory.buffer, ptr + 12, outLen)
  );
  const urls = txt.split("\n").filter((s) => s.trim());
  if (!urls.length) throw new Error("no decrypted URLs");

  // 6. Token (VPS IP)
  const origin = new URL(urls[0]).origin;
  const tokenResp = await fetch(`${origin}/generate.php`, { headers: { "User-Agent": UA } });
  const token = (await tokenResp.text()).trim();

  // 7. Fetch master.m3u8 (VPS IP + token)
  const masterUrl = urls[0] + (urls[0].includes("?") ? "&" : "?") + "token=" + token;
  const r5 = await fetch(masterUrl, { headers: { "User-Agent": UA, Referer: "https://cloudorchestranova.com/" } });
  const masterM3u8 = await r5.text();

  // 8. Rewrite m3u8 — todas URLs apontam pra /api/vidsrc-proxy
  const baseUrl = new URL(masterUrl);
  const rewritten = rewriteM3u8(masterM3u8, baseUrl.origin, token);

  // Cache
  streamCache.set(cacheKey, { m3u8: rewritten, expires: Date.now() + STREAM_CACHE_TTL });
  console.log(`[vidsrc] OK: tmdb=${tmdb} s${season}e${episode} → ${urls.length} URLs, token OK`);

  return rewritten;
}

// ===== Rewrite m3u8: troca URLs internas por proxy URLs =====
function rewriteM3u8(m3u8Text: string, origin: string, token: string): string {
  const lines = m3u8Text.split("\n");
  const result: string[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) {
      // Comment line — pode ter URL dentro de #EXT-X-KEY ou #EXT-X-MAP
      // Pra simplicidade, manter como-is por agora
      result.push(line);
      continue;
    }

    // É uma URL — pode ser relativa ou absoluta
    let fullUrl: string;
    if (line.startsWith("http")) {
      fullUrl = line;
    } else if (line.startsWith("/")) {
      fullUrl = origin + line;
    } else {
      fullUrl = origin + "/" + line;
    }

    // Garantir que tem token
    if (!fullUrl.includes("token=") && token) {
      fullUrl += (fullUrl.includes("?") ? "&" : "?") + "token=" + token;
    }

    // Rewrite pra proxy
    const proxyUrl = `/api/vidsrc-proxy?url=${encodeURIComponent(Buffer.from(fullUrl).toString("base64"))}`;
    result.push(proxyUrl);
  }

  return result.join("\n");
}

// ===== Endpoint: stream m3u8 reescrita =====
router.get("/api/vidsrc-stream", async (req, res) => {
  try {
    res.setHeader(CORS["Access-Control-Allow-Origin"] as string, "*");
    const tmdb = (req.query.tmdb as string) || "126027";
    const season = (req.query.season as string) || "1";
    const episode = (req.query.episode as string) || "1";

    console.log(`[vidsrc-stream] tmdb=${tmdb} s${season}e${episode}`);
    const m3u8 = await getRewrittenM3u8(tmdb, season, episode);

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    return res.send(m3u8);
  } catch (err: any) {
    console.error("[vidsrc-stream] Error:", err.message);
    return res.status(502).json({ error: err.message });
  }
});

// ===== Endpoint: proxy de sub-playlists e segmentos =====
router.get("/api/vidsrc-proxy", async (req, res) => {
  try {
    const encodedUrl = req.query.url as string;
    if (!encodedUrl) return res.status(400).json({ error: "url parameter required" });

    const targetUrl = Buffer.from(encodedUrl, "base64").toString("utf-8");
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return res.status(400).json({ error: "invalid url" });
    }

    // Whitelist check
    if (!ALLOWED_HOSTS.some((h) => parsed.hostname === h)) {
      return res.status(403).json({ error: "host not allowed" });
    }

    // Headers pra upstream
    const headers: Record<string, string> = {
      "User-Agent": UA,
      Referer: "https://cloudorchestranova.com/",
    };

    // Range support (pra seek/scrubber)
    if (req.headers.range) {
      headers["Range"] = req.headers.range as string;
    }

    const upstream = await fetch(targetUrl, { headers });
    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).json({ error: `upstream ${upstream.status}` });
    }

    const contentType = upstream.headers.get("content-type") || "";

    // CORS
    for (const [k, v] of Object.entries(CORS)) {
      res.setHeader(k, v);
    }

    // Pass through content headers
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }

    // Se for m3u8 (playlist), rewrite URLs
    if (contentType.includes("mpegurl") || contentType.includes("m3u8") || targetUrl.includes(".m3u8")) {
      const text = await upstream.text();
      // Extrair origin da URL alvo
      const origin = parsed.protocol + "//" + parsed.host;
      // Extrair token da URL
      const token = parsed.searchParams.get("token") || "";
      const rewritten = rewriteM3u8(text, origin, token);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store");
      return res.send(rewritten);
    }

    // Senão: segmento binário — proxy bytes
    res.setHeader("Cache-Control", "public, max-age=3600");
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (err: any) {
    console.error("[vidsrc-proxy] Error:", err.message);
    return res.status(502).json({ error: err.message });
  }
});

// ===== Endpoint: player HTML (iframe + hls.js + postMessage) =====
// Mesmo padrão do /api/native-player: NetflixPlayerSkin comunica via postMessage
router.get("/api/vidsrc-player", async (req, res) => {
  const tmdb = (req.query.tmdb as string) || "126027";
  const season = (req.query.season as string) || "1";
  const episode = (req.query.episode as string) || "1";

  const streamUrl = `/api/vidsrc-stream?tmdb=${tmdb}&season=${season}&episode=${episode}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="referrer" content="no-referrer">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:100%; height:100%; background:#000; overflow:hidden; }
  video { width:100%; height:100%; object-fit:contain; background:#000; outline:none; }
  #loader { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:#000; }
  .spinner { width:50px; height:50px; border:4px solid rgba(255,255,255,0.1); border-left-color:#E50914; border-radius:50%; animation:spin 1s linear infinite; }
  @keyframes spin { 100% { transform:rotate(360deg); } }
</style>
</head>
<body>
<div id="loader"><div class="spinner"></div></div>
<video id="v" playsinline controls></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
<script>
var video=document.getElementById('v'),loader=document.getElementById('loader');
function sendStatus(){
  if(!video)return;
  window.parent.postMessage({
    type:'WATCHPLAY_STATUS',
    data:{
      currentTime:video.currentTime||0,
      duration:video.duration||0,
      paused:video.paused,
      muted:video.muted,
      volume:video.volume,
      buffered:video.buffered&&video.buffered.length>0?(video.buffered.end(video.buffered.length-1)/Math.max(video.duration||1,1))*100:0,
      readyState:video.readyState
    }
  },'*');
}
function initHls(url){
  loader.style.display='none';
  video.addEventListener('play',sendStatus);
  video.addEventListener('pause',sendStatus);
  video.addEventListener('timeupdate',sendStatus);
  video.addEventListener('durationchange',sendStatus);
  video.addEventListener('volumechange',sendStatus);
  video.addEventListener('progress',sendStatus);
  video.addEventListener('playing',sendStatus);
  video.addEventListener('waiting',sendStatus);
  video.addEventListener('ended',function(){window.parent.postMessage({type:'WATCHPLAY_VIDEO_ENDED'},'*');});
  video.addEventListener('error',function(){window.parent.postMessage({type:'WATCHPLAY_ERROR',reason:'video_error'},'*');});
  setInterval(sendStatus,1000);

  if(Hls.isSupported()){
    var hls=new Hls({
      maxBufferLength:60,
      maxMaxBufferLength:120,
      maxBufferHole:0.5,
      maxSeekHole:2,
      nudgeOffset:0.2,
      backBufferLength:90,
      enableWorker:true,
      lowLatencyMode:false
    });
    var seekPending=false;
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED,function(){
      video.play().then(function(){
        window.parent.postMessage({type:'WATCHPLAY_AUTOPLAY_MUTED'},'*');
      }).catch(function(){
        // Autoplay blocked — skin shows play button
      });
    });
    hls.on(Hls.Events.ERROR,function(e,data){
      if(data.fatal){
        if(data.type===Hls.ErrorTypes.NETWORK_ERROR){hls.startLoad();}
        else if(data.type===Hls.ErrorTypes.MEDIA_ERROR){hls.recoverMediaError();}
        else{window.parent.postMessage({type:'WATCHPLAY_ERROR',reason:'hls_fatal:'+data.type},'*');}
      }
    });
    // Fix audio/video desync após seek
    hls.on(Hls.Events.BUFFER_APPENDED,function(){
      if(seekPending){
        seekPending=false;
        try{
          // Sincroniza audio com video após fragmento carregado
          if(video.audioTracks && video.audioTracks.length>0){
            video.currentTime=video.currentTime+0.001; // micro-nudge
          }
        }catch(e){}
      }
    });
  }else if(video.canPlayType('application/vnd.apple.mpegurl')){
    video.src=url;
    video.addEventListener('loadedmetadata',function(){
      video.play().then(function(){
        window.parent.postMessage({type:'WATCHPLAY_AUTOPLAY_MUTED'},'*');
      }).catch(function(){});
    });
  }
}
initHls('${streamUrl}');

// Receber comandos da NetflixPlayerSkin
window.addEventListener('message',function(e){
  if(!video)return;
  var cmd=e.data;
  if(!cmd||!cmd.type)return;
  try{
    if(cmd.type==='PLAY'||cmd.type==='play'){video.play();}
    else if(cmd.type==='PAUSE'||cmd.type==='pause'){video.pause();}
    else if(cmd.type==='SEEK'&&typeof cmd.targetTime==='number'){seekPending=true;video.currentTime=cmd.targetTime;if(typeof hls!=='undefined'&&hls){hls.startLoad();}}
    else if(cmd.type==='seek'&&typeof cmd.time==='number'){seekPending=true;video.currentTime=cmd.time;if(typeof hls!=='undefined'&&hls){hls.startLoad();}}
    else if(cmd.type==='SET_VOLUME'&&typeof cmd.volume==='number'){video.volume=cmd.volume;video.muted=(cmd.volume===0);}
    else if(cmd.type==='setMuted'){video.muted=!!cmd.muted;}
    else if(cmd.type==='SKIP_INTRO'&&typeof cmd.seconds==='number'){video.currentTime+=cmd.seconds;}
    sendStatus();
  }catch(err){}
});
</script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.send(html);
});

export default router;
