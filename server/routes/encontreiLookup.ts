/**
 * Endpoint de lookup do catálogo encontrei.me
 * 
 * Em vez do frontend baixar 11MB de JSON, faz 1 request rápida:
 *   GET /api/encontrei-lookup?tmdb_id=299534&type=movie
 *   GET /api/encontrei-lookup?tmdb_id=84958&type=tv&season=1&episode=1
 * 
 * Retorna: { mixdrop: "dk389z0xh7mezzz", audio: "Dublado" }
 * 
 * O backend carrega o catálogo 1x (cacheado em memória) e serve lookups em <1ms.
 */
import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

// Cache do catálogo em memória (carrega 1x, serve pra sempre)
let _catalog: any = null;
let _movieIndex: Map<number, any> = new Map();
let _episodeIndex: Map<string, any> = new Map(); // key: "tmdbId:season:episode"

function loadCatalog() {
  if (_catalog) return;
  
  const catalogPath = path.join(process.cwd(), "public", "data", "encontrei-catalog.json");
  try {
    const raw = fs.readFileSync(catalogPath, "utf-8");
    _catalog = JSON.parse(raw);
    
    // Constrói índices pra lookup O(1)
    for (const movie of _catalog.movies || []) {
      if (movie.tmdb_id) {
        _movieIndex.set(movie.tmdb_id, movie);
      }
    }
    
    for (const ep of _catalog.episodes || []) {
      if (ep.tmdb_id && ep.season && ep.episode) {
        const key = `${ep.tmdb_id}:${ep.season}:${ep.episode}`;
        _episodeIndex.set(key, ep);
      }
    }
    
    console.log(`[encontrei-lookup] Catálogo carregado: ${_movieIndex.size} filmes, ${_episodeIndex.size} episódios indexados`);
  } catch (err) {
    console.error("[encontrei-lookup] Erro ao carregar catálogo:", err);
  }
}

router.get("/api/encontrei-lookup", (req, res) => {
  try {
    loadCatalog();
    
    if (!_catalog) {
      return res.status(503).json({ error: "Catálogo não disponível" });
    }
    
    const tmdbId = parseInt(req.query.tmdb_id as string, 10);
    const type = (req.query.type as string) || "movie";
    const season = parseInt(req.query.season as string, 10) || 1;
    const episode = parseInt(req.query.episode as string, 10) || 1;
    
    if (!tmdbId) {
      return res.status(400).json({ error: "tmdb_id é obrigatório" });
    }
    
    let result: any = null;
    
    if (type === "tv" || type === "series") {
      // Lookup de episódio
      const key = `${tmdbId}:${season}:${episode}`;
      const ep = _episodeIndex.get(key);
      if (ep) {
        result = {
          mixdrop: ep.servers?.mixdrop || null,
          streamtape: ep.servers?.streamtape || null,
          byse: ep.servers?.byse || null,
          doodstream: ep.servers?.doodstream || null,
          audio: ep.audio || "Dublado",
          server_name: "MixDrop",
          season: ep.season,
          episode: ep.episode,
        };
      }
    } else {
      // Lookup de filme
      const movie = _movieIndex.get(tmdbId);
      if (movie) {
        result = {
          mixdrop: movie.servers?.mixdrop || null,
          streamtape: movie.servers?.streamtape || null,
          byse: movie.servers?.byse || null,
          doodstream: movie.servers?.doodstream || null,
          audio: movie.audio || "Dublado",
          server_name: "MixDrop",
        };
      }
    }
    
    if (!result) {
      return res.status(404).json({ error: "Não encontrado no catálogo", tmdb_id: tmdbId });
    }
    
    // Headers pra cache do navegador (1 hora)
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json(result);
  } catch (err: any) {
    console.error("[encontrei-lookup] Erro:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
