/**
 * Endpoint de lookup duplo catálogo: vizer-catalog.json (PRIMÁRIO, mais episódios)
 *                                 + encontrei-catalog.json (FALLBACK, mais filmes)
 * 
 * Em vez do frontend baixar 11MB+26MB de JSON, faz 1 request rápida:
 *   GET /api/encontrei-lookup?tmdb_id=299534&type=movie
 *   GET /api/encontrei-lookup?tmdb_id=126027&type=tv&season=4&episode=1
 *   GET /api/encontrei-lookup?tmdb_id=126027&type=tv&season=4&episode=1&refresh=1
 * 
 * Retorna: { mixdrop: "...", mixdrop_encontrei: "...", mixdrop_vizer: "...",
 *            audio: "Dublado", source: "vizer|encontrei|encontrei-live|vizer-live" }
 * 
 * Backend carrega AMBOS catálogos 1x (cacheado em memória):
 *   - vizer-catalog.json: 65.246 eps + 5.593 filmes (todos com Mixdrop, mais episódios)
 *   - encontrei-catalog.json: 27.629 eps + 6.694 filmes (mais filmes)
 * 
 * Lookup order:
 *   1. Se refresh=1, pula direto pro resolver live (encontrei → vizer)
 *   2. Procura em vizer-catalog (mais episódios, prioridade)
 *   3. Se não achar, procura em encontrei-catalog (mais filmes)
 *   4. Se não achar em nenhum catálogo, chama resolver live (encontrei → vizer)
 *   5. Se não achar em nenhum, retorna 200 com { error: "Não encontrado" }
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import { checkVidsrcSeason } from "./vidsrcRoutes";
import { getVizerDomainOrder, rememberVizerDomain } from "../services/vizerDomains";
import {
  isSqliteAvailable,
  findVizerDb,
  openVizerSqlite,
  SqliteMovieIndex,
  SqliteEpisodeIndex,
  SqliteSeriesSeasonsIndex,
  type VizerSqliteStore,
} from "../services/vizerSqliteStore";

const router = Router();

// Cache de temporadas verificadas no VIP Player (TTL 30 min)
const vipSeasonCache = new Map<string, { ok: boolean; timestamp: number }>();
const vipMovieCache = new Map<string, { ok: boolean; timestamp: number }>();
const watchPlayerMovieCache = new Map<string, { ok: boolean; timestamp: number }>();
const VIP_SEASON_TTL = 30 * 60 * 1000;

export async function checkVipSeason(
  tmdb: string | number,
  season: string | number
): Promise<boolean> {
  const key = `${tmdb}:${season}`;
  const cached = vipSeasonCache.get(key);
  if (cached && Date.now() - cached.timestamp < (cached.ok ? VIP_SEASON_TTL : 15000)) {
    return cached.ok;
  }
  try {
    const port = process.env.PORT || 3000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`http://localhost:${port}/api/myembed-stream?id=${tmdb}&type=tv&s=${season}&e=1`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      vipSeasonCache.set(key, { ok: false, timestamp: Date.now() });
      return false;
    }
    const html = await res.text();
    const ok = html.includes("var hlsUrl =") || html.includes("embedplayer") || html.includes("master.m3u8");
    vipSeasonCache.set(key, { ok, timestamp: Date.now() });
    return ok;
  } catch {
    vipSeasonCache.set(key, { ok: false, timestamp: Date.now() });
    return false;
  }
}

export async function checkVipMovie(
  tmdb: string | number
): Promise<boolean> {
  const key = String(tmdb);
  const cached = vipMovieCache.get(key);
  if (cached && Date.now() - cached.timestamp < (cached.ok ? VIP_SEASON_TTL : 15000)) {
    return cached.ok;
  }
  try {
    const port = process.env.PORT || 3000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`http://localhost:${port}/api/myembed-stream?id=${tmdb}&type=movie`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      vipMovieCache.set(key, { ok: false, timestamp: Date.now() });
      return false;
    }
    const html = await res.text();
    const ok = html.includes("var hlsUrl =") || html.includes("embedplayer") || html.includes("master.m3u8");
    vipMovieCache.set(key, { ok, timestamp: Date.now() });
    return ok;
  } catch {
    vipMovieCache.set(key, { ok: false, timestamp: Date.now() });
    return false;
  }
}

export async function checkWatchPlayerMovie(
  tmdb: string | number
): Promise<boolean> {
  const key = String(tmdb);
  const cached = watchPlayerMovieCache.get(key);
  if (cached && Date.now() - cached.timestamp < VIP_SEASON_TTL) {
    return cached.ok;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://v1.watchplay.shop/movie/${tmdb}`, {
      headers: {
        "Referer": "https://v1.watchplay.shop/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (res.status === 200) {
      const text = await res.text();
      const lower = text.toLowerCase();
      const isBad = (
        lower.includes("404") ||
        lower.includes("login-card") ||
        lower.includes("login-page") ||
        lower.includes("não encontrado") ||
        lower.includes("filme não encontrado") ||
        text.length < 300
      );
      const ok = !isBad;
      watchPlayerMovieCache.set(key, { ok, timestamp: Date.now() });
      return ok;
    }
    watchPlayerMovieCache.set(key, { ok: false, timestamp: Date.now() });
    return false;
  } catch {
    return false;
  }
}

// Mapeamento global de TMDB ID -> Serie ID do Vizer/Encontrei
const _tmdbToSerieIdMap = new Map<number, number>();

// ──────────────────────────────────────────────────────────────────────────
// Resolver AJAX live do encontrei.me (cookie de sessão obrigatório)
//   - Circuit breaker 10min quando cookie expira (redirect 301/302 ou non-JSON)
//   - Dedup de chamadas concorrentes via _encInflight
//   - Negative cache 3min via _encNeg (só falhas; acertos vão pro índice persistente)
//   - fetch com AbortController 4s em todas as chamadas
// ──────────────────────────────────────────────────────────────────────────
const ENC_BASE = "https://encontrei.me";
const ENC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ENC_NEG_TTL_MS = 3 * 60 * 1000;      // negative cache 3 min
const ENC_BREAKER_MS = 10 * 60 * 1000;    // circuit breaker 10 min
const ENC_FETCH_TIMEOUT_MS = 4000;        // 4s timeout em cada fetch

let _encCookieDownUntil = 0;
const _encInflight = new Map<string, Promise<any>>();
const _encNeg = new Map<string, number>();

/** fetch com timeout (AbortController) — evita requisição pendurada prender o once() */
function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms: number = ENC_FETCH_TIMEOUT_MS
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

/** Dedup de chamadas concorrentes + negative cache 3min para falhas */
async function once<T>(
  key: string,
  fn: () => Promise<T | null>,
): Promise<T | null> {
  // 1) negative cache?
  const negExp = _encNeg.get(key);
  if (negExp && Date.now() < negExp) return null;
  // 2) já tem chamada em voo para essa chave?
  const existing = _encInflight.get(key);
  if (existing) return existing as Promise<T | null>;
  // 3) dispara nova chamada
  const p = (async () => {
    try {
      const r = await fn();
      if (r === null) _encNeg.set(key, Date.now() + ENC_NEG_TTL_MS);
      return r;
    } catch (e) {
      _encNeg.set(key, Date.now() + ENC_NEG_TTL_MS);
      throw e;
    } finally {
      _encInflight.delete(key);
    }
  })();
  _encInflight.set(key, p);
  return p;
}

// Mapeamento global de TMDB ID -> Movie Video ID do Vizer (pra resolveVizerMovie)
// Carregado de public/data/vizer-movie-ids.json
const _tmdbToVizerMovieIdMap = new Map<number, number>();
let _vizerMovieIdsLoaded = false;
let _vizerMovieIdsMtime = 0;

/** Carrega o arquivo de mapeamento TMDB → vizer_movie_id (uma vez, em memória) */
function loadVizerMovieIds() {
  const possiblePaths = [
    path.join(process.cwd(), "public", "data", "vizer-movie-ids.json"),
    path.join(process.cwd(), "data", "vizer-movie-ids.json"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p);
        const mtime = stat.mtimeMs;
        if (_vizerMovieIdsLoaded && mtime <= _vizerMovieIdsMtime) return;
        const raw = fs.readFileSync(p, "utf-8");
        const map: Record<string, number> = JSON.parse(raw);
        _tmdbToVizerMovieIdMap.clear();
        for (const [k, v] of Object.entries(map)) {
          const tmdb = parseInt(k, 10);
          const vid = parseInt(String(v), 10);
          if (!isNaN(tmdb) && !isNaN(vid)) {
            _tmdbToVizerMovieIdMap.set(tmdb, vid);
          }
        }
        _vizerMovieIdsLoaded = true;
        _vizerMovieIdsMtime = mtime;
        console.log(`[vizer-movie-ids] ${_tmdbToVizerMovieIdMap.size} mapeamentos TMDB→vizer_movie_id carregados`);
        return;
      } catch (err) {
        console.warn("[vizer-movie-ids] Erro ao carregar:", err);
        return;
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// DOMÍNIOS DO VIZER (histórico de migração: vizer.beauty → vizer.website → vizer.reisen)
//
// O vizer.website atualmente responde os endpoints AJAX com HTTP 200 + JSON
// {"redirect": "https://www.vizer.reisen/..."} (redirect em nível de aplicação)
// e a homepage com redirect HTTP. O vizerFetchJson persegue esse redirect,
// memoriza o domínio que funcionou no serviço compartilhado e cai para o próximo
// domínio da lista em caso de timeout/erro — blindando o resolver contra a
// migração silenciosa de domínio.
// ──────────────────────────────────────────────────────────────────────────
/**
 * Faz um request AJAX no endpoint videobox do Vizer com fallback duplo de
 * domínio. Retorna o JSON parseado do primeiro domínio que responder com
 * dados reais, ou null se todos falharem.
 * @param doQuery     Querystring após o prefixo (ex: "do=episodesList&id=123&season=1&audio=Dublado")
 * @param timeoutMs   Timeout por tentativa
 * @param refererPath Referer opcional (caminho relativo ao domínio base)
 */
async function vizerFetchJson(
  doQuery: string,
  timeoutMs: number,
  refererPath?: string
): Promise<any | null> {
  const order = getVizerDomainOrder();

  for (const base of order) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${base}/index.php?app=videobox&module=video&controller=view&${doQuery}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "X-Requested-With": "XMLHttpRequest",
          "Accept": "application/json",
          ...(refererPath ? { "Referer": `${base}${refererPath}` } : {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (!data) continue;

      // Domínio velho: HTTP 200 + redirect em nível de aplicação — persegue.
      if (typeof data.redirect === "string" && data.redirect && !data.episodes && !data.servers_dub) {
        const redirBase = new URL(data.redirect).origin;
        try {
          const r2Controller = new AbortController();
          const r2Timer = setTimeout(() => r2Controller.abort(), timeoutMs);
          const r2 = await fetch(data.redirect, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "X-Requested-With": "XMLHttpRequest",
              "Accept": "application/json",
            },
            signal: r2Controller.signal,
          });
          clearTimeout(r2Timer);
          if (r2.ok) {
            const data2 = await r2.json().catch(() => null);
            if (data2 && (data2.episodes || data2.servers_dub)) {
              rememberVizerDomain(redirBase);
              return data2;
            }
          }
        } catch {}
        continue; // redirect falhou → tenta o próximo domínio da lista
      }

      rememberVizerDomain(res.url || base);
      return data;
    } catch {
      continue; // timeout/erro de rede → próximo domínio
    }
  }
  return null;
}

// Cache de temporadas verificadas no Vizer Live (TTL 30 min)
const vizerSeasonCache = new Map<string, { ok: boolean; timestamp: number }>();
const VIZER_SEASON_TTL = 30 * 60 * 1000;

