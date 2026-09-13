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
  Bell
} from "lucide-react";
import { featured, providers, releases, newest, animes, doramas, mostWatched, continueWatching, providerCatalogs, CatalogItem, checkIsCam, WATCHPLAY_DORAMA_IDS } from "./data";
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
} from "./services/tmdb";
import { VideoPlayerModal } from "./components/VideoPlayerModal";

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

const WebhookPanelModal = lazyWithRetry(() => import("./components/WebhookPanelModal"));
const ReleaseCalendarPage = lazyWithRetry(() => import("./components/ReleaseCalendarPage"));
const LiveTvPage = lazyWithRetry(() => import("./components/LiveTvPage"));
const NotificationModal = lazyWithRetry(() => import("./components/NotificationModal"));
import {
  getFavoriteIds,
  toggleFavorite,
  isItemFavorite,
  getAllCatalogItems,
  SERIES_EPISODE_SCHEDULE,
  getScheduleForFavorites
} from "./services/favorites";
import {
  getFavoriteEpisodeNotifications,
  getReadNotificationIds
} from "./services/notifications";
import {
  isEpisodeWatched,
  toggleEpisodeWatched,
  markSeasonWatched,
  isSeasonFullyWatched,
  getSeasonWatchedCount
} from "./services/watchedEpisodes";
import { getPlaybackHistory, PlaybackHistoryItem, removePlaybackItem } from "./services/playbackHistory";
import { getCommentsForItem, addComment, toggleCommentLike, CommentItem } from "./services/comments";

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

