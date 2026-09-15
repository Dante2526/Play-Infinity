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
import { featured, providers, releases, newest, animes, doramas, mostWatched, continueWatching, providerCatalogs, CatalogItem, checkIsCam, WATCHPLAY_DORAMA_IDS, isMediaAvailable } from "../data";
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

export function GlobalSearchPage({ 
  onItemClick, 
  onPlay 
}: { 
  onItemClick: (id: number, item?: CatalogItem) => void,
  onPlay?: OnPlayHandler
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [tmdbResults, setTmdbResults] = useState<CatalogItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Hook de Busca por Voz
  const {
    isListening,
    interimTranscript,
    error: voiceError,
    isSupported: isVoiceSupported,
    toggleListening,
    clearError: clearVoiceError
  } = useVoiceSearch({
    onResult: (spokenText) => {
      setSearchQuery(spokenText);
    }
  });

  const allCatalogs = React.useMemo(() => getAllCatalogItems(), []);

  // Busca em tempo real com TMDB API
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setTmdbResults([]);
      setIsSearching(false);
      return;
    }

    let isMounted = true;
    setIsSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const response = await searchMulti(searchQuery);
        if (!isMounted) return;

        if (response && response.results) {
          // Converter TMDBItem em CatalogItem com capas e players reais
          const formatted: CatalogItem[] = response.results
            .filter(r => {
              const isMedia = r.media_type === 'movie' || r.media_type === 'tv' || (!r.media_type && (Boolean(r.title) || Boolean(r.name)));
              return isMedia && Boolean(r.title || r.name) && isMediaAvailable({ id: r.id, title: r.title || r.name });
            })
            .map(r => {
              const isTv = r.media_type === 'tv' || (!r.media_type && Boolean(r.name && !r.title));
              const title = r.title || r.name || "Sem título";
              const year = r.release_date ? parseInt(r.release_date.substring(0, 4)) : r.first_air_date ? parseInt(r.first_air_date.substring(0, 4)) : 2024;
              const poster = formatImageUrl(r.poster_path, 'w500');
              const backdrop = formatImageUrl(r.backdrop_path || r.poster_path, 'original');
              const genres = getGenreNames(r.genre_ids || []);
              
              return {
                id: r.id,
                tmdbId: r.id,
                title,
                imageUrl: poster,
                posterUrl: poster,
                backdropUrl: backdrop,
                type: isTv ? 'series' : 'movie',
                genres,
                synopsis: r.overview || "Sem sinopse disponível em português.",
                year,
                rating: r.vote_average ? `${r.vote_average.toFixed(1)} ★` : "14",
                duration: isTv ? "Série" : "Filme",
                match: Math.min(99, Math.max(70, Math.round((r.vote_average || 7.5) * 10))),
                playerUrl: isTv 
                  ? `https://v1.watchplay.shop/tvshow/${r.id}/1/1`
                  : `https://v1.watchplay.shop/movie/${r.id}`
              };
            });

          setTmdbResults(formatted);
        }
      } catch (err) {
        console.warn("Erro ao buscar no TMDB:", err);
      } finally {
        if (isMounted) setIsSearching(false);
      }
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  // Filtrar resultados por tipo (Todos, Filmes, Séries)
  const displayedResults = React.useMemo(() => {
    let list = tmdbResults;
    if (list.length === 0 && searchQuery.trim() !== '') {
      // Fallback para itens locais
      list = allCatalogs.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    list = list.filter(isMediaAvailable);
    if (activeFilter === 'movie') return list.filter(i => i.type === 'movie');
    if (activeFilter === 'tv') return list.filter(i => i.type === 'series');
    return list;
  }, [tmdbResults, searchQuery, activeFilter]);

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen pt-28 px-4 md:px-12 bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto w-full flex flex-col items-center">
        
        {/* Cabeçalho de Busca */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase">
            Buscar no <span className="text-orange-500">Catálogo</span>
          </h1>
          <p className="text-neutral-400 mt-2 text-sm md:text-base">
            Pesquise por qualquer filme, série, anime ou dorama do catálogo
          </p>
        </div>
        
        {/* Input de Busca */}
        <div className="w-full max-w-2xl mb-8 flex flex-col gap-3">
          <div className="relative w-full group">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
              {isSearching ? (
                <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
              ) : (
                <Search className="w-5 h-5 text-neutral-500 group-focus-within:text-orange-500 transition-colors" />
              )}
            </div>
            <input 
              type="text" 
              placeholder={isListening ? "Ouvindo sua voz... Fale agora..." : "Digite o nome do filme ou série (ex: Avatar, Harry Potter)..."} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full bg-[#111111] border rounded-full py-4 pl-14 ${searchQuery ? 'pr-24' : 'pr-14'} text-base md:text-lg text-white font-medium focus:outline-none transition-all shadow-xl placeholder:text-neutral-500 ${
                isListening 
                  ? 'border-orange-500 ring-2 ring-orange-500/30 shadow-[0_0_25px_rgba(234,88,12,0.3)]' 
                  : 'border-white/10 focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20'
              }`}
              autoFocus
            />
            
            <div className="absolute inset-y-0 right-3.5 flex items-center gap-1.5">
              {searchQuery && (
                <button 
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Limpar busca"
                >
                  <X className="w-5 h-5" />
                </button>
              )}

              {/* BOTÃO DE COMANDO DE VOZ */}
              {isVoiceSupported && (
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`p-2 rounded-full transition-all cursor-pointer relative flex items-center justify-center ${
                    isListening 
                      ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.7)] scale-105' 
                      : 'text-neutral-400 hover:text-orange-400 hover:bg-orange-500/10'
                  }`}
                  title={isListening ? "Parar de ouvir" : "Pesquisar por voz"}
                >
                  {isListening ? (
                    <>
                      <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping pointer-events-none" />
                      <Mic className="w-5 h-5 relative z-10 animate-pulse text-white" />
                    </>
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* HUD DE ESCUTA DE VOZ ATIVA */}
          {isListening && (
            <div className="p-4 rounded-2xl bg-[#161616] border border-orange-500/50 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-orange-600/20 text-orange-500 border border-orange-500/40 shrink-0">
                  <span className="absolute inset-0 rounded-full bg-orange-500/30 animate-ping" />
                  <Mic className="w-5 h-5 relative z-10 animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-sm flex items-center gap-1.5">
                      Ouvindo...
                      <span className="flex gap-0.5 items-end h-3 ml-1">
                        <span className="w-1 h-2 bg-orange-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-3 bg-orange-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1.5 bg-orange-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                      </span>
                    </span>
                    <span className="text-neutral-400 text-xs hidden sm:inline">• Fale o nome do conteúdo</span>
                  </div>
                  {interimTranscript ? (
                    <p className="text-orange-400 font-semibold text-xs sm:text-sm truncate mt-0.5">
                      "{interimTranscript}"
                    </p>
                  ) : (
                    <p className="text-neutral-400 text-xs truncate mt-0.5">
                      Diga algo como "Avatar", "Harry Potter", "Loki"...
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={toggleListening}
                className="w-full sm:w-auto px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0 text-center"
              >
                Concluir / Cancelar
              </button>
            </div>
          )}

          {/* MENSAGEM DE ERRO OU AVISO DA VOZ */}
          {voiceError && (
            <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <Info className="w-4 h-4 text-red-400 shrink-0" />
                <span className="truncate">{voiceError}</span>
              </div>
              <button
                type="button"
                onClick={clearVoiceError}
                className="p-1 hover:text-white shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Abas de Filtro */}
        {searchQuery.trim() !== '' && (
          <div className="flex gap-2 mb-8">
            <button 
              onClick={() => setActiveFilter('all')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${activeFilter === 'all' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30' : 'bg-[#181818] text-neutral-400 hover:text-white border border-neutral-800'}`}
            >
              Todos
            </button>
            <button 
              onClick={() => setActiveFilter('movie')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${activeFilter === 'movie' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30' : 'bg-[#181818] text-neutral-400 hover:text-white border border-neutral-800'}`}
            >
              Filmes
            </button>
            <button 
              onClick={() => setActiveFilter('tv')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${activeFilter === 'tv' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30' : 'bg-[#181818] text-neutral-400 hover:text-white border border-neutral-800'}`}
            >
              Séries
            </button>
          </div>
        )}

        {/* Resultados ou Recomendações */}
        <div className="w-full">
          {searchQuery.trim() === '' ? (
            /* Vitrines de Conteúdo Recomendado quando a busca estiver vazia */
            <div className="space-y-12 py-6">
              <div>
                <h2 className="text-xl font-bold mb-6 text-white border-l-4 border-orange-500 pl-3 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-orange-500" />
                  Mais Buscados
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {allCatalogs.slice(0, 12).map((item, idx) => (
                    <div 
                      key={`rec-${item.id}-${idx}`} 
                      tabIndex={0} role="button" onClick={() => onItemClick(item.id, item)} 
                      className="relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group cursor-pointer aspect-[2/3] hover:border-orange-500/60 hover:shadow-[0_0_20px_rgba(234,88,12,0.25)] transition-all duration-300"
                    >
                      <img 
                        src={item.posterUrl || item.imageUrl} 
                        alt={item.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                        loading="lazy" 
                        onError={(e) => handlePosterError(e, item.backdropUrl)}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent"></div>
                      
                      {/* Badge CAM */}
                      {checkIsCam(item.title, item.quality) && (
                        <div className="absolute top-2.5 left-2.5 z-10">
                          <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] tracking-wider uppercase shadow-md">
                            CAM
                          </span>
                        </div>
                      )}

                      {/* Play Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
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
                          className="w-11 h-11 bg-orange-600 rounded-full flex items-center justify-center backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all shadow-[0_0_15px_rgba(234,88,12,0.6)] text-white hover:scale-110"
                          title="Assistir agora"
                        >
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </div>
                      </div>

                      <div className="absolute bottom-3 inset-x-0 px-3">
                        <span className="block font-bold text-xs md:text-sm text-white drop-shadow-md truncate">
                          {item.title}
                        </span>
                        <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-0.5">
                          <span>{item.year}</span>
                          <span className="text-orange-400 font-bold">{item.rating}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : displayedResults.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white border-l-4 border-orange-500 pl-3">
                  Resultados para "{searchQuery}" ({displayedResults.length})
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                {displayedResults.map((item, idx) => (
                  <div 
                    key={`search-${item.type || 'media'}-${item.id}-${idx}`} 
                    tabIndex={0} role="button" onClick={() => onItemClick(item.id, item)} 
                    className="relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group cursor-pointer aspect-[2/3] hover:border-orange-500/60 hover:shadow-[0_0_25px_rgba(234,88,12,0.25)] transition-all duration-300"
                  >
                    <img 
                      src={item.posterUrl || item.imageUrl} 
                      alt={item.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      loading="lazy" 
                      onError={(e) => handlePosterError(e, item.backdropUrl)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent"></div>
                    
                    {/* Badge Tipo e Nota */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
                      <div className="flex items-center gap-1">
                        <span className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-bold text-white border border-white/10 uppercase">
                          {item.type === 'series' ? 'Série' : 'Filme'}
                        </span>
                        {checkIsCam(item.title, item.quality) && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500 text-black font-black text-[9px] tracking-wider uppercase shadow">
                            CAM
                          </span>
                        )}
                      </div>
                      <span className="px-2 py-0.5 rounded bg-orange-600/80 backdrop-blur-md text-[10px] font-bold text-white shadow">
                        {item.rating}
                      </span>
                    </div>

                    {/* Play Overlay no Hover */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
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
                        className="w-12 h-12 bg-orange-600 rounded-full flex items-center justify-center backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all shadow-[0_0_20px_rgba(234,88,12,0.6)] text-white hover:scale-110"
                        title="Assistir agora"
                      >
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                    </div>

                    <div className="absolute bottom-3 inset-x-0 px-3">
                      <span className="block font-bold text-xs md:text-sm text-white drop-shadow-md truncate">
                        {item.title}
                      </span>
                      <span className="block text-[11px] text-neutral-400 mt-0.5">
                        {item.year} • {item.genres?.[0] || (item.type === 'series' ? 'Série' : 'Filme')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : isSearching ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
              <p className="text-base font-semibold">Consultando catálogo oficial e TMDB...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
              <p className="text-lg mb-2 text-neutral-300">Nenhum título encontrado para "{searchQuery}"</p>
              <p className="text-sm">Tente pesquisar com outro nome ou palavra-chave.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
