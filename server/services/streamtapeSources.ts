import { createMediaSourcePool } from './mediaSourcePool';
import { readHealthPrefix } from './playbackHealth';
export type { CatalogueMediaSource as StreamtapeSource } from './mediaSourcePool';
export function createStreamtapeSourcePool(options: {
  resolve: (fileId: string, refresh?: boolean) => Promise<string | null>;
  probe?: (url: string, signal: AbortSignal) => Promise<boolean>;
  timeoutMs?: number; ttlMs?: number; now?: () => number;
}) {
  const probe = options.probe || (async (url: string, signal: AbortSignal) => {
    const response = await fetch(url, { signal, headers: { Range: 'bytes=0-1023', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', Referer: 'https://streamtape.com/', Origin: 'https://streamtape.com' } });
    const bytes = await readHealthPrefix(response, 1024);
    return response.ok && bytes.length >= 12 && new TextDecoder().decode(bytes.subarray(4, 8)) === 'ftyp';
  });
  return createMediaSourcePool({ ...options, probe });
}
