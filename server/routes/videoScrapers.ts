import { Router } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as cheerio from "cheerio";
import { isServerBlacklisted } from "../../src/data/serverBlacklist";
import { validateSafeUrl, sanitizeString, isSuperflixDetected, isPrivateOrLocalIp } from "../utils/helpers";
import { resolveVixsrcStream, resolveDirectAnimeStream } from "../../server";
import { animeDirectStreamCache, vixsrcStreamCache, liveChunkCache } from "../utils/caches";
import { Readable } from "stream";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const router = Router();

// API 4.5: Proxy HLS Anti-CORS para reprodução direta sem bloqueios no Artplayer
  router.get("/api/anime/hls-proxy", async (req, res) => {
    try {
      const rawUrl = req.query.url as string;
      if (!rawUrl) return res.status(400).send("URL ausente");

      const validation = validateSafeUrl(rawUrl);
      if (!validation.valid) {
        let isAllowedException = false;
        try {
          const parsedHost = new URL(rawUrl).hostname.toLowerCase();
          if (
            parsedHost === "hclod.qzz.io" || parsedHost.endsWith(".hclod.qzz.io") ||
            parsedHost === "watchplay.shop" || parsedHost.endsWith(".watchplay.shop") ||
            parsedHost === "vixsrc.to" || parsedHost.endsWith(".vixsrc.to") ||
            parsedHost === "vixsrc.net" || parsedHost.endsWith(".vixsrc.net") ||
            parsedHost === "vix-content.net" || parsedHost.endsWith(".vix-content.net")
          ) {
            isAllowedException = true;
          }
        } catch (e) {
          // hostname invalido
        }

        if (!isAllowedException) {
          return res.status(403).send("URL não permitida");
        }
      }

      if (req.method === "OPTIONS") {
        return res.status(204).end();
      }

      const referer = (req.query.referer as string) || (rawUrl.includes("vixsrc") || rawUrl.includes("vix-content") ? "https://vixsrc.to/" : "https://v1.watchplay.shop/");
      let originHeader = "https://v1.watchplay.shop";
      try {
        if (referer.startsWith("http")) originHeader = new URL(referer).origin;
      } catch {}

      const upstreamRes = await fetch(rawUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": referer,
          "Origin": originHeader
        }
      });

      if (!upstreamRes.ok) {
        return res.status(upstreamRes.status).send(`Upstream status: ${upstreamRes.status}`);
      }

      const contentType = upstreamRes.headers.get("content-type") || "";
      const isM3U8 = rawUrl.includes(".m3u8") || contentType.includes("mpegurl") || contentType.includes("application/x-mpegURL");

      if (isM3U8) {
        const text = await upstreamRes.text();
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        const basePath = rawUrl.substring(0, rawUrl.lastIndexOf("/") + 1);

        const rewritten = text.split("\n").map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/, (_, uri) => {
              const fullUri = uri.startsWith("http") ? uri : new URL(uri, basePath).toString();
              return `URI="/api/anime/hls-proxy?url=${encodeURIComponent(fullUri)}&referer=${encodeURIComponent(referer)}&is_segment=true"`;
            });
          }
          if (trimmed.startsWith("#")) return trimmed;
          const fullSegUrl = trimmed.startsWith("http") ? trimmed : new URL(trimmed, basePath).toString();
          return `/api/anime/hls-proxy?url=${encodeURIComponent(fullSegUrl)}&referer=${encodeURIComponent(referer)}&is_segment=true`;
        }).join("\n");

        return res.send(rewritten);
      }

      let finalContentType = contentType || "video/MP2T";
      if (req.query.is_segment === "true") {
        finalContentType = "video/MP2T";
      }
      res.setHeader("Content-Type", finalContentType);
      res.setHeader("Cache-Control", "public, max-age=3600");

      if (upstreamRes.body) {
        // Stream directly to HTTP response avoiding multi-megabyte RAM allocations
        return Readable.fromWeb(upstreamRes.body as any).pipe(res);
      } else {
        const buffer = Buffer.from(await upstreamRes.arrayBuffer());
        return res.send(buffer);
      }
    } catch (err: any) {
      console.error("[HLS Proxy Error]:", err.message);
      return res.status(500).send("Proxy error");
    }
  });

