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

    html = html.replace(/var AUTO_PLAY_ENABLED = false;/g, "var AUTO_PLAY_ENABLED = true;");
    html = html.replace(/AUTO_PLAY_ENABLED && options\.length == 1/g, "true");
    html = html.replace(/var HOME_URL = ['"]https:\/\/v1\.watchplay\.shop['"];/g, "var HOME_URL = '/api/watchplay-proxy-api';");
    html = html.replace(/\$\{HOME_URL\}\/api/g, "/api/watchplay-proxy-api");
    html = html.replace(/_wau\.push\([^)]*\);?/g, "");
    html = html.replace(/<div[^>]*class=["'][^"']*changeOptions[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");
    html = html.replace(/Mostrar\s*Op[çc][õo]es/gi, "");

    const autoPlayInjection = `
      <style>
        .changeOptions,
        [class*="changeOptions"],
        [id*="changeOptions"],
        .players_select_container,
        .players_select_btn,
        [class*="players_select"],
        [id*="players_select"],
        .btn-opcoes,
        .mostrar_opcoes,
        #mostrar_opcoes,
        [class*="opcoes"],
        [id*="opcoes"],
        [class*="option"],
        [id*="option"],
        .btn_options,
        .show_options,
        .art-state,
        .art-icon-state,
        .art-layer-state,
        [class*="art-state"],
        [class*="state-icon"],
        .art-mask {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
        .player_container.visible {
          opacity: 1 !important;
        }
        .embedder_especial, .embedder_info, #_wau_container {
          display: none !important;
        }
      </style>
      <script>
        (function() {
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
              var container = document.querySelector('.players_select_container');
              if (container) {
                container.style.opacity = '1';
                container.style.pointerEvents = 'auto';
              }
            }
          }, 40);

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

          var artCheckInterval = setInterval(function() {
            if (window.artInstance && !window.artInstance._endedHooked) {
              window.artInstance._endedHooked = true;
              window.artInstance.on('video:ended', function() {
                notifyEpisodeEnded();
              });
              window.artInstance.on('video:timeupdate', function() {
                var v = window.artInstance.video;
                if (v && v.duration > 30 && v.currentTime >= (v.duration - 1.5)) {
                  notifyEpisodeEnded();
                }
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

    html = html.replace("</body>", `${autoPlayInjection}</body>`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err: any) {
    console.error("[Vercel WatchPlayer Stream Error]:", err.message);
    return res.status(500).send("Erro ao processar stream: " + err.message);
  }
}
