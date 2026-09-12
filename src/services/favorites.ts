import { CatalogItem, providerCatalogs, featured } from "../data";

export interface SeriesScheduleEpisode {
  id: string;
  seriesId: number;
  seriesTitle: string;
  seriesPoster: string;
  seriesBackdrop?: string;
  provider: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  synopsis: string;
  airDate: string; // YYYY-MM-DD
  airTime: string; // HH:mm
  dayOfWeek: string; // 'Segunda-feira', 'Terça-feira', etc.
  playerUrl?: string;
  tmdbId?: number;
  imdbId?: string;
  status: 'released' | 'today' | 'upcoming' | 'season_ended' | 'series_ended';
  seriesStatus?: 'Ended' | 'Returning Series' | 'In Production' | 'Canceled' | string;
  nextAirDate?: string;
  lastAirDate?: string;
}

const FAVORITES_STORAGE_KEY = "playinfinity_user_favorites";

// Cache singleton para evitar reconstrução desnecessária do Map a cada verificação
let cachedCatalogItems: CatalogItem[] | null = null;

// Catálogo completo inicial para busca de itens por ID (Memoizado O(1))
export const getAllCatalogItems = (): CatalogItem[] => {
  if (cachedCatalogItems) {
    return cachedCatalogItems;
  }

  const map = new Map<number, CatalogItem>();
  
  if (featured) {
    map.set(featured.id, {
      id: featured.id,
      tmdbId: featured.tmdbId,
      imdbId: featured.imdbId,
      title: featured.title,
      imageUrl: featured.imageUrl,
      posterUrl: featured.posterUrl,
      type: 'movie',
      genres: featured.genres,
      synopsis: featured.description,
      year: parseInt(String(featured.year)) || 2026,
      rating: `${featured.rating} ★`,
      duration: featured.duration,
      quality: featured.quality,
      playerUrl: featured.playerUrl
    });
  }

  Object.entries(providerCatalogs).forEach(([_, items]) => {
    items.forEach(item => {
      map.set(item.id, item);
    });
  });

  cachedCatalogItems = Array.from(map.values());
  return cachedCatalogItems;
};

// Obter IDs padrão iniciais se for primeira visita
const DEFAULT_FAVORITE_IDS = [66732, 94997, 76479]; // Stranger Things, A Casa do Dragão, The Boys

export const getFavoriteIds = (): number[] => {
  try {
    const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Erro ao carregar favoritos do localStorage:", e);
  }
  return DEFAULT_FAVORITE_IDS;
};

export const saveFavoriteIds = (ids: number[]) => {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
    // Dispara evento para sincronizar em outros componentes
    window.dispatchEvent(new CustomEvent("playinfinity:favorites_updated", { detail: ids }));
  } catch (e) {
    console.error("Erro ao salvar favoritos no localStorage:", e);
  }
};

export const toggleFavorite = (itemId: number): boolean => {
  const current = getFavoriteIds();
  const exists = current.includes(itemId);
  let updated: number[];
  
  if (exists) {
    updated = current.filter(id => id !== itemId);
  } else {
    updated = [...current, itemId];
  }
  
  saveFavoriteIds(updated);
  return !exists;
};

export const isItemFavorite = (itemId: number): boolean => {
  return getFavoriteIds().includes(itemId);
};

// Cronograma de episódios estáticos (apenas séries com episódios futuros confirmados oficialmente)
export const SERIES_EPISODE_SCHEDULE: Record<number, Omit<SeriesScheduleEpisode, 'status'>[]> = {};

export const getDayOfWeekFromDate = (dateStr: string): string => {
  const days = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado'
  ];
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return days[d.getDay()] || 'Em Breve';
    }
    const d = new Date(dateStr + "T12:00:00");
    return days[d.getDay()] || 'Em Breve';
  } catch {
    return 'Em Breve';
  }
};

