// One domain list for catalogue resolution and the admin health monitor.
export const VIZER_DOMAINS = ['https://www.vizer.press', 'https://www.vizer.uno', 'https://www.vizer.reisen', 'https://www.vizer.website'];
let workingDomain: string | null = null;
export const getVizerWorkingDomain = () => workingDomain;
export const getVizerDomainOrder = () => workingDomain ? [workingDomain, ...VIZER_DOMAINS.filter(base => base !== workingDomain)] : [...VIZER_DOMAINS];
export function rememberVizerDomain(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && !url.username && !url.password && VIZER_DOMAINS.includes(url.origin)) workingDomain = url.origin;
  } catch { /* Only configured provider origins can become preferred. */ }
}

/** Check the same catalogue listing used by live lookups, not just a 200
 * homepage. A failed domain does not imply cached files or media are offline. */
export async function checkVizerHealth(options: { timeoutMs?: number; phaseTimeoutMs?: number } = {}) {
  const started = Date.now();
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 10000);
  let lastStatus = 0;
  let lastError = 'Não foi possível conectar aos domínios configurados do Vizer.';
  const first = getVizerDomainOrder()[0];
  for (const base of getVizerDomainOrder()) {
    if (deadline.aborted) break;
    const signal = AbortSignal.any([deadline, AbortSignal.timeout(options.phaseTimeoutMs ?? 3000)]);
    let url = base + '/series/online/';
    try {
      for (let hop = 0; hop < 4; hop++) {
        const response = await fetch(url, { redirect: 'manual', signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'text/html' } });
        lastStatus = response.status;
        const redirect = response.headers.get('location');
        if (response.status >= 300 && response.status < 400 && redirect) {
          await response.body?.cancel().catch(() => {});
          const target = new URL(redirect, url);
          if (target.protocol !== 'https:' || target.username || target.password || !VIZER_DOMAINS.includes(target.origin)) {
            const newDomain = target.origin;
            lastError = `Vizer redirecionou para um domínio não configurado: ${newDomain}`;
            return {
              name: 'Catálogo Vizer',
              url: first,
              status: 'OFFLINE' as const,
              latencyMs: Date.now() - started,
              statusCode: response.status,
              error: lastError,
              detectedNewDomain: newDomain
            };
          }
          url = target.href; continue;
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          lastError = `A listagem do Vizer respondeu HTTP ${response.status}.`; break;
        }
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        try {
          while (reader && size < 256 * 1024) {
            const { done, value } = await reader.read(); if (done) break;
            const chunk = value.subarray(0, 256 * 1024 - size); chunks.push(chunk); size += chunk.length;
          }
        } finally { await reader?.cancel().catch(() => {}); }
        const html = Buffer.concat(chunks).toString('utf8');
        const catalogue = /\/series\/online\/[a-z0-9-]+-\d+\/|\/filmes\/online\/[a-z0-9-]+-\d+\//i.test(html);
        const blocked = /<title[^>]*>[^<]*(?:just a moment|access denied|attention required|sign in|log in)/i.test(html);
        if (!catalogue || blocked) {
          lastError = 'O domínio respondeu, mas não foi possível validar a listagem do catálogo.'; break;
        }
        const active = new URL(url).origin; rememberVizerDomain(active);
        return { name: 'Catálogo Vizer', url: active, status: 'ONLINE' as const,
          latencyMs: Date.now() - started, statusCode: response.status,
          ...(active !== first ? { redirectedFrom: first } : {}) };
      }
    } catch { lastError = 'Falha ou timeout ao consultar a listagem do Vizer; disponibilidade não confirmada.'; }
  }
  return { name: 'Catálogo Vizer', url: first, status: 'OFFLINE' as const,
    latencyMs: Date.now() - started, statusCode: lastStatus, error: lastError };
}