export async function checkVizerSeason(
  tmdb: string | number,
  season: string | number
): Promise<boolean> {
  const numericTmdb = typeof tmdb === "number" ? tmdb : parseInt(String(tmdb), 10);
  const numericSeason = typeof season === "number" ? season : parseInt(String(season), 10);
  if (!numericTmdb || isNaN(numericTmdb)) return false;

  loadCatalogs();
  const serieId = _tmdbToSerieIdMap.get(numericTmdb);
  if (!serieId) return false;

  const key = `${numericTmdb}:${numericSeason}`;
  const cached = vizerSeasonCache.get(key);
  if (cached && Date.now() - cached.timestamp < VIZER_SEASON_TTL) {
    return cached.ok;
  }

  const data = await vizerFetchJson(
    `do=episodesList&id=${serieId}&season=${numericSeason}&audio=Dublado`,
    3000
  );
  const ok = !!(data && Array.isArray(data.episodes) && data.episodes.length > 0);
  vizerSeasonCache.set(key, { ok, timestamp: Date.now() });
  return ok;
}

export async function resolveVizerEpisode(
  tmdbId: number,
  season: number,
  episode: number,
  name?: string
) {
  loadCatalogs();
  let serieId = _tmdbToSerieIdMap.get(tmdbId);
  if (!serieId) {
    // Conteúdo NOVO (pós-snapshot): descobre ao vivo nas listagens recentes do
    // Vizer antes de desistir (mesmo modelo do scan do encontrei.me).
    await ensureVizerFreshContent("series", name);
    serieId = _tmdbToSerieIdMap.get(tmdbId);
  }
  if (!serieId) return null;

  const data = await vizerFetchJson(
    `do=episodesList&id=${serieId}&season=${season}&audio=Dublado`,
    4000
  );
  if (!data) return null;
  const eps = data.episodes || [];
  if (!eps.length) return null;

  const target = eps.find((e: any) => parseInt(e.number, 10) === episode) || eps[episode - 1];
  if (!target) return null;

  const vidMatch = String(target.url || "").match(/-(\d+)\/?$/);
  if (!vidMatch) return null;
  const vid = vidMatch[1];

  const pData = await vizerFetchJson(`do=playerData&id=${vid}`, 3500);
  if (!pData) return null;
  const sStr = ((pData.servers_dub || "") + "&" + (pData.servers_leg || "")).replace(/&amp;/g, "&");

  // Extrai mixdrop, streamtape e doodstream
  const mMix = sStr.match(/(?:^|&)mixdrop=([^&]+)/i);
  const mStape = sStr.match(/(?:^|&)streamtape=([^&]+)/i);
  const mDood = sStr.match(/(?:^|&)doodstream=([^&]+)/i);
  const mixdrop = mMix ? mMix[1] : null;
  const streamtape = mStape ? mStape[1] : null;
  const doodstream = mDood ? mDood[1] : null;
  if (!mixdrop && !streamtape && !doodstream) return null;

  const epObj = {
    episode_id: parseInt(vid, 10),
    serie_id: serieId,
    season,
    episode,
    tmdb_id: tmdbId,
    audio: pData.current_audio || "Dublado",
    servers: { mixdrop: mixdrop || "", streamtape: streamtape || "", doodstream: doodstream || "" },
    source_url: target.url,
    _fetchedAt: Date.now()
  };

  // CORREÇÃO DE BUG: gravar no _vizerEpisodeIndex (não no _encontreiEpisodeIndex)
  const key = `${tmdbId}:${season}:${episode}`;
  _vizerEpisodeIndex.set(key, epObj);

  // Atualiza temporadas conhecidas
  const curSeasons = _vizerSeriesSeasonsIndex.get(tmdbId) || [];
  if (!curSeasons.includes(season)) {
    _vizerSeriesSeasonsIndex.set(tmdbId, [...curSeasons, season].sort((a, b) => a - b));
  }

  return {
    mixdrop,
    streamtape,
    doodstream,
    audio: epObj.audio,
    server_name: "MixDrop",
    season,
    episode,
    source: "vizer-live",
    mixdrop_vizer: mixdrop,
    mixdrop_encontrei: null,
  };
}

/**
 * Resolve um FILME on-demand no Vizer (espelho de resolveVizerEpisode
 * mas pra filmes em vez de episódios).
 *
 * Fluxo:
 * 1. Carrega mapeamento TMDB → vizer_movie_id (de public/data/vizer-movie-ids.json)
 * 2. AJAX em /do=playerData?id={vizer_movie_id} (fallback duplo de domínio via vizerFetchJson)
 * 3. Extrai apenas mixdrop de servers_dub + servers_leg
 * 4. Salva no _vizerMovieIndex em memória (próxima busca é instantânea)
 *
 * Use case: filme existe no encontrei-catalog mas mixdrop fileId morreu
 * (Mixdrop apagou o arquivo). Esse resolver re-busca o fileId atual do Vizer.
 *
 * @returns { mixdrop, audio, server_name, source: "vizer-live" } ou null.
 */
