const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const pageHosts = ['streamtape.com', 'streamtape.net', 'streamtape.cc', 'streamtape.site'];
const isHost = (host: string, roots: string[]) => roots.some(root => host === root || host.endsWith('.' + root));

// Parse only the string operations used to construct the playback link. Never
// execute scripts supplied by an upstream page inside the server process.
function stringExpression(source: string, values: Map<string, string>) {
  let pos = 0;
  const space = () => { while (/\s/.test(source[pos] || '') && pos < source.length) pos++; };
  const expect = (token: string) => { space(); if (!source.startsWith(token, pos)) throw new Error('Unsupported expression'); pos += token.length; };
  function literal(): string {
    space(); const quote = source[pos++];
    if (quote !== '"' && quote !== "'") throw new Error('Expected string');
    let value = '';
    while (pos < source.length) {
      let char = source[pos++];
      if (char === quote) return value;
      if (char === '\\') {
        char = source[pos++];
        if (char === 'x' || char === 'u') {
          const length = char === 'x' ? 2 : 4;
          const hex = source.slice(pos, pos + length);
          if (!new RegExp('^[a-fA-F0-9]{' + length + '}$').test(hex)) throw new Error('Bad escape');
          value += String.fromCharCode(parseInt(hex, 16)); pos += length; continue;
        }
        if (char === '\n') continue;
        value += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' } as Record<string, string>)[char] ?? char;
      } else value += char;
      if (value.length > 16384) throw new Error('Link too long');
    }
    throw new Error('Unterminated string');
  }
  function number() {
    space(); const match = source.slice(pos).match(/^-?\d{1,6}(?!\d)/);
    if (!match) throw new Error('Expected index');
    pos += match[0].length; return Number(match[0]);
  }
  function primary(): string {
    space(); let value: string;
    if (source[pos] === '(') { pos++; value = expression(); expect(')'); }
    else if (source[pos] === '"' || source[pos] === "'") value = literal();
    else {
      expect('document'); expect('.'); expect('getElementById'); expect('(');
      const id = literal(); expect(')'); expect('.'); expect('innerHTML');
      if (!values.has(id)) throw new Error('Unknown link element');
      value = values.get(id)!;
    }
    while (true) {
      space(); if (source[pos] !== '.') break;
      pos++; space(); const method = source.slice(pos).match(/^(substring|slice)\b/)?.[0];
      if (!method) throw new Error('Unsupported string method');
      pos += method.length; expect('('); const start = number(); space();
      let end: number | undefined;
      if (source[pos] === ',') { pos++; end = number(); }
      expect(')'); value = method === 'slice' ? value.slice(start, end) : value.substring(start, end);
    }
    return value;
  }
  function expression(): string {
    let value = primary(); space();
    while (source[pos] === '+') { pos++; value += primary(); space(); if (value.length > 16384) throw new Error('Link too long'); }
    return value;
  }
  const value = expression(); space();
  if (pos !== source.length) throw new Error('Trailing script');
  return value;
}

