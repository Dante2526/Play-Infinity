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

// Catálogo completo inicial para busca de itens por ID
export const getAllCatalogItems = (): CatalogItem[] => {
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

  return Array.from(map.values());
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

// Cronograma rico de lançamentos de episódios para todas as séries do catálogo
export const SERIES_EPISODE_SCHEDULE: Record<number, Omit<SeriesScheduleEpisode, 'status'>[]> = {
  // Stranger Things (66732)
  66732: [
    {
      id: "st-501",
      seriesId: 66732,
      seriesTitle: "STRANGER THINGS",
      seriesPoster: "https://image.tmdb.org/t/p/w500/twfKp60THrcOIep9sjHODOOfO8d.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
      provider: "NETFLIX",
      seasonNumber: 5,
      episodeNumber: 1,
      episodeTitle: "Capítulo Um: O Rastreamento",
      synopsis: "Com a fenda aberta em Hawkins, o grupo se reúne para enfrentar a investida final do Mundo Invertido.",
      airDate: "2026-09-08",
      airTime: "04:00",
      dayOfWeek: "Terça-feira",
      playerUrl: "https://v1.watchplay.shop/tvshow/66732/5/1",
      tmdbId: 66732,
      imdbId: "tt4574334"
    },
    {
      id: "st-502",
      seriesId: 66732,
      seriesTitle: "STRANGER THINGS",
      seriesPoster: "https://image.tmdb.org/t/p/w500/twfKp60THrcOIep9sjHODOOfO8d.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
      provider: "NETFLIX",
      seasonNumber: 5,
      episodeNumber: 2,
      episodeTitle: "Capítulo Dois: O Desaparecimento de Wheeler",
      synopsis: "Sinais misteriosos no rádio de Dustin revelam um novo plano coordenado por Vecna nas profundezas.",
      airDate: "2026-09-15",
      airTime: "04:00",
      dayOfWeek: "Terça-feira",
      playerUrl: "https://v1.watchplay.shop/tvshow/66732/5/2",
      tmdbId: 66732,
      imdbId: "tt4574334"
    },
    {
      id: "st-503",
      seriesId: 66732,
      seriesTitle: "STRANGER THINGS",
      seriesPoster: "https://image.tmdb.org/t/p/w500/twfKp60THrcOIep9sjHODOOfO8d.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
      provider: "NETFLIX",
      seasonNumber: 5,
      episodeNumber: 3,
      episodeTitle: "Capítulo Três: A Armadilha de Turnbow",
      synopsis: "Eleven e Hopper lideram uma incursão arriscada na zona de quarentena militar.",
      airDate: "2026-09-22",
      airTime: "04:00",
      dayOfWeek: "Terça-feira",
      playerUrl: "https://v1.watchplay.shop/tvshow/66732/5/3",
      tmdbId: 66732,
      imdbId: "tt4574334"
    }
  ],

  // A Casa do Dragão (94997)
  94997: [
    {
      id: "hotd-207",
      seriesId: 94997,
      seriesTitle: "A CASA DO DRAGÃO",
      seriesPoster: "https://image.tmdb.org/t/p/w500/oKJDm4QCKbp6mR4FnxXrFlPJP8Y.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/577eXC8wFQT0eUrJcgznSiFPRmk.jpg",
      provider: "Max",
      seasonNumber: 2,
      episodeNumber: 7,
      episodeTitle: "A Semeadura Vermelha",
      synopsis: "Rhaenyra busca cavaleiros de dragão bastardos para reivindicar os dragões selvagens de Pedra do Dragão.",
      airDate: "2026-09-06",
      airTime: "22:00",
      dayOfWeek: "Domingo",
      playerUrl: "https://v1.watchplay.shop/tvshow/94997/2/7",
      tmdbId: 94997
    },
    {
      id: "hotd-208",
      seriesId: 94997,
      seriesTitle: "A CASA DO DRAGÃO",
      seriesPoster: "https://image.tmdb.org/t/p/w500/oKJDm4QCKbp6mR4FnxXrFlPJP8Y.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/577eXC8wFQT0eUrJcgznSiFPRmk.jpg",
      provider: "Max",
      seasonNumber: 2,
      episodeNumber: 8,
      episodeTitle: "A Rainha Que Sempre Foi (Final de Temporada)",
      synopsis: "Os exércitos dos Verdes e dos Pretos marcham para o confronto definitivo no Mar Estreito.",
      airDate: "2026-09-13",
      airTime: "22:00",
      dayOfWeek: "Domingo",
      playerUrl: "https://v1.watchplay.shop/tvshow/94997/2/8",
      tmdbId: 94997
    }
  ],

  // The Boys (76479)
  76479: [
    {
      id: "tb-407",
      seriesId: 76479,
      seriesTitle: "THE BOYS",
      seriesPoster: "https://image.tmdb.org/t/p/w500/in1R2dDc421JxsoRWaIIAqVI2KE.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/n6vVs6z8obNbExdD3QHTr4Utu1Z.jpg",
      provider: "Prime Video",
      seasonNumber: 4,
      episodeNumber: 7,
      episodeTitle: "O Lado Sombrio do Poder",
      synopsis: "Homelander consolida sua influência política enquanto Butcher descobre o segredo do vírus contra supers.",
      airDate: "2026-09-10",
      airTime: "00:00",
      dayOfWeek: "Quinta-feira",
      playerUrl: "https://v1.watchplay.shop/tvshow/76479/4/7",
      tmdbId: 76479
    },
    {
      id: "tb-408",
      seriesId: 76479,
      seriesTitle: "THE BOYS",
      seriesPoster: "https://image.tmdb.org/t/p/w500/in1R2dDc421JxsoRWaIIAqVI2KE.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/n6vVs6z8obNbExdD3QHTr4Utu1Z.jpg",
      provider: "Prime Video",
      seasonNumber: 4,
      episodeNumber: 8,
      episodeTitle: "Assassination Run (Final de Temporada)",
      synopsis: "O confronto direto entre a equipe de Butcher e os Sete atinge o ponto sem retorno na Casa Branca.",
      airDate: "2026-09-17",
      airTime: "00:00",
      dayOfWeek: "Quinta-feira",
      playerUrl: "https://v1.watchplay.shop/tvshow/76479/4/8",
      tmdbId: 76479
    }
  ],

  // The Last of Us (100088)
  100088: [
    {
      id: "tlou-201",
      seriesId: 100088,
      seriesTitle: "THE LAST OF US",
      seriesPoster: "https://image.tmdb.org/t/p/w500/el1KQzwdIm17I3A6cYPfsVIWhfX.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/lY2DhbA7Hy44fAKddr06UrXWWaQ.jpg",
      provider: "Max",
      seasonNumber: 2,
      episodeNumber: 1,
      episodeTitle: "Dias em Jackson",
      synopsis: "Cinco anos após a jornada pelo país, Ellie e Joel vivem em Jackson até que o passado cobra seu preço.",
      airDate: "2026-09-09",
      airTime: "22:00",
      dayOfWeek: "Quarta-feira",
      playerUrl: "https://v1.watchplay.shop/tvshow/100088/2/1",
      tmdbId: 100088
    },
    {
      id: "tlou-202",
      seriesId: 100088,
      seriesTitle: "THE LAST OF US",
      seriesPoster: "https://image.tmdb.org/t/p/w500/el1KQzwdIm17I3A6cYPfsVIWhfX.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/lY2DhbA7Hy44fAKddr06UrXWWaQ.jpg",
      provider: "Max",
      seasonNumber: 2,
      episodeNumber: 2,
      episodeTitle: "Seattle: Dia Um",
      synopsis: "Ellie e Dina partem em direção a Seattle em busca de justiça, encontrando facções em guerra civil.",
      airDate: "2026-09-16",
      airTime: "22:00",
      dayOfWeek: "Quarta-feira",
      playerUrl: "https://v1.watchplay.shop/tvshow/100088/2/2",
      tmdbId: 100088
    }
  ],

  // Wandinha (119051)
  119051: [
    {
      id: "wed-201",
      seriesId: 119051,
      seriesTitle: "WANDINHA",
      seriesPoster: "https://image.tmdb.org/t/p/w500/7rxiQrZjrer0RB9qNA8rHYFo53R.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
      provider: "NETFLIX",
      seasonNumber: 2,
      episodeNumber: 1,
      episodeTitle: "Mais Problemas na Família",
      synopsis: "Wandinha retorna para um novo ano na Academia Nunca Mais enquanto um misterioso perseguidor a vigia.",
      airDate: "2026-09-11",
      airTime: "04:00",
      dayOfWeek: "Sexta-feira",
      playerUrl: "https://v1.watchplay.shop/tvshow/119051/2/1",
      tmdbId: 119051
    },
    {
      id: "wed-202",
      seriesId: 119051,
      seriesTitle: "WANDINHA",
      seriesPoster: "https://image.tmdb.org/t/p/w500/7rxiQrZjrer0RB9qNA8rHYFo53R.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
      provider: "NETFLIX",
      seasonNumber: 2,
      episodeNumber: 2,
      episodeTitle: "Segredos da Cripta",
      synopsis: "Com a ajuda de Mãozinha, Wandinha descobre documentos proibidos sobre a linhagem Addams.",
      airDate: "2026-09-18",
      airTime: "04:00",
      dayOfWeek: "Sexta-feira",
      playerUrl: "https://v1.watchplay.shop/tvshow/119051/2/2",
      tmdbId: 119051
    }
  ],

  // Silo (125988)
  125988: [
    {
      id: "silo-201",
      seriesId: 125988,
      seriesTitle: "SILO",
      seriesPoster: "https://image.tmdb.org/t/p/w500/tVR4q9FazxJuCEpaYxiCijUlvM3.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/4XccmjsOmQZw8S2iW1wvlvmb5v1.jpg",
      provider: "Apple TV+",
      seasonNumber: 2,
      episodeNumber: 1,
      episodeTitle: "O Outro Lado da Colina",
      synopsis: "Juliette sobrevive à caminhada no exterior tóxico e encontra a entrada de um silo vizinho abandonado.",
      airDate: "2026-09-12",
      airTime: "01:00",
      dayOfWeek: "Sábado",
      playerUrl: "https://v1.watchplay.shop/tvshow/125988/2/1",
      tmdbId: 125988
    },
    {
      id: "silo-202",
      seriesId: 125988,
      seriesTitle: "SILO",
      seriesPoster: "https://image.tmdb.org/t/p/w500/tVR4q9FazxJuCEpaYxiCijUlvM3.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/4XccmjsOmQZw8S2iW1wvlvmb5v1.jpg",
      provider: "Apple TV+",
      seasonNumber: 2,
      episodeNumber: 2,
      episodeTitle: "Sussurros no Silo 18",
      synopsis: "A rebelião começa a se espalhar pelos andares inferiores enquanto Bernard tenta manter a ordem.",
      airDate: "2026-09-19",
      airTime: "01:00",
      dayOfWeek: "Sábado",
      playerUrl: "https://v1.watchplay.shop/tvshow/125988/2/2",
      tmdbId: 125988
    }
  ],

  // Ruptura (93740)
  93740: [
    {
      id: "sev-201",
      seriesId: 93740,
      seriesTitle: "RUPTURA (SEVERANCE)",
      seriesPoster: "https://image.tmdb.org/t/p/w500/6qRIQqWwnxVemvvDfFuK3kkIqpS.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/7NNNXo0qG2SqH4JoG7GPvJ2hzes.jpg",
      provider: "Apple TV+",
      seasonNumber: 2,
      episodeNumber: 1,
      episodeTitle: "Reintegração",
      synopsis: "As repercussões do Despertar de Horas Extras forçam a Lumon a implementar protocolos extremos na equipe de MDR.",
      airDate: "2026-09-14",
      airTime: "01:00",
      dayOfWeek: "Segunda-feira",
      playerUrl: "https://v1.watchplay.shop/tvshow/93740/2/1",
      tmdbId: 93740
    }
  ],

  // Round 6 (93405)
  93405: [
    {
      id: "sg-201",
      seriesId: 93405,
      seriesTitle: "ROUND 6 (SQUID GAME)",
      seriesPoster: "https://image.tmdb.org/t/p/w500/6gcHdboppvplmBWxvROc96NJnmm.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/2meX1nMdScFOoV4370rqHWKmXhY.jpg",
      provider: "NETFLIX",
      seasonNumber: 2,
      episodeNumber: 1,
      episodeTitle: "Pão e Circo",
      synopsis: "Gi-hun desiste de embarcar para os EUA e decide infiltrar-se novamente na organização do jogo mortal.",
      airDate: "2026-09-20",
      airTime: "04:00",
      dayOfWeek: "Domingo",
      playerUrl: "https://v1.watchplay.shop/tvshow/93405/2/1",
      tmdbId: 93405
    }
  ],

  // Os Anéis de Poder (84773)
  84773: [
    {
      id: "rop-204",
      seriesId: 84773,
      seriesTitle: "O SENHOR DOS ANÉIS: OS ANÉIS DE PODER",
      seriesPoster: "https://image.tmdb.org/t/p/w500/b5pl6GmQmTCHmZKEBhXPN0gmoAq.jpg",
      seriesBackdrop: "https://image.tmdb.org/t/p/original/o2wg8QiSCQrhj91tBfxunE3O5Ba.jpg",
      provider: "Prime Video",
      seasonNumber: 2,
      episodeNumber: 4,
      episodeTitle: "Caminhos Antigos",
      synopsis: "Elrond lidera as tropas de Lindon enquanto Annatar manipula Celebrimbor em Eregion.",
      airDate: "2026-09-10",
      airTime: "04:00",
      dayOfWeek: "Quinta-feira",
      playerUrl: "https://v1.watchplay.shop/tvshow/84773/2/4",
      tmdbId: 84773
    }
  ]
};

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
