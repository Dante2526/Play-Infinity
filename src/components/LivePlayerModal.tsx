import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { 
  X, 
  Play, 
  Pause, 
  Volume1,
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  RotateCcw, 
  Tv, 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  Radio, 
  ExternalLink,
  ListFilter,
  AlertCircle
} from 'lucide-react';
import { LiveChannel } from '../data/liveChannels';
import { ChannelLogo } from './ChannelLogo';

interface LivePlayerModalProps {
  channel: LiveChannel;
  allChannels: LiveChannel[];
  onClose: () => void;
  onSelectChannel: (channel: LiveChannel) => void;
  onEditChannel?: (channel: LiveChannel) => void;
}

export const LivePlayerModal: React.FC<LivePlayerModalProps> = ({
  channel,
  allChannels,
  onClose,
  onSelectChannel,
  onEditChannel
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [selectedServerIndex, setSelectedServerIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showChannelList, setShowChannelList] = useState<boolean>(false);
  const [streamHealth, setStreamHealth] = useState<'online' | 'connecting' | 'error'>('connecting');

  // Ajuste automático de estabilidade para conexão (sem notificações intrusivas)
  const [isLowBandwidthMode, setIsLowBandwidthMode] = useState<boolean>(() => {
    return localStorage.getItem('playinfinity_live_low_bandwidth') === 'true';
  });
  const [activeResolutionLabel, setActiveResolutionLabel] = useState<string>('Auto');

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stallCountRef = useRef<number>(0);
  const lastStallTimeRef = useRef<number>(0);
  const failedServersRef = useRef<Set<number>>(new Set());

  // Limpa histórico de falhas ao trocar de canal
  useEffect(() => {
    failedServersRef.current.clear();
  }, [channel.id]);

  // Função centralizada para alternar de servidor automaticamente em caso de queda ou erro
  const switchToNextServer = useCallback((reason?: string) => {
    if (channel.servers.length <= 1) {
      setHasError(true);
      setStreamHealth('error');
      setIsLoading(false);
      setErrorMessage('Transmissão ao vivo temporariamente indisponível.');
      return;
    }

    failedServersRef.current.add(selectedServerIndex);

    // Se todos os servidores deste canal já falharam, para de alternar e mostra mensagem clara com botão de recarregar
    if (failedServersRef.current.size >= channel.servers.length) {
      console.warn(`[LivePlayer] Todos os ${channel.servers.length} servidores do canal falharam.`);
      setHasError(true);
      setStreamHealth('error');
      setIsLoading(false);
      setErrorMessage('Todos os servidores disponíveis para esta emissora estão temporariamente fora do ar. Tente novamente em instantes.');
      return;
    }

    // Busca próximo servidor que ainda não falhou
    let nextIdx = (selectedServerIndex + 1) % channel.servers.length;
    for (let i = 0; i < channel.servers.length; i++) {
      const candidate = (selectedServerIndex + 1 + i) % channel.servers.length;
      if (!failedServersRef.current.has(candidate)) {
        nextIdx = candidate;
        break;
      }
    }

    console.log(`[LivePlayer] Alternando automaticamente de servidor (${channel.servers[selectedServerIndex]?.name} -> ${channel.servers[nextIdx]?.name}). Motivo: ${reason || 'queda ou erro'}`);
    setSelectedServerIndex(nextIdx);
  }, [channel.servers, selectedServerIndex]);

  // Recuperação automática em caso de queda e retorno de conexão com a internet
  useEffect(() => {
    const handleOnline = () => {
      console.log('[LivePlayer] Conexão restaurada. Tentando reconectar transmissão...');
      failedServersRef.current.clear();
      setHasError(false);
      setIsLoading(true);
      setSelectedServerIndex(0);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Determina a URL atual baseada no servidor selecionado
  const currentServer = channel.servers[selectedServerIndex] || channel.servers[0];
  const streamUrl = currentServer?.isProxy 
    ? `/api/live-stream-proxy?url=${encodeURIComponent(currentServer.url)}` 
    : currentServer?.url;

  // Inicializa e carrega o stream com Hls.js com ABR 100% automático baseado na conexão
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');
    setStreamHealth('connecting');

    const video = videoRef.current;
    if (!video || !streamUrl) return;

    // Destrói instância HLS prévia
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const startHls = () => {
      if (Hls.isSupported()) {
        // Configuração 100% automática de HLS com ABR dinâmico baseado na velocidade da rede
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: !isLowBandwidthMode,
          liveSyncDuration: isLowBandwidthMode ? 10 : 3,
          liveMaxLatencyDuration: isLowBandwidthMode ? 25 : 8,
          maxBufferLength: isLowBandwidthMode ? 35 : 15,
          maxMaxBufferLength: isLowBandwidthMode ? 60 : 30,
          backBufferLength: 30,
          manifestLoadingTimeOut: 25000,
          manifestLoadingMaxRetry: 5,
          levelLoadingTimeOut: 25000,
          fragLoadingTimeOut: 30000,
          fragLoadingMaxRetry: 6,
          // ABR automático: calibra a resolução dinamicamente com a banda real
          abrBandWidthFactor: isLowBandwidthMode ? 0.7 : 0.9,
          abrBandWidthUpFactor: isLowBandwidthMode ? 0.5 : 0.7,
          startLevel: -1 // -1 = 100% Automático
        });

        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isMounted) return;
          failedServersRef.current.clear(); // Conexão bem-sucedida, reseta falhas prévias
          setIsLoading(false);
          setIsBuffering(false);
          setStreamHealth('online');

          video.play().catch(() => {
            video.muted = true;
            setIsMuted(true);
            video.play().catch(() => {});
          });
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
          if (!isMounted) return;
          const level = hls.levels[data.level];
          if (level && level.height) {
            setActiveResolutionLabel(`${level.height}p`);
          } else {
            setActiveResolutionLabel('Auto');
          }
        });

        let networkErrorCount = 0;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!isMounted) return;
          if (data.fatal) {
            console.warn('[LivePlayer HLS Fatal Error]:', data.type, data.details);
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                networkErrorCount += 1;
                if (networkErrorCount <= 2) {
                  console.log('Recuperando erro de rede HLS silenciosamente...');
                  hls.startLoad();
                } else {
                  console.log('Servidor instável ou desconectado, alternando automaticamente para próximo servidor...');
                  switchToNextServer('erro de rede hls');
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Recuperando erro de mídia HLS silenciosamente...');
                hls.recoverMediaError();
                break;
              default:
                switchToNextServer('erro fatal hls');
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Fallback nativo do Safari / WebKit iOS
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          if (!isMounted) return;
          failedServersRef.current.clear();
          setIsLoading(false);
          setIsBuffering(false);
          setStreamHealth('online');
          video.play().catch(() => {});
        });
        video.addEventListener('error', () => {
          if (!isMounted) return;
          switchToNextServer('erro nativo video');
        });
      } else {
        setIsLoading(false);
        setHasError(true);
        setStreamHealth('error');
        setErrorMessage('Seu navegador não suporta reprodução direta HLS.');
      }
    };

    startHls();

    // Detecção automática de travamentos (Buffer Stalls) em redes móveis/instáveis
    let bufferStallTimer: NodeJS.Timeout | null = null;
    const handleWaiting = () => {
      setIsBuffering(true);
      if (bufferStallTimer) clearTimeout(bufferStallTimer);

      // Se ficar congelado no buffering por mais de 7s, tenta recuperar ou alternar servidor automaticamente
      bufferStallTimer = setTimeout(() => {
        if (!isMounted) return;
        console.log('[LivePlayer] Buffering prolongado detectado. Alternando automaticamente de servidor...');
        switchToNextServer('buffering prolongado');
      }, 7000);

      const now = Date.now();
      if (now - lastStallTimeRef.current < 20000) {
        stallCountRef.current += 1;
      } else {
        stallCountRef.current = 1;
      }
      lastStallTimeRef.current = now;

      // Se ocorrerem stalls sucessivos em rede instável, ativa buffer estendido automaticamente e silenciosamente
      if (stallCountRef.current >= 2 && !isLowBandwidthMode) {
        stallCountRef.current = 0;
        setIsLowBandwidthMode(true);
        localStorage.setItem('playinfinity_live_low_bandwidth', 'true');
      }
    };

    const handlePlaying = () => {
      if (bufferStallTimer) clearTimeout(bufferStallTimer);
      setIsBuffering(false);
      setIsPlaying(true);
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);

    return () => {
      isMounted = false;
      if (bufferStallTimer) clearTimeout(bufferStallTimer);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, channel.id, selectedServerIndex, isLowBandwidthMode]);

  // Autoplay / Pause listener
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const lastVolumeRef = useRef<number>(1);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted || volume === 0) {
      const restored = lastVolumeRef.current > 0 ? lastVolumeRef.current : 0.8;
      video.muted = false;
      video.volume = restored;
      setVolume(restored);
      setIsMuted(false);
    } else {
      lastVolumeRef.current = volume;
      video.muted = true;
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(0, Math.min(1, parseFloat(e.target.value)));
    setVolume(val);
    const video = videoRef.current;
    if (video) {
      video.volume = val;
      if (val > 0) {
        video.muted = false;
        setIsMuted(false);
        lastVolumeRef.current = val;
      } else {
        video.muted = true;
        setIsMuted(true);
      }
    }
  };

  const adjustVolume = (delta: number) => {
    const base = isMuted ? 0 : volume;
    const next = Math.max(0, Math.min(1, Math.round((base + delta) * 100) / 100));
    setVolume(next);
    const video = videoRef.current;
    if (video) {
      video.volume = next;
      if (next > 0) {
        video.muted = false;
        setIsMuted(false);
        lastVolumeRef.current = next;
      } else {
        video.muted = true;
        setIsMuted(true);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const reloadStream = () => {
    if (channel.servers.length > 1) {
      setSelectedServerIndex(prev => (prev + 1) % channel.servers.length);
    }
    setIsLoading(true);
    setHasError(false);
    setStreamHealth('connecting');
    const video = videoRef.current;
    if (video && hlsRef.current && streamUrl) {
      hlsRef.current.destroy();
      const hls = new Hls({ 
        enableWorker: true, 
        lowLatencyMode: !isLowBandwidthMode,
        liveSyncDuration: isLowBandwidthMode ? 10 : 3,
        maxBufferLength: isLowBandwidthMode ? 35 : 15,
        startLevel: -1
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        setStreamHealth('online');
        video.play().catch(() => {});
      });
    }
  };

  // Navegação de canais (Anterior / Próximo)
  const currentIndex = allChannels.findIndex(c => c.id === channel.id);
  const handlePrevChannel = () => {
    if (allChannels.length <= 1) return;
    const nextIdx = (currentIndex - 1 + allChannels.length) % allChannels.length;
    setSelectedServerIndex(0);
    onSelectChannel(allChannels[nextIdx]);
  };

  const handleNextChannel = () => {
    if (allChannels.length <= 1) return;
    const nextIdx = (currentIndex + 1) % allChannels.length;
    setSelectedServerIndex(0);
    onSelectChannel(allChannels[nextIdx]);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      } else if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'm') {
        toggleMute();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        adjustVolume(0.05);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        adjustVolume(-0.05);
      } else if (e.key === 'f') {
        toggleFullscreen();
      } else if (e.key === 'ArrowLeft') {
        handlePrevChannel();
      } else if (e.key === 'ArrowRight') {
        handleNextChannel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, allChannels, isPlaying, isMuted, volume]);

  // Esconder controles após inatividade
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !showChannelList) {
        setShowControls(false);
      }
    }, 3500);
  };

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center select-none overflow-hidden"
    >
      {/* Elemento de Vídeo */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        className="w-full h-full object-contain cursor-pointer"
        onClick={togglePlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Botão flutuante para ativar áudio se o navegador iniciar em mudo */}
      {isMuted && !isLoading && !hasError && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-xl shadow-orange-600/30 backdrop-blur-md transition-all animate-bounce cursor-pointer border border-orange-400/40"
        >
          <VolumeX className="w-4 h-4" />
          <span>Áudio Desativado • Clique para Ativar</span>
        </button>
      )}

      {/* Spinner de Carregamento / Buffering */}
      {(isLoading || isBuffering) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs pointer-events-none z-20">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin"></div>
            <Tv className="w-6 h-6 text-orange-500 absolute inset-0 m-auto animate-pulse" />
          </div>
          <p className="mt-4 text-white font-medium tracking-wide text-sm flex items-center gap-2">
            <Radio className="w-4 h-4 text-orange-500 animate-pulse" />
            {isLoading ? `Sintonizando ${channel.name}...` : 'Ajustando transmissão...'}
          </p>
          <span className="text-xs text-neutral-400 mt-1">
            Qualidade adaptativa automática
          </span>
        </div>
      )}

      {/* Banner de Erro com Troca de Servidor Rápida */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md z-30 p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4 text-red-500">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Transmissão Temporariamente Indisponível</h3>
          <p className="text-neutral-400 text-sm max-w-md mb-6 leading-relaxed">
            {errorMessage || 'O fluxo deste servidor está instável ou sem sinal no momento.'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={reloadStream}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm transition-all shadow-lg shadow-orange-600/30 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Tentar Novamente
            </button>


            {onEditChannel && (
              <button
                onClick={() => onEditChannel(channel)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 font-semibold text-sm transition-all border border-white/5 cursor-pointer"
              >
                <Settings className="w-4 h-4 text-neutral-400" />
                Configurar URL do Canal
              </button>
            )}
          </div>
        </div>
      )}

      {/* CONTROLES SUPERIORES (TOP BAR) */}
      <div 
        className={`absolute top-0 left-0 w-full p-4 md:p-6 flex justify-between items-center bg-gradient-to-b from-black/90 via-black/40 to-transparent transition-opacity duration-300 z-30 pointer-events-auto ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md cursor-pointer border border-white/10"
            title="Voltar aos canais"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <ChannelLogo
            channel={channel}
            size="sm"
            className="h-8 min-w-[50px] max-w-[90px] bg-black/40 px-1.5 py-1 rounded border border-white/10 shrink-0"
          />

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-bold text-base md:text-lg drop-shadow">{channel.name}</h2>
            </div>
            {channel.currentProgram && (
              <p className="text-xs text-neutral-300 line-clamp-1 max-w-md drop-shadow">
                {channel.currentProgram}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status do stream */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-xs text-neutral-300">
            <span className={`w-2 h-2 rounded-full ${
              streamHealth === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 
              streamHealth === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
            }`}></span>
            <span>{streamHealth === 'online' ? 'Sinal Estável' : streamHealth === 'connecting' ? 'Sincronizando...' : 'Sem Sinal'}</span>
          </div>

          {/* Botão Guia de Canais Rápido */}
          <button
            onClick={() => setShowChannelList(!showChannelList)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md border transition-all cursor-pointer ${
              showChannelList ? 'bg-orange-600 text-white border-orange-500' : 'bg-black/60 hover:bg-black/80 text-neutral-200 border-white/10'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Guia de Canais</span>
          </button>

          {/* Botão Fechar */}
          <button
            onClick={onClose}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md cursor-pointer border border-white/10"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* GAVETA LATERAL DE CANAIS RÁPIDA (QUICK CHANNEL SWITCHER) */}
      {showChannelList && (
        <div className="absolute top-16 right-4 md:right-6 bottom-20 w-80 max-w-[85vw] bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl p-3 z-40 flex flex-col shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
            <h4 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5 text-orange-500" /> Trocar de Canal
            </h4>
            <button 
              onClick={() => setShowChannelList(false)}
              className="text-neutral-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
            {allChannels.map((c) => {
              const isCurrent = c.id === channel.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedServerIndex(0);
                    onSelectChannel(c);
                    setShowChannelList(false);
                  }}
                  className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-all cursor-pointer ${
                    isCurrent 
                      ? 'bg-orange-600/20 border border-orange-500/50 text-orange-400' 
                      : 'hover:bg-white/5 text-neutral-300 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {c.logo ? (
                      <img src={c.logo} alt={c.name} className="w-6 h-6 object-contain" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                    ) : (
                      <Tv className="w-4 h-4 text-orange-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate leading-tight">{c.name}</p>
                    <p className="text-[10px] text-neutral-500 truncate">{c.category}</p>
                  </div>
                  {isCurrent && (
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shrink-0"></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* CONTROLES INFERIORES (BOTTOM BAR) */}
      <div 
        className={`absolute bottom-0 left-0 w-full p-4 md:p-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 z-30 pointer-events-auto ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
          {/* Lado Esquerdo: Play, Vol, Próximo/Anterior */}
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={handlePrevChannel}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer"
              title="Canal Anterior (Seta Esquerda)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              onClick={togglePlay}
              className="p-3 rounded-full bg-orange-600 hover:bg-orange-500 text-white transition-all shadow-lg shadow-orange-600/40 hover:scale-105 cursor-pointer"
              title={isPlaying ? 'Pausar' : 'Reproduzir'}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
            </button>

            <button
              onClick={handleNextChannel}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer"
              title="Próximo Canal (Seta Direita)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Controle de Volume Aprimorado */}
            <div className="flex items-center gap-2 ml-1 md:ml-2 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-xl border border-white/5 transition-all">
              <button
                onClick={toggleMute}
                className="p-1 rounded-lg hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer shrink-0"
                title={isMuted || volume === 0 ? 'Desmutar (M)' : 'Mutar (M)'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5 text-red-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-5 h-5 text-neutral-200" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                style={{
                  background: `linear-gradient(to right, #ea580c ${isMuted ? 0 : Math.round(volume * 100)}%, #404040 ${isMuted ? 0 : Math.round(volume * 100)}%)`
                }}
                className="w-16 sm:w-24 md:w-32 accent-orange-500 cursor-pointer h-2 rounded-lg appearance-none transition-all"
                title={`Volume: ${isMuted ? 0 : Math.round(volume * 100)}% (Use ↑ e ↓ para ajustar)`}
              />

              <span className="text-xs font-bold text-neutral-300 min-w-[34px] text-right tabular-nums select-none">
                {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
              </span>
            </div>

            {/* Recarregar Stream */}
            <button
              onClick={reloadStream}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer"
              title="Sincronizar / Recarregar Transmissão Ao Vivo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Lado Direito: PiP, Fullscreen */}
          <div className="flex items-center gap-2">
            {/* Picture-in-Picture se suportado */}
            {document.pictureInPictureEnabled && (
              <button
                onClick={() => {
                  if (videoRef.current) {
                    if (document.pictureInPictureElement) {
                      document.exitPictureInPicture().catch(() => {});
                    } else {
                      videoRef.current.requestPictureInPicture().catch(() => {});
                    }
                  }
                }}
                className="hidden md:flex p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer"
                title="Picture in Picture (Mini Player)"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}

            {/* Tela Cheia */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer"
              title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia (F)'}
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
