
import { FilterChip } from '../components/FilterChip';
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

export function ProviderPage({ 
  provider, 
  onBack, 
  onItemClick,
  onPlay 
}: { 
  provider: string, 
  onBack: () => void, 
  onItemClick: (id: number, item?: CatalogItem) => void,
  onPlay?: OnPlayHandler
}) {
  const initialCatalogs = providerCatalogs[provider] || [];
  
  const [items, setItems] = useState<CatalogItem[]>(initialCatalogs);
  const [loading, setLoading] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<'popularity.desc' | 'vote_average.desc' | 'first_air_date.desc'>('popularity.desc');
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'series'>('series');
  const [filterGenre, setFilterGenre] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const gridSectionRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef<boolean>(true);

  const scrollToGrid = () => {
    if (gridSectionRef.current) {
      const navOffset = 65;
      const elementPosition = gridSectionRef.current.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - navOffset;
      window.scrollTo({
        top: Math.max(0, offsetPosition),
        behavior: 'smooth'
      });
    }
  };

  // Fetch from TMDB Discover API to get the real full catalog of this streaming
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const loadProviderData = async () => {
      try {
        if (filterType === 'movie') {
          const res = await getProviderMovies(provider, currentPage);
          if (!isMounted) return;
          if (res && res.results && res.results.length > 0) {
            const formatted: CatalogItem[] = res.results.map((m: TMDBItem) => ({
              id: m.id,
              tmdbId: m.id,
              title: m.title || m.name || "Sem título",
              imageUrl: formatImageUrl(m.poster_path, 'w500'),
              posterUrl: formatImageUrl(m.poster_path, 'w500'),
              backdropUrl: formatImageUrl(m.backdrop_path, 'original'),
              type: 'movie',
              genres: getGenreNames(m.genre_ids || []),
              synopsis: m.overview || "Sinopse não disponível.",
              year: parseInt(m.release_date?.substring(0, 4) || '2024'),
              rating: `${m.vote_average ? m.vote_average.toFixed(1) : '8.0'} ★`,
              duration: "Filme",
              match: Math.min(99, Math.round((m.vote_average || 7.5) * 10) + 5),
              playerUrl: `https://v1.watchplay.shop/movie/${m.id}`
            }));
            setItems(formatted);
            setTotalPages(Math.min(res.total_pages || 1, 500));
            setTotalCount(res.total_results || formatted.length);
          } else {
            setItems(initialCatalogs.filter(c => c.type === 'movie'));
            setTotalPages(1);
          }
        } else if (filterType === 'series') {
          const res = await getProviderSeries(provider, currentPage);
          if (!isMounted) return;
          if (res && res.results && res.results.length > 0) {
            const formatted: CatalogItem[] = res.results.map((s: TMDBItem) => ({
              id: s.id,
              tmdbId: s.id,
              title: s.name || s.title || "Sem título",
              imageUrl: formatImageUrl(s.poster_path, 'w500'),
              posterUrl: formatImageUrl(s.poster_path, 'w500'),
              backdropUrl: formatImageUrl(s.backdrop_path, 'original'),
              type: 'series',
              genres: getGenreNames(s.genre_ids || []),
              synopsis: s.overview || "Sinopse não disponível.",
              year: parseInt(s.first_air_date?.substring(0, 4) || '2024'),
              rating: `${s.vote_average ? s.vote_average.toFixed(1) : '8.0'} ★`,
              duration: "Série",
              match: Math.min(99, Math.round((s.vote_average || 7.5) * 10) + 5),
              playerUrl: `https://v1.watchplay.shop/tvshow/${s.id}/1/1`
            }));
            setItems(formatted);
            setTotalPages(Math.min(res.total_pages || 1, 500));
            setTotalCount(res.total_results || formatted.length);
          } else {
            setItems(initialCatalogs.filter(c => c.type === 'series'));
            setTotalPages(1);
          }
        } else {
          // Both (séries + filmes)
          const [seriesRes, moviesRes] = await Promise.all([
            getProviderSeries(provider, currentPage),
            getProviderMovies(provider, currentPage)
          ]);
          if (!isMounted) return;

          const combined: CatalogItem[] = [];
          if (seriesRes && seriesRes.results) {
            seriesRes.results.forEach((s: TMDBItem) => {
              combined.push({
                id: s.id,
                tmdbId: s.id,
                title: s.name || s.title || "Sem título",
                imageUrl: formatImageUrl(s.poster_path, 'w500'),
                posterUrl: formatImageUrl(s.poster_path, 'w500'),
                backdropUrl: formatImageUrl(s.backdrop_path, 'original'),
                type: 'series',
                genres: getGenreNames(s.genre_ids || []),
                synopsis: s.overview || "Sinopse não disponível.",
                year: parseInt(s.first_air_date?.substring(0, 4) || '2024'),
                rating: `${s.vote_average ? s.vote_average.toFixed(1) : '8.0'} ★`,
                duration: "Série",
                match: Math.min(99, Math.round((s.vote_average || 7.5) * 10) + 5),
                playerUrl: `https://v1.watchplay.shop/tvshow/${s.id}/1/1`
              });
            });
          }

          if (moviesRes && moviesRes.results) {
            moviesRes.results.forEach((m: TMDBItem) => {
              combined.push({
                id: m.id,
                tmdbId: m.id,
                title: m.title || m.name || "Sem título",
                imageUrl: formatImageUrl(m.poster_path, 'w500'),
                posterUrl: formatImageUrl(m.poster_path, 'w500'),
                backdropUrl: formatImageUrl(m.backdrop_path, 'original'),
                type: 'movie',
                genres: getGenreNames(m.genre_ids || []),
                synopsis: m.overview || "Sinopse não disponível.",
                year: parseInt(m.release_date?.substring(0, 4) || '2024'),
                rating: `${m.vote_average ? m.vote_average.toFixed(1) : '8.0'} ★`,
                duration: "Filme",
                match: Math.min(99, Math.round((m.vote_average || 7.5) * 10) + 5),
                playerUrl: `https://v1.watchplay.shop/movie/${m.id}`
              });
            });
          }

          if (combined.length > 0) {
            setItems(combined);
            setTotalPages(Math.min(Math.max(seriesRes?.total_pages || 1, moviesRes?.total_pages || 1), 500));
            setTotalCount((seriesRes?.total_results || 0) + (moviesRes?.total_results || 0));
          } else {
            setItems(initialCatalogs);
            setTotalPages(1);
          }
        }
      } catch (err) {
        console.error("Erro ao buscar catálogo do streaming:", err);
        if (isMounted) {
          setItems(initialCatalogs);
          setTotalPages(1);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadProviderData();
    if (currentPage > 1) {
      scrollToGrid();
    }

    return () => {
      isMounted = false;
    };
  }, [provider, filterType, currentPage]);

  // get all unique genres for this provider
  const availableGenres = Array.from(new Set<string>(items.flatMap(item => item.genres || []))).sort();

  const filteredItems = items.filter(item => {
    if (filterGenre !== 'all' && (!item.genres || !item.genres.includes(filterGenre))) return false;
    return true;
  });

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen">
      {/* Provider Hero Header */}
      <div className="relative pt-32 pb-12 px-6 md:px-12 bg-gradient-to-b from-orange-500/10 to-[#0a0a0a] border-b border-orange-500/10">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-neutral-400 hover:text-white px-4 py-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors w-fit mb-8 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Início
        </button>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter drop-shadow-lg leading-none uppercase">
              {provider}
            </h1>
            <p className="text-neutral-400 mt-3 max-w-2xl text-base md:text-lg">
              Catálogo completo de séries, temporadas e filmes originais do streaming <span className="text-white font-semibold">{provider}</span> integrados ao nosso player.
            </p>
          </div>
        </div>
      </div>

      <main className="flex-1 px-4 md:px-12 py-6 md:py-10 space-y-6 md:space-y-10 bg-[#0a0a0a] animate-in fade-in duration-500">
        {/* FILTERS */}
        <div className="space-y-4 bg-neutral-950/60 p-3.5 md:p-5 rounded-2xl border border-neutral-800/80 text-center">
          {/* Tipo de Conteúdo */}
          <div>
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2 text-center">
              Tipo
            </span>
            <div className="flex flex-wrap justify-center items-center gap-1.5 md:gap-2">
              <FilterChip 
                label="Todos os Títulos" 
                active={filterType === 'all'} 
                tabIndex={0} role="button" onClick={() => {
                  setFilterType('all');
                  setCurrentPage(1);
                }} 
              />
              <FilterChip 
                label="Todas as Séries" 
                active={filterType === 'series'} 
                tabIndex={0} role="button" onClick={() => {
                  setFilterType('series');
                  setCurrentPage(1);
                }} 
              />
              <FilterChip 
                label="Filmes" 
                active={filterType === 'movie'} 
                tabIndex={0} role="button" onClick={() => {
                  setFilterType('movie');
                  setCurrentPage(1);
                }} 
              />
            </div>
          </div>
          
          {availableGenres.length > 0 && (
            <div>
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2 text-center">
                Gênero
              </span>
              <div className="flex flex-wrap justify-center items-center gap-1.5 md:gap-2">
                <FilterChip 
                  label="Todos Gêneros" 
                  active={filterGenre === 'all'} 
                  onClick={() => setFilterGenre('all')} 
                />
                {availableGenres.map(genre => (
                  <FilterChip 
                    key={genre} 
                    label={genre} 
                    active={filterGenre === genre} 
                    onClick={() => setFilterGenre(genre)} 
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div ref={gridSectionRef} className="flex flex-col items-center justify-center py-28 text-neutral-400 space-y-4 scroll-mt-20">
            <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
            <p className="text-base font-semibold">Carregando catálogo completo do {provider}...</p>
          </div>
        ) : filteredItems.length > 0 ? (
          <section ref={gridSectionRef} className="space-y-6 scroll-mt-20">
            <div className="flex items-center justify-between gap-4 pb-2 border-b border-white/5">
              <h2 className="text-lg md:text-2xl font-bold text-white uppercase tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
                {filterType === 'series' ? 'Séries do Streaming' : filterType === 'movie' ? 'Filmes do Streaming' : 'Catálogo Disponível'}
              </h2>
              {totalPages > 1 && (
                <span className="text-xs text-neutral-400 font-medium whitespace-nowrap shrink-0">
                  Página {currentPage} de {totalPages}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
              {filteredItems.map((item, idx) => (
                <div 
                  key={`prov-${item.type}-${item.id}-${idx}`} 
                  tabIndex={0} role="button" onClick={() => onItemClick(item.id, item)} 
                  className="relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group cursor-pointer aspect-[2/3] hover:border-orange-500/50 hover:shadow-[0_0_20px_rgba(234,88,12,0.25)] transition-all duration-300"
                >
                  <img 
                    src={item.posterUrl || item.imageUrl} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    loading="lazy" 
                    onError={(e) => handlePosterError(e, item.backdropUrl)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent"></div>
                  
                  {/* Badge nota, CAM e Tipo */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
                    <div className="flex items-center gap-1.5">
                      {checkIsCam(item.title, item.quality) && (
                        <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] tracking-wider uppercase shadow-md">
                          CAM
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded bg-neutral-900/80 backdrop-blur-md text-[10px] font-bold text-white border border-white/10 uppercase">
                        {item.type === 'series' ? 'Série' : 'Filme'}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] font-bold text-orange-400 border border-white/10">
                      {item.rating || "8.5 ★"}
                    </span>
                  </div>

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
                      className="w-12 h-12 bg-orange-600 rounded-full flex items-center justify-center backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all shadow-[0_0_20px_rgba(234,88,12,0.6)] text-white hover:scale-110"
                      title="Assistir agora"
                    >
                      <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                    </div>
                  </div>

                  <div className="absolute bottom-3 inset-x-0 mx-3">
                    <span className="block text-center font-bold text-sm md:text-base uppercase text-white drop-shadow-lg truncate">
                      {item.title}
                    </span>
                    <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-400 mt-1">
                      <span>{item.year}</span>
                      <span>•</span>
                      <span className="truncate max-w-[120px]">{item.duration || item.genres?.[0]}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Subpages / Pagination Controls */}
            {totalPages > 1 && (
              <div className="pt-8 pb-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-neutral-800">
                <div className="text-xs text-neutral-400">
                  Página <span className="text-white font-semibold">{currentPage}</span> de <span className="text-white font-semibold">{totalPages}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    tabIndex={0} role="button" onClick={() => {
                      setCurrentPage(prev => Math.max(1, prev - 1));
                      scrollToGrid();
                    }}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg bg-neutral-900 border border-white/10 text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-neutral-900 disabled:hover:text-neutral-300 transition-colors cursor-pointer disabled:cursor-not-allowed"
                    title="Página Anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 7) {
                      if (currentPage > 4) {
                        pageNum = currentPage - 3 + i;
                        if (pageNum > totalPages) pageNum = totalPages - (6 - i);
                      }
                    }
                    return (
                      <button
                        key={pageNum}
                        tabIndex={0} role="button" onClick={() => {
                          setCurrentPage(pageNum);
                          scrollToGrid();
                        }}
                        className={`w-9 h-9 rounded-lg font-bold text-xs transition-all cursor-pointer border ${
                          currentPage === pageNum
                            ? 'bg-orange-600 text-white border-orange-500 shadow-[0_0_12px_rgba(234,88,12,0.4)]'
                            : 'bg-neutral-900/80 text-neutral-400 border-white/5 hover:bg-neutral-800 hover:text-white hover:border-white/20'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    tabIndex={0} role="button" onClick={() => {
                      setCurrentPage(prev => Math.min(totalPages, prev + 1));
                      scrollToGrid();
                    }}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg bg-neutral-900 border border-white/10 text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-neutral-900 disabled:hover:text-neutral-300 transition-colors cursor-pointer disabled:cursor-not-allowed"
                    title="Próxima Página"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
            <Film className="w-16 h-16 mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-neutral-400">Catálogo Vazio</h3>
            <p className="mt-1 text-sm">Nenhum conteúdo encontrado para este filtro.</p>
          </div>
        )}
      </main>
    </div>
  );
}
