/**
 * Catálogo do encontrei.me — lookup via backend (rápido, ~50ms)
 * 
 * Em vez de baixar 11MB de JSON, faz 1 request pro endpoint:
 *   GET /api/encontrei-lookup?tmdb_id=299534&type=movie
 * Retorna: { mixdrop: "dk389z0xh7mezzz", audio: "Dublado" }
 */

export interface EncontreiResult {
  mixdrop: string | null;
  streamtape: string | null;
  byse: string | null;
  doodstream: string | null;
  audio: string;
  server_name: string;
  season?: number;
  episode?: number;
}

// Cache em memória (key: "movie:tmdbId" ou "tv:tmdbId:season:episode")
const _cache = new Map<string, EncontreiResult | null>();

/**
 * Busca um filme por tmdb_id (rápido, ~50ms via backend).
 */
export async function findMovieByTmdbId(tmdbId: number): Promise<EncontreiResult | null> {
  const cacheKey = `movie:${tmdbId}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey) || null;
  
  try {
    const res = await fetch(`/api/encontrei-lookup?tmdb_id=${tmdbId}&type=movie`);
    if (!res.ok) {
      _cache.set(cacheKey, null);
      return null;
    }
    const data = await res.json();
    const result: EncontreiResult = {
      mixdrop: data.mixdrop || null,
      streamtape: data.streamtape || null,
      byse: data.byse || null,
      doodstream: data.doodstream || null,
      audio: data.audio || 'Dublado',
      server_name: 'MixDrop',
    };
    _cache.set(cacheKey, result);
    return result;
  } catch {
    _cache.set(cacheKey, null);
    return null;
  }
}

/**
 * Busca um episódio por tmdb_id + season + episode (rápido, ~50ms).
 */
export async function findEpisode(
  tmdbId: number,
  season: number,
  episode: number
): Promise<EncontreiResult | null> {
  const cacheKey = `tv:${tmdbId}:${season}:${episode}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey) || null;
  
  try {
    const res = await fetch(`/api/encontrei-lookup?tmdb_id=${tmdbId}&type=tv&season=${season}&episode=${episode}`);
    if (!res.ok) {
      _cache.set(cacheKey, null);
      return null;
    }
    const data = await res.json();
    const result: EncontreiResult = {
      mixdrop: data.mixdrop || null,
      streamtape: data.streamtape || null,
      byse: data.byse || null,
      doodstream: data.doodstream || null,
      audio: data.audio || 'Dublado',
      server_name: 'MixDrop',
      season: data.season,
      episode: data.episode,
    };
    _cache.set(cacheKey, result);
    return result;
  } catch {
    _cache.set(cacheKey, null);
    return null;
  }
}

/**
 * Constrói a URL do /api/mixdrop-stream pra um fileId.
 */
export function buildMixdropStreamUrl(fileId: string | undefined): string | null {
  if (!fileId) return null;
  return `/api/mixdrop-stream?url=${encodeURIComponent(`https://mxdrop.top/e/${fileId}`)}`;
}

// Manter compatibilidade com interface antiga
export interface EncontreiMovie {
  servers: { mixdrop?: string };
  audio: string;
  server_name: string;
}

export interface EncontreiEpisode {
  season: number;
  episode: number;
  servers: { mixdrop?: string };
  audio: string;
  server_name: string;
}
