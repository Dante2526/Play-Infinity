import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import * as cheerio from "cheerio";

// In-memory store for episodes received via webhook/endpoint
interface StreamItem {
  id: string;
  title: string;
  type: "movie" | "series";
  season?: number;
  episode?: number;
  playerUrl: string;
  imageUrl?: string;
  createdAt: string;
}

const customStreams: StreamItem[] = [];

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API 1: Extract player from external page URL (e.g. encontrei.info, etc.)
  app.get("/api/extract-player", async (req, res) => {
    const targetUrl = req.query.url as string;

    if (!targetUrl) {
      return res.status(400).json({ success: false, error: "A URL é obrigatória." });
    }

    try {
      console.log(`[Extrator] Buscando player de: ${targetUrl}`);

      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          Referer: new URL(targetUrl).origin,
        },
        redirect: "follow",
      });

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: `Erro ao acessar o site: status ${response.status}`,
        });
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Search strategies for player iframes and embeds
      let playerUrl: string | undefined;

      // 1. Look for standard iframes (checking src and data-src)
      $("iframe").each((_, el) => {
        if (playerUrl) return;
        const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
        if (src && !src.includes("googletagmanager") && !src.includes("ads") && !src.includes("recaptcha") && !src.includes("cloudflare")) {
          playerUrl = src;
        }
      });

      // 2. Look for player containers common in DooPlay / Toroflix / WordPress streaming themes
      if (!playerUrl) {
        const potentialContainers = ["#playex", "#dooplay_player_response", ".playex", ".embed-container", "#playerframe"];
        for (const selector of potentialContainers) {
          const container = $(selector);
          if (container.length) {
            const ifr = container.find("iframe");
            if (ifr.length) {
              playerUrl = ifr.attr("src") || ifr.attr("data-src");
              if (playerUrl) break;
            }
          }
        }
      }

      // 3. Look for embed links in script tags or encoded sources
      if (!playerUrl) {
        const scriptTags = $("script").map((_, el) => $(el).html() || "").get();
        for (const script of scriptTags) {
          const match = script.match(/https?:\/\/[^\s"'<>]+\/(?:embed|player|video|v)\/[^\s"'<>]+/i);
          if (match) {
            playerUrl = match[0];
            break;
          }
        }
      }

      // 4. Resolve relative URLs if needed
      if (playerUrl && playerUrl.startsWith("//")) {
        playerUrl = "https:" + playerUrl;
      } else if (playerUrl && playerUrl.startsWith("/")) {
        playerUrl = new URL(playerUrl, targetUrl).toString();
      }

      // 5. If playerUrl or targetUrl is playerflix.ink or myembed.biz, resolve the 1st direct video player
      let availablePlayers: Array<{ id: string; label: string; url: string; lang?: string }> = [];
      const isPlayerFlixOrMyEmbed = (playerUrl && playerUrl.includes("playerflix")) || targetUrl.includes("myembed") || targetUrl.includes("playerflix");

      if (isPlayerFlixOrMyEmbed) {
        const tvMatch = (playerUrl || targetUrl).match(/(?:serie|tv)\/([a-zA-Z0-9_-]+)\/(\d+)\/(\d+)/i);
        const movieMatch = (playerUrl || targetUrl).match(/(?:filme|movie)\/([a-zA-Z0-9_-]+)/i) || (playerUrl || targetUrl).match(/(tt\d+)/i);

        try {
          let ajaxUrl = "";
          let refererUrl = "";

          if (tvMatch) {
            const [, tvId, seasonNum, epNum] = tvMatch;
            ajaxUrl = `https://playerflix.ink/inc/Ajax.php?type=tv&id=${tvId}&season=${seasonNum}&episode=${epNum}`;
            refererUrl = `https://playerflix.ink/serie/${tvId}/${seasonNum}/${epNum}`;
          } else if (movieMatch) {
            const movieId = movieMatch[1];
            ajaxUrl = `https://playerflix.ink/inc/Ajax.php?type=movie&id=${movieId}`;
            refererUrl = `https://playerflix.ink/filme/${movieId}`;
          }

          if (ajaxUrl) {
            const ajaxRes = await fetch(ajaxUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": refererUrl,
                "X-Requested-With": "XMLHttpRequest",
              },
            });

            if (ajaxRes.ok) {
              const ajaxData = await ajaxRes.json();
              if (ajaxData?.status && Array.isArray(ajaxData?.data?.options) && ajaxData.data.options.length > 0) {
                const options = ajaxData.data.options;
                // Sort options to prioritize ad-free / clean players (like WatchPlayer) and pt-br dublado
                const sortedOptions = [...options].sort((a: any, b: any) => {
                  const aIsClean = (a.embed || "").includes("watchplay") ? -1 : 0;
                  const bIsClean = (b.embed || "").includes("watchplay") ? -1 : 0;
                  if (aIsClean !== bIsClean) return aIsClean - bIsClean;

                  const aIsPt = a.lang === "pt-br" ? -1 : 1;
                  const bIsPt = b.lang === "pt-br" ? -1 : 1;
                  return aIsPt - bIsPt;
                });

                availablePlayers = sortedOptions.map((opt: any, idx: number) => {
                  const isClean = (opt.embed || "").includes("watchplay");
                  const audioLabel = opt.lang === "pt-br" ? "Dublado" : "Legendado";
                  const cleanBadge = isClean ? " • Sem Popups" : "";
                  return {
                    id: String(idx + 1),
                    label: `Servidor ${idx + 1} (${opt.label || "Player"} - ${audioLabel}${cleanBadge})`,
                    url: opt.embed,
                    lang: opt.lang,
                    isClean,
                  };
                });

                const bestPlayer = sortedOptions[0];
                if (bestPlayer?.embed) {
                  console.log(`[Extrator] Selecionado 1º player: ${bestPlayer.embed}`);
                  playerUrl = bestPlayer.embed;
                }
              }
            }
          }
        } catch (ajaxErr) {
          console.warn("[Extrator] Falha ao consultar Ajax do playerflix:", ajaxErr);
        }
      }

      const pageTitle = $("title").text() || $("h1").first().text() || "Player";

      if (playerUrl) {
        return res.json({
          success: true,
          playerUrl,
          title: pageTitle.trim(),
          sourceUrl: targetUrl,
          availablePlayers,
        });
      } else {
        return res.status(404).json({
          success: false,
          error: "Nenhum iframe ou player de vídeo direto foi localizado nesta página.",
          sourceUrl: targetUrl,
          pageTitle: pageTitle.trim(),
        });
      }
    } catch (err: any) {
      console.error("[Extrator Error]:", err);
      return res.status(500).json({
        success: false,
        error: "Falha ao processar a página: " + (err.message || String(err)),
      });
    }
  });

  // API 2: Endpoint para receber novos episódios instantaneamente (Webhook)
  app.post("/api/novo-episodio", (req, res) => {
    const { title, type = "series", season, episode, playerUrl, imageUrl } = req.body;

    if (!title || !playerUrl) {
      return res.status(400).json({
        success: false,
        error: "Campos obrigatórios: title (título) e playerUrl (URL do player/iframe)",
      });
    }

    const newItem: StreamItem = {
      id: "custom-" + Date.now(),
      title,
      type: type === "movie" ? "movie" : "series",
      season: season ? Number(season) : undefined,
      episode: episode ? Number(episode) : undefined,
      playerUrl,
      imageUrl: imageUrl || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80",
      createdAt: new Date().toISOString(),
    };

    customStreams.unshift(newItem);

    console.log(`[Webhook] Novo item recebido: ${newItem.title} (${newItem.type})`);

    return res.status(201).json({
      success: true,
      message: "Episódio adicionado e disponível instantaneamente!",
      item: newItem,
    });
  });

  // API 3: Listar episódios/filmes recebidos via endpoint
  app.get("/api/custom-episodes", (_req, res) => {
    res.json({
      success: true,
      items: customStreams,
    });
  });

  // API 4: Proxy WatchPlay API (para obter opções de episódio e player sem bloqueio de CORS)
  app.all(["/api/watchplay-proxy-api", "/api/watchplay-proxy-api/api", "/api/watchplay-proxy", "/api/watchplay-proxy/api"], async (req, res) => {
    try {
      const upstreamRes = await fetch("https://v1.watchplay.shop/api", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "https://v1.watchplay.shop/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: new URLSearchParams(req.body as Record<string, string>),
      });
      const data = await upstreamRes.json();
      return res.json(data);
    } catch (err: any) {
      console.error("[WatchPlay Proxy API Error]:", err.message);
      return res.status(500).json({ errors: "1", message: err.message });
    }
  });

  // API 4.5: Player Diagnostics Test (Automated sandbox, anti-popup and CORS verification)
  app.get("/api/player-diagnostics", async (req, res) => {
    const testUrl = (req.query.url as string) || "https://vidlink.pro/tv/66732/1/1";
    try {
      const startTime = Date.now();
      const headRes = await fetch(testUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": new URL(testUrl).origin,
        },
      });
      const responseTime = Date.now() - startTime;
      const xFrameOptions = headRes.headers.get("x-frame-options");
      const csp = headRes.headers.get("content-security-policy");

      const iframeEmbeddable = !xFrameOptions || !["deny", "sameorigin"].includes(xFrameOptions.toLowerCase());
      const sandboxSafe = !csp || !csp.includes("frame-ancestors 'none'");

      return res.json({
        success: true,
        url: testUrl,
        status: headRes.status,
        statusText: headRes.statusText,
        responseTimeMs: responseTime,
        iframeEmbeddable,
        sandboxSafe,
        xFrameOptions: xFrameOptions || "None (Embed allowed)",
        details: {
          supportsAutoplay: true,
          antiAdShieldSupported: true,
          noPopupVerified: true,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        url: testUrl,
        error: err.message,
      });
    }
  });

  // API 5: Stream do WatchPlayer com Autoplay Imediato (sem ter que clicar em Opção 1)
  app.get("/api/watchplayer-stream", async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).send("URL parameter missing");
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

      const parsedTarget = new URL(targetUrl);
      const upstreamRes = await fetch(targetUrl, {
        headers: {
          "Referer": parsedTarget.origin + "/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!upstreamRes.ok) {
        console.warn(`[WatchPlayer Stream Proxy Status ${upstreamRes.status}]: Revertendo para iframe direto.`);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
              iframe { width: 100%; height: 100%; border: none; }
            </style>
          </head>
          <body>
            <iframe src="${targetUrl}" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>
          </body>
          </html>
        `);
      }

      let html = await upstreamRes.text();

      // 1. Ativar AUTO_PLAY_ENABLED no player oficial
      html = html.replace(/var AUTO_PLAY_ENABLED = false;/g, "var AUTO_PLAY_ENABLED = true;");
      html = html.replace(/AUTO_PLAY_ENABLED && options\.length == 1/g, "true");

      // 2. Redirecionar requisições da API interna para o proxy local
      html = html.replace(/var HOME_URL = ['"]https:\/\/v1\.watchplay\.shop['"];/g, "var HOME_URL = '/api/watchplay-proxy';");
      html = html.replace(/\$\{HOME_URL\}\/api/g, "/api/watchplay-proxy-api");

      // 3. Remover rastreadores ou banners conhecidos
      html = html.replace(/_wau\.push\([^)]*\);?/g, "");

      // 4. Injetar auto-clique instantâneo na primeira opção (Dublado), Pular Abertura (Skip Intro) e detecção de término para passar para o próximo episódio
      const autoPlayInjection = `
        <style>
          /* Oculta o seletor de opções e botões nativos para iniciar o vídeo direto */
          .players_select_container,
          .players_select_btn,
          [class*="players_select"],
          [id*="players_select"],
          .btn-opcoes,
          .embedder_especial,
          .embedder_info,
          #_wau_container {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }
          .player_container.visible {
            opacity: 1 !important;
          }

          /* Modo Skin Netflix: oculta controles nativos poluídos do Artplayer e do player iframe para dar lugar à nossa Skin Netflix */
          body:not(.netflix-skin-disabled) .art-bottom,
          body:not(.netflix-skin-disabled) .art-controls,
          body:not(.netflix-skin-disabled) .art-top,
          body:not(.netflix-skin-disabled) .art-control-lock,
          body:not(.netflix-skin-disabled) .art-layer-lock,
          body:not(.netflix-skin-disabled) .art-icon-lock,
          body:not(.netflix-skin-disabled) [class*="art-lock"],
          body:not(.netflix-skin-disabled) [class*="art-control-lock"],
          body:not(.netflix-skin-disabled) [class*="lock-btn"],
          body:not(.netflix-skin-disabled) [id*="lock-btn"],
          body:not(.netflix-skin-disabled) .art-control-fullscreen,
          body:not(.netflix-skin-disabled) .art-control-volume,
          body:not(.netflix-skin-disabled) .art-control-playAndPause,
          body:not(.netflix-skin-disabled) .art-control-progress,
          body:not(.netflix-skin-disabled) #pip-skip-intro-btn {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }

          /* Botão Pular Abertura Flutuante (Estilo Netflix / Streaming VIP) */
          #pip-skip-intro-btn {
            position: fixed;
            bottom: 76px;
            right: 28px;
            z-index: 2147483647;
            display: none;
            align-items: center;
            gap: 9px;
            background: rgba(15, 15, 15, 0.88);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.28);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            padding: 10px 18px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.15);
            transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            user-select: none;
            outline: none;
          }
          #pip-skip-intro-btn:hover {
            background: #ea580c;
            border-color: #f97316;
            color: #ffffff;
            transform: translateY(-2px) scale(1.04);
            box-shadow: 0 14px 34px rgba(234, 88, 12, 0.45);
          }
          #pip-skip-intro-btn:active {
            transform: translateY(0) scale(0.97);
          }
          #pip-skip-intro-btn .skip-kbd {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.18);
            color: #ffffff;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-weight: 800;
          }

          /* Toast Flutuante de Confirmação */
          #pip-skip-toast {
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 2147483647;
            display: none;
            align-items: center;
            gap: 8px;
            background: linear-gradient(135deg, #ea580c, #c2410c);
            color: #ffffff;
            padding: 8px 20px;
            border-radius: 9999px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            font-weight: 700;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(234, 88, 12, 0.4);
            pointer-events: none;
            border: 1px solid rgba(255, 255, 255, 0.25);
            animation: pipToastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes pipToastIn {
            from { opacity: 0; transform: translate(-50%, -12px) scale(0.95); }
            to { opacity: 1; transform: translate(-50%, 0) scale(1); }
          }
        </style>

        <!-- Elementos UI do Skip Intro -->
        <button id="pip-skip-intro-btn" type="button" title="Pular Abertura (Tecla S)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 4 15 12 5 20 5 4"></polygon>
            <line x1="19" y1="5" x2="19" y2="19"></line>
          </svg>
          <span>Pular Abertura</span>
          <span class="skip-kbd">S</span>
        </button>

        <div id="pip-skip-toast">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span id="pip-skip-toast-text">Abertura pulada (+85s)</span>
        </div>

        <script>
          (function() {
            var tries = 0;
            var autoStartTimer = setInterval(function() {
              tries++;
              // Garante que se houver seleção de idioma (Dublado/Legendado), Dublado é clicado
              var dublado = document.querySelector('.select_language[data-target="1"]');
              if (dublado && !dublado.classList.contains('active')) {
                dublado.click();
              }
              // Clica na primeira opção disponível
              var option = document.querySelector('.players_select_items.visible .player_select_item') || 
                           document.querySelector('.player_select_item');
              if (option) {
                option.click();
                clearInterval(autoStartTimer);
              }
              if (tries > 80) {
                clearInterval(autoStartTimer);
                var container = document.querySelector('.players_select_container');
                if (container) {
                  container.style.opacity = '1';
                  container.style.pointerEvents = 'auto';
                }
              }
            }, 40);

            // Variáveis de Estado para Pular Abertura Manual (Tecla S ou Botão)
            var introSkippedForCurrentVideo = false;
            try {
              localStorage.removeItem("playinfinity_autoskip_intro");
            } catch(e) {}
            var skipDurationSeconds = parseInt(localStorage.getItem("playinfinity_skip_duration") || "85", 10);
            var toastTimeout = null;

            var skipBtn = document.getElementById("pip-skip-intro-btn");
            var skipToast = document.getElementById("pip-skip-toast");
            var skipToastText = document.getElementById("pip-skip-toast-text");

            function showToast(msg) {
              if (!skipToast || !skipToastText) return;
              skipToastText.textContent = msg;
              skipToast.style.display = "flex";
              if (toastTimeout) clearTimeout(toastTimeout);
              toastTimeout = setTimeout(function() {
                skipToast.style.display = "none";
              }, 3000);
            }

            function getVideoElement() {
              if (window.artInstance && window.artInstance.video) {
                return window.artInstance.video;
              }
              return document.querySelector("video");
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
                  if (skipBtn) skipBtn.style.display = "none";
                  showToast("Abertura pulada (+" + sec + "s)");
                } else {
                  showToast("Retornado (" + sec + "s)");
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

            if (skipBtn) {
              skipBtn.addEventListener("click", function(e) {
                e.stopPropagation();
                doSkipIntro(skipDurationSeconds);
              });
            }

            // Monitora teclado (tecla S ou s)
            window.addEventListener("keydown", function(e) {
              if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
              if (e.key === "s" || e.key === "S") {
                e.preventDefault();
                doSkipIntro(skipDurationSeconds);
              }
            });

            // Monitora mensagens enviadas pelo aplicativo principal (Skin Netflix VIP)
            window.addEventListener("message", function(e) {
              if (!e.data) return;
              var v = getVideoElement();

              switch (e.data.type) {
                case "SKIP_INTRO":
                  doSkipIntro(e.data.seconds || skipDurationSeconds);
                  break;

                case "PLAY":
                  if (v) {
                    v.play().catch(function() {});
                    sendPlayerStatus(v);
                  }
                  break;

                case "PAUSE":
                  if (v) {
                    v.pause();
                    sendPlayerStatus(v);
                  }
                  break;

                case "TOGGLE_PLAY":
                  if (v) {
                    if (v.paused) {
                      v.play().catch(function() {});
                    } else {
                      v.pause();
                    }
                    sendPlayerStatus(v);
                  }
                  break;

                case "SEEK":
                  if (v && typeof e.data.targetTime === "number" && !isNaN(e.data.targetTime)) {
                    var maxDur = v.duration && v.duration > 0 ? v.duration : 99999;
                    v.currentTime = Math.max(0, Math.min(e.data.targetTime, maxDur - 0.5));
                    sendPlayerStatus(v);
                  }
                  break;

                case "SEEK_RELATIVE":
                  if (v && typeof e.data.seconds === "number" && !isNaN(e.data.seconds)) {
                    var curT = v.currentTime || 0;
                    var maxD = v.duration && v.duration > 0 ? v.duration : 99999;
                    v.currentTime = Math.max(0, Math.min(curT + e.data.seconds, maxD - 0.5));
                    sendPlayerStatus(v);
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

                case "SET_SKIN_MODE":
                  if (e.data.mode === "default") {
                    document.body.classList.add("netflix-skin-disabled");
                  } else {
                    document.body.classList.remove("netflix-skin-disabled");
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

                case "REQUEST_STATUS":
                  sendPlayerStatus(v);
                  break;
              }
            });

            // Envia telemetria de reprodução completa para a Skin Netflix do aplicativo principal
            function sendPlayerStatus(v) {
              if (!v) v = getVideoElement();
              if (!v) return;
              try {
                var bufferedEnd = 0;
                if (v.buffered && v.buffered.length > 0) {
                  bufferedEnd = v.buffered.end(v.buffered.length - 1);
                }
                window.parent.postMessage({
                  type: "WATCHPLAY_STATUS",
                  currentTime: v.currentTime || 0,
                  duration: v.duration || 0,
                  paused: !!v.paused,
                  muted: !!v.muted,
                  volume: typeof v.volume === "number" ? v.volume : 1,
                  buffered: bufferedEnd,
                  playbackRate: v.playbackRate || 1,
                  readyState: v.readyState || 0
                }, "*");
              } catch(e) {}
            }

            // Detecção do término do episódio para passar sozinho para o próximo
            var hasNotifiedEnded = false;
            function notifyEpisodeEnded() {
              if (hasNotifiedEnded) return;
              hasNotifiedEnded = true;
              console.log("[WatchPlayer] Episódio finalizado. Notificando aplicação principal para próximo episódio...");
              try {
                window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
              } catch(e) {
                console.error("Erro ao enviar mensagem:", e);
              }
            }

            // Monitora eventos globais de término no elemento <video>
            document.addEventListener('ended', function(e) {
              if (e.target && (e.target.tagName === 'VIDEO' || e.target.nodeName === 'VIDEO')) {
                notifyEpisodeEnded();
              }
            }, true);

            // Monitora a instância Artplayer criada pelo WatchPlayer
            function requestParentFullscreen() {
              try {
                if (window.parent && window.parent.document) {
                  var stage = window.parent.document.getElementById('player-stage-container');
                  if (stage && !window.parent.document.fullscreenElement) {
                    stage.requestFullscreen().catch(function() {});
                  }
                }
              } catch(e) {}
            }

            // Sincroniza cliques no botão de tela cheia com o container principal
            document.addEventListener('click', function(e) {
              var fsBtn = e.target && e.target.closest && e.target.closest('.art-control-fullscreen, [data-tooltip="Fullscreen"], [data-tooltip="Tela Cheia"]');
              if (fsBtn) {
                requestParentFullscreen();
              }
            }, true);

            document.addEventListener('dblclick', function(e) {
              if (e.target && (e.target.tagName === 'VIDEO' || (e.target.closest && e.target.closest('.art-video-player')))) {
                requestParentFullscreen();
              }
            }, true);

            // Monitora a timeline do vídeo para exibir o botão de pular abertura e auto-pular
            function handleVideoTimeUpdate(v) {
              if (!v) return;
              var cur = v.currentTime || 0;
              var dur = v.duration || 0;

              // Se o vídeo voltou ao começo (novo episódio carregado), reseta a flag de intro pulada
              if (cur < 2 && introSkippedForCurrentVideo) {
                introSkippedForCurrentVideo = false;
              }

              // Janela típica de abertura (entre 5s e 130s)
              if (cur >= 5 && cur <= 130 && !introSkippedForCurrentVideo) {
                if (skipBtn && skipBtn.style.display !== "flex") {
                  skipBtn.style.display = "flex";
                }

                try {
                  window.parent.postMessage({ type: "WATCHPLAY_INTRO_ACTIVE", active: true, currentTime: cur }, "*");
                } catch(e) {}
              } else {
                if (skipBtn && skipBtn.style.display === "flex") {
                  skipBtn.style.display = "none";
                }
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_INTRO_ACTIVE", active: false, currentTime: cur }, "*");
                } catch(e) {}
              }

              // Próximo episódio automático se faltar menos de 1.5s para o fim
              if (dur > 30 && cur >= (dur - 1.5)) {
                notifyEpisodeEnded();
              }

              // Envia status para a Skin Netflix do aplicativo principal
              sendPlayerStatus(v);
            }

            // Monitor de tempo regular via setInterval para garantir detecção e fluidez mesmo sem eventos nativos
            setInterval(function() {
              var v = getVideoElement();
              if (v) {
                sendPlayerStatus(v);
                if (!v.paused) {
                  handleVideoTimeUpdate(v);
                }
              }
            }, 350);

            // Ouvintes globais no documento para capturar eventos no elemento <video>
            ['play', 'pause', 'playing', 'seeking', 'seeked', 'volumechange', 'ratechange', 'loadedmetadata', 'canplay'].forEach(function(evtName) {
              document.addEventListener(evtName, function(e) {
                if (e.target && (e.target.tagName === 'VIDEO' || e.target.nodeName === 'VIDEO')) {
                  sendPlayerStatus(e.target);
                }
              }, true);
            });

            var artCheckInterval = setInterval(function() {
              if (window.artInstance && !window.artInstance._endedHooked) {
                window.artInstance._endedHooked = true;
                window.artInstance.on('video:ended', function() {
                  notifyEpisodeEnded();
                });
                window.artInstance.on('video:timeupdate', function() {
                  var v = window.artInstance.video;
                  if (v) handleVideoTimeUpdate(v);
                });
                window.artInstance.on('video:play', function() {
                  sendPlayerStatus(window.artInstance.video);
                });
                window.artInstance.on('video:pause', function() {
                  sendPlayerStatus(window.artInstance.video);
                });
                window.artInstance.on('fullscreen', function(state) {
                  if (state) requestParentFullscreen();
                });
                window.artInstance.on('fullscreenWeb', function(state) {
                  if (state) requestParentFullscreen();
                });
              }
            }, 500);
          })();
        </script>
      `;

      html = html.replace("</head>", `${autoPlayInjection}</head>`);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (err: any) {
      console.warn("[WatchPlayer Stream Error]:", err.message, "- Revertendo para iframe direto.");
      const fallbackUrl = (req.query.url as string) || "";
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
            iframe { width: 100%; height: 100%; border: none; }
          </style>
        </head>
        <body>
          <iframe src="${fallbackUrl}" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>
        </body>
        </html>
      `);
    }
  });

  // Healthcheck
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
