import { Router, Request, Response } from "express";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import {
  resolveEncontreiEpisode,
  resolveVizerEpisode,
  resolveEncontreiMovie,
  resolveVizerMovie,
} from "./encontreiLookup";

export const doodstreamRouter = Router();

interface DoodstreamCacheEntry {
  directUrl?: string;
  embedUrl: string;
  alive: boolean;
  fileId: string;
  expiresAt: number;
}

const doodstreamMemoryCache = new Map<string, DoodstreamCacheEntry>();
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
      console.warn("[DoodStream] Falha ao carregar encontrei-catalog.json:", e);
    }
  }
  return _localCatalog;
}

export function findDoodstreamInCatalog(tmdbId: number, season?: number, episode?: number): string | null {
  const cat = getLocalCatalog();
  if (!cat) return null;

  if (season !== undefined && episode !== undefined) {
    const ep = (cat.episodes || []).find((x: any) => 
      Number(x.tmdb_id) === Number(tmdbId) && 
      Number(x.season) === Number(season) && 
      Number(x.episode) === Number(episode)
    );
    if (ep?.servers?.doodstream) return ep.servers.doodstream;
  } else {
    const m = (cat.movies || []).find((x: any) => Number(x.tmdb_id) === Number(tmdbId));
    if (m?.servers?.doodstream) return m.servers.doodstream;
  }
  return null;
}

/**
 * Verifica a disponibilidade do arquivo no DoodStream e tenta extrair o link direto ou embed limpo.
 */
export async function resolveDoodStreamToken(fileId: string): Promise<{ alive: boolean; directUrl?: string; embedUrl: string } | null> {
  const cleanId = String(fileId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanId) return null;

  const cached = doodstreamMemoryCache.get(cleanId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const primaryDomain = "playmogo.com";
  const embedUrl = `https://${primaryDomain}/e/${cleanId}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const upstream = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://encontrei.me/"
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (upstream.status === 404) {
      doodstreamMemoryCache.set(cleanId, { alive: false, embedUrl, fileId: cleanId, expiresAt: Date.now() + CACHE_TTL_MS });
      return { alive: false, embedUrl };
    }

    const html = await upstream.text();

    // Detecção rápida de vídeo deletado ou não encontrado
    if (html.includes("Video not found") || html.includes("video you are looking for is not found") || html.includes("no_video_3.svg")) {
      doodstreamMemoryCache.set(cleanId, { alive: false, embedUrl, fileId: cleanId, expiresAt: Date.now() + CACHE_TTL_MS });
      return { alive: false, embedUrl };
    }

    // Tenta extrair link direto via pass_md5 se disponível
    let directUrl: string | undefined = undefined;
    const passMatch = html.match(/\/pass_md5\/([a-zA-Z0-9_\/-]+)/);
    if (passMatch) {
      try {
        const passRes = await fetch(`https://${primaryDomain}${passMatch[0]}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": embedUrl
          },
          signal: AbortSignal.timeout(6000)
        });
        if (passRes.ok) {
          const passData = await passRes.text();
          if (passData && passData.startsWith("http")) {
            const token = passMatch[1].split("/").pop();
            const rand = Math.random().toString(36).substring(2, 12);
            directUrl = `${passData}${rand}?token=${token}&expiry=${Date.now()}`;
          }
        }
      } catch {}
    }

    const entry: DoodstreamCacheEntry = {
      alive: true,
      directUrl,
      embedUrl,
      fileId: cleanId,
      expiresAt: Date.now() + CACHE_TTL_MS
    };

    doodstreamMemoryCache.set(cleanId, entry);
    return entry;
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      console.warn(`[DoodStream Resolver] Erro ao resolver fileId ${cleanId}:`, err?.message || err);
    }
    // Fallback gracioso: presume vivo com embedUrl para que o player teste no navegador do cliente
    return { alive: true, embedUrl };
  }
}

/**
 * GET /api/doodstream-resolve
 */
