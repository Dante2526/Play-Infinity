import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Hls from "hls.js";
import { 
  X, Play, Loader2, AlertCircle, RefreshCw, ExternalLink, 
  Check, Sparkles, Radio, ShieldCheck,
  Tv, Film, ChevronLeft, ChevronRight, ChevronDown, Layers, Maximize2, Minimize2, FastForward,
  SkipForward, RotateCcw, PictureInPicture2, Pause
} from "lucide-react";
import { NetflixPlayerSkin } from "./NetflixPlayerSkin";
import { CastModal } from "./CastModal";
import { checkIsCam } from "../utils/mediaUtils";
import { detectConnectionQuality } from "../services/networkQuality";
import { 
  isEpisodeWatched, 
  markEpisodeWatched, 
  toggleEpisodeWatched,
  markSeasonWatched,
  isSeasonFullyWatched,
  getSeasonWatchedCount
} from "../services/watchedEpisodes";
import { isServerBlacklisted } from "../data/serverBlacklist";
import { getDetails, getSeasonDetails, searchMulti, TMDBDetails, Season } from "../services/tmdb";
import { findMovieByTmdbId, findEpisode, buildMixdropStreamUrl } from "../services/encontreiCatalog";
import { getAvailableEpisodes, getAvailableSeasonsForSeries } from "../services/episodeAvailability";
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Chromecast } from 'capacitor-chromecast';
interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  defaultUrl?: string;
  mediaType?: 'movie' | 'series';
  tmdbId?: number;
  imdbId?: string;
  initialSeason?: number;
  initialEpisode?: number;
  quality?: string;
  isCam?: boolean;
  isAnime?: boolean;
  initialTime?: number;
  autoFullscreen?: boolean;
  imageUrl?: string;
  backdropUrl?: string;
  posterUrl?: string;
  initialServerKey?: string;
}

function formatTime(sec: number): string {
  if (isNaN(sec) || sec < 0) return "00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  }
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

// Extrai o link src caso o usuário ou sistema tenha passado um <iframe> completo
function extractSrcFromInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("<iframe") || trimmed.includes("<iframe")) {
    const match = trimmed.match(/src=["']([^"']+)["']/i);
    if (match && match[1]) {
      return match[1];
    }
  }
  return trimmed;
}

const SUPERFLIX_REGEX = /superflix[a-z0-9-]*\.(top|net|org|com|shop|site|app|api|online|link|xyz|cc|to|vip|pro)/i;

// Cache em memória dos server blocks por tmdbId (evita refetch em cada reabertura)
// TTL 2min — admin faz mudança no painel, usuário vê em até 2min
const _serverBlocksCache = new Map<number, { timestamp: number; keys: Set<string> }>();
const SERVER_BLOCKS_CACHE_TTL = 2 * 60 * 1000;

/**
 * Busca lista de server_keys bloqueados para um tmdbId.
 * Retorna Set vazio se não há blocks ou se fetch falha.
 */
async function fetchBlockedServers(tmdbId: number | string | undefined): Promise<Set<string>> {
  if (!tmdbId) return new Set();
  const id = Number(tmdbId);
  if (isNaN(id)) return new Set();

  const cached = _serverBlocksCache.get(id);
  if (cached && Date.now() - cached.timestamp < SERVER_BLOCKS_CACHE_TTL) {
    return cached.keys;
  }

  try {
    const res = await fetch(`/api/server-blocks?tmdb_id=${id}`, { cache: "no-store" });
    if (!res.ok) return cached?.keys || new Set();
    const data = await res.json();
    const keys = new Set<string>(data.blockedServerKeys || []);
    _serverBlocksCache.set(id, { timestamp: Date.now(), keys });
    return keys;
  } catch {
    return cached?.keys || new Set();
  }
}

export function isSuperflixUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return SUPERFLIX_REGEX.test(url) || lower.includes("superflix") || lower.includes("sfapi");
}

function parseMediaFromUrl(url: string) {
  if (url.includes("/api/anime-stream")) {
    try {
      const parsed = new URL(url, "http://localhost");
      const type = parsed.searchParams.get("type");
      const id = parsed.searchParams.get("id") || "";
      const season = parseInt(parsed.searchParams.get("s") || "1", 10);
      const episode = parseInt(parsed.searchParams.get("e") || "1", 10);
      return {
        isSeries: type !== "movie",
        id,
        season: isNaN(season) ? 1 : season,
        episode: isNaN(episode) ? 1 : episode,
      };
    } catch(e){console.warn("Silenced error:", e);}
  }

  const isSeries = url.includes("/tv/") || url.includes("/tvshow/") || url.includes("/serie") || url.includes("/series");
  
  const tvPattern = /\/(?:tv|tvshow|serie|series)\/([a-zA-Z0-9_-]+)(?:\/(\d+)\/(\d+))?/i;
  const tvMatch = url.match(tvPattern);
  
  const moviePattern = /\/(?:movie|filme)\/([a-zA-Z0-9_-]+)/i;
  const movieMatch = url.match(moviePattern);

  if (tvMatch) {
    return {
      isSeries: true,
      id: tvMatch[1],
      season: tvMatch[2] ? parseInt(tvMatch[2], 10) : 1,
      episode: tvMatch[3] ? parseInt(tvMatch[3], 10) : 1,
    };
  }

  if (movieMatch) {
    return {
      isSeries: false,
      id: movieMatch[1],
      season: 1,
      episode: 1,
    };
  }

  return {
    isSeries,
    id: "",
    season: 1,
    episode: 1,
  };
}

