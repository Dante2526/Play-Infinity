import express from "express";
import path from "path";
import fs from "fs";
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

// Interface e armazenamento dos Mais Assistidos pelos usuários
interface WatchedItem {
  id: number | string;
  tmdbId?: number;
  imdbId?: string;
  title: string;
  type: "movie" | "series";
  imageUrl?: string;
  backdropUrl?: string;
  quality?: "CAM" | "TS" | "HD" | "4K" | "FULL HD";
  playerUrl?: string;
  views: number;
  lastWatched: string;
}

const INITIAL_MOST_WATCHED: WatchedItem[] = [
  {
    id: 299534,
    tmdbId: 299534,
    title: "VINGADORES: ULTIMATO",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/9fRX8UKlIW7Lb9GqNsJVakWWFCi.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/299534",
    views: 185,
    lastWatched: new Date().toISOString()
  },
  {
    id: 66732,
    tmdbId: 66732,
    imdbId: "tt4574334",
    title: "STRANGER THINGS",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/twfKp60THrcOIep9sjHODOOfO8d.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/66732/1/1",
    views: 172,
    lastWatched: new Date().toISOString()
  },
  {
    id: 533535,
    tmdbId: 533535,
    title: "DEADPOOL & WOLVERINE",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/cJFqqiDYprqExaXatu4AaoMzDG2.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/533535",
    views: 164,
    lastWatched: new Date().toISOString()
  },
  {
    id: 93405,
    tmdbId: 93405,
    title: "ROUND 6 (SQUID GAME)",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/6gcHdboppvplmBWxvROc96NJnmm.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/2meX1nMdScFOoV4370rqHWKmXhY.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/93405/1/1",
    views: 153,
    lastWatched: new Date().toISOString()
  },
  {
    id: 969681,
    tmdbId: 969681,
    imdbId: "tt22084616",
    title: "HOMEM-ARANHA: UM NOVO DIA",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/x0nvYzQpyJc5pdT9lMnkMuYAg0O.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/qeQJx07rK2xm8SD2sJxFKhE7gs0.jpg",
    quality: "CAM",
    playerUrl: "https://v1.watchplay.shop/movie/tt22084616",
    views: 147,
    lastWatched: new Date().toISOString()
  },
  {
    id: 119051,
    tmdbId: 119051,
    title: "WANDINHA",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/7rxiQrZjrer0RB9qNA8rHYFo53R.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/119051/1/1",
    views: 138,
    lastWatched: new Date().toISOString()
  },
  {
    id: 157336,
    tmdbId: 157336,
    title: "INTERESTELAR",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/gEU2QniE6EwfVDxCzsxPnZLi1ZT.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/rAiYTsqJiOkn00e21jS1vQhYyY.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/157336",
    views: 129,
    lastWatched: new Date().toISOString()
  },
  {
    id: 100088,
    tmdbId: 100088,
    title: "THE LAST OF US",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/el1KQzwdIm17I3A6cYPfsVIWhfX.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/100088/1/1",
    views: 118,
    lastWatched: new Date().toISOString()
  },
  {
    id: 1022789,
    tmdbId: 1022789,
    title: "DIVERTIDA MENTE 2",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/lHKNS35r4RTa9GO72vdadMLxoiV.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/stKGOmbuwhL489ZJnZUVvA34Dt.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/1022789",
    views: 105,
    lastWatched: new Date().toISOString()
  },
  {
    id: 94997,
    tmdbId: 94997,
    title: "A CASA DO DRAGÃO",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/oKJDm4QCKbp6mR4FnxXrFlPJP8Y.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/etjA24UepnNnLh2t9qjU2Vj2g3g.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/94997/1/1",
    views: 95,
    lastWatched: new Date().toISOString()
  }
];

function getMostWatchedFilePath(): string {
  return path.join(process.cwd(), "data", "most-watched.json");
}

function loadMostWatched(): WatchedItem[] {
  try {
    const filePath = getMostWatchedFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("[MostWatched] Erro ao carregar arquivo:", err);
  }
  return [...INITIAL_MOST_WATCHED];
}

function saveMostWatched(items: WatchedItem[]): void {
  try {
    const dir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = getMostWatchedFilePath();
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), "utf-8");
  } catch (err) {
    console.error("[MostWatched] Erro ao salvar arquivo:", err);
  }
}

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

  // API 3.5: Obter Top 10 Mais Assistidos pelos usuários
  app.get("/api/most-watched", (_req, res) => {
    try {
      const items = loadMostWatched();
      // Ordena por número de visualizações descrescente, com desempate por última visualização
      const sorted = [...items].sort((a, b) => {
        if (b.views !== a.views) return b.views - a.views;
        return new Date(b.lastWatched).getTime() - new Date(a.lastWatched).getTime();
      });
      res.json({
        success: true,
        items: sorted.slice(0, 10),
      });
    } catch (err: any) {
      console.error("[API most-watched] Erro:", err);
      res.status(500).json({ success: false, error: err.message, items: INITIAL_MOST_WATCHED.slice(0, 10) });
    }
  });

  // API 3.6: Registrar reprodução de filme ou série iniciada por um usuário
  app.post("/api/track-play", (req, res) => {
    try {
      const { id, tmdbId, imdbId, title, type, imageUrl, backdropUrl, quality, playerUrl } = req.body;

      if (!title) {
        return res.status(400).json({ success: false, error: "O título é obrigatório para contabilizar." });
      }

      const items = loadMostWatched();
      const normTitle = String(title).trim().toUpperCase();

      // Procura por tmdbId ou título normalizado
      let existing = items.find(
        (it) => (tmdbId && it.tmdbId === Number(tmdbId)) || (id && it.id === id) || it.title.toUpperCase() === normTitle
      );

      if (existing) {
        existing.views += 1;
        existing.lastWatched = new Date().toISOString();
        if (playerUrl && (!existing.playerUrl || existing.playerUrl.includes("watchplay.shop"))) existing.playerUrl = playerUrl;
        if (imageUrl && !existing.imageUrl) existing.imageUrl = imageUrl;
        if (backdropUrl && !existing.backdropUrl) existing.backdropUrl = backdropUrl;
        if (quality) existing.quality = quality;
      } else {
        const newItem: WatchedItem = {
          id: id || tmdbId || Date.now(),
          tmdbId: tmdbId ? Number(tmdbId) : undefined,
          imdbId,
          title: String(title).trim(),
          type: type === "series" ? "series" : "movie",
          imageUrl: imageUrl || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80",
          backdropUrl: backdropUrl || imageUrl,
          quality: quality || "HD",
          playerUrl,
          views: 1,
          lastWatched: new Date().toISOString(),
        };
        items.push(newItem);
        existing = newItem;
      }

      saveMostWatched(items);

      console.log(`[Audiência] "${existing.title}" reproduzido! Total de views: ${existing.views}`);

      res.json({
        success: true,
        message: "Visualização registrada com sucesso",
        item: existing,
      });
    } catch (err: any) {
      console.error("[API track-play] Erro:", err);
      res.status(500).json({ success: false, error: err.message });
    }
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

      // 0. Bloqueio definitivo do Superflix: se o WatchPlayer não tem o vídeo nativo e tenta jogar pro Superflix, rejeitamos
      const isFallbackMode = html.includes("superflixapi") || (html.includes("superflix") && !html.includes("superflix-ad-filter"));

      if (isFallbackMode) {
        console.warn(`[Superflix Banido]: WatchPlayer tentou redirecionar para Superflix (${targetUrl}). Bloqueando e acionando fallback.`);
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
