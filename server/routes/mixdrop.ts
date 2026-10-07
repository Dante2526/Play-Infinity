import { Router } from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import { isPrivateOrLocalIp, isPrivateOrLocalHost, validateSafeUrl } from "../utils/helpers";

const mixdropMemoryCache = new Map<string, { videoUrl: string; posterUrl: string; title: string; expiresAt: number }>();

const router = Router();

  router.get("/api/mixdrop-stream", async (req, res) => {
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
            return sendFallbackHtml(502, `MixDrop retornou status HTTP ${upstream.status}`);
          }

          const html = await upstream.text();
          const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\}\)\)/);
          if (!packerMatch) {
            return sendFallbackHtml(502, "Não foi possível desembalar os dados do player do MixDrop. Arquivo possivelmente deletado.");
          }

          const unpacked = new Function("return " + packerMatch[0].slice(4))() as string;
          const wurlMatch = unpacked.match(/MDCore\.wurl\s*=\s*['"]([^'"]+)['"]/);
          const posterMatch = unpacked.match(/MDCore\.poster\s*=\s*['"]([^'"]+)['"]/);
          const titleMatch = html.match(/<title>MixDrop - Watch ([^<]+)<\/title>/i);

          if (!wurlMatch || !wurlMatch[1]) {
            return sendFallbackHtml(502, "URL de vídeo não encontrada no player do MixDrop.");
          }

          videoUrl = wurlMatch[1];
          if (videoUrl.startsWith("//")) videoUrl = "https:" + videoUrl;

          if (posterMatch && posterMatch[1]) {
            posterUrl = posterMatch[1];
            if (posterUrl.startsWith("//")) posterUrl = "https:" + posterUrl;
          }

          if (titleMatch && titleMatch[1]) {
            pageTitle = titleMatch[1].trim();
          }

          mixdropMemoryCache.set(fileId, {
            videoUrl,
            posterUrl,
            title: pageTitle,
            expiresAt: Date.now() + 4 * 60 * 60 * 1000,
          });
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          console.error("[MixDrop Scraper Error]:", fetchErr);
          return sendFallbackHtml(502, "Tempo limite ou erro ao contatar servidor de mídia MixDrop.");
        }
      }

      // Usa o PROXY — o token da CDN mxcontent.net é IP-locked (gerado pro IP do Render).
      // Se passar URL direta pro navegador do usuário, a CDN retorna 403 (IP diferente).
      // O proxy faz a request do MESMO IP que gerou o token (Render server), então funciona.
      const streamUrl = `/api/mixdrop-proxy?url=${encodeURIComponent(videoUrl)}`;

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
                theme: "#e50914"
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

                    if (!frameFresh && (typeof v.requestVideoFrameCallback === 'function' || typeof v.getVideoPlaybackQuality === 'function')) {
                      stallTicks++;
                      if (stallTicks >= 2 && (now - lastHealAt > 3500) && !isHealing) {
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
                    var sec = Number(e.data.seconds) || 85;
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
  router.get("/api/mixdrop-proxy", async (req, res) => {
    try {
      const videoUrl = String(req.query.url || "").trim();
      if (!videoUrl || !videoUrl.includes("mxcontent.net")) {
        return res.status(400).send("URL de vídeo inválida.");
      }

      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      };

      if (req.headers.range) {
        headers["Range"] = req.headers.range;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      req.on("close", () => controller.abort());

      const upstream = await fetch(videoUrl, { signal: controller.signal, headers });
      clearTimeout(timeoutId);

      res.status(upstream.status);

      // Content-Length é DROPPED em qualquer status. Mesmo em 206 (Range) um
      // reset da CDN ou um aborto do cliente encerra o corpo antes do fim
      // declarado → Chrome dispara net::ERR_CONTENT_LENGTH_MISMATCH. Sem o
      // header a resposta vai chunked e termina no marcador de fim — o mismatch
      // vira impossível. Content-Range/Accept-Ranges seguem sendo enviados:
      // o player usa o total deles pra saber o tamanho do arquivo (seek).
      for (const [key, value] of upstream.headers.entries()) {
        const lk = key.toLowerCase();
        if (lk === "content-length") continue;
        if (["content-type", "content-range", "accept-ranges"].includes(lk)) {
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
