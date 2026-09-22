import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence } from "motion/react";
import {
  Play,
  Bookmark,
  BookmarkCheck,
  Home,
  Film,
  Tv,
  CalendarDays,
  Calendar,
  List as ListIcon,
  Search,
  Star,
  StarHalf,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  MessageSquare,
  Send,
  Check,
  Info,
  Radio,
  Loader2,
  Sparkles,
  Clock,
  Layers,
  X,
  CheckCircle2,
  ShieldCheck,
  FileText,
  Bell,
  Mic,
  MicOff
} from "lucide-react";
import { useVoiceSearch } from "../hooks/useVoiceSearch";

import { CatalogItem, checkIsCam, WATCHPLAY_DORAMA_IDS } from "../utils/mediaUtils";;
import { 
  searchMulti, 
  getDetails, 
  getSeasonDetails, 
  formatImageUrl, 
  getGenreNames, 
  getProviderSeries,
  getProviderMovies,
  discoverMovies,
  discoverSeries,
  getGenreIdByName,
  getMovieReleases,
  getSeriesReleases,
  getAnimes,
  getDoramas,
  FALLBACK_POSTER_IMAGE,
  FALLBACK_BACKDROP_IMAGE,
  TMDBItem, 
  TMDBDetails, 
  Season,
  getTrending,
  getTrailer,
  TrailerVideo
} from "../services/tmdb";
import { VideoPlayerModal } from "../components/VideoPlayerModal";

function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<any>
) {
  return React.lazy(async () => {
    try {
      const module = await componentImport();
      return { default: module.default || Object.values(module)[0] };
    } catch (error) {
      console.warn("[LazyRetry] Dynamic import failed, reloading page...", error);
      const hasReloaded = sessionStorage.getItem("lazy-reload");
      if (!hasReloaded) {
        sessionStorage.setItem("lazy-reload", "true");
        window.location.reload();
      }
      throw error;
    }
  });
}

const WebhookPanelModal = lazyWithRetry(() => import("../components/WebhookPanelModal"));
const ReleaseCalendarPage = lazyWithRetry(() => import("../components/ReleaseCalendarPage"));
const LiveTvPage = lazyWithRetry(() => import("../components/LiveTvPage"));
const NotificationModal = lazyWithRetry(() => import("../components/NotificationModal"));
import { VirtualRemote } from "../components/VirtualRemote";
import {
  getFavoriteIds,
  toggleFavorite,
  isItemFavorite,
  getStaticFavoriteItems,
  resolveFavoriteItems,
  SERIES_EPISODE_SCHEDULE,
  getScheduleForFavorites
} from "../services/favorites";
import {
  getFavoriteEpisodeNotifications,
  getReadNotificationIds
} from "../services/notifications";
import {
  isEpisodeWatched,
  toggleEpisodeWatched,
  markSeasonWatched,
  isSeasonFullyWatched,
  getSeasonWatchedCount
} from "../services/watchedEpisodes";
import { getPlaybackHistory, PlaybackHistoryItem, removePlaybackItem } from "../services/playbackHistory";
import { getCommentsForItem, addComment, toggleCommentLike, CommentItem } from "../services/comments";

const FALLBACK_POSTER = "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=500&q=80";
const FALLBACK_BACKDROP = "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80";

const handlePosterError = (e: React.SyntheticEvent<HTMLImageElement, Event>, backdropUrl?: string) => {
  const target = e.currentTarget;
  if (backdropUrl && target.src !== backdropUrl) {
    target.src = backdropUrl;
  } else {
    target.onerror = null;
    target.src = FALLBACK_POSTER;
  }
};



import { OnPlayHandler } from "../types";

