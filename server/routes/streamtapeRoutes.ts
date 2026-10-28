import { Router, Request, Response } from "express";
import { proxyStreamtapeMedia } from "../services/streamtapeMediaProxy";
import { createStreamtapeRecovery } from "../services/streamtapeRecovery";
import { createStreamtapeResolver } from "../services/streamtapeResolver";
import { createStreamtapeSourcePool } from "../services/streamtapeSources";
import { getStreamtapeSources } from "./encontreiLookup";

export const streamtapeRouter = Router();

const tokenResolver = createStreamtapeResolver();
const directUrlToFileId = new Map<string, string>();
async function resolveStreamTapeDetails(fileId: string, refresh = false) {
  const result = await tokenResolver.resolve(fileId, refresh);
  if (result.directUrl) {
    if (directUrlToFileId.size >= 1000) directUrlToFileId.delete(directUrlToFileId.keys().next().value!);
    directUrlToFileId.set(result.directUrl, fileId);
  } else if (result.failure) {
    // Never log signed URLs, upstream HTML, cookies or raw exception messages.
    console.warn('[StreamTape Resolver]', JSON.stringify({ fileId, ...result.failure }));
  }
  return result;
}

const sourcePool = createStreamtapeSourcePool({ resolve: (fileId, refresh) => resolveStreamTapeToken(fileId, refresh) });
function readIdentity(req: Request) {
  const raw = req.query.tmdbId || req.query.id;
  if (!raw) return null;
  const id = Number(raw), season = req.query.s ? Number(req.query.s) : undefined,
    episode = req.query.e ? Number(req.query.e) : undefined;
  if (!Number.isInteger(id) || id < 1 || id > 9999999999 ||
      (season === undefined) !== (episode === undefined) ||
      (season !== undefined && (!Number.isInteger(season) || season < 1 || season > 999)) ||
      (episode !== undefined && (!Number.isInteger(episode) || episode < 1 || episode > 9999))) throw new Error('invalid_identity');
  return { id, season, episode, name: String(req.query.name || '').slice(0, 160) };
}
async function selectIdentitySource(identity: NonNullable<ReturnType<typeof readIdentity>>, exclude: string[] = []) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = (async () => {
    const sources = await getStreamtapeSources(identity.id, identity.season, identity.episode, identity.name);
    const selected = await sourcePool.select(sources, exclude);
    if (selected) return selected;
    // A removed/replaced file may still be present in a local snapshot. Refresh
    // both exact catalogue lookups once before leaving this provider.
    return sourcePool.select(await getStreamtapeSources(identity.id, identity.season, identity.episode, identity.name, true), exclude);
  })();
  try { return await Promise.race([work, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 18000); })]); }
  finally { clearTimeout(timer); }
}
const safeScriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/** Shared, bounded resolution used by the iframe and media-token renewal. */
export async function resolveStreamTapeToken(fileId: string, refresh = false): Promise<string | null> {
  return (await resolveStreamTapeDetails(fileId, refresh)).directUrl;
}

/**
 * GET /api/streamtape-resolve
 * Resolve a URL final do MP4 do StreamTape
 */
streamtapeRouter.get("/api/streamtape-resolve", async (req: Request, res: Response) => {
  try {
    let fileId = String(req.query.fileId || "").trim();
    const identity = readIdentity(req);
    res.setHeader("Cache-Control", "no-store");
    let directUrl: string | null = null, source = 'direct';
    if (identity) {
      const exclude = String(req.query.exclude || '').split(',').filter(Boolean).slice(0, 4);
      if (exclude.some(value => !/^[a-zA-Z0-9_-]{1,100}$/.test(value))) return res.status(400).json({ success: false, error: 'Arquivo inválido' });
      const selected = await selectIdentitySource(identity, exclude);
      if (!selected) return res.status(502).json({ success: false, error: 'Nenhuma fonte StreamTape verificada para este conteúdo.', diagnostic: { stage: 'sources', code: 'no_verified_source' } });
      fileId = selected.fileId; directUrl = selected.directUrl; source = selected.source;
    } else {
      if (!fileId) return res.status(404).json({ success: false, error: 'File ID do StreamTape não encontrado para este conteúdo.' });
      const resolution = await resolveStreamTapeDetails(fileId, req.query.refresh === "1");
      directUrl = resolution.directUrl;
      if (!directUrl) return res.status(502).json({ success: false, error: 'Não foi possível resolver o vídeo do StreamTape.', diagnostic: resolution.failure });
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      source,
      fileId,
      directUrl,
      proxyUrl: `/api/streamtape-stream?url=${encodeURIComponent(directUrl)}&fileId=${encodeURIComponent(fileId)}`
    });
  } catch (err: any) {
    res.status(err?.message === 'invalid_identity' ? 400 : 500).json({ success: false, error: 'Não foi possível consultar este conteúdo.' });
  }
});

