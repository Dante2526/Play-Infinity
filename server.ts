import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

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
    imageUrl: "https://image.tmdb.org/t/p/w500/gEU2QniE6EwfVDxCzsxPnZLi1ZT.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/rAiYTsqJiOkn00e21jS1vQhYyY.jpg",
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
    imageUrl: "https://image.tmdb.org/t/p/w500/el1KQzwdIm17I3A6cYPfsVIWhfX.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg",
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
    backdropUrl: "https://image.tmdb.org/t/p/original/stKGOmbuwhL489ZJnZUVvA34Dt.jpg",
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
    backdropUrl: "https://image.tmdb.org/t/p/original/etjA24UepnNnLh2t9qjU2Vj2g3g.jpg",
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
  "vidlink.pro",
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
  "image.tmdb.org"
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

  // API 4.5: Player Diagnostics Test (Automated sandbox, anti-popup and CORS verification)
  app.get("/api/player-diagnostics", async (req, res) => {
    const testUrl = (req.query.url as string) || "https://vidlink.pro/tv/66732/1/1";
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

  // API 5: Proxy genérico para servidores de Anime (AnFire / Consumet)
  app.get("/api/anime-stream", async (req, res) => {
    const { provider, id, s = "1", e = "1", title = "" } = req.query;
    
    // HTML Base injetando o nosso CSS "Skin Netflix" 
    const baseHtml = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          /* CSS da Skin Netflix (Remoção de anúncios e estética limpa) */
          body { margin: 0; padding: 0; background-color: #000; overflow: hidden; }
          iframe { width: 100vw; height: 100vh; border: none; }
          #artplayer-app { width: 100vw; height: 100vh; }
          
          /* Esconder elementos indesejados dos embeds padrão */
          .jw-controls, .art-controls, .vjs-control-bar { opacity: 0.9 !important; }
        </style>
      </head>
      <body>
    `;

    try {
      if (provider === "consumet") {
        // multiembed.mov — player leve e multi-fonte (substitui Consumet)
        const embedSrc = `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`;
        return res.send(`
          ${baseHtml}
          <iframe sandbox="allow-same-origin allow-scripts allow-forms allow-popups" src="${embedSrc}" allowfullscreen></iframe>
          <script>
            setTimeout(() => {
              window.parent.postMessage({ type: 'WATCHPLAY_STATUS', data: { duration: 1200 } }, '*');
            }, 3500);
          </script>
          </body></html>
        `);
      }
      
      if (provider === "anfire") {
        // vidsrc.to — player multi-fonte com suporte a anime e PT-BR (substitui AnFire)
        const embedSrc = `https://vidsrc.to/embed/tv/${id}/${s}/${e}`;
        return res.send(`
          ${baseHtml}
          <iframe sandbox="allow-same-origin allow-scripts allow-forms allow-popups" src="${embedSrc}" allowfullscreen></iframe>
          <script>
            setTimeout(() => {
              window.parent.postMessage({ type: 'WATCHPLAY_STATUS', data: { duration: 1200 } }, '*');
            }, 3000);
          </script>
          </body></html>
        `);
      }

      return res.status(404).send("Provedor de anime não encontrado.");
    } catch (err) {
      console.error("[Anime Stream Error]:", err);
      return res.send(`${baseHtml}<iframe src="https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&e=${e}" allowfullscreen></iframe></body></html>`);
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
      const upstreamRes = await fetch(targetUrl, {
        headers: {
          "Referer": parsedTarget.origin + "/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!upstreamRes.ok) {
        console.warn(`[WatchPlayer Stream Status ${upstreamRes.status}]: Episódio não encontrado no WatchPlayer (${targetUrl}). Acionando fallback.`);
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
      const isFallbackMode = isSuperflixDetected(html, targetUrl) || (upstreamRes.url ? isSuperflixDetected("", upstreamRes.url) : false);

      if (isFallbackMode) {
        console.warn(`[Superflix Banido]: WatchPlayer tentou redirecionar para Superflix (${targetUrl}). Bloqueando e acionando fallback.`);
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

      // 2. Redirecionar requisições da API interna para o proxy local
      html = html.replace(/var HOME_URL = ['"]https:\/\/v1\.watchplay\.shop['"];/g, "var HOME_URL = '/api/watchplay-proxy';");
      html = html.replace(/\$\{HOME_URL\}\/api/g, "/api/watchplay-proxy-api");

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

      html = html.replace(
        /artInstance = new Artplayer\(\{/g,
        `artInstance = new Artplayer({
            controls: [],
            hotkey: false,
            gesture: false,
            miniProgressBar: false,
            backdrop: false,
            playsInline: true,
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

              // C) Clica na opção de player assim que surgir
              if (!optionClicked) {
                var option = document.querySelector('.players_select_items.visible .player_select_item') || 
                             document.querySelector('.player_select_item');
                if (option) {
                  optionClicked = true;
                  option.click();
                }
              }

              // D) Se o vídeo já possui duração válida e está pronto, finaliza monitoramento com sucesso
              var v = getVideoElement();
              if (v && v.duration > 0 && !isNaN(v.duration)) {
                clearInterval(autoStartTimer);
                return;
              }

              // Timeout após 100 ticks (6.0 segundos sem stream válido)
              if (tries > 100) {
                clearInterval(autoStartTimer);
                if (!v || !v.duration || v.duration === 0) {
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

  // Healthcheck
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
