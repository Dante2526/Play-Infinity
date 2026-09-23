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
  MicOff,
  Download
} from "lucide-react";
import { useVoiceSearch } from "../hooks/useVoiceSearch";
import { getAvailableEpisodes } from "../services/episodeAvailability";
import { 
  checkMovieDownloadAvailability, 
  checkEpisodeDownloadAvailability, 
  triggerDirectDownload, 
  DownloadAvailability 
} from "../services/downloadService";

import { CatalogItem, checkIsCam, WATCHPLAY_DORAMA_IDS, isMediaAvailable } from "../utils/mediaUtils";;
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
  getTrailerList,
  getSimilarRecommendations,
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

export function DetailsPage({ 
  itemId, 
  initialItem,
  onBack, 
  onItemClick,
  onPlay,
  onNavigateToCalendar
}: { 
  itemId: number, 
  initialItem?: CatalogItem,
  onBack: () => void, 
  onItemClick: (id: number, item?: CatalogItem) => void,
  onPlay?: OnPlayHandler,
  onNavigateToCalendar?: () => void,
  key?: React.Key
}) {
  const allCatalogs = React.useMemo(() => getAllCatalogItems(), []);
  const [item, setItem] = useState<CatalogItem>(() => {
    if (initialItem) return initialItem;
    return allCatalogs.find(i => i.id === itemId) || allCatalogs[0];
  });
  
  const [tmdbDetails, setTmdbDetails] = useState<TMDBDetails | null>(null);
  const [tmdbSimilar, setTmdbSimilar] = useState<CatalogItem[]>([]);
  const [loadingTmdb, setLoadingTmdb] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonData, setSeasonData] = useState<Season | null>(null);
  const [loadingSeason, setLoadingSeason] = useState<boolean>(false);
  const commentTargetId = item.tmdbId || item.id || itemId;
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<CommentItem[]>(() => getCommentsForItem(commentTargetId));

  // Sincronizar item e dados quando itemId ou initialItem mudarem
  useEffect(() => {
    if (initialItem) {
      setItem(initialItem);
    } else {
      const found = allCatalogs.find(i => i.id === itemId);
      if (found) setItem(found);
    }
  }, [itemId, initialItem, allCatalogs]);

  useEffect(() => {
    setComments(getCommentsForItem(commentTargetId));
  }, [commentTargetId]);
  const [isFavorite, setIsFavorite] = useState<boolean>(() => isItemFavorite(itemId));
  const [, setWatchedUpdateTick] = useState(0);
  const [trailerVideo, setTrailerVideo] = useState<TrailerVideo | null>(null);
  const [trailerVideosList, setTrailerVideosList] = useState<TrailerVideo[]>([]);
  const [selectedTrailerIndex, setSelectedTrailerIndex] = useState<number>(0);
  const [isTrailerModalOpen, setIsTrailerModalOpen] = useState<boolean>(false);
  const [loadingTrailer, setLoadingTrailer] = useState<boolean>(false);
  const [movieDownloadInfo, setMovieDownloadInfo] = useState<DownloadAvailability | null>(null);
  const [isCheckingDownload, setIsCheckingDownload] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [episodeDownloads, setEpisodeDownloads] = useState<Record<number, DownloadAvailability>>({});
  const [downloadingEp, setDownloadingEp] = useState<number | null>(null);

  // Garante que a página de detalhes sempre abra exatamente no topo absoluto (0, 0)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [itemId]);

  // Sincronizar episódios assistidos
  useEffect(() => {
    const handleWatchedUpdate = () => setWatchedUpdateTick(t => t + 1);
    window.addEventListener("playinfinity:watched_updated", handleWatchedUpdate);
    return () => {
      window.removeEventListener("playinfinity:watched_updated", handleWatchedUpdate);
    };
  }, []);

  // Sincronizar estado de favoritos
  useEffect(() => {
    setIsFavorite(isItemFavorite(itemId));

    const handleFavUpdate = (e: any) => {
      const ids: number[] = e.detail || getFavoriteIds();
      setIsFavorite(ids.includes(itemId));
    };

    window.addEventListener("playinfinity:favorites_updated", handleFavUpdate);
    return () => {
      window.removeEventListener("playinfinity:favorites_updated", handleFavUpdate);
    };
  }, [itemId]);

  const handleToggleFavorite = () => {
    const newState = toggleFavorite(itemId);
    setIsFavorite(newState);
  };

  // Carregar dados estendidos do TMDB e Trailer Oficial caso disponível
  React.useEffect(() => {
    let isMounted = true;
    const loadDetails = async () => {
      const targetId = item.tmdbId || item.id;
      if (!targetId || isNaN(Number(targetId))) return;
      try {
        setLoadingTmdb(true);
        setLoadingTrailer(true);

        const [details, trailers, recommendations] = await Promise.all([
          getDetails(Number(targetId), item.type === 'series' ? 'tv' : 'movie').catch(() => null),
          getTrailerList(Number(targetId), item.type === 'series' ? 'tv' : 'movie').catch(() => []),
          getSimilarRecommendations(Number(targetId), item.type === 'series' ? 'tv' : 'movie').catch(() => null)
        ]);

        if (isMounted) {
          if (Array.isArray(trailers) && trailers.length > 0) {
            setTrailerVideosList(trailers);
            setTrailerVideo(trailers[0]);
            setSelectedTrailerIndex(0);
          } else {
            setTrailerVideosList([]);
            setTrailerVideo(null);
          }

          if (recommendations && Array.isArray(recommendations.results) && recommendations.results.length > 0) {
            const formattedRecs: CatalogItem[] = recommendations.results
              .filter((r: any) => r.poster_path && r.id !== Number(targetId))
              .slice(0, 10)
              .map((r: any) => ({
                id: r.id,
                tmdbId: r.id,
                title: r.title || r.name || 'Título Semelhante',
                type: (r.media_type === 'tv' || item.type === 'series') ? 'series' : 'movie',
                imageUrl: formatImageUrl(r.poster_path, 'w500'),
                posterUrl: formatImageUrl(r.poster_path, 'w500'),
                backdropUrl: r.backdrop_path ? formatImageUrl(r.backdrop_path, 'original') : formatImageUrl(r.poster_path, 'w500'),
                synopsis: r.overview || '',
                year: r.release_date ? parseInt(r.release_date.substring(0, 4)) : r.first_air_date ? parseInt(r.first_air_date.substring(0, 4)) : 2024,
                rating: r.vote_average ? `${r.vote_average.toFixed(1)} ★` : '8.5 ★',
                genres: [],
                match: Math.round((r.vote_average || 8) * 10)
              }));
            setTmdbSimilar(formattedRecs);
          } else {
            setTmdbSimilar([]);
          }

          setLoadingTrailer(false);
        }

        if (isMounted && details && !('status_code' in (details as any))) {
          setTmdbDetails(details);
          // Enriquecer item se faltar sinopse ou imagens
          setItem(prev => ({
            ...prev,
            title: details.title || details.name || prev.title,
            synopsis: details.overview || prev.synopsis,
            backdropUrl: details.backdrop_path ? formatImageUrl(details.backdrop_path, 'original') : prev.backdropUrl,
            posterUrl: details.poster_path ? formatImageUrl(details.poster_path, 'w500') : prev.posterUrl,
            year: details.release_date ? parseInt(details.release_date.substring(0, 4)) : details.first_air_date ? parseInt(details.first_air_date.substring(0, 4)) : prev.year,
            rating: details.vote_average ? `${details.vote_average.toFixed(1)} ★` : prev.rating,
            genres: details.genres ? details.genres.map(g => g.name) : prev.genres,
            imdbId: details.imdb_id || prev.imdbId,
            isAnime: Boolean(
              prev.isAnime || 
              initialItem?.isAnime || 
              (details.genres?.some((g: any) => g.id === 16 || g.name?.toLowerCase().includes("anima")) &&
               (details.origin_country?.includes("JP") || details.original_language === "ja"))
            )
          }));
        }
      } catch (err) {
        console.warn("Erro ao buscar detalhes no TMDB:", err);
      } finally {
        if (isMounted) {
          setLoadingTmdb(false);
          setLoadingTrailer(false);
        }
      }
    };
    loadDetails();
    return () => { isMounted = false; };
  }, [itemId, item.tmdbId]);

  // Verificar disponibilidade de download para filmes via MixDrop
  useEffect(() => {
    let active = true;
    if (item.type === 'movie') {
      const targetId = Number(item.tmdbId || item.id);
      if (targetId && !isNaN(targetId)) {
        setIsCheckingDownload(true);
        checkMovieDownloadAvailability(targetId, item.title)
          .then(res => {
            if (active) {
              setMovieDownloadInfo(res);
              setIsCheckingDownload(false);
            }
          })
          .catch(() => {
            if (active) setIsCheckingDownload(false);
          });
      }
    } else {
      setMovieDownloadInfo(null);
    }
    return () => { active = false; };
  }, [item.type, item.id, item.tmdbId, item.title]);

  const isSeries = item.type === 'series';
  const effectiveTmdbId = item.tmdbId || item.id;
  const isAnimeItem = Boolean(item.isAnime || initialItem?.isAnime);
  const isDoramaItem = Boolean(item.isDorama || initialItem?.isDorama);

  // Lista de temporadas disponíveis vindas do TMDB (ou fallback para [1, 2, 3, 4])
  const availableSeasons = React.useMemo(() => {
    if (tmdbDetails?.seasons && tmdbDetails.seasons.length > 0) {
      const valid = tmdbDetails.seasons
        .filter(s => s.season_number > 0 && s.episode_count > 0)
        .map(s => s.season_number);
      if (valid.length > 0) {
        return Array.from(new Set(valid)).sort((a: number, b: number) => a - b);
      }
    }
    return [1, 2, 3, 4];
  }, [tmdbDetails]);

  // Se a temporada selecionada não existir na lista, seleciona a primeira disponível
  useEffect(() => {
    if (availableSeasons.length > 0 && !availableSeasons.includes(selectedSeason)) {
      setSelectedSeason(availableSeasons[0]);
    }
  }, [availableSeasons, selectedSeason]);

  const [verifiedAvailableEpisodes, setVerifiedAvailableEpisodes] = React.useState<number[] | null>(null);

  // Buscar episódios reais da temporada selecionada no TMDB sempre que mudar série ou temporada
  useEffect(() => {
    if (!isSeries || !effectiveTmdbId || isNaN(Number(effectiveTmdbId))) return;
    let isMounted = true;
    setLoadingSeason(true);
    setVerifiedAvailableEpisodes(null);

    getSeasonDetails(Number(effectiveTmdbId), selectedSeason)
      .then(data => {
        if (isMounted && data && !('status_code' in (data as any))) {
          setSeasonData(data);
          const totalCount = data.episodes?.length || 24;
          getAvailableEpisodes(Number(effectiveTmdbId), selectedSeason, totalCount)
            .then(availList => {
              if (isMounted && Array.isArray(availList) && availList.length > 0) {
                setVerifiedAvailableEpisodes(availList);
              }
            })
            .catch(() => {});
        }
      })
      .catch(err => {
        console.warn(`[DetailsPage] Erro ao carregar episódios da T${selectedSeason}:`, err);
      })
      .finally(() => {
        if (isMounted) setLoadingSeason(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isSeries, effectiveTmdbId, selectedSeason]);

  // Lista dinâmica de episódios formatados da temporada atual com streaming comprovado
  const currentEpisodes = React.useMemo(() => {
    if (seasonData?.episodes && seasonData.episodes.length > 0) {
      let eps = seasonData.episodes;
      if (verifiedAvailableEpisodes && Array.isArray(verifiedAvailableEpisodes)) {
        eps = eps.filter(ep => verifiedAvailableEpisodes.includes(ep.episode_number));
      }
      return eps.map(ep => ({
        ep: ep.episode_number,
        name: ep.name && ep.name.trim() !== "" ? ep.name : `Episódio ${ep.episode_number}`,
        duration: (ep as any).runtime ? `${(ep as any).runtime}m` : "24m",
        desc: ep.overview && ep.overview.trim() !== ""
          ? ep.overview
          : `Acompanhe o episódio ${ep.episode_number} da Temporada ${selectedSeason} de ${item.title}.`,
        stillPath: ep.still_path ? formatImageUrl(ep.still_path, 'w300') : null
      }));
    }

    // Fallback dinâmico caso a API falhe ou ainda esteja carregando
    const count = seasonData?.episode_count || tmdbDetails?.seasons?.find(s => s.season_number === selectedSeason)?.episode_count || 6;
    const baseCount = verifiedAvailableEpisodes?.length || Math.min(count, 50);
    return Array.from({ length: baseCount }, (_, idx) => {
      const epNum = verifiedAvailableEpisodes ? verifiedAvailableEpisodes[idx] : idx + 1;
      return {
        ep: epNum,
        name: `Episódio ${epNum}`,
        duration: "45m",
        desc: `Acompanhe o episódio ${epNum} da Temporada ${selectedSeason} de ${item.title}.`,
        stillPath: null
      };
    });
  }, [seasonData, verifiedAvailableEpisodes, selectedSeason, item.title, tmdbDetails]);

  // Verificar disponibilidade de download dos episódios visíveis via MixDrop
  useEffect(() => {
    let active = true;
    if (!isSeries || !effectiveTmdbId) return;

    const tmdbNum = Number(effectiveTmdbId);
    if (!tmdbNum || isNaN(tmdbNum)) return;

    // Dispara checagem em background para os episódios da temporada
    const epNumbers = currentEpisodes.map(e => e.ep);
    if (epNumbers.length === 0) return;

    // Checamos em lote suave para não sobrecarregar
    epNumbers.forEach(async (epNum) => {
      try {
        const avail = await checkEpisodeDownloadAvailability(tmdbNum, selectedSeason, epNum, item.title);
        if (active && avail.available) {
          setEpisodeDownloads(prev => ({
            ...prev,
            [epNum]: avail
          }));
        }
      } catch (_) {}
    });

    return () => { active = false; };
  }, [isSeries, effectiveTmdbId, selectedSeason, currentEpisodes, item.title]);

  const totalSeasonEpisodes = currentEpisodes.length;

  // URL de reprodução: Aponta para WatchPlayer com skin Netflix e autoplay
  const targetPlayerUrl = isSeries
    ? (item.playerUrl || `https://v1.watchplay.shop/tvshow/${effectiveTmdbId}/${selectedSeason}/1`)
    : (item.playerUrl || `https://v1.watchplay.shop/movie/${item.imdbId || effectiveTmdbId}`);

  const synopsis = item.synopsis || "Uma experiência cinematográfica envolvente com alta definição e elenco renomado.";
  const year = item.year || 2024;
  const rating = item.rating || "14";
  const duration = item.duration || (item.type === 'movie' ? "1h 55m" : "1 Temporada");
  const match = item.match || 94;
  const displayBackdrop = item.backdropUrl || item.imageUrl;
  const displayPoster = item.posterUrl || item.imageUrl;

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const added = addComment(commentTargetId, commentText, "Você");
    if (added) {
      setComments(getCommentsForItem(commentTargetId));
      setCommentText("");
    }
  };

  const handleToggleLike = (commentId: string | number) => {
    const updated = toggleCommentLike(commentTargetId, commentId);
    setComments(updated);
  };

  const currentGenres: string[] = Array.isArray(item.genres) && item.genres.length > 0
    ? item.genres
    : Array.isArray(tmdbDetails?.genres)
      ? tmdbDetails.genres.map(g => g.name)
      : [];

  const similarItems = React.useMemo(() => {
    const list: CatalogItem[] = [];
    const seenIds = new Set<number>([item.id, Number(item.tmdbId)]);

    // 1. Recomendações TMDB diretas para este título
    for (const sim of tmdbSimilar) {
      if (!seenIds.has(sim.id)) {
        seenIds.add(sim.id);
        list.push(sim);
      }
    }

    // 2. Mídias do catálogo local com mesmo gênero e tipo
    for (const cat of allCatalogs) {
      if (!seenIds.has(cat.id) && isMediaAvailable(cat)) {
        const catGenres = Array.isArray(cat.genres) ? cat.genres : [];
        if (currentGenres.length > 0 && catGenres.some(g => currentGenres.includes(g))) {
          seenIds.add(cat.id);
          list.push(cat);
        } else if (cat.type === item.type) {
          seenIds.add(cat.id);
          list.push(cat);
        }
      }
    }

    // 3. Fallback com outros itens disponíveis
    if (list.length < 6) {
      for (const cat of allCatalogs) {
        if (!seenIds.has(cat.id) && isMediaAvailable(cat)) {
          seenIds.add(cat.id);
          list.push(cat);
          if (list.length >= 6) break;
        }
      }
    }

    return list.slice(0, 6);
  }, [tmdbSimilar, allCatalogs, item.id, item.tmdbId, item.type, currentGenres]);

  const handleSimilarClick = (sim: CatalogItem) => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    onItemClick(sim.id, sim);
  };

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen bg-[#0a0a0a] animate-in fade-in duration-500">
      
      {/* Hero Cover Cinematográfico */}
      <div className="relative w-full h-[70vh] md:h-[80vh] 2xl:h-[85vh] group overflow-hidden">
        <img 
          src={displayBackdrop} 
          alt={item.title} 
          decoding="async"
          className="w-full h-full object-cover object-center scale-105 transition-transform duration-1000" 
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = FALLBACK_BACKDROP;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent"></div>
        
        {/* Back Button */}
        <button 
          onClick={onBack}
          className="absolute top-20 left-4 md:top-24 md:left-12 z-40 flex items-center gap-2 text-xs md:text-sm font-bold text-white px-4 py-2.5 rounded-full bg-black/70 hover:bg-orange-600 border border-white/15 hover:border-orange-500 shadow-2xl backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer group"
          title="Voltar para a página anterior"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Voltar</span>
        </button>

        {/* Informações do Filme/Série sobre o Hero */}
        <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-end px-4 py-10 md:px-12 md:py-16 z-10 mx-auto max-w-7xl">
          <div className="max-w-4xl">
            {/* Tag TMDB / Tipo */}
            <div className="flex items-center gap-2.5 mb-4 flex-wrap">
              <span className="px-3 py-1 bg-orange-600/30 text-orange-400 border border-orange-500/40 rounded-full text-xs font-black tracking-wider uppercase">
                {isSeries ? 'Série Oficial' : 'Filme Oficial'}
              </span>
              {isDoramaItem && (
                <span className="px-3 py-1 bg-pink-600/30 text-pink-400 border border-pink-500/40 rounded-full text-xs font-black tracking-wider uppercase">
                  Dorama Coreano
                </span>
              )}
              {checkIsCam(item.title, item.quality) && (
                <span className="px-3 py-1 bg-amber-500/25 text-amber-300 border border-amber-500/50 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  CAM • Imagem de Cinema
                </span>
              )}
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white tracking-tighter uppercase drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)] leading-[0.95] mb-5">
              {item.title}
            </h1>

            {/* Metadados */}
            <div className="flex flex-wrap items-center gap-3 md:gap-4 text-sm md:text-base font-semibold text-neutral-200 mb-6 drop-shadow-md">
              <span className="text-orange-500 font-bold flex items-center gap-1">
                <Star className="w-4 h-4 fill-orange-500" />
                {match}% Relevante
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600"></span>
              <span>{year}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600"></span>
              <span className="px-2 py-0.5 border border-neutral-600 rounded text-xs text-neutral-300 font-bold">{rating}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600"></span>
              <span>{duration}</span>
              {item.provider && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-600"></span>
                  <span className="text-xs uppercase tracking-wider text-neutral-400">{item.provider}</span>
                </>
              )}
            </div>

            {/* Ações de Reprodução */}
            <div className="flex items-center gap-3 md:gap-4 flex-wrap mb-2">
              <button 
                onClick={() => onPlay?.(
                  item.title, 
                  targetPlayerUrl,
                  item.type,
                  effectiveTmdbId ? Number(effectiveTmdbId) : undefined,
                  item.imdbId,
                  selectedSeason,
                  1,
                  item.quality,
                  checkIsCam(item.title, item.quality),
                  undefined,
                  false,
                  item.imageUrl || displayPoster,
                  item.backdropUrl || displayBackdrop,
                  item.posterUrl || displayPoster,
                  isAnimeItem
                )}
                className="flex items-center justify-center gap-3 bg-orange-600 hover:bg-orange-500 text-white font-bold py-3.5 md:py-4 px-8 md:px-10 rounded-full transition-all text-base md:text-lg shadow-[0_0_25px_rgba(234,88,12,0.5)] cursor-pointer hover:scale-105 active:scale-95"
              >
                <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" />
                {isSeries ? `Assistir Temporada ${selectedSeason}` : 'Assistir Filme'}
              </button>

              {/* Botão Baixar Filme (Disponível via MixDrop + Oracle VPS) */}
              {!isSeries && movieDownloadInfo?.available && movieDownloadInfo.directDownloadUrl && (
                <button
                  type="button"
                  onClick={() => {
                    if (!movieDownloadInfo.directDownloadUrl) return;
                    setIsDownloading(true);
                    triggerDirectDownload(movieDownloadInfo.directDownloadUrl, movieDownloadInfo.fileName, {
                      tmdbId: item.tmdbId || item.id || itemId,
                      title: item.title,
                      type: "movie",
                      posterUrl: item.posterUrl || item.imageUrl,
                      backdropUrl: item.backdropUrl,
                      quality: item.quality || "HD"
                    });
                    setTimeout(() => setIsDownloading(false), 4000);
                  }}
                  disabled={isDownloading}
                  className="flex items-center justify-center gap-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 font-bold py-3.5 md:py-4 px-6 md:px-8 rounded-full transition-all text-sm md:text-base border border-blue-500/40 hover:border-blue-500/70 cursor-pointer backdrop-blur-md hover:scale-105 active:scale-95 shadow-lg group"
                  title="Baixar filme em alta definição direto para o seu dispositivo via MixDrop"
                >
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin text-blue-400" />
                  ) : (
                    <Download className="w-4 h-4 md:w-5 md:h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                  )}
                  <span>{isDownloading ? "Iniciando..." : "Baixar Filme"}</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-black uppercase tracking-wider">
                    HD
                  </span>
                </button>
              )}

              {/* Botão Assistir Trailer */}
              {(trailerVideosList.length > 0 || trailerVideo) && (() => {
                const activeTrailer = trailerVideosList[selectedTrailerIndex] || trailerVideo;
                if (!activeTrailer) return null;
                return (
                  <button 
                    tabIndex={0} 
                    role="button" 
                    onClick={() => setIsTrailerModalOpen(true)}
                    className="flex items-center justify-center gap-2.5 bg-white/10 hover:bg-white/20 text-white font-bold py-3.5 md:py-4 px-6 md:px-8 rounded-full transition-all text-sm md:text-base border border-white/20 hover:border-white/40 cursor-pointer backdrop-blur-md hover:scale-105 active:scale-95 shadow-lg group"
                    title="Assistir trailer oficial em alta definição"
                  >
                    <Film className="w-4 h-4 md:w-5 md:h-5 text-orange-400 group-hover:scale-110 transition-transform" />
                    <span>Trailer</span>
                    {activeTrailer.isDubbed ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider">
                        Dublado
                      </span>
                    ) : activeTrailer.isSubtitled ? (
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-black uppercase tracking-wider">
                        Legendado
                      </span>
                    ) : null}
                  </button>
                );
              })()}

              <button 
                onClick={handleToggleFavorite}
                className={`w-12 h-12 md:w-14 md:h-14 shrink-0 flex items-center justify-center rounded-full transition-all border backdrop-blur-md cursor-pointer ${isFavorite ? 'bg-orange-600/30 border-orange-500 text-orange-500 shadow-[0_0_20px_rgba(234,88,12,0.4)]' : 'bg-neutral-900/60 hover:bg-neutral-800 border-white/10 text-neutral-400 hover:text-white'}`}
                title={isFavorite ? "Remover dos Favoritos / Deixar de Seguir" : "Adicionar aos Favoritos e Calendário"}
              >
                {isFavorite ? <BookmarkCheck className="w-5 h-5 md:w-6 md:h-6 fill-current" /> : <Bookmark className="w-5 h-5 md:w-6 md:h-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal / Colunas */}
      <div className="max-w-7xl mx-auto px-4 md:px-12 pb-24 w-full grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14 relative z-30 pt-8">
        
        {/* Coluna Esquerda: Poster oficial e detalhes completos */}
        <div className="lg:col-span-2 space-y-10">

          {/* BANNER DE CRONOGRAMA DE EPISÓDIOS (Se for série com agendamento) */}
          {isSeries && SERIES_EPISODE_SCHEDULE[item.id] && (
            <div className="bg-gradient-to-r from-[#171412] via-[#1a1512] to-[#121212] border border-orange-500/30 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-600/20 text-orange-500 border border-orange-500/30 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(234,88,12,0.2)]">
                  <CalendarDays className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-orange-500">
                      Agenda de Lançamentos
                    </span>
                    <span className="px-2 py-0.2 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[10px] font-semibold">
                      {SERIES_EPISODE_SCHEDULE[item.id].length} episódios programados
                    </span>
                  </div>
                  <h4 className="font-bold text-white text-base mt-0.5">
                    Próximo: {SERIES_EPISODE_SCHEDULE[item.id][0]?.episodeTitle}
                  </h4>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {SERIES_EPISODE_SCHEDULE[item.id][0]?.dayOfWeek} às {SERIES_EPISODE_SCHEDULE[item.id][0]?.airTime} • {isFavorite ? 'Série salva nos seus Favoritos' : 'Favorite a série para seguir'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
                {!isFavorite && (
                  <button
                    onClick={handleToggleFavorite}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-full bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>+ Seguir Série</span>
                  </button>
                )}
                {onNavigateToCalendar && (
                  <button
                    onClick={onNavigateToCalendar}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-full bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-[0_0_15px_rgba(234,88,12,0.3)] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Ver Calendário</span>
                  </button>
                )}
              </div>
            </div>
          )}
          
          {/* Card com Poster e Sinopse */}
          <div className="flex flex-col sm:flex-row gap-6 items-start bg-[#121212] border border-neutral-800/80 p-6 rounded-2xl shadow-xl">
            <div className="w-36 sm:w-44 shrink-0 rounded-xl overflow-hidden shadow-2xl border border-neutral-700 mx-auto sm:mx-0">
              <img 
                src={displayPoster} 
                alt={item.title} 
                loading="lazy"
                decoding="async"
                className="w-full h-auto object-cover aspect-[2/3]" 
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = FALLBACK_POSTER;
                }}
              />
            </div>
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-orange-500">Sinopse Oficial</span>
                {loadingTmdb && <Loader2 className="w-3 h-3 text-orange-500 animate-spin" />}
              </div>
              <p className="text-base sm:text-lg text-neutral-200 leading-relaxed font-normal">
                {synopsis}
              </p>
              
              <div className="flex flex-wrap gap-2 pt-2">
                {currentGenres.map(g => (
                  <span key={g} className="px-3 py-1 bg-[#1c1c1c] border border-neutral-800 rounded-lg text-xs font-medium text-neutral-300">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Se for série: Lista de Temporadas e Episódios */}
          {isSeries && (
            <div className="bg-[#121212] border border-neutral-800/80 rounded-2xl p-6 space-y-5 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-2 shrink-0">
                  <Tv className="w-5 h-5 text-orange-500" />
                  <h3 className="text-lg font-bold text-white">Episódios & Temporadas</h3>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-medium">
                    {getSeasonWatchedCount(effectiveTmdbId, selectedSeason, totalSeasonEpisodes)} de {totalSeasonEpisodes} assistidos
                  </span>
                </div>
                
                <div className="flex items-center gap-2.5 shrink-0 flex-nowrap">
                  {/* Botão Marcar Temporada como Vista (Largura padronizada sem layout shift) */}
                  <button
                    tabIndex={0} role="button" onClick={() => {
                      const fullyWatched = isSeasonFullyWatched(effectiveTmdbId, selectedSeason, totalSeasonEpisodes);
                      markSeasonWatched(effectiveTmdbId, selectedSeason, totalSeasonEpisodes, !fullyWatched);
                    }}
                    className={`min-w-[125px] justify-center px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border backdrop-blur-sm active:scale-95 ${
                      isSeasonFullyWatched(effectiveTmdbId, selectedSeason, totalSeasonEpisodes)
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                        : "bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20"
                    }`}
                    title="Marcar ou desmarcar todos os episódios desta temporada como vistos"
                  >
                    <Check className={`w-3.5 h-3.5 ${isSeasonFullyWatched(effectiveTmdbId, selectedSeason, totalSeasonEpisodes) ? "text-emerald-400 stroke-[3]" : "text-neutral-400"}`} />
                    <span>
                      {isSeasonFullyWatched(effectiveTmdbId, selectedSeason, totalSeasonEpisodes) ? `T${selectedSeason} Vista` : `Marcar T${selectedSeason}`}
                    </span>
                  </button>

                  {/* Seletor de Temporadas */}
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide bg-black/40 p-1 rounded-xl border border-white/5 max-w-full">
                    {availableSeasons.map(s => {
                      const seasonEpCount = tmdbDetails?.seasons?.find(season => season.season_number === s)?.episode_count || (s === selectedSeason ? totalSeasonEpisodes : 6);
                      const seasonDone = isSeasonFullyWatched(effectiveTmdbId, s, seasonEpCount);
                      const isCurrent = selectedSeason === s;
                      return (
                        <button
                          key={s}
                          onClick={() => setSelectedSeason(s)}
                          className={`relative px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                            isCurrent
                              ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md shadow-orange-600/30 font-extrabold'
                              : seasonDone
                                ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/50'
                                : 'text-neutral-400 hover:text-white hover:bg-white/5'
                          }`}
                          title={seasonDone ? `Temporada ${s} (Assistida)` : `Temporada ${s}`}
                        >
                          <span>T{s}</span>
                          {seasonDone && (
                            <Check className={`w-3 h-3 ${isCurrent ? "text-white" : "text-emerald-400"} stroke-[3]`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Lista de episódios da temporada selecionada */}
              {loadingSeason && (
                <div className="flex items-center justify-center py-4 text-orange-400 gap-2 text-xs font-medium bg-white/5 rounded-xl">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Carregando episódios da Temporada {selectedSeason}...</span>
                </div>
              )}

              <div className="space-y-3">
                {currentEpisodes.map(ep => {
                  const watched = isEpisodeWatched(effectiveTmdbId, selectedSeason, ep.ep);
                  const fullEpTitle = `T${selectedSeason}:E${ep.ep} ${ep.name}`;
                  return (
                    <div 
                      key={ep.ep}
                      className={`flex items-center justify-between p-3 sm:p-3.5 border rounded-xl transition-all group ${
                        watched 
                          ? "bg-[#131914] border-emerald-500/30 hover:border-emerald-500/50" 
                          : "bg-[#171717] hover:bg-[#202020] border-neutral-800/80 hover:border-orange-500/40"
                      }`}
                    >
                      <div 
                        className="flex items-center gap-3 sm:gap-3.5 flex-1 min-w-0 cursor-pointer"
                        tabIndex={0} role="button" onClick={() => {
                          const epUrl = isSeries 
                            ? `https://v1.watchplay.shop/tvshow/${effectiveTmdbId}/${selectedSeason}/${ep.ep}`
                            : `https://v1.watchplay.shop/movie/${item.imdbId || effectiveTmdbId}`;
                          onPlay?.(
                            item.title, 
                            epUrl, 
                            'series', 
                            Number(effectiveTmdbId), 
                            item.imdbId, 
                            selectedSeason, 
                            ep.ep,
                            item.quality,
                            checkIsCam(item.title, item.quality),
                            undefined,
                            false,
                            item.imageUrl || displayPoster,
                            item.backdropUrl || displayBackdrop,
                            item.posterUrl || displayPoster,
                            isAnimeItem
                          );
                        }}
                      >
                        {ep.stillPath ? (
                          <div className="relative w-16 h-11 sm:w-20 sm:h-13 rounded-lg overflow-hidden shrink-0 bg-neutral-900 border border-neutral-800">
                            <img 
                              src={ep.stillPath} 
                              alt={ep.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                            <div className={`absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              watched 
                                ? "bg-emerald-950/90 text-emerald-300 border border-emerald-500/40" 
                                : "bg-black/75 text-white backdrop-blur-xs"
                            }`}>
                              {ep.ep}
                            </div>
                          </div>
                        ) : (
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs transition-all shrink-0 border ${
                            watched 
                              ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/30" 
                              : "bg-orange-600/20 text-orange-500 border-orange-500/20 group-hover:bg-orange-600 group-hover:text-white"
                          }`}>
                            {ep.ep}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 pr-1">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-[11px] font-bold text-orange-400/90 tracking-wide">
                              T{selectedSeason}:E{ep.ep}
                            </span>
                            <h4 className={`text-sm font-bold transition-colors truncate max-w-full ${watched ? "text-neutral-300 opacity-80" : "text-white group-hover:text-orange-400"}`}>
                              {ep.name}
                            </h4>
                            {watched && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap shrink-0">
                                Assistido
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">{ep.desc}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-2 sm:ml-3">
                        <span className="text-xs text-neutral-500 hidden sm:inline mr-1">{ep.duration}</span>
                        
                        {/* Botão de marcar/desmarcar visto (Caixinha com setinha branca) */}
                        <button
                          tabIndex={0} role="button" onClick={(e) => {
                            e.stopPropagation();
                            toggleEpisodeWatched(effectiveTmdbId, selectedSeason, ep.ep);
                          }}
                          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer border active:scale-95 ${
                            watched
                              ? "bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/30"
                              : "bg-white/5 hover:bg-white/15 border-white/20 hover:border-white/40 text-white"
                          }`}
                          title={watched ? "Desmarcar como assistido" : "Marcar como assistido"}
                        >
                          <Check className="w-4 h-4 stroke-[3] text-white transition-all" />
                        </button>

                        {/* Botão de Download do Episódio (se disponível no MixDrop) */}
                        {episodeDownloads[ep.ep]?.available && episodeDownloads[ep.ep]?.directDownloadUrl && (
                          <button
                            tabIndex={0}
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const info = episodeDownloads[ep.ep];
                              if (!info?.directDownloadUrl) return;
                              setDownloadingEp(ep.ep);
                              triggerDirectDownload(info.directDownloadUrl, info.fileName, {
                                tmdbId: item.tmdbId || item.id || itemId,
                                title: item.title,
                                type: "series",
                                season: selectedSeason,
                                episode: ep.ep,
                                posterUrl: item.posterUrl || item.imageUrl,
                                backdropUrl: item.backdropUrl,
                                quality: "HD"
                              });
                              setTimeout(() => setDownloadingEp(null), 4000);
                            }}
                            disabled={downloadingEp === ep.ep}
                            className="w-8 h-8 rounded-full bg-blue-500/10 hover:bg-blue-600 flex items-center justify-center text-blue-400 hover:text-white hover:scale-105 active:scale-95 transition-all cursor-pointer border border-blue-500/30 hover:border-blue-500 shadow-sm"
                            title={`Baixar episódio ${ep.ep} em HD (MixDrop)`}
                          >
                            {downloadingEp === ep.ep ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {/* Botão de Play */}
                        <div 
                          tabIndex={0} role="button" onClick={() => {
                            const epUrl = isSeries 
                              ? `https://v1.watchplay.shop/tvshow/${effectiveTmdbId}/${selectedSeason}/${ep.ep}`
                              : `https://v1.watchplay.shop/movie/${item.imdbId || effectiveTmdbId}`;
                            onPlay?.(
                              `${item.title} - ${fullEpTitle}`, 
                              epUrl, 
                              'series', 
                              Number(effectiveTmdbId), 
                              item.imdbId, 
                              selectedSeason, 
                              ep.ep,
                              item.quality,
                              checkIsCam(item.title, item.quality),
                              undefined,
                              false,
                              item.imageUrl || displayPoster,
                              item.backdropUrl || displayBackdrop,
                              item.posterUrl || displayPoster,
                              isAnimeItem
                            );
                          }}
                          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-orange-600 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                          title="Assistir este episódio"
                        >
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seção Dedicada: Trailer Oficial */}
          {(trailerVideosList.length > 0 || trailerVideo) && (() => {
            const activeTrailer = trailerVideosList[selectedTrailerIndex] || trailerVideo;
            if (!activeTrailer) return null;
            return (
              <div id="trailer-section" className="space-y-4 pt-2">
                <div className="flex items-center gap-3 pb-2 border-b border-neutral-800/60">
                  <div className="w-10 h-10 rounded-xl bg-orange-600/20 text-orange-500 flex items-center justify-center border border-orange-500/30 shrink-0 shadow-[0_0_15px_rgba(234,88,12,0.15)]">
                    <Film className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-white font-bold text-lg">Trailer Oficial</h3>
                      {activeTrailer.isDubbed ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Dublado PT-BR
                        </span>
                      ) : activeTrailer.isSubtitled ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-black uppercase tracking-wider">
                          Legendado (PT-BR)
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-neutral-300 border border-white/10 text-[10px] font-semibold">
                          Áudio Original
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Player 16:9 Cinematográfico do YouTube */}
                <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-neutral-800 shadow-2xl group hover:border-orange-500/40 transition-all">
                  <iframe
                    key={`yt-iframe-${activeTrailer.key}`}
                    src={`https://www.youtube.com/embed/${activeTrailer.key}?autoplay=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`}
                    title={activeTrailer.name || "Trailer Oficial"}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              </div>
            );
          })()}

          {/* Comments Section */}
          <div className="space-y-6 pt-4 border-t border-neutral-800/50">
            <h3 className="text-xl font-bold text-white flex items-center gap-3">
              Comentários da Comunidade <span className="text-neutral-500 font-medium text-base">({comments.length})</span>
            </h3>
            
            <form onSubmit={handleCommentSubmit} className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-600 to-orange-400 flex items-center justify-center font-bold text-base shadow-lg shrink-0 text-white">
                V
              </div>
              <div className="flex-1 relative">
                <textarea 
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Deixe sua avaliação sobre o filme ou série..."
                  className="w-full bg-[#141414] border border-neutral-800 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-all placeholder:text-neutral-600 resize-none h-20"
                ></textarea>
                <div className="flex justify-end mt-2">
                  <button 
                    type="submit" 
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${commentText.trim() ? 'bg-orange-600 text-white cursor-pointer' : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'}`}
                  >
                    <Send className="w-3 h-3" /> Publicar
                  </button>
                </div>
              </div>
            </form>

            <div className="space-y-4 pt-2">
              {comments.map(c => (
                <div key={c.id} className="flex gap-4 p-4 rounded-xl bg-[#121212] border border-neutral-800/60 hover:border-neutral-700/80 transition-all group">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-orange-600/30 to-amber-600/20 text-orange-400 flex items-center justify-center font-bold shrink-0 text-sm border border-orange-500/30 shadow-inner">
                    {c.avatarLetter || c.user.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{c.user}</span>
                        <span className="text-xs text-neutral-500">{c.timeAgo || "recentemente"}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleLike(c.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          c.likedByUser 
                            ? "text-orange-500 bg-orange-600/15 border border-orange-500/30" 
                            : "text-neutral-500 hover:text-neutral-300 hover:bg-white/5 border border-transparent"
                        }`}
                        title={c.likedByUser ? "Descurtir" : "Curtir este comentário"}
                      >
                        <ThumbsUp className={`w-3.5 h-3.5 ${c.likedByUser ? "fill-current text-orange-500" : ""}`} />
                        <span>{c.likes > 0 ? c.likes : ""}</span>
                      </button>
                    </div>
                    <p className="text-neutral-300 text-sm font-normal leading-relaxed break-words">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna Direita: Títulos Semelhantes com capas TMDB */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-[0.2em]">Títulos Semelhantes</h3>
            <span className="text-xs text-orange-500 font-semibold">TMDB</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
             {similarItems.map((sim, idx) => (
               <div 
                 key={`sim-${sim.id}-${idx}`} 
                 tabIndex={0} 
                 role="button" 
                 onClick={() => handleSimilarClick(sim)} 
                 className="relative rounded-xl overflow-hidden border border-neutral-800/80 group cursor-pointer aspect-[2/3] hover:border-orange-500/60 transition-all duration-300 shadow-lg hover:shadow-[0_0_20px_rgba(234,88,12,0.2)] hover:scale-[1.02] active:scale-95"
               >
                  <img 
                    src={sim.posterUrl || sim.imageUrl} 
                    alt={sim.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    loading="lazy" 
                    onError={(e) => handlePosterError(e, sim.backdropUrl)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
                  
                  {/* Play Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-orange-600 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                  </div>

                  <span className="absolute bottom-3 inset-x-0 mx-2 text-center font-bold text-xs uppercase text-white drop-shadow-md line-clamp-1">
                    {sim.title}
                  </span>
               </div>
             ))}
          </div>
        </div>
        
      </div>

      {/* Modal Cinematográfico de Trailer Oficial */}
      {isTrailerModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200"
          onClick={() => setIsTrailerModalOpen(false)}
        >
          <div 
            className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            {(() => {
              const activeTrailer = trailerVideosList[selectedTrailerIndex] || trailerVideo;
              return (
                <>
                  <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-neutral-800 bg-neutral-950/60 backdrop-blur-md">
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="w-8 h-8 rounded-lg bg-orange-600/20 text-orange-500 flex items-center justify-center border border-orange-500/30 shrink-0">
                        <Film className="w-4 h-4 text-orange-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-bold text-sm sm:text-base truncate">
                            {item.title} — Trailer Oficial
                          </h3>
                          {activeTrailer?.isDubbed ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase shrink-0">
                              Dublado
                            </span>
                          ) : activeTrailer?.isSubtitled ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold uppercase shrink-0">
                              Legendado
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setIsTrailerModalOpen(false)}
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95"
                        title="Fechar Trailer (Esc)"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Video Player */}
                  {activeTrailer ? (
                    <div className="relative aspect-video w-full bg-black">
                      <iframe
                        key={`modal-yt-${activeTrailer.key}`}
                        src={`https://www.youtube.com/embed/${activeTrailer.key}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`}
                        title={activeTrailer.name || "Trailer"}
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video w-full flex items-center justify-center bg-black text-neutral-400 text-sm">
                      Trailer indisponível no momento.
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
