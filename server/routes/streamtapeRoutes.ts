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

export const streamtapeRouter = Router();

interface StreamtapeCacheEntry {
  directUrl: string;
  fileId: string;
  expiresAt: number;
}

const streamtapeMemoryCache = new Map<string, StreamtapeCacheEntry>();
const directUrlToFileId = new Map<string, string>();
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutos (evita retenção de tokens expirados da CDN)

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

    // 1. Extração prioritária via script dinâmico ('botlink' ou 'robotlink')
    // Nota crítica: StreamTape coloca divs ocultos com tokens FALSOS (honeypots como 'ideoolink')
    // para enganar scrapers estáticos. A URL real é montada exclusivamente via script dinâmico.
    let nextUrl: string | null = null;

    const dynamicMatch = html.match(/document\.getElementById\(['"](?:botlink|robotlink)['"]\)\.innerHTML\s*=\s*(.+?);/);
    if (dynamicMatch && dynamicMatch[1]) {
      try {
        const evaluated = new Function(`return ${dynamicMatch[1]};`)();
        let target = String(evaluated).trim();
        if (target.startsWith("//")) {
          nextUrl = "https:" + target;
        } else if (target.startsWith("http")) {
          nextUrl = target;
        } else {
          nextUrl = "https://streamtape.com" + (target.startsWith("/") ? "" : "/") + target;
        }
        if (!nextUrl.includes("&stream=1")) {
          nextUrl += "&stream=1";
        }
      } catch (e) {
        console.warn(`[StreamTape Resolver] Falha ao avaliar script dinâmico para ${cleanId}:`, e);
      }
    }

    // 2. Fallback secundário caso o padrão do script varie
    if (!nextUrl) {
      const subMatch = html.match(/document\.getElementById\(['"][^'"]+link['"]\)\.innerHTML\s*=\s*['"][^'"]+['"]\s*\+\s*\((['"][^'"]+['"]\)\.substring\([0-9]+\)(?:\.substring\([0-9]+\))?)/);
      if (subMatch && subMatch[1]) {
        try {
          const evalStr = new Function(`return (${subMatch[1]})`)() as string;
          const cleanQuery = evalStr.replace(/^[/?&]+/, "");
          if (cleanQuery.includes("id=")) {
            nextUrl = `https://streamtape.com/get_video?${cleanQuery}&stream=1`;
          }
        } catch {}
      }
    }

    if (!nextUrl) {
      console.warn(`[StreamTape Resolver] Não foi possível extrair o link de vídeo para fileId: ${cleanId}`);
      return null;
    }
    const headRes = await fetch(nextUrl, {
      method: "HEAD",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": embedUrl
      },
      signal: AbortSignal.timeout(15000)
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
    directUrlToFileId.set(location, cleanId);

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
      proxyUrl: `/api/streamtape-stream?url=${encodeURIComponent(directUrl)}&fileId=${encodeURIComponent(fileId)}`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Erro interno no resolvedor" });
  }
});

/**
 * GET /api/streamtape-stream
 * Proxy resiliente de streaming para CDNs do StreamTape (suporte a Range HTTP 206 e Auto-Healer)
 */
streamtapeRouter.get("/api/streamtape-stream", async (req: Request, res: Response) => {
  try {
    let videoUrl = String(req.query.url || "").trim();
    const fileId = String(req.query.fileId || "").trim();
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

    let controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 15000);
    req.on("close", () => controller.abort());

    let upstream = await fetch(videoUrl, { signal: controller.signal, headers });
    clearTimeout(timeoutId);

    // Auto-Healer 403 Forbidden / 404 / 410: se o token da CDN expirar (após pausa longa), renova em tempo real mantendo o Range
    if ((upstream.status === 403 || upstream.status === 404 || upstream.status === 410) && !res.headersSent) {
      const targetFileId = fileId || directUrlToFileId.get(videoUrl) || "";
      if (targetFileId) {
        console.warn(`[StreamTape Proxy] Token CDN expirado (${upstream.status}) para fileId ${targetFileId}. Renovando token em tempo real...`);
        streamtapeMemoryCache.delete(targetFileId);
        try { await upstream.text(); } catch (_) {}

        const freshDirectUrl = await resolveStreamTapeToken(targetFileId);
        if (freshDirectUrl) {
          videoUrl = freshDirectUrl;
          controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), 15000);
          upstream = await fetch(videoUrl, { signal: controller.signal, headers });
          clearTimeout(timeoutId);
        }
      }
    }

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
    const name = req.query.name ? String(req.query.name) : undefined;
    const initialTime = Math.max(0, parseFloat(String(req.query.t || "0")));

    // 1. Para séries com id, season e episode:
    // Sempre prioriza o fileId exato deste episódio no catálogo local para evitar que clientes
    // ou WebViews reutilizem o fileId do episódio anterior por atraso de renderização.
    if (id && season !== undefined && episode !== undefined) {
      const catalogFid = findStreamtapeInCatalog(id, season, episode);
      if (catalogFid) {
        fileId = catalogFid;
      }
    }

    // 2. Se não achou ainda no catálogo, busca ao vivo
    if (!fileId && id) {
      fileId = findStreamtapeInCatalog(id, season, episode) || "";

      // 2. Se não estiver no catálogo estático, busca ao vivo (Encontrei.me primeiro, depois Vizer)
      if (!fileId) {
        try {
          if (season !== undefined && episode !== undefined) {
            const liveEnc = await resolveEncontreiEpisode(id, season, episode, name);
            fileId = (liveEnc as any)?.streamtape || (await resolveVizerEpisode(id, season, episode, name))?.streamtape || "";
          } else {
            const liveEnc = await resolveEncontreiMovie(id, name);
            fileId = (liveEnc as any)?.streamtape || (await resolveVizerMovie(id, name))?.streamtape || "";
          }
        } catch (e) {
          console.warn("[StreamTape Live Lookup Error]:", e);
        }
      }
    }

    if (!fileId) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
        <body>
          <div style="text-align:center;"><h2>StreamTape Indisponível</h2><p>Conteúdo não encontrado no catálogo do StreamTape.</p></div>
          <script>
            try {
              if (window.parent !== window) {
                window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "StreamTape: Conteúdo não encontrado no catálogo" }, "*");
              }
            } catch(e) {}
          </script>
        </body></html>
      `);
    }

    let directUrl = await resolveStreamTapeToken(fileId);

    // 3. Auto-recuperação: se o link do catálogo falhou (vídeo deletado/expirado), tenta buscar novo link ao vivo!
    if (!directUrl && id) {
      console.warn(`[StreamTape] fileId ${fileId} expirado ou removido. Buscando novo link ao vivo do Encontrei/Vizer...`);
      try {
        let freshId: string | null = null;
        if (season !== undefined && episode !== undefined) {
          const liveEnc = await resolveEncontreiEpisode(id, season, episode, name);
          freshId = (liveEnc as any)?.streamtape || (await resolveVizerEpisode(id, season, episode, name))?.streamtape || null;
        } else {
          const liveEnc = await resolveEncontreiMovie(id, name);
          freshId = (liveEnc as any)?.streamtape || (await resolveVizerMovie(id, name))?.streamtape || null;
        }
        if (freshId && freshId !== fileId) {
          fileId = freshId;
          directUrl = await resolveStreamTapeToken(fileId);
        }
      } catch (e) {
        console.warn("[StreamTape Auto-Recovery Error]:", e);
      }
    }

    if (!directUrl) {
      return res.status(502).send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
        <body>
          <div style="text-align:center;"><h2>Vídeo Expirado</h2><p>O arquivo no StreamTape foi removido ou está temporariamente offline.</p></div>
          <script>
            try {
              if (window.parent !== window) {
                window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "StreamTape: Vídeo expirado ou removido" }, "*");
              }
            } catch(e) {}
          </script>
        </body></html>
      `);
    }

    // Stream URL usando nosso proxy que garante headers, CORS e renovação via Auto-Healer
    const streamUrl = `/api/streamtape-stream?url=${encodeURIComponent(directUrl)}&fileId=${encodeURIComponent(fileId)}`;

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
      var initialSeek = ${initialTime};

      // Se foi passado timestamp inicial (ex: retomada após pausa longa ou Continuar Assistindo),
      // posiciona no segundo salvo assim que os metadados do vídeo estiverem prontos
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

      // Auto-recovery de erro no vídeo: se falhar após o vídeo já ter iniciado, tenta recarregar fonte com o tempo salvo
      var hasRecoveredOnce = false;
      v.addEventListener("error", function() {
        var cur = (v && v.currentTime > 2) ? v.currentTime : initialSeek;
        if (!hasRecoveredOnce && cur > 2) {
          hasRecoveredOnce = true;
          console.warn("[StreamTape Iframe] Erro detectado no vídeo. Renovando token via auto-recovery na posição:", cur);
          fetch("/api/streamtape-resolve?fileId=" + encodeURIComponent("${fileId}"))
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (data && data.proxyUrl) {
                v.src = data.proxyUrl + "&_cb=" + Date.now();
                var onReloadSeek = function() {
                  try {
                    v.currentTime = cur;
                    v.play().catch(function(){});
                  } catch(e) {}
                };
                v.addEventListener("loadedmetadata", onReloadSeek, { once: true });
                v.addEventListener("canplay", onReloadSeek, { once: true });
                v.load();
                return;
              }
              throw new Error("Sem proxyUrl");
            })
            .catch(function() {
              try { window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "StreamTape: Erro no elemento de vídeo" }, "*"); } catch(e) {}
            });
          return;
        }
        try { window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "StreamTape: Erro no elemento de vídeo" }, "*"); } catch(e) {}
      });

      // Receptor de comandos da NetflixPlayerSkin
      window.addEventListener("message", function(event) {
        if (!event.data) return;
        var d = event.data;
        if (d.type === "PAUSE" && v) v.pause();
        if (d.type === "PLAY" && v) v.play().catch(function(){});
        if (d.type === "SEEK" && v && typeof d.targetTime === "number") {
          if (v.readyState >= 1) {
            v.currentTime = d.targetTime;
          } else {
            initialSeek = d.targetTime;
          }
        }
        if (d.type === "SEEK_ABSOLUTE" && v && typeof d.time === "number") {
          if (v.readyState >= 1) {
            v.currentTime = d.time;
          } else {
            initialSeek = d.time;
          }
        }
        if (d.type === "SEEK_RELATIVE" && v && typeof d.seconds === "number") v.currentTime = v.currentTime + d.seconds;
        if (d.type === "SKIP_INTRO" && v) {
          var secIntro = typeof d.seconds === "number" ? d.seconds : 75;
          v.currentTime = Math.max(0, Math.min(v.currentTime + secIntro, (v.duration || 99999) - 5));
        }
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
    res.status(500).send(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
      <body>
        <div style="text-align:center;"><h2>Erro no StreamTape</h2><p>Erro interno ao renderizar reprodutor.</p></div>
        <script>
          try {
            if (window.parent !== window) {
              window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "StreamTape: Erro interno no servidor" }, "*");
            }
          } catch(e) {}
        </script>
      </body></html>
    `);
  }
});

export default streamtapeRouter;
