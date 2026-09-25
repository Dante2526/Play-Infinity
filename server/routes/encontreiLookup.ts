/**
 * Endpoint de lookup duplo catálogo: vizer-catalog.json (PRIMÁRIO, mais episódios)
 *                                 + encontrei-catalog.json (FALLBACK, mais filmes)
 * 
 * Em vez do frontend baixar 11MB+26MB de JSON, faz 1 request rápida:
 *   GET /api/encontrei-lookup?tmdb_id=299534&type=movie
 *   GET /api/encontrei-lookup?tmdb_id=126027&type=tv&season=4&episode=1
 * 
 * Retorna: { mixdrop: "...", streamtape: "...", byse: "...", doodstream: "...", 
 *            audio: "Dublado", source: "vizer|encontrei" }
 * 
 * Backend carrega AMBOS catálogos 1x (cacheado em memória):
 *   - vizer-catalog.json: 65.246 eps + 5.593 filmes (todos com Mixdrop, mais episódios)
 *   - encontrei-catalog.json: 27.629 eps + 6.694 filmes (mais filmes)
 * 
 * Lookup order:
 *   1. Procura em vizer-catalog (mais episódios, prioridade)
 *   2. Se não achar, procura em encontrei-catalog (mais filmes)
 *   3. Se não achar em nenhum, retorna 404
 */
import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

// Catálogo encontrei (fallback, mais filmes)
let _encontreiCatalog: any = null;
let _encontreiMovieIndex: Map<number, any> = new Map();
let _encontreiEpisodeIndex: Map<string, any> = new Map(); // key: "tmdbId:season:episode"
let _encontreiSeriesSeasonsIndex: Map<number, number[]> = new Map();
let _encontreiLastMtime = 0;

// Catálogo vizer (PRIMÁRIO, mais episódios)
let _vizerCatalog: any = null;
let _vizerMovieIndex: Map<number, any> = new Map();
let _vizerEpisodeIndex: Map<string, any> = new Map();
let _vizerSeriesSeasonsIndex: Map<number, number[]> = new Map();
let _vizerLastMtime = 0;

function tryLoadCatalog(
  filename: string,
  catalogRef: { value: any },
  movieIndexRef: Map<number, any>,
  episodeIndexRef: Map<string, any>,
  seasonsIndexRef: Map<number, number[]>,
  mtimeRef: { value: number },
  logName: string,
): boolean {
  const possiblePaths = [
    path.join(process.cwd(), "public", "data", filename),
    path.join(process.cwd(), "data", filename),
  ];

  let raw = "";
  let currentMtime = 0;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p);
        currentMtime = stat.mtimeMs;
        // Se já carregado e não mudou, mantém
        if (catalogRef.value && (movieIndexRef.size > 0 || episodeIndexRef.size > 0) && currentMtime <= mtimeRef.value) {
          return true;
        }
        raw = fs.readFileSync(p, "utf-8");
        break;
      } catch (_) {}
    }
  }

  if (!raw) {
    return false;
  }

  try {
    catalogRef.value = JSON.parse(raw);
    mtimeRef.value = currentMtime;
    
    movieIndexRef.clear();
    episodeIndexRef.clear();
    seasonsIndexRef.clear();
    
    for (const movie of catalogRef.value.movies || []) {
      if (movie.tmdb_id) {
        // Se já existe (duplicado), mantém o primeiro
        if (!movieIndexRef.has(movie.tmdb_id)) {
          movieIndexRef.set(movie.tmdb_id, movie);
        }
      }
    }
    
    const seriesSeasonsMap = new Map<number, Set<number>>();
    for (const ep of catalogRef.value.episodes || []) {
      if (ep.tmdb_id && ep.season && ep.episode) {
        const key = `${ep.tmdb_id}:${ep.season}:${ep.episode}`;
        // Se já existe (duplicado), mantém o primeiro
        if (!episodeIndexRef.has(key)) {
          episodeIndexRef.set(key, ep);
        }
        if (!seriesSeasonsMap.has(ep.tmdb_id)) {
          seriesSeasonsMap.set(ep.tmdb_id, new Set());
        }
        seriesSeasonsMap.get(ep.tmdb_id)!.add(ep.season);
      }
    }

    for (const [id, seasonsSet] of seriesSeasonsMap.entries()) {
      seasonsIndexRef.set(id, Array.from(seasonsSet).sort((a, b) => a - b));
    }
    
    console.log(`[${logName}] Catálogo carregado: ${movieIndexRef.size} filmes, ${episodeIndexRef.size} episódios, ${seasonsIndexRef.size} séries`);
    return true;
  } catch (err) {
    console.warn(`[${logName}] Erro ao processar:`, err);
    return false;
  }
}

