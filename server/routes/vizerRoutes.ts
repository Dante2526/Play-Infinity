import { Router, Request, Response } from "express";
import { Readable } from "node:stream";

export const vizerRouter = Router();

interface VizerCacheEntry {
  masterUrl: string;
  playerRedirect: string;
  expiresAt: number;
}

const vizerCache = new Map<string, VizerCacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

const ALLOWED_VIZER_HOSTS = new Set([
  "112234152.xyz",
  "fshd.link",
  "vizer.best",
  "venom.00000410.xyz",
  "00000410.xyz"
]);

function isAllowedVizerHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    for (const host of ALLOWED_VIZER_HOSTS) {
      if (u.hostname === host || u.hostname.endsWith("." + host)) return true;
    }
  } catch {}
  return false;
}

/**
 * Extrai o stream HLS oficial do Vizer (FSHD / 112234152.xyz)
 */
export async function resolveVizerHls(
  tmdbId: number,
  season?: number,
  episode?: number,
  isSeries: boolean = true,
  refresh: boolean = false,
  signal?: AbortSignal
): Promise<{ masterUrl: string; playerRedirect: string }> {
  const cacheKey = isSeries
    ? `series:${tmdbId}:${season || 1}:${episode || 1}`
    : `movie:${tmdbId}`;

  if (!refresh) {
    const cached = vizerCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { masterUrl: cached.masterUrl, playerRedirect: cached.playerRedirect };
    }
  }

  const fshdUrl = isSeries
    ? `https://fshd.link/serie/${tmdbId}/${season || 1}/${episode || 1}`
    : `https://fshd.link/filme/${tmdbId}`;

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const pageRes = await fetch(fshdUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Referer": "https://vizer.best/"
      }
    });

    if (!pageRes.ok) {
      throw new Error(`FSHD respondeu status ${pageRes.status}`);
    }

    const html = await pageRes.text();

    // Extrai o content_id
    let contentId: number | null = null;
    const currentInfo = html.match(/\b(?:var|let|const)\s+CONTENT_INFO\s*=\s*["'](\d+)["']/);
    // The first dubbed option can be Abyss. This integration implements
    // FsPlay HLS only; do not send a different player's URL to its parser.
    const dubbedServer = [...html.matchAll(/class=["']server-selector["'][^>]*data-id=["'](\d+)["'][^>]*data-lang=["']2["'][^>]*>([\s\S]*?)<\/div>/g)]
      .find(match => /FsPlay/i.test(match[2]));

    if (isSeries) {
      // Procura o data-contentid do episódio ativo
      const activeMatch = html.match(/<div class=["']episodeOption(?:\s+active)?["']\s+data-contentid=["'](\d+)["']/);
      if (activeMatch) {
        contentId = parseInt(activeMatch[1], 10);
      }
    } else {
      // Para filmes, procura CONTENT_INFO no script ou data-contentinfo/id nas tags
      const movieMatch = html.match(/var\s+CONTENT_INFO\s*=\s*['"]?(\d+)['"]?/i) ||
                         html.match(/CONTENT_INFO\s*=\s*['"]?(\d+)['"]?/i) ||
                         html.match(/data-contentid=["'](\d+)["']|data-contentinfo=["'](\d+)["']/i);
      if (movieMatch) {
        contentId = parseInt(movieMatch[1] || movieMatch[2], 10);
      }
    }

    if (!contentId) {
      // Fallback genérico
      const anyMatch = html.match(/var\s+CONTENT_INFO\s*=\s*['"]?(\d+)['"]?/i) ||
                       html.match(/data-contentid=["'](\d+)["']/);
      if (anyMatch) contentId = parseInt(anyMatch[1], 10);
    }

    if (!contentId) {
      if (currentInfo) contentId = Number(currentInfo[1]);
    }
    if (!contentId) {
      throw new Error("Não foi possível identificar o content_id do título no Vizer");
    }

    // Consulta opções do player
    let videoId: number;
    if (dubbedServer && currentInfo) {
      videoId = Number(dubbedServer[1]);
    } else {
    const optRes = await fetch("https://fshd.link/api/options", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": fshdUrl
      },
      body: JSON.stringify({ content_id: contentId, content_type: isSeries ? 2 : 1 })
    });

    if (!optRes.ok) {
      throw new Error(`Falha ao consultar opções do player (status ${optRes.status})`);
    }

    const optData = await optRes.json();
    if (!optData.options || !optData.options.length) {
      throw new Error("Vizer não possui opções de vídeo disponíveis para este título");
    }

    // Prioriza estritamente áudio Dublado PT-BR (type: 1) sobre Legendado (type: 2)
    const dubOpt = optData.options.find((o: any) => o.type === 1);
    const selectedOpt = dubOpt || optData.options[0];
    videoId = selectedOpt.ID;
    }

    // Obtém a URL do player
    const playerRes = await fetch("https://fshd.link/api/players", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": fshdUrl
      },
      body: JSON.stringify({
        content_info: contentId,
        content_type: String(isSeries ? 2 : 1),
        video_id: videoId
      })
    });

    if (!playerRes.ok) {
      throw new Error(`Falha ao obter dados do player (status ${playerRes.status})`);
    }

    const playerData = await playerRes.json();
    if (!playerData.video_url) {
      throw new Error("URL do player não retornada pelo Vizer");
    }

    // Acessa o redirect do player
    const videoRes = await fetch(playerData.video_url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": fshdUrl
      }
    });

    const videoHtml = await videoRes.text();
    const redirectMatch = videoHtml.match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
    if (!redirectMatch || !redirectMatch[1]) {
      throw new Error("Redirect do player não localizado no HTML intermediário");
    }

    const playerRedirect = redirectMatch[1];
    const dataMatch = playerRedirect.match(/data=([a-f0-9]+)/);
    if (!dataMatch || !dataMatch[1]) {
      throw new Error("Formato do FsPlay indisponível para o resolvedor HLS");
    }

    const masterUrl = `https://112234152.xyz/hls/${dataMatch[1]}/master.txt`;

    const entry: VizerCacheEntry = {
      masterUrl,
      playerRedirect,
      expiresAt: Date.now() + CACHE_TTL_MS
    };

    vizerCache.set(cacheKey, entry);
    return { masterUrl, playerRedirect };
  } finally {
    signal?.removeEventListener('abort', abort);
    clearTimeout(timer);
  }
}

/**
 * Reescreve playlists HLS para que variantes e segmentos passem pelo nosso proxy sem problemas de CORS
 */
function rewriteVizerPlaylist(content: string, playlistUrl: string, referer: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      out.push(raw);
      continue;
    }

    if (line.startsWith("#")) {
      if (/URI="/i.test(line)) {
        out.push(
          line.replace(/URI="([^"]+)"/gi, (_, uri: string) => {
            try {
              const abs = new URL(uri, playlistUrl).toString();
              return `URI="/api/vizer-hls-proxy?url=${encodeURIComponent(abs)}&ref=${encodeURIComponent(referer)}"`;
            } catch {
              return line;
            }
          })
        );
      } else {
        out.push(raw);
      }
      continue;
    }

    try {
      const abs = new URL(line, playlistUrl).toString();
      out.push(`/api/vizer-hls-proxy?url=${encodeURIComponent(abs)}&ref=${encodeURIComponent(referer)}`);
    } catch {
      out.push(raw);
    }
  }

  return out.join("\n");
}

/**
 * GET /api/vizer-hls-proxy
 * Proxy reverso de playlists e segmentos com injeção de CORS e Referer
 */
vizerRouter.get("/api/vizer-hls-proxy", async (req: Request, res: Response): Promise<void | Response> => {
  const targetUrl = String(req.query.url || "");
  const referer = String(req.query.ref || "https://112234152.xyz/");

  if (!targetUrl || !isAllowedVizerHost(targetUrl)) {
    return res.status(403).send("Host não autorizado");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const upstream = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Referer": referer
      }
    });

    clearTimeout(timer);

    if (!upstream.ok) {
      return res.status(upstream.status).send("Erro no upstream Vizer");
    }

    const contentType = upstream.headers.get("content-type") || "";
    const isPlaylist = targetUrl.includes(".txt") || targetUrl.includes(".m3u8") || contentType.includes("mpegurl") || contentType.includes("text/plain");

    if (isPlaylist) {
      const text = await upstream.text();
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-cache");
      return res.send(rewriteVizerPlaylist(text, targetUrl, referer));
    }

    // Segmento de vídeo (.ts / .jpg binário)
    res.setHeader("Content-Type", contentType || "video/MP2T");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=7200");

    if (upstream.body) {
      const nodeStream = Readable.fromWeb(upstream.body as any);
      nodeStream.pipe(res);
      req.on("close", () => {
        try { nodeStream.destroy(); } catch {}
      });
      return;
    }

    return res.status(200).end();
  } catch (err: any) {
    clearTimeout(timer);
    if (!res.headersSent) {
      return res.status(502).send("Falha ao comunicar com o servidor Vizer");
    }
  }
});

