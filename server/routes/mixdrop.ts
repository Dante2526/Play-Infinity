import { Router } from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import { isPrivateOrLocalIp, isPrivateOrLocalHost, validateSafeUrl } from "../utils/helpers";

const mixdropMemoryCache = new Map<string, { videoUrl: string; posterUrl: string; title: string; expiresAt: number }>();

async function resolveFreshMixdropToken(fileId: string, host: string = "mxdrop.top"): Promise<{ videoUrl: string; posterUrl: string; title: string } | null> {
  const embedUrl = `https://${host}/e/${fileId}`;
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
    const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\}\)\)/);
    if (!packerMatch) return null;

    const unpacked = new Function("return " + packerMatch[0].slice(4))() as string;
    const wurlMatch = unpacked.match(/MDCore\.wurl\s*=\s*['"]([^'"]+)['"]/);
    if (!wurlMatch || !wurlMatch[1]) return null;

    let videoUrl = wurlMatch[1];
    if (videoUrl.startsWith("//")) videoUrl = "https:" + videoUrl;

    const posterMatch = unpacked.match(/MDCore\.poster\s*=\s*['"]([^'"]+)['"]/);
    const titleMatch = html.match(/<title>MixDrop - Watch ([^<]+)<\/title>/i);
    let posterUrl = posterMatch && posterMatch[1] ? posterMatch[1] : "";
    if (posterUrl.startsWith("//")) posterUrl = "https:" + posterUrl;
    let pageTitle = titleMatch && titleMatch[1] ? titleMatch[1].trim() : "Play Infinity • MixDrop Stream";

    const result = { videoUrl, posterUrl, title: pageTitle };
    mixdropMemoryCache.set(fileId, {
      ...result,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutos (tokens do MixDrop expiram rapidamente)
    });

    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

