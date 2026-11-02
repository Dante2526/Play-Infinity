import { Router, Request, Response } from "express";
import { Readable } from "node:stream";
import { getSaimoStore } from "../services/saimoSqliteStore";
import { isServerBlacklisted } from "../../src/data/serverBlacklist";

export const saimoRouter = Router();

/**
 * GET /api/saimo-lookup
 * Consulta disponibilidade de título no Saimo TV VOD SQLite.
 */
saimoRouter.get("/api/saimo-lookup", (req: Request, res: Response) => {
  const rawId = req.query.id;
  const type = String(req.query.type || "movie");
  const season = req.query.s !== undefined ? Number(req.query.s) : undefined;
  const episode = req.query.e !== undefined ? Number(req.query.e) : undefined;

  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const store = getSaimoStore();
  if (!store) {
    return res.status(503).json({ error: "Saimo catalog unavailable" });
  }

  if (type === "tv" && season !== undefined && episode !== undefined) {
    const ep = store.findEpisode(id, season, episode);
    if (!ep) {
      return res.json({ available: false });
    }
    const hasDub = Array.isArray(ep.servers?.saimo_dub) && ep.servers.saimo_dub.length > 0;
    const hasLeg = Array.isArray(ep.servers?.saimo_leg) && ep.servers.saimo_leg.length > 0;
    return res.json({
      available: true,
      title: ep.title,
      season: ep.season,
      episode: ep.episode,
      dub: hasDub,
      leg: hasLeg,
    });
  } else {
    const movie = store.findMovie(id);
    if (!movie) {
      return res.json({ available: false });
    }
    const hasDub = Array.isArray(movie.servers?.saimo_dub) && movie.servers.saimo_dub.length > 0;
    const hasLeg = Array.isArray(movie.servers?.saimo_leg) && movie.servers.saimo_leg.length > 0;
    return res.json({
      available: true,
      title: movie.title,
      year: movie.year,
      dub: hasDub,
      leg: hasLeg,
    });
  }
});

/**
 * GET /api/saimo-proxy-iframe
 * HTML wrapper com <video> nativo e protocolo postMessage WATCHPLAY_STATUS para a NetflixPlayerSkin.
 */
