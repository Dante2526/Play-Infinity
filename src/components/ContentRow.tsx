import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence } from "motion/react";
import {
  Play,
  Bookmark,
  BookmarkCheck,
  Home,
  Film,
  Tv,
  CalendarDays,
  Calendar,
  List as ListIcon,
  Search,
  Star,
  StarHalf,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  MessageSquare,
  Send,
  Check,
  Info,
  Radio,
  Loader2,
  Sparkles,
  Clock,
  Layers,
  X,
  CheckCircle2,
  ShieldCheck,
  FileText,
  Bell,
  Mic,
  MicOff
} from "lucide-react";
import { useVoiceSearch } from "../hooks/useVoiceSearch";

import { CatalogItem, checkIsCam, WATCHPLAY_DORAMA_IDS } from "../utils/mediaUtils";;
import { 
  searchMulti, 
  getDetails, 
  getSeasonDetails, 
  formatImageUrl, 
  getGenreNames, 
  getProviderSeries,
  getProviderMovies,
  discoverMovies,
  discoverSeries,
  getGenreIdByName,
  getMovieReleases,
  getSeriesReleases,
  getAnimes,
  getDoramas,
  FALLBACK_POSTER_IMAGE,
  FALLBACK_BACKDROP_IMAGE,
  TMDBItem, 
  TMDBDetails, 
  Season,
  getTrending,
  getTrailer,
  TrailerVideo
} from "../services/tmdb";
import { VideoPlayerModal } from "../components/VideoPlayerModal";

function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<any>
) {
  return React.lazy(async () => {
    try {
      const module = await componentImport();
      return { default: module.default || Object.values(module)[0] };
    } catch (error) {
      console.warn("[LazyRetry] Dynamic import failed, reloading page...", error);
      const hasReloaded = sessionStorage.getItem("lazy-reload");
      if (!hasReloaded) {
        sessionStorage.setItem("lazy-reload", "true");
        window.location.reload();
      }
      throw error;
    }
  });
}

const WebhookPanelModal = lazyWithRetry(() => import("../components/WebhookPanelModal"));
const ReleaseCalendarPage = lazyWithRetry(() => import("../components/ReleaseCalendarPage"));
const LiveTvPage = lazyWithRetry(() => import("../components/LiveTvPage"));
const NotificationModal = lazyWithRetry(() => import("../components/NotificationModal"));
import { VirtualRemote } from "../components/VirtualRemote";
import {
  getFavoriteIds,
  toggleFavorite,
  isItemFavorite,
  getAllCatalogItems,
  SERIES_EPISODE_SCHEDULE,
  getScheduleForFavorites
} from "../services/favorites";
import {
  getFavoriteEpisodeNotifications,
  getReadNotificationIds
} from "../services/notifications";
import {
  isEpisodeWatched,
  toggleEpisodeWatched,
  markSeasonWatched,
  isSeasonFullyWatched,
  getSeasonWatchedCount
} from "../services/watchedEpisodes";
import { getPlaybackHistory, PlaybackHistoryItem, removePlaybackItem } from "../services/playbackHistory";
import { getCommentsForItem, addComment, toggleCommentLike, CommentItem } from "../services/comments";

const FALLBACK_POSTER = "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=500&q=80";
const FALLBACK_BACKDROP = "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80";

const handlePosterError = (e: React.SyntheticEvent<HTMLImageElement, Event>, backdropUrl?: string) => {
  const target = e.currentTarget;
  if (backdropUrl && target.src !== backdropUrl) {
    target.src = backdropUrl;
  } else {
    target.onerror = null;
    target.src = FALLBACK_POSTER;
  }
};



import { OnPlayHandler } from "../types";

