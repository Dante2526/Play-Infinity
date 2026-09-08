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
  app.post("/api/watchplay-proxy-api", async (req, res) => {
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

      // 2. Redirecionar requisições da API interna para o proxy local
      html = html.replace(/var HOME_URL = ['"]https:\/\/v1\.watchplay\.shop['"];/g, "var HOME_URL = '/api/watchplay-proxy-api';");

      // 3. Remover rastreadores ou banners conhecidos
      html = html.replace(/_wau\.push\([^)]*\);?/g, "");

      // 4. Injetar auto-clique instantâneo na primeira opção (Dublado) e ocultar telas intermediárias
      const autoPlayInjection = `
        <style>
          /* Oculta o seletor de opções para iniciar o vídeo direto */
          .players_select_container {
            opacity: 0 !important;
            transition: opacity 0.2s ease;
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
              var option = document.querySelector('.player_select_item');
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
            }, 35);
          })();
        </script>
      `;

      html = html.replace("</body>", `${autoPlayInjection}</body>`);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (err: any) {
      console.error("[WatchPlayer Stream Error]:", err.message);
      return res.status(500).send("Erro ao processar stream: " + err.message);
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
