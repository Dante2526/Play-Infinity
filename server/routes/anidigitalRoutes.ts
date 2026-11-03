import { Router, Request, Response } from "express";
import { isPrivateOrLocalHost, signProxyUrl, verifyProxySignature } from "../utils/helpers";
import { isServerBlacklisted } from "../../src/data/serverBlacklist";
import {
  ANIDIGITAL_BASE,
  buildAnidigitalWrapperHtml,
  isAnidigitalCdnUrl,
  resolveAnidigitalStream,
  rewriteAnidigitalPlaylist,
} from "../services/anidigitalResolver";
import * as fs from "node:fs";
import * as path from "node:path";

export const anidigitalRouter = Router();

const STREAM_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * GET /api/anidigital-lookup
 * Consulta de disponibilidade por tmdb_id (SQLite-first, instantâneo) OU
 * por NOME (busca no site /func/listanime). Retorna streamUrl assinado
 * para o health-probe (probeHealthMedia) e para o playerIntegration.
 */
anidigitalRouter.get("/api/anidigital-lookup", async (req: Request, res: Response) => {
  const name = String(req.query.name || "").trim();
  const type = String(req.query.type || "movie") === "tv" ? "tv" : "movie";
  const season = req.query.s !== undefined ? Number(req.query.s) : undefined;
  const episode = req.query.e !== undefined ? Number(req.query.e) : undefined;
  const tmdbId = req.query.tmdb_id !== undefined ? Number(req.query.tmdb_id) : undefined;

  // tmdb_id (SQLite-first) OU name (live search) — pelo menos um precisa estar presente.
  if ((!tmdbId || !Number.isFinite(tmdbId)) && (!name || name.length < 2)) {
    return res.status(400).json({ error: "Invalid name or tmdb_id" });
  }

  const resolution = await resolveAnidigitalStream({
    name,
    type,
    season,
    episode,
    audio: String(req.query.audio || "leg").toLowerCase() === "dub" ? "dub" : "leg",
    tmdbId,
  });

  const response: Record<string, unknown> = {
    available: !!resolution.m3u8,
    dub: resolution.dub,
    leg: resolution.leg,
    title: resolution.title,
  };

  if (resolution.m3u8) {
    const u = encodeURIComponent(resolution.m3u8);
    const sig = signProxyUrl(resolution.m3u8);
    response.streamUrl = `/api/anidigital-stream?u=${u}&sig=${sig}`;
  }

  return res.json(response);
});

/**
 * GET /api/anidigital-stream?u=<m3u8-CDN>&sig=<hmac>
 * Proxy do MANIFESTO HLS apenas: valida assinatura + allowlist de CDN,
 * busca o m3u8 upstream, converte segmentos relativos em absolutos e
 * devolve. Os segmentos em si sao baixados DIRETO da CDN pelo hls.js
 * (CORS *, sem Referer) — zero banda de video na VPS (ADR-0004).
 */
anidigitalRouter.get("/api/anidigital-stream", async (req: Request, res: Response) => {
  const targetUrl = String(req.query.u || req.query.url || "");
  const sig = String(req.query.sig || "");

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).send("URL inválida");
  }
  if (!sig || !verifyProxySignature(targetUrl, sig)) {
    return res.status(403).send("Assinatura inválida");
  }
  if (!isAnidigitalCdnUrl(targetUrl) || isServerBlacklisted(targetUrl)) {
    return res.status(403).send("Host não permitido");
  }

  try {
    const parsedHost = new URL(targetUrl).hostname;
    if (await isPrivateOrLocalHost(parsedHost)) {
      return res.status(403).send("Host privado não permitido");
    }
  } catch {
    return res.status(400).send("URL inválida");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  req.once("close", () => controller.abort());

  try {
    const upstream = await fetch(targetUrl, {
      headers: { "User-Agent": STREAM_USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      return res.status(502).send(`Upstream HTTP ${upstream.status}`);
    }

    const text = await upstream.text();
    const trimmed = text.trimStart();
    if (!trimmed.startsWith("#EXTM3U") || trimmed.startsWith("<")) {
      return res.status(502).send("Manifesto HLS inválido");
    }

    const rewritten = rewriteAnidigitalPlaylist(text, targetUrl);
    res.status(200);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache");
    return res.send(rewritten);
  } catch {
    clearTimeout(timer);
    if (!res.headersSent) {
      return res.status(502).send("Manifest fetch error");
    }
  }
});

/**
 * GET /api/anidigital-proxy-iframe
 * HTML wrapper com <video> + hls.js e protocolo postMessage WATCHPLAY
 * para a NetflixPlayerSkin (mesmo contrato do /api/saimo-proxy-iframe).
 * Resolve o titulo no animesdigital (busca → episodio → iframe → m3u8).
 */
anidigitalRouter.get("/api/anidigital-proxy-iframe", async (req: Request, res: Response) => {
  const name = String(req.query.name || "").trim();
  const type = String(req.query.type || "movie") === "tv" ? "tv" : "movie";
  const season = req.query.s !== undefined ? Number(req.query.s) : undefined;
  const episode = req.query.e !== undefined ? Number(req.query.e) : undefined;
  const audio = String(req.query.audio || "leg").toLowerCase() === "dub" ? "dub" : "leg";
  const tmdbId = req.query.tmdb_id !== undefined ? Number(req.query.tmdb_id) : undefined;
  const rawT = Number(req.query.t);
  const initialTime = Number.isFinite(rawT) && rawT > 0 ? rawT : 0;

  if ((!tmdbId || !Number.isFinite(tmdbId)) && (!name || name.length < 2)) {
    return res.status(400).send("Nome ou tmdb_id inválido");
  }

  const resolution = await resolveAnidigitalStream({ name, type, season, episode, audio, tmdbId });

  if (!resolution.m3u8) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
      <body>
        <div style="text-align:center;"><h2>Conteúdo Indisponível</h2><p>Título não encontrado no catálogo AnimesDigital.</p></div>
        <script>
          try {
            if (window.parent !== window) {
              window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "AnimesDigital: título não encontrado na busca" }, "*");
            }
          } catch(e) {}
        </script>
      </body></html>
    `);
  }

  const u = encodeURIComponent(resolution.m3u8);
  const sig = signProxyUrl(resolution.m3u8);
  const streamUrl = `/api/anidigital-stream?u=${u}&sig=${sig}`;
  const html = buildAnidigitalWrapperHtml(streamUrl, initialTime, audio);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ── Harness de simulação (dev only) ──────────────────────────────────
// Serve a build da skin Netflix real de scratch/anidigital-sim/ quando
// presente (construída por scripts/build-anidigital-sim.cjs). Em
// produção os arquivos não existem e as rotas respondem 404 — peso zero.
const SIM_DIR = path.resolve(process.cwd(), "scratch/anidigital-sim");

anidigitalRouter.get("/sim/anidigital", (_req: Request, res: Response) => {
  const htmlPath = path.join(SIM_DIR, "index.html");
  if (!fs.existsSync(htmlPath)) {
    return res.status(404).send("Harness não construído — rode scripts/build-anidigital-sim.cjs");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.send(fs.readFileSync(htmlPath, "utf-8"));
});

anidigitalRouter.get("/sim/anidigital/:file", (req: Request, res: Response) => {
  const filePath = path.join(SIM_DIR, path.basename(String(req.params.file)));
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Arquivo do harness não encontrado");
  }
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".svg": "image/svg+xml",
  };
  res.setHeader("Content-Type", types[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  return res.send(fs.readFileSync(filePath));
});
