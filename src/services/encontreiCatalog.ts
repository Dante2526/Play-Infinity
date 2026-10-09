export interface EncontreiResult {
  mixdrop: string | null;
  mixdrop_encontrei?: string | null;
  mixdrop_vizer?: string | null;
  audio: string;
  server_name: string;
  season?: number;
  episode?: number;
}

const _cache = new Map<string, EncontreiResult | null>();

// CRITICAL: sempre faz await mesmo no cache hit, pra dar tempo pro
// React cleanup rodar entre renders. Sem isso, cache retorna sincrónamente
// e o cancelled=false do cleanup anterior nunca é checado.
const yieldToEventLoop = () => new Promise(r => setTimeout(r, 0));

export async function findMovieByTmdbId(tmdbId: number, refresh: boolean = false, name?: string): Promise<EncontreiResult | null> {
  const cacheKey = `movie:${tmdbId}`;
  if (!refresh && _cache.has(cacheKey)) {
    await yieldToEventLoop();
    return _cache.get(cacheKey) || null;
  }
  try {
    const res = await fetch(`/api/encontrei-lookup?tmdb_id=${tmdbId}&type=movie${refresh ? '&refresh=1' : ''}${name ? `&name=${encodeURIComponent(name)}` : ''}`);
    if (!res.ok) { return null; }
    const data = await res.json();
    if (data.error) { return null; }
    const result: EncontreiResult = {
      mixdrop: data.mixdrop || null,
      mixdrop_encontrei: data.mixdrop_encontrei || null,
      mixdrop_vizer: data.mixdrop_vizer || null,
      audio: data.audio || 'Dublado', server_name: 'MixDrop',
    };
    _cache.set(cacheKey, result);
    return result;
  } catch { return null; }
}

export async function findEpisode(tmdbId: number, season: number, episode: number, refresh: boolean = false, name?: string): Promise<EncontreiResult | null> {
  const cacheKey = `tv:${tmdbId}:${season}:${episode}`;
  if (!refresh && _cache.has(cacheKey)) {
    await yieldToEventLoop();
    return _cache.get(cacheKey) || null;
  }
  try {
    const res = await fetch(`/api/encontrei-lookup?tmdb_id=${tmdbId}&type=tv&season=${season}&episode=${episode}${refresh ? '&refresh=1' : ''}${name ? `&name=${encodeURIComponent(name)}` : ''}`);
    if (!res.ok) { return null; }
    const data = await res.json();
    if (data.error) { return null; }
    const result: EncontreiResult = {
      mixdrop: data.mixdrop || null,
      mixdrop_encontrei: data.mixdrop_encontrei || null,
      mixdrop_vizer: data.mixdrop_vizer || null,
      audio: data.audio || 'Dublado', server_name: 'MixDrop',
      season: data.season, episode: data.episode,
    };
    _cache.set(cacheKey, result);
    return result;
  } catch { return null; }
}

export function buildMixdropStreamUrl(fileId: string | undefined): string | null {
  if (!fileId) return null;
  return `/api/md-stream?url=${encodeURIComponent(`https://mxdrop.top/e/${fileId}`)}&cb=${Date.now()}`;
}

export interface EncontreiMovie { servers: { mixdrop?: string }; audio: string; server_name: string; }
export interface EncontreiEpisode { season: number; episode: number; servers: { mixdrop?: string }; audio: string; server_name: string; }
