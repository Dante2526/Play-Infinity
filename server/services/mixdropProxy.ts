import type { Request, Response } from "express";
import { once } from "node:events";

type Options = {
  videoUrl: string;
  renewUrl?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  headerTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxRetries?: number;
  observe?: (ok: boolean, latencyMs?: number) => void;
};

export function isMixdropMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      (!url.port || url.port === "443") &&
      (url.hostname === "mxcontent.net" || url.hostname.endsWith(".mxcontent.net"));
  } catch { return false; }
}

function metadata(response: globalThis.Response) {
  const contentRange = response.headers.get("content-range");
  const range = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  const lengthHeader = response.headers.get("content-length");
  const length = lengthHeader === null ? null : Number(lengthHeader);
  const start = response.status === 206 && range ? Number(range[1]) : 0;
  const end = response.status === 206 && range ? Number(range[2]) : length === null ? null : length - 1;
  const total = response.status === 206 && range ? Number(range[3]) : length;
  if ((length !== null && (!Number.isSafeInteger(length) || length < 0)) ||
      (response.status === 206 && (!range || !Number.isSafeInteger(total) ||
        start < 0 || end! < start || end! >= total! ||
        (length !== null && length !== end! - start + 1)))) {
    throw new Error("Invalid CDN range response");
  }
  const encoding = response.headers.get("content-encoding");
  if (encoding && encoding !== "identity") throw new Error("Unexpected encoded video response");
  const contentType = response.headers.get("content-type") || "video/mp4";
  if (!/^(video\/|application\/octet-stream|binary\/octet-stream)/i.test(contentType)) {
    throw new Error("CDN did not return video");
  }
  const etag = response.headers.get("etag");
  const modified = response.headers.get("last-modified");
  const responseDate = Date.parse(response.headers.get("date") || "");
  // HTTP-date is suitable for If-Range only when it is a strong validator.
  const strongModified = modified && Number.isFinite(responseDate) &&
    Number.isFinite(Date.parse(modified)) && responseDate - Date.parse(modified) >= 60000;
  const validatorHeader = etag && !etag.startsWith("W/") ? "etag" :
    strongModified ? "last-modified" : null;
  const validator = validatorHeader ? response.headers.get(validatorHeader) : null;
  return { start, end, total, length, contentType, validator, validatorHeader };
}

