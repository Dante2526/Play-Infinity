
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

export function GlobalCatalogPage({ 
  type, 
  onItemClick,
  onPlay 
}: { 
  type: 'movies' | 'series', 
  onItemClick: (id: number, item?: CatalogItem) => void,
  onPlay?: OnPlayHandler
}) {
  // Combine curated items from data.ts
  const allCatalogs = React.useMemo(() => getAllCatalogItems(), []);
  const typeFilter = type === 'movies' ? 'movie' : 'series';
  const initialLocalItems = allCatalogs.filter(item => item.type === typeFilter);

  const [items, setItems] = useState<CatalogItem[]>(initialLocalItems);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(500);
  const [totalCount, setTotalCount] = useState<number>(10000);
  const [filterGenre, setFilterGenre] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('popularity.desc');
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

  const availableGenres = [
    "Ação", "Aventura", "Animação", "Comédia", "Crime",
    "Documentário", "Drama", "Família", "Fantasia",
    "Ficção científica", "Mistério", "Romance", "Terror", "Thriller"
  ];

  const yearRanges = [
    { label: "Todos os Anos", value: "all" },
    { label: "2026 (Lançamentos)", year: 2026 },
    { label: "2025", year: 2025 },
    { label: "2024", year: 2024 },
    { label: "2023", year: 2023 },
    { label: "2020 - 2022", year: 2022 },
    { label: "2010 - 2019", year: 2015 },
  ];

  // Fetch from TMDB Discover API
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const loadCatalog = async () => {
      try {
        const genreId = filterGenre !== 'all' ? getGenreIdByName(filterGenre) : undefined;
        const selectedYearObj = yearRanges.find(r => r.label === filterYear);
        const targetYear = selectedYearObj?.year;

        if (type === 'movies') {
          const res = await discoverMovies(currentPage, genreId, sortBy, targetYear);
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
              synopsis: m.overview || "Sinopse não disponível no momento.",
              year: parseInt(m.release_date?.substring(0, 4) || '2024'),
              rating: `${m.vote_average ? m.vote_average.toFixed(1) : '8.0'} ★`,
              duration: "Filme",
              match: Math.min(99, Math.round((m.vote_average || 7.5) * 10) + 5),
              playerUrl: `https://v1.watchplay.shop/movie/${m.id}`,
            }));
            setItems(formatted);
            setTotalPages(Math.min(res.total_pages || 1, 500));
            setTotalCount(res.total_results || 10000);
          } else {
            setItems(initialLocalItems);
            setTotalPages(1);
          }
        } else {
          // Séries
          const res = await discoverSeries(currentPage, genreId, sortBy, targetYear);
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
              synopsis: s.overview || "Sinopse não disponível no momento.",
              year: parseInt(s.first_air_date?.substring(0, 4) || '2024'),
              rating: `${s.vote_average ? s.vote_average.toFixed(1) : '8.0'} ★`,
              duration: "Série",
              match: Math.min(99, Math.round((s.vote_average || 7.5) * 10) + 5),
              playerUrl: `https://v1.watchplay.shop/tvshow/${s.id}/1/1`,
            }));
            setItems(formatted);
            setTotalPages(Math.min(res.total_pages || 1, 500));
            setTotalCount(res.total_results || 10000);
          } else {
            setItems(initialLocalItems);
            setTotalPages(1);
          }
        }
      } catch (err) {
        console.error("Erro ao carregar catálogo completo:", err);
        if (isMounted) {
          setItems(initialLocalItems);
          setTotalPages(1);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCatalog();
    if (currentPage > 1) {
      scrollToGrid();
    }

    return () => {
      isMounted = false;
    };
  }, [type, currentPage, filterGenre, filterYear, sortBy]);

  const pageTitle = type === 'movies' ? 'Catálogo de Filmes' : 'Catálogo de Séries';
  const pageDescription = type === 'movies' 
    ? 'Acesso direto a mais de 500.000 filmes em alta definição.' 
    : 'Acesso completo a dezenas de milhares de séries, temporadas e episódios com multi-servidores.';

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen">
      {/* Global Hero Header */}
      <div className="relative pt-24 md:pt-32 pb-4 md:pb-8 px-4 md:px-12 bg-[#0a0a0a]">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4">
          <div>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter drop-shadow-lg leading-tight uppercase">
              {pageTitle}
            </h1>
            <p className="text-neutral-400 mt-1 md:mt-2 max-w-2xl text-xs md:text-base">
              {pageDescription}
            </p>
          </div>

          {/* Seletor de Ordenação */}
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 self-start md:self-auto shrink-0">
            <span className="text-xs text-neutral-400">Ordenar por:</span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
            >
              <option value="popularity.desc" className="bg-neutral-900 text-white">Mais Populares</option>
              <option value="vote_average.desc" className="bg-neutral-900 text-white">Melhor Avaliados</option>
              <option value="primary_release_date.desc" className="bg-neutral-900 text-white">Lançamentos Recentes</option>
            </select>
          </div>
        </div>
      </div>

      <main className="flex-1 px-4 md:px-12 py-4 md:py-6 space-y-6 md:space-y-8 bg-[#0a0a0a] animate-in fade-in duration-500">
        {/* FILTERS */}
        <div className="space-y-4 bg-neutral-950/60 p-3.5 md:p-5 rounded-2xl border border-neutral-800/80 text-center">
          {/* Gêneros */}
          <div>
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2 text-center">
              Gênero
            </span>
            <div className="flex flex-wrap justify-center items-center gap-1.5 md:gap-2">
              <FilterChip 
                label="Todos Gêneros" 
                active={filterGenre === 'all'} 
                tabIndex={0} role="button" onClick={() => { setFilterGenre('all'); setCurrentPage(1); }} 
              />
              {availableGenres.map(genre => (
                <FilterChip 
                  key={genre} 
                  label={genre} 
                  active={filterGenre === genre} 
                  tabIndex={0} role="button" onClick={() => { setFilterGenre(genre); setCurrentPage(1); }} 
                />
              ))}
            </div>
          </div>
          
          {/* Anos */}
          <div>
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2 text-center">
              Ano de Lançamento
            </span>
            <div className="flex flex-wrap justify-center items-center gap-1.5 md:gap-2">
              {yearRanges.map(range => (
                <FilterChip 
                  key={range.label} 
                  label={range.label} 
                  active={filterYear === range.label || (filterYear === 'all' && range.value === 'all')} 
                  tabIndex={0} role="button" onClick={() => { setFilterYear(range.value === 'all' ? 'all' : range.label); setCurrentPage(1); }} 
                />
              ))}
            </div>
          </div>
        </div>

        {/* LOADING STATE */}
        {loading ? (
          <div ref={gridSectionRef} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6 py-4 scroll-mt-20">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-xl bg-neutral-900/60 animate-pulse border border-neutral-800/60" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <section ref={gridSectionRef} className="space-y-8 scroll-mt-20">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
              {items.map((item, idx) => (
                <div 
                  key={`cat-${item.type}-${item.id}-${idx}`} 
                  tabIndex={0} role="button" onClick={() => onItemClick(item.id, item)} 
                  className="relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group cursor-pointer aspect-[2/3] hover:border-orange-500/50 hover:shadow-[0_0_20px_rgba(234,88,12,0.25)] transition-all duration-300"
                >
                  <img 
                    src={item.posterUrl || item.imageUrl || FALLBACK_POSTER_IMAGE} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 bg-neutral-900" 
                    loading="lazy" 
                    onError={(e) => handlePosterError(e, item.backdropUrl)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent"></div>
                  
                  {/* Badge de nota e CAM */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
                    {checkIsCam(item.title, item.quality) ? (
                      <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] tracking-wider uppercase shadow-md">
                        CAM
                      </span>
                    ) : <span />}
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

                  <div className="absolute bottom-4 inset-x-0 mx-3">
                    <span className="block text-center font-bold text-sm md:text-base uppercase text-white drop-shadow-lg truncate">
                      {item.title}
                    </span>
                    <span className="block text-center text-xs text-neutral-400 mt-0.5">
                      {item.year || 2024} • {item.genres?.[0] || (type === 'movies' ? 'Filme' : 'Série')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* PAGINATION CONTROLS */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-neutral-800">
              <span className="text-xs text-neutral-400">
                Página <strong className="text-white">{currentPage}</strong> de <strong className="text-white">{totalPages}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  tabIndex={0} role="button" onClick={() => {
                    setCurrentPage(p => Math.max(1, p - 1));
                    scrollToGrid();
                  }}
                  disabled={currentPage <= 1}
                  className="px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-xs font-bold hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </button>

                <div className="flex items-center gap-1">
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    let pageNum = currentPage;
                    if (currentPage <= 3) pageNum = i + 1;
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = currentPage - 2 + i;

                    if (pageNum < 1 || pageNum > totalPages) return null;

                    return (
                      <button
                        key={pageNum}
                        tabIndex={0} role="button" onClick={() => {
                          setCurrentPage(pageNum);
                          scrollToGrid();
                        }}
                        className={`w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          currentPage === pageNum
                            ? "bg-orange-600 text-white shadow-md shadow-orange-600/30"
                            : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  tabIndex={0} role="button" onClick={() => {
                    setCurrentPage(p => Math.min(totalPages, p + 1));
                    scrollToGrid();
                  }}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-white text-xs font-bold hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                >
                  Próxima <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
            <Film className="w-16 h-16 mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-neutral-400">Nenhum título encontrado</h3>
            <p className="text-sm mt-1">Tente trocar os filtros ou a ordenação selecionada.</p>
          </div>
        )}
      </main>
    </div>
  );
}