export function VideoPlayerModal({ 
  isOpen, 
  onClose, 
  title, 
  defaultUrl,
  mediaType,
  tmdbId,
  imdbId,
  initialSeason = 1,
  initialEpisode = 1,
  quality,
  isCam,
  isAnime,
  initialTime,
  autoFullscreen = false,
  imageUrl,
  backdropUrl,
  posterUrl,
  initialServerKey,
}: VideoPlayerModalProps) {
  const isCamMovie = isCam || checkIsCam(title, quality);
  const [showCastModal, setShowCastModal] = useState(false);
  const isAnimeMedia = Boolean(
    isAnime ||
    (title && /anime|naruto|dragon ball|one piece|bleach|attack on titan|jujutsu|demon slayer|death note|boruto|hunter x hunter|solo leveling|re:zero|re zero/i.test(title))
  );
  const [urlInput, setUrlInput] = useState(
    defaultUrl || ""
  );
  const [activeIframeUrl, setActiveIframeUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInIframe] = useState(() => {
    try { return window.self !== window.top; } catch (e) { return true; }
  });
  const [extractedSource, setExtractedSource] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Series Season & Episode State
  const [season, setSeason] = useState<number>(initialSeason);
  const [episode, setEpisode] = useState<number>(initialEpisode);
  // === MixDrop: fileId por episódio ===
  // Mapa (tv:{tmdbId}:{season}:{episode} | movie:{tmdbId}) → fileId.
  // Evita reutilizar o fileId do episódio ANTERIOR na troca de EPs —
  // causa raiz do oscilação E6/E5 no console e do EP não avançar.
  const [mixdropFileIds, setMixdropFileIds] = useState<Record<string, string | null>>({});
  const mixdropFileIdsRef = useRef(mixdropFileIds);
  mixdropFileIdsRef.current = mixdropFileIds;
  const [mixdropVizerFileIds, setMixdropVizerFileIds] = useState<Record<string, string | null>>({});
  const mixdropVizerFileIdsRef = useRef(mixdropVizerFileIds);
  mixdropVizerFileIdsRef.current = mixdropVizerFileIds;
  const [mixdropEncontreiFileIds, setMixdropEncontreiFileIds] = useState<Record<string, string | null>>({});
  const mixdropLookupInflightRef = useRef<Set<string>>(new Set());
  const mixdropFileId = useMemo(() => {
    if (!tmdbId) return null;
    const key = mediaType === "series" ? `tv:${tmdbId}:${season}:${episode}` : `movie:${tmdbId}`;
    return key in mixdropFileIds ? mixdropFileIds[key] : null;
  }, [mixdropFileIds, tmdbId, mediaType, season, episode]);

  const mixdropVizerFileId = useMemo(() => {
    if (!tmdbId) return null;
    const key = mediaType === "series" ? `tv:${tmdbId}:${season}:${episode}` : `movie:${tmdbId}`;
    return key in mixdropVizerFileIds ? mixdropVizerFileIds[key] : null;
  }, [mixdropVizerFileIds, tmdbId, mediaType, season, episode]);

  const mixdropEncontreiFileId = useMemo(() => {
    if (!tmdbId) return null;
    const key = mediaType === "series" ? `tv:${tmdbId}:${season}:${episode}` : `movie:${tmdbId}`;
    return key in mixdropEncontreiFileIds ? mixdropEncontreiFileIds[key] : null;
  }, [mixdropEncontreiFileIds, tmdbId, mediaType, season, episode]);

  // Resolve (e cacheia no mapa) o fileId do MixDrop de um episódio específico.
  const lookupMixdropFileId = useCallback(
    async (s: number, e: number): Promise<string | null> => {
      if (!tmdbId) return null;
      const seriesMode = mediaType === "series";
      const key = seriesMode ? `tv:${tmdbId}:${s}:${e}` : `movie:${tmdbId}`;
      if (key in mixdropFileIdsRef.current) return mixdropFileIdsRef.current[key];
      if (mixdropLookupInflightRef.current.has(key)) return null;
      mixdropLookupInflightRef.current.add(key);
      try {
        const res = seriesMode
          ? await findEpisode(tmdbId, s, e)
          : await findMovieByTmdbId(tmdbId);
        const result = res?.mixdrop ?? null;
        const vizerResult = res?.mixdrop_vizer ?? null;
        const encontreiResult = res?.mixdrop_encontrei ?? null;
        setMixdropFileIds(prev => ({ ...prev, [key]: result }));
        setMixdropVizerFileIds(prev => ({ ...prev, [key]: vizerResult }));
        setMixdropEncontreiFileIds(prev => ({ ...prev, [key]: encontreiResult }));
        return result;
      } catch {
        return null;
      } finally {
        mixdropLookupInflightRef.current.delete(key);
      }
    },
    [tmdbId, mediaType]
  );

  // Busca o fileId do MixDrop do episódio atual no catálogo encontrei.me (HD, sem marca d'água)
  useEffect(() => {
    if (!isOpen || !tmdbId) return;
    let cancelled = false;

    const seriesMode = mediaType === "series";
    const key = seriesMode ? `tv:${tmdbId}:${season}:${episode}` : `movie:${tmdbId}`;

    // Se o fileId deste episódio já foi resolvido, nada a fazer (evita refetch/spam)
    if (key in mixdropFileIdsRef.current) return;

    const lookupMixdrop = async () => {
      const result = await lookupMixdropFileId(season, episode);
      if (cancelled) return;
      console.log(
        result
          ? `[MixDrop] fileId HD: ${result} (S${season}E${episode})`
          : `[MixDrop] Sem fileId (S${season}E${episode})`
      );
    };

    lookupMixdrop();
    // CLEANUP: React chama quando deps mudam → cancela este lookup
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tmdbId, mediaType, season, episode, lookupMixdropFileId]);

  const [verifiedAvailableEpisodes, setVerifiedAvailableEpisodes] = useState<number[] | null>(null);
  const [isCheckingEpisodes, setIsCheckingEpisodes] = useState<boolean>(false);
  const [selectedServerKey, setSelectedServerKey] = useState<string>(initialServerKey || "srv_watchplay");

  // Wrap de URLs MP4 nativos (como Nixplay) via bridge page para garantir postMessage
  const toNativeBridgeUrl = (mp4Url: string) =>
    `/api/native-player?url=${encodeURIComponent(mp4Url)}`;

  const isExternalPlayer = useMemo(() => {
    const activeLower = (activeIframeUrl || "").toLowerCase();
    const inputLower = (urlInput || "").toLowerCase();
    if (
      activeLower.includes("upns.xyz") || activeLower.includes("embedplayapiupn") || activeLower.includes("upns") ||
      inputLower.includes("upns.xyz") || inputLower.includes("embedplayapiupn") || inputLower.includes("upns")
    ) {
      return true;
    }
    const isIntegrated =
      activeLower.includes("watchplay") ||
      activeLower.includes("myembed") ||
      activeLower.includes("playerflix") ||
      activeLower.includes("mixdrop") ||
      activeLower.includes("mxdrop") ||
      activeLower.includes("/api/native-player") ||
      activeLower.includes("/api/mixdrop-stream") ||
      activeLower.includes("/api/watchplayer-stream") ||
      activeLower.includes("/api/myembed-stream") ||
      activeLower.includes("/api/anime-stream") ||
      activeLower.includes("/api/vixsrc-stream") ||
      activeLower.includes("/api/live-stream-proxy") ||
      activeLower.includes("/api/vidsrc-stream") ||
      activeLower.includes("/api/vidsrc-proxy") ||
      activeLower.includes("/api/vidsrc-player");

    return !isIntegrated;
  }, [activeIframeUrl, urlInput, selectedServerKey]);
  const [blockedAdsCount, setBlockedAdsCount] = useState<number>(0);
  const [antiAdShield, setAntiAdShield] = useState<boolean>(true);
  const [autoNextNotice, setAutoNextNotice] = useState<{ nextEp: number } | null>(null);
  // Lista de server_keys bloqueados para o tmdbId atual (vindos do painel admin)
  const [blockedServerKeys, setBlockedServerKeys] = useState<Set<string>>(new Set());
  // Controle do overlay anti-flash: permanece preto até a skin estética estar pronta
  const [playerSkinReady, setPlayerSkinReady] = useState<boolean>(false);
  // Ref para confirmar que o vídeo realmente iniciou a reprodução (usado pelo watchdog e seek)
  const playbackConfirmedRef = useRef<boolean>(false);
  // Controle de visibilidade do iframe: oculta o iframe nativo (com botões feios/gigantes) até o vídeo começar a rodar
  const [iframeVisible, setIframeVisible] = useState<boolean>(false);
  // Controle de Picture-in-Picture nativo do Android
  const [isNativePiP, setIsNativePiP] = useState<boolean>(false);
  // Marca o timestamp da última troca de mídia/episódio para descartar mensagens residuais
  const transitionEpochRef = useRef<number>(0);

  // Configuração do Salto de Abertura Manual (Tecla S ou Botão)
  const [skipDurationSeconds, setSkipDurationSeconds] = useState<number>(() => {
    try {
      localStorage.removeItem("playinfinity_autoskip_intro");
      return parseInt(localStorage.getItem("playinfinity_skip_duration") || "85", 10);
    } catch {
      return 85;
    }
  });
  const [isIntroActive, setIsIntroActive] = useState<boolean>(false);
  const [skipNotice, setSkipNotice] = useState<string | null>(null);
  const [lastSkippedSeconds, setLastSkippedSeconds] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Fullscreen & Widescreen state tracking
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isWidescreen, setIsWidescreen] = useState<boolean>(false);
  const [isRotated, setIsRotated] = useState<boolean>(false);
  const isExpanded = isFullscreen || isWidescreen;
  const [isMiniPlayer, setIsMiniPlayer] = useState<boolean>(false);
  const [miniPosition, setMiniPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cardDimensionsRef = useRef<{ width: number; height: number }>({ width: 380, height: 260 });
  const miniContainerRef = useRef<HTMLDivElement>(null);

  const [showStageControls, setShowStageControls] = useState<boolean>(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [, setWatchedUpdateTick] = useState(0);

  // Controle do Status Bar Nativo no Android
  useEffect(() => {
    let enforceInterval: NodeJS.Timeout;

    const enforceStatusBarHidden = () => {
      if (Capacitor.isNativePlatform() && isOpen && isExpanded && !isMiniPlayer) {
        StatusBar.hide().catch(() => {});
      }
    };

    if (Capacitor.isNativePlatform()) {
      if (isOpen && isExpanded && !isMiniPlayer) {
        StatusBar.hide().catch(() => {});
        
        // Adiciona listeners para garantir que a status bar suma se o usuário 
        // puxou a barra de notificações e ela ficou "presa"
        window.addEventListener("pointerdown", enforceStatusBarHidden);
        window.addEventListener("touchstart", enforceStatusBarHidden, { passive: true });
        
        // Também verifica periodicamente a cada 2 segundos se a status bar reapareceu
        // para esconder automaticamente, imitando o IMMERSIVE_STICKY nativo
        enforceInterval = setInterval(enforceStatusBarHidden, 2500);
      } else {
        StatusBar.show().catch(() => {});
      }
    }
    return () => {
      window.removeEventListener("pointerdown", enforceStatusBarHidden);
      window.removeEventListener("touchstart", enforceStatusBarHidden);
      if (enforceInterval) clearInterval(enforceInterval);

      if (Capacitor.isNativePlatform()) {
        StatusBar.show().catch(() => {});
      }
    };
  }, [isOpen, isExpanded, isMiniPlayer]);

  // Modo de Proporção / Aspect Ratio: Padrão (contain), Preencher / Zoom (cover), Esticar (stretch)
  const [aspectRatio, setAspectRatio] = useState<"contain" | "cover" | "stretch">("contain");
  const handleToggleAspectRatio = () => {
    setAspectRatio((prev) => (prev === "contain" ? "cover" : prev === "cover" ? "stretch" : "contain"));
  };
  const hasSeekedInitialTimeRef = useRef<boolean>(false);
  const lastKnownTimeRef = useRef<number>(initialTime || 0);

  // Escuta atualizações de episódios assistidos para re-renderizar em tempo real
  useEffect(() => {
    const handleWatchedUpdate = () => setWatchedUpdateTick(t => t + 1);
    window.addEventListener("playinfinity:watched_updated", handleWatchedUpdate);
    return () => window.removeEventListener("playinfinity:watched_updated", handleWatchedUpdate);
  }, []);

  // Sincroniza estado de tela cheia do navegador
  useEffect(() => {
    const handleFullscreenStateChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).webkitCurrentFullScreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);

      if (!isCurrentlyFullscreen) {
        setIsWidescreen(false);
        setIsRotated(false);
        if (Capacitor.isNativePlatform()) {
          ScreenOrientation.unlock().catch(() => {});
        } else if (screen.orientation && typeof (screen.orientation as any).unlock === "function") {
          try {
            (screen.orientation as any).unlock();
          } catch(e){console.warn("Silenced error:", e);}
        }
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenStateChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenStateChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenStateChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenStateChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenStateChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenStateChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenStateChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenStateChange);
    };
  }, []);

  // Detecta se o aparelho mudou fisicamente para modo paisagem (largura > altura)
  useEffect(() => {
    const handleOrientationOrResize = () => {
      if (typeof window !== "undefined" && window.innerWidth > window.innerHeight) {
        // Se a tela já está deitada fisicamente, desativa a rotação CSS forçada
        setIsRotated(false);
      }
    };

    window.addEventListener("resize", handleOrientationOrResize);
    window.addEventListener("orientationchange", handleOrientationOrResize);
    if (typeof screen !== "undefined" && screen.orientation) {
      try {
        screen.orientation.addEventListener("change", handleOrientationOrResize);
      } catch(_){console.warn("Silenced error:", _);}
    }
    return () => {
      window.removeEventListener("resize", handleOrientationOrResize);
      window.removeEventListener("orientationchange", handleOrientationOrResize);
      if (typeof screen !== "undefined" && screen.orientation) {
        try {
          screen.orientation.removeEventListener("change", handleOrientationOrResize);
        } catch(_){console.warn("Silenced error:", _);}
      }
    };
  }, []);

  // Mostra controles internos ao mover o mouse e esconde após 3.5 segundos
  const handleStageMouseMove = () => {
    setShowStageControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowStageControls(false);
    }, 3500);
  };

  const handleStageMouseLeave = () => {
    if (!isFullscreen) {
      setShowStageControls(false);
    }
  };

  // Bloqueio de popups e proteção de redirecionamento nativo no nível da janela
  useEffect(() => {
    if (!isOpen) return;

    // 1. Intercepta chamadas a window.open para impedir que popups abram
    const originalWindowOpen = window.open;
    window.open = function (url) {
      console.warn("[Play Infinity - Escudo Anti-Anúncios] Tentativa de popup bloqueada:", url);
      setBlockedAdsCount((prev) => prev + 1);
      return null;
    };

    // 2. Recupera o foco da janela caso um popup/popunder tente roubar o foco
    const handleBlur = () => {
      setTimeout(() => {
        window.focus();
      }, 50);
    };

    window.addEventListener("blur", handleBlur);

    return () => {
      window.open = originalWindowOpen;
      window.removeEventListener("blur", handleBlur);
    };
  }, [isOpen]);

  // Determine if content is a series
  const isSeries = useMemo(() => {
    if (mediaType === 'series') return true;
    if (mediaType === 'movie') return false;
    const parsed = parseMediaFromUrl(urlInput);
    if (parsed.isSeries) return true;
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("série") || lowerTitle.includes("episódio") || lowerTitle.includes("temporada") || title.includes("T1:") || title.includes("T2:") || title.includes("T3:") || title.includes("T4:")) return true;
    return false;
  }, [mediaType, urlInput, title]);

  // Determine ID (TMDB or IMDB or extracted)
  const resolvedId = useMemo(() => {
    if (tmdbId) return String(tmdbId);
    if (imdbId) return imdbId;
    const parsed = parseMediaFromUrl(urlInput);
    if (parsed.id) return parsed.id;
    return "";
  }, [tmdbId, imdbId, urlInput, isSeries]);

  useEffect(() => {
    if (isOpen && !resolvedId && !error) {
      setError("Não foi possível identificar o ID do filme ou série (TMDB/IMDB). O reprodutor requer um ID válido para funcionar.");
    }
  }, [isOpen, resolvedId, error]);

  const [nixplayAvailable, setNixplayAvailable] = useState<boolean>(true);

  // Legenda PT-BR: URL do arquivo VTT gerado pelo backend
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);

  const fetchSubtitleUrl = useCallback(async (currentSeason: number, currentEpisode: number) => {
    if (!tmdbId) return;
    const type = isSeries ? "tv" : "movie";
    const params = new URLSearchParams({
      tmdb: String(tmdbId),
      type,
      lang: "pt-BR",
      ...(isSeries ? { season: String(currentSeason), episode: String(currentEpisode) } : {})
    });
    try {
      const res = await fetch(`/api/subtitles?${params}`);
      if (!res.ok) { setSubtitleUrl(null); return; }
      const data = await res.json();
      if (data?.url) setSubtitleUrl(data.url);
      else setSubtitleUrl(null);
    } catch {
      setSubtitleUrl(null);
    }
  }, [tmdbId, isSeries]);

  // Busca legenda PT-BR do backend sempre que o modal abre ou o episódio muda
  useEffect(() => {
    if (!isOpen || !tmdbId) return;
    setSubtitleUrl(null);
    fetchSubtitleUrl(season, episode);
  }, [isOpen, tmdbId, season, episode, fetchSubtitleUrl]);

  useEffect(() => {
    if (!isOpen) return;

    const numId = tmdbId ? Number(tmdbId) : (resolvedId && !isNaN(Number(resolvedId)) ? Number(resolvedId) : null);
    if (!numId) return;

    // Check Nixplay availability
    fetch(`/api/nixplay-check?tmdb_id=${numId}&type=${isSeries ? 'series' : 'movie'}`)
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.available === 'boolean') {
          setNixplayAvailable(data.available);
        }
      })
      .catch(() => setNixplayAvailable(false));
  }, [isOpen, isSeries, tmdbId, resolvedId]);

  // Busca blocks dinâmicos (admin panel) pra esse tmdbId
  // Atualiza em até 2min (cache client-side) — admin faz mudança no painel,
  // usuário vê a mudança em até 2min sem precisar reabrir o app.
  useEffect(() => {
    if (!isOpen) return;
    const numId = tmdbId ? Number(tmdbId) : null;
    if (!numId || isNaN(numId)) {
      setBlockedServerKeys(new Set());
      return;
    }
    let cancelled = false;
    fetchBlockedServers(numId).then(keys => {
      if (!cancelled) setBlockedServerKeys(keys);
    });
    return () => { cancelled = true; };
  }, [isOpen, tmdbId]);

  // Fallback do MixDrop quando não há fileId no catálogo (versão cam)
  const buildMixdropFallbackUrl = useCallback(() => {
    if (defaultUrl && (defaultUrl.includes("mixdrop.") || defaultUrl.includes("mxdrop."))) {
      return defaultUrl;
    }
    return `/api/mixdrop-stream?url=${encodeURIComponent(`https://mxdrop.top/e/${imdbId || resolvedId}`)}`;
  }, [defaultUrl, imdbId, resolvedId]);

  // Carregamento dinâmico de temporadas e episódios reais via TMDB
  const [seriesDetails, setSeriesDetails] = useState<TMDBDetails | null>(null);
  const [seasonData, setSeasonData] = useState<Season | null>(null);
  const [, setLoadingSeason] = useState<boolean>(false);
  const activeEpisodeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Busca detalhes da série no TMDB para obter as temporadas reais
  useEffect(() => {
    if (!isOpen || !isSeries) return;
    const numericId = tmdbId || (resolvedId && !isNaN(Number(resolvedId)) ? Number(resolvedId) : null);

    let isMounted = true;

    const loadSeries = async () => {
      try {
        let targetId = numericId;
        if (!targetId && title) {
          const cleanTitle = title.split(/ - (?:T\d|Temporada)/i)[0].trim();
          const searchRes = await searchMulti(cleanTitle);
          const foundTv = searchRes.results?.find(r => r.media_type === 'tv' || (r.name && !r.title));
          if (foundTv) {
            targetId = foundTv.id;
          }
        }

        if (targetId) {
          const details = await getDetails(targetId, 'tv');
          if (isMounted && details) {
            setSeriesDetails(details);
          }
        }
      } catch (err) {
        console.warn("[VideoPlayerModal] Não foi possível carregar detalhes da série:", err);
      }
    };

    loadSeries();

    return () => {
      isMounted = false;
    };
  }, [isOpen, isSeries, tmdbId, resolvedId, title]);

  const [catalogSeasons, setCatalogSeasons] = useState<number[] | null>(null);

  // Consulta se a série possui temporadas verificadas no servidor
  useEffect(() => {
    if (!isOpen || !isSeries) return;
    const numericId = tmdbId || (resolvedId && !isNaN(Number(resolvedId)) ? Number(resolvedId) : null);
    if (!numericId) return;

    let isMounted = true;
    const candidates = (seriesDetails?.seasons || [])
      .filter(s => s.season_number > 0 && s.episode_count > 0)
      .map(s => s.season_number);

    getAvailableSeasonsForSeries(numericId, candidates.length > 0 ? candidates : undefined).then((seasons) => {
      if (isMounted && seasons && seasons.length > 0) {
        setCatalogSeasons(seasons);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [isOpen, isSeries, tmdbId, resolvedId, seriesDetails]);

  // Lista de temporadas válidas da série (apenas as temporadas com episódios verificados e reproduzíveis)
  // Garante que o fundo da página inteira seja preto enquanto o modal estiver aberto (evita flashes brancos)
  useEffect(() => {
    if (isOpen) {
      document.body.style.backgroundColor = "black";
      document.documentElement.style.backgroundColor = "black";
    } else {
      document.body.style.backgroundColor = "";
      document.documentElement.style.backgroundColor = "";
    }
    return () => {
      document.body.style.backgroundColor = "";
      document.documentElement.style.backgroundColor = "";
    };
  }, [isOpen]);

  // Escuta o evento de Picture-in-Picture nativo do Android (emitido pelo MainActivity.java via Capacitor)
  useEffect(() => {
    const handlePiPChange = (e: any) => {
      let isPiP = false;
      if (e?.detail?.isPiP !== undefined) {
        isPiP = e.detail.isPiP;
      } else if (e?.isPiP !== undefined) {
        isPiP = e.isPiP;
      }

      setIsNativePiP(isPiP);

      if (isPiP) {
        // Se entrou no PiP nativo do Android, desfaz a rotação forçada e tela cheia interna
        // Isso evita que o vídeo fique "cortado" dentro da janela do PiP
        setIsRotated(false);
        setIsWidescreen(false);
        setIsFullscreen(false);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };

    window.addEventListener("pipModeChanged", handlePiPChange);
    return () => window.removeEventListener("pipModeChanged", handlePiPChange);
  }, []);

  const availableSeasons = useMemo(() => {
    const tmdbList = (seriesDetails?.seasons || [])
      .filter(s => s.season_number > 0 && s.episode_count > 0)
      .map(s => s.season_number);

    if (catalogSeasons && catalogSeasons.length > 0) {
      // Une as temporadas verificadas com o catálogo TMDB para nunca sumir temporadas reais
      const combined = Array.from(new Set([...catalogSeasons, ...tmdbList])).sort((a, b) => a - b);
      return combined.length > 0 ? combined : [1];
    }

    return tmdbList.length > 0 ? tmdbList : [1];
  }, [catalogSeasons, seriesDetails]);

  // Ajusta a temporada selecionada caso não exista na lista de temporadas reais
  useEffect(() => {
    if (isSeries && availableSeasons.length > 0 && !availableSeasons.includes(season)) {
      if (initialSeason && availableSeasons.includes(initialSeason)) {
        setSeason(initialSeason);
      } else {
        setSeason(availableSeasons[0]);
      }
    }
  }, [availableSeasons, isSeries, initialSeason, season]);

  // Busca episódios da temporada ativa e valida disponibilidade real nos servidores homologados
  useEffect(() => {
    if (!isOpen || !isSeries) return;
    const numericId = tmdbId || (resolvedId && !isNaN(Number(resolvedId)) ? Number(resolvedId) : null);
    if (!numericId) return;

    let isMounted = true;
    setLoadingSeason(true);
    setVerifiedAvailableEpisodes(null);
    setIsCheckingEpisodes(true);

    getSeasonDetails(numericId, season)
      .then(data => {
        if (isMounted && data) {
          setSeasonData(data);
          const totalEpCount = data.episodes?.length || 24;

          // Consulta em tempo real quais episódios realmente possuem stream ativo no servidor
          getAvailableEpisodes(numericId, season, totalEpCount)
            .then(availList => {
              if (isMounted && Array.isArray(availList)) {
                setVerifiedAvailableEpisodes(availList.length > 0 ? availList : []);
              }
            })
            .catch(e => {
              console.warn("[VideoPlayerModal] Erro na verificação de stream:", e);
            })
            .finally(() => {
              if (isMounted) setIsCheckingEpisodes(false);
            });
        } else {
          if (isMounted) setIsCheckingEpisodes(false);
        }
      })
      .catch(err => {
        console.warn("[VideoPlayerModal] Não foi possível carregar episódios da temporada:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingSeason(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, isSeries, tmdbId, resolvedId, season]);

  // Lista filtrada de episódios do TMDB contendo apenas os que realmente estão no servidor
  const filteredSeasonEpisodes = useMemo(() => {
    if (!seasonData?.episodes) return [];
    if (verifiedAvailableEpisodes && Array.isArray(verifiedAvailableEpisodes)) {
      return seasonData.episodes.filter(e => verifiedAvailableEpisodes.includes(e.episode_number));
    }
    return seasonData.episodes;
  }, [seasonData, verifiedAvailableEpisodes]);

  // Total de episódios da temporada selecionada com streaming comprovado
  const totalSeasonEpisodes = useMemo(() => {
    if (filteredSeasonEpisodes.length > 0) {
      return filteredSeasonEpisodes.length;
    }
    if (verifiedAvailableEpisodes && verifiedAvailableEpisodes.length > 0) {
      return verifiedAvailableEpisodes.length;
    }
    if (seasonData?.episodes && seasonData.episodes.length > 0) {
      return seasonData.episodes.length;
    }
    const sInfo = seriesDetails?.seasons?.find(s => s.season_number === season);
    if (sInfo?.episode_count && sInfo.episode_count > 0) {
      return sInfo.episode_count;
    }
    return 8;
  }, [filteredSeasonEpisodes, verifiedAvailableEpisodes, seasonData, seriesDetails, season]);

  // Array numérico de episódios para o seletor (apenas episódios disponíveis no servidor)
  const episodeNumbers = useMemo(() => {
    if (filteredSeasonEpisodes.length > 0) {
      return filteredSeasonEpisodes.map(e => e.episode_number);
    }
    if (verifiedAvailableEpisodes && verifiedAvailableEpisodes.length > 0) {
      return verifiedAvailableEpisodes;
    }
    if (seasonData?.episodes && seasonData.episodes.length > 0) {
      return seasonData.episodes.map(e => e.episode_number);
    }
    return Array.from({ length: totalSeasonEpisodes }, (_, i) => i + 1);
  }, [filteredSeasonEpisodes, verifiedAvailableEpisodes, seasonData, totalSeasonEpisodes]);

  // Auto-scroll do botão do episódio ativo
  useEffect(() => {
    if (activeEpisodeBtnRef.current) {
      activeEpisodeBtnRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [episode]);

  // Servidores oficiais homologados: WatchPlayer Oficial e VIP Player (Dublado PT-BR)
  const servers = useMemo(() => {
    let list: Array<{
      key: string;
      label: string;
      badge?: string;
      buildUrl: (id: string, s?: number, e?: number) => string;
      isMatch: (u: string) => boolean;
      name: string;
    }> = [];

    if (isSeries) {
      list = [
        {
          key: "srv_watchplay",
          label: "WatchPlayer",
          badge: "WatchPlayer Oficial • Dublado em Português (Brasil)",
          buildUrl: (id: string, s?: number, e?: number) => 
            `https://v1.watchplay.shop/tvshow/${id}/${s || 1}/${e || 1}?cb=${Date.now()}`,
          isMatch: (u: string) => u.includes("watchplay.shop") && !u.includes("/api/watchplayer-stream"),
          name: "WatchPlayer"
        },
        {
          key: "srv_vip",
          label: "VIP Player",
          badge: "VIP Player HD • Áudio Dublado PT-BR • Sem Anúncios",
          buildUrl: (id: string, s?: number, e?: number) => 
            `/api/myembed-stream?id=${id}&type=tv&s=${s || 1}&e=${e || 1}&cb=${Date.now()}`,
          isMatch: (u: string) => u.includes("myembed.biz") || u.includes("playerflix") || u.includes("/api/myembed-stream"),
          name: "VIP Player"
        },
        {
          key: "srv_nixplay",
          label: "Nixplay",
          badge: "Nixplay Premium • Áudio Dublado PT-BR • Skin Netflix",
          buildUrl: (id: string, s?: number, e?: number) => {
            let tmdb = tmdbId || id;
            if (String(tmdb).startsWith('tt')) {
              // Try to fallback to id if tmdbId wasn't passed and id is purely numeric
              tmdb = !String(id).startsWith('tt') ? id : tmdb;
            }
            const ss = String(s || 1).padStart(3, '0');
            const ee = String(e || 1).padStart(3, '0');
            const streamId = `${tmdb}${ss}${ee}`;
            return toNativeBridgeUrl(`https://nixplay.lat/series/testelogado-vods/GwXanZ3Dj/${streamId}.mp4`);
          },
          isMatch: (u: string) => u.includes("nixplay.lat"),
          name: "Nixplay"
        },
        {
          key: "srv_mixdrop",
          label: "MixDrop",
          badge: "MixDrop VIP HD • Áudio Dublado PT-BR • Skin Netflix",
          buildUrl: (id: string, s?: number, e?: number) => {
            // Prioridade 1: fileId do catálogo encontrei.me (HD, sem marca d'água)
            if (mixdropFileId) {
              return buildMixdropStreamUrl(mixdropFileId) || `/api/mixdrop-stream?url=${encodeURIComponent(`https://mxdrop.top/e/${imdbId || id}`)}`;
            }
            // Prioridade 2: defaultUrl se já é uma URL do MixDrop
            if (defaultUrl && (defaultUrl.includes("mixdrop") || defaultUrl.includes("mxdrop"))) {
              return defaultUrl;
            }
            // Prioridade 3: fallback (pode ser versão cam)
            return `/api/mixdrop-stream?url=${encodeURIComponent(`https://mxdrop.top/e/${imdbId || id}`)}&cb=${Date.now()}`;
          },
          isMatch: (u: string) => u.includes("mixdrop") || u.includes("mxdrop"),
          name: "MixDrop"
        }
      ];
    } else {
      list = [
        {
          key: "srv_watchplay",
          label: "WatchPlayer",
          badge: "WatchPlayer Oficial • Dublado em Português (Brasil)",
          buildUrl: (id: string) => `https://v1.watchplay.shop/movie/${imdbId || id}?cb=${Date.now()}`,
          isMatch: (u: string) => u.includes("watchplay.shop") && !u.includes("/api/watchplayer-stream"),
          name: "WatchPlayer"
        },
        {
          key: "srv_vip",
          label: "VIP Player",
          badge: "VIP Player HD • Áudio Dublado PT-BR • Sem Anúncios",
          buildUrl: (id: string) => 
            `/api/myembed-stream?id=${imdbId || id}&type=movie&cb=${Date.now()}`,
          isMatch: (u: string) => u.includes("myembed.biz") || u.includes("playerflix") || u.includes("/api/myembed-stream"),
          name: "VIP Player"
        },
        {
          key: "srv_nixplay",
          label: "Nixplay",
          badge: "Nixplay Premium • Áudio Dublado PT-BR • Skin Netflix",
          buildUrl: (id: string) => {
            let tmdb = tmdbId || id;
            if (String(tmdb).startsWith('tt')) {
              tmdb = !String(id).startsWith('tt') ? id : tmdb;
            }
            return toNativeBridgeUrl(`https://nixplay.lat/movie/testelogado-vods/GwXanZ3Dj/${tmdb}.mp4`);
          },
          isMatch: (u: string) => u.includes("nixplay.lat"),
          name: "Nixplay"
        },
        {
          key: "srv_mixdrop",
          label: "MixDrop",
          badge: "MixDrop VIP HD • Áudio Dublado PT-BR • Skin Netflix",
          buildUrl: () => {
            // Prioridade 1: fileId do catálogo encontrei.me (HD, sem marca d'água)
            if (mixdropFileId) {
              return buildMixdropStreamUrl(mixdropFileId) || "https://mxdrop.top/f/36nggdmqspmlg4";
            }
            // Prioridade 2: defaultUrl se já é uma URL do MixDrop
            if (defaultUrl && (defaultUrl.includes("mixdrop") || defaultUrl.includes("mxdrop"))) {
              return defaultUrl;
            }
            // Prioridade 3: fallback (pode ser versão cam)
            return `https://mxdrop.top/f/36nggdmqspmlg4?cb=${Date.now()}`;
          },
          isMatch: (u: string) => u.includes("mixdrop") || u.includes("mxdrop"),
          name: "MixDrop"
        }
      ];
    }
    
    // Adiciona Seriesflix HD (vidsrc.sh decrypt + proxy) — usa hls.js + Netflix skin 100%
    if (isSeries && tmdbId) {
      list.push({
        key: "srv_vidsrc",
        label: "Seriesflix HD (Dublado)",
        badge: "Seriesflix HD • Stream decifrado • Skin Netflix 100%",
        buildUrl: (id: string, s?: number, e?: number) =>
          `/api/vidsrc-player?tmdb=${tmdbId}&season=${s || season || 1}&episode=${e || episode || 1}`,
        isMatch: (u: string) => u.includes("/api/vidsrc-player") || u.includes("/api/vidsrc-stream") || u.includes("/api/vidsrc-proxy"),
        name: "Seriesflix HD (Dublado)"
      });
    }

    
    if (!nixplayAvailable) {
      list = list.filter(s => s.key !== "srv_nixplay");
    }

    // Aplica blocks dinâmicos vindos do painel admin (Firestore/painel via /api/server-blocks)
    // O admin pode bloquear qualquer server_key pra esse tmdbId (ex: srv_watchplay pra F1).
    if (blockedServerKeys.size > 0) {
      list = list.filter(s => !blockedServerKeys.has(s.key));
    }

    // Aplica a lista negra permanente (hardcoded em src/data/serverBlacklist.ts)
    list = list.filter(s => !isServerBlacklisted(s.key));

    return list;
  }, [isSeries, imdbId, defaultUrl, mixdropFileId, tmdbId, resolvedId, season, episode, nixplayAvailable, blockedServerKeys]);
  // Ref para leitura da lista de servidores sem forçar re-execução de effects
  const serversRef = useRef(servers);
  serversRef.current = servers;

  // Quando o mixdropFileId chega do catálogo (via backend lookup ~50ms),
  // se o MixDrop já estiver selecionado, recarrega o iframe com o fileId correto.
  // DEPS MÍNIMAS: só [mixdropFileId] — outras vars causam re-render em cascata e spam de console.
  useEffect(() => {
    if (!mixdropFileId || !isOpen) return;
    if (selectedServerKey !== "srv_mixdrop") return;
    // Busca o servidor MixDrop (já recomputado pelo useMemo quando mixdropFileId mudou)
    const srv = servers.find(s => s.key === "srv_mixdrop");
    if (!srv) return;
    const newUrl = isSeries
      ? srv.buildUrl(resolvedId, season, episode)
      : srv.buildUrl(resolvedId);
    const resolvedNewUrl = resolveStreamIframeUrl(newUrl);
    // Só recarrega se a URL mudou de verdade (evita recargas desnecessárias)
    if (resolvedNewUrl && resolvedNewUrl !== activeIframeUrl) {
      console.log(`[MixDrop] Recarregando iframe com fileId HD: ${mixdropFileId}`);
      transitionEpochRef.current = Date.now();
      setIsLoading(true);
      setPlayerSkinReady(true);
      setUrlInput(newUrl);
      setActiveIframeUrl(resolvedNewUrl);
      setExtractedSource(newUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixdropFileId, season, episode]); // fileId + EP atual — closure sempre fresco

  // Handler para troca de servidor de forma transparente e silenciosa
  const handleServerSwitch = useCallback(async (serverKey: string) => {
    mixdropAttemptRef.current = 1; // Reseta tentativa intra-servidor
    hasSeekedInitialTimeRef.current = false; // Permite resumir do momento do erro
    setSelectedServerKey(serverKey);
    const srv = servers.find(s => s.key === serverKey);
    if (!srv) return;
    transitionEpochRef.current = Date.now();
    setIsLoading(true);
    // Para o MixDrop liberamos a skin imediatamente; para outros servidores aguardamos evento do stream real
    setPlayerSkinReady(serverKey === "srv_mixdrop");
    playbackConfirmedRef.current = false;
    setIframeVisible(false);
    setError(null);

    let newUrl: string;
    if (serverKey === "srv_mixdrop" && tmdbId) {
      // Resolve o fileId do episódio ATUAL antes de montar a URL,
      // para nunca tocar o embed do episódio anterior.
      const fid = await lookupMixdropFileId(season, episode);
      newUrl = fid
        ? buildMixdropStreamUrl(fid) || buildMixdropFallbackUrl()
        : buildMixdropFallbackUrl();
    } else {
      newUrl = isSeries
        ? srv.buildUrl(resolvedId, season, episode)
        : srv.buildUrl(resolvedId);
    }
    setUrlInput(newUrl);
    setActiveIframeUrl(resolveStreamIframeUrl(newUrl));
    setExtractedSource(newUrl);
    setIsLoading(false);
  }, [servers, isSeries, resolvedId, season, episode, tmdbId, lookupMixdropFileId, buildMixdropFallbackUrl]);

  // Fallback silencioso automático: comuta para o próximo player sem intervenção ou botões na tela
  const fallbackAttemptsRef = useRef<Set<string>>(new Set());
  const mixdropAttemptRef = useRef<number>(1);
  const retrySameServerRef = useRef<boolean>(false);
  const forceRetrySameServerRef = useRef<boolean>(false);
  const hasPlayedRef = useRef<boolean>(false);
  const pausedAtRef = useRef<number | null>(null);

  const handleSilentFallback = useCallback(() => {
    // 1. Fallback intra-servidor do MixDrop: se o primário falhou, tenta o outro catálogo
    if (selectedServerKey === "srv_mixdrop" && mixdropAttemptRef.current === 1) {
      // Se o link primário veio do Vizer (mixdrop === mixdrop_vizer), tenta o Encontrei
      // Se o link primário veio do Encontrei (mixdrop === mixdrop_encontrei), tenta o Vizer
      const isPrimaryVizer = mixdropFileId && mixdropVizerFileId && mixdropFileId === mixdropVizerFileId;
      const fallbackFileId = isPrimaryVizer ? mixdropEncontreiFileId : mixdropVizerFileId;
      
      if (fallbackFileId && fallbackFileId !== mixdropFileId) {
        const fallbackUrl = buildMixdropStreamUrl(fallbackFileId);
        if (fallbackUrl) {
          const fallbackSource = isPrimaryVizer ? "Encontrei" : "Vizer";
          console.warn(`[VideoPlayerModal] MixDrop primário falhou. Tentando MixDrop do ${fallbackSource}...`);
          mixdropAttemptRef.current = 2;
          hasSeekedInitialTimeRef.current = false;
          transitionEpochRef.current = Date.now();
          setIsLoading(true);
          setError(null);
          setUrlInput(fallbackUrl);
          setActiveIframeUrl(fallbackUrl);
          setExtractedSource(fallbackUrl);
          return; // Não pula de servidor ainda
        }
      }
    }

    // 2. Retry do mesmo servidor em caso de timeout de token (pausa longa)
    if ((!retrySameServerRef.current && lastKnownTimeRef.current > 2 && hasPlayedRef.current) || forceRetrySameServerRef.current) {
      console.warn(`[VideoPlayerModal] Possível expiração de token pós-pausa. Recarregando ${selectedServerKey} de forma transparente...`);
      retrySameServerRef.current = true;
      forceRetrySameServerRef.current = false;
      hasSeekedInitialTimeRef.current = false;
      handleServerSwitch(selectedServerKey);
      return;
    }

    fallbackAttemptsRef.current.add(selectedServerKey);
    // Identifica próximo servidor ainda não tentado
    const nextServer = servers.find(s => !fallbackAttemptsRef.current.has(s.key) && s.key !== selectedServerKey && !isServerBlacklisted(s.key));
    if (nextServer) {
      console.warn(`[VideoPlayerModal] Player atual (${selectedServerKey}) falhou ou demorou. Comutando silenciosamente para ${nextServer.name}...`);
      hasSeekedInitialTimeRef.current = false;
      handleServerSwitch(nextServer.key);
      return;
    }

    console.error("[VideoPlayerModal] Conteúdo indisponível nos servidores homologados.");
    setActiveIframeUrl(null);
    setPlayerSkinReady(false);
    setError("Este conteúdo ainda não está disponível nos servidores oficiais em versão Dublado PT-BR. Nossos servidores são atualizados constantemente.");
    setIsLoading(false);
  }, [servers, selectedServerKey, handleServerSwitch, mixdropFileId, mixdropVizerFileId, mixdropEncontreiFileId]);

  const silentFallbackRef = useRef(handleSilentFallback);
  silentFallbackRef.current = handleSilentFallback;

  // Watchdog inteligente de segurança: se o player demorar mais de 60s sem iniciar,
  // comuta automaticamente e silenciosamente para o próximo player disponível sem travar a experiência.
  // Tempo aumentado a pedido do usuário para permitir clique manual caso o Autoplay seja bloqueado.
  useEffect(() => {
    if (!activeIframeUrl || error) return;
    if (selectedServerKey === 'srv_consumet' || activeIframeUrl.includes('anime-stream')) return;
    const timeoutDuration = 60000; // 60 segundos (1 minuto)
    const timer = setTimeout(() => {
      if (!playbackConfirmedRef.current && !error) {
        console.warn(`[VideoPlayerModal] Player atual (${selectedServerKey}) demorou mais de ${timeoutDuration / 1000}s sem iniciar. Tentando fallback automático.`);
        handleSilentFallback();
      }
    }, timeoutDuration);
    return () => clearTimeout(timer);
  }, [activeIframeUrl, selectedServerKey, error, isAnimeMedia, handleSilentFallback]);

  // Ao abrir o modal ou mudar mídia: prioriza o Player 1 (WatchPlayer) com skin Netflix
  useEffect(() => {
    if (isOpen) {
      const parsed = parseMediaFromUrl(defaultUrl || "");
      const targetSeason = initialSeason || parsed.season || 1;
      const targetEpisode = initialEpisode || parsed.episode || 1;
      setSeason(targetSeason);
      setEpisode(targetEpisode);
      setBlockedAdsCount(0);
      setError(null);
      setIsLoading(true);
      setPlayerSkinReady(false); // Reset overlay anti-flash ao abrir/mudar mídia
      playbackConfirmedRef.current = false; // Reset de reprodução real
      setIframeVisible(false); // Oculta iframe até rodar
      // fallbackAttemptsRef não é mais limpo aqui cegamente. Limpamos quando volta a conexão ou toca com sucesso
      mixdropAttemptRef.current = 1;
      retrySameServerRef.current = false;
      hasPlayedRef.current = false;
      pausedAtRef.current = null;
      hasSeekedInitialTimeRef.current = false;
      lastKnownTimeRef.current = initialTime || 0;

      // Se solicitado abertura direta em tela cheia (ex: vindo do card "Continue Assistindo")
      if (autoFullscreen) {
        setIsWidescreen(true);
        const isSmartTV = /Tizen|Web0S|WebOS|SmartTV|SMART-TV|Roku|AOSP|BRAVIA|Vizio|NetCast/i.test(navigator.userAgent);
        const elem = document.documentElement;
        const requestFS =
          elem.requestFullscreen ||
          (elem as any).webkitRequestFullscreen ||
          (elem as any).mozRequestFullScreen ||
          (elem as any).msRequestFullscreen;

        if (requestFS && !document.fullscreenElement && !isSmartTV) {
          try {
            const fsPromise = requestFS.call(elem, { navigationUI: "hide" });
            if (fsPromise && typeof fsPromise.catch === "function") {
              fsPromise.catch(() => {
                try {
                  const fallbackPromise = requestFS.call(elem);
                  if (fallbackPromise && typeof fallbackPromise.catch === "function") {
                    fallbackPromise.catch(() => {});
                  }
                } catch(_){console.warn("Silenced error:", _);}
              });
            }
          } catch (_) {
            try {
              const fallbackPromise = requestFS.call(elem);
              if (fallbackPromise && typeof fallbackPromise.catch === "function") {
                fallbackPromise.catch(() => {});
              }
            } catch(_){console.warn("Silenced error:", _);}
          }
        }

        const isPortrait = typeof window !== "undefined" && window.innerHeight > window.innerWidth;
        if (isPortrait) {
          setIsRotated(true);
        } else {
          setIsRotated(false);
        }

        if (Capacitor.isNativePlatform()) {
          ScreenOrientation.lock({ orientation: 'landscape' }).then(() => setIsRotated(false)).catch(() => {});
        } else if (screen.orientation && typeof (screen.orientation as any).lock === "function" && !isSmartTV) {
          try {
            const lockPromise = (screen.orientation as any).lock("landscape");
            if (lockPromise && typeof lockPromise.then === "function") {
              lockPromise.then(() => {
                setIsRotated(false);
              }).catch(() => {});
            }
          } catch(_){console.warn("Silenced error:", _);}
        }
      }

      // Inicialização do servidor: prioriza MixDrop para links dedicados, e WatchPlayer como padrão
      const setupInitialServer = async () => {
        const isMixdropTarget =
          (defaultUrl && (defaultUrl.includes("mixdrop.") || defaultUrl.includes("mxdrop.") || defaultUrl.includes("/api/mixdrop-stream"))) ||
          resolvedId === "969681" ||
          imdbId === "tt22084616" ||
          (title && title.toUpperCase().includes("HOMEM-ARANHA: UM NOVO DIA"));

        let targetServerKey = isMixdropTarget ? "srv_mixdrop" : "srv_watchplay";
        let targetUrl: string;

        if (isSeries && targetSeason >= 5 && (String(tmdbId) === "126027" || String(resolvedId) === "126027")) {
          // Fantasmas T5 está homologada no MixDrop (Dublado PT-BR do Vizer) e no Seriesflix HD
          const fid = await lookupMixdropFileId(targetSeason, targetEpisode);
          if (fid) {
            targetServerKey = "srv_mixdrop";
            targetUrl = buildMixdropStreamUrl(fid) || "";
          } else {
            targetServerKey = "srv_vidsrc";
            const vsSrv = serversRef.current.find(s => s.key === "srv_vidsrc") || serversRef.current[0];
            targetUrl = vsSrv.buildUrl(resolvedId, targetSeason, targetEpisode);
          }
        } else if (isMixdropTarget && defaultUrl && (defaultUrl.includes("mixdrop.") || defaultUrl.includes("mxdrop."))) {
          targetUrl = defaultUrl;
        } else {
          const targetSrv = serversRef.current.find(s => s.key === targetServerKey) || serversRef.current[0];
          targetUrl = isSeries 
            ? targetSrv.buildUrl(resolvedId, targetSeason, targetEpisode)
            : targetSrv.buildUrl(resolvedId);
        }

        setSelectedServerKey(targetServerKey);

        setUrlInput(targetUrl);
        handleExtract(targetUrl);
      };

      setupInitialServer();
    } else {
      setActiveIframeUrl(null);
      setError(null);
      fallbackAttemptsRef.current.clear();
      mixdropAttemptRef.current = 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultUrl, isSeries, resolvedId, initialSeason, initialEpisode, imdbId]);

  // Converte URLs do WatchPlayer e MixDrop para endpoints otimizados com autoplay instantâneo e Skin Netflix
  const resolveStreamIframeUrl = (url: string) => {
    if (!url) return "";
    // Guard: se já é um endpoint /api/, retorna direto — evita double-encoding
    // Ex: /api/mixdrop-stream?url=https%3A%2F%2Fmxdrop.top%2Fe%2F{id}
    // sem esse guard, o includes("mxdrop.") abaixo batia no query string e re-encodava
    if (url.startsWith("/api/")) return url;
    if (url.includes("watchplay.shop")) {
      return `/api/watchplayer-stream?url=${encodeURIComponent(url)}`;
    }
    if (url.includes("myembed.biz") || url.includes("playerflix.ink")) {
      const parsed = parseMediaFromUrl(url);
      const targetId = parsed.id || imdbId || resolvedId;
      const targetType = parsed.isSeries ? "tv" : "movie";
      return `/api/myembed-stream?id=${targetId}&type=${targetType}&s=${parsed.season || season}&e=${parsed.episode || episode}&cb=${Date.now()}`;
    }
    if (url.includes("REMOVED.stream")) {
      return url; // Removido
    }
    if (url.includes("mxdrop.") || url.includes("mixdrop.")) {
      return `/api/mixdrop-stream?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // Origens confiáveis para recepção de eventos do player
  const isTrustedPlayerEvent = (event: MessageEvent): boolean => {
    // 1. Só aceita mensagens vindas do iframe do player ou da própria janela da aplicação
    if (iframeRef.current?.contentWindow && event.source !== iframeRef.current.contentWindow && event.source !== window) {
      return false;
    }
    // 2. Valida origem da mensagem
    if (!event.origin) return false;
    const allowedOrigins = [
      window.location.origin,
      "https://v1.watchplay.shop",
      "https://watchplay.shop",
      "https://api.NO_LONGER_USED.stream",
      "https://NO_LONGER_USED.stream",
      "https://mxdrop.top",
      "https://mixdrop.co",
      "https://mixdrop.to",
      "https://player.videasy.to",
      "https://videasy.to",
      "https://superflixapi.top",
    ];
    if (allowedOrigins.includes(event.origin)) return true;
    if (event.origin === "null" && iframeRef.current?.contentWindow && event.source === iframeRef.current.contentWindow) {
      return true;
    }
    if (iframeRef.current?.src) {
      try {
        const parsed = new URL(iframeRef.current.src, window.location.origin);
        if (parsed.origin === event.origin) return true;
      } catch(e){console.warn("Silenced error:", e);}
    }
    return false;
  };

  // Escuta postMessages emitidos pelo WatchPlayer com validação de segurança
  useEffect(() => {
    const handlePlayerWindowMessages = (event: MessageEvent) => {
      if (!isTrustedPlayerEvent(event)) return;
      if (!event.data) return;

      // Remove overlay preto quando o player estiver pronto (duration > 0)
      const msgType = event.data.type || event.data.event;
      const isStatusMessage = msgType === "WATCHPLAY_STATUS" ||
          msgType === "PLAYER_STATUS" ||
          msgType === "status" ||
          msgType === "timeupdate" ||
          msgType === "PLAYER_EVENT";

      if (isStatusMessage) {
        const data = (msgType === "PLAYER_EVENT" && event.data.data) ? event.data.data : (event.data.data || event.data);
        const incomingTime = typeof data.currentTime === "number" ? data.currentTime : 0;
        
        // Se acabamos de trocar de episódio/temporada, descarta mensagens residuais
        // do vídeo anterior que ainda estavam na fila com posição adiantada (> 4s)
        const isRecentTransition = Date.now() - transitionEpochRef.current < 1500;
        if (isRecentTransition && incomingTime > 4) {
          return;
        }

        // --- LÓGICA DE PAUSA BLINDADA (Triplo Check) ---
        let isPaused: boolean | undefined = undefined;

        // 1. Sinais explícitos do player
        if (data.paused === true || data.paused === "true" || data.event === "pause" || msgType === "pause") {
          isPaused = true;
        } else if (data.paused === false || data.paused === "false" || data.event === "play" || data.event === "playing" || msgType === "play" || msgType === "playing") {
          isPaused = false;
        }

        // 2. Sinais implícitos (Evolução do relógio = tocando)
        if (isPaused === undefined && incomingTime > 0) {
          const diff = incomingTime - lastKnownTimeRef.current;
          // Se o relógio andou pra frente numa fração normal, está tocando.
          // Trocamos diff > 0.05 por diff > 0 para prever players que emitem timeupdate a 60fps (diff = 0.016)
          // Se o diff for muito alto (> 1.5s), foi um Seek (usuário saltou no tempo).
          if (diff > 0 && diff < 1.5) {
            isPaused = false;
          }
        }

        // 3. Aplica o cronômetro
        if (isPaused === true) {
          if (!pausedAtRef.current) pausedAtRef.current = Date.now();
        } else if (isPaused === false) {
          hasPlayedRef.current = true;
          if (pausedAtRef.current && Date.now() - pausedAtRef.current > 3 * 60 * 1000) {
            console.warn("[VideoPlayerModal] Pausa longa detectada (> 3 min). Forçando reload proativo...");
            pausedAtRef.current = null;
            retrySameServerRef.current = false;
            forceRetrySameServerRef.current = true;
            silentFallbackRef.current();
            return;
          }
          pausedAtRef.current = null;
        }

        // 4. Atualiza a memória de tempo (deve ser DEPOIS do diff)
        if (incomingTime > 0) {
          lastKnownTimeRef.current = incomingTime;
        }

        if (!playbackConfirmedRef.current) {
          if (
            (typeof data.duration === "number" && data.duration > 0) ||
            (typeof data.currentTime === "number" && data.currentTime > 0) ||
            (typeof data.readyState === "number" && data.readyState >= 1)
          ) {
            // Se for transição recente (< 800ms), aguarda estabilização do novo frame
            if (isRecentTransition && Date.now() - transitionEpochRef.current < 800) {
              return;
            }

            playbackConfirmedRef.current = true;
            setPlayerSkinReady(true);
            retrySameServerRef.current = false;
            fallbackAttemptsRef.current.clear();
            mixdropAttemptRef.current = 1;

            // Salto automático para o segundo exato salvo se aberto via "Continuar Assistindo"
            if (lastKnownTimeRef.current && lastKnownTimeRef.current > 2 && !hasSeekedInitialTimeRef.current) {
              hasSeekedInitialTimeRef.current = true;
              try {
                iframeRef.current?.contentWindow?.postMessage({ type: "SEEK", targetTime: lastKnownTimeRef.current }, "*");
                iframeRef.current?.contentWindow?.postMessage({ type: "SEEK_ABSOLUTE", time: lastKnownTimeRef.current }, "*");
                iframeRef.current?.contentWindow?.postMessage({ type: "seek", time: lastKnownTimeRef.current }, "*");
              } catch(err){console.warn("Silenced error:", err);}
            }
          }
        }

        // Revela o iframe (remove opacity-0) apenas quando o vídeo começou a tocar, para esconder botões nativos gigantes
        if (
          !iframeVisible &&
          ((typeof data.currentTime === "number" && data.currentTime > 0.1) ||
          data.paused === false ||
          (typeof data.readyState === "number" && data.readyState >= 3))
        ) {
          setIframeVisible(true);
        }
      }

      const isEnded = event.data.type === "WATCHPLAY_VIDEO_ENDED" ||
        (event.data.type === "PLAYER_EVENT" && event.data.data?.event === "ended");

      if (isEnded) {
        if (isSeries) {
          const totalEpCount = seasonData?.episodes?.length || 0;
          const hasNextEpInSeason = totalEpCount > 0 ? (episode < totalEpCount) : true; // fallback if we don't know

          if (hasNextEpInSeason) {
            const nextEp = episode + 1;
            console.log(`[Player Auto-Next] Episódio ${episode} encerrado. Passando e iniciando episódio ${nextEp}...`);
            setAutoNextNotice({ nextEp });
            handleEpisodeChange(nextEp);
            setTimeout(() => setAutoNextNotice(null), 4500);
          } else {
            const totalSeasons = seriesDetails?.number_of_seasons || 0;
            const hasNextSeason = totalSeasons > 0 && season < totalSeasons;

            if (hasNextSeason) {
              const nextSeason = season + 1;
              console.log(`[Player Auto-Next] Temporada ${season} encerrada. Passando para Temp ${nextSeason} Ep 1...`);
              
              if (resolvedId) markEpisodeWatched(resolvedId, season, episode, true);
              try { iframeRef.current?.contentWindow?.postMessage({ type: "PAUSE" }, "*"); } catch(e){console.warn("Silenced error:", e);}
              
              transitionEpochRef.current = Date.now();
              setSeason(nextSeason);
              setEpisode(1);
              lastKnownTimeRef.current = 0;
              setIsIntroActive(false);
              setPlayerSkinReady(false);
              playbackConfirmedRef.current = false;
              setIframeVisible(false);
              fallbackAttemptsRef.current.clear();
              mixdropAttemptRef.current = 1;
              
              const activeServer = servers.find(s => s.key === selectedServerKey) || servers[0];
              const newUrl = activeServer.buildUrl(resolvedId, nextSeason, 1);
              setUrlInput(newUrl);
              setActiveIframeUrl(resolveStreamIframeUrl(newUrl));
              setExtractedSource(newUrl);
            } else {
              console.log(`[Player Auto-Next] Fim da série alcançado.`);
            }
          }
        }
      } else if (event.data.type === "WATCHPLAY_INTRO_ACTIVE") {
        setIsIntroActive(!!event.data.active);
      } else if (event.data.type === "WATCHPLAY_INTRO_SKIPPED") {
        const sec = event.data.seconds || skipDurationSeconds;
        setSkipNotice(`Abertura pulada (+${sec}s)`);
        setIsIntroActive(false);
        setTimeout(() => {
          setSkipNotice(null);
        }, 3200);
      } else if (
        event.data.type === "WATCHPLAY_UNAVAILABLE" ||
        event.data.type === "WATCHPLAY_ERROR" ||
        event.data.type === "PLAYER_ERROR" ||
        event.data.type === "VIP_UNAVAILABLE" ||
        event.data.type === "STREAM_DISCONNECTED"
      ) {
        console.warn(`[VideoPlayerModal] Servidor informou erro/indisponibilidade (${event.data.reason || event.data.type}). Acionando fallback automático para próximo servidor homologado...`);
        silentFallbackRef.current();
      }
    };

    window.addEventListener("message", handlePlayerWindowMessages);
    return () => window.removeEventListener("message", handlePlayerWindowMessages);
  }, [isSeries, episode, season, resolvedId, skipDurationSeconds]);

  // Recuperação automática em caso de queda e retorno de conexão com a internet
  useEffect(() => {
    const handleOnline = () => {
      if (error) {
        console.log("[VideoPlayerModal] Conexão restaurada. Tentando reconectar servidor automaticamente...");
        fallbackAttemptsRef.current.clear();
        mixdropAttemptRef.current = 1;
        setError(null);
        setIsLoading(true);
        const srv = servers[0];
        if (srv) {
          handleServerSwitch(srv.key);
        }
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [error, servers, handleServerSwitch]);

  // Função para Pular Abertura (+85 segundos ou customizado)
  const handleSkipIntro = (customSeconds?: number) => {
    const sec = customSeconds || skipDurationSeconds;
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({ type: "SKIP_INTRO", seconds: sec }, "*");
      } catch(e){console.warn("Silenced error:", e);}
    }
    window.postMessage({ type: "SKIP_INTRO", seconds: sec }, "*");

    setLastSkippedSeconds(sec);
    setSkipNotice(`Abertura pulada (+${sec}s)`);
    setIsIntroActive(false);
    setTimeout(() => {
      setSkipNotice(null);
    }, 4000);
  };

  // Função para desfazer o salto caso tenha passado do ponto
  const handleUndoSkip = () => {
    const secToRewind = -(lastSkippedSeconds || skipDurationSeconds || 85);
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({ type: "SKIP_INTRO", seconds: secToRewind }, "*");
      } catch(e){console.warn("Silenced error:", e);}
    }
    window.postMessage({ type: "SKIP_INTRO", seconds: secToRewind }, "*");
    setLastSkippedSeconds(null);
    setSkipNotice(`Retornado (${Math.abs(secToRewind)}s)`);
    setTimeout(() => {
      setSkipNotice(null);
    }, 3000);
  };

  // Alterar tempo padrão do salto de abertura
  const handleChangeSkipDuration = (newSec: number) => {
    setSkipDurationSeconds(newSec);
    try {
      localStorage.setItem("playinfinity_skip_duration", String(newSec));
    } catch(e){console.warn("Silenced error:", e);}
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({
          type: "SET_SKIP_DURATION",
          seconds: newSec,
        }, "*");
      } catch(e){console.warn("Silenced error:", e);}
    }
  };

  // Handler to switch episode
  const handleEpisodeChange = async (newEpisode: number) => {
    if (newEpisode < 1) return;
    // Marca o episódio atual como assistido ao avançar
    if (isSeries && resolvedId) {
      markEpisodeWatched(resolvedId, season, episode, true);
    }
    // Pausa imediatamente o áudio do player anterior para evitar ruído residual
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: "PAUSE" }, "*");
    } catch(e){console.warn("Silenced error:", e);}

    transitionEpochRef.current = Date.now();
    setEpisode(newEpisode);
    lastKnownTimeRef.current = 0;
    setIsIntroActive(false);
    setPlayerSkinReady(false); // Reset overlay anti-flash ao trocar episódio
    playbackConfirmedRef.current = false;
    setIframeVisible(false);
    fallbackAttemptsRef.current.clear();
    mixdropAttemptRef.current = 1;

    const activeServer = servers.find(s => s.key === selectedServerKey) || servers[0];
    let newUrl: string;
    if (selectedServerKey === "srv_mixdrop" && tmdbId) {
      // Resolve o fileId DESTE episódio antes de montar a URL —
      // nunca reutiliza o fileId do episódio anterior (erro E4→E5→E6).
      const fid = await lookupMixdropFileId(season, newEpisode);
      newUrl = fid
        ? buildMixdropStreamUrl(fid) || buildMixdropFallbackUrl()
        : buildMixdropFallbackUrl();
    } else {
      newUrl = activeServer.buildUrl(resolvedId, season, newEpisode);
    }
    setUrlInput(newUrl);
    setActiveIframeUrl(resolveStreamIframeUrl(newUrl));
    setExtractedSource(newUrl);
  };

  // Handler to switch season
  const handleSeasonChange = async (newSeason: number) => {
    // Marca o episódio atual como assistido ao mudar de temporada
    if (isSeries && resolvedId) {
      markEpisodeWatched(resolvedId, season, episode, true);
    }
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: "PAUSE" }, "*");
    } catch(e){console.warn("Silenced error:", e);}

    transitionEpochRef.current = Date.now();
    setSeason(newSeason);
    setEpisode(1);
    lastKnownTimeRef.current = 0;
    setIsIntroActive(false);
    setPlayerSkinReady(false);
    playbackConfirmedRef.current = false;
    setIframeVisible(false);
    fallbackAttemptsRef.current.clear();
    mixdropAttemptRef.current = 1;

    let targetKey = selectedServerKey;
    if ((String(tmdbId) === "126027" || String(resolvedId) === "126027") && newSeason >= 5 && selectedServerKey === "srv_watchplay") {
      targetKey = "srv_mixdrop";
      setSelectedServerKey("srv_mixdrop");
    }

    const activeServer = servers.find(s => s.key === targetKey) || servers[0];
    let newUrl: string;
    if (targetKey === "srv_mixdrop" && tmdbId) {
      const fid = await lookupMixdropFileId(newSeason, 1);
      newUrl = fid
        ? buildMixdropStreamUrl(fid) || buildMixdropFallbackUrl()
        : buildMixdropFallbackUrl();
    } else {
      newUrl = activeServer.buildUrl(resolvedId, newSeason, 1);
    }
    setUrlInput(newUrl);
    setActiveIframeUrl(resolveStreamIframeUrl(newUrl));
    setExtractedSource(newUrl);
  };

  const handleExtract = async (rawInput: string) => {
    const cleanUrl = extractSrcFromInput(rawInput);
    if (!cleanUrl) return;

    setError(null);
    setIsLoading(true);

    if (isServerBlacklisted(cleanUrl) || isSuperflixUrl(cleanUrl)) {
      console.warn("[VideoPlayerModal] Tentativa de carregar servidor na blacklist bloqueada:", cleanUrl);
      handleSilentFallback();
      return;
    }

    if (
      cleanUrl.startsWith("/api/watchplayer-stream") ||
      cleanUrl.startsWith("/api/myembed-stream") ||
      cleanUrl.startsWith("/api/mixdrop-stream") ||
      cleanUrl.includes("watchplay.shop") ||
      cleanUrl.includes("myembed.biz") ||
      cleanUrl.includes("playerflix.ink") ||
      cleanUrl.includes("mixdrop.") ||
      cleanUrl.includes("mxdrop.") ||
      cleanUrl.startsWith("/api/native-player") ||
      cleanUrl.includes("nixplay.lat") ||
      cleanUrl.endsWith(".mp4")
    ) {
      setActiveIframeUrl(resolveStreamIframeUrl(cleanUrl));
      setExtractedSource(cleanUrl);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/extract-player?url=${encodeURIComponent(cleanUrl)}`);
      const data = await res.json();

      if (data.success && data.playerUrl) {
        setActiveIframeUrl(resolveStreamIframeUrl(data.playerUrl));
        setExtractedSource(data.playerUrl);
        setIsLoading(false);
      } else {
        handleSilentFallback();
      }
    } catch {
      handleSilentFallback();
    }
  };

  const copyUrl = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseModal = () => {
    const hasFS = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );
    if (hasFS) {
      try {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          (document as any).msExitFullscreen();
        }
      } catch(e){console.warn("Silenced error:", e);}
    }
    if (Capacitor.isNativePlatform()) {
      ScreenOrientation.unlock().catch(() => {});
    } else if (screen.orientation && typeof (screen.orientation as any).unlock === "function") {
      try {
        (screen.orientation as any).unlock();
      } catch(e){console.warn("Silenced error:", e);}
    }
    setIsWidescreen(false);
    setIsRotated(false);
    setIsMiniPlayer(false);
    setMiniPosition(null);
    setIsDragging(false);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      setIsMiniPlayer(false);
      setMiniPosition(null);
      setIsDragging(false);
    }
  }, [isOpen]);

  // Mantém o mini player contido na tela se houver redimensionamento da janela
  useEffect(() => {
    if (!isMiniPlayer || !miniPosition || !miniContainerRef.current) return;

    const handleResize = () => {
      const rect = miniContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxX = Math.max(8, window.innerWidth - rect.width - 8);
      const maxY = Math.max(8, window.innerHeight - rect.height - 8);

      setMiniPosition((prev) => {
        if (!prev) return null;
        const clampedX = Math.max(8, Math.min(maxX, prev.x));
        const clampedY = Math.max(8, Math.min(maxY, prev.y));
        if (clampedX === prev.x && clampedY === prev.y) return prev;
        return { x: clampedX, y: clampedY };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMiniPlayer, !miniPosition]);

  const handleMiniHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Apenas botão principal (esquerdo) ou toque
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("button")) return;
    if (!miniContainerRef.current) return;

    const rect = miniContainerRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    cardDimensionsRef.current = {
      width: rect.width,
      height: rect.height,
    };

    // Fixa a posição atual em pixels imediatamente para início de arraste suave sem pulos
    setMiniPosition({ x: rect.left, y: rect.top });
    setIsDragging(true);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch(_){console.warn("Silenced error:", _);}
  };

  const handleMiniHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const { width, height } = cardDimensionsRef.current;
    const minX = 8;
    const maxX = Math.max(minX, window.innerWidth - width - 8);
    const minY = 8;
    const maxY = Math.max(minY, window.innerHeight - height - 8);

    const rawX = e.clientX - dragOffsetRef.current.x;
    const rawY = e.clientY - dragOffsetRef.current.y;

    const clampedX = Math.max(minX, Math.min(maxX, rawX));
    const clampedY = Math.max(minY, Math.min(maxY, rawY));

    setMiniPosition({ x: clampedX, y: clampedY });
  };

  const handleMiniHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch(_){console.warn("Silenced error:", _);}
      setIsDragging(false);
    }
  };

  const handleFullScreen = async () => {
    const isCurrentlyFull = isExpanded || !!document.fullscreenElement;

    if (isCurrentlyFull) {
      setIsWidescreen(false);
      setIsRotated(false);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      if (Capacitor.isNativePlatform()) {
        ScreenOrientation.unlock().catch(() => {});
      } else if (screen.orientation && typeof (screen.orientation as any).unlock === "function") {
        try {
          (screen.orientation as any).unlock();
        } catch(e){console.warn("Silenced error:", e);}
      }
    } else {
      setIsWidescreen(true);

      // 1. Tenta tela cheia nativa do navegador IMEDIATAMENTE no clique síncrono com navigationUI: 'hide'
      const isSmartTV = /Tizen|Web0S|WebOS|SmartTV|SMART-TV|Roku|AOSP|BRAVIA|Vizio|NetCast/i.test(navigator.userAgent);
      const elem = document.documentElement;
      const requestFS =
        elem.requestFullscreen ||
        (elem as any).webkitRequestFullscreen ||
        (elem as any).mozRequestFullScreen ||
        (elem as any).msRequestFullscreen;

      if (requestFS && !isSmartTV) {
        try {
          await requestFS.call(elem, { navigationUI: "hide" });
        } catch {
          try {
            await requestFS.call(elem);
          } catch (err) {
            console.warn("Fullscreen request fallback:", err);
          }
        }
      }

      // 3. Se a tela estiver na vertical, ativa o fallback de rotação CSS
      const isPortrait = typeof window !== "undefined" && window.innerHeight > window.innerWidth;
      if (isPortrait) {
        setIsRotated(true);
      } else {
        setIsRotated(false);
      }

      // 2. Se o dispositivo tiver suporte a travar orientação em tela cheia (Android/Samsung Internet/Chrome)
      if (Capacitor.isNativePlatform()) {
        ScreenOrientation.lock({ orientation: 'landscape' }).then(() => {
          setIsRotated(false);
        }).catch(() => {});
      } else if (screen.orientation && typeof (screen.orientation as any).lock === "function" && !isSmartTV) {
        try {
          const lockPromise = (screen.orientation as any).lock("landscape");
          if (lockPromise && typeof lockPromise.then === "function") {
            lockPromise.then(() => {
              setIsRotated(false);
            }).catch(() => {});
          }
        } catch (err) {
          // Fallback
        }
      }
    }
  };

  const handleCastRequest = () => {
    setShowCastModal(true);
  };

  const handleToggleMiniPlayer = () => {
    if (isMiniPlayer) {
      // Ao sair do modo mini-player para crescer de novo, vai DIRETO para tela cheia
      setIsMiniPlayer(false);
      handleFullScreen();
    } else {
      if (isExpanded) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setIsWidescreen(false);
        setIsRotated(false);
      }
      if (miniPosition) {
        const width = miniContainerRef.current?.offsetWidth || 340;
        const height = miniContainerRef.current?.offsetHeight || 220;
        const maxX = Math.max(8, window.innerWidth - width - 8);
        const maxY = Math.max(8, window.innerHeight - height - 8);
        setMiniPosition({
          x: Math.max(8, Math.min(maxX, miniPosition.x)),
          y: Math.max(8, Math.min(maxY, miniPosition.y)),
        });
      }
      setIsMiniPlayer(true);
    }
  };

  const handleToggleRotate = () => {
    setIsRotated((prev) => !prev);
  };

  // Atalhos de teclado para navegar pelos episódios sem sair da tela cheia
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Não intercepta se estiver digitando em campo de texto
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "n" || e.key === "N") {
        if (isSeries) {
          e.preventDefault();
          handleEpisodeChange(episode + 1);
        }
      } else if (e.key === "p" || e.key === "P") {
        if (isSeries && episode > 1) {
          e.preventDefault();
          handleEpisodeChange(episode - 1);
        }
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleSkipIntro();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleFullScreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSeries, episode, season, resolvedId, skipDurationSeconds]);

  if (!isOpen) return null;

  const isSmartTV = typeof navigator !== 'undefined' && /Tizen|Web0S|WebOS|SmartTV|SMART-TV|Roku|AOSP|BRAVIA|Vizio|NetCast/i.test(navigator.userAgent);

  return (
    <div
      ref={miniContainerRef}
      style={
        isMiniPlayer && miniPosition
          ? {
              left: `${miniPosition.x}px`,
              top: `${miniPosition.y}px`,
              right: "auto",
              bottom: "auto",
            }
          : undefined
      }
      className={
        isMiniPlayer
          ? `fixed z-50 pointer-events-auto select-none ${
              !miniPosition ? "bottom-4 right-4" : ""
            } ${isDragging ? "transition-none" : "transition-[left,top] duration-150"} animate-in slide-in-from-bottom-5`
          : `fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200 ${
              isExpanded 
                ? "p-0 m-0 bg-black w-full h-full overflow-hidden" 
                : `p-2 sm:p-4 md:p-6 bg-black/95 ${!isSmartTV ? "backdrop-blur-xl" : ""}`
            }`
      }
    >
      {/* Overlay global enquanto arrasta para evitar que iframes capturem o cursor */}
      {isDragging && (
        <div
          className="fixed inset-0 z-[9999] cursor-grabbing select-none bg-transparent"
          onPointerMove={handleMiniHeaderPointerMove}
          onPointerUp={handleMiniHeaderPointerUp}
          onPointerCancel={handleMiniHeaderPointerUp}
        />
      )}

      <div
        className={`relative bg-[#111111] overflow-hidden flex flex-col transition-all duration-300 ${
          isMiniPlayer
            ? "w-[300px] xs:w-[340px] sm:w-[380px] rounded-2xl border border-neutral-700 shadow-2xl shadow-black/90"
            : isExpanded
            ? "w-full h-full max-w-none max-h-none border-0 rounded-none bg-black p-0 m-0"
            : "w-full max-w-5xl border border-neutral-800 rounded-2xl md:rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.9)] max-h-[96vh]"
        }`}
      >
        {/* Header do Mini-Player Flutuante (Arrastável) */}
        {isMiniPlayer && (
          <div
            onPointerDown={handleMiniHeaderPointerDown}
            onPointerMove={handleMiniHeaderPointerMove}
            onPointerUp={handleMiniHeaderPointerUp}
            onPointerCancel={handleMiniHeaderPointerUp}
            className={`flex items-center justify-between px-3 py-2 bg-[#161616] border-b border-neutral-800 text-xs select-none gap-2 touch-none ${
              isDragging ? "cursor-grabbing bg-[#1c1c1c]" : "cursor-grab hover:bg-[#1a1a1a]"
            } transition-colors`}
          >
            <div className="flex items-center gap-2 min-w-0 pointer-events-none">
              <div className="w-5 h-5 rounded-full bg-orange-600/20 text-orange-500 flex items-center justify-center shrink-0">
                <Play className="w-2.5 h-2.5 fill-current" />
              </div>
              <span className="text-white font-medium truncate text-xs">
                {title || "Reproduzindo..."}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleToggleMiniPlayer}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Restaurar em Tela Cheia"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleCloseModal}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Fechar Vídeo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Modal Header Padrão (apenas quando não expandido em tela cheia e nem mini player) */}
        {!isExpanded && !isMiniPlayer && (
          <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 border-b border-neutral-800/80 bg-[#161616] gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-orange-600/20 text-orange-500 border border-orange-500/30 flex items-center justify-center shrink-0">
                {isSeries ? <Tv className="w-4 h-4" /> : <Film className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-white font-bold text-sm sm:text-base leading-tight truncate max-w-[130px] xs:max-w-[200px] sm:max-w-xs md:max-w-md">
                    {title || "Reprodutor de Vídeo"}
                  </h2>
                  <span className="px-1.5 py-0.5 bg-orange-600/20 text-orange-400 border border-orange-500/30 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider hidden xs:inline">
                    {isSeries ? `T${season}:E${episode}` : "Filme"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Botão Fechar Modal */}
              <button
                onClick={handleCloseModal}
                className="p-1.5 sm:p-2 text-neutral-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                title="Fechar (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Series Controls: Season & Episode Quick Selector (apenas para séries e quando não expandido e nem mini player) */}
        {!isExpanded && !isMiniPlayer && isSeries && (
          <div className="px-4 sm:px-6 py-2.5 bg-gradient-to-r from-[#121214] via-[#161618] to-[#121214] border-b border-white/5 flex flex-wrap items-center justify-between gap-3 shadow-inner">
            
            {/* Bloco de Temporadas */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-300">
                <Layers className="w-3.5 h-3.5 text-orange-500" />
                <span>Temporada:</span>
              </div>
              
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5 overflow-x-auto scrollbar-hide max-w-full">
                {availableSeasons.map((s) => {
                  const sCount = seriesDetails?.seasons?.find(sn => sn.season_number === s)?.episode_count || (s === season ? totalSeasonEpisodes : 8);
                  const seasonDone = isSeasonFullyWatched(resolvedId, s, sCount);
                  const isCurrent = season === s;
                  return (
                    <button
                      key={s}
                      onClick={() => handleSeasonChange(s)}
                      className={`relative px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                        isCurrent
                          ? "bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md shadow-orange-600/30 font-extrabold"
                          : seasonDone
                            ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/50"
                            : "text-neutral-400 hover:text-white hover:bg-white/5"
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

              {/* Botão de Marcar Temporada Inteira como Vista */}
              {(() => {
                const isCurrentSeasonDone = isSeasonFullyWatched(resolvedId, season, totalSeasonEpisodes);
                const watchedCount = getSeasonWatchedCount(resolvedId, season, totalSeasonEpisodes);
                return (
                  <button
                    onClick={() => markSeasonWatched(resolvedId, season, totalSeasonEpisodes, !isCurrentSeasonDone)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer shrink-0 ${
                      isCurrentSeasonDone
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                        : "bg-white/5 text-neutral-300 border-white/10 hover:text-white hover:bg-white/10 hover:border-white/20"
                    }`}
                    title={
                      isCurrentSeasonDone
                        ? `Desmarcar Temporada ${season} inteira como assistida`
                        : `Marcar Temporada ${season} inteira como assistida (${watchedCount}/${totalSeasonEpisodes} vistos)`
                    }
                  >
                    <Check className={`w-3.5 h-3.5 ${isCurrentSeasonDone ? "text-emerald-400 stroke-[3]" : "text-neutral-400"}`} />
                    <span className="hidden sm:inline">
                      {isCurrentSeasonDone ? `T${season} Vista` : `Marcar T${season}`}
                    </span>
                    <span className="sm:hidden">
                      {isCurrentSeasonDone ? `T${season} ✓` : `Marcar T${season}`}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5 ${
                      isCurrentSeasonDone ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-neutral-400"
                    }`}>
                      {watchedCount}/{totalSeasonEpisodes}
                    </span>
                  </button>
                );
              })()}
            </div>

            {/* Bloco de Episódios */}
            {isCheckingEpisodes ? (
              <div className="flex items-center gap-2 text-sm text-neutral-400 py-1.5 px-3 bg-white/5 rounded-xl border border-white/5">
                <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                <span>Verificando episódios...</span>
              </div>
            ) : episodeNumbers.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-red-400 py-1.5 px-3 bg-red-950/30 rounded-xl border border-red-500/20">
                <AlertCircle className="w-4 h-4" />
                <span>Temporada não disponível no momento.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleEpisodeChange(episode - 1)}
                disabled={episode <= 1}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-white/5 text-neutral-300 hover:text-white text-xs font-semibold flex items-center gap-1 border border-white/5 transition-all cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1 px-0.5 max-w-[240px] sm:max-w-[400px] md:max-w-[500px]">
                {episodeNumbers.map((ep) => {
                  const watched = isEpisodeWatched(resolvedId, season, ep);
                  const isCurrent = episode === ep;
                  return (
                    <button
                      key={ep}
                      ref={isCurrent ? activeEpisodeBtnRef : null}
                      onClick={() => handleEpisodeChange(ep)}
                      title={watched ? `Episódio ${ep} (Assistido)` : `Episódio ${ep}`}
                      className={`relative w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                        isCurrent
                          ? "bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-600/30 scale-105 border border-orange-400/40"
                          : watched
                            ? "bg-emerald-950/40 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-900/60 hover:border-emerald-400/60"
                            : "bg-[#1a1a1d] text-neutral-300 hover:text-white hover:bg-[#25252a] border border-white/5"
                      }`}
                    >
                      <span>{ep}</span>
                      {watched && (
                        <span 
                          className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center shadow-md ${
                            isCurrent ? "bg-emerald-400 text-black" : "bg-emerald-500 text-white"
                          }`}
                        >
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => handleEpisodeChange(episode + 1)}
                disabled={episode >= totalSeasonEpisodes}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-white/5 text-neutral-300 hover:text-white text-xs font-semibold flex items-center gap-1 border border-white/5 transition-all cursor-pointer active:scale-95"
              >
                <span className="hidden sm:inline">Próximo</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              {/* Botão de Toggle Manual do Episódio Atual */}
              <button
                onClick={() => toggleEpisodeWatched(resolvedId, season, episode)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer backdrop-blur-sm active:scale-95 ${
                  isEpisodeWatched(resolvedId, season, episode)
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                    : "bg-white/5 text-neutral-300 border-white/10 hover:text-white hover:bg-white/10 hover:border-white/20"
                }`}
                title={isEpisodeWatched(resolvedId, season, episode) ? "Clique para desmarcar como assistido" : "Clique para marcar como assistido"}
              >
                <Check className={`w-3.5 h-3.5 ${isEpisodeWatched(resolvedId, season, episode) ? "text-emerald-400 stroke-[3]" : "text-neutral-400"}`} />
                <span className="hidden sm:inline">
                  {isEpisodeWatched(resolvedId, season, episode) ? "Episódio Visto" : "Marcar Visto"}
                </span>
                <span className="sm:hidden">
                  {isEpisodeWatched(resolvedId, season, episode) ? "Visto" : "Marcar"}
                </span>
              </button>
            </div>
            )}
          </div>
        )}

        {/* Player Video Stage: Mantém tela cheia contínua sem interrupções entre episódios */}
        <div 
          id="player-stage-container" 
          onMouseMove={handleStageMouseMove}
          onMouseLeave={handleStageMouseLeave}
          className={`relative w-full bg-black flex items-center justify-center overflow-hidden group select-none ${
            isExpanded ? "w-full h-full flex-1 fixed inset-0 z-[999999]" : "aspect-video"
          }`}
        >
          {/* Inner Viewport Rotacionável para modo Paisagem (Widescreen Deitado) no Celular */}
          <div
            style={
              isRotated
                ? {
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: "100dvh",
                    height: "100dvw",
                    maxWidth: "100dvh",
                    maxHeight: "100dvw",
                    transform: "translate(-50%, -50%) rotate(90deg)",
                    zIndex: 20,
                  }
                : {
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    zIndex: 20,
                  }
            }
            className="flex items-center justify-center bg-black overflow-hidden select-none"
          >
            {/* Notificação Flutuante de Avanço Automático */}
            {autoNextNotice && !isMiniPlayer && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 text-white text-xs sm:text-sm font-bold rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 duration-300 border border-white/25 pointer-events-none">
                <FastForward className="w-4 h-4 animate-pulse text-white" />
                <span>Episódio concluído! Reproduzindo Episódio {autoNextNotice.nextEp}...</span>
              </div>
            )}

            {/* Notificação Flutuante de Abertura Pulada */}
            {skipNotice && !isMiniPlayer && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 text-white text-xs sm:text-sm font-bold rounded-full shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 border border-white/25">
                <div className="flex items-center gap-2">
                  <SkipForward className="w-4 h-4 fill-current text-white" />
                  <span>{skipNotice}</span>
                </div>
                {lastSkippedSeconds && (
                  <button
                    onClick={handleUndoSkip}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/40 hover:bg-black/60 text-orange-200 text-xs font-semibold border border-white/20 transition-all active:scale-95 cursor-pointer ml-1"
                    title="Desfazer e retroceder vídeo"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Desfazer</span>
                  </button>
                )}
              </div>
            )}

            {/* NetflixPlayerSkin movido para o final (z-40) */}

            {/* Overlay Anti-Flash e Carregamento Contínuo: cobre a transição inteira até a mídia estar realmente pronta */}
            {activeIframeUrl && (!playerSkinReady || isLoading) && (
              <div
                className="absolute inset-0 bg-black z-40 flex flex-col items-center justify-center gap-3.5 pointer-events-none select-none"
                style={{ transition: "opacity 0.3s ease" }}
              >
                <Loader2 className="w-9 h-9 text-orange-500 animate-spin" />
                <p className="text-sm font-semibold text-white tracking-wide">
                  {isSeries ? `Carregando Episódio ${episode}...` : `Carregando ${title || "Vídeo"}...`}
                </p>
              </div>
            )}

            {activeIframeUrl && !error ? (
              <iframe
                key={`${activeIframeUrl}-${transitionEpochRef.current}`}
                ref={iframeRef}
                src={activeIframeUrl}
                title={title}
                className="w-full h-full border-0 bg-black"
                style={{
                  backgroundColor: "#000000",
                  opacity: iframeVisible ? 1 : 0,
                  transform:
                    aspectRatio === "cover"
                      ? "scale(1.35)"
                      : aspectRatio === "stretch"
                      ? "scale(1.0, 1.25)"
                      : "none",
                  transformOrigin: "center center",
                  transition: "transform 0.3s ease, opacity 0.5s ease",
                }}
                fetchPriority="high"
                allow="autoplay *; encrypted-media *; picture-in-picture *; fullscreen *; screen-wake-lock; accelerometer; gyroscope"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => {
                  setIsLoading(false);
                  if (activeIframeUrl?.includes("/api/") || selectedServerKey !== "external") {
                    setTimeout(() => setPlayerSkinReady(true), 500);
                  }
                }}
                onError={() => handleSilentFallback()}
              />
            ) : error ? (
              <div className="flex flex-col items-center max-w-lg p-6 text-center text-neutral-300 space-y-4">
                <div className="w-14 h-14 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <h3 className="font-bold text-white text-base">Conteúdo Indisponível</h3>
                <p className="text-xs text-neutral-400 leading-relaxed max-w-md">{error}</p>
                <div className="pt-2 flex gap-3 flex-wrap justify-center">
                  <button
                    onClick={() => {
                      fallbackAttemptsRef.current.clear();
                      mixdropAttemptRef.current = 1;
                      setError(null);
                      setIsLoading(true);
                      const srv = servers[0];
                      if (srv) {
                        handleServerSwitch(srv.key);
                      } else {
                        handleExtract(urlInput);
                      }
                    }}
                    className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-orange-600/20 active:scale-95"
                  >
                    <RefreshCw className="w-4 h-4" /> Tentar novamente
                  </button>
                  <button
                    onClick={handleCloseModal}
                    className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer active:scale-95"
                  >
                    Voltar ao Catálogo
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-neutral-500 space-y-2">
                <Play className="w-12 h-12 opacity-30" />
                <p className="text-sm">Clique em "Reproduzir" para iniciar</p>
              </div>
            )}

            {/* Player Oficial Estilo Netflix Cinematográfico */}
            <div className={`absolute inset-0 pointer-events-none ${isNativePiP ? 'hidden' : ''}`}>
              <NetflixPlayerSkin
                mediaId={resolvedId}
              tmdbId={tmdbId}
              imdbId={imdbId}
              title={title}
              isSeries={isSeries}
              season={season}
              episode={episode}
              totalEpisodes={totalSeasonEpisodes}
              availableSeasons={availableSeasons}
              activeServerKey={selectedServerKey}
              onServerChange={handleServerSwitch}
              serversList={servers}
              onSeasonChange={handleSeasonChange}
              episodesList={filteredSeasonEpisodes.length > 0 ? filteredSeasonEpisodes : seasonData?.episodes}
              onClose={handleCloseModal}
              onCastRequest={handleCastRequest}
              onEpisodeChange={handleEpisodeChange}
              onSkipIntro={() => handleSkipIntro()}
              skipDurationSeconds={skipDurationSeconds}
              isIntroActive={isIntroActive}
              isFullscreen={isExpanded}
              onToggleFullscreen={handleFullScreen}
              iframeRef={iframeRef}
              isRotated={isRotated}
              onToggleRotate={handleToggleRotate}
              isExternalPlayer={isExternalPlayer}
              imageUrl={imageUrl}
              backdropUrl={backdropUrl}
              posterUrl={posterUrl}
              quality={quality}
              isCam={isCamMovie}
              aspectRatio={aspectRatio}
              onToggleAspectRatio={handleToggleAspectRatio}
              onTogglePiP={handleToggleMiniPlayer}
              isMiniPlayer={isMiniPlayer}
              passThroughClicks={isExternalPlayer || !playerSkinReady || !iframeVisible}
              subtitleUrl={subtitleUrl}
            />
            </div>
          </div>
        </div>
        {/* CastModal removido do VideoPlayerModal, agora reside apenas na DetailsPage */}
      </div>
    </div>
  );
}
