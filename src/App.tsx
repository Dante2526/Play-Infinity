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
import { useVoiceSearch } from "./hooks/useVoiceSearch";
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
import { AuthModal } from "./components/AuthModal";
import { PaywallModal } from "./components/PaywallModal";
import { useSubscription } from "./hooks/useSubscription";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "./services/firebase";
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
import { VirtualRemote } from "./components/VirtualRemote";
import {
  getFavoriteIds,
  toggleFavorite,
  isItemFavorite,
  getAllCatalogItems,
  SERIES_EPISODE_SCHEDULE,
  getScheduleForFavorites,
  fetchFavoritesFromCloud
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
  getSeasonWatchedCount,
  fetchWatchedFromCloud
} from "./services/watchedEpisodes";
import { getPlaybackHistory, PlaybackHistoryItem, removePlaybackItem, fetchHistoryFromCloud } from "./services/playbackHistory";
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


import { HomePage } from './pages/HomePage';
import { DetailsPage } from './pages/DetailsPage';
import { GlobalSearchPage } from './pages/GlobalSearchPage';
import { UserProfilePage } from './pages/UserProfilePage';
import { FavoritesPage } from './pages/FavoritesPage';
import { GlobalCatalogPage } from './pages/GlobalCatalogPage';
import { ProviderPage } from './pages/ProviderPage';
import { FilterChip } from './components/FilterChip';
import { ContentRow } from './components/ContentRow';
import { NavItem } from './components/NavItem';

const AdminPage = lazyWithRetry(() => import("./pages/AdminPage").then(m => ({ default: m.AdminPage })));

import { OnPlayHandler } from "./types";

