import { Router, Request, Response } from "express";
import { Readable } from "stream";
import fs from "fs";
import path from "path";

export const streamtapeRouter = Router();

interface StreamtapeCacheEntry {
  directUrl: string;
  fileId: string;
  expiresAt: number;
}

const streamtapeMemoryCache = new Map<string, StreamtapeCacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

// Lazy-load de IDs do catálogo local se precisar buscar por tmdb_id
let _localCatalog: any = null;
function getLocalCatalog() {
  if (!_localCatalog) {
    try {
      const p = path.join(process.cwd(), "data", "encontrei-catalog.json");
      if (fs.existsSync(p)) {
        _localCatalog = JSON.parse(fs.readFileSync(p, "utf8"));
      }
    } catch (e) {
      console.warn("[StreamTape] Falha ao carregar encontrei-catalog.json:", e);
    }
  }
  return _localCatalog;
}

function findStreamtapeInCatalog(tmdbId: number, season?: number, episode?: number): string | null {
  const cat = getLocalCatalog();
  if (!cat) return null;

  if (season !== undefined && episode !== undefined) {
    const ep = (cat.episodes || []).find((x: any) => 
      Number(x.tmdb_id) === Number(tmdbId) && 
      Number(x.season) === Number(season) && 
      Number(x.episode) === Number(episode)
    );
    if (ep?.servers?.streamtape) return ep.servers.streamtape;
  } else {
    const m = (cat.movies || []).find((x: any) => Number(x.tmdb_id) === Number(tmdbId));
    if (m?.servers?.streamtape) return m.servers.streamtape;
  }
  return null;
}

/**
 * Resolve o direct link MP4 a partir do fileId do StreamTape usando scraping público sem cookies.
 */
export async function resolveStreamTapeToken(fileId: string): Promise<string | null> {
  const cleanId = String(fileId || "").trim();
  if (!cleanId) return null;

  // Cache hit
  const cached = streamtapeMemoryCache.get(cleanId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.directUrl;
  }

  const embedUrl = `https://streamtape.com/e/${cleanId}/`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const upstream = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!upstream.ok) return null;
    const html = await upstream.text();

    if (html.includes("Video not found") || html.includes("has been deleted")) {
      return null;
    }

    // 1. Extração via padrão do script get_video (id=...&expires=...&ip=...&token=...)
    let queryToken: string | null = null;
    const paramMatch = html.match(/(id=[a-zA-Z0-9_-]+&expires=[0-9]+&ip=[^&'"]+&token=[a-zA-Z0-9_-]+)/);
    if (paramMatch && paramMatch[1]) {
      queryToken = paramMatch[1];
    } else {
      // 2. Fallback de substring dinâmico no script robotlink / botlink / ideoolink
      const subMatch = html.match(/document\.getElementById\(['"][^'"]+link['"]\)\.innerHTML\s*=\s*['"][^'"]+['"]\s*\+\s*\((['"][^'"]+['"]\)\.substring\([0-9]+\)(?:\.substring\([0-9]+\))?)/);
      if (subMatch && subMatch[1]) {
        try {
          const evalStr = new Function(`return (${subMatch[1]})`)() as string;
          const cleanQuery = evalStr.replace(/^[/?&]+/, "");
          if (cleanQuery.includes("id=")) {
            queryToken = cleanQuery;
          }
        } catch {}
      }
    }

    if (!queryToken) {
      console.warn(`[StreamTape Resolver] Não foi possível extrair o token do embed para fileId: ${cleanId}`);
      return null;
    }

    const nextUrl = `https://streamtape.com/get_video?${queryToken}`;
    const headRes = await fetch(nextUrl, {
      method: "HEAD",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": embedUrl
      },
      signal: AbortSignal.timeout(10000)
    });

    const location = headRes.headers.get("location");
    if (!location) {
      console.warn(`[StreamTape Resolver] HEAD em get_video não retornou Location redirect (status: ${headRes.status})`);
      return null;
    }

    streamtapeMemoryCache.set(cleanId, {
      directUrl: location,
      fileId: cleanId,
      expiresAt: Date.now() + CACHE_TTL_MS
    });

    return location;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name !== "AbortError") {
      console.error(`[StreamTape Resolver] Erro ao resolver fileId ${cleanId}:`, err?.message || err);
    }
    return null;
  }
}

/**
 * GET /api/streamtape-resolve
 * Resolve a URL final do MP4 do StreamTape
 */
