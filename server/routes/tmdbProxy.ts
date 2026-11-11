import { Router } from "express";
import { tmdbCache } from "../utils/caches";
import { getSaimoStore } from "../services/saimoSqliteStore";

const router = Router();
const _tmdbProxyInflight = new Map<string, Promise<{ status: number; data: any }>>();

// TMDB Proxy (Oculta a chave de API do cliente, evita vazamento no DevTools e cacheia em LRU 15min)
router.get(["/api/tmdb", "/api/tmdb/*"], async (req, res) => {
    try {
      const tmdbPath = (req.params as any)[0] || (req.query.path as string) || "";
      const query = new URLSearchParams(req.query as any);
      query.delete("path");

      const cleanPath = tmdbPath.replace(/^\/+/, "");
      const cacheKey = `${cleanPath}?${query.toString()}`;

      const cached = tmdbCache.get(cacheKey);
      if (cached) {
        res.setHeader("Cache-Control", "public, max-age=900");
        return res.status(cached.status).json(cached.data);
      }

      let inflight = _tmdbProxyInflight.get(cacheKey);
      if (!inflight) {
        inflight = (async () => {
          const apiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || "";
          query.set("api_key", apiKey);
          const url = `https://api.themoviedb.org/3/${cleanPath}?${query.toString()}`;
          const response = await fetch(url, {
            signal: AbortSignal.timeout(15000),
            headers: { "accept": "application/json" }
          });
          let data = await response.json();

          // Auto-correção de digitação (typo): se a busca no TMDB retornar vazia,
          // consulta títulos aproximados no catálogo local do Saimo (ex.: Matcbox -> Matchbox)
          if (cleanPath.startsWith("search/") && (!data?.results || data.results.length === 0)) {
            const rawQuery = query.get("query") || "";
            const saimoStore = getSaimoStore();
            const corrected = saimoStore?.findFuzzyTitle(rawQuery);
            if (corrected && corrected.toLowerCase() !== rawQuery.toLowerCase()) {
              const retryQuery = new URLSearchParams(query);
              retryQuery.set("query", corrected);
              const retryUrl = `https://api.themoviedb.org/3/${cleanPath}?${retryQuery.toString()}`;
              try {
                const retryRes = await fetch(retryUrl, {
                  signal: AbortSignal.timeout(10000),
                  headers: { "accept": "application/json" }
                });
                const retryData = await retryRes.json();
                if (retryRes.ok && retryData?.results && retryData.results.length > 0) {
                  data = retryData;
                }
              } catch {}
            }
          }

          if (response.ok && data && typeof data === "object") {
            tmdbCache.set(cacheKey, { status: response.status, data });
          }
          return { status: response.status, data };
        })();
        _tmdbProxyInflight.set(cacheKey, inflight);
      }

      try {
        const result = await inflight;
        if (result.status === 200) {
          res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
        }
        return res.status(result.status).json(result.data);
      } finally {
        _tmdbProxyInflight.delete(cacheKey);
      }
    } catch (err) {
      console.error("[TMDB Proxy Error]:", err);
      return res.status(500).json({ error: "Erro interno no proxy do TMDB." });
    }
  });

export default router;
