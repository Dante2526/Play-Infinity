import { useState, useEffect, useMemo } from "react";
import { 
  X, Play, Loader2, AlertCircle, RefreshCw, ExternalLink, 
  Link2, Check, Sparkles, Radio, ShieldCheck, ShieldAlert, 
  Tv, Film, ChevronLeft, ChevronRight, Layers
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

// Helper to extract src from full iframe HTML code or plain URL
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

// Extract media info from URL if not explicitly provided
function parseMediaFromUrl(url: string) {
  const isSeries = url.includes("/tv/") || url.includes("/serie") || url.includes("/series");
  
  // Try to match tmdbId or imdbId and season/episode from patterns:
  // e.g., vidlink.pro/tv/66732/1/1
  const tvPattern = /\/(?:tv|serie|series)\/([a-zA-Z0-9_-]+)(?:\/(\d+)\/(\d+))?/i;
  const tvMatch = url.match(tvPattern);
  
  // e.g., v1.watchplay.shop/movie/tt22084616 or /movie/533535
  const moviePattern = /\/movie\/([a-zA-Z0-9_-]+)/i;
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
    defaultUrl || "https://vidlink.pro/tv/66732/1/1"
  );
  const [activeIframeUrl, setActiveIframeUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedSource, setExtractedSource] = useState<string | null>(null);
  const [antiPopups, setAntiPopups] = useState(true);
  const [copied, setCopied] = useState(false);

  // Series Season & Episode State
  const [season, setSeason] = useState<number>(initialSeason);
  const [episode, setEpisode] = useState<number>(initialEpisode);
  const [selectedServerKey, setSelectedServerKey] = useState<string>("srv1");

  // Determine if content is a series
  const isSeries = useMemo(() => {
    if (mediaType === 'series') return true;
    if (mediaType === 'movie') return false;
    const parsed = parseMediaFromUrl(urlInput);
    if (parsed.isSeries) return true;
    if (title.toLowerCase().includes("série") || title.toLowerCase().includes("episódio") || title.toLowerCase().includes("temporada") || title.includes("T1:") || title.includes("T2:") || title.includes("T3:") || title.includes("T4:")) return true;
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

  // Define Servers dynamically based on Media Type (Movie or Series)
  const servers = useMemo(() => {
    if (isSeries) {
      return [
        {
          key: "srv1",
          label: "Servidor 1 (VidLink HD)",
          badge: "Rápido • Sem Anúncios",
          buildUrl: (id: string, s: number, e: number) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
        },
        {
          key: "srv2",
          label: "Servidor 2 (Videasy Multi)",
          badge: "Áudio & Legendas",
          buildUrl: (id: string, s: number, e: number) => `https://player.videasy.to/tv/${id}/${s}/${e}`,
        },
        {
          key: "srv3",
          label: "Servidor 3 (VidSrc HD)",
          badge: "Todas Temporadas",
          buildUrl: (id: string, s: number, e: number) => `https://vidsrc.to/embed/tv/${imdbId || id}/${s}/${e}`,
        },
        {
          key: "srv4",
          label: "Servidor 4 (2Embed)",
          badge: "Backup Estável",
          buildUrl: (id: string, s: number, e: number) => `https://www.2embed.cc/embedtv/${imdbId || id}&s=${s}&e=${e}`,
        }
      ];
    } else {
      return [
        {
          key: "srv1",
          label: "Servidor 1 (WatchPlayer VIP)",
          badge: "Dublado • Sem Anúncios",
          buildUrl: (id: string) => `https://v1.watchplay.shop/movie/${imdbId || id}`,
        },
        {
          key: "srv2",
          label: "Servidor 2 (VidLink 4K/HD)",
          badge: "Alta Definição",
          buildUrl: (id: string) => `https://vidlink.pro/movie/${id}`,
        },
        {
          key: "srv3",
          label: "Servidor 3 (Videasy)",
          badge: "Multi-idiomas",
          buildUrl: (id: string) => `https://player.videasy.to/movie/${id}`,
        },
        {
          key: "srv4",
          label: "Servidor 4 (VidSrc)",
          badge: "Backup VIP",
          buildUrl: (id: string) => `https://vidsrc.to/embed/movie/${imdbId || id}`,
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

      // If initial URL is a movie URL on a series, auto-correct to a series player
      let initial = defaultUrl || (isSeries ? `https://vidlink.pro/tv/${resolvedId}/${targetSeason}/${targetEpisode}` : `https://v1.watchplay.shop/movie/${resolvedId}`);
      if (isSeries && initial.includes("/movie/")) {
        initial = `https://vidlink.pro/tv/${resolvedId}/${targetSeason}/${targetEpisode}`;
      }

      setUrlInput(initial);
      handleExtract(initial);
    } else {
      setActiveIframeUrl(null);
      setError(null);
    }
  }, [isOpen, defaultUrl, isSeries, resolvedId]);

  // Handler to switch episode
  const handleEpisodeChange = (newEpisode: number) => {
    if (newEpisode < 1) return;
    setEpisode(newEpisode);
    const activeServer = servers.find(s => s.key === selectedServerKey) || servers[0];
    const newUrl = activeServer.buildUrl(resolvedId, season, newEpisode);
    setUrlInput(newUrl);
    setActiveIframeUrl(newUrl);
    setExtractedSource(newUrl);
  };

  // Handler to switch season
  const handleSeasonChange = (newSeason: number) => {
    setSeason(newSeason);
    setEpisode(1);
    const activeServer = servers.find(s => s.key === selectedServerKey) || servers[0];
    const newUrl = activeServer.buildUrl(resolvedId, newSeason, 1);
    setUrlInput(newUrl);
    setActiveIframeUrl(newUrl);
    setExtractedSource(newUrl);
  };

  // Handler to switch server
  const handleServerSwitch = (serverKey: string) => {
    setSelectedServerKey(serverKey);
    const srv = servers.find(s => s.key === serverKey);
    if (!srv) return;
    const newUrl = srv.buildUrl(resolvedId, season, episode);
    setUrlInput(newUrl);
    setActiveIframeUrl(newUrl);
    setExtractedSource(newUrl);
  };

  const handleExtract = async (rawInput: string) => {
    const cleanUrl = extractSrcFromInput(rawInput);
    if (!cleanUrl) return;

    setError(null);
    setIsLoading(true);

    // If it's already a clean known direct player embed, load directly without backend overhead
    if (
      cleanUrl.includes("watchplay.shop") || 
      cleanUrl.includes("vidlink.pro") || 
      cleanUrl.includes("videasy") || 
      cleanUrl.includes("vidsrc") || 
      cleanUrl.includes("2embed") || 
      cleanUrl.includes("embedplayer2.xyz") || 
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
        setActiveIframeUrl(data.playerUrl);
        setExtractedSource(data.playerUrl);
      } else {
        // Fallback: render URL directly in iframe
        setActiveIframeUrl(cleanUrl);
        setExtractedSource(cleanUrl);
      }
    } catch (err: any) {
      // Fallback: load directly
      setActiveIframeUrl(cleanUrl);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="relative w-full max-w-5xl bg-[#111111] border border-neutral-800 rounded-2xl md:rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col max-h-[96vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800/80 bg-[#161616]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-600/20 text-orange-500 border border-orange-500/30 flex items-center justify-center">
              {isSeries ? <Tv className="w-4 h-4" /> : <Film className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-white font-bold text-base md:text-lg leading-tight truncate max-w-[240px] sm:max-w-md">
                  {title || "Reprodutor de Vídeo"}
                </h2>
                <span className="px-2 py-0.5 bg-orange-600/20 text-orange-400 border border-orange-500/30 rounded text-[10px] font-bold uppercase tracking-wider hidden sm:inline">
                  {isSeries ? `Série • T${season}:E${episode}` : "Filme"}
                </span>
              </div>
              <span className="text-xs text-neutral-400 font-medium flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                Servidor Ativo: {servers.find(s => s.key === selectedServerKey)?.label || "Principal"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Anti-Popup / AdBlock Sandbox Toggle */}
            <button
              onClick={() => setAntiPopups(!antiPopups)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                antiPopups
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25"
                  : "bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25"
              }`}
              title="O modo Anti-Popups impede anúncios abusivos de abrirem novas janelas no navegador."
            >
              {antiPopups ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Anti-Popups: Ativo</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Anti-Popups: Desativado</span>
                </>
              )}
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
        <div className="px-5 py-2.5 bg-[#0e0e0e] border-b border-neutral-800/80 flex items-center justify-between gap-3 overflow-x-auto">
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
                  <span>{srv.label.split(" ")[2] || srv.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-black/30 text-white' : 'bg-white/5 text-neutral-400'}`}>
                    {srv.badge.split("•")[0].trim()}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs text-neutral-400">
            <Sparkles className="w-3.5 h-3.5 text-orange-400" />
            <span>Qualidade HD • Sem travamentos</span>
          </div>
        </div>

        {/* Series Controls: Season & Episode Quick Selector */}
        {isSeries && (
          <div className="px-5 py-2.5 bg-[#141414] border-b border-neutral-800/80 flex flex-wrap items-center justify-between gap-3">
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

        {/* Player Video Stage */}
        <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-neutral-400">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
              <p className="text-sm font-medium">Iniciando stream da série e conectando reprodutor...</p>
            </div>
          ) : activeIframeUrl ? (
            <iframe
              key={activeIframeUrl}
              src={activeIframeUrl}
              title={title}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              sandbox={
                antiPopups
                  ? "allow-scripts allow-same-origin allow-forms allow-presentation"
                  : undefined
              }
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

        {/* Footer info & Manual URL tool */}
        <div className="px-5 py-2.5 bg-[#0f0f0f] border-t border-neutral-800 text-neutral-400 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
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

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <span className="text-[10px] text-green-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              {antiPopups ? "Protegido por Anti-Popups Sandbox" : "Sandbox Normal"}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
