/**
 * Nuvix Routes — extrator de stream m3u8 do site Nuvix (sidecarracers.com)
 *
 * Arquitetura:
 * 1. No startup do servidor, baixa TODOS os sitemaps (~185 XMLs, ~20MB total)
 *    em background e popula um Map slug → URL completo.
 * 2. Quando o user abre um filme/série, o app chama /api/nuvix-stream?title=X
 *    O backend normaliza o título (remove acentos, lowercase, troca espaços por hífens)
 *    e procura no Map qual URL tem esse slug.
 * 3. Faz fetch HTML da URL completa e extrai contentUrl (m3u8 + auth_key) via regex.
 * 4. Retorna o m3u8 URL pro iframe hls.js (no navegador do user) — passa no Cloudflare.
 *
 * Endpoints:
 *   GET /api/nuvix-stream?title=X&type=movie|series    → { m3u8Url: "..." }
 *   GET /api/nuvix-player?title=X&type=movie|series    → HTML iframe com hls.js
 *
 * Importante: o CDN do Nuvix (image1.fclop.com, image1.hwloy.com, etc) tem
 * Cloudflare anti-bot que BLOQUEIA requests de datacenter (curl/Python no
 * backend). MAS navegador real (iframe hls.js no browser do user) passa.
 * Por isso o backend só busca HTML da página Nuvix (que NÃO tem anti-bot),
 * e o navegador do user faz o fetch do m3u8 direto do CDN.
 */
import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";

const router = Router();

const NUPIX_BASE = "https://www.sidecarracers.com";

// Map: slug normalizado → URL completa do filme/série no Nuvix
// Populado no startup do servidor via download dos sitemaps em background.
const _nuvixIndex = new Map<string, { url: string; type: "movie" | "series" | "anime" | "novela" }>();
let _sitemapLoadStarted = false;
let _sitemapLoadDone = false;
let _sitemapLoadError: string | null = null;

/**
 * Normaliza título pra criar slug que vai bater com o URL do Nuvix.
 * Ex: "Vingadores: Ultimato" → "vingadores-ultimato"
 *     "1408" → "1408"
 *     "Toy Story 5" → "toy-story-5"
 */
function normalizeTitleToSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")               // separa acentos
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9\s-]/g, "")   // remove punctuation
    .trim()
    .replace(/\s+/g, "-")           // espaços → hífens
    .replace(/-+/g, "-");           // hífens múltiplos → 1
}

/**
 * Carrega TODOS os sitemaps do Nuvix em background.
 * 185 XMLs × ~99 URLs = ~18.315 URLs de filmes/séries/animes/novelas.
 * Total ~20MB de download. Demora 1-2 min no startup.
 * Não bloqueia o servidor — roda async.
 */
async function loadSitemapInBackground() {
  if (_sitemapLoadStarted) return;
  _sitemapLoadStarted = true;
  console.log("[nuvix] Iniciando carregamento de sitemaps em background...");

  try {
    // 1. Pega sitemap index
    const indexRes = await fetch(`${NUPIX_BASE}/sitemap.xml`, {
      headers: { "User-Agent": "PlayInfinity/1.0 (nuvix-scraper)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!indexRes.ok) throw new Error(`sitemap.xml HTTP ${indexRes.status}`);
    const indexXml = await indexRes.text();

    // 2. Extrai todos os URLs de sitemap filho
    const subSitemaps = Array.from(indexXml.matchAll(/<loc>([^<]+\/sitemap\/[a-z]+\/\d+\.xml[^<]*)<\/loc>/g))
      .map(m => m[1].trim())
      .filter(Boolean);

    console.log(`[nuvix] ${subSitemaps.length} sub-sitemaps pra baixar`);

    // 3. Baixa em batches de 10 (paralelo) pra não saturar banda
    const BATCH_SIZE = 10;
    let totalUrls = 0;
    let batchIdx = 0;

    for (let i = 0; i < subSitemaps.length; i += BATCH_SIZE) {
      const batch = subSitemaps.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (sitemapUrl) => {
          try {
            const res = await fetch(sitemapUrl, {
              headers: { "User-Agent": "PlayInfinity/1.0 (nuvix-scraper)" },
              signal: AbortSignal.timeout(15000),
            });
            if (!res.ok) return null;
            const xml = await res.text();
            const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g))
              .map(m => m[1].trim())
              .filter(Boolean);
            return urls;
          } catch {
            return null;
          }
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          for (const url of r.value) {
            // Pattern: .../assistir-filme/assistir-{slug}-dublado/{numeric_id}
            //          .../assistir-serie/assistir-{slug}-online/{numeric_id}
            const match = url.match(/\/(assistir-filme|assistir-serie|assistir-anime|assistir-novela)\/assistir-([^/]+)\/(\d+)/);
            if (match) {
              const typeStr = match[1].replace("assistir-", "");
              const slug = match[2];
              const type = typeStr === "filme" ? "movie" : typeStr === "serie" ? "series" : typeStr as any;

              // Remove sufixo comum (-dublado, -online, -legendado)
              const cleanSlug = slug.replace(/-(dublado|online|legendado|portugues)$/, "");

              // Salva com slug limpo (sem acento, sem -dublado etc)
              const normalized = normalizeTitleToSlug(cleanSlug.replace(/-/g, " "));
              if (normalized.length >= 2 && !_nuvixIndex.has(normalized)) {
                _nuvixIndex.set(normalized, { url, type: type as any });
                totalUrls++;
              }
            }
          }
        }
      }

      batchIdx++;
      if (batchIdx % 5 === 0) {
        console.log(`[nuvix] Progresso: ${i + batch.length}/${subSitemaps.length} sitemaps, ${totalUrls} URLs indexados`);
      }
    }

    _sitemapLoadDone = true;
    console.log(`[nuvix] Sitemaps carregados: ${totalUrls} URLs indexados`);

    // Salva cache em disco pra próxima vez (carrega mais rápido)
    try {
      const cacheFile = path.join(process.cwd(), "data", "nuvix-sitemap-index.json");
      const cacheDir = path.dirname(cacheFile);
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      const cacheData = Array.from(_nuvixIndex.entries()).map(([k, v]) => [k, v]);
      fs.writeFileSync(cacheFile, JSON.stringify({ timestamp: Date.now(), entries: cacheData }), "utf-8");
      console.log(`[nuvix] Cache de sitemap salvo em disco: ${cacheFile}`);
    } catch (err) {
      console.warn("[nuvix] Falha ao salvar cache de sitemap:", err);
    }
  } catch (err: any) {
    _sitemapLoadError = err.message;
    console.error("[nuvix] Erro ao carregar sitemaps:", err.message);
  }
}

