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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const url = `https://www.vizer.website/index.php?app=videobox&module=video&controller=view&do=episodesList&id=${serieId}&season=${numericSeason}&audio=Dublado`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      vizerSeasonCache.set(key, { ok: false, timestamp: Date.now() });
      return false;
    }
    const data = await res.json();
    const ok = Array.isArray(data.episodes) && data.episodes.length > 0;
    vizerSeasonCache.set(key, { ok, timestamp: Date.now() });
    return ok;
  } catch {
    return false;
  }
}

export async function resolveVizerEpisode(
  tmdbId: number,
  season: number,
  episode: number
) {
  loadCatalogs();
  const serieId = _tmdbToSerieIdMap.get(tmdbId);
  if (!serieId) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const listUrl = `https://www.vizer.website/index.php?app=videobox&module=video&controller=view&do=episodesList&id=${serieId}&season=${season}&audio=Dublado`;
    const res = await fetch(listUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const eps = data.episodes || [];
    if (!eps.length) return null;

    const target = eps.find((e: any) => parseInt(e.number, 10) === episode) || eps[episode - 1];
    if (!target) return null;

    const vidMatch = target.url.match(/-(\d+)\/?$/);
    if (!vidMatch) return null;
    const vid = vidMatch[1];

    const pController = new AbortController();
    const pTimeout = setTimeout(() => pController.abort(), 3500);
    const pUrl = `https://www.vizer.website/index.php?app=videobox&module=video&controller=view&do=playerData&id=${vid}`;
    const pRes = await fetch(pUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json",
      },
      signal: pController.signal,
    });
    clearTimeout(pTimeout);
    if (!pRes.ok) return null;
    const pData = await pRes.json();
    const sStr = ((pData.servers_dub || "") + "&" + (pData.servers_leg || "")).replace(/&amp;/g, "&");

    // Extrai apenas mixdrop (streamtape/byse/doodstream foram removidos — só usamos mixdrop)
    const mMix = sStr.match(/(?:^|&)mixdrop=([^&]+)/i);
    const mixdrop = mMix ? mMix[1] : null;
    if (!mixdrop) return null;

    const epObj = {
      episode_id: parseInt(vid, 10),
      serie_id: serieId,
      season,
      episode,
      tmdb_id: tmdbId,
      audio: pData.current_audio || "Dublado",
      servers: { mixdrop },
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
      audio: epObj.audio,
      server_name: "MixDrop",
      season,
      episode,
      source: "vizer-live",
      mixdrop_vizer: mixdrop,
      mixdrop_encontrei: null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve um FILME on-demand no Vizer.beauty (espelho de resolveVizerEpisode
 * mas pra filmes em vez de episódios).
 *
 * Fluxo:
 * 1. Carrega mapeamento TMDB → vizer_movie_id (de public/data/vizer-movie-ids.json)
 * 2. AJAX em /do=playerData?id={vizer_movie_id}
 * 3. Extrai apenas mixdrop de servers_dub + servers_leg
 * 4. Salva no _vizerMovieIndex em memória (próxima busca é instantânea)
 *
 * Use case: filme existe no encontrei-catalog mas mixdrop fileId morreu
 * (Mixdrop apagou o arquivo). Esse resolver re-busca o fileId atual do Vizer.
 *
 * @returns { mixdrop, audio, server_name, source: "vizer-live" } ou null.
 */
export async function resolveVizerMovie(tmdbId: number) {
  loadVizerMovieIds();
  const vizerMovieId = _tmdbToVizerMovieIdMap.get(tmdbId);
  if (!vizerMovieId) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const pUrl = `https://www.vizer.website/index.php?app=videobox&module=video&controller=view&do=playerData&id=${vizerMovieId}`;
    const pRes = await fetch(pUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json",
        "Referer": `https://www.vizer.website/filmes/online/x-${vizerMovieId}/`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!pRes.ok) return null;
    const pData = await pRes.json();
    const sStr = ((pData.servers_dub || "") + "&" + (pData.servers_leg || "")).replace(/&amp;/g, "&");

    // Extrai apenas mixdrop (streamtape/byse/doodstream removidos)
    const mMix = sStr.match(/(?:^|&)mixdrop=([^&]+)/i);
    const mixdrop = mMix ? mMix[1] : null;
    if (!mixdrop) return null;

    const movieObj = {
      video_id: vizerMovieId,
      tmdb_id: tmdbId,
      audio: pData.current_audio || "Dublado",
      servers: { mixdrop },
      _fetchedAt: Date.now()
    };

    // Cache no índice em memória (próxima busca = instantânea)
    _vizerMovieIndex.set(tmdbId, movieObj);

    return {
      mixdrop,
      audio: movieObj.audio,
      server_name: "MixDrop",
      source: "vizer-live",
      mixdrop_vizer: mixdrop,
      mixdrop_encontrei: null,
    };
  } catch {
    return null;
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
    const target = eps.find((e: any) => parseInt(e.number, 10) === episode) || eps[episode - 1];
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

/** Extrai SÓ mixdrop de um playerData JSON. Tenta servers_dub primeiro, depois servers_leg.
 *  Áudio = "Dublado" se servers_dub tem conteúdo, senão "Legendado". */
function pickMixdrop(d: any): { mixdrop: string; audio: "Dublado" | "Legendado" } | null {
  if (!d || typeof d !== "object") return null;
  const dubRaw = String(d.servers_dub || "");
  const legRaw = String(d.servers_leg || "");
  const dub = dubRaw.replace(/&amp;/g, "&");
  const leg = legRaw.replace(/&amp;/g, "&");
  const audio: "Dublado" | "Legendado" = dubRaw.length > 0 ? "Dublado" : "Legendado";
  const RE = /(?:^|&)mixdrop=([^&]+)/i;
  const mDub = dub.match(RE);
  if (mDub) return { mixdrop: mDub[1], audio: "Dublado" };
  const mLeg = leg.match(RE);
  if (mLeg) return { mixdrop: mLeg[1], audio: "Legendado" };
  return null;
}

/** Resolve episódio no encontrei.me live (cookie necessário). */
export async function resolveEncontreiEpisode(
  tmdbId: number,
  season: number,
  episode: number,
): Promise<{
  mixdrop: string;
  mixdrop_encontrei: string;
  mixdrop_vizer: null;
  audio: string;
  server_name: string;
  season: number;
  episode: number;
  source: string;
} | null> {
  loadCatalogs();
  // CORREÇÃO: _tmdbToSerieIdMap é Map<number, number> (chave numérica, sem prefixo)
  const serieId = _tmdbToSerieIdMap.get(tmdbId);
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
    // tmdb_id, audio, servers:{mixdrop}, _fetchedAt
    _encontreiEpisodeIndex.set(key, {
      episode_id: epId,
      serie_id: serieId,
      season,
      episode,
      tmdb_id: tmdbId,
      audio: picked.audio,
      servers: { mixdrop: picked.mixdrop },
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
export async function resolveEncontreiMovie(tmdbId: number): Promise<{
  mixdrop: string;
  mixdrop_encontrei: string;
  mixdrop_vizer: null;
  audio: string;
  server_name: string;
  source: string;
} | null> {
  loadCatalogs();
  const entry = _encontreiMovieIndex.get(tmdbId);
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
      servers: { mixdrop: picked.mixdrop, ...(entry.servers || {}) },
      _fetchedAt: Date.now(),
    });

    return {
      mixdrop: picked.mixdrop,
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
let _vizerCatalog: any = null;
let _vizerMovieIndex: Map<number, any> = new Map();
let _vizerEpisodeIndex: Map<string, any> = new Map();
let _vizerSeriesSeasonsIndex: Map<number, number[]> = new Map();
let _vizerLastMtime = 0;

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
  // Carrega vizer (primário) primeiro
  tryLoadCatalog(
    "vizer-catalog.json",
    { get value() { return _vizerCatalog; }, set value(v) { _vizerCatalog = v; } },
    _vizerMovieIndex,
    _vizerEpisodeIndex,
    _vizerSeriesSeasonsIndex,
    { get value() { return _vizerLastMtime; }, set value(v) { _vizerLastMtime = v; } },
    "vizer-lookup",
  );
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

    // 4. Sonda itens não encontrados em lote rápido (máximo 15 por requisição)
    const itemsToProbe = unverifiedItems.slice(0, 15);
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

      let bestEp = null;
      let bestSource = "";

      if (vizerEp && vizerEp.servers?.mixdrop && encontreiEp && encontreiEp.servers?.mixdrop) {
        // Ambos têm o episódio no MixDrop. Priorizamos Dublado.
        if (vizerEp.audio !== "Dublado" && encontreiEp.audio === "Dublado") {
          bestEp = encontreiEp;
          bestSource = "encontrei";
        } else {
          bestEp = vizerEp;
          bestSource = "vizer";
        }
      } else if (vizerEp && vizerEp.servers?.mixdrop) {
        bestEp = vizerEp;
        bestSource = "vizer";
      } else if (encontreiEp && encontreiEp.servers?.mixdrop) {
        bestEp = encontreiEp;
        bestSource = "encontrei";
      }

      if (bestEp) {
        const mixdrop_encontrei = encontreiEp?.servers?.mixdrop || null;
        const mixdrop_vizer = vizerEp?.servers?.mixdrop || null;

        result = {
          mixdrop: bestEp.servers.mixdrop,
          mixdrop_encontrei,
          mixdrop_vizer,
          audio: bestEp.audio || "Dublado",
          server_name: "MixDrop",
          season: bestEp.season,
          episode: bestEp.episode,
          source: bestSource,
        };
      } else {
        // Catálogo falhou OU refresh=1: tenta resolver live (encontrei primeiro, vizer depois)
        const live = (await resolveEncontreiEpisode(tmdbId, season, episode))
                  || (await resolveVizerEpisode(tmdbId, season, episode));
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

      let bestMovie = null;
      let bestSource = "";

      if (vizerMovie && vizerMovie.servers?.mixdrop && encontreiMovie && encontreiMovie.servers?.mixdrop) {
        // Ambos têm o filme no MixDrop. Priorizamos Dublado.
        if (vizerMovie.audio !== "Dublado" && encontreiMovie.audio === "Dublado") {
          bestMovie = encontreiMovie;
          bestSource = "encontrei";
        } else {
          bestMovie = vizerMovie;
          bestSource = "vizer";
        }
      } else if (vizerMovie && vizerMovie.servers?.mixdrop) {
        bestMovie = vizerMovie;
        bestSource = "vizer";
      } else if (encontreiMovie && encontreiMovie.servers?.mixdrop) {
        bestMovie = encontreiMovie;
        bestSource = "encontrei";
      }

      if (bestMovie) {
        // Retornar ambos os IDs de fallback (encontrei e vizer) para que o player
        // possa tentar o Vizer se o Encontrei falhar e vice-versa
        const mixdrop_encontrei = encontreiMovie?.servers?.mixdrop || null;
        const mixdrop_vizer = vizerMovie?.servers?.mixdrop || null;

        result = {
          mixdrop: bestMovie.servers.mixdrop,
          mixdrop_encontrei,
          mixdrop_vizer,
          audio: bestMovie.audio || "Dublado",
          server_name: "MixDrop",
          source: bestSource,
        };
      } else {
        // Catálogo falhou OU refresh=1: tenta resolver live (encontrei primeiro, vizer depois)
        const live = (await resolveEncontreiMovie(tmdbId))
                  || (await resolveVizerMovie(tmdbId));
        if (live) {
          result = live;
        }
      }
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

router.get("/api/downloads-catalog", (req, res) => {
  try {
    loadCatalogs();

    const type = (req.query.type as string) || "all";
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    // Junta filmes dos DOIS catálogos (vizer + encontrei), dedup por tmdbId
    const movieMap = new Map<number, { tmdbId: number; type: "movie"; mixdrop: string; audio: string }>();
    
    if (type === "all" || type === "movie") {
      // Vizer primeiro
      if (_vizerCatalog) {
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
    }

    // Junta séries dos DOIS catálogos, dedup por tmdbId
    const seriesMap = new Map<number, { tmdbId: number; type: "series"; totalEpisodes: number; seasons: number[]; audio: string }>();
    
    if (type === "all" || type === "tv" || type === "series") {
      // Vizer
      if (_vizerCatalog) {
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
              // Se já existe, só incrementa se a season/episode não tiver sido contada
              // (pra não duplicar eps que existem nos dois catálogos)
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
    }

    const movieItems = Array.from(movieMap.values());
    const seriesItems = Array.from(seriesMap.values());
    const allItems = [...movieItems, ...seriesItems];
    const total = allItems.length;
    const paginated = allItems.slice(offset, offset + limit);

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
