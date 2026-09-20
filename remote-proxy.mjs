import express from "express";
import { Readable } from "stream";
import helmet from "helmet";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(helmet({
  frameguard: false,
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

const liveChunkCache = new Map();

function isPrivateOrLocalIp(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
    hostname.includes("169.254") ||
    hostname.includes("metadata.google.internal")
  );
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/live-stream-proxy", async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).send("URL ausente");

    let parsed;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      return res.status(400).send("Formato de URL invalido");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return res.status(403).send("Protocolo invalido.");
    }

    if (isPrivateOrLocalIp(parsed.hostname)) {
      return res.status(403).send("Acesso a IP privado bloqueado.");
    }

    const isSegment = req.query.is_segment === "true" || rawUrl.includes(".ts") || rawUrl.includes(".m4s") || rawUrl.includes(".mp4");
    const isM3U8Request = rawUrl.includes(".m3u8");
    
    const cached = isM3U8Request ? liveChunkCache.get(rawUrl) : null;
    if (cached && cached.expires > Date.now()) {
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=2, immutable");
      res.setHeader("X-Cache-Status", "HIT-MEMORY");
      return res.send(cached.buffer);
    }

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "X-Forwarded-For": "177.100.100.1"
    };

    if (req.query.referer) {
      headers["Referer"] = req.query.referer;
    }

    let currentUrl = rawUrl;
    let upstreamRes;
    let redirects = 0;
    const MAX_REDIRECTS = 5;

    while (redirects < MAX_REDIRECTS) {
      upstreamRes = await fetch(currentUrl, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(12000)
      });

      if ([301, 302, 303, 307, 308].includes(upstreamRes.status)) {
        const location = upstreamRes.headers.get("location");
        if (!location) break;

        let nextUrl;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          return res.status(502).send("Location de redirecionamento invalido");
        }

        if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
          return res.status(403).send("Protocolo invalido no redirect.");
        }

        currentUrl = nextUrl.toString();
        redirects++;
      } else {
        break;
      }
    }

    if (redirects >= MAX_REDIRECTS || !upstreamRes) {
      return res.status(502).send("Muitos redirecionamentos ou falha de proxy");
    }

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send(`Upstream status: ${upstreamRes.status}`);
    }

    const finalUrl = upstreamRes.url || currentUrl;
    const contentType = (upstreamRes.headers.get("content-type") || "").toLowerCase();
    let isM3U8 = req.query.is_manifest === "true" ||
                 rawUrl.includes(".m3u8") || 
                 finalUrl.includes(".m3u8") ||
                 contentType.includes("mpegurl") || 
                 contentType.includes("x-mpegurl") || 
                 contentType.includes("vnd.apple.mpegurl");

    let upstreamText = null;
    if (!isSegment) {
      if (isM3U8 || rawUrl.includes("up.kiwi") || !contentType.includes("mp2t")) {
        upstreamText = await upstreamRes.text();
        if (upstreamText.includes("#EXTM3U")) {
          isM3U8 = true;
        }
      }
    }

    if (isM3U8) {
      const text = upstreamText !== null ? upstreamText : await upstreamRes.text();
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=2, immutable");
      
      const isKiwi = rawUrl.includes("up.kiwi") || req.query.kiwi === "true";

      // Remove lixo HTML/PHP warnings anteriores a #EXTM3U que quebram o parser
      let cleanText = text;
      const m3uIdx = cleanText.indexOf("#EXTM3U");
      if (m3uIdx !== -1) {
        cleanText = cleanText.slice(m3uIdx);
      }

      const lines = cleanText.split("\n");
      const filteredLines = [];
      let skipNextLine = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        if (!trimmed) {
          filteredLines.push(line);
          continue;
        }

        // Descarta avisos HTML inseridos no meio ou fim da playlist
        if (trimmed.startsWith("<") || trimmed.includes("</") || trimmed.includes("WARNING")) {
          continue;
        }

        if (skipNextLine && !trimmed.startsWith("#")) {
          skipNextLine = false;
          continue; 
        }
        skipNextLine = false;

        if (trimmed.startsWith("#EXT-X-STREAM-INF:")) {
          // Permitimos o ABR cair ate 480p em redes instaveis para evitar travamentos
          const resMatch = trimmed.match(/RESOLUTION=\d+x(\d+)/i);
          if (resMatch && parseInt(resMatch[1], 10) < 480) {
            skipNextLine = true;
            continue; 
          }
        }

        filteredLines.push(line);
      }

      let baseReferer = req.query.referer;
      if (!baseReferer) {
        try {
          baseReferer = new URL(finalUrl).origin + "/";
        } catch {
          baseReferer = "";
        }
      }
      const refererParam = baseReferer ? `&referer=${encodeURIComponent(baseReferer)}` : "";
      
      const proto = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
      const host = req.headers["x-forwarded-host"] || req.headers["host"] || "play-infinity-app.duckdns.org";
      const finalProto = (host.includes("duckdns.org") || proto === "https") ? "https" : proto;
      const baseUrl = `${finalProto}://${host}`;

      let lastTag = "";
      const mappedLines = filteredLines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        if (trimmed.startsWith("#")) {
          lastTag = trimmed.split(":")[0];
          return trimmed.replace(/URI="([^"]+)"/, (match, uri) => {
            try {
              const fullUri = uri.startsWith("http") ? uri : new URL(uri, finalUrl).toString();
              if (fullUri.startsWith("https://") && fullUri.includes("plutotv.net")) return `URI="${fullUri}"`;
              return `URI="${baseUrl}/api/live-stream-proxy?url=${encodeURIComponent(fullUri)}${refererParam}&is_segment=true&kiwi=${isKiwi}"`;
            } catch {
              return `URI="${uri}"`;
            }
          });
        }

        try {
          const fullSegUrl = trimmed.startsWith("http") ? trimmed : new URL(trimmed, finalUrl).toString();
          if (fullSegUrl.startsWith("https://") && fullSegUrl.includes("plutotv.net")) return fullSegUrl;
          const isStreamManifest = lastTag === "#EXT-X-STREAM-INF";
          const segParam = isStreamManifest ? "&is_manifest=true" : "&is_segment=true";
          return `${baseUrl}/api/live-stream-proxy?url=${encodeURIComponent(fullSegUrl)}${refererParam}${segParam}&kiwi=${isKiwi}`;
        } catch {
          return trimmed;
        }
      });
      const rewritten = mappedLines.join("\n");
      
      const rewrittenBuffer = Buffer.from(rewritten, "utf-8");
      liveChunkCache.set(rawUrl, {
        buffer: rewrittenBuffer,
        contentType: "application/vnd.apple.mpegurl; charset=utf-8",
        expires: Date.now() + 2500
      });

      return res.send(rewrittenBuffer);
    }

    if (req.query.is_segment !== "true" && (rawUrl.includes("up.kiwi") || contentType.includes("mp2t") || finalUrl.endsWith(".ts"))) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      const seq = Math.floor(Date.now() / 4000);
      const proto = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
      const host = req.headers["x-forwarded-host"] || req.headers["host"] || "play-infinity-app.duckdns.org";
      const finalProto = (host.includes("duckdns.org") || proto === "https") ? "https" : proto;
      const baseUrl = `${finalProto}://${host}`;
      const manifest = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:6",
        `#EXT-X-MEDIA-SEQUENCE:${seq}`,
        "#EXTINF:6.0,",
        `${baseUrl}/api/live-stream-proxy?url=${encodeURIComponent(finalUrl)}&is_segment=true&_ts=${Date.now()}`
      ].join("\n");
      return res.send(manifest);
    }

    let finalContentType = contentType || "video/MP2T";
    if ((req.query.is_segment === "true" || isSegment) && !contentType.includes("mpegurl")) {
      finalContentType = "video/MP2T";
    }
    res.setHeader("Content-Type", finalContentType);
    res.setHeader("Cache-Control", "public, max-age=15");

    if (upstreamText !== null) {
      return res.send(Buffer.from(upstreamText, "utf-8"));
    } else if (upstreamRes.body) {
      return Readable.fromWeb(upstreamRes.body).pipe(res);
    } else {
      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      return res.send(buffer);
    }
  } catch (err) {
    console.error("[Live Stream Proxy Error]:", err?.message || err, "URL:", req.query?.url);
    return res.status(500).send("Proxy error");
  }
});

app.listen(PORT, () => {
  console.log(`Video proxy running on port ${PORT}`);
});
