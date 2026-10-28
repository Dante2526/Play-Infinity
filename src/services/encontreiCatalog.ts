import { getApiBaseUrl } from '../utils/apiBaseUrl';
const getApiBase = getApiBaseUrl;

export interface EncontreiResult {
  mixdrop: string | null;
  mixdrop_encontrei?: string | null;
  mixdrop_vizer?: string | null;
  streamtape?: string | null;
  doodstream?: string | null;
  audio: string;
  server_name: string;
  source?: string;
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
    const res = await fetch(`${getApiBase()}/api/encontrei-lookup?tmdb_id=${tmdbId}&type=movie${refresh ? '&refresh=1' : ''}${name ? `&name=${encodeURIComponent(name)}` : ''}`);
    if (!res.ok) { return null; }
    const data = await res.json();
    if (data.error) { return null; }
    const result: EncontreiResult = {
      mixdrop: data.mixdrop || null,
      mixdrop_encontrei: data.mixdrop_encontrei || null,
      mixdrop_vizer: data.mixdrop_vizer || null,
      streamtape: data.streamtape || null,
      doodstream: data.doodstream || null,
      audio: data.audio || 'Dublado', server_name: 'MixDrop',
      source: data.source || 'catálogo local',
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
    const res = await fetch(`${getApiBase()}/api/encontrei-lookup?tmdb_id=${tmdbId}&type=tv&season=${season}&episode=${episode}${refresh ? '&refresh=1' : ''}${name ? `&name=${encodeURIComponent(name)}` : ''}`);
    if (!res.ok) { return null; }
    const data = await res.json();
    if (data.error) { return null; }
    const result: EncontreiResult = {
      mixdrop: data.mixdrop || null,
      mixdrop_encontrei: data.mixdrop_encontrei || null,
      mixdrop_vizer: data.mixdrop_vizer || null,
      streamtape: data.streamtape || null,
      doodstream: data.doodstream || null,
      audio: data.audio || 'Dublado', server_name: 'MixDrop',
      source: data.source || 'catálogo local',
      season: data.season, episode: data.episode,
    };
    _cache.set(cacheKey, result);
    return result;
  } catch { return null; }
}

export function buildMixdropStreamUrl(fileId: string | undefined | null, context?: { id: number; season?: number; episode?: number; name?: string; time?: number; paused?: boolean; exclude?: string[] }): string | null {
  if (!fileId && !context?.id) return null;
  const params = new URLSearchParams();
  if (fileId) params.set('url', `https://mxdrop.top/e/${fileId}`);
  if (context?.id) {
    params.set('id', String(context.id));
    if (context.season !== undefined && context.episode !== undefined) { params.set('s', String(context.season)); params.set('e', String(context.episode)); }
    if (context.name) params.set('name', context.name);
    if (context.time && context.time > 0) params.set('t', String(context.time));
    if (context.paused) params.set('paused', '1');
    if (context.exclude?.length) params.set('exclude', context.exclude.join(','));
  }
  return '/api/md-stream?' + params;
}

export interface EncontreiMovie { servers: { mixdrop?: string; streamtape?: string; doodstream?: string }; audio: string; server_name: string; }
export interface EncontreiEpisode { season: number; episode: number; servers: { mixdrop?: string; streamtape?: string; doodstream?: string }; audio: string; server_name: string; }
