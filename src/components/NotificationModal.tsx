import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Bell, 
  X, 
  Play, 
  Check, 
  Sparkles, 
  ExternalLink,
  Calendar
} from 'lucide-react';
import { 
  EpisodeNotification, 
  getFavoriteEpisodeNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead 
} from '../services/notifications';
import { getFavoriteIds } from '../services/favorites';
import { toggleEpisodeWatched, isEpisodeWatched } from '../services/watchedEpisodes';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayEpisode: (
    title: string, 
    url?: string, 
    mediaType?: 'movie' | 'series',
    tmdbId?: number,
    imdbId?: string,
    season?: number,
    episode?: number,
    quality?: string,
    isCam?: boolean,
    initialTime?: number,
    autoFullscreen?: boolean,
    imageUrl?: string,
    backdropUrl?: string,
    posterUrl?: string,
    isAnime?: boolean
  ) => void;
  onNavigateToSeries: (seriesId: number) => void;
  onNavigateToCalendar: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  onPlayEpisode,
  onNavigateToSeries,
  onNavigateToCalendar
}) => {
  const [notifications, setNotifications] = useState<EpisodeNotification[]>([]);

  const loadNotifications = () => {
    const favIds = getFavoriteIds();
    const list = getFavoriteEpisodeNotifications(favIds);
    setNotifications(list);
  };

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
      // Automatically mark all as read when modal opens
      setTimeout(() => {
        const favIds = getFavoriteIds();
        const list = getFavoriteEpisodeNotifications(favIds);
        if (list.some(n => n.isNew)) {
          markAllNotificationsAsRead(list.map(n => n.id));
          loadNotifications(); // Reload after marking as read to remove 'isNew' status locally if needed
        }
      }, 500); // Slight delay so the user still perceives them before they are formally cleared from badge
    }
  }, [isOpen]);

  useEffect(() => {
    const handleUpdate = () => {
      loadNotifications();
    };
    window.addEventListener('playinfinity:notifications_updated', handleUpdate);
    window.addEventListener('playinfinity:favorites_updated', handleUpdate);
    window.addEventListener('playinfinity:watched_updated', handleUpdate);
    return () => {
      window.removeEventListener('playinfinity:notifications_updated', handleUpdate);
      window.removeEventListener('playinfinity:favorites_updated', handleUpdate);
      window.removeEventListener('playinfinity:watched_updated', handleUpdate);
    };
  }, []);

  // We don't filter anymore, always show all
  const displayedNotifications = notifications;

  const handleItemClick = (notif: EpisodeNotification) => {
    markNotificationAsRead(notif.id);
    onClose();
    onPlayEpisode(
      `${notif.seriesTitle} - T${notif.seasonNumber}:E${notif.episodeNumber} "${notif.episodeTitle}"`,
      notif.playerUrl,
      'series',
      notif.seriesId,
      undefined,
      notif.seasonNumber,
      notif.episodeNumber,
      '1080p',
      false,
      0,
      true,
      notif.seriesPoster,
      notif.seriesBackdrop,
      notif.seriesPoster
    );
  };

  const handleToggleWatched = (e: React.MouseEvent, notif: EpisodeNotification) => {
    e.stopPropagation();
    toggleEpisodeWatched(notif.seriesId, notif.seasonNumber, notif.episodeNumber);
    markNotificationAsRead(notif.id);
    loadNotifications();
  };

  return (
    <motion.div 
      key="notification-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: "easeInOut" }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4"
      onClick={onClose}
    >
      <motion.div 
        key="notification-card"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ 
              type: "spring", 
              damping: 26, 
              stiffness: 340,
              mass: 0.8
            }}
            className="bg-[#121212] border border-neutral-800 rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800/80 bg-[#161616]">
          <div className="flex items-center gap-3">
            <div className="relative p-2 rounded-xl bg-orange-600/10 border border-orange-500/20 text-orange-500">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base flex items-center gap-2">
                Novos Episódios
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onNavigateToCalendar();
              }}
              className="text-neutral-400 hover:text-orange-400 flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer px-3 py-1.5 rounded-lg bg-neutral-800/50 hover:bg-neutral-800"
            >
              <Calendar className="w-4 h-4" />
              <span>Calendário</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* LISTA DE NOTIFICAÇÕES */}
        <div className="flex-1 overflow-y-auto divide-y divide-neutral-850 p-2 sm:p-3 space-y-1 scrollbar-thin scrollbar-thumb-neutral-800">
          {displayedNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500 mb-3">
                <Bell className="w-6 h-6" />
              </div>
              <h4 className="text-neutral-300 font-semibold text-sm mb-1">
                Nenhuma notificação recente
              </h4>
              <p className="text-neutral-500 text-xs max-w-xs leading-relaxed">
                Adicione séries aos seus <span className="text-orange-400 font-medium">Favoritos</span>. Quando um novo episódio for lançado, você receberá um aviso instantâneo aqui!
              </p>
            </div>
          ) : (
            displayedNotifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleItemClick(notif)}
                className="group relative flex items-center gap-3.5 p-3 rounded-2xl transition-all cursor-pointer bg-neutral-900/40 hover:bg-neutral-850 border border-transparent"
              >
                {/* POSTER / MINIATURA */}
                <div className="relative w-14 h-20 sm:w-16 sm:h-24 rounded-xl overflow-hidden bg-neutral-950 shrink-0 border border-white/10 shadow-md">
                  <img 
                    src={notif.seriesPoster} 
                    alt={notif.seriesTitle}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                    <div className="w-7 h-7 rounded-full bg-orange-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                      <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* DETALHES DO EPISÓDIO */}
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-orange-400 text-[11px] font-bold tracking-wide uppercase truncate max-w-[180px]">
                      {notif.seriesTitle}
                    </span>
                    <span className="text-neutral-500 text-[10px]">•</span>
                    <span className="text-neutral-400 text-[10px] font-medium">
                      {notif.releasedAgoText}
                    </span>
                    {notif.isToday && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-red-600 text-white tracking-wider animate-pulse">
                        HOJE
                      </span>
                    )}
                  </div>

                  <h3 className="text-white font-bold text-sm tracking-tight truncate group-hover:text-orange-400 transition-colors">
                    T{notif.seasonNumber}:E{notif.episodeNumber} - {notif.episodeTitle}
                  </h3>

                  <p className="text-neutral-400 text-xs line-clamp-1 mt-0.5">
                    Novo episódio disponível com dublagem PT-BR
                  </p>

                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={(e) => handleToggleWatched(e, notif)}
                      className={`text-[11px] font-medium flex items-center gap-1.5 px-2 py-0.8 rounded-md transition-colors cursor-pointer ${
                        notif.isWatched 
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' 
                          : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                      }`}
                    >
                      <Check className={`w-3 h-3 ${notif.isWatched ? 'text-emerald-400' : 'text-neutral-400'}`} />
                      <span>{notif.isWatched ? 'Assistido' : 'Marcar visto'}</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                        onNavigateToSeries(notif.seriesId);
                      }}
                      className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Ver série</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* RODAPÉ DO MODAL */}
        <div className="px-5 py-3 bg-[#161616] border-t border-neutral-800/80 flex items-center justify-center text-xs text-neutral-400">
          <div className="flex items-center gap-1.5 max-w-full overflow-hidden">
            <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className="truncate whitespace-nowrap">Sincronização automática com lançamentos diários</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
export default NotificationModal;