function ContentRowInner({ 
  title, 
  items, 
  isTop10 = false, 
  aspect = "landscape",
  startNumber = 1,
  onItemClick,
  badge,
  customHeader
}: { 
  title: string, 
  items: any[], 
  isTop10?: boolean, 
  aspect?: "landscape" | "portait",
  startNumber?: number,
  onItemClick?: (id: number, item?: any) => void,
  badge?: string,
  customHeader?: React.ReactNode
}) {
  const rowRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(true);

  // Controle de arrastar com mouse e touch (Drag-to-scroll 1:1 sem resistência de snap)
  const isMouseDownRef = React.useRef(false);
  const startXRef = React.useRef(0);
  const scrollLeftRef = React.useRef(0);
  const hasDraggedRef = React.useRef(false);
  const [isDragging, setIsDragging] = React.useState(false);

  // Touch handlers para mobile
  const touchStartXRef = React.useRef(0);
  const touchStartYRef = React.useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    hasDraggedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = Math.abs(e.touches[0].clientX - touchStartXRef.current);
    const dy = Math.abs(e.touches[0].clientY - touchStartYRef.current);
    // Se o movimento for predominantemente horizontal, marcamos como drag
    if (dx > 8 && dx > dy) {
      hasDraggedRef.current = true;
    }
  };

  const handleTouchEnd = () => {
    if (hasDraggedRef.current) {
      // Bloqueia o evento de click sintético que o navegador mobile dispara logo após o touch
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 150);
    }
  };

  const updateScrollButtons = React.useCallback(() => {
    if (!rowRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
    setCanScrollLeft(scrollLeft > 15);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 15);
  }, []);

  React.useEffect(() => {
    updateScrollButtons();
    const el = rowRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    window.addEventListener("resize", updateScrollButtons);
    return () => {
      el.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
    };
  }, [items, updateScrollButtons]);

  const handleScroll = (direction: "left" | "right") => {
    if (!rowRef.current) return;
    const scrollAmount = rowRef.current.clientWidth * 0.75;
    rowRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth"
    });
  };

  // Arraste com o mouse com listeners no window para movimentação contínua e natural
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !rowRef.current) return; // Apenas botão esquerdo
    isMouseDownRef.current = true;
    hasDraggedRef.current = false;
    startXRef.current = e.clientX;
    scrollLeftRef.current = rowRef.current.scrollLeft;

    const onWindowMouseMove = (moveEvent: MouseEvent) => {
      if (!isMouseDownRef.current || !rowRef.current) return;
      const dx = moveEvent.clientX - startXRef.current;
      if (Math.abs(dx) > 6) {
        hasDraggedRef.current = true;
        setIsDragging(true);
      }
      rowRef.current.scrollLeft = scrollLeftRef.current - dx;
    };

    const onWindowMouseUp = () => {
      isMouseDownRef.current = false;
      setIsDragging(false);
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 100);
    };

    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
  };

  return (
    <section className="relative group/row">
      {/* Cabeçalho da Seção com Título e Botões Redondos de Navegação */}
      <div className="flex items-center justify-between mb-4 md:mb-6 pl-2 pr-4">
        {customHeader ? (
          customHeader
        ) : title ? (
          <h2 className="text-xl md:text-2xl font-bold text-white border-l-4 border-orange-500 pl-2 flex items-center gap-2">
            <span>{title}</span>
            {badge && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                {badge}
              </span>
            )}
          </h2>
        ) : <div />}

        {/* Botões Redondinhos de Navegação no Topo Direito (Apenas Mouse/Pointer, ignorados pelo Controle Remoto TV) */}
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
      </div>

      {/* Carrossel de Itens com suporte a Mouse Drag e Touch Swipe */}
      <div 
        ref={rowRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          scrollSnapType: isDragging ? "none" : "x mandatory",
          scrollBehavior: isDragging ? "auto" : "smooth",
          touchAction: "pan-y pan-x pinch-zoom"
        }}
        className={`flex gap-4 md:gap-6 overflow-x-auto overflow-y-hidden scrollbar-hide select-none ${
          isTop10 
            ? "pt-5 pb-8 md:pt-6 lg:pb-10 pl-6 md:pl-8 pr-6 md:pr-8 scroll-pl-6 scroll-pr-6 md:scroll-pl-8 md:scroll-pr-8" 
            : "pt-5 pb-8 pl-5 md:pl-6 pr-6 md:pr-8 scroll-pl-5 md:scroll-pl-6 scroll-pr-6 md:scroll-pr-8"
        } ${
          isDragging ? "cursor-grabbing" : "cursor-grab snap-x snap-mandatory"
        }`}
      >
        {items.map((item, idx) => (
          <ContentCard
            key={`cr-${item.id || item.title}-${idx}`}
            item={item}
            idx={idx}
            startNumber={startNumber}
            isTop10={isTop10}
            aspect={aspect}
            onItemClick={onItemClick}
            hasDraggedRef={hasDraggedRef}
          />
        ))}
      </div>
    </section>
  );
}