export type OnPlayHandler = (
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

export default function App() {
  type ViewState = { 
    type: 'home' | 'movies' | 'series' | 'calendar' | 'provider' | 'search' | 'profile' | 'favorites' | 'details' | 'live-tv';
    id?: string;
    itemData?: CatalogItem;
    previous?: any;
  };

  // Smart TV Detection for Spatial Navigation
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isTV = /smarttv|tizen|webos|bravia|android tv|aftt|afts|aftm|vidaa|hisense|philips|panasonic/i.test(ua) || 
                 navigator.platform.toLowerCase().includes('tv');
    if (isTV) {
      document.body.classList.add('is-smart-tv');
      // Polyfill focus outline explicitly for standard navigation events
      document.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          document.body.classList.add('using-keyboard');
        }
      });
      document.addEventListener('mousedown', () => {
        document.body.classList.remove('using-keyboard');
      });
    }
  }, []);

  const [viewState, setViewState] = useState<ViewState>(() => {
    if (window.history.state && window.history.state.type) {
      return window.history.state;
    }
    return { type: 'home' };
  });

  const [playerModal, setPlayerModal] = useState<{
    isOpen: boolean;
    title: string;
    url?: string;
    mediaType?: 'movie' | 'series';
    tmdbId?: number;
    imdbId?: string;
    season?: number;
    episode?: number;
    quality?: string;
    isCam?: boolean;
    isAnime?: boolean;
    initialTime?: number;
    autoFullscreen?: boolean;
    imageUrl?: string;
    backdropUrl?: string;
    posterUrl?: string;
  }>({
    isOpen: false,
    title: "",
    url: "https://v1.watchplay.shop/movie/tt22084616",
  });

  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);

  // Carrega e atualiza a contagem de episódios novos das séries favoritas
  useEffect(() => {
    const updateUnread = () => {
      try {
        const favIds = getFavoriteIds();
        const notifs = getFavoriteEpisodeNotifications(favIds);
        const unread = notifs.filter(n => n.isNew).length;
        setUnreadNotificationsCount(unread);
      } catch (err) {
        console.error("Erro ao atualizar contagem de notificações:", err);
      }
    };

    updateUnread();

    window.addEventListener("playinfinity:notifications_updated", updateUnread);
    window.addEventListener("playinfinity:favorites_updated", updateUnread);
    window.addEventListener("playinfinity:watched_updated", updateUnread);

    return () => {
      window.removeEventListener("playinfinity:notifications_updated", updateUnread);
      window.removeEventListener("playinfinity:favorites_updated", updateUnread);
      window.removeEventListener("playinfinity:watched_updated", updateUnread);
    };
  }, []);

  // Sincronização com o botão de voltar e avançar nativo do navegador
  useEffect(() => {
    if (!window.history.state) {
      window.history.replaceState({ type: 'home' }, '');
    }

    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.type) {
        setViewState(e.state);
      } else {
        setViewState({ type: 'home' });
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Garante que qualquer navegação entre telas ou detalhes sempre role instantaneamente para o topo absoluto (0, 0)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [viewState.type, viewState.id]);

  const navigateTo = (newState: ViewState, replace = false) => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (replace) {
      window.history.replaceState(newState, '');
    } else {
      window.history.pushState(newState, '');
    }
    setViewState(newState);
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateTo(viewState.previous || { type: 'home' }, true);
    }
  };

  const handleToggleProfile = () => {
    if (viewState.type === 'profile' || viewState.type === 'favorites') {
      if (viewState.previous && viewState.previous.type !== 'profile' && viewState.previous.type !== 'favorites') {
        navigateTo(viewState.previous);
      } else {
        navigateTo({ type: 'home' });
      }
    } else {
      navigateTo({ type: 'profile', previous: viewState });
    }
  };

  const navigateToDetails = (id: number, itemData?: CatalogItem) => {
    navigateTo({ type: 'details', id: id.toString(), itemData, previous: viewState });
  };

  const openPlayer = (
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
  ) => {
    setPlayerModal({
      isOpen: true,
      title,
      url: url || "https://v1.watchplay.shop/movie/tt22084616",
      mediaType,
      tmdbId,
      imdbId,
      season,
      episode,
      quality,
      isCam: isCam || checkIsCam(title, quality),
      isAnime,
      initialTime,
      autoFullscreen,
      imageUrl,
      backdropUrl,
      posterUrl
    });

    // Registra reprodução para o Top 10 Mais Assistidos dos usuários
    try {
      fetch("/api/track-play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type: mediaType || "movie",
          tmdbId,
          imdbId,
          quality,
          playerUrl: url
        })
      }).catch(err => console.warn("[TrackPlay] Falha ao registrar audiência:", err));
    } catch (err) {
      console.warn("[TrackPlay] Erro ao disparar registro:", err);
    }
  };

  return (
    <div className="bg-[#0a0a0a] min-h-screen text-white font-sans flex flex-col lg:pb-0 w-full max-w-[100vw] overflow-x-hidden relative">
      {/* HEADER DESKTOP */}
      <header className="hidden lg:flex fixed top-4 lg:top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-6xl items-center justify-between px-3 lg:px-6 py-2.5 lg:py-3 bg-[#0a0a0a]/60 backdrop-blur-2xl border border-white/10 rounded-full z-50 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)]">
        <div 
          className="font-black text-lg lg:text-2xl tracking-tighter flex items-center shrink-0 ml-1 lg:ml-2 cursor-pointer"
          onClick={() => navigateTo({ type: 'home' })}
        >
          <span className="text-white">PLAY</span>
          <span className="text-orange-500 ml-1">INFINITY</span>
        </div>

        <nav className="flex items-center gap-0.5 lg:gap-1 bg-black/40 p-1 lg:p-1.5 rounded-full border border-white/5">
          <button onClick={() => navigateTo({ type: 'home' })} className={`px-3 lg:px-5 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer ${viewState.type === 'home' || viewState.type === 'provider' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}>Início</button>
          <button onClick={() => navigateTo({ type: 'movies' })} className={`px-3 lg:px-5 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer ${viewState.type === 'movies' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}>Filmes</button>
          <button onClick={() => navigateTo({ type: 'series' })} className={`px-3 lg:px-5 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer ${viewState.type === 'series' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}>Séries</button>
          <button onClick={() => navigateTo({ type: 'live-tv' })} className={`px-3 lg:px-5 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-medium transition-all flex items-center gap-1.5 lg:gap-2 cursor-pointer ${viewState.type === 'live-tv' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}>
            <span className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span className="whitespace-nowrap">TV Ao Vivo</span>
            <span className="hidden lg:inline-block text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-red-600 text-white tracking-wider">
              LIVE
            </span>
          </button>
          <button onClick={() => navigateTo({ type: 'calendar' })} className={`px-3 lg:px-5 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-medium transition-all flex items-center gap-1 lg:gap-1.5 cursor-pointer ${viewState.type === 'calendar' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}>
            <CalendarDays className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
            <span className="whitespace-nowrap">Calendário</span>
          </button>
        </nav>

        <div className="flex items-center gap-2 lg:gap-3 shrink-0 mr-1">
          <button 
            onClick={() => navigateTo({ type: 'search' })}
            className={`transition-colors p-2 lg:p-2.5 rounded-full border cursor-pointer ${viewState.type === 'search' ? 'bg-orange-600/20 text-orange-500 border-orange-500/50' : 'text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border-white/10'}`}
            title="Buscar"
          >
            <Search className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
          </button>

          {/* BOTÃO DE NOTIFICAÇÕES (DESKTOP) */}
          <button 
            onClick={() => setNotificationModalOpen(true)}
            className="relative transition-colors p-2 lg:p-2.5 rounded-full border cursor-pointer text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border-white/10 hover:border-orange-500/40"
            title="Notificações de Episódios"
          >
            <Bell className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-orange-600 text-[10px] font-black text-white shadow-lg animate-pulse">
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            )}
          </button>

          <div 
            onClick={handleToggleProfile}
            className={`w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gradient-to-tr from-orange-600 to-orange-400 border-[2px] flex items-center justify-center font-bold text-xs lg:text-sm cursor-pointer hover:scale-105 transition-all ${viewState.type === 'profile' || viewState.type === 'favorites' ? 'border-orange-500 shadow-[0_0_20px_rgba(234,88,12,0.8)]' : 'border-[#0a0a0a] shadow-[0_0_15px_rgba(234,88,12,0.4)]'}`}
            title={viewState.type === 'profile' || viewState.type === 'favorites' ? 'Fechar Perfil' : 'Meu Perfil'}
          >
            N
          </div>
        </div>
      </header>

      {/* MOBILE BRANDING ON TOP */}
      <div className="lg:hidden absolute top-4 left-0 w-full flex justify-between items-center px-4 z-50 pointer-events-none max-w-full">
        <div 
          className="font-black text-xl tracking-tighter flex items-center drop-shadow-md cursor-pointer pointer-events-auto shrink-0 select-none"
          onClick={() => navigateTo({ type: 'home' })}
        >
          <span className="text-white">PLAY</span>
          <span className="text-orange-500 ml-1">INFINITY</span>
        </div>
        
        {/* AÇÕES NO CANTO SUPERIOR DIREITO (MOBILE) */}
        <div className="pointer-events-auto shrink-0 flex items-center gap-2">
          {/* BOTÃO DE NOTIFICAÇÕES (MOBILE) */}
          <button 
            onClick={() => setNotificationModalOpen(true)}
            className="relative p-2 rounded-full bg-[#161616]/90 backdrop-blur-md border border-white/10 text-neutral-300 hover:text-white active:scale-95 transition-all shadow-md cursor-pointer"
            title="Notificações de Episódios"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-orange-600 text-[10px] font-black text-white shadow-lg animate-pulse">
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            )}
          </button>

          <div 
            onClick={handleToggleProfile}
            className={`w-9 h-9 rounded-full bg-gradient-to-tr from-orange-600 to-orange-400 border-[2px] flex items-center justify-center font-bold text-xs shadow-lg cursor-pointer transition-all active:scale-95 ${
              viewState.type === 'profile' || viewState.type === 'favorites' 
                ? 'border-white ring-2 ring-orange-500 shadow-[0_0_15px_rgba(234,88,12,0.8)] scale-105' 
                : 'border-white/20 hover:border-orange-500'
            }`}
            title={viewState.type === 'profile' || viewState.type === 'favorites' ? 'Fechar Perfil' : 'Meu Perfil'}
          >
            N
          </div>
        </div>
      </div>

      {viewState.type === 'details' && viewState.id ? (
        <DetailsPage 
          itemId={Number(viewState.id)} 
          initialItem={viewState.itemData}
          onBack={handleBack} 
          onItemClick={navigateToDetails}
          onPlay={openPlayer}
          onNavigateToCalendar={() => navigateTo({ type: 'calendar' })}
        />
      ) : viewState.type === 'provider' && viewState.id ? (
        <ProviderPage provider={viewState.id} onBack={handleBack} onItemClick={navigateToDetails} onPlay={openPlayer} />
      ) : viewState.type === 'movies' || viewState.type === 'series' ? (
        <GlobalCatalogPage type={viewState.type} onItemClick={navigateToDetails} onPlay={openPlayer} />
      ) : viewState.type === 'live-tv' ? (
        <React.Suspense fallback={<div className="flex-1 flex items-center justify-center min-h-[60vh] text-neutral-400"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>}>
          <LiveTvPage onBack={handleBack} />
        </React.Suspense>
      ) : viewState.type === 'calendar' ? (
        <React.Suspense fallback={<div className="flex-1 flex items-center justify-center min-h-[60vh] text-neutral-400"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>}>
          <ReleaseCalendarPage onItemClick={navigateToDetails} onPlay={openPlayer} onNavigateToSeries={() => navigateTo({ type: 'series' })} />
        </React.Suspense>
      ) : viewState.type === 'search' ? (
        <GlobalSearchPage onItemClick={navigateToDetails} onPlay={openPlayer} />
      ) : viewState.type === 'profile' ? (
        <UserProfilePage onNavigate={(type) => navigateTo({ type: type as any })} onItemClick={navigateToDetails} onPlay={openPlayer} />
      ) : viewState.type === 'favorites' ? (
        <FavoritesPage onBack={handleBack} onItemClick={navigateToDetails} onPlay={openPlayer} onNavigateToCalendar={() => navigateTo({ type: 'calendar' })} />
      ) : (
        <HomePage 
          onProviderSelect={(p) => navigateTo({ type: 'provider', id: p })} 
          onItemClick={navigateToDetails} 
          onPlay={openPlayer} 
          onNavigateToLiveTv={() => navigateTo({ type: 'live-tv' })}
        />
      )}

      {/* Footer Area */}
      <footer className="pt-16 pb-24 lg:pb-10 flex flex-col items-center text-center opacity-80 border-t border-neutral-900 mt-12 bg-[#0a0a0a] relative z-20">
        <div className="font-black text-4xl tracking-tighter flex items-center mb-6">
          <span className="text-neutral-500">PLAY</span>
          <span className="text-orange-500 ml-2">INFINITY</span>
        </div>
        
        <p className="text-neutral-500 text-sm max-w-md mx-auto mb-8 px-4">
          Filmes, séries e animes online grátis — atualizados todos os dias, em dublado e legendado.
        </p>

        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {[
            { label: "Início", type: "home" },
            { label: "Filmes", type: "movies" },
            { label: "Séries", type: "series" },
            { label: "TV Ao Vivo", type: "live-tv" },
            { label: "Calendário", type: "calendar" },
            { label: "Favoritos", type: "favorites" },
            { label: "Buscar", type: "search" }
          ].map(btn => (
             <button 
               key={btn.label} 
               onClick={() => navigateTo({ type: btn.type as any })}
               className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 px-5 py-2.5 rounded-full text-sm font-medium transition-colors border border-neutral-800 cursor-pointer"
             >
               {btn.label}
             </button>
          ))}
        </div>

        {/* AVISO LEGAL & COMPLIANCE DMCA */}
        <div className="w-full max-w-4xl mx-auto px-4 mt-2">
          <div className="bg-[#121212] border border-neutral-800/80 rounded-2xl p-5 sm:p-7 text-center shadow-xl">
            <div className="flex flex-col items-center justify-center mb-4 border-b border-neutral-800/80 pb-3">
              <ShieldCheck className="w-6 h-6 text-orange-500 mb-2" />
              <h3 className="text-orange-500 font-bold text-sm tracking-wide uppercase text-center max-w-xl">
                Aviso Legal & Termos de Isenção de Responsabilidade
              </h3>
              <span className="block text-xs text-orange-400/90 font-semibold mt-1 normal-case tracking-normal text-center">
                (DMCA Compliance)
              </span>
            </div>

            <div className="text-neutral-400 text-xs sm:text-[13px] leading-relaxed space-y-3 font-normal text-center">
              <p className="max-w-3xl mx-auto">
                O <strong className="text-neutral-200">Play Infinity</strong> funciona de maneira 100% equivalente a mecanismos de busca da internet (tais como Google, Bing ou DuckDuckGo). Nós <strong className="text-neutral-200">NÃO hospedamos, NÃO transmitimos, NÃO realizamos upload e NÃO armazenamos</strong> nenhum arquivo de vídeo, filme, série, transmissão de TV, áudio ou qualquer mídia protegida por direitos autorais em servidores próprios.
              </p>
              
              <p className="max-w-3xl mx-auto">
                Todo e qualquer conteúdo audiovisual apresentado, reproduzido ou referenciado nesta aplicação é disponibilizado, gerido e hospedado exclusivamente por provedores e servidores terceiros, publicamente acessíveis na rede mundial de computadores, de forma totalmente independente e fora do nosso alcance ou controle técnico.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1.5 pb-1 max-w-3xl mx-auto">
                <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-neutral-200 font-semibold text-xs mb-1">
                    <FileText className="w-4 h-4 text-orange-400" />
                    <span>Mera Indexação Pública</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-normal">
                    Nossa plataforma opera exclusivamente como um agregador e indexador de metadados e links públicos disponibilizados pela própria web aberta.
                  </p>
                </div>

                <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-neutral-200 font-semibold text-xs mb-1">
                    <ShieldCheck className="w-4 h-4 text-orange-400" />
                    <span>Conformidade com a DMCA</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-normal">
                    Respeitamos integralmente os direitos de propriedade intelectual e atuamos de boa-fé em estrita conformidade com a legislação de direitos autorais.
                  </p>
                </div>
              </div>

              <p className="text-neutral-500 text-[11px] leading-relaxed pt-1 max-w-3xl mx-auto">
                Se você é detentor dos direitos autorais de qualquer obra ou representante legal e identifica alguma irregularidade, solicitamos que entre em contato diretamente com o serviço de hospedagem terceiro responsável pela guarda física do arquivo em questão para a sua efetiva remoção da rede. Para solicitações de desindexação de metadados em nosso catálogo, consulte os canais oficiais de contato.
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* MOBILE BOTTOM NAVIGATION (FLOATING DOCK) */}
      <div className="lg:hidden fixed bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 w-[94%] max-w-sm sm:max-w-md z-50 pointer-events-none">
        <nav className="bg-[#111111]/95 backdrop-blur-2xl border border-white/10 rounded-full px-2 py-1 flex items-center justify-around shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] pointer-events-auto">
          <div className="flex items-center justify-between w-full">
            <NavItem onClick={() => navigateTo({ type: 'home' })} icon={<Home />} label="Início" isActive={viewState.type === 'home' || viewState.type === 'provider'} />
            <NavItem onClick={() => navigateTo({ type: 'movies' })} icon={<Film />} label="Filmes" isActive={viewState.type === 'movies'} />
            <NavItem onClick={() => navigateTo({ type: 'series' })} icon={<Tv />} label="Séries" isActive={viewState.type === 'series'} />
            <NavItem onClick={() => navigateTo({ type: 'live-tv' })} icon={<Radio />} label="TV" isActive={viewState.type === 'live-tv'} />
            <NavItem onClick={() => navigateTo({ type: 'calendar' })} icon={<CalendarDays />} label="Agenda" isActive={viewState.type === 'calendar'} />
            <NavItem onClick={() => navigateTo({ type: 'search' })} icon={<Search />} label="Buscar" isActive={viewState.type === 'search'} />
          </div>
        </nav>
      </div>

      {/* Modals Carregados Sob Demanda (Code Splitting) */}
      <React.Suspense fallback={null}>
        {playerModal.isOpen && (
          <VideoPlayerModal
            isOpen={playerModal.isOpen}
            onClose={() => setPlayerModal(prev => ({ ...prev, isOpen: false }))}
            title={playerModal.title}
            defaultUrl={playerModal.url}
            mediaType={playerModal.mediaType}
            tmdbId={playerModal.tmdbId}
            imdbId={playerModal.imdbId}
            initialSeason={playerModal.season}
            initialEpisode={playerModal.episode}
            quality={playerModal.quality}
            isCam={playerModal.isCam}
            isAnime={playerModal.isAnime}
            initialTime={playerModal.initialTime}
            autoFullscreen={playerModal.autoFullscreen}
            imageUrl={playerModal.imageUrl}
            backdropUrl={playerModal.backdropUrl}
            posterUrl={playerModal.posterUrl}
          />
        )}

        {webhookModalOpen && (
          <WebhookPanelModal
            isOpen={webhookModalOpen}
            onClose={() => setWebhookModalOpen(false)}
            onPlayItem={(title, url) => openPlayer(title, url)}
          />
        )}

        <AnimatePresence mode="wait">
          {notificationModalOpen && (
            <NotificationModal
              key="notification-modal"
              isOpen={true}
              onClose={() => setNotificationModalOpen(false)}
              onPlayEpisode={(title, url, mediaType, tmdbId, imdbId, season, episode, quality, isCam, initialTime, autoFullscreen, imageUrl, backdropUrl, posterUrl, isAnime) => {
                openPlayer(title, url, mediaType, tmdbId, imdbId, season, episode, quality, isCam, initialTime, autoFullscreen, imageUrl, backdropUrl, posterUrl, isAnime);
              }}
              onNavigateToSeries={(seriesId) => {
                navigateToDetails(seriesId);
              }}
              onNavigateToCalendar={() => {
                navigateTo({ type: 'calendar' });
              }}
            />
          )}
        </AnimatePresence>
      </React.Suspense>

      {/* CSS Utility for hiding scrollbar while keeping functionality */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none; /* IE and Edge */
            scrollbar-width: none; /* Firefox */
        }
      `}</style>
    </div>
  );
}

/* Subcomponents */

function HomePage({ 
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
  const [heroItems, setHeroItems] = useState<any[]>([featured]);
  const [heroIndex, setHeroIndex] = useState<number>(0);
  const heroItem = heroItems[heroIndex] || featured;

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
    return continueWatching;
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
    const fetchTopTrending = async () => {
      try {
        const trendingRes = await getTrending('movie', 'day');
        if (!isMounted || !trendingRes?.results || trendingRes.results.length === 0) return;

        // Seleciona os melhores filmes com imagem de fundo válida
        const candidates = trendingRes.results
          .filter((m: TMDBItem) => m.backdrop_path && (m.title || m.name))
          .sort((a: TMDBItem, b: TMDBItem) => (b.popularity || 0) - (a.popularity || 0))
          .slice(0, 5);

        if (candidates.length === 0) return;

        const formattedHeroItems = candidates.map((item: TMDBItem) => {
          const fullTitle = item.title || item.name || "Sem título";
          let logoText = fullTitle.toUpperCase();
          if (logoText.includes(": ")) {
            logoText = logoText.replace(": ", "\n");
          } else if (logoText.includes(" - ")) {
            logoText = logoText.replace(" - ", "\n");
          }

          const genresList = getGenreNames(item.genre_ids || []);
          const releaseYear = parseInt(item.release_date?.substring(0, 4) || "2026");

          return {
            id: item.id,
            tmdbId: item.id,
            title: fullTitle,
            description: item.overview || featured.description,
            imageUrl: formatImageUrl(item.backdrop_path, 'original'),
            posterUrl: formatImageUrl(item.poster_path, 'w500'),
            logoText,
            playerUrl: `https://v1.watchplay.shop/movie/${item.id}`,
            year: releaseYear,
            duration: "2h 10m",
            rating: item.vote_average ? item.vote_average.toFixed(1) : "8.0",
            genres: genresList.length > 0 ? genresList.slice(0, 3) : ["Ação", "Aventura"],
            quality: checkIsCam(fullTitle) ? "CAM" : "HD"
          };
        });

        if (!isMounted) return;
        setHeroItems(formattedHeroItems);
      } catch (err) {
        console.error("Erro ao sincronizar destaque automático com TMDB:", err);
      }
    };

    // Sincronização automática de lançamentos reais (filmes, séries, animes e doramas) no TMDB
    const fetchReleases = async () => {
      try {
        const [moviesRes, seriesRes, animesRes, doramasRes] = await Promise.all([
          getMovieReleases(),
          getSeriesReleases(),
          getAnimes(),
          getDoramas()
        ]);

        if (isMounted && moviesRes?.results && moviesRes.results.length > 0) {
          const formattedMovies = moviesRes.results
            .filter((m: TMDBItem) => m.poster_path && (m.title || m.name))
            .slice(0, 18)
            .map((m: TMDBItem) => ({
              id: m.id,
              tmdbId: m.id,
              title: (m.title || m.name || "").toUpperCase(),
              imageUrl: formatImageUrl(m.poster_path, 'w500'),
              backdropUrl: formatImageUrl(m.backdrop_path, 'original'),
              type: 'movie' as const,
              quality: checkIsCam(m.title || "") ? ("CAM" as const) : ("HD" as const),
              rating: m.vote_average ? m.vote_average.toFixed(1) : undefined,
              year: m.release_date ? m.release_date.substring(0, 4) : "2026",
              playerUrl: `https://v1.watchplay.shop/movie/${m.id}`
            }));
          if (formattedMovies.length > 0) {
            setMovieReleases(formattedMovies);
          }
        }

        if (isMounted && seriesRes?.results && seriesRes.results.length > 0) {
          const formattedSeries = seriesRes.results
            .filter((s: TMDBItem) => s.poster_path && (s.name || s.title))
            .slice(0, 18)
            .map((s: TMDBItem) => ({
              id: s.id,
              tmdbId: s.id,
              title: (s.name || s.title || "").toUpperCase(),
              imageUrl: formatImageUrl(s.poster_path, 'w500'),
              backdropUrl: formatImageUrl(s.backdrop_path, 'original'),
              type: 'series' as const,
              quality: "HD" as const,
              rating: s.vote_average ? s.vote_average.toFixed(1) : undefined,
              year: s.first_air_date ? s.first_air_date.substring(0, 4) : "2026",
              playerUrl: `https://v1.watchplay.shop/tvshow/${s.id}/1/1`
            }));
          if (formattedSeries.length > 0) {
            setSeriesReleases(formattedSeries);
          }
        }

        if (isMounted && animesRes?.results && animesRes.results.length > 0) {
          const formattedAnimes = animesRes.results
            .filter((a: TMDBItem) => a.poster_path && (a.name || a.title))
            .slice(0, 18)
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
              playerUrl: `/api/anime-stream?provider=consumet&id=${a.id}&s=1&e=1&title=${encodeURIComponent(a.name || a.title || "")}`
            }));
          if (formattedAnimes.length > 0) {
            setAnimeReleases(formattedAnimes);
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
                  onClick={() => onPlay?.(
                    heroItem.title, 
                    heroItem.playerUrl || `https://v1.watchplay.shop/movie/${heroItem.id}`,
                    'movie',
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
                  <span>Assistir Filme</span>
                </button>
                <button 
                  tabIndex={0} role="button" onClick={() => onItemClick(heroItem.id)}
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
              className="flex gap-4 md:gap-6 overflow-x-auto overflow-y-hidden snap-x snap-mandatory pt-2 pb-6 pl-2 pr-4 scrollbar-hide select-none cursor-grab active:cursor-grabbing"
            >
              {continueWatchingList.map((item, idx) => (
                <div 
                  key={`cw-${item.id}-${idx}`} 
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
                  className="snap-start shrink-0 relative group cursor-pointer w-[280px] md:w-[320px]"
                >
                  <div className="relative h-[160px] md:h-[180px] rounded-xl overflow-hidden shadow-lg border border-neutral-800 group-hover:border-orange-500/50 transition-colors">
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

                    <div className="absolute bottom-4 left-4 right-4">
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

function DetailsPage({ 
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
  onNavigateToCalendar?: () => void
}) {
  const allCatalogs = React.useMemo(() => getAllCatalogItems(), []);
  const [item, setItem] = useState<CatalogItem>(() => {
    if (initialItem) return initialItem;
    return allCatalogs.find(i => i.id === itemId) || allCatalogs[0];
  });
  
  const [tmdbDetails, setTmdbDetails] = useState<TMDBDetails | null>(null);
  const [loadingTmdb, setLoadingTmdb] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const commentTargetId = item.tmdbId || item.id || itemId;
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<CommentItem[]>(() => getCommentsForItem(commentTargetId));

  useEffect(() => {
    setComments(getCommentsForItem(commentTargetId));
  }, [commentTargetId]);
  const [isFavorite, setIsFavorite] = useState<boolean>(() => isItemFavorite(itemId));
  const [, setWatchedUpdateTick] = useState(0);
  const [trailerVideo, setTrailerVideo] = useState<TrailerVideo | null>(null);
  const [loadingTrailer, setLoadingTrailer] = useState<boolean>(false);

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

        const [details, trailer] = await Promise.all([
          getDetails(Number(targetId), item.type === 'series' ? 'tv' : 'movie').catch(() => null),
          getTrailer(Number(targetId), item.type === 'series' ? 'tv' : 'movie').catch(() => null)
        ]);

        if (isMounted) {
          if (trailer) setTrailerVideo(trailer);
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

  const isSeries = item.type === 'series';
  const effectiveTmdbId = item.tmdbId || item.id;
  const isAnimeItem = Boolean(item.isAnime || initialItem?.isAnime);
  const isDoramaItem = Boolean(item.isDorama || initialItem?.isDorama);

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
    const directMatches = allCatalogs.filter(i => {
      if (i.id === item.id) return false;
      const iGenres = Array.isArray(i.genres) ? i.genres : [];
      if (currentGenres.length > 0 && iGenres.some(g => currentGenres.includes(g))) {
        return true;
      }
      if (i.type && item.type && i.type === item.type) return true;
      return false;
    });

    if (directMatches.length >= 6) return directMatches.slice(0, 6);

    const extra = allCatalogs.filter(i => i.id !== item.id && !directMatches.some(m => m.id === i.id));
    return [...directMatches, ...extra].slice(0, 6);
  }, [allCatalogs, item.id, item.type, currentGenres]);

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

              {/* Botão Assistir Trailer */}
              {trailerVideo && (
                <button 
                  onClick={() => {
                    const el = document.getElementById("trailer-section");
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="flex items-center justify-center gap-2.5 bg-white/10 hover:bg-white/20 text-white font-bold py-3.5 md:py-4 px-6 md:px-8 rounded-full transition-all text-sm md:text-base border border-white/20 hover:border-white/40 cursor-pointer backdrop-blur-md hover:scale-105 active:scale-95 shadow-lg"
                  title="Ver trailer oficial"
                >
                  <Film className="w-4 h-4 md:w-5 md:h-5 text-orange-400" />
                  <span>Trailer</span>
                  {trailerVideo.isDubbed ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider">
                      Dublado
                    </span>
                  ) : trailerVideo.isSubtitled ? (
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-black uppercase tracking-wider">
                      Legendado
                    </span>
                  ) : null}
                </button>
              )}

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
                    {getSeasonWatchedCount(effectiveTmdbId, selectedSeason, 6)} de 6 assistidos
                  </span>
                </div>
                
                <div className="flex items-center gap-2.5 shrink-0 flex-nowrap">
                  {/* Botão Marcar Temporada como Vista (Largura padronizada sem layout shift) */}
                  <button
                    onClick={() => {
                      const fullyWatched = isSeasonFullyWatched(effectiveTmdbId, selectedSeason, 6);
                      markSeasonWatched(effectiveTmdbId, selectedSeason, 6, !fullyWatched);
                    }}
                    className={`min-w-[125px] justify-center px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border backdrop-blur-sm active:scale-95 ${
                      isSeasonFullyWatched(effectiveTmdbId, selectedSeason, 6)
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                        : "bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20"
                    }`}
                    title="Marcar ou desmarcar todos os episódios desta temporada como vistos"
                  >
                    <Check className={`w-3.5 h-3.5 ${isSeasonFullyWatched(effectiveTmdbId, selectedSeason, 6) ? "text-emerald-400 stroke-[3]" : "text-neutral-400"}`} />
                    <span>
                      {isSeasonFullyWatched(effectiveTmdbId, selectedSeason, 6) ? `T${selectedSeason} Vista` : `Marcar T${selectedSeason}`}
                    </span>
                  </button>

                  {/* Seletor de Temporadas */}
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide bg-black/40 p-1 rounded-xl border border-white/5">
                    {[1, 2, 3, 4].map(s => {
                      const seasonDone = isSeasonFullyWatched(effectiveTmdbId, s, 6);
                      const isCurrent = selectedSeason === s;
                      return (
                        <button
                          key={s}
                          onClick={() => setSelectedSeason(s)}
                          className={`relative px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
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
              <div className="space-y-3">
                {[
                  { ep: 1, title: `T${selectedSeason}:E1 O Início`, duration: "52m", desc: "Os primeiros acontecimentos que desencadeiam a trama principal." },
                  { ep: 2, title: `T${selectedSeason}:E2 Sombras e Segredos`, duration: "48m", desc: "Revelações surpreendentes mudam o rumo da jornada." },
                  { ep: 3, title: `T${selectedSeason}:E3 Ponto Sem Retorno`, duration: "55m", desc: "Uma escolha difícil precisa ser feita antes que seja tarde." },
                  { ep: 4, title: `T${selectedSeason}:E4 O Confronto`, duration: "58m", desc: "As peças se alinham para um clímax emocionante." },
                  { ep: 5, title: `T${selectedSeason}:E5 Consequências`, duration: "50m", desc: "As repercussões dos últimos acontecimentos afetam a todos." },
                  { ep: 6, title: `T${selectedSeason}:E6 O Desfecho`, duration: "56m", desc: "A revelação final e as conclusões decisivas." }
                ].map(ep => {
                  const watched = isEpisodeWatched(effectiveTmdbId, selectedSeason, ep.ep);
                  return (
                    <div 
                      key={ep.ep}
                      className={`flex items-center justify-between p-3.5 border rounded-xl transition-all group ${
                        watched 
                          ? "bg-[#131914] border-emerald-500/30 hover:border-emerald-500/50" 
                          : "bg-[#171717] hover:bg-[#202020] border-neutral-800/80 hover:border-orange-500/40"
                      }`}
                    >
                      <div 
                        className="flex items-center gap-3.5 flex-1 cursor-pointer"
                        onClick={() => {
                          const epUrl = isSeries 
                            ? `https://v1.watchplay.shop/tvshow/${effectiveTmdbId}/${selectedSeason}/${ep.ep}`
                            : `https://v1.watchplay.shop/movie/${item.imdbId || effectiveTmdbId}`;
                          onPlay?.(
                            `${item.title} - ${ep.title}`, 
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
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs transition-all shrink-0 border ${
                          watched 
                            ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/30" 
                            : "bg-orange-600/20 text-orange-500 border-orange-500/20 group-hover:bg-orange-600 group-hover:text-white"
                        }`}>
                          {ep.ep}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className={`text-sm font-bold transition-colors ${watched ? "text-neutral-300 opacity-80" : "text-white group-hover:text-orange-400"}`}>
                              {ep.title}
                            </h4>
                            {watched && (
                              <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                Assistido
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-400">{ep.desc}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 ml-3">
                        <span className="text-xs text-neutral-500 hidden sm:inline mr-1">{ep.duration}</span>
                        
                        {/* Botão de marcar/desmarcar visto (Caixinha com setinha branca) */}
                        <button
                          onClick={(e) => {
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

                        {/* Botão de Play */}
                        <div 
                          onClick={() => {
                            const epUrl = isSeries 
                              ? `https://v1.watchplay.shop/tvshow/${effectiveTmdbId}/${selectedSeason}/${ep.ep}`
                              : `https://v1.watchplay.shop/movie/${item.imdbId || effectiveTmdbId}`;
                            onPlay?.(
                              `${item.title} - ${ep.title}`, 
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
          {trailerVideo && (
            <div id="trailer-section" className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-neutral-800/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-600/20 text-orange-500 flex items-center justify-center border border-orange-500/30 shrink-0 shadow-[0_0_15px_rgba(234,88,12,0.15)]">
                    <Film className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-white font-bold text-lg">Trailer Oficial</h3>
                      {trailerVideo.isDubbed ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Dublado PT-BR
                        </span>
                      ) : trailerVideo.isSubtitled ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-black uppercase tracking-wider">
                          Legendado (PT-BR)
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-neutral-300 border border-white/10 text-[10px] font-semibold">
                          Áudio Original
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 truncate max-w-xl mt-0.5">
                      {trailerVideo.name}
                    </p>
                  </div>
                </div>
              </div>

              {/* Player 16:9 Cinematográfico do YouTube */}
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-neutral-800 shadow-2xl group hover:border-orange-500/40 transition-all">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${trailerVideo.key}?rel=0&modestbranding=1&autoplay=0`}
                  title={trailerVideo.name}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          )}

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
                 tabIndex={0} role="button" onClick={() => onItemClick(sim.id, sim)} 
                 className="relative rounded-xl overflow-hidden border border-neutral-800/80 group cursor-pointer aspect-[2/3] hover:border-orange-500/60 transition-all duration-300 shadow-lg hover:shadow-[0_0_20px_rgba(234,88,12,0.2)]"
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
    </div>
  );
}

function GlobalSearchPage({ 
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
            .filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && (r.poster_path || r.backdrop_path))
            .map(r => {
              const isTv = r.media_type === 'tv';
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
        <div className="relative w-full max-w-2xl mb-8 group">
          <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
            {isSearching ? (
              <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
            ) : (
              <Search className="w-5 h-5 text-neutral-500 group-focus-within:text-orange-500 transition-colors" />
            )}
          </div>
          <input 
            type="text" 
            placeholder="Digite o nome do filme ou série (ex: Avatar, Harry Potter, Homem-Aranha)..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111111] border border-white/10 rounded-full py-4 pl-16 pr-14 text-base md:text-lg text-white font-medium focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20 shadow-xl transition-all placeholder:text-neutral-600"
            autoFocus
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-5 flex items-center text-neutral-500 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
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
                <span className="text-xs text-neutral-400">Clique para abrir detalhes ou no botão Play para assistir</span>
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

function UserProfilePage({ 
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
              <div 
                onClick={() => onNavigate('favorites')}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-3 text-center cursor-pointer transition-colors"
              >
                <span className="block text-xl font-black text-orange-500">{favoriteItems.length}</span>
                <span className="text-[11px] text-neutral-400 font-medium">Favoritos</span>
              </div>

              <div 
                onClick={() => onNavigate('calendar')}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-3 text-center cursor-pointer transition-colors"
              >
                <span className="block text-xl font-black text-white">{followedSeries.length}</span>
                <span className="text-[11px] text-neutral-400 font-medium">Séries Seguidas</span>
              </div>

              <div 
                onClick={() => onNavigate('calendar')}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-3 text-center cursor-pointer transition-colors"
              >
                <span className="block text-xl font-black text-emerald-400">{thisWeekEpisodes.length}</span>
                <span className="text-[11px] text-neutral-400 font-medium">Lançamentos</span>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 w-full">
               <button 
                 onClick={() => onNavigate('favorites')}
                 className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-full font-semibold transition-all text-xs shadow-[0_0_15px_rgba(234,88,12,0.4)] cursor-pointer flex items-center gap-1.5"
               >
                 <Bookmark className="w-3.5 h-3.5 fill-current" />
                 <span>Minha Lista de Favoritos ({favoriteItems.length})</span>
               </button>

               <button 
                 onClick={() => onNavigate('calendar')}
                 className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full font-semibold transition-colors text-xs border border-white/10 cursor-pointer flex items-center gap-1.5"
               >
                 <CalendarDays className="w-3.5 h-3.5 text-orange-400" />
                 <span>Calendário de Episódios</span>
               </button>
            </div>
          </div>
        </div>

        {/* PRÉVIA DOS FAVORITOS NO PERFIL */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white pl-3 border-l-4 border-orange-500 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-orange-500" />
              <span>Meus Favoritos</span>
            </h3>
            {favoriteItems.length > 0 && (
              <button 
                onClick={() => onNavigate('favorites')}
                className="text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>Ver todos ({favoriteItems.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {favoriteItems.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {favoriteItems.slice(0, 4).map(item => (
                <div 
                  key={item.id} 
                  onClick={() => onItemClick?.(item.id, item)} 
                  className="relative rounded-2xl overflow-hidden bg-[#121212] border border-neutral-800 hover:border-orange-500/50 transition-all duration-300 group cursor-pointer aspect-[2/3]"
                >
                  <img 
                    src={item.posterUrl || item.imageUrl} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                    onError={(e) => handlePosterError(e, item.backdropUrl)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent"></div>

                  <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-bold text-orange-400 uppercase">
                    {item.type === 'series' ? 'Série' : 'Filme'}
                  </div>

                  {/* Play Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
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
                      className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(234,88,12,0.6)] text-white hover:scale-110 transition-transform"
                    >
                      <Play className="w-4 h-4 fill-white ml-0.5" />
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

function FavoritesPage({ 
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
  const [typeFilter, setTypeFilter] = useState<'all' | 'series' | 'movies'>('all');

  useEffect(() => {
    const handleFavUpdate = (e: any) => {
      setFavoriteIds(e.detail || getFavoriteIds());
    };
    window.addEventListener("playinfinity:favorites_updated", handleFavUpdate);
    return () => {
      window.removeEventListener("playinfinity:favorites_updated", handleFavUpdate);
    };
  }, []);

  const allCatalogs = getAllCatalogItems();
  const favoriteItems = allCatalogs.filter(item => favoriteIds.includes(item.id));

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
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
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

function GlobalCatalogPage({ 
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
                onClick={() => { setFilterGenre('all'); setCurrentPage(1); }} 
              />
              {availableGenres.map(genre => (
                <FilterChip 
                  key={genre} 
                  label={genre} 
                  active={filterGenre === genre} 
                  onClick={() => { setFilterGenre(genre); setCurrentPage(1); }} 
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
                  onClick={() => { setFilterYear(range.value === 'all' ? 'all' : range.label); setCurrentPage(1); }} 
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
                  onClick={() => {
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
                        onClick={() => {
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
                  onClick={() => {
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

function ProviderPage({ 
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
                onClick={() => {
                  setFilterType('all');
                  setCurrentPage(1);
                }} 
              />
              <FilterChip 
                label="Todas as Séries" 
                active={filterType === 'series'} 
                onClick={() => {
                  setFilterType('series');
                  setCurrentPage(1);
                }} 
              />
              <FilterChip 
                label="Filmes" 
                active={filterType === 'movie'} 
                onClick={() => {
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
                    onClick={() => {
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
                        onClick={() => {
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
                    onClick={() => {
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

function FilterChip({ label, active, onClick }: { label: string, active: boolean, onClick: () => void, key?: any }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl whitespace-nowrap text-xs md:text-sm font-medium transition-all shrink-0 border select-none active:scale-95
        ${active 
          ? 'bg-orange-500 text-white border-orange-500 shadow-[0_0_12px_rgba(234,88,12,0.35)] font-semibold' 
          : 'bg-[#141414] text-neutral-300 border-neutral-800 hover:bg-neutral-800 hover:text-white hover:border-neutral-700'}`}
    >
      {label}
    </button>
  );
}

function ContentRow({ 
  title, 
  items, 
  isTop10 = false, 
  aspect = "landscape",
  startNumber = 1,
  onItemClick
}: { 
  title: string, 
  items: any[], 
  isTop10?: boolean, 
  aspect?: "landscape" | "portait",
  startNumber?: number,
  onItemClick?: (id: number, item?: any) => void
}) {
  const rowRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(true);

  // Controle de arrastar com mouse e touch (Drag-to-scroll 1:1 sem resistência de snap)
  const isMouseDownRef = React.useRef(false);
  const startXRef = React.useRef(0);
  const scrollLeftRef = React.useRef(0);
  const hasDraggedRef = React.useRef(false);
  const [isDragging, setIsDragging] = React.useState(false);

  // Touch handlers para mobile
  const touchStartXRef = React.useRef(0);
  const touchStartYRef = React.useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    hasDraggedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = Math.abs(e.touches[0].clientX - touchStartXRef.current);
    const dy = Math.abs(e.touches[0].clientY - touchStartYRef.current);
    // Se o movimento for predominantemente horizontal, marcamos como drag
    if (dx > 8 && dx > dy) {
      hasDraggedRef.current = true;
    }
  };

  const handleTouchEnd = () => {
    if (hasDraggedRef.current) {
      // Bloqueia o evento de click sintético que o navegador mobile dispara logo após o touch
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 150);
    }
  };

  const updateScrollButtons = React.useCallback(() => {
    if (!rowRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
    setCanScrollLeft(scrollLeft > 15);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 15);
  }, []);

  React.useEffect(() => {
    updateScrollButtons();
    const el = rowRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    window.addEventListener("resize", updateScrollButtons);
    return () => {
      el.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
    };
  }, [items, updateScrollButtons]);

  const handleScroll = (direction: "left" | "right") => {
    if (!rowRef.current) return;
    const scrollAmount = rowRef.current.clientWidth * 0.75;
    rowRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth"
    });
  };

  // Arraste com o mouse com listeners no window para movimentação contínua e natural
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !rowRef.current) return; // Apenas botão esquerdo
    isMouseDownRef.current = true;
    hasDraggedRef.current = false;
    startXRef.current = e.clientX;
    scrollLeftRef.current = rowRef.current.scrollLeft;

    const onWindowMouseMove = (moveEvent: MouseEvent) => {
      if (!isMouseDownRef.current || !rowRef.current) return;
      const dx = moveEvent.clientX - startXRef.current;
      if (Math.abs(dx) > 6) {
        hasDraggedRef.current = true;
        setIsDragging(true);
      }
      rowRef.current.scrollLeft = scrollLeftRef.current - dx;
    };

    const onWindowMouseUp = () => {
      isMouseDownRef.current = false;
      setIsDragging(false);
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 100);
    };

    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
  };

  return (
    <section className="relative group/row">
      {/* Cabeçalho da Seção com Título e Botões Redondos de Navegação */}
      <div className="flex items-center justify-between mb-4 md:mb-6 pl-2 pr-4">
        <h2 className="text-xl md:text-2xl font-bold text-white border-l-4 border-orange-500 pl-2 flex items-center gap-2">
          <span>{title}</span>
        </h2>

        {/* Botões Redondinhos de Navegação no Topo Direito */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleScroll("left")}
            disabled={!canScrollLeft}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border ${
              canScrollLeft
                ? "bg-neutral-800/90 hover:bg-orange-600 text-white border-white/15 hover:border-orange-500 hover:scale-110 cursor-pointer shadow-lg active:scale-95"
                : "bg-neutral-900/40 text-neutral-600 border-white/5 cursor-not-allowed opacity-30"
            }`}
            aria-label="Rolar para a esquerda"
            title="Anterior"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
          </button>

          <button
            type="button"
            onClick={() => handleScroll("right")}
            disabled={!canScrollRight}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border ${
              canScrollRight
                ? "bg-neutral-800/90 hover:bg-orange-600 text-white border-white/15 hover:border-orange-500 hover:scale-110 cursor-pointer shadow-lg active:scale-95"
                : "bg-neutral-900/40 text-neutral-600 border-white/5 cursor-not-allowed opacity-30"
            }`}
            aria-label="Rolar para a direita"
            title="Próximo"
          >
            <ChevronRight className="w-5 h-5 stroke-[2.2]" />
          </button>
        </div>
      </div>

      {/* Carrossel de Itens com suporte a Mouse Drag e Touch Swipe */}
      <div 
        ref={rowRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          scrollSnapType: isDragging ? "none" : "x mandatory",
          scrollBehavior: isDragging ? "auto" : "smooth",
          touchAction: "pan-y pan-x pinch-zoom"
        }}
        className={`flex gap-4 md:gap-6 overflow-x-auto overflow-y-hidden scrollbar-hide select-none ${
          isTop10 
            ? "pt-4 pb-8 md:pt-6 lg:pb-10 pl-6 md:pl-8 pr-6 md:pr-8" 
            : "pt-4 pb-6 pl-2 pr-4"
        } ${
          isDragging ? "cursor-grabbing" : "cursor-grab snap-x snap-mandatory"
        }`}
      >
        {items.map((item, idx) => (
          <div 
            key={`cr-${item.id || item.title}-${idx}`} 
            onClick={(e) => {
              if (hasDraggedRef.current) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              onItemClick && onItemClick(item.id, item);
            }} 
            className="snap-start shrink-0 relative group cursor-pointer transition-transform duration-300 hover:scale-105 hover:z-20 origin-bottom transform-gpu"
          >
            {isTop10 ? (
              <div className="flex relative items-end w-[280px] md:w-[320px] h-[160px] md:h-[180px]">
                {/* Bold background number */}
                <span className="absolute left-1 bottom-0 text-[80px] md:text-[100px] leading-none font-black text-neutral-600/80 group-hover:text-orange-500/90 z-0 tracking-tighter drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] select-none transition-colors duration-300">
                  {idx + startNumber}
                </span>
                {/* Image */}
                <div className="relative w-[78%] md:w-[80%] ml-auto h-full rounded-xl overflow-hidden shadow-lg border border-neutral-800 group-hover:border-orange-500/50 transition-colors z-10">
                   {checkIsCam(item.title, item.quality) && (
                     <span className="absolute top-2 right-2 z-20 px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] tracking-wider uppercase shadow-md flex items-center gap-1">
                       CAM
                     </span>
                   )}
                   <img 
                     src={item.imageUrl} 
                     alt={item.title} 
                     draggable={false}
                     className="w-full h-full object-cover pointer-events-none" 
                     loading="lazy" 
                     onError={(e) => handlePosterError(e, item.backdropUrl)}
                   />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>
                   <span className="absolute bottom-3 left-3 font-bold text-lg md:text-xl text-white uppercase tracking-wider text-shadow pointer-events-none">
                     {item.title}
                   </span>
                </div>
              </div>
            ) : (
              <div className={`relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group-hover:border-orange-500/50 transition-colors 
                ${aspect === 'landscape' ? 'w-[240px] md:w-[300px] h-[135px] md:h-[170px]' : 'w-[160px] md:w-[200px] h-[240px] md:h-[300px]'}`}>
                {item.provider && (
                  <span className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md text-neutral-200 font-bold text-[9px] tracking-wider uppercase border border-white/10 shadow-md">
                    {item.provider}
                  </span>
                )}
                {checkIsCam(item.title, item.quality) && (
                  <span className="absolute top-2 right-2 z-20 px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] tracking-wider uppercase shadow-md flex items-center gap-1">
                    CAM
                  </span>
                )}
                <img 
                  src={item.imageUrl} 
                  alt={item.title} 
                  draggable={false}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 pointer-events-none" 
                  loading="lazy" 
                  onError={(e) => handlePosterError(e, item.backdropUrl)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none"></div>
                <span className={`absolute ${aspect === 'landscape' ? 'bottom-3 left-3' : 'bottom-4 inset-x-0 mx-4 text-center font-black'} uppercase text-white drop-shadow-lg pointer-events-none`}>
                  {item.title}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function NavItem({ icon, label, isActive = false, onClick }: { icon: React.ReactNode, label: string, isActive?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`relative flex-1 min-w-0 h-12 flex flex-col items-center justify-center rounded-2xl transition-all duration-300 overflow-hidden cursor-pointer ${
        isActive 
          ? 'text-orange-500 font-bold' 
          : 'text-neutral-400 hover:text-neutral-200 active:bg-white/5'
      }`}
    >
      {isActive && (
        <div className="absolute inset-0 bg-orange-500/15 rounded-2xl"></div>
      )}
      <div className={`relative w-5 h-5 transition-all duration-200 [&>svg]:w-full [&>svg]:h-full ${
        isActive 
          ? 'translate-y-[-5px] drop-shadow-[0_0_8px_rgba(234,88,12,0.8)] scale-110' 
          : ''
      }`}>
        {icon}
      </div>
      <span className={`absolute bottom-1 text-[9px] font-bold tracking-tight transition-all duration-200 truncate max-w-full px-0.5 ${
        isActive 
          ? 'opacity-100 translate-y-0 text-orange-500' 
          : 'opacity-0 translate-y-2'
      }`}>
        {label}
      </span>
    </button>
  );
}

