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

      // Validação estrita de M3U8: impede que erros 404 em HTML ou corpos vazios sejam repassados como 200 m3u8
      if (!text.trimStart().startsWith("#EXTM3U") && !text.includes("#EXTM3U")) {
        console.warn(`[live-stream-proxy] Upstream não-m3u8 recebido para ${rawUrl} (size=${text.length})`);
        liveChunkCache.delete(rawUrl);
        return res.status(502).send("Upstream retornou conteúdo inválido (não-m3u8)");
      }

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
      if (rewrittenBuffer.length > 0 && rewritten.includes("#EXTM3U")) {
        liveChunkCache.set(rawUrl, {
          buffer: rewrittenBuffer,
          contentType: "application/vnd.apple.mpegurl; charset=utf-8",
          expires: Date.now() + 2500
        });
      }

      return res.send(rewrittenBuffer);
    }

    if (req.query.is_segment !== "true" && (rawUrl.includes("up.kiwi") || contentType.includes("mp2t") || finalUrl.endsWith(".ts"))) {
      // Anti-máscara: se o upstream retornou HTML de erro (Xtream 404 "XC_VM - Debug Mode",
      // página de login, etc.), NÃO gerar manifesto sintético fake — falhar explícito com 502.
      // Sem isso, o proxy cria um m3u8 sintético apontando pra um segmento que também vai falhar,
      // levando o hls.js a um loop de levelParsingError em vez de trocar de servidor.
      if (upstreamText !== null && upstreamText.length > 0 && upstreamText.length < 8000 &&
          !upstreamText.includes("#EXTM3U") && !upstreamText.includes("#EXTINF")) {
        const looksLikeHtml = upstreamText.includes("<html") || upstreamText.includes("<!DOCTYPE") ||
                              upstreamText.includes("XC_VM") || upstreamText.includes("Debug Mode") ||
                              upstreamText.includes("<title>");
        const looksLikeJson = upstreamText.trimStart().startsWith("{") || upstreamText.trimStart().startsWith("[");
        if (looksLikeHtml || looksLikeJson) {
          console.warn(`[live-stream-proxy] Upstream retornou conteúdo não-MPEG-TS em vez de stream contínuo (provável Xtream 404): ${rawUrl} (size=${upstreamText.length})`);
          liveChunkCache.delete(rawUrl);
          return res.status(502).send("Upstream indisponível (Xtream 404 ou página de erro)");
        }
      }

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=5");
      const EXTINF_SECONDS = 10;
      const seq = Math.floor(Date.now() / 1000 / EXTINF_SECONDS);
      const proto = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
      const host = req.headers["x-forwarded-host"] || req.headers["host"] || "play-infinity-app.duckdns.org";
      const finalProto = (host.includes("duckdns.org") || proto === "https") ? "https" : proto;
      const baseUrl = `${finalProto}://${host}`;
      const manifest = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        `#EXT-X-TARGETDURATION:${EXTINF_SECONDS}`,
        `#EXT-X-MEDIA-SEQUENCE:${seq}`,
        `#EXTINF:${EXTINF_SECONDS.toFixed(1)},`,
        `${baseUrl}/api/live-stream-proxy?url=${encodeURIComponent(finalUrl)}&is_segment=true`
      ].join("\n");
      return res.send(manifest);
    }

    let finalContentType = contentType || "video/MP2T";
    if ((req.query.is_segment === "true" || isSegment) && !contentType.includes("mpegurl")) {
      finalContentType = "video/MP2T";
    }
    res.setHeader("Content-Type", finalContentType);
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    if (upstreamText !== null) {
      return res.send(Buffer.from(upstreamText, "utf-8"));
    } else if (upstreamRes.body) {
      const stream = Readable.fromWeb(upstreamRes.body);
      stream._readableState.highWaterMark = 256 * 1024;

      const isContinuousTs = req.query.is_segment === "true" && (rawUrl.includes("up.kiwi") || finalUrl.endsWith(".ts") || contentType.includes("mp2t"));
      let cutoff = null;
      if (isContinuousTs) {
        cutoff = setTimeout(() => {
          try {
            stream.unpipe(res);
            stream.destroy();
            res.end();
          } catch (_) {}
        }, 30000);
      }

      const clearCutoff = () => {
        if (cutoff) {
          clearTimeout(cutoff);
          cutoff = null;
        }
      };

      stream.on("end", clearCutoff);
      stream.on("close", clearCutoff);
      stream.on("error", clearCutoff);
      res.on("close", () => {
        clearCutoff();
        try {
          stream.destroy();
        } catch (_) {}
      });

      stream.on("data", (chunk) => {
        if (!res.writableEnded) {
          res.write(chunk);
        }
      });
      stream.on("end", () => {
        if (!res.writableEnded) {
          res.end();
        }
      });
      return;
    } else {
      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      return res.send(buffer);
    }
  } catch (err) {
    console.warn("[Live Stream Proxy Warning]:", err?.message || err, "URL:", req.query?.url);
    return res.status(502).send("Upstream stream unavailable");
  }
});

