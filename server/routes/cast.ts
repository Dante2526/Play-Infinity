import { Router } from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const router = Router();

  router.get("/api/find-cast-source", async (req, res) => {
    try {
      const tmdbId = req.query.tmdbId as string;
      const mediaType = req.query.mediaType as string;
      const season = req.query.season as string;
      const episode = req.query.episode as string;

      if (!tmdbId || !mediaType) {
        return res.status(400).json({ success: false, error: "Parâmetros obrigatórios faltando" });
      }

      // Mesma heurística do watchplayer para checar página não encontrada
      const isCheckUnavailable = (content: string, url: string, status: number): boolean => {
        if (status >= 400) return true;
        const lowerUrl = (url || "").toLowerCase();
        if (lowerUrl.includes("/login") || lowerUrl.includes("/admin") || lowerUrl.includes("/painel")) return true;
        const lower = (content || "").toLowerCase();
        return (
          lower.includes("login-card") ||
          lower.includes("login-page") ||
          lower.includes("entrar | myplayer") ||
          lower.includes("painel administrativo") ||
          (lower.includes("myplayer") && (lower.includes("bem-vindo") || lower.includes("bem vindo"))) ||
          lower.includes("série não encontrada") ||
          lower.includes("serie não encontrada") ||
          lower.includes("filme não encontrado") ||
          lower.includes("acesso protegido")
        );
      };

      const checkUrl = async (url: string) => {
        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 4000);
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Referer": new URL(url).origin
            }
          });
          clearTimeout(id);
          const text = await response.text();
          return !isCheckUnavailable(text, url, response.status);
        } catch (e) {
          return false;
        }
      };

      // 1. Tentar WatchPlayer
      const movieId = req.query.imdbId ? req.query.imdbId as string : tmdbId;
      const wpUrl = `https://v1.watchplay.shop/${mediaType === "movie" ? "movie" : "tvshow"}/${mediaType === "movie" ? movieId : tmdbId}${mediaType === "series" ? `/${season}/${episode}` : ""}`;
      const isWpOk = await checkUrl(wpUrl);
      if (isWpOk) {
        return res.json({ success: true, url: wpUrl, source: "watchplayer" });
      }

      // 2. Tentar VIP Player
      const vipId = mediaType === "series" ? `${tmdbId}-${season}-${episode}` : tmdbId;
      const vipUrl = `https://myfilmes.vip/api/player?id=${vipId}`;
      const isVipOk = await checkUrl(vipUrl);
      if (isVipOk) {
        return res.json({ success: true, url: vipUrl, source: "vip" });
      }

      return res.json({ success: false, error: "Nenhum servidor direto retornou player válido" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

export default router;

