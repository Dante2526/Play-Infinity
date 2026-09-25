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
const clientSeasonsCache = new Map<string, { timestamp: number; seasons: number[] }>();
const clientPlayableCache = new Map<number, boolean>();
const CLIENT_CACHE_TTL = 15 * 60 * 1000; // 15 minutos

/**
 * Consulta em lote quais IDs possuem reprodução disponível no catálogo oficial
 */
export async function checkPlayableBatch(tmdbIds: number[]): Promise<Set<number>> {
  const result = new Set<number>();
  const toFetch: number[] = [];

  for (const id of tmdbIds) {
    if (clientPlayableCache.has(id)) {
      if (clientPlayableCache.get(id)) {
        result.add(id);
      }
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length === 0) {
    return result;
  }

  try {
    const res = await fetch(`/api/check-playable-batch?ids=${toFetch.join(",")}`);
    if (res.ok) {
      const data = await res.json();
      const playableList: number[] = data.playableIds || [];
      const playableSet = new Set(playableList);

      for (const id of toFetch) {
        const isPlayable = playableSet.has(id);
        clientPlayableCache.set(id, isPlayable);
        if (isPlayable) {
          result.add(id);
        }
      }
    }
  } catch (err) {
    console.warn("[episodeAvailability] Falha ao verificar batch de reprodução:", err);
  }

  return result;
}

/**
 * Consulta a API do backend para saber quais temporadas de uma série
 * realmente possuem episódios ativos e verificados nos servidores homologados.
 */
export async function getAvailableSeasonsForSeries(
  tmdbId: number | string,
  candidateSeasons?: number[]
): Promise<number[]> {
  const fallbackSeasons = candidateSeasons && candidateSeasons.length > 0 ? candidateSeasons : [1];
  const idStr = String(tmdbId).trim();
  if (!idStr || isNaN(Number(idStr))) {
    return fallbackSeasons;
  }

  const cacheKey = `${idStr}:${(candidateSeasons || []).slice().sort((a, b) => a - b).join(",")}`;
  const cached = clientSeasonsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL) {
    if (cached.seasons && cached.seasons.length > 0) {
      return cached.seasons;
    }
    return fallbackSeasons;
  }

  try {
    const candidatesParam = candidateSeasons && candidateSeasons.length > 0
      ? `&candidate_seasons=${encodeURIComponent(candidateSeasons.join(","))}`
      : "";
    const res = await fetch(`/api/series-seasons-available?tmdb_id=${encodeURIComponent(idStr)}${candidatesParam}&_cb=${Date.now()}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && Array.isArray(data.seasons) && data.seasons.length > 0) {
        clientSeasonsCache.set(cacheKey, {
          timestamp: Date.now(),
          seasons: data.seasons,
        });
        return data.seasons;
      }
    }
  } catch (err) {
    console.warn("[episodeAvailability] Falha ao consultar temporadas disponíveis:", err);
  }

  return fallbackSeasons;
}

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
      `/api/check-season?tmdbId=${encodeURIComponent(idStr)}&season=${season}&count=${totalSeasonEpisodes}`
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
