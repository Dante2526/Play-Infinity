export type CatalogueMediaSource = { fileId: string; source: 'encontrei' | 'vizer' | 'direct'; audio: string };
type Measurement = { valid: boolean; latencyMs: number; directUrl: string | null; checkedAt: number };
type Stats = { active: number; failures: number; cooldown: number; latencyMs: number; touched: number };
const audioPriority = (audio: string) => /dublad|nacional|portugu|pt[-_ ]?br/i.test(audio) ? 0 : audio ? 2 : 1;

/** Measurements and active proxied requests belong to THIS PM2 worker. They
 * estimate our path to a file, never the provider's private/global server load. */
export function createMediaSourcePool(options: {
  resolve: (fileId: string, refresh?: boolean) => Promise<string | null>;
  probe: (url: string, signal: AbortSignal) => Promise<boolean>;
  timeoutMs?: number;
  ttlMs?: number;
  now?: () => number;
}) {
  const now = options.now || Date.now;
  const stats = new Map<string, Stats>();
  const cache = new Map<string, Measurement>();
  const pending = new Map<string, Promise<Measurement>>();
  let probing = 0, sequence = 0;
  function entry(id: string) {
    let value = stats.get(id);
    if (!value) {
      if (stats.size >= 1000) {
        const evict = [...stats].find(([, value]) => value.active === 0)?.[0];
        if (evict) { stats.delete(evict); cache.delete(evict); }
      }
      value = { active: 0, failures: 0, cooldown: 0, latencyMs: 1000, touched: now() };
      if (stats.size < 1000) stats.set(id, value);
    }
    value.touched = now(); return value;
  }
  function report(id: string, ok: boolean, latencyMs?: number) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return;
    const value = entry(id);
    if (ok) {
      value.failures = Math.max(0, value.failures - 1); value.cooldown = 0;
      if (latencyMs !== undefined) value.latencyMs = value.latencyMs * .6 + Math.max(1, latencyMs) * .4;
    } else {
      value.failures = Math.min(5, value.failures + 1); value.cooldown = now() + 15000;
      cache.delete(id);
    }
  }
  const probe = options.probe;
  async function measure(id: string): Promise<Measurement> {
    const cached = cache.get(id);
    if (cached && now() - cached.checkedAt < (cached.valid ? (options.ttlMs ?? 30000) : 5000)) return cached;
    if (pending.has(id)) return pending.get(id)!;
    // Admission control: do not turn a burst of viewers into a scraping queue.
    if (probing >= 6) return { valid: false, directUrl: null, latencyMs: 0, checkedAt: now() };
    probing++;
    const started = now(), controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = (async () => {
      let directUrl = await options.resolve(id);
      if (!directUrl || controller.signal.aborted) return { valid: false, directUrl: null, latencyMs: now() - started, checkedAt: now() };
      let valid = await probe(directUrl, controller.signal);
      // A cached signed URL may have expired since the last successful probe.
      if (!valid && !controller.signal.aborted) {
        directUrl = await options.resolve(id, true);
        if (directUrl && !controller.signal.aborted) valid = await probe(directUrl, controller.signal);
      }
      return { valid, directUrl: valid ? directUrl : null, latencyMs: now() - started, checkedAt: now() };
    })();
    const request = Promise.race([work, new Promise<Measurement>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve({ valid: false, directUrl: null, latencyMs: now() - started, checkedAt: now() }); }, options.timeoutMs ?? 8000);
    })]).catch(() => ({ valid: false, directUrl: null, latencyMs: now() - started, checkedAt: now() })).then(result => {
      report(id, result.valid, result.latencyMs);
      if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
      cache.set(id, result); return result;
    }).finally(() => { clearTimeout(timer); controller.abort(); pending.delete(id); probing--; });
    pending.set(id, request); return request;
  }
  return {
    report,
    begin(id: string) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return () => {};
      const value = entry(id); value.active++;
      let done = false;
      return () => { if (!done) { done = true; value.active = Math.max(0, value.active - 1); } };
    },
    async select(sources: CatalogueMediaSource[], exclude: string[] = []) {
      const unique = new Map<string, CatalogueMediaSource>();
      for (const source of sources) {
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(source.fileId) || exclude.includes(source.fileId)) continue;
        const previous = unique.get(source.fileId);
        if (!previous || audioPriority(source.audio) < audioPriority(previous.audio)) unique.set(source.fileId, source);
      }
      for (const priority of [0, 1, 2]) {
        const candidates = [...unique.values()].filter(source => audioPriority(source.audio) === priority);
        if (!candidates.length) continue;
        const results = await Promise.all(candidates.map(async source => ({ source, measurement: await measure(source.fileId) })));
        const working = results.filter(result => result.measurement.valid && result.measurement.directUrl);
        if (!working.length) continue;
        const score = (id: string) => {
          const value = entry(id);
          return value.latencyMs + value.active * 1500 + value.failures * 2000 + (value.cooldown > now() ? 10000 : 0);
        };
        // Rotate close scores to distribute cold simultaneous starts rather than
        // routing every viewer to the first catalogue in an array.
        const offset = sequence++ % working.length;
        const rotated = [...working.slice(offset), ...working.slice(0, offset)];
        rotated.sort((a, b) => score(a.source.fileId) - score(b.source.fileId));
        const selected = rotated[0];
        return { ...selected.source, directUrl: selected.measurement.directUrl! };
      }
      return null;
    },
  };
}
