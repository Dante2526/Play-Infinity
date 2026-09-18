import { Router } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as cheerio from "cheerio";
import { isServerBlacklisted } from "../../src/data/serverBlacklist";
import { validateSafeUrl, sanitizeString } from "../utils/helpers";
import { animeDirectStreamCache, vixsrcStreamCache, liveChunkCache } from "../utils/caches";
import { Readable } from "stream";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const router = Router();

// API: MyEmbed / Playerflix VIP Player com Extração Direta de Stream e Escudo Anti-Popups
  // Pomfy Stream Proxy Bypass (Vai direto para o Servidor 1)
  // TMDB Proxy (Oculta a chave de API do cliente e evita vazamento no DevTools)
  router.get("/api/tmdb/*", async (req, res) => {
    try {
      const tmdbPath = req.params[0];
      const query = new URLSearchParams(req.query as any);
      
      const apiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || "e0cc43e590a5c5c0d03f920bd4fe9424";

      query.set("api_key", apiKey);
      
      const url = `https://api.themoviedb.org/3/${tmdbPath}?${query.toString()}`;
      const response = await fetch(url, {
        headers: { "accept": "application/json" }
      });
      
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      console.error("[TMDB Proxy Error]:", err);
      return res.status(500).json({ error: "Erro interno no proxy do TMDB." });
    }
  });

export default router;
