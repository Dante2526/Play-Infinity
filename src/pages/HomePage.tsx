
import { ContentRow } from '../components/ContentRow';
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
import { featured, featuredCarousel, providers, releases, newest, animes, doramas, mostWatched, continueWatching, kidsContent, providerCatalogs } from "../data";;
import { CatalogItem, checkIsCam, WATCHPLAY_DORAMA_IDS, WATCHPLAY_ANIME_IDS, UNAVAILABLE_TITLES_OR_IDS, isMediaAvailable } from "../utils/mediaUtils";;
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
  getKidsContent,
  getKidsSeries,
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

export function HomePage({ 
  onProviderSelect, 
  onItemClick, 
  onPlay,
  onNavigateToLiveTv
}: { 
  onProviderSelect: (p: string) => void, 
  onItemClick: (id: number, item?: any) => void,
  onPlay?: OnPlayHandler,
  onNavigateToLiveTv?: () => void
}) {
  const [heroItems, setHeroItems] = useState<any[]>(featuredCarousel);
  const [heroIndex, setHeroIndex] = useState<number>(0);
  const heroItem = heroItems[heroIndex] || featuredCarousel[0];

  // Gestos touch e drag no Banner Destaque Principal
  const heroTouchStartXRef = useRef(0);
  const heroTouchStartYRef = useRef(0);
  const heroTouchEndXRef = useRef(0);
  const heroIsSwipingRef = useRef(false);

  const handleHeroTouchStart = (e: React.TouchEvent) => {
    heroTouchStartXRef.current = e.touches[0].clientX;
    heroTouchStartYRef.current = e.touches[0].clientY;
    heroTouchEndXRef.current = e.touches[0].clientX;
    heroIsSwipingRef.current = false;
  };

  const handleHeroTouchMove = (e: React.TouchEvent) => {
    heroTouchEndXRef.current = e.touches[0].clientX;
    const dx = Math.abs(heroTouchEndXRef.current - heroTouchStartXRef.current);
    const dy = Math.abs(e.touches[0].clientY - heroTouchStartYRef.current);
    if (dx > 12 && dx > dy) {
      heroIsSwipingRef.current = true;
    }
  };

  const handleHeroTouchEnd = () => {
    if (!heroIsSwipingRef.current) return;
    const diffX = heroTouchStartXRef.current - heroTouchEndXRef.current;
    if (Math.abs(diffX) > 40) {
      if (diffX > 0) {
        // Swipe left -> Próximo destaque
        setHeroIndex(prev => (prev + 1) % heroItems.length);
      } else {
        // Swipe right -> Destaque anterior
        setHeroIndex(prev => (prev - 1 + heroItems.length) % heroItems.length);
      }
    }
    heroIsSwipingRef.current = false;
  };

  // Rotação suave automática do banner de destaque a cada 8 segundos
  useEffect(() => {
    if (heroItems.length <= 1) return;
    const timer = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % heroItems.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [heroItems.length]);

  // Estados dinâmicos dos lançamentos automáticos (fallback inicial dos dados estáticos)
  const [movieReleases, setMovieReleases] = useState<any[]>(releases);
  const [seriesReleases, setSeriesReleases] = useState<any[]>(newest);
  // Top 10 Mais Assistidos decidido dinamicamente pela audiência dos usuários
  const [mostWatchedItems, setMostWatchedItems] = useState<any[]>(mostWatched);
  // Seções especiais de Animes e Doramas
  const [animeReleases, setAnimeReleases] = useState<any[]>(animes);
  const [doramaReleases, setDoramaReleases] = useState<any[]>(doramas);
  // Área Kids (Filmes Infantis, Animações e Desenhos)
  const [kidsReleases, setKidsReleases] = useState<any[]>(kidsContent);
  const [kidsSeriesReleases, setKidsSeriesReleases] = useState<any[]>([]);

  // Itens exibidos na Área Kids (filmes e desenhos animados)
  const displayedKidsItems = React.useMemo(() => {
    if (kidsSeriesReleases.length === 0) return kidsReleases;
    const combined: any[] = [];
    const maxLen = Math.max(kidsReleases.length, kidsSeriesReleases.length);
    for (let i = 0; i < maxLen; i++) {
      if (kidsReleases[i]) combined.push(kidsReleases[i]);
      if (kidsSeriesReleases[i]) combined.push(kidsSeriesReleases[i]);
    }
    return combined;
  }, [kidsReleases, kidsSeriesReleases]);

  // Função auxiliar para mapear itens do histórico garantindo a capa/backdrop real
  const formatHistoryItem = (item: PlaybackHistoryItem) => {
    const catalog = getAllCatalogItems();
    const catalogItem = catalog.find(c => 
      (item.id && c.id === Number(item.id)) || 
      (item.tmdbId && (c.tmdbId === Number(item.tmdbId) || c.id === Number(item.tmdbId))) || 
      (item.title && c.title.trim().toLowerCase() === item.title.trim().toLowerCase())
    );
    const isChair = (url?: string) => !url || url.includes("photo-1489599849927-2ee91cede3ba");
    const resolvedBackdrop = !isChair(item.backdropUrl) ? item.backdropUrl : (!isChair(catalogItem?.backdropUrl) ? catalogItem?.backdropUrl : undefined);
    const resolvedPoster = !isChair(item.imageUrl) ? item.imageUrl : (!isChair(item.posterUrl) ? item.posterUrl : (!isChair(catalogItem?.imageUrl) ? catalogItem?.imageUrl : catalogItem?.posterUrl));
    const finalImage = resolvedBackdrop || resolvedPoster || catalogItem?.backdropUrl || catalogItem?.imageUrl || FALLBACK_BACKDROP;

    return {
      id: item.id,
      tmdbId: item.tmdbId || catalogItem?.tmdbId,
      imdbId: item.imdbId || catalogItem?.imdbId,
      title: item.title,
      episode: item.mediaType === 'series' && item.season && item.episode 
        ? `T${item.season}:E${item.episode} - Continuar`
        : `Continuar do min ${Math.floor(item.currentTime / 60)}`,
      progress: Math.min(100, Math.max(1, Math.round((item.currentTime / (item.duration || 1)) * 100))),
      imageUrl: finalImage,
      backdropUrl: resolvedBackdrop || catalogItem?.backdropUrl,
      posterUrl: resolvedPoster || catalogItem?.posterUrl,
      playerUrl: item.playerUrl || catalogItem?.playerUrl,
      currentTime: item.currentTime,
      duration: item.duration,
      mediaType: item.mediaType || catalogItem?.type || 'movie',
      season: item.season,
      episodeNumber: item.episode,
      quality: item.quality || catalogItem?.quality,
      isCam: item.isCam || catalogItem?.quality === 'CAM'
    };
  };

  // Histórico real de reprodução do usuário com fallback para dados estáticos
  const [continueWatchingList, setContinueWatchingList] = useState<any[]>(() => {
    const history = getPlaybackHistory();
    if (history.length > 0) {
      return history.map(formatHistoryItem);
    }
    const hasHistoryEverBeenSaved = localStorage.getItem("playinfinity_playback_history");
    if (hasHistoryEverBeenSaved !== null) {
      return [];
    }
    return []; // Remove fallbacks para dados mockados em contas novas
  });

  const handleRemoveHistoryItem = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    e.preventDefault();
    removePlaybackItem(item.id, item.mediaType || item.type, item.season, item.episodeNumber);
    setContinueWatchingList(prev => prev.filter(i => String(i.id) !== String(item.id)));
  };

  useEffect(() => {
    const syncHistory = () => {
      const history = getPlaybackHistory();
      const hasSaved = localStorage.getItem("playinfinity_playback_history");
      if (hasSaved !== null || history.length > 0) {
        setContinueWatchingList(history.map(formatHistoryItem));
      }
    };

    window.addEventListener('playinfinity:history_updated', syncHistory);
    return () => window.removeEventListener('playinfinity:history_updated', syncHistory);
  }, []);

  // Busca automática do destaque e dos lançamentos recentes via TMDB
  useEffect(() => {
    let isMounted = true;
    // Busca automática dos destaques (filmes e séries populares, incluindo HBO Max)
    const fetchTopTrending = async () => {
      // Desativado: Garante que apenas o destaque manual (que sabidamente possui stream) apareça.
      return;
    };

    // Sincronização automática de lançamentos reais (filmes, séries, animes, doramas e kids) no TMDB
    const fetchReleases = async () => {
      try {
        const [animesRes, doramasRes] = await Promise.all([
          getAnimes(),
          getDoramas()
        ]);

        if (isMounted) {
          // Apenas os animes confirmados como disponíveis no WatchPlayer Oficial
          let availableAnimes = [...animes];

          if (animesRes?.results && animesRes.results.length > 0) {
            const tmdbFiltered = animesRes.results
              .filter((a: TMDBItem) => 
                a.poster_path && 
                (a.name || a.title) && 
                WATCHPLAY_ANIME_IDS.includes(a.id) &&
                isMediaAvailable({ id: a.id, title: a.name || a.title })
              )
              .map((a: TMDBItem) => ({
                id: a.id,
                tmdbId: a.id,
                title: (a.name || a.title || "").toUpperCase(),
                imageUrl: formatImageUrl(a.poster_path, 'w500'),
                backdropUrl: formatImageUrl(a.backdrop_path, 'original'),
                type: 'series' as const,
                quality: "HD" as const,
                isAnime: true,
                rating: a.vote_average ? a.vote_average.toFixed(1) : undefined,
                year: a.first_air_date ? a.first_air_date.substring(0, 4) : "2026",
                playerUrl: `https://v1.watchplay.shop/tvshow/${a.id}/1/1`
              }));

            const combinedMap = new Map<number, any>();
            animes.forEach(a => combinedMap.set(a.id, a));
            tmdbFiltered.forEach(a => {
              const existing = combinedMap.get(a.id);
              if (existing) {
                combinedMap.set(a.id, {
                  ...existing,
                  ...a,
                  playerUrl: existing.playerUrl || a.playerUrl,
                  imageUrl: a.imageUrl || existing.imageUrl,
                  backdropUrl: a.backdropUrl || existing.backdropUrl
                });
              } else {
                combinedMap.set(a.id, a);
              }
            });
            availableAnimes = Array.from(combinedMap.values()).filter(a => 
              WATCHPLAY_ANIME_IDS.includes(a.id) && isMediaAvailable(a)
            );
          }

          if (availableAnimes.length > 0) {
            setAnimeReleases(availableAnimes);
          }
        }

        if (isMounted) {
          // Apenas os doramas confirmados como disponíveis no Watchplay
          let availableDoramas = [...doramas];

          if (doramasRes?.results && doramasRes.results.length > 0) {
            const tmdbFiltered = doramasRes.results
              .filter((d: TMDBItem) => d.poster_path && (d.name || d.title) && WATCHPLAY_DORAMA_IDS.includes(d.id))
              .map((d: TMDBItem) => ({
                id: d.id,
                tmdbId: d.id,
                title: (d.name || d.title || "").toUpperCase(),
                imageUrl: formatImageUrl(d.poster_path, 'w500'),
                backdropUrl: formatImageUrl(d.backdrop_path, 'original'),
                type: 'series' as const,
                quality: "HD" as const,
                isDorama: true,
                rating: d.vote_average ? d.vote_average.toFixed(1) : undefined,
                year: d.first_air_date ? d.first_air_date.substring(0, 4) : "2026",
                playerUrl: `https://v1.watchplay.shop/tvshow/${d.id}/1/1`
              }));

            if (tmdbFiltered.length > 0) {
              const combinedMap = new Map<number, any>();
              // Carrega a base padrão de doramas confirmados do Watchplay
              doramas.forEach(d => combinedMap.set(d.id, d));
              // Atualiza com metadados frescos do TMDB quando disponíveis
              tmdbFiltered.forEach(d => combinedMap.set(d.id, d));
              availableDoramas = Array.from(combinedMap.values()).filter(d => WATCHPLAY_DORAMA_IDS.includes(d.id));
            }
          }

          if (availableDoramas.length > 0) {
            setDoramaReleases(availableDoramas);
          }
        }
      } catch (err) {
        console.error("Erro ao sincronizar lançamentos automáticos com TMDB:", err);
      }
    };

    // Busca do Top 10 Mais Assistidos da plataforma (decidido pelos usuários)
    const fetchMostWatched = async () => {
      try {
        const res = await fetch("/api/most-watched");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && Array.isArray(data.items) && data.items.length > 0) {
            setMostWatchedItems(data.items);
          }
        }
      } catch (err) {
        console.error("Erro ao carregar mais assistidos dos usuários:", err);
      }
    };

    fetchTopTrending();
    fetchReleases();
    fetchMostWatched();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      {/* FEATURED / HERO SECTION */}
      <section 
        onTouchStart={handleHeroTouchStart}
        onTouchMove={handleHeroTouchMove}
        onTouchEnd={handleHeroTouchEnd}
        className="relative w-full min-h-[85vh] md:min-h-[88vh] lg:min-h-[92vh] flex flex-col justify-end flex-shrink-0 select-none group/hero touch-pan-y"
      >
        {/* Background Image with smooth transition */}
        <div
          key={heroItem.id}
          className="absolute inset-0 bg-cover bg-[center_top] md:bg-top bg-no-repeat transition-all duration-700 ease-out"
          style={{ backgroundImage: `url(${heroItem.imageUrl})` }}
        ></div>
        {/* Gradients to blend with background */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-black/40 pointer-events-none"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/90 via-[#0a0a0a]/40 to-transparent hidden md:block pointer-events-none"></div>

        {/* Botões Laterais de Navegação do Destaque (Desktop & Tablet) */}
        {heroItems.length > 1 && (
          <>
            <button
              onClick={() => setHeroIndex(prev => (prev - 1 + heroItems.length) % heroItems.length)}
              className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/60 hover:bg-orange-600 text-white items-center justify-center backdrop-blur-md border border-white/10 opacity-0 group-hover/hero:opacity-100 transition-all cursor-pointer hover:scale-110 shadow-xl"
              aria-label="Destaque anterior"
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
            </button>
            <button
              onClick={() => setHeroIndex(prev => (prev + 1) % heroItems.length)}
              className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/60 hover:bg-orange-600 text-white items-center justify-center backdrop-blur-md border border-white/10 opacity-0 group-hover/hero:opacity-100 transition-all cursor-pointer hover:scale-110 shadow-xl"
              aria-label="Próximo destaque"
            >
              <ChevronRight className="w-6 h-6 stroke-[2.5]" />
            </button>
          </>
        )}

        {/* Content (Fluxo normal relativo com mt-auto para nunca ultrapassar o topo) */}
        <div className="relative z-10 w-full flex flex-col justify-end flex-1 px-6 md:px-20 pt-28 sm:pt-32 md:pt-36 pb-8 md:pb-12">
          <div className="mt-auto flex flex-col items-center md:items-start text-center md:text-left">
            {/* Logo / Title area for Hero */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter mb-2.5 md:mb-3 leading-[0.95] drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)]">
              {heroItem.logoText.split('\n').map((line: string, i: number) => (
                <span key={i} className="block">{line}</span>
              ))}
            </h1>

            {/* Tag de Imagem de Cinema (CAM) */}
            {checkIsCam(heroItem.title, heroItem.quality) && (
              <div className="mb-3 flex items-center">
                <span className="px-3 py-1 bg-amber-500/25 text-amber-300 border border-amber-500/50 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  CAM • Imagem de Cinema
                </span>
              </div>
            )}

            {/* Meta details */}
            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm md:text-base font-medium text-neutral-300 mb-3 flex-wrap justify-center md:justify-start">
              <span>{heroItem.year}</span>
              <span className="w-1 h-1 rounded-full bg-neutral-600"></span>
              <div className="flex items-center gap-[2px]">
                <Tv className="w-4 h-4 mr-1 opacity-70" />
                <span>{heroItem.duration}</span>
              </div>
              <span className="w-1 h-1 rounded-full bg-neutral-600"></span>
              <div className="flex text-orange-500">
                <Star className="w-4 h-4 fill-orange-500" />
                <Star className="w-4 h-4 fill-orange-500" />
                <Star className="w-4 h-4 fill-orange-500" />
                <Star className="w-4 h-4 fill-orange-500" />
                <StarHalf className="w-4 h-4 fill-orange-500" />
              </div>
            </div>

            {/* Genres */}
            <div className="flex items-center gap-2 sm:gap-2.5 mb-4 md:mb-5 flex-wrap justify-center md:justify-start">
              {heroItem.genres.map((g: string) => (
                <span key={g} className="px-2.5 sm:px-3 py-1 bg-white/10 backdrop-blur-md border border-white/10 rounded-md text-xs font-semibold text-neutral-200">
                  {g}
                </span>
              ))}
            </div>

            {/* Description */}
            <p className="text-sm md:text-base lg:text-lg text-neutral-300 max-w-[90%] md:max-w-2xl leading-relaxed mb-6 md:mb-8 line-clamp-4 md:line-clamp-none">
              {heroItem.description}
            </p>

            {/* Actions & Carousel Indicators */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full">
              <div className="flex items-center gap-3 sm:gap-4 w-full md:w-auto justify-center md:justify-start max-w-full">
                <button 
                  tabIndex={0}
                  role="button"
                  data-tv-primary="true"
                  onClick={() => onPlay?.(
                    heroItem.title, 
                    heroItem.playerUrl || (heroItem.type === 'series' ? `https://v1.watchplay.shop/tvshow/${heroItem.id}/1/1` : `https://v1.watchplay.shop/movie/${heroItem.id}`),
                    heroItem.type || 'movie',
                    heroItem.id,
                    heroItem.imdbId,
                    1,
                    1,
                    heroItem.quality,
                    checkIsCam(heroItem.title, heroItem.quality),
                    undefined,
                    false,
                    heroItem.imageUrl,
                    heroItem.imageUrl,
                    heroItem.posterUrl
                  )}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 md:py-4 px-5 sm:px-8 rounded-xl transition-all shadow-[0_0_20px_rgba(234,88,12,0.4)] hover:shadow-[0_0_30px_rgba(234,88,12,0.6)] cursor-pointer text-sm md:text-base whitespace-nowrap active:scale-95"
                >
                  <Play className="w-5 h-5 fill-current shrink-0" />
                  <span>{heroItem.type === 'series' ? 'Assistir Série' : 'Assistir Filme'}</span>
                </button>
                <button 
                  tabIndex={0}
                  role="button"
                  onClick={() => onItemClick(heroItem.id, heroItem)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-neutral-800/80 hover:bg-neutral-700 backdrop-blur-md text-white font-semibold py-3 md:py-4 px-5 sm:px-8 rounded-xl transition-all border border-neutral-700 cursor-pointer text-sm md:text-base whitespace-nowrap active:scale-95"
                >
                  <Info className="w-5 h-5 shrink-0" />
                  <span>Mais Detalhes</span>
                </button>
              </div>

              {/* Indicadores de Destaques / Capas do Carrossel Hero */}
              {heroItems.length > 1 && (
                <div className="flex items-center gap-2 pt-2 md:pt-0">
                  {heroItems.map((item, idx) => (
                    <button
                      key={`hero-ind-${item.id || idx}`}
                      tabIndex={-1}
                      onClick={() => setHeroIndex(idx)}
                      className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                        idx === heroIndex 
                          ? "w-8 bg-orange-500 shadow-lg shadow-orange-500/50" 
                          : "w-2 bg-white/30 hover:bg-white/60"
                      }`}
                      aria-label={`Ir para destaque ${idx + 1}`}
                      title={item.title}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* STRIPES / CONTENT ZONES */}
      <main className="flex-1 w-full bg-[#0a0a0a] pb-24 md:pb-12 z-20 relative px-3 sm:px-4 md:px-12 space-y-10 md:space-y-12">
        {/* Providers */}
        <section className="w-full max-w-full flex justify-center">
          <div 
            className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap md:justify-center gap-2.5 sm:gap-3 md:gap-3.5 w-full items-center"
          >
            {providers.map((p) => {
              const logos: Record<string, { url: string, filter?: string, customClass?: string }> = {
                "NETFLIX": { url: "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg", customClass: "h-5 sm:h-6 md:h-7" },
                "Disney+": { 
                  url: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg",
                  filter: "brightness(0) invert(1) opacity(0.9)",
                  customClass: "h-8 sm:h-10 md:h-12"
                },
                "Max": { 
                  url: "https://upload.wikimedia.org/wikipedia/commons/c/ce/Max_logo.svg",
                  filter: "brightness(0) invert(1) opacity(0.9)",
                  customClass: "h-4 sm:h-4.5 md:h-5"
                },
                "Prime Video": { 
                  url: "https://upload.wikimedia.org/wikipedia/commons/1/11/Amazon_Prime_Video_logo.svg",
                  filter: "brightness(0) invert(1) opacity(0.9)",
                  customClass: "h-4.5 sm:h-5 md:h-6"
                },
                "Apple TV+": { 
                  url: "https://upload.wikimedia.org/wikipedia/commons/2/28/Apple_TV_Plus_Logo.svg",
                  filter: "brightness(0) invert(1) opacity(0.9)",
                  customClass: "h-5 sm:h-5.5 md:h-6.5"
                },
                "Paramount+": { 
                  url: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Paramount_Plus.svg",
                  filter: "brightness(0) invert(1) opacity(0.95)",
                  customClass: "h-5 sm:h-5.5 md:h-6.5"
                },
              };

              const logoInfo = logos[p];

              return (
                <button
                  key={p}
                  tabIndex={0} role="button" onClick={() => onProviderSelect(p)}
                  className={`group w-full md:w-[135px] lg:w-[150px] xl:w-[160px] h-14 sm:h-16 md:h-18 lg:h-20 px-3 sm:px-4 md:px-5 backdrop-blur-md border rounded-xl sm:rounded-2xl flex items-center justify-center transition-all bg-white/5 hover:bg-white/10 border-white/5 hover:border-orange-500/30 cursor-pointer shadow-sm active:scale-95`}
                >
                  {logoInfo ? (
                    <img 
                      src={logoInfo.url} 
                      alt={p} 
                      loading="lazy"
                      decoding="async"
                      className={`${logoInfo.customClass || "h-5 md:h-7"} object-contain transition-transform duration-300 group-hover:scale-110`}
                      style={{ filter: logoInfo.filter }} 
                    />
                  ) : (
                    <span className="font-black text-lg text-neutral-300 tracking-tight">{p}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Destaque TV Ao Vivo & Futebol */}
        {onNavigateToLiveTv && (
          <section className="relative rounded-3xl overflow-hidden border border-orange-500/25 bg-gradient-to-r from-neutral-950 via-neutral-900 to-orange-950/40 p-6 md:p-8 shadow-2xl group">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-4 md:gap-5">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-500 shrink-0 shadow-lg shadow-orange-600/20 group-hover:scale-105 transition-transform">
                  <Radio className="w-7 h-7 text-red-500 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full bg-red-600 text-white tracking-widest shadow-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                      AO VIVO
                    </span>
                    <h3 className="text-white font-black text-lg md:text-xl tracking-tight">
                      TV Ao Vivo & Esportes
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                      Premiere • SporTV • CazéTV
                    </span>
                  </div>
                  <p className="text-xs md:text-sm text-neutral-400 max-w-xl leading-relaxed">
                    Acompanhe partidas de futebol ao vivo, transmissões do Brasileirão, canais abertos, notícias e programação 24h com múltiplos servidores de alta performance.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <button
                  onClick={onNavigateToLiveTv}
                  className="flex-1 md:flex-initial flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs md:text-sm transition-all shadow-lg shadow-orange-600/30 hover:scale-105 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Assistir TV Ao Vivo
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Continue Assistindo */}
        {continueWatchingList.length > 0 && (
          <section>
            <div className="flex items-center mb-6 pl-2">
              <h2 className="text-xl md:text-2xl font-bold text-white border-l-4 border-orange-500 pl-2">Continue Assistindo</h2>
            </div>
            <div 
              style={{ touchAction: "pan-y pan-x pinch-zoom" }}
              className="flex gap-4 md:gap-6 overflow-x-auto overflow-y-hidden snap-x snap-mandatory pt-5 pb-8 pl-5 pr-8 sm:pl-6 sm:pr-10 scroll-pl-5 scroll-pr-8 sm:scroll-pl-6 sm:scroll-pr-10 scrollbar-hide select-none cursor-grab active:cursor-grabbing"
            >
              {continueWatchingList.map((item, idx) => (
                <div 
                  key={`cw-${item.id}-${idx}`} 
                  tabIndex={0} 
                  role="button" 
                  onClick={() => {
                    if (item.currentTime !== undefined && onPlay) {
                      onPlay(
                        item.title,
                        item.playerUrl,
                        item.mediaType || 'movie',
                        item.tmdbId,
                        item.imdbId,
                        item.season,
                        item.episodeNumber,
                        item.quality,
                        item.isCam,
                        item.currentTime,
                        true, // Auto-fullscreen imediato
                        item.imageUrl,
                        item.backdropUrl,
                        item.posterUrl
                      );
                    } else if (onPlay) {
                      // Fallback estático
                      onPlay(
                        item.title,
                        item.playerUrl,
                        item.title.includes("STRANGER") ? 'series' : 'movie',
                        item.tmdbId,
                        item.imdbId,
                        item.title.includes("STRANGER") ? 4 : undefined,
                        item.title.includes("STRANGER") ? 1 : undefined,
                        undefined,
                        false,
                        item.progress ? 45 * 60 : undefined,
                        true, // Auto-fullscreen imediato
                        item.imageUrl
                      );
                    } else {
                      onItemClick(item.id);
                    }
                  }} 
                  className="snap-start shrink-0 relative group cursor-pointer w-[280px] md:w-[320px] h-[160px] md:h-[180px] rounded-xl overflow-hidden shadow-lg border border-neutral-800/80 group-hover:border-orange-500/50 transition-all outline-none"
                >
                  <img 
                    src={item.imageUrl} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    loading="lazy" 
                    onError={(e) => handlePosterError(e, (item as any).backdropUrl)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none"></div>

                  {/* Botão X para remover do Continue Assistindo */}
                  <button
                    type="button"
                    onClick={(e) => handleRemoveHistoryItem(e, item)}
                    title="Remover do Continue Assistindo"
                    aria-label="Remover do Continue Assistindo"
                    className="absolute top-2.5 right-2.5 z-30 w-7 h-7 md:w-8 md:h-8 rounded-full bg-black/60 hover:bg-red-600/90 text-white/80 hover:text-white flex items-center justify-center backdrop-blur-md border border-white/10 hover:border-red-500/50 transition-all duration-200 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 hover:scale-110 shadow-lg cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  </button>
                  
                  {/* Play Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 pointer-events-none">
                    <div className="w-12 h-12 bg-orange-600/90 rounded-full flex items-center justify-center backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all shadow-[0_0_15px_rgba(234,88,12,0.5)]">
                      <Play className="w-5 h-5 fill-white text-white ml-1" />
                    </div>
                  </div>

                  <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
                    <div className="flex justify-between items-end mb-2">
                      <div className="truncate mr-2">
                        <h3 className="font-bold text-white text-base md:text-lg drop-shadow-md truncate">{item.title}</h3>
                        <p className="text-neutral-300 text-xs mt-0.5 drop-shadow-md truncate">{item.episode}</p>
                      </div>
                      <span className="text-[11px] font-mono text-orange-400 shrink-0 font-bold">
                        {item.progress}%
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 transition-all duration-300 shadow-[0_0_8px_rgba(234,88,12,0.8)]" 
                        style={{ width: `${item.progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}


        {/* 10 Mais Assistidos (Decidido pela audiência real dos usuários) */}
        <ContentRow 
          title="10 Mais Assistidos" 
          items={mostWatchedItems} 
          isTop10 
          startNumber={1} 
          onItemClick={onItemClick} 
        />

        {/* Área Kids (Animações e Desenhos) */}
        <ContentRow 
          title="Área Kids" 
          items={displayedKidsItems} 
          aspect="portait" 
          onItemClick={onItemClick} 
        />

        {/* Lançamentos Filmes */}
        <ContentRow title="Lançamentos Filmes" items={movieReleases} aspect="portait" onItemClick={onItemClick} />

        {/* Lançamentos Séries */}
        <ContentRow title="Lançamentos Séries" items={seriesReleases} aspect="portait" onItemClick={onItemClick} />

        {/* Animes */}
        <ContentRow title="Animes" items={animeReleases} aspect="portait" onItemClick={onItemClick} />

        {/* Doramas */}
        <ContentRow title="Doramas" items={doramaReleases} aspect="portait" onItemClick={onItemClick} />
      </main>
    </>
  );
}
