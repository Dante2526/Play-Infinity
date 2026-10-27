import { getMovieReleases, getSeriesReleases, TMDBItem } from './tmdb';
import { isMediaAvailable, UNAVAILABLE_TITLES_OR_IDS } from '../utils/mediaUtils';

type ReleaseType = 'movie' | 'tv';
const availability = new Map<string, { available: boolean; expires: number }>();
const pending = new Map<string, Promise<boolean>>();
const lastAttempt = new Map<string, number>();
const storageKey = (type: ReleaseType) => `playinfinity:home-releases:v2:${type}`;

function allowed(item: TMDBItem) {
  return Number.isInteger(item.id) && item.id > 0 && item.poster_path && (item.title || item.name) &&
    !UNAVAILABLE_TITLES_OR_IDS.includes(item.id) && !/doraemon/i.test(item.title || item.name || '');
}

export function readHomeReleases(type: ReleaseType): TMDBItem[] {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey(type)) || 'null');
    if (data && Date.now() - data.savedAt < 24 * 60 * 60 * 1000 && Array.isArray(data.items)) {
      const valid = data.items.filter(allowed).slice(0, 20);
      if (valid.length >= 4) return valid;
    }
  } catch { /* Storage can be disabled in private browsing. */ }
  return [];
}

export function saveHomeReleases(type: ReleaseType, items: TMDBItem[]) {
  if (!items.length) return;
  try { localStorage.setItem(storageKey(type), JSON.stringify({ savedAt: Date.now(), items })); } catch { /* Keep the in-memory list. */ }
}

async function confirmNewRelease(item: TMDBItem, type: ReleaseType): Promise<boolean> {
  const key = `${type}:${item.id}`;
  const cached = availability.get(key);
  if (cached && cached.expires > Date.now()) return cached.available;
  if (pending.has(key)) return pending.get(key)!;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  const request = (async () => {
    try {
      const native = typeof window !== 'undefined' && ((window as any).Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:');
      const origin = native ? ((import.meta.env.VITE_PROXY_URL as string) || 'https://play-infinity.stream') : '';
      const params = new URLSearchParams({ tmdb_id: String(item.id), type, name: item.title || item.name || '' });
      if (type === 'tv') { params.set('season', '1'); params.set('episode', '1'); }
      const response = await fetch(origin + '/api/encontrei-lookup?' + params, { signal: controller.signal });
      if (!response.ok) return false;
      const data = await response.json();
      if (data.error) return false;
      const available = !!(data.mixdrop || data.mixdrop_encontrei || data.mixdrop_vizer || data.streamtape || data.byse);
      if (availability.size >= 500) availability.delete(availability.keys().next().value!);
      availability.set(key, { available, expires: Date.now() + (available ? 10 * 60 * 1000 : 60000) });
      return available;
    } catch { return false; }
    finally { clearTimeout(timer); pending.delete(key); }
  })();
  pending.set(key, request);
  return request;
}

/** Keep recent candidates in TMDB order, including new titles outside the build snapshot. */
export async function loadHomeReleases(type: ReleaseType, signal: AbortSignal, onUpdate: (items: TMDBItem[]) => void): Promise<void> {
  const getPage = type === 'movie' ? getMovieReleases : getSeriesReleases;
  const pages = await Promise.allSettled([getPage(1), getPage(2), getPage(3)]);
  if (signal.aborted) return;
  const seen = new Set<number>();
  const candidates: TMDBItem[] = [];
  for (const page of pages) {
    if (page.status !== 'fulfilled') continue;
    for (const item of page.value.results || []) {
      if (!allowed(item) || seen.has(item.id)) continue;
      seen.add(item.id); candidates.push(item);
    }
  }
  if (!candidates.length) throw new Error('No release metadata available');
  const confirmed = new Set(candidates.filter(item => {
    const cached = availability.get(`${type}:${item.id}`);
    return isMediaAvailable(item) || (cached?.available && cached.expires > Date.now());
  }).map(item => item.id));
  const publish = () => {
    if (signal.aborted) return;
    const items = candidates.filter(item => confirmed.has(item.id)).slice(0, 20);
    if (items.length >= 4) { saveHomeReleases(type, items); onUpdate(items); }
  };
  publish();
  // At most eight new titles per row/cycle, two simultaneous lookups per row.
  // Metadata listing never initiates full playback/health probes for every card.
  // New/unexamined candidates go first; later cycles must not keep checking
  // the same eight missing files and starve the rest of the recent list.
  const unknown = candidates.filter(item => !confirmed.has(item.id)).sort((a, b) =>
    (lastAttempt.get(`${type}:${a.id}`) || 0) - (lastAttempt.get(`${type}:${b.id}`) || 0)
  ).slice(0, 8);
  let cursor = 0;
  await Promise.all([0, 1].map(async () => {
    while (!signal.aborted && cursor < unknown.length) {
      const item = unknown[cursor++];
      if (lastAttempt.size >= 500) lastAttempt.delete(lastAttempt.keys().next().value!);
      lastAttempt.set(`${type}:${item.id}`, Date.now());
      if (await confirmNewRelease(item, type)) { confirmed.add(item.id); publish(); }
    }
  }));
}
