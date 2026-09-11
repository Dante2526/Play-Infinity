export type ConnectionTier = 'fast' | 'slow';

interface CachedQuality {
  tier: ConnectionTier;
  timestamp: number;
}

let cachedResult: CachedQuality | null = null;
const CACHE_DURATION_MS = 25000; // 25 segundos de cache para trocas rápidas de episódios

/**
 * Detecta a qualidade da conexão do usuário de forma ultra rápida e silenciosa.
 * Retorna 'fast' para conexões adequadas a Full HD (WatchPlayer)
 * ou 'slow' para conexões instáveis/lentas que demandam stream adaptativo.
 */
export async function detectConnectionQuality(forceRefresh = false): Promise<ConnectionTier> {
  const now = Date.now();
  if (!forceRefresh && cachedResult && now - cachedResult.timestamp < CACHE_DURATION_MS) {
    return cachedResult.tier;
  }

  try {
    // 1. Avalia API nativa do navegador (Network Information API)
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const conn = (nav as any)?.connection || (nav as any)?.mozConnection || (nav as any)?.webkitConnection;

    if (conn) {
      const effectiveType: string = conn.effectiveType || '';
      const downlink: number = typeof conn.downlink === 'number' ? conn.downlink : 0;
      const rtt: number = typeof conn.rtt === 'number' ? conn.rtt : 0;

      // Se for explicitamente rede 2G/3G ou velocidade baixa
      if (['slow-2g', '2g', '3g'].includes(effectiveType) || (downlink > 0 && downlink < 3.0) || rtt > 450) {
        cachedResult = { tier: 'slow', timestamp: now };
        return 'slow';
      }

      // Se for 4G com boa largura de banda
      if (effectiveType === '4g' && downlink >= 3.0 && rtt <= 450) {
        cachedResult = { tier: 'fast', timestamp: now };
        return 'fast';
      }
    }

    // 2. Teste de latência/ping rápido em background (< 400ms)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 450);

    const startTime = performance.now();
    const res = await fetch('/api/custom-episodes', {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latency = performance.now() - startTime;

    if (res.ok && latency < 350) {
      cachedResult = { tier: 'fast', timestamp: now };
      return 'fast';
    } else {
      cachedResult = { tier: 'slow', timestamp: now };
      return 'slow';
    }
  } catch {
    // Em caso de timeout ou falha na checagem de ping, conexão está lenta ou oscilando
    cachedResult = { tier: 'slow', timestamp: now };
    return 'slow';
  }
}