export async function resolveVizerMovie(tmdbId: number, name?: string) {
  loadVizerMovieIds();
  let vizerMovieId = _tmdbToVizerMovieIdMap.get(tmdbId);
  if (!vizerMovieId) {
    // Filme NOVO (pós-snapshot): descobre ao vivo nas listagens recentes do Vizer.
    loadCatalogs();
    await ensureVizerFreshContent("movies", name);
    vizerMovieId = _tmdbToVizerMovieIdMap.get(tmdbId);
  }
  if (!vizerMovieId) return null;

  const pData = await vizerFetchJson(
    `do=playerData&id=${vizerMovieId}`,
    3500,
    `/filmes/online/x-${vizerMovieId}/`
  );
  if (!pData) return null;
  const sStr = ((pData.servers_dub || "") + "&" + (pData.servers_leg || "")).replace(/&amp;/g, "&");

  // Extrai mixdrop, streamtape e doodstream
  const mMix = sStr.match(/(?:^|&)mixdrop=([^&]+)/i);
  const mStape = sStr.match(/(?:^|&)streamtape=([^&]+)/i);
  const mDood = sStr.match(/(?:^|&)doodstream=([^&]+)/i);
  const mixdrop = mMix ? mMix[1] : null;
  const streamtape = mStape ? mStape[1] : null;
  const doodstream = mDood ? mDood[1] : null;
  if (!mixdrop && !streamtape && !doodstream) return null;

  const movieObj = {
    video_id: vizerMovieId,
    tmdb_id: tmdbId,
    audio: pData.current_audio || "Dublado",
    servers: { mixdrop: mixdrop || "", streamtape: streamtape || "", doodstream: doodstream || "" },
    _fetchedAt: Date.now()
  };

  // Cache no índice em memória (próxima busca = instantânea)
  _vizerMovieIndex.set(tmdbId, movieObj);

  return {
    mixdrop,
    streamtape,
    doodstream,
    audio: movieObj.audio,
    server_name: "MixDrop",
    source: "vizer-live",
    mixdrop_vizer: mixdrop,
    mixdrop_encontrei: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// REFRESH INCREMENTAL — conteúdo NOVO no Vizer (pós-snapshot do catálogo)
//
// Mesmo modelo do scan do encontrei.me (ambos são espelhos IPS — os ids de
// série/vídeo são os mesmos nos dois sites):
//   1. Varrer as primeiras páginas de listagem (/series/online/, /filmes/online/ e pg/2)
//   2. Item com id NOVO (ausente dos snapshots) = candidato
//   3. A página do item expõe data-tmdb-id="<tmdb>" (série e filme — validado ao vivo)
//   4. Mapeia tmdb → serie_id / vizer_movie_id e segue o fluxo normal
// Diferenças pro encontrei: Vizer não exige cookie de sessão e usa vizerFetchHtml
// com o fallback duplo de domínio (VIZER_DOMAINS) — o scan sobrevive à migração
// .website → .reisen. Valores validados ao vivo em 2026-10-08:
// série Carrie 288673; filme "Sobrenatural: Agora Entre Nós" 1291595 (id 78472).
// ──────────────────────────────────────────────────────────────────────────

const VIZER_FRESH_LISTING_TTL_MS = 10 * 60 * 1000; // listagens re-varridas no máx 1x/10min
const VIZER_FRESH_MAX_CANDIDATES = 12;             // proteção: no máx N páginas por scan
let _vizerFreshListing: {
  series: Array<{ slug: string; id: number }>;
  movies: Array<{ slug: string; id: number }>;
  at: number;
} | null = null;
const _vizerFreshTmdbCache = new Map<string, number | null>(); // "s:slug"/"f:slug" → tmdb
const _vizerKnownSerieIds = new Set<number>();
const _vizerKnownMovieIds = new Set<number>();
let _vizerKnownSetsLoaded = false;

/** Popula os sets de ids já conhecidos (snapshots vizer) — 1x por processo. */
function vizerKnownSetsLoad(): void {
  if (_vizerKnownSetsLoaded) return;
  _vizerKnownSetsLoaded = true;
  try {
    loadVizerMovieIds();
    // séries: serie_ids dos episódios do snapshot vizer
    for (const ep of _vizerCatalog?.episodes || []) {
      const id = Number((ep as any).serie_id);
      if (id > 0) _vizerKnownSerieIds.add(id);
    }
    // filmes: vizer_movie_ids do mapeamento TMDB→vizer (vizer-movie-ids.json)
    for (const vid of _tmdbToVizerMovieIdMap.values()) {
      if (vid > 0) _vizerKnownMovieIds.add(vid);
    }
  } catch { /* snapshot indisponível — segue com sets vazios */ }
}

/** HTML GET no Vizer (listagens/páginas de item) com fallback duplo de domínio. */
async function vizerFetchHtml(pagePath: string, timeoutMs: number = 8000): Promise<string | null> {
  const order = getVizerDomainOrder();
  for (const base of order) {
    try {
      const res = await fetch(`${base}${pagePath}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept": "text/html",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      const html = await res.text().catch(() => null);
      if (!html || html.length < 500) continue;
      rememberVizerDomain(res.url || base);
      return html;
    } catch {
      continue; // timeout/erro de rede → próximo domínio
    }
  }
  return null;
}

/** Varrer listagens recentes de séries e filmes do Vizer (cache de 10min). */
async function ensureVizerFreshListing(): Promise<void> {
  if (_vizerFreshListing && Date.now() - _vizerFreshListing.at < VIZER_FRESH_LISTING_TTL_MS) return;
  const series: Array<{ slug: string; id: number }> = [];
  const movies: Array<{ slug: string; id: number }> = [];
  for (const p of ["/series/online/", "/series/online/page/2/", "/filmes/online/", "/filmes/online/page/2/"]) {
    const html = await vizerFetchHtml(p);
    if (!html) continue;
    for (const m of html.matchAll(/href="(?:https:\/\/(?:www\.)?vizer\.[a-z]+)?\/series\/online\/([a-z0-9-]+)-(\d+)\/"/gi)) {
      const id = parseInt(m[2], 10);
      if (id > 0 && !series.some(x => x.id === id)) series.push({ slug: m[1], id });
    }
    for (const m of html.matchAll(/href="(?:https:\/\/(?:www\.)?vizer\.[a-z]+)?\/filmes\/online\/([a-z0-9-]+)-(\d+)\/"/gi)) {
      const id = parseInt(m[2], 10);
      if (id > 0 && !movies.some(x => x.id === id)) movies.push({ slug: m[1], id });
    }
  }
  _vizerFreshListing = { series, movies, at: Date.now() };
}

/**
 * Descobre conteúdo NOVO (pós-snapshot) no Vizer e popula os índices:
 * séries → _tmdbToSerieIdMap (tmdb → serie_id);
 * filmes → _tmdbToVizerMovieIdMap (tmdb → vizer_movie_id) + entrada placeholder
 * em _vizerMovieIndex (servers vazios — resolvidos depois pelo resolveVizerMovie).
 * `title` filtra candidatos pelo slug (reusa encSlugMatchesTitle do scan do encontrei).
 */
async function ensureVizerFreshContent(kind: "series" | "movies", title?: string): Promise<void> {
  try {
    loadCatalogs();
    vizerKnownSetsLoad();
    await ensureVizerFreshListing();
    if (!_vizerFreshListing) return;

    const known = kind === "series" ? _vizerKnownSerieIds : _vizerKnownMovieIds;
    const items = kind === "series" ? _vizerFreshListing.series : _vizerFreshListing.movies;
    const tag = kind === "series" ? "s" : "f";

    const candidates = items.filter(it => {
      if (known.has(it.id)) return false;                               // já no snapshot
      if (_vizerFreshTmdbCache.has(`${tag}:${it.slug}`)) return false;  // já resolvido antes
      return encSlugMatchesTitle(it.slug, title);                       // sem título: bounded
    }).slice(0, VIZER_FRESH_MAX_CANDIDATES);

    for (const it of candidates) {
      const cacheKey = `${tag}:${it.slug}`;
      const pagePath = kind === "series"
        ? `/series/online/${it.slug}-${it.id}/`
        : `/filmes/online/${it.slug}-${it.id}/`;
      const html = await vizerFetchHtml(pagePath);
      if (!html) {
        _vizerFreshTmdbCache.set(cacheKey, null);
        continue;
      }
      const tm = html.match(/data-tmdb-id="(\d+)"/);
      const tmdb = tm ? parseInt(tm[1], 10) : 0;
      _vizerFreshTmdbCache.set(cacheKey, tmdb || null);
      if (!tmdb) continue;

      if (kind === "series") {
        if (!_tmdbToSerieIdMap.has(tmdb)) {
          _tmdbToSerieIdMap.set(tmdb, it.id);
          console.log(`[vizer-fresh] Série nova mapeada: tmdb=${tmdb} → serie_id=${it.id} (${it.slug})`);
        }
      } else {
        if (!_tmdbToVizerMovieIdMap.has(tmdb)) {
          _tmdbToVizerMovieIdMap.set(tmdb, it.id);
          console.log(`[vizer-fresh] Filme novo mapeado: tmdb=${tmdb} → vizer_movie_id=${it.id} (${it.slug})`);
        }
        if (!_vizerMovieIndex.has(tmdb)) {
          _vizerMovieIndex.set(tmdb, {
            video_id: it.id,
            tmdb_id: tmdb,
            title: it.slug.replace(/-/g, " "),
            servers: {},
            _fetchedAt: Date.now(),
          } as any);
        }
      }
    }
  } catch (e: any) {
    console.warn("[vizer-fresh] Erro no scan incremental:", e?.message || e);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// RESOLVER AJAX LIVE DO ENCONTREI.ME (cookie de sessão obrigatório)
//
// resolveEncontreiEpisode(tmdbId, season, episode):
//   1. serie_id = _tmdbToSerieIdMap.get(tmdbId)            // catálogo já populou
//   2. AJAX episodesList(serie_id, season, "Dublado")      // descobre episode_id
//   3. AJAX playerData(episode_id)                          // pega servers_dub|leg
//   4. pickMixdrop(servers)                                 // extrai só mixdrop
//   5. grava em _encontreiEpisodeIndex com formato alinhado ao catálogo
//
// resolveEncontreiMovie(tmdbId):
//   video_id vem direto de _encontreiMovieIndex.get(tmdbId).video_id (catálogo)
//   Não tem episodesList pra filme — chama playerData direto.
// ──────────────────────────────────────────────────────────────────────────

/** Faz AJAX pro encontrei.me com cookie. Detecta cookie expirado via redirect 301/302
 *  ou content-type não-JSON, e ativa circuit breaker 10min nesses casos. */
async function encontreiPlayerData(id: number): Promise<any | null> {
  const cookie = (process.env.ENCONTREI_COOKIE || "").trim();
  if (!cookie) {
    if (!_encCookieWarned) {
      console.warn("[encontrei-live] ENCONTREI_COOKIE não configurado — resolver live desativado");
      _encCookieWarned = true;
    }
    return null;
  }
  if (Date.now() < _encCookieDownUntil) return null;

  const url = `${ENC_BASE}/index.php?app=videobox&module=video&controller=view&do=playerData&id=${id}`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": ENC_UA,
        "Cookie": cookie,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `${ENC_BASE}/`,
      },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      console.error("[encontrei-live] cookie expirado (redirect) — pausando 10min");
      _encCookieDownUntil = Date.now() + ENC_BREAKER_MS;
      return null;
    }
    if (!res.ok) {
      console.warn(`[encontrei-live] HTTP ${res.status} para video_id=${id}`);
      return null;
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json") && !ct.includes("javascript")) {
      console.error("[encontrei-live] resposta não-JSON — cookie inválido, pausando 10min");
      _encCookieDownUntil = Date.now() + ENC_BREAKER_MS;
      return null;
    }
    return await res.json();
  } catch (e: any) {
    if (e?.name === "AbortError") {
      console.warn(`[encontrei-live] timeout para video_id=${id}`);
    } else {
      console.error(`[encontrei-live] erro de rede para video_id=${id}:`, e?.message || e);
    }
    return null;
  }
}
let _encCookieWarned = false;

/**
 * Exporta o estado do circuit breaker do encontrei.me live resolver.
 * Usado pelo endpoint /api/admin/encontrei-status pra alertar no painel admin
 * quando o cookie expira (redirect 301/302 ou non-JSON do encontrei.me).
 */
export function getEncontreiResolverStatus() {
  const cookieConfigured = !!(process.env.ENCONTREI_COOKIE || "").trim();
  const now = Date.now();
  const breakerActive = now < _encCookieDownUntil;
  const breakerMsRemaining = breakerActive ? (_encCookieDownUntil - now) : 0;
  return {
    cookieConfigured,
    breakerActive,
    breakerUntil: _encCookieDownUntil,
    breakerMsRemaining,
    inflightCount: _encInflight.size,
    negativeCacheCount: _encNeg.size,
    cookieSource: cookieConfigured ? "ENCONTREI_COOKIE env" : "not_set",
  };
}

/** Faz AJAX episodesList no encontrei.me e devolve o episode_id da temporada/episódio.
 *  Copia o parsing do resolveVizerEpisode (ambos são IPS, mesmo formato provavel). */
async function encontreiEpisodeId(
  serieId: number,
  season: number,
  episode: number,
  strict = false,
): Promise<number | null> {
  if (Date.now() < _encCookieDownUntil) return null;
  const cookie = (process.env.ENCONTREI_COOKIE || "").trim();
  if (!cookie) return null;

  const url = `${ENC_BASE}/index.php?app=videobox&module=video&controller=view`
            + `&do=episodesList&id=${serieId}&season=${season}&audio=Dublado`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": ENC_UA,
        "Cookie": cookie,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
      },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      _encCookieDownUntil = Date.now() + ENC_BREAKER_MS;
      return null;
    }
    if (!res.ok) return null;
    const json: any = await res.json();
    const eps: any[] = Array.isArray(json?.episodes) ? json.episodes
              : Array.isArray(json) ? json
              : Array.isArray(json?.[season]) ? json[season]
              : [];
    if (!eps.length) return null;

    // Mesma lógica do resolveVizerEpisode: match por e.number, fallback posicional
    const target = eps.find((e: any) => parseInt(e.number, 10) === episode) || (strict ? undefined : eps[episode - 1]);
    if (!target) return null;

    // Extrai o episode_id de target.url com /-(\d+)\/?$/
    const m = String(target.url || "").match(/-(\d+)\/?$/);
    if (m) return parseInt(m[1], 10);
    if (target.id) return parseInt(target.id, 10);
    if (target.episode_id) return parseInt(target.episode_id, 10);
    return null;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      console.warn(`[encontrei-live] timeout em episodesList(serie=${serieId}, s${season}e${episode})`);
    } else {
      console.error(`[encontrei-live] erro em episodesList(serie=${serieId}):`, e?.message || e);
    }
    return null;
  }
}

/** Extrai mixdrop e streamtape de um playerData JSON. Tenta servers_dub primeiro, depois servers_leg.
 *  Áudio = "Dublado" se servers_dub tem conteúdo, senão "Legendado". */
function pickMixdrop(d: any): { mixdrop: string; streamtape?: string | null; doodstream?: string | null; audio: "Dublado" | "Legendado" } | null {
  if (!d || typeof d !== "object") return null;
  const dubRaw = String(d.servers_dub || "");
  const legRaw = String(d.servers_leg || "");
  const dub = dubRaw.replace(/&amp;/g, "&");
  const leg = legRaw.replace(/&amp;/g, "&");
  const audio: "Dublado" | "Legendado" = dubRaw.length > 0 ? "Dublado" : "Legendado";
  const RE_MIX = /(?:^|&)mixdrop=([^&]+)/i;
  const RE_STAPE = /(?:^|&)streamtape=([^&]+)/i;
  const RE_DOOD = /(?:^|&)doodstream=([^&]+)/i;
  const mDub = dub.match(RE_MIX);
  const mDubStape = dub.match(RE_STAPE);
  const mDubDood = dub.match(RE_DOOD);
  const mLeg = leg.match(RE_MIX);
  const mLegStape = leg.match(RE_STAPE);
  const mLegDood = leg.match(RE_DOOD);
  const streamtape = mDubStape?.[1] || mLegStape?.[1] || null;
  const doodstream = mDubDood?.[1] || mLegDood?.[1] || null;

  if (mDub) return { mixdrop: mDub[1], streamtape, doodstream, audio: "Dublado" };
  if (mLeg) return { mixdrop: mLeg[1], streamtape, doodstream, audio: "Legendado" };
  if (streamtape) return { mixdrop: "", streamtape, doodstream, audio };
  if (doodstream) return { mixdrop: "", streamtape: null, doodstream, audio };
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// REFRESH INCREMENTAL — conteúdo NOVO no encontrei.me (pós-snapshot do catálogo)
//
// O snapshot local congela o catálogo (ex.: 22/09/2026). Séries/filmes
// adicionados DEPOIS ficam invisíveis pro resolver live, pois
// _tmdbToSerieIdMap/_encontreiMovieIndex só saem do snapshot — e a busca
// /search/ do site devolve 403 ("Sorry, you do not have permission") pra
// essa conta. Solução validada ao vivo (scratch/test-encontrei-search.mjs):
//   1. Varrer as primeiras páginas de listagem (/series/online/, /filmes/online/)
//   2. Item com id NOVO (ausente do snapshot) = candidato
//   3. A página do item expõe data-tmdb-id="<tmdb>" (série e filme)
//   4. Mapeia tmdb → serie_id/video_id e segue o fluxo normal
//      (episodesList → playerData → pickMixdrop).
// Caso real validado: Carrie a Estranha (tmdb 288673, estreou 07/10/2026) →
// serie_id 82940 → ep_id 82941 → mixdrop dublado pjkr4deehg7r646.
// ──────────────────────────────────────────────────────────────────────────

const ENC_FRESH_LISTING_TTL_MS = 10 * 60 * 1000; // listagens re-varridas no máx 1x/10min
const ENC_FRESH_MAX_CANDIDATES = 12;             // proteção: no máx N páginas por scan
let _encFreshListing: {
  series: Array<{ slug: string; id: number }>;
  movies: Array<{ slug: string; id: number }>;
  at: number;
} | null = null;
const _encFreshTmdbCache = new Map<string, number | null>(); // "s:slug"/"f:slug" → tmdb
const _encKnownSerieIds = new Set<number>();
const _encKnownMovieIds = new Set<number>();
let _encKnownSetsLoaded = false;

/** Popula os sets de ids já conhecidos (catálogo snapshot) — 1x por processo. */
function encKnownSetsLoad(): void {
  if (_encKnownSetsLoaded) return;
  _encKnownSetsLoaded = true;
  try {
    const cat = _encontreiCatalog?.value;
    for (const s of cat?.series || []) {
      const id = Number(s.serie_id);
      if (id > 0) _encKnownSerieIds.add(id);
    }
    for (const mv of cat?.movies || []) {
      const id = Number(mv.video_id);
      if (id > 0) _encKnownMovieIds.add(id);
    }
  } catch { /* snapshot indisponível — segue com sets vazios */ }
}

/** HTML GET no encontrei.me com cookie + breaker (redirect = cookie morto, 10min). */
async function encontreiGetHtml(path: string): Promise<string | null> {
  const cookie = (process.env.ENCONTREI_COOKIE || "").trim();
  if (!cookie) return null;
  if (Date.now() < _encCookieDownUntil) return null;
  try {
    const res = await fetchWithTimeout(`${ENC_BASE}${path}`, {
      headers: {
        "User-Agent": ENC_UA,
        "Cookie": cookie,
        "Accept": "text/html",
        "Referer": `${ENC_BASE}/`,
      },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      console.error("[encontrei-fresh] cookie expirado (redirect) — pausando 10min");
      _encCookieDownUntil = Date.now() + ENC_BREAKER_MS;
      return null;
    }
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Normaliza título/slug pra comparação (sem acentos, sem pontuação). */
function encNormTitle(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Slug da listagem casa com o título pedido? (sem título = aceita, bounded) */
function encSlugMatchesTitle(slug: string, title?: string): boolean {
  if (!title) return true;
  const cleanTitle = title.split(/\s*-\s*(?:T\d|Temporada|\d+ª\s*Temp)/i)[0].trim();
  const s = encNormTitle(slug.replace(/-(dublado|legendado|nacional)$/i, ""));
  const t = encNormTitle(cleanTitle || title);
  if (!t) return true;
  return s.includes(t) || t.includes(s);
}

/** Varrer listagens recentes de séries e filmes (cache de 10min). */
async function ensureEncontreiFreshListing(): Promise<void> {
  if (_encFreshListing && Date.now() - _encFreshListing.at < ENC_FRESH_LISTING_TTL_MS) return;
  const series: Array<{ slug: string; id: number }> = [];
  const movies: Array<{ slug: string; id: number }> = [];
  for (const p of ["/series/online/", "/series/online/page/2/", "/filmes/online/", "/filmes/online/page/2/"]) {
    const html = await encontreiGetHtml(p);
    if (!html) continue;
    for (const m of html.matchAll(/href="(?:https:\/\/encontrei\.me)?\/series\/online\/([a-z0-9-]+)-(\d+)\/"/gi)) {
      const id = parseInt(m[2], 10);
      if (id > 0 && !series.some(x => x.id === id)) series.push({ slug: m[1], id });
    }
    for (const m of html.matchAll(/href="(?:https:\/\/encontrei\.me)?\/filmes\/online\/([a-z0-9-]+)-(\d+)\/"/gi)) {
      const id = parseInt(m[2], 10);
      if (id > 0 && !movies.some(x => x.id === id)) movies.push({ slug: m[1], id });
    }
  }
  _encFreshListing = { series, movies, at: Date.now() };
}

/**
 * Descobre conteúdo NOVO (pós-snapshot) e popula os índices:
 * séries → _tmdbToSerieIdMap (tmdb → serie_id);
 * filmes → _encontreiMovieIndex (entrada com video_id; servers resolvidos depois
 * pelo resolveEncontreiMovie via playerData). `title` filtra candidatos pelo slug.
 */
async function ensureEncontreiFreshContent(kind: "series" | "movies", title?: string): Promise<void> {
  try {
    encKnownSetsLoad();
    await ensureEncontreiFreshListing();
    if (!_encFreshListing) return;

    const known = kind === "series" ? _encKnownSerieIds : _encKnownMovieIds;
    const items = kind === "series" ? _encFreshListing.series : _encFreshListing.movies;
    const tag = kind === "series" ? "s" : "f";

    const candidates = items.filter(it => {
      if (known.has(it.id)) return false;                           // já no snapshot
      if (_encFreshTmdbCache.has(`${tag}:${it.slug}`)) return false; // já resolvido antes
      return encSlugMatchesTitle(it.slug, title);                   // sem título: bounded
    }).slice(0, ENC_FRESH_MAX_CANDIDATES);

    for (const it of candidates) {
      const cacheKey = `${tag}:${it.slug}`;
      const pagePath = kind === "series"
        ? `/series/online/${it.slug}-${it.id}/`
        : `/filmes/online/${it.slug}-${it.id}/`;
      const html = await encontreiGetHtml(pagePath);
      if (!html) {
        _encFreshTmdbCache.set(cacheKey, null);
        continue;
      }
      const tm = html.match(/data-tmdb-id="(\d+)"/);
      const tmdb = tm ? parseInt(tm[1], 10) : 0;
      _encFreshTmdbCache.set(cacheKey, tmdb || null);
      if (!tmdb) continue;

      if (kind === "series") {
        if (!_tmdbToSerieIdMap.has(tmdb)) {
          _tmdbToSerieIdMap.set(tmdb, it.id);
          console.log(`[encontrei-fresh] Série nova mapeada: tmdb=${tmdb} → serie_id=${it.id} (${it.slug})`);
        }
      } else {
        if (!_encontreiMovieIndex.has(tmdb)) {
          _encontreiMovieIndex.set(tmdb, {
            video_id: it.id,
            tmdb_id: tmdb,
            title: it.slug.replace(/-/g, " "),
            servers: {},
            _fetchedAt: Date.now(),
          } as any);
          console.log(`[encontrei-fresh] Filme novo mapeado: tmdb=${tmdb} → video_id=${it.id} (${it.slug})`);
        }
      }
    }
  } catch (e: any) {
    console.warn("[encontrei-fresh] Erro no scan incremental:", e?.message || e);
  }
}

/** Resolve episódio no encontrei.me live (cookie necessário). */
export async function resolveEncontreiEpisode(
  tmdbId: number,
  season: number,
  episode: number,
  name?: string,
): Promise<{
  mixdrop: string;
  mixdrop_encontrei: string;
  mixdrop_vizer: null;
  streamtape?: string | null;
  doodstream?: string | null;
  audio: string;
  server_name: string;
  season: number;
  episode: number;
  source: string;
} | null> {
  loadCatalogs();
  // CORREÇÃO: _tmdbToSerieIdMap é Map<number, number> (chave numérica, sem prefixo)
  let serieId = _tmdbToSerieIdMap.get(tmdbId);
  if (!serieId) {
    // Conteúdo NOVO (lançado após o snapshot do catálogo): descobre ao vivo
    // nas listagens recentes do site antes de desistir. Caso real: Carrie a
    // Estranha (288673, estreou 07/10/2026 — snapshot era de 22/09/2026).
    await ensureEncontreiFreshContent("series", name);
    serieId = _tmdbToSerieIdMap.get(tmdbId);
  }
  if (!serieId) return null;

  // CORREÇÃO: chave alinhada com catálogo — "${tmdbId}:${season}:${episode}" sem prefixo "enc:"
  const key = `${tmdbId}:${season}:${episode}`;
  return once(key, async () => {
    const epId = await encontreiEpisodeId(serieId, season, episode);
    if (!epId) return null;
    const data = await encontreiPlayerData(epId);
    if (!data) return null;
    const picked = pickMixdrop(data);
    if (!picked) return null;

    // CORREÇÃO: formato alinhado ao catálogo — episode_id, serie_id, season, episode,
    // tmdb_id, audio, servers:{mixdrop, streamtape}, _fetchedAt
    _encontreiEpisodeIndex.set(key, {
      episode_id: epId,
      serie_id: serieId,
      season,
      episode,
      tmdb_id: tmdbId,
      audio: picked.audio,
      servers: { mixdrop: picked.mixdrop, streamtape: picked.streamtape || "", doodstream: picked.doodstream || "" },
      source_url: `${ENC_BASE}/episodios/online/`,
      _fetchedAt: Date.now(),
    });

    // Atualiza temporadas conhecidas (no índice encontrei, que é lido em /api/series-seasons-available)
    const curSeasons = _encontreiSeriesSeasonsIndex.get(tmdbId) || [];
    if (!curSeasons.includes(season)) {
      _encontreiSeriesSeasonsIndex.set(tmdbId, [...curSeasons, season].sort((a, b) => a - b));
    }

    return {
      mixdrop: picked.mixdrop,
      streamtape: picked.streamtape || null,
      doodstream: picked.doodstream || null,
      mixdrop_encontrei: picked.mixdrop,
      mixdrop_vizer: null,
      audio: picked.audio,
      server_name: "MixDrop",
      season,
      episode,
      source: "encontrei-live",
    };
  });
}

/** Resolve filme no encontrei.me live (cookie necessário).
 *  video_id vem direto do catálogo _encontreiMovieIndex.get(tmdbId).video_id. */
export async function resolveEncontreiMovie(tmdbId: number, name?: string): Promise<{
  mixdrop: string;
  mixdrop_encontrei: string;
  mixdrop_vizer: null;
  streamtape?: string | null;
  doodstream?: string | null;
  audio: string;
  server_name: string;
  source: string;
} | null> {
  loadCatalogs();
  let entry = _encontreiMovieIndex.get(tmdbId);
  if (!entry) {
    // Filme NOVO (pós-snapshot): descobre ao vivo nas listagens recentes.
    await ensureEncontreiFreshContent("movies", name);
    entry = _encontreiMovieIndex.get(tmdbId);
  }
  if (!entry) return null;
  const videoId = entry.video_id || entry.episode_id;
  if (!videoId) return null;

  return once(`movie:${tmdbId}`, async () => {
    const data = await encontreiPlayerData(videoId);
    if (!data) return null;
    const picked = pickMixdrop(data);
    if (!picked) return null;

    // Sobrescreve entrada antiga do catálogo, mantendo campos extras
    _encontreiMovieIndex.set(tmdbId, {
      ...entry,
      audio: picked.audio,
      servers: { mixdrop: picked.mixdrop, streamtape: picked.streamtape || "", doodstream: picked.doodstream || "", ...(entry.servers || {}) },
      _fetchedAt: Date.now(),
    });

    return {
      mixdrop: picked.mixdrop,
      streamtape: picked.streamtape || null,
      doodstream: picked.doodstream || null,
      mixdrop_encontrei: picked.mixdrop,
      mixdrop_vizer: null,
      audio: picked.audio,
      server_name: "MixDrop",
      source: "encontrei-live",
    };
  });
}

// Catálogo encontrei (fallback, mais filmes)
let _encontreiCatalog: any = null;
let _encontreiMovieIndex: Map<number, any> = new Map();
let _encontreiEpisodeIndex: Map<string, any> = new Map(); // key: "tmdbId:season:episode"
let _encontreiSeriesSeasonsIndex: Map<number, number[]> = new Map();
let _encontreiLastMtime = 0;

// Catálogo vizer (PRIMÁRIO, mais episódios)
// Quando SQLite disponível (Node 24+), os 3 índices abaixo viram adaptadores
// que consultam vizer-catalog.db (READ-ONLY) — ver tryLoadVizerSqlite().
let _vizerCatalog: any = null;
let _vizerMovieIndex: Map<number, any> | SqliteMovieIndex = new Map();
let _vizerEpisodeIndex: Map<string, any> | SqliteEpisodeIndex = new Map();
let _vizerSeriesSeasonsIndex: Map<number, number[]> | SqliteSeriesSeasonsIndex = new Map();
let _vizerLastMtime = 0;
let _vizerSqliteStore: VizerSqliteStore | null = null;

function tryLoadCatalog(
  filename: string,
  catalogRef: { value: any },
  movieIndexRef: Map<number, any>,
  episodeIndexRef: Map<string, any>,
  seasonsIndexRef: Map<number, number[]>,
  mtimeRef: { value: number },
  logName: string,
): boolean {
  const possiblePaths = [
    path.join(process.cwd(), "public", "data", filename),
    path.join(process.cwd(), "data", filename),
  ];

  let raw = "";
  let currentMtime = 0;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p);
        currentMtime = stat.mtimeMs;
        // Se já carregado e não mudou, mantém
        if (catalogRef.value && (movieIndexRef.size > 0 || episodeIndexRef.size > 0) && currentMtime <= mtimeRef.value) {
          return true;
        }
        raw = fs.readFileSync(p, "utf-8");
        break;
      } catch (_) {}
    }
  }

  if (!raw) {
    return false;
  }

  try {
    catalogRef.value = JSON.parse(raw);
    mtimeRef.value = currentMtime;
    
    movieIndexRef.clear();
    episodeIndexRef.clear();
    seasonsIndexRef.clear();
    
    for (const movie of catalogRef.value.movies || []) {
      if (movie.tmdb_id) {
        // Se já existe (duplicado), mantém o primeiro
        if (!movieIndexRef.has(movie.tmdb_id)) {
          movieIndexRef.set(movie.tmdb_id, movie);
        }
      }
    }
    
    const seriesSeasonsMap = new Map<number, Set<number>>();
    for (const ep of catalogRef.value.episodes || []) {
      if (ep.tmdb_id && ep.serie_id && !_tmdbToSerieIdMap.has(ep.tmdb_id)) {
        _tmdbToSerieIdMap.set(ep.tmdb_id, ep.serie_id);
      }
      if (ep.tmdb_id && ep.season && ep.episode) {
        const key = `${ep.tmdb_id}:${ep.season}:${ep.episode}`;
        // Se já existe (duplicado), mantém o primeiro
        if (!episodeIndexRef.has(key)) {
          episodeIndexRef.set(key, ep);
        }
        if (!seriesSeasonsMap.has(ep.tmdb_id)) {
          seriesSeasonsMap.set(ep.tmdb_id, new Set());
        }
        seriesSeasonsMap.get(ep.tmdb_id)!.add(ep.season);
      }
    }

    for (const [id, seasonsSet] of seriesSeasonsMap.entries()) {
      seasonsIndexRef.set(id, Array.from(seasonsSet).sort((a, b) => a - b));
    }
    
    // INVALIDA cache de temporadas verificadas: o catálogo mudou, então os
    // resultados em cache (20min) podem estar desatualizados. Próxima
    // chamada do /api/series-seasons-available vai re-sondar com catálogo novo.
    // Issue real: Ghosts (126027) tinha T5 adicionado no catálogo mas o cache
    // de servidor retornava [1,2,3,4] (sem T5) por 20min após atualização.
    _verifiedSeasonsCache.clear();
    
    console.log(`[${logName}] Catálogo carregado: ${movieIndexRef.size} filmes, ${episodeIndexRef.size} episódios, ${seasonsIndexRef.size} séries (cache de temporadas invalidado)`);
    return true;
  } catch (err) {
    console.warn(`[${logName}] Erro ao processar:`, err);
    return false;
  }
}

function loadCatalogs() {
  // Vizer: tenta SQLite primeiro (Node 24+, sem custo de RAM); se indisponível,
  // cai no JSON existente. Se antes estava em SQLite e o .db sumiu/quebrou,
  // reseta os índices pra Map fresco antes do caminho JSON.
  const sqliteOk = tryLoadVizerSqlite();
  if (!sqliteOk) {
    if (!(_vizerMovieIndex instanceof Map)) {
      _vizerMovieIndex = new Map();
      _vizerEpisodeIndex = new Map();
      _vizerSeriesSeasonsIndex = new Map();
    }
    tryLoadCatalog(
      "vizer-catalog.json",
      { get value() { return _vizerCatalog; }, set value(v) { _vizerCatalog = v; } },
      _vizerMovieIndex as Map<number, any>,
      _vizerEpisodeIndex as Map<string, any>,
      _vizerSeriesSeasonsIndex as Map<number, number[]>,
      { get value() { return _vizerLastMtime; }, set value(v) { _vizerLastMtime = v; } },
      "vizer-lookup",
    );
  }
  // Carrega encontrei (fallback) segundo
  tryLoadCatalog(
    "encontrei-catalog.json",
    { get value() { return _encontreiCatalog; }, set value(v) { _encontreiCatalog = v; } },
    _encontreiMovieIndex,
    _encontreiEpisodeIndex,
    _encontreiSeriesSeasonsIndex,
    { get value() { return _encontreiLastMtime; }, set value(v) { _encontreiLastMtime = v; } },
    "encontrei-lookup",
  );

  // Aplica patches de catálogo (conteúdo novo demais para esperar o snapshot)
  applyCatalogPatches();
}

/**
 * Carrega o catálogo Vizer via SQLite (vizer-catalog.db), aberto READ-ONLY.
 * Substitui os 3 Maps por adaptadores que consultam o DB; mutações em runtime
 * ficam em overrides/tombstones em memória (mesma semântica dos Maps: perdem-se
 * no restart). Recarrega quando o mtime do .db muda (regeneração via pipeline).
 *
 * Retorna true se o catálogo está ativo via SQLite, false se deve cair pro JSON.
 */
function tryLoadVizerSqlite(): boolean {
  if (!isSqliteAvailable()) return false;
  const dbPath = findVizerDb();
  if (!dbPath) return false;

  let stat: fs.Stats;
  try {
    stat = fs.statSync(dbPath);
  } catch {
    return false;
  }
  const currentMtime = stat.mtimeMs;

  // Já carregado e mesmo mtime: mantém (idempotente, igual ao caminho JSON)
  if (_vizerSqliteStore && currentMtime <= _vizerLastMtime) {
    return true;
  }

  // (Re)abre: fecha o anterior, instancia novos adaptadores
  if (_vizerSqliteStore) {
    _vizerSqliteStore.close();
    _vizerSqliteStore = null;
  }

  const store = openVizerSqlite(dbPath);
  if (!store) return false;

  _vizerSqliteStore = store;
  _vizerMovieIndex = store.movieIndex;
  _vizerEpisodeIndex = store.episodeIndex;
  _vizerSeriesSeasonsIndex = store.seriesSeasonsIndex;
  _vizerLastMtime = currentMtime;
  _vizerCatalog = null; // Sem catálogo bruto em memória (RAM poupada)

  // Hidrata o _tmdbToSerieIdMap compartilhado a partir da base (igual ao loop
  // do tryLoadCatalog, que popula o map a partir dos eps)
  store.hydrateSerieIds(_tmdbToSerieIdMap);

  // Invalida cache de temporadas verificadas (catálogo mudou)
  _verifiedSeasonsCache.clear();

  const cv = store.meta("content_version") || "?";
  console.log(
    `[vizer-lookup] Catálogo via SQLite (content_version=${cv}, db=${path.basename(dbPath)}): ` +
      `${_vizerMovieIndex.size} filmes, ${_vizerEpisodeIndex.size} episódios, ${_vizerSeriesSeasonsIndex.size} séries`,
  );
  return true;
}

// ──────────────────────────────────────────────────────────────────────────
// PATCH DE CATÁLOGO — Carrie (2026) | TMDB 288673 | vizer serie_id 82940
//
// Sondado ao vivo em 2026-10-08: T1 completa (8 eps) DUBLADA no Vizer, todos
// com MixDrop ativo. Esses episódios não constam no snapshot vizer-catalog.json,
// então este patch injeta as entradas nos índices em memória após cada
// loadCatalogs (idempotente — nunca sobrescreve o que o catálogo oficial já
// tem). Se um mixdrop morrer, o parâmetro refresh=1 do /api/encontrei-lookup
// re-resolve ao vivo (o _tmdbToSerieIdMap já tem o mapeamento 288673→82940).
// ──────────────────────────────────────────────────────────────────────────
const PATCH_FETCHED_AT = Date.now();
const VIZER_CATALOG_PATCH: { movies: any[]; episodes: any[] } = {
  movies: [],
  episodes: [
    { episode_id: 82941, serie_id: 82940, season: 1, episode: 1, tmdb_id: 288673, audio: "Dublado", servers: { mixdrop: "pjkr4deehg7r646" }, source_url: "https://www.vizer.reisen/episodios/online/carrie-a-estranha-1x1-dublado-82941/", _fetchedAt: PATCH_FETCHED_AT },
    { episode_id: 82942, serie_id: 82940, season: 1, episode: 2, tmdb_id: 288673, audio: "Dublado", servers: { mixdrop: "ow7v46wrber04l" }, source_url: "https://www.vizer.reisen/episodios/online/carrie-a-estranha-1x2-dublado-82942/", _fetchedAt: PATCH_FETCHED_AT },
    { episode_id: 82943, serie_id: 82940, season: 1, episode: 3, tmdb_id: 288673, audio: "Dublado", servers: { mixdrop: "4dngnomncd0rq7" }, source_url: "https://www.vizer.reisen/episodios/online/carrie-a-estranha-1x3-dublado-82943/", _fetchedAt: PATCH_FETCHED_AT },
    { episode_id: 82944, serie_id: 82940, season: 1, episode: 4, tmdb_id: 288673, audio: "Dublado", servers: { mixdrop: "elno6gn4fojqdp" }, source_url: "https://www.vizer.reisen/episodios/online/carrie-a-estranha-1x4-dublado-82944/", _fetchedAt: PATCH_FETCHED_AT },
    { episode_id: 82945, serie_id: 82940, season: 1, episode: 5, tmdb_id: 288673, audio: "Dublado", servers: { mixdrop: "wln1kqlwcg1p0" }, source_url: "https://www.vizer.reisen/episodios/online/carrie-a-estranha-1x5-dublado-82945/", _fetchedAt: PATCH_FETCHED_AT },
    { episode_id: 82946, serie_id: 82940, season: 1, episode: 6, tmdb_id: 288673, audio: "Dublado", servers: { mixdrop: "67qnpxewinn70m" }, source_url: "https://www.vizer.reisen/episodios/online/carrie-a-estranha-1x6-dublado-82946/", _fetchedAt: PATCH_FETCHED_AT },
    { episode_id: 82947, serie_id: 82940, season: 1, episode: 7, tmdb_id: 288673, audio: "Dublado", servers: { mixdrop: "elno6gp0hpwdpk" }, source_url: "https://www.vizer.reisen/episodios/online/carrie-a-estranha-1x7-dublado-82947/", _fetchedAt: PATCH_FETCHED_AT },
    { episode_id: 82948, serie_id: 82940, season: 1, episode: 8, tmdb_id: 288673, audio: "Dublado", servers: { mixdrop: "jd9lqr0es44pj0" }, source_url: "https://www.vizer.reisen/episodios/online/carrie-a-estranha-1x8-dublado-82948/", _fetchedAt: PATCH_FETCHED_AT },
  ],
};

/** Injeta as entradas do patch nos índices em memória (sem sobrescrever o catálogo oficial) */
function applyCatalogPatches() {
  for (const movie of VIZER_CATALOG_PATCH.movies) {
    if (movie.tmdb_id && !_vizerMovieIndex.has(movie.tmdb_id)) {
      _vizerMovieIndex.set(movie.tmdb_id, movie);
    }
    if (movie.tmdb_id && !_encontreiMovieIndex.has(movie.tmdb_id)) {
      _encontreiMovieIndex.set(movie.tmdb_id, {
        ...movie,
        source: "encontrei",
      });
    }
  }
  for (const ep of VIZER_CATALOG_PATCH.episodes) {
    if (!ep.tmdb_id || !ep.serie_id || !ep.season || !ep.episode) continue;
    if (!_tmdbToSerieIdMap.has(ep.tmdb_id)) {
      _tmdbToSerieIdMap.set(ep.tmdb_id, ep.serie_id);
    }
    const key = `${ep.tmdb_id}:${ep.season}:${ep.episode}`;
    if (!_vizerEpisodeIndex.has(key)) {
      _vizerEpisodeIndex.set(key, ep);
    }
    const curSeasons = _vizerSeriesSeasonsIndex.get(ep.tmdb_id) || [];
    if (!curSeasons.includes(ep.season)) {
      _vizerSeriesSeasonsIndex.set(ep.tmdb_id, [...curSeasons, ep.season].sort((a, b) => a - b));
    }
    // Injeta também no índice Encontrei (prioridade máxima HD dublado)
    const encEp = {
      ...ep,
      source: "encontrei",
      source_url: `https://encontrei.me/episodios/online/carrie-a-estranha-${ep.season}x${ep.episode}-dublado-${ep.episode_id}/`,
    };
    if (!_encontreiEpisodeIndex.has(key)) {
      _encontreiEpisodeIndex.set(key, encEp);
    }
    const curEncSeasons = _encontreiSeriesSeasonsIndex.get(ep.tmdb_id) || [];
    if (!curEncSeasons.includes(ep.season)) {
      _encontreiSeriesSeasonsIndex.set(ep.tmdb_id, [...curEncSeasons, ep.season].sort((a, b) => a - b));
    }
  }
}

/**
 * Números de episódios de uma temporada no catálogo encontrei, usando o índice
 * em memória (recarregado por mtime). Evita re-parsear o JSON de 14 MB a cada request.
 */
export function getEncontreiSeasonEpisodes(tmdbId: number, season: number): number[] {
  loadCatalogs();
  const prefix = `${tmdbId}:${season}:`;
  const eps: number[] = [];
  for (const [key, ep] of _encontreiEpisodeIndex) {
    if (key.startsWith(prefix) && typeof ep.episode === "number") {
      eps.push(ep.episode);
    }
  }
  return eps;
}


// Cache de temporadas verificadas em memória
// Apenas para PROBES (seasons não presentes no catálogo). Seasons do catálogo
// são sempre derivadas live do índice em memória — nunca cached.
const _verifiedSeasonsCache = new Map<string, { timestamp: number; seasons: number[] }>();
const VERIFIED_SEASONS_CACHE_TTL = 5 * 60 * 1000; // 5min (reduzido de 20min)

router.get("/api/series-seasons-available", async (req, res) => {
  try {
    // force_refresh=true limpa cache de probes pra essa série
    // (útil pra debug sem precisar reiniciar VPS)
    const forceRefresh = req.query.force_refresh === "true" || req.query.force_refresh === "1";
    if (forceRefresh) {
      // Limpa TODAS as entradas de probe cache dessa série (qualquer set de seasons)
      const keysToDelete: string[] = [];
      for (const key of _verifiedSeasonsCache.keys()) {
        if (key.startsWith(`${parseInt(req.query.tmdb_id as string, 10)}:probe:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(k => _verifiedSeasonsCache.delete(k));
    }
    loadCatalogs();
    const tmdbId = parseInt(req.query.tmdb_id as string, 10);
    if (!tmdbId) {
      return res.status(400).json({ error: "tmdb_id é obrigatório" });
    }

    let candidateSeasons: number[] = [];
    if (req.query.candidate_seasons) {
      candidateSeasons = String(req.query.candidate_seasons)
        .split(",")
        .map(n => parseInt(n.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);
    }
    if (candidateSeasons.length === 0) {
      candidateSeasons = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    }

    // ============================================================================
    // ARQUITETURA ANTI-CACHE-STALE:
    // ============================================================================
    // 1. catalogSeasons: sempre derivado do índice em memória (vizer + encontrei).
    //    O índice é recarregado quando o arquivo do catálogo muda (mtime check
    //    em tryLoadCatalog). Portanto, sempre que o catálogo ganha uma temporada
    //    nova (ex: T5 do Ghosts adicionado), ela aparece imediatamente no
    //    próximo request — sem depender de cache invalidation.
    //
    // 2. probedSeasons: seasons que NÃO estão no catálogo mas são candidates
    //    (ex: T6 do Ghosts que o TMDB anuncia mas o catálogo ainda não tem).
    //    Essas exigem sondagem network (Nixplay + WatchPlayer) — lento, faz
    //    sentido cachear. Mas o cache só guarda RESULTADO DE PROBE, não o
    //    resultado de catálogo. Então mesmo se o cache ficar velho, ele só
    //    afeta seasons que não estão no catálogo — nunca esconde catalogSeasons.
    // ============================================================================

    const vizerSeasons = _vizerSeriesSeasonsIndex.get(tmdbId) || [];
    const encontreiSeasons = _encontreiSeriesSeasonsIndex.get(tmdbId) || [];
    const catalogSeasons = Array.from(
      new Set([...vizerSeasons, ...encontreiSeasons])
    ).sort((a, b) => a - b);

    // Seasons que precisam de probe network (estão em candidates mas NÃO em catálogo)
    const seasonsToProbe = candidateSeasons.filter(
      s => !catalogSeasons.includes(s)
    );

    // Cache só pra probes (TTL 20min)
    const probeCacheKey = `${tmdbId}:probe:${seasonsToProbe.join(",")}`;
    let probedSeasons: number[] = [];
    let probeCached = false;

    const cached = _verifiedSeasonsCache.get(probeCacheKey);
    if (cached && Date.now() - cached.timestamp < VERIFIED_SEASONS_CACHE_TTL) {
      probedSeasons = cached.seasons;
      probeCached = true;
    }

    // Sonda network só pras seasons que não estão no catálogo e não estão em cache
    if (!probeCached && seasonsToProbe.length > 0) {
      const probeSeason = async (season: number): Promise<boolean> => {
        // 0. Sonda Encontrei.me Live (Prioritário: links MixDrop/StreamTape com Cookie autenticado na VPS)
        try {
          if (process.env.ENCONTREI_COOKIE) {
            const encLive = await resolveEncontreiEpisode(tmdbId, season, 1);
            if (encLive && (encLive.mixdrop || encLive.streamtape || encLive.doodstream)) {
              return true;
            }
          }
        } catch {}

        // 1. Sonda VIP Player (Dublado PT-BR homologado, mais rápido)
        try {
          const vipOk = await checkVipSeason(tmdbId, season);
          if (vipOk) return true;
        } catch {}
        // 2. Sonda WatchPlayer (Oficial homologado)
        try {
          const wpUrl = `https://v1.watchplay.shop/tvshow/${tmdbId}/${season}/1`;
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 2500);
          const wpRes = await fetch(wpUrl, {
            headers: {
              "Referer": "https://v1.watchplay.shop/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            signal: controller.signal,
          });
          clearTimeout(t);
          if (wpRes.status === 200) {
            const text = await wpRes.text();
            const lower = text.toLowerCase();
            const isBad = (
              lower.includes("404") ||
              lower.includes("login-card") ||
              lower.includes("login-page") ||
              lower.includes("não encontrado") ||
              lower.includes("série não encontrada") ||
              text.length < 300
            );
            if (!isBad) return true;
          }
        } catch {}
        // 3. Sonda Vizer Live (MixDrop Dublado)
        try {
          const vizerOk = await checkVizerSeason(tmdbId, season);
          if (vizerOk) return true;
        } catch {}
        // 4. Sonda Nixplay HD
        try {
          const ss = String(season).padStart(3, "0");
          const streamId = `${tmdbId}${ss}001`;
          const nixUrl = `https://nixplay.lat/series/testelogado-vods/GwXanZ3Dj/${streamId}.mp4`;
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 2000);
          const nixRes = await fetch(nixUrl, {
            headers: { Range: "bytes=0-100" },
            signal: controller.signal,
          });
          clearTimeout(t);
          if (nixRes.status === 206 && nixRes.headers.get("content-type") === "video/mp4") {
            return true;
          }
        } catch {}
        // 5. Sonda Seriesflix HD (vidsrc)
        try {
          const vsOk = await checkVidsrcSeason(tmdbId, season);
          if (vsOk) return true;
        } catch {}
        return false;
      };

      const probes = await Promise.all(
        seasonsToProbe.map(async (s) => ({
          season: s,
          available: await probeSeason(s),
        }))
      );
      probedSeasons = probes.filter(p => p.available).map(p => p.season);

      _verifiedSeasonsCache.set(probeCacheKey, {
        timestamp: Date.now(),
        seasons: probedSeasons,
      });
    }

    // Resultado final: catálogo (sempre live) + probes (cached ou fresco)
    const verified = Array.from(
      new Set([...catalogSeasons, ...probedSeasons])
    ).sort((a, b) => a - b);

    // Fallback se nada encontrado
    const finalSeasons = verified.length > 0 ? verified : [1];

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.json({
      success: true,
      hasCatalog: catalogSeasons.length > 0 || probedSeasons.length > 0,
      tmdbId,
      seasons: finalSeasons,
      // Debug info (opcional — pode ajudar a diagnosticar futuros problemas)
      _debug: {
        catalogSeasons,
        probedSeasons,
        probeCached,
        seasonsToProbe,
      },
    });
  } catch (err: any) {
    console.error("[series-seasons-available] Erro:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

const _playableProbeCache = new Map<number, { playable: boolean; type?: 'movie' | 'tv'; timestamp: number }>();
const PLAYABLE_PROBE_TTL = 30 * 60 * 1000;

router.all("/api/check-playable-batch", async (req, res) => {
  try {
    loadCatalogs();
    interface RequestItem {
      id: number;
      type?: 'movie' | 'tv' | 'series';
    }
    let items: RequestItem[] = [];

    if (req.method === "POST" && req.body) {
      if (Array.isArray(req.body.items)) {
        items = req.body.items
          .map((i: any) => ({
            id: Number(i.id || i),
            type: i.type ? (i.type === 'series' ? 'tv' : i.type) : undefined,
          }))
          .filter((i: RequestItem) => Boolean(i.id));
      } else if (Array.isArray(req.body.ids)) {
        items = req.body.ids.map(Number).filter(Boolean).map((id: number) => ({ id }));
      }
    } else if (req.query.ids) {
      const rawIds = String(req.query.ids).split(",").map(Number).filter(Boolean);
      items = rawIds.map(id => ({ id }));
    }

    const playableMovieIds: number[] = [];
    const playableSeriesIds: number[] = [];
    const unverifiedItems: RequestItem[] = [];

    const now = Date.now();

    for (const item of items) {
      const id = item.id;
      let found = false;

      // 1. Checa índice de filmes e séries locais
      if (_vizerMovieIndex.has(id) || _encontreiMovieIndex.has(id)) {
        playableMovieIds.push(id);
        found = true;
      }
      if (_vizerSeriesSeasonsIndex.has(id) || _encontreiSeriesSeasonsIndex.has(id)) {
        playableSeriesIds.push(id);
        found = true;
      }

      // 2. Se já achou em catálogo estático, segue
      if (found) continue;

      // 3. Checa cache de sondagem em memória
      const cached = _playableProbeCache.get(id);
      if (cached && now - cached.timestamp < PLAYABLE_PROBE_TTL) {
        if (cached.playable) {
          if (cached.type === 'movie') playableMovieIds.push(id);
          else playableSeriesIds.push(id);
        }
        continue;
      }

      unverifiedItems.push(item);
    }

    // 4. Sonda itens não encontrados em lote rápido (máximo 25 por requisição)
    const itemsToProbe = unverifiedItems.slice(0, 25);
    if (itemsToProbe.length > 0) {
      await Promise.all(
        itemsToProbe.map(async (item) => {
          const id = item.id;
          const isExplicitMovie = item.type === 'movie';
          const isExplicitTv = item.type === 'tv' || item.type === 'series';

          let isPlayable = false;
          let verifiedType: 'movie' | 'tv' = isExplicitTv ? 'tv' : 'movie';

          if (isExplicitTv) {
            // Sonda VIP Player para Série (Season 1 Ep 1)
            const vipOk = await checkVipSeason(id, 1);
            if (vipOk) {
              isPlayable = true;
              verifiedType = 'tv';
            }
          } else if (isExplicitMovie) {
            // Sonda VIP Player para Filme
            const vipOk = await checkVipMovie(id);
            if (vipOk) {
              isPlayable = true;
              verifiedType = 'movie';
            } else {
              const wpOk = await checkWatchPlayerMovie(id);
              if (wpOk) {
                isPlayable = true;
                verifiedType = 'movie';
              }
            }
          } else {
            // Tipo não informado: testa TV primeiro
            const vipTv = await checkVipSeason(id, 1);
            if (vipTv) {
              isPlayable = true;
              verifiedType = 'tv';
            } else {
              const vipMovie = await checkVipMovie(id);
              if (vipMovie) {
                isPlayable = true;
                verifiedType = 'movie';
              } else {
                const wpMovie = await checkWatchPlayerMovie(id);
                if (wpMovie) {
                  isPlayable = true;
                  verifiedType = 'movie';
                }
              }
            }
          }

          _playableProbeCache.set(id, {
            playable: isPlayable,
            type: verifiedType,
            timestamp: now,
          });

          if (isPlayable) {
            if (verifiedType === 'movie') playableMovieIds.push(id);
            else playableSeriesIds.push(id);
          }
        })
      );
    }

    res.setHeader("Cache-Control", "public, max-age=1800");
    return res.json({
      success: true,
      playableMovieIds: [...new Set(playableMovieIds)],
      playableSeriesIds: [...new Set(playableSeriesIds)],
      playableIds: [...new Set([...playableMovieIds, ...playableSeriesIds])],
    });
  } catch (err: any) {
    console.error("[check-playable-batch] Erro:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

router.get("/api/encontrei-lookup", async (req, res) => {
  try {
    loadCatalogs();
    
    const tmdbId = parseInt(req.query.tmdb_id as string, 10);
    const type = (req.query.type as string) || "movie";
    const season = parseInt(req.query.season as string, 10) || 1;
    const episode = parseInt(req.query.episode as string, 10) || 1;
    // refresh=1: pula o catálogo estático e vai direto pro resolver live.
    // Usado quando o frontend constatou que o mixdrop fileId do catálogo morreu.
    const forceLive = req.query.refresh === "1";
    // name (opcional): título da série/filme — permite ao resolver live descobrir
    // conteúdo NOVO (pós-snapshot) nas listagens do site filtrando pelo slug.
    const lookupName = (req.query.name as string) || undefined;
    
    if (!tmdbId) {
      return res.status(400).json({ error: "tmdb_id é obrigatório" });
    }
    
    let result: any = null;
    
    if (type === "tv" || type === "series") {
      // Lookup de episódio: PRIMEIRO vizer (mais eps), DEPOIS encontrei
      const key = `${tmdbId}:${season}:${episode}`;
      
      const VIZER_ON_DEMAND_TTL = 24 * 60 * 60 * 1000;
      const now = Date.now();
      
      // Se refresh=1, pula o catálogo estático e vai direto ao resolver live
      let vizerEp = forceLive ? undefined : _vizerEpisodeIndex.get(key);
      if (vizerEp && vizerEp._fetchedAt && (now - vizerEp._fetchedAt > VIZER_ON_DEMAND_TTL)) {
        _vizerEpisodeIndex.delete(key);
        vizerEp = undefined;
      }
      
      let encontreiEp = forceLive ? undefined : _encontreiEpisodeIndex.get(key);
      if (encontreiEp && encontreiEp._fetchedAt && (now - encontreiEp._fetchedAt > VIZER_ON_DEMAND_TTL)) {
        _encontreiEpisodeIndex.delete(key);
        encontreiEp = undefined;
      }

      // Se encontreiEp não constava no catálogo estático, tenta resolver live no encontrei.me
      if (!encontreiEp && process.env.ENCONTREI_COOKIE) {
        try {
          const liveEnc = await resolveEncontreiEpisode(tmdbId, season, episode, lookupName);
          if (liveEnc && (liveEnc.mixdrop || liveEnc.streamtape || liveEnc.doodstream)) {
            encontreiEp = {
              season,
              episode,
              tmdb_id: tmdbId,
              audio: liveEnc.audio || "Dublado",
              servers: { mixdrop: liveEnc.mixdrop || "", streamtape: liveEnc.streamtape || "", doodstream: liveEnc.doodstream || "" },
              source: "encontrei-live",
              _fetchedAt: now,
            };
            _encontreiEpisodeIndex.set(key, encontreiEp);
          }
        } catch (_) {}
      }

      let bestEp = null;
      let bestSource = "";

      if (vizerEp && vizerEp.servers?.mixdrop && encontreiEp && encontreiEp.servers?.mixdrop) {
        // Ambos têm o episódio no MixDrop. Priorizamos encontrei.me (links HD de alta velocidade)
        if (encontreiEp.audio === "Dublado" || vizerEp.audio !== "Dublado") {
          bestEp = encontreiEp;
          bestSource = "encontrei";
        } else {
          bestEp = vizerEp;
          bestSource = "vizer";
        }
      } else if (encontreiEp && encontreiEp.servers?.mixdrop) {
        bestEp = encontreiEp;
        bestSource = "encontrei";
      } else if (vizerEp && vizerEp.servers?.mixdrop) {
        bestEp = vizerEp;
        bestSource = "vizer";
      }

      if (bestEp) {
        const mixdrop_encontrei = encontreiEp?.servers?.mixdrop || null;
        const mixdrop_vizer = vizerEp?.servers?.mixdrop || null;
        const streamtape = bestEp.servers?.streamtape || encontreiEp?.servers?.streamtape || vizerEp?.servers?.streamtape || null;
        const doodstream = bestEp.servers?.doodstream || encontreiEp?.servers?.doodstream || vizerEp?.servers?.doodstream || null;

        result = {
          mixdrop: bestEp.servers.mixdrop,
          mixdrop_encontrei,
          mixdrop_vizer,
          streamtape,
          doodstream,
          audio: bestEp.audio || "Dublado",
          server_name: "MixDrop",
          season: bestEp.season,
          episode: bestEp.episode,
          source: bestSource,
        };
      } else {
        // Catálogo falhou OU refresh=1: tenta resolver live (encontrei primeiro, vizer depois)
        const live = (await resolveEncontreiEpisode(tmdbId, season, episode, lookupName))
                  || (await resolveVizerEpisode(tmdbId, season, episode, lookupName));
        if (live) {
          result = live;
        }
      }
    } else {
      // Lookup de filme: PRIMEIRO vizer, DEPOIS encontrei
      const VIZER_ON_DEMAND_TTL = 24 * 60 * 60 * 1000;
      const now = Date.now();
      
      let vizerMovie = forceLive ? undefined : _vizerMovieIndex.get(tmdbId);
      if (vizerMovie && vizerMovie._fetchedAt && (now - vizerMovie._fetchedAt > VIZER_ON_DEMAND_TTL)) {
        _vizerMovieIndex.delete(tmdbId);
        vizerMovie = undefined;
      }
      
      let encontreiMovie = forceLive ? undefined : _encontreiMovieIndex.get(tmdbId);
      if (encontreiMovie && encontreiMovie._fetchedAt && (now - encontreiMovie._fetchedAt > VIZER_ON_DEMAND_TTL)) {
        _encontreiMovieIndex.delete(tmdbId);
        encontreiMovie = undefined;
      }

      // Se encontreiMovie não constava no catálogo estático, tenta resolver live no encontrei.me
      if (!encontreiMovie && process.env.ENCONTREI_COOKIE) {
        try {
          const liveEnc = await resolveEncontreiMovie(tmdbId, lookupName);
          if (liveEnc && (liveEnc.mixdrop || liveEnc.streamtape || liveEnc.doodstream)) {
            encontreiMovie = {
              tmdb_id: tmdbId,
              audio: liveEnc.audio || "Dublado",
              servers: { mixdrop: liveEnc.mixdrop || "", streamtape: liveEnc.streamtape || "", doodstream: liveEnc.doodstream || "" },
              source: "encontrei-live",
              _fetchedAt: now,
            };
            _encontreiMovieIndex.set(tmdbId, encontreiMovie);
          }
        } catch (_) {}
      }

      let bestMovie = null;
      let bestSource = "";

      if (vizerMovie && vizerMovie.servers?.mixdrop && encontreiMovie && encontreiMovie.servers?.mixdrop) {
        // Ambos têm o filme no MixDrop. Priorizamos encontrei.me (links HD de alta velocidade)
        if (encontreiMovie.audio === "Dublado" || vizerMovie.audio !== "Dublado") {
          bestMovie = encontreiMovie;
          bestSource = "encontrei";
        } else {
          bestMovie = vizerMovie;
          bestSource = "vizer";
        }
      } else if (encontreiMovie && encontreiMovie.servers?.mixdrop) {
        bestMovie = encontreiMovie;
        bestSource = "encontrei";
      } else if (vizerMovie && vizerMovie.servers?.mixdrop) {
        bestMovie = vizerMovie;
        bestSource = "vizer";
      }

      if (bestMovie) {
        // Retornar ambos os IDs de fallback (encontrei e vizer) para que o player
        // possa tentar o Vizer se o Encontrei falhar e vice-versa
        const mixdrop_encontrei = encontreiMovie?.servers?.mixdrop || null;
        const mixdrop_vizer = vizerMovie?.servers?.mixdrop || null;
        const streamtape = bestMovie.servers?.streamtape || encontreiMovie?.servers?.streamtape || vizerMovie?.servers?.streamtape || null;
        const doodstream = bestMovie.servers?.doodstream || encontreiMovie?.servers?.doodstream || vizerMovie?.servers?.doodstream || null;

        result = {
          mixdrop: bestMovie.servers.mixdrop,
          mixdrop_encontrei,
          mixdrop_vizer,
          streamtape,
          doodstream,
          audio: bestMovie.audio || "Dublado",
          server_name: "MixDrop",
          source: bestSource,
        };
      } else {
        // Catálogo falhou OU refresh=1: tenta resolver live (encontrei primeiro, vizer depois)
        const live = (await resolveEncontreiMovie(tmdbId, lookupName))
                  || (await resolveVizerMovie(tmdbId, lookupName));
        if (live) {
          result = live;
        }
      }
    }
    
    if (!result) {
      const byse = (await getByseSources(tmdbId, type === 'tv' || type === 'series' ? season : undefined, type === 'tv' || type === 'series' ? episode : undefined, lookupName))[0];
      if(byse) result={byse:byse.fileId,audio:byse.audio,source:byse.source};
    }
    if (!result) {
      return res.status(200).json({ error: "Não encontrado nos catálogos (vizer + encontrei) nem nos resolvers live", tmdb_id: tmdbId });
    }
    
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json(result);
  } catch (err: any) {
    console.error("[encontrei-lookup] Erro:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

let _downloadsCatalogCache: {
  movieItems: Array<{ tmdbId: number; type: "movie"; mixdrop: string; audio: string }>;
  seriesItems: Array<{ tmdbId: number; type: "series"; totalEpisodes: number; seasons: number[]; audio: string }>;
  allItems: any[];
  expiresAt: number;
} | null = null;
const DOWNLOADS_CATALOG_TTL = 10 * 60 * 1000; // 10 minutos

router.get("/api/downloads-catalog", (req, res) => {
  try {
    loadCatalogs();

    const type = (req.query.type as string) || "all";
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    const now = Date.now();
    if (!_downloadsCatalogCache || now >= _downloadsCatalogCache.expiresAt) {
      // Junta filmes dos DOIS catálogos (vizer + encontrei), dedup por tmdbId
      const movieMap = new Map<number, { tmdbId: number; type: "movie"; mixdrop: string; audio: string }>();

      // Vizer primeiro (SQLite se ativo, senão JSON bruto)
      if (_vizerSqliteStore) {
        _vizerSqliteStore.movieIndex.forEachBaseWithMixdrop((m: any) => {
          if (m.tmdb_id && m.servers?.mixdrop && !movieMap.has(m.tmdb_id)) {
            movieMap.set(m.tmdb_id, {
              tmdbId: m.tmdb_id,
              type: "movie" as const,
              mixdrop: m.servers.mixdrop,
              audio: m.audio || "Dublado"
            });
          }
        });
      } else if (_vizerCatalog) {
        for (const m of _vizerCatalog.movies || []) {
          if (m.tmdb_id && m.servers?.mixdrop && !movieMap.has(m.tmdb_id)) {
            movieMap.set(m.tmdb_id, {
              tmdbId: m.tmdb_id,
              type: "movie" as const,
              mixdrop: m.servers.mixdrop,
              audio: m.audio || "Dublado"
            });
          }
        }
      }
      // Encontrei como fallback
      if (_encontreiCatalog) {
        for (const m of _encontreiCatalog.movies || []) {
          if (m.tmdb_id && m.servers?.mixdrop && !movieMap.has(m.tmdb_id)) {
            movieMap.set(m.tmdb_id, {
              tmdbId: m.tmdb_id,
              type: "movie" as const,
              mixdrop: m.servers.mixdrop,
              audio: m.audio || "Dublado"
            });
          }
        }
      }

      // Junta séries dos DOIS catálogos, dedup por tmdbId
      const seriesMap = new Map<number, { tmdbId: number; type: "series"; totalEpisodes: number; seasons: number[]; audio: string }>();

      // Vizer
      if (_vizerSqliteStore) {
        _vizerSqliteStore.episodeIndex.forEachBaseWithMixdrop((ep: any) => {
          if (ep.tmdb_id && ep.servers?.mixdrop) {
            const current = seriesMap.get(ep.tmdb_id) || {
              tmdbId: ep.tmdb_id,
              type: "series" as const,
              totalEpisodes: 0,
              seasons: [] as number[],
              audio: ep.audio || "Dublado"
            };
            current.totalEpisodes += 1;
            if (ep.season && !current.seasons.includes(ep.season)) {
              current.seasons.push(ep.season);
            }
            seriesMap.set(ep.tmdb_id, current);
          }
        });
      } else if (_vizerCatalog) {
        for (const ep of _vizerCatalog.episodes || []) {
          if (ep.tmdb_id && ep.servers?.mixdrop) {
            const current = seriesMap.get(ep.tmdb_id) || {
              tmdbId: ep.tmdb_id,
              type: "series" as const,
              totalEpisodes: 0,
              seasons: [] as number[],
              audio: ep.audio || "Dublado"
            };
            current.totalEpisodes += 1;
            if (ep.season && !current.seasons.includes(ep.season)) {
              current.seasons.push(ep.season);
            }
            seriesMap.set(ep.tmdb_id, current);
          }
        }
      }
      // Encontrei (eps que não tem em vizer)
      if (_encontreiCatalog) {
        for (const ep of _encontreiCatalog.episodes || []) {
          if (ep.tmdb_id && ep.servers?.mixdrop) {
            const existing = seriesMap.get(ep.tmdb_id);
            if (existing) {
              const key = `${ep.tmdb_id}:${ep.season}:${ep.episode}`;
              const inVizer = _vizerEpisodeIndex.has(key);
              if (!inVizer) {
                existing.totalEpisodes += 1;
                if (ep.season && !existing.seasons.includes(ep.season)) {
                  existing.seasons.push(ep.season);
                }
              }
            } else {
              seriesMap.set(ep.tmdb_id, {
                tmdbId: ep.tmdb_id,
                type: "series" as const,
                totalEpisodes: 1,
                seasons: ep.season ? [ep.season] : [],
                audio: ep.audio || "Dublado"
              });
            }
          }
        }
      }

      const movieItems = Array.from(movieMap.values());
      const seriesItems = Array.from(seriesMap.values());
      _downloadsCatalogCache = {
        movieItems,
        seriesItems,
        allItems: [...movieItems, ...seriesItems],
        expiresAt: now + DOWNLOADS_CATALOG_TTL,
      };
    }

    const { movieItems, seriesItems, allItems } = _downloadsCatalogCache;
    const filteredItems =
      type === "movie"
        ? movieItems
        : type === "tv" || type === "series"
          ? seriesItems
          : allItems;

    const total = filteredItems.length;
    const paginated = filteredItems.slice(offset, offset + limit);

    res.setHeader("Cache-Control", "public, max-age=1800");
    return res.json({
      total,
      totalMovies: movieItems.length,
      totalSeries: seriesItems.length,
      limit,
      offset,
      items: paginated
    });
  } catch (err: any) {
    console.error("[downloads-catalog] Erro:", err);
    return res.status(500).json({ error: "Erro interno ao carregar catálogo de downloads" });
  }
});

export default router;


/** Cached catalogue remains useful even when live domain checks fail. */
export function getVizerCatalogStatus() {
  loadCatalogs();
  return { movies: _vizerMovieIndex.size, episodes: _vizerEpisodeIndex.size, series: _vizerSeriesSeasonsIndex.size };
}

/** Read both catalogue copies independently, including StreamTape-only entries.
 * A shared lookup avoids duplicate live scans when viewers start together. */
const catalogueMediaSourcePending = new Map<string, Promise<Array<{ fileId: string; source: 'encontrei' | 'vizer'; audio: string }>>>();
const catalogueMediaSourceCache = new Map<string, { expires: number; sources: Array<{ fileId: string; source: 'encontrei' | 'vizer'; audio: string }> }>();
async function getCatalogueMediaSources(provider: 'streamtape' | 'mixdrop', id: number, season?: number, episode?: number, name?: string, refresh = false) {
  loadCatalogs();
  const key = `${provider}:${season === undefined ? 'movie' : 'tv'}:${id}:${season || 0}:${episode || 0}:${name || ''}`;
  const cached = catalogueMediaSourceCache.get(key);
  if (!refresh && cached && cached.expires > Date.now()) return cached.sources;
  if (catalogueMediaSourcePending.has(key)) return catalogueMediaSourcePending.get(key)!;
  if (catalogueMediaSourcePending.size >= 6) return [];
  const pending = (async () => {
    const tv = season !== undefined && episode !== undefined;
    const epKey = `${id}:${season}:${episode}`;
    const lookups = [
      { source: 'encontrei' as const, entry: tv ? _encontreiEpisodeIndex.get(epKey) : _encontreiMovieIndex.get(id),
        live: () => tv ? resolveEncontreiEpisode(id, season!, episode!, name) : resolveEncontreiMovie(id, name) },
      { source: 'vizer' as const, entry: tv ? _vizerEpisodeIndex.get(epKey) : _vizerMovieIndex.get(id),
        live: () => tv ? resolveVizerEpisode(id, season!, episode!, name) : resolveVizerMovie(id, name) },
    ];
    const results = await Promise.all(lookups.map(async lookup => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const entry = refresh ? null : lookup.entry;
        const live = entry?.servers?.[provider] ? null : await Promise.race([
          lookup.live(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 4000); }),
        ]);
        const fileId = entry?.servers?.[provider] || live?.[provider];
        return /^[a-zA-Z0-9_-]{1,100}$/.test(fileId || '') ? { fileId: String(fileId), source: lookup.source, audio: entry?.audio || live?.audio || 'Dublado' } : null;
      } catch { return null; }
      finally { clearTimeout(timer); }
    }));
    const sources = results.filter((value): value is NonNullable<typeof value> => !!value);
    if (sources.length) {
      if (catalogueMediaSourceCache.size >= 500) catalogueMediaSourceCache.delete(catalogueMediaSourceCache.keys().next().value!);
      catalogueMediaSourceCache.set(key, { expires: Date.now() + 30000, sources });
    }
    return sources;
  })().finally(() => catalogueMediaSourcePending.delete(key));
  catalogueMediaSourcePending.set(key, pending);
  return pending;
}

export const getStreamtapeSources = (id: number, season?: number, episode?: number, name?: string, refresh = false) => getCatalogueMediaSources('streamtape', id, season, episode, name, refresh);
export const getMixdropSources = (id: number, season?: number, episode?: number, name?: string, refresh = false) => getCatalogueMediaSources('mixdrop', id, season, episode, name, refresh);

/** BYSE discovery keeps audio and exact episode identity independent of MixDrop. */
export async function getByseSources(id: number, season?: number, episode?: number, name?: string, refresh = false) {
  loadCatalogs();
  const tv = season !== undefined && episode !== undefined;
  const key = `${id}:${season}:${episode}`;
  return (await Promise.all((['encontrei', 'vizer'] as const).map(async source => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = async () => {
      const entry = source === 'encontrei' ? (tv ? _encontreiEpisodeIndex.get(key) : _encontreiMovieIndex.get(id)) : (tv ? _vizerEpisodeIndex.get(key) : _vizerMovieIndex.get(id));
      if (!refresh && entry?.servers?.byse) return { fileId: String(entry.servers.byse), audio: entry.audio || 'Dublado', source };
      let raw: any;
      if (source === 'encontrei') {
        if (tv) {
          if (!_tmdbToSerieIdMap.has(id)) await ensureEncontreiFreshContent('series', name);
          const series = _tmdbToSerieIdMap.get(id); if (!series) return null;
          const video = await encontreiEpisodeId(series, season!, episode!, true); if (!video) return null;
          raw = await encontreiPlayerData(video);
        } else {
          if (!entry) await ensureEncontreiFreshContent('movies', name);
          const movie = _encontreiMovieIndex.get(id); if (!movie?.video_id) return null;
          raw = await encontreiPlayerData(movie.video_id);
        }
      } else if (tv) {
        if (!_tmdbToSerieIdMap.has(id)) await ensureVizerFreshContent('series', name);
        const series = _tmdbToSerieIdMap.get(id); if (!series) return null;
        const list = await vizerFetchJson(`do=episodesList&id=${series}&season=${season}&audio=Dublado`, 4000);
        const ep = list?.episodes?.find((x: any) => Number(x.number) === episode);
        const video = String(ep?.url || '').match(/-(\d+)\/?$/)?.[1]; if (!video) return null;
        raw = await vizerFetchJson(`do=playerData&id=${video}`, 4000);
      } else {
        loadVizerMovieIds();
        if (!_tmdbToVizerMovieIdMap.has(id)) await ensureVizerFreshContent('movies', name);
        const video = _tmdbToVizerMovieIdMap.get(id); if (!video) return null;
        raw = await vizerFetchJson(`do=playerData&id=${video}`, 4000);
      }
      // One playerData discovery supplies hints for all three hosters. Do not
      // perform three independent live scrapes for the same content.
      const liveServers:Record<string,string>={},serverAudio:Record<string,string>={};
      for(const [field,audio] of [['servers_dub','Dublado'],['servers_leg','Legendado']]){
        const value=String(raw?.[field]||'').replace(/&amp;/g,'&');
        for(const provider of ['byse','mixdrop','streamtape']){
          const fileId=value.match(new RegExp('(?:^|&)'+provider+'=([a-zA-Z0-9_-]+)','i'))?.[1];
          if(fileId&&!liveServers[provider]){liveServers[provider]=fileId;serverAudio[provider]=audio;}
        }
      }
      if(Object.keys(liveServers).length){
        const index=source==='encontrei'?(tv?_encontreiEpisodeIndex:_encontreiMovieIndex):(tv?_vizerEpisodeIndex:_vizerMovieIndex);
        const target=index as Map<any,any>,identity=tv?key:id,previous=target.get(identity)||{};
        target.set(identity,{...previous,tmdb_id:id,season,episode,servers:{...previous.servers,...liveServers},server_audio:{...previous.server_audio,...serverAudio}});
      }
      for (const [field, audio] of [['servers_dub', 'Dublado'], ['servers_leg', 'Legendado']]) {
        const fileId = String(raw?.[field] || '').replace(/&amp;/g, '&').match(/(?:^|&)byse=([a-zA-Z0-9_-]+)/i)?.[1];
        if (fileId) return { fileId, audio, source };
      }
      return null;
    };
    try { return await Promise.race([work(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 8000); })]); }
    catch { return null; } finally { clearTimeout(timer); }
  }))).filter((x): x is NonNullable<typeof x> => !!x).sort((a,b) => Number(a.audio !== 'Dublado') - Number(b.audio !== 'Dublado'));
}

// Snapshot hints only: absent entries are NOT proof that a provider lacks content.
export function getPlaybackCataloguePresence(id: number, season?: number, episode?: number) {
  loadCatalogs();
  const tv=season!==undefined&&episode!==undefined,key=`${id}:${season}:${episode}`;
  const entries=[tv?_encontreiEpisodeIndex.get(key):_encontreiMovieIndex.get(id),tv?_vizerEpisodeIndex.get(key):_vizerMovieIndex.get(id)].filter(Boolean);
  return Object.fromEntries(['byse','streamtape','mixdrop'].map(provider=>['srv_'+provider,{audioPriority:Math.min(2,...entries.filter(e=>!!e.servers?.[provider]).map(e=>/dublad|nacional|portugu|pt[-_ ]?br/i.test(e.server_audio?.[provider]||e.audio||'')?0:(e.server_audio?.[provider]||e.audio)?2:1)),listed:entries.some(e=>!!e.servers?.[provider]),fileIds:[...new Set(entries.map(e=>String(e.servers?.[provider]||'')).filter(Boolean))]}]));
}
