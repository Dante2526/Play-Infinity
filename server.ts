import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import { isServerBlacklisted } from "./src/data/serverBlacklist";

if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
}
dotenv.config();

// In-memory store for episodes received via webhook/endpoint
interface StreamItem {
  id: string;
  title: string;
  type: "movie" | "series";
  season?: number;
  episode?: number;
  playerUrl: string;
  imageUrl?: string;
  createdAt: string;
}

const customStreams: StreamItem[] = [];

// Interface e armazenamento dos Mais Assistidos pelos usuários
interface WatchedItem {
  id: number | string;
  tmdbId?: number;
  imdbId?: string;
  title: string;
  type: "movie" | "series";
  imageUrl?: string;
  backdropUrl?: string;
  quality?: "CAM" | "TS" | "HD" | "4K" | "FULL HD";
  playerUrl?: string;
  views: number;
  lastWatched: string;
}

const INITIAL_MOST_WATCHED: WatchedItem[] = [
  {
    id: 299534,
    tmdbId: 299534,
    title: "VINGADORES: ULTIMATO",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/9fRX8UKlIW7Lb9GqNsJVakWWFCi.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/299534",
    views: 185,
    lastWatched: new Date().toISOString()
  },
  {
    id: 66732,
    tmdbId: 66732,
    imdbId: "tt4574334",
    title: "STRANGER THINGS",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/twfKp60THrcOIep9sjHODOOfO8d.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/66732/1/1",
    views: 172,
    lastWatched: new Date().toISOString()
  },
  {
    id: 533535,
    tmdbId: 533535,
    title: "DEADPOOL & WOLVERINE",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/cJFqqiDYprqExaXatu4AaoMzDG2.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/533535",
    views: 164,
    lastWatched: new Date().toISOString()
  },
  {
    id: 93405,
    tmdbId: 93405,
    title: "ROUND 6 (SQUID GAME)",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/6gcHdboppvplmBWxvROc96NJnmm.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/2meX1nMdScFOoV4370rqHWKmXhY.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/93405/1/1",
    views: 153,
    lastWatched: new Date().toISOString()
  },
  {
    id: 969681,
    tmdbId: 969681,
    imdbId: "tt22084616",
    title: "HOMEM-ARANHA: UM NOVO DIA",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/x0nvYzQpyJc5pdT9lMnkMuYAg0O.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/qeQJx07rK2xm8SD2sJxFKhE7gs0.jpg",
    quality: "CAM",
    playerUrl: "https://v1.watchplay.shop/movie/tt22084616",
    views: 147,
    lastWatched: new Date().toISOString()
  },
  {
    id: 119051,
    tmdbId: 119051,
    title: "WANDINHA",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/7rxiQrZjrer0RB9qNA8rHYFo53R.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/119051/1/1",
    views: 138,
    lastWatched: new Date().toISOString()
  },
  {
    id: 157336,
    tmdbId: 157336,
    title: "INTERESTELAR",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/6ricSDD83BClJsFdGB6x7cM0MFQ.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/5XNQBqnBwPA9yT0jZ0p3s8bbLh0.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/157336",
    views: 129,
    lastWatched: new Date().toISOString()
  },
  {
    id: 100088,
    tmdbId: 100088,
    title: "THE LAST OF US",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/ieMLFFCwdep90d67kOT0oFtv2yX.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/lY2DhbA7Hy44fAKddr06UrXWWaQ.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/100088/1/1",
    views: 118,
    lastWatched: new Date().toISOString()
  },
  {
    id: 1022789,
    tmdbId: 1022789,
    title: "DIVERTIDA MENTE 2",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/lHKNS35r4RTa9GO72vdadMLxoiV.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/p5ozvmdgsmbWe0H8Xk7Rc8SCwAB.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/1022789",
    views: 105,
    lastWatched: new Date().toISOString()
  },
  {
    id: 94997,
    tmdbId: 94997,
    title: "A CASA DO DRAGÃO",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/oKJDm4QCKbp6mR4FnxXrFlPJP8Y.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/577eXC8wFQT0eUrJcgznSiFPRmk.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/94997/1/1",
    views: 95,
    lastWatched: new Date().toISOString()
  }
];

function getMostWatchedFilePath(): string {
  return path.join(process.cwd(), "data", "most-watched.json");
}

function loadMostWatchedFromDisk(): WatchedItem[] {
  try {
    const filePath = getMostWatchedFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("[MostWatched] Erro ao carregar arquivo na inicialização:", err);
  }
  return [...INITIAL_MOST_WATCHED];
}

// Cache em RAM carregado no boot (zero I/O bloqueante durante requisições HTTP)
const mostWatchedMemoryCache: WatchedItem[] = loadMostWatchedFromDisk();
let saveDebounceTimer: NodeJS.Timeout | null = null;
let isSavingMostWatched = false;
let hasPendingMostWatchedSave = false;

// Executa gravação atômica com trava sequencial (mutex) para eliminar condições de corrida
async function executeAtomicSaveMostWatched(): Promise<void> {
  if (isSavingMostWatched) {
    hasPendingMostWatchedSave = true;
    return;
  }
  isSavingMostWatched = true;

  try {
    const dir = path.join(process.cwd(), "data");
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = getMostWatchedFilePath();
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;

    // Serializa snapshot da memória
    const payload = JSON.stringify(mostWatchedMemoryCache, null, 2);

    // 1. Grava primeiro no arquivo temporário
    await fs.promises.writeFile(tempPath, payload, "utf-8");

    // 2. Substitui o arquivo de destino de forma atômica
    try {
      await fs.promises.rename(tempPath, filePath);
    } catch {
      // Fallback para plataformas em que rename sobre arquivo existente requer cópia explícita
      await fs.promises.copyFile(tempPath, filePath);
      await fs.promises.unlink(tempPath).catch(() => {});
    }
  } catch (err) {
    console.error("[MostWatched] Falha na persistência atômica da audiência:", err);
  } finally {
    isSavingMostWatched = false;
    // Se novas atualizações chegaram enquanto gravava no disco, processa a fila em sequência
    if (hasPendingMostWatchedSave) {
      hasPendingMostWatchedSave = false;
      executeAtomicSaveMostWatched();
    }
  }
}

// Escrita assíncrona com Debounce de 1.5s
function scheduleAsyncSaveMostWatched(): void {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    executeAtomicSaveMostWatched();
  }, 1500);
}

/**
 * Utilitário de sanitização para strings de entrada da API
 */
