import fs from "fs";
import path from "path";

// Caches em memória (Sets para busca O(1))
export const nixplayMovies = new Set<string>();
export const nixplaySeries = new Set<string>();

// NOVO: Map de nome da série → series_id do Nixplay
// Necessário porque a API get_series NÃO retorna tmdb_id.
// Para a maioria das séries, series_id == tmdb_id (ex: Loki = 84958).
// Mas para algumas (ex: HxH), series_id != tmdb_id (46298 vs 45952).
export const nixplaySeriesNameToId = new Map<string, string>();

// ──────────────────────────────────────────────────────────────────────────
// CACHE EM DISCO + RE-SINCRONIZAÇÃO THROTTLED (08/10/2026)
//
// Antes, o catálogo vivia SÓ em memória: cada restart do servidor (deploy)
// zerava tudo e o primeiro /api/nixplay-check dependia do nixplay.lat
// responder — se ele estava lento/fora, o Nixplay SUMIA do seletor do player
// (caso real: Carrie a Estranha logo após um deploy).
// Agora: o catálogo é persistido em data/nixplay-catalog-cache.json (pasta já
// fora do Vite watch) e recarregado instantaneamente no boot; o nixplay.lat é
// re-sincronizado em background no máx 1x/30min. Falha do nixplay.lat nunca
// mais esconde o servidor — usa o cache stale até voltar.
// ──────────────────────────────────────────────────────────────────────────
const CACHE_PATH = path.join(process.cwd(), "data", "nixplay-catalog-cache.json");
const SYNC_THROTTLE_MS = 30 * 60 * 1000;

let isCatalogLoaded = false;
let lastSyncAttemptAt = 0;
let syncInflight: Promise<void> | null = null;

/** Carrega o cache do disco (instantâneo). Retorna true se usável. */
function loadDiskCache(): boolean {
  try {
    if (!fs.existsSync(CACHE_PATH)) return false;
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    if (!data || !Array.isArray(data.movies) || !Array.isArray(data.series)) return false;
    nixplayMovies.clear();
    for (const m of data.movies) nixplayMovies.add(String(m));
    nixplaySeries.clear();
    for (const s of data.series) nixplaySeries.add(String(s));
    nixplaySeriesNameToId.clear();
    if (Array.isArray(data.names)) {
      for (const pair of data.names) {
        if (Array.isArray(pair) && pair.length === 2) {
          nixplaySeriesNameToId.set(String(pair[0]), String(pair[1]));
        }
      }
    }
    console.log(`[NixplayCatalog] Cache do disco carregado: ${nixplayMovies.size} filmes, ${nixplaySeries.size} séries.`);
    return nixplaySeries.size > 0 || nixplayMovies.size > 0;
  } catch (err) {
    console.warn("[NixplayCatalog] Falha ao ler cache do disco:", err);
    return false;
  }
}

/** Persiste o catálogo atual no disco (best effort). */
function saveDiskCache(): void {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify({
      savedAt: Date.now(),
      movies: [...nixplayMovies],
      series: [...nixplaySeries],
      names: [...nixplaySeriesNameToId.entries()],
    }), "utf-8");
    console.log(`[NixplayCatalog] Cache salvo no disco (${nixplayMovies.size} filmes, ${nixplaySeries.size} séries).`);
  } catch (err) {
    console.warn("[NixplayCatalog] Falha ao salvar cache no disco:", err);
  }
}