export function FavoritesPage({ 
  onBack, 
  onItemClick,
  onPlay,
  onNavigateToCalendar
}: { 
  onBack: () => void, 
  onItemClick: (id: number, item?: CatalogItem) => void,
  onPlay?: OnPlayHandler,
  onNavigateToCalendar?: () => void
}) {
  const [favoriteIds, setFavoriteIds] = useState<number[]>(getFavoriteIds());
  const [favoriteItems, setFavoriteItems] = useState<CatalogItem[]>(() => getStaticFavoriteItems(getFavoriteIds()));
  const [typeFilter, setTypeFilter] = useState<'all' | 'series' | 'movies'>('all');

  // Resolve favoritos completos (catálogo estático + TMDB para itens fora do catálogo local)
  useEffect(() => {
    let mounted = true;
    resolveFavoriteItems(favoriteIds).then(items => {
      if (mounted) setFavoriteItems(items);
    });
    return () => { mounted = false; };
  }, [favoriteIds]);

  useEffect(() => {
    const handleFavUpdate = (e: any) => {
      const ids = e.detail || getFavoriteIds();
      setFavoriteIds(ids);
      setFavoriteItems(getStaticFavoriteItems(ids));
    };
    window.addEventListener("playinfinity:favorites_updated", handleFavUpdate);
    return () => {
      window.removeEventListener("playinfinity:favorites_updated", handleFavUpdate);
    };
  }, []);

  const filteredItems = favoriteItems.filter(item => {
    if (typeFilter === 'series') return item.type === 'series';
    if (typeFilter === 'movies') return item.type === 'movie';
    return true;
  });

  const handleRemoveFavorite = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    toggleFavorite(id);
    setFavoriteIds(getFavoriteIds());
  };

  const seriesCount = favoriteItems.filter(i => i.type === 'series').length;
  const movieCount = favoriteItems.filter(i => i.type === 'movie').length;

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen pt-28 md:pt-32 px-4 md:px-12 bg-[#0a0a0a] pb-24 text-white">
      <div className="max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-neutral-400 hover:text-white px-4 py-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors w-fit cursor-pointer border border-white/5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para Perfil</span>
          </button>

          {onNavigateToCalendar && (
            <button 
              onClick={onNavigateToCalendar}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-[0_0_15px_rgba(234,88,12,0.3)] transition-all cursor-pointer w-fit"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Ver Calendário de Episódios ({seriesCount} séries)</span>
            </button>
          )}
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 text-orange-500 font-bold text-xs uppercase tracking-widest mb-1.5">
              <Bookmark className="w-4 h-4 fill-current" />
              <span>Minha Coleção Pessoal</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase">
              Favoritos
            </h1>
            <p className="text-neutral-400 text-xs sm:text-sm mt-1">
              Gerencie seus filmes e séries favoritos. Séries favoritadas alimentam seu calendário de lançamentos.
            </p>
          </div>

          {/* Filtros de Tipo */}
          <div className="flex items-center gap-2 overflow-x-auto py-2 px-1 -my-1 scrollbar-none">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                typeFilter === 'all'
                  ? 'bg-orange-600 text-white shadow-[0_0_12px_rgba(234,88,12,0.4)]'
                  : 'bg-white/5 hover:bg-white/10 text-neutral-300'
              }`}
            >
              Todos ({favoriteItems.length})
            </button>
            <button
              onClick={() => setTypeFilter('series')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                typeFilter === 'series'
                  ? 'bg-orange-600 text-white shadow-[0_0_12px_rgba(234,88,12,0.4)]'
                  : 'bg-white/5 hover:bg-white/10 text-neutral-300'
              }`}
            >
              Séries ({seriesCount})
            </button>
            <button
              onClick={() => setTypeFilter('movies')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                typeFilter === 'movies'
                  ? 'bg-orange-600 text-white shadow-[0_0_12px_rgba(234,88,12,0.4)]'
                  : 'bg-white/5 hover:bg-white/10 text-neutral-300'
              }`}
            >
              Filmes ({movieCount})
            </button>
          </div>
        </div>

        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
            {filteredItems.map(item => {
              const hasSchedule = item.type === 'series' && !!SERIES_EPISODE_SCHEDULE[item.id];

              return (
                <div 
                  key={item.id} 
                  tabIndex={0} role="button" onClick={() => onItemClick(item.id, item)} 
                  className="relative rounded-2xl overflow-hidden bg-[#121212] border border-neutral-800 hover:border-orange-500/50 hover:shadow-[0_0_25px_rgba(234,88,12,0.25)] transition-all duration-300 group cursor-pointer aspect-[2/3] flex flex-col justify-between"
                >
                  <img 
                    src={item.posterUrl || item.imageUrl} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 absolute inset-0" 
                    loading="lazy" 
                    onError={(e) => handlePosterError(e, item.backdropUrl)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-transparent"></div>
                  
                  {/* Top Badges */}
                  <div className="relative z-10 p-3 flex items-start justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-orange-400 font-bold text-[10px] uppercase border border-white/10">
                        {item.type === 'series' ? 'Série' : 'Filme'}
                      </span>
                      {hasSchedule && (
                        <span className="px-2 py-0.5 rounded bg-orange-600 text-white font-black text-[9px] uppercase tracking-wider shadow">
                          No Calendário
                        </span>
                      )}
                    </div>

                    {/* Botão Remover dos Favoritos */}
                    <button
                      onClick={(e) => handleRemoveFavorite(e, item.id)}
                      className="p-2 rounded-full bg-black/70 hover:bg-red-600/80 text-orange-500 hover:text-white backdrop-blur-md transition-all border border-white/10 shadow-md cursor-pointer"
                      title="Remover dos favoritos"
                    >
                      <BookmarkCheck className="w-4 h-4 fill-current" />
                    </button>
                  </div>

                  {/* Play Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    <div 
                      tabIndex={0} role="button" onClick={(e) => {
                        e.stopPropagation();
                        onPlay?.(
                          item.title, 
                          item.playerUrl, 
                          item.type, 
                          item.tmdbId || item.id, 
                          item.imdbId, 
                          1, 
                          1, 
                          item.quality, 
                          checkIsCam(item.title, item.quality),
                          undefined,
                          false,
                          item.imageUrl,
                          item.backdropUrl,
                          item.posterUrl
                        );
                      }}
                      className="w-12 h-12 bg-orange-600 rounded-full flex items-center justify-center backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all shadow-[0_0_20px_rgba(234,88,12,0.6)] text-white hover:scale-110 pointer-events-auto cursor-pointer"
                      title="Assistir agora"
                    >
                      <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                    </div>
                  </div>

                  {/* Informações na base */}
                  <div className="relative z-10 p-3.5 text-center">
                    <span className="block font-black text-xs sm:text-sm uppercase text-white drop-shadow-lg truncate">
                      {item.title}
                    </span>
                    <span className="block text-[11px] text-neutral-300 mt-0.5">
                      {item.year} • {item.genres?.[0] || item.rating}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-[#121212] border border-white/5 rounded-3xl p-12 text-center my-6 flex flex-col items-center">
            <Bookmark className="w-16 h-16 text-neutral-600 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Nenhum favorito encontrado</h3>
            <p className="text-sm text-neutral-400 max-w-md mb-6 leading-relaxed">
              Você ainda não adicionou títulos {typeFilter !== 'all' ? `na categoria ${typeFilter === 'series' ? 'séries' : 'filmes'}` : ''} aos seus favoritos. Ao favoritar séries, elas aparecerão automaticamente aqui e no seu calendário de novos episódios!
            </p>
            {onNavigateToCalendar && (
              <button
                onClick={onNavigateToCalendar}
                className="px-6 py-2.5 rounded-full bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-[0_0_15px_rgba(234,88,12,0.3)] transition-all cursor-pointer"
              >
                Abrir Calendário de Episódios
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