saimoRouter.get("/api/saimo-proxy-iframe", (req: Request, res: Response) => {
  const rawId = req.query.id;
  const type = String(req.query.type || "movie");
  const season = req.query.s !== undefined ? Number(req.query.s) : undefined;
  const episode = req.query.e !== undefined ? Number(req.query.e) : undefined;
  const audio = String(req.query.audio || "dub").toLowerCase();
  const rawT = Number(req.query.t);
  const initialTime = Number.isFinite(rawT) && rawT > 0 ? rawT : 0;

  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).send("ID inválido");
  }

  const store = getSaimoStore();
  if (!store) {
    return res.status(503).send("Catálogo Saimo indisponível");
  }

  const isTv = type === "tv" && season !== undefined && episode !== undefined;
  const item = isTv ? store.findEpisode(id, season, episode) : store.findMovie(id);

  if (!item) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
      <body>
        <div style="text-align:center;"><h2>Conteúdo Indisponível</h2><p>Título não encontrado no catálogo Saimo Play.</p></div>
        <script>
          try {
            if (window.parent !== window) {
              window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "Saimo Play: Conteúdo não encontrado no catálogo" }, "*");
            }
          } catch(e) {}
        </script>
      </body></html>
    `);
  }

  const streamParams = new URLSearchParams({ id: String(id), type, audio });
  if (isTv) {
    streamParams.set("s", String(season));
    streamParams.set("e", String(episode));
  }
  const streamUrl = `/api/saimo-stream?${streamParams}`;

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
      var initialSeek = ${initialTime};

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
            buffering: (v.readyState < 2 && !(v.duration > 0) && !(v.currentTime > 0)) || (v.readyState < 3 && !v.paused),
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
        try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_PLAYING" }, "*"); } catch(e) {}
      });
      v.addEventListener("pause", function() {
        try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_PAUSED" }, "*"); } catch(e) {}
      });
      v.addEventListener("ended", function() {
        try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*"); } catch(e) {}
      });
      v.addEventListener("error", function() {
        try { window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "Erro na reprodução de mídia Saimo" }, "*"); } catch(e) {}
      });

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
        if (d.type === "SEEK_RELATIVE" && v && typeof d.seconds === "number") {
          v.currentTime = v.currentTime + d.seconds;
        }
        if (d.type === "SKIP_INTRO" && v) {
          var secIntro = typeof d.seconds === "number" ? d.seconds : 75;
          v.currentTime = Math.max(0, Math.min(v.currentTime + secIntro, (v.duration || 99999) - 5));
        }
        if (d.type === "MUTE" && v) { v.muted = true; }
        if (d.type === "UNMUTE" && v) { v.muted = false; }
        if (d.type === "SET_VOLUME" && v && typeof d.volume === "number") {
          v.volume = Math.max(0, Math.min(1, d.volume));
          if (d.volume > 0) v.muted = false;
        }
        if (d.type === "SET_MUTED" && v) {
          v.muted = !!d.muted;
        }
        if (d.type === "SET_PLAYBACK_RATE" && v) {
          var rate = typeof d.rate === "number" ? d.rate : d.playbackRate;
          if (typeof rate === "number") v.playbackRate = rate;
        }
      });

      // Autoplay com fallback para muted se bloqueado pelo browser
      var playPromise = v.play();
      if (playPromise !== undefined) {
        playPromise.catch(function() {
          v.muted = true;
          v.play().catch(function() {});
        });
      }
    })();
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

/**
 * GET /api/saimo-stream
 * Proxy de streaming do Saimo TV com suporte a Range requests (206 Partial Content).
 */
saimoRouter.get("/api/saimo-stream", async (req: Request, res: Response) => {
  const rawId = req.query.id;
  const type = String(req.query.type || "movie");
  const season = req.query.s !== undefined ? Number(req.query.s) : undefined;
  const episode = req.query.e !== undefined ? Number(req.query.e) : undefined;
  const audio = String(req.query.audio || "dub").toLowerCase();

  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).send("Invalid id");
  }

  const store = getSaimoStore();
  if (!store) {
    return res.status(503).send("Saimo catalog unavailable");
  }

  let candidates: string[] = [];
  if (type === "tv" && season !== undefined && episode !== undefined) {
    const ep = store.findEpisode(id, season, episode);
    if (!ep) return res.status(404).send("Episode not found");
    candidates = audio === "leg" ? (ep.servers?.saimo_leg || []) : (ep.servers?.saimo_dub || []);
    if (!candidates.length) {
      candidates = [...(ep.servers?.saimo_dub || []), ...(ep.servers?.saimo_leg || [])];
    }
  } else {
    const movie = store.findMovie(id);
    if (!movie) return res.status(404).send("Movie not found");
    candidates = audio === "leg" ? (movie.servers?.saimo_leg || []) : (movie.servers?.saimo_dub || []);
    if (!candidates.length) {
      candidates = [...(movie.servers?.saimo_dub || []), ...(movie.servers?.saimo_leg || [])];
    }
  }

  if (!candidates.length) {
    return res.status(404).send("No stream sources available");
  }

  // Priorização: URLs MP4 diretas antes de redirects /api/stream; descarta .invalid, manifestos .txt/.m3u8 puros e hosts na blacklist
  const allowedCandidates = candidates.filter((url) => url && !url.includes("desativado.invalid") && !isServerBlacklisted(url));
  const validCandidates = allowedCandidates.filter((url) => !/\.txt(\?|$)/i.test(url) && !/\.m3u8(\?|$)/i.test(url));
  const finalCandidates = (validCandidates.length > 0 ? validCandidates : allowedCandidates).sort((a, b) => {
    const aDirect = /\.mp4(\?|$)/i.test(a) ? 0 : 1;
    const bDirect = /\.mp4(\?|$)/i.test(b) ? 0 : 1;
    return aDirect - bDirect;
  });

  const clientAborted = new AbortController();
  req.once("close", () => {
    clientAborted.abort();
  });

  // Tenta as fontes em ordem de prioridade
  for (const streamUrl of finalCandidates) {
    if (clientAborted.signal.aborted) break;

    const isDirectMp4 = /\.mp4(\?|$)/i.test(streamUrl);
    const timeoutCtrl = new AbortController();
    const timer = setTimeout(() => timeoutCtrl.abort(), isDirectMp4 ? 8000 : 4000);

    const onAbort = () => timeoutCtrl.abort();
    clientAborted.signal.addEventListener("abort", onAbort, { once: true });

    try {
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      };
      if (req.headers.range) {
        headers["Range"] = req.headers.range;
      }

      const upstreamRes = await fetch(streamUrl, {
        headers,
        redirect: "follow",
        signal: timeoutCtrl.signal,
      });

      clearTimeout(timer);
      clientAborted.signal.removeEventListener("abort", onAbort);

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        continue;
      }

      const contentType = upstreamRes.headers.get("content-type") || "";
      // Se upstream retornou página HTML de erro ou texto simples, tenta a próxima fonte
      if (contentType.includes("text/html") || contentType.includes("text/plain")) {
        continue;
      }

      // Encaminha headers essenciais de streaming de vídeo
      res.status(upstreamRes.status);
      res.setHeader("Content-Type", contentType || "video/mp4");
      res.setHeader("Accept-Ranges", "bytes");

      const cl = upstreamRes.headers.get("content-length");
      if (cl) res.setHeader("Content-Length", cl);

      const cr = upstreamRes.headers.get("content-range");
      if (cr) res.setHeader("Content-Range", cr);

      res.setHeader("Access-Control-Allow-Origin", "*");

      if (upstreamRes.body) {
        const bodyAny = upstreamRes.body as any;
        const nodeStream: any = typeof bodyAny.pipe === "function"
          ? bodyAny
          : Readable.fromWeb(upstreamRes.body as any);

        if (req.destroyed) {
          try { if (typeof nodeStream.destroy === "function") nodeStream.destroy(); } catch {}
          return;
        }

        if (typeof nodeStream.on === "function") {
          nodeStream.on("error", () => {
            try { res.destroy(); } catch {}
          });
        }

        nodeStream.pipe(res);
        req.on("close", () => {
          try {
            if (typeof nodeStream.destroy === "function") nodeStream.destroy();
          } catch {}
        });
        return;
      }
    } catch (e: any) {
      clearTimeout(timer);
      clientAborted.signal.removeEventListener("abort", onAbort);
      if (clientAborted.signal.aborted) return;
      console.warn(`[saimo-stream] Falha ao conectar em ${streamUrl}:`, e?.message || e);
    }
  }

  if (!res.headersSent) {
    res.status(502).send("Unable to play stream from Saimo servers");
  }
});
