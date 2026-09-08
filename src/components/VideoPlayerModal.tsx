import { useState, useEffect, useMemo, useRef } from "react";
import { 
  X, Play, Loader2, AlertCircle, RefreshCw, ExternalLink, 
  Check, Sparkles, Radio, ShieldCheck,
  Tv, Film, ChevronLeft, ChevronRight, Layers, Maximize2, Minimize2, FastForward,
  SkipForward, RotateCcw, HelpCircle, SlidersHorizontal
} from "lucide-react";
import { NetflixPlayerSkin } from "./NetflixPlayerSkin";
import { checkIsCam } from "../data";

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

// Extrai informações da mídia caso não sejam fornecidas explicitamente
function parseMediaFromUrl(url: string) {
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
}: VideoPlayerModalProps) {
  const isCamMovie = isCam || checkIsCam(title, quality);
  const [urlInput, setUrlInput] = useState(
    defaultUrl || "https://v1.watchplay.shop/tvshow/66732/1/1"
  );
  const [activeIframeUrl, setActiveIframeUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedSource, setExtractedSource] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Series Season & Episode State
  const [season, setSeason] = useState<number>(initialSeason);
  const [episode, setEpisode] = useState<number>(initialEpisode);
  const [selectedServerKey, setSelectedServerKey] = useState<string>("srv1");
  const [blockedAdsCount, setBlockedAdsCount] = useState<number>(0);
  const [antiAdShield, setAntiAdShield] = useState<boolean>(true);
  const [autoNextNotice, setAutoNextNotice] = useState<{ nextEp: number } | null>(null);

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
  const [showSkipSettings, setShowSkipSettings] = useState<boolean>(false);
  const [showIntroHelp, setShowIntroHelp] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Fullscreen & Widescreen state tracking
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isWidescreen, setIsWidescreen] = useState<boolean>(false);
  const [isRotated, setIsRotated] = useState<boolean>(false);
  const isExpanded = isFullscreen || isWidescreen;
  const [showStageControls, setShowStageControls] = useState<boolean>(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sincroniza estado de tela cheia do navegador
  useEffect(() => {
    const handleFullscreenStateChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      if (!isCurrentlyFullscreen) {
        setIsWidescreen(false);
        setIsRotated(false);
        if (screen.orientation && typeof (screen.orientation as any).unlock === "function") {
          try {
            (screen.orientation as any).unlock();
          } catch (e) {}
        }
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenStateChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenStateChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenStateChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenStateChange);
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
    return () => {
      window.removeEventListener("resize", handleOrientationOrResize);
      window.removeEventListener("orientationchange", handleOrientationOrResize);
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

    // 2. Previne desvio da aba principal do Play Infinity
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      return (e.returnValue = "");
    };

    // 3. Recupera o foco da janela caso um popup/popunder tente roubar o foco
    const handleBlur = () => {
      setTimeout(() => {
        window.focus();
      }, 50);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.open = originalWindowOpen;
      window.removeEventListener("beforeunload", handleBeforeUnload);
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
    return isSeries ? "66732" : "tt22084616";
  }, [tmdbId, imdbId, urlInput, isSeries]);

  // Servidor Oficial: WatchPlayer VIP Exclusivo (Autoplay imediato e avanço automático de episódios)
  const servers = useMemo(() => {
    if (isSeries) {
      return [
        {
          key: "srv1",
          label: "WatchPlayer VIP",
          badge: "Dublado BR • Autoplay Contínuo",
          buildUrl: (id: string, s: number, e: number) => 
            `https://v1.watchplay.shop/tvshow/${id}/${s}/${e}`,
          isMatch: (u: string) => u.includes("watchplay.shop"),
        },
      ];
    } else {
      return [
        {
          key: "srv1",
          label: "WatchPlayer VIP",
          badge: "Dublado BR • Sem Anúncios",
          buildUrl: (id: string) => `https://v1.watchplay.shop/movie/${imdbId || id}`,
          isMatch: (u: string) => u.includes("watchplay.shop"),
        },
      ];
    }
  }, [isSeries, imdbId]);

  // When modal opens or input changes, configure the player
  useEffect(() => {
    if (isOpen) {
      const parsed = parseMediaFromUrl(defaultUrl || "");
      const targetSeason = initialSeason || parsed.season || 1;
      const targetEpisode = initialEpisode || parsed.episode || 1;
      setSeason(targetSeason);
      setEpisode(targetEpisode);
      setBlockedAdsCount(0);

      // Gerar a URL padrão do WatchPlayer VIP para séries e filmes
      const watchPlayerUrl = isSeries 
        ? `https://v1.watchplay.shop/tvshow/${resolvedId}/${targetSeason}/${targetEpisode}` 
        : `https://v1.watchplay.shop/movie/${imdbId || resolvedId}`;

      let initial = defaultUrl;
      let targetServerKey = "srv1";

      if (
        !initial || 
        initial.includes("watchplay.shop") ||
        initial.includes("vidlink.pro") ||
        initial.includes("anyembed") || 
        initial.includes("2embed.cc") || 
        initial.includes("myembed.biz") || 
        initial.includes("playerflix")
      ) {
        initial = watchPlayerUrl;
        targetServerKey = "srv1";
      } else {
        const found = servers.find(s => s.isMatch(initial));
        if (found) {
          targetServerKey = found.key;
        }
      }

      setSelectedServerKey(targetServerKey);
      setUrlInput(initial);
      handleExtract(initial);
    } else {
      setActiveIframeUrl(null);
      setError(null);
    }
  }, [isOpen, defaultUrl, isSeries, resolvedId, initialSeason, initialEpisode, imdbId]);

  // Converte URLs do WatchPlayer para o endpoint com autoplay instantâneo (sem opções intermediárias)
  const resolveStreamIframeUrl = (url: string) => {
    if (url.includes("watchplay.shop")) {
      return `/api/watchplayer-stream?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // Escuta postMessages emitidos pelo WatchPlayer (fim de episódio, status de abertura, etc.)
  useEffect(() => {
    const handlePlayerWindowMessages = (event: MessageEvent) => {
      if (!event.data) return;

      if (event.data.type === "WATCHPLAY_VIDEO_ENDED") {
        if (isSeries) {
          const nextEp = episode + 1;
          console.log(`[WatchPlayer Auto-Next] Episódio ${episode} encerrado. Passando e iniciando episódio ${nextEp}...`);
          setAutoNextNotice({ nextEp });

          // Passa imediatamente para o próximo episódio e inicia sozinho
          handleEpisodeChange(nextEp);

          setTimeout(() => {
            setAutoNextNotice(null);
          }, 4500);
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
      }
    };

    window.addEventListener("message", handlePlayerWindowMessages);
    return () => window.removeEventListener("message", handlePlayerWindowMessages);
  }, [isSeries, episode, season, resolvedId, skipDurationSeconds]);

  // Função para Pular Abertura (+85 segundos ou customizado)
  const handleSkipIntro = (customSeconds?: number) => {
    const sec = customSeconds || skipDurationSeconds;
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({ type: "SKIP_INTRO", seconds: sec }, "*");
      } catch (e) {}
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
      } catch (e) {}
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
    } catch (e) {}
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({
          type: "SET_SKIP_DURATION",
          seconds: newSec,
        }, "*");
      } catch (e) {}
    }
  };

  // Handler to switch episode
  const handleEpisodeChange = (newEpisode: number) => {
    if (newEpisode < 1) return;
    setEpisode(newEpisode);
    setIsIntroActive(false);
    const activeServer = servers.find(s => s.key === selectedServerKey) || servers[0];
    const newUrl = activeServer.buildUrl(resolvedId, season, newEpisode);
    setUrlInput(newUrl);
    setActiveIframeUrl(resolveStreamIframeUrl(newUrl));
    setExtractedSource(newUrl);
  };

  // Handler to switch season
  const handleSeasonChange = (newSeason: number) => {
    setSeason(newSeason);
    setEpisode(1);
    setIsIntroActive(false);
    const activeServer = servers.find(s => s.key === selectedServerKey) || servers[0];
    const newUrl = activeServer.buildUrl(resolvedId, newSeason, 1);
    setUrlInput(newUrl);
    setActiveIframeUrl(resolveStreamIframeUrl(newUrl));
    setExtractedSource(newUrl);
  };

  // Handler to switch server
  const handleServerSwitch = (serverKey: string) => {
    setSelectedServerKey(serverKey);
    const srv = servers.find(s => s.key === serverKey);
    if (!srv) return;
    const newUrl = srv.buildUrl(resolvedId, season, episode);
    setUrlInput(newUrl);
    setActiveIframeUrl(resolveStreamIframeUrl(newUrl));
    setExtractedSource(newUrl);
  };

  const handleExtract = async (rawInput: string) => {
    const cleanUrl = extractSrcFromInput(rawInput);
    if (!cleanUrl) return;

    setError(null);
    setIsLoading(true);

    if (
      cleanUrl.includes("watchplay.shop") ||
      cleanUrl.includes("vidlink.pro") || 
      cleanUrl.includes("videasy") || 
      cleanUrl.includes("vidsrc") || 
      cleanUrl.includes("superflixapi") || 
      cleanUrl.includes("embed.su") || 
      cleanUrl.includes("myembed") ||
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
      } else {
        setActiveIframeUrl(resolveStreamIframeUrl(cleanUrl));
        setExtractedSource(cleanUrl);
      }
    } catch (err: any) {
      setActiveIframeUrl(resolveStreamIframeUrl(cleanUrl));
      setExtractedSource(cleanUrl);
    } finally {
      setIsLoading(false);
    }
  };

  const copyUrl = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFullScreen = async () => {
    const stage = document.getElementById("player-stage-container");
    const isCurrentlyFull = !!document.fullscreenElement || isWidescreen;

    if (isCurrentlyFull) {
      setIsWidescreen(false);
      setIsRotated(false);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      if (screen.orientation && typeof (screen.orientation as any).unlock === "function") {
        try {
          (screen.orientation as any).unlock();
        } catch (e) {}
      }
    } else {
      setIsWidescreen(true);

      // Tenta travar em orientação paisagem no mobile
      if (screen.orientation && typeof (screen.orientation as any).lock === "function") {
        try {
          (screen.orientation as any).lock("landscape").catch(() => {});
        } catch (err) {}
      }

      // Se a tela estiver na vertical (celular em pé), gira automaticamente em 90° para widescreen total
      if (typeof window !== "undefined" && window.innerHeight > window.innerWidth) {
        setIsRotated(true);
      } else {
        setIsRotated(false);
      }

      if (stage) {
        try {
          if (stage.requestFullscreen) {
            await stage.requestFullscreen();
          } else if ((stage as any).webkitRequestFullscreen) {
            await (stage as any).webkitRequestFullscreen();
          }
        } catch (err) {
          console.log("Fullscreen API nativo indisponível, ativando modo Widescreen total:", err);
        }
      }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="relative w-full max-w-5xl bg-[#111111] border border-neutral-800 rounded-2xl md:rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col max-h-[96vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-neutral-800/80 bg-[#161616]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-600/20 text-orange-500 border border-orange-500/30 flex items-center justify-center">
              {isSeries ? <Tv className="w-4 h-4" /> : <Film className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-white font-bold text-base md:text-lg leading-tight truncate max-w-[180px] sm:max-w-md">
                  {title || "Reprodutor de Vídeo"}
                </h2>
                <span className="px-2 py-0.5 bg-orange-600/20 text-orange-400 border border-orange-500/30 rounded text-[10px] font-bold uppercase tracking-wider hidden sm:inline">
                  {isSeries ? `Série • T${season}:E${episode}` : "Filme"}
                </span>
              </div>
              <span className="text-xs text-neutral-400 font-medium flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                Servidor: {servers.find(s => s.key === selectedServerKey)?.label || "Principal"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              title="Fechar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WatchPlayer VIP Status Bar & Auto-Next Indicator */}
        <div className="px-4 sm:px-5 py-2.5 bg-[#0e0e0e] border-b border-neutral-800/80 flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600/15 border border-orange-500/30 text-orange-400 text-xs font-semibold">
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>WatchPlayer VIP</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-orange-600 text-white ml-1 font-bold">
                Dublado BR
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs shrink-0">
            {isSeries && (
              <>
                {/* Botão de Pular Abertura */}
                <button
                  onClick={() => handleSkipIntro()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all shadow-md shadow-orange-600/20 active:scale-95 cursor-pointer border border-orange-400/40"
                  title="Pular Abertura da Série agora (Atalho: Tecla S)"
                >
                  <SkipForward className="w-3.5 h-3.5 fill-current" />
                  <span>Pular Abertura</span>
                  <span className="text-[10px] bg-black/40 px-1.5 py-0.2 rounded font-mono font-bold text-orange-200">
                    +{skipDurationSeconds}s (S)
                  </span>
                </button>

                {/* Seletor de Segundos de Salto */}
                <div className="hidden sm:flex items-center bg-neutral-900 border border-neutral-800 rounded-xl p-0.5 text-[11px]">
                  {[30, 60, 85, 90].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => handleChangeSkipDuration(sec)}
                      className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        skipDurationSeconds === sec
                          ? "bg-orange-600 text-white shadow-sm"
                          : "text-neutral-400 hover:text-white"
                      }`}
                      title={`Definir salto para +${sec} segundos`}
                    >
                      +{sec}s
                    </button>
                  ))}
                </div>

                {/* Botão de Ajuda / Como Funciona */}
                <div className="relative">
                  <button
                    onClick={() => setShowIntroHelp(prev => !prev)}
                    className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white border border-neutral-700 transition-colors cursor-pointer"
                    title="Como funciona o pulo de aberturas?"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>

                  {/* Popover Explicativo */}
                  {showIntroHelp && (
                    <div className="absolute right-0 top-10 z-50 w-72 sm:w-80 p-4 rounded-2xl bg-[#161616] border border-neutral-700 shadow-2xl text-left text-xs text-neutral-200 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <SkipForward className="w-3.5 h-3.5 text-orange-500" />
                          Como funciona o Pular Abertura?
                        </span>
                        <button onClick={() => setShowIntroHelp(false)} className="text-neutral-400 hover:text-white">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-neutral-300 leading-relaxed mb-2.5">
                        <strong className="text-orange-400">Total controle com a Tecla S ou Botão:</strong><br />
                        Muitas séries começam com uma cena importante antes da vinheta de abertura (o <em>Cold Open</em>). Por isso, o pulo é 100% sob seu comando para você nunca perder cenas da história por engano!
                      </p>
                      <p className="text-neutral-300 leading-relaxed mb-2.5">
                        Assim que a música da vinheta começar, aperte a <strong className="text-white">Tecla S</strong> ou clique em <strong className="text-orange-400">Pular Abertura</strong>. Se avançar um pouco além, basta clicar em <strong className="text-white">Desfazer</strong>!
                      </p>
                      <div className="bg-neutral-900/80 p-2.5 rounded-xl border border-neutral-800 space-y-1 text-[11px]">
                        <div><strong className="text-neutral-300">Ajuste de Tempo:</strong> Escolha entre +30s, +60s, +85s (padrão de séries) ou +90s (animes).</div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {isSeries && (
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs font-semibold">
                <FastForward className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
                <span>Próximo Ep: Auto</span>
              </div>
            )}
            <button
              onClick={() => setAntiAdShield(prev => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                antiAdShield 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20" 
                  : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700"
              }`}
              title={antiAdShield ? "Escudo ativo: Popups e abas bloqueados ao clicar no player" : "Clique para reativar o bloqueio de anúncios"}
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${antiAdShield ? "text-emerald-400" : "text-neutral-400"}`} />
              <span className="hidden sm:inline">Escudo Anti-Anúncios</span>
            </button>
          </div>
        </div>

        {/* Series Controls: Season & Episode Quick Selector */}
        {isSeries && (
          <div className="px-4 sm:px-5 py-2.5 bg-[#141414] border-b border-neutral-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-orange-500" /> Temporada:
              </span>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSeasonChange(s)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      season === s
                        ? "bg-orange-600 text-white"
                        : "bg-[#202020] text-neutral-400 hover:text-white hover:bg-[#2a2a2a] border border-neutral-800"
                    }`}
                  >
                    T{s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleEpisodeChange(episode - 1)}
                disabled={episode <= 1}
                className="px-2.5 py-1 rounded-lg bg-[#202020] hover:bg-[#2a2a2a] disabled:opacity-30 disabled:hover:bg-[#202020] text-white text-xs font-semibold flex items-center gap-1 border border-neutral-800 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>

              <div className="flex items-center gap-1 overflow-x-auto max-w-[280px] sm:max-w-md py-0.5">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((ep) => (
                  <button
                    key={ep}
                    onClick={() => handleEpisodeChange(ep)}
                    className={`min-w-[28px] h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      episode === ep
                        ? "bg-orange-600 text-white shadow-md shadow-orange-600/30 scale-105"
                        : "bg-[#202020] text-neutral-300 hover:text-white hover:bg-[#2a2a2a] border border-neutral-800"
                    }`}
                  >
                    {ep}
                  </button>
                ))}
              </div>

              <button
                onClick={() => handleEpisodeChange(episode + 1)}
                className="px-2.5 py-1 rounded-lg bg-[#202020] hover:bg-[#2a2a2a] text-white text-xs font-semibold flex items-center gap-1 border border-neutral-800 cursor-pointer"
              >
                Próximo <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Player Video Stage: Mantém tela cheia contínua sem interrupções entre episódios */}
        <div 
          id="player-stage-container" 
          onMouseMove={handleStageMouseMove}
          onMouseLeave={handleStageMouseLeave}
          style={
            isExpanded && isRotated
              ? {
                  position: "fixed",
                  top: "50%",
                  left: "50%",
                  width: "100vh",
                  height: "100vw",
                  transform: "translate(-50%, -50%) rotate(90deg)",
                  zIndex: 999999,
                  maxWidth: "none",
                  maxHeight: "none",
                }
              : undefined
          }
          className={`relative w-full bg-black flex items-center justify-center overflow-hidden group select-none transition-all duration-300 ${
            isExpanded && !isRotated
              ? "h-screen w-screen fixed inset-0 z-[99999]"
              : isExpanded && isRotated
              ? "shadow-2xl"
              : "aspect-video"
          }`}
        >
          {/* Notificação Flutuante de Avanço Automático */}
          {autoNextNotice && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 text-white text-xs sm:text-sm font-bold rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 duration-300 border border-white/25 pointer-events-none">
              <FastForward className="w-4 h-4 animate-pulse text-white" />
              <span>Episódio concluído! Reproduzindo Episódio {autoNextNotice.nextEp}...</span>
            </div>
          )}

          {/* Notificação Flutuante de Abertura Pulada */}
          {skipNotice && (
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

          {/* Player Oficial Estilo Netflix Cinematográfico */}
          <NetflixPlayerSkin
            title={title}
            isSeries={isSeries}
            season={season}
            episode={episode}
            totalEpisodes={24}
            onClose={onClose}
            onEpisodeChange={handleEpisodeChange}
            onSkipIntro={() => handleSkipIntro()}
            skipDurationSeconds={skipDurationSeconds}
            isIntroActive={isIntroActive}
            isFullscreen={isExpanded}
            onToggleFullscreen={handleFullScreen}
            iframeRef={iframeRef}
            isRotated={isRotated}
            onToggleRotate={handleToggleRotate}
          />

          {/* Indicador de Carregamento sobreposto (não remove o iframe da DOM, preservando tela cheia) */}
          {isLoading && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-3 text-neutral-400">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
              <p className="text-sm font-medium text-white">Carregando {isSeries ? `Episódio ${episode}` : title}...</p>
            </div>
          )}

          {activeIframeUrl ? (
            <iframe
              ref={iframeRef}
              src={activeIframeUrl}
              title={title}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="no-referrer"
              sandbox={antiAdShield && !activeIframeUrl.includes("vidlink.pro") && !activeIframeUrl.includes("watchplayer-stream") && !activeIframeUrl.includes("watchplay.shop") ? "allow-scripts allow-same-origin allow-forms allow-presentation" : undefined}
            />
          ) : error ? (
            <div className="flex flex-col items-center max-w-lg p-6 text-center text-neutral-300 space-y-3">
              <AlertCircle className="w-10 h-10 text-orange-500" />
              <h3 className="font-bold text-white text-base">Falha ao carregar o player</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">{error}</p>
              <div className="pt-2 flex gap-3 flex-wrap justify-center">
                <button
                  onClick={() => handleExtract(urlInput)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                </button>
                <a
                  href={urlInput}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir em nova aba
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-neutral-500 space-y-2">
              <Play className="w-12 h-12 opacity-30" />
              <p className="text-sm">Clique em "Reproduzir" para iniciar</p>
            </div>
          )}
        </div>

        {/* Rodapé com Link Ativo e Informações */}
        <div className="px-4 sm:px-5 py-2.5 bg-[#0f0f0f] border-t border-neutral-800 text-neutral-400 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="truncate max-w-xs sm:max-w-md font-mono text-[11px] text-neutral-400">
              Link Ativo: <span className="text-orange-400">{extractedSource || activeIframeUrl}</span>
            </span>
            <button
              onClick={() => copyUrl(extractedSource || activeIframeUrl || "")}
              className="text-neutral-400 hover:text-white text-[11px] px-1.5 py-0.5 bg-white/5 rounded border border-white/10 cursor-pointer"
              title="Copiar URL do player"
            >
              {copied ? <Check className="w-3 h-3 text-green-400" /> : "Copiar"}
            </button>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto text-[11px] text-neutral-400">
            <ShieldCheck className={`w-3.5 h-3.5 ${antiAdShield ? "text-emerald-400" : "text-neutral-400"}`} />
            <span>
              {antiAdShield 
                ? "Bloqueador ativo: cliques não abrem anúncios nem novas abas" 
                : "Servidor 1 e WatchPlayer recomendados"}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
