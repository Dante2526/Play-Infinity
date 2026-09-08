import { useState, useEffect, useMemo } from "react";
import { 
  X, Play, Loader2, AlertCircle, RefreshCw, ExternalLink, 
  Check, Sparkles, Radio, ShieldCheck,
  Tv, Film, ChevronLeft, ChevronRight, Layers, Maximize2
} from "lucide-react";

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
}: VideoPlayerModalProps) {
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

  // Servidores otimizados: servidores livres de anúncios agressivos e compatíveis sem erro de sandbox
  const servers = useMemo(() => {
    if (isSeries) {
      return [
        {
          key: "srv1",
          label: "Servidor 1 (WatchPlayer VIP)",
          badge: "Dublado BR • Zero Anúncios",
          buildUrl: (id: string, s: number, e: number) => 
            `https://v1.watchplay.shop/tvshow/${id}/${s}/${e}`,
        },
        {
          key: "srv2",
          label: "Servidor 2 (MyEmbed BR)",
          badge: "Dublado • Multi-Players",
          buildUrl: (id: string, s: number, e: number) => 
            `https://myembed.biz/serie/${id}/${s}/${e}`,
        },
        {
          key: "srv3",
          label: "Servidor 3 (VidLink PRO)",
          badge: "Sem Popups • 4K/HD",
          buildUrl: (id: string, s: number, e: number) => 
            `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=ea580c&secondaryColor=f97316&iconColor=ffffff&title=true&poster=true`,
        },
        {
          key: "srv4",
          label: "Servidor 4 (SuperFlix BR)",
          badge: "Dublado BR • Rápido",
          buildUrl: (id: string, s: number, e: number) => 
            `https://superflixapi.top/serie/${id}/${s}/${e}`,
        },
        {
          key: "srv5",
          label: "Servidor 5 (Embed.su)",
          badge: "Full HD • Multi-áudio",
          buildUrl: (id: string, s: number, e: number) => 
            `https://embed.su/embed/tv/${id}/${s}/${e}`,
        },
        {
          key: "srv6",
          label: "Servidor 6 (VidSrc VIP)",
          badge: "Ultra Rápido",
          buildUrl: (id: string, s: number, e: number) => 
            `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
        }
      ];
    } else {
      return [
        {
          key: "srv1",
          label: "Servidor 1 (WatchPlayer VIP)",
          badge: "Dublado • Zero Anúncios",
          buildUrl: (id: string) => `https://v1.watchplay.shop/movie/${imdbId || id}`,
        },
        {
          key: "srv2",
          label: "Servidor 2 (MyEmbed BR)",
          badge: "Dublado • Multi-Players",
          buildUrl: (id: string) => `https://myembed.biz/filme/${imdbId || id}`,
        },
        {
          key: "srv3",
          label: "Servidor 3 (VidLink PRO)",
          badge: "Sem Popups • Ultra HD",
          buildUrl: (id: string) => `https://vidlink.pro/movie/${id}?primaryColor=ea580c&secondaryColor=f97316&iconColor=ffffff&title=true&poster=true`,
        },
        {
          key: "srv4",
          label: "Servidor 4 (SuperFlix BR)",
          badge: "Dublado BR",
          buildUrl: (id: string) => `https://superflixapi.top/filme/${id}`,
        },
        {
          key: "srv5",
          label: "Servidor 5 (Embed.su)",
          badge: "Full HD",
          buildUrl: (id: string) => `https://embed.su/embed/movie/${id}`,
        }
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

  // Converte URLs do WatchPlayer para o endpoint com autoplay instantâneo
  const resolveStreamIframeUrl = (url: string) => {
    if (url.includes("watchplay.shop")) {
      return `/api/watchplayer-stream?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  // Handler to switch episode
  const handleEpisodeChange = (newEpisode: number) => {
    if (newEpisode < 1) return;
    setEpisode(newEpisode);
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

    if (cleanUrl.includes("watchplay.shop")) {
      setActiveIframeUrl(resolveStreamIframeUrl(cleanUrl));
      setExtractedSource(cleanUrl);
      setIsLoading(false);
      return;
    }

    if (
      cleanUrl.includes("vidlink.pro") || 
      cleanUrl.includes("videasy") || 
      cleanUrl.includes("vidsrc") || 
      cleanUrl.includes("superflixapi") || 
      cleanUrl.includes("embed.su") || 
      cleanUrl.endsWith(".mp4")
    ) {
      setActiveIframeUrl(cleanUrl);
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

  const handleFullScreen = () => {
    const stage = document.getElementById("player-stage-container");
    if (stage) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        stage.requestFullscreen?.().catch(() => {});
      }
    }
  };

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
              <div className="flex items-center gap-2">
                <h2 className="text-white font-bold text-base md:text-lg leading-tight truncate max-w-[200px] sm:max-w-md">
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
              onClick={handleFullScreen}
              className="p-2 text-neutral-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              title="Tela Cheia"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Server Switcher Bar */}
        <div className="px-4 sm:px-5 py-2.5 bg-[#0e0e0e] border-b border-neutral-800/80 flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-neutral-400 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-orange-500" /> Servidores:
            </span>
            {servers.map((srv) => {
              const isActive = selectedServerKey === srv.key;
              return (
                <button
                  key={srv.key}
                  onClick={() => handleServerSwitch(srv.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? "bg-orange-600 text-white shadow-md shadow-orange-600/30"
                      : "bg-[#181818] text-neutral-300 hover:text-white hover:bg-[#252525] border border-white/10"
                  }`}
                >
                  {isActive && <Play className="w-3 h-3 fill-current" />}
                  <span>{srv.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-black/30 text-white' : 'bg-white/5 text-neutral-400'}`}>
                    {srv.badge.split("•")[0].trim()}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs shrink-0">
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
              <span>Escudo Anti-Anúncios: {antiAdShield ? "Ativo" : "Desativado"}</span>
              {antiAdShield && (
                <span className="hidden sm:inline text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 ml-0.5">
                  Popups Bloqueados
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Banner de Proteção / Dica quando servidor alternativo está selecionado */}
        {selectedServerKey !== "srv1" && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-2 text-xs text-amber-300">
            <div className="flex items-center gap-2 truncate">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span className="truncate">Servidor secundário ativo. Se abrir abas ou anúncios indesejados, volte ao Servidor 1.</span>
            </div>
            <button
              onClick={() => handleServerSwitch("srv1")}
              className="shrink-0 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 rounded font-semibold text-[11px] cursor-pointer transition-colors"
            >
              Mudar para Servidor 1 (Sem Anúncios)
            </button>
          </div>
        )}

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

        {/* Player Video Stage: 100% Livre de restrições de Sandbox (sem erros) */}
        <div id="player-stage-container" className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-neutral-400">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
              <p className="text-sm font-medium">Iniciando stream e conectando reprodutor...</p>
            </div>
          ) : activeIframeUrl ? (
            <iframe
              key={activeIframeUrl}
              src={activeIframeUrl}
              title={title}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="no-referrer"
              sandbox={antiAdShield && !activeIframeUrl.includes("vidlink.pro") ? "allow-scripts allow-same-origin allow-forms allow-presentation" : undefined}
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
