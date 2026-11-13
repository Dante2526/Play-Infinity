import { getApiBaseUrl } from '../utils/apiBaseUrl';
import type { ServerHealthMap } from './playbackHealth';

export type StartupInput = {
  id: string;
  type: 'movie' | 'tv';
  season: number;
  episode: number;
  name?: string;
  keys: string[];
  preferred?: string;
  nixId?: string;
  refresh?: boolean;
};

export type CatalogueHint = { listed: boolean; warm: boolean; audioPriority?: number };

export function startupOrder(keys: string[], hints: Record<string, CatalogueHint>, preferred?: string) {
  // An explicit protocol hint supersedes the legacy Saimo alias. If the
  // catalogue knows this title has only MP4, never manufacture an HLS retry.
  if (hints.srv_saimo?.listed) {
    const protocols = ['srv_saimo_hls', 'srv_saimo_mp4'].filter(k => hints[k]?.listed);
    if (protocols.length) keys = keys.filter(k => k === 'srv_saimo' ? !protocols.some(p => keys.includes(p)) : !k.startsWith('srv_saimo_') || protocols.includes(k));
  }
  const listed = keys.filter(k => hints[k]?.listed);
  const eligible = listed.length ? listed : keys;
  const usable = eligible.some(k => hints[k]?.audioPriority === 0) ? eligible.filter(k => hints[k]?.audioPriority !== 2) : eligible;
  return [...usable].sort((a, b) => {
    // BYSE é o player homologado primário (same-origin, HLS 1080p sem anúncios).
    // Sempre recebe prioridade máxima sobre servidores secundários (Mixdrop, Streamtape).
    const providerWeight = (k: string) => (k === 'srv_byse' ? 0 : k === preferred ? 1 : 2);
    const score = (k: string) => (hints[k]?.audioPriority ?? 1) * 100 + providerWeight(k);
    return score(a) - score(b);
  });
}

const apiOrigin = getApiBaseUrl;

