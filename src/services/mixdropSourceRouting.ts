import { getApiBaseUrl } from '../utils/apiBaseUrl';
type Identity = { id: number; season?: number; episode?: number; name?: string };
const validId = (id: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(id);
export function createMixdropSourceRouting() {
  const fresh = (identity: string) => ({ identity, current: '', failed: new Set<string>(), busy: false, exhausted: false, paused: false, seekTarget: undefined as number | undefined });
  let state = fresh('');
  const origin = getApiBaseUrl;
  return {
    ensure(identity: string) { if (state.identity !== identity) state = fresh(identity); },
    reset(identity: string) { state = fresh(identity); },
    track(fileId: string) { if (validId(fileId)) state.current = fileId; },
    exhaust() { state.exhausted = true; },
    get busy() { return state.busy; },
    get paused() { return state.paused; },
    get seekTarget() { return state.seekTarget; },
    command(type: string, data: { time?: number; targetTime?: number; seconds?: number }, currentTime: number) {
      if (type === 'PAUSE') state.paused = true;
      if (type === 'PLAY') state.paused = false;
      if (type === 'TOGGLE_PLAY') state.paused = !state.paused;
      if (!state.busy) return;
      let target: number | undefined;
      if (type === 'SEEK' || type === 'SEEK_ABSOLUTE' || type === 'seek') target = data.time ?? data.targetTime;
      if (type === 'SEEK_RELATIVE' || type === 'SKIP_INTRO') target = (state.seekTarget ?? currentTime) + (data.seconds ?? 75);
      if (target !== undefined && Number.isFinite(target)) state.seekTarget = Math.max(0, target);
    },
    async next(identity: Identity, signal?: AbortSignal) {
      const current = state;
      if (current.busy) return { kind: 'busy' as const };
      if (current.exhausted) return { kind: 'exhausted' as const };
      current.busy = true; current.seekTarget = undefined;
      if (validId(current.current)) current.failed.add(current.current);
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      const timer = setTimeout(cancel, 18000);
      const stale = () => state !== current || controller.signal.aborted;
      try {
        const params = new URLSearchParams({ id: String(identity.id), format: 'json', exclude: [...current.failed].join(','), name: identity.name || '' });
        if (identity.season !== undefined && identity.episode !== undefined) { params.set('s', String(identity.season)); params.set('e', String(identity.episode)); }
        const response = await fetch(origin() + '/api/md-stream?' + params, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('No verified source');
        const data = await response.json();
        if (stale()) return { kind: 'cancelled' as const };
        if (!validId(data.fileId || '') || current.failed.has(data.fileId)) throw new Error('No distinct source');
        current.current = data.fileId;
        return { kind: 'selected' as const, fileId: String(data.fileId), exclude: [...current.failed] };
      } catch {
        if (state !== current || signal?.aborted) return { kind: 'cancelled' as const };
        current.exhausted = true; return { kind: 'exhausted' as const };
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); current.busy = false; }
    },
  };
}
