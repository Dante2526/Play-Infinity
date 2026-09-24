import fs from "fs";
import path from "path";

// Caches em memória (Sets para busca O(1))
export const nixplayMovies = new Set<string>();
export const nixplaySeries = new Set<string>();

let isCatalogLoaded = false;

// Busca o catálogo da API do Nixplay (Xtream Codes API)
export async function loadNixplayCatalog() {
  if (isCatalogLoaded) return;
  console.log("[NixplayCatalog] Iniciando sincronização do catálogo...");

  try {
    // 1. Busca Filmes
    const moviesRes = await fetch("https://nixplay.lat/player_api.php?username=testelogado-vods&password=GwXanZ3Dj&action=get_vod_streams");
    if (moviesRes.ok) {
      const movies = await moviesRes.json();
      movies.forEach((m: any) => {
        if (m.tmdb_id) nixplayMovies.add(String(m.tmdb_id));
      });
      console.log(`[NixplayCatalog] 🎬 ${nixplayMovies.size} filmes indexados.`);
    }

    // 2. Busca Séries
    const seriesRes = await fetch("https://nixplay.lat/player_api.php?username=testelogado-vods&password=GwXanZ3Dj&action=get_series");
    if (seriesRes.ok) {
      const series = await seriesRes.json();
      series.forEach((s: any) => {
        if (s.series_id) nixplaySeries.add(String(s.series_id));
      });
      console.log(`[NixplayCatalog] 📺 ${nixplaySeries.size} séries indexadas.`);
    }

    isCatalogLoaded = true;
  } catch (err) {
    console.error("[NixplayCatalog] Erro ao sincronizar catálogo:", err);
  }
}

// Checa se existe no Nixplay (O(1))
export function isNixplayAvailable(tmdbId: string | number, isSeries: boolean): boolean {
  if (!isCatalogLoaded) return false; // Falha segura se ainda não carregou
  const idStr = String(tmdbId);
  return isSeries ? nixplaySeries.has(idStr) : nixplayMovies.has(idStr);
}
