import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Sun,
  Tv,
  Cast,
  Lock,
  Unlock,
  Gauge,
  Layers,
  MessageSquareText,
  Subtitles,
  SkipForward,
  X,
  Check,
  Volume2,
  VolumeX,
  Volume1,
  Maximize2,
  Minimize2,
} from "lucide-react";

export interface NetflixPlayerStatus {
  currentTime: number;
  duration: number;
  paused: boolean;
  muted: boolean;
  volume: number;
  buffered: number;
  playbackRate: number;
  readyState: number;
}

interface NetflixPlayerSkinProps {
  title: string;
  isSeries: boolean;
  season?: number;
  episode?: number;
  totalEpisodes?: number;
  onClose: () => void;
  onEpisodeChange?: (newEpisode: number) => void;
  onSkipIntro: () => void;
  skipDurationSeconds: number;
  isIntroActive: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onBrightnessChange?: (brightness: number) => void;
  isCam?: boolean;
  quality?: string;
  isRotated?: boolean;
  onToggleRotate?: () => void;
  isExternalPlayer?: boolean;
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

export const NetflixPlayerSkin: React.FC<NetflixPlayerSkinProps> = ({
  title,
  isSeries,
  season = 1,
  episode = 1,
  totalEpisodes = 24,
  onClose,
  onEpisodeChange,
  onSkipIntro,
  skipDurationSeconds,
  isIntroActive,
  isFullscreen,
  onToggleFullscreen,
  iframeRef,
  onBrightnessChange,
  isRotated = false,
  onToggleRotate,
  isExternalPlayer = false,
}) => {
  // Estado do player via postMessage
  const [playerStatus, setPlayerStatus] = useState<NetflixPlayerStatus>({
    currentTime: 0,
    duration: 0,
    paused: false,
    muted: false,
    volume: 1,
    buffered: 0,
    playbackRate: 1,
    readyState: 0,
  });

  // Visibilidade dos controles (auto-hide após 2.8s)
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Bloqueio de tela (Lock Mode da Netflix)
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [showUnlockPrompt, setShowUnlockPrompt] = useState<boolean>(false);
  const unlockPromptTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Controle de brilho da tela (Slider vertical à esquerda)
  const [brightness, setBrightness] = useState<number>(1.0);
  const [isDraggingBrightness, setIsDraggingBrightness] = useState<boolean>(false);
  const brightnessBarRef = useRef<HTMLDivElement>(null);

  // Controle de arraste da barra de progresso (scrubber)
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubTime, setScrubTime] = useState<number>(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosPercent, setHoverPosPercent] = useState<number>(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Popups auxiliares (Velocidade, Episódios, Áudio & Legendas)
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const [showEpisodeDrawer, setShowEpisodeDrawer] = useState<boolean>(false);
  const [showAudioSubtitleModal, setShowAudioSubtitleModal] = useState<boolean>(false);
  const [showCastModal, setShowCastModal] = useState<boolean>(false);

  // Preferências selecionadas no modal de áudio/legendas
  const [selectedAudio, setSelectedAudio] = useState<string>("pt-BR");
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>("off");

  // Envia comando para o iframe do WatchPlayer
  const sendCommand = useCallback(
    (command: Record<string, any>) => {
      if (iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.postMessage(command, "*");
        } catch (e) {
          console.error("Erro ao enviar comando para o player:", e);
        }
      }
      window.postMessage(command, "*");
    },
    [iframeRef]
  );