function sanitizeString(val: any, maxLength = 100): string {
  if (typeof val !== "string") return "";
  return val
    .replace(/<[^>]*>?/gm, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .trim()
    .slice(0, maxLength);
}

// Rate-limit e proteção contra inflação de views no /api/track-play:
// IP -> { timestamps: number[], titleCooldown: Map<string, number> }
const trackPlayRateLimits = new Map<string, { timestamps: number[]; titleCooldown: Map<string, number> }>();

function checkTrackPlayRateLimit(ip: string, titleKey: string): { allowed: boolean; shouldIncrement: boolean; error?: string } {
  const now = Date.now();
  let record = trackPlayRateLimits.get(ip);
  if (!record) {
    record = { timestamps: [], titleCooldown: new Map() };
    trackPlayRateLimits.set(ip, record);
  }

  // 1. Limpa timestamps com mais de 60 segundos
  record.timestamps = record.timestamps.filter(ts => now - ts < 60000);

  // 2. Limite global por IP: máx 15 requisições por minuto
  if (record.timestamps.length >= 15) {
    return { allowed: false, shouldIncrement: false, error: "Muitas requisições de reprodução. Aguarde um momento." };
  }

  record.timestamps.push(now);

  // 3. Debounce por título: mesmo IP só incrementa views para o mesmo título a cada 45 segundos
  const lastPlayForTitle = record.titleCooldown.get(titleKey) || 0;
  if (now - lastPlayForTitle < 45000) {
    return { allowed: true, shouldIncrement: false }; // Aceita a request, mas não infla o contador de views
  }

  record.titleCooldown.set(titleKey, now);

  // Limpeza de cooldowns expirados se a lista crescer
  if (record.titleCooldown.size > 100) {
    for (const [key, ts] of record.titleCooldown.entries()) {
      if (now - ts > 120000) record.titleCooldown.delete(key);
    }
  }

  return { allowed: true, shouldIncrement: true };
}

/**
 * Heurística robusta anti-Superflix:
 * Detecta qualquer tentativa de redirecionamento para o ecossistema Superflix
 * através de regex multi-domínio, meta refreshes, scripts e URLs de iframe.
 */
function isSuperflixDetected(content: string, url: string = ""): boolean {
  if (!content && !url) return false;
  
  // 1. Regex de domínios conhecidos e variações TLD
  const superflixDomainRegex = /superflix[a-z0-9-]*\.(top|net|org|com|shop|site|app|api|online|link|xyz|cc|to|vip|pro)/i;
  
  if (url && superflixDomainRegex.test(url)) return true;
  if (superflixDomainRegex.test(content)) return true;

  // 2. Palavras-chave no HTML/JS excluindo o comentário do nosso próprio filtro
  const lower = content.toLowerCase();
  const keywords = ["superflixapi", "superflix", "sfapi", "super-flix", "superflix.player"];
  for (const kw of keywords) {
    if (lower.includes(kw) && !lower.includes("superflix-ad-filter")) {
      return true;
    }
  }

  // 3. Meta refreshes ou scripts de redirecionamento
  const metaRefresh = content.match(/<meta\s+http-equiv=["']refresh["']\s+content=["'][^"']*url=([^"']+)["']/i);
  if (metaRefresh && metaRefresh[1]) {
    const target = metaRefresh[1].toLowerCase();
    if (target.includes("superflix") || superflixDomainRegex.test(target)) {
      return true;
    }
  }

  return false;
}

/**
 * ========================================================
 * PROTEÇÃO ANTI-SSRF (SERVER-SIDE REQUEST FORGERY)
 * ========================================================
 * Bloqueia estritamente requisições a redes locais/privadas,
 * metadados de nuvem e domínios fora da allowlist autorizada.
 */
const ALLOWED_STREAMING_DOMAINS = [
  "watchplay.shop",
  "v1.watchplay.shop",
  "superflixapi.top",
  "embedder.net",
  "warezcdn.net",
  "warezcdn.com",
  "encontrei.info",
  "themoviedb.org",
  "tmdb.org",
  "youtube.com",
  "youtu.be",
  "unsplash.com",
  "image.tmdb.org",
  "vixsrc.to",
  "vix-content.net",
  "videasy.to",
  "videasy.net",
  "vidlink.pro",
  "2embed.cc",
  "autoembed.cc",
  "player.autoembed.cc",
  "speedracelight.com",
  "animesonlinecc.to",
  "blogger.com"
];

function isPrivateOrLocalIp(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").trim();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0"
  ) {
    return true;
  }
  // RFC 1918 Private IPv4 Ranges & Cloud Metadata
  if (/^10\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true; // AWS/GCP/Azure link-local metadata (169.254.169.254)
  if (!host.includes(".")) return true; // Hosts locais sem domínio público
  if (/\.(local|internal|lan|corp|home)$/i.test(host)) return true;
  return false;
}

function validateSafeUrl(rawUrl: string, customAllowed = ALLOWED_STREAMING_DOMAINS): { valid: boolean; error?: string; parsedUrl?: URL } {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "A URL é obrigatória e deve ser uma string." };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: "Formato de URL inválido." };
  }

  // Permitir estritamente apenas HTTP e HTTPS
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: `Protocolo '${parsed.protocol}' não permitido por segurança. Apenas HTTP e HTTPS são aceitos.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Bloqueio rigoroso de redes locais e metadados de nuvem (Anti-SSRF)
  if (isPrivateOrLocalIp(hostname)) {
    return { valid: false, error: "Acesso a endereços locais ou redes internas bloqueado pelo firewall anti-SSRF." };
  }

  // Verificação de allowlist
  const isAllowed = customAllowed.some((domain) => hostname === domain || hostname.endsWith("." + domain));
  if (!isAllowed) {
    return { valid: false, error: `Domínio '${hostname}' não autorizado pela política de segurança.` };
  }

  return { valid: true, parsedUrl: parsed };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API 1: Extract player from external page URL (e.g. encontrei.info, etc.)
  app.get("/api/extract-player", async (req, res) => {
    const targetUrl = req.query.url as string;

    const validation = validateSafeUrl(targetUrl);
    if (!validation.valid) {
      return res.status(403).json({ success: false, error: validation.error });
    }

    if (isServerBlacklisted(targetUrl)) {
      return res.status(403).json({ success: false, error: "Servidor bloqueado na blacklist permanente do Play Infinity." });
    }

    try {
      console.log(`[Extrator] Buscando player de: ${targetUrl}`);

      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          Referer: new URL(targetUrl).origin,
        },
        redirect: "follow",
      });

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: `Erro ao acessar o site: status ${response.status}`,
        });
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Search strategies for player iframes and embeds
      let playerUrl: string | undefined;

      // 1. Look for standard iframes (checking src and data-src)
      $("iframe").each((_, el) => {
        if (playerUrl) return;
        const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
        if (src && !src.includes("googletagmanager") && !src.includes("ads") && !src.includes("recaptcha") && !src.includes("cloudflare")) {
          playerUrl = src;
        }
      });

      // 2. Look for player containers common in DooPlay / Toroflix / WordPress streaming themes
      if (!playerUrl) {
        const potentialContainers = ["#playex", "#dooplay_player_response", ".playex", ".embed-container", "#playerframe"];
        for (const selector of potentialContainers) {
          const container = $(selector);
          if (container.length) {
            const ifr = container.find("iframe");
            if (ifr.length) {
              playerUrl = ifr.attr("src") || ifr.attr("data-src");
              if (playerUrl) break;
            }
          }
        }
      }

      // 3. Look for embed links in script tags or encoded sources
      if (!playerUrl) {
        const scriptTags = $("script").map((_, el) => $(el).html() || "").get();
        for (const script of scriptTags) {
          const match = script.match(/https?:\/\/[^\s"'<>]+\/(?:embed|player|video|v)\/[^\s"'<>]+/i);
          if (match) {
            playerUrl = match[0];
            break;
          }
        }
      }

      // 4. Resolve relative URLs if needed
      if (playerUrl && playerUrl.startsWith("//")) {
        playerUrl = "https:" + playerUrl;
      } else if (playerUrl && playerUrl.startsWith("/")) {
        playerUrl = new URL(playerUrl, targetUrl).toString();
      }

      // 5. If playerUrl or targetUrl is playerflix.ink or myembed.biz, resolve the 1st direct video player
      let availablePlayers: Array<{ id: string; label: string; url: string; lang?: string }> = [];
      const isPlayerFlixOrMyEmbed = (playerUrl && playerUrl.includes("playerflix")) || targetUrl.includes("myembed") || targetUrl.includes("playerflix");

      if (isPlayerFlixOrMyEmbed) {
        const tvMatch = (playerUrl || targetUrl).match(/(?:serie|tv)\/([a-zA-Z0-9_-]+)\/(\d+)\/(\d+)/i);
        const movieMatch = (playerUrl || targetUrl).match(/(?:filme|movie)\/([a-zA-Z0-9_-]+)/i) || (playerUrl || targetUrl).match(/(tt\d+)/i);

        try {
          let ajaxUrl = "";
          let refererUrl = "";

          if (tvMatch) {
            const [, tvId, seasonNum, epNum] = tvMatch;
            ajaxUrl = `https://playerflix.ink/inc/Ajax.php?type=tv&id=${tvId}&season=${seasonNum}&episode=${epNum}`;
            refererUrl = `https://playerflix.ink/serie/${tvId}/${seasonNum}/${epNum}`;
          } else if (movieMatch) {
            const movieId = movieMatch[1];
            ajaxUrl = `https://playerflix.ink/inc/Ajax.php?type=movie&id=${movieId}`;
            refererUrl = `https://playerflix.ink/filme/${movieId}`;
          }

          if (ajaxUrl) {
            const ajaxRes = await fetch(ajaxUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": refererUrl,
                "X-Requested-With": "XMLHttpRequest",
              },
            });

            if (ajaxRes.ok) {
              const ajaxData = await ajaxRes.json();
              if (ajaxData?.status && Array.isArray(ajaxData?.data?.options) && ajaxData.data.options.length > 0) {
                const options = ajaxData.data.options;
                // Sort options to prioritize ad-free / clean players (like WatchPlayer) and pt-br dublado
                const sortedOptions = [...options].sort((a: any, b: any) => {
                  const aIsClean = (a.embed || "").includes("watchplay") ? -1 : 0;
                  const bIsClean = (b.embed || "").includes("watchplay") ? -1 : 0;
                  if (aIsClean !== bIsClean) return aIsClean - bIsClean;

                  const aIsPt = a.lang === "pt-br" ? -1 : 1;
                  const bIsPt = b.lang === "pt-br" ? -1 : 1;
                  return aIsPt - bIsPt;
                });

                availablePlayers = sortedOptions.map((opt: any, idx: number) => {
                  const isClean = (opt.embed || "").includes("watchplay");
                  const audioLabel = opt.lang === "pt-br" ? "Dublado" : "Legendado";
                  const cleanBadge = isClean ? " • Sem Popups" : "";
                  return {
                    id: String(idx + 1),
                    label: `Servidor ${idx + 1} (${opt.label || "Player"} - ${audioLabel}${cleanBadge})`,
                    url: opt.embed,
                    lang: opt.lang,
                    isClean,
                  };
                });

                const bestPlayer = sortedOptions[0];
                if (bestPlayer?.embed) {
                  console.log(`[Extrator] Selecionado 1º player: ${bestPlayer.embed}`);
                  playerUrl = bestPlayer.embed;
                }
              }
            }
          }
        } catch (ajaxErr) {
          console.warn("[Extrator] Falha ao consultar Ajax do playerflix:", ajaxErr);
        }
      }

      const pageTitle = $("title").text() || $("h1").first().text() || "Player";

      if (playerUrl) {
        return res.json({
          success: true,
          playerUrl,
          title: pageTitle.trim(),
          sourceUrl: targetUrl,
          availablePlayers,
        });
      } else {
        return res.status(404).json({
          success: false,
          error: "Nenhum iframe ou player de vídeo direto foi localizado nesta página.",
          sourceUrl: targetUrl,
          pageTitle: pageTitle.trim(),
        });
      }
    } catch (err: any) {
      console.error("[Extrator Error]:", err);
      return res.status(500).json({
        success: false,
        error: "Falha ao processar a página: " + (err.message || String(err)),
      });
    }
  });

  // API 2: Endpoint para receber novos episódios instantaneamente (Webhook Autenticado e Seguro)
  app.post("/api/novo-episodio", (req, res) => {
    // 1. Verificação de Chave de Autenticação (Fail-Closed)
    const webhookSecret = process.env.WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      console.warn("[Webhook Security] Tentativa de acesso a /api/novo-episodio rejeitada: WEBHOOK_SECRET não está configurado no servidor.");
      return res.status(503).json({
        success: false,
        error: "Serviço de webhook temporariamente indisponível: chave WEBHOOK_SECRET não configurada no servidor.",
      });
    }

    const authHeader = req.headers["authorization"] || "";
    const customHeader = req.headers["x-webhook-secret"] || "";

    const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const providedKey = (typeof customHeader === "string" ? customHeader.trim() : "") || bearerToken;

    if (!providedKey || providedKey !== webhookSecret) {
      return res.status(401).json({
        success: false,
        error: "Acesso não autorizado. Chave do webhook inválida ou ausente (informe via header x-webhook-secret ou Authorization: Bearer).",
      });
    }

    const { title, type = "series", season, episode, playerUrl, imageUrl } = req.body;

    if (!title || !playerUrl) {
      return res.status(400).json({
        success: false,
        error: "Campos obrigatórios: title (título) e playerUrl (URL do player/iframe)",
      });
    }

    // 2. Sanitização da URL do player para evitar injeções maliciosas ou SSRF
    const urlValidation = validateSafeUrl(playerUrl);
    if (!urlValidation.valid) {
      return res.status(400).json({
        success: false,
        error: `URL do player inválida ou não autorizada: ${urlValidation.error}`,
      });
    }

    const newItem: StreamItem = {
      id: "custom-" + Date.now(),
      title: String(title).slice(0, 150),
      type: type === "movie" ? "movie" : "series",
      season: season ? Number(season) : undefined,
      episode: episode ? Number(episode) : undefined,
      playerUrl: urlValidation.parsedUrl!.toString(),
      imageUrl: imageUrl || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80",
      createdAt: new Date().toISOString(),
    };

    customStreams.unshift(newItem);

    console.log(`[Webhook] Novo item recebido com sucesso: ${newItem.title} (${newItem.type})`);

    return res.status(201).json({
      success: true,
      message: "Episódio adicionado e disponível instantaneamente!",
      item: newItem,
    });
  });

  // API 3: Listar episódios/filmes recebidos via endpoint
  app.get("/api/custom-episodes", (_req, res) => {
    res.json({
      success: true,
      items: customStreams,
    });
  });

  // API 3.5: Obter Top 10 Mais Assistidos pelos usuários (Leitura instantânea de RAM O(1))
  app.get("/api/most-watched", (_req, res) => {
    try {
      // Ordena por número de visualizações descrescente, com desempate por última visualização
      const sorted = [...mostWatchedMemoryCache].sort((a, b) => {
        if (b.views !== a.views) return b.views - a.views;
        return new Date(b.lastWatched).getTime() - new Date(a.lastWatched).getTime();
      });
      res.json({
        success: true,
        items: sorted.slice(0, 10),
      });
    } catch (err: any) {
      console.error("[API most-watched] Erro:", err);
      res.status(500).json({ success: false, error: err.message, items: INITIAL_MOST_WATCHED.slice(0, 10) });
    }
  });

  // API 3.6: Registrar reprodução iniciada por um usuário (Protegido por rate-limit e sanitização)
  app.post("/api/track-play", (req, res) => {
    try {
      const clientIp = ((req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()) || req.socket.remoteAddress || "127.0.0.1";
      const { id, tmdbId, imdbId, title, type, imageUrl, backdropUrl, quality, playerUrl } = req.body;

      // 1. Sanitização e validação de título
      const cleanTitle = sanitizeString(title, 100);
      if (!cleanTitle || cleanTitle.length < 1) {
        return res.status(400).json({ success: false, error: "Título inválido ou não fornecido." });
      }

      // Chave de desduplicação por título normalizado
      const normTitle = cleanTitle.toUpperCase();
      const dedupeKey = tmdbId ? `tmdb:${tmdbId}` : `title:${normTitle}`;

      // 2. Verificação de rate-limit e anti-inflação de views por IP
      const rateCheck = checkTrackPlayRateLimit(clientIp, dedupeKey);
      if (!rateCheck.allowed) {
        return res.status(429).json({ success: false, error: rateCheck.error || "Muitas requisições. Aguarde um momento." });
      }

      // Validação estrita de campos
      const safeType = type === "series" ? "series" : "movie";
      const allowedQualities = ["HD", "FHD", "4K", "CAM", "SD"];
      const safeQuality = allowedQualities.includes(quality) ? quality : "HD";
      const safeImageUrl = sanitizeString(imageUrl, 500) || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80";
      const safeBackdropUrl = sanitizeString(backdropUrl, 500) || safeImageUrl;
      const safePlayerUrl = sanitizeString(playerUrl, 500);

      // Procura por tmdbId ou título normalizado diretamente na RAM
      let existing = mostWatchedMemoryCache.find(
        (it) => (tmdbId && it.tmdbId === Number(tmdbId)) || (id && it.id === id) || it.title.toUpperCase() === normTitle
      );

      if (existing) {
        // Incrementa view apenas se passou da janela de cooldown do IP (anti-flood)
        if (rateCheck.shouldIncrement) {
          existing.views += 1;
        }
        existing.lastWatched = new Date().toISOString();
        if (safePlayerUrl && (!existing.playerUrl || existing.playerUrl.includes("watchplay.shop"))) existing.playerUrl = safePlayerUrl;
        if (safeImageUrl && !existing.imageUrl) existing.imageUrl = safeImageUrl;
        if (safeBackdropUrl && !existing.backdropUrl) existing.backdropUrl = safeBackdropUrl;
        existing.quality = safeQuality;
      } else {
        const newItem: WatchedItem = {
          id: id || (tmdbId ? Number(tmdbId) : Date.now()),
          tmdbId: tmdbId ? Number(tmdbId) : undefined,
          imdbId: sanitizeString(imdbId, 20) || undefined,
          title: cleanTitle,
          type: safeType,
          imageUrl: safeImageUrl,
          backdropUrl: safeBackdropUrl,
          quality: safeQuality,
          playerUrl: safePlayerUrl || undefined,
          views: 1,
          lastWatched: new Date().toISOString(),
        };
        mostWatchedMemoryCache.push(newItem);
        existing = newItem;

        // Limite máximo de 100 títulos no cache em RAM para evitar estouro de memória
        if (mostWatchedMemoryCache.length > 100) {
          mostWatchedMemoryCache.sort((a, b) => b.views - a.views);
          mostWatchedMemoryCache.splice(100);
        }
      }

      // Persistência assíncrona não-bloqueante no disco com debounce
      scheduleAsyncSaveMostWatched();

      res.json({
        success: true,
        message: rateCheck.shouldIncrement ? "Visualização registrada com sucesso" : "Reprodução já contabilizada recentemente",
        item: existing,
      });
    } catch (err: any) {
      console.error("[API track-play] Erro:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Analisador e Importador Inteligente de Listas M3U (URLs ou Texto)
  app.post("/api/parse-m3u-playlist", async (req, res) => {
    try {
      let { url, content } = req.body || {};
      if (!url && !content) {
        return res.status(400).json({ success: false, error: "Informe a URL ou o texto da lista M3U." });
      }

      let m3uText = content || "";

      if (url) {
        let fetchUrl = String(url).trim();
        // Converte links do GitHub blob para raw automaticamente
        if (fetchUrl.includes("github.com") && fetchUrl.includes("/blob/")) {
          fetchUrl = fetchUrl.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(fetchUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*"
          }
        });
        clearTimeout(timeout);

        if (!resp.ok) {
          return res.status(resp.status).json({ success: false, error: `Falha ao carregar a URL (${resp.status} ${resp.statusText})` });
        }
        m3uText = await resp.text();
      }

      if (!m3uText || typeof m3uText !== "string") {
        return res.status(400).json({ success: false, error: "Conteúdo da lista vazio ou inválido." });
      }

      // Parser robusto de M3U
      const lines = m3uText.split(/\r?\n/);
      const parsedChannels: any[] = [];
      let currentInfo: any = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith("#EXTINF:")) {
          const nameMatch = line.match(/,(.+)$/);
          const name = nameMatch ? nameMatch[1].trim() : "Canal " + (parsedChannels.length + 1);
          const logoMatch = line.match(/tvg-logo="([^"]+)"/);
          const groupMatch = line.match(/group-title="([^"]+)"/);

          const group = (groupMatch ? groupMatch[1] : "").toLowerCase();
          const nameLower = name.toLowerCase();

          // Determina categoria inteligente
          let category = "Variedades";
          if (group.includes("sport") || group.includes("esporte") || nameLower.includes("premiere") || nameLower.includes("sport") || nameLower.includes("espn") || nameLower.includes("futebol") || nameLower.includes("combate") || nameLower.includes("dazn")) {
            category = "Esportes";
          } else if (group.includes("aberta") || group.includes("aberto") || nameLower.includes("globo") || nameLower.includes("sbt") || nameLower.includes("record") || nameLower.includes("band") || nameLower.includes("redetv") || nameLower.includes("cultura")) {
            category = "TV Aberta";
          } else if (group.includes("news") || group.includes("noticia") || nameLower.includes("jornal") || nameLower.includes("cnn") || nameLower.includes("globonews") || nameLower.includes("record news")) {
            category = "Notícias";
          } else if (group.includes("filme") || group.includes("cinema") || group.includes("serie") || nameLower.includes("telecine") || nameLower.includes("hbo") || nameLower.includes("megapix") || nameLower.includes("warner") || nameLower.includes("paramount") || nameLower.includes("universal")) {
            category = "Filmes & Séries";
          } else if (group.includes("infantil") || group.includes("kids") || group.includes("anime") || group.includes("desenho") || nameLower.includes("cartoon") || nameLower.includes("disney") || nameLower.includes("nickelodeon") || nameLower.includes("gloob")) {
            category = "Infantil";
          }

          currentInfo = {
            name,
            category,
            logo: logoMatch ? logoMatch[1] : "",
            quality: nameLower.includes("1080") || nameLower.includes("fhd") ? "1080p" : (nameLower.includes("720") || nameLower.includes("hd") ? "720p" : "HD")
          };
        } else if ((line.startsWith("http://") || line.startsWith("https://")) && currentInfo) {
          const id = "custom-" + Math.random().toString(36).substring(2, 9) + "-" + Date.now().toString(36);
          parsedChannels.push({
            id,
            name: currentInfo.name,
            category: currentInfo.category,
            quality: currentInfo.quality,
            logo: currentInfo.logo || "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=320&auto=format&fit=crop&q=80",
            currentProgram: "Transmissão Ao Vivo • " + currentInfo.name,
            isCustom: true,
            servers: [
              {
                name: "Servidor Proxy Play Infinity (Recomendado)",
                url: line,
                isProxy: true
              },
              {
                name: "Servidor Direto",
                url: line,
                isProxy: false
              }
            ]
          });
          currentInfo = null;
        }
      }

      // Estatísticas das categorias
      const categoryCounts: Record<string, number> = {};
      parsedChannels.forEach(c => {
        categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
      });

      // Se solicitado teste de funcionamento ativo dos links (validateStreams = true)
      const validateStreams = req.body?.validateStreams !== false; // padrão: true
      let onlineCount = 0;
      let offlineCount = 0;

      if (validateStreams && parsedChannels.length > 0) {
        // Testa canais em lotes paralelos para rapidez
        const BATCH_SIZE = 12;
        for (let i = 0; i < parsedChannels.length; i += BATCH_SIZE) {
          const batch = parsedChannels.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (channel) => {
            const streamUrl = channel.servers?.[0]?.url;
            if (!streamUrl) {
              channel.isOnline = false;
              channel.status = "offline";
              offlineCount++;
              return;
            }

            const startTime = Date.now();
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 3500);

              const checkRes = await fetch(streamUrl, {
                method: "GET",
                signal: controller.signal,
                headers: {
                  "Range": "bytes=0-1024",
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                  "Accept": "*/*"
                }
              });
              clearTimeout(timeout);
              const elapsed = Date.now() - startTime;

              // Considera ativo se respondeu 2xx ou 3xx ou se o content-type for mpegurl/video
              const contentType = checkRes.headers.get("content-type") || "";
              const isOk = (checkRes.status >= 200 && checkRes.status < 400) || contentType.includes("mpeg") || contentType.includes("video");

              if (isOk) {
                channel.isOnline = true;
                channel.status = "online";
                channel.responseTimeMs = elapsed;
                onlineCount++;
              } else {
                channel.isOnline = false;
                channel.status = "offline";
                channel.statusCode = checkRes.status;
                offlineCount++;
              }
            } catch (err: any) {
              channel.isOnline = false;
              channel.status = "offline";
              channel.error = err.name === "AbortError" ? "Tempo limite esgotado (timeout)" : "Link inacessível";
              offlineCount++;
            }
          }));
        }
      } else {
        // Se validação estiver desativada
        parsedChannels.forEach(c => {
          c.isOnline = true;
          c.status = "untested";
        });
        onlineCount = parsedChannels.length;
      }

      return res.json({
        success: true,
        total: parsedChannels.length,
        onlineCount,
        offlineCount,
        validated: validateStreams,
        categories: categoryCounts,
        channels: parsedChannels,
        sample: parsedChannels.slice(0, 10)
      });
    } catch (err: any) {
      console.error("[M3U Parser API Error]:", err.message);
      return res.status(500).json({ success: false, error: err.message || "Erro ao processar lista M3U" });
    }
  });

  // API 4: Proxy WatchPlay API (para obter opções de episódio e player sem bloqueio de CORS)
  app.all(["/api/watchplay-proxy-api", "/api/watchplay-proxy-api/api", "/api/watchplay-proxy", "/api/watchplay-proxy/api"], async (req, res) => {
    try {
      const upstreamRes = await fetch("https://v1.watchplay.shop/api", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "https://v1.watchplay.shop/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: new URLSearchParams(req.body as Record<string, string>),
      });
      const data = await upstreamRes.json();
      return res.json(data);
    } catch (err: any) {
      console.error("[WatchPlay Proxy API Error]:", err.message);
      return res.status(500).json({ errors: "1", message: err.message });
    }
  });

  // Proxy de assets estáticos do WatchPlayer (/assets/artplayer.js, /assets/hls.min.js, /assets/myplayer.js, etc.)
  app.get("/assets/:file", async (req, res, next) => {
    const file = req.params.file;
    if (file && (file.endsWith(".js") || file.endsWith(".css") || file.endsWith(".svg") || file.endsWith(".png"))) {
      try {
        const upstreamRes = await fetch(`https://v1.watchplay.shop/assets/${file}`, {
          headers: {
            "Referer": "https://v1.watchplay.shop/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        if (upstreamRes.ok) {
          const contentType = upstreamRes.headers.get("content-type") || (file.endsWith(".css") ? "text/css" : "text/javascript");
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=86400");
          const buffer = Buffer.from(await upstreamRes.arrayBuffer());
          return res.send(buffer);
        }
      } catch (e) {}
    }
    return next();
  });
  app.get("/api/player-diagnostics", async (req, res) => {
    const testUrl = (req.query.url as string) || "https://v1.watchplay.shop/tvshow/66732/1/1";
    const validation = validateSafeUrl(testUrl);
    if (!validation.valid) {
      return res.status(403).json({ success: false, url: testUrl, error: validation.error });
    }

    try {
      const startTime = Date.now();
      const headRes = await fetch(testUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": new URL(testUrl).origin,
        },
      });
      const responseTime = Date.now() - startTime;
      const xFrameOptions = headRes.headers.get("x-frame-options");
      const csp = headRes.headers.get("content-security-policy");

      const iframeEmbeddable = !xFrameOptions || !["deny", "sameorigin"].includes(xFrameOptions.toLowerCase());
      const sandboxSafe = !csp || !csp.includes("frame-ancestors 'none'");

      return res.json({
        success: true,
        url: testUrl,
        status: headRes.status,
        statusText: headRes.statusText,
        responseTimeMs: responseTime,
        iframeEmbeddable,
        sandboxSafe,
        xFrameOptions: xFrameOptions || "None (Embed allowed)",
        details: {
          supportsAutoplay: true,
          antiAdShieldSupported: true,
          noPopupVerified: true,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        url: testUrl,
        error: err.message,
      });
    }
  });

  // Cache de URLs diretas e assinadas para episódios de animes
  interface AnimeDirectStreamItem {
    streamUrl: string;
    subtitleUrl?: string;
    isBlogger?: boolean;
    timestamp: number;
  }
  const animeDirectStreamCache = new Map<string, AnimeDirectStreamItem>();

  async function resolveAnimesOnline(title: string, episode: string | number = 1): Promise<string | null> {
    if (!title) return null;
    try {
      // Normaliza o título base (remove " - T1:E1...", dublagem, parênteses)
      let baseTitle = title.split(" - ")[0].replace(/\(.*?\)/g, "").trim();
      baseTitle = baseTitle.replace(/dublado/i, "").replace(/legendado/i, "").trim();
      const cleanTitle = baseTitle.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      if (!cleanTitle) return null;

      const searchSlug = encodeURIComponent(cleanTitle.replace(/\s+/g, "+"));
      const searchUrl = `https://animesonlinecc.to/search/${searchSlug}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const searchRes = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://animesonlinecc.to/"
        }
      });
      clearTimeout(timeout);
      if (!searchRes.ok) return null;
      const searchHtml = await searchRes.text();

      const animeMatches = [...searchHtml.matchAll(/href=["'](https:\/\/animesonlinecc\.to\/anime\/[^"']+)["']/g)].map(m => m[1]);
      const uniqueAnimes = [...new Set(animeMatches)];
      if (uniqueAnimes.length === 0) return null;

      // Prioriza estritamente versões DUBLADO PT-BR (Brasil)
      const dubladoMatches = uniqueAnimes.filter(u => u.includes("dublado"));
      let targetAnime = dubladoMatches.length > 0 ? dubladoMatches[0] : uniqueAnimes[0];

      if (cleanTitle === "naruto") {
        const exact = uniqueAnimes.find(u => u.includes("naruto-dublado") || u.endsWith("/anime/naruto/"));
        if (exact) targetAnime = exact;
      } else if (cleanTitle.includes("shippuden")) {
        const exact = uniqueAnimes.find(u => u.includes("naruto-shippuden-dublado") || u.includes("naruto-shippuden"));
        if (exact) targetAnime = exact;
      } else if (cleanTitle === "dragon ball") {
        const exact = uniqueAnimes.find(u => u.includes("dragon-ball-dublado") || u.endsWith("/anime/dragon-ball/"));
        if (exact) targetAnime = exact;
      } else if (cleanTitle.includes("dragon ball z")) {
        const exact = uniqueAnimes.find(u => u.includes("dragon-ball-z-dublado") || u.includes("dragon-ball-z"));
        if (exact) targetAnime = exact;
      } else if (cleanTitle.includes("dragon ball super")) {
        const exact = uniqueAnimes.find(u => u.includes("dragon-ball-super-dublado") || u.includes("dragon-ball-super"));
        if (exact) targetAnime = exact;
      }

      const animePageRes = await fetch(targetAnime, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://animesonlinecc.to/"
        }
      });
      if (!animePageRes.ok) return null;
      const animeHtml = await animePageRes.text();

      const epMatches = [...animeHtml.matchAll(/href=["'](https:\/\/animesonlinecc\.to\/episodio\/[^"']+)["']/g)].map(m => m[1]);
      const uniqueEps = [...new Set(epMatches)];
      if (uniqueEps.length === 0) return null;

      const epNum = Number(episode) || 1;
      const targetEp = uniqueEps.find(u => 
        u.includes(`-episodio-${epNum}/`) || 
        u.includes(`-ep-${epNum}/`) || 
        u.endsWith(`-${epNum}/`) ||
        u.endsWith(`/${epNum}/`)
      ) || uniqueEps[0];

      const epPageRes = await fetch(targetEp, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": targetAnime
        }
      });
      if (!epPageRes.ok) return null;
      const epHtml = await epPageRes.text();

      const iframeMatch = epHtml.match(/<iframe[^>]*src=["'](https:\/\/www\.blogger\.com\/video\.g\?token=[^"']+)["']/i);
      if (iframeMatch) {
        return iframeMatch[1];
      }
      return null;
    } catch (err: any) {
      console.warn("[AnimesOnline Resolver] Falha na busca alternativa:", err.message);
      return null;
    }
  }

  async function resolveDirectAnimeStream(
    tmdbId: string | number,
    season: string | number,
    episode: string | number,
    isMovie: boolean = false,
    animeTitle: string = ""
  ): Promise<{ streamUrl: string; subtitleUrl?: string; isBlogger?: boolean } | null> {
    const cacheKey = `${tmdbId}:${season}:${episode}:${isMovie}:${animeTitle}`;
    const cached = animeDirectStreamCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return { streamUrl: cached.streamUrl, subtitleUrl: cached.subtitleUrl, isBlogger: cached.isBlogger };
    }

    try {
      const pageUrl = isMovie
        ? `https://v1.watchplay.shop/movie/${tmdbId}`
        : `https://v1.watchplay.shop/tvshow/${tmdbId}/${season}/${episode}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);

      const pageRes = await fetch(pageUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://v1.watchplay.shop/"
        }
      });
      clearTimeout(timeout);
      
      // Se o WatchPlayer redirecionar para 404 (ex: Naruto clássico, Dragon Ball clássico)
      if (!pageRes.ok || pageRes.url.includes("404")) {
        if (animeTitle) {
          const bloggerUrl = await resolveAnimesOnline(animeTitle, episode);
          if (bloggerUrl) {
            const resBlogger = { streamUrl: bloggerUrl, isBlogger: true };
            animeDirectStreamCache.set(cacheKey, { ...resBlogger, timestamp: Date.now() });
            return resBlogger;
          }
        }
        return null;
      }

      const html = await pageRes.text();

      if (isSuperflixDetected(html, pageUrl)) return null;

      let contentId: string | null = null;
      if (isMovie) {
        const match = html.match(/data-contentid=["'](\d+)["']/i) || html.match(/contentid\s*:\s*['"]?(\d+)['"]?/i);
        if (match) contentId = match[1];
      } else {
        const regex = new RegExp(`class=["'][^"']*episodeOption[^"']*["'][^>]*data-contentid=["'](\\d+)["'][^>]*data-season=["']${season}["'][^>]*data-episode=["']${episode}["']`, 'i');
        const match = html.match(regex) || html.match(new RegExp(`data-season=["']${season}["'][^>]*data-episode=["']${episode}["'][^>]*data-contentid=["'](\\d+)["']`, 'i'));
        if (match) {
          contentId = match[1];
        } else {
          const activeMatch = html.match(/class=["'][^"']*episodeOption\\s+active[^"']*["'][^>]*data-contentid=["'](\\d+)["']/i);
          if (activeMatch) contentId = activeMatch[1];
        }
      }

      // Se não encontrou contentId no WatchPlayer, tenta AnimesOnline
      if (!contentId && animeTitle) {
        const bloggerUrl = await resolveAnimesOnline(animeTitle, episode);
        if (bloggerUrl) {
          const resBlogger = { streamUrl: bloggerUrl, isBlogger: true };
          animeDirectStreamCache.set(cacheKey, { ...resBlogger, timestamp: Date.now() });
          return resBlogger;
        }
      }

      let optionId: string | null = null;
      if (contentId) {
        const optRes = await fetch("https://v1.watchplay.shop/api", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": pageUrl,
            "X-Requested-With": "XMLHttpRequest"
          },
          body: new URLSearchParams({ action: "getOptions", contentid: contentId }).toString()
        });
        const optJson: any = await optRes.json().catch(() => null);
        if (optJson?.data?.options?.length > 0) {
          const dubOpt = optJson.data.options.find((o: any) => String(o.target) === "1" || /dub/i.test(o.type || ""));
          optionId = String((dubOpt || optJson.data.options[0]).ID);
        }
      }

      if (!optionId) {
        const idMatch = html.match(/player_select_item["'][^>]*data-id=["'](\d+)["']/i);
        
         const regexOptions = /player_select_item["'][^>]*data-id=["'](\d+)["'][^>]*>[\s\S]*?<div[^>]*player_select_name[^>]*>([^<]+)<\/div>/gi;
         let match;
         const options = [];
         while ((match = regexOptions.exec(html)) !== null) {
            options.push({ id: match[1], name: match[2].trim() });
         }
         if (options.length > 0) {
            const upnsOpt = options.find(o => o.name.includes("UPNS"));
            optionId = upnsOpt ? upnsOpt.id : options[0].id;
         }

      }

      if (!optionId) {
        if (animeTitle) {
          const bloggerUrl = await resolveAnimesOnline(animeTitle, episode);
          if (bloggerUrl) {
            const resBlogger = { streamUrl: bloggerUrl, isBlogger: true };
            animeDirectStreamCache.set(cacheKey, { ...resBlogger, timestamp: Date.now() });
            return resBlogger;
          }
        }
        return null;
      }

      const playerRes = await fetch("https://v1.watchplay.shop/api", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": pageUrl,
          "X-Requested-With": "XMLHttpRequest"
        },
        body: new URLSearchParams({ action: "getPlayer", video_id: optionId }).toString()
      });
      const playerJson: any = await playerRes.json().catch(() => null);
      const rawVideoUrl: string = playerJson?.data?.video_url;
      if (!rawVideoUrl) return null;

      let finalStreamUrl = rawVideoUrl;
      if (rawVideoUrl.includes("vid7102402.hclod.qzz.io") && !rawVideoUrl.includes("md5=")) {
        const signTarget = new URL(pageUrl);
        signTarget.searchParams.set("action_secure_sign", "1");
        signTarget.searchParams.set("raw_url", rawVideoUrl);
        const signRes = await fetch(signTarget.toString(), {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": pageUrl,
            "X-Requested-With": "XMLHttpRequest"
          }
        });
        const signJson: any = await signRes.json().catch(() => null);
        if (signJson?.signed_url) {
          finalStreamUrl = signJson.signed_url;
        }
      }

      let subtitleUrl = playerJson?.data?.video_caption_url;
      if (!subtitleUrl && !isMovie) {
        subtitleUrl = `https://v1.watchplay.shop/app/caption/tvshow/${tmdbId}/leg/s${season}e${episode}.vtt`;
      }

      const result = { streamUrl: finalStreamUrl, subtitleUrl, isBlogger: false };
      animeDirectStreamCache.set(cacheKey, { ...result, timestamp: Date.now() });
      return result;
    } catch (err: any) {
      console.warn("[Anime Resolver] Falha ao extrair stream direto:", err.message);
      if (animeTitle) {
        const bloggerUrl = await resolveAnimesOnline(animeTitle, episode);
        if (bloggerUrl) {
          const resBlogger = { streamUrl: bloggerUrl, isBlogger: true };
          animeDirectStreamCache.set(cacheKey, { ...resBlogger, timestamp: Date.now() });
          return resBlogger;
        }
      }
      return null;
    }
  }

  // Cache para extração de master playlists do Vixsrc
  const vixsrcStreamCache = new Map<string, { masterUrl: string; embedUrl: string; timestamp: number }>();

  async function resolveVixsrcStream(tmdbId: string | number, type: 'movie' | 'tv', season: number = 1, episode: number = 1) {
    const cacheKey = `${tmdbId}:${type}:${season}:${episode}`;
    const cached = vixsrcStreamCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
      return cached;
    }

    try {
      const BASE_URL = 'https://vixsrc.to';
      const VIXSRC_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': BASE_URL,
        'Origin': BASE_URL
      };

      const apiUrl = type === 'movie' 
        ? `${BASE_URL}/api/movie/${tmdbId}`
        : `${BASE_URL}/api/tv/${tmdbId}/${season}/${episode}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const apiRes = await fetch(apiUrl, {
        headers: VIXSRC_HEADERS,
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!apiRes.ok) return null;
      const apiData: any = await apiRes.json().catch(() => null);
      if (!apiData?.src) return null;

      const embedPageRes = await fetch(BASE_URL + apiData.src, {
        headers: { ...VIXSRC_HEADERS, Accept: 'text/html' }
      });
      if (!embedPageRes.ok) return null;
      const html = await embedPageRes.text();

      const token = html.match(/token["']\s*:\s*["']([^"']+)/)?.[1];
      const expires = html.match(/expires["']\s*:\s*["']([^"']+)/)?.[1];
      const playlist = html.match(/url\s*:\s*["']([^"']+)/)?.[1];

      if (!token || !expires || !playlist) return null;

      const sep = playlist.includes('?') ? '&' : '?';
      const masterUrl = `${playlist}${sep}token=${token}&expires=${expires}&h=1`;
      const result = { masterUrl, embedUrl: BASE_URL + apiData.src, timestamp: Date.now() };
      vixsrcStreamCache.set(cacheKey, result);
      return result;
    } catch (err: any) {
      console.warn(`[Vixsrc] Resolver warning: ${err.message}`);
      return null;
    }
  }

  // API 4.5: Proxy HLS Anti-CORS para reprodução direta sem bloqueios no Artplayer
  app.get("/api/anime/hls-proxy", async (req, res) => {
    try {
      const rawUrl = req.query.url as string;
      if (!rawUrl) return res.status(400).send("URL ausente");

      const validation = validateSafeUrl(rawUrl);
      if (
        !validation.valid && 
        !rawUrl.includes("hclod.qzz.io") && 
        !rawUrl.includes("watchplay.shop") &&
        !rawUrl.includes("vixsrc") &&
        !rawUrl.includes("vix-content")
      ) {
        return res.status(403).send("URL não permitida");
      }

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");

      if (req.method === "OPTIONS") {
        return res.status(204).end();
      }

      const referer = (req.query.referer as string) || (rawUrl.includes("vixsrc") || rawUrl.includes("vix-content") ? "https://vixsrc.to/" : "https://v1.watchplay.shop/");
      let originHeader = "https://v1.watchplay.shop";
      try {
        if (referer.startsWith("http")) originHeader = new URL(referer).origin;
      } catch {}

      const upstreamRes = await fetch(rawUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": referer,
          "Origin": originHeader
        }
      });

      if (!upstreamRes.ok) {
        return res.status(upstreamRes.status).send(`Upstream status: ${upstreamRes.status}`);
      }

      const contentType = upstreamRes.headers.get("content-type") || "";
      const isM3U8 = rawUrl.includes(".m3u8") || contentType.includes("mpegurl") || contentType.includes("application/x-mpegURL");

      if (isM3U8) {
        const text = await upstreamRes.text();
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        const basePath = rawUrl.substring(0, rawUrl.lastIndexOf("/") + 1);

        const rewritten = text.split("\n").map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/, (_, uri) => {
              const fullUri = uri.startsWith("http") ? uri : new URL(uri, basePath).toString();
              return `URI="/api/anime/hls-proxy?url=${encodeURIComponent(fullUri)}&referer=${encodeURIComponent(referer)}"`;
            });
          }
          if (trimmed.startsWith("#")) return trimmed;
          const fullSegUrl = trimmed.startsWith("http") ? trimmed : new URL(trimmed, basePath).toString();
          return `/api/anime/hls-proxy?url=${encodeURIComponent(fullSegUrl)}&referer=${encodeURIComponent(referer)}`;
        }).join("\n");

        return res.send(rewritten);
      }

      if (contentType) res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      return res.send(buffer);
    } catch (err: any) {
      console.error("[HLS Proxy Error]:", err.message);
      return res.status(500).send("Proxy error");
    }
  });

  // API 4.8: Servidor Nativo Vixsrc com Stream Direto HLS em Artplayer com Skin Netflix
  app.get("/api/vixsrc-stream", async (req, res) => {
    const { id, type = "movie", s = "1", e = "1" } = req.query;
    const tmdbId = String(id || "");
    const mediaType = type === "tv" ? "tv" : "movie";
    const seasonNum = parseInt(String(s || "1"), 10) || 1;
    const episodeNum = parseInt(String(e || "1"), 10) || 1;

    const wpTarget = mediaType === "tv"
      ? `https://v1.watchplay.shop/tvshow/${tmdbId}/${seasonNum}/${episodeNum}`
      : `https://v1.watchplay.shop/movie/${tmdbId}`;

    try {
      const vixData = await resolveVixsrcStream(tmdbId, mediaType, seasonNum, episodeNum);
      if (vixData?.masterUrl) {
        const proxiedStreamUrl = `/api/anime/hls-proxy?url=${encodeURIComponent(vixData.masterUrl)}&referer=${encodeURIComponent(vixData.embedUrl)}`;

        return res.send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
              html, body {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
                background: #000;
                overflow: hidden;
              }
              #artplayer-container {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #000;
              }
              video {
                object-fit: contain !important;
                width: 100% !important;
                height: 100% !important;
              }
              .art-mask,
              .art-top,
              .art-bottom,
              .art-controls,
              .art-controls-left,
              .art-controls-center,
              .art-controls-right,
              .art-state,
              .art-loading,
              .art-notice,
              .art-settings,
              .art-contextmenu,
              .art-progress {
                display: none !important;
                opacity: 0 !important;
                visibility: hidden !important;
                pointer-events: none !important;
              }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/artplayer@5.1.7/dist/artplayer.js"></script>
          </head>
          <body>
            <div id="artplayer-container"></div>
            <script>
              (function() {
                var hlsUrl = "${proxiedStreamUrl}";

                var art = new Artplayer({
                  container: "#artplayer-container",
                  url: hlsUrl,
                  type: "m3u8",
                  customType: {
                    m3u8: function(video, url, artInstance) {
                      if (Hls.isSupported()) {
                        if (artInstance.hls) artInstance.hls.destroy();
                        var hls = new Hls({
                          enableWorker: true,
                          maxBufferLength: 60,
                          maxMaxBufferLength: 120,
                          backBufferLength: 90
                        });
                        hls.loadSource(url);
                        hls.attachMedia(video);
                        artInstance.hls = hls;
                      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                        video.src = url;
                      }
                    }
                  },
                  autoplay: true,
                  muted: false,
                  playsInline: true,
                  controls: [],
                  theme: "#e50914"
                });

                window.artInstance = art;

                function sendStatus() {
                  var v = art.video || document.querySelector("video");
                  if (!v) return;
                  var dur = v.duration || art.duration || 0;
                  var cur = v.currentTime || 0;
                  var bufferedEnd = 0;
                  if (v.buffered && v.buffered.length > 0) {
                    bufferedEnd = v.buffered.end(v.buffered.length - 1);
                  }

                  try {
                    window.parent.postMessage({
                      type: "WATCHPLAY_STATUS",
                      currentTime: cur,
                      duration: dur,
                      paused: !!v.paused,
                      muted: !!v.muted,
                      volume: typeof v.volume === "number" ? v.volume : 1,
                      buffered: bufferedEnd,
                      playbackRate: v.playbackRate || 1,
                      readyState: v.readyState || 0
                    }, "*");
                  } catch(e) {}
                }

                function notifyEnded() {
                  try {
                    window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
                  } catch(e) {}
                }

                setInterval(sendStatus, 300);

                window.addEventListener("message", function(e) {
                  if (!e.data) return;
                  var v = art.video || document.querySelector("video");

                  switch (e.data.type) {
                    case "PLAY":
                      if (art) art.play().catch(function() {});
                      else if (v) v.play().catch(function() {});
                      sendStatus();
                      break;
                    case "PAUSE":
                      if (art) art.pause();
                      else if (v) v.pause();
                      sendStatus();
                      break;
                    case "TOGGLE_PLAY":
                      if (art) art.toggle();
                      else if (v) { v.paused ? v.play().catch(function() {}) : v.pause(); }
                      sendStatus();
                      break;
                    case "SEEK":
                    case "SEEK_ABSOLUTE":
                      var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                      if (typeof t === "number" && !isNaN(t)) {
                        if (art) art.currentTime = t;
                        else if (v) v.currentTime = t;
                        sendStatus();
                      }
                      break;
                    case "SKIP_INTRO":
                      var sec = Number(e.data.seconds) || 85;
                      var cur = (v ? v.currentTime : 0) || 0;
                      var maxD = (v && v.duration > 0 ? v.duration : 99999);
                      var target = Math.max(0, Math.min(cur + sec, maxD - 5));
                      if (art) art.currentTime = target;
                      else if (v) v.currentTime = target;
                      sendStatus();
                      break;
                    case "SET_VOLUME":
                      if (typeof e.data.volume === "number") {
                        if (art) art.volume = e.data.volume;
                        else if (v) v.volume = e.data.volume;
                        sendStatus();
                      }
                      break;
                    case "SET_MUTED":
                      if (art) art.muted = !e.data.muted;
                      else if (v) v.muted = !e.data.muted;
                      sendStatus();
                      break;
                    case "REQUEST_STATUS":
                      sendStatus();
                      break;
                  }
                });

                art.on("video:ended", notifyEnded);
              })();
            </script>
          </body>
          </html>
        `);
      }

      // Se Vixsrc não tiver o stream, comuta para o WatchPlayer
      return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
    } catch (err: any) {
      console.error("[Vixsrc Stream Route Error]:", err.message);
      return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
    }
  });

  // API 5: Servidor Nativo de Anime e Alternativas
  app.get("/api/anime-stream", async (req, res) => {
    const { provider = "consumet", id, s = "1", e = "1", title = "", type = "tv" } = req.query;
    const isMovie = type === "movie";
    const tmdbId = String(id || "");
    let animeTitle = String(title || "");
    if (!animeTitle) {
      if (tmdbId === "46260") animeTitle = "Naruto";
      else if (tmdbId === "31910") animeTitle = "Naruto Shippuden";
      else if (tmdbId === "12971") animeTitle = "Dragon Ball";
      else if (tmdbId === "12609") animeTitle = "Dragon Ball Z";
      else if (tmdbId === "60625") animeTitle = "Dragon Ball Super";
    }

    const wpTarget = isMovie
      ? `https://v1.watchplay.shop/movie/${tmdbId}`
      : `https://v1.watchplay.shop/tvshow/${tmdbId}/${s}/${e}`;

    try {
      // 1. Provedor Principal Nativo: Stream HLS .m3u8 em Artplayer Próprio ou Blogger
      if (provider === "consumet" || provider === "native") {
        const directStream = await resolveDirectAnimeStream(tmdbId, s as string, e as string, isMovie, animeTitle);

        if (directStream?.isBlogger) {
          return res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                * { box-sizing: border-box; }
                html, body {
                  margin: 0;
                  padding: 0;
                  background: #000;
                  overflow: hidden;
                  width: 100vw;
                  height: 100vh;
                  position: relative;
                }
                #blogger-container {
                  position: absolute;
                  inset: 0;
                  width: 100%;
                  height: 100%;
                  overflow: hidden;
                  background: #000;
                }
                iframe {
                  position: absolute;
                  top: -2px;
                  left: 0;
                  width: 100%;
                  height: calc(100% + 50px);
                  border: none;
                  display: block;
                }
              </style>
            </head>
            <body>
              <div id="blogger-container">
                <iframe id="blogger-frame" src="${directStream.streamUrl}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
              </div>
              <script>
                (function() {
                  var curTime = 0;
                  var isPaused = true;
                  var dur = 1440; // 24 minutos (duração de episódio padrão)
                  var frame = document.getElementById("blogger-frame");

                  function sendStatus() {
                    try {
                      window.parent.postMessage({
                        type: "WATCHPLAY_STATUS",
                        currentTime: curTime,
                        duration: dur,
                        paused: isPaused,
                        muted: false,
                        volume: 1,
                        buffered: curTime + 60,
                        playbackRate: 1,
                        readyState: 4
                      }, "*");
                    } catch(e) {}
                  }

                  // Detecta quando o usuário clica diretamente no player do iframe
                  window.addEventListener("blur", function() {
                    if (isPaused) {
                      isPaused = false;
                      sendStatus();
                    }
                  });

                  // Incrementa o tempo segundo a segundo quando não pausado
                  setInterval(function() {
                    if (!isPaused && curTime < dur) {
                      curTime += 1;
                    }
                    sendStatus();
                  }, 1000);

                  setTimeout(sendStatus, 100);
                  setTimeout(sendStatus, 400);

                  // Escuta comandos vindos da Skin Netflix
                  window.addEventListener("message", function(e) {
                    if (!e.data) return;
                    switch(e.data.type) {
                      case "PLAY":
                        isPaused = false;
                        sendStatus();
                        break;
                      case "PAUSE":
                        isPaused = true;
                        sendStatus();
                        break;
                      case "TOGGLE_PLAY":
                        isPaused = !isPaused;
                        sendStatus();
                        break;
                      case "SEEK":
                      case "SEEK_ABSOLUTE":
                        var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                        if (typeof t === "number" && !isNaN(t)) {
                          curTime = Math.max(0, Math.min(t, dur));
                          sendStatus();
                        }
                        break;
                      case "SKIP_INTRO":
                        curTime = Math.min(curTime + 85, dur - 5);
                        sendStatus();
                        break;
                      case "REQUEST_STATUS":
                        sendStatus();
                        break;
                    }
                  });
                })();
              </script>
            </body>
            </html>
          `);
        }

        if (directStream?.streamUrl) {
          const proxiedStreamUrl = `/api/anime/hls-proxy?url=${encodeURIComponent(directStream.streamUrl)}`;
          const proxiedSubUrl = directStream.subtitleUrl
            ? `/api/anime/hls-proxy?url=${encodeURIComponent(directStream.subtitleUrl)}`
            : "";

          return res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
              <style>
                html, body {
                  margin: 0;
                  padding: 0;
                  width: 100%;
                  height: 100%;
                  background: #000;
                  overflow: hidden;
                }
                #artplayer-container {
                  position: absolute;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  background: #000;
                }
                video {
                  object-fit: contain !important;
                  width: 100% !important;
                  height: 100% !important;
                }
                .art-mask,
                .art-top,
                .art-bottom,
                .art-controls,
                .art-controls-left,
                .art-controls-center,
                .art-controls-right,
                .art-state,
                .art-loading,
                .art-notice,
                .art-settings,
                .art-contextmenu,
                .art-progress {
                  display: none !important;
                  opacity: 0 !important;
                  visibility: hidden !important;
                  pointer-events: none !important;
                }
              </style>
              <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
              <script src="https://cdn.jsdelivr.net/npm/artplayer@5.1.7/dist/artplayer.js"></script>
            </head>
            <body>
              <div id="artplayer-container"></div>
              <script>
                (function() {
                  var hlsUrl = "${proxiedStreamUrl}";
                  var subUrl = "${proxiedSubUrl}";
                  
                  var subtitles = [];
                  if (subUrl) {
                    subtitles.push({
                      url: subUrl,
                      name: "Português",
                      default: true,
                      type: "vtt"
                    });
                  }

                  var art = new Artplayer({
                    container: "#artplayer-container",
                    url: hlsUrl,
                    type: "m3u8",
                    customType: {
                      m3u8: function(video, url, artInstance) {
                        if (Hls.isSupported()) {
                          if (artInstance.hls) artInstance.hls.destroy();
                          var hls = new Hls({
                            enableWorker: true,
                            maxBufferLength: 60,
                            maxMaxBufferLength: 120,
                            backBufferLength: 90
                          });
                          hls.loadSource(url);
                          hls.attachMedia(video);
                          artInstance.hls = hls;
                        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                          video.src = url;
                        }
                      }
                    },
                    autoplay: true,
                    muted: false,
                    playsInline: true,
                    controls: [],
                    subtitle: subtitles.length > 0 ? subtitles[0] : undefined,
                    theme: "#e50914"
                  });

                  window.artInstance = art;

                  function sendStatus() {
                    var v = art.video || document.querySelector("video");
                    if (!v) return;
                    var dur = v.duration || art.duration || 0;
                    var cur = v.currentTime || 0;
                    var bufferedEnd = 0;
                    if (v.buffered && v.buffered.length > 0) {
                      bufferedEnd = v.buffered.end(v.buffered.length - 1);
                    }

                    try {
                      window.parent.postMessage({
                        type: "WATCHPLAY_STATUS",
                        currentTime: cur,
                        duration: dur,
                        paused: !!v.paused,
                        muted: !!v.muted,
                        volume: typeof v.volume === "number" ? v.volume : 1,
                        buffered: bufferedEnd,
                        playbackRate: v.playbackRate || 1,
                        readyState: v.readyState || 0
                      }, "*");
                    } catch(e) {}
                  }

                  function notifyEnded() {
                    try {
                      window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
                    } catch(e) {}
                  }

                  setInterval(sendStatus, 300);

                  window.addEventListener("message", function(e) {
                    if (!e.data) return;
                    var v = art.video || document.querySelector("video");

                    switch (e.data.type) {
                      case "PLAY":
                        if (art) art.play().catch(function() {});
                        else if (v) v.play().catch(function() {});
                        sendStatus();
                        break;
                      case "PAUSE":
                        if (art) art.pause();
                        else if (v) v.pause();
                        sendStatus();
                        break;
                      case "TOGGLE_PLAY":
                        if (art) art.toggle();
                        else if (v) { v.paused ? v.play().catch(function() {}) : v.pause(); }
                        sendStatus();
                        break;
                      case "SEEK":
                      case "SEEK_ABSOLUTE":
                        var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                        if (typeof t === "number" && !isNaN(t)) {
                          if (art) art.currentTime = t;
                          else if (v) v.currentTime = t;
                          sendStatus();
                        }
                        break;
                      case "SKIP_INTRO":
                        var sec = Number(e.data.seconds) || 85;
                        var cur = (v ? v.currentTime : 0) || 0;
                        var maxD = (v && v.duration > 0 ? v.duration : 99999);
                        var target = Math.max(0, Math.min(cur + sec, maxD - 5));
                        if (art) art.currentTime = target;
                        else if (v) v.currentTime = target;
                        sendStatus();
                        break;
                      case "SET_VOLUME":
                        if (typeof e.data.volume === "number") {
                          if (art) art.volume = e.data.volume;
                          else if (v) v.volume = e.data.volume;
                          sendStatus();
                        }
                        break;
                      case "SET_MUTED":
                        if (art) art.muted = !!e.data.muted;
                        else if (v) v.muted = !!e.data.muted;
                        sendStatus();
                        break;
                      case "SET_PLAYBACK_RATE":
                        if (typeof e.data.rate === "number") {
                          if (art) art.playbackRate = e.data.rate;
                          else if (v) v.playbackRate = e.data.rate;
                          sendStatus();
                        }
                        break;
                      case "REQUEST_STATUS":
                        sendStatus();
                        break;
                    }
                  });

                  art.on("video:ended", notifyEnded);
                })();
              </script>
            </body>
            </html>
          `);
        }

        // Fallback silencioso automático para o WatchPlayer oficial caso a extração direta falhe
        return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
      }

      // Fallback padrão
      return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
    } catch (err: any) {
      console.error("[Anime Stream Error]:", err.message);
      return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
    }
  });

  // API 6: Stream do WatchPlayer com Autoplay Imediato (sem ter que clicar em Opção 1)
  app.get("/api/watchplayer-stream", async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      const validation = validateSafeUrl(targetUrl);
      if (!validation.valid) {
        return res.status(403).send(`Acesso bloqueado por segurança: ${validation.error}`);
      }

      // Se for requisição de assinatura MD5 de stream feita pelo próprio player da página
      if (req.query.action_secure_sign) {
        const rawUrl = req.query.raw_url as string;
        const signTarget = new URL(targetUrl);
        signTarget.searchParams.set("action_secure_sign", "1");
        if (rawUrl) signTarget.searchParams.set("raw_url", rawUrl);

        const signRes = await fetch(signTarget.toString(), {
          headers: {
            "Referer": targetUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        const signData = await signRes.json();
        return res.json(signData);
      }

      const parsedTarget = new URL(targetUrl);
      let effectiveTargetUrl = targetUrl;
      let upstreamRes = await fetch(effectiveTargetUrl, {
        headers: {
          "Referer": parsedTarget.origin + "/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      // Se a rota padrão falhou (ex: 404), tenta alternar automaticamente entre /tvshow/ e /series/
      if (!upstreamRes.ok) {
        const alternateVariants: string[] = [];
        if (effectiveTargetUrl.includes("/tvshow/")) {
          alternateVariants.push(effectiveTargetUrl.replace("/tvshow/", "/series/"));
          alternateVariants.push(effectiveTargetUrl.replace("/tvshow/", "/serie/"));
        } else if (effectiveTargetUrl.includes("/series/")) {
          alternateVariants.push(effectiveTargetUrl.replace("/series/", "/tvshow/"));
          alternateVariants.push(effectiveTargetUrl.replace("/series/", "/serie/"));
        } else if (effectiveTargetUrl.includes("/serie/")) {
          alternateVariants.push(effectiveTargetUrl.replace("/serie/", "/series/"));
          alternateVariants.push(effectiveTargetUrl.replace("/serie/", "/tvshow/"));
        }

        for (const altUrl of alternateVariants) {
          try {
            const altRes = await fetch(altUrl, {
              headers: {
                "Referer": new URL(altUrl).origin + "/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
            });
            if (altRes.ok) {
              effectiveTargetUrl = altUrl;
              upstreamRes = altRes;
              break;
            }
          } catch (e) {}
        }
      }

      if (!upstreamRes.ok) {
        console.warn(`[WatchPlayer Stream Status ${upstreamRes.status}]: Episódio não encontrado no WatchPlayer (${effectiveTargetUrl}). Acionando fallback.`);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(404).send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <style>
              html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
            </style>
          </head>
          <body>
            <script>
              try {
                window.parent.postMessage({ 
                  type: "WATCHPLAY_UNAVAILABLE", 
                  reason: "upstream_status_" + ${upstreamRes.status}
                }, "*");
              } catch(e) {}
            </script>
          </body>
          </html>
        `);
      }

      let html = await upstreamRes.text();

      // 0. Bloqueio definitivo do Superflix via heurística robusta (regex multi-domínio, meta refresh, scripts e redirects)
      const isFallbackMode = isSuperflixDetected(html, effectiveTargetUrl) || (upstreamRes.url ? isSuperflixDetected("", upstreamRes.url) : false);

      if (isFallbackMode) {
        console.warn(`[Superflix Banido]: WatchPlayer tentou redirecionar para Superflix (${effectiveTargetUrl}). Bloqueando e acionando fallback.`);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(404).send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <style>
              html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
            </style>
          </head>
          <body>
            <script>
              try {
                window.parent.postMessage({ 
                  type: "WATCHPLAY_UNAVAILABLE", 
                  reason: "superflix_banned" 
                }, "*");
              } catch(e) {}
            </script>
          </body>
          </html>
        `);
      }

      // 0.1 Remoção do devtools detector e scripts que redirecionam para tela preta/404
      html = html.replace(/<script[^>]*devtools[^>]*><\/script>/gi, "");
      html = html.replace(/<script[^>]*analytics\.js[^>]*><\/script>/gi, "");
      html = html.replace(/<script[^>]*>[\s\S]*?devtoolsDetector[\s\S]*?<\/script>/gi, "");

      // 1. Ativar AUTO_PLAY_ENABLED no player oficial
      html = html.replace(/var AUTO_PLAY_ENABLED = false;/g, "var AUTO_PLAY_ENABLED = true;");
      html = html.replace(/AUTO_PLAY_ENABLED && options\.length == 1/g, "true");

      // 2. Redirecionar requisições da API interna para o proxy local e garantir carregamento dos assets
      html = html.replace(/var HOME_URL = ['"]https:\/\/v1\.watchplay\.shop['"];/g, "var HOME_URL = '/api/watchplay-proxy';");
      html = html.replace(/\$\{HOME_URL\}\/api/g, "/api/watchplay-proxy-api");
      html = html.replace(/src=["']\/assets\//g, 'src="https://v1.watchplay.shop/assets/');
      html = html.replace(/href=["']\/assets\//g, 'href="https://v1.watchplay.shop/assets/');

      // 3. Remover rastreadores, banners conhecidos e loaders nativos
      html = html.replace(/_wau\.push\([^)]*\);?/g, "");
      html = html.replace(/<div[^>]*class=["'][^"']*changeOptions[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");
      html = html.replace(/Mostrar\s*Op[çc][õo]es/gi, "");
      html = html.replace(/\$\('body'\)\.append\(`<div class="player_loading">[\s\S]*?<\/div>`\);/g, "/* player_loading bloqueado */");
      html = html.replace(/\$\('body'\)\.append\(textoContexto\);/g, "/* notify bloqueado */");

      // 4. Inutilizar todos os controles e overlays nativos do Artplayer na própria inicialização
      html = html.replace(/setting:\s*true,/g, "setting: false,");
      html = html.replace(/pip:\s*true,/g, "pip: false,");
      html = html.replace(/playbackRate:\s*true,/g, "playbackRate: false,");
      html = html.replace(/aspectRatio:\s*true,/g, "aspectRatio: false,");
      html = html.replace(/lock:\s*true,/g, "lock: false,");
      html = html.replace(/fastForward:\s*true,/g, "fastForward: false,");
      html = html.replace(/autoOrientation:\s*true,/g, "autoOrientation: false,");
      html = html.replace(/fullscreen:\s*true,/g, "fullscreen: false,");
      html = html.replace(/fullscreenWeb:\s*true,/g, "fullscreenWeb: false,");

      // 4.0 Suporte robusto a filmes diretos com createMyPlayer e Artplayer
      html = html.replace(/createMyPlayer\(\s*\{/g, "window.artInstance = createMyPlayer({ autoplay: true, ");
      html = html.replace(/autoplay:\s*false/g, "autoplay: true");

      html = html.replace(
        /artInstance = new Artplayer\(\{/g,
        `artInstance = new Artplayer({
            controls: [],
            hotkey: false,
            gesture: false,
            miniProgressBar: false,
            backdrop: false,
            playsInline: true,
            autoPlayback: false,
            icons: { state: '' },`
      );

      // 4.1 Otimização de Buffer e ABR estilo Netflix no Hls.js
      html = html.replace(
        /maxBufferLength:\s*10,\s*maxMaxBufferLength:\s*20/g,
        `enableWorker: true,
         lowLatencyMode: false,
         maxBufferLength: 60,
         maxMaxBufferLength: 120,
         maxBufferSize: 100 * 1000 * 1000,
         maxBufferHole: 0.5,
         backBufferLength: 90,
         abrEwmaDefaultEstimate: 4000000,
         abrBandWidthFactor: 0.85,
         abrBandWidthUpFactor: 0.7,
         fragLoadingMaxRetry: 6,
         manifestLoadingMaxRetry: 6,
         levelLoadingMaxRetry: 6,
         fragLoadingRetryDelay: 500`
      );

      // 5. Ocultar seletores nativos e carrossel de episódios no HTML inicial
      html = html.replace(
        /<div class="players_select_container">/g,
        '<div class="players_select_container" style="display:none !important; opacity:0 !important; visibility:hidden !important; pointer-events:none !important;">'
      );
      html = html.replace(
        /<div class="player_container">/g,
        '<div class="player_container visible" style="position:absolute !important; top:0 !important; left:0 !important; width:100% !important; height:100% !important; transition:none !important;">'
      );

      // 6. Injetar CSS de blackout absoluto e script de monitoramento no <head>
      const autoPlayInjection = `
        <style>
          * {
            -webkit-tap-highlight-color: transparent !important;
          }

          html, body {
            background: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            overflow: hidden !important;
          }

          /* Oculta tudo que não for o vídeo: seletores de opções, carrossel, banners, toasts e loaders nativos */
          .players_select_container,
          .seasonepisodeSelector,
          .seasonSelector,
          .episodeSelector,
          .player_select_item,
          .player_loading,
          .changeOptions,
          .changeEpisode,
          .btn-opcoes,
          .mostrar_opcoes,
          #mostrar_opcoes,
          .embedder_especial,
          .embedder_info,
          .shion_native_notify_system,
          #_wau_container,
          [class*="player_loading"],
          [class*="seasonepisode"],
          [class*="select_language"],
          [class*="languages_selector"],
          [class*="changeOptions"],
          [class*="players_select"],
          [class*="option"],
          [id*="option"] {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            z-index: -9999 !important;
          }

          /* Container do player e raiz do Artplayer: SEMPRE visíveis e em tela cheia */
          .player_container,
          .player_container.visible,
          .player_container .infra,
          #artplayer-container,
          #tv-player,
          .art-video-player {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            opacity: 1 !important;
            visibility: visible !important;
            transition: none !important;
            transform: none !important;
            background: #000 !important;
            pointer-events: auto !important;
          }

          /* O vídeo original é a única coisa exibida com foco total */
          video,
          .art-video,
          .art-video-player video {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
            opacity: 1 !important;
            visibility: visible !important;
            background: #000 !important;
            z-index: 5 !important;
          }

          /* BLINDAGEM COMPLETA DOS CONTROLES NATIVOS DO ARTPLAYER:
             Usa seletores exatos das classes para garantir que a UI nativa 
             seja ocultada independente de qual seja a classe raiz. */
          .art-mask,
          .art-top,
          .art-bottom,
          .art-controls,
          .art-controls-left,
          .art-controls-center,
          .art-controls-right,
          .art-state,
          .art-loading,
          .art-notice,
          .art-settings,
          .art-setting,
          .art-subtitle-setting,
          .art-contextmenu,
          .art-danmuku,
          .art-fast-forward,
          .art-lock,
          .art-poster,
          .art-layers > .art-layer:not(.art-layer-video),
          .art-icon-state,
          .art-layer-state,
          .art-layer-auto-playback,
          .art-layer-loading,
          .art-notice-inner,
          .art-info,
          .art-info-panel,
          .art-progress,
          .art-control,
          .art-volume-panel,
          #pip-skip-intro-btn,
          #pip-skip-toast {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            animation: none !important;
          }
        </style>

        <script>
          (function() {
            // 1. MutationObserver que oculta overlays nativos adicionados dinamicamente
            // CUIDADO: não ocultar 'art-video-player' (container raiz) nem elementos de vídeo
            var observer = new MutationObserver(function(mutations) {
              for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                  var node = added[j];
                  if (node.nodeType !== 1) continue;
                  var cls = typeof node.className === 'string' ? node.className : '';
                  var tag = (node.tagName || '').toUpperCase();
                  // Nunca tocar no container raiz do Artplayer nem nos elementos de vídeo
                  if (cls.indexOf('art-video-player') !== -1 || tag === 'VIDEO') continue;
                  // Ocultar apenas elementos de overlay: loading, notificações nativas, etc.
                  if (
                    cls.indexOf('player_loading') !== -1 ||
                    cls.indexOf('shion_native') !== -1 ||
                    cls === 'art-state' ||
                    cls === 'art-notice' ||
                    cls === 'art-notice-inner' ||
                    cls === 'art-loading'
                  ) {
                    node.style.setProperty('display', 'none', 'important');
                    node.style.setProperty('opacity', '0', 'important');
                    node.style.setProperty('visibility', 'hidden', 'important');
                  }
                }
              }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });

            // 2. Auto-Start rápido e resiliente para filmes e séries
            var tries = 0;
            var optionClicked = false;
            var autoStartTimer = setInterval(function() {
              tries++;

              // D) Detecção proativa do vídeo (Filmes via #tv-player e Séries)
              var v = getVideoElement();
              if (v) {
                // Se o vídeo estiver pausado mas já com metadados ou pronto, tenta dar play
                if (v.paused && (v.readyState >= 1 || v.currentTime > 0)) {
                  v.play().catch(function() {
                    v.muted = true;
                    v.play().catch(function() {});
                  });
                }
                // Se já possui duração válida ou está reproduzindo, envia status e estabiliza
                if ((v.duration > 0 && !isNaN(v.duration)) || v.currentTime > 0 || !v.paused) {
                  sendPlayerStatus(v);
                  if (!v.paused) {
                    clearInterval(autoStartTimer);
                    return;
                  }
                }
              }

              // A) Séries: aciona getepi imediatamente no episódio selecionado sem esperar dezenas de miniaturas
              var ep = document.querySelector('.episodeOption.active') || document.querySelector('.episodeOption');
              if (ep && window.$ && typeof window.getepi === 'function' && !window._epAutoTriggered) {
                window._epAutoTriggered = true;
                window.$(ep).removeClass('active');
                window.getepi(window.$(ep));
              }

              // B) Seletor de áudio (Dublado preferencialmente)
              var dublado = document.querySelector('.select_language[data-target="1"]');
              if (dublado && !dublado.classList.contains('active')) {
                dublado.click();
              }

              // C) Clica na opção de player assim que surgir (apenas para páginas com opções de servidores)
              if (!optionClicked) {
                var option = document.querySelector('.players_select_items.visible .player_select_item') || 
                             document.querySelector('.player_select_item');
                if (option) {
                  optionClicked = true;
                  option.click();
                } else if (!document.querySelector('#tv-player') && !document.querySelector('video') && !window.artInstance) {
                  // Só aciona indisponibilidade se NÃO for um player direto de filme (#tv-player) e não houver vídeo após tempo razoável
                  if (tries > 40 && document.querySelectorAll(".player_select_item").length === 0) {
                    clearInterval(autoStartTimer);
                    try { window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "no_sources" }, "*"); } catch(e){}
                    return;
                  }
                }
              }

              // Timeout após 100 ticks (6.0 segundos sem stream válido)
              if (tries > 100) {
                clearInterval(autoStartTimer);
                if (!v || (!v.duration && v.currentTime === 0 && v.paused)) {
                  try {
                    window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "timeout_no_stream" }, "*");
                  } catch(e) {}
                }
              }
            }, 60);

            // 3. Funções de controle de vídeo e telemetria para o NetflixPlayerSkin
            var introSkippedForCurrentVideo = false;
            var skipDurationSeconds = 85;
            try {
              skipDurationSeconds = parseInt(localStorage.getItem("playinfinity_skip_duration") || "85", 10);
            } catch(e) {}

            function getVideoElement() {
              if (window.artInstance && window.artInstance.video) {
                return window.artInstance.video;
              }
              return document.querySelector("video");
            }

            function doSkipIntro(seconds) {
              var sec = Number(seconds) !== undefined && !isNaN(Number(seconds)) ? Number(seconds) : (skipDurationSeconds || 85);
              var video = getVideoElement();
              if (video) {
                var current = video.currentTime || 0;
                var duration = video.duration || 3600;
                var targetTime = Math.max(0, Math.min(current + sec, duration - 10));
                
                try {
                  video.currentTime = targetTime;
                } catch(e) {}

                if (window.artInstance) {
                  try {
                    window.artInstance.currentTime = targetTime;
                  } catch(e) {}
                }

                if (sec > 0) {
                  introSkippedForCurrentVideo = true;
                }

                try {
                  window.parent.postMessage({ 
                    type: "WATCHPLAY_INTRO_SKIPPED", 
                    seconds: sec, 
                    newTime: targetTime 
                  }, "*");
                } catch(e) {}
              }
            }

            // Tecla S manual
            window.addEventListener("keydown", function(e) {
              if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
              if (e.key === "s" || e.key === "S") {
                e.preventDefault();
                doSkipIntro(skipDurationSeconds);
              }
            });

            // Mensagens enviadas pela Skin Netflix VIP
            window.addEventListener("message", function(e) {
              if (!e.data) return;
              var v = getVideoElement();

              switch (e.data.type) {
                case "SKIP_INTRO":
                  doSkipIntro(e.data.seconds || skipDurationSeconds);
                  break;

                case "PLAY":
                  if (v) {
                    v.play().catch(function() {});
                    sendPlayerStatus(v);
                  }
                  break;

                case "PAUSE":
                  if (v) {
                    v.pause();
                    sendPlayerStatus(v);
                  }
                  break;

                case "TOGGLE_PLAY":
                  if (v) {
                    if (v.paused) {
                      v.play().catch(function() {});
                    } else {
                      v.pause();
                    }
                    sendPlayerStatus(v);
                  }
                  break;

                case "SEEK":
                case "SEEK_ABSOLUTE":
                  var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                  if (v && typeof t === "number" && !isNaN(t)) {
                    var maxDur = v.duration && v.duration > 0 ? v.duration : 99999;
                    v.currentTime = Math.max(0, Math.min(t, maxDur - 0.5));
                    sendPlayerStatus(v);
                  }
                  break;

                case "SEEK_RELATIVE":
                  if (v && typeof e.data.seconds === "number" && !isNaN(e.data.seconds)) {
                    var curT = v.currentTime || 0;
                    var maxD = v.duration && v.duration > 0 ? v.duration : 99999;
                    v.currentTime = Math.max(0, Math.min(curT + e.data.seconds, maxD - 0.5));
                    sendPlayerStatus(v);
                  }
                  break;

                case "SET_VOLUME":
                  if (v && typeof e.data.volume === "number") {
                    var vol = Math.max(0, Math.min(1, e.data.volume));
                    v.volume = vol;
                    v.muted = (vol === 0);
                    sendPlayerStatus(v);
                  }
                  break;

                case "SET_MUTED":
                  if (v) {
                    v.muted = !!e.data.muted;
                    sendPlayerStatus(v);
                  }
                  break;

                case "SET_PLAYBACK_RATE":
                  if (v && typeof e.data.rate === "number") {
                    v.playbackRate = e.data.rate;
                    sendPlayerStatus(v);
                  }
                  break;

                case "SET_SKIP_DURATION":
                  if (e.data.seconds) {
                    skipDurationSeconds = Number(e.data.seconds);
                    try {
                      localStorage.setItem("playinfinity_skip_duration", String(skipDurationSeconds));
                    } catch(err) {}
                  }
                  break;

                case "TOGGLE_PIP":
                case "REQUEST_PIP":
                  if (v) {
                    try {
                      if (document.pictureInPictureElement) {
                        document.exitPictureInPicture().catch(function() {});
                      } else if (v.requestPictureInPicture) {
                        v.requestPictureInPicture().catch(function() {});
                      }
                    } catch(err) {}
                  }
                  break;

                case "REQUEST_STATUS":
                  sendPlayerStatus(v);
                  break;
              }
            });

            // Envia telemetria limpa para a Skin Netflix do aplicativo principal
            function sendPlayerStatus(v) {
              if (!v) v = getVideoElement();
              if (!v) return;
              try {
                var bufferedEnd = 0;
                if (v.buffered && v.buffered.length > 0) {
                  bufferedEnd = v.buffered.end(v.buffered.length - 1);
                }
                var dur = v.duration;
                if ((!dur || isNaN(dur) || dur === Infinity) && window.artInstance && window.artInstance.duration) {
                  dur = window.artInstance.duration;
                }
                if (!dur || isNaN(dur) || dur === Infinity) {
                  dur = 0;
                }
                window.parent.postMessage({
                  type: "WATCHPLAY_STATUS",
                  currentTime: v.currentTime || 0,
                  duration: dur,
                  paused: !!v.paused,
                  muted: !!v.muted,
                  volume: typeof v.volume === "number" ? v.volume : 1,
                  buffered: bufferedEnd,
                  playbackRate: v.playbackRate || 1,
                  readyState: v.readyState || 0
                }, "*");
              } catch(e) {}
            }

            var hasNotifiedEnded = false;
            function notifyEpisodeEnded() {
              if (hasNotifiedEnded) return;
              hasNotifiedEnded = true;
              try {
                window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
              } catch(e) {}
            }

            document.addEventListener('ended', function(e) {
              if (e.target && (e.target.tagName === 'VIDEO' || e.target.nodeName === 'VIDEO')) {
                notifyEpisodeEnded();
              }
            }, true);

            function handleVideoTimeUpdate(v) {
              if (!v) return;
              var cur = v.currentTime || 0;
              var dur = v.duration || 0;

              if (cur < 2 && introSkippedForCurrentVideo) {
                introSkippedForCurrentVideo = false;
              }

              if (cur >= 5 && cur <= 130 && !introSkippedForCurrentVideo) {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_INTRO_ACTIVE", active: true, currentTime: cur }, "*");
                } catch(e) {}
              } else {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_INTRO_ACTIVE", active: false, currentTime: cur }, "*");
                } catch(e) {}
              }

              if (dur > 30 && cur >= (dur - 1.5)) {
                notifyEpisodeEnded();
              }

              sendPlayerStatus(v);
            }

            setInterval(function() {
              var v = getVideoElement();
              if (v) {
                sendPlayerStatus(v);
                if (!v.paused) {
                  handleVideoTimeUpdate(v);
                }
              }
            }, 350);

            ['play', 'pause', 'playing', 'seeking', 'seeked', 'volumechange', 'ratechange', 'loadedmetadata', 'canplay'].forEach(function(evtName) {
              document.addEventListener(evtName, function(e) {
                if (e.target && (e.target.tagName === 'VIDEO' || e.target.nodeName === 'VIDEO')) {
                  sendPlayerStatus(e.target);
                }
              }, true);
            });

            // Detecção de erros no stream de vídeo ou perda de conexão para acionar fallback automático
            document.addEventListener('error', function(e) {
              if (e.target && (e.target.tagName === 'VIDEO' || e.target.nodeName === 'VIDEO')) {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "video_playback_error" }, "*");
                } catch(err) {}
              }
            }, true);

            window.addEventListener('offline', function() {
              try {
                window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "network_offline" }, "*");
              } catch(err) {}
            });

            // Blindagem do Artplayer: oculta controles via style (NÃO remove do DOM para não quebrar o player)
            var cleanArtNodes = function() {
              if (window.artInstance) {
                try {
                  if (window.artInstance.controls) window.artInstance.controls.show = false;
                  if (window.artInstance.mask) window.artInstance.mask.show = false;
                } catch(e) {}
                // Ocultar via style apenas, sem .remove() para não quebrar referências internas do Artplayer
                if (window.artInstance.template) {
                  ['$state', '$bottom', '$mask', '$top', '$notice', '$loading', '$controls'].forEach(function(k) {
                    try {
                      var el = window.artInstance.template[k];
                      if (el && el.style) {
                        el.style.setProperty('display', 'none', 'important');
                        el.style.setProperty('opacity', '0', 'important');
                        el.style.setProperty('visibility', 'hidden', 'important');
                        el.style.setProperty('pointer-events', 'none', 'important');
                      }
                    } catch(e) {}
                  });
                }
              }
            };

            var artCheckInterval = setInterval(function() {
              if (window.artInstance) {
                cleanArtNodes();
                if (!window.artInstance._endedHooked) {
                  window.artInstance._endedHooked = true;
                  cleanArtNodes();
                  window.artInstance.on('ready', cleanArtNodes);
                  window.artInstance.on('video:play', cleanArtNodes);
                  window.artInstance.on('video:pause', cleanArtNodes);
                  window.artInstance.on('video:ended', notifyEpisodeEnded);
                  window.artInstance.on('video:timeupdate', function() {
                    var v = window.artInstance.video;
                    if (v) handleVideoTimeUpdate(v);
                  });
                }
              }
            }, 300);
          })();
        </script>
      `;

      html = html.replace("</head>", `${autoPlayInjection}</head>`);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (err: any) {
      console.warn("[WatchPlayer Stream Error]:", err.message, "- Revertendo para iframe direto.");
      const fallbackUrl = (req.query.url as string) || "";
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
            iframe { width: 100%; height: 100%; border: none; }
          </style>
        </head>
        <body>
          <iframe src="${fallbackUrl}" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>
        </body>
        </html>
      `);
    }
  });

  // ==========================================
  // API TV AO VIVO: PROXY HLS ANTI-CORS & CATÁLOGO DE CANAIS
  // ========================================================
  // Cache em memória de alta performance para chunks (.ts) de TV ao vivo (TTL de 15 segundos)
  const liveChunkCache = new Map<string, { buffer: Buffer; contentType: string; expires: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of liveChunkCache.entries()) {
      if (val.expires < now) liveChunkCache.delete(key);
    }
  }, 10000);

  app.get("/api/live-stream-proxy", async (req, res) => {
    try {
      const rawUrl = req.query.url as string;
      if (!rawUrl) return res.status(400).send("URL ausente");

      let parsed: URL;
      try {
        parsed = new URL(rawUrl.trim());
      } catch {
        return res.status(400).send("Formato de URL inválido");
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return res.status(403).send("Protocolo inválido.");
      }

      if (isPrivateOrLocalIp(parsed.hostname)) {
        return res.status(403).send("Acesso a IP privado ou metadados de nuvem bloqueado (Anti-SSRF).");
      }

      // Headers CORS universais para execução contínua no player
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");

      if (req.method === "OPTIONS") {
        return res.status(204).end();
      }

      // Verifica cache em memória para segmentos de vídeo (.ts / .aac / etc.)
      const isSegment = rawUrl.includes(".ts") || rawUrl.includes(".m4s") || rawUrl.includes(".mp4");
      const cached = isSegment ? liveChunkCache.get(rawUrl) : null;
      if (cached && cached.expires > Date.now()) {
        res.setHeader("Content-Type", cached.contentType);
        res.setHeader("Cache-Control", "public, max-age=15, immutable");
        res.setHeader("X-Cache-Status", "HIT-MEMORY");
        return res.send(cached.buffer);
      }

      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "*/*"
      };

      if (req.query.referer) {
        headers["Referer"] = req.query.referer as string;
      }

      const upstreamRes = await fetch(rawUrl, {
        headers,
        redirect: "follow"
      });

      if (!upstreamRes.ok) {
        return res.status(upstreamRes.status).send(`Upstream status: ${upstreamRes.status}`);
      }

      const finalUrl = upstreamRes.url || rawUrl;
      const contentType = upstreamRes.headers.get("content-type") || "";
      const isM3U8 = rawUrl.includes(".m3u8") || 
                     finalUrl.includes(".m3u8") ||
                     contentType.includes("mpegurl") || 
                     contentType.includes("application/x-mpegURL") ||
                     contentType.includes("vnd.apple.mpegurl");

      if (isM3U8) {
        const text = await upstreamRes.text();
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

        const rewritten = text.split("\n").map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line;

          if (trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/, (_, uri) => {
              try {
                const fullUri = uri.startsWith("http") ? uri : new URL(uri, finalUrl).toString();
                return `URI="/api/live-stream-proxy?url=${encodeURIComponent(fullUri)}"`;
              } catch {
                return `URI="${uri}"`;
              }
            });
          }

          if (trimmed.startsWith("#")) return trimmed;

          try {
            const fullSegUrl = trimmed.startsWith("http") ? trimmed : new URL(trimmed, finalUrl).toString();
            return `/api/live-stream-proxy?url=${encodeURIComponent(fullSegUrl)}`;
          } catch {
            return trimmed;
          }
        }).join("\n");

        return res.send(rewritten);
      }

      const finalContentType = contentType || "video/MP2T";
      res.setHeader("Content-Type", finalContentType);
      res.setHeader("Cache-Control", "public, max-age=15");

      const buffer = Buffer.from(await upstreamRes.arrayBuffer());

      // Salva no cache em memória se for segmento de mídia
      if (isSegment && buffer.length > 0 && buffer.length < 8 * 1024 * 1024) {
        liveChunkCache.set(rawUrl, {
          buffer,
          contentType: finalContentType,
          expires: Date.now() + 15000 // 15 segundos
        });
      }

      return res.send(buffer);
    } catch (err: any) {
      console.error("[Live Stream Proxy Error]:", err?.message || err, "URL:", req.query?.url);
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(500).send("Proxy error");
    }
  });

  // Healthcheck
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Suporte a navegação interna do Playerflix (troca de episódios)
  app.get(["/serie/:id/:season/:episode", "/filme/:id"], async (req, res) => {
    const { id, season, episode } = req.params;
    const type = req.path.startsWith("/serie") ? "tv" : "movie";
    return res.redirect(`/api/myembed-stream?id=${id}&type=${type}&s=${season || 1}&e=${episode || 1}`);
  });

  // API: Proxy de Dados do Playerflix / VIP Player
  app.get(["/inc/Ajax.php", "/api/playerflix-ajax"], async (req, res) => {
    try {
      const queryParams = new URLSearchParams(req.query as any).toString();
      const targetUrl = `https://playerflix.ink/inc/Ajax.php?${queryParams}`;
      const ajaxRes = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://playerflix.ink/",
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      const data = await ajaxRes.json();

      // Sanitiza opções para garantir apenas servidores permitidos
      if (data && data.data && Array.isArray(data.data.options)) {
        data.data.options = data.data.options.filter((opt: any) => {
          const embedUrl = (opt.embed || "").toLowerCase();
          return !embedUrl.includes("superflix") && !embedUrl.includes("sfapi") && !embedUrl.includes("byse");
        });
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res.json(data);
    } catch (err: any) {
      console.error("[VIP Player Ajax Proxy Error]:", err);
      return res.status(500).json({ status: false, error: "Erro ao buscar opções do player VIP" });
    }
  });

  // API: MyEmbed / Playerflix VIP Player com Extração Direta de Stream e Escudo Anti-Popups
  app.get("/api/myembed-stream", async (req, res) => {
    try {
      const rawId = (req.query.id as string) || (req.query.url as string) || "tt22084616";
      const idMatch = rawId.match(/(?:filme|movie|serie|series|tvshow|tv)\/([a-zA-Z0-9_-]+)/i) || rawId.match(/(tt\d+|\d+)/);
      const id = idMatch ? idMatch[1] : rawId;
      const type = (req.query.type as string) || (rawId.includes("serie") ? "tv" : "movie");
      const season = req.query.s ? String(req.query.s) : "1";
      const episode = req.query.e ? String(req.query.e) : "1";

      // Para séries e filmes, se o id for IMDb (tt...), converte para TMDB numérico para compatibilidade total com o Ajax
      let resolvedId = id;
      if (id.startsWith("tt")) {
        try {
          const findRes = await fetch(
            `https://api.themoviedb.org/3/find/${id}?api_key=e0cc43e590a5c5c0d03f920bd4fe9424&external_source=imdb_id`
          );
          if (findRes.ok) {
            const findData = await findRes.json();
            if ((type === "tv" || type === "series") && findData.tv_results?.[0]?.id) {
              resolvedId = String(findData.tv_results[0].id);
            } else if (type === "movie" && findData.movie_results?.[0]?.id) {
              resolvedId = String(findData.movie_results[0].id);
            }
          }
        } catch (findErr) {
          console.warn("[VIP Player TMDB Find Warning]:", findErr);
        }
      }

      // 1. TENTATIVA DIRETA DE EXTRAÇÃO (Sem telas de 'Carregando', sem popups e sem anúncios)
      let ajaxHadValidSources = false;
      try {
        const ajaxUrl = `https://playerflix.ink/inc/Ajax.php?type=${type}&id=${resolvedId}&season=${season}&episode=${episode}`;
        const ajaxRes = await fetch(ajaxUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://playerflix.ink/",
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        if (ajaxRes.ok) {
          const ajaxData = await ajaxRes.json();
          if (ajaxData && ajaxData.status && Array.isArray(ajaxData.data?.options)) {
            // Regra Estrita: descarta servidores na lista negra (Superflix, sfapi, byse, streamberry)
            // e prioriza opções com dublagem brasileira (Dublado PT-BR)
            const validOptions = ajaxData.data.options
              .filter((opt: any) => {
                const u = (opt.embed || "").toLowerCase();
                return !u.includes("superflix") && !u.includes("sfapi") && !u.includes("byse") && !u.includes("streamberry");
              })
              .sort((a: any, b: any) => {
                const aLang = (a.lang || "").toLowerCase();
                const bLang = (b.lang || "").toLowerCase();
                const aDub = aLang.includes("pt") || aLang.includes("br") || aLang.includes("dub");
                const bDub = bLang.includes("pt") || bLang.includes("br") || bLang.includes("dub");
                if (aDub && !bDub) return -1;
                if (!aDub && bDub) return 1;
                return 0;
              });

            if (validOptions.length > 0) {
              ajaxHadValidSources = true;
            }

            for (const vipOption of validOptions) {
              if (!vipOption || !vipOption.embed) continue;
              try {
                const embedUrl = new URL(vipOption.embed);
                const hash = embedUrl.pathname.split("/").filter(Boolean).pop();
                const host = embedUrl.host;

                if (!hash || !host) continue;

                const getVidRes = await fetch(`https://${host}/player/index.php?data=${hash}&do=getVideo`, {
                  method: "POST",
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Referer": vipOption.embed,
                    "Origin": `https://${host}`,
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest",
                  },
                  body: `hash=${hash}&r=${encodeURIComponent("https://playerflix.ink/")}`,
                });

                if (!getVidRes.ok) continue;
                const vidText = await getVidRes.text();
                if (!vidText.startsWith("{")) continue;

                const vidData = JSON.parse(vidText);
                const m3u8Source = vidData.securedLink || vidData.videoSource;
                if (!m3u8Source || typeof m3u8Source !== "string" || !m3u8Source.startsWith("http")) continue;

                const proxiedStreamUrl = `/api/live-stream-proxy?url=${encodeURIComponent(m3u8Source)}&referer=${encodeURIComponent(`https://${host}/`)}`;

                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
                return res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VIP Player - ${ajaxData.data?.title || "Play Infinity"}</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: #000;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #artplayer-container {
      width: 100%;
      height: 100%;
    }
    /* Oculta totalmente qualquer elemento de interface nativa do Artplayer para dar lugar exclusivo à Skin Netflix */
    .art-video-player .art-bottom,
    .art-video-player .art-mask,
    .art-video-player .art-state,
    .art-video-player .art-contextmenus,
    .art-video-player .art-loading,
    .art-video-player .art-notice,
    .art-video-player .art-controls,
    .art-video-player .art-layer-state,
    .art-video-player .art-progress,
    .art-video-player .art-control,
    .art-video-player .art-backdrop,
    .art-video-player .art-layers {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/artplayer@5.1.7/dist/artplayer.js"></script>
</head>
<body>
  <div id="artplayer-container"></div>
  <script>
    (function() {
      // Neutraliza popups e janelas secundárias
      window.open = function() { return null; };
      window.alert = function() {};
      window.confirm = function() { return false; };

      var hlsUrl = "${proxiedStreamUrl}";

      var art = new Artplayer({
        container: "#artplayer-container",
        url: hlsUrl,
        type: "m3u8",
        customType: {
          m3u8: function(video, url, artInstance) {
            if (Hls.isSupported()) {
              if (artInstance.hls) artInstance.hls.destroy();
              var hls = new Hls({
                enableWorker: true,
                maxBufferLength: 60,
                maxMaxBufferLength: 120,
                backBufferLength: 90
              });
              hls.loadSource(url);
              hls.attachMedia(video);
              hls.on(Hls.Events.MANIFEST_PARSED, function() {
                // Seleciona áudio Dublado / Português automaticamente se disponível
                if (hls.audioTracks && hls.audioTracks.length > 1) {
                  for (var i = 0; i < hls.audioTracks.length; i++) {
                    var track = hls.audioTracks[i];
                    var lang = (track.lang || track.name || "").toLowerCase();
                    if (lang.includes("pt") || lang.includes("por") || lang.includes("dub")) {
                      hls.audioTrack = i;
                      break;
                    }
                  }
                }
              });
              hls.on(Hls.Events.LEVEL_LOADED, function(event, data) {
                if (data && data.details && data.details.totalduration) {
                  window.__streamDuration = data.details.totalduration;
                  sendStatus();
                }
              });
              hls.on(Hls.Events.ERROR, function(event, data) {
                if (data && data.fatal) {
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      hls.startLoad();
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      hls.recoverMediaError();
                      break;
                    default:
                      hls.destroy();
                      try {
                        window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "vip_hls_fatal" }, "*");
                      } catch(e) {}
                      break;
                  }
                }
              });
              artInstance.hls = hls;
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
              video.src = url;
              video.addEventListener("error", function() {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "vip_video_error" }, "*");
                } catch(e) {}
              });
            }
          }
        },
        autoplay: true,
        muted: false,
        playsInline: true,
        hotkey: false,
        gesture: false,
        miniProgressBar: false,
        backdrop: false,
        controls: [],
        icons: { state: '' },
        theme: "#e50914"
      });

      window.artInstance = art;

      function sendStatus() {
        var v = art.video || document.querySelector("video");
        if (!v) return;
        var dur = v.duration || art.duration || window.__streamDuration || 0;
        if ((!dur || isNaN(dur) || dur === Infinity) && window.__streamDuration) {
          dur = window.__streamDuration;
        }
        if (!dur || isNaN(dur) || dur === Infinity) {
          dur = 0;
        }
        var cur = v.currentTime || 0;
        var bufferedEnd = 0;
        if (v.buffered && v.buffered.length > 0) {
          bufferedEnd = v.buffered.end(v.buffered.length - 1);
        }

        try {
          window.parent.postMessage({
            type: "WATCHPLAY_STATUS",
            currentTime: cur,
            duration: dur,
            paused: !!v.paused,
            muted: !!v.muted,
            volume: typeof v.volume === "number" ? v.volume : 1,
            buffered: bufferedEnd,
            playbackRate: v.playbackRate || 1,
            readyState: v.readyState || 0
          }, "*");
        } catch(e) {}
      }

      function notifyEnded() {
        try {
          window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
        } catch(e) {}
      }

      art.on("video:timeupdate", sendStatus);
      art.on("video:loadedmetadata", sendStatus);
      art.on("video:play", sendStatus);
      art.on("video:pause", sendStatus);
      art.on("video:playing", sendStatus);
      art.on("video:progress", sendStatus);
      art.on("video:ended", notifyEnded);

      setInterval(sendStatus, 250);

      // Ponte de comandos completos para a Skin Netflix
      window.addEventListener("message", function(e) {
        if (!e.data) return;
        var v = art.video || document.querySelector("video");
        var msgType = e.data.type || e.data.action;

        switch (msgType) {
          case "PLAY":
          case "play":
            if (art) art.play().catch(function() {});
            else if (v) v.play().catch(function() {});
            sendStatus();
            break;
          case "PAUSE":
          case "pause":
            if (art) art.pause();
            else if (v) v.pause();
            sendStatus();
            break;
          case "TOGGLE_PLAY":
          case "togglePlay":
            if (art) art.toggle();
            else if (v) { v.paused ? v.play().catch(function() {}) : v.pause(); }
            sendStatus();
            break;
          case "SEEK":
          case "seek":
          case "SEEK_ABSOLUTE":
            var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
            if (typeof t === "number" && !isNaN(t)) {
              if (art) art.currentTime = t;
              else if (v) v.currentTime = t;
              sendStatus();
            }
            break;
          case "SEEK_RELATIVE":
            var delta = Number(e.data.seconds) || 0;
            var curTime = (v ? v.currentTime : (art ? art.currentTime : 0)) || 0;
            var maxDur = (v && v.duration > 0 ? v.duration : (window.__streamDuration || 99999));
            var newTarget = Math.max(0, Math.min(curTime + delta, maxDur));
            if (art) art.currentTime = newTarget;
            else if (v) v.currentTime = newTarget;
            sendStatus();
            break;
          case "SET_PLAYBACK_RATE":
          case "setPlaybackRate":
            var rate = Number(e.data.rate) || 1;
            if (art) art.playbackRate = rate;
            if (v) v.playbackRate = rate;
            sendStatus();
            break;
          case "SKIP_INTRO":
            var sec = Number(e.data.seconds) || 85;
            var curIntro = (v ? v.currentTime : (art ? art.currentTime : 0)) || 0;
            var maxD = (v && v.duration > 0 ? v.duration : (window.__streamDuration || 99999));
            var targetIntro = Math.max(0, Math.min(curIntro + sec, maxD - 5));
            if (art) art.currentTime = targetIntro;
            else if (v) v.currentTime = targetIntro;
            sendStatus();
            break;
          case "SET_VOLUME":
          case "setVolume":
            if (typeof e.data.volume === "number") {
              if (art) art.volume = e.data.volume;
              if (v) v.volume = e.data.volume;
              sendStatus();
            }
            break;
          case "SET_MUTED":
          case "setMuted":
            var shouldMute = !!e.data.muted;
            if (art) art.muted = shouldMute;
            if (v) v.muted = shouldMute;
            sendStatus();
            break;
          case "REQUEST_STATUS":
          case "requestStatus":
            sendStatus();
            break;
        }
      });

      window.addEventListener('offline', function() {
        try {
          window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "vip_network_offline" }, "*");
        } catch(e) {}
      });

      art.on("video:ended", notifyEnded);
    })();
  </script>
</body>
</html>`);
              } catch (optErr) {
                console.warn("[VIP Option Error]:", optErr);
              }
            }
          }
        }
      } catch (directExtractErr) {
        console.warn("[VIP Direct Stream Extraction Error]:", directExtractErr);
      }

      // Se o playerflix não retornou opções válidas ou está sem fontes seguras para esta mídia, comuta direto para o WatchPlayer Oficial
      if (!ajaxHadValidSources) {
        console.warn(`[VIP Player]: Provedor sem fontes válidas para ${resolvedId}. Redirecionando transparentemente para o WatchPlayer Oficial...`);
        const wpTarget = (type === "tv" || type === "series")
          ? `https://v1.watchplay.shop/tvshow/${resolvedId}/${season}/${episode}`
          : `https://v1.watchplay.shop/movie/${resolvedId}`;
        return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
      }

      // 2. FALLBACK SEGURO VIA PROXY DE HTML COM AUTO-DESTRUIÇÃO DE LOADER E ANTI-POPUP
      const targetUrl = (type === "tv" || type === "series")
        ? `https://playerflix.ink/serie/${resolvedId}/${season}/${episode}`
        : `https://playerflix.ink/filme/${resolvedId}`;

      const looksBlocked = (html: string, status: number): boolean => {
        if (status === 403 || status === 503) return true;
        const lower = (html || "").toLowerCase();
        if (
          lower.includes("cf-error-details") ||
          lower.includes("attention required") ||
          lower.includes("checking your browser") ||
          lower.includes("just a moment") ||
          lower.includes("cf-browser-verification") ||
          lower.includes("ray id") ||
          (lower.includes("error code") && lower.includes("cloudflare"))
        ) {
          return true;
        }
        if (!lower.includes("base_config")) {
          return true;
        }
        return false;
      };

      let myembedRes = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://myembed.biz/",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        }
      });

      let playerHtml = await myembedRes.text();

      if (looksBlocked(playerHtml, myembedRes.status)) {
        console.warn(`[MyEmbed Stream] playerflix.ink bloqueado. Tentando myembed.biz...`);
        const fallbackUrl = (type === "tv" || type === "series")
          ? `https://myembed.biz/serie/${resolvedId}/${season}/${episode}`
          : `https://myembed.biz/filme/${resolvedId}`;

        const fallbackRes = await fetch(fallbackUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://myembed.biz/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
          }
        });

        const fallbackHtml = await fallbackRes.text();

        if (looksBlocked(fallbackHtml, fallbackRes.status)) {
          console.warn(`[MyEmbed Stream] Provedores VIP sem stream limpo. Redirecionando transparentemente para o WatchPlayer Oficial...`);
          const wpTarget = (type === "tv" || type === "series")
            ? `https://v1.watchplay.shop/tvshow/${resolvedId}/${season}/${episode}`
            : `https://v1.watchplay.shop/movie/${resolvedId}`;
          return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
        }

        playerHtml = fallbackHtml;
      }

      // Remove disable-devtool e scripts que forçam tela preta
      playerHtml = playerHtml.replace(/<script[^>]*disable-devtool[^>]*><\/script>/gi, '');
      playerHtml = playerHtml.replace(/<script[^>]*src=[\"'][^\"']*(?:mypopads|developersonne|googlesyndication|inmobi|themoneytizer|waust|beacon)[^\"']*[\"'][^>]*><\/script>/gi, '');
      playerHtml = playerHtml.replace(/aHR0cHM6Ly9kZXZlbG9wZXJzb25lLmNvbS5ici9sb2FkLnBocD9yPXBvcA==/g, '');
      playerHtml = playerHtml.replace(/aHR0cHM6Ly9teXBvcGFkcy5jb20vcmVxdWVzdHMvZGlzcGxheS5waHA/g, '');

      // Redireciona Ajax para proxy local
      playerHtml = playerHtml.replace(/BASE_URL:\s*['"]https:\/\/(playerflix\.ink|myembed\.biz)['"]/gi, `BASE_URL: ''`);
      playerHtml = playerHtml.replace(/<iframe(.*?)>/i, '<iframe$1 sandbox="allow-scripts allow-same-origin allow-presentation">');

      // Escudo Anti-Popup e Destruidor de 'Carregando'
      const shieldScript = `
        <style>
          .vast-ad-container, .vast-blocker, [class*="vast"], [id*="vast"],
          [class*="popad"], [id*="popad"], .ad-overlay, .ad-banner, .advertisement,
          div[style*="z-index: 2147483647"], div[style*="z-index: 999999"],
          iframe[src*="pop"], iframe[src*="ad"],
          #options, .options, .seasonepisodeSelector, .btn-opcoes, .mostrar_opcoes,
          .player_select_item, .changeOptions, #header, header {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            width: 0px !important;
            height: 0px !important;
          }
        </style>
        <script>
          window.open = function() {
            console.warn('[Play Infinity Anti-Popup] Popup bloqueado.');
            return null;
          };
          window.alert = function() {};
          window.confirm = function() { return false; };
          window.onbeforeunload = null;

          function sendStatus() {
            var v = document.querySelector('video');
            if (!v) return;
            var dur = v.duration || 0;
            var cur = v.currentTime || 0;
            var buf = (v.buffered && v.buffered.length > 0) ? v.buffered.end(v.buffered.length - 1) : 0;
            try {
              window.parent.postMessage({
                type: 'WATCHPLAY_STATUS',
                currentTime: cur,
                duration: dur,
                paused: !!v.paused,
                muted: !!v.muted,
                volume: typeof v.volume === 'number' ? v.volume : 1,
                buffered: buf,
                playbackRate: v.playbackRate || 1,
                readyState: v.readyState || 0
              }, '*');
            } catch(e) {}
          }

          // Auto-elimina overlay de "Carregando" e seleciona a opção automaticamente
          setTimeout(function() {
            try {
              var loader = document.getElementById('playerLoader') || document.querySelector('.pro-loader');
              if (loader) {
                loader.style.opacity = '0';
                loader.style.pointerEvents = 'none';
                setTimeout(function() { if (loader) loader.remove(); }, 300);
              }
              var opt = document.querySelector('.option');
              if (opt && typeof opt.click === 'function') {
                opt.click();
              }
            } catch(e) {}
          }, 800);

          setInterval(function() {
            try {
              const skipButtons = document.querySelectorAll('.skip-button, .vast-skip-button, [class*="skip"], [id*="skip"], [class*="close-ad"]');
              skipButtons.forEach(function(btn) { if (typeof btn.click === 'function') btn.click(); });

              const adElements = document.querySelectorAll('.vast-ad-container, .vast-blocker, [class*="vast-ad"], [id*="vast-ad"]');
              adElements.forEach(function(el) { el.remove(); });
              
              const iframes = document.querySelectorAll('iframe:not([sandbox])');
              iframes.forEach(function(ifr) {
                ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
              });
            } catch(e) {}
            sendStatus();
          }, 250);

          window.addEventListener('message', function(e) {
            if (!e.data) return;
            var v = document.querySelector('video');
            if (!v) return;
            var msgType = e.data.type || e.data.action;
            switch(msgType) {
              case 'PLAY': case 'play': v.play().catch(function(){}); sendStatus(); break;
              case 'PAUSE': case 'pause': v.pause(); sendStatus(); break;
              case 'TOGGLE_PLAY': case 'togglePlay': v.paused ? v.play().catch(function(){}) : v.pause(); sendStatus(); break;
              case 'SEEK': case 'seek': case 'SEEK_ABSOLUTE':
                var t = typeof e.data.time === 'number' ? e.data.time : e.data.targetTime;
                if (typeof t === 'number' && !isNaN(t)) { v.currentTime = t; sendStatus(); }
                break;
              case 'SEEK_RELATIVE':
                var delta = Number(e.data.seconds) || 0;
                v.currentTime = Math.max(0, Math.min(v.currentTime + delta, (v.duration || 99999)));
                sendStatus();
                break;
              case 'SET_PLAYBACK_RATE': case 'setPlaybackRate':
                v.playbackRate = Number(e.data.rate) || 1;
                sendStatus();
                break;
              case 'SKIP_INTRO':
                var sec = Number(e.data.seconds) || 85;
                v.currentTime = Math.max(0, Math.min(v.currentTime + sec, (v.duration || 99999) - 5));
                sendStatus();
                break;
              case 'SET_VOLUME': case 'setVolume':
                if (typeof e.data.volume === 'number') { v.volume = e.data.volume; sendStatus(); }
                break;
              case 'SET_MUTED': case 'setMuted':
                v.muted = !!e.data.muted;
                sendStatus();
                break;
              case 'REQUEST_STATUS': case 'requestStatus':
                sendStatus();
                break;
            }
          });
        </script>
      `;

      if (playerHtml.includes("<head>")) {
        playerHtml = playerHtml.replace("<head>", "<head>" + shieldScript);
      } else {
        playerHtml = shieldScript + playerHtml;
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res.send(playerHtml);
    } catch (err: any) {
      console.error("[MyEmbed Stream Proxy Error]:", err);
      return res.status(500).send("Erro ao processar stream do MyEmbed.");
    }
  });

  // Vite middleware for development
  
  // API: Extrator Direto da EmbedPlayAPI (Permanentemente desativado - na blacklist)
  app.get("/api/embedplay-direct", (_req, res) => {
    return res.status(403).json({ 
      error: "Servidor EmbedPlay está bloqueado na blacklist permanente. Use exclusivamente o WatchPlayer." 
    });
  });

  // API: Resolver do BYSE Player (Permanentemente desativado - na blacklist)
  app.get("/api/byse-stream", (_req, res) => {
    return res.status(403).json({ 
      error: "Servidor BYSE/Streamberry está bloqueado na blacklist permanente. Use exclusivamente o WatchPlayer." 
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        watch: {
          ignored: [
            '**/data/**',
            '**/scratch/**',
            '**/*.tmp*',
            '**/*.log',
            '**/.system_generated/**',
            '**/*.md',
          ],
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
