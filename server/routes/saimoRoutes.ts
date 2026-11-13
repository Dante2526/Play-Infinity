import { Router, Request, Response } from "express";
import { Readable } from "node:stream";
import { getSaimoStore } from "../services/saimoSqliteStore";
import { buildSilentPlayerErrorPage } from "../services/playerErrorPage";
import { isServerBlacklisted } from "../../src/data/serverBlacklist";
import { isPrivateOrLocalHost, signProxyUrl, verifyProxySignature } from "../utils/helpers";
import { RedirectBlockedError, fetchWithValidatedRedirects, readTextWithCap } from "../utils/httpSecurity";

export const saimoRouter = Router();

// Servidores upstream desativados catalogados pelo Saimo TV (fontes-desativadas.json)
const SAIMO_DISABLED_HOSTS = new Set([
  "146.0.32.89",
  "16-5-0-235.sslip.io",
  "168.197.104.22",
  "332nr7hbfu.xyz",
  "52d080a3e172c33fd6886a37e7288491.s23-cloudfront-net.lat",
  "5c65286fc6ace.streamlock.net",
  "86eb89e9b94c94323705944a729cf618.s25-cloudfront-net.lat",
  "aws.s13-s1001604.lat",
  "cdn-s01.pixel-sus-4k-image.com",
  "cdn99xn-n-n-n-n-n-n-n-n-n-n-booster.carloseduardocostadelima45.workers.dev",
  "cdn99xn-n-n-n-n-n-n-n-n-n-n-booster.migueldokpa.workers.dev",
  "cnn.radiogaucha.fun",
  "cold-cliff-c5f9.p2klskwfngp4.workers.dev",
  "dbcd70beab56963578d70df985879ec7.s25-cloudfront-net.lat",
  "de0d6aa7bdb37f9e0728cdc87ce80833.s25-cloudfront-net.lat",
  "ogc-nsprt-tcl-roku-syndication.otteravision.com",
  "origin-07.nxplay.com.br",
  "pub-fac5f8b51cf64a4d9f11005cbc9792d1.r2.dev",
  "snowy-field-4b38.p2klskwfngp4.workers.dev",
  "solitary-field-9699.playercdnx.workers.dev",
  "solitary-shadow-c1e4.p2klskwfngp4.workers.dev",
  "sparkling-rain-bf1d.p2klskwfngp4.workers.dev",
  "sparkling-snow-d4c3.p2klskwfngp4.workers.dev",
  "sparkling-star-e4a9.p2klskwfngp4.workers.dev",
  "speed2.megafilmeshd9.com",
  "stmv1.video.brstream.com.br",
  "tvonhdbr.com",
  "twilight-leaf-d31b.p2klskwfngp4.workers.dev",
  "v-us-01.wisestream.io",
  "vaiagora.vip",
  "vaiquecol.com",
  "vivlar.me",
  "vods06.trendtopbr.org",
  "xn--l---------------------------_________________________-2w85c.null-null.shop",
]);

function isSaimoUrlAllowed(url: string): boolean {
  if (!url || url.includes("desativado.invalid") || isServerBlacklisted(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (SAIMO_DISABLED_HOSTS.has(host)) return false;
    for (const d of SAIMO_DISABLED_HOSTS) {
      if (host.endsWith("." + d)) return false;
    }
  } catch {
    return false;
  }
  return true;
}

/**
 * Fonte HLS do catálogo Saimo: master.txt (FirePlayer — embedplayer2.xyz)
 * ou .m3u8. Tudo o mais é tratado como progressivo (MP4 direto).
 * Os manifestos FirePlayer declaram múltiplos níveis de qualidade
 * (360p/720p — ABR) e faixas de áudio/legenda por idioma.
 */
function isHlsSourceUrl(u: string): boolean {
  return /(\.m3u8|\.txt)(\?|$)/i.test(u) || u.includes("embedplayer2.xyz");
}

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
    const hasDub = Array.isArray(ep.servers?.saimo_dub) && ep.servers.saimo_dub.some(isSaimoUrlAllowed);
    const hasLeg = Array.isArray(ep.servers?.saimo_leg) && ep.servers.saimo_leg.some(isSaimoUrlAllowed);
    return res.json({
      available: hasDub || hasLeg,
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
    const hasDub = Array.isArray(movie.servers?.saimo_dub) && movie.servers.saimo_dub.some(isSaimoUrlAllowed);
    const hasLeg = Array.isArray(movie.servers?.saimo_leg) && movie.servers.saimo_leg.some(isSaimoUrlAllowed);
    return res.json({
      available: hasDub || hasLeg,
      title: movie.title,
      year: movie.year,
      dub: hasDub,
      leg: hasLeg,
    });
  }
});