  // Escuta mensagens do WatchPlayer
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "WATCHPLAY_STATUS") {
        setPlayerStatus((prev) => ({
          ...prev,
          currentTime: typeof e.data.currentTime === "number" ? e.data.currentTime : prev.currentTime,
          duration: typeof e.data.duration === "number" && e.data.duration > 0 ? e.data.duration : prev.duration,
          paused: typeof e.data.paused === "boolean" ? e.data.paused : prev.paused,
          muted: typeof e.data.muted === "boolean" ? e.data.muted : prev.muted,
          volume: typeof e.data.volume === "number" ? e.data.volume : prev.volume,
          buffered: typeof e.data.buffered === "number" ? e.data.buffered : prev.buffered,
          playbackRate: typeof e.data.playbackRate === "number" ? e.data.playbackRate : prev.playbackRate,
          readyState: typeof e.data.readyState === "number" ? e.data.readyState : prev.readyState,
        }));
      }
    };

    window.addEventListener("message", handleMessage);
    sendCommand({ type: "REQUEST_STATUS" });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [sendCommand]);

  // Reseta o timer de auto-hide ao mover o mouse ou tocar
  const handleUserActivity = useCallback(() => {
    if (isLocked) {
      // Quando bloqueado, toque mostra o prompt para desbloquear
      setShowUnlockPrompt(true);
      if (unlockPromptTimerRef.current) clearTimeout(unlockPromptTimerRef.current);
      unlockPromptTimerRef.current = setTimeout(() => {
        setShowUnlockPrompt(false);
      }, 3000);
      return;
    }

    setControlsVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }

    if (
      !playerStatus.paused &&
      !isScrubbing &&
      !isDraggingBrightness &&
      !showSpeedMenu &&
      !showEpisodeDrawer &&
      !showAudioSubtitleModal
    ) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 2800);
    }
  }, [
    isLocked,
    playerStatus.paused,
    isScrubbing,
    isDraggingBrightness,
    showSpeedMenu,
    showEpisodeDrawer,
    showAudioSubtitleModal,
  ]);

  useEffect(() => {
    if (playerStatus.paused) {
      setControlsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      handleUserActivity();
    }
  }, [playerStatus.paused, handleUserActivity]);

  // Play / Pause
  const handleTogglePlay = () => {
    if (isLocked) return;
    if (playerStatus.paused) {
      sendCommand({ type: "PLAY" });
      setPlayerStatus((p) => ({ ...p, paused: false }));
    } else {
      sendCommand({ type: "PAUSE" });
      setPlayerStatus((p) => ({ ...p, paused: true }));
    }
    handleUserActivity();
  };

  // Salto relativo (-10s / +10s)
  const handleSeekRelative = (seconds: number) => {
    if (isLocked) return;
    sendCommand({ type: "SEEK_RELATIVE", seconds });
    handleUserActivity();
  };

  // Alterar taxa de velocidade
  const handlePlaybackRate = (rate: number) => {
    sendCommand({ type: "SET_PLAYBACK_RATE", rate });
    setPlayerStatus((p) => ({ ...p, playbackRate: rate }));
    setShowSpeedMenu(false);
    handleUserActivity();
  };

  // Controle de Brilho
  const updateBrightnessFromY = (clientY: number) => {
    if (!brightnessBarRef.current) return;
    const rect = brightnessBarRef.current.getBoundingClientRect();
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    // Brilho varia de 0.4 (escuro) a 1.25 (claro)
    const val = 0.4 + ratio * 0.85;
    setBrightness(val);
    if (onBrightnessChange) {
      onBrightnessChange(val);
    }
  };

  const handleBrightnessMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingBrightness(true);
    updateBrightnessFromY(e.clientY);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingBrightness) {
        updateBrightnessFromY(e.clientY);
      }
    };
    const handleMouseUp = () => {
      if (isDraggingBrightness) {
        setIsDraggingBrightness(false);
      }
    };
    if (isDraggingBrightness) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingBrightness]);

  // Controle da Barra de Progresso (Scrubber)
  const getTimeFromEvent = (clientX: number): number => {
    if (!progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const duration = playerStatus.duration > 0 ? playerStatus.duration : 1;
    return pos * duration;
  };

  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const duration = playerStatus.duration > 0 ? playerStatus.duration : 1;
    setHoverPosPercent(pos * 100);
    setHoverTime(pos * duration);

    if (isScrubbing) {
      setScrubTime(pos * duration);
    }
  };

  const handleProgressBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isLocked) return;
    const time = getTimeFromEvent(e.clientX);
    setIsScrubbing(true);
    setScrubTime(time);
  };

  const handleProgressBarTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isLocked) return;
    const touch = e.touches[0];
    const time = getTimeFromEvent(touch.clientX);
    setIsScrubbing(true);
    setScrubTime(time);
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isScrubbing) return;
      const time = getTimeFromEvent(e.clientX);
      setScrubTime(time);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (!isScrubbing) return;
      const touch = e.touches[0];
      const time = getTimeFromEvent(touch.clientX);
      setScrubTime(time);
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (!isScrubbing) return;
      const time = getTimeFromEvent(e.clientX);
      sendCommand({ type: "SEEK_ABSOLUTE", time });
      setPlayerStatus((p) => ({ ...p, currentTime: time }));
      setIsScrubbing(false);
      handleUserActivity();
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      if (!isScrubbing) return;
      const touch = e.changedTouches[0];
      const time = getTimeFromEvent(touch.clientX);
      sendCommand({ type: "SEEK_ABSOLUTE", time });
      setPlayerStatus((p) => ({ ...p, currentTime: time }));
      setIsScrubbing(false);
      handleUserActivity();
    };

    if (isScrubbing) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
      window.addEventListener("touchmove", handleGlobalTouchMove);
      window.addEventListener("touchend", handleGlobalTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("touchmove", handleGlobalTouchMove);
      window.removeEventListener("touchend", handleGlobalTouchEnd);
    };
  }, [isScrubbing, sendCommand, handleUserActivity]);

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          handleTogglePlay();
          break;
        case "arrowleft":
          e.preventDefault();
          handleSeekRelative(-10);
          break;
        case "arrowright":
          e.preventDefault();
          handleSeekRelative(10);
          break;
        case "f":
          e.preventDefault();
          onToggleFullscreen();
          break;
        case "s":
          if (isSeries) {
            e.preventDefault();
            onSkipIntro();
          }
          break;
        case "n":
          if (isSeries && onEpisodeChange) {
            e.preventDefault();
            onEpisodeChange(episode + 1);
          }
          break;
        case "m":
          e.preventDefault();
          sendCommand({ type: "SET_MUTED", muted: !playerStatus.muted });
          setPlayerStatus((p) => ({ ...p, muted: !p.muted }));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    handleTogglePlay,
    playerStatus.muted,
    sendCommand,
    onToggleFullscreen,
    isSeries,
    onSkipIntro,
    onEpisodeChange,
    episode,
  ]);

  // Cálculos da timeline
  const displayCurrentTime = isScrubbing ? scrubTime : playerStatus.currentTime;
  const duration = playerStatus.duration > 0 ? playerStatus.duration : 1;
  const remainingTime = Math.max(0, duration - displayCurrentTime);
  const playedPercent = Math.min(100, Math.max(0, (displayCurrentTime / duration) * 100));
  const bufferedPercent = Math.min(100, Math.max(0, (playerStatus.buffered / duration) * 100));

  // Formato do título central da Netflix: S1:E1 "Pilot" ou Nome do Filme
  const topTitleText = isSeries
    ? `S${season}:E${episode} "${title || "Episódio " + episode}"`
    : `"${title || "Filme"}"`;

  return (
    <div
      onMouseMove={handleUserActivity}
      onClick={handleUserActivity}
      className={`absolute inset-0 z-30 select-none overflow-hidden transition-all duration-300 ${
        controlsVisible && !isLocked ? "cursor-default" : "cursor-none"
      } ${isExternalPlayer ? "pointer-events-none" : ""}`}
    >
      {/* Camada de Ajuste de Brilho */}
      {!isExternalPlayer && (
        <div
          className="absolute inset-0 pointer-events-none z-0 transition-opacity"
          style={{
            backgroundColor: brightness < 1 ? `rgba(0, 0, 0, ${((1 - brightness) * 0.7).toFixed(2)})` : "transparent",
          }}
        />
      )}

      {/* Clique simples no fundo para Play/Pause */}
      {!isExternalPlayer && (
        <div
          className="absolute inset-0 z-0 cursor-pointer pointer-events-auto"
          onClick={() => {
            if (!isLocked) {
              handleTogglePlay();
            }
          }}
          onDoubleClick={onToggleFullscreen}
        />
      )}

      {/* Gradientes Suaves de Cinema (Superior e Inferior) */}
      {!isExternalPlayer && (
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
            controlsVisible && !isLocked ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="absolute top-0 left-0 right-0 h-28 sm:h-36 bg-gradient-to-b from-black/90 via-black/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-36 sm:h-44 bg-gradient-to-t from-black/95 via-black/60 to-transparent" />
        </div>
      )}

      {/* ========================================================
          MODO BLOQUEADO (LOCK MODE DA NETFLIX)
          ======================================================== */}
      {isLocked && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowUnlockPrompt(true);
          }}
          className="absolute inset-0 z-40 flex items-end justify-center pb-16 cursor-pointer"
        >
          {showUnlockPrompt && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsLocked(false);
                setControlsVisible(true);
              }}
              className="flex items-center gap-2.5 px-6 py-3 rounded-full bg-black/85 border border-white/30 text-white font-semibold text-sm shadow-2xl backdrop-blur-md hover:bg-neutral-900 transition-all active:scale-95 cursor-pointer animate-in fade-in zoom-in duration-200"
            >
              <Unlock className="w-5 h-5 text-[#E50914]" />
              <span>Tela Bloqueada. Toque para Desbloquear</span>
            </button>
          )}
        </div>
      )}

      {/* ========================================================
          1. BARRA SUPERIOR (HEADER EXATO DA NETFLIX)
          Esquerda: Cast/Tv | Centro: Título + Badge CAM | Direita: Tela Cheia + X
          ======================================================== */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 px-3 sm:px-6 pt-2.5 sm:pt-4 flex items-center justify-between gap-2 sm:gap-4 transition-all duration-300 ${
          controlsVisible && !isLocked ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-4 pointer-events-none"
        }`}
      >
        {/* Esquerda: Ícone de Transmissão (Cast/TV) */}
        <div className="flex items-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowCastModal(true);
            }}
            className="p-1.5 sm:p-2 text-white/90 hover:text-white transition-colors cursor-pointer rounded-full hover:bg-white/10"
            title="Transmitir para Smart TV"
          >
            <Cast className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.8]" />
          </button>
        </div>

        {/* Centro: Título formatado S1:E1 "Pilot" */}
        <div className="flex-1 text-center min-w-0 px-1 flex items-center justify-center">
          <span className="text-white text-xs sm:text-sm md:text-base font-medium tracking-wide drop-shadow truncate block max-w-[180px] xs:max-w-xs sm:max-w-md">
            {topTitleText}
          </span>
        </div>

        {/* Direita: Botão Girar Tela (90° Paisagem - apenas em tela cheia) + Botão Tela Cheia (Widescreen) + Botão Fechar X */}
        <div className="flex items-center justify-end gap-1 sm:gap-2">
          {isFullscreen && onToggleRotate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleRotate();
              }}
              className={`p-1.5 sm:p-2 transition-colors cursor-pointer rounded-full hover:bg-white/10 ${
                isRotated ? "text-orange-500 bg-orange-500/20" : "text-white/90 hover:text-white"
              }`}
              title={isRotated ? "Restaurar Orientação Normal (0°)" : "Girar Tela (90° Paisagem Widescreen)"}
            >
              <RotateCw className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.8]" />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFullscreen();
            }}
            className="p-1.5 sm:p-2 text-white/90 hover:text-white transition-colors cursor-pointer rounded-full hover:bg-white/10"
            title={isFullscreen ? "Sair da Tela Cheia / Widescreen (F)" : "Tela Cheia / Modo Widescreen (F)"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.8]" />
            ) : (
              <Maximize2 className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.8]" />
            )}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 sm:p-2 text-white/90 hover:text-white transition-colors cursor-pointer rounded-full hover:bg-white/10"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.8]" />
          </button>
        </div>
      </div>

      {/* ========================================================
          2. CONTROLE VERTICAL DE BRILHO (SOL À ESQUERDA)
          Oculto no mobile em orientação vertical para não sobrepor botões
          ======================================================== */}
      {!isExternalPlayer && (
        <div
          className={`hidden sm:flex absolute left-3 sm:left-6 md:left-8 top-1/2 -translate-y-1/2 z-20 flex-col items-center gap-2 transition-all duration-300 ${
            controlsVisible && !isLocked ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 pointer-events-none"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <Sun className="w-4 h-4 text-white/90 drop-shadow stroke-[1.8]" />

          {/* Barra Vertical de Brilho */}
          <div
            ref={brightnessBarRef}
            onMouseDown={handleBrightnessMouseDown}
            className="relative w-1.5 h-24 sm:h-28 bg-neutral-600/80 rounded-full cursor-pointer overflow-hidden flex flex-col justify-end group/slider"
            title={`Brilho: ${Math.round(brightness * 100)}%`}
          >
            <div
              className="w-full bg-white rounded-full transition-all duration-75"
              style={{
                height: `${Math.min(100, Math.max(10, ((brightness - 0.4) / 0.85) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* ========================================================
          3. CONTROLES CENTRAIS (RETROCEDER 10s, PLAY/PAUSE, AVANÇAR 10s)
          Espaçamento responsivo e confortável
          ======================================================== */}
      {!isExternalPlayer && (
        <div
          className={`absolute inset-0 flex items-center justify-center gap-5 xs:gap-8 sm:gap-16 md:gap-24 z-20 pointer-events-none transition-all duration-300 ${
            controlsVisible && !isLocked ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          {/* Retroceder 10 Segundos */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSeekRelative(-10);
            }}
            className="relative pointer-events-auto p-2 sm:p-3 text-white/90 hover:text-white hover:scale-110 active:scale-95 transition-all cursor-pointer group"
            title="Voltar 10s"
          >
            <RotateCcw className="w-8 h-8 sm:w-11 sm:h-11 md:w-13 md:h-13 stroke-[1.6]" />
            <span className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[11px] md:text-xs font-black pt-0.5 sm:pt-1 pointer-events-none">
              10
            </span>
          </button>

          {/* Play / Pause Central Gigante em Branco Sólido */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePlay();
            }}
            className="pointer-events-auto p-2 sm:p-4 text-white hover:scale-110 active:scale-95 transition-all cursor-pointer"
            title={playerStatus.paused ? "Reproduzir" : "Pausar"}
          >
            {playerStatus.paused ? (
              <Play className="w-11 h-11 sm:w-16 sm:h-16 md:w-20 md:h-20 fill-white text-white translate-x-0.5 sm:translate-x-1 drop-shadow-lg" />
            ) : (
              <Pause className="w-11 h-11 sm:w-16 sm:h-16 md:w-20 md:h-20 fill-white text-white drop-shadow-lg" />
            )}
          </button>

          {/* Avançar 10 Segundos */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSeekRelative(10);
            }}
            className="relative pointer-events-auto p-2 sm:p-3 text-white/90 hover:text-white hover:scale-110 active:scale-95 transition-all cursor-pointer group"
            title="Avançar 10s"
          >
            <RotateCw className="w-8 h-8 sm:w-11 sm:h-11 md:w-13 md:h-13 stroke-[1.6]" />
            <span className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[11px] md:text-xs font-black pt-0.5 sm:pt-1 pointer-events-none">
              10
            </span>
          </button>
        </div>
      )}

      {/* ========================================================
          4. BOTÃO FLUTUANTE: PULAR ABERTURA
          ======================================================== */}
      {!isExternalPlayer && isSeries && (
        <div
          className={`absolute right-3 sm:right-6 bottom-16 sm:bottom-20 z-20 transition-all duration-300 ${
            (isIntroActive || controlsVisible) && !isLocked
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 translate-y-3 pointer-events-none"
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSkipIntro();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded bg-black/80 hover:bg-neutral-900 border border-white/80 hover:border-white text-white text-xs sm:text-sm font-medium tracking-wide shadow-2xl backdrop-blur-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Pular Abertura (+85s) - Tecla S"
          >
            <span>Pular Abertura</span>
          </button>
        </div>
      )}

      {/* ========================================================
          5. PARTE INFERIOR: PROGRESS BAR + BOTÕES DA NETFLIX
          Barra vermelha + botões com espaçamento amplo (sem botão Share)
          ======================================================== */}
      {!isExternalPlayer && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-20 pb-2.5 sm:pb-4 pt-1.5 flex flex-col transition-all duration-300 ${
            controlsVisible && !isLocked ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
        {/* LINHA DA TIMELINE (SCRUBBER) */}
        <div className="px-3 sm:px-6 md:px-8 w-full flex items-center gap-2.5 sm:gap-4 mb-1.5 sm:mb-2.5">
          <div
            ref={progressBarRef}
            onMouseMove={handleProgressBarMouseMove}
            onMouseLeave={() => setHoverTime(null)}
            onMouseDown={handleProgressBarMouseDown}
            onTouchStart={handleProgressBarTouchStart}
            className="relative flex-1 h-5 sm:h-6 flex items-center cursor-pointer group"
          >
            {/* Tooltip de Prévia ao passar o mouse */}
            {hoverTime !== null && (
              <div
                className="absolute -top-7 -translate-x-1/2 z-30 px-2 py-0.5 rounded bg-black/90 border border-white/20 text-white text-[10px] sm:text-[11px] font-medium shadow-xl pointer-events-none"
                style={{ left: `${hoverPosPercent}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}

            {/* Trilho cinza de fundo */}
            <div className="relative w-full h-1 sm:h-1.5 bg-neutral-600/70 rounded-full overflow-hidden">
              {/* Barra de Buffer */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-white/30"
                style={{ width: `${bufferedPercent}%` }}
              />
              {/* Barra Vermelha Netflix */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-[#E50914]"
                style={{ width: `${playedPercent}%` }}
              />
            </div>

            {/* Knob Redondo Vermelho da Netflix (Thumb) */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[#E50914] shadow-md shadow-black/80 pointer-events-none transition-transform group-hover:scale-110"
              style={{ left: `${playedPercent}%` }}
            />
          </div>

          {/* Tempo Restante à Direita (ex: 48:04 ou 30:05) */}
          <span className="text-white/90 text-[11px] sm:text-xs font-normal tabular-nums select-none shrink-0 drop-shadow">
            {formatTime(remainingTime)}
          </span>
        </div>

        {/* LINHA DE AÇÕES INFERIORES: SEM BOTÃO SHARE, ESPAÇOSA E CONFORTÁVEL */}
        <div className="px-2 sm:px-6 flex items-center justify-center gap-3 xs:gap-5 sm:gap-10 md:gap-14 text-white text-xs">
          {/* 1. Velocidade */}
          <button
            onClick={() => setShowSpeedMenu(true)}
            className="flex items-center gap-1.5 py-1 px-1.5 sm:px-2 text-white/90 hover:text-white transition-colors cursor-pointer group"
            title="Velocidade de reprodução"
          >
            <Gauge className="w-4 h-4 sm:w-5 sm:h-5 stroke-[1.7]" />
            <span className="font-normal text-[11px] sm:text-xs whitespace-nowrap">
              <span className="hidden sm:inline">Velocidade </span>({playerStatus.playbackRate}x)
            </span>
          </button>

          {/* 2. Bloquear Tela */}
          <button
            onClick={() => {
              setIsLocked(true);
              setControlsVisible(false);
            }}
            className="flex items-center gap-1.5 py-1 px-1.5 sm:px-2 text-white/90 hover:text-white transition-colors cursor-pointer group"
            title="Bloquear controles da tela"
          >
            <Lock className="w-4 h-4 sm:w-5 sm:h-5 stroke-[1.7]" />
            <span className="font-normal text-[11px] sm:text-xs whitespace-nowrap">Bloquear</span>
          </button>

          {/* 3. Episódios (apenas para séries e em tela cheia) */}
          {isSeries && isFullscreen && (
            <button
              onClick={() => setShowEpisodeDrawer((prev) => !prev)}
              className="flex items-center gap-1.5 py-1 px-1.5 sm:px-2 text-white/90 hover:text-white transition-colors cursor-pointer group"
              title="Lista de episódios"
            >
              <Layers className="w-4 h-4 sm:w-5 sm:h-5 stroke-[1.7]" />
              <span className="font-normal text-[11px] sm:text-xs whitespace-nowrap">Episódios</span>
            </button>
          )}

          {/* 4. Áudio & Legendas */}
          <button
            onClick={() => setShowAudioSubtitleModal(true)}
            className="flex items-center gap-1.5 py-1 px-1.5 sm:px-2 text-white/90 hover:text-white transition-colors cursor-pointer group"
            title="Áudio e Legendas"
          >
            <MessageSquareText className="w-4 h-4 sm:w-5 sm:h-5 stroke-[1.7]" />
            <span className="font-normal text-[11px] sm:text-xs whitespace-nowrap">
              <span className="hidden sm:inline">Áudio e Legendas</span>
              <span className="sm:hidden">Áudio/Leg.</span>
            </span>
          </button>

          {/* 5. Próximo Episódio (apenas para séries e em tela cheia) */}
          {isSeries && isFullscreen && onEpisodeChange && (
            <button
              onClick={() => onEpisodeChange(episode + 1)}
              className="flex items-center gap-1.5 py-1 px-1.5 sm:px-2 text-white/90 hover:text-white transition-colors cursor-pointer group"
              title="Próximo Episódio (Tecla N)"
            >
              <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 stroke-[1.7]" />
              <span className="font-normal text-[11px] sm:text-xs whitespace-nowrap">Próximo</span>
            </button>
          )}
        </div>
      </div>
      )}

      {/* ========================================================
          MODAL: VELOCIDADE DE REPRODUÇÃO (ESTÉTICA OFICIAL NETFLIX)
          ======================================================== */}
      {showSpeedMenu && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowSpeedMenu(false);
          }}
          className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm sm:max-w-md bg-[#161616]/95 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-2xl text-white space-y-5 animate-in zoom-in-95 duration-200"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                  <Gauge className="w-4 h-4 stroke-[2]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">Velocidade de Reprodução</h3>
                  <p className="text-xs text-neutral-400">Ajuste o ritmo do filme ou episódio</p>
                </div>
              </div>
              <button
                onClick={() => setShowSpeedMenu(false)}
                className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Seletor de Velocidade Estilo Régua Netflix */}
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-2">
                {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => {
                  const isSelected = playerStatus.playbackRate === rate;
                  return (
                    <button
                      key={rate}
                      onClick={() => handlePlaybackRate(rate)}
                      className={`flex flex-col items-center justify-center py-3 px-1 rounded-xl transition-all cursor-pointer border ${
                        isSelected
                          ? "bg-white text-black border-white font-bold shadow-lg shadow-white/20 scale-[1.03]"
                          : "bg-white/5 hover:bg-white/10 text-neutral-300 border-white/10 hover:border-white/20"
                      }`}
                    >
                      <span className="text-sm sm:text-base font-bold tabular-nums">
                        {rate}x
                      </span>
                      <span className={`text-[10px] mt-0.5 ${isSelected ? "text-neutral-700 font-semibold" : "text-neutral-500"}`}>
                        {rate === 1 ? "Padrão" : rate < 1 ? "Lento" : "Rápido"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Status e Descrição */}
              <div className="px-3.5 py-2.5 rounded-xl bg-neutral-900/90 border border-neutral-800 flex items-center justify-between text-xs">
                <span className="text-neutral-400 font-medium">Velocidade Selecionada:</span>
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  {playerStatus.playbackRate === 1 ? "1x (Velocidade Normal)" : `${playerStatus.playbackRate}x (${playerStatus.playbackRate < 1 ? "Câmera Lenta" : "Aceleração"})`}
                </span>
              </div>
            </div>

            {/* Botão de Fechar / Aplicar */}
            <button
              onClick={() => setShowSpeedMenu(false)}
              className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Concluir
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          DRAWER / MODAL: EPISODES (NETFLIX STYLE)
          ======================================================== */}
      {showEpisodeDrawer && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowEpisodeDrawer(false);
          }}
          className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-96 h-full bg-[#141414] border-l border-neutral-800 flex flex-col shadow-2xl animate-in slide-in-from-right duration-250"
          >
            {/* Cabeçalho do Drawer */}
            <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-base sm:text-lg">Episódios</h3>
                <p className="text-xs text-neutral-400">Temporada {season}</p>
              </div>
              <button
                onClick={() => setShowEpisodeDrawer(false)}
                className="p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista de Episódios */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {Array.from({ length: totalEpisodes }, (_, i) => i + 1).map((epNum) => (
                <button
                  key={epNum}
                  onClick={() => {
                    if (onEpisodeChange) onEpisodeChange(epNum);
                    setShowEpisodeDrawer(false);
                  }}
                  className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between cursor-pointer border ${
                    episode === epNum
                      ? "bg-white/10 border-white/30 text-white"
                      : "bg-neutral-900/60 hover:bg-neutral-800 border-neutral-800/80 text-neutral-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        episode === epNum ? "bg-white text-black font-bold" : "bg-neutral-800 text-neutral-400"
                      }`}
                    >
                      {epNum}
                    </span>
                    <span className="font-medium text-sm">
                      Episódio {epNum}
                    </span>
                  </div>
                  {episode === epNum && <Check className="w-4 h-4 text-[#E50914]" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: AUDIO & SUBTITLES (NETFLIX STYLE)
          ======================================================== */}
      {showAudioSubtitleModal && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowAudioSubtitleModal(false);
          }}
          className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm sm:max-w-md bg-[#161616]/95 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-2xl text-white space-y-5 animate-in zoom-in-95 duration-200"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                  <MessageSquareText className="w-4 h-4 stroke-[2]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">Áudio e Legendas</h3>
                  <p className="text-xs text-neutral-400">Escolha o idioma de reprodução</p>
                </div>
              </div>
              <button
                onClick={() => setShowAudioSubtitleModal(false)}
                className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Coluna de Áudio */}
              <div className="space-y-2">
                <h4 className="text-xs uppercase font-bold text-neutral-400 tracking-wider flex items-center gap-1.5 px-0.5">
                  <Volume2 className="w-3.5 h-3.5 text-neutral-400" />
                  Áudio
                </h4>
                <div className="space-y-1.5">
                  <button
                    onClick={() => setSelectedAudio("pt-BR")}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer border ${
                      selectedAudio === "pt-BR"
                        ? "bg-white text-black font-bold border-white shadow-lg shadow-white/20"
                        : "bg-white/5 hover:bg-white/10 text-neutral-300 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <span>Português [Dublado BR]</span>
                    {selectedAudio === "pt-BR" && <Check className="w-4 h-4 text-black" />}
                  </button>

                  <button
                    onClick={() => setSelectedAudio("en-US")}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer border ${
                      selectedAudio === "en-US"
                        ? "bg-white text-black font-bold border-white shadow-lg shadow-white/20"
                        : "bg-white/5 hover:bg-white/10 text-neutral-300 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <span>Inglês [Original]</span>
                    {selectedAudio === "en-US" && <Check className="w-4 h-4 text-black" />}
                  </button>
                </div>
              </div>

              {/* Coluna de Legendas */}
              <div className="space-y-2">
                <h4 className="text-xs uppercase font-bold text-neutral-400 tracking-wider flex items-center gap-1.5 px-0.5">
                  <Subtitles className="w-3.5 h-3.5 text-neutral-400" />
                  Legendas
                </h4>
                <div className="space-y-1.5">
                  <button
                    onClick={() => setSelectedSubtitle("off")}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer border ${
                      selectedSubtitle === "off"
                        ? "bg-white text-black font-bold border-white shadow-lg shadow-white/20"
                        : "bg-white/5 hover:bg-white/10 text-neutral-300 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <span>Desativadas</span>
                    {selectedSubtitle === "off" && <Check className="w-4 h-4 text-black" />}
                  </button>

                  <button
                    onClick={() => setSelectedSubtitle("pt-BR")}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-between transition-all cursor-pointer border ${
                      selectedSubtitle === "pt-BR"
                        ? "bg-white text-black font-bold border-white shadow-lg shadow-white/20"
                        : "bg-white/5 hover:bg-white/10 text-neutral-300 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <span>Português (Brasil)</span>
                    {selectedSubtitle === "pt-BR" && <Check className="w-4 h-4 text-black" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Status Informativo */}
            <div className="px-3.5 py-2.5 rounded-xl bg-neutral-900/90 border border-neutral-800 flex items-center justify-between text-xs">
              <span className="text-neutral-400 font-medium">Configuração Ativa:</span>
              <span className="font-bold text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                {selectedAudio === "pt-BR" ? "Dublado BR" : "Inglês"} • Leg: {selectedSubtitle === "off" ? "Desativada" : "Português"}
              </span>
            </div>

            {/* Botão de Fechar / Concluir */}
            <button
              onClick={() => setShowAudioSubtitleModal(false)}
              className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Concluir
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: TRANSMITIR SMART TV / CHROMECAST
          ======================================================== */}
      {showCastModal && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowCastModal(false);
          }}
          className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#161616]/95 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-2xl text-white space-y-4 text-center animate-in zoom-in-95 duration-200"
          >
            <div className="w-12 h-12 rounded-full bg-white/10 border border-white/15 flex items-center justify-center mx-auto text-white">
              <Cast className="w-6 h-6 stroke-[1.8]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Transmitir para Smart TV</h3>
              <p className="text-xs text-neutral-400 mt-1">
                Conecte seu dispositivo na mesma rede Wi-Fi da sua TV ou Chromecast.
              </p>
            </div>
            <div className="p-3 bg-neutral-900/90 rounded-xl border border-neutral-800 text-left space-y-2">
              <div className="flex items-center gap-2.5 text-xs text-neutral-300">
                <Tv className="w-4 h-4 text-neutral-400" />
                <span>Smart TV Sala de Estar</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-neutral-300">
                <Cast className="w-4 h-4 text-neutral-400" />
                <span>Chromecast Quarto</span>
              </div>
            </div>
            <button
              onClick={() => setShowCastModal(false)}
              className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