/** Sincroniza ao vivo com a API do Nixplay (Xtream Codes). Retorna true se ao menos uma parte OK. */
async function runLiveSync(): Promise<boolean> {
  let moviesOk = false;
  let seriesOk = false;

  // 1. Filmes
  try {
    const moviesRes = await fetch("https://nixplay.lat/player_api.php?username=testelogado-vods&password=GwXanZ3Dj&action=get_vod_streams", { signal: AbortSignal.timeout(15000) });
    if (moviesRes.ok) {
      const movies = await moviesRes.json();
      if (Array.isArray(movies) && movies.length > 0) {
        nixplayMovies.clear();
        movies.forEach((m: any) => {
          if (m.tmdb_id) nixplayMovies.add(String(m.tmdb_id));
        });
      }
      moviesOk = true;
      console.log(`[NixplayCatalog] 🎬 ${nixplayMovies.size} filmes indexados.`);
    }
  } catch (err) {
    console.warn("[NixplayCatalog] Falha ao sincronizar filmes:", err);
  }

  // 2. Séries
  try {
    const seriesRes = await fetch("https://nixplay.lat/player_api.php?username=testelogado-vods&password=GwXanZ3Dj&action=get_series", { signal: AbortSignal.timeout(15000) });
    if (seriesRes.ok) {
      const series = await seriesRes.json();
      if (Array.isArray(series) && series.length > 0) {
        nixplaySeries.clear();
        nixplaySeriesNameToId.clear();
        series.forEach((s: any) => {
          if (s.series_id) {
            nixplaySeries.add(String(s.series_id));
            // mapeia nome → series_id (lowercase pra match case-insensitive)
            if (s.name) {
              nixplaySeriesNameToId.set(s.name.toLowerCase(), String(s.series_id));
            }
          }
        });
      }
      seriesOk = true;
      console.log(`[NixplayCatalog] 📺 ${nixplaySeries.size} séries indexadas (${nixplaySeriesNameToId.size} nomes mapeados).`);
    }
  } catch (err) {
    console.warn("[NixplayCatalog] Falha ao sincronizar séries:", err);
  }

  // Sucesso parcial conta (o restante do catálogo em memória continua usável).
  return seriesOk || moviesOk;
}

/** Re-sincronização ao vivo em background com throttle (no máx 1x/30min). */
function maybeBackgroundSync(): void {
  if (syncInflight) return;
  if (Date.now() - lastSyncAttemptAt < SYNC_THROTTLE_MS) return;
  lastSyncAttemptAt = Date.now();
  syncInflight = (async () => {
    try {
      const ok = await runLiveSync();
      if (ok) saveDiskCache();
    } finally {
      syncInflight = null;
    }
  })();
  syncInflight.catch(err => console.warn("[NixplayCatalog] Erro na re-sincronização em background:", err));
}

// Busca o catálogo: cache do disco instantâneo + sync ao vivo sob demanda.
export async function loadNixplayCatalog() {
  // 1. Cache do disco: disponibilidade instantânea, independente do nixplay.lat
  if (!isCatalogLoaded && loadDiskCache()) {
    isCatalogLoaded = true;
  }

  // 2. Sem cache em memória/disco: primeira sincronização ao vivo (bloqueante,
  //    comportamento legado). Se falhar, a próxima chamada tenta de novo.
  if (!isCatalogLoaded) {
    lastSyncAttemptAt = Date.now();
    const ok = await runLiveSync();
    if (ok) {
      isCatalogLoaded = true;
      saveDiskCache();
    }
    return;
  }

  // 3. Catálogo usável: mantém fresco em background
  maybeBackgroundSync();
}

// Checa se existe no Nixplay por tmdb_id (caso comum onde tmdb_id == series_id)
export function isNixplayAvailable(tmdbId: string | number, isSeries: boolean): boolean {
  if (String(tmdbId) === "46298") return false; // Bloqueia Hunter x Hunter 2011 (streams offline 503)
  if (!isCatalogLoaded) return false;
  const idStr = String(tmdbId);
  return isSeries ? nixplaySeries.has(idStr) : nixplayMovies.has(idStr);
}

// NOVO: Resolve o series_id do Nixplay dado um tmdb_id + nome da série.
// Retorna o tmdb_id se ele existir no Set (caso comum), ou busca pelo nome
// se o tmdb_id não estiver no Set (caso HxH onde tmdb_id != series_id).
export function resolveNixplaySeriesId(tmdbId: string | number, seriesName?: string): string | null {
  if (String(tmdbId) === "46298") return null; // Bloqueia Hunter x Hunter 2011 (streams offline 503)
  if (!isCatalogLoaded) return null;
  const idStr = String(tmdbId);

  // Caso 1: tmdb_id está no Set (séries onde tmdb_id == series_id, ex: Loki 84958)
  if (nixplaySeries.has(idStr)) {
    return idStr;
  }

  // Caso 2: tmdb_id não está no Set, mas talvez o series_id seja diferente
  // Busca pelo nome da série no Map (case-insensitive)
  if (seriesName) {
    const nameLower = seriesName.toLowerCase();
    // Tenta match exato
    if (nixplaySeriesNameToId.has(nameLower)) {
      return nixplaySeriesNameToId.get(nameLower)!;
    }
    // Tenta match parcial (nome da série contém o termo ou vice-versa)
    for (const [mapName, mapId] of nixplaySeriesNameToId) {
      if (mapName.includes(nameLower) || nameLower.includes(mapName)) {
        return mapId;
      }
    }
  }

  return null;
}
