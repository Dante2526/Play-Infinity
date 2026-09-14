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
import { featured, providers, releases, newest, animes, doramas, mostWatched, continueWatching, providerCatalogs, CatalogItem, checkIsCam, WATCHPLAY_DORAMA_IDS } from "../data";
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
  getAllCatalogItems,
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

export function UserProfilePage({ 
  onNavigate,
  onItemClick,
  onPlay
}: { 
  onNavigate: (type: string) => void,
  onItemClick?: (id: number, item?: CatalogItem) => void,
  onPlay?: OnPlayHandler
}) {
  const [favoriteIds, setFavoriteIds] = useState<number[]>(getFavoriteIds());

  useEffect(() => {
    const handleFavUpdate = (e: any) => {
      setFavoriteIds(e.detail || getFavoriteIds());
    };
    window.addEventListener("playinfinity:favorites_updated", handleFavUpdate);
    return () => {
      window.removeEventListener("playinfinity:favorites_updated", handleFavUpdate);
    };
  }, []);

  const allItems = getAllCatalogItems();
  const favoriteItems = allItems.filter(item => favoriteIds.includes(item.id));
  const followedSeries = favoriteItems.filter(item => item.type === 'series');
  const scheduledEpisodes = getScheduleForFavorites(favoriteIds);
  const thisWeekEpisodes = scheduledEpisodes.filter(e => e.airDate >= '2026-09-08' && e.airDate <= '2026-09-15');

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen pt-28 md:pt-32 px-4 md:px-12 bg-[#0a0a0a] pb-24 text-white">
      <div className="max-w-4xl mx-auto w-full">
        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tighter mb-8 uppercase text-center md:text-left">
          Meu Perfil
        </h1>
        
        {/* Card do Usuário */}
        <div className="bg-[#111111] border border-white/5 rounded-3xl p-6 md:p-8 mb-8 flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8 shadow-xl">
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-tr from-orange-600 to-orange-400 border-[4px] border-[#0a0a0a] flex items-center justify-center font-black text-4xl md:text-5xl shadow-[0_0_30px_rgba(234,88,12,0.6)] shrink-0">
            N
          </div>
          
          <div className="flex flex-col items-center md:items-start flex-1 text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-1">Naylan Moreira</h2>
            <p className="text-neutral-400 mb-5 font-medium text-sm">Assinante Premium • Acesso Ilimitado</p>
            
            {/* Badges de estatísticas */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-md mb-6">
              <button 
                type="button"
                tabIndex={0}
                onClick={() => onNavigate('favorites')}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-3 text-center cursor-pointer transition-all hover:scale-105"
                title="Ver Favoritos"
              >
                <span className="block text-xl font-black text-orange-500">{favoriteItems.length}</span>
                <span className="text-[11px] text-neutral-400 font-medium ml-[3px]">Favoritos</span>
              </button>

              <button 
                type="button"
                tabIndex={0}
                onClick={() => onNavigate('calendar')}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-3 text-center cursor-pointer transition-all hover:scale-105"
                title="Ver Séries Seguidas"
              >
                <span className="block text-xl font-black text-white">{followedSeries.length}</span>
                <span className="text-[11px] text-neutral-400 font-medium ml-[3px]">Séries Seguidas</span>
              </button>

              <button 
                type="button"
                tabIndex={0}
                onClick={() => onNavigate('calendar')}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-3 text-center cursor-pointer transition-all hover:scale-105"
                title="Ver Lançamentos da Semana"
              >
                <span className="block text-xl font-black text-emerald-400">{thisWeekEpisodes.length}</span>
                <span className="text-[11px] text-neutral-400 font-medium ml-[3px]">Lançamentos</span>
              </button>
            </div>
          </div>
        </div>

        {/* PRÉVIA DOS FAVORITOS NO PERFIL */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white pl-3 border-l-4 border-orange-500 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-orange-500" />
              <span className="ml-[3px]">Meus Favoritos</span>
            </h3>
            {favoriteItems.length > 0 && (
              <button 
                type="button"
                tabIndex={0}
                onClick={() => onNavigate('favorites')}
                className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-orange-600 border border-white/10 hover:border-orange-500 text-orange-400 hover:text-white text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:shadow-[0_0_15px_rgba(234,88,12,0.4)]"
                title="Ver lista completa de favoritos"
              >
                <span className="text-center ml-[3px]">Ver todos ({favoriteItems.length})</span>
                <ChevronRight className="w-3.5 h-3.5 ml-0" />
              </button>
            )}
          </div>

          {favoriteItems.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {favoriteItems.slice(0, 4).map(item => (
                <div 
                  key={item.id} 
                  tabIndex={0}
                  role="button"
                  onClick={() => onItemClick?.(item.id, item)} 
                  className="relative rounded-2xl overflow-hidden bg-[#121212] border border-neutral-800 hover:border-orange-500/50 transition-all duration-300 group cursor-pointer aspect-[2/3]"
                >
                  <img 
                    src={item.posterUrl || item.imageUrl} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-105 group-[.tv-focused]:scale-105 transition-transform duration-500"
                    loading="lazy"
                    onError={(e) => handlePosterError(e, item.backdropUrl)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent"></div>

                  <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-bold text-orange-400 uppercase">
                    {item.type === 'series' ? 'Série' : 'Filme'}
                  </div>

                  {/* Play Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-[.tv-focused]:opacity-100 group-focus:opacity-100 transition-opacity">
                    <div 
                      onClick={(e) => {
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
                      className="w-12 h-12 bg-orange-600 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(234,88,12,0.8)] text-white hover:scale-110 active:scale-95 transition-transform"
                    >
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </div>
                  </div>

                  <div className="absolute bottom-3 inset-x-0 px-3 text-center">
                    <span className="block font-bold text-xs text-white truncate drop-shadow-md">
                      {item.title}
                    </span>
                    <span className="block text-[10px] text-neutral-400 mt-0.5">
                      {item.year} • {item.rating}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#111111] border border-white/5 rounded-2xl p-6 text-center text-neutral-500">
              <p className="text-sm">Você ainda não possui títulos nos favoritos.</p>
              <button 
                onClick={() => onNavigate('home')} 
                className="mt-3 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Explorar Catálogo
              </button>
            </div>
          )}
        </div>

        {/* Menu de Configurações */}
        <div className="space-y-3">
          <h3 className="text-xl font-bold text-white mb-4 pl-3 border-l-4 border-orange-500">
            Navegação & Preferências
          </h3>
          
          {[
            { 
              label: 'Minha Lista de Favoritos', 
              desc: `${favoriteItems.length} títulos salvos`,
              icon: <Bookmark className="w-5 h-5 text-orange-500" />,
              onClick: () => onNavigate('favorites') 
            },
            { 
              label: 'Calendário de Lançamentos de Episódios', 
              desc: `${followedSeries.length} séries seguidas • ${thisWeekEpisodes.length} lançamentos esta semana`,
              icon: <CalendarDays className="w-5 h-5 text-orange-500" />,
              onClick: () => onNavigate('calendar') 
            },
            { 
              label: 'Histórico de Visualização', 
              desc: 'Títulos assistidos recentemente',
              icon: <Clock className="w-5 h-5 text-neutral-400" /> 
            },
            { 
              label: 'Configurações do Aplicativo', 
              desc: 'Qualidade de vídeo e preferências de reprodução',
              icon: <Info className="w-5 h-5 text-neutral-400" /> 
            }
          ].map((item, i) => (
            <div 
              key={i} 
              tabIndex={0}
              role="button"
              onClick={item.onClick} 
              className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl p-4 sm:p-5 flex items-center justify-between cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 shrink-0">
                  {item.icon}
                </div>
                <div>
                  <span className="font-semibold text-neutral-200 group-hover:text-white transition-colors block text-sm sm:text-base">
                    {item.label}
                  </span>
                  {item.desc && (
                    <span className="text-xs text-neutral-400 block mt-0.5">
                      {item.desc}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-neutral-500 group-hover:text-orange-500 transition-colors shrink-0" />
            </div>
          ))}

          <button className="w-full mt-8 py-4 text-center font-bold text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-colors border border-transparent hover:border-red-500/20 text-sm cursor-pointer">
            Encerrar Sessão
          </button>
        </div>
      </div>
    </div>
  );
}