export function extractStreamtapeVideoUrl(html: string, fileId: string): string | null {
  const values = new Map<string, string>();
  const seen = new Set<string>();
  const assignment = /document\s*\.\s*getElementById\s*\(\s*(['"])(robotlink|botlink|norobotlink)\1\s*\)\s*\.\s*innerHTML\s*(\+?=)\s*/g;
  for (const match of html.matchAll(assignment)) {
    const id = match[2]; seen.add(id);
    let end = match.index! + match[0].length, quote = '', escaped = false;
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ';' || html.startsWith('</script', end)) break;
      if (end - match.index! > 20000) break;
    }
    try {
      const value = stringExpression(html.slice(match.index! + match[0].length, end), values);
      values.set(id, (match[3] === '+=' ? values.get(id) || '' : '') + value);
    } catch { values.delete(id); }
  }
  const ids = seen.has('robotlink') || seen.has('botlink') ? ['robotlink', 'botlink'] : ['norobotlink'];
  for (const id of ids) {
    const value = values.get(id); if (!value) continue;
    try {
      const url = new URL(value.replace(/&amp;/g, '&'), 'https://streamtape.com');
      if (url.protocol !== 'https:' || url.username || url.password || !isHost(url.hostname, pageHosts) ||
        url.pathname !== '/get_video' || url.searchParams.get('id') !== fileId) continue;
      if (!url.searchParams.has('stream')) url.search += (url.search ? '&' : '?') + 'stream=1';
      return url.href;
    } catch { /* Only validated provider links are candidates. */ }
  }
  return null;
}

export type StreamtapeResolution = {
  directUrl: string | null;
  failure?: { stage: 'embed' | 'extract' | 'handoff'; code: string; status?: number };
};

export function createStreamtapeResolver(options: { timeoutMs?: number; phaseTimeoutMs?: number; ttlMs?: number } = {}) {
  const cache = new Map<string, { result: StreamtapeResolution; expires: number }>();
  const inflight = new Map<string, Promise<StreamtapeResolution>>();
  async function load(fileId: string): Promise<StreamtapeResolution> {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
    const embedUrl = `https://streamtape.com/e/${encodeURIComponent(fileId)}/`;
    const cookies = new Map<string, Map<string, string>>();
    let stage: 'embed' | 'extract' | 'handoff' = 'embed';
    async function request(url: string, method: string, text = false) {
      const phase = new AbortController();
      const abort = () => phase.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      if (controller.signal.aborted) phase.abort();
      const timer = setTimeout(abort, Math.min(options.phaseTimeoutMs ?? 5000, method === 'HEAD' ? 3000 : 5000));
      try {
        const host = new URL(url).hostname;
        const cookie = [...(cookies.get(host)?.entries() || [])].map(([key, value]) => key + '=' + value).join('; ');
        const response = await fetch(url, { method, redirect: 'manual', signal: phase.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: text ? 'text/html,application/xhtml+xml,*/*' : '*/*',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7', Referer: embedUrl,
            ...(cookie ? { Cookie: cookie } : {}) } });
        for (const item of response.headers.getSetCookie()) {
          const pair = item.split(';', 1)[0]; const separator = pair.indexOf('=');
          if (separator > 0) {
            if (!cookies.has(host)) cookies.set(host, new Map());
            cookies.get(host)!.set(pair.slice(0, separator), pair.slice(separator + 1));
          }
        }
        const body = text ? await response.text() : '';
        if (!text) await response.body?.cancel().catch(() => {});
        return { response, body };
      } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); }
    }
    try {
      let page: Awaited<ReturnType<typeof request>> | undefined;
      for (let attempt = 0; attempt < 2 && !controller.signal.aborted; attempt++) {
        try {
          let pageUrl = embedUrl;
          for (let hop = 0; hop < 3; hop++) {
            page = await request(pageUrl, 'GET', true);
            const location = page.response.headers.get('location');
            if (page.response.status < 300 || page.response.status >= 400 || !location) break;
            const target = new URL(location, pageUrl);
            if (target.protocol !== 'https:' || target.username || target.password || !isHost(target.hostname, pageHosts)) {
              return { directUrl: null, failure: { stage, code: 'invalid_redirect' } };
            }
            pageUrl = target.href;
          }
        } catch { if (attempt === 1) throw new Error('network'); }
        if (page?.response.ok || (page && page.response.status < 500)) break;
      }
      if (!page) throw new Error('network');
      if (!page.response.ok) return { directUrl: null, failure: { stage, code: 'upstream_http', status: page.response.status } };
      if (/Video not found|has been deleted/i.test(page.body)) return { directUrl: null, failure: { stage, code: 'file_removed' } };
      stage = 'extract';
      const next = extractStreamtapeVideoUrl(page.body, fileId);
      if (!next) return { directUrl: null, failure: { stage, code: 'playback_link_missing' } };
      stage = 'handoff';
      let url = next;
      for (let hop = 0; hop < 3 && !controller.signal.aborted; hop++) {
        let head: Awaited<ReturnType<typeof request>> | undefined;
        try { head = await request(url, 'HEAD'); } catch { /* GET may work even when HEAD is rejected or reset. */ }
        let result = head;
        if (!head?.response.headers.get('location') || head.response.status >= 400) result = await request(url, 'GET');
        if (!result) throw new Error('network');
        const location = result.response.headers.get('location');
        if (!location) {
          if (result.response.ok && /^video\//i.test(result.response.headers.get('content-type') || '')) return { directUrl: url };
          return { directUrl: null, failure: { stage, code: 'redirect_missing', status: result.response.status } };
        }
        const target = new URL(location, url);
        if (target.protocol !== 'https:' || target.username || target.password ||
          !isHost(target.hostname, [...pageHosts, 'tapecontent.net'])) return { directUrl: null, failure: { stage, code: 'invalid_redirect' } };
        if (isHost(target.hostname, ['tapecontent.net'])) return { directUrl: target.href };
        url = target.href;
      }
      return { directUrl: null, failure: { stage, code: controller.signal.aborted ? 'timeout' : 'redirect_limit' } };
    } catch { return { directUrl: null, failure: { stage, code: controller.signal.aborted ? 'timeout' : 'network' } }; }
    finally { clearTimeout(deadline); }
  }
  return {
    resolve(fileId: string, refresh = false): Promise<StreamtapeResolution> {
      const clean = String(fileId || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(clean)) return Promise.resolve({ directUrl: null, failure: { stage: 'extract', code: 'invalid_file_id' } });
      const pending = inflight.get(clean); if (pending) return pending;
      const hit = cache.get(clean);
      if (!refresh && hit && hit.expires > Date.now()) return Promise.resolve(hit.result);
      cache.delete(clean);
      const promise = load(clean).then(result => {
        if (result.directUrl) {
          if (cache.size >= 500) cache.delete(cache.keys().next().value!);
          cache.set(clean, { result, expires: Date.now() + (options.ttlMs ?? 20 * 60 * 1000) });
        }
        return result;
      }).finally(() => inflight.delete(clean));
      inflight.set(clean, promise); return promise;
    },
  };
}
