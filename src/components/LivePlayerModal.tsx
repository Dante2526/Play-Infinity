import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Cast, 
  X, 
  Play, 
  Pause, 
  Volume1,
  Volume2, 
  VolumeX, 
  Maximize, 
  Maximize2,
  Minimize, 
  PictureInPicture2,
  RotateCcw, 
  Tv, 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  Radio, 
  ListFilter,
  AlertCircle
} from 'lucide-react';
import { LiveChannel } from '../data/liveChannels';
import { ChannelLogo } from './ChannelLogo';
import { CastModal } from './CastModal';
import { detectConnectionQuality } from '../services/networkQuality';
import { Capacitor, registerPlugin } from '@capacitor/core';
const PiP = registerPlugin<any>('PiP');
import { ScreenOrientation } from '@capacitor/screen-orientation';

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
  const [isNativePiP, setIsNativePiP] = useState<boolean>(false);
  const [isRotated, setIsRotated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showChannelList, setShowChannelList] = useState<boolean>(false);
  const [showCastModal, setShowCastModal] = useState<boolean>(false);
  const [showServerMenu, setShowServerMenu] = useState<boolean>(false);
  const [streamHealth, setStreamHealth] = useState<'online' | 'connecting' | 'error'>('connecting');
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  // Ajuste automático de estabilidade para conexão (sem notificações intrusivas)
  const [isLowBandwidthMode, setIsLowBandwidthMode] = useState<boolean>(false);
  const [activeResolutionLabel, setActiveResolutionLabel] = useState<string>('Auto');

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stallCountRef = useRef<number>(0);
  const lastStallTimeRef = useRef<number>(0);
  // Espelha isLowBandwidthMode em ref para uso dentro de intervals/closures sem precisar recriar o efeito
  const isLowBandwidthModeRef = useRef<boolean>(false);
  const failedServersRef = useRef<Set<number>>(new Set());

  // Mini Player Flutuante (mesmo mecanismo de arrastar/redimensionar usado em filmes e séries)
  const [isMiniPlayer, setIsMiniPlayer] = useState<boolean>(false);
  const [miniPosition, setMiniPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cardDimensionsRef = useRef<{ width: number; height: number }>({ width: 300, height: 200 });
  const miniContainerRef = useRef<HTMLDivElement | null>(null);

  // Escuta Picture-in-Picture nativo do Android
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
        setIsFullscreen(false);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    window.addEventListener('pipModeChanged', handlePiPChange);
    return () => window.removeEventListener('pipModeChanged', handlePiPChange);
  }, []);

  // Mantém o mini player contido na tela se a janela for redimensionada
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

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMiniPlayer, !miniPosition]);

  const handleMiniHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Apenas botão principal (esquerdo) ou toque
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement).closest('button')) return;
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

  const handleClose = () => {
    if (Capacitor.isNativePlatform()) {
      PiP.setVideoPlaying({ isPlaying: false }).catch(() => {});
      ScreenOrientation.unlock().catch(() => {});
    }
    onClose();
  };

  const toggleInAppMiniPlayer = () => {
    if (isMiniPlayer) {
      if (Capacitor.isNativePlatform()) {
        ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
      }
      setIsMiniPlayer(false);
    } else {
      if (Capacitor.isNativePlatform()) {
        ScreenOrientation.unlock().catch(() => {});
      }
      // Some da tela cheia nativa antes de encolher, senão o navegador mantém o vídeo preso em tela cheia
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setShowChannelList(false);
      if (miniPosition) {
        const width = miniContainerRef.current?.offsetWidth || 300;
        const height = miniContainerRef.current?.offsetHeight || 200;
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

  const handleToggleMiniPlayer = () => {
    if (Capacitor.isNativePlatform()) {
      PiP.enter().catch(() => {
        toggleInAppMiniPlayer();
      });
      return;
    }
    toggleInAppMiniPlayer();
  };

  // Limpa histórico de falhas ao trocar de canal
  useEffect(() => {
    failedServersRef.current.clear();
  }, [channel.id]);

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !isMiniPlayer) {
        setShowControls(false);
        setShowChannelList(false);
      }
    }, 4000);
  }, [isPlaying, isMiniPlayer]);

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, resetControlsTimeout]);

  // Notifica o app que o player ao vivo está aberto (para ocultar botões e controles flutuantes)
  useEffect(() => {
    document.body.classList.add('live-player-open');
    window.dispatchEvent(new CustomEvent('playinfinity:player_state', { detail: { isOpen: true } }));
    return () => {
      document.body.classList.remove('live-player-open');
      window.dispatchEvent(new CustomEvent('playinfinity:player_state', { detail: { isOpen: false } }));
    };
  }, []);

  // Função centralizada para alternar de servidor automaticamente em caso de queda ou erro
  const switchToNextServer = useCallback((reason?: string) => {
    if (channel.servers.length <= 1) {
      console.log(`[LivePlayer] Servidor único falhou (${reason}). Recarregando master playlist...`);
      setReloadNonce(prev => prev + 1);
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

  // Determina a URL atual baseada no servidor selecionado e status de proxy
  const currentServer = channel.servers[selectedServerIndex] || channel.servers[0];
  // Web uses its own origin; a build-time localhost must never reach viewers.
  // Packaged Capacitor clients use the public HTTPS API.
  const proxyBase = Capacitor.isNativePlatform() ? 'https://play-infinity.stream' : '';
  const serverUrl = currentServer?.url || '';
  const rawUrl = serverUrl.startsWith('/api/external-channel?')
    ? `${serverUrl}&retry=${reloadNonce}&_cb=${reloadNonce}`
    : serverUrl;
  const isInternalApi = rawUrl.startsWith('/api/');
  const streamUrl = currentServer?.isProxy 
    ? `${proxyBase}/api/live-stream-proxy?url=${encodeURIComponent(rawUrl)}` 
    : (isInternalApi ? `${proxyBase}${rawUrl}` : rawUrl);
  
  // Detecta se é stream DASH (bolodechocolate) — usa dash.js em vez de hls.js
  const isDashStream = currentServer?.url?.includes("/api/bolodechocolate") || false;
  const isEmbedStream = currentServer?.isEmbed || false;

  // Inicializa e carrega o stream com Hls.js com ABR 100% automático baseado na conexão
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');
    setStreamHealth('connecting');

    const video = videoRef.current;
    if (!video || !streamUrl) return;
    if (isEmbedStream) { setStreamHealth("online"); setIsLoading(false); return; }

    let recoveryTimeout: NodeJS.Timeout | null = null;
    const clearRecoveryTimeout = () => {
      if (recoveryTimeout) {
        clearTimeout(recoveryTimeout);
        recoveryTimeout = null;
      }
    };

    // Garante que o elemento inicie com volume no máximo (100%)
    video.volume = 1.0;
    video.muted = false;

    // Destrói instância HLS prévia
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    // Destrói instância dash.js prévia
    if ((video as any)._dashPlayer) {
      try { (video as any)._dashPlayer.reset(); } catch (e) { console.warn("Falha ao resetar dashPlayer:", e); }
      delete (video as any)._dashPlayer;
    }

    // Se for stream DASH (bolodechocolate), usa dash.js com ClearKey DRM
    if (isDashStream) {
      const startDash = async () => {
        try {
          // 1. Busca o MPD URL + ClearKey do backend
          const canal = new URLSearchParams(streamUrl.split('?')[1] || '').get('canal') || 'premiereclubes';
          const res = await fetch(`/api/bolodechocolate?canal=${canal}`);
          if (!res.ok) throw new Error(`Backend retornou ${res.status}`);
          const data = await res.json();
          if (!data.mpd_url) throw new Error('MPD URL não encontrado');
          if (!isMounted) return;

          // 2. Carrega dash.js dinamicamente
          if (!(window as any).dashjs) {
            await new Promise<void>((resolve, reject) => {
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js';
              script.onload = () => resolve();
              script.onerror = () => reject(new Error('Falha ao carregar dash.js'));
              document.head.appendChild(script);
            });
          }
          if (!isMounted) return;

          // 3. Cria player dash.js com ClearKey DRM
          const dashjs = (window as any).dashjs;
          const player = dashjs.MediaPlayer().create();
          (video as any)._dashPlayer = player;

          // Configura ClearKey (DRM sem license server — key fornecida direto)
          if (data.ck_id && data.ck_key) {
            const kid = data.ck_id;
            const key = data.ck_key;
            // ClearKey needs key in base64 format
            const kidB64 = btoa(kid.match(/.{2}/g)?.map((h: string) => String.fromCharCode(parseInt(h, 16))).join('') || '');
            const keyB64 = btoa(key.match(/.{2}/g)?.map((h: string) => String.fromCharCode(parseInt(h, 16))).join('') || '');
            player.setProtectionData({
              'org.w3.clearkey': {
                clearkeys: { [kid]: key }
              }
            });
          }

          player.initialize(video, data.mpd_url, true); // autoplay=true
          console.log(`[LivePlayer] DASH inicializado: ${data.mpd_url.substring(0, 80)}...`);

          // Eventos para atualizar UI (igual hls.js faz)
          player.on('streamInitialized', () => {
            if (!isMounted) return;
            setStreamHealth('online');
            setIsLoading(false);
            setIsBuffering(false);
            video.play().catch(() => {
              video.muted = true;
              video.play().catch(() => {});
            });
          });
          player.on('error', (e: any) => {
            if (!isMounted) return;
            console.warn('[LivePlayer] DASH error:', e);
          });

          video.addEventListener('waiting', () => setIsBuffering(true));
          video.addEventListener('playing', () => { setIsBuffering(false); setIsLoading(false); setStreamHealth('online'); });
          video.addEventListener('timeupdate', () => { setIsLoading(false); setIsBuffering(false); });
          video.addEventListener('canplay', () => { setIsLoading(false); setStreamHealth('online'); });
        } catch (err: any) {
          if (!isMounted) return;
          console.error('[LivePlayer] DASH init error:', err);
          setHasError(true);
          setStreamHealth('error');
          setErrorMessage('Não foi possível carregar o stream DASH.');
        }
      };
      startDash();
      return;
    }

    const startHls = () => {
      const currentLowBandwidth = isLowBandwidthMode;

      if (Hls.isSupported()) {
        // Configuração de Alta Resiliência Contínua (Anti-Travamento / Continuous Live Streaming)
        // ANTI-TELA-PRETA: ABR automático, buffers equilibrados, sem força de nível fixo
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          liveDurationInfinity: true,
          startLevel: -1,        // ABR automático — nunca forçar nível manualmente
          autoStartLoad: true,
          capLevelToPlayerSize: true, // Evita baixar qualidade acima do necessário
          abrEwmaDefaultEstimate: 1500000, // Estimativa inicial de 1.5 Mbps (evita queda abrupta)
          // Buffers maiores para TV ao vivo (evita stalls em redes instáveis)
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          backBufferLength: 10,
          // Live sync com janela mais curta = menos chance de flush total
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 8,
          // watchdog mais conservador: não libera buffer de forma agressiva
          highBufferWatchdogPeriod: 5,
          maxBufferHole: 0.3,
          nudgeMaxRetry: 10,
          nudgeOffset: 0.2,
          manifestLoadingTimeOut: 25000,
          manifestLoadingMaxRetry: 8,
          levelLoadingTimeOut: 25000,
          levelLoadingMaxRetry: 8,
          fragLoadingTimeOut: 30000,
          fragLoadingMaxRetry: 20,
          fragLoadingRetryDelay: 800,
          fragLoadingMaxRetryTimeout: 35000,
        });

        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        const clearLoadingState = () => {
          if (!isMounted) return;
          setIsLoading(false);
          setIsBuffering(false);
        };

        hls.on(Hls.Events.MANIFEST_LOADED, () => {
          if (!isMounted) return;
        });

        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          if (!isMounted) return;
          failedServersRef.current.clear();

          // ANTI-TELA-PRETA: NUNCA forçar currentLevel manualmente.
          // Deixar ABR automático escolher. Forçar um nível causa flush de buffer → tela preta.
          // Apenas loga a resolução disponível para o usuário.
          if (data && data.levels && data.levels.length > 0) {
            const highest = data.levels[data.levels.length - 1];
            if (highest && highest.height) {
              setActiveResolutionLabel(`Auto (até ${highest.height}p)`);
            } else {
              setActiveResolutionLabel('Auto');
            }
          } else {
            setActiveResolutionLabel('Auto');
          }

          // Assegura volume inicial
          video.volume = 1.0;

          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              if (isMounted) {
                setIsPlaying(true);
                clearLoadingState();
              }
            }).catch(() => {
              // Se o navegador bloquear autoplay com som (política Chrome/Mobile), inicia em mudo
              video.muted = true;
              setIsMuted(true);
              video.play().then(() => {
                if (isMounted) {
                  setIsPlaying(true);
                  clearLoadingState();
                }
              }).catch(() => {});
            });
          }
        });

        hls.on(Hls.Events.LEVEL_LOADED, () => {
          if (!isMounted) return;
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
        let mediaErrorCount = 0;

        hls.on(Hls.Events.FRAG_LOADING, () => {
          if (!isMounted) return;
        });

        hls.on(Hls.Events.FRAG_LOADED, () => {
          if (!isMounted) return;
          clearRecoveryTimeout();
          recoveryTimeout = setTimeout(() => {
            if (!isMounted) return;
            if (networkErrorCount > 0 || mediaErrorCount > 0) {
              console.log('[LivePlayer] Conexão estável. Resetando contadores de erro cumulativos.');
            }
            networkErrorCount = 0;
            mediaErrorCount = 0;
          }, 15000);
        });

        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          if (!isMounted) return;
          // Somente agora temos vídeo real adicionado ao buffer de reprodução
          setStreamHealth('online');
          setIsLoading(false);
          setIsBuffering(false);
        });

        hls.on(Hls.Events.BUFFER_APPENDED, () => {
          if (!isMounted) return;
          setStreamHealth('online');
          setIsLoading(false);
          setIsBuffering(false);
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!isMounted) return;
          clearRecoveryTimeout();
          
          if (data.fatal) {
            console.warn('[LivePlayer HLS Fatal Error]:', data.type, data.details);
            
            // Atalho para erros fatais que não recuperam com startLoad()/recoverMediaError():
            // - levelParsingError: proxy devolveu HTML em vez de m3u8 (Xtream 404 ou página de login)
            // - manifestParsingError: idem, mestre inválido
            // - levelLoadError: falha ao carregar variante após manifesto mestre válido
            // Para esses, hls.startLoad() só vai re-fazer a mesma requisição falha em loop.
            // Trocar de servidor imediatamente — sem contar 6 retries.
            const unrecoverableDetails = [
              Hls.ErrorDetails.LEVEL_PARSING_ERROR,
              Hls.ErrorDetails.MANIFEST_LOAD_ERROR,
              (Hls.ErrorDetails as any).MANIFEST_PARSING_ERROR,
              (Hls.ErrorDetails as any).LEVEL_LOAD_ERROR,
              (Hls.ErrorDetails as any).MANIFEST_LOAD_TIMEOUT,
            ];
            if (unrecoverableDetails.includes(data.details)) {
              console.warn(`[LivePlayer] Erro fatal não-recuperável (${data.details}), alternando para próximo servidor imediatamente...`);
              switchToNextServer(`erro fatal ${data.details}`);
              return;
            }
            
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                networkErrorCount += 1;
                if (networkErrorCount <= 6) {
                  console.log(`[LivePlayer] Recuperando erro de rede HLS silenciosamente (${networkErrorCount}/6)...`);
                  hls.startLoad();
                } else {
                  console.log('[LivePlayer] Servidor instável ou desconectado, alternando automaticamente para próximo servidor...');
                  switchToNextServer('erro de rede hls');
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                mediaErrorCount += 1;
                if (mediaErrorCount === 1) {
                  console.log('[LivePlayer] Recuperando erro de mídia HLS silenciosamente...');
                  hls.recoverMediaError();
                } else if (mediaErrorCount <= 6) {
                  hls.startLoad();
                } else {
                  console.log('[LivePlayer] Erro de mídia persistente, alternando para próximo servidor...');
                  switchToNextServer('erro de midia persistente');
                }
                break;
              default:
                switchToNextServer('erro fatal hls');
                break;
            }
          } else {
             if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || 
                 data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL ||
                 data.details === (Hls.ErrorDetails as any).BUFFER_SEEK_OVER_HOLE ||
                 data.details === (Hls.ErrorDetails as any).BUFFER_HOLE_ERR) {
               // Em micro-stalls, recarrega fragmentos suavemente sem interromper a timeline
               try {
                 if (hls && !video.paused) {
                   hls.startLoad();
                   video.play().catch(() => {});
                 }
               } catch(_){console.warn("Silenced error:", _);}
             }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Fallback nativo do Safari / WebKit iOS
        video.src = streamUrl;
        
        const handleNativeLoadedMetadata = () => {
          if (!isMounted) return;
          failedServersRef.current.clear();
          setIsLoading(false);
          setIsBuffering(false);
          setStreamHealth('online');

          video.volume = 1.0;
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {
              video.muted = true;
              setIsMuted(true);
              video.play().catch(() => {});
            });
          }
        };

        const handleNativeError = () => {
          if (!isMounted) return;
          switchToNextServer('erro nativo video');
        };

        // Salva referência no elemento de vídeo temporariamente para facilitar o cleanup no unmount
        (video as any)._nativeMetaHandler = handleNativeLoadedMetadata;
        (video as any)._nativeErrorHandler = handleNativeError;

        video.addEventListener('loadedmetadata', handleNativeLoadedMetadata);
        video.addEventListener('error', handleNativeError);
      } else {
        setIsLoading(false);
        setHasError(true);
        setStreamHealth('error');
        setErrorMessage('Seu navegador não suporta reprodução direta HLS.');
      }
    };

    startHls();

    // Watchdog de sintonia inicial: força tentativa de disparo de playback (autoplay) aos 2.5s sem esconder o spinner prematuramente
    const initialLoadingWatchdogTimer = setTimeout(() => {
      if (!isMounted) return;
      const v = videoRef.current;
      if (v) {
        if (v.readyState >= 2 || v.currentTime > 0) {
          setIsLoading(false);
          setIsBuffering(false);
          setIsPlaying(true);
        }
        if (v.paused && hlsRef.current) {
          console.log('[LivePlayer] Disparando playback pelo watchdog inicial...');
          v.play().catch(() => {
            v.muted = true;
            setIsMuted(true);
            v.play().catch(() => {});
          });
        }
      }
    }, 2500);

    const initialTimeoutServerSwitchTimer = setTimeout(() => {
      if (!isMounted) return;
      const v = videoRef.current;
      const hls = hlsRef.current;
      const hasLevels = hls && hls.levels && hls.levels.length > 0;
      // Dá tempo suficiente (18s) para conexões mais lentas antes de considerar servidor inoperante
      if (v && v.readyState === 0 && v.currentTime === 0 && !hasLevels) {
        if (channel.servers.length > 1) {
          console.log('[LivePlayer] Timeout de conexão inicial (18s sem dados), tentando próximo servidor...');
          switchToNextServer('timeout de sintonia');
        }
      }
    }, 18000);

    // Detecção e recuperação ultra-rápida de travamentos (Buffer Stalls / Freeze Healer)
    let bufferStallTimer: NodeJS.Timeout | null = null;
    let recoveryAttemptTimer: NodeJS.Timeout | null = null;
    let bufferingDebounceTimer: NodeJS.Timeout | null = null;

    const handleWaiting = () => {
      // Debounce suave de 3.5s antes de exibir aviso de buffering (evita piscar em micro-pausas)
      if (!bufferingDebounceTimer) {
        bufferingDebounceTimer = setTimeout(() => {
          if (!isMounted) return;
          setIsBuffering(true);
        }, 3500);
      }

      if (bufferStallTimer) clearTimeout(bufferStallTimer);
      if (recoveryAttemptTimer) clearTimeout(recoveryAttemptTimer);

      // Tentativa de recarga suave aos 4 segundos para destravar a fila de rede
      recoveryAttemptTimer = setTimeout(() => {
        if (!isMounted || !videoRef.current) return;
        const v = videoRef.current;
        if (hlsRef.current) {
          hlsRef.current.startLoad();
        }
        if (v.paused) {
          v.play().catch(() => {});
        }
      }, 4000);

      // Se ficar congelado no buffering por mais de 35s seguidos, alterna para o próximo servidor se houver
      bufferStallTimer = setTimeout(() => {
        if (!isMounted) return;
        if (channel.servers.length > 1) {
          console.log('[LivePlayer] Buffering persistente (35s) detectado. Alternando automaticamente...');
          switchToNextServer('buffering prolongado');
        } else {
          console.log('[LivePlayer] Buffering persistente (35s) detectado. Recarregando playlist mestre...');
          setReloadNonce(prev => prev + 1);
        }
      }, 35000);
    };

    const handlePlaying = () => {
      if (bufferingDebounceTimer) {
        clearTimeout(bufferingDebounceTimer);
        bufferingDebounceTimer = null;
      }
      if (bufferStallTimer) {
        clearTimeout(bufferStallTimer);
        bufferStallTimer = null;
      }
      if (recoveryAttemptTimer) {
        clearTimeout(recoveryAttemptTimer);
        recoveryAttemptTimer = null;
      }
      setIsLoading(false);
      setIsBuffering(false);
      setIsPlaying(true);
      setStreamHealth('online');
    };

    // Ao avançar o tempo de reprodução, cancela qualquer aviso de buffering pendente imediatamente
    const handleTimeUpdate = () => {
      if (bufferingDebounceTimer) {
        clearTimeout(bufferingDebounceTimer);
        bufferingDebounceTimer = null;
      }
      setIsLoading(false);
      setIsBuffering(false);
      setIsPlaying(true);
      setStreamHealth('online');
    };

    const handleCanPlay = () => {
      if (!isMounted) return;
      setIsLoading(false);
      setIsBuffering(false);
      setStreamHealth('online');
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadeddata', handleCanPlay);

    // Watchdog de recuperação de qualidade: desativa o modo de baixa banda e normaliza os buffers
    // quando a rede estiver estável, deixando o ABR nativo gerenciar os níveis de vídeo suavemente
    const qualityRecoveryInterval = setInterval(async () => {
      if (!isMounted) return;
      const hls = hlsRef.current;
      if (!hls) return;

      // Evita testar upgrade logo após um travamento recente
      if (Date.now() - lastStallTimeRef.current < 20000) return;

      const netQuality = await detectConnectionQuality(true); // força nova checagem, ignora cache
      if (!isMounted || netQuality !== 'fast') return;

      if (isLowBandwidthModeRef.current) {
        hls.config.maxBufferLength = 30;
        hls.config.maxMaxBufferLength = 60;
        hls.config.liveSyncDuration = undefined;
        isLowBandwidthModeRef.current = false;
        setIsLowBandwidthMode(false);
        console.log('[LivePlayer] Conexão estável, buffers normalizados.');
      }
    }, 20000);

    // Watchdog de detecção de inatividade de playback (sem alterar currentTime artificialmente)
    let lastObservedTime = -1;
    let frozenFrameTicks = 0;
    const frozenFrameInterval = setInterval(() => {
      if (!isMounted) return;
      const v = videoRef.current;
      if (!v || v.paused || v.seeking) {
        frozenFrameTicks = 0;
        return;
      }

      if (v.currentTime > 0 && Math.abs(v.currentTime - lastObservedTime) < 0.05) {
        frozenFrameTicks += 1;
        // ANTI-TELA-PRETA: espera 15s de freeze antes de agir (antes eram 9s)
        // Ação prematura causava re-load desnecessário que reiniciava o buffer → tela preta
        if (frozenFrameTicks >= 5) {
          console.log('[LivePlayer] Fluxo inerte detectado (15s). Recarregando playlist mestre (possível token expirado)...');
          setReloadNonce(prev => prev + 1);
          frozenFrameTicks = 0;
        }
      } else {
        frozenFrameTicks = 0;
        lastObservedTime = v.currentTime;
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearTimeout(initialLoadingWatchdogTimer);
      clearTimeout(initialTimeoutServerSwitchTimer);
      if (bufferingDebounceTimer) clearTimeout(bufferingDebounceTimer);
      if (recoveryAttemptTimer) clearTimeout(recoveryAttemptTimer);
      if (bufferStallTimer) clearTimeout(bufferStallTimer);
      clearInterval(qualityRecoveryInterval);
      clearInterval(frozenFrameInterval);
      clearRecoveryTimeout();
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadeddata', handleCanPlay);

      if ((video as any)._nativeMetaHandler) {
        video.removeEventListener('loadedmetadata', (video as any)._nativeMetaHandler);
        delete (video as any)._nativeMetaHandler;
      }
      if ((video as any)._nativeErrorHandler) {
        video.removeEventListener('error', (video as any)._nativeErrorHandler);
        delete (video as any)._nativeErrorHandler;
      }

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, channel.id, selectedServerIndex, reloadNonce, isDashStream]);

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
      const restored = lastVolumeRef.current > 0 ? lastVolumeRef.current : 1.0;
      video.muted = false;
      video.volume = restored;
      setVolume(restored);
      setIsMuted(false);
      lastVolumeRef.current = restored;
    } else {
      lastVolumeRef.current = volume > 0 ? volume : 1.0;
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
      if (!isCurrentlyFullscreen && screen.orientation && typeof (screen.orientation as any).unlock === "function") {
        try {
          (screen.orientation as any).unlock();
        } catch(_){console.warn("Silenced error:", _);}
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

  // Ao abrir a TV ao vivo, entra automaticamente em tela cheia e já força a exibição
  // deitada (paisagem) no celular -- sem depender de nenhuma detecção pontual/condicional
  // que possa falhar por timing com a troca para tela cheia. Fica escutando a orientação
  // real do aparelho o tempo todo enquanto o player estiver aberto, então sempre que o
  // celular estiver na vertical a imagem já aparece girada, e volta ao normal sozinha se
  // o usuário girar o aparelho de verdade para paisagem.
  useEffect(() => {
    const elem = document.documentElement;
    const requestFS =
      elem.requestFullscreen ||
      (elem as any).webkitRequestFullscreen ||
      (elem as any).mozRequestFullScreen ||
      (elem as any).msRequestFullscreen;

    if (requestFS && !document.fullscreenElement) {
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

    // Trava fisicamente a orientação em paisagem (landscape) no app Android Capacitor
    if (Capacitor.isNativePlatform()) {
      ScreenOrientation.lock({ orientation: "landscape" })
        .then(() => setIsRotated(false))
        .catch(() => {});
    } else if (typeof screen !== "undefined" && screen.orientation && typeof (screen.orientation as any).lock === "function") {
      try {
        const lockPromise = (screen.orientation as any).lock("landscape");
        if (lockPromise && typeof lockPromise.catch === "function") {
          lockPromise.catch(() => {});
        }
      } catch (_) {
        console.warn("Silenced error:", _);
      }
    }

    const handleOrientationOrResize = () => {
      if (typeof window !== "undefined" && window.innerWidth > window.innerHeight) {
        setIsRotated(false);
      }
    };
    window.addEventListener("resize", handleOrientationOrResize);
    window.addEventListener("orientationchange", handleOrientationOrResize);

    return () => {
      window.removeEventListener("resize", handleOrientationOrResize);
      window.removeEventListener("orientationchange", handleOrientationOrResize);
      if (Capacitor.isNativePlatform()) {
        ScreenOrientation.unlock().catch(() => {});
      } else if (typeof screen !== "undefined" && screen.orientation && typeof (screen.orientation as any).unlock === "function") {
        try {
          (screen.orientation as any).unlock();
        } catch (_) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = async () => {
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

    if (!isCurrentlyFullscreen) {
      const elem = containerRef.current || document.documentElement;
      const requestFS =
        elem.requestFullscreen ||
        (elem as any).webkitRequestFullscreen ||
        (elem as any).mozRequestFullScreen ||
        (elem as any).msRequestFullscreen;

      if (requestFS) {
        try {
          await requestFS.call(elem, { navigationUI: "hide" });
        } catch {
          try {
            await requestFS.call(elem);
          } catch (_) {
            console.warn("Silenced error:", _);
          }
        }
      }
      setIsFullscreen(true);
      if (Capacitor.isNativePlatform()) {
        ScreenOrientation.lock({ orientation: "landscape" }).catch(() => {});
      } else if (screen.orientation && typeof (screen.orientation as any).lock === "function") {
        try {
          (screen.orientation as any).lock("landscape").catch(() => {});
        } catch (_) {
          console.warn("Silenced error:", _);
        }
      }
    } else {
      if (Capacitor.isNativePlatform()) {
        ScreenOrientation.unlock().catch(() => {});
      } else if (screen.orientation && typeof (screen.orientation as any).unlock === "function") {
        try {
          (screen.orientation as any).unlock();
        } catch (_) {
          console.warn("Silenced error:", _);
        }
      }
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      } catch (_) {
        console.warn("Silenced error:", _);
      }
      setIsFullscreen(false);
    }
  };

  const reloadStream = () => {
    failedServersRef.current.clear();
    if (channel.servers.length > 1) {
      setSelectedServerIndex(prev => (prev + 1) % channel.servers.length);
    } else {
      setReloadNonce(prev => prev + 1);
    }
    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');
    setStreamHealth('connecting');
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
      ref={(node) => {
        containerRef.current = node;
        miniContainerRef.current = node;
      }}
      data-live-player="true"
      onMouseMove={handleMouseMove}
      style={
        isMiniPlayer && miniPosition
          ? { left: `${miniPosition.x}px`, top: `${miniPosition.y}px`, right: 'auto', bottom: 'auto' }
          : undefined
      }
      className={
        isNativePiP
          ? 'fixed inset-0 z-[999999] bg-black w-full h-full p-0 m-0 overflow-hidden select-none'
          : isMiniPlayer
            ? `fixed z-[100] select-none w-[220px] xs:w-[260px] sm:w-[320px] rounded-2xl border border-neutral-700 shadow-2xl shadow-black/90 bg-black overflow-hidden flex flex-col ${
                !miniPosition ? 'bottom-4 right-4' : ''
              } ${isDragging ? 'transition-none' : 'transition-[left,top] duration-150'} animate-in slide-in-from-bottom-5`
            : 'live-player-modal fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center select-none overflow-hidden'
      }
    >
      {/* Overlay global durante o arraste, evita que o clique caia sobre o vídeo */}
      {isDragging && (
        <div
          className="fixed inset-0 z-[9999] cursor-grabbing select-none bg-transparent"
          onPointerMove={handleMiniHeaderPointerMove}
          onPointerUp={handleMiniHeaderPointerUp}
          onPointerCancel={handleMiniHeaderPointerUp}
        />
      )}

      {/* Cabeçalho do Mini Player Flutuante (arrastável) */}
      {isMiniPlayer && !isNativePiP && (
        <div
          onPointerDown={handleMiniHeaderPointerDown}
          onPointerMove={handleMiniHeaderPointerMove}
          onPointerUp={handleMiniHeaderPointerUp}
          onPointerCancel={handleMiniHeaderPointerUp}
          className={`flex items-center justify-between px-2.5 py-2 bg-[#161616] border-b border-neutral-800 text-xs select-none gap-2 touch-none shrink-0 ${
            isDragging ? 'cursor-grabbing bg-[#1c1c1c]' : 'cursor-grab hover:bg-[#1a1a1a]'
          } transition-colors`}
        >
          <div className="flex items-center gap-2 min-w-0 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
            <span className="text-white font-medium truncate text-xs">{channel.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleToggleMiniPlayer}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Restaurar Player"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleClose}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Elemento de Vídeo — permanece montado o tempo todo (nunca desmonta ao entrar/sair do mini player) */}
      <div className={(isMiniPlayer && !isNativePiP) ? 'relative w-full aspect-video bg-black shrink-0' : 'contents'}>
        <div
          style={{ position: 'relative', width: '100%', height: '100%' }}
          className="flex items-center justify-center bg-black overflow-hidden select-none"
          onMouseMove={resetControlsTimeout}
          onTouchStart={resetControlsTimeout}
        >
        {currentServer?.isEmbed ? (
          <iframe
            src={currentServer.url}
            className="w-full h-full object-contain"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            style={{ border: 0, background: 'black' }}
            referrerPolicy="no-referrer"
          />
        ) : (
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted={isMuted}
          poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          className="w-full h-full object-contain cursor-pointer"
          onClick={() => {
            if (isMiniPlayer) return;
            if (isMuted) {
              toggleMute();
            } else {
              setShowControls(prev => !prev);
              resetControlsTimeout();
            }
          }}
          onPlay={() => {
            setIsPlaying(true);
            setIsLoading(false);
            setIsBuffering(false);
            if (videoRef.current && !videoRef.current.muted) {
              videoRef.current.volume = 1.0;
            }
          }}
          onPlaying={() => {
            setIsPlaying(true);
            setIsLoading(false);
            setIsBuffering(false);
          }}
          onCanPlay={() => {
            setIsLoading(false);
            setIsBuffering(false);
          }}
          onLoadedData={() => {
            setIsLoading(false);
            setIsBuffering(false);
          }}
          onPause={() => setIsPlaying(false)}
        />
        )}

        {/* Spinner compacto do mini player, sem textos (não cabem no espaço reduzido) */}
        {isMiniPlayer && (isLoading || isBuffering) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
            <div className="w-6 h-6 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin"></div>
          </div>
        )}
        </div>
      </div>

      {/* Botão flutuante para ativar áudio se o navegador iniciar em mudo */}
      {!isMiniPlayer && !isNativePiP && isMuted && !isLoading && !hasError && (
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

      {/* Spinner de Carregamento Inicial (Sintonizando canal) - Apenas antes do início do vídeo */}
      {!isMiniPlayer && !isNativePiP && isLoading && !isPlaying && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs pointer-events-none z-20">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin"></div>
            <Tv className="w-6 h-6 text-orange-500 absolute inset-0 m-auto animate-pulse" />
          </div>
          <p className="mt-4 text-white font-medium tracking-wide text-sm flex items-center gap-2">
            <Radio className="w-4 h-4 text-orange-500 animate-pulse" />
            Sintonizando {channel.name}...
          </p>
          <span className="text-xs text-neutral-400 mt-1">
            Qualidade adaptativa automática
          </span>
        </div>
      )}

      {/* Indicador Discreto de Buffering / Ajuste (Não bloqueia a tela nem tampa o vídeo) */}
      {!isMiniPlayer && !isNativePiP && !isLoading && isBuffering && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/80 border border-orange-500/40 backdrop-blur-md text-white text-xs font-medium shadow-xl pointer-events-none animate-in fade-in duration-300">
          <div className="w-3.5 h-3.5 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin shrink-0"></div>
          <span className="text-orange-300">Ajustando transmissão...</span>
        </div>
      )}

      {/* Banner de Erro com Troca de Servidor Rápida */}
      {!isMiniPlayer && !isNativePiP && hasError && (
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
      {!isMiniPlayer && !isNativePiP && (
      <div 
        className={`absolute top-0 left-0 w-full p-3 sm:p-4 md:p-6 flex justify-between items-center bg-gradient-to-b from-black/90 via-black/40 to-transparent transition-opacity duration-300 z-30 pointer-events-auto ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={handleClose}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md cursor-pointer border border-white/10 shrink-0"
            title="Voltar aos canais"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <ChannelLogo
            channel={channel}
            size="sm"
            className="h-7 sm:h-8 min-w-[40px] max-w-[70px] sm:max-w-[90px] bg-black/40 px-1.5 py-1 rounded border border-white/10 shrink-0"
          />

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-white font-bold text-sm sm:text-base md:text-lg drop-shadow truncate max-w-[110px] xs:max-w-[160px] sm:max-w-xs md:max-w-md">{channel.name}</h2>
            </div>
            {channel.currentProgram && (
              <p className="text-[11px] sm:text-xs text-neutral-300 truncate max-w-[110px] xs:max-w-[160px] sm:max-w-xs md:max-w-md drop-shadow">
                {channel.currentProgram}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Status do stream (Flutuante Centralizado em telas médias+) */}
          <div className="hidden sm:flex absolute top-16 md:top-6 left-1/2 -translate-x-1/2 items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-xs text-neutral-300 pointer-events-none">
            <span className={`w-2 h-2 rounded-full ${
              hasError || streamHealth === 'error' ? 'bg-red-500' :
              (isLoading && !isPlaying) ? 'bg-yellow-500 animate-pulse' :
              isBuffering ? 'bg-yellow-500 animate-pulse' :
              'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]'
            }`}></span>
            <span>
              {hasError || streamHealth === 'error' ? 'Sem Sinal' :
               (isLoading && !isPlaying) ? 'Sintonizando...' :
               isBuffering ? 'Ajustando Buffer...' :
               'Sinal Estável'}
            </span>
          </div>

          {/* Botão Guia de Canais Rápido */}
          <button
            onClick={() => setShowChannelList(!showChannelList)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md border transition-all cursor-pointer shrink-0 ${
              showChannelList ? 'bg-orange-600 text-white border-orange-500' : 'bg-black/60 hover:bg-black/80 text-neutral-200 border-white/10'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">Guia de Canais</span>
          </button>

          {/* Botão Fechar */}
          <button
            onClick={handleClose}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md cursor-pointer border border-white/10 shrink-0"
            title="Fechar"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
      )}

      {/* GAVETA LATERAL DE CANAIS RÁPIDA (QUICK CHANNEL SWITCHER) */}
      {!isMiniPlayer && !isNativePiP && showChannelList && (
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
      {!isMiniPlayer && !isNativePiP && (
      <div 
        className={`absolute bottom-0 left-0 w-full px-4 pt-4 md:px-6 md:pt-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 z-30 pointer-events-auto ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom, 1.75rem))' }}
      >
        <div className="flex items-center justify-between gap-1 sm:gap-4 max-w-5xl mx-auto w-full">
          {/* Lado Esquerdo: Play, Vol, Próximo/Anterior */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-3 shrink min-w-0">
            <button
              onClick={handlePrevChannel}
              className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer shrink-0"
              title="Canal Anterior (Seta Esquerda)"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <button
              onClick={togglePlay}
              className="p-2 sm:p-3 rounded-full bg-orange-600 hover:bg-orange-500 text-white transition-all shadow-lg shadow-orange-600/40 hover:scale-105 cursor-pointer shrink-0"
              title={isPlaying ? 'Pausar' : 'Reproduzir'}
            >
              {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-white" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white ml-0.5" />}
            </button>

            <button
              onClick={handleNextChannel}
              className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer shrink-0"
              title="Próximo Canal (Seta Direita)"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Controle de Volume Aprimorado */}
            <div className="flex items-center gap-1 sm:gap-2 ml-0.5 sm:ml-2 bg-white/5 hover:bg-white/10 px-1.5 sm:px-2.5 py-1.5 rounded-xl border border-white/5 transition-all shrink-0">
              <button
                onClick={toggleMute}
                className="p-1 rounded-lg hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer shrink-0"
                title={isMuted || volume === 0 ? 'Desmutar (M)' : 'Mutar (M)'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-200" />
                ) : (
                  <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                )}
              </button>

              <div className="hidden sm:flex items-center gap-2">
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
                  className="w-16 sm:w-20 md:w-32 accent-orange-500 cursor-pointer h-2 rounded-lg appearance-none transition-all"
                  title={`Volume: ${isMuted ? 0 : Math.round(volume * 100)}% (Use ↑ e ↓ para ajustar)`}
                />

                <span className="text-xs font-bold text-neutral-300 min-w-[34px] text-right tabular-nums select-none">
                  {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
                </span>
              </div>
            </div>

            {/* Recarregar Stream */}
            <button
              onClick={reloadStream}
              className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer shrink-0"
              title="Sincronizar / Recarregar Transmissão Ao Vivo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Seletor Manual de Servidores */}
            {channel.servers && channel.servers.length > 1 && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowServerMenu(prev => !prev)}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border shrink-0 ${
                    showServerMenu ? 'bg-orange-600 text-white border-orange-500' : 'bg-white/5 hover:bg-white/10 text-neutral-300 border-white/5'
                  }`}
                  title="Escolher Servidor de Transmissão"
                >
                  <Radio className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span className="hidden md:inline">Servidor: </span>
                  <span className="text-orange-400 max-w-[70px] sm:max-w-[110px] truncate">{currentServer?.name || `S${selectedServerIndex + 1}`}</span>
                </button>
                {showServerMenu && (
                  <div className="absolute bottom-11 left-0 z-50 w-56 bg-black/95 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-2xl flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 py-1 border-b border-white/10">
                      Opções de Servidor
                    </div>
                    {channel.servers.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSelectedServerIndex(idx);
                          setShowServerMenu(false);
                        }}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-left transition-all cursor-pointer ${
                          selectedServerIndex === idx
                            ? 'bg-orange-600 text-white'
                            : 'hover:bg-white/10 text-neutral-300 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{s.name || `Servidor ${idx + 1}`}</span>
                        {selectedServerIndex === idx && <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 ml-1.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lado Direito: PiP, Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Mini Player Flutuante (arrastável, continua tocando em qualquer página do app) */}
            <button
              onClick={handleToggleMiniPlayer}
              className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer shrink-0"
              title="Mini Player Flutuante"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>

            {/* Tela Cheia */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-all cursor-pointer shrink-0"
              title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia (F)'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
