import { getApiBaseUrl } from '../utils/apiBaseUrl';
import { searchMulti, formatImageUrl, getGenreNames, type TMDBItem } from './tmdb';
import type { CatalogItem } from '../utils/mediaUtils';

const confirmed = new Map<string, number>();
export const catalogSearchKey = (item: Pick<CatalogItem, 'id' | 'type'>) => `${item.type === 'movie' ? 'movie' : 'tv'}:${item.id}`;
export const normalizeCatalogSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const apiBase = getApiBaseUrl;

function formatResult(item: TMDBItem): CatalogItem {
  const tv = item.media_type === 'tv' || (!item.media_type && !!(item.name && !item.title));
  const poster = formatImageUrl(item.poster_path, 'w500');
  return {
    id: item.id, tmdbId: item.id, title: item.title || item.name || 'Sem título',
    imageUrl: poster, posterUrl: poster,
    backdropUrl: formatImageUrl(item.backdrop_path || item.poster_path, 'original'),
    type: tv ? 'series' : 'movie', genres: getGenreNames(item.genre_ids || []),
    synopsis: item.overview || 'Sem sinopse disponível em português.',
    year: parseInt((item.release_date || item.first_air_date || '').slice(0, 4)) || undefined,
    rating: item.vote_average ? `${item.vote_average.toFixed(1)} ★` : '14', duration: tv ? 'Série' : 'Filme',
    match: Math.min(99, Math.max(70, Math.round((item.vote_average || 7.5) * 10))),
    playerUrl: tv ? `https://v1.watchplay.shop/tvshow/${item.id}/1/1` : `https://v1.watchplay.shop/movie/${item.id}`,
  };
}

/** Batch probes only cover part of the catalogue. Their negative result must
 * not hide a new title that the named Encontrei/Vizer lookup can already play. */
export async function searchCatalog(
  query: string, local: CatalogItem[], signal: AbortSignal,
  onUpdate: (items: CatalogItem[]) => void,
): Promise<void> {
  const normalized = normalizeCatalogSearch(query);
  if (!normalized || signal.aborted) return;
  const localMatches = local.filter(item => normalizeCatalogSearch(item.title).includes(normalized));
  // Metadata failure must not discard matching entries already in our catalogue.
  let metadata: TMDBItem[] = [];
  try { metadata = (await searchMulti(query)).results || []; } catch { /* Keep local matches. */ }
  if (signal.aborted) return;
  const candidates = new Map<string, CatalogItem>();
  for (const item of [...localMatches, ...metadata.filter(item =>
    (item.media_type === 'movie' || item.media_type === 'tv' || (!item.media_type && (item.title || item.name))) &&
    Number.isInteger(item.id) && item.id > 0 && (item.title || item.name)
  ).map(formatResult)]) {
    const key = catalogSearchKey(item);
    if (!candidates.has(key)) candidates.set(key, item);
  }
  const items = [...candidates.values()];
  if (!items.length) { onUpdate([]); return; }
  const available = new Set(localMatches.map(catalogSearchKey));
  for (const item of items) if ((confirmed.get(catalogSearchKey(item)) || 0) > Date.now()) available.add(catalogSearchKey(item));
  const publish = () => { if (!signal.aborted) onUpdate(items.filter(item => available.has(catalogSearchKey(item)))); };
  publish();

  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) controller.abort();
  // This deadline also bounds the worker queue; late results never update the UI.
  const timer = setTimeout(cancel, 10000);
  const request = async (url: string, init?: RequestInit) => {
    const phase = new AbortController();
    const stop = () => phase.abort();
    controller.signal.addEventListener('abort', stop, { once: true });
    if (controller.signal.aborted) phase.abort();
    const phaseTimer = setTimeout(stop, 4500);
    try {
      const response = await fetch(apiBase() + url, { ...init, signal: phase.signal, cache: 'no-store' });
      if (!response.ok) return null;
      return await response.json();
    } catch { return null; }
    finally { clearTimeout(phaseTimer); controller.signal.removeEventListener('abort', stop); }
  };
  const confirm = (item: CatalogItem) => {
    if (controller.signal.aborted) return;
    const key = catalogSearchKey(item); available.add(key);
    if (confirmed.size >= 1000) confirmed.delete(confirmed.keys().next().value!);
    confirmed.set(key, Date.now() + 10 * 60 * 1000);
  };
  try {
    // Preserve type: a movie and a series can legitimately share a TMDB number.
    const unknown = items.filter(item => !available.has(catalogSearchKey(item)));
    if (!unknown.length) return;
    const batch = await request('/api/check-playable-batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: unknown.map(item => ({ id: item.id, type: item.type === 'movie' ? 'movie' : 'tv' })) }),
    });
    const movies = new Set(batch?.playableMovieIds || []);
    const series = new Set(batch?.playableSeriesIds || []);
    for (const item of unknown) if ((item.type === 'movie' ? movies : series).has(item.id)) confirm(item);
    publish();
    const remaining = unknown.filter(item => !available.has(catalogSearchKey(item)));
    let cursor = 0;
    // Listing/search never downloads media. At most two catalogue lookups run
    // together; only positive answers are cached, so outages cannot hide titles.
    await Promise.all([0, 1].map(async () => {
      while (!controller.signal.aborted && cursor < remaining.length) {
        const item = remaining[cursor++];
        const params = new URLSearchParams({ tmdb_id: String(item.id), type: item.type === 'movie' ? 'movie' : 'tv', name: item.title });
        if (item.type === 'series') { params.set('season', '1'); params.set('episode', '1'); }
        const data = await request('/api/encontrei-lookup?' + params);
        if (data && !data.error && (data.mixdrop || data.mixdrop_encontrei || data.mixdrop_vizer || data.byse || data.streamtape || data.doodstream)) {
          confirm(item); publish();
        }
      }
    }));
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', cancel);
  }
}
