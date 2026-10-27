import React, { useRef, useState, useEffect, useCallback } from "react";
import { Play, X, ChevronLeft, ChevronRight } from "lucide-react";

interface ContinueWatchingItem {
  id: string | number;
  title: string;
  episode?: string;
  progress?: number;
  imageUrl?: string;
  backdropUrl?: string;
  posterUrl?: string;
  playerUrl?: string;
  currentTime?: number;
  duration?: number;
  mediaType?: "movie" | "series";
  season?: number;
  episodeNumber?: number;
  quality?: string;
  isCam?: boolean;
  serverKey?: string;
  tmdbId?: number;
  imdbId?: string;
  [key: string]: any;
}

interface ContinueWatchingRowProps {
  items: ContinueWatchingItem[];
  onPlay?: (
    title: string,
    playerUrl?: string,
    mediaType?: "movie" | "series",
    tmdbId?: number,
    imdbId?: string,
    season?: number,
    episodeNumber?: number,
    quality?: string,
    isCam?: boolean,
    currentTime?: number,
    autoFullscreen?: boolean,
    imageUrl?: string,
    backdropUrl?: string,
    posterUrl?: string,
    isFromHistoryRow?: boolean,
    serverKey?: string
  ) => void;
  onItemClick?: (id: number | string) => void;
  onRemoveItem: (e: React.MouseEvent | React.TouchEvent, item: ContinueWatchingItem) => void;
  onPosterError: (e: React.SyntheticEvent<HTMLImageElement, Event>, fallbackUrl?: string) => void;
}