/**
 * Reescreve uma playlist HLS do Saimo pro proxy de segmento — URIs de
 * áudio/legenda (EXT-X-MEDIA) e linhas de segmento viram
 * /api/saimo-hls-segment?url=<absoluto>&referer=<referer>&sig=<hmac>.
 * A assinatura (mesmo padrão do /api/live-stream-proxy) garante que só
 * URLs que NÓS reescrevemos são aceitas pelo proxy de segmento — o endpoint
 * deixa de ser um proxy aberto de hosts públicos arbitrários.
 */
function rewriteHlsPlaylist(text: string, sourceUrl: string, referer: string): string {
  const basePath = sourceUrl.substring(0, sourceUrl.lastIndexOf("/") + 1);
  const proxyUrl = (absoluteUrl: string): string => {
    const sig = signProxyUrl(absoluteUrl);
    return `/api/saimo-hls-segment?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer)}&sig=${sig}`;
  };
  return text.split("\n").map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.includes('URI="')) {
      return trimmed.replace(/URI="([^"]+)"/, (_, uri) => {
        const fullUri = uri.startsWith("http") ? uri : new URL(uri, basePath).toString();
        return `URI="${proxyUrl(fullUri)}"`;
      });
    }
    if (trimmed.startsWith("#")) return trimmed;
    const fullSegUrl = trimmed.startsWith("http") ? trimmed : new URL(trimmed, basePath).toString();
    return proxyUrl(fullSegUrl);
  }).join("\n");
}

/**
 * GET /api/saimo-hls-segment
 * Proxy para segmentos de vídeo (.ts, .js, .css) ou sub-playlists HLS com Referer adequado.
 *
 * As sub-playlists do FirePlayer (embedplayer2.xyz/m3/<base64>) vêm SEM
 * extensão e com content-type text/plain — por isso a detecção de playlist
 * lê o prefixo do buffer e confirma #EXTM3U no conteúdo (a extensão/CT só
 * servem de hint pra decidir se vale a pena inspecionar). Binários nunca
 * passam pelo caminho de texto: o que não é playlist é servido byte a byte
 * do MESMO buffer (corrige o bug do body consumido por text() quando o
 * upstream devolvia página de erro em URL .txt).
 */