/**
 * GET /api/vizer-stream
 * Retorna dados de resolução em JSON
 */
vizerRouter.get("/api/vizer-stream", async (req: Request, res: Response): Promise<void | Response> => {
  const controller = new AbortController();
  const abort = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', abort);
  const tmdbId = Number(req.query.tmdbId || req.query.id);
  const isSeries = req.query.type === "series" || (req.query.s !== undefined && req.query.s !== "");
  const season = req.query.s ? Number(req.query.s) : undefined;
  const episode = req.query.e ? Number(req.query.e) : undefined;
  const refresh = req.query.refresh === "1" || req.query.refresh === "true";

  if (!tmdbId || isNaN(tmdbId)) {
    return res.status(400).json({ success: false, error: "tmdbId inválido" });
  }

  try {
    const { masterUrl, playerRedirect } = await resolveVizerHls(tmdbId, season, episode, isSeries, refresh, controller.signal);
    const proxyUrl = `/api/vizer-hls-proxy?url=${encodeURIComponent(masterUrl)}&ref=${encodeURIComponent(playerRedirect)}`;

    return res.json({
      success: true,
      masterUrl,
      proxyUrl,
      playerRedirect
    });
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      reason: "vizer_resolution_failed",
      error: err.message || "Conteúdo não localizado no Vizer"
    });
  }
});