// Busca do cronograma dinâmico e status oficial via TMDB para as séries seguidas
export const fetchDynamicScheduleForFavorites = async (favoriteIds: number[]): Promise<SeriesScheduleEpisode[]> => {
  const allCatalog = getAllCatalogItems();
  const idsToFetch = Array.from(new Set(favoriteIds));
  const todayStr = new Date().toISOString().split('T')[0];

  const results: SeriesScheduleEpisode[] = [];

  await Promise.all(
    idsToFetch.map(async (id) => {
      try {
        const localItem = allCatalog.find(i => i.id === id);
        if (localItem && localItem.type === 'movie') return;

        const tmdbId = localItem?.tmdbId || id;
        const res = await fetch(
          `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=e0cc43e590a5c5c0d03f920bd4fe9424&language=pt-BR`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!data || data.status_code) return;

        const seriesTitle = (data.name || localItem?.title || "Série").toUpperCase();
        const seriesPoster = data.poster_path 
          ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
          : localItem?.imageUrl || "";
        const seriesBackdrop = data.backdrop_path
          ? `https://image.tmdb.org/t/p/original${data.backdrop_path}`
          : localItem?.backdropUrl || seriesPoster;
        const provider = localItem?.provider || (data.networks?.[0]?.name || "Streaming");

        const nextEp = data.next_episode_to_air;
        const lastEp = data.last_episode_to_air;

        // Caso 1: A série tem próximo episódio oficialmente agendado no TMDB
        if (nextEp && nextEp.air_date) {
          const airDate = nextEp.air_date;
          let status: 'today' | 'upcoming' | 'released' = 'upcoming';
          if (airDate === todayStr) {
            status = 'today';
          } else if (airDate < todayStr) {
            status = 'released';
          }

          results.push({
            id: `tmdb-next-${id}-${nextEp.season_number}-${nextEp.episode_number}`,
            seriesId: id,
            seriesTitle,
            seriesPoster,
            seriesBackdrop,
            provider,
            seasonNumber: nextEp.season_number,
            episodeNumber: nextEp.episode_number,
            episodeTitle: nextEp.name || `Episódio ${nextEp.episode_number}`,
            synopsis: nextEp.overview || "Episódio inédito com lançamento agendado oficialmente.",
            airDate,
            airTime: "22:00",
            dayOfWeek: getDayOfWeekFromDate(airDate),
            playerUrl: `https://v1.watchplay.shop/tvshow/${tmdbId}/${nextEp.season_number}/${nextEp.episode_number}`,
            tmdbId,
            imdbId: localItem?.imdbId,
            status,
            seriesStatus: data.status,
            nextAirDate: airDate
          });
        } 
        // Caso 2: Não há próximo episódio agendado (temporada finalizada ou série encerrada)
        else if (lastEp) {
          const isEnded = data.status === 'Ended';
          const status = isEnded ? 'series_ended' : 'season_ended';
          const airDate = lastEp.air_date || todayStr;

          results.push({
            id: `tmdb-last-${id}-${lastEp.season_number}-${lastEp.episode_number}`,
            seriesId: id,
            seriesTitle,
            seriesPoster,
            seriesBackdrop,
            provider,
            seasonNumber: lastEp.season_number,
            episodeNumber: lastEp.episode_number,
            episodeTitle: isEnded 
              ? `T${lastEp.season_number}:E${lastEp.episode_number} - ${lastEp.name || 'Episódio Final'}`
              : `T${lastEp.season_number}:E${lastEp.episode_number} - ${lastEp.name || 'Fim de Temporada'}`,
            synopsis: isEnded
              ? "Todas as temporadas já foram exibidas. Esta série foi oficialmente concluída."
              : `A Temporada ${lastEp.season_number} foi concluída. A próxima temporada está em produção e aguarda confirmação de data de estreia.`,
            airDate,
            airTime: "22:00",
            dayOfWeek: getDayOfWeekFromDate(airDate),
            playerUrl: `https://v1.watchplay.shop/tvshow/${tmdbId}/${lastEp.season_number}/${lastEp.episode_number}`,
            tmdbId,
            imdbId: localItem?.imdbId,
            status,
            seriesStatus: data.status,
            lastAirDate: airDate
          });
        }
      } catch (err) {
        console.warn(`[CalendarService] Erro ao sincronizar série ${id}:`, err);
      }
    })
  );

  const statusPriority: Record<string, number> = {
    today: 1,
    upcoming: 2,
    season_ended: 3,
    released: 4,
    series_ended: 5
  };

  return results.sort((a, b) => {
    const pA = statusPriority[a.status] || 99;
    const pB = statusPriority[b.status] || 99;
    if (pA !== pB) return pA - pB;
    return a.airDate.localeCompare(b.airDate);
  });
};

// Obter episódios com fallback síncrono inicial
export const getScheduleForFavorites = (favoriteIds: number[]): SeriesScheduleEpisode[] => {
  const todayStr = new Date().toISOString().split('T')[0];
  const episodes: SeriesScheduleEpisode[] = [];

  favoriteIds.forEach(id => {
    const seriesEpisodes = SERIES_EPISODE_SCHEDULE[id];
    if (seriesEpisodes && seriesEpisodes.length > 0) {
      seriesEpisodes.forEach(ep => {
        let status: 'released' | 'today' | 'upcoming' = 'upcoming';
        if (ep.airDate === todayStr) {
          status = 'today';
        } else if (ep.airDate < todayStr) {
          status = 'released';
        }

        episodes.push({
          ...ep,
          status
        });
      });
    }
  });

  episodes.sort((a, b) => a.airDate.localeCompare(b.airDate) || a.airTime.localeCompare(b.airTime));
  return episodes;
};
