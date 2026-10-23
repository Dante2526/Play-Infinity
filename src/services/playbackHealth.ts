export type ServerHealth = { state: 'available' | 'unavailable' | 'unknown'; checkedAt: number; reason: string };
export type ServerHealthMap = Record<string, ServerHealth>;

export function playbackHealthState(health: ServerHealthMap, key: string): ServerHealth['state'] {
  const value = health[key];
  if (!value || Date.now() - value.checkedAt > (value.state === 'available' ? 75000 : 20000)) return 'unknown';
  return value.state;
}

/** Keep provider/audio priority within each tier; unknown is still eligible. */
export function rankPlaybackServers<T extends { key: string }>(servers: T[], health: ServerHealthMap): T[] {
  const tier = (key: string) => playbackHealthState(health, key) === 'available' ? 0 : playbackHealthState(health, key) === 'unavailable' ? 2 : 1;
  return servers.filter(server => tier(server.key) < 2).sort((a, b) => tier(a.key) - tier(b.key));
}

export function chooseHealthStartupServer<T extends { key: string }>(servers: T[], health: ServerHealthMap, selected: string, playbackStarted: boolean, attempted: Set<string>): T | undefined {
  // Catalogue-backed players own bounded intra-provider source cycles.
  // Exhaust Encontrei/Vizer before a background poll changes providers.
  if (['srv_streamtape', 'srv_mixdrop'].includes(selected) || playbackStarted || playbackHealthState(health, selected) === 'available') return undefined;
  return rankPlaybackServers(servers, health).find(server => server.key !== selected && playbackHealthState(health, server.key) === 'available' && !attempted.has(server.key));
}

export async function fetchPlaybackHealth(input: {
  id: string; type: 'movie' | 'tv'; season: number; episode: number; servers: string[]; name?: string; nixId?: string;
}, signal: AbortSignal): Promise<ServerHealthMap> {
  const native = typeof window !== 'undefined' && ((window as any).Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:');
  const origin = native ? ((import.meta.env.VITE_PROXY_URL as string) || 'https://play-infinity.stream') : '';
  const query = new URLSearchParams({ id: input.id, type: input.type, s: String(input.season), e: String(input.episode), servers: input.servers.join(','), name: input.name || '', nixId: input.nixId || '' });
  const response = await fetch(origin + '/api/playback-health?' + query, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Health check unavailable');
  const data = await response.json();
  const identity = `${input.type}:${input.id}:${input.type === 'tv' ? `${input.season}:${input.episode}` : ''}`;
  if (data.identity !== identity) throw new Error('Health check content mismatch');
  const result: ServerHealthMap = {};
  for (const key of input.servers) {
    const value = data.servers?.[key];
    if (value && ['available', 'unavailable', 'unknown'].includes(value.state) && Number.isFinite(value.checkedAt)) result[key] = value;
  }
  return result;
}