/**
 * GET /api/vizer-proxy-iframe
 * Wrapper HTML nativo com HLS.js sob controle estrito da NetflixPlayerSkin
 */
vizerRouter.get("/api/vizer-proxy-iframe", async (req: Request, res: Response): Promise<void | Response> => {
  const tmdbId = Number(req.query.tmdbId || req.query.id);
  const isSeries = req.query.type === "series" || (req.query.s !== undefined && req.query.s !== "");
  const season = req.query.s ? Number(req.query.s) : undefined;
  const episode = req.query.e ? Number(req.query.e) : undefined;
  const initialTime = Math.max(0, Number(req.query.t || req.query.start || 0));

  if (!tmdbId || isNaN(tmdbId)) {
    return res.status(400).send("Parâmetros inválidos");
  }

  let streamUrl = "";
  try {
    const { masterUrl, playerRedirect } = await resolveVizerHls(tmdbId, season, episode, isSeries);
    streamUrl = `/api/vizer-hls-proxy?url=${encodeURIComponent(masterUrl)}&ref=${encodeURIComponent(playerRedirect)}`;
  } catch (err: any) {
    return res.status(502).send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Vizer Indisponível</title></head>
      <body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;">
        <p>Vizer HD: Título indisponível no momento.</p>
        <script>
          try {
            window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "vizer_unavailable", vizerExhausted: true }, "*");
          } catch(e) {}
        </script>
      </body>
      </html>
    `);
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>Vizer Player HD</title>
  <style>
    html, body { margin: 0; padding: 0; background: #000; overflow: hidden; width: 100%; height: 100%; }
    #container { width: 100%; height: 100%; position: relative; }
    video { width: 100%; height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <div id="container">
    <video id="video" playsinline webkit-playsinline></video>
  </div>
  <script src="/api/byse-hls.js"></script>
  <script>
    (function() {
      var v = document.getElementById("video");
      var streamUrl = "${streamUrl}";
      var initialSeek = ${initialTime};
      var fatalReported = false;
      var statusInterval = null;
      var hls = null;

      function reportFatal(reason) {
        if (fatalReported) return;
        fatalReported = true;
        if (statusInterval) {
          clearInterval(statusInterval);
          statusInterval = null;
        }
        try { if (hls) hls.destroy(); } catch(e) {}
        try {
          window.parent.postMessage({
            type: "WATCHPLAY_ERROR",
            vizerExhausted: true,
            reason: reason || "Vizer HD: erro na reprodução"
          }, "*");
        } catch(e) {}
      }

      function autoPlay() {
        var p = v.play();
        if (p !== undefined) {
          p.catch(function() {
            v.muted = true;
            v.play().catch(function() {});
          });
        }
      }

      function startHls() {
        if (hls) return;
        hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: true,
          manifestLoadingTimeOut: 10000,
          levelLoadingTimeOut: 10000,
          fragLoadingTimeOut: 15000
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(v);
        hls.on(window.Hls.Events.MANIFEST_PARSED, function() {
          autoPlay();
        });
        hls.on(window.Hls.Events.ERROR, function(event, data) {
          if (!data || !data.fatal) return;
          switch (data.type) {
            case window.Hls.ErrorTypes.NETWORK_ERROR:
              try { hls.startLoad(); } catch(e) { reportFatal("Erro de rede no stream"); }
              break;
            case window.Hls.ErrorTypes.MEDIA_ERROR:
              try { hls.recoverMediaError(); } catch(e) { reportFatal("Erro de mídia no stream"); }
              break;
            default:
              reportFatal("HLS fatal: " + (data.details || ""));
              break;
          }
        });
      }

      if (initialSeek > 0) {
        var appliedInitial = false;
        var applySeek = function() {
          if (!appliedInitial && v && v.readyState >= 1) {
            appliedInitial = true;
            try { v.currentTime = initialSeek; } catch(e) {}
          }
        };
        v.addEventListener("loadedmetadata", applySeek);
        v.addEventListener("canplay", applySeek);
        v.addEventListener("play", applySeek);
      }

      function sendStatus() {
        if (!v || fatalReported) return;
        var dur = v.duration || 0;
        var cur = v.currentTime || 0;
        var bufferedEnd = 0;
        if (v.buffered && v.buffered.length > 0) {
          bufferedEnd = v.buffered.end(v.buffered.length - 1);
        }
        try {
          window.parent.postMessage({
            type: "WATCHPLAY_STATUS",
            currentTime: cur,
            duration: dur,
            paused: !!v.paused,
            buffering: (v.readyState < 2 && !(dur > 0) && !(cur > 0)) || (v.readyState < 3 && !v.paused),
            muted: !!v.muted,
            volume: typeof v.volume === "number" ? v.volume : 1,
            buffered: bufferedEnd,
            playbackRate: v.playbackRate || 1,
            readyState: v.readyState || 0
          }, "*");
        } catch(e) {}
      }

      statusInterval = setInterval(sendStatus, 300);

      v.addEventListener("play", function() {
        try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_PLAYING" }, "*"); } catch(e) {}
      });
      v.addEventListener("pause", function() {
        try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_PAUSED" }, "*"); } catch(e) {}
      });
      v.addEventListener("ended", function() {
        try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*"); } catch(e) {}
      });

      if (window.Hls && window.Hls.isSupported()) {
        startHls();
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = streamUrl;
        v.load();
        autoPlay();
      } else {
        reportFatal("Navegador não suporta HLS");
      }

      // Ponte de comandos da NetflixPlayerSkin
      window.addEventListener("message", function(event) {
        if (!event.data) return;
        var d = event.data;
        if (d.type === "PAUSE" && v) { v.pause(); }
        if (d.type === "PLAY" && v) {
          v.play().catch(function(err) {
            if (err && err.name === "NotAllowedError") {
              v.muted = true;
              v.play().catch(function() {});
            }
          });
        }
        if (d.type === "SEEK" && v && typeof d.targetTime === "number") {
          if (v.readyState >= 1) v.currentTime = d.targetTime;
          else initialSeek = d.targetTime;
        }
        if (d.type === "SEEK_ABSOLUTE" && v && typeof d.time === "number") {
          if (v.readyState >= 1) v.currentTime = d.time;
          else initialSeek = d.time;
        }
        if (d.type === "SEEK_RELATIVE" && v && typeof d.seconds === "number") {
          v.currentTime = Math.max(0, (v.currentTime || 0) + d.seconds);
        }
        if (d.type === "SKIP_INTRO" && v) {
          var secIntro = typeof d.seconds === "number" ? d.seconds : 75;
          v.currentTime = Math.max(0, Math.min((v.currentTime || 0) + secIntro, (v.duration || 99999) - 5));
        }
        if (d.type === "SET_VOLUME" && v && typeof d.volume === "number") {
          v.volume = Math.max(0, Math.min(1, d.volume));
          if (d.volume > 0) v.muted = false;
        }
        if (d.type === "SET_MUTED" && v) {
          v.muted = !!d.muted;
        }
        if (d.type === "SET_PLAYBACK_RATE" && v && typeof d.rate === "number") {
          v.playbackRate = d.rate;
        }
      });
    })();
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.send(html);
});
