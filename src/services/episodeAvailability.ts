// Serviço de verificação de disponibilidade real de episódios nos servidores homologados (WatchPlayer e VIP Player)

interface AvailableEpisodesResponse {
  success: boolean;
  id: string;
  season: number;
  availableEpisodes: number[];
  totalAvailable: number;
  cached?: boolean;
  // true => resposta definitiva derivada do catálogo local (confiável p/ ocultar eps fantasmas)
  // false => resposta baseada em sondagem de rede (não ocultar eps declarados pelo TMDB)
  verifiedFromCatalog?: boolean;
}

export interface EpisodeAvailabilityInfo {
  episodes: number[];
  verifiedFromCatalog: boolean;
  requested: number;
}

function fullRange(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

// Cache em memória no cliente para transições ultra-rápidas
// TTL curto pra evitar problema de cache stale quando catálogo server-side ganha
// temporadas novas (ex: T5 do Ghosts adicionado depois do cache populado)
const clientAvailabilityCache = new Map<string, { timestamp: number; episodes: number[]; verifiedFromCatalog: boolean }>();
const clientSeasonsCache = new Map<string, { timestamp: number; seasons: number[] }>();
const clientPlayableCache = new Map<number, boolean>();
const CLIENT_CACHE_TTL = 3 * 60 * 1000; // 3 minutos (reduzido de 15min)

export type PlayableCheckItem = number | { id: number; type?: 'movie' | 'tv' | 'series' };

/**
 * Consulta em lote quais IDs possuem reprodução disponível no catálogo oficial
 */
export async function checkPlayableBatch(items: PlayableCheckItem[]): Promise<Set<number>> {
  const result = new Set<number>();
  const toFetchItems: { id: number; type?: string }[] = [];

  for (const item of items) {
    const id = typeof item === "number" ? item : item.id;
    const type = typeof item === "object" ? item.type : undefined;
    if (!id) continue;

    if (clientPlayableCache.has(id)) {
      if (clientPlayableCache.get(id)) {
        result.add(id);
      }
    } else {
      toFetchItems.push({ id, type });
    }
  }

  if (toFetchItems.length === 0) {
    return result;
  }

  try {
    const res = await fetch("/api/check-playable-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: toFetchItems,
        ids: toFetchItems.map(i => i.id)
      })
    });
    if (res.ok) {
      const data = await res.json();
      const playableList: number[] = data.playableIds || [];
      const playableSet = new Set(playableList);

      for (const item of toFetchItems) {
        const isPlayable = playableSet.has(item.id);
        clientPlayableCache.set(item.id, isPlayable);
        if (isPlayable) {
          result.add(item.id);
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
  candidateSeasons?: number[],
  forceRefresh?: boolean
): Promise<number[]> {
  const fallbackSeasons = candidateSeasons && candidateSeasons.length > 0 ? candidateSeasons : [1];
  const idStr = String(tmdbId).trim();
  if (!idStr || isNaN(Number(idStr))) {
    return fallbackSeasons;
  }

  const cacheKey = `${idStr}:${(candidateSeasons || []).slice().sort((a, b) => a - b).join(",")}`;
  const cached = !forceRefresh ? clientSeasonsCache.get(cacheKey) : null;
  if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL) {
    if (cached.seasons && cached.seasons.length > 0 && (!candidateSeasons || cached.seasons.length >= candidateSeasons.length)) {
      return cached.seasons;
    }
  }

  try {
    const candidatesParam = candidateSeasons && candidateSeasons.length > 0
      ? `&candidate_seasons=${encodeURIComponent(candidateSeasons.join(","))}`
      : "";
    const refreshParam = forceRefresh ? "&force_refresh=true" : "";
    const res = await fetch(`/api/series-seasons-available?tmdb_id=${encodeURIComponent(idStr)}${candidatesParam}${refreshParam}&_cb=${Date.now()}`, {
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
 *
 * Retorna também se a resposta veio de um catálogo local definitivo
 * (verifiedFromCatalog === true) ou de sondagens de rede não-conclusivas.
 * Quando não-conclusiva, o front deve manter todos os episódios declarados
 * pelo TMDB — uma falha de probe não significa que um episódio não existe
 * (ex: HxH 2011, onde os IDs do Nixplay não seguem a numeração do TMDB).
 */
export async function getAvailableEpisodes(
  tmdbId: number | string,
  season: number,
  totalSeasonEpisodes: number = 24
): Promise<EpisodeAvailabilityInfo> {
  const idStr = String(tmdbId).trim();
  if (!idStr) {
    return { episodes: fullRange(totalSeasonEpisodes), verifiedFromCatalog: false, requested: totalSeasonEpisodes };
  }

  const cacheKey = `${idStr}_${season}`;
  const cached = clientAvailabilityCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL) {
    return {
      episodes: cached.episodes,
      verifiedFromCatalog: cached.verifiedFromCatalog,
      requested: totalSeasonEpisodes,
    };
  }

  try {
    const res = await fetch(
      `/api/check-season?tmdbId=${encodeURIComponent(idStr)}&season=${season}&count=${totalSeasonEpisodes}`
    );

    if (!res.ok) {
      // Fallback gracioso em caso de instabilidade: não filtra nada
      return { episodes: fullRange(totalSeasonEpisodes), verifiedFromCatalog: false, requested: totalSeasonEpisodes };
    }

    const data: AvailableEpisodesResponse = await res.json();
    if (data && data.success && Array.isArray(data.availableEpisodes) && data.availableEpisodes.length > 0) {
      const info: EpisodeAvailabilityInfo = {
        episodes: data.availableEpisodes,
        verifiedFromCatalog: Boolean(data.verifiedFromCatalog),
        requested: totalSeasonEpisodes,
      };
      clientAvailabilityCache.set(cacheKey, {
        timestamp: Date.now(),
        episodes: info.episodes,
        verifiedFromCatalog: info.verifiedFromCatalog,
      });
      return info;
    }
  } catch (err) {
    console.warn("[episodeAvailability] Falha ao consultar disponibilidade nos servidores:", err);
  }

  // Fallback padrão se não conseguir verificar: não filtra nada
  return { episodes: fullRange(totalSeasonEpisodes), verifiedFromCatalog: false, requested: totalSeasonEpisodes };
}
