import { Capacitor } from '@capacitor/core';
import { INITIAL_LIVE_CHANNELS, type LiveChannel } from '../data/liveChannels';

let catalogue = INITIAL_LIVE_CHANNELS;
let loadedAt = 0;
let inflight: Promise<LiveChannel[]> | null = null;
export const getLiveCatalogue = () => catalogue;

export function fetchLiveCatalogue(): Promise<LiveChannel[]> {
  if (inflight) return inflight;
  if (loadedAt && Date.now() - loadedAt < 60000) return Promise.resolve(catalogue);
  const origin = Capacitor.isNativePlatform() ? 'https://play-infinity.stream' : '';
  inflight = (async () => {
    const response = await fetch(`${origin}/api/live-channels`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw Error('Não foi possível carregar o catálogo de TV');
    const data = await response.json();
    if (!data.success || !Array.isArray(data.channels) || !data.channels.length) throw Error('Catálogo de TV inválido');
    catalogue = data.channels;
    loadedAt = Date.now();
    return catalogue;
  })().finally(() => { inflight = null; });
  return inflight;
}
