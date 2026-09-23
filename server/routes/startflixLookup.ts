/**
 * Endpoint: GET /api/startflix-lookup?tmdb_id=126027&season=4&episode=23
 *
 * Lookup do catálogo startflix (Ghosts e futuras séries).
 * Retorna: { embed_url, player_type, player_id, audio }
 *
 * O frontend usa o embed_url como src de <iframe> no VideoPlayerModal.
 * Funciona porque embedplayapiupn.upns.xyz NÃO tem X-Frame-Options.
 *
 * Catálogo: public/data/startflix-catalog.json
 * (gerado por scripts/scan_startflix_ghosts.py — rode de novo pra atualizar)
 */
import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

// Cache do catálogo em memória (carrega 1x, serve pra sempre)
let _catalog: any = null;
let _episodeIndex: Map<string, any> = new Map(); // key: "tmdbId:season:episode"

function loadCatalog() {
  if (_catalog) return;

  const catalogPath = path.join(process.cwd(), "public", "data", "startflix-catalog.json");
  try {
    const raw = fs.readFileSync(catalogPath, "utf-8");
    _catalog = JSON.parse(raw);

    // Constrói índice pra lookup O(1)
    for (const series of _catalog.series || []) {
      const tmdbId = series.tmdb_id;
      for (const season of series.seasons || []) {
        const seasonNum = season.season;
        for (const ep of season.episodes || []) {
          const key = `${tmdbId}:${seasonNum}:${ep.episode}`;
          _episodeIndex.set(key, {
            ...ep,
            series_title: series.title,
            audio: series.audio,
          });
        }
      }
    }

    console.log(`[startflix-lookup] Catálogo carregado: ${_episodeIndex.size} episódios indexados`);
  } catch (err) {
    console.error("[startflix-lookup] Erro ao carregar catálogo:", err);
  }
}

router.get("/api/startflix-lookup", (req, res) => {
  try {
    loadCatalog();

    if (!_catalog) {
      return res.status(503).json({ error: "Catálogo startflix não disponível" });
    }

    const tmdbId = parseInt(req.query.tmdb_id as string, 10);
    const season = parseInt(req.query.season as string, 10) || 1;
    const episode = parseInt(req.query.episode as string, 10) || 1;

    if (!tmdbId) {
      return res.status(400).json({ error: "tmdb_id é obrigatório" });
    }

    const key = `${tmdbId}:${season}:${episode}`;
    const ep = _episodeIndex.get(key);

    if (!ep) {
      return res.status(404).json({
        error: "Episódio não encontrado no catálogo startflix",
        tmdb_id: tmdbId,
        season,
        episode,
      });
    }

    // Verifica se o player é funcional (upns.xyz funciona; playembedapi não)
    const isFunctional = ep.embed_url?.includes("upns.xyz");

    // Headers pra cache do navegador (1 hora)
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json({
      embed_url: ep.embed_url,
      player_type: ep.player_type,
      player_id: ep.player_id,
      audio: ep.audio || "Dublado",
      series_title: ep.series_title,
      functional: !!isFunctional,
      not_functional_reason: isFunctional
        ? null
        : "Este episódio só tem player playembedapi.site (X-Frame-Options bloqueia iframe). Catálogo precisa ser re-scrapeado quando CF liberar.",
    });
  } catch (err: any) {
    console.error("[startflix-lookup] Erro:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// Endpoint pra listar todas as séries + seasons/ep counts (pra admin/debug)
router.get("/api/startflix-catalog", (req, res) => {
  try {
    loadCatalog();
    if (!_catalog) {
      return res.status(503).json({ error: "Catálogo não disponível" });
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json({
      metadata: _catalog.metadata,
      series: _catalog.series.map((s: any) => ({
        tmdb_id: s.tmdb_id,
        title: s.title,
        audio: s.audio,
        seasons: s.seasons.map((sn: any) => ({
          season: sn.season,
          episode_count: sn.episodes.length,
          functional_count: sn.episodes.filter((e: any) => e.embed_url?.includes("upns.xyz")).length,
        })),
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
