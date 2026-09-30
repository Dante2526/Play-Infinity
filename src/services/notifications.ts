import { getFavoriteIds, getScheduleForFavorites, fetchDynamicScheduleForFavorites, SeriesScheduleEpisode } from "./favorites";
import { isEpisodeWatched } from "./watchedEpisodes";

export interface EpisodeNotification {
  id: string;
  seriesId: number;
  seriesTitle: string;
  seriesPoster: string;
  seriesBackdrop?: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  airDate: string; // YYYY-MM-DD
  airTime: string; // HH:mm
  playerUrl?: string;
  isNew: boolean; // Notificação não lida
  isToday: boolean;
  isWatched: boolean;
  releasedAgoText: string;
}

const READ_NOTIFICATIONS_STORAGE_KEY = "playinfinity_read_notifications";
const SCHEDULE_CACHE_KEY = "playinfinity_schedule_cache_v2";

let isSyncingDynamicSchedule = false;
let lastDynamicSyncTime = 0;
const DYNAMIC_SYNC_THROTTLE = 2 * 60 * 1000; // 2 minutos

/**
 * Dispara uma sincronização em background do cronograma real de episódios do TMDB
 * para as séries seguidas pelo usuário, atualizando o cache e emitindo evento
 */
export const syncNotificationsInBackground = (favoriteIds: number[]) => {
  if (!favoriteIds || favoriteIds.length === 0) return;
  const now = Date.now();
  if (isSyncingDynamicSchedule || now - lastDynamicSyncTime < DYNAMIC_SYNC_THROTTLE) return;

  isSyncingDynamicSchedule = true;
  lastDynamicSyncTime = now;

  fetchDynamicScheduleForFavorites(favoriteIds)
    .then(episodes => {
      if (episodes && episodes.length > 0) {
        try {
          localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(episodes));
          window.dispatchEvent(new CustomEvent("playinfinity:notifications_updated"));
        } catch(e){console.warn("Silenced error:", e);}
      }
    })
    .catch(() => {})
    .finally(() => {
      isSyncingDynamicSchedule = false;
    });
};

export const getReadNotificationIds = (): string[] => {
  try {
    const saved = localStorage.getItem(READ_NOTIFICATIONS_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Erro ao obter notificações lidas:", e);
  }
  return [];
};

export const markNotificationAsRead = (notificationId: string) => {
  try {
    const current = getReadNotificationIds();
    if (!current.includes(notificationId)) {
      const updated = [...current, notificationId];
      localStorage.setItem(READ_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent("playinfinity:notifications_updated"));
    }
  } catch (e) {
    console.error("Erro ao marcar notificação como lida:", e);
  }
};

export const markAllNotificationsAsRead = (notificationIds: string[]) => {
  try {
    const current = getReadNotificationIds();
    const merged = Array.from(new Set([...current, ...notificationIds]));
    localStorage.setItem(READ_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent("playinfinity:notifications_updated"));
  } catch (e) {
    console.error("Erro ao marcar todas como lidas:", e);
  }
};

const formatReleasedAgo = (airDate: string): string => {
  const today = new Date();
  const [y, m, d] = airDate.split('-').map(Number);
  const release = new Date(y, m - 1, d);
  
  const diffTime = today.getTime() - release.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays > 1 && diffDays <= 7) return `Há ${diffDays} dias`;
  if (diffDays > 7 && diffDays <= 30) return `Há ${Math.floor(diffDays / 7)} semana(s)`;
  return `Lançado em ${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}`;
};

/**
 * Coleta os novos episódios lançados para as séries favoritas do usuário.
 * Retorna episódios lançados hoje ou recentemente nos últimos 30 dias.
 */
export const getFavoriteEpisodeNotifications = (favoriteIds: number[]): EpisodeNotification[] => {
  if (!favoriteIds || favoriteIds.length === 0) return [];

  // Dispara checagem em background de novos episódios caso o cache precise de atualização
  syncNotificationsInBackground(favoriteIds);

  const readIds = new Set(getReadNotificationIds());
  const allScheduled = getScheduleForFavorites(favoriteIds);
  const todayStr = new Date().toISOString().split('T')[0];

  // Filtra episódios que já saíram (today ou released até 30 dias atrás)
  const notifications: EpisodeNotification[] = [];

  allScheduled.forEach(ep => {
    // Apenas episódios que já lançaram (data <= hoje)
    if (ep.airDate <= todayStr) {
      const isWatched = isEpisodeWatched(ep.seriesId, ep.seasonNumber, ep.episodeNumber);
      const isToday = ep.airDate === todayStr;
      const isRead = readIds.has(ep.id);

      notifications.push({
        id: ep.id,
        seriesId: ep.seriesId,
        seriesTitle: ep.seriesTitle,
        seriesPoster: ep.seriesPoster,
        seriesBackdrop: ep.seriesBackdrop,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        episodeTitle: ep.episodeTitle,
        airDate: ep.airDate,
        airTime: ep.airTime,
        playerUrl: ep.playerUrl,
        isNew: !isRead,
        isToday,
        isWatched,
        releasedAgoText: formatReleasedAgo(ep.airDate)
      });
    }
  });

  // Ordena os mais recentes primeiro
  return notifications.sort((a, b) => b.airDate.localeCompare(a.airDate) || b.episodeNumber - a.episodeNumber);
};