doodstreamRouter.get("/api/doodstream-resolve", async (req: Request, res: Response) => {
  try {
    let fileId = String(req.query.fileId || "").trim();
    const tmdbId = Number(req.query.tmdbId || req.query.id);
    const season = req.query.s ? Number(req.query.s) : undefined;
    const episode = req.query.e ? Number(req.query.e) : undefined;

    if (!fileId && tmdbId) {
      fileId = findDoodstreamInCatalog(tmdbId, season, episode) || "";
    }

    if (!fileId) {
      return res.status(400).json({ error: "fileId ou id é obrigatório" });
    }

    const resolved = await resolveDoodStreamToken(fileId);
    if (!resolved || !resolved.alive) {
      return res.status(404).json({ error: "Vídeo não encontrado ou expirado no DoodStream" });
    }

    return res.json({
      fileId,
      directUrl: resolved.directUrl || null,
      embedUrl: resolved.embedUrl
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Erro interno no DoodStream resolver" });
  }
});

/**
 * GET /api/doodstream-stream
 * Proxy resiliente de streaming para CDNs do DoodStream com Range HTTP 206
 */
doodstreamRouter.get("/api/doodstream-stream", async (req: Request, res: Response) => {
  try {
    const videoUrl = String(req.query.url || "").trim();
    if (!videoUrl || (!videoUrl.includes("dood") && !videoUrl.includes("cloudatacdn.com") && !videoUrl.includes("playmogo.com"))) {
      return res.status(400).send("URL de streaming inválida.");
    }

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Encoding": "identity",
      "Referer": "https://playmogo.com/",
      "Origin": "https://playmogo.com",
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

    // Repassa Content-Length, Content-Range e Accept-Ranges para conformidade RFC 9110 (Range 206)
    for (const [key, value] of upstream.headers.entries()) {
      const lk = key.toLowerCase();
      if (["content-type", "content-range", "accept-ranges", "content-length"].includes(lk)) {
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
    console.error("[DoodStream Proxy Error]:", err?.message || err);
    if (!res.headersSent) res.status(500).send("Erro no proxy de vídeo");
    else res.destroy();
  }
});

/**
 * GET /api/doodstream-proxy-iframe
 * Wrapper HTML inteligente com suporte a <video> nativo e embed blindado com escudo anti-popup
 */
doodstreamRouter.get("/api/doodstream-proxy-iframe", async (req: Request, res: Response) => {
  try {
    let fileId = String(req.query.fileId || "").trim();
    const id = req.query.id ? Number(req.query.id) : undefined;
    const season = req.query.s ? Number(req.query.s) : undefined;
    const episode = req.query.e ? Number(req.query.e) : undefined;
    const name = req.query.name ? String(req.query.name) : undefined;

    // 1. Se não veio fileId na query, consulta o catálogo estático local
    if (!fileId && id) {
      fileId = findDoodstreamInCatalog(id, season, episode) || "";

      // 2. Se não estiver no catálogo estático, busca ao vivo (Encontrei.me primeiro, depois Vizer)
      if (!fileId) {
        try {
          if (season !== undefined && episode !== undefined) {
            const liveEnc = await resolveEncontreiEpisode(id, season, episode, name);
            fileId = liveEnc?.doodstream || (await resolveVizerEpisode(id, season, episode, name))?.doodstream || "";
          } else {
            const liveEnc = await resolveEncontreiMovie(id, name);
            fileId = liveEnc?.doodstream || (await resolveVizerMovie(id, name))?.doodstream || "";
          }
        } catch (e) {
          console.warn("[DoodStream Live Lookup Error]:", e);
        }
      }
    }

    if (!fileId) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
        <body>
          <div style="text-align:center;"><h2>Conteúdo Indisponível</h2><p>Este título não está disponível no servidor DoodStream HD.</p></div>
          <script>
            try {
              if (window.parent !== window) {
                window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "DoodStream: Conteúdo não encontrado no catálogo" }, "*");
              }
            } catch(e) {}
          </script>
        </body></html>
      `);
    }

    let resolved = await resolveDoodStreamToken(fileId);

    // 3. Auto-recuperação: se o link falhou (vídeo deletado/expirado), tenta buscar novo link ao vivo
    if ((!resolved || !resolved.alive) && id) {
      console.warn(`[DoodStream] fileId ${fileId} expirado ou removido. Buscando novo link ao vivo do Encontrei/Vizer...`);
      try {
        let freshId: string | null = null;
        if (season !== undefined && episode !== undefined) {
          const liveEnc = await resolveEncontreiEpisode(id, season, episode, name);
          freshId = liveEnc?.doodstream || (await resolveVizerEpisode(id, season, episode, name))?.doodstream || null;
        } else {
          const liveEnc = await resolveEncontreiMovie(id, name);
          freshId = liveEnc?.doodstream || (await resolveVizerMovie(id, name))?.doodstream || null;
        }
        if (freshId && freshId !== fileId) {
          fileId = freshId;
          resolved = await resolveDoodStreamToken(fileId);
        }
      } catch (e) {
        console.warn("[DoodStream Auto-Recovery Error]:", e);
      }
    }

    if (!resolved || !resolved.alive) {
      return res.status(502).send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
        <body>
          <div style="text-align:center;"><h2>Vídeo Expirado</h2><p>O arquivo no DoodStream foi removido ou está temporariamente offline.</p></div>
          <script>
            try {
              if (window.parent !== window) {
                window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "DoodStream: Vídeo expirado ou removido" }, "*");
              }
            } catch(e) {}
          </script>
        </body></html>
      `);
    }

    // Se temos link direto MP4, usamos o player <video> nativo de alta performance
    if (resolved.directUrl) {
      const streamUrl = `/api/doodstream-stream?url=${encodeURIComponent(resolved.directUrl)}`;
      return res.send(`<!DOCTYPE html>
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
    <video id="video" src="${streamUrl}" playsinline webkit-playsinline preload="auto"></video>
  </div>
  <script>
    (function() {
      var v = document.getElementById("video");
      if (!v) return;

      function notifyReady() {
        try {
          if (window.parent !== window) {
            window.parent.postMessage({ type: "WATCHPLAY_READY" }, "*");
          }
        } catch(e) {}
      }

      function sendStatus() {
        if (!v) return;
        var dur = v.duration || 0;
        var cur = v.currentTime || 0;
        var bufferedEnd = 0;
        if (v.buffered && v.buffered.length > 0) {
          bufferedEnd = v.buffered.end(v.buffered.length - 1);
        }
        try {
          if (window.parent !== window) {
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
          }
        } catch(e) {}
      }

      v.addEventListener("loadedmetadata", function() {
        notifyReady();
        sendStatus();
      });
      v.addEventListener("play", sendStatus);
      v.addEventListener("pause", sendStatus);
      v.addEventListener("timeupdate", sendStatus);
      v.addEventListener("ended", function() {
        try {
          if (window.parent !== window) {
            window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
          }
        } catch(e) {}
      });
      v.addEventListener("error", function() {
        try {
          if (window.parent !== window) {
            window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "DoodStream: Falha na reprodução do stream" }, "*");
          }
        } catch(e) {}
      });

      var playPromise = v.play();
      if (playPromise !== undefined) {
        playPromise.catch(function() {
          v.muted = true;
          v.play().catch(function() {});
        });
      }

      setInterval(sendStatus, 300);

      window.addEventListener("message", function(e) {
        if (!e.data || typeof e.data !== "object") return;
        switch(e.data.type) {
          case "PLAY": v.play().catch(function(){}); break;
          case "PAUSE": v.pause(); break;
          case "TOGGLE_PLAY": if (v.paused) v.play().catch(function(){}); else v.pause(); break;
          case "SEEK":
          case "SEEK_ABSOLUTE":
            var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
            if (typeof t === "number" && !isNaN(t)) v.currentTime = t;
            break;
          case "SEEK_RELATIVE":
            var dt = Number(e.data.seconds || 0);
            if (!isNaN(dt)) v.currentTime = Math.max(0, Math.min(v.duration || 99999, v.currentTime + dt));
            break;
          case "SET_VOLUME":
            if (typeof e.data.volume === "number") {
              v.volume = Math.max(0, Math.min(1, e.data.volume));
              if (v.volume > 0) v.muted = false;
            }
            break;
          case "SET_MUTED": v.muted = !!e.data.muted; break;
          case "SET_PLAYBACK_RATE":
            if (typeof e.data.rate === "number") v.playbackRate = e.data.rate;
            break;
          case "REQUEST_STATUS": sendStatus(); break;
        }
      });
    })();
  </script>
</body>
</html>`);
    }

    // Se não há stream direto MP4, o embed externo do DoodStream é bloqueado por Cloudflare SAMEORIGIN.
    // Dispara WATCHPLAY_ERROR imediatamente (<50ms) para evitar tela branca e permitir fallback instantâneo.
    return res.status(502).send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
<body>
  <div style="text-align:center;"><h2>DoodStream Indisponível</h2><p>Servidor DoodStream indisponível ou bloqueado por proteção de origem.</p></div>
  <script>
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "DoodStream: Proteção de origem ou vídeo indisponível" }, "*");
      }
    } catch(e) {}
  </script>
</body>
</html>`);
  } catch (err: any) {
    console.error("[DoodStream Proxy Iframe Error]:", err?.message || err);
    return res.status(500).send("Erro interno ao carregar DoodStream HD");
  }
});
