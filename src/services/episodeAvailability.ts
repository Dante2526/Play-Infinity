// Serviço de verificação de disponibilidade real de episódios nos servidores homologados (WatchPlayer e VIP Player)

interface AvailableEpisodesResponse {
  success: boolean;
  id: string;
  season: number;
  availableEpisodes: number[];
  totalAvailable: number;
  cached?: boolean;
}

// Cache em memória no cliente para transições ultra-rápidas
const clientAvailabilityCache = new Map<string, { timestamp: number; episodes: number[] }>();
const CLIENT_CACHE_TTL = 15 * 60 * 1000; // 15 minutos

/**
 * Consulta a API do backend para saber quais episódios da temporada
 * realmente possuem streaming ativo nos servidores (eliminando episódios fantasmas).
 */
export async function getAvailableEpisodes(
  tmdbId: number | string,
  season: number,
  totalSeasonEpisodes: number = 24
): Promise<number[]> {
  const idStr = String(tmdbId).trim();
  if (!idStr) {
    return Array.from({ length: totalSeasonEpisodes }, (_, i) => i + 1);
  }

  const cacheKey = `${idStr}_${season}`;
  const cached = clientAvailabilityCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL) {
    return cached.episodes;
  }

  try {
    const res = await fetch(
      `/api/series/available-episodes?id=${encodeURIComponent(idStr)}&season=${season}&total=${totalSeasonEpisodes}`
    );

    if (!res.ok) {
      // Fallback gracioso em caso de instabilidade
      return Array.from({ length: totalSeasonEpisodes }, (_, i) => i + 1);
    }

    const data: AvailableEpisodesResponse = await res.json();
    if (data && data.success && Array.isArray(data.availableEpisodes) && data.availableEpisodes.length > 0) {
      clientAvailabilityCache.set(cacheKey, {
        timestamp: Date.now(),
        episodes: data.availableEpisodes,
      });
      return data.availableEpisodes;
    }
  } catch (err) {
    console.warn("[episodeAvailability] Falha ao consultar disponibilidade nos servidores:", err);
  }

  // Fallback padrão se não conseguir verificar
  return Array.from({ length: totalSeasonEpisodes }, (_, i) => i + 1);
}