// API 4.5: Proxy HLS Anti-CORS para reprodução direta sem bloqueios no Artplayer
  // API 4.8: Servidor Nativo Vixsrc com Stream Direto HLS em Artplayer com Skin Netflix
  router.get("/api/vixsrc-stream", async (req, res) => {
    const { id, type = "movie", s = "1", e = "1" } = req.query;
    const tmdbId = String(id || "");
    const mediaType = type === "tv" ? "tv" : "movie";
    const seasonNum = parseInt(String(s || "1"), 10) || 1;
    const episodeNum = parseInt(String(e || "1"), 10) || 1;

    const wpTarget = mediaType === "tv"
      ? `https://v1.watchplay.shop/tvshow/${tmdbId}/${seasonNum}/${episodeNum}`
      : `https://v1.watchplay.shop/movie/${tmdbId}`;

    try {
      const vixData = await resolveVixsrcStream(tmdbId, mediaType, seasonNum, episodeNum);
      if (vixData?.masterUrl) {
        const proxiedStreamUrl = `/api/anime/hls-proxy?url=${encodeURIComponent(vixData.masterUrl)}&referer=${encodeURIComponent(vixData.embedUrl)}`;

        return res.send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
              .btn, .button, a[href*="player"], a[href*="server"], div[class*="player_select"],
              div[class*="server_select"], div[class*="choose"], .escolher-player,
              .button-escolher-player, [class*="escolh"], [class*="server_"],
              .servers-list, .server-buttons, .player-selector,
              [id*="server"], [id*="player_select"], .btn-player, .player-options,
              #player > div:first-child, button[onclick*="backOptions"],
              .alert, .notice, .warning, .message, [class*="msg"], [class*="aviso"],
              h1, h2, h3, h4, #options h2, #options p {
                display: none !important;
                opacity: 0 !important;
                visibility: hidden !important;
                pointer-events: none !important;
              }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/artplayer@5.1.7/dist/artplayer.js"></script>
          </head>
          <body>
            <div id="artplayer-container"></div>
            <script>
              (function() {
                var hlsUrl = "${proxiedStreamUrl}";

                var art = new Artplayer({
                  container: "#artplayer-container",
                  url: hlsUrl,
                  type: "m3u8",
                  customType: {
                    m3u8: function(video, url, artInstance) {
                      if (Hls.isSupported()) {
                        if (artInstance.hls) artInstance.hls.destroy();
                        var hls = new Hls({
                          enableWorker: true,
                          maxBufferLength: 60,
                          maxMaxBufferLength: 120,
                          backBufferLength: 90
                        });
                        hls.loadSource(url);
                        hls.attachMedia(video);
                        artInstance.hls = hls;
                      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                        video.src = url;
                      }
                    }
                  },
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

                function notifyEnded() {
                  try {
                    window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
                  } catch(e) {}
                }

                setInterval(sendStatus, 300);

                window.addEventListener("message", function(e) {
                  if (!e.data) return;
                  var v = art.video || document.querySelector("video");

                  switch (e.data.type) {
                    case "PLAY":
                      if (art) art.play().catch(function() {});
                      else if (v) v.play().catch(function() {});
                      sendStatus();
                      break;
                    case "PAUSE":
                      if (art) art.pause();
                      else if (v) v.pause();
                      sendStatus();
                      break;
                    case "TOGGLE_PLAY":
                      if (art) art.toggle();
                      else if (v) { v.paused ? v.play().catch(function() {}) : v.pause(); }
                      sendStatus();
                      break;
                    case "SEEK":
                    case "SEEK_ABSOLUTE":
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
                      if (art) art.muted = !e.data.muted;
                      else if (v) v.muted = !e.data.muted;
                      sendStatus();
                      break;
                    case "REQUEST_STATUS":
                      sendStatus();
                      break;
                  }
                });

                art.on("video:ended", notifyEnded);
              })();
            </script>
          </body>
          </html>
        `);
      }

      // Se Vixsrc não tiver o stream, comuta para o WatchPlayer
      return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
    } catch (err: any) {
      console.error("[Vixsrc Stream Route Error]:", err.message);
      return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
    }
  });

// API 4.5: Proxy HLS Anti-CORS para reprodução direta sem bloqueios no Artplayer
  // API 4.8: Servidor Nativo Vixsrc com Stream Direto HLS em Artplayer com Skin Netflix
  // API 5: Servidor Nativo de Anime e Alternativas
  router.get("/api/anime-stream", async (req, res) => {
    const { provider = "consumet", id, s = "1", e = "1", title = "", type = "tv" } = req.query;
    const isMovie = type === "movie";
    const tmdbId = String(id || "");
    let animeTitle = String(title || "");
    if (!animeTitle) {
      if (tmdbId === "46260") animeTitle = "Naruto";
      else if (tmdbId === "31910") animeTitle = "Naruto Shippuden";
      else if (tmdbId === "12971") animeTitle = "Dragon Ball";
      else if (tmdbId === "12609") animeTitle = "Dragon Ball Z";
      else if (tmdbId === "60625") animeTitle = "Dragon Ball Super";
    }

    const wpTarget = isMovie
      ? `https://v1.watchplay.shop/movie/${tmdbId}`
      : `https://v1.watchplay.shop/tvshow/${tmdbId}/${s}/${e}`;

    try {
      // 1. Provedor Principal Nativo: Stream HLS .m3u8 em Artplayer Próprio ou Blogger
      if (provider === "consumet" || provider === "native") {
        const directStream = await resolveDirectAnimeStream(tmdbId, s as string, e as string, isMovie, animeTitle);

        if (directStream?.isBlogger) {
          return res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                * { box-sizing: border-box; }
                html, body {
                  margin: 0;
                  padding: 0;
                  background: #000;
                  overflow: hidden;
                  width: 100vw;
                  height: 100vh;
                  position: relative;
                }
                #blogger-container {
                  position: absolute;
                  inset: 0;
                  width: 100%;
                  height: 100%;
                  overflow: hidden;
                  background: #000;
                }
                iframe {
                  position: absolute;
                  top: -2px;
                  left: 0;
                  width: 100%;
                  height: calc(100% + 50px);
                  border: none;
                  display: block;
                }
              </style>
            </head>
            <body>
              <div id="blogger-container">
                <iframe id="blogger-frame" src="${directStream.streamUrl}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
              </div>
              <script>
                (function() {
                  var curTime = 0;
                  var isPaused = true;
                  var dur = 1440; // 24 minutos (duração de episódio padrão)
                  var frame = document.getElementById("blogger-frame");

                  function sendStatus() {
                    try {
                      window.parent.postMessage({
                        type: "WATCHPLAY_STATUS",
                        currentTime: curTime,
                        duration: dur,
                        paused: isPaused,
                        muted: false,
                        volume: 1,
                        buffered: curTime + 60,
                        playbackRate: 1,
                        readyState: 4
                      }, "*");
                    } catch(e) {}
                  }

                  // Detecta quando o usuário clica diretamente no player do iframe
                  window.addEventListener("blur", function() {
                    if (isPaused) {
                      isPaused = false;
                      sendStatus();
                    }
                  });

                  // Incrementa o tempo segundo a segundo quando não pausado
                  setInterval(function() {
                    if (!isPaused && curTime < dur) {
                      curTime += 1;
                    }
                    sendStatus();
                  }, 1000);

                  setTimeout(sendStatus, 100);
                  setTimeout(sendStatus, 400);

                  // Escuta comandos vindos da Skin Netflix
                  window.addEventListener("message", function(e) {
                    if (!e.data) return;
                    switch(e.data.type) {
                      case "PLAY":
                        isPaused = false;
                        sendStatus();
                        break;
                      case "PAUSE":
                        isPaused = true;
                        sendStatus();
                        break;
                      case "TOGGLE_PLAY":
                        isPaused = !isPaused;
                        sendStatus();
                        break;
                      case "SEEK":
                      case "SEEK_ABSOLUTE":
                        var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                        if (typeof t === "number" && !isNaN(t)) {
                          curTime = Math.max(0, Math.min(t, dur));
                          sendStatus();
                        }
                        break;
                      case "SKIP_INTRO":
                        curTime = Math.min(curTime + 85, dur - 5);
                        sendStatus();
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
        }

        if (directStream?.streamUrl) {
          const proxiedStreamUrl = `/api/anime/hls-proxy?url=${encodeURIComponent(directStream.streamUrl)}`;
          const proxiedSubUrl = directStream.subtitleUrl
            ? `/api/anime/hls-proxy?url=${encodeURIComponent(directStream.subtitleUrl)}`
            : "";

          return res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
                .btn, .button, a[href*="player"], a[href*="server"], div[class*="player_select"],
                div[class*="server_select"], div[class*="choose"], .escolher-player,
                .button-escolher-player, [class*="escolh"], [class*="server_"],
                .servers-list, .server-buttons, .player-selector,
                [id*="server"], [id*="player_select"], .btn-player, .player-options,
                #player > div:first-child, button[onclick*="backOptions"],
                .alert, .notice, .warning, .message, [class*="msg"], [class*="aviso"],
                h1, h2, h3, h4, #options h2, #options p {
                  display: none !important;
                  opacity: 0 !important;
                  visibility: hidden !important;
                  pointer-events: none !important;
                }
              </style>
              <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
              <script src="https://cdn.jsdelivr.net/npm/artplayer@5.1.7/dist/artplayer.js"></script>
            </head>
            <body>
              <div id="artplayer-container"></div>
              <script>
                (function() {
                  var hlsUrl = "${proxiedStreamUrl}";
                  var subUrl = "${proxiedSubUrl}";
                  
                  var subtitles = [];
                  if (subUrl) {
                    subtitles.push({
                      url: subUrl,
                      name: "Português",
                      default: true,
                      type: "vtt"
                    });
                  }

                  var art = new Artplayer({
                    container: "#artplayer-container",
                    url: hlsUrl,
                    type: "m3u8",
                    customType: {
                      m3u8: function(video, url, artInstance) {
                        if (Hls.isSupported()) {
                          if (artInstance.hls) artInstance.hls.destroy();
                          var hls = new Hls({
                            enableWorker: true,
                            maxBufferLength: 60,
                            maxMaxBufferLength: 120,
                            backBufferLength: 90
                          });
                          hls.loadSource(url);
                          hls.attachMedia(video);
                          artInstance.hls = hls;
                        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                          video.src = url;
                        }
                      }
                    },
                    autoplay: true,
                    muted: false,
                    playsInline: true,
                    controls: [],
                    subtitle: subtitles.length > 0 ? subtitles[0] : undefined,
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

                  function notifyEnded() {
                    try {
                      window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
                    } catch(e) {}
                  }

                  setInterval(sendStatus, 300);

                  window.addEventListener("message", function(e) {
                    if (!e.data) return;
                    var v = art.video || document.querySelector("video");

                    switch (e.data.type) {
                      case "PLAY":
                        if (art) art.play().catch(function() {});
                        else if (v) v.play().catch(function() {});
                        sendStatus();
                        break;
                      case "PAUSE":
                        if (art) art.pause();
                        else if (v) v.pause();
                        sendStatus();
                        break;
                      case "TOGGLE_PLAY":
                        if (art) art.toggle();
                        else if (v) { v.paused ? v.play().catch(function() {}) : v.pause(); }
                        sendStatus();
                        break;
                      case "SEEK":
                      case "SEEK_ABSOLUTE":
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

                  art.on("video:ended", notifyEnded);
                })();
              </script>
            </body>
            </html>
          `);
        }

        // Fallback silencioso automático para o WatchPlayer oficial caso a extração direta falhe
        return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
      }

      // Fallback padrão
      return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
    } catch (err: any) {
      console.error("[Anime Stream Error]:", err.message);
      return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
    }
  });

// API 4.5: Proxy HLS Anti-CORS para reprodução direta sem bloqueios no Artplayer
  // API 4.8: Servidor Nativo Vixsrc com Stream Direto HLS em Artplayer com Skin Netflix
  // API 5: Servidor Nativo de Anime e Alternativas
  // API 6: Stream do WatchPlayer com Autoplay Imediato (sem ter que clicar em Opção 1)
  router.get("/api/watchplayer-stream", async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      const validation = validateSafeUrl(targetUrl);
      if (!validation.valid) {
        return res.status(403).send(`Acesso bloqueado por segurança: ${validation.error}`);
      }

      // Se for requisição de assinatura MD5 de stream feita pelo próprio player da página
      if (req.query.action_secure_sign) {
        const rawUrl = req.query.raw_url as string;
        const signTarget = new URL(targetUrl);
        signTarget.searchParams.set("action_secure_sign", "1");
        if (rawUrl) signTarget.searchParams.set("raw_url", rawUrl);

        const signRes = await fetch(signTarget.toString(), {
          headers: {
            "Referer": targetUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        const signData = await signRes.json();
        return res.json(signData);
      }

      const isWatchPlayerUnavailable = (content: string, url: string, status: number): boolean => {
        if (status >= 400) return true;
        const lowerUrl = (url || "").toLowerCase();
        if (lowerUrl.includes("/login") || lowerUrl.includes("/admin") || lowerUrl.includes("/painel")) return true;
        const lower = (content || "").toLowerCase();
        if (
          lower.includes("login-card") ||
          lower.includes("login-page") ||
          lower.includes("entrar • myplayer") ||
          lower.includes("painel administrativo") ||
          (lower.includes("myplayer") && (lower.includes("bem-vindo") || lower.includes("bem vindo"))) ||
          lower.includes("série não encontrada") ||
          lower.includes("serie não encontrada") ||
          lower.includes("filme não encontrado") ||
          lower.includes("acesso protegido por sessão segura")
        ) {
          return true;
        }
        return false;
      };

      const parsedTarget = new URL(targetUrl);
      let effectiveTargetUrl = targetUrl;
      let upstreamRes = await fetch(effectiveTargetUrl, {
        headers: {
          "Referer": parsedTarget.origin + "/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        redirect: "manual",
      });

      let html = "";
      let isUnavailable = false;

      // Trata redirecionamentos manuais (evitando seguir para telas de login / painel administrativo)
      if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
        const loc = upstreamRes.headers.get("location") || "";
        if (loc.includes("/login") || loc.includes("/admin") || loc.includes("/painel")) {
          isUnavailable = true;
        } else {
          try {
            const redirectedUrl = new URL(loc, effectiveTargetUrl).toString();
            effectiveTargetUrl = redirectedUrl;
            upstreamRes = await fetch(effectiveTargetUrl, {
              headers: {
                "Referer": parsedTarget.origin + "/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
              redirect: "manual",
            });
          } catch (e) {
            isUnavailable = true;
          }
        }
      }

      if (upstreamRes.status === 200) {
        html = await upstreamRes.text();
        if (isWatchPlayerUnavailable(html, effectiveTargetUrl, upstreamRes.status)) {
          isUnavailable = true;
        }
      } else {
        isUnavailable = true;
      }

      // Se a rota padrão falhou (ex: 404 ou login), tenta alternar automaticamente entre /tvshow/ e /series/
      if (isUnavailable) {
        const alternateVariants: string[] = [];
        if (effectiveTargetUrl.includes("/tvshow/")) {
          alternateVariants.push(effectiveTargetUrl.replace("/tvshow/", "/series/"));
          alternateVariants.push(effectiveTargetUrl.replace("/tvshow/", "/serie/"));
        } else if (effectiveTargetUrl.includes("/series/")) {
          alternateVariants.push(effectiveTargetUrl.replace("/series/", "/tvshow/"));
          alternateVariants.push(effectiveTargetUrl.replace("/series/", "/serie/"));
        } else if (effectiveTargetUrl.includes("/serie/")) {
          alternateVariants.push(effectiveTargetUrl.replace("/serie/", "/series/"));
          alternateVariants.push(effectiveTargetUrl.replace("/serie/", "/tvshow/"));
        }

        for (const altUrl of alternateVariants) {
          try {
            const altRes = await fetch(altUrl, {
              headers: {
                "Referer": new URL(altUrl).origin + "/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
              redirect: "manual",
            });
            if (altRes.status === 200) {
              const altText = await altRes.text();
              if (!isWatchPlayerUnavailable(altText, altUrl, altRes.status)) {
                effectiveTargetUrl = altUrl;
                upstreamRes = altRes;
                html = altText;
                isUnavailable = false;
                break;
              }
            }
          } catch (e) {}
        }
      }

      if (isUnavailable) {
        console.warn(`[WatchPlayer Stream Status ${upstreamRes.status}]: Episódio não encontrado ou tela de login no WatchPlayer (${effectiveTargetUrl}). Acionando fallback.`);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(404).send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <style>
              html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
            </style>
          </head>
          <body>
            <script>
              try {
                window.parent.postMessage({ 
                  type: "WATCHPLAY_UNAVAILABLE", 
                  reason: "content_not_found"
                }, "*");
              } catch(e) {}
            </script>
          </body>
          </html>
        `);
      }

      // 0.0 Se o WatchPlayer retornou uma página de escolha de players intermediária (ex: "Escolha uma opção de player"),
      // auto-seleciona a opção prioritária (Dublado PT-BR / ?player=0) no próprio servidor de forma invisível
      if (
        html.includes("player-choice") ||
        html.includes("player-choice-option") ||
        html.includes("player-choice-title") ||
        /Escolha uma op[çc][ãa]o/i.test(html)
      ) {
        const optionMatches = [
          ...html.matchAll(/<a[^>]*class=["'][^"']*player-choice-option[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)
        ];
        let selectedHref = "";
        // Prioriza estritamente Dublado PT-BR
        for (const match of optionMatches) {
          const href = match[1];
          const text = match[2];
          if (/dublado|pt-br|nacional|portugu/i.test(text)) {
            selectedHref = href;
            break;
          }
        }
        if (!selectedHref && optionMatches.length > 0) {
          selectedHref = optionMatches[0][1];
        }
        if (!selectedHref && !effectiveTargetUrl.includes("player=")) {
          selectedHref = "?player=0";
        }

        if (selectedHref) {
          const choiceUrl = new URL(selectedHref, effectiveTargetUrl).toString();
          console.log(`[WatchPlayer Stream] Auto-resolvendo tela de opções para o player direto: ${choiceUrl}`);
          effectiveTargetUrl = choiceUrl;
          try {
            const choiceRes = await fetch(effectiveTargetUrl, {
              headers: {
                "Referer": parsedTarget.origin + "/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
              redirect: "manual",
            });
            if (choiceRes.status === 200) {
              const choiceHtml = await choiceRes.text();
              if (!isWatchPlayerUnavailable(choiceHtml, effectiveTargetUrl, choiceRes.status)) {
                html = choiceHtml;
              } else {
                isUnavailable = true;
              }
            } else {
              isUnavailable = true;
            }
          } catch (err: any) {
            console.warn("[WatchPlayer Choice Resolution Error]:", err.message);
            isUnavailable = true;
          }

          if (isUnavailable) {
            console.warn(`[WatchPlayer Stream]: Opção de player inválida ou inacessível (${effectiveTargetUrl}). Acionando fallback.`);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.status(404).send(`
              <!DOCTYPE html>
              <html lang="pt-BR">
              <head>
                <meta charset="utf-8">
                <style>
                  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
                </style>
              </head>
              <body>
                <script>
                  try {
                    window.parent.postMessage({ 
                      type: "WATCHPLAY_UNAVAILABLE", 
                      reason: "choice_unavailable"
                    }, "*");
                  } catch(e) {}
                </script>
              </body>
              </html>
            `);
          }
        }
      }

      // 0. Bloqueio definitivo do Superflix via heurística robusta (regex multi-domínio, meta refresh, scripts e redirects)
      const isFallbackMode = isSuperflixDetected(html, effectiveTargetUrl) || (upstreamRes.url ? isSuperflixDetected("", upstreamRes.url) : false);

      if (isFallbackMode) {
        console.warn(`[Superflix Banido]: WatchPlayer tentou redirecionar para Superflix (${effectiveTargetUrl}). Bloqueando e acionando fallback.`);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(404).send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <style>
              html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
            </style>
          </head>
          <body>
            <script>
              try {
                window.parent.postMessage({ 
                  type: "WATCHPLAY_UNAVAILABLE", 
                  reason: "superflix_banned" 
                }, "*");
              } catch(e) {}
            </script>
          </body>
          </html>
        `);
      }

      // 0.1 Remoção do devtools detector e scripts que redirecionam para tela preta/404
      html = html.replace(/<script[^>]*devtools[^>]*><\/script>/gi, "");
      html = html.replace(/<script[^>]*analytics\.js[^>]*><\/script>/gi, "");
      html = html.replace(/<script[^>]*>[\s\S]*?devtoolsDetector[\s\S]*?<\/script>/gi, "");

      // 1. Ativar AUTO_PLAY_ENABLED no player oficial
      html = html.replace(/var AUTO_PLAY_ENABLED = false;/g, "var AUTO_PLAY_ENABLED = true;");
      html = html.replace(/AUTO_PLAY_ENABLED && options\.length == 1/g, "true");

      // 2. Redirecionar requisições da API interna para o proxy local e garantir carregamento dos assets
      html = html.replace(/var HOME_URL = ['"]https:\/\/v1\.watchplay\.shop['"];/g, "var HOME_URL = '/api/watchplay-proxy';");
      html = html.replace(/\$\{HOME_URL\}\/api/g, "/api/watchplay-proxy-api");
      html = html.replace(/src=["']\/assets\//g, 'src="https://v1.watchplay.shop/assets/');
      html = html.replace(/href=["']\/assets\//g, 'href="https://v1.watchplay.shop/assets/');

      // 3. Remover rastreadores, banners conhecidos, loaders nativos e telas de escolha
      html = html.replace(/_wau\.push\([^)]*\);?/g, "");
      html = html.replace(/<main[^>]*class=["'][^"']*player-choice[^"']*["'][^>]*>[\s\S]*?<\/main>/gi, "");
      html = html.replace(/<a[^>]*class=["'][^"']*player-back-options[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "");
      html = html.replace(/<div[^>]*class=["'][^"']*changeOptions[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");
      html = html.replace(/Mostrar\s*Op[çc][õo]es/gi, "");
      html = html.replace(/\$\('body'\)\.append\(`<div class="player_loading">[\s\S]*?<\/div>`\);/g, "/* player_loading bloqueado */");
      html = html.replace(/\$\('body'\)\.append\(textoContexto\);/g, "/* notify bloqueado */");

      // 4. Inutilizar todos os controles e overlays nativos do Artplayer na própria inicialização
      html = html.replace(/setting:\s*true,/g, "setting: false,");
      html = html.replace(/pip:\s*true,/g, "pip: false,");
      html = html.replace(/playbackRate:\s*true,/g, "playbackRate: false,");
      html = html.replace(/aspectRatio:\s*true,/g, "aspectRatio: false,");
      html = html.replace(/lock:\s*true,/g, "lock: false,");
      html = html.replace(/fastForward:\s*true,/g, "fastForward: false,");
      html = html.replace(/autoOrientation:\s*true,/g, "autoOrientation: false,");
      html = html.replace(/fullscreen:\s*true,/g, "fullscreen: false,");
      html = html.replace(/fullscreenWeb:\s*true,/g, "fullscreenWeb: false,");

      // 4.0 Suporte robusto a filmes diretos com createMyPlayer e Artplayer
      html = html.replace(/createMyPlayer\(\s*\{/g, "window.artInstance = createMyPlayer({ autoplay: true, ");
      html = html.replace(/autoplay:\s*false/g, "autoplay: true");

      html = html.replace(
        /artInstance = new Artplayer\(\{/g,
        `artInstance = new Artplayer({
            controls: [],
            hotkey: false,
            gesture: false,
            miniProgressBar: false,
            backdrop: false,
            playsInline: true,
            autoPlayback: false,
            icons: { state: '' },`
      );

      // 4.1 Otimização de Buffer e ABR estilo Netflix no Hls.js
      html = html.replace(
        /maxBufferLength:\s*10,\s*maxMaxBufferLength:\s*20/g,
        `enableWorker: true,
         lowLatencyMode: false,
         maxBufferLength: 60,
         maxMaxBufferLength: 120,
         maxBufferSize: 100 * 1000 * 1000,
         maxBufferHole: 0.5,
         backBufferLength: 90,
         abrEwmaDefaultEstimate: 4000000,
         abrBandWidthFactor: 0.85,
         abrBandWidthUpFactor: 0.7,
         fragLoadingMaxRetry: 6,
         manifestLoadingMaxRetry: 6,
         levelLoadingMaxRetry: 6,
         fragLoadingRetryDelay: 500`
      );

      // 5. Ocultar seletores nativos e carrossel de episódios no HTML inicial
      html = html.replace(
        /<div class="players_select_container">/g,
        '<div class="players_select_container" style="display:none !important; opacity:0 !important; visibility:hidden !important; pointer-events:none !important;">'
      );
      html = html.replace(
        /<div class="player_container">/g,
        '<div class="player_container visible" style="position:absolute !important; top:0 !important; left:0 !important; width:100% !important; height:100% !important; transition:none !important;">'
      );

      // 5.1 Garantir que todos os scripts, estilos e fontes carreguem da CDN oficial sem depender de roteamento relativo de deploy (evita 404 no Vercel/Cloud Run)
      html = html.replace(/(src|href)=["']\/assets\/([^"']+)["']/gi, '$1="https://v1.watchplay.shop/assets/$2"');
      html = html.replace(/<head>/i, '<head><base href="https://v1.watchplay.shop/">');

      // 6. Injetar CSS de blackout absoluto e script de monitoramento no <head>
      const autoPlayInjection = `
        <style>
          * {
            -webkit-tap-highlight-color: transparent !important;
          }

          html, body {
            background: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            overflow: hidden !important;
          }

          /* Oculta tudo que não for o vídeo: seletores de opções, carrossel, banners, toasts e loaders nativos */
          .players_select_container,
          .player-choice,
          .player-choice-card,
          .player-choice-options,
          .player-choice-option,
          .player-back-options,
          #player-choice-title,
          [class*="player-choice"],
          [class*="player-back"],
          .seasonepisodeSelector,
          .seasonSelector,
          .episodeSelector,
          .player_select_item,
          .player_loading,
          .changeOptions,
          .changeEpisode,
          .btn-opcoes,
          .mostrar_opcoes,
          #mostrar_opcoes,
          .embedder_especial,
          .embedder_info,
          .shion_native_notify_system,
          #_wau_container,
          [class*="player_loading"],
          [class*="seasonepisode"],
          [class*="select_language"],
          [class*="languages_selector"],
          [class*="changeOptions"],
          [class*="players_select"],
          [class*="option"],
          [id*="option"] {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            z-index: -9999 !important;
          }

          /* Container do player e raiz do Artplayer: SEMPRE visíveis e em tela cheia */
          .player_container,
          .player_container.visible,
          .player_container .infra,
          #artplayer-container,
          #tv-player,
          .art-video-player {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            opacity: 1 !important;
            visibility: visible !important;
            transition: none !important;
            transform: none !important;
            background: #000 !important;
            pointer-events: auto !important;
          }

          /* O vídeo original é a única coisa exibida com foco total */
          video,
          .art-video,
          .art-video-player video {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
            opacity: 1 !important;
            visibility: visible !important;
            background: #000 !important;
            z-index: 5 !important;
          }

          /* BLINDAGEM COMPLETA DOS CONTROLES NATIVOS DO ARTPLAYER:
             Oculta a barra de controles e menus nativos para a Skin Netflix assumir,
             mas NUNCA destrói a camada de vídeo nem impede o funcionamento do player. */
          .art-top,
          .art-bottom,
          .art-controls,
          .art-controls-left,
          .art-controls-center,
          .art-controls-right,
          .art-settings,
          .art-setting,
          .art-subtitle-setting,
          .art-contextmenu,
          .art-danmuku,
          .art-fast-forward,
          .art-lock,
          .art-poster,
          .art-notice,
          .art-notice-inner,
          .art-info,
          .art-info-panel,
          .art-progress,
          .art-progress-loaded,
          .art-progress-played,
          .art-progress-highlight,
          .art-progress-tip,
          .art-control,
          .art-control-fullscreen,
          .art-control-volume,
          .art-control-play,
          .art-control-time,
          [class*="art-control"],
          .art-volume-panel,
          .art-icon-state,
          .wp-seek-10,
          .wp-seek-back,
          .wp-seek-forward,
          [class*="wp-seek"],
          #pip-skip-intro-btn,
          #pip-skip-toast,
          #tv-player .art-bottom,
          #tv-player .art-controls,
          #tv-player [class*="art-control"],
          #tv-player .art-progress {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            animation: none !important;
          }

          /* Ocultar elementos de estado sem usar display: none para não quebrar o Artplayer */
          .art-state,
          .art-layer-state,
          .art-loading,
          .art-layer-loading,
          .art-mask {
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            animation: none !important;
          }
        </style>

        <script>
          (function() {
            // 0. Otimização Agressiva de Buffer e Fast-Seek no Hls.js
            function applyHlsFastSeekConfig(cfg) {
              if (!cfg) return;
              try {
                cfg.enableWorker = true;
                cfg.lowLatencyMode = false;
                cfg.maxBufferLength = 60; // 60s de buffer à frente para busca ágil
                cfg.maxMaxBufferLength = 120; // 120s mantidos conforme requisitado
                cfg.backBufferLength = 90; // Libera imediatamente segmentos passados da memória
                cfg.maxBufferSize = 100 * 1000 * 1000;
                cfg.maxBufferHole = 0.5;
                cfg.nudgeOffset = 0.15; // Nudge automático para transpor gaps de keyframe
                cfg.nudgeMaxRetry = 6;
                cfg.maxFragLookUpTolerance = 0.25;
                cfg.highBufferWatchdogPeriod = 1.5;
                cfg.startFragPrefetch = true; // Pré-busca o próximo segmento ao avançar
                cfg.progressive = true; // Decodificação progressiva imediata
                cfg.fragLoadingTimeOut = 20000;
                cfg.fragLoadingMaxRetry = 6;
                cfg.fragLoadingRetryDelay = 500;
                cfg.levelLoadingTimeOut = 20000;
                cfg.levelLoadingMaxRetry = 6;
                cfg.manifestLoadingTimeOut = 20000;
                cfg.manifestLoadingMaxRetry = 6;
              } catch(err) {}
            }

            function patchHlsConstructor(HlsClass) {
              if (!HlsClass || HlsClass.__patchedFastSeek) return HlsClass;
              var OrigHls = HlsClass;
              function PatchedHls(config) {
                config = config || {};
                applyHlsFastSeekConfig(config);
                var inst = new OrigHls(config);
                window.__lastHlsInstance = inst;
                return inst;
              }
              PatchedHls.prototype = OrigHls.prototype;
              Object.keys(OrigHls).forEach(function(k) {
                try { PatchedHls[k] = OrigHls[k]; } catch(e) {}
              });
              if (OrigHls.DefaultConfig) {
                applyHlsFastSeekConfig(OrigHls.DefaultConfig);
                PatchedHls.DefaultConfig = OrigHls.DefaultConfig;
              }
              PatchedHls.__patchedFastSeek = true;
              return PatchedHls;
            }

            if (window.Hls) {
              window.Hls = patchHlsConstructor(window.Hls);
            }
            try {
              var _Hls = window.Hls;
              Object.defineProperty(window, 'Hls', {
                configurable: true,
                enumerable: true,
                get: function() { return _Hls; },
                set: function(val) {
                  _Hls = patchHlsConstructor(val);
                }
              });
            } catch(e) {}

            // 1. MutationObserver que oculta overlays nativos adicionados dinamicamente
            // CUIDADO: não ocultar 'art-video-player' (container raiz) nem elementos de vídeo
            var observer = new MutationObserver(function(mutations) {
              for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                  var node = added[j];
                  if (node.nodeType !== 1) continue;
                  var cls = typeof node.className === 'string' ? node.className : '';
                  var tag = (node.tagName || '').toUpperCase();
                  // Nunca tocar no container raiz do Artplayer nem nos elementos de vídeo
                  if (cls.indexOf('art-video-player') !== -1 || tag === 'VIDEO') continue;
                  // Ocultar apenas elementos de overlay nativos desnecessários
                  if (
                    cls.indexOf('player_loading') !== -1 ||
                    cls.indexOf('shion_native') !== -1 ||
                    cls === 'art-state' ||
                    cls === 'art-mask' ||
                    cls === 'art-loading' ||
                    cls === 'art-notice' ||
                    cls === 'art-notice-inner'
                  ) {
                    if (cls !== 'art-state' && cls !== 'art-mask' && cls !== 'art-loading') {
                      node.style.setProperty('display', 'none', 'important');
                    }
                    node.style.setProperty('opacity', '0', 'important');
                    node.style.setProperty('visibility', 'hidden', 'important');
                    node.style.setProperty('pointer-events', 'none', 'important');
                  }
                }
              }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });

            // 2. Auto-Start rápido e resiliente para filmes e séries
            var tries = 0;
            var optionClicked = false;
            var autoStartTimer = setInterval(function() {
              tries++;

              // D) Detecção proativa do vídeo (Filmes via #tv-player e Séries)
              var v = getVideoElement();
              if (v) {
                // Se o vídeo estiver pausado mas já com metadados ou pronto, tenta dar play
                if (v.paused && (v.readyState >= 1 || v.currentTime > 0)) {
                  v.play().catch(function() {
                    v.muted = true;
                    v.play().catch(function() {});
                  });
                }
                // Se já possui duração válida ou está reproduzindo, envia status e estabiliza
                if ((v.duration > 0 && !isNaN(v.duration)) || v.currentTime > 0 || !v.paused) {
                  sendPlayerStatus(v);
                  if (!v.paused) {
                    clearInterval(autoStartTimer);
                    return;
                  }
                }
              }

              // A) Séries: aciona getepi imediatamente no episódio selecionado sem esperar dezenas de miniaturas
              var ep = document.querySelector('.episodeOption.active') || document.querySelector('.episodeOption');
              if (ep && window.$ && typeof window.getepi === 'function' && !window._epAutoTriggered) {
                window._epAutoTriggered = true;
                window.$(ep).removeClass('active');
                window.getepi(window.$(ep));
              }

              // B) Seletor de áudio (Dublado preferencialmente)
              var dublado = document.querySelector('.select_language[data-target="1"]');
              if (dublado && !dublado.classList.contains('active')) {
                dublado.click();
              }

              // C) Clica na opção de player assim que surgir (preferindo sempre versões com qualidade normal HD/FHD)
              if (!optionClicked) {
                var choiceOptions = Array.prototype.slice.call(document.querySelectorAll('.player-choice-option, a[href*="player="]'));
                if (choiceOptions.length > 0) {
                  // Filtra priorizando opções que NÃO sejam CAM/Cinema
                  var bestChoice = null;
                  var bestScore = -999;
                  for (var c = 0; c < choiceOptions.length; c++) {
                    var txt = (choiceOptions[c].textContent || '').toLowerCase();
                    var href = choiceOptions[c].getAttribute('href') || '';
                    var score = 0;
                    if (txt.includes('cam') || txt.includes('cinema') || txt.includes('ts') || href.includes('cam')) score -= 100;
                    if (txt.includes('dublado') || txt.includes('pt-br')) score += 10;
                    if (txt.includes('hd') || txt.includes('fhd') || txt.includes('1080')) score += 50;
                    
                    score += (c * 0.1); // Desempate preferindo as últimas opções (frequentemente as em HD)
                    
                    if (score > bestScore) {
                      bestScore = score;
                      bestChoice = choiceOptions[c];
                    }
                  }

                  if (!bestChoice) {
                    bestChoice = choiceOptions[choiceOptions.length - 1];
                  }

                  if (bestChoice && bestChoice.getAttribute('href')) {
                    optionClicked = true;
                    var optHref = bestChoice.getAttribute('href');
                    if (optHref) window.location.href = optHref;
                    return;
                  }
                }

                var selectItems = Array.prototype.slice.call(document.querySelectorAll('.players_select_items.visible .player_select_item, .player_select_item'));
                if (selectItems.length > 0) {
                  var bestItem = null;
                  var bestItemScore = -999;
                  for (var s = 0; s < selectItems.length; s++) {
                    var sTxt = (selectItems[s].textContent || '').toLowerCase();
                    var score = 0;
                    if (sTxt.includes('cam') || sTxt.includes('cinema') || sTxt.includes('ts')) score -= 100;
                    if (sTxt.includes('dublado') || sTxt.includes('pt-br')) score += 10;
                    if (sTxt.includes('hd') || sTxt.includes('fhd') || sTxt.includes('1080')) score += 50;
                    
                    score += (s * 0.1);
                    
                    if (score > bestItemScore) {
                      bestItemScore = score;
                      bestItem = selectItems[s];
                    }
                  }
                  if (!bestItem) {
                    bestItem = selectItems[selectItems.length - 1];
                  }
                  optionClicked = true;
                  bestItem.click();
                } else if (!document.querySelector('#tv-player') && !document.querySelector('video') && !window.artInstance) {
                  // Só aciona indisponibilidade se NÃO for um player direto de filme (#tv-player) e não houver vídeo após tempo razoável
                  if (tries > 40 && document.querySelectorAll(".player_select_item").length === 0) {
                    clearInterval(autoStartTimer);
                    try { window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "no_sources" }, "*"); } catch(e){}
                    return;
                  }
                }
              }

              // Timeout após 100 ticks (6.0 segundos sem stream válido)
              if (tries > 100) {
                clearInterval(autoStartTimer);
                if (!v || (!v.duration && v.currentTime === 0 && v.paused)) {
                  try {
                    window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "timeout_no_stream" }, "*");
                  } catch(e) {}
                }
              }
            }, 60);

            // 3. Funções de controle de vídeo e telemetria para o NetflixPlayerSkin
            var introSkippedForCurrentVideo = false;
            var skipDurationSeconds = 85;
            try {
              skipDurationSeconds = parseInt(localStorage.getItem("playinfinity_skip_duration") || "85", 10);
            } catch(e) {}

            function getVideoElement() {
              if (window.artInstance && window.artInstance.video) {
                return window.artInstance.video;
              }
              return document.querySelector("video");
            }

            function triggerPlay() {
              if (window.artInstance && typeof window.artInstance.play === "function") {
                try { window.artInstance.play(); } catch(e) {}
              }
              var v = getVideoElement();
              if (v) {
                v.play().catch(function() {
                  v.muted = true;
                  v.play().catch(function() {});
                });
                sendPlayerStatus(v);
              }
            }

            function triggerPause() {
              if (window.artInstance && typeof window.artInstance.pause === "function") {
                try { window.artInstance.pause(); } catch(e) {}
              }
              var v = getVideoElement();
              if (v) {
                v.pause();
                sendPlayerStatus(v);
              }
            }

            function triggerTogglePlay() {
              if (window.artInstance && typeof window.artInstance.toggle === "function") {
                try {
                  window.artInstance.toggle();
                  var v = getVideoElement();
                  if (v) sendPlayerStatus(v);
                  return;
                } catch(e) {}
              }
              var v = getVideoElement();
              if (v) {
                if (v.paused) {
                  triggerPlay();
                } else {
                  triggerPause();
                }
              }
            }

            function doSkipIntro(seconds) {
              var sec = Number(seconds) !== undefined && !isNaN(Number(seconds)) ? Number(seconds) : (skipDurationSeconds || 85);
              var video = getVideoElement();
              if (video) {
                var current = video.currentTime || 0;
                var duration = video.duration || 3600;
                var targetTime = Math.max(0, Math.min(current + sec, duration - 10));
                
                try {
                  video.currentTime = targetTime;
                } catch(e) {}

                if (window.artInstance) {
                  try {
                    window.artInstance.currentTime = targetTime;
                  } catch(e) {}
                }

                if (sec > 0) {
                  introSkippedForCurrentVideo = true;
                }

                try {
                  window.parent.postMessage({ 
                    type: "WATCHPLAY_INTRO_SKIPPED", 
                    seconds: sec, 
                    newTime: targetTime 
                  }, "*");
                } catch(e) {}
              }
            }

            var seekStallWatchdog = null;
            function monitorSeekProgress(targetTime) {
              if (seekStallWatchdog) clearInterval(seekStallWatchdog);
              var checkCount = 0;
              var lastPos = targetTime;
              seekStallWatchdog = setInterval(function() {
                checkCount++;
                var v = getVideoElement();
                if (!v) {
                  if (checkCount > 10) clearInterval(seekStallWatchdog);
                  return;
                }
                // Se o vídeo já está avançando normalmente
                if (Math.abs(v.currentTime - lastPos) > 0.15) {
                  clearInterval(seekStallWatchdog);
                  return;
                }
                // Verifica se a posição já está em buffer na memória
                var isBuffered = false;
                if (v.buffered && v.buffered.length > 0) {
                  for (var b = 0; b < v.buffered.length; b++) {
                    if (v.currentTime >= v.buffered.start(b) - 0.2 && v.currentTime <= v.buffered.end(b) + 0.2) {
                      isBuffered = true;
                      break;
                    }
                  }
                }
                // Se já baixou no buffer mas travou em gap de keyframe
                if (isBuffered && checkCount >= 3) {
                  try {
                    v.currentTime = v.currentTime + 0.12;
                  } catch(err) {}
                  v.play().catch(function() {});
                  clearInterval(seekStallWatchdog);
                  return;
                }
                // Se ainda está baixando da rede, apenas garante que o HLS está carregando
                var activeHls = (window.artInstance && window.artInstance.hls) || window.__lastHlsInstance;
                if (activeHls && typeof activeHls.startLoad === "function") {
                  try { activeHls.startLoad(targetTime); } catch(err) {}
                }
                if (!v.paused) {
                  v.play().catch(function() {});
                }
                lastPos = v.currentTime;
                if (checkCount > 10) clearInterval(seekStallWatchdog);
              }, 400);
            }

            // Tecla S manual
            window.addEventListener("keydown", function(e) {
              if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
              if (e.key === "s" || e.key === "S") {
                e.preventDefault();
                doSkipIntro(skipDurationSeconds);
              }
            });

            // Mensagens enviadas pela Skin Netflix VIP
            window.addEventListener("message", function(e) {
              if (!e.data) return;
              var v = getVideoElement();

              switch (e.data.type) {
                case "SKIP_INTRO":
                  doSkipIntro(e.data.seconds || skipDurationSeconds);
                  break;

                case "PLAY":
                  triggerPlay();
                  break;

                case "PAUSE":
                  triggerPause();
                  break;

                case "TOGGLE_PLAY":
                  triggerTogglePlay();
                  break;

                case "SEEK":
                case "SEEK_ABSOLUTE":
                  var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                  if (typeof t === "number" && !isNaN(t)) {
                    var maxDur = (v && v.duration > 0) ? v.duration : ((window.artInstance && window.artInstance.duration > 0) ? window.artInstance.duration : 99999);
                    var targetTime = Math.max(0, Math.min(t, maxDur - 0.5));
                    var activeHls = (window.artInstance && window.artInstance.hls) || window.__lastHlsInstance;
                    if (activeHls && typeof activeHls.startLoad === "function") {
                      try { activeHls.startLoad(targetTime); } catch(err) {}
                    }
                    if (window.artInstance) {
                      try { window.artInstance.seek = targetTime; } catch(err) {}
                      try { window.artInstance.currentTime = targetTime; } catch(err) {}
                    }
                    if (v) {
                      try { v.currentTime = targetTime; } catch(err) {}
                      sendPlayerStatus(v);
                      if (e.data.resumePlay || (e.data.wasPlaying !== false && !v.paused)) {
                        v.play().catch(function() {});
                      }
                    }
                    monitorSeekProgress(targetTime);
                  }
                  break;

                case "SEEK_RELATIVE":
                  if (typeof e.data.seconds === "number" && !isNaN(e.data.seconds)) {
                    var curT = (v && typeof v.currentTime === "number") ? v.currentTime : ((window.artInstance && window.artInstance.currentTime) || 0);
                    var maxD = (v && v.duration > 0) ? v.duration : ((window.artInstance && window.artInstance.duration > 0) ? window.artInstance.duration : 99999);
                    var newTime = typeof e.data.time === "number" && !isNaN(e.data.time)
                      ? Math.max(0, Math.min(e.data.time, maxD - 0.5))
                      : Math.max(0, Math.min(curT + e.data.seconds, maxD - 0.5));
                    var activeHlsRel = (window.artInstance && window.artInstance.hls) || window.__lastHlsInstance;
                    if (activeHlsRel && typeof activeHlsRel.startLoad === "function") {
                      try { activeHlsRel.startLoad(newTime); } catch(err) {}
                    }
                    if (window.artInstance) {
                      try { window.artInstance.seek = newTime; } catch(err) {}
                      try { window.artInstance.currentTime = newTime; } catch(err) {}
                    }
                    if (v) {
                      try { v.currentTime = newTime; } catch(err) {}
                      sendPlayerStatus(v);
                      if (e.data.resumePlay || (e.data.wasPlaying !== false && !v.paused)) {
                        v.play().catch(function() {});
                      }
                    }
                    monitorSeekProgress(newTime);
                  }
                  break;

                case "SET_VOLUME":
                  if (v && typeof e.data.volume === "number") {
                    var vol = Math.max(0, Math.min(1, e.data.volume));
                    v.volume = vol;
                    v.muted = (vol === 0);
                    sendPlayerStatus(v);
                  }
                  break;

                case "SET_MUTED":
                  if (v) {
                    v.muted = !!e.data.muted;
                    sendPlayerStatus(v);
                  }
                  break;

                case "SET_PLAYBACK_RATE":
                  if (v && typeof e.data.rate === "number") {
                    v.playbackRate = e.data.rate;
                    sendPlayerStatus(v);
                  }
                  break;

                case "SET_SKIP_DURATION":
                  if (e.data.seconds) {
                    skipDurationSeconds = Number(e.data.seconds);
                    try {
                      localStorage.setItem("playinfinity_skip_duration", String(skipDurationSeconds));
                    } catch(err) {}
                  }
                  break;

                case "TOGGLE_PIP":
                case "REQUEST_PIP":
                  if (v) {
                    try {
                      if (document.pictureInPictureElement) {
                        document.exitPictureInPicture().catch(function() {});
                      } else if (v.requestPictureInPicture) {
                        v.requestPictureInPicture().catch(function() {});
                      }
                    } catch(err) {}
                  }
                  break;

                case "REQUEST_STATUS":
                  sendPlayerStatus(v);
                  break;
              }
            });

            // Envia telemetria limpa para a Skin Netflix do aplicativo principal
            function sendPlayerStatus(v) {
              if (!v) v = getVideoElement();
              if (!v) return;
              try {
                var bufferedEnd = 0;
                if (v.buffered && v.buffered.length > 0) {
                  bufferedEnd = v.buffered.end(v.buffered.length - 1);
                }
                var dur = v.duration;
                if ((!dur || isNaN(dur) || dur === Infinity) && window.artInstance && window.artInstance.duration) {
                  dur = window.artInstance.duration;
                }
                if (!dur || isNaN(dur) || dur === Infinity) {
                  dur = 0;
                }
                window.parent.postMessage({
                  type: "WATCHPLAY_STATUS",
                  currentTime: v.currentTime || 0,
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

            var hasNotifiedEnded = false;
            function notifyEpisodeEnded() {
              if (hasNotifiedEnded) return;
              hasNotifiedEnded = true;
              try {
                window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
              } catch(e) {}
            }

            document.addEventListener('ended', function(e) {
              if (e.target && (e.target.tagName === 'VIDEO' || e.target.nodeName === 'VIDEO')) {
                notifyEpisodeEnded();
              }
            }, true);

            function handleVideoTimeUpdate(v) {
              if (!v) return;
              var cur = v.currentTime || 0;
              var dur = v.duration || 0;

              if (cur < 2 && introSkippedForCurrentVideo) {
                introSkippedForCurrentVideo = false;
              }

              if (cur >= 5 && cur <= 130 && !introSkippedForCurrentVideo) {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_INTRO_ACTIVE", active: true, currentTime: cur }, "*");
                } catch(e) {}
              } else {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_INTRO_ACTIVE", active: false, currentTime: cur }, "*");
                } catch(e) {}
              }

              if (dur > 30 && cur >= (dur - 1.5)) {
                notifyEpisodeEnded();
              }

              sendPlayerStatus(v);
            }

            setInterval(function() {
              var v = getVideoElement();
              if (v) {
                sendPlayerStatus(v);
                if (!v.paused) {
                  handleVideoTimeUpdate(v);
                }
              }
            }, 250);

            ['play', 'pause', 'playing', 'timeupdate', 'waiting', 'stalled', 'seeking', 'seeked', 'volumechange', 'ratechange', 'loadedmetadata', 'canplay'].forEach(function(evtName) {
              document.addEventListener(evtName, function(e) {
                if (e.target && (e.target.tagName === 'VIDEO' || e.target.nodeName === 'VIDEO')) {
                  sendPlayerStatus(e.target);
                }
              }, true);
            });

            // Detecção de erros no stream de vídeo ou perda de conexão para acionar fallback automático
            document.addEventListener('error', function(e) {
              if (e.target && (e.target.tagName === 'VIDEO' || e.target.nodeName === 'VIDEO')) {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "video_playback_error" }, "*");
                } catch(err) {}
              }
            }, true);

            window.addEventListener('offline', function() {
              try {
                window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "network_offline" }, "*");
              } catch(err) {}
            });

            // Blindagem do Artplayer: oculta controles via style (NÃO remove do DOM para não quebrar o player)
            var cleanArtNodes = function() {
              if (window.artInstance) {
                try {
                  if (window.artInstance.controls) window.artInstance.controls.show = false;
                } catch(e) {}
                // Ocultar via style apenas barras nativas de controle e avisos, sem bloquear a camada de vídeo e estado
                if (window.artInstance.template) {
                  ['$bottom', '$top', '$notice', '$controls', '$state', '$mask', '$loading'].forEach(function(k) {
                    try {
                      var el = window.artInstance.template[k];
                      if (el && el.style) {
                        if (k !== '$state' && k !== '$mask' && k !== '$loading') {
                          el.style.setProperty('display', 'none', 'important');
                        }
                        el.style.setProperty('opacity', '0', 'important');
                        el.style.setProperty('visibility', 'hidden', 'important');
                        el.style.setProperty('pointer-events', 'none', 'important');
                      }
                    } catch(e) {}
                  });
                }
              }
            };

            var artCheckInterval = setInterval(function() {
              if (window.artInstance) {
                cleanArtNodes();
                if (!window.artInstance._endedHooked) {
                  window.artInstance._endedHooked = true;
                  cleanArtNodes();
                  window.artInstance.on('ready', cleanArtNodes);
                  window.artInstance.on('video:play', cleanArtNodes);
                  window.artInstance.on('video:pause', cleanArtNodes);
                  window.artInstance.on('video:ended', notifyEpisodeEnded);
                  window.artInstance.on('error', function() {
                    try { window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "art_error" }, "*"); } catch(e) {}
                  });
                  window.artInstance.on('video:timeupdate', function() {
                    var v = window.artInstance.video;
                    if (v) handleVideoTimeUpdate(v);
                  });
                }
              }
            }, 300);
          })();
        </script>
      `;

      html = html.replace("</head>", `${autoPlayInjection}</head>`);

      // Verificação proativa de integridade da mídia no CDN (se retornar 404, aciona fallback para VIP Player imediatamente)
      const m3u8Match = html.match(/url:\s*["']([^"']+\.m3u8[^"']*)["']/i);
      if (m3u8Match) {
        let testUrl = m3u8Match[1].replace(/\\/g, "");
        try {
          const cdnCheck = await fetch(testUrl, {
            method: "HEAD",
            headers: { "Referer": effectiveTargetUrl, "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(1800)
          });
          if (cdnCheck.status === 404) {
            console.warn(`[WatchPlayer Stream]: CDN retornou 404 para o manifesto m3u8 (${testUrl}). Acionando indisponibilidade para fallback imediato.`);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.send(`
              <!DOCTYPE html>
              <html lang="pt-BR">
              <head><meta charset="utf-8"></head>
              <body style="background:#000;">
                <script>
                  try {
                    window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "cdn_404" }, "*");
                  } catch(e) {}
                </script>
              </body>
              </html>
            `);
          }
        } catch (e) {
          // Em caso de timeout ou falha de rede na verificação rápida, segue o fluxo normal
        }
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (err: any) {
      console.warn("[WatchPlayer Stream Error]:", err.message, "- Acionando fallback seguro.");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
          </style>
        </head>
        <body>
          <script>
            try {
              window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "stream_error" }, "*");
            } catch(e) {}
          </script>
        </body>
        </html>
      `);
    }
  });

// API 4.5: Proxy HLS Anti-CORS para reprodução direta sem bloqueios no Artplayer
  // API 4.8: Servidor Nativo Vixsrc com Stream Direto HLS em Artplayer com Skin Netflix
  // API 5: Servidor Nativo de Anime e Alternativas
  // API 6: Stream do WatchPlayer com Autoplay Imediato (sem ter que clicar em Opção 1)
  // ==========================================
  // API TV AO VIVO: PROXY HLS ANTI-CORS & CATÁLOGO DE CANAIS
  // ========================================================
  // Cache em memória de alta performance para chunks (.ts) de TV ao vivo (TTL de 15 segundos)
  
  

  router.get("/api/live-stream-proxy", async (req, res) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");

      if (req.method === "OPTIONS") {
        return res.status(204).end();
      }

      const rawUrl = req.query.url as string;
      if (!rawUrl) return res.status(400).send("URL ausente");

      let parsed: URL;
      try {
        parsed = new URL(rawUrl.trim());
      } catch {
        return res.status(400).send("Formato de URL inválido");
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return res.status(403).send("Protocolo inválido.");
      }

      if (isPrivateOrLocalIp(parsed.hostname)) {
        return res.status(403).send("Acesso a IP privado ou metadados de nuvem bloqueado (Anti-SSRF).");
      }

      // Verifica cache em memória apenas para manifestos/playlists (.m3u8), sem acumular vídeos pesados na RAM
      const isSegment = req.query.is_segment === "true" || rawUrl.includes(".ts") || rawUrl.includes(".m4s") || rawUrl.includes(".mp4");
      const isM3U8Request = rawUrl.includes(".m3u8");
      
      const cached = isM3U8Request ? liveChunkCache.get(rawUrl) : null;
      if (cached && cached.expires > Date.now()) {
        res.setHeader("Content-Type", cached.contentType);
        res.setHeader("Cache-Control", "public, max-age=2, immutable");
        res.setHeader("X-Cache-Status", "HIT-MEMORY");
        return res.send(cached.buffer);
      }

      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "X-Forwarded-For": "177.100.100.1" // Spoof IP brasileiro para CDNs com geo-bloqueio (Amagi FAST, Pluto TV)
      };

      if (req.query.referer) {
        headers["Referer"] = req.query.referer as string;
      }

      let currentUrl = rawUrl;
      let upstreamRes: Response | undefined;
      let redirects = 0;
      const MAX_REDIRECTS = 5;

      while (redirects < MAX_REDIRECTS) {
        upstreamRes = await fetch(currentUrl, {
          headers,
          redirect: "manual"
        });

        if ([301, 302, 303, 307, 308].includes(upstreamRes.status)) {
          const location = upstreamRes.headers.get("location");
          if (!location) break;

          let nextUrl: URL;
          try {
            nextUrl = new URL(location, currentUrl);
          } catch {
            return res.status(502).send("Location de redirecionamento inválido");
          }

          if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
            return res.status(403).send("Protocolo inválido no redirect.");
          }

          if (isPrivateOrLocalIp(nextUrl.hostname)) {
            return res.status(403).send("Redirecionamento para IP privado bloqueado (Anti-SSRF).");
          }

          currentUrl = nextUrl.toString();
          redirects++;
        } else {
          break;
        }
      }

      if (redirects >= MAX_REDIRECTS || !upstreamRes) {
        return res.status(502).send("Muitos redirecionamentos ou falha de proxy");
      }

      if (!upstreamRes.ok) {
        return res.status(upstreamRes.status).send(`Upstream status: ${upstreamRes.status}`);
      }

      const finalUrl = upstreamRes.url || currentUrl;
      const contentType = upstreamRes.headers.get("content-type") || "";
      const isM3U8 = rawUrl.includes(".m3u8") || 
                     finalUrl.includes(".m3u8") ||
                     contentType.includes("mpegurl") || 
                     contentType.includes("application/x-mpegURL") ||
                     contentType.includes("vnd.apple.mpegurl");

      if (isM3U8) {
        const text = await upstreamRes.text();
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=2, immutable");

        const lines = text.split("\n");
        const filteredLines: string[] = [];
        let skipNextLine = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();
          
          if (!trimmed) {
            filteredLines.push(line);
            continue;
          }

          if (skipNextLine && !trimmed.startsWith("#")) {
            skipNextLine = false;
            continue; // Pula a URI associada à qualidade baixa
          }
          skipNextLine = false;

          if (trimmed.startsWith("#EXT-X-STREAM-INF:")) {
            // Permitimos o ABR do hls.js cair até 480p em caso de internet ruim — isso é
            // essencial para ele conseguir se adaptar de verdade (ver nota anterior).
            // Abaixo de 480p (360p, 240p, etc.) a qualidade fica ruim demais para o padrão
            // do produto, então essas variantes continuam sendo removidas do manifesto.
            const resMatch = trimmed.match(/RESOLUTION=\d+x(\d+)/i);
            if (resMatch && parseInt(resMatch[1], 10) < 480) {
              skipNextLine = true;
              continue; // Pula esta tag e a próxima linha (URI)
            }
          }

          filteredLines.push(line);
        }

        let baseReferer = req.query.referer as string;
        if (!baseReferer) {
          try {
            baseReferer = new URL(finalUrl).origin + "/";
          } catch {
            baseReferer = "";
          }
        }
        const refererParam = baseReferer ? `&referer=${encodeURIComponent(baseReferer)}` : "";

        const rewritten = filteredLines.map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line;

          if (trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/, (match, uri) => {
              try {
                const fullUri = uri.startsWith("http") ? uri : new URL(uri, finalUrl).toString();
                if (fullUri.includes("plutotv.net")) return `URI="${fullUri}"`;
                return `URI="/api/live-stream-proxy?url=${encodeURIComponent(fullUri)}${refererParam}&is_segment=true"`;
              } catch {
                return `URI="${uri}"`;
              }
            });
          }

          if (trimmed.startsWith("#")) return trimmed;

          try {
            const fullSegUrl = trimmed.startsWith("http") ? trimmed : new URL(trimmed, finalUrl).toString();
            if (fullSegUrl.includes("plutotv.net")) return fullSegUrl;
            return `/api/live-stream-proxy?url=${encodeURIComponent(fullSegUrl)}${refererParam}&is_segment=true`;
          } catch {
            return trimmed;
          }
        }).join("\n");
        
        const rewrittenBuffer = Buffer.from(rewritten, "utf-8");
        liveChunkCache.set(rawUrl, {
          buffer: rewrittenBuffer,
          contentType: "application/vnd.apple.mpegurl; charset=utf-8",
          expires: Date.now() + 2500
        });

        return res.send(rewrittenBuffer);
      }

      // Se não for M3U8 e for uma requisição direta de canal MPEG-TS (sem ser requisição de segmento interno),
      // gera uma playlist HLS sob demanda para que reprodutores HLS/Hls.js no navegador possam reproduzir o stream MPEG-TS
      if (req.query.is_segment !== "true" && (rawUrl.includes("up.kiwi") || contentType.includes("mp2t") || finalUrl.endsWith(".ts"))) {
        // Libera explicitamente o corpo upstream e o socket TCP para evitar vazamento de descritores/memória
        try {
          upstreamRes.body?.cancel().catch(() => {});
        } catch (_) {}

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        const seq = Math.floor(Date.now() / 4000);
        const manifest = [
          "#EXTM3U",
          "#EXT-X-VERSION:3",
          "#EXT-X-TARGETDURATION:6",
          `#EXT-X-MEDIA-SEQUENCE:${seq}`,
          "#EXTINF:6.0,",
          `/api/live-stream-proxy?url=${encodeURIComponent(finalUrl)}&is_segment=true&_ts=${Date.now()}`
        ].join("\n");
        return res.send(manifest);
      }

      let finalContentType = contentType || "video/MP2T";
      if (req.query.is_segment === "true" || isSegment) {
        finalContentType = "video/MP2T";
      }
      res.setHeader("Content-Type", finalContentType);
      res.setHeader("Cache-Control", "public, max-age=15");

      if (upstreamRes.body) {
        // Stream directly to HTTP response with cutoff protection for infinite TS live streams
        const stream = Readable.fromWeb(upstreamRes.body as any);
        const isContinuousTs = req.query.is_segment === "true" && (rawUrl.includes("up.kiwi") || finalUrl.endsWith(".ts") || contentType.includes("mp2t"));
        let cutoff: NodeJS.Timeout | null = null;
        
        if (isContinuousTs) {
          cutoff = setTimeout(() => {
            try {
              stream.unpipe(res);
              stream.destroy();
              res.end();
            } catch (_) {}
          }, 6000);
        }

        const clearCutoff = () => {
          if (cutoff) {
            clearTimeout(cutoff);
            cutoff = null;
          }
        };

        stream.on("end", clearCutoff);
        stream.on("close", clearCutoff);
        stream.on("error", clearCutoff);
        res.on("close", () => {
          clearCutoff();
          try {
            stream.destroy();
          } catch (_) {}
        });

        return stream.pipe(res);
      } else {
        const buffer = Buffer.from(await upstreamRes.arrayBuffer());
        return res.send(buffer);
      }
    } catch (err: any) {
      console.error("[Live Stream Proxy Error]:", err?.message || err, "URL:", req.query?.url);
      return res.status(500).send("Proxy error");
    }
  });

