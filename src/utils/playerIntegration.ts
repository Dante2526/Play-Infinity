// Shared by the modal and browser regressions: integrated wrappers use our controls.
export function isExternalIframePlayer(activeIframeUrl: string, urlInput = ""): boolean {
    const activeLower = (activeIframeUrl || "").toLowerCase();
    const inputLower = (urlInput || "").toLowerCase();
    if (
      activeLower.includes("upns.xyz") || activeLower.includes("embedplayapiupn") || activeLower.includes("upns") ||
      inputLower.includes("upns.xyz") || inputLower.includes("embedplayapiupn") || inputLower.includes("upns")
    ) {
      return true;
    }
    const isIntegrated =
      activeLower.includes("watchplay") ||
      activeLower.includes("myembed") ||
      activeLower.includes("playerflix") ||
      activeLower.includes("mixdrop") ||
      activeLower.includes("mxdrop") ||
      activeLower.includes("/api/native-player") ||
      activeLower.includes("/api/md-stream") ||
      activeLower.includes("/api/watchplayer-stream") ||
      activeLower.includes("/api/myembed-stream") ||
      activeLower.includes("/api/anime-stream") ||
      activeLower.includes("/api/vixsrc-stream") ||
      activeLower.includes("/api/live-stream-proxy") ||
      activeLower.includes("/api/vidsrc-stream") ||
      activeLower.includes("/api/vidsrc-proxy") ||
      activeLower.includes("/api/vidsrc-player") ||
      activeLower.includes("/api/byse-proxy-iframe") ||
      activeLower.includes("/api/saimo-proxy-iframe") ||
      activeLower.includes("/api/saimo-stream") ||
      activeLower.includes("/api/anidigital-proxy-iframe") ||
      activeLower.includes("/api/anidigital-stream") ||
      activeLower.includes("/api/streamtape-proxy-iframe") ||
      activeLower.includes("/api/streamtape-stream");

    return !isIntegrated;
}

export function preferredPlaybackServer(keys: string[], explicit?: string | null, saved?: string | null): string {
  return [explicit,saved,'srv_byse',...keys].find(key=>!!key&&keys.includes(key)) || 'srv_byse';
}

export interface EpisodeItem {
  episode_number: number;
  name?: string;
  overview?: string;
  still_path?: string;
  air_date?: string;
}

export interface NextEpisodeResult {
  episode_number: number;
  name: string;
  overview?: string;
  seasonNumber: number;
  isNextSeason: boolean;
  still_path?: string;
}

export interface ComputeNextEpisodeOptions {
  isSeries: boolean;
  episode?: number | null;
  season?: number | null;
  episodesList?: EpisodeItem[] | null;
  availableSeasons?: number[] | null;
  totalEpisodes?: number | null;
}

/**
 * Calcula determinísticamente o próximo episódio de uma série.
 * Retorna null se for o último episódio da temporada e não houver temporada seguinte disponível,
 * ou se não for uma série.
 */
export function computeNextEpisode(options: ComputeNextEpisodeOptions): NextEpisodeResult | null {
  const { isSeries, episode, season, episodesList, availableSeasons, totalEpisodes } = options;
  if (!isSeries || !episode) return null;

  const currentEpNum = Number(episode);
  const curSeasonNum = Number(season || 1);

  // 1. Procura próximo episódio dentro da mesma temporada
  if (episodesList && episodesList.length > 0) {
    const nextInSameSeason = episodesList.find((e) => Number(e.episode_number) === currentEpNum + 1);
    if (nextInSameSeason) {
      if (nextInSameSeason.air_date && isEpisodeUpcoming(nextInSameSeason.air_date)) {
        return null;
      }
      return {
        ...nextInSameSeason,
        seasonNumber: curSeasonNum,
        isNextSeason: false,
        name: nextInSameSeason.name || ('Episódio ' + (currentEpNum + 1)),
      };
    }
  } else {
    // Quando não temos episodesList detalhado, usamos totalEpisodes seguro
    const effectiveTotal = typeof totalEpisodes === 'number' && totalEpisodes > 0 ? totalEpisodes : 0;
    if (effectiveTotal > 0 && currentEpNum < effectiveTotal) {
      const nextEpNum = currentEpNum + 1;
      return {
        episode_number: nextEpNum,
        name: 'Episódio ' + nextEpNum,
        overview: '',
        seasonNumber: curSeasonNum,
        isNextSeason: false,
        still_path: undefined,
      };
    }
  }

  // 2. Transição para próxima temporada (SOMENTE se a próxima temporada existir em availableSeasons)
  const nextSeasonNum = curSeasonNum + 1;
  const availList = (availableSeasons || []).map(Number);
  if (availList.length > 0 && availList.includes(nextSeasonNum)) {
    return {
      episode_number: 1,
      name: 'Temporada ' + nextSeasonNum + ' • Episódio 1',
      overview: '',
      seasonNumber: nextSeasonNum,
      isNextSeason: true,
      still_path: undefined,
    };
  }

  return null;
}

/**
 * Retorna a data de hoje no formato YYYY-MM-DD considerando o fuso horário local.
 */
export function getLocalTodayDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Determina se uma data de exibição (airDate: "YYYY-MM-DD") é futura em relação a hoje.
 */
export function isEpisodeUpcoming(airDate?: string | null, referenceDate = new Date()): boolean {
  if (!airDate || typeof airDate !== 'string') return false;
  const cleanDate = airDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return false;
  const todayStr = getLocalTodayDateString(referenceDate);
  return cleanDate > todayStr;
}

/**
 * Formata uma data "YYYY-MM-DD" para exibição curta brasileira (ex: "10/11").
 */
export function formatEpisodeAirDate(airDate?: string | null): string | null {
  if (!airDate || typeof airDate !== 'string') return null;
  const match = airDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, , month, day] = match;
  return `${day}/${month}`;
}
