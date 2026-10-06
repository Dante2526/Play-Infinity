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

let isCatalogLoaded = false;

// Busca o catálogo da API do Nixplay (Xtream Codes API)
export async function loadNixplayCatalog() {
  if (isCatalogLoaded) return;
  console.log("[NixplayCatalog] Iniciando sincronização do catálogo...");

  try {
    // 1. Busca Filmes
    const moviesRes = await fetch("https://nixplay.lat/player_api.php?username=testelogado-vods&password=GwXanZ3Dj&action=get_vod_streams", { signal: AbortSignal.timeout(15000) });
    if (moviesRes.ok) {
      const movies = await moviesRes.json();
      movies.forEach((m: any) => {
        if (m.tmdb_id) nixplayMovies.add(String(m.tmdb_id));
      });
      console.log(`[NixplayCatalog] 🎬 ${nixplayMovies.size} filmes indexados.`);
    }

    // 2. Busca Séries
    const seriesRes = await fetch("https://nixplay.lat/player_api.php?username=testelogado-vods&password=GwXanZ3Dj&action=get_series", { signal: AbortSignal.timeout(15000) });
    if (seriesRes.ok) {
      const series = await seriesRes.json();
      series.forEach((s: any) => {
        if (s.series_id) {
          nixplaySeries.add(String(s.series_id));
          // NOVO: mapeia nome → series_id (lowercase pra match case-insensitive)
          if (s.name) {
            nixplaySeriesNameToId.set(s.name.toLowerCase(), String(s.series_id));
          }
        }
      });
      console.log(`[NixplayCatalog] 📺 ${nixplaySeries.size} séries indexadas (${nixplaySeriesNameToId.size} nomes mapeados).`);
    }

    isCatalogLoaded = true;
  } catch (err) {
    console.error("[NixplayCatalog] Erro ao sincronizar catálogo:", err);
  }
}

// Checa se existe no Nixplay por tmdb_id (caso comum onde tmdb_id == series_id)
export function isNixplayAvailable(tmdbId: string | number, isSeries: boolean): boolean {
  if (!isCatalogLoaded) return false;
  const idStr = String(tmdbId);
  return isSeries ? nixplaySeries.has(idStr) : nixplayMovies.has(idStr);
}

// NOVO: Resolve o series_id do Nixplay dado um tmdb_id + nome da série.
// Retorna o tmdb_id se ele existir no Set (caso comum), ou busca pelo nome
// se o tmdb_id não estiver no Set (caso HxH onde tmdb_id != series_id).
export function resolveNixplaySeriesId(tmdbId: string | number, seriesName?: string): string | null {
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