function loadCatalogs() {
  // Carrega vizer (primário) primeiro
  tryLoadCatalog(
    "vizer-catalog.json",
    { get value() { return _vizerCatalog; }, set value(v) { _vizerCatalog = v; } },
    _vizerMovieIndex,
    _vizerEpisodeIndex,
    _vizerSeriesSeasonsIndex,
    { get value() { return _vizerLastMtime; }, set value(v) { _vizerLastMtime = v; } },
    "vizer-lookup",
  );
  // Carrega encontrei (fallback) segundo
  tryLoadCatalog(
    "encontrei-catalog.json",
    { get value() { return _encontreiCatalog; }, set value(v) { _encontreiCatalog = v; } },
    _encontreiMovieIndex,
    _encontreiEpisodeIndex,
    _encontreiSeriesSeasonsIndex,
    { get value() { return _encontreiLastMtime; }, set value(v) { _encontreiLastMtime = v; } },
    "encontrei-lookup",
  );
}

// Cache de temporadas verificadas em memória
const _verifiedSeasonsCache = new Map<string, { timestamp: number; seasons: number[] }>();
const VERIFIED_SEASONS_CACHE_TTL = 20 * 60 * 1000;

router.get("/api/series-seasons-available", async (req, res) => {
  try {
    loadCatalogs();
    const tmdbId = parseInt(req.query.tmdb_id as string, 10);
    if (!tmdbId) {
      return res.status(400).json({ error: "tmdb_id é obrigatório" });
    }

    let candidateSeasons: number[] = [];
    if (req.query.candidate_seasons) {
      candidateSeasons = String(req.query.candidate_seasons)
        .split(",")
        .map(n => parseInt(n.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);
    }

    // Junta temporadas dos DOIS catálogos (vizer + encontrei)
    const vizerSeasons = _vizerSeriesSeasonsIndex.get(tmdbId) || [];
    const encontreiSeasons = _encontreiSeriesSeasonsIndex.get(tmdbId) || [];
    
    if (candidateSeasons.length === 0) {
      candidateSeasons = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    }

    const candidates = Array.from(new Set([...candidateSeasons, ...vizerSeasons, ...encontreiSeasons])).sort((a, b) => a - b);
    const cacheKey = `${tmdbId}:${candidates.join(",")}`;

    const cached = _verifiedSeasonsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < VERIFIED_SEASONS_CACHE_TTL) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.json({
        success: true,
        hasCatalog: cached.seasons.length > 0,
        tmdbId,
        seasons: cached.seasons,
      });
    }

    // Pra cada temporada candidata, verifica se tem em vizer OU encontrei
    const checkSeasonPlayable = async (season: number): Promise<boolean> => {
      // 1. Catálogo local (vizer + encontrei)
      if (vizerSeasons.includes(season) || encontreiSeasons.includes(season)) {
        return true;
      }
      // 2. Sonda Nixplay HD
      try {
        const ss = String(season).padStart(3, "0");
        const streamId = `${tmdbId}${ss}001`;
        const nixUrl = `https://nixplay.lat/series/testelogado-vods/GwXanZ3Dj/${streamId}.mp4`;
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 2500);
        const nixRes = await fetch(nixUrl, {
          headers: { Range: "bytes=0-100" },
          signal: controller.signal,
        });
        clearTimeout(t);
        if (nixRes.status === 206 && nixRes.headers.get("content-type") === "video/mp4") {
          return true;
        }
      } catch {}
      // 3. Sonda WatchPlayer
      try {
        const wpUrl = `https://v1.watchplay.shop/tvshow/${tmdbId}/${season}/1`;
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 2500);
        const wpRes = await fetch(wpUrl, {
          headers: {
            "Referer": "https://v1.watchplay.shop/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          },
          signal: controller.signal,
        });
        clearTimeout(t);
        if (wpRes.status === 200) {
          const text = await wpRes.text();
          const lower = text.toLowerCase();
          const isBad = (
            lower.includes("404") ||
            lower.includes("login-card") ||
            lower.includes("login-page") ||
            lower.includes("não encontrado") ||
            lower.includes("série não encontrada") ||
            text.length < 300
          );
          if (!isBad) return true;
        }
      } catch {}
      return false;
    };

    const checks = await Promise.all(
      candidates.map(async (s) => ({
        season: s,
        available: await checkSeasonPlayable(s),
      }))
    );

    const verified = checks.filter(c => c.available).map(c => c.season);

    if (verified.length > 0) {
      _verifiedSeasonsCache.set(cacheKey, {
        timestamp: Date.now(),
        seasons: verified,
      });

      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.json({
        success: true,
        hasCatalog: true,
        tmdbId,
        seasons: verified,
      });
    }

    // Fallback
    const localSeasons = [...vizerSeasons, ...encontreiSeasons];
    const fallback = localSeasons.length > 0 ? Array.from(new Set(localSeasons)).sort((a, b) => a - b) : [1];
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.json({
      success: true,
      hasCatalog: localSeasons.length > 0,
      tmdbId,
      seasons: fallback,
    });
  } catch (err: any) {
    console.error("[series-seasons-available] Erro:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

router.all("/api/check-playable-batch", (req, res) => {
  try {
    loadCatalogs();
    let ids: number[] = [];
    if (req.method === "POST" && req.body && Array.isArray(req.body.ids)) {
      ids = req.body.ids.map(Number).filter(Boolean);
    } else if (req.query.ids) {
      ids = String(req.query.ids).split(",").map(Number).filter(Boolean);
    }

    const playableMovieIds: number[] = [];
    const playableSeriesIds: number[] = [];

    for (const id of ids) {
      // Em qualquer um dos catálogos
      if (_vizerMovieIndex.has(id) || _encontreiMovieIndex.has(id)) {
        playableMovieIds.push(id);
      }
      if (_vizerSeriesSeasonsIndex.has(id) || _encontreiSeriesSeasonsIndex.has(id)) {
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
    loadCatalogs();
    
    const tmdbId = parseInt(req.query.tmdb_id as string, 10);
    const type = (req.query.type as string) || "movie";
    const season = parseInt(req.query.season as string, 10) || 1;
    const episode = parseInt(req.query.episode as string, 10) || 1;
    
    if (!tmdbId) {
      return res.status(400).json({ error: "tmdb_id é obrigatório" });
    }
    
    let result: any = null;
    
    if (type === "tv" || type === "series") {
      // Lookup de episódio: PRIMEIRO vizer (mais eps), DEPOIS encontrei
      const key = `${tmdbId}:${season}:${episode}`;
      
      // 1. Tenta vizer primeiro
      const vizerEp = _vizerEpisodeIndex.get(key);
      if (vizerEp && vizerEp.servers?.mixdrop) {
        result = {
          mixdrop: vizerEp.servers.mixdrop,
          streamtape: vizerEp.servers.streamtape || null,
          byse: vizerEp.servers.byse || null,
          doodstream: vizerEp.servers.doodstream || null,
          audio: vizerEp.audio || "Dublado",
          server_name: "MixDrop",
          season: vizerEp.season,
          episode: vizerEp.episode,
          source: "vizer",
        };
      }
      
      // 2. Se vizer não tem, tenta encontrei
      if (!result) {
        const encontreiEp = _encontreiEpisodeIndex.get(key);
        if (encontreiEp && encontreiEp.servers?.mixdrop) {
          result = {
            mixdrop: encontreiEp.servers.mixdrop,
            streamtape: encontreiEp.servers.streamtape || null,
            byse: encontreiEp.servers.byse || null,
            doodstream: encontreiEp.servers.doodstream || null,
            audio: encontreiEp.audio || "Dublado",
            server_name: "MixDrop",
            season: encontreiEp.season,
            episode: encontreiEp.episode,
            source: "encontrei",
          };
        }
      }
    } else {
      // Lookup de filme: PRIMEIRO vizer, DEPOIS encontrei (encontrei tem mais filmes)
      const vizerMovie = _vizerMovieIndex.get(tmdbId);
      if (vizerMovie && vizerMovie.servers?.mixdrop) {
        result = {
          mixdrop: vizerMovie.servers.mixdrop,
          streamtape: vizerMovie.servers.streamtape || null,
          byse: vizerMovie.servers.byse || null,
          doodstream: vizerMovie.servers.doodstream || null,
          audio: vizerMovie.audio || "Dublado",
          server_name: "MixDrop",
          source: "vizer",
        };
      }
      
      if (!result) {
        const encontreiMovie = _encontreiMovieIndex.get(tmdbId);
        if (encontreiMovie && encontreiMovie.servers?.mixdrop) {
          result = {
            mixdrop: encontreiMovie.servers.mixdrop,
            streamtape: encontreiMovie.servers.streamtape || null,
            byse: encontreiMovie.servers.byse || null,
            doodstream: encontreiMovie.servers.doodstream || null,
            audio: encontreiMovie.audio || "Dublado",
            server_name: "MixDrop",
            source: "encontrei",
          };
        }
      }
    }
    
    if (!result) {
      return res.status(404).json({ error: "Não encontrado nos catálogos (vizer + encontrei)", tmdb_id: tmdbId });
    }
    
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json(result);
  } catch (err: any) {
    console.error("[encontrei-lookup] Erro:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/api/downloads-catalog", (req, res) => {
  try {
    loadCatalogs();

    const type = (req.query.type as string) || "all";
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    // Junta filmes dos DOIS catálogos (vizer + encontrei), dedup por tmdbId
    const movieMap = new Map<number, { tmdbId: number; type: "movie"; mixdrop: string; audio: string }>();
    
    if (type === "all" || type === "movie") {
      // Vizer primeiro
      if (_vizerCatalog) {
        for (const m of _vizerCatalog.movies || []) {
          if (m.tmdb_id && m.servers?.mixdrop && !movieMap.has(m.tmdb_id)) {
            movieMap.set(m.tmdb_id, {
              tmdbId: m.tmdb_id,
              type: "movie" as const,
              mixdrop: m.servers.mixdrop,
              audio: m.audio || "Dublado"
            });
          }
        }
      }
      // Encontrei como fallback
      if (_encontreiCatalog) {
        for (const m of _encontreiCatalog.movies || []) {
          if (m.tmdb_id && m.servers?.mixdrop && !movieMap.has(m.tmdb_id)) {
            movieMap.set(m.tmdb_id, {
              tmdbId: m.tmdb_id,
              type: "movie" as const,
              mixdrop: m.servers.mixdrop,
              audio: m.audio || "Dublado"
            });
          }
        }
      }
    }

    // Junta séries dos DOIS catálogos, dedup por tmdbId
    const seriesMap = new Map<number, { tmdbId: number; type: "series"; totalEpisodes: number; seasons: number[]; audio: string }>();
    
    if (type === "all" || type === "tv" || type === "series") {
      // Vizer
      if (_vizerCatalog) {
        for (const ep of _vizerCatalog.episodes || []) {
          if (ep.tmdb_id && ep.servers?.mixdrop) {
            const current = seriesMap.get(ep.tmdb_id) || {
              tmdbId: ep.tmdb_id,
              type: "series" as const,
              totalEpisodes: 0,
              seasons: [] as number[],
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
      // Encontrei (eps que não tem em vizer)
      if (_encontreiCatalog) {
        for (const ep of _encontreiCatalog.episodes || []) {
          if (ep.tmdb_id && ep.servers?.mixdrop) {
            const existing = seriesMap.get(ep.tmdb_id);
            if (existing) {
              // Se já existe, só incrementa se a season/episode não tiver sido contada
              // (pra não duplicar eps que existem nos dois catálogos)
              const key = `${ep.tmdb_id}:${ep.season}:${ep.episode}`;
              const inVizer = _vizerEpisodeIndex.has(key);
              if (!inVizer) {
                existing.totalEpisodes += 1;
                if (ep.season && !existing.seasons.includes(ep.season)) {
                  existing.seasons.push(ep.season);
                }
              }
            } else {
              seriesMap.set(ep.tmdb_id, {
                tmdbId: ep.tmdb_id,
                type: "series" as const,
                totalEpisodes: 1,
                seasons: ep.season ? [ep.season] : [],
                audio: ep.audio || "Dublado"
              });
            }
          }
        }
      }
    }

    const movieItems = Array.from(movieMap.values());
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