export async function handleSaimoHlsSegment(req: Request, res: Response): Promise<void | Response> {
  const targetUrl = String(req.query.url || "");
  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).send("URL inválida");
  }

  // Só URLs que saíram do nosso rewrite de playlist (assinadas com o
  // PROXY_SECRET) são aceitas — fecha o uso como proxy aberto de hosts
  // públicos arbitrários. Mesmo padrão do /api/live-stream-proxy.
  const sig = String(req.query.sig || "");
  if (!sig || !verifyProxySignature(targetUrl, sig)) {
    return res.status(403).send("Assinatura inválida");
  }

  if (!isSaimoUrlAllowed(targetUrl)) {
    return res.status(403).send("Host não permitido");
  }

  try {
    const parsedHost = new URL(targetUrl).hostname;
    if (await isPrivateOrLocalHost(parsedHost)) {
      return res.status(403).send("Host privado não permitido");
    }
  } catch {
    return res.status(400).send("URL inválida");
  }

  const referer = String(req.query.referer || (targetUrl.includes("embedplayer2.xyz") ? "https://embedplayer2.xyz/" : ""));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  req.once("close", () => controller.abort());

  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
    if (referer) {
      headers["Referer"] = referer;
      try { headers["Origin"] = new URL(referer).origin; } catch {}
    }

    const upstream = await fetchWithValidatedRedirects(targetUrl, {
      headers,
      signal: controller.signal,
      maxRedirects: 4,
      checkPrivateHost: isPrivateOrLocalHost,
      validateUrl: (u) => isSaimoUrlAllowed(u.toString()),
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream HTTP ${upstream.status}`);
    }

    const contentType = upstream.headers.get("content-type") || "";
    const contentLen = Number(upstream.headers.get("content-length") || "0");
    // Playlist? Hint por extensão/CT — o FirePlayer serve sub-playlists
    // (/m3/<base64>) como text/plain SEM extensão, então text/plain entra.
    // A prova final é o conteúdo (#EXTM3U) lido do buffer.
    const maybePlaylist = (
      targetUrl.includes(".m3u8") ||
      targetUrl.includes(".txt") ||
      contentType.includes("mpegurl") ||
      contentType.includes("text/plain")
    ) && (!Number.isFinite(contentLen) || contentLen <= 4 * 1024 * 1024);
    if (maybePlaylist) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      const head = buf.subarray(0, 512).toString("utf-8").trimStart();
      if (head.startsWith("#EXTM3U")) {
        const text = buf.toString("utf-8");
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        const effectiveUrl = upstream.url || targetUrl;
        const rewritten = rewriteHlsPlaylist(text, effectiveUrl, referer);
        return res.send(rewritten);
      }
      // Não é playlist (página de erro, binário com CT textual...) — serve
      // os bytes EXATOS do buffer: nunca cai no pipe com body já consumido.
      res.status(upstream.status);
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.end(buf);
    }

    // Segmento binário de vídeo/áudio
    res.status(upstream.status);
    res.setHeader("Content-Type", contentType || "video/MP2T");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=3600");

    if (upstream.body) {
      const bodyAny = upstream.body as any;
      const nodeStream = typeof bodyAny.pipe === "function" ? bodyAny : Readable.fromWeb(upstream.body as any);
      nodeStream.pipe(res);
      req.on("close", () => {
        try { if (typeof nodeStream.destroy === "function") nodeStream.destroy(); } catch {}
      });
      return;
    }
  } catch (err: any) {
    clearTimeout(timer);
    if (err instanceof RedirectBlockedError) {
      if (!res.headersSent) {
        return res.status(err.statusCode).send(err.message);
      }
      return;
    }
    if (!res.headersSent) {
      res.status(502).send("Segment fetch error");
    }
  }
}
saimoRouter.get("/api/saimo-hls-segment", handleSaimoHlsSegment);

/**
 * GET /api/saimo-proxy-iframe
 * HTML wrapper com suporte a <video> nativo e hls.js com protocolo postMessage WATCHPLAY_STATUS para a NetflixPlayerSkin.
 *
 * ?prefer=hls (default) — usa hls.js quando o título tem fontes HLS no
 *   catálogo: ABR (troca de qualidade sozinho quando a rede oscila),
 *   multi-áudio e legendas embutidas dos manifestos FirePlayer.
 * ?prefer=mp4 — MP4 progressivo direto (início rápido, seek instantâneo);
 *   HLS só quando o título não tem nenhuma fonte MP4.
 */
export function handleSaimoProxyIframe(req: Request, res: Response): void | Response {
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
    return res.status(404).send(buildSilentPlayerErrorPage({
      reason: "Saimo Play: Conteúdo não encontrado no catálogo",
      exhaustedKey: "saimoExhausted",
    }));
  }

  let candidates: string[] = audio === "leg" ? (item.servers?.saimo_leg || []) : (item.servers?.saimo_dub || []);
  if (!candidates.length) {
    candidates = [...(item.servers?.saimo_dub || []), ...(item.servers?.saimo_leg || [])];
  }
  const allowed = candidates.filter(isSaimoUrlAllowed);
  if (!allowed.length) {
    return res.status(404).send(buildSilentPlayerErrorPage({
      reason: "Saimo Play: Todas as fontes desativadas",
      exhaustedKey: "saimoExhausted",
    }));
  }

  // ── Protocolo do playback ──
  // (a) HLS é o DEFAULT: manifestos FirePlayer do Saimo têm ABR (360p/720p
  //     escolhidos pela banda do aparelho), faixas de áudio por idioma e
  //     legendas embutidas — o MP4 progressivo não tem nada disso.
  // (b) prefer=mp4: o usuário escolheu início rápido — MP4 direto, HLS só
  //     se o título não tem NENHUMA fonte MP4.
  // A decisão aqui precisa ser consistente com a ordenação do
  // /api/saimo-stream (mesmo critério isHlsSourceUrl), e o prefer é
  // repassado na URL do stream para alinhar os dois lados.
  const preferParam = String(req.query.prefer || "hls").toLowerCase() === "mp4" ? "mp4" : "hls";
  const hlsSources = allowed.filter(isHlsSourceUrl);
  const mp4Sources = allowed.filter(u => !isHlsSourceUrl(u));
  const useHls = preferParam === "mp4" ? mp4Sources.length === 0 : hlsSources.length > 0;
  const isHlsCandidate = useHls;

  const streamParams = new URLSearchParams({ id: String(id), type, audio, prefer: useHls ? "hls" : "mp4" });
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
    <video id="video" playsinline webkit-playsinline></video>
  </div>
  <script src="/api/byse-hls.js"><\/script>
  <script>
    (function() {
      var v = document.getElementById("video");
      var streamUrl = "${streamUrl}";
      var audioParam = "${audio}";
      var initialSeek = ${initialTime};
      var isHls = ${isHlsCandidate ? "true" : "false"};
      /* Escada de retry: cada modo (hls.js / <video> nativo) é tentado uma
         vez. O /api/saimo-stream ordena as fontes pelo prefer, mas pode
         cair na outra família se as preferidas morrerem — os retries
         abaixo trocam o protocolo UMA vez antes de reportar fatal. */
      var triedHls = isHls;
      var triedNative = !isHls;
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
            saimoExhausted: true,
            reason: reason || "Saimo Play: erro fatal na reprodução"
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

      /* Faixas de áudio/legenda por idioma: os manifestos FirePlayer do
         Saimo declaram audio eng/por (+ legendas por). dub → áudio
         português; leg → áudio original + legenda PT. */
      function pickTracks() {
        if (!hls) return;
        try {
          var wantAudio = audioParam === "leg" ? "en" : "pt";
          var at = hls.audioTracks || [];
          if (at.length > 1) {
            for (var i = 0; i < at.length; i++) {
              var l = String(at[i].lang || "").toLowerCase();
              if (l === wantAudio || l.indexOf(wantAudio) === 0) {
                if (hls.audioTrack !== i) hls.audioTrack = i;
                break;
              }
            }
          }
          if (audioParam === "leg") {
            var st = hls.subtitleTracks || [];
            for (var j = 0; j < st.length; j++) {
              var sl = String(st[j].lang || "").toLowerCase();
              if (sl === "pt" || sl.indexOf("pt") === 0) {
                hls.subtitleTrack = j;
                break;
              }
            }
          }
        } catch(e) {}
      }

      function swapPrefer(url, want) {
        return url.replace(/([?&]prefer=)(hls|mp4)/i, "$1" + want);
      }

      function startHls() {
        if (hls) return;
        hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: true,
          manifestLoadingTimeOut: 8000,
          levelLoadingTimeOut: 8000,
          fragLoadingTimeOut: 12000
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(v);
        hls.on(window.Hls.Events.MANIFEST_PARSED, function() {
          pickTracks();
          autoPlay();
        });
        hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, function() { pickTracks(); });
        hls.on(window.Hls.Events.ERROR, function(event, data) {
          if (!data || !data.fatal) return;
          var details = data.details || "";
          /* Manifesto inválido/MP4 entregue: o servidor caiu numa fonte MP4
             (HLS morto) — hls.js não parseia MP4. Tenta o modo nativo com
             prefer=mp4 UMA vez antes de desistir. */
          if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && /manifest/i.test(details) && !triedNative) {
            triedNative = true;
            try { hls.destroy(); } catch(e) {} hls = null;
            streamUrl = swapPrefer(streamUrl, "mp4");
            v.src = streamUrl;
            v.load();
            autoPlay();
            return;
          }
          switch (data.type) {
            case window.Hls.ErrorTypes.NETWORK_ERROR:
              reportFatal("HLS rede: " + details);
              break;
            case window.Hls.ErrorTypes.MEDIA_ERROR:
              try { hls.recoverMediaError(); } catch(e) { reportFatal("HLS mídia fatal: " + details); }
              break;
            default:
              reportFatal("HLS fatal: " + details);
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
            buffering: (v.readyState < 2 && !(v.duration > 0) && !(v.currentTime > 0)) || (v.readyState < 3 && !v.paused),
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
      v.addEventListener("error", function() {
        /* Reset programático (removeAttribute+load) não é erro real de rede */
        if (!v.currentSrc) return;
        /* Erros de mídia com hls.js/MSE acoplado são tratados pelo
           recoverMediaError do hls.js — não derruba o playback aqui. */
        if (hls) return;
        /* Fonte direta falhou: o servidor pode ter caído num HLS (todas as
           MP4 mortas — o <video> nativo não toca m3u8 fora do Safari).
           Tenta hls.js com prefer=hls UMA vez antes de reportar fatal. */
        if (!triedHls && window.Hls && window.Hls.isSupported()) {
          triedHls = true;
          try { v.removeAttribute("src"); v.load(); } catch(e) {}
          streamUrl = swapPrefer(streamUrl, "hls");
          startHls();
          return;
        }
        reportFatal("Erro no elemento <video>");
      });

      // Inicialização: HLS com hls.js ou MP4 direto com video.src
      if (isHls && window.Hls && window.Hls.isSupported()) {
        try {
          startHls();
        } catch(err) {
          v.src = streamUrl;
          v.load();
          autoPlay();
        }
      } else {
        v.src = streamUrl;
        v.load();
        autoPlay();
      }

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
          var secIntro = typeof d.seconds === "number" ? d.seconds : 45;
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
    })();
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}
saimoRouter.get("/api/saimo-proxy-iframe", handleSaimoProxyIframe);

/**
 * GET /api/saimo-stream
 * Proxy de streaming do Saimo TV com suporte a Range requests (206 Partial Content) para MP4 e reescrita de playlists HLS.
 *
 * ?prefer=hls (default) — fontes HLS primeiro: os manifestos FirePlayer
 *   trazem ABR (a qualidade troca sozinha quando a rede oscila),
 *   multi-áudio e legendas embutidas.
 * ?prefer=mp4 — MP4 progressivo primeiro (início rápido, seek instantâneo).
 * Sem prefer — HLS primeiro (mesmo default do iframe).
 * A ordenação é só de PRIORIDADE: se as fontes preferidas morrerem, o loop
 * cai naturalmente na outra família (o iframe tem a escada de retry que
 * troca o protocolo do lado do player quando isso acontece).
 */
export async function handleSaimoStream(req: Request, res: Response): Promise<void | Response> {
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

  const allowedCandidates = candidates.filter(isSaimoUrlAllowed);
  if (!allowedCandidates.length) {
    return res.status(404).send("No stream sources available");
  }

  // (a) HLS antes de MP4 por padrão: ABR + multi-áudio + legendas dos
  // manifestos FirePlayer. prefer=mp4 inverte (início rápido / seek direto).
  const prefer = String(req.query.prefer || "").toLowerCase() === "mp4" ? "mp4" : "hls";
  const protoScore = (u: string): number => {
    const isHls = isHlsSourceUrl(u);
    return isHls ? (prefer === "mp4" ? 1 : 0) : (prefer === "mp4" ? 0 : 1);
  };
  const finalCandidates = [...allowedCandidates].sort((a, b) => protoScore(a) - protoScore(b));

  const clientAborted = new AbortController();
  req.once("close", () => {
    clientAborted.abort();
  });

  // Tenta as fontes em ordem de prioridade
  for (const streamUrl of finalCandidates) {
    if (clientAborted.signal.aborted) break;

    try {
      const parsedHost = new URL(streamUrl).hostname;
      if (await isPrivateOrLocalHost(parsedHost)) continue;
    } catch {
      continue;
    }

    const isDirectMp4 = /\.mp4(\?|$)/i.test(streamUrl);
    const timeoutCtrl = new AbortController();
    const timer = setTimeout(() => timeoutCtrl.abort(), isDirectMp4 ? 8000 : 4000);

    const onAbort = () => timeoutCtrl.abort();
    clientAborted.signal.addEventListener("abort", onAbort, { once: true });

    try {
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      };
      if (streamUrl.includes("embedplayer2.xyz")) {
        headers["Referer"] = "https://embedplayer2.xyz/";
        headers["Origin"] = "https://embedplayer2.xyz";
      }
      if (req.headers.range) {
        headers["Range"] = req.headers.range;
      }

      const upstreamRes = await fetchWithValidatedRedirects(streamUrl, {
        headers,
        signal: timeoutCtrl.signal,
        maxRedirects: 4,
        checkPrivateHost: isPrivateOrLocalHost,
        validateUrl: (u) => isSaimoUrlAllowed(u.toString()),
      });

      clearTimeout(timer);
      clientAborted.signal.removeEventListener("abort", onAbort);

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        continue;
      }

      const contentType = upstreamRes.headers.get("content-type") || "";

      // Verifica se é manifesto HLS (.m3u8 ou .txt começando com #EXTM3U)
      const isHlsUrl = isHlsSourceUrl(streamUrl);
      const contentLen = Number(upstreamRes.headers.get("content-length") || "0");
      const withinTextLimit = !Number.isFinite(contentLen) || contentLen <= 2 * 1024 * 1024;
      if (withinTextLimit && (isHlsUrl || contentType.includes("mpegurl") || contentType.includes("text/plain"))) {
        const { text, exceeded } = await readTextWithCap(upstreamRes, 2 * 1024 * 1024);
        if (exceeded) {
          continue;
        }
        const trimmed = text.trimStart();
        // Se for HTML de erro (404, nginx, etc) ou security error
        if (trimmed.startsWith("<") || trimmed.includes("security error") || !trimmed.startsWith("#EXTM3U")) {
          continue;
        }

        // Manifesto HLS válido! Reescreve URLs para o proxy de segmento do Saimo
        // (rewriteHlsPlaylist também registra hosts dinâmicos de segmento no
        // allowlist — CDNs FirePlayer tipo cincloud1.xyz).
        const effectiveStreamUrl = upstreamRes.url || streamUrl;
        const referer = effectiveStreamUrl.includes("embedplayer2.xyz") ? "https://embedplayer2.xyz/" : effectiveStreamUrl;
        const rewritten = rewriteHlsPlaylist(text, effectiveStreamUrl, referer);

        res.status(200);
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "no-cache");
        return res.send(rewritten);
      }

      // Se upstream retornou página HTML de erro, tenta a próxima fonte
      if (contentType.includes("text/html")) {
        continue;
      }

      // Encaminha headers essenciais de streaming de vídeo MP4
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
    res.status(404).send("Stream not found in Saimo servers");
  }
}
saimoRouter.get("/api/saimo-stream", handleSaimoStream);