export default function App() {
  type ViewState = { 
    type: 'home' | 'movies' | 'series' | 'calendar' | 'provider' | 'search' | 'profile' | 'favorites' | 'details' | 'live-tv' | 'admin';
    id?: string;
    itemData?: CatalogItem;
    previous?: any;
  };

  // Smart TV Detection for Spatial Navigation
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isTV = /smarttv|tizen|webos|bravia|android tv|aftt|afts|aftm|vidaa|hisense|philips|panasonic/i.test(ua) || 
                 navigator.platform.toLowerCase().includes('tv');

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        document.body.classList.add('using-keyboard');
      }
    };
    const handleMouseDown = () => {
      document.body.classList.remove('using-keyboard');
    };

    if (isTV) {
      document.body.classList.add('is-smart-tv');
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  const [viewState, setViewState] = useState<ViewState>(() => {
    if (window.location.pathname.toUpperCase() === '/ADM') {
      return { type: 'admin' };
    }
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
  
  // Autenticação Firebase & Assinatura
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const { isPremium } = useSubscription();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthInitialized(true);
      if (user) {
        fetchHistoryFromCloud(); // Baixa histórico e mescla no login
        fetchFavoritesFromCloud(); // Baixa favoritos da nuvem
        fetchWatchedFromCloud(); // Baixa episódios assistidos
      }
    });
    return () => unsubscribe();
  }, []);

  // Heartbeat para rastrear "Pessoas Assistindo Agora"
  useEffect(() => {
    if (!currentUser) return;
    const updatePresence = async () => {
      try {
        const { doc, setDoc } = await import("firebase/firestore");
        await setDoc(doc(auth.app ? (auth as any).app : db as any, "users", currentUser.uid), {
          lastActive: new Date().toISOString()
        }, { merge: true });
      } catch (err) {}
    };
    updatePresence();
    const interval = setInterval(updatePresence, 3 * 60000); // A cada 3 minutos
    return () => clearInterval(interval);
  }, [currentUser]);

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
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    
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
    if (!isPremium) {
      setIsPaywallOpen(true);
      return;
    }

    // Quando autoFullscreen for solicitado (ex: ao clicar em Continue Assistindo),
    // aciona a tela cheia nativa imediatamente no clique do usuário para ocultar as barras do navegador
    if (autoFullscreen) {
      const elem = document.documentElement;
      const requestFS =
        elem.requestFullscreen ||
        (elem as any).webkitRequestFullscreen ||
        (elem as any).mozRequestFullScreen ||
        (elem as any).msRequestFullscreen;

      if (requestFS && !document.fullscreenElement) {
        try {
          const res = requestFS.call(elem, { navigationUI: "hide" });
          if (res && typeof res.catch === "function") {
            res.catch(() => {
              try { requestFS.call(elem); } catch (_) {}
            });
          }
        } catch (_) {
          try { requestFS.call(elem); } catch (_) {}
        }
      }

      if (screen.orientation && typeof (screen.orientation as any).lock === "function") {
        try {
          const lockPromise = (screen.orientation as any).lock("landscape");
          if (lockPromise && typeof lockPromise.catch === "function") {
            lockPromise.catch(() => {});
          }
        } catch (_) {}
      }
    }

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

  if (!isAuthInitialized) {
    return (
      <div className="bg-[#0a0a0a] min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
      </div>
    );
  }

  // TELA DE BLOQUEIO INICIAL (FORÇA O LOGIN ANTES DO CATÁLOGO)
  if (!currentUser && viewState.type !== 'admin') {
    return (
      <div className="bg-[#0a0a0a] min-h-screen relative overflow-hidden flex flex-col">
        {/* Background Cinematográfico Desfocado */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=1920&q=80" 
            className="w-full h-full object-cover opacity-20" 
            alt="Background" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent"></div>
        </div>

        {/* Top Branding (Visível apenas na tela de bloqueio) */}
        <div className="relative z-10 w-full py-6 px-8 flex justify-between items-center">
          <div className="font-black text-2xl tracking-tighter flex items-center select-none">
            <span className="text-white">PLAY</span>
            <span className="text-orange-500 ml-1">INFINITY</span>
          </div>
        </div>

        {/* Modal Fixado */}
        <div className="relative z-10 flex-1 w-full h-full">
           <AuthModal isOpen={true} onClose={() => {}} isDismissible={false} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0a] min-h-screen text-white font-sans flex flex-col lg:pb-0 w-full max-w-[100vw] overflow-x-hidden relative">
      {/* HEADER DESKTOP */}
      <header className="hidden lg:flex fixed top-4 lg:top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-6xl items-center justify-between px-3 lg:px-6 py-2.5 lg:py-3 bg-[#0a0a0a]/60 backdrop-blur-2xl border border-white/10 rounded-full z-50 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)]">
        <div 
          tabIndex={-1}
          data-no-tv-focus="true"
          className="font-black text-lg lg:text-2xl tracking-tighter flex items-center shrink-0 ml-1 lg:ml-2 cursor-pointer select-none outline-none"
          onClick={() => navigateTo({ type: 'home' })}
        >
          <span className="text-white">PLAY</span>
          <span className="text-orange-500 ml-1">INFINITY</span>
        </div>

        <nav className="flex items-center gap-0.5 lg:gap-1 bg-black/40 p-1 lg:p-1.5 rounded-full border border-white/5">
          <button 
            onClick={() => navigateTo({ type: 'home' })} 
            data-active-nav={viewState.type === 'home' || viewState.type === 'provider' ? 'true' : undefined}
            className={`px-3 lg:px-5 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer ${viewState.type === 'home' || viewState.type === 'provider' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}
          >
            Início
          </button>
          <button 
            onClick={() => navigateTo({ type: 'movies' })} 
            data-active-nav={viewState.type === 'movies' ? 'true' : undefined}
            className={`px-3 lg:px-5 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer ${viewState.type === 'movies' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}
          >
            Filmes
          </button>
          <button 
            onClick={() => navigateTo({ type: 'series' })} 
            data-active-nav={viewState.type === 'series' ? 'true' : undefined}
            className={`px-3 lg:px-5 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer ${viewState.type === 'series' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}
          >
            Séries
          </button>
          <button 
            onClick={() => navigateTo({ type: 'live-tv' })} 
            data-active-nav={viewState.type === 'live-tv' ? 'true' : undefined}
            className={`px-3 lg:px-5 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-medium transition-all flex items-center gap-1.5 lg:gap-2 cursor-pointer ${viewState.type === 'live-tv' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}
          >
            <span className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span className="whitespace-nowrap">TV Ao Vivo</span>
          </button>
          <button 
            onClick={() => navigateTo({ type: 'calendar' })} 
            data-active-nav={viewState.type === 'calendar' ? 'true' : undefined}
            className={`px-3 lg:px-5 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-medium transition-all flex items-center gap-1 lg:gap-1.5 cursor-pointer ${viewState.type === 'calendar' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}
          >
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

          <button 
            tabIndex={0}
            role="button"
            onClick={handleToggleProfile}
            className={`w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gradient-to-tr from-orange-600 to-orange-400 border-[2px] flex items-center justify-center font-bold text-xs lg:text-sm cursor-pointer hover:scale-105 transition-all outline-none ${viewState.type === 'profile' || viewState.type === 'favorites' ? 'border-orange-500 shadow-[0_0_20px_rgba(234,88,12,0.8)]' : 'border-[#0a0a0a] shadow-[0_0_15px_rgba(234,88,12,0.4)]'}`}
            title={viewState.type === 'profile' || viewState.type === 'favorites' ? 'Fechar Perfil' : 'Meu Perfil'}
          >
            N
          </button>
        </div>
      </header>

      {/* MOBILE BRANDING ON TOP */}
      <div className="lg:hidden absolute top-4 left-0 w-full flex justify-between items-center px-4 z-50 pointer-events-none max-w-full">
        <div 
          tabIndex={-1}
          data-no-tv-focus="true"
          className="font-black text-xl tracking-tighter flex items-center drop-shadow-md cursor-pointer pointer-events-auto shrink-0 select-none bg-transparent border-0 p-0 outline-none"
          onClick={() => navigateTo({ type: 'home' })}
        >
          <span className="text-white">PLAY</span>
          <span className="text-orange-500 ml-1">INFINITY</span>
        </div>
        
        {/* AÇÕES NO CANTO SUPERIOR DIREITO (MOBILE) */}
        <div className="pointer-events-auto shrink-0 flex items-center gap-2">
          {/* BOTÃO DE NOTIFICAÇÕES (MOBILE) */}
          <button 
            tabIndex={0}
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

          <button 
            tabIndex={0}
            role="button"
            onClick={handleToggleProfile}
            className={`w-9 h-9 rounded-full bg-gradient-to-tr from-orange-600 to-orange-400 border-[2px] flex items-center justify-center font-bold text-xs shadow-lg cursor-pointer transition-all active:scale-95 outline-none ${
              viewState.type === 'profile' || viewState.type === 'favorites' 
                ? 'border-white ring-2 ring-orange-500 shadow-[0_0_15px_rgba(234,88,12,0.8)] scale-105' 
                : 'border-white/20 hover:border-orange-500'
            }`}
            title={viewState.type === 'profile' || viewState.type === 'favorites' ? 'Fechar Perfil' : 'Meu Perfil'}
          >
            N
          </button>
        </div>
      </div>

      {viewState.type === 'details' && viewState.id ? (
        <DetailsPage 
          key={`details-${viewState.id}`}
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
      ) : viewState.type === 'admin' ? (
        <React.Suspense fallback={<div className="flex-1 flex items-center justify-center min-h-[60vh] text-neutral-400"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>}>
          <AdminPage onBack={() => {
            window.history.replaceState({ type: 'home' }, '', '/');
            setViewState({ type: 'home' });
          }} />
        </React.Suspense>
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

      <VirtualRemote isHidden={playerModal.isOpen} />
      
      {/* Auth & Paywall Modals */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <PaywallModal isOpen={isPaywallOpen} onClose={() => setIsPaywallOpen(false)} />

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
