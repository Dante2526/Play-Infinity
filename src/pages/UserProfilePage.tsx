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
  KeyRound,
  Lock,
  AlertCircle
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
import { getFriendlyErrorMessage } from "../utils/errorTranslator";

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
import { auth, db } from "../services/firebase";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider, updateProfile } from "firebase/auth";

const GEEK_AVATARS = [
  { id: "ironman", url: "https://image.tmdb.org/t/p/w500/78lPtwv72eTNqFW9COBYI0dWDJa.jpg", name: "Homem de Ferro" },
  { id: "batman", url: "https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg", name: "Batman" },
  { id: "spiderman", url: "https://image.tmdb.org/t/p/w500/c24sv2weTHPsmDa7jEMN0m2P3RT.jpg", name: "Homem-Aranha" },
  { id: "deadpool", url: "https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg", name: "Deadpool" },
  { id: "superman", url: "https://image.tmdb.org/t/p/w500/8GFtkImmK0K1VaUChR0n9O61CFU.jpg", name: "Superman" },
  { id: "vader", url: "https://image.tmdb.org/t/p/w500/doeFDzZ0Ywp8YUoRaEhVE5UBqka.jpg", name: "Darth Vader" },
  { id: "heisenberg", url: "https://image.tmdb.org/t/p/w500/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg", name: "Heisenberg" },
  { id: "johnwick", url: "https://image.tmdb.org/t/p/w500/wXqWR7dHncNRbxoEGybEy7QTe9h.jpg", name: "John Wick" },
  { id: "mandalorian", url: "https://image.tmdb.org/t/p/w500/sWgBv7LV2PRoQgkxwlibdGXKz1S.jpg", name: "O Mandaloriano" },
  { id: "harleyquinn", url: "https://image.tmdb.org/t/p/w500/h4VB6m0RwcicVEZvzftYZyKXs6K.jpg", name: "Arlequina" },
  { id: "oppenheimer", url: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", name: "Oppenheimer" },
  { id: "thor", url: "https://image.tmdb.org/t/p/w500/rzRwTcFvttcN1ZpX2xv4j3tSdJu.jpg", name: "Thor" }
];

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
  const [userName, setUserName] = useState<string>(() => {
    return auth.currentUser?.displayName || (auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : "Naylan Moreira");
  });
  const [userAvatar, setUserAvatar] = useState<string | null>(auth.currentUser?.photoURL || null);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [subscriptionLabel, setSubscriptionLabel] = useState<string>("Assinante Premium • Acesso Ilimitado");
  const [isVitalicio, setIsVitalicio] = useState<boolean>(false);

  // Estados do Modal de Troca de Senha
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const handleLogout = async () => {
    try {
      localStorage.removeItem("playinfinity_logged_in");
      localStorage.removeItem("playinfinity_playback_history");
      localStorage.removeItem("playinfinity_favorites");
      localStorage.removeItem("playinfinity_watched_episodes");
      localStorage.removeItem("playinfinity_watched_seasons");
      await signOut(auth);
      onNavigate('home');
    } catch (err) {
      console.error("Erro ao encerrar sessão:", err);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword.length < 6) {
      setPasswordError("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("A confirmação não coincide com a nova senha.");
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      setPasswordError("Usuário não autenticado.");
      return;
    }

    setPasswordLoading(true);

    try {
      // 1. Reautentica com a senha atual para validação de segurança
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // 2. Atualiza a senha no Authentication
      await updatePassword(user, newPassword);

      // 3. Atualiza campo no Firestore para manter sincronizado com o painel de adm
      try {
        await updateDoc(doc(db, "usuarios", user.uid), {
          senha: newPassword
        });
      } catch (dbErr) {
        try {
          await updateDoc(doc(db, "users", user.uid), {
            senha: newPassword,
            senhaInicial: newPassword
          });
        } catch (e) {}
      }

      setPasswordSuccess("Senha alterada com sucesso!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setIsChangePasswordOpen(false);
        setPasswordSuccess("");
      }, 1800);
    } catch (err: any) {
      console.error("Erro ao alterar senha:", err);
      setPasswordError(getFriendlyErrorMessage(err, "Não foi possível alterar a senha. Tente novamente."));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleAvatarSelect = async (url: string) => {
    if (!auth.currentUser) return;
    setAvatarLoading(true);
    try {
      await updateProfile(auth.currentUser, { photoURL: url });
      try { await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { photoURL: url }); } catch (e) {}
      try { await updateDoc(doc(db, "users", auth.currentUser.uid), { photoURL: url }); } catch (e) {}
      setUserAvatar(url);
      setIsAvatarModalOpen(false);
    } catch (err) {
      console.error("Erro ao atualizar avatar:", err);
      alert("Não foi possível atualizar o avatar. Tente novamente.");
    } finally {
      setAvatarLoading(false);
    }
  };

  useEffect(() => {
    const fetchUserData = async () => {
      const user = auth.currentUser;
      if (!user) return;
      
      let vitalicio = false;

      // 1. Verifica se o e-mail consta na coleção 'administradores'
      if (user.email) {
        try {
          const adminQ = query(
            collection(db, "administradores"),
            where("email", "==", user.email)
          );
          const adminSnap = await getDocs(adminQ);
          if (!adminSnap.empty) {
            vitalicio = true;
          }
        } catch (adminErr) {
          console.warn("Verificação de administradores:", adminErr);
        }
      }

      // 2. Consulta o documento do usuário
      try {
        let snap = await getDoc(doc(db, "usuarios", user.uid));
        if (!snap.exists()) {
          snap = await getDoc(doc(db, "users", user.uid));
        }
        if (snap.exists()) {
          const data = snap.data();

          // Sincroniza nome
          const name = data.nome || data.name || data.displayName || data.nomeExibicao;
          if (name) {
            setUserName(name);
          } else if (user.displayName) {
            setUserName(user.displayName);
          } else if (user.email) {
            setUserName(user.email.split('@')[0]);
          }

          // Verifica se tipo de acesso é vitalício
          const tipoAcesso = (data.tipoAcesso || data.accessType || "").toLowerCase();
          if (tipoAcesso === "vitalicio" || tipoAcesso === "vitalício") {
            vitalicio = true;
          }

          if (vitalicio) {
            setIsVitalicio(true);
            setSubscriptionLabel("Assinante Premium • Acesso Ilimitado Vitalício");
          } else {
            setIsVitalicio(false);
            const rawExp = data.dataExpiracao || data.expirationDate;
            if (rawExp) {
              const expDate = new Date(rawExp);
              if (!isNaN(expDate.getTime())) {
                const isPast = expDate.getTime() < Date.now();
                const isTeste = tipoAcesso === "teste";
                if (isTeste) {
                  const timeStr = expDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  const dateStr = expDate.toLocaleDateString("pt-BR");
                  setSubscriptionLabel(isPast 
                    ? `Acesso Teste Vencido em: ${dateStr} às ${timeStr}`
                    : `Vencimento: ${dateStr} às ${timeStr}`
                  );
                } else {
                  const dateStr = expDate.toLocaleDateString("pt-BR");
                  setSubscriptionLabel(isPast 
                    ? `Assinatura Vencida em: ${dateStr}`
                    : `Vencimento: ${dateStr}`
                  );
                }
              } else {
                setSubscriptionLabel(`Vencimento: ${rawExp}`);
              }
            } else {
              setSubscriptionLabel("Assinante Ativo");
            }
          }
        } else {
          // Se não houver documento em users, mas for admin
          if (vitalicio) {
            setIsVitalicio(true);
            setSubscriptionLabel("Assinante Premium • Acesso Ilimitado Vitalício");
          }
        }
      } catch (err) {
        console.error("Erro ao carregar perfil do usuário:", err);
      }
    };
    fetchUserData();
  }, []);

  const userInitial = (userName.trim() || 'N').charAt(0).toUpperCase();

  useEffect(() => {
    const handleFavUpdate = (e: any) => {
      setFavoriteIds(e.detail || getFavoriteIds());
    };
    window.addEventListener("playinfinity:favorites_updated", handleFavUpdate);
    return () => {
      window.removeEventListener("playinfinity:favorites_updated", handleFavUpdate);
    };
  }, []);

  const [favoriteItems, setFavoriteItems] = useState<CatalogItem[]>(() => getStaticFavoriteItems(getFavoriteIds()));

  // Resolve favoritos completos (catálogo estático + TMDB para itens fora do catálogo local)
  useEffect(() => {
    let mounted = true;
    resolveFavoriteItems(favoriteIds).then(items => {
      if (mounted) setFavoriteItems(items);
    });
    return () => { mounted = false; };
  }, [favoriteIds]);

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
        <div className="bg-[#111111] border border-white/5 rounded-3xl p-6 md:p-8 mb-8 flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8 shadow-xl relative overflow-hidden">
          {/* Decorative glow */}
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-orange-600/10 rounded-full blur-[100px] pointer-events-none"></div>
          
          <button 
            onClick={() => setIsAvatarModalOpen(true)}
            className="group relative w-24 h-24 md:w-32 md:h-32 rounded-full border-[4px] border-[#0a0a0a] flex items-center justify-center shadow-[0_0_30px_rgba(234,88,12,0.6)] shrink-0 overflow-hidden transition-transform hover:scale-105 bg-gradient-to-tr from-orange-600 to-orange-400"
          >
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-full h-full object-cover" />
            ) : (
              <span className="font-black text-4xl md:text-5xl text-white">{userInitial}</span>
            )}
            
            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 backdrop-blur-sm">
              <span className="text-white text-xs font-bold uppercase tracking-wider">Alterar</span>
            </div>
          </button>
          
          <div className="flex flex-col items-center md:items-start flex-1 text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-1">{userName}</h2>
            <p className="text-neutral-400 mb-5 font-medium text-sm flex items-center justify-center md:justify-start gap-1.5">
              {isVitalicio && <Sparkles className="w-4 h-4 text-orange-400 shrink-0" />}
              <span>{subscriptionLabel}</span>
            </p>
            
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

          <button 
            type="button"
            onClick={() => {
              setPasswordError("");
              setPasswordSuccess("");
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setIsChangePasswordOpen(true);
            }}
            className="w-full mt-8 py-4 text-center font-bold text-neutral-200 hover:text-white bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5 hover:border-white/15 text-sm cursor-pointer active:scale-98 flex items-center justify-center gap-2 shadow-sm"
          >
            <KeyRound className="w-4 h-4 text-orange-500" />
            <span>Trocar Senha</span>
          </button>

          <button 
            type="button"
            onClick={handleLogout}
            className="w-full mt-3 py-4 text-center font-bold text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-colors border border-transparent hover:border-red-500/20 text-sm cursor-pointer active:scale-98"
          >
            Encerrar Sessão
          </button>
        </div>
      </div>

      {/* Modal de Troca de Senha */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 sm:p-6 animate-fade-in">
          <div className="bg-[#1c1c1e]/90 backdrop-blur-3xl border border-white/10 w-full max-w-sm sm:max-w-md overflow-hidden relative shadow-[0_8px_32px_rgba(0,0,0,0.6)]" style={{ borderRadius: '28px' }}>
            <button
              type="button"
              onClick={() => setIsChangePasswordOpen(false)}
              className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-8 sm:p-10">
              <div className="text-center mb-8 mt-2">
                <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/20 text-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h2 className="text-[24px] leading-tight font-extrabold text-white tracking-tight mb-2">
                  Trocar Senha
                </h2>
                <p className="text-white/50 text-[14px] font-medium px-2">
                  Informe sua senha atual e escolha uma nova senha de acesso.
                </p>
              </div>

              {passwordError && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400 text-sm rounded-[20px]">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{passwordError}</span>
                </div>
              )}

              {passwordSuccess && (
                <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 flex items-start gap-3 text-green-400 text-sm rounded-[20px]">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{passwordSuccess}</span>
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-white/60 text-xs font-bold mb-1.5 ml-1">Senha Atual</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-orange-500 text-white/30">
                      <Lock className="h-[18px] w-[18px]" />
                    </div>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-3.5 pl-11 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px] rounded-[20px]"
                      placeholder="Sua senha atual"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-white/60 text-xs font-bold mb-1.5 ml-1">Nova Senha</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-orange-500 text-white/30">
                      <Lock className="h-[18px] w-[18px]" />
                    </div>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-3.5 pl-11 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px] rounded-[20px]"
                      placeholder="Mínimo 6 caracteres"
                      minLength={6}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-white/60 text-xs font-bold mb-1.5 ml-1">Confirmar Nova Senha</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-orange-500 text-white/30">
                      <Lock className="h-[18px] w-[18px]" />
                    </div>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-3.5 pl-11 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px] rounded-[20px]"
                      placeholder="Repita a nova senha"
                      minLength={6}
                      required
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={passwordLoading}
                    className="w-full bg-orange-600 hover:bg-orange-500 active:scale-[0.98] text-white font-bold text-[15px] py-4 rounded-[22px] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(234,88,12,0.4)] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {passwordLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Atualizando...</span>
                      </>
                    ) : (
                      <span>Atualizar Senha</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Seleção de Avatar */}
      {isAvatarModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => !avatarLoading && setIsAvatarModalOpen(false)} />
          <div 
            className="bg-[#111111] border border-white/10 w-full max-w-3xl relative flex flex-col overflow-hidden shadow-2xl max-h-[85vh] animate-fade-in" 
            style={{ borderRadius: '24px' }}
          >
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-[#1a1a1c]">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Escolha seu Avatar</h3>
                <p className="text-sm text-neutral-400">Selecione um personagem para o seu perfil</p>
              </div>
              <button
                onClick={() => setIsAvatarModalOpen(false)}
                disabled={avatarLoading}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                {GEEK_AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    onClick={() => handleAvatarSelect(avatar.url)}
                    disabled={avatarLoading}
                    className={`relative aspect-square rounded-full overflow-hidden border-[3px] transition-all group ${
                      userAvatar === avatar.url 
                        ? 'border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)] scale-105' 
                        : 'border-transparent hover:border-white/30 hover:scale-105'
                    } ${avatarLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <img 
                      src={avatar.url} 
                      alt={avatar.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {userAvatar === avatar.url && (
                      <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-white drop-shadow-md" />
                      </div>
                    )}
                    
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center">
                      <span className="text-[10px] font-bold text-white text-center leading-tight shadow-black drop-shadow-md">
                        {avatar.name}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {avatarLoading && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
