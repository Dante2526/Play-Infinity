import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { 
  X, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  RotateCcw, 
  Server, 
  Tv, 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  Radio, 
  ExternalLink,
  ListFilter,
  CheckCircle2,
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
  const [showServerMenu, setShowServerMenu] = useState<boolean>(false);
  const [streamHealth, setStreamHealth] = useState<'online' | 'connecting' | 'error'>('connecting');

  // Ajuste automático de estabilidade para conexão (sem notificações intrusivas)
  const [isLowBandwidthMode, setIsLowBandwidthMode] = useState<boolean>(() => {
    return localStorage.getItem('playinfinity_live_low_bandwidth') === 'true';
  });
  const [activeResolutionLabel, setActiveResolutionLabel] = useState<string>('Auto');

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stallCountRef = useRef<number>(0);
  const lastStallTimeRef = useRef<number>(0);

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

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!isMounted) return;
          if (data.fatal) {
            console.warn('[LivePlayer HLS Fatal Error]:', data.type, data.details);
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Recuperando erro de rede HLS silenciosamente...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Recuperando erro de mídia HLS silenciosamente...');
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                setHasError(true);
                setStreamHealth('error');
                setIsLoading(false);
                setErrorMessage('Falha ao sincronizar fluxo ao vivo. Tente outro servidor ou recarregue.');
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Fallback nativo do Safari / WebKit iOS
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          if (!isMounted) return;
          setIsLoading(false);
          setIsBuffering(false);
          setStreamHealth('online');
          video.play().catch(() => {});
        });
        video.addEventListener('error', () => {
          if (!isMounted) return;
          setHasError(true);
          setStreamHealth('error');
          setIsLoading(false);
          setErrorMessage('Erro ao reproduzir fluxo nativo. Alterne de servidor.');
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
    // O ajuste do modo estável é acionado SILENCIOSAMENTE em segundo plano (sem nenhum aviso na tela)
    const handleWaiting = () => {
      setIsBuffering(true);
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
      setIsBuffering(false);
      setIsPlaying(true);
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);

    return () => {
      isMounted = false;
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

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
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
  }, [currentIndex, allChannels, isPlaying, isMuted]);

  // Esconder controles após inatividade
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !showChannelList && !showServerMenu) {
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

            {channel.servers.length > 1 && (
              <button
                onClick={() => {
                  const nextServer = (selectedServerIndex + 1) % channel.servers.length;
                  setSelectedServerIndex(nextServer);
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-sm transition-all border border-white/10 cursor-pointer"
              >
                <Server className="w-4 h-4 text-orange-500" />
                Alternar para Servidor {(selectedServerIndex + 1) % channel.servers.length + 1}
              </button>
            )}

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
              <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-600 text-white tracking-widest shadow-[0_0_12px_rgba(220,38,38,0.8)]">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                AO VIVO
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                {activeResolutionLabel !== 'Auto' ? activeResolutionLabel : 'Auto'}
              </span>
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

            {/* Controle de Volume */}
            <div className="flex items-center gap-2 ml-1 md:ml-2">
              <button
                onClick={toggleMute}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer"
                title={isMuted ? 'Desmutar' : 'Mutar'}
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-14 md:w-24 accent-orange-500 cursor-pointer h-1.5 bg-neutral-700 rounded-lg appearance-none"
              />
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

          {/* Lado Direito: Seletor de Servidor, PiP, Fullscreen */}
          <div className="flex items-center gap-2">
            {/* Menu de Servidor */}
            <div className="relative">
              <button
                onClick={() => setShowServerMenu(!showServerMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-200 text-xs font-semibold backdrop-blur-md transition-all border border-white/10 cursor-pointer"
              >
                <Server className="w-3.5 h-3.5 text-orange-500" />
                <span className="hidden sm:inline">{currentServer?.name || 'Servidor 1'}</span>
                <span className="sm:hidden">S{selectedServerIndex + 1}</span>
              </button>

              {showServerMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-64 bg-black/95 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2">
                  <div className="px-2 py-1 text-[11px] font-bold text-neutral-400 uppercase tracking-wider border-b border-white/10 mb-1">
                    Servidores Disponíveis
                  </div>
                  {channel.servers.map((srv, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedServerIndex(idx);
                        setShowServerMenu(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-all cursor-pointer ${
                        selectedServerIndex === idx 
                          ? 'bg-orange-600/20 text-orange-400 font-semibold' 
                          : 'hover:bg-white/10 text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Server className="w-3.5 h-3.5" />
                        <span>{srv.name}</span>
                      </div>
                      {selectedServerIndex === idx && <CheckCircle2 className="w-3.5 h-3.5 text-orange-500" />}
                    </button>
                  ))}

                  {onEditChannel && (
                    <button
                      onClick={() => {
                        setShowServerMenu(false);
                        onEditChannel(channel);
                      }}
                      className="w-full flex items-center gap-2 p-2 mt-1 rounded-xl text-left text-xs text-orange-400 hover:bg-orange-500/10 transition-all border-t border-white/5 cursor-pointer font-medium"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Configurar / Adicionar URL</span>
                    </button>
                  )}
                </div>
              )}
            </div>

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
