import React, { useState, useEffect } from "react";
import { ArrowDownToLine, X, ExternalLink, CheckCircle2, Zap } from "lucide-react";
import { getActiveDownload, dismissActiveDownload, ActiveDownload } from "../services/downloadService";
import { BidirectionalProgressBar } from "./BidirectionalProgressBar";

interface FloatingDownloadWidgetProps {
  onNavigateToDownloads?: () => void;
}

export function FloatingDownloadWidget({ onNavigateToDownloads }: FloatingDownloadWidgetProps) {
  const [activeDownload, setActiveDownload] = useState<ActiveDownload | null>(() => getActiveDownload());

  useEffect(() => {
    const handleUpdate = (e: any) => {
      setActiveDownload(e.detail || null);
    };

    window.addEventListener("playinfinity:active_download_update", handleUpdate);
    return () => {
      window.removeEventListener("playinfinity:active_download_update", handleUpdate);
    };
  }, []);

  if (!activeDownload) return null;

  const isCompleted = activeDownload.progress >= 100;

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-3 sm:right-6 z-50 max-w-sm sm:max-w-md w-[calc(100%-1.5rem)] animate-in fade-in slide-in-from-bottom-6 duration-300 pointer-events-auto">
      <div className="bg-[#121212]/95 backdrop-blur-2xl border-2 border-orange-500/50 rounded-3xl p-4 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(249,115,22,0.25)] relative overflow-hidden">
        {/* Glow de fundo */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none"></div>

        {/* Topo do card com thumbnail e título */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Poster */}
            <div className="w-11 h-15 rounded-xl overflow-hidden bg-neutral-900 border border-white/10 shrink-0 relative shadow-md">
              {activeDownload.posterUrl || activeDownload.backdropUrl ? (
                <img
                  src={activeDownload.posterUrl || activeDownload.backdropUrl}
                  alt={activeDownload.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-orange-400">
                  <ArrowDownToLine className="w-5 h-5" />
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[9px] font-black uppercase">
                  {activeDownload.type === "movie" 
                    ? "Filme" 
                    : `S${String(activeDownload.season || 1).padStart(2, "0")}E${String(activeDownload.episode || 1).padStart(2, "0")}`}
                </span>
                <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  {activeDownload.speed}
                </span>
              </div>

              <h4 className="font-bold text-sm text-white truncate max-w-[200px] sm:max-w-[240px]">
                {activeDownload.title}
              </h4>
              <p className="text-[10px] text-neutral-400 font-mono truncate max-w-[200px] sm:max-w-[240px]">
                {activeDownload.fileName}
              </p>
            </div>
          </div>

          {/* Botão fechar */}
          <button
            onClick={() => dismissActiveDownload()}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BARRA DE PROGRESSO BIDIRECIONAL COM 4 SEGMENTOS EXPANDINDO PARA AMBOS OS LADOS */}
        <div className="my-2">
          <BidirectionalProgressBar
            progress={activeDownload.progress}
            segments={4}
            height="h-5"
            colorScheme="orange"
            showPercentage={true}
            statusText={isCompleted ? "Download Pronto no Navegador" : "Iniciando transferência direta..."}
          />
        </div>

        {/* Ação rápida para ver os downloads */}
        {onNavigateToDownloads && (
          <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between">
            <button
              onClick={() => {
                onNavigateToDownloads();
                dismissActiveDownload();
              }}
              className="text-xs text-orange-400 hover:text-orange-300 font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Abrir Meus Downloads</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-neutral-500 font-medium">
              MixDrop Direct
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default FloatingDownloadWidget;