/**
 * GET /api/streamtape-stream
 * Proxy resiliente de streaming para CDNs do StreamTape (suporte a Range HTTP 206 e Auto-Healer)
 */
streamtapeRouter.get("/api/streamtape-stream", async (req: Request, res: Response) => {
  const url = String(req.query.url || "").trim();
  const fileId = String(req.query.fileId || directUrlToFileId.get(url) || "").trim();
  const release = sourcePool.begin(fileId);
  res.once('close', release); res.once('finish', release);
  await proxyStreamtapeMedia(req, res, {
    url, fileId, refresh: id => resolveStreamTapeToken(id, true),
    observe: (ok, latencyMs) => sourcePool.report(fileId, ok, latencyMs),
  });
});

/**
 * GET /api/streamtape-proxy-iframe
 * HTML wrapper com <video> nativo e protocolo postMessage WATCHPLAY_STATUS para a NetflixPlayerSkin
 */
streamtapeRouter.get("/api/streamtape-proxy-iframe", async (req: Request, res: Response) => {
  try {
    const identity = readIdentity(req);
    let fileId = String(req.query.fileId || '').trim();
    const initialTime = Math.max(0, Number(req.query.t) || 0);
    let directUrl: string | null = null;
    if (identity) {
      // Do not trust a stale client fileId from the previous episode: candidates
      // must come from the exact current movie/season/episode in both catalogues.
      const selected = await selectIdentitySource(identity);
      if (selected) { fileId = selected.fileId; directUrl = selected.directUrl; }
    } else if (fileId) {
      directUrl = await resolveStreamTapeToken(fileId);
    }

    if (!directUrl) {
      return res.status(502).send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
        <body>
          <div style="text-align:center;"><h2>Vídeo Indisponível</h2><p>Não foi possível iniciar este vídeo no StreamTape.</p></div>
          <script>
            try {
              if (window.parent !== window) {
                window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "StreamTape: Não foi possível iniciar este vídeo", streamtapeExhausted: true }, "*");
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
            paused: !!v.paused, buffering: (v.readyState < 2 && !(v.duration > 0) && !(v.currentTime > 0)) || (v.readyState < 3 && !v.paused),
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

      // Retry even when the first media request fails before any playback.
      var recovery = (${createStreamtapeRecovery.toString()})(v, {
        fileId: ${safeScriptJson(fileId)},
        context: ${safeScriptJson(identity)},
        getTime: function() { return v.currentTime || initialSeek || 0; },
        onFatal: function(reason) {
          try { window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: reason, streamtapeExhausted: true }, "*"); } catch(e) {}
        }
      });

      // Receptor de comandos da NetflixPlayerSkin
      window.addEventListener("message", function(event) {
        if (!event.data) return;
        var d = event.data;
        if (d.type === "PAUSE" && v) { recovery.setPaused(true); v.pause(); }
        if (d.type === "PLAY" && v) { recovery.setPaused(false); v.play().catch(function(err){ if(err && err.name === "NotAllowedError") { v.muted = true; v.play().catch(function(){}); } }); }
        if (d.type === "SEEK" && v && typeof d.targetTime === "number") {
          recovery.seek(d.targetTime);
          if (v.readyState >= 1) {
            v.currentTime = d.targetTime;
          } else {
            initialSeek = d.targetTime;
          }
        }
        if (d.type === "SEEK_ABSOLUTE" && v && typeof d.time === "number") {
          recovery.seek(d.time);
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