export function ContinueWatchingRow({
  items,
  onPlay,
  onItemClick,
  onRemoveItem,
  onPosterError,
}: ContinueWatchingRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [thumbRatio, setThumbRatio] = useState(0.25);
  const [isDragging, setIsDragging] = useState(false);

  const isMouseDownRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);

  // Calcula limites de rolagem e proporção do indicador
  const updateScrollState = useCallback(() => {
    if (!rowRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
    const maxScroll = scrollWidth - clientWidth;

    if (maxScroll <= 2) {
      setHasOverflow(false);
      setCanScrollLeft(false);
      setCanScrollRight(false);
      setScrollProgress(0);
      return;
    }

    setHasOverflow(true);
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft < maxScroll - 6);

    const progress = Math.min(1, Math.max(0, scrollLeft / maxScroll));
    setScrollProgress(progress);

    // Largura relativa do indicador slim (entre 18% e 45% da trilha)
    const ratio = Math.max(0.18, Math.min(0.45, clientWidth / scrollWidth));
    setThumbRatio(ratio);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = rowRef.current;
    if (!el) return;

    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [items.length, updateScrollState]);

  // Navegação suave pelos botões do topo direito
  const handleScroll = (direction: "left" | "right") => {
    if (!rowRef.current) return;
    const scrollAmount = rowRef.current.clientWidth * 0.75;
    rowRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  // Arraste fluido com o mouse (Mouse Drag no Desktop)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !rowRef.current) return;
    isMouseDownRef.current = true;
    hasDraggedRef.current = false;
    startXRef.current = e.clientX;
    scrollLeftRef.current = rowRef.current.scrollLeft;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isMouseDownRef.current || !rowRef.current) return;
      const dx = moveEvent.clientX - startXRef.current;
      if (Math.abs(dx) > 6) {
        hasDraggedRef.current = true;
        setIsDragging(true);
      }
      rowRef.current.scrollLeft = scrollLeftRef.current - dx;
    };

    const onMouseUp = () => {
      isMouseDownRef.current = false;
      setIsDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 80);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleCardClick = (item: ContinueWatchingItem) => {
    if (hasDraggedRef.current) return;

    if (item.currentTime !== undefined && onPlay) {
      onPlay(
        item.title,
        item.playerUrl,
        item.mediaType || "movie",
        item.tmdbId,
        item.imdbId,
        item.season,
        item.episodeNumber,
        item.quality,
        item.isCam,
        item.currentTime,
        true, // Auto-fullscreen imediato
        item.imageUrl,
        item.backdropUrl,
        item.posterUrl,
        false,
        item.serverKey
      );
    } else if (onPlay) {
      onPlay(
        item.title,
        item.playerUrl,
        item.title.includes("STRANGER") ? "series" : "movie",
        item.tmdbId,
        item.imdbId,
        item.title.includes("STRANGER") ? 4 : undefined,
        item.title.includes("STRANGER") ? 1 : undefined,
        undefined,
        false,
        item.progress ? 45 * 60 : undefined,
        true,
        item.imageUrl
      );
    } else if (onItemClick) {
      onItemClick(item.id);
    }
  };

  if (!items.length) return null;

  return (
    <section className="relative group/row my-4 sm:my-6">
      {/* Cabeçalho da Seção com Título e Botões Redondos de Navegação (Padrão Netflix) */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 pl-2 pr-4 sm:pr-6">
        <h2 className="text-xl md:text-2xl font-bold text-white border-l-4 border-orange-500 pl-2">
          Continue Assistindo
        </h2>

        {/* Botões redondos de navegação para PC/TV (Ocultos no mobile) */}
        {hasOverflow && (
          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              tabIndex={-1}
              data-no-tv-focus="true"
              onClick={() => handleScroll("left")}
              disabled={!canScrollLeft}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border ${
                canScrollLeft
                  ? "bg-neutral-800/90 hover:bg-orange-600 text-white border-white/15 hover:border-orange-500 hover:scale-110 cursor-pointer shadow-lg active:scale-95"
                  : "bg-neutral-900/40 text-neutral-600 border-white/5 cursor-not-allowed opacity-30"
              }`}
              aria-label="Rolar para a esquerda"
              title="Anterior"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
            </button>

            <button
              type="button"
              tabIndex={-1}
              data-no-tv-focus="true"
              onClick={() => handleScroll("right")}
              disabled={!canScrollRight}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border ${
                canScrollRight
                  ? "bg-neutral-800/90 hover:bg-orange-600 text-white border-white/15 hover:border-orange-500 hover:scale-110 cursor-pointer shadow-lg active:scale-95"
                  : "bg-neutral-900/40 text-neutral-600 border-white/5 cursor-not-allowed opacity-30"
              }`}
              aria-label="Rolar para a direita"
              title="Próximo"
            >
              <ChevronRight className="w-5 h-5 stroke-[2.2]" />
            </button>
          </div>
        )}
      </div>

      {/* Carrossel de Cards com scrollbar nativa 100% oculta */}
      <div
        ref={rowRef}
        onMouseDown={handleMouseDown}
        style={{
          touchAction: "pan-y pan-x pinch-zoom",
          scrollBehavior: isDragging ? "auto" : "smooth",
        }}
        className={`flex gap-4 md:gap-6 overflow-x-auto overflow-y-hidden scrollbar-hide select-none pt-2 pb-4 pl-5 pr-8 sm:pl-6 sm:pr-10 scroll-pl-5 scroll-pr-8 sm:scroll-pl-6 sm:scroll-pr-10 ${
          isDragging ? "cursor-grabbing" : "cursor-grab snap-x snap-mandatory"
        }`}
        tabIndex={0}
        role="region"
        aria-label="Continue Assistindo — role para ver mais títulos"
      >
        {items.map((item, idx) => (
          <div
            key={`cw-${item.id}-${idx}`}
            tabIndex={0}
            role="button"
            data-tv-focusable="true"
            onFocus={(e) => {
              e.currentTarget.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
            }}
            onClick={() => handleCardClick(item)}
            className="snap-start shrink-0 relative group cursor-pointer w-[270px] sm:w-[300px] md:w-[320px] h-[155px] sm:h-[170px] md:h-[180px] rounded-xl overflow-hidden shadow-lg border border-neutral-800/80 hover:border-orange-500/60 transition-all outline-none"
          >
            <img
              src={item.imageUrl}
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
              onError={(e) => onPosterError(e, item.backdropUrl)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

            {/* Botão X para remover do Continue Assistindo */}
            <button
              type="button"
              onClick={(e) => onRemoveItem(e, item)}
              onTouchEnd={(e) => onRemoveItem(e, item)}
              title="Remover do Continue Assistindo"
              aria-label="Remover do Continue Assistindo"
              className="absolute top-2.5 right-2.5 z-30 w-8 h-8 rounded-full bg-black/80 hover:bg-red-600 active:bg-red-600 text-white flex items-center justify-center backdrop-blur-md border border-white/20 hover:border-red-500/50 transition-all duration-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:scale-110 active:scale-95 shadow-xl cursor-pointer"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            {/* Play Overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25 pointer-events-none">
              <div className="w-12 h-12 bg-orange-600/95 rounded-full flex items-center justify-center backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all shadow-[0_0_15px_rgba(234,88,12,0.6)]">
                <Play className="w-5 h-5 fill-white text-white ml-0.5" />
              </div>
            </div>

            {/* Metadados e Barra de Progresso do Card */}
            <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4 pointer-events-none">
              <div className="flex justify-between items-end mb-2">
                <div className="truncate mr-2 min-w-0">
                  <h3 className="font-bold text-white text-sm sm:text-base md:text-lg drop-shadow-md truncate">
                    {item.title}
                  </h3>
                  {item.episode && (
                    <p className="text-neutral-300 text-xs mt-0.5 drop-shadow-md truncate">
                      {item.episode}
                    </p>
                  )}
                </div>
                {item.progress !== undefined && (
                  <span className="text-[11px] font-mono text-orange-400 shrink-0 font-bold ml-1">
                    {item.progress}%
                  </span>
                )}
              </div>

              {/* Progress Bar do Vídeo */}
              <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all duration-300 shadow-[0_0_8px_rgba(234,88,12,0.8)]"
                  style={{ width: `${item.progress || 0}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Indicador Slim Minimalista de 2.5px (Substitui a barra feia do Windows) */}
      {hasOverflow && (
        <div className="px-5 sm:px-6 pt-1 flex items-center justify-start">
          <div className="w-36 sm:w-48 md:w-56 h-[3px] bg-white/10 rounded-full overflow-hidden relative shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-150 ease-out"
              style={{
                width: `${thumbRatio * 100}%`,
                transform: `translateX(${(scrollProgress * (1 - thumbRatio) / thumbRatio) * 100}%)`,
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
