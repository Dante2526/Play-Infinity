/**
 * Rotas de suporte ao player Nixplay e Native Player (MP4)
 */
import { Router } from "express";
import { isNixplayAvailable } from "../services/nixplayCatalog";

const router = Router();

// Verifica instantaneamente se um filme/série existe no catálogo local cacheado do Nixplay
router.get("/api/nixplay-check", (req, res) => {
  const { tmdb_id, type } = req.query;
  if (!tmdb_id || !type) return res.status(400).json({ error: "Missing tmdb_id or type" });
  
  const isSeries = type === "series";
  const available = isNixplayAvailable(String(tmdb_id), isSeries);
  
  return res.json({ available });
});

// Resolve o redirect do Nixplay server-side e retorna a URL assinada do R2 para o player
router.get("/api/nixplay-resolve", async (req, res) => {
  const nixUrl = req.query.url as string;
  if (!nixUrl) return res.status(400).json({ error: "Missing url" });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const upstream = await fetch(nixUrl, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const location = upstream.headers.get("location");

    if ((upstream.status === 302 || upstream.status === 301) && location) {
      return res.json({ url: location });
    }

    if (upstream.ok) {
      return res.json({ url: nixUrl });
    }

    return res.status(upstream.status).json({ error: `Nixplay retornou ${upstream.status}` });
  } catch (err: any) {
    console.error("[nixplay-resolve] Erro:", err?.message);
    return res.status(502).json({ error: err?.message || "Erro ao resolver URL" });
  }
});

// Página bridge genérica para tocar arquivos .mp4 cru (ex: Nixplay) e emitir eventos para a skin
router.get("/api/native-player", (req, res) => {
  const videoUrl = req.query.url as string;
  if (!videoUrl) return res.status(400).send("Missing url parameter");

  const encodedUrl = encodeURIComponent(videoUrl);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; } 
    html,body { width:100%; height:100%; background:#000; overflow:hidden; } 
    video { width:100%; height:100%; object-fit:contain; background:#000; outline:none; }
    #loader { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:#000; }
    .spinner { width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.1); border-left-color: #E50914; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="loader"><div class="spinner"></div></div>
  <video id="native-video" playsinline autoplay></video>
  <script>
    var video = document.getElementById('native-video');
    var loader = document.getElementById('loader');

    function sendStatus() {
      if (!video) return;
      window.parent.postMessage({
        type: 'WATCHPLAY_STATUS',
        data: {
          currentTime: video.currentTime || 0,
          duration: video.duration || 0,
          paused: video.paused,
          muted: video.muted,
          volume: video.volume,
          buffered: video.buffered && video.buffered.length > 0 ? (video.buffered.end(video.buffered.length - 1) / Math.max(video.duration || 1, 1)) * 100 : 0,
          readyState: video.readyState
        }
      }, '*');
    }

    function initVideo(src) {
      loader.style.display = 'none';
      video.src = src;
      video.addEventListener('play', sendStatus);
      video.addEventListener('pause', sendStatus);
      video.addEventListener('timeupdate', sendStatus);
      video.addEventListener('durationchange', sendStatus);
      video.addEventListener('volumechange', sendStatus);
      video.addEventListener('progress', sendStatus);
      video.addEventListener('error', function() {
        window.parent.postMessage({ type: 'WATCHPLAY_ERROR', reason: 'native_src_error' }, '*');
      });
      setInterval(sendStatus, 1000);
      sendStatus();
    }

    var rawUrl = decodeURIComponent('${encodedUrl}');
    var needsResolve = rawUrl.indexOf('nixplay.lat') !== -1;

    if (needsResolve) {
      fetch('/api/nixplay-resolve?url=' + encodeURIComponent(rawUrl))
        .then(function(r) { return r.json(); })
        .then(function(data) { initVideo(data.url || rawUrl); })
        .catch(function() { initVideo(rawUrl); });
    } else {
      initVideo(rawUrl);
    }
    window.addEventListener('message', function(e) {
      if (!video) return;
      var cmd = e.data;
      if (!cmd || !cmd.type) return;
      try {
        if (cmd.type === 'PLAY' || cmd.type === 'play') { video.play(); }
        else if (cmd.type === 'PAUSE' || cmd.type === 'pause') { video.pause(); }
        else if (cmd.type === 'SEEK' && typeof cmd.targetTime === 'number') { video.currentTime = cmd.targetTime; }
        else if (cmd.type === 'seek' && typeof cmd.time === 'number') { video.currentTime = cmd.time; }
        else if (cmd.type === 'SET_VOLUME' && typeof cmd.volume === 'number') { video.volume = cmd.volume; video.muted = (cmd.volume === 0); }
        else if (cmd.type === 'setMuted') { video.muted = !!cmd.muted; }
        sendStatus();
      } catch(err) {}
    });
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

// Endpoint de TESTE pra validar Cloudflare Worker
router.get("/api/proxy-test", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const targetUrl = String(req.query.url || "").trim();
  if (!targetUrl) {
    return res.status(400).json({ error: "Parâmetro 'url' é obrigatório" });
  }

  const workerProxyUrl = process.env.WORKER_PROXY_URL;
  const useWorker = !!workerProxyUrl;

  const fetchUrl = useWorker
    ? `${workerProxyUrl}?url=${encodeURIComponent(targetUrl)}`
    : targetUrl;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const upstream = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const body = await upstream.text();
    const isCFBlocked = body.includes('Attention Required') || body.includes('Just a moment');
    const titleMatch = body.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    return res.json({
      target_url: targetUrl,
      via_worker: useWorker,
      worker_url: workerProxyUrl || null,
      status: upstream.status,
      body_size: body.length,
      title,
      cloudflare_blocked: isCFBlocked,
      sample: body.substring(0, 500),
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Erro ao fetchar URL',
      detail: err.message,
      target_url: targetUrl,
      via_worker: useWorker,
    });
  }
});

export default router;
