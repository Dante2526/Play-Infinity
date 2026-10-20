import { Router } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as cheerio from "cheerio";
import { isServerBlacklisted } from "../../src/data/serverBlacklist";
import { validateSafeUrl, sanitizeString } from "../utils/helpers";
import { animeDirectStreamCache, vixsrcStreamCache, liveChunkCache, tmdbCache } from "../utils/caches";
import { Readable } from "stream";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const router = Router();
const _tmdbProxyInflight = new Map<string, Promise<{ status: number; data: any }>>();

// API: MyEmbed / Playerflix VIP Player com Extração Direta de Stream e Escudo Anti-Popups
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
          const data = await response.json();
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
