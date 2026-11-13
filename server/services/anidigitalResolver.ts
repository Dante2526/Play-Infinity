/**
 * ============================================================================
 * PLAY INFINITY — RESOLVER DO CATALOGO ANIMESDIGITAL (anime FHD HLS)
 * ============================================================================
 *
 * Engenharia reversa de animesdigital.org (02/11/2026):
 *
 *   (1) BUSCA:      POST /func/listanime  (token data-secury raspado de
 *                   qualquer pagina de listagem; ~19k itens indexados)
 *   (2) EPISODIO:   GET  /video/a/<id>/   → iframe player1 com
 *                   api.anivideo.net/videohls.php?d=<m3u8-CDN>
 *   (3) SERIE:      GET  /anime/a/<slug>  → 301 → /anime/b/<slug-obf>
 *                   com paginacao /page/N/ (~50 eps/pagina, mais novos
 *                   primeiro) — usado como fallback quando a busca nao
 *                   devolve o episodio exato.
 *   (4) MANIFESTO:  GET  direto na CDN (sem Referer!) —
 *                   series: cdn-sXX.mywallpaper-4k-image.net
 *                   filmes: cdn-svXX.maximaimg.online
 *                   Segmentos disfarçados de .webp (na real MPEG-TS) com
 *                   CORS access-control-allow-origin:* — o hls.js baixa
 *                   direto da CDN, ZERO banda de video na VPS.
 *
 * DECISAO DE ARQUITETURA (ADR-0004): so o MANIFESTO passa pelo nosso
 * /api/anidigital-stream (com assinatura HMAC + allowlist de host), e o
 * rewrite apenas converte segmentos relativos em ABSOLUTOS na CDN. O proxy
 * de segmento do Saimo existe porque o CDN FirePlayer exige Referer — o
 * CDN do animesdigital nao exige nada.
 */

import { isServerBlacklisted } from "../../src/data/serverBlacklist";
import { getAnidigitalStore } from "./anidigitalSqliteStore";

export const ANIDIGITAL_BASE = "https://animesdigital.org";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** CDNs homologadas do animesdigital (series cdn-sXX / filmes cdn-svXX). */
const ANIDIGITAL_CDN_HOST_PATTERNS: RegExp[] = [
  /^cdn-s\d+\.mywallpaper-4k-image\.net$/i,
  /^cdn-sv\d+\.maximaimg\.online$/i,
];

export function isAnidigitalCdnUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ANIDIGITAL_CDN_HOST_PATTERNS.some((p) => p.test(host));
  } catch {
    return false;
  }
}

