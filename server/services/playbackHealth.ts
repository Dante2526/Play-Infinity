export type PlaybackHealthState = 'available' | 'unavailable' | 'unknown';
export interface PlaybackHealthResult {
  state: PlaybackHealthState;
  checkedAt: number;
  reason: string;
}

/** Bounded per-worker cache and admission control; concurrent viewers share probes. */
export function createPlaybackHealthCache(options: { timeoutMs?: number; concurrency?: number; maxEntries?: number } = {}) {
  const cache = new Map<string, { result: PlaybackHealthResult; expires: number }>();
  const inflight = new Map<string, Promise<PlaybackHealthResult>>();
  let active = 0;
  return async (key: string, probe: (signal: AbortSignal) => Promise<Omit<PlaybackHealthResult, 'checkedAt'>>) => {
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.result;
    if (inflight.has(key)) return inflight.get(key)!;
    // Do not create a backlog of scraping tasks when the VPS is busy.
    if (active >= (options.concurrency ?? 6)) {
      return { state: 'unknown' as const, checkedAt: Date.now(), reason: 'busy' };
    }
    active++;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<Omit<PlaybackHealthResult, 'checkedAt'>>(resolve => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ state: 'unknown', reason: 'timeout' });
      }, options.timeoutMs ?? 4500);
    });
    const pending = Promise.race([
      Promise.resolve().then(() => probe(controller.signal)).catch(() => ({ state: 'unknown' as const, reason: 'network' })),
      deadline,
    ]).then(result => {
      const value = { ...result, checkedAt: Date.now() };
      if (cache.size >= (options.maxEntries ?? 2000)) cache.delete(cache.keys().next().value!);
      cache.set(key, { result: value, expires: Date.now() + (result.state === 'available' ? 60000 : 15000) });
      return value;
    }).finally(() => {
      clearTimeout(timer);
      controller.abort();
      active--;
      inflight.delete(key);
    });
    inflight.set(key, pending);
    return pending;
  };
}

/** Read a tiny prefix, then cancel, even when an origin ignores Range. */
export async function readHealthPrefix(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const piece = value.subarray(0, limit - size);
      chunks.push(piece); size += piece.length;
    }
  } finally { await reader.cancel().catch(() => {}); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export async function probeHealthMedia(url: string, signal: AbortSignal, fetchImpl = fetch): Promise<Omit<PlaybackHealthResult, 'checkedAt'>> {
  const response = await fetchImpl(url, { signal, headers: { Range: 'bytes=0-1023' } });
  const prefix = await readHealthPrefix(response, 1024);
  if (response.status === 404 || response.status === 410) return { state: 'unavailable', reason: 'not_found' };
  if (!response.ok) return { state: 'unknown', reason: 'upstream_' + response.status };
  const text = new TextDecoder().decode(prefix).trimStart();
  const type = response.headers.get('content-type') || '';
  // HTTP 200 can also be a login/error page: it is not evidence of media.
  const mp4 = prefix.length >= 12 && new TextDecoder().decode(prefix.subarray(4, 8)) === 'ftyp';
  const hls = text.startsWith('#EXTM3U') && /#EXT(?:INF|-X-STREAM-INF):/.test(text);
  const transportStream = prefix.length >= 189 && prefix[0] === 0x47 && prefix[188] === 0x47;
  if (mp4 || hls || (type.includes('video/mp2t') && transportStream)) return { state: 'available', reason: 'media_verified' };
  return { state: 'unknown', reason: 'unverified_body' };
}
