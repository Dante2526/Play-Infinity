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

// Cache do catálogo em memória (carrega 1x, serve pra sempre; recarrega se o arquivo for modificado ou se o índice estava vazio)
let _catalog: any = null;
let _movieIndex: Map<number, any> = new Map();
let _episodeIndex: Map<string, any> = new Map(); // key: "tmdbId:season:episode"
let _seriesSeasonsIndex: Map<number, number[]> = new Map(); // key: tmdbId -> seasons array
let _lastLoadedMtime = 0;

function loadCatalog() {
  const possiblePaths = [
    path.join(process.cwd(), "public", "data", "encontrei-catalog.json"),
    path.join(process.cwd(), "data", "encontrei-catalog.json"),
  ];

  let raw = "";
  let currentMtime = 0;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p);
        currentMtime = stat.mtimeMs;
        // Se já está carregado, com dados e o arquivo não mudou, usa o cache existente
        if (_catalog && (_movieIndex.size > 0 || _episodeIndex.size > 0) && currentMtime <= _lastLoadedMtime) {
          return;
        }
        raw = fs.readFileSync(p, "utf-8");
        break;
      } catch (_) {}
    }
  }

  // Se nenhum arquivo encontrado mas já temos cache válido, mantém
  if (!raw && _catalog && (_movieIndex.size > 0 || _episodeIndex.size > 0)) {
    return;
  }

  try {
    _catalog = raw ? JSON.parse(raw) : { movies: [], episodes: [] };
    _lastLoadedMtime = currentMtime;
    
    // Reconstrói índices pra lookup O(1)
    _movieIndex.clear();
    _episodeIndex.clear();
    _seriesSeasonsIndex.clear();
    
    for (const movie of _catalog.movies || []) {
      if (movie.tmdb_id) {
        _movieIndex.set(movie.tmdb_id, movie);
      }
    }
    
    const seriesSeasonsMap = new Map<number, Set<number>>();
    for (const ep of _catalog.episodes || []) {
      if (ep.tmdb_id && ep.season && ep.episode) {
        const key = `${ep.tmdb_id}:${ep.season}:${ep.episode}`;
        _episodeIndex.set(key, ep);
        if (!seriesSeasonsMap.has(ep.tmdb_id)) {
          seriesSeasonsMap.set(ep.tmdb_id, new Set());
        }
        seriesSeasonsMap.get(ep.tmdb_id)!.add(ep.season);
      }
    }

    for (const [id, seasonsSet] of seriesSeasonsMap.entries()) {
      _seriesSeasonsIndex.set(id, Array.from(seasonsSet).sort((a, b) => a - b));
    }
    
    console.log(`[encontrei-lookup] Catálogo carregado: ${_movieIndex.size} filmes, ${_episodeIndex.size} episódios, ${_seriesSeasonsIndex.size} séries indexadas`);
  } catch (err) {
    console.warn("[encontrei-lookup] Aviso ao processar catálogo:", err);
    _catalog = { movies: [], episodes: [] };
  }
}

/**
 * Retorna as temporadas reais disponíveis no catálogo para uma série específica
 * GET /api/series-seasons-available?tmdb_id=126027
 */
router.get("/api/series-seasons-available", (req, res) => {
  try {
    loadCatalog();
    const tmdbId = parseInt(req.query.tmdb_id as string, 10);
    if (!tmdbId) {
      return res.status(400).json({ error: "tmdb_id é obrigatório" });
    }
    const seasons = _seriesSeasonsIndex.get(tmdbId);
    if (seasons && seasons.length > 0) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.json({
        success: true,
        hasCatalog: true,
        tmdbId,
        seasons,
      });
    }
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.json({
      success: true,
      hasCatalog: false,
      tmdbId,
      seasons: [],
    });
  } catch (err: any) {
    console.error("[series-seasons-available] Erro:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * Verifica uma lista de TMDB IDs e retorna quais possuem conteúdo reproduzível no catálogo
 * GET /api/check-playable-batch?ids=19995,671,14424
 * POST /api/check-playable-batch { ids: [19995, 671, 14424] }
 */
router.all("/api/check-playable-batch", (req, res) => {
  try {
    loadCatalog();
    let ids: number[] = [];
    if (req.method === "POST" && req.body && Array.isArray(req.body.ids)) {
      ids = req.body.ids.map(Number).filter(Boolean);
    } else if (req.query.ids) {
      ids = String(req.query.ids).split(",").map(Number).filter(Boolean);
    }

    const playableMovieIds: number[] = [];
    const playableSeriesIds: number[] = [];

    for (const id of ids) {
      if (_movieIndex.has(id)) {
        playableMovieIds.push(id);
      }
      if (_seriesSeasonsIndex.has(id)) {
        playableSeriesIds.push(id);
      }
    }

    res.setHeader("Cache-Control", "public, max-age=1800");
    return res.json({
      success: true,
      playableMovieIds,
      playableSeriesIds,
      playableIds: [...new Set([...playableMovieIds, ...playableSeriesIds])],
    });
  } catch (err: any) {
    console.error("[check-playable-batch] Erro:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

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

/**
 * Endpoint para a Área de Downloads:
 * Retorna os IDs dos filmes e séries que possuem download ativo (MixDrop)
 * GET /api/downloads-catalog?limit=50&offset=0&type=all|movie|tv
 */
router.get("/api/downloads-catalog", (req, res) => {
  try {
    loadCatalog();
    if (!_catalog) {
      return res.status(503).json({ error: "Catálogo não disponível" });
    }

    const type = (req.query.type as string) || "all";
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    const movieItems: { tmdbId: number; type: "movie"; mixdrop: string; audio: string }[] = [];
    if (type === "all" || type === "movie") {
      for (const m of _catalog.movies || []) {
        if (m.tmdb_id && m.servers?.mixdrop) {
          movieItems.push({
            tmdbId: m.tmdb_id,
            type: "movie",
            mixdrop: m.servers.mixdrop,
            audio: m.audio || "Dublado"
          });
        }
      }
    }

    const seriesMap = new Map<number, { tmdbId: number; type: "series"; totalEpisodes: number; seasons: number[]; audio: string }>();
    if (type === "all" || type === "tv" || type === "series") {
      for (const ep of _catalog.episodes || []) {
        if (ep.tmdb_id && ep.servers?.mixdrop) {
          const current = seriesMap.get(ep.tmdb_id) || {
            tmdbId: ep.tmdb_id,
            type: "series",
            totalEpisodes: 0,
            seasons: [],
            audio: ep.audio || "Dublado"
          };
          current.totalEpisodes += 1;
          if (ep.season && !current.seasons.includes(ep.season)) {
            current.seasons.push(ep.season);
          }
          seriesMap.set(ep.tmdb_id, current);
        }
      }
    }

    const seriesItems = Array.from(seriesMap.values());
    const allItems = [...movieItems, ...seriesItems];
    const total = allItems.length;
    const paginated = allItems.slice(offset, offset + limit);

    res.setHeader("Cache-Control", "public, max-age=1800");
    return res.json({
      total,
      totalMovies: movieItems.length,
      totalSeries: seriesItems.length,
      limit,
      offset,
      items: paginated
    });
  } catch (err: any) {
    console.error("[downloads-catalog] Erro:", err);
    return res.status(500).json({ error: "Erro interno ao carregar catálogo de downloads" });
  }
});

export default router;