// A retry may append bytes only when the CDN confirms the exact offset, length
// and object validator. Otherwise fail visibly and let the player reload/seek;
// never splice a new file or a full HTTP 200 into a partially delivered MP4.
export async function proxyMixdropVideo(req: Request, res: Response, options: Options) {
  if (!isMixdropMediaUrl(options.videoUrl)) {
    res.status(400).send("URL de vídeo inválida.");
    return;
  }
  const requestedRange = req.headers.range;
  if (requestedRange && !/^bytes=(?:\d+-\d*|-\d+)$/.test(requestedRange)) {
    res.status(416).end();
    return;
  }
  if (requestedRange) {
    const [first, last] = requestedRange.slice(6).split("-");
    if ([first, last].some(value => value && !Number.isSafeInteger(Number(value))) ||
        first && last && Number(last) < Number(first) || !first && Number(last) === 0) {
      res.status(416).end();
      return;
    }
  }
  const fetchVideo = options.fetchImpl || fetch;
  const maxRetries = options.maxRetries ?? 2;
  let url = options.videoUrl;
  let bytesSent = 0;
  let original: ReturnType<typeof metadata> | undefined;
  let currentController: AbortController | undefined;
  const client = new AbortController();
  const disconnect = () => {
    client.abort();
    currentController?.abort();
  };
  res.on("close", disconnect);
  res.on("error", disconnect);
  req.on("aborted", disconnect);
  let renewed = false;

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (client.signal.aborted) return;
      const controller = new AbortController();
      currentController = controller;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let headerTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const headers: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "*/*", "Accept-Encoding": "identity",
          Referer: "https://mxdrop.top/", Origin: "https://mxdrop.top",
        };
        if (bytesSent > 0) {
          if (!original?.validator || original.end === null) throw new Error("Cannot safely resume video");
          headers.Range = `bytes=${original.start + bytesSent}-${original.end}`;
          headers["If-Range"] = original.validator;
        } else if (requestedRange) headers.Range = requestedRange;

        const responseStarted = Date.now();
        headerTimer = setTimeout(() => controller.abort(), options.headerTimeoutMs ?? 10000);
        let response: globalThis.Response | undefined;
        for (let redirects = 0; redirects <= 3; redirects++) {
          if (!isMixdropMediaUrl(url)) throw new Error("Invalid CDN redirect");
          response = await fetchVideo(url, { signal: controller.signal, headers, redirect: "manual" });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          const location = response.headers.get("location");
          void response.body?.cancel().catch(() => {});
          if (!location || redirects === 3) throw new Error("Invalid CDN redirect");
          url = new URL(location, url).href;
        }
        clearTimeout(headerTimer);
        if (response?.ok) options.observe?.(true, Date.now() - responseStarted);
        if (!response) throw new Error("Missing CDN response");
        if (!response.ok) options.observe?.(false);
        if ([403, 404, 410].includes(response.status) && options.renewUrl && !renewed && attempt < maxRetries) {
          renewed = true;
          void response.body?.cancel().catch(() => {});
          const fresh = await options.renewUrl();
          if (client.signal.aborted) return;
          if (!fresh || !isMixdropMediaUrl(fresh)) throw new Error("Failed to renew video token");
          url = fresh;
          continue;
        }
        if (![200, 206].includes(response.status)) {
          void response.body?.cancel().catch(() => {});
          if (response.status >= 500) throw new Error("CDN unavailable");
          if (res.headersSent) throw new Error("CDN rejected resumed request");
          res.status(response.status);
          if (response.status === 416 && /^bytes \*\/\d+$/.test(response.headers.get("content-range") || "")) {
            res.setHeader("Content-Range", response.headers.get("content-range")!);
          }
          res.end();
          return;
        }
        const info = metadata(response);
        if (bytesSent > 0) {
          if (response.status !== 206 || info.start !== original!.start + bytesSent ||
              info.end !== original!.end || info.total !== original!.total ||
              info.contentType !== original!.contentType ||
              response.headers.get(original!.validatorHeader!) !== original!.validator) {
            throw new Error("Unsafe CDN resume response");
          }
        } else {
          // Validate the start of an explicit single byte range before exposing
          // a CDN response to the browser. A full 200 may legally ignore Range.
          const explicitStart = requestedRange?.match(/^bytes=(\d+)-/);
          if (response.status === 206 && explicitStart && info.start !== Number(explicitStart[1])) {
            throw new Error("CDN returned the wrong byte offset");
          }
          const explicitEnd = requestedRange?.match(/^bytes=\d+-(\d+)$/);
          const suffix = requestedRange?.match(/^bytes=-(\d+)$/);
          if (response.status === 206 &&
              (explicitEnd && info.end! > Number(explicitEnd[1]) ||
               suffix && (info.end !== info.total! - 1 || info.start !== Math.max(0, info.total! - Number(suffix[1]))))) {
            throw new Error("CDN returned an unexpected byte range");
          }
          original = info;
          res.status(response.status);
          for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
            res.removeHeader(name);
            const value = response.headers.get(name);
            if (value !== null) res.setHeader(name, value);
          }
          res.setHeader("Content-Type", info.contentType);
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-Accel-Buffering", "no");
        }
        if (!response.body) throw new Error("Empty CDN response");
        reader = response.body.getReader();
        const expectedBytes = original!.end === null ? null : original!.end - original!.start + 1;
        while (!client.signal.aborted) {
          // Measure inactivity only while waiting for upstream bytes, not while
          // respecting downstream backpressure from a slower phone connection.
          let idleTimer: ReturnType<typeof setTimeout> | undefined;
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try {
            chunk = await Promise.race([
              reader.read(),
              new Promise<never>((_, reject) => {
                idleTimer = setTimeout(() => {
                  reject(new Error("CDN stopped sending bytes"));
                  controller.abort();
                }, options.idleTimeoutMs ?? 6000);
              }),
            ]);
          } finally { clearTimeout(idleTimer); }
          if (chunk.done) {
            if (expectedBytes !== null && bytesSent !== expectedBytes) throw new Error("Truncated CDN video");
            res.end();
            return;
          }
          if (!chunk.value.byteLength) continue;
          if (expectedBytes !== null && bytesSent + chunk.value.byteLength > expectedBytes) {
            throw new Error("CDN exceeded requested range");
          }
          const writable = res.write(chunk.value);
          bytesSent += chunk.value.byteLength;
          if (!writable) await once(res, "drain", { signal: client.signal });
          if (expectedBytes !== null && bytesSent === expectedBytes) {
            res.end();
            return;
          }
        }
      } catch {
        if (client.signal.aborted) return;
        options.observe?.(false);
        const safeResume = bytesSent === 0 || !!original?.validator && original.end !== null;
        if (attempt === maxRetries || !safeResume) throw new Error("Video transfer failed");
      } finally {
        clearTimeout(headerTimer);
        controller.abort();
        void reader?.cancel().catch(() => {});
      }
    }
    throw new Error("Video retries exhausted");
  } catch {
    if (!client.signal.aborted) {
      if (res.headersSent) res.destroy();
      else {
        for (const name of ["content-length", "content-range", "etag", "last-modified"]) res.removeHeader(name);
        res.status(502).type("text").send("Não foi possível recuperar o vídeo do MixDrop.");
      }
    }
  } finally {
    res.off("close", disconnect);
    res.off("error", disconnect);
    req.off("aborted", disconnect);
    currentController?.abort();
  }
}