export async function preparePlaybackStartup(
  input: StartupInput,
  signal: AbortSignal,
  onHealth: (value: ServerHealthMap) => void,
  fetcher: typeof fetch = fetch
) {
  const identity = `${input.type}:${input.id}:${input.type === 'tv' ? `${input.season}:${input.episode}` : ''}`;
  const params = new URLSearchParams({
    id: input.id,
    type: input.type,
    s: String(input.season),
    e: String(input.episode),
    name: input.name || '',
    nixId: input.nixId || '',
    refresh: input.refresh ? '1' : '0'
  });

  let hints: Record<string, CatalogueHint> = {};
  const meta = new AbortController();
  const stop = () => meta.abort();
  signal.addEventListener('abort', stop, { once: true });
  const mt = setTimeout(stop, 5000);

  try {
    const r = await fetcher(apiOrigin() + '/api/playback-candidates?' + params, { signal: meta.signal });
    const d = await r.json();
    if (r.ok && d.identity === identity) hints = d.servers || {};
  } catch {}
  finally {
    clearTimeout(mt);
    signal.removeEventListener('abort', stop);
  }

  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');

  const candidates = startupOrder(input.keys, hints, input.preferred);

  // Fast-Path: se BYSE é o candidato #1 e está listado, inicia direto nele sem disputa de probe com hosts lentos
  if (candidates[0] === 'srv_byse' && hints.srv_byse?.listed !== false) {
    return { selected: 'srv_byse', candidates, hints, urls: {} };
  }

  // Cold BYSE resolves directly inside its iframe (12s budget) without spawning a duplicate PoW in health probe.
  const probeKeys = candidates
    .filter(k => ['srv_byse', 'srv_streamtape', 'srv_mixdrop', 'srv_watchplay', 'srv_vip', 'srv_nixplay', 'srv_saimo', 'srv_saimo_hls', 'srv_saimo_mp4', 'srv_anidigital'].includes(k) && (k !== 'srv_byse' || hints[k]?.warm))
    .slice(0, 2);

  const health: ServerHealthMap = {};
  const urls: Record<string, string> = {};
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 4500);

  const jobs = probeKeys.map(async key => {
    try {
      const r = await fetcher(apiOrigin() + '/api/playback-health?' + params + '&startup=1&servers=' + encodeURIComponent(key), { signal: ctrl.signal });
      const d = await r.json();
      const value = d.servers?.[key];
      if (!signal.aborted && !ctrl.signal.aborted && r.ok && d.identity === identity && value && ['available', 'unknown', 'unavailable'].includes(value.state) && Number.isFinite(value.checkedAt)) {
        health[key] = value;
        onHealth({ ...health });
        if (value.state === 'available') return key;
      }
    } catch {}
    throw Error('Not verified');
  });

  let selected: string | undefined;
  try {
    selected = await Promise.any(jobs);
  } catch {}

  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  clearTimeout(timer);
  signal.removeEventListener('abort', abort);

  // Mapeia URLs prontas retornadas por qualquer probe
  for (const [key, value] of Object.entries(health)) {
    if (key === 'srv_byse' && value.iframeUrl) {
      try {
        const url = new URL(value.iframeUrl, 'https://local');
        if (url.origin === 'https://local' && url.pathname === '/api/byse-proxy-iframe') urls[key] = url.pathname + url.search;
      } catch {}
    }
    if (key.startsWith('srv_saimo') && value.iframeUrl) {
      try {
        const url = new URL(value.iframeUrl, 'https://local');
        if (url.origin === 'https://local' && url.pathname === '/api/saimo-proxy-iframe') urls[key] = url.pathname + url.search;
      } catch {}
    }
    if (key === 'srv_anidigital' && value.iframeUrl) {
      try {
        const url = new URL(value.iframeUrl, 'https://local');
        if (url.origin === 'https://local' && url.pathname === '/api/anidigital-proxy-iframe') urls[key] = url.pathname + url.search;
      } catch {}
    }
  }

  // Ordena os candidatos considerando o estado apurado na sondagem
  const ordered = [...candidates].sort((a, b) => {
    const scoreA = health[a]?.state === 'available' ? 0 : health[a]?.state === 'unavailable' ? 2 : 1;
    const scoreB = health[b]?.state === 'available' ? 0 : health[b]?.state === 'unavailable' ? 2 : 1;
    return scoreA - scoreB;
  });

  const finalSelected = selected || ordered.find(k => health[k]?.state !== 'unavailable');

  return { selected: finalSelected, candidates: ordered, hints, urls };
}

export function nextStartupKey(keys: string[], attempted: Set<string>, health: ServerHealthMap, hints?: Record<string, CatalogueHint>) {
  const eligible = hints
    ? keys.filter(key => hints[key]?.listed !== false)
    : keys;
  const pool = eligible.length ? eligible : keys;
  const score = (key: string) => (health[key]?.state === 'available' ? 0 : 1);
  return pool.filter(key => !attempted.has(key) && health[key]?.state !== 'unavailable' &&
    !(key.startsWith('srv_saimo') && health[key]?.mediaKind && [...attempted].some(previous =>
      previous.startsWith('srv_saimo') && health[previous]?.mediaKind === health[key].mediaKind)))
    .sort((a, b) => score(a) - score(b))[0];
}

// Start the media budget when its iframe is attached, never during metadata probes.
// Re-renders keep the same deadline; a genuinely new frame gets its own window.
export function createStartupMediaClock() {
  let frame = '',
    started = 0;
  return {
    remaining(identity: string, limit: number, now = Date.now()) {
      if (frame !== identity) {
        frame = identity;
        started = now;
      }
      return Math.max(100, limit - (now - started));
    }
  };
}

export function startupMediaLimit(key: string, hasAlternative: boolean, prepared: boolean) {
  return 12000;
}

export function shouldReloadMixdropFrame(activeUrl: string | null | undefined, started: boolean) {
  if (!activeUrl || started) return false;
  try {
    const u = new URL(activeUrl, 'https://local');
    if (u.pathname === '/api/md-stream' && /^[1-9]\d*$/.test(u.searchParams.get('id') || '')) return false;
  } catch {}
  return true;
}