/**
 * Tenta carregar cache de sitemap do disco (mais rápido que baixar tudo de novo).
 */
function loadSitemapCacheFromDisk(): boolean {
  try {
    const cacheFile = path.join(process.cwd(), "data", "nuvix-sitemap-index.json");
    if (!fs.existsSync(cacheFile)) return false;
    const raw = fs.readFileSync(cacheFile, "utf-8");
    const cache = JSON.parse(raw);
    if (!cache.entries || !Array.isArray(cache.entries)) return false;
    // Cache válido por 24h
    if (Date.now() - (cache.timestamp || 0) > 24 * 60 * 60 * 1000) return false;
    _nuvixIndex.clear();
    for (const [k, v] of cache.entries) {
      _nuvixIndex.set(k, v);
    }
    _sitemapLoadDone = true;
    console.log(`[nuvix] Cache de sitemap carregado do disco: ${_nuvixIndex.size} URLs`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extrai contentUrl (m3u8 + auth_key) do HTML da página do Nuvix.
 * Retorna null se não encontrar.
 */
async function extractContentUrl(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Procura contentUrl no JSON-LD structured data
    // Pattern: contentUrl":"https://image1.{cdn}.com/{video|hls}/.../index_N.m3u8?auth_key=...&expire=...
    const match = html.match(/contentUrl\\?":\\?"([^"\\]+image1\.[a-z]+\.[a-z]+\/(?:video|hls)[^"\\]+\.m3u8[^"\\]+)\\?"/);
    if (match && match[1]) {
      return match[1].replace(/\\u0026/g, "&").replace(/\\"/g, '"');
    }
    return null;
  } catch (err) {
    console.warn("[nuvix] Erro ao extrair contentUrl:", err);
    return null;
  }
}

// ============================================================================
// Inicialização: tenta cache do disco, senão baixa em background
// ============================================================================
if (!loadSitemapCacheFromDisk()) {
  // Programa pra rodar 1s depois (não bloqueia startup do servidor)
  setTimeout(() => {
    loadSitemapInBackground();
  }, 1000);
}

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * GET /api/nuvix-status
 * Retorna estado atual do índice de sitemap (pra debug/admin).
 */
router.get("/api/nuvix-status", (req: Request, res: Response) => {
  res.json({
    success: true,
    indexed: _nuvixIndex.size,
    loadDone: _sitemapLoadDone,
    loadError: _sitemapLoadError,
    loadStarted: _sitemapLoadStarted,
  });
});

/**
 * GET /api/nuvix-stream?title=X&type=movie|series
 * Retorna m3u8 URL + auth_key pra tocar no iframe hls.js.
 */
router.get("/api/nuvix-stream", async (req: Request, res: Response) => {
  try {
    const title = String(req.query.title || "").trim();
    const type = (req.query.type as string) || "movie";

    if (!title) {
      return res.status(400).json({ error: "title é obrigatório" });
    }

    const slug = normalizeTitleToSlug(title);

    if (_nuvixIndex.size === 0) {
      return res.status(503).json({
        error: "Índice Nuvix ainda carregando. Tente novamente em 1-2 minutos.",
        slug,
        indexed: 0,
        loadDone: _sitemapLoadDone,
      });
    }

    const entry = _nuvixIndex.get(slug);
    if (!entry) {
      // Tenta busca fuzzy: procura por slug que começa com ou contém
      let fuzzyMatch = null;
      for (const [k, v] of _nuvixIndex.entries()) {
        if (v.type === type && (k.startsWith(slug) || slug.startsWith(k))) {
          fuzzyMatch = { slug: k, entry: v };
          break;
        }
      }
      if (!fuzzyMatch) {
        return res.status(404).json({
          error: `Título não encontrado no Nuvix (slug: ${slug})`,
          slug,
          indexed: _nuvixIndex.size,
        });
      }
      const contentUrl = await extractContentUrl(fuzzyMatch.entry.url);
      if (!contentUrl) {
        return res.status(404).json({ error: "contentUrl não encontrado na página", url: fuzzyMatch.entry.url });
      }
      return res.json({ success: true, slug: fuzzyMatch.slug, url: contentUrl, source: "nuvix-fuzzy" });
    }

    const contentUrl = await extractContentUrl(entry.url);
    if (!contentUrl) {
      return res.status(502).json({ error: "Falha ao extrair contentUrl do HTML", url: entry.url });
    }

    return res.json({ success: true, slug, url: contentUrl, source: "nuvix" });
  } catch (err: any) {
    console.error("[nuvix-stream] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/nuvix-player?title=X&type=movie|series
 * Retorna HTML iframe com hls.js igual ao /api/vidsrc-player.
 * hls.js faz fetch do m3u8 direto do CDN do Nuvix — navegador do user
 * passa no Cloudflare anti-bot (igual ao vidsrc).
 */
router.get("/api/nuvix-player", async (req: Request, res: Response) => {
  const title = String(req.query.title || "").trim();
  const type = (req.query.type as string) || "movie";

  if (!title) {
    return res.status(400).send("title é obrigatório");
  }

  // URL do stream que o iframe vai buscar
  const streamUrl = `/api/nuvix-stream?title=${encodeURIComponent(title)}&type=${type}`;

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
  #err { position:absolute; inset:0; display:none; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-family:system-ui; text-align:center; padding:20px; }
</style>
</head>
<body>
<div id="loader"><div class="spinner"></div></div>
<video id="v" playsinline></video>
<div id="err">
  <p style="font-size:16px;font-weight:bold;margin-bottom:8px;">Conteúdo não disponível no Nuvix</p>
  <p style="font-size:12px;color:#aaa;" id="errMsg"></p>
</div>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
<script>
var video=document.getElementById('v'),loader=document.getElementById('loader'),errDiv=document.getElementById('err'),errMsg=document.getElementById('errMsg');

function showError(msg){
  loader.style.display='none';
  errDiv.style.display='flex';
  errMsg.textContent=msg;
  window.parent.postMessage({type:'WATCHPLAY_ERROR',reason:'nuvix:'+msg},'*');
}

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
      }).catch(function(){});
    });
    hls.on(Hls.Events.ERROR,function(e,data){
      if(data.fatal){
        if(data.type===Hls.ErrorTypes.NETWORK_ERROR){hls.startLoad();}
        else if(data.type===Hls.ErrorTypes.MEDIA_ERROR){hls.recoverMediaError();}
        else{showError('hls_fatal:'+data.type);}
      }
    });
    hls.on(Hls.Events.BUFFER_APPENDED,function(){
      if(seekPending){
        seekPending=false;
        try{video.currentTime=video.currentTime+0.001;}catch(e){}
      }
    });
  }else if(video.canPlayType('application/vnd.apple.mpegurl')){
    video.src=url;
    video.addEventListener('loadedmetadata',function(){
      video.play().then(function(){
        window.parent.postMessage({type:'WATCHPLAY_AUTOPLAY_MUTED'},'*');
      }).catch(function(){});
    });
  }else{
    showError('HLS não suportado neste navegador');
  }
}

// Busca m3u8 URL no nosso backend
fetch('${streamUrl}').then(function(r){return r.json();}).then(function(data){
  if(data&&data.success&&data.url){
    initHls(data.url);
  }else{
    showError(data&&data.error||'contentUrl não encontrado');
  }
}).catch(function(err){
  showError('Falha ao buscar stream: '+(err.message||err));
});

// Receber comandos da NetflixPlayerSkin
window.addEventListener('message',function(e){
  if(!video)return;
  var cmd=e.data;
  if(!cmd||!cmd.type)return;
  try{
    if(cmd.type==='PLAY'||cmd.type==='play'){video.play();}
    else if(cmd.type==='PAUSE'||cmd.type==='pause'){video.pause();}
    else if(cmd.type==='SEEK'&&typeof cmd.targetTime==='number'){video.currentTime=cmd.targetTime;}
    else if(cmd.type==='seek'&&typeof cmd.time==='number'){video.currentTime=cmd.time;}
    else if(cmd.type==='SET_VOLUME'&&typeof cmd.volume==='number'){video.volume=cmd.volume;video.muted=(cmd.volume===0);}
    else if(cmd.type==='setMuted'){video.muted=!!cmd.muted;}
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