// API: MyEmbed / Playerflix VIP Player com Extração Direta de Stream e Escudo Anti-Popups
  router.get("/api/myembed-stream", async (req, res) => {
    try {
      const rawId = (req.query.id as string) || (req.query.url as string) || "tt22084616";
      const idMatch = rawId.match(/(?:filme|movie|serie|series|tvshow|tv)\/([a-zA-Z0-9_-]+)/i) || rawId.match(/(tt\d+|\d+)/);
      const id = idMatch ? idMatch[1] : rawId;
      const type = (req.query.type as string) || (rawId.includes("serie") ? "tv" : "movie");
      const season = req.query.s ? String(req.query.s) : "1";
      const episode = req.query.e ? String(req.query.e) : "1";

      // Para séries e filmes, se o id for IMDb (tt...), converte para TMDB numérico para compatibilidade total com o Ajax
      let resolvedId = id;
      if (id.startsWith("tt")) {
        try {
          const tmdbApiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
          if (!tmdbApiKey) {
            console.warn("[VIP Player] TMDB_API_KEY is not configured.");
          } else {
            const findRes = await fetch(
              `https://api.themoviedb.org/3/find/${id}?api_key=${tmdbApiKey}&external_source=imdb_id`
            );
            if (findRes.ok) {
              const findData = await findRes.json();
              if ((type === "tv" || type === "series") && findData.tv_results?.[0]?.id) {
                resolvedId = String(findData.tv_results[0].id);
              } else if (type === "movie" && findData.movie_results?.[0]?.id) {
                resolvedId = String(findData.movie_results[0].id);
              }
            }
          }
        } catch (findErr) {
          console.warn("[VIP Player TMDB Find Warning]:", findErr);
        }
      }

      // 1. TENTATIVA DIRETA DE EXTRAÇÃO (Sem telas de 'Carregando', sem popups e sem anúncios)
      let ajaxHadValidSources = false;
      try {
        const ajaxUrl = `https://playerflix.ink/inc/Ajax.php?type=${type}&id=${resolvedId}&season=${season}&episode=${episode}`;
        const ajaxRes = await fetch(ajaxUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://playerflix.ink/",
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        if (ajaxRes.ok) {
          const ajaxData = await ajaxRes.json();
          if (ajaxData && ajaxData.status && Array.isArray(ajaxData.data?.options)) {
            // Regra Estrita: descarta servidores na lista negra (Superflix, sfapi, byse, streamberry)
            // e prioriza opções com dublagem brasileira (Dublado PT-BR)
            const validOptions = ajaxData.data.options
              .filter((opt: any) => {
                const u = (opt.embed || "").toLowerCase();
                return !u.includes("superflix") && !u.includes("sfapi") && !u.includes("byse") && !u.includes("streamberry");
              })
              .sort((a: any, b: any) => {
                const aLang = (a.lang || "").toLowerCase();
                const bLang = (b.lang || "").toLowerCase();
                const aDub = aLang.includes("pt") || aLang.includes("br") || aLang.includes("dub");
                const bDub = bLang.includes("pt") || bLang.includes("br") || bLang.includes("dub");
                if (aDub && !bDub) return -1;
                if (!aDub && bDub) return 1;
                return 0;
              });

            if (validOptions.length > 0) {
              ajaxHadValidSources = true;
            }

            for (const vipOption of validOptions) {
              if (!vipOption || !vipOption.embed) continue;
              try {
                const embedUrl = new URL(vipOption.embed);
                const hash = embedUrl.pathname.split("/").filter(Boolean).pop();
                const host = embedUrl.host;

                if (!hash || !host) continue;

                const getVidRes = await fetch(`https://${host}/player/index.php?data=${hash}&do=getVideo`, {
                  method: "POST",
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Referer": vipOption.embed,
                    "Origin": `https://${host}`,
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest",
                  },
                  body: `hash=${hash}&r=${encodeURIComponent("https://playerflix.ink/")}`,
                });

                if (!getVidRes.ok) continue;
                const vidText = await getVidRes.text();
                if (!vidText.startsWith("{")) continue;

                const vidData = JSON.parse(vidText);
                const m3u8Source = vidData.securedLink || vidData.videoSource;
                if (!m3u8Source || typeof m3u8Source !== "string" || !m3u8Source.startsWith("http")) continue;

                const proxiedStreamUrl = `/api/live-stream-proxy?url=${encodeURIComponent(m3u8Source)}&referer=${encodeURIComponent(`https://${host}/`)}`;

                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
                return res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VIP Player - ${ajaxData.data?.title || "Play Infinity"}</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: #000;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #artplayer-container {
      width: 100%;
      height: 100%;
    }
    /* Oculta totalmente qualquer elemento de interface nativa do Artplayer para dar lugar exclusivo à Skin Netflix */
    .art-video-player .art-bottom,
    .art-video-player .art-mask,
    .art-video-player .art-state,
    .art-video-player .art-contextmenus,
    .art-video-player .art-loading,
    .art-video-player .art-notice,
    .art-video-player .art-controls,
    .art-video-player .art-layer-state,
    .art-video-player .art-progress,
    .art-video-player .art-control,
    .art-video-player .art-backdrop,
    .art-video-player .art-layers {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/artplayer@5.1.7/dist/artplayer.js"></script>
</head>
<body>
  <div id="artplayer-container"></div>
  <script>
    (function() {
      // Neutraliza popups e janelas secundárias
      window.open = function() { return null; };
      window.alert = function() {};
      window.confirm = function() { return false; };

      var hlsUrl = "${proxiedStreamUrl}";

      var art = new Artplayer({
        container: "#artplayer-container",
        url: hlsUrl,
        type: "m3u8",
        customType: {
          m3u8: function(video, url, artInstance) {
            if (Hls.isSupported()) {
              if (artInstance.hls) artInstance.hls.destroy();
              var hls = new Hls({
                enableWorker: true,
                maxBufferLength: 20,
                maxMaxBufferLength: 40,
                backBufferLength: 30,
                maxBufferSize: 30 * 1000 * 1000,
                maxBufferHole: 0.5,
                startFragPrefetch: true,
                progressive: true,
                nudgeOffset: 0.15,
                nudgeMaxRetry: 8,
                fragLoadingTimeOut: 30000,
                manifestLoadingTimeOut: 20000,
                fragLoadingMaxRetry: 8
              });
              hls.loadSource(url);
              hls.attachMedia(video);
              hls.on(Hls.Events.MANIFEST_PARSED, function() {
                // Seleciona áudio Dublado / Português automaticamente se disponível
                if (hls.audioTracks && hls.audioTracks.length > 1) {
                  for (var i = 0; i < hls.audioTracks.length; i++) {
                    var track = hls.audioTracks[i];
                    var lang = (track.lang || track.name || "").toLowerCase();
                    if (lang.includes("pt") || lang.includes("por") || lang.includes("dub")) {
                      hls.audioTrack = i;
                      break;
                    }
                  }
                }
              });
              hls.on(Hls.Events.LEVEL_LOADED, function(event, data) {
                if (data && data.details && data.details.totalduration) {
                  window.__streamDuration = data.details.totalduration;
                  sendStatus();
                }
              });
              hls.on(Hls.Events.ERROR, function(event, data) {
                if (data && data.fatal) {
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      hls.startLoad();
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      hls.recoverMediaError();
                      break;
                    default:
                      hls.destroy();
                      try {
                        window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "vip_hls_fatal" }, "*");
                      } catch(e) {}
                      break;
                  }
                }
              });
              artInstance.hls = hls;
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
              video.src = url;
              video.addEventListener("error", function() {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "vip_video_error" }, "*");
                } catch(e) {}
              });
            }
          }
        },
        autoplay: true,
        muted: false,
        playsInline: true,
        hotkey: false,
        gesture: false,
        miniProgressBar: false,
        backdrop: false,
        controls: [],
        icons: { state: '' },
        theme: "#e50914"
      });

      window.artInstance = art;

      function sendStatus() {
        var v = art.video || document.querySelector("video");
        if (!v) return;
        var dur = v.duration || art.duration || window.__streamDuration || 0;
        if ((!dur || isNaN(dur) || dur === Infinity) && window.__streamDuration) {
          dur = window.__streamDuration;
        }
        if (!dur || isNaN(dur) || dur === Infinity) {
          dur = 0;
        }
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

      function notifyEnded() {
        try {
          window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
        } catch(e) {}
      }

      art.on("video:timeupdate", sendStatus);
      art.on("video:loadedmetadata", sendStatus);
      art.on("video:play", sendStatus);
      art.on("video:pause", sendStatus);
      art.on("video:playing", sendStatus);
      art.on("video:progress", sendStatus);
      art.on("video:ended", notifyEnded);

      setInterval(sendStatus, 250);

      var myembedSeekStallWatchdog = null;
      function monitorMyembedSeekProgress(targetTime) {
        if (myembedSeekStallWatchdog) clearInterval(myembedSeekStallWatchdog);
        var checkCount = 0;
        var lastPos = targetTime;
        myembedSeekStallWatchdog = setInterval(function() {
          checkCount++;
          var v = art.video || document.querySelector("video");
          if (!v) {
            if (checkCount > 10) clearInterval(myembedSeekStallWatchdog);
            return;
          }
          if (Math.abs(v.currentTime - lastPos) > 0.15) {
            clearInterval(myembedSeekStallWatchdog);
            return;
          }
          // Verifica se a posição de seek já está no buffer de memória
          var isBuffered = false;
          if (v.buffered && v.buffered.length > 0) {
            for (var b = 0; b < v.buffered.length; b++) {
              if (v.currentTime >= v.buffered.start(b) - 0.2 && v.currentTime <= v.buffered.end(b) + 0.2) {
                isBuffered = true;
                break;
              }
            }
          }
          // Se já está no buffer mas travou em gap de keyframe
          if (isBuffered && checkCount >= 3) {
            try {
              v.currentTime = v.currentTime + 0.12;
            } catch(err) {}
            v.play().catch(function() {});
            clearInterval(myembedSeekStallWatchdog);
            return;
          }
          // Se ainda está baixando, apenas garante que o HLS está carregando o segmento
          if (art && art.hls && typeof art.hls.startLoad === "function") {
            try { art.hls.startLoad(targetTime); } catch(err) {}
          }
          if (!v.paused) {
            v.play().catch(function() {});
          }
          lastPos = v.currentTime;
          if (checkCount > 10) clearInterval(myembedSeekStallWatchdog);
        }, 400);
      }

      // Ponte de comandos completos para a Skin Netflix
      window.addEventListener("message", function(e) {
        if (!e.data) return;
        var v = art.video || document.querySelector("video");
        var msgType = e.data.type || e.data.action;

        switch (msgType) {
          case "PLAY":
          case "play":
            if (art) art.play().catch(function() {});
            else if (v) v.play().catch(function() {});
            sendStatus();
            break;
          case "PAUSE":
          case "pause":
            if (art) art.pause();
            else if (v) v.pause();
            sendStatus();
            break;
          case "TOGGLE_PLAY":
          case "togglePlay":
            if (art) art.toggle();
            else if (v) { v.paused ? v.play().catch(function() {}) : v.pause(); }
            sendStatus();
            break;
          case "SEEK":
          case "seek":
          case "SEEK_ABSOLUTE":
            var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
            if (typeof t === "number" && !isNaN(t)) {
              if (art) {
                try { art.seek = t; } catch(err) {}
                try { art.currentTime = t; } catch(err) {}
                if (art.hls && typeof art.hls.startLoad === "function") {
                  try { art.hls.startLoad(t); } catch(err) {}
                }
              }
              if (v) {
                try { v.currentTime = t; } catch(err) {}
                if (e.data.resumePlay || (e.data.wasPlaying !== false && !v.paused)) {
                  v.play().catch(function() {});
                }
              }
              sendStatus();
              monitorMyembedSeekProgress(t);
            }
            break;
          case "SEEK_RELATIVE":
            var delta = Number(e.data.seconds) || 0;
            var curTime = (v ? v.currentTime : (art ? art.currentTime : 0)) || 0;
            var maxDur = (v && v.duration > 0 ? v.duration : (window.__streamDuration || 99999));
            var newTarget = typeof e.data.time === "number" && !isNaN(e.data.time)
              ? Math.max(0, Math.min(e.data.time, maxDur))
              : Math.max(0, Math.min(curTime + delta, maxDur));
            if (art) {
              if (art.hls && typeof art.hls.startLoad === "function") {
                try { art.hls.startLoad(newTarget); } catch(err) {}
              }
              try { art.seek = newTarget; } catch(err) {}
              try { art.currentTime = newTarget; } catch(err) {}
            }
            if (v) {
              try { v.currentTime = newTarget; } catch(err) {}
              if (e.data.resumePlay || (e.data.wasPlaying !== false && !v.paused)) {
                v.play().catch(function() {});
              }
            }
            sendStatus();
            monitorMyembedSeekProgress(newTarget);
            break;
          case "SET_PLAYBACK_RATE":
          case "setPlaybackRate":
            var rate = Number(e.data.rate) || 1;
            if (art) art.playbackRate = rate;
            if (v) v.playbackRate = rate;
            sendStatus();
            break;
          case "SKIP_INTRO":
            var sec = Number(e.data.seconds) || 85;
            var curIntro = (v ? v.currentTime : (art ? art.currentTime : 0)) || 0;
            var maxD = (v && v.duration > 0 ? v.duration : (window.__streamDuration || 99999));
            var targetIntro = Math.max(0, Math.min(curIntro + sec, maxD - 5));
            if (art) art.currentTime = targetIntro;
            else if (v) v.currentTime = targetIntro;
            sendStatus();
            break;
          case "SET_VOLUME":
          case "setVolume":
            if (typeof e.data.volume === "number") {
              if (art) art.volume = e.data.volume;
              if (v) v.volume = e.data.volume;
              sendStatus();
            }
            break;
          case "SET_MUTED":
          case "setMuted":
            var shouldMute = !!e.data.muted;
            if (art) art.muted = shouldMute;
            if (v) v.muted = shouldMute;
            sendStatus();
            break;
          case "REQUEST_STATUS":
          case "requestStatus":
            sendStatus();
            break;
        }
      });

      window.addEventListener('offline', function() {
        try {
          window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "vip_network_offline" }, "*");
        } catch(e) {}
      });

      art.on("video:ended", notifyEnded);
    })();
  </script>
</body>
</html>`);
              } catch (optErr) {
                console.warn("[VIP Option Error]:", optErr);
              }
            }
          }
        }
      } catch (directExtractErr) {
        console.warn("[VIP Direct Stream Extraction Error]:", directExtractErr);
      }

      // 2. FALLBACK SEGURO VIA PROXY DE HTML COM AUTO-DESTRUIÇÃO DE LOADER E ANTI-POPUP
      const targetUrl = (type === "tv" || type === "series")
        ? `https://playerflix.ink/serie/${resolvedId}/${season}/${episode}`
        : `https://playerflix.ink/filme/${resolvedId}`;

      const looksBlocked = (html: string, status: number): boolean => {
        if (status === 403 || status === 503 || status === 404) return true;
        const lower = (html || "").toLowerCase();
        if (
          lower.includes("cf-error-details") ||
          lower.includes("attention required") ||
          lower.includes("checking your browser") ||
          lower.includes("just a moment") ||
          lower.includes("cf-browser-verification") ||
          lower.includes("ray id") ||
          (lower.includes("error code") && lower.includes("cloudflare")) ||
          lower.includes("investidor.blog") ||
          lower.includes("myplayer") ||
          lower.includes("login-card") ||
          lower.includes("login-page") ||
          lower.includes("painel administrativo") ||
          lower.includes("bem-vindo") ||
          lower.includes("bem vindo") ||
          lower.includes("acesso protegido por sessão segura")
        ) {
          return true;
        }
        if (!lower.includes("base_config") && !lower.includes("<video") && !lower.includes("player")) {
          return true;
        }
        return false;
      };

      let myembedRes = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://myembed.biz/",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        }
      });

      let playerHtml = await myembedRes.text();

      if (looksBlocked(playerHtml, myembedRes.status)) {
        console.warn(`[MyEmbed Stream] playerflix.ink bloqueado ou sem stream. Tentando myembed.biz...`);
        const fallbackUrl = (type === "tv" || type === "series")
          ? `https://myembed.biz/serie/${resolvedId}/${season}/${episode}`
          : `https://myembed.biz/filme/${resolvedId}`;

        const fallbackRes = await fetch(fallbackUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://myembed.biz/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
          }
        });

        const fallbackHtml = await fallbackRes.text();

        if (looksBlocked(fallbackHtml, fallbackRes.status)) {
          console.warn(`[MyEmbed Stream] Provedores VIP sem stream limpo para ${resolvedId}. Emitindo VIP_UNAVAILABLE.`);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.status(404).send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
              <meta charset="utf-8">
              <style>
                html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
              </style>
            </head>
            <body>
              <script>
                try {
                  window.parent.postMessage({ 
                    type: "VIP_UNAVAILABLE", 
                    reason: "no_valid_sources" 
                  }, "*");
                } catch(e) {}
              </script>
            </body>
            </html>
          `);
        }

        playerHtml = fallbackHtml;
      }

      // Remove disable-devtool e scripts que forçam tela preta
      playerHtml = playerHtml.replace(/<script[^>]*disable-devtool[^>]*><\/script>/gi, '');
      playerHtml = playerHtml.replace(/<script[^>]*src=[\"'][^\"']*(?:mypopads|developersonne|googlesyndication|inmobi|themoneytizer|waust|beacon)[^\"']*[\"'][^>]*><\/script>/gi, '');
      playerHtml = playerHtml.replace(/aHR0cHM6Ly9kZXZlbG9wZXJzb25lLmNvbS5ici9sb2FkLnBocD9yPXBvcA==/g, '');
      playerHtml = playerHtml.replace(/aHR0cHM6Ly9teXBvcGFkcy5jb20vcmVxdWVzdHMvZGlzcGxheS5waHA/g, '');

      // Redireciona Ajax para proxy local
      playerHtml = playerHtml.replace(/BASE_URL:\s*['"]https:\/\/(playerflix\.ink|myembed\.biz)['"]/gi, `BASE_URL: ''`);
      playerHtml = playerHtml.replace(/<iframe(.*?)>/i, '<iframe$1 sandbox="allow-scripts allow-same-origin allow-presentation">');

      // Escudo Anti-Popup e Destruidor de 'Carregando'
      const shieldScript = `
        <style>
          .vast-ad-container, .vast-blocker, [class*="vast"], [id*="vast"],
          [class*="popad"], [id*="popad"], .ad-overlay, .ad-banner, .advertisement,
          div[style*="z-index: 2147483647"], div[style*="z-index: 999999"],
          iframe[src*="pop"], iframe[src*="ad"],
          #options, .options, .seasonepisodeSelector, .btn-opcoes, .mostrar_opcoes,
          .player_select_item, .changeOptions, #header, header,
          .btn, .button, a[href*="player"], a[href*="server"], div[class*="player_select"],
          div[class*="server_select"], div[class*="choose"], .escolher-player,
          .button-escolher-player, [class*="escolh"], [class*="server_"],
          .servers-list, .server-buttons, .player-selector,
          [id*="server"], [id*="player_select"], .btn-player, .player-options,
          #player > div:first-child, button[onclick*="backOptions"],
          .alert, .notice, .warning, .message, [class*="msg"], [class*="aviso"],
          h1, h2, h3, h4, #options h2, #options p {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            width: 0px !important;
            height: 0px !important;
          }
        </style>
        <script>
          window.open = function() {
            console.warn('[Play Infinity Anti-Popup] Popup bloqueado.');
            return null;
          };
          window.alert = function() {};
          window.confirm = function() { return false; };
          window.onbeforeunload = null;

          function sendStatus() {
            var v = document.querySelector('video');
            if (!v) return;
            var dur = v.duration || 0;
            var cur = v.currentTime || 0;
            var buf = (v.buffered && v.buffered.length > 0) ? v.buffered.end(v.buffered.length - 1) : 0;
            try {
              window.parent.postMessage({
                type: 'WATCHPLAY_STATUS',
                currentTime: cur,
                duration: dur,
                paused: !!v.paused,
                muted: !!v.muted,
                volume: typeof v.volume === 'number' ? v.volume : 1,
                buffered: buf,
                playbackRate: v.playbackRate || 1,
                readyState: v.readyState || 0
              }, '*');
            } catch(e) {}
          }

          // Auto-elimina overlay de "Carregando" e seleciona a opção automaticamente continuamente
          var optionClicked = false;
          setInterval(function() {
            try {
              var loader = document.getElementById('playerLoader') || document.querySelector('.pro-loader');
              if (loader) {
                loader.style.opacity = '0';
                loader.style.pointerEvents = 'none';
                setTimeout(function() { if (loader) loader.remove(); }, 300);
              }
              
              if (!optionClicked) {
                var opt = document.querySelector('.option') || document.querySelector('[onclick*="player("]') || document.querySelector('.btn-opcoes');
                if (opt && typeof opt.click === 'function') {
                  opt.click();
                  optionClicked = true;
                  console.log('[Play Infinity] Opção de player auto-clicada!');
                }
              }

              // Aniquilador agressivo de textos de "Escolher player"
              document.querySelectorAll('h1, h2, h3, h4, span, p, div, button, a').forEach(function(el) {
                if (el.children.length === 0 && el.textContent) {
                  var text = el.textContent.toLowerCase();
                  if (text.includes('escolha uma opção') || text.includes('opção de player') || text.includes('escolher outro') || text.includes('selecione um')) {
                     el.style.setProperty('display', 'none', 'important');
                     el.style.setProperty('opacity', '0', 'important');
                     el.innerHTML = '';
                  }
                }
              });
            } catch(e) {}
          }, 500);

          setInterval(function() {
            try {
              const skipButtons = document.querySelectorAll('.skip-button, .vast-skip-button, [class*="skip"], [id*="skip"], [class*="close-ad"]');
              skipButtons.forEach(function(btn) { if (typeof btn.click === 'function') btn.click(); });

              const adElements = document.querySelectorAll('.vast-ad-container, .vast-blocker, [class*="vast-ad"], [id*="vast-ad"]');
              adElements.forEach(function(el) { el.remove(); });
              
              const iframes = document.querySelectorAll('iframe:not([sandbox])');
              iframes.forEach(function(ifr) {
                ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
              });
            } catch(e) {}
            sendStatus();
          }, 250);

          window.addEventListener('message', function(e) {
            if (!e.data) return;
            var v = (window.artInstance && window.artInstance.video) ? window.artInstance.video : document.querySelector('video');
            if (!v) return;
            var msgType = e.data.type || e.data.action;
            switch(msgType) {
              case 'PLAY': case 'play': 
                if (window.artInstance && typeof window.artInstance.play === "function") {
                  try { window.artInstance.play(); } catch(err) {}
                }
                v.play().catch(function(){}); 
                sendStatus(); 
                break;
              case 'PAUSE': case 'pause': 
                if (window.artInstance && typeof window.artInstance.pause === "function") {
                  try { window.artInstance.pause(); } catch(err) {}
                }
                v.pause(); 
                sendStatus(); 
                break;
              case 'TOGGLE_PLAY': case 'togglePlay': 
                if (window.artInstance && typeof window.artInstance.toggle === "function") {
                  try { window.artInstance.toggle(); } catch(err) {}
                } else {
                  v.paused ? v.play().catch(function(){}) : v.pause(); 
                }
                sendStatus(); 
                break;
              case 'SEEK': case 'seek': case 'SEEK_ABSOLUTE':
                var t = typeof e.data.time === 'number' ? e.data.time : e.data.targetTime;
                if (typeof t === 'number' && !isNaN(t)) { v.currentTime = t; sendStatus(); }
                break;
              case 'SEEK_RELATIVE':
                var delta = Number(e.data.seconds) || 0;
                v.currentTime = Math.max(0, Math.min(v.currentTime + delta, (v.duration || 99999)));
                sendStatus();
                break;
              case 'SET_PLAYBACK_RATE': case 'setPlaybackRate':
                v.playbackRate = Number(e.data.rate) || 1;
                sendStatus();
                break;
              case 'SKIP_INTRO':
                var sec = Number(e.data.seconds) || 85;
                v.currentTime = Math.max(0, Math.min(v.currentTime + sec, (v.duration || 99999) - 5));
                sendStatus();
                break;
              case 'SET_VOLUME': case 'setVolume':
                if (typeof e.data.volume === 'number') { v.volume = e.data.volume; sendStatus(); }
                break;
              case 'SET_MUTED': case 'setMuted':
                v.muted = !!e.data.muted;
                sendStatus();
                break;
              case 'REQUEST_STATUS': case 'requestStatus':
                sendStatus();
                break;
            }
          });
        </script>
      `;

      if (playerHtml.includes("<head>")) {
        playerHtml = playerHtml.replace("<head>", "<head>" + shieldScript);
      } else {
        playerHtml = shieldScript + playerHtml;
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res.send(playerHtml);
    } catch (err: any) {
      console.error("[MyEmbed Stream Proxy Error]:", err);
      return res.status(500).send("Erro ao processar stream do MyEmbed.");
    }
  });

// API: MyEmbed / Playerflix VIP Player com Extração Direta de Stream e Escudo Anti-Popups
  // Pomfy Stream Proxy Bypass (Vai direto para o Servidor 1)
  router.get("/api/pomfy-stream", async (req, res) => {
    try {
      const { id, type, s, e } = req.query;
      if (!id) {
        return res.status(400).send("Faltando parâmetro 'id'.");
      }
      
      const baseUrl = type === "tv" 
        ? `https://api.pomfy.stream/serie/${id}/${s || 1}/${e || 1}` 
        : `https://api.pomfy.stream/filme/${id}`;
        
      // 1. Busca HTML do Pomfy para pegar o statusToken
      const response = await fetch(baseUrl, {
        headers: {
          "Sec-Fetch-Dest": "iframe",
          "Sec-Fetch-Mode": "navigate",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      
      if (!response.ok) {
        return res.redirect(302, baseUrl); // Fallback
      }
      
      const html = await response.text();
      
      // 2. Extrai o token com Regex (statusToken="...")
      const tokenMatch = html.match(/statusToken="([^"]+)"/);
      
      if (tokenMatch && tokenMatch[1]) {
        const token = tokenMatch[1];
        
        // 3. Resolve o URL direto via API play-token
        const tokenUrl = `https://api.pomfy.stream/api/play-token?t=${token}`;
        const tokenResp = await fetch(tokenUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": baseUrl
          }
        });
        
        if (tokenResp.ok) {
          const json = await tokenResp.json();
          // O JSON esperado tem byseUrl (Servidor 1)
          const finalUrl = json.byseUrl || json.url || json.flyfileUrl;
          if (finalUrl) {
            return res.redirect(302, finalUrl);
          }
        }
      }
      
      // Fallback
      return res.redirect(302, baseUrl);
    } catch (err: any) {
      console.error("[Pomfy Proxy Error]:", err);
      // Absolute fallback
      const { id, type, s, e } = req.query;
      const baseUrl = type === "tv" 
        ? `https://api.pomfy.stream/serie/${id}/${s || 1}/${e || 1}` 
        : `https://api.pomfy.stream/filme/${id}`;
      return res.redirect(302, baseUrl);
    }
  });

