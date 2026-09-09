export default async function handler(req: any, res: any) {
  try {
    const targetUrl = (req.query?.url || req.body?.url) as string;
    if (!targetUrl) {
      return res.status(400).send("URL parameter missing");
    }

    if (req.query?.action_secure_sign) {
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

    const upstreamRes = await fetch(targetUrl, {
      headers: {
        "Referer": "https://v1.watchplay.shop/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send("Erro ao carregar o player");
    }

    let html = await upstreamRes.text();

    // 1. Ativar AUTO_PLAY_ENABLED no player oficial
    html = html.replace(/var AUTO_PLAY_ENABLED = false;/g, "var AUTO_PLAY_ENABLED = true;");
    html = html.replace(/AUTO_PLAY_ENABLED && options\.length == 1/g, "true");

    // 2. Redirecionar requisições da API interna para o proxy local
    html = html.replace(/var HOME_URL = ['"]https:\/\/v1\.watchplay\.shop['"];/g, "var HOME_URL = '/api/watchplay-proxy';");
    html = html.replace(/\$\{HOME_URL\}\/api/g, "/api/watchplay-proxy-api");

    // 3. Remover rastreadores, banners conhecidos e loaders nativos
    html = html.replace(/_wau\.push\([^)]*\);?/g, "");
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

    html = html.replace(
      /artInstance = new Artplayer\(\{/g,
      `artInstance = new Artplayer({
          controls: [],
          hotkey: false,
          gesture: false,
          miniProgressBar: false,
          backdrop: false,
          playsInline: true,
          icons: { state: '' },`
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

        /* BLINDAGEM CIRÚRGICA DOS CONTROLES NATIVOS DO ARTPLAYER:
           Usa seletor filho direto (>) para atingir APENAS elementos dentro
           do container, NÃO o container raiz (art-video-player) em si.
           O container raiz tem as classes art-mask-show e art-control-show,
           portanto NÃO podemos usar seletores globais como [class*="art-mask"]. */
        .art-video-player > .art-mask,
        .art-video-player > .art-top,
        .art-video-player > .art-bottom,
        .art-video-player > .art-controls,
        .art-video-player > .art-state,
        .art-video-player > .art-loading,
        .art-video-player > .art-notice,
        .art-video-player > .art-settings,
        .art-video-player > .art-contextmenu,
        .art-video-player > .art-danmuku,
        .art-video-player > .art-fast-forward,
        .art-video-player > .art-lock,
        .art-video-player > .art-poster,
        .art-video-player > .art-layers > .art-layer:not(.art-layer-video),
        .art-video-player .art-icon-state,
        .art-video-player .art-layer-state,
        .art-video-player .art-layer-auto-playback,
        .art-video-player .art-layer-loading,
        .art-video-player .art-notice-inner,
        .art-video-player .art-info,
        .art-video-player .art-info-panel,
        .art-video-player .art-progress,
        .art-video-player .art-control,
        #pip-skip-intro-btn,
        #pip-skip-toast {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          animation: none !important;
        }
      </style>

      <script>
        (function() {
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
                // Ocultar apenas elementos de overlay: loading, notificações nativas, etc.
                if (
                  cls.indexOf('player_loading') !== -1 ||
                  cls.indexOf('shion_native') !== -1 ||
                  cls === 'art-state' ||
                  cls === 'art-notice' ||
                  cls === 'art-notice-inner' ||
                  cls === 'art-loading'
                ) {
                  node.style.setProperty('display', 'none', 'important');
                  node.style.setProperty('opacity', '0', 'important');
                  node.style.setProperty('visibility', 'hidden', 'important');
                }
              }
            }
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });

          // 2. Auto-Start rápido na primeira opção disponível
          var tries = 0;
          var autoStartTimer = setInterval(function() {
            tries++;
            var dublado = document.querySelector('.select_language[data-target="1"]');
            if (dublado && !dublado.classList.contains('active')) {
              dublado.click();
            }
            var option = document.querySelector('.players_select_items.visible .player_select_item') || 
                         document.querySelector('.player_select_item');
            if (option) {
              option.click();
              clearInterval(autoStartTimer);
            }
            if (tries > 80) {
              clearInterval(autoStartTimer);
            }
          }, 30);

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
              case "SEEK_ABSOLUTE":
                var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                if (v && typeof t === "number" && !isNaN(t)) {
                  var maxDur = v.duration && v.duration > 0 ? v.duration : 99999;
                  v.currentTime = Math.max(0, Math.min(t, maxDur - 0.5));
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
          }, 350);

          ['play', 'pause', 'playing', 'seeking', 'seeked', 'volumechange', 'ratechange', 'loadedmetadata', 'canplay'].forEach(function(evtName) {
            document.addEventListener(evtName, function(e) {
              if (e.target && (e.target.tagName === 'VIDEO' || e.target.nodeName === 'VIDEO')) {
                sendPlayerStatus(e.target);
              }
            }, true);
          });

          // Blindagem do Artplayer: oculta controles via style (NÃO remove do DOM para não quebrar o player)
          var cleanArtNodes = function() {
            if (window.artInstance) {
              try {
                if (window.artInstance.controls) window.artInstance.controls.show = false;
                if (window.artInstance.mask) window.artInstance.mask.show = false;
              } catch(e) {}
              // Ocultar via style apenas, sem .remove() para não quebrar referências internas do Artplayer
              if (window.artInstance.template) {
                ['$state', '$bottom', '$mask', '$top', '$notice', '$loading', '$controls'].forEach(function(k) {
                  try {
                    var el = window.artInstance.template[k];
                    if (el && el.style) {
                      el.style.setProperty('display', 'none', 'important');
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

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err: any) {
    console.error("[Vercel WatchPlayer Stream Error]:", err.message);
    return res.status(500).send("Erro ao processar stream: " + err.message);
  }
}
