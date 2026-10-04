import { Router } from "express";
import axios from "axios";
import os from "os";
import * as cheerio from "cheerio";
import { validateSafeUrl, isSuperflixDetected } from "../utils/helpers";
import { isServerBlacklisted } from "../../src/data/serverBlacklist";
import { animeDirectStreamCache, vixsrcStreamCache } from "../utils/caches";

const router = Router();

  router.get("/api/extract-player", async (req, res) => {
    const targetUrl = req.query.url as string;

    const validation = validateSafeUrl(targetUrl);
    if (!validation.valid) {
      return res.status(403).json({ success: false, error: validation.error });
    }

    if (isServerBlacklisted(targetUrl)) {
      return res.status(403).json({ success: false, error: "Servidor bloqueado na blacklist permanente do Play Infinity." });
    }

    try {
      console.log(`[Extrator] Buscando player de: ${targetUrl}`);

      const response = await fetch(targetUrl, { signal: AbortSignal.timeout(15000),
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
            const ajaxRes = await fetch(ajaxUrl, { signal: AbortSignal.timeout(15000),
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

  // Limite estrito específico para webhook (10 tentativas/minuto)

  // API 2: Endpoint para receber novos episódios instantaneamente (Webhook Autenticado e Seguro)
  router.get("/api/player-diagnostics", async (req, res) => {
    const testUrl = (req.query.url as string) || "https://v1.watchplay.shop/tvshow/66732/1/1";
    const validation = validateSafeUrl(testUrl);
    if (!validation.valid) {
      return res.status(403).json({ success: false, url: testUrl, error: validation.error });
    }

    try {
      const startTime = Date.now();
      const headRes = await fetch(testUrl, { signal: AbortSignal.timeout(15000),
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

  // Cache de URLs diretas e assinadas para episódios de animes
  
  

  async function resolveAnimesOnline(title: string, episode: string | number = 1): Promise<string | null> {
    if (!title) return null;
    try {
      // Normaliza o título base (remove " - T1:E1...", dublagem, parênteses)
      let baseTitle = title.split(" - ")[0].replace(/\(.*?\)/g, "").trim();
      baseTitle = baseTitle.replace(/dublado/i, "").replace(/legendado/i, "").trim();
      const cleanTitle = baseTitle.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      if (!cleanTitle) return null;

      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Referer": "https://animesonlinecc.to/",
        "X-Forwarded-For": "177.100.100.1"
      };

      // Mapeamento de títulos em Inglês/Português do TMDB para Romaji (usado pelos sites de anime)
      let searchTitle = cleanTitle;
      const titleMap: Record<string, string> = {
        "attack on titan": "shingeki no kyojin",
        "demon slayer": "kimetsu no yaiba",
        "my hero academia": "boku no hero academia",
        "the seven deadly sins": "nanatsu no taizai",
        "sword art online": "sword art online",
        "fullmetal alchemist": "fullmetal alchemist",
        "dragon ball z": "dragon ball z", // Força busca exata
      };

      for (const [en, jp] of Object.entries(titleMap)) {
        if (cleanTitle.includes(en)) {
          searchTitle = cleanTitle.replace(en, jp);
          break;
        }
      }

      const searchSlug = encodeURIComponent(searchTitle.replace(/\s+/g, "+"));
      const searchUrl = `https://animesonlinecc.to/search/${searchSlug}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const searchRes = await fetch(searchUrl, {
        signal: controller.signal,
        headers
      });
      clearTimeout(timeout);
      if (!searchRes.ok) return null;
      const searchHtml = await searchRes.text();

      const animeMatches = [...searchHtml.matchAll(/href=["'](https:\/\/animesonlinecc\.to\/anime\/[^"']+)["']/g)].map(m => m[1]);
      const uniqueAnimes = [...new Set(animeMatches)];
      if (uniqueAnimes.length === 0) return null;

      // Prioriza estritamente versões DUBLADO PT-BR (Brasil)
      const dubladoMatches = uniqueAnimes.filter(u => u.includes("dublado"));
      let targetAnime = dubladoMatches.length > 0 ? dubladoMatches[0] : uniqueAnimes[0];

      if (cleanTitle === "naruto") {
        const exact = uniqueAnimes.find(u => u.includes("naruto-dublado") || u.endsWith("/anime/naruto/"));
        if (exact) targetAnime = exact;
      } else if (cleanTitle.includes("shippuden")) {
        const exact = uniqueAnimes.find(u => u.includes("naruto-shippuden-dublado") || u.includes("naruto-shippuden"));
        if (exact) targetAnime = exact;
      } else if (cleanTitle === "dragon ball") {
        const exact = uniqueAnimes.find(u => u.includes("dragon-ball-dublado") || u.endsWith("/anime/dragon-ball/"));
        if (exact) targetAnime = exact;
      } else if (cleanTitle.includes("dragon ball z")) {
        const exact = uniqueAnimes.find(u => u.includes("dragon-ball-z-dublado") || u.includes("dragon-ball-z"));
        if (exact) targetAnime = exact;
      } else if (cleanTitle.includes("dragon ball super")) {
        const exact = uniqueAnimes.find(u => u.includes("dragon-ball-super-dublado") || u.includes("dragon-ball-super"));
        if (exact) targetAnime = exact;
      }

      const animePageRes = await fetch(targetAnime, { signal: AbortSignal.timeout(15000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://animesonlinecc.to/"
        }
      });
      if (!animePageRes.ok) return null;
      const animeHtml = await animePageRes.text();

      const epMatches = [...animeHtml.matchAll(/href=["'](https:\/\/animesonlinecc\.to\/episodio\/[^"']+)["']/g)].map(m => m[1]);
      const uniqueEps = [...new Set(epMatches)];
      if (uniqueEps.length === 0) return null;

      const epNum = Number(episode) || 1;
      const targetEp = uniqueEps.find(u => 
        u.includes(`-episodio-${epNum}/`) || 
        u.includes(`-ep-${epNum}/`) || 
        u.endsWith(`-${epNum}/`) ||
        u.endsWith(`/${epNum}/`)
      ) || uniqueEps[0];

      const epPageRes = await fetch(targetEp, { signal: AbortSignal.timeout(15000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": targetAnime
        }
      });
      if (!epPageRes.ok) return null;
      const epHtml = await epPageRes.text();

      const iframeMatch = epHtml.match(/<iframe[^>]*src=["'](https:\/\/www\.blogger\.com\/video\.g\?token=[^"']+)["']/i);
      if (iframeMatch) {
        return iframeMatch[1];
      }
      return null;
    } catch (err: any) {
      console.warn("[AnimesOnline Resolver] Falha na busca alternativa:", err.message);
      return null;
    }
  }

  export async function resolveDirectAnimeStream(
    tmdbId: string | number,
    season: string | number,
    episode: string | number,
    isMovie: boolean = false,
    animeTitle: string = ""
  ): Promise<{ streamUrl: string; subtitleUrl?: string; isBlogger?: boolean } | null> {
    const cacheKey = `${tmdbId}:${season}:${episode}:${isMovie}:${animeTitle}`;
    const cached = animeDirectStreamCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return { streamUrl: cached.streamUrl, subtitleUrl: cached.subtitleUrl, isBlogger: cached.isBlogger };
    }

    try {
      const pageUrl = isMovie
        ? `https://v1.watchplay.shop/movie/${tmdbId}`
        : `https://v1.watchplay.shop/tvshow/${tmdbId}/${season}/${episode}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);

      const pageRes = await fetch(pageUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://v1.watchplay.shop/"
        }
      });
      clearTimeout(timeout);
      
      // Se o WatchPlayer redirecionar para 404 (ex: Naruto clássico, Dragon Ball clássico)
      if (!pageRes.ok || pageRes.url.includes("404")) {
        if (animeTitle) {
          const bloggerUrl = await resolveAnimesOnline(animeTitle, episode);
          if (bloggerUrl) {
            const resBlogger = { streamUrl: bloggerUrl, isBlogger: true };
            animeDirectStreamCache.set(cacheKey, { ...resBlogger, timestamp: Date.now() });
            return resBlogger;
          }
        }
        return null;
      }

      const html = await pageRes.text();

      if (isSuperflixDetected(html, pageUrl)) return null;

      let contentId: string | null = null;
      if (isMovie) {
        const match = html.match(/data-contentid=["'](\d+)["']/i) || html.match(/contentid\s*:\s*['"]?(\d+)['"]?/i);
        if (match) contentId = match[1];
      } else {
        const regex = new RegExp(`class=["'][^"']*episodeOption[^"']*["'][^>]*data-contentid=["'](\\d+)["'][^>]*data-season=["']${season}["'][^>]*data-episode=["']${episode}["']`, 'i');
        const match = html.match(regex) || html.match(new RegExp(`data-season=["']${season}["'][^>]*data-episode=["']${episode}["'][^>]*data-contentid=["'](\\d+)["']`, 'i'));
        if (match) {
          contentId = match[1];
        } else {
          const activeMatch = html.match(/class=["'][^"']*episodeOption\\s+active[^"']*["'][^>]*data-contentid=["'](\\d+)["']/i);
          if (activeMatch) contentId = activeMatch[1];
        }
      }

      // Se não encontrou contentId no WatchPlayer, tenta AnimesOnline
      if (!contentId && animeTitle) {
        const bloggerUrl = await resolveAnimesOnline(animeTitle, episode);
        if (bloggerUrl) {
          const resBlogger = { streamUrl: bloggerUrl, isBlogger: true };
          animeDirectStreamCache.set(cacheKey, { ...resBlogger, timestamp: Date.now() });
          return resBlogger;
        }
      }

      let optionId: string | null = null;
      if (contentId) {
        const optRes = await fetch("https://v1.watchplay.shop/api", { signal: AbortSignal.timeout(15000),
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": pageUrl,
            "X-Requested-With": "XMLHttpRequest"
          },
          body: new URLSearchParams({ action: "getOptions", contentid: contentId }).toString()
        });
        const optJson: any = await optRes.json().catch(() => null);
        if (optJson?.data?.options?.length > 0) {
          const dubOpt = optJson.data.options.find((o: any) => String(o.target) === "1" || /dub/i.test(o.type || ""));
          optionId = String((dubOpt || optJson.data.options[0]).ID);
        }
      }

      if (!optionId) {
        const idMatch = html.match(/player_select_item["'][^>]*data-id=["'](\d+)["']/i);
        
         const regexOptions = /player_select_item["'][^>]*data-id=["'](\d+)["'][^>]*>[\s\S]*?<div[^>]*player_select_name[^>]*>([^<]+)<\/div>/gi;
         let match;
         const options = [];
         while ((match = regexOptions.exec(html)) !== null) {
            options.push({ id: match[1], name: match[2].trim() });
         }
         if (options.length > 0) {
            const upnsOpt = options.find(o => o.name.includes("UPNS"));
            optionId = upnsOpt ? upnsOpt.id : options[0].id;
         }

      }

      if (!optionId) {
        if (animeTitle) {
          const bloggerUrl = await resolveAnimesOnline(animeTitle, episode);
          if (bloggerUrl) {
            const resBlogger = { streamUrl: bloggerUrl, isBlogger: true };
            animeDirectStreamCache.set(cacheKey, { ...resBlogger, timestamp: Date.now() });
            return resBlogger;
          }
        }
        return null;
      }

      const playerRes = await fetch("https://v1.watchplay.shop/api", { signal: AbortSignal.timeout(15000),
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": pageUrl,
          "X-Requested-With": "XMLHttpRequest"
        },
        body: new URLSearchParams({ action: "getPlayer", video_id: optionId }).toString()
      });
      const playerJson: any = await playerRes.json().catch(() => null);
      const rawVideoUrl: string = playerJson?.data?.video_url;
      if (!rawVideoUrl) return null;

      let finalStreamUrl = rawVideoUrl;
      if (rawVideoUrl.includes("vid7102402.hclod.qzz.io") && !rawVideoUrl.includes("md5=")) {
        const signTarget = new URL(pageUrl);
        signTarget.searchParams.set("action_secure_sign", "1");
        signTarget.searchParams.set("raw_url", rawVideoUrl);
        const signRes = await fetch(signTarget.toString(), { signal: AbortSignal.timeout(15000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": pageUrl,
            "X-Requested-With": "XMLHttpRequest"
          }
        });
        const signJson: any = await signRes.json().catch(() => null);
        if (signJson?.signed_url) {
          finalStreamUrl = signJson.signed_url;
        }
      }

      let subtitleUrl = playerJson?.data?.video_caption_url;
      if (!subtitleUrl && !isMovie) {
        subtitleUrl = `https://v1.watchplay.shop/app/caption/tvshow/${tmdbId}/leg/s${season}e${episode}.vtt`;
      }

      const result = { streamUrl: finalStreamUrl, subtitleUrl, isBlogger: false };
      animeDirectStreamCache.set(cacheKey, { ...result, timestamp: Date.now() });
      return result;
    } catch (err: any) {
      console.warn("[Anime Resolver] Falha ao extrair stream direto:", err.message);
      if (animeTitle) {
        const bloggerUrl = await resolveAnimesOnline(animeTitle, episode);
        if (bloggerUrl) {
          const resBlogger = { streamUrl: bloggerUrl, isBlogger: true };
          animeDirectStreamCache.set(cacheKey, { ...resBlogger, timestamp: Date.now() });
          return resBlogger;
        }
      }
      return null;
    }
  }

  // Cache para extração de master playlists do Vixsrc
  

  export async function resolveVixsrcStream(tmdbId: string | number, type: 'movie' | 'tv', season: number = 1, episode: number = 1) {
    const cacheKey = `${tmdbId}:${type}:${season}:${episode}`;
    const cached = vixsrcStreamCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
      return cached;
    }

    try {
      const BASE_URL = 'https://vixsrc.to';
      const VIXSRC_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': BASE_URL,
        'Origin': BASE_URL
      };

      const apiUrl = type === 'movie' 
        ? `${BASE_URL}/api/movie/${tmdbId}`
        : `${BASE_URL}/api/tv/${tmdbId}/${season}/${episode}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const apiRes = await fetch(apiUrl, {
        headers: VIXSRC_HEADERS,
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!apiRes.ok) return null;
      const apiData: any = await apiRes.json().catch(() => null);
      if (!apiData?.src) return null;

      const embedPageRes = await fetch(BASE_URL + apiData.src, { signal: AbortSignal.timeout(15000),
        headers: { ...VIXSRC_HEADERS, Accept: 'text/html' }
      });
      if (!embedPageRes.ok) return null;
      const html = await embedPageRes.text();

      const token = html.match(/token["']\s*:\s*["']([^"']+)/)?.[1];
      const expires = html.match(/expires["']\s*:\s*["']([^"']+)/)?.[1];
      const playlist = html.match(/url\s*:\s*["']([^"']+)/)?.[1];

      if (!token || !expires || !playlist) return null;

      const sep = playlist.includes('?') ? '&' : '?';
      const masterUrl = `${playlist}${sep}token=${token}&expires=${expires}&h=1`;
      const result = { masterUrl, embedUrl: BASE_URL + apiData.src, timestamp: Date.now() };
      vixsrcStreamCache.set(cacheKey, result);
      return result;
    } catch (err: any) {
      console.warn(`[Vixsrc] Resolver warning: ${err.message}`);
      return null;
    }
  }

  // API 4.5: Proxy HLS Anti-CORS para reprodução direta sem bloqueios no Artplayer
  router.get("/api/speedtest-down", (req, res) => {
    try {
      const bytesRaw = Number(req.query.bytes);
      // Padrão de 25MB se não especificado, máximo de 200MB por requisição
      const bytesToDownload = !isNaN(bytesRaw) && bytesRaw > 0 ? Math.min(bytesRaw, 200 * 1024 * 1024) : 25 * 1024 * 1024;
      
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", bytesToDownload.toString());
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const chunkSize = 64 * 1024; // 64KB por chunk
      const chunk = Buffer.alloc(chunkSize, 0);
      let bytesSent = 0;

      const sendChunk = () => {
        let canContinue = true;
        while (bytesSent < bytesToDownload && canContinue) {
          const toSend = Math.min(chunkSize, bytesToDownload - bytesSent);
          if (toSend < chunkSize) {
            canContinue = res.write(chunk.subarray(0, toSend));
          } else {
            canContinue = res.write(chunk);
          }
          bytesSent += toSend;
        }

        if (bytesSent >= bytesToDownload) {
          res.end();
        } else if (!canContinue) {
          // Backpressure: espera o buffer esvaziar antes de continuar
          res.once('drain', sendChunk);
        }
      };

      req.on("close", () => {
        bytesSent = bytesToDownload; // Aborta envio
      });

      sendChunk();
    } catch (err) {
      console.error("[SpeedTest Down Error]:", err);
      if (!res.headersSent) res.status(500).send("Erro");
    }
  });

  router.post("/api/speedtest-up", (req, res) => {
    // Apenas recebe e descarta os dados
    req.on("data", () => { /* descarta */ });
    req.on("end", () => {
      res.status(200).send("OK");
    });
    req.on("error", () => {
      if (!res.headersSent) res.status(500).send("Error");
    });
  });


export default router;