/** Normaliza titulo para comparacao (sem acentos, sem pontuacao, lowercase). */
export function normalizeAnidigitalTitle(t?: string): string {
  if (!t || typeof t !== "string") return "";
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove sufixo de audio/episodio do titulo de resultado ("One Piece Dublado Episódio 12" → "One Piece"). */
export function stripEpisodeSuffix(title: string): string {
  return title
    .replace(/\s*(?:dublado|legendado)\s*(?:epis[oó]dio\s*\d+)?\s*$/i, "")
    .replace(/\s*epis[oó]dio\s*\d+\s*$/i, "")
    .replace(/\s*ova\s+filme.*$/i, "")
    .trim();
}

/**
 * Deriva o slug de série/filme do site a partir do título TMDB.
 * "Tank Chair" → "tank-chair"; "One Piece (Dublado)" → "one-piece".
 * O site atende /anime/a/<slug> (leg) e /anime/a/<slug>-dublado (dub).
 */
export function slugifyAnidigitalTitle(title: string): string {
  return normalizeAnidigitalTitle(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export interface AnidigitalSearchResult {
  url: string;
  title: string;
  episode?: number;
  audio: "dub" | "leg";
}

export interface AnidigitalResolution {
  m3u8?: string;
  title?: string;
  audio: "dub" | "leg";
  dub: boolean;
  leg: boolean;
  resolvedAt: number;
}

// ── Cache (mesma filosofia do byse: dedupe de resolucoes em voo) ──
const RESOLVE_TTL_OK = 6 * 60 * 60 * 1000; // 6h para resolucoes positivas
const RESOLVE_TTL_FAIL = 20 * 60 * 1000; // 20min para negativas (site instavel)
const TOKEN_TTL = 45 * 60 * 1000;

const resolutionCache = new Map<string, AnidigitalResolution>();
const inFlight = new Map<string, Promise<AnidigitalResolution>>();

let tokenCache: { token: string; at: number } | null = null;

function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 12000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = rest.signal || controller.signal;
  if (rest.signal) {
    rest.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return fetch(url, {
    ...rest,
    signal,
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "pt-BR,pt;q=0.9",
      ...(rest.headers as Record<string, string> | undefined),
    },
  }).finally(() => clearTimeout(timer));
}

/** Raspagem do token de busca (data-secury) de uma pagina de listagem. */
export async function getAnidigitalSearchToken(force = false): Promise<string> {
  if (!force && tokenCache && Date.now() - tokenCache.at < TOKEN_TTL) {
    return tokenCache.token;
  }
  const res = await fetchWithTimeout(`${ANIDIGITAL_BASE}/animes-legendados-online001`, { timeoutMs: 10000 });
  if (!res.ok) throw new Error(`Anidigital: listagem HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/data-secury="([a-f0-9]{6,32})"/);
  if (!m) throw new Error("Anidigital: token data-secury não encontrado");
  tokenCache = { token: m[1], at: Date.now() };
  return m[1];
}

/**
 * Busca de episodios/titulos no endpoint /func/listanime.
 * Cada resultado é um HTML de card; extraimos href + titulo.
 */
export async function searchAnidigital(query: string, limit = 30): Promise<AnidigitalSearchResult[]> {
  const token = await getAnidigitalSearchToken();
  const body = new URLSearchParams({
    token,
    pagina: "1",
    search: query,
    limit: String(limit),
    type: "lista",
    filters: "",
  });
  const res = await fetchWithTimeout(`${ANIDIGITAL_BASE}/func/listanime`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${ANIDIGITAL_BASE}/animes-legendados-online001`,
      Origin: ANIDIGITAL_BASE,
    },
    body: body.toString(),
    timeoutMs: 12000,
  });
  if (!res.ok) throw new Error(`Anidigital: busca HTTP ${res.status}`);
  const data = (await res.json()) as { results?: string[] };
  const out: AnidigitalSearchResult[] = [];
  for (const cardHtml of data.results || []) {
    const href = cardHtml.match(/href="(https:\\?\/\\?\/animesdigital\.org\\?\/video\\?\/a\\?\/[0-9a-z]+\\?\/?)"/);
    const title = cardHtml.match(/title_anime">([^<]+)</);
    if (!href || !title) continue;
    const url = href[1].replace(/\\/g, "");
    const rawTitle = title[1].replace(/\\/g, "");
    const epMatch = rawTitle.match(/epis[oó]dio\s*(\d+)/i);
    out.push({
      url,
      title: rawTitle,
      episode: epMatch ? Number(epMatch[1]) : undefined,
      audio: /dublado/i.test(rawTitle) ? "dub" : "leg",
    });
  }
  return out;
}

/**
 * Extrai o m3u8 do CDN a partir do HTML da pagina /video/a/<id>/.
 * Player1 (FHD) = iframe api.anivideo.net/videohls.php?d=<m3u8>.
 * O player2 (backup blogspot) é ignorado — nao é HLS.
 */
export function extractM3u8FromEpisodeHtml(html: string): string | null {
  const m = html.match(/videohls\.php\?d=([^&"]+)/);
  if (!m) return null;
  let raw = m[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* URL ja decodificada */
  }
  raw = raw.replace(/&amp;/g, "&").trim();
  return /^https?:\/\//i.test(raw) ? raw : null;
}

/** Busca o link da serie (/anime/a/<slug> ou /anime/b/<slug-obf>) dentro da pagina do episodio. */
export function extractSeriesLinkFromEpisodeHtml(html: string): string | null {
  const m = html.match(/href="(https?:\/\/animesdigital\.org\/anime\/[ab]\/[a-z0-9-]+)"/i);
  return m ? m[1] : null;
}

async function fetchEpisodeStreamUrl(episodeUrl: string): Promise<string | null> {
  const res = await fetchWithTimeout(episodeUrl, { timeoutMs: 12000 });
  if (!res.ok) return null;
  const html = await res.text();
  const m3u8 = extractM3u8FromEpisodeHtml(html);
  if (!m3u8 || !isAnidigitalCdnUrl(m3u8) || isServerBlacklisted(m3u8)) return null;
  return m3u8;
}

/**
 * Procura o episodio alvo na pagina (ou paginacao) de uma serie.
 * `page1Html` opcional evita refazer o GET quando o chamador ja tem o HTML
 * (probe de slug). Eps mais recentes primeiro; a pagina do alvo é estimada
 * pela ULTIMA pagina da paginacao.
 */
async function resolveViaSeriesPage(
  seriesLink: string,
  targetEpisode: number,
  page1Html?: string
): Promise<{ m3u8: string; title: string } | null> {
  const html =
    page1Html !== undefined
      ? page1Html
      : await (async () => {
          const res = await fetchWithTimeout(seriesLink, {
            headers: { Referer: ANIDIGITAL_BASE },
            timeoutMs: 12000,
            redirect: "follow",
          });
          return res.ok ? res.text() : "";
        })();
  if (!html) return null;

  // Paginacao: <li><a href=".../page/25/">25</a></li> — ultimo numero = total
  const pageNumbers = [...html.matchAll(/\/page\/(\d+)\/"/g)].map((m) => Number(m[1]));
  const lastPage = pageNumbers.length ? Math.max(...pageNumbers) : 1;

  // Abas de episodios na pagina (itens_ep): href + "Episódio N"
  const parseItems = (pageHtml: string) =>
    [...pageHtml.matchAll(
      /href="(https:\/\/animesdigital\.org\/video\/a\/[0-9a-z]+\/?)"[\s\S]{0,600}?title_anime">([^<]+)</g
    )].map((m) => ({ url: m[1], title: m[2] }));

  const episodesOnPage = parseItems(html);

  const base = seriesLink.replace(/\/$/, "");
  const pagesToTry = new Set<number>([1, lastPage]);

  // Estimativa: ~45 eps/pagina, mais novos primeiro. Ep baixo → pagina alta.
  if (lastPage > 1) {
    const epsPerPage = Math.max(20, Math.ceil((episodesOnPage.length > 3 ? episodesOnPage.length * lastPage : 45 * lastPage) / lastPage));
    const estimated = Math.max(1, Math.min(lastPage, lastPage - Math.floor((targetEpisode - 1) / epsPerPage)));
    pagesToTry.add(estimated);
    pagesToTry.add(Math.max(1, estimated - 1));
    pagesToTry.add(Math.min(lastPage, estimated + 1));
  }

  for (const page of pagesToTry) {
    const pageHtml =
      page === 1 ? html : await (async () => {
        const r = await fetchWithTimeout(`${base}/page/${page}/`, { headers: { Referer: base }, timeoutMs: 12000 });
        return r.ok ? r.text() : "";
      })();
    if (!pageHtml) continue;
    const hit = parseItems(pageHtml).find((m) => {
      const ep = m.title.match(/epis[oó]dio\s*(\d+)/i);
      return ep && Number(ep[1]) === targetEpisode;
    });
    if (hit) {
      const m3u8 = await fetchEpisodeStreamUrl(hit.url);
      if (m3u8) return { m3u8, title: hit.title };
    }
  }
  return null;
}

/**
 * Probe direto por slug — contorna o indice de busca DEFAStado do site
 * (titulos recentes nao retornam resultado no /func/listanime; o endpoint
 * responde o JSON de erro no_verify_nonce em vez de lista vazia).
 * Series: /anime/a/<slug> (leg) e /anime/a/<slug>-dublado (dub).
 * Filmes: /filme/<slug>.
 */
async function resolveViaSlugProbe(
  slug: string,
  opts: { type: "movie" | "tv"; episode: number; audio: "dub" | "leg" }
): Promise<{ m3u8: string; title: string } | null> {
  if (!slug) return null;

  const tryPaths: string[] = [];
  if (opts.type === "movie") {
    tryPaths.push(`${ANIDIGITAL_BASE}/filme/${slug}`);
  } else {
    tryPaths.push(opts.audio === "dub" ? `${ANIDIGITAL_BASE}/anime/a/${slug}-dublado` : `${ANIDIGITAL_BASE}/anime/a/${slug}`);
    if (opts.audio === "dub") tryPaths.push(`${ANIDIGITAL_BASE}/anime/a/${slug}`);
  }

  for (const path of tryPaths) {
    const res = await fetchWithTimeout(path, {
      headers: { Referer: ANIDIGITAL_BASE },
      timeoutMs: 12000,
      redirect: "follow",
    });
    if (!res.ok) continue;
    const html = await res.text();
    if (!html) continue;

    if (opts.type === "movie") {
      const m3u8 = extractM3u8FromEpisodeHtml(html);
      if (m3u8 && isAnidigitalCdnUrl(m3u8) && !isServerBlacklisted(m3u8)) {
        return { m3u8, title: slug };
      }
      continue;
    }

    // Serie: precisa ter lista de episodios na pagina
    if (!html.includes("title_anime") && !html.includes("itens_ep")) continue;

    // Episodio alvo na propria pagina (series curtas) ou via paginacao
    const viaSeries = await resolveViaSeriesPage(res.url || path, opts.episode, html);
    if (viaSeries) return viaSeries;
  }
  return null;
}

export interface AnidigitalResolveOptions {
  name: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  audio?: "dub" | "leg";
  force?: boolean;
  /** tmdb_id do TMDB — quando presente, o resolver consulta o catálogo SQLite
   *  (data/anidigital-catalog.db) PRIMEIRO (lookup instantâneo por tmdb_id).
   *  Se não achar, cai pro live search em /func/listanime. */
  tmdbId?: number;
}

/**
 * Resolve um titulo TMDB → m3u8 do CDN animesdigital.
 *
 * Fluxo: busca por nome → filtro de audio → match de episodio (ou
 * fallback pela pagina da serie) → scraping do iframe → m3u8 validado.
 *
 * Para temporadas > 1 tentamos tambem numeracao absoluta com 12/13 eps
 * por temporada (convencao de anime) — o animesdigital numera episodos
 * de forma absoluta por serie.
 */
function resolveByTmdbId(
  tmdbId: number,
  type: "movie" | "tv",
  season: number | undefined,
  episode: number | undefined,
  wantAudio: "dub" | "leg",
): AnidigitalResolution | null {
  const store = getAnidigitalStore();
  if (!store) return null;
  try {
    // episodeIndex.get / movieIndex.get JÁ parseiam o payload (vizerSqliteStore)
    // e retornam o objeto diretamente (null se ausente).
    if (type === "tv") {
      const s = Math.max(1, season || 1);
      const ep = Math.max(1, episode || 1);
      const p = store.episodeIndex.get(`${tmdbId}:${s}:${ep}`) || (s <= 1 ? store.episodeIndex.get(`${tmdbId}:1:${ep}`) : undefined);
      if (!p) return null;
      const choice = p[wantAudio] || p.dub || p.leg;
      if (!choice || !choice.streamUrl || !isAnidigitalCdnUrl(choice.streamUrl)) return null;
      return {
        m3u8: choice.streamUrl,
        title: p.title,
        audio: p.dub && choice === p.dub ? "dub" : "leg",
        dub: !!p.dub,
        leg: !!p.leg,
        resolvedAt: Date.now(),
      };
    } else {
      const p = store.movieIndex.get(tmdbId);
      if (!p) return null;
      const choice = p[wantAudio] || p.dub || p.leg;
      if (!choice || !choice.streamUrl || !isAnidigitalCdnUrl(choice.streamUrl)) return null;
      return {
        m3u8: choice.streamUrl,
        title: p.title,
        audio: p.dub && choice === p.dub ? "dub" : "leg",
        dub: !!p.dub,
        leg: !!p.leg,
        resolvedAt: Date.now(),
      };
    }
  } catch {
    return null;
  }
}

export async function resolveAnidigitalStream(opts: AnidigitalResolveOptions): Promise<AnidigitalResolution> {
  // ---- SQLite-first: se tmdb_id disponível, consulta o catálogo antes do live search ----
  if (opts.tmdbId && Number.isFinite(opts.tmdbId)) {
    const sqliteWantAudio: "dub" | "leg" = opts.audio === "leg" ? "leg" : "dub";
    const hit = resolveByTmdbId(opts.tmdbId, opts.type, opts.season, opts.episode, sqliteWantAudio);
    if (hit) return hit;
    // senão: cai pro live search abaixo (fallback)
  }

  const key = [
    normalizeAnidigitalTitle(opts.name),
    opts.type,
    opts.type === "tv" ? `s${opts.season || 1}e${opts.episode || 1}` : "",
    opts.audio || "",
  ].join("|");

  const cached = resolutionCache.get(key);
  if (!opts.force && cached) {
    const ttl = cached.m3u8 ? RESOLVE_TTL_OK : RESOLVE_TTL_FAIL;
    if (Date.now() - cached.resolvedAt < ttl) return cached;
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const job = (async (): Promise<AnidigitalResolution> => {
    const now = Date.now();
    const wantAudio: "dub" | "leg" = opts.audio === "dub" ? "dub" : "leg";

    const query = (opts.name || "").trim();
    if (!query) {
      return { audio: wantAudio, dub: false, leg: false, resolvedAt: now };
    }

    let dub = false;
    let leg = false;

    try {
      // ── (1) Probe direto por slug (1 request, sem token) ──
      // O indice de busca do site é defasado (titulos recentes nao retornam
      // resultado — o endpoint responde no_verify_nonce em vez de vazio), e
      // o slug do site é derivável do título: /anime/a/<slug> (leg),
      // /anime/a/<slug>-dublado (dub), /filme/<slug> (filme).
      const slug = slugifyAnidigitalTitle(query);
      const viaSlug = await resolveViaSlugProbe(slug, {
        type: opts.type,
        episode: Math.max(1, opts.episode || 1),
        audio: wantAudio,
      });
      if (viaSlug) {
        const resolution: AnidigitalResolution = {
          m3u8: viaSlug.m3u8,
          title: viaSlug.title,
          audio: wantAudio,
          dub: wantAudio === "dub" ? true : dub,
          leg: wantAudio === "leg" ? true : leg,
          resolvedAt: Date.now(),
        };
        resolutionCache.set(key, resolution);
        return resolution;
      }

      // ── (2) Busca no /func/listanime (fallback do slug) ──
      const results = await searchAnidigital(query, 30);
      dub = results.some((r) => r.audio === "dub");
      leg = results.some((r) => r.audio === "leg");

      let target: AnidigitalSearchResult | undefined;
      if (results.length) {
        const normQuery = normalizeAnidigitalTitle(query);
        // Mantém só resultados da MESMA serie (titulo base igual ao buscado)
        const sameSeries = results.filter((r) => {
          const base = normalizeAnidigitalTitle(stripEpisodeSuffix(r.title));
          return base === normQuery || (base.length > 3 && (base.startsWith(normQuery) || normQuery.startsWith(base)));
        });
        const pool = sameSeries.length ? sameSeries : results;

        const byAudio = pool.filter((r) => r.audio === wantAudio);
        const audioPool = byAudio.length ? byAudio : pool;

        if (opts.type === "tv") {
          // Numeros candidatos: episodio da temporada + numeracao absoluta (12/13 eps/temp)
          const s = Math.max(1, opts.season || 1);
          const e = Math.max(1, opts.episode || 1);
          const candidates = s === 1 ? [e] : [e, e + (s - 1) * 12, e + (s - 1) * 13, e + (s - 1) * 24];
          for (const epNum of candidates) {
            target = audioPool.find((r) => r.episode === epNum);
            if (target) break;
          }
        } else {
          // Filme: resultado sem "Episódio" (ou "filme"/"ova" no titulo)
          target =
            audioPool.find((r) => r.episode === undefined && /filme|ova|movie/i.test(r.title)) ||
            audioPool.find((r) => r.episode === undefined) ||
            audioPool[0];
        }
      }

      let m3u8: string | null = null;
      let title: string | undefined;

      if (target) {
        m3u8 = await fetchEpisodeStreamUrl(target.url);
        title = target.title;
      }

      // ── (3) Fallback: pagina da serie a partir de um resultado da busca ──
      // (numeracao absoluta) quando a busca nao devolveu o episodio exato.
      if (!m3u8 && opts.type === "tv" && results.length) {
        const first = results[0];
        const res = await fetchWithTimeout(first.url, { timeoutMs: 12000 });
        if (res.ok) {
          const epHtml = await res.text();
          const seriesLink = extractSeriesLinkFromEpisodeHtml(epHtml);
          if (seriesLink) {
            const viaSeries = await resolveViaSeriesPage(
              seriesLink,
              Math.max(1, opts.episode || 1)
            );
            if (viaSeries) {
              m3u8 = viaSeries.m3u8;
              title = viaSeries.title;
            }
          }
        }
      }

      const resolution: AnidigitalResolution = {
        m3u8: m3u8 || undefined,
        title,
        audio: wantAudio,
        dub,
        leg,
        resolvedAt: Date.now(),
      };
      resolutionCache.set(key, resolution);
      return resolution;
    } catch {
      // Falha de rede/site: cache negativo curto para nao martelar o site
      const resolution: AnidigitalResolution = {
        audio: wantAudio,
        dub: false,
        leg: false,
        resolvedAt: Date.now(),
      };
      resolutionCache.set(key, resolution);
      return resolution;
    }
  })();

  inFlight.set(key, job);
  try {
    return await job;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Rewrite do manifesto: converte URIs de segmento/playlist RELATIVAS em
 * ABSOLUTAS na CDN. Os segmentos NAO passam pelo proxy — o CDN do
 * animesdigital responde CORS * sem checagem de Referer, entao o hls.js
 * baixa direto (zero banda de video na VPS). Contrastar com o Saimo
 * (saimoRoutes.rewriteHlsPlaylist), que precisa rotear cada segmento pelo
 * /api/saimo-hls-segment porque o CDN FirePlayer exige Referer.
 */
export function rewriteAnidigitalPlaylist(text: string, playlistUrl: string): string {
  const basePath = playlistUrl.substring(0, playlistUrl.lastIndexOf("/") + 1);
  const absolutize = (u: string): string => (u.startsWith("http") ? u : new URL(u, basePath).toString());
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.includes('URI="')) {
        return trimmed.replace(/URI="([^"]+)"/, (_, uri) => `URI="${absolutize(uri)}"`);
      }
      if (trimmed.startsWith("#")) return trimmed;
      return absolutize(trimmed);
    })
    .join("\n");
}

/**
 * Wrapper HTML do player (protocolo WATCHPLAY da NetflixPlayerSkin).
 * HLS-only: manifesto pelo /api/anidigital-stream (assinado), segmentos
 * direto na CDN. Sem escada de protocolo — a unica fonte é HLS; erros
 * fatais escalam para a skin trocar de servidor.
 */
export function buildAnidigitalWrapperHtml(streamUrl: string, initialTime: number, audio: "dub" | "leg"): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>AnimesDigital Player</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; overflow: hidden; width: 100%; height: 100%; }
  #container { width: 100%; height: 100%; position: relative; }
  video { width: 100%; height: 100%; object-fit: contain; }
</style>
</head>
<body>
<div id="container">
  <video id="video" playsinline webkit-playsinline></video>
</div>
<script src="/api/byse-hls.js"><\/script>
<script>
(function() {
  var v = document.getElementById("video");
  var streamUrl = ${JSON.stringify(streamUrl)};
  var initialSeek = ${Number(initialTime) || 0};
  var audioMode = ${JSON.stringify(audio)};
  var fatalReported = false;
  var appliedInitial = false;
  var statusInterval = null;
  var hls = null;

  function reportFatal(reason) {
    if (fatalReported) return;
    fatalReported = true;
    if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }
    try { if (hls) hls.destroy(); } catch(e) {}
    try {
      window.parent.postMessage({
        type: "WATCHPLAY_ERROR",
        reason: reason || "AnimesDigital: erro fatal na reprodução"
      }, "*");
    } catch(e) {}
  }

  function autoPlay() {
    var p = v.play();
    if (p !== undefined) {
      p.catch(function() {
        v.muted = true;
        v.play().then(function() {
          try { window.parent.postMessage({ type: "WATCHPLAY_AUTOPLAY_MUTED" }, "*"); } catch(e) {}
        }).catch(function() {});
      });
    }
  }

  function applySeek() {
    if (!appliedInitial && v && v.readyState >= 1 && initialSeek > 0) {
      appliedInitial = true;
      try { v.currentTime = initialSeek; } catch(e) {}
    }
  }

  function sendStatus() {
    if (!v || fatalReported) return;
    var dur = v.duration || 0;
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
        buffering: (v.readyState < 2 && !(v.duration > 0) && !(v.currentTime > 0)) || (v.readyState < 3 && !v.paused),
        muted: !!v.muted,
        volume: typeof v.volume === "number" ? v.volume : 1,
        buffered: bufferedEnd,
        playbackRate: v.playbackRate || 1,
        readyState: v.readyState || 0
      }, "*");
    } catch(e) {}
  }

  statusInterval = setInterval(sendStatus, 300);

  v.addEventListener("loadedmetadata", applySeek);
  v.addEventListener("canplay", function() {
    applySeek();
    if (v.paused) autoPlay();
  });
  v.addEventListener("play", function() {
    applySeek();
    try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_PLAYING" }, "*"); } catch(e) {}
  });
  v.addEventListener("pause", function() {
    try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_PAUSED" }, "*"); } catch(e) {}
  });
  v.addEventListener("ended", function() {
    try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*"); } catch(e) {}
  });
  v.addEventListener("error", function() {
    /* hls.js acoplado ao MSE trata os proprios erros de midia */
    if (hls) return;
    reportFatal("AnimesDigital: erro de mídia no elemento de vídeo");
  });

  window.addEventListener("message", function(event) {
    if (!event.data) return;
    var d = event.data;
    if (d.type === "PAUSE" && v) { v.pause(); }
    if (d.type === "PLAY" && v) {
      v.play().catch(function(err) {
        if (err && err.name === "NotAllowedError") {
          v.muted = true;
          v.play().catch(function() {});
        }
      });
    }
    if (d.type === "SEEK" && v && typeof d.targetTime === "number") {
      if (v.readyState >= 1) v.currentTime = d.targetTime; else initialSeek = d.targetTime;
    }
    if (d.type === "SEEK_ABSOLUTE" && v && typeof d.time === "number") {
      if (v.readyState >= 1) v.currentTime = d.time; else initialSeek = d.time;
    }
    if (d.type === "SEEK_RELATIVE" && v && typeof d.seconds === "number") {
      v.currentTime = Math.max(0, v.currentTime + d.seconds);
    }
    if (d.type === "SKIP_INTRO" && v) {
      var secIntro = typeof d.seconds === "number" ? d.seconds : 75;
      v.currentTime = Math.max(0, Math.min(v.currentTime + secIntro, (v.duration || 99999) - 5));
    }
    if (d.type === "MUTE" && v) { v.muted = true; }
    if (d.type === "UNMUTE" && v) { v.muted = false; }
    if (d.type === "SET_VOLUME" && v && typeof d.volume === "number") {
      v.volume = Math.max(0, Math.min(1, d.volume));
      if (d.volume > 0) v.muted = false;
    }
    if (d.type === "SET_MUTED" && v) { v.muted = !!d.muted; }
    if (d.type === "SET_PLAYBACK_RATE" && v) {
      var rate = typeof d.rate === "number" ? d.rate : d.playbackRate;
      if (typeof rate === "number") v.playbackRate = rate;
    }
  });

  // Inicializacao: hls.js (MSE) — o manifesto vem do nosso dominio com
  // segmentos absolutos na CDN (CORS *), sem proxy de segmento.
  if (window.Hls && window.Hls.isSupported()) {
    hls = new window.Hls({
      enableWorker: true,
      manifestLoadingTimeOut: 10000,
      levelLoadingTimeOut: 10000,
      fragLoadingTimeOut: 20000
    });
    hls.loadSource(streamUrl);
    hls.attachMedia(v);
    hls.on(window.Hls.Events.MANIFEST_PARSED, function() { autoPlay(); });
    hls.on(window.Hls.Events.ERROR, function(event, data) {
      if (!data || !data.fatal) return;
      var details = data.details || "";
      switch (data.type) {
        case window.Hls.ErrorTypes.NETWORK_ERROR:
          reportFatal("AnimesDigital HLS rede: " + details);
          break;
        case window.Hls.ErrorTypes.MEDIA_ERROR:
          try { hls.recoverMediaError(); } catch(e) { reportFatal("AnimesDigital HLS mídia fatal: " + details); }
          break;
        default:
          reportFatal("AnimesDigital HLS fatal: " + details);
          break;
      }
    });
  } else if (v.canPlayType && v.canPlayType("application/vnd.apple.mpegurl")) {
    // Safari/iOS: HLS nativo
    v.src = streamUrl;
    v.load();
    autoPlay();
  } else {
    reportFatal("AnimesDigital: HLS não suportado neste navegador");
  }
})();
</script>
</body>
</html>`;
}