const ContentCardInner = ({ item, idx, startNumber, isTop10, aspect, onItemClick, hasDraggedRef }: any) => {
  return (
    <div 
      tabIndex={0} 
      role="button" 
      onClick={(e) => {
        if (hasDraggedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onItemClick && onItemClick(item.id, item);
      }} 
      className={`snap-start shrink-0 relative group cursor-pointer transition-transform duration-300 hover:scale-105 hover:z-20 origin-bottom transform-gpu outline-none ${
        isTop10 ? "rounded-2xl" : "rounded-xl"
      }`}
    >
      {isTop10 ? (
        <div className="flex relative items-end w-[280px] md:w-[320px] h-[160px] md:h-[180px] rounded-2xl">
          {/* Bold background number */}
          <span className="absolute left-1 bottom-0 text-[80px] md:text-[100px] leading-none font-black text-neutral-600/80 group-hover:text-orange-500/90 group-focus:text-orange-500 group-[.tv-focused]:text-orange-500 z-0 tracking-tighter drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] select-none transition-colors duration-300">
            {idx + startNumber}
          </span>
          {/* Image */}
          <div className="relative w-[78%] md:w-[80%] ml-auto h-full rounded-xl overflow-hidden shadow-lg border border-neutral-800 group-hover:border-orange-500/50 group-focus:border-orange-500/50 transition-colors z-10">
             {checkIsCam(item.title, item.quality) && (
               <span className="absolute top-2 right-2 z-20 px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] tracking-wider uppercase shadow-md flex items-center gap-1">
                 CAM
               </span>
             )}
             <img 
               src={item.imageUrl} 
               alt={item.title} 
               draggable={false}
               className="w-full h-full object-cover pointer-events-none" 
               loading="lazy" 
               onError={(e) => handlePosterError(e, item.backdropUrl)}
             />
             <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>
             <span className="absolute bottom-3 left-3 font-bold text-lg md:text-xl text-white uppercase tracking-wider text-shadow pointer-events-none">
               {item.title}
             </span>
          </div>
        </div>
      ) : (
        <div className={`relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group-hover:border-orange-500/50 transition-colors 
          ${aspect === 'landscape' ? 'w-[240px] md:w-[300px] h-[135px] md:h-[170px]' : 'w-[160px] md:w-[200px] h-[240px] md:h-[300px]'}`}>
          {item.provider && (
            <span className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded bg-black/80 backdrop-blur-md text-neutral-200 font-bold text-[9px] tracking-wider uppercase border border-white/10 shadow-md">
              {item.provider}
            </span>
          )}
          {checkIsCam(item.title, item.quality) && (
            <span className="absolute top-2 right-2 z-20 px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] tracking-wider uppercase shadow-md flex items-center gap-1">
              CAM
            </span>
          )}
          <img 
            src={item.imageUrl} 
            alt={item.title} 
            draggable={false}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 pointer-events-none" 
            loading="lazy" 
            onError={(e) => handlePosterError(e, item.backdropUrl)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none"></div>
          <span className={`absolute ${aspect === 'landscape' ? 'bottom-3 left-3' : 'bottom-4 inset-x-0 mx-4 text-center font-black'} uppercase text-white drop-shadow-lg pointer-events-none`}>
            {item.title}
          </span>
        </div>
      )}
    </div>
  );
};

export const ContentCard = React.memo(ContentCardInner, (prev, next) => {
  return prev.item.id === next.item.id &&
         prev.idx === next.idx &&
         prev.isTop10 === next.isTop10 &&
         prev.aspect === next.aspect &&
         prev.startNumber === next.startNumber;
});

export const ContentRow = React.memo(ContentRowInner, (prev, next) => {
  return prev.title === next.title &&
         prev.items === next.items &&
         prev.isTop10 === next.isTop10 &&
         prev.aspect === next.aspect &&
         prev.badge === next.badge;
});
