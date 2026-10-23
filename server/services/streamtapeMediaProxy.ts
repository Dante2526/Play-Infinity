import type { Request, Response } from 'express';
import { Readable } from 'node:stream';

function allowedMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      ['tapecontent.net', 'streamtape.com', 'streamtape.net', 'streamtape.cc', 'streamtape.site']
        .some(host => url.hostname === host || url.hostname.endsWith('.' + host));
  } catch { return false; }
}

/** Retry only before response headers: never splice bytes from different tokens. */
export async function proxyStreamtapeMedia(req: Request, res: Response, options: {
  url: string; fileId: string;
  refresh: (fileId: string) => Promise<string | null>;
  timeoutMs?: number;
}) {
  if (!allowedMediaUrl(options.url)) { res.status(400).end('URL de streaming inválida.'); return; }
  const timeoutMs = options.timeoutMs ?? 15000;
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: '*/*', 'Accept-Encoding': 'identity', Referer: 'https://streamtape.com/', Origin: 'https://streamtape.com',
    ...(req.headers.range ? { Range: String(req.headers.range) } : {}),
  };
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let source: Readable | undefined;
  let disconnected = false;
  const stop = () => { disconnected = true; clearTimeout(timer); controller?.abort(); source?.destroy(); };
  req.once('aborted', stop);
  res.once('close', stop);
  const armTimeout = () => { clearTimeout(timer); timer = setTimeout(() => controller?.abort(), timeoutMs); };
  let url = options.url;
  try {
    for (let attempt = 0; attempt < 2 && !disconnected; attempt++) {
      controller = new AbortController();
      clearTimeout(timer);
      timer = setTimeout(() => controller?.abort(), Math.min(timeoutMs, 6000));
      let upstream: globalThis.Response | undefined;
      try {
        upstream = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timer);
      } catch {
        clearTimeout(timer);
        if (disconnected) return;
      }
      const rejectedMedia = upstream?.ok && /text\/html|application\/json/i.test(upstream.headers.get('content-type') || '');
      const retryable = !upstream || rejectedMedia || [403, 404, 410, 429, 500, 502, 503, 504].includes(upstream.status);
      if (attempt === 0 && retryable && options.fileId) {
        await upstream?.body?.cancel().catch(() => {});
        // The resolver has its own bounded deadline; client disconnect cancels
        // this response and prevents any subsequent CDN request.
        const fresh = await options.refresh(options.fileId);
        if (disconnected) return;
        if (fresh && allowedMediaUrl(fresh)) { url = fresh; continue; }
        res.status(502).end('StreamTape temporariamente indisponível.'); return;
      }
      if (!upstream || rejectedMedia) { res.status(502).end('Falha ao conectar ao vídeo do StreamTape.'); return; }
      res.status(upstream.status);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Accel-Buffering', 'no');
      for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(key);
        if (value !== null) res.setHeader(key, value);
      }
      if (!upstream.body) { res.end(); return; }
      source = Readable.fromWeb(upstream.body as any);
      source.on('data', armTimeout);
      source.once('end', () => clearTimeout(timer));
      source.once('error', () => { clearTimeout(timer); controller?.abort(); res.destroy(); });
      armTimeout();
      source.pipe(res);
      return;
    }
  } catch {
    clearTimeout(timer);
    controller?.abort();
    if (disconnected) return;
    if (res.headersSent) res.destroy();
    else res.status(502).end('Erro de comunicação com o StreamTape.');
  }
}
