import React, { useState, useEffect, useMemo } from "react";
import {
  Download,
  Film,
  Tv,
  Trash2,
  Search,
  Clock,
  ArrowDownToLine,
  Play,
  Loader2,
  HardDrive,
  Zap,
  Sparkles,
  CheckCircle2
} from "lucide-react";
import { 
  getDownloadHistory, 
  removeDownloadFromHistory, 
  clearDownloadHistory, 
  DownloadHistoryItem,
  triggerDirectDownload,
  getActiveDownload,
  ActiveDownload
} from "../services/downloadService";
import { CatalogItem } from "../utils/mediaUtils";
import { OnPlayHandler } from "../types";
import { BidirectionalProgressBar } from "../components/BidirectionalProgressBar";

export function DownloadsPage({
  onItemClick,
  onPlay,
  onNavigate
}: {
  onItemClick?: (id: number, item?: CatalogItem) => void;
  onPlay?: OnPlayHandler;
  onNavigate?: (type: string) => void;
}) {
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "series">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistoryItem[]>(() => getDownloadHistory());
  const [activeDownload, setActiveDownload] = useState<ActiveDownload | null>(() => getActiveDownload());

  // Escuta atualizações do histórico de downloads
  useEffect(() => {
    const updateHistory = (e: any) => {
      setDownloadHistory(e.detail || getDownloadHistory());
    };
    window.addEventListener("playinfinity:downloads_updated", updateHistory);
    return () => {
      window.removeEventListener("playinfinity:downloads_updated", updateHistory);
    };
  }, []);

  // Escuta progresso do download ativo em tempo real
  useEffect(() => {
    const handleActiveUpdate = (e: any) => {
      setActiveDownload(e.detail || null);
    };
    window.addEventListener("playinfinity:active_download_update", handleActiveUpdate);
    return () => {
      window.removeEventListener("playinfinity:active_download_update", handleActiveUpdate);
    };
  }, []);

  // Itens do histórico filtrados por tipo e busca
  const filteredHistory = useMemo(() => {
    return downloadHistory.filter(item => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.title.toLowerCase().includes(q) || item.fileName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [downloadHistory, typeFilter, searchQuery]);

  // Contagens para os badges
  const movieCount = useMemo(() => downloadHistory.filter(i => i.type === "movie").length, [downloadHistory]);
  const seriesCount = useMemo(() => downloadHistory.filter(i => i.type === "series").length, [downloadHistory]);

  const handleRedownload = (historyItem: DownloadHistoryItem) => {
    triggerDirectDownload(historyItem.directDownloadUrl, historyItem.fileName, {
      tmdbId: historyItem.tmdbId,
      title: historyItem.title,
      type: historyItem.type,
      season: historyItem.season,
      episode: historyItem.episode,
      posterUrl: historyItem.posterUrl,
      backdropUrl: historyItem.backdropUrl,
      quality: historyItem.quality
    });
  };

  const handleItemClick = (item: DownloadHistoryItem) => {
    if (onItemClick) {
      onItemClick(item.tmdbId, {
        id: item.tmdbId,
        tmdbId: item.tmdbId,
        title: item.title,
        type: item.type,
        posterUrl: item.posterUrl,
        imageUrl: item.posterUrl,
        backdropUrl: item.backdropUrl,
        quality: item.quality || "HD"
      } as CatalogItem);
    }
  };

  const formatDate = (timestamp: number) => {
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen pt-28 md:pt-32 px-4 md:px-12 bg-[#0a0a0a] pb-28 sm:pb-32 text-white">
      <div className="max-w-6xl mx-auto w-full">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="p-2.5 rounded-2xl bg-orange-500/15 border border-orange-500/30 text-orange-400">
                <ArrowDownToLine className="w-6 h-6" />
              </div>
              <h1 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase">
                Meus Downloads
              </h1>
            </div>
            <p className="text-neutral-400 text-sm md:text-base max-w-2xl">
              Gerencie seus filmes e episódios baixados neste dispositivo com download acelerado em múltiplos núcleos.
            </p>
          </div>

          {/* Informação de Total e Ação Limpar */}
          {downloadHistory.length > 0 && (
            <div className="flex items-center gap-3 self-start md:self-auto">
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-neutral-300">
                <HardDrive className="w-4 h-4 text-orange-400" />
                <span className="font-semibold">{downloadHistory.length}</span>
                <span className="text-neutral-500">{downloadHistory.length === 1 ? "título salvo" : "títulos salvos"}</span>
              </div>
              <button
                onClick={() => {
                  if (confirm("Deseja realmente limpar a sua lista de downloads? (Os arquivos já baixados continuarão salvos no seu aparelho)")) {
                    clearDownloadHistory();
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Limpar todos os registros"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar Tudo</span>
              </button>
            </div>
          )}
        </div>

        {/* BANNER DE DOWNLOAD ATIVO COM A BARRA BIDIRECIONAL MULTISSEGMENTADA */}
        {activeDownload && (
          <div className="mb-8 p-5 sm:p-6 rounded-3xl bg-[#141414] border-2 border-orange-500/60 shadow-[0_10px_35px_rgba(249,115,22,0.2)] animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-16 rounded-xl overflow-hidden bg-neutral-900 border border-white/10 shrink-0">
                  {activeDownload.posterUrl || activeDownload.backdropUrl ? (
                    <img
                      src={activeDownload.posterUrl || activeDownload.backdropUrl}
                      alt={activeDownload.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-orange-400">
                      <ArrowDownToLine className="w-6 h-6" />
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[9px] font-black uppercase">
                      {activeDownload.type === "movie" 
                        ? "Filme" 
                        : `S${String(activeDownload.season || 1).padStart(2, "0")}E${String(activeDownload.episode || 1).padStart(2, "0")}`}
                    </span>
                    <span className="text-xs text-neutral-400 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{activeDownload.speed}</span>
                    </span>
                  </div>
                  <h3 className="font-bold text-base text-white">
                    {activeDownload.title}
                  </h3>
                  <p className="text-xs text-neutral-400 font-mono">
                    {activeDownload.fileName}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-xs font-semibold text-neutral-400 block">
                  {activeDownload.progress >= 100 ? "Finalizado" : "Transferindo via MixDrop"}
                </span>
                <span className="font-mono font-black text-xl text-emerald-400">
                  {Math.round(activeDownload.progress)}%
                </span>
              </div>
            </div>

            {/* A BARRA BIDIRECIONAL COM 4 PONTOS SE EXPANDE SIMULTANEAMENTE PARA OS DOIS LADOS */}
            <BidirectionalProgressBar
              progress={activeDownload.progress}
              segments={4}
              height="h-7"
              colorScheme="orange"
              showPercentage={false}
              statusText="Multi-Thread: 4 núcleos expandindo para ambos os lados"
            />
          </div>
        )}

        {/* Barra de Filtros e Busca */}
        <div className="bg-[#121212] border border-white/5 rounded-2xl p-3 md:p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
          {/* Filtro por tipo */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setTypeFilter("all")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                typeFilter === "all"
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                  : "bg-white/5 text-neutral-400 hover:text-white border border-transparent"
              }`}
            >
              Todos ({downloadHistory.length})
            </button>
            <button
              onClick={() => setTypeFilter("movie")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                typeFilter === "movie"
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                  : "bg-white/5 text-neutral-400 hover:text-white border border-transparent"
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Filmes ({movieCount})</span>
            </button>
            <button
              onClick={() => setTypeFilter("series")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                typeFilter === "series"
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                  : "bg-white/5 text-neutral-400 hover:text-white border border-transparent"
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Séries ({seriesCount})</span>
            </button>
          </div>

          {/* Campo de Busca */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar em meus downloads..."
              className="w-full pl-9 pr-3 py-2 bg-black/50 border border-white/10 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500/60 transition-colors"
            />
          </div>
        </div>

        {/* LISTAGEM DE DOWNLOADS */}
        {filteredHistory.length === 0 ? (
          <div className="bg-[#111111] border border-white/5 rounded-3xl p-10 sm:p-14 text-center max-w-lg mx-auto shadow-xl">
            <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center mx-auto mb-4">
              <ArrowDownToLine className="w-8 h-8" />
            </div>
            
            {searchQuery.trim() || typeFilter !== "all" ? (
              <>
                <h3 className="text-white text-lg font-bold mb-2">Nenhum download encontrado</h3>
                <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed mb-6">
                  Nenhum item corresponde ao filtro ou busca aplicada.
                </p>
                <button
                  onClick={() => { setSearchQuery(""); setTypeFilter("all"); }}
                  className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Limpar Filtros
                </button>
              </>
            ) : (
              <>
                <h3 className="text-white text-lg font-bold mb-2">Você ainda não realizou nenhum download</h3>
                <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed mb-6">
                  Para baixar filmes e episódios, abra qualquer título do catálogo e clique no botão de <strong className="text-orange-400">Download</strong>. Seus downloads concluídos ficarão salvos aqui.
                </p>
                <button
                  onClick={() => onNavigate?.("movies")}
                  className="px-6 py-2.5 rounded-full bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-orange-600/30 cursor-pointer"
                >
                  Explorar Catálogo
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredHistory.map((item) => {
              const isCurrentlyDownloading = activeDownload?.id === item.id;

              return (
                <div
                  key={item.id}
                  className={`bg-[#111111] border ${
                    isCurrentlyDownloading 
                      ? "border-orange-500/80 shadow-[0_0_20px_rgba(249,115,22,0.25)]" 
                      : "border-white/5 hover:border-orange-500/40"
                  } rounded-2xl p-4 sm:p-5 flex flex-col gap-3 transition-all shadow-md group`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div 
                      className="flex items-center gap-3.5 cursor-pointer flex-1 min-w-0"
                      onClick={() => handleItemClick(item)}
                    >
                      {/* Thumbnail / Poster */}
                      <div className="w-14 h-20 rounded-xl overflow-hidden bg-neutral-900 border border-white/10 shrink-0 relative">
                        {item.posterUrl || item.backdropUrl ? (
                          <img
                            src={item.posterUrl || item.backdropUrl}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-600">
                            <Film className="w-6 h-6" />
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[8px] font-black text-orange-400 uppercase">
                          HD
                        </span>
                      </div>

                      {/* Detalhes do item */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[9px] font-black uppercase">
                            {item.type === "movie" ? "Filme" : `S${String(item.season || 1).padStart(2, "0")}E${String(item.episode || 1).padStart(2, "0")}`}
                          </span>
                          <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(item.timestamp)}
                          </span>
                        </div>
                        <h4 className="font-bold text-sm sm:text-base text-white group-hover:text-orange-300 transition-colors truncate">
                          {item.title}
                        </h4>
                        <p className="text-[11px] text-neutral-400 font-mono mt-0.5 truncate">
                          {item.fileName}
                        </p>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      {/* Ver detalhes / Abrir */}
                      <button
                        onClick={() => handleItemClick(item)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                        title="Ver página do título"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Detalhes</span>
                      </button>

                      {/* Baixar Novamente */}
                      <button
                        onClick={() => handleRedownload(item)}
                        disabled={isCurrentlyDownloading}
                        className="px-4 py-2 rounded-xl bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 hover:text-orange-300 border border-orange-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                        title="Baixar novamente este arquivo"
                      >
                        {isCurrentlyDownloading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>{isCurrentlyDownloading ? "Baixando..." : "Baixar Novamente"}</span>
                      </button>

                      {/* Remover do Histórico */}
                      <button
                        onClick={() => removeDownloadFromHistory(item.id)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 border border-white/5 hover:border-red-500/30 transition-all cursor-pointer"
                        title="Remover da lista"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* BARRA BIDIRECIONAL DENTRO DO CARD DO ITEM SE ELE ESTIVER BAIXANDO */}
                  {isCurrentlyDownloading && activeDownload && (
                    <div className="pt-2 border-t border-white/5">
                      <BidirectionalProgressBar
                        progress={activeDownload.progress}
                        segments={4}
                        height="h-5"
                        colorScheme="orange"
                        showPercentage={true}
                        statusText="Baixando pelos 4 pontos em expansão..."
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default DownloadsPage;