streamtapeRouter.get("/api/streamtape-resolve", async (req: Request, res: Response) => {
  try {
    let fileId = String(req.query.fileId || "").trim();
    const tmdbId = Number(req.query.tmdbId || req.query.id);
    const season = req.query.s ? Number(req.query.s) : undefined;
    const episode = req.query.e ? Number(req.query.e) : undefined;

    if (!fileId && tmdbId) {
      fileId = findStreamtapeInCatalog(tmdbId, season, episode) || "";
    }

    if (!fileId) {
      return res.status(404).json({ success: false, error: "File ID do StreamTape não encontrado para este conteúdo." });
    }

    const directUrl = await resolveStreamTapeToken(fileId);
    if (!directUrl) {
      return res.status(502).json({ success: false, error: "Vídeo do StreamTape indisponível ou expirado." });
    }

    res.json({
      success: true,
      fileId,
      directUrl,
      proxyUrl: `/api/streamtape-stream?url=${encodeURIComponent(directUrl)}`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Erro interno no resolvedor" });
  }
});

/**
 * GET /api/streamtape-stream
 * Proxy resiliente de streaming para CDNs do StreamTape (suporte a Range HTTP 206)
 */
streamtapeRouter.get("/api/streamtape-stream", async (req: Request, res: Response) => {
  try {
    const videoUrl = String(req.query.url || "").trim();
    if (!videoUrl || (!videoUrl.includes("tapecontent.net") && !videoUrl.includes("streamtape"))) {
      return res.status(400).send("URL de streaming inválida.");
    }

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Encoding": "identity",
      "Referer": "https://streamtape.com/",
      "Origin": "https://streamtape.com",
      "Connection": "keep-alive",
    };

    if (req.headers.range) {
      headers["Range"] = req.headers.range as string;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    req.on("close", () => controller.abort());

    const upstream = await fetch(videoUrl, { signal: controller.signal, headers });
    clearTimeout(timeoutId);

    res.status(upstream.status);

    // Droppa Content-Length para evitar ERR_CONTENT_LENGTH_MISMATCH em desconexões/seeks
    for (const [key, value] of upstream.headers.entries()) {
      const lk = key.toLowerCase();
      if (lk === "content-length") continue;
      if (["content-type", "content-range", "accept-ranges"].includes(lk)) {
        res.setHeader(key, value);
      }
    }
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (!upstream.body) return res.end();

    const source = Readable.fromWeb(upstream.body as any);
    let sourceFailed = false;
    source.on("error", () => {
      if (sourceFailed || res.writableEnded) return;
      sourceFailed = true;
      controller.abort();
      if (upstream.status === 206) res.destroy();
      else res.end();
    });

    source.pipe(res);
    res.on("close", () => controller.abort());
    res.on("error", () => controller.abort());
  } catch (err: any) {
    if (err?.name === "AbortError") {
      if (!res.headersSent) res.end();
      return;
    }
    console.error("[StreamTape Proxy Error]:", err?.message || err);
    if (!res.headersSent) res.status(500).send("Erro no proxy de vídeo");
    else res.destroy();
  }
});

/**
 * GET /api/streamtape-proxy-iframe
 * HTML wrapper com <video> nativo e protocolo postMessage WATCHPLAY_STATUS para a NetflixPlayerSkin
 */
streamtapeRouter.get("/api/streamtape-proxy-iframe", async (req: Request, res: Response) => {
  try {
    let fileId = String(req.query.fileId || "").trim();
    const id = req.query.id ? Number(req.query.id) : undefined;
    const season = req.query.s ? Number(req.query.s) : undefined;
    const episode = req.query.e ? Number(req.query.e) : undefined;

    if (!fileId && id) {
      fileId = findStreamtapeInCatalog(id, season, episode) || "";
    }

    if (!fileId) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
        <body><div style="text-align:center;"><h2>StreamTape Indisponível</h2><p>Conteúdo não encontrado no catálogo do StreamTape.</p></div></body></html>
      `);
    }

    const directUrl = await resolveStreamTapeToken(fileId);
    if (!directUrl) {
      return res.status(502).send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
        <body><div style="text-align:center;"><h2>Vídeo Expirado</h2><p>O arquivo no StreamTape foi removido ou está temporariamente offline.</p></div></body></html>
      `);
    }

    // Stream URL usando nosso proxy que garante headers e CORS
    const streamUrl = `/api/streamtape-stream?url=${encodeURIComponent(directUrl)}`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <style>
    body, html { margin: 0; padding: 0; background: #000; overflow: hidden; width: 100%; height: 100%; }
    #container { width: 100%; height: 100%; position: relative; }
    video { width: 100%; height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <div id="container">
    <video id="video" src="${streamUrl}" playsinline webkit-playsinline></video>
  </div>
  <script>
    (function() {
      var v = document.getElementById("video");
      var hasEverPlayed = false;

      function sendStatus() {
        if (!v) return;
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
            muted: !!v.muted,
            volume: typeof v.volume === "number" ? v.volume : 1,
            buffered: bufferedEnd,
            playbackRate: v.playbackRate || 1,
            readyState: v.readyState || 0
          }, "*");
        } catch(e) {}
      }

      setInterval(sendStatus, 300);

      v.addEventListener("play", function() {
        hasEverPlayed = true;
        try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_PLAYING" }, "*"); } catch(e) {}
      });
      v.addEventListener("pause", function() {
        try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_PAUSED" }, "*"); } catch(e) {}
      });
      v.addEventListener("ended", function() {
        try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*"); } catch(e) {}
      });
      v.addEventListener("error", function() {
        try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ERROR" }, "*"); } catch(e) {}
      });

      // Receptor de comandos da NetflixPlayerSkin
      window.addEventListener("message", function(event) {
        if (!event.data) return;
        var d = event.data;
        if (d.type === "PAUSE" && v) v.pause();
        if (d.type === "PLAY" && v) v.play().catch(function(){});
        if (d.type === "SEEK" && v && typeof d.targetTime === "number") v.currentTime = d.targetTime;
        if (d.type === "SEEK_ABSOLUTE" && v && typeof d.time === "number") v.currentTime = d.time;
        if (d.type === "SEEK_RELATIVE" && v && typeof d.seconds === "number") v.currentTime = v.currentTime + d.seconds;
        if (d.type === "MUTE" && v) v.muted = true;
        if (d.type === "UNMUTE" && v) v.muted = false;
        if (d.type === "SET_VOLUME" && v && typeof d.volume === "number") v.volume = d.volume;
        if (d.type === "SET_PLAYBACK_RATE" && v && typeof d.rate === "number") v.playbackRate = d.rate;
      });

      // Autoplay com fallback para muted se bloqueado pelo browser
      var playPromise = v.play();
      if (playPromise !== undefined) {
        playPromise.catch(function() {
          v.muted = true;
          v.play().catch(function(){});
        });
      }
    })();
  </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(html);
  } catch (err: any) {
    res.status(500).send("Erro ao renderizar reprodutor StreamTape.");
  }
});

export default streamtapeRouter;