// API: MyEmbed / Playerflix VIP Player com Extração Direta de Stream e Escudo Anti-Popups
  // Pomfy Stream Proxy Bypass (Vai direto para o Servidor 1)
  // TMDB Proxy (Oculta a chave de API do cliente e evita vazamento no DevTools)
  // Vite middleware for development
  
  // API: Extrator Direto da EmbedPlayAPI (Permanentemente desativado - na blacklist)
  router.get("/api/embedplay-direct", (_req, res) => {
    return res.status(403).json({ 
      error: "Servidor EmbedPlay está bloqueado na blacklist permanente. Use exclusivamente o WatchPlayer." 
    });
  });

// API: MyEmbed / Playerflix VIP Player com Extração Direta de Stream e Escudo Anti-Popups
  // Pomfy Stream Proxy Bypass (Vai direto para o Servidor 1)
  // TMDB Proxy (Oculta a chave de API do cliente e evita vazamento no DevTools)
  // Vite middleware for development
  
  // API: Extrator Direto da EmbedPlayAPI (Permanentemente desativado - na blacklist)
  // API: Resolver do BYSE Player (Permanentemente desativado - na blacklist)
  router.get("/api/byse-stream", (_req, res) => {
    return res.status(403).json({ 
      error: "Servidor BYSE/Streamberry está bloqueado na blacklist permanente. Use exclusivamente o WatchPlayer." 
    });
  });

export default router;