const router = Router();

  router.get("/api/md-stream", async (req, res) => {
    try {
      const rawUrl = String(req.query.url || "").trim();
      if (!rawUrl) {
        return res.status(400).send("Parâmetro 'url' é obrigatório.");
      }

      const safeCheck = validateSafeUrl(rawUrl);
      if (!safeCheck.valid || !safeCheck.parsedUrl) {
        return res.status(400).send("URL inválida ou não autorizada.");
      }

      const host = safeCheck.parsedUrl.hostname.toLowerCase();
      const isMixdrop = host.includes("mixdrop.") || host.includes("mxdrop.");
      if (!isMixdrop) {
        return res.status(400).send("Domínio fornecido não pertence à rede MixDrop.");
      }

      const sendFallbackHtml = (statusCode: number, message: string) => {
        return res.status(statusCode).send(`
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;text-align:center;">
            <script>
              console.error("[MixDrop] Erro:", "${message}");
              if (window.parent !== window) {
                window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "${message}" }, "*");
              }
            </script>
            <div>${message}</div>
          </body>
          </html>
        `);
      };

      const fileMatch = safeCheck.parsedUrl.pathname.match(/\/(?:f|e)\/([a-zA-Z0-9_-]+)/);
      const fileId = fileMatch ? fileMatch[1] : "";
      if (!fileId) {
        return res.status(400).send("ID de arquivo do MixDrop não encontrado.");
      }

      const cached = mixdropMemoryCache.get(fileId);
      let videoUrl = "";
      let posterUrl = "";
      let pageTitle = "Play Infinity • MixDrop Stream";

      if (cached && cached.expiresAt > Date.now() + 60000) {
        videoUrl = cached.videoUrl;
        posterUrl = cached.posterUrl;
        pageTitle = cached.title || pageTitle;
      } else {
        const fresh = await resolveFreshMixdropToken(fileId, host);
        if (!fresh) {
          return sendFallbackHtml(502, "Não foi possível desembalar os dados do player do MixDrop. Arquivo possivelmente deletado.");
        }
        videoUrl = fresh.videoUrl;
        posterUrl = fresh.posterUrl;
        pageTitle = fresh.title;
      }

      // Usa o PROXY — o token da CDN mxcontent.net é IP-locked (gerado pro IP do Render).
      // Se passar URL direta pro navegador do usuário, a CDN retorna 403 (IP diferente).
      // O proxy faz a request do MESMO IP que gerou o token (Render server), então funciona.
      const streamUrl = `/api/md-proxy?url=${encodeURIComponent(videoUrl)}`;

      if (req.query.format === 'json') {
        const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https';
        const originHost = req.headers.host;
        const fullProxyUrl = `${isHttps ? 'https' : 'http'}://${originHost}${streamUrl}`;
        return res.json({ videoUrl: fullProxyUrl });
      }

      return res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <meta name="referrer" content="no-referrer">
          <title>${pageTitle}</title>
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              background: #000;
              overflow: hidden;
            }
            #artplayer-container {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: #000;
            }
            video {
              object-fit: contain !important;
              width: 100% !important;
              height: 100% !important;
            }
            .art-mask,
            .art-top,
            .art-bottom,
            .art-controls,
            .art-controls-left,
            .art-controls-center,
            .art-controls-right,
            .art-state,
            .art-loading,
            .art-notice,
            .art-settings,
            .art-contextmenu,
            .art-progress,
            .btn, .button, [class*="ad"], [id*="ad"] {
              display: none !important;
              opacity: 0 !important;
              visibility: hidden !important;
              pointer-events: none !important;
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/artplayer@5.1.7/dist/artplayer.js"></script>
        </head>
        <body>
          <div id="artplayer-container"></div>
          <script>
            (function() {
              var videoUrl = ${JSON.stringify(streamUrl)};
              var posterUrl = ${JSON.stringify(posterUrl)};

              var art = new Artplayer({
                container: "#artplayer-container",
                url: videoUrl,
                type: "mp4",
                poster: posterUrl || "",
                autoplay: true,
                muted: false,
                playsInline: true,
                controls: [],
                theme: "#e50914",
                moreVideoAttr: {
                  preload: "auto",
                  playsinline: "true",
                  "webkit-playsinline": "true"
                }
              });

              window.artInstance = art;

              function sendStatus() {
                var v = art.video || document.querySelector("video");
                if (!v) return;
                var dur = v.duration || art.duration || 0;
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

              function notifyReady() {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_READY" }, "*");
                } catch(e) {}
                sendStatus();
              }

              function notifyEnded() {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
                } catch(e) {}
              }

              setInterval(sendStatus, 300);

              // Auto-Healer A/V Sync para MixDrop
              (function initAVSyncMixdrop() {
                var lastFrameCallbackTime = Date.now();
                var lastCheckedCurrentTime = 0;
                var lastTotalFrames = 0;
                var stallTicks = 0;
                var isHealing = false;
                var lastHealAt = 0;

                function trackFrameRender(v) {
                  if (!v) return;
                  if (typeof v.requestVideoFrameCallback === 'function' && !v._rvfcActive) {
                    v._rvfcActive = true;
                    function onFrame() {
                      lastFrameCallbackTime = Date.now();
                      if (v && !v.paused) {
                        v.requestVideoFrameCallback(onFrame);
                      } else if (v) {
                        v._rvfcActive = false;
                      }
                    }
                    try { v.requestVideoFrameCallback(onFrame); } catch(e) { v._rvfcActive = false; }
                  }
                }

                setInterval(function() {
                  var v = art.video || document.querySelector("video");
                  if (!v) return;
                  trackFrameRender(v);

                  if (v.paused || v.ended || v.seeking || v.readyState < 2) {
                    stallTicks = 0;
                    lastCheckedCurrentTime = v.currentTime || 0;
                    return;
                  }

                  var now = Date.now();
                  var cur = v.currentTime || 0;
                  var audioMoving = cur > (lastCheckedCurrentTime + 0.35);
                  lastCheckedCurrentTime = cur;

                  if (audioMoving) {
                    var frameFresh = false;
                    if (typeof v.requestVideoFrameCallback === 'function') {
                      if ((now - lastFrameCallbackTime) < 1800) frameFresh = true;
                    }
                    if (typeof v.getVideoPlaybackQuality === 'function') {
                      try {
                        var q = v.getVideoPlaybackQuality();
                        if (q && typeof q.totalVideoFrames === 'number') {
                          if (q.totalVideoFrames > lastTotalFrames) {
                            frameFresh = true;
                            lastTotalFrames = q.totalVideoFrames;
                          }
                        }
                      } catch(e) {}
                    }

                    var bufA = 0;
                    try {
                      for (var bi = 0; bi < v.buffered.length; bi++) {
                        if (cur >= v.buffered.start(bi) && cur <= v.buffered.end(bi)) {
                          bufA = v.buffered.end(bi) - cur;
                          break;
                        }
                      }
                    } catch(e) {}

                    if (!frameFresh && bufA >= 2.0 && (typeof v.requestVideoFrameCallback === 'function' || typeof v.getVideoPlaybackQuality === 'function')) {
                      stallTicks++;
                      if (stallTicks >= 4 && (now - lastHealAt > 5000) && !isHealing) {
                        isHealing = true;
                        lastHealAt = now;
                        stallTicks = 0;
                        try {
                          var nowP = v.currentTime;
                          v.currentTime = nowP + 0.005;
                          v._rvfcActive = false;
                          trackFrameRender(v);
                        } catch(err) {}
                        finally { setTimeout(function() { isHealing = false; }, 800); }
                      }
                    } else {
                      stallTicks = 0;
                    }
                  }
                }, 800);
              })();

              art.on("ready", function() {
                notifyReady();
                var v = art.video || document.querySelector("video");
                if (v) {
                  v.setAttribute("referrerpolicy", "no-referrer");
                  v.setAttribute("playsinline", "true");
                }
                // Autoplay com fallback: tenta com som, se navegador bloquear, tenta mudo
                art.play().catch(function() {
                  console.log("[MixDrop] Autoplay com som bloqueado pelo navegador, tentando mudo...");
                  art.muted = true;
                  art.play().then(function() {
                    console.log("[MixDrop] Autoplay mudo funcionando — aguardando clique do usuário pra ativar som");
                    // Avisa o parent que precisa de interação do usuário pra ativar som
                    window.parent.postMessage({ type: "WATCHPLAY_STATUS", muted: true, paused: false, readyState: 4 }, "*");
                    window.parent.postMessage({ type: "WATCHPLAY_AUTOPLAY_MUTED" }, "*");
                  }).catch(function() {
                    console.log("[MixDrop] Autoplay bloqueado mesmo mudo — esperando interação do usuário");
                  });
                });
              });

              art.on("play", sendStatus);
              art.on("pause", sendStatus);
              art.on("timeupdate", sendStatus);
              art.on("video:ended", notifyEnded);

              // ===== TELEMETRIA MIXDROP (somente F12) =====
              // Rastreia travamentos, tela preta e quedas do stream. Comando manual:
              // mixdropStats() (contexto do iframe) ou nixplayStats() (contexto top).
              (function initMixdropTelemetry() {
                var TAG = "%c[MixDrop Telemetria]";
                var TAG_CSS = "background:#e50914;color:#fff;font-weight:bold;padding:2px 6px;border-radius:3px;";
                var startedAt = Date.now();
                var timeline = [];
                var totalStalls = 0;
                var totalStallSec = 0;
                var stallStart = 0;
                var lastCmdAt = 0;
                var ERR_NAMES = { 1: "ABORTED (cancelado)", 2: "NETWORK (rede/stream caiu)", 3: "DECODE (falha de decodificacao)", 4: "SRC_NOT_SUPPORTED (fonte invalida)" };

                function vid() { return art.video || document.querySelector("video"); }

                function bufAhead(v) {
                  try {
                    var cur = v.currentTime || 0;
                    for (var i = 0; i < v.buffered.length; i++) {
                      if (cur >= v.buffered.start(i) && cur <= v.buffered.end(i)) {
                        return +(v.buffered.end(i) - cur).toFixed(2);
                      }
                    }
                  } catch (e) {}
                  return 0;
                }

                function quality(v) {
                  if (v && typeof v.getVideoPlaybackQuality === "function") {
                    try {
                      var q = v.getVideoPlaybackQuality();
                      return { totalFrames: q.totalVideoFrames || 0, droppedFrames: q.droppedVideoFrames || 0, corruptedFrames: q.corruptedVideoFrames || 0 };
                    } catch (e) {}
                  }
                  return null;
                }

                function push(kind, extra) {
                  var v = vid();
                  var e = {
                    "t+": ((Date.now() - startedAt) / 1000).toFixed(1) + "s",
                    evento: kind,
                    pos: v ? +(v.currentTime || 0).toFixed(1) : 0,
                    buffer: v ? bufAhead(v) : 0,
                    ready: v ? v.readyState : -1,
                    rede: v ? v.networkState : -1,
                    pausado: v ? v.paused : null,
                    info: extra || ""
                  };
                  timeline.push(e);
                  if (timeline.length > 60) timeline.shift();
                  return e;
                }

                function warn(kind, extra) {
                  var e = push(kind, extra);
                  console.warn(TAG + " " + kind + (extra ? " - " + extra : ""), TAG_CSS, e);
                }

                function dump() {
                  console.groupCollapsed(TAG + " LINHA DO TEMPO (ultimos " + timeline.length + " eventos)", TAG_CSS);
                  console.table(timeline);
                  console.groupEnd();
                }

                function toParent(ev, extra) {
                  try {
                    var m = { type: "NIXPLAY_TELEMETRY_EVENT", event: ev };
                    for (var k in extra) m[k] = extra[k];
                    window.parent.postMessage(m, "*");
                  } catch (e) {}
                }

                function stall(reason) {
                  var v = vid();
                  if (!v || v.paused || v.ended) return;
                  var now = Date.now();
                  if (!stallStart) { stallStart = now; totalStalls++; }
                  push("stall", reason);
                  toParent("stall", {
                    reason: "MixDrop: " + reason,
                    duration: +((now - stallStart) / 1000).toFixed(2),
                    bufferAhead: bufAhead(v),
                    currentTime: +(v.currentTime || 0).toFixed(1),
                    src: v.currentSrc || v.src || "",
                    quality: quality(v),
                    totalStalls: totalStalls
                  });
                }

                function recovered() {
                  if (!stallStart) return;
                  var d = +((Date.now() - stallStart) / 1000).toFixed(2);
                  totalStallSec += d;
                  stallStart = 0;
                  var v = vid();
                  push("recovered", d + "s");
                  toParent("recovered", { stallDuration: d, bufferAhead: v ? bufAhead(v) : 0, currentTime: v ? +(v.currentTime || 0).toFixed(1) : 0 });
                }

                function stats() {
                  var v = vid();
                  if (!v) { console.warn(TAG + " video indisponivel", TAG_CSS); return null; }
                  var q = quality(v);
                  var s = {
                    "Tempo Atual": +(v.currentTime || 0).toFixed(2) + "s",
                    "Duracao": +(v.duration || 0).toFixed(2) + "s",
                    "Pausado": v.paused,
                    "Buffer a Frente": bufAhead(v) + "s",
                    "Resolucao": (v.videoWidth || 0) + "x" + (v.videoHeight || 0),
                    "Estado de Rede": ["EMPTY (0)", "IDLE (1)", "LOADING (2)", "NO_SOURCE (3)"][v.networkState] || v.networkState,
                    "Ready State": v.readyState + " (4 = ok, 0-2 = sem dados para tocar)",
                    "Erro da midia": v.error ? (ERR_NAMES[v.error.code] || v.error.code) : "nenhum",
                    "Engasgos": totalStalls,
                    "Tempo Total Travado": +totalStallSec.toFixed(2) + "s",
                    "Quadros": q ? (q.droppedFrames + " drops / " + q.totalFrames + " total") : "N/A",
                    "Aba visivel": document.visibilityState,
                    "Fonte": v.currentSrc || v.src
                  };
                  console.log(TAG + " RELATORIO", TAG_CSS);
                  console.table(s);
                  dump();
                  return s;
                }
                window.mixdropStats = stats;

                // Marca comandos do usuario para distinguir pausa solicitada de pausa inesperada
                window.addEventListener("message", function(e) {
                  var d = e.data;
                  if (!d || typeof d !== "object") return;
                  if (d.type === "REQUEST_NIXPLAY_STATS") { stats(); return; }
                  if (/^(PLAY|PAUSE|TOGGLE_PLAY|SEEK|SEEK_ABSOLUTE|SEEK_RELATIVE|seek|SKIP_INTRO)$/.test(String(d.type))) {
                    lastCmdAt = Date.now();
                  }
                });

                function attach() {
                  var v = vid();
                  if (!v || v._mdTelemetry) return;
                  v._mdTelemetry = true;
                  v.addEventListener("loadedmetadata", function() { push("metadata", "dur=" + Math.round(v.duration || 0) + "s " + v.videoWidth + "x" + v.videoHeight); });
                  v.addEventListener("waiting", function() { stall("waiting (buffer esgotado)"); });
                  v.addEventListener("stalled", function() { stall("stalled (proxy/CDN parou de enviar dados)"); });
                  v.addEventListener("playing", function() { recovered(); });
                  v.addEventListener("canplay", function() { recovered(); });
                  v.addEventListener("play", function() { push("play"); });
                  v.addEventListener("seeking", function() { push("seeking", "alvo=" + (+(v.currentTime || 0).toFixed(1)) + "s"); });
                  v.addEventListener("seeked", function() { push("seeked"); });
                  v.addEventListener("abort", function() { push("abort", "carga cancelada"); });
                  v.addEventListener("ended", function() { push("ended"); notifyEnded(); });
                  v.addEventListener("emptied", function() { warn("EMPTIED", "elemento de video foi esvaziado/reiniciado"); });
                  v.addEventListener("pause", function() {
                    if (v.ended) return;
                    if (Date.now() - lastCmdAt > 1500) {
                      warn("PAUSA NAO SOLICITADA", "o navegador/player pausou sozinho (aba oculta, autoplay, erro?)");
                    } else {
                      push("pause", "solicitada");
                    }
                  });
                  v.addEventListener("error", function() {
                    var er = v.error;
                    warn("ERRO DE MIDIA", "codigo=" + (er ? er.code : "?") + " " + (er ? (ERR_NAMES[er.code] || "") : "") + (er && er.message ? " | " + er.message : ""));
                    dump();
                  });
                }
                attach();
                art.on("ready", attach);

                document.addEventListener("visibilitychange", function() { push("aba", document.visibilityState); });
                window.addEventListener("error", function(e) { warn("ERRO JS NO IFRAME", (e && e.message) || ""); });
                window.addEventListener("unhandledrejection", function(e) { warn("PROMISE REJEITADA NO IFRAME", String(e && e.reason)); });
                window.addEventListener("offline", function() { warn("NAVEGADOR OFFLINE"); });
                window.addEventListener("online", function() { push("navegador voltou online"); });

                // Vigia de congelamento (tempo parado) e de "audio andando sem quadros" (tela preta)
                var lastT = 0;
                var lastWall = Date.now();
                var lastFrames = 0;
                var frozenTicks = 0;
                var noFrameTicks = 0;
                var noFrameReported = false;
                setInterval(function() {
                  var v = vid();
                  if (!v) return;
                  var now = Date.now();
                  var cur = v.currentTime || 0;
                  var q = quality(v);
                  if (v.paused || v.ended || v.seeking) {
                    lastT = cur;
                    lastWall = now;
                    frozenTicks = 0;
                    noFrameTicks = 0;
                    if (q) lastFrames = q.totalFrames;
                    return;
                  }
                  var dt = cur - lastT;
                  var wall = (now - lastWall) / 1000;
                  lastT = cur;
                  lastWall = now;

                  var currentBuf = bufAhead(v);
                  if (wall >= 0.7 && dt < 0.05 && currentBuf >= 0.8) {
                    frozenTicks++;
                    if (frozenTicks >= 2) stall("frame_freeze (tempo do video parado, sem evento waiting)");
                    
                    // Auto-Healer: Descongelamento automático de frame travado
                    if (frozenTicks === 3) {
                      console.log("%c[MixDrop Auto-Healer] ⚡ Micro-nudge (+0.01s) aplicado para destravar video", "color:#f59e0b;font-weight:bold;");
                      try {
                        v.currentTime = Math.max(0, (v.currentTime || 0) + 0.01);
                        v.play().catch(function() {});
                      } catch(e) {}
                    } else if (frozenTicks === 6) {
                      console.log("%c[MixDrop Auto-Healer] ⚡ Macro-nudge (-0.2s + play) aplicado para destravar video", "color:#f59e0b;font-weight:bold;");
                      try {
                        v.currentTime = Math.max(0, (v.currentTime || 0) - 0.2);
                        v.play().catch(function() {});
                      } catch(e) {}
                    } else if (frozenTicks >= 10) {
                      console.log("%c[MixDrop Auto-Healer] 🚨 Frame freeze persistente (>10s). Notificando parent...", "color:#ef4444;font-weight:bold;");
                      try {
                        window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "frame_freeze_unrecoverable" }, "*");
                      } catch(e) {}
                    }
                  } else {
                    if (frozenTicks >= 2) recovered();
                    frozenTicks = 0;
                  }

                  if (q) {
                    if (dt > 0.35 && q.totalFrames === lastFrames) {
                      noFrameTicks++;
                      if (noFrameTicks >= 3 && !noFrameReported) {
                        noFrameReported = true;
                        warn("VIDEO SEM QUADROS (tela preta/congelada com tempo andando)", "frames=" + q.totalFrames + " drops=" + q.droppedFrames);
                        dump();
                      }
                    } else {
                      if (noFrameReported && q.totalFrames > lastFrames) { noFrameReported = false; push("quadros voltaram"); }
                      noFrameTicks = 0;
                    }
                    lastFrames = q.totalFrames;
                  }
                }, 1000);

                console.log(TAG + " ativa. Digite mixdropStats() para o relatorio e a linha do tempo.", TAG_CSS);
              })();

              var _playBlocked = false; // Flag pra evitar loop de retry

              // Overlay de play: quando navegador bloqueia autoplay, mostra botão grande.
              // Clique direto no vídeo = gesto do usuário = play permitido.
              function showPlayOverlay() {
                if (document.getElementById("mixdrop-play-overlay")) return;
                var overlay = document.createElement("div");
                overlay.id = "mixdrop-play-overlay";
                overlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;";
                var btn = document.createElement("div");
                btn.style.cssText = "width:80px;height:80px;border-radius:50%;background:#e50914;display:flex;align-items:center;justify-content:center;box-shadow:0 0 30px rgba(229,9,20,0.5);";
                btn.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';
                overlay.appendChild(btn);
                overlay.addEventListener("click", function() {
                  art.muted = false;
                  art.play().then(function() {
                    _playBlocked = false;
                    overlay.remove();
                    sendStatus();
                    console.log("[MixDrop] Play iniciado por clique do usuário");
                  }).catch(function() {});
                });
                document.body.appendChild(overlay);
              }

              window.addEventListener("message", function(e) {
                  if (e.data && e.data.type === 'SET_SUBTITLE_URL') {
                      var vid = window.artInstance ? window.artInstance.video : (typeof art !== 'undefined' && art.video ? art.video : document.querySelector('video'));
                      if (!vid) vid = document.querySelector('video');
                      if (vid) {
                          var oldTrack = document.getElementById('playinfinity-subtitle');
                          if (oldTrack) { oldTrack.remove(); }
                          if (e.data.url) {
                              var track = document.createElement('track');
                              track.id = 'playinfinity-subtitle';
                              track.kind = 'captions';
                              track.label = e.data.label || 'Português (Brasil)';
                              track.srclang = 'pt-BR';
                              track.src = e.data.url;
                              track.default = true;
                              vid.appendChild(track);
                              // Espera carregar para forçar o modo showing
                              if (e.data.show !== false) { track.addEventListener('load', function() { this.mode = 'showing'; }); }
                          }
                      }
                      return;
                  }
                  if (e.data && e.data.type === 'SHOW_SUBTITLE') {
                      var tr = document.getElementById('playinfinity-subtitle');
                      if (tr) {
                          tr.mode = e.data.show ? 'showing' : 'hidden';
                      }
                      return;
                  }

                if (!e.data) return;
                var v = art.video || document.querySelector("video");

                switch (e.data.type) {
                  case "PLAY":
                    if (_playBlocked) return; // Já tentou e falhou — não tenta de novo
                    if (art) {
                      art.play().catch(function() {
                        _playBlocked = true;
                        console.log("[MixDrop] Autoplay bloqueado — mostrando botao de clique");
                        // Mostra overlay de play (clique direto no vídeo = gesto do usuário = permitido)
                        showPlayOverlay();
                        // Reporta UMA vez que está pausado (não repete)
                        window.parent.postMessage({ type: "WATCHPLAY_STATUS", paused: true, readyState: 4 }, "*");
                      });
                    } else if (v) {
                      v.play().catch(function() { _playBlocked = true; showPlayOverlay(); });
                    }
                    // NÃO chama sendStatus() aqui se play falhou — isso causa loop
                    break;
                  case "PAUSE":
                    if (art) art.pause();
                    else if (v) v.pause();
                    sendStatus();
                    break;
                  case "TOGGLE_PLAY":
                    if (_playBlocked) { showPlayOverlay(); return; }
                    if (art) {
                      if (art.playing) {
                        art.pause();
                        sendStatus();
                      } else {
                        art.play().catch(function() {
                          _playBlocked = true;
                          showPlayOverlay();
                        });
                        sendStatus();
                      }
                    }
                    break;
                  case "SEEK":
                  case "SEEK_ABSOLUTE":
                  case "SEEK_RELATIVE":
                    var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                    if (typeof t === "number" && !isNaN(t)) {
                      if (art) art.currentTime = t;
                      else if (v) v.currentTime = t;
                      sendStatus();
                    }
                    break;
                  case "SKIP_INTRO":
                    var sec = Number(e.data.seconds) || 75;
                    var cur = (v ? v.currentTime : 0) || 0;
                    var maxD = (v && v.duration > 0 ? v.duration : 99999);
                    var target = Math.max(0, Math.min(cur + sec, maxD - 5));
                    if (art) art.currentTime = target;
                    else if (v) v.currentTime = target;
                    sendStatus();
                    break;
                  case "SET_VOLUME":
                    if (typeof e.data.volume === "number") {
                      if (art) art.volume = e.data.volume;
                      else if (v) v.volume = e.data.volume;
                      sendStatus();
                    }
                    break;
                  case "SET_MUTED":
                  case "setMuted":
                    if (art) art.muted = !!e.data.muted;
                    else if (v) v.muted = !!e.data.muted;
                    sendStatus();
                    break;
                  case "SET_PLAYBACK_RATE":
                    if (typeof e.data.rate === "number") {
                      if (art) art.playbackRate = e.data.rate;
                      else if (v) v.playbackRate = e.data.rate;
                      sendStatus();
                    }
                    break;
                  case "REQUEST_STATUS":
                    sendStatus();
                    break;
                }
              });
            })();
          </script>
        </body>
        </html>
      `);
    } catch (err: any) {
      console.error("[MixDrop Stream Error]:", err);
      return res.status(500).send("Erro interno ao processar stream do MixDrop.");
    }
  });

  // Proxy de streaming direto do MixDrop com suporte a Range bytes (fallback resiliente)
  router.get("/api/md-proxy", async (req, res) => {
    try {
      let videoUrl = String(req.query.url || "").trim();
      if (!videoUrl || !videoUrl.includes("mxcontent.net")) {
        return res.status(400).send("URL de vídeo inválida.");
      }

      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://mxdrop.top/",
        "Origin": "https://mxdrop.top",
        "Connection": "keep-alive",
      };

      if (req.headers.range) {
        headers["Range"] = req.headers.range;
      }

      let controller = new AbortController();
      let timeoutId = setTimeout(() => controller.abort(), 15000);
      req.on("close", () => controller.abort());

      let upstream = await fetch(videoUrl, { signal: controller.signal, headers });
      clearTimeout(timeoutId);

      // Auto-Healer 403 Forbidden: se o token da CDN expirar, renova o token do fileId em tempo real
      if ((upstream.status === 403 || upstream.status === 404 || upstream.status === 410) && !res.headersSent) {
        const fileMatch = videoUrl.match(/\/v2\/([a-zA-Z0-9_-]+)\.mp4/) || videoUrl.match(/\/([a-zA-Z0-9_-]+)\.mp4/);
        const fileId = fileMatch ? fileMatch[1] : "";
        if (fileId) {
          console.warn(`[MixDrop Proxy] Token CDN expirado (${upstream.status}) para fileId ${fileId}. Renovando token em tempo real...`);
          mixdropMemoryCache.delete(fileId);
          const fresh = await resolveFreshMixdropToken(fileId);
          if (fresh && fresh.videoUrl) {
            videoUrl = fresh.videoUrl;
            controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 15000);
            upstream = await fetch(videoUrl, { signal: controller.signal, headers });
            clearTimeout(timeoutId);
          }
        }
      }

      res.status(upstream.status);

      // Repassa Content-Length, Content-Range e Accept-Ranges para conformidade RFC 9110 (Range 206)
      // Isso permite que navegadores e players calculem buffers preditivos e fechem requisições Range limpas.
      for (const [key, value] of upstream.headers.entries()) {
        const lk = key.toLowerCase();
        if (["content-type", "content-range", "accept-ranges", "content-length"].includes(lk)) {
          res.setHeader(key, value);
        }
      }
      res.setHeader("Access-Control-Allow-Origin", "*");

      if (!upstream.body) {
        return res.end();
      }

      const { Readable } = await import("stream");
      // @ts-ignore
      const source = Readable.fromWeb(upstream.body);
      // pipe() NÃO propaga 'error' da origem para o destino: sem este handler,
      // um reset da CDN deixaria a resposta aberta e o navegador travado até o
      // timeout dele.
      let sourceFailed = false;
      source.on("error", () => {
        if (sourceFailed || res.writableEnded) return;
        sourceFailed = true;
        controller.abort();
        // 206 prometeu Content-Length → não dá para finalizar limpo; 200 é
        // chunked e pode ser encerrado com o terminador normal.
        if (upstream.status === 206) res.destroy();
        else res.end();
      });
      source.pipe(res);

      res.on("close", () => controller.abort());
      res.on("error", () => controller.abort());
    } catch (err: any) {
      if ((err as any)?.name === "AbortError") {
        if (!res.headersSent) res.end();
        return;
      }
      console.error("[MixDrop Proxy Error]:", err);
      if (!res.headersSent) {
        res.status(500).send("Erro no proxy do MixDrop");
      } else {
        res.destroy();
      }
    }
  });

  // TMDB Proxy (Oculta a chave de API do cliente e evita vazamento no DevTools)

  // NOVO: /api/download?url=<mixdrop_fileId>&filename=<filename>
  // Resolve fileId → MP4 URL real (reusando cache do /api/mixdrop-stream) e faz proxy
  // do stream com Content-Disposition: attachment pra forçar download.
  // Mesmo IP que gerou o token da CDN mxcontent.net, evita 403 no navegador.
  router.get("/api/download", async (req, res) => {
    try {
      const rawUrl = String(req.query.url || "").trim();
      const filename = String(req.query.filename || "video.mp4").trim();

      if (!rawUrl) {
        return res.status(400).send("Parâmetro 'url' é obrigatório.");
      }

      // rawUrl pode ser:
      // - fileId direto (ex: "q161g1vgcwkzd7")
      // - URL completa (ex: "https://mxdrop.top/e/q161g1vgcwkzd7")
      let fileId: string | null = null;
      let host: string = "mxdrop.top";

      if (/^[a-zA-Z0-9_-]{5,40}$/.test(rawUrl) && !rawUrl.includes("/") && !rawUrl.includes(":")) {
        // É só o fileId
        fileId = rawUrl;
      } else {
        const safeCheck = validateSafeUrl(rawUrl);
        if (!safeCheck.valid || !safeCheck.parsedUrl) {
          return res.status(400).send("URL inválida ou não autorizada.");
        }
        const parsedHost = safeCheck.parsedUrl.hostname.toLowerCase();
        if (!parsedHost.includes("mixdrop.") && !parsedHost.includes("mxdrop.")) {
          return res.status(400).send("Domínio fornecido não pertence à rede MixDrop.");
        }
        host = parsedHost;
        const fileMatch = safeCheck.parsedUrl.pathname.match(/\/(?:f|e)\/([a-zA-Z0-9_-]+)/);
        fileId = fileMatch ? fileMatch[1] : null;
      }

      if (!fileId) {
        return res.status(400).send("ID de arquivo do MixDrop não encontrado na URL.");
      }

      // Reusa cache do mixdrop-stream (mesmo Map em memória)
      let videoUrl = "";
      const cached = mixdropMemoryCache.get(fileId);

      if (cached && cached.expiresAt > Date.now() + 60000) {
        videoUrl = cached.videoUrl;
      } else {
        // Resolve o videoUrl fazendo fetch no embed do mixdrop
        const embedUrl = `https://${host}/e/${fileId}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const upstream = await fetch(embedUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!upstream.ok) {
            return res.status(502).send(`MixDrop retornou status HTTP ${upstream.status}`);
          }

          const html = await upstream.text();
          const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\}\)\)/);
          if (!packerMatch) {
            return res.status(502).send("Não foi possível desembalar os dados do player do MixDrop. Arquivo possivelmente deletado.");
          }

          const unpacked = new Function("return " + packerMatch[0].slice(4))() as string;
          const wurlMatch = unpacked.match(/MDCore\.wurl\s*=\s*['"]([^'"]+)['"]/);
          if (!wurlMatch || !wurlMatch[1]) {
            return res.status(502).send("URL de vídeo não encontrada no player do MixDrop.");
          }

          videoUrl = wurlMatch[1];
          if (videoUrl.startsWith("//")) videoUrl = "https:" + videoUrl;

          // Atualiza cache
          mixdropMemoryCache.set(fileId, {
            videoUrl,
            posterUrl: "",
            title: filename,
            expiresAt: Date.now() + 4 * 60 * 60 * 1000,
          });
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          console.error("[MixDrop Download Scraper Error]:", fetchErr);
          return res.status(502).send("Tempo limite ou erro ao contatar MixDrop.");
        }
      }

      // Sanitiza filename (remove caracteres problemáticos pra header)
      const safeFilename = filename.replace(/[^\w\.\- ]/g, '_').substring(0, 200);

      // Seta headers pra forçar download (em vez de tocar no navegador)
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Access-Control-Allow-Origin", "*");

      // Headers de request pro upstream (CDN mxcontent.net) — inclui Range se veio do cliente
      const upstreamHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://mxdrop.top/",
        "Origin": "https://mxdrop.top",
        "Connection": "keep-alive",
      };
      if (req.headers.range) {
        upstreamHeaders["Range"] = req.headers.range as string;
      }

      // Faz proxy do stream do MP4 direto pro cliente
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s pra download grande
      req.on("close", () => controller.abort());

      try {
        const upstream = await fetch(videoUrl, { signal: controller.signal, headers: upstreamHeaders });
        clearTimeout(timeoutId);

        if (!upstream.ok) {
          return res.status(502).send(`CDN retornou status ${upstream.status}`);
        }

        // Mesma política do proxy: sem Content-Length (chunked sempre). Um
        // download cortado (aborto/reset) não pode disparar mismatch no Chrome.
        const keepLength =
          upstream.status === 206 &&
          !!upstream.body &&
          !upstream.headers.get("content-encoding");
        for (const [key, value] of upstream.headers.entries()) {
          if (["content-length", "content-range", "accept-ranges", "content-type"].includes(key.toLowerCase())) {
            if (key.toLowerCase() === "content-type") {
              // Sempre video/mp4 — não confia no CDN
              continue;
            }
            if (key.toLowerCase() === "content-length" && !keepLength) continue;
            res.setHeader(key, value);
          }
        }

        if (!upstream.body) {
          return res.end();
        }

        const { Readable } = await import("stream");
        // @ts-ignore
        const sourceReadable = Readable.fromWeb(upstream.body);
        // pipe() não propaga 'error' da origem: um reset da CDN deve finalizar a
        // resposta mesmo sem os bytes prometidos (evita travamento + mismatch).
        sourceReadable.on("error", () => {
          if (res.writableEnded) return;
          if (upstream.status === 206) res.destroy();
          else res.end();
        });
        sourceReadable.pipe(res);
      } catch (proxyErr: any) {
        clearTimeout(timeoutId);
        console.error("[MixDrop Download Proxy Error]:", proxyErr);
        return res.status(502).send("Erro no proxy do download.");
      }
    } catch (err: any) {
      console.error("[MixDrop Download Error]:", err);
      return res.status(500).send("Erro interno no download.");
    }
  });

export default router;