// Cache em memória para resolução de links MixDrop na VPS Oracle
const mixdropDownloadCache = new Map();

/**
 * Endpoint de download de mídia via Oracle VPS
 * Extrai o arquivo .mp4 real do MixDrop e transmite direto para o navegador com cabeçalho de download
 */
app.get("/api/download", async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    const rawUrl = String(req.query.url || "").trim();
    const customFilename = String(req.query.filename || "").trim();

    if (!rawUrl) {
      return res.status(400).send("Parâmetro 'url' é obrigatório.");
    }

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).send("URL inválida.");
    }

    const host = parsed.hostname.toLowerCase();
    const isMixdrop = host.includes("mixdrop.") || host.includes("mxdrop.");
    if (!isMixdrop) {
      return res.status(400).send("Apenas fontes MixDrop são suportadas para download.");
    }

    const fileMatch = parsed.pathname.match(/\/(?:f|e)\/([a-zA-Z0-9_-]+)/);
    const fileId = fileMatch ? fileMatch[1] : "";
    if (!fileId) {
      return res.status(400).send("ID de arquivo MixDrop não encontrado.");
    }

    let videoDirectUrl = "";
    let pageTitle = "PlayInfinity_Media";
    const cached = mixdropDownloadCache.get(fileId);

    if (cached && cached.expiresAt > Date.now() + 60000) {
      videoDirectUrl = cached.videoUrl;
      pageTitle = cached.title || pageTitle;
    } else {
      const embedUrl = `https://${host}/e/${fileId}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const upstream = await fetch(embedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!upstream.ok) {
          return res.status(502).send(`MixDrop retornou status ${upstream.status}`);
        }

        const html = await upstream.text();
        const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\}\)\)/);
        if (!packerMatch) {
          return res.status(502).send("Não foi possível desembalar os dados do MixDrop.");
        }

        const unpacked = new Function("return " + packerMatch[0].slice(4))();
        const wurlMatch = unpacked.match(/MDCore\.wurl\s*=\s*['"]([^'"]+)['"]/);
        const titleMatch = html.match(/<title>MixDrop - Watch ([^<]+)<\/title>/i);

        if (!wurlMatch || !wurlMatch[1]) {
          return res.status(502).send("Arquivo direto não encontrado no MixDrop.");
        }

        videoDirectUrl = wurlMatch[1];
        if (videoDirectUrl.startsWith("//")) videoDirectUrl = "https:" + videoDirectUrl;

        if (titleMatch && titleMatch[1]) {
          pageTitle = titleMatch[1].trim();
        }

        mixdropDownloadCache.set(fileId, {
          videoUrl: videoDirectUrl,
          title: pageTitle,
          expiresAt: Date.now() + 3 * 60 * 60 * 1000,
        });
      } catch (scrapErr) {
        clearTimeout(timeoutId);
        console.error("[MixDrop Scraper Error]:", scrapErr?.message || scrapErr);
        return res.status(502).send("Falha ao resolver arquivo no MixDrop.");
      }
    }

    // Nome final do arquivo
    const finalFilename = customFilename || `${pageTitle.replace(/[^\w\s.-]/gi, "_")}.mp4`;

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": `https://${host}/`,
    };

    if (req.headers.range) {
      headers["Range"] = req.headers.range;
    }

    const mediaRes = await fetch(videoDirectUrl, { headers });

    res.status(mediaRes.status);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(finalFilename)}"`);
    res.setHeader("Cache-Control", "no-cache, no-transform");

    const contentLength = mediaRes.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    const contentRange = mediaRes.headers.get("content-range");
    if (contentRange) res.setHeader("Content-Range", contentRange);

    const acceptRanges = mediaRes.headers.get("accept-ranges");
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);

    if (!mediaRes.body) {
      return res.end();
    }

    const stream = Readable.fromWeb(mediaRes.body);
    stream.pipe(res);

    res.on("close", () => {
      try {
        stream.destroy();
      } catch (_) {}
    });
  } catch (err) {
    console.error("[Download Proxy Error]:", err?.message || err);
    if (!res.headersSent) {
      res.status(500).send("Erro ao processar download.");
    }
  }
});

app.listen(PORT, () => {
  console.log(`Video proxy running on port ${PORT}`);
});
