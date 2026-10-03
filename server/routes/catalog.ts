import { Router } from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { doc, updateDoc, increment, collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { seasonAvailabilityCache } from "../utils/caches";
import { db } from "../../server";
import { validateSafeUrl, sanitizeString, checkTrackPlayRateLimit } from "../utils/helpers";
import { WatchedItem, mostWatchedMemoryCache, INITIAL_MOST_WATCHED, scheduleAsyncSaveMostWatched } from "../services/mostWatched";

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
const episodesAvailabilityCache = new Map<string, { timestamp: number; episodes: number[] }>();
const EPISODES_CACHE_TTL = 30 * 60 * 1000; // 30 minutos

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: "Limite de tentativas excedido para o webhook." },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

  router.post("/api/novo-episodio", webhookLimiter, (req, res) => {
    // 1. Verificação de Chave de Autenticação
    const webhookSecret = process.env.WEBHOOK_SECRET?.trim() || "playinfinity-webhook-2025";

    const authHeader = req.headers["authorization"] || "";
    const customHeader = req.headers["x-webhook-secret"] || "";

    const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const providedKey = (typeof customHeader === "string" ? customHeader.trim() : "") || bearerToken;

    if (!providedKey) {
      return res.status(401).json({
        success: false,
        error: "Acesso não autorizado. Chave do webhook inválida ou ausente.",
      });
    }

    // Comparação em tempo constante para prevenir timing attacks
    const providedBuf = Buffer.from(providedKey, "utf8");
    const expectedBuf = Buffer.from(webhookSecret, "utf8");
    const sameLength = providedBuf.length === expectedBuf.length;
    
    const isSafe = sameLength ? crypto.timingSafeEqual(providedBuf, expectedBuf) : false;

    if (!sameLength || !isSafe) {
      return res.status(401).json({
        success: false,
        error: "Acesso não autorizado. Chave do webhook inválida ou ausente (informe via header x-webhook-secret ou Authorization: Bearer).",
      });
    }

    const { title, type = "series", season, episode, playerUrl, imageUrl } = req.body;

    if (!title || !playerUrl) {
      return res.status(400).json({
        success: false,
        error: "Campos obrigatórios: title (título) e playerUrl (URL do player/iframe)",
      });
    }

    // 2. Sanitização da URL do player para evitar injeções maliciosas ou SSRF
    const urlValidation = validateSafeUrl(playerUrl);
    if (!urlValidation.valid) {
      return res.status(400).json({
        success: false,
        error: `URL do player inválida ou não autorizada: ${urlValidation.error}`,
      });
    }

    const newItem: StreamItem = {
      id: "custom-" + Date.now(),
      title: String(title).slice(0, 150),
      type: type === "movie" ? "movie" : "series",
      season: season ? Number(season) : undefined,
      episode: episode ? Number(episode) : undefined,
      playerUrl: urlValidation.parsedUrl!.toString(),
      imageUrl: imageUrl || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80",
      createdAt: new Date().toISOString(),
    };

    customStreams.unshift(newItem);

    console.log(`[Webhook] Novo item recebido com sucesso: ${newItem.title} (${newItem.type})`);

    return res.status(201).json({
      success: true,
      message: "Episódio adicionado e disponível instantaneamente!",
      item: newItem,
    });
  });

  // API 3: Listar episódios/filmes recebidos via endpoint
  router.get("/api/custom-episodes", (_req, res) => {
    res.json({
      success: true,
      items: customStreams,
    });
  });

  // API 3.5: Obter Top 10 Mais Assistidos pelos usuários (Leitura instantânea de RAM O(1))
  router.get("/api/most-watched", (_req, res) => {
    try {
      // Ordena por número de visualizações descrescente, com desempate por última visualização
      const sorted = [...mostWatchedMemoryCache].sort((a, b) => {
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

  // API 3.6: Registrar reprodução iniciada por um usuário (Protegido por rate-limit e sanitização)
  router.post("/api/track-play", (req, res) => {
    try {
      const clientIp = ((req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()) || req.socket.remoteAddress || "127.0.0.1";
      const { id, tmdbId, imdbId, title, type, imageUrl, backdropUrl, quality, playerUrl } = req.body;

      // 1. Sanitização e validação de título
      const cleanTitle = sanitizeString(title, 100);
      if (!cleanTitle || cleanTitle.length < 1) {
        return res.status(400).json({ success: false, error: "Título inválido ou não fornecido." });
      }

      // Chave de desduplicação por título normalizado
      const normTitle = cleanTitle.toUpperCase();
      const dedupeKey = tmdbId ? `tmdb:${tmdbId}` : `title:${normTitle}`;

      // 2. Verificação de rate-limit e anti-inflação de views por IP
      const rateCheck = checkTrackPlayRateLimit(clientIp, dedupeKey);
      if (!rateCheck.allowed) {
        return res.status(429).json({ success: false, error: rateCheck.error || "Muitas requisições. Aguarde um momento." });
      }

      // Validação estrita de campos
      const safeType = type === "series" ? "series" : "movie";
      const allowedQualities = ["HD", "FHD", "4K", "CAM", "SD"];
      const safeQuality = allowedQualities.includes(quality) ? quality : "HD";
      const safeImageUrl = sanitizeString(imageUrl, 500) || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80";
      const safeBackdropUrl = sanitizeString(backdropUrl, 500) || safeImageUrl;
      const safePlayerUrl = sanitizeString(playerUrl, 500);

      // Procura por tmdbId ou título normalizado diretamente na RAM
      let existing = mostWatchedMemoryCache.find(
        (it) => (tmdbId && it.tmdbId === Number(tmdbId)) || (id && it.id === id) || it.title.toUpperCase() === normTitle
      );

      if (existing) {
        // Incrementa view apenas se passou da janela de cooldown do IP (anti-flood)
        if (rateCheck.shouldIncrement) {
          existing.views += 1;
        }
        existing.lastWatched = new Date().toISOString();
        if (safePlayerUrl && (!existing.playerUrl || existing.playerUrl.includes("watchplay.shop"))) existing.playerUrl = safePlayerUrl;
        if (safeImageUrl && !existing.imageUrl) existing.imageUrl = safeImageUrl;
        if (safeBackdropUrl && !existing.backdropUrl) existing.backdropUrl = safeBackdropUrl;
        existing.quality = safeQuality;
      } else {
        const newItem: WatchedItem = {
          id: id || (tmdbId ? Number(tmdbId) : Date.now()),
          tmdbId: tmdbId ? Number(tmdbId) : undefined,
          imdbId: sanitizeString(imdbId, 20) || undefined,
          title: cleanTitle,
          type: safeType,
          imageUrl: safeImageUrl,
          backdropUrl: safeBackdropUrl,
          quality: safeQuality,
          playerUrl: safePlayerUrl || undefined,
          views: 1,
          lastWatched: new Date().toISOString(),
        };
        mostWatchedMemoryCache.push(newItem);
        existing = newItem;

        // Limite máximo de 100 títulos no cache em RAM para evitar estouro de memória
        if (mostWatchedMemoryCache.length > 100) {
          mostWatchedMemoryCache.sort((a, b) => b.views - a.views);
          mostWatchedMemoryCache.splice(100);
        }
      }

      // Persistência assíncrona não-bloqueante no disco com debounce
      scheduleAsyncSaveMostWatched();

      res.json({
        success: true,
        message: rateCheck.shouldIncrement ? "Visualização registrada com sucesso" : "Reprodução já contabilizada recentemente",
        item: existing,
      });
    } catch (err: any) {
      console.error("[API track-play] Erro:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========================================================
  // Integração Asaas (Assinaturas e Pagamentos)
  // ========================================================
  export const getAsaasHeaders = () => ({
    "access_token": process.env.ASAAS_API_KEY || "",
    "Content-Type": "application/json"
  });
  export const getAsaasBaseUrl = () => process.env.ASAAS_ENVIRONMENT === "sandbox" ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3";

  // Criar Assinatura e retornar link de pagamento (Seguro: Preço e userId definidos exclusivamente pelo servidor)
  router.get("/api/series/available-episodes", async (req, res) => {
    try {
      const rawId = String(req.query.id || "").trim();
      const season = parseInt(String(req.query.season || "1"), 10) || 1;
      const total = Math.min(Math.max(parseInt(String(req.query.total || "24"), 10) || 1, 1), 100);

      if (!rawId) {
        return res.status(400).json({ success: false, error: "ID da série obrigatório" });
      }

      // Se for IMDb tt..., converte para TMDB se possível
      let resolvedId = rawId;
      if (rawId.startsWith("tt")) {
        try {
          const tmdbApiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
          if (tmdbApiKey) {
            const findRes = await fetch(
              `https://api.themoviedb.org/3/find/${rawId}?api_key=${tmdbApiKey}&external_source=imdb_id`,
              { signal: AbortSignal.timeout(3000) }
            );
            if (findRes.ok) {
              const findData = await findRes.json();
              if (findData.tv_results?.[0]?.id) {
                resolvedId = String(findData.tv_results[0].id);
              }
            }
          }
        } catch {}
      }

      const cacheKey = `${resolvedId}_${season}`;
      const cached = episodesAvailabilityCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < EPISODES_CACHE_TTL) {
        return res.json({
          success: true,
          id: resolvedId,
          season,
          availableEpisodes: cached.episodes,
          totalAvailable: cached.episodes.length,
          cached: true,
        });
      }

      // Função de sondagem de um episódio individual
      const checkEpisode = async (ep: number): Promise<boolean> => {
        try {
          // 1. Sondagem WatchPlayer (HEAD request rápido)
          const wpPromise = (async () => {
            try {
              const wpRes = await fetch(`https://v1.watchplay.shop/tvshow/${resolvedId}/${season}/${ep}`, {
                method: "HEAD",
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
                signal: AbortSignal.timeout(3500),
              });
              return wpRes.status === 200 || wpRes.status === 301 || wpRes.status === 302;
            } catch {
              return false;
            }
          })();

          // 2. Sondagem VIP Player Ajax
          const vipPromise = (async () => {
            try {
              const ajaxUrl = `https://playerflix.ink/inc/Ajax.php?type=tv&id=${resolvedId}&season=${season}&episode=${ep}`;
              const ajaxRes = await fetch(ajaxUrl, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                  "Referer": "https://playerflix.ink/",
                  "X-Requested-With": "XMLHttpRequest",
                },
                signal: AbortSignal.timeout(3500),
              });
              if (!ajaxRes.ok) return false;
              const j = await ajaxRes.json();
              if (j && j.status && Array.isArray(j.data?.options)) {
                const valid = j.data.options.filter((opt: any) => {
                  const u = (opt.embed || "").toLowerCase();
                  return (
                    !u.includes("superflix") &&
                    !u.includes("sfapi") &&
                    !u.includes("byse") &&
                    !u.includes("streamberry")
                  );
                });
                return valid.length > 0;
              }
              return false;
            } catch {
              return false;
            }
          })();

          const [hasWp, hasVip] = await Promise.all([wpPromise, vipPromise]);
          return hasWp || hasVip;
        } catch {
          return false;
        }
      };

      // Executa sondagem paralela de todos os episódios da temporada
      const promises: Promise<{ ep: number; available: boolean }>[] = [];
      for (let ep = 1; ep <= total; ep++) {
        promises.push(
          checkEpisode(ep).then((available) => ({ ep, available }))
        );
      }

      const results = await Promise.all(promises);
      const availableEpisodes = results.filter((r) => r.available).map((r) => r.ep);

      // Salva no cache se encontrou episódios
      if (availableEpisodes.length > 0) {
        episodesAvailabilityCache.set(cacheKey, {
          timestamp: Date.now(),
          episodes: availableEpisodes,
        });
      }

      return res.json({
        success: true,
        id: resolvedId,
        season,
        availableEpisodes:
          availableEpisodes.length > 0
            ? availableEpisodes
            : Array.from({ length: total }, (_, i) => i + 1),
        totalAvailable: availableEpisodes.length > 0 ? availableEpisodes.length : total,
        cached: false,
      });
    } catch (err: any) {
      console.error("[Available Episodes Error]:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Proxy de Dados do Playerflix / VIP Player

export default router;
