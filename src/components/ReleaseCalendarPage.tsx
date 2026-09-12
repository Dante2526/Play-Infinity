import React, { useState, useEffect } from "react";
import {
  CalendarDays,
  Clock,
  Play,
  Bookmark,
  BookmarkCheck,
  Tv,
  Film,
  Sparkles,
  ChevronRight,
  Info,
  Calendar as CalendarIcon,
  CheckCircle2,
  Bell,
  AlertCircle
} from "lucide-react";
import { CatalogItem } from "../data";
import {
  SeriesScheduleEpisode,
  getFavoriteIds,
  toggleFavorite,
  fetchDynamicScheduleForFavorites,
  getAllCatalogItems,
  SERIES_EPISODE_SCHEDULE
} from "../services/favorites";

interface ReleaseCalendarPageProps {
  onItemClick: (id: number, item?: CatalogItem) => void;
  onPlay?: (
    title: string,
    url?: string,
    mediaType?: 'movie' | 'series',
    tmdbId?: number,
    imdbId?: string,
    season?: number,
    episode?: number,
    quality?: string,
    isCam?: boolean
  ) => void;
  onNavigateToSeries?: () => void;
}

export const ReleaseCalendarPage: React.FC<ReleaseCalendarPageProps> = ({
  onItemClick,
  onPlay,
  onNavigateToSeries
}) => {
  const CACHE_KEY = "playinfinity_schedule_cache_v2";

  const [favoriteIds, setFavoriteIds] = useState<number[]>(getFavoriteIds());
  const [filterTab, setFilterTab] = useState<'all' | 'week' | 'today' | 'upcoming' | 'ended'>('all');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dynamicEpisodes, setDynamicEpisodes] = useState<SeriesScheduleEpisode[]>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {}
    return [];
  });
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(dynamicEpisodes.length === 0);

  // Sincroniza estado de favoritos via evento
  useEffect(() => {
    const handleFavoritesUpdate = (e: any) => {
      setFavoriteIds(e.detail || getFavoriteIds());
    };

    window.addEventListener("playinfinity:favorites_updated", handleFavoritesUpdate);
    return () => {
      window.removeEventListener("playinfinity:favorites_updated", handleFavoritesUpdate);
    };
  }, []);

  // Busca o status real oficial de cada série diretamente no TMDB
  useEffect(() => {
    let isMounted = true;
    if (favoriteIds.length === 0) {
      setDynamicEpisodes([]);
      setLoadingSchedule(false);
      return;
    }

    setLoadingSchedule(true);
    fetchDynamicScheduleForFavorites(favoriteIds).then(episodes => {
      if (isMounted) {
        if (episodes && episodes.length > 0) {
          setDynamicEpisodes(episodes);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(episodes));
          } catch (e) {}
        }
        setLoadingSchedule(false);
      }
    }).catch(err => {
      console.warn("Erro ao sincronizar episódios reais:", err);
      if (isMounted) setLoadingSchedule(false);
    });

    return () => { isMounted = false; };
  }, [favoriteIds]);

  const allCatalog = getAllCatalogItems();
  const allSeries = allCatalog.filter(item => item.type === 'series');
  
  // Séries atualmente favoritadas pelo usuário
  const followedSeries = allSeries.filter(series => favoriteIds.includes(series.id));
  
  // Episódios com dados reais do TMDB
  const scheduledEpisodes = dynamicEpisodes;

  // Datas calculadas em tempo real (data real de hoje)
  const todayDate = new Date();
  const todayStr = todayDate.toISOString().split('T')[0];
  const nextWeekDate = new Date(Date.now() + 7 * 86400000);
  const nextWeekStr = nextWeekDate.toISOString().split('T')[0];

  const daysOfWeek = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  const dayNamesPt = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const todayDayName = dayNamesPt[todayDate.getDay()];

  // Filtragem dos episódios
  const filteredEpisodes = scheduledEpisodes.filter(ep => {
    if (selectedDay && ep.dayOfWeek !== selectedDay) {
      return false;
    }

    if (filterTab === 'today') {
      return ep.status === 'today';
    }
    if (filterTab === 'upcoming') {
      return ep.status === 'upcoming';
    }
    if (filterTab === 'week') {
      return ep.status === 'today' || (ep.airDate >= todayStr && ep.airDate <= nextWeekStr);
    }
    if (filterTab === 'ended') {
      return ep.status === 'season_ended' || ep.status === 'series_ended';
    }
    return true;
  });

  const handleToggleFav = (id: number) => {
    toggleFavorite(id);
    setFavoriteIds(getFavoriteIds());
  };

  // Contadores dinâmicos
  const todayCount = scheduledEpisodes.filter(e => e.status === 'today').length;
  const thisWeekCount = scheduledEpisodes.filter(e => e.status === 'today' || (e.airDate >= todayStr && e.airDate <= nextWeekStr)).length;
  const endedCount = scheduledEpisodes.filter(e => e.status === 'season_ended' || e.status === 'series_ended').length;

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen pt-28 md:pt-32 px-4 md:px-12 bg-[#0a0a0a] pb-28 md:pb-16 text-white">
      <div className="max-w-7xl mx-auto w-full">
        
        {/* CABEÇALHO DO CALENDÁRIO */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 text-orange-500 font-bold text-xs uppercase tracking-widest mb-2">
              <CalendarDays className="w-4 h-4" />
              <span>Agenda de Séries Seguidas</span>
              {loadingSchedule && (
                <span className="flex items-center gap-1.5 text-neutral-400 normal-case font-normal text-[11px] bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10">
                  <span className="w-2 h-2 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></span>
                  Sincronizando TMDB...
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase">
              Calendário de Lançamentos
            </h1>
            <p className="text-neutral-400 text-sm md:text-base mt-2 max-w-2xl">
              Cronograma de novos episódios baseado exclusivamente nas séries adicionadas aos seus <strong className="text-neutral-200">Favoritos</strong>.
            </p>
          </div>

          {/* Cards de Métricas */}
          <div className="grid grid-cols-3 sm:flex items-center justify-center gap-3 w-full md:w-auto shrink-0">
            <div className="bg-[#121212] border border-white/10 rounded-2xl px-3 py-3.5 sm:px-5 sm:py-3 text-center min-w-0 sm:min-w-[105px] flex flex-col items-center justify-center">
              <span className="block text-2xl sm:text-3xl font-black text-orange-500">{followedSeries.length}</span>
              <span className="text-[11px] text-neutral-400 font-medium whitespace-nowrap mt-0.5">Séries Seguidas</span>
            </div>
            <div className="bg-[#121212] border border-white/10 rounded-2xl px-3 py-3.5 sm:px-5 sm:py-3 text-center min-w-0 sm:min-w-[105px] flex flex-col items-center justify-center">
              <span className="block text-2xl sm:text-3xl font-black text-white">{thisWeekCount}</span>
              <span className="text-[11px] text-neutral-400 font-medium whitespace-nowrap mt-0.5">Esta Semana</span>
            </div>
            <div className="bg-[#121212] border border-white/10 rounded-2xl px-3 py-3.5 sm:px-5 sm:py-3 text-center min-w-0 sm:min-w-[105px] flex flex-col items-center justify-center">
              <span className="block text-2xl sm:text-3xl font-black text-emerald-400">{todayCount}</span>
              <span className="text-[11px] text-neutral-400 font-medium whitespace-nowrap mt-0.5">Estreias Hoje</span>
            </div>
          </div>
        </div>

        {/* SE HOUVER SÉRIES SEGUIDAS */}
        {followedSeries.length > 0 ? (
          <>
            {/* BARRA DE FILTROS & ABAS */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 my-8">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                <button
                  onClick={() => { setFilterTab('all'); setSelectedDay(null); }}
                  className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    filterTab === 'all' && !selectedDay
                      ? 'bg-orange-600 text-white shadow-[0_0_15px_rgba(234,88,12,0.4)]'
                      : 'bg-white/5 hover:bg-white/10 text-neutral-300'
                  }`}
                >
                  Todos ({scheduledEpisodes.length})
                </button>
                <button
                  onClick={() => { setFilterTab('today'); setSelectedDay(null); }}
                  className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    filterTab === 'today'
                      ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                      : 'bg-white/5 hover:bg-white/10 text-neutral-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Lançamentos de Hoje ({todayCount})
                </button>
                <button
                  onClick={() => { setFilterTab('week'); setSelectedDay(null); }}
                  className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    filterTab === 'week'
                      ? 'bg-orange-600 text-white shadow-[0_0_15px_rgba(234,88,12,0.4)]'
                      : 'bg-white/5 hover:bg-white/10 text-neutral-300'
                  }`}
                >
                  Esta Semana ({thisWeekCount})
                </button>
                <button
                  onClick={() => { setFilterTab('upcoming'); setSelectedDay(null); }}
                  className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    filterTab === 'upcoming'
                      ? 'bg-orange-600 text-white shadow-[0_0_15px_rgba(234,88,12,0.4)]'
                      : 'bg-white/5 hover:bg-white/10 text-neutral-300'
                  }`}
                >
                  Próximos
                </button>
                {endedCount > 0 && (
                  <button
                    onClick={() => { setFilterTab('ended'); setSelectedDay(null); }}
                    className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                      filterTab === 'ended'
                        ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]'
                        : 'bg-white/5 hover:bg-white/10 text-neutral-300'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                    Temporadas Concluídas ({endedCount})
                  </button>
                )}
              </div>

              {/* Botão de Seguir mais séries */}
              {onNavigateToSeries && (
                <button
                  onClick={onNavigateToSeries}
                  className="flex items-center gap-2 text-xs font-semibold text-orange-400 hover:text-orange-300 bg-orange-600/10 hover:bg-orange-600/20 border border-orange-500/20 px-4 py-2 rounded-full transition-all w-fit cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Explorar mais séries para seguir</span>
                </button>
              )}
            </div>

            {/* SELETOR RÁPIDO DE DIAS DA SEMANA */}
            <div className="grid grid-cols-2 xs:grid-cols-4 sm:grid-cols-7 gap-2 mb-8">
              {daysOfWeek.map(day => {
                const countForDay = scheduledEpisodes.filter(e => e.dayOfWeek === day).length;
                const isSelected = selectedDay === day;
                const isToday = day === todayDayName;

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-orange-600/20 border-orange-500 text-white shadow-[0_0_15px_rgba(234,88,12,0.3)]'
                        : isToday
                        ? 'bg-neutral-900 border-emerald-500/60 text-white'
                        : 'bg-[#121212]/80 hover:bg-[#181818] border-white/5 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {day.slice(0, 3)}
                      </span>
                      {isToday && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase">
                          Hoje
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-white truncate max-w-full">
                      {day.split('-')[0]}
                    </span>
                    <div className="mt-2 flex items-center gap-1 text-[11px]">
                      {countForDay > 0 ? (
                        <span className={`px-2 py-0.5 rounded-full font-bold ${isSelected ? 'bg-orange-500 text-black' : isToday ? 'bg-emerald-500 text-black' : 'bg-white/10 text-orange-400'}`}>
                          {countForDay} {countForDay === 1 ? 'ep' : 'eps'}
                        </span>
                      ) : (
                        <span className="text-neutral-600 text-[10px]">—</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* LISTA / GRID DE EPISÓDIOS DO CALENDÁRIO */}
            {filteredEpisodes.length > 0 ? (
              <div className="space-y-4">
                {filteredEpisodes.map(ep => {
                  const isToday = ep.status === 'today';
                  const isReleased = ep.status === 'released';
                  const isSeasonEnded = ep.status === 'season_ended';
                  const isSeriesEnded = ep.status === 'series_ended';
                  const isEnded = isSeasonEnded || isSeriesEnded;

                  return (
                    <div
                      key={ep.id}
                      className={`relative bg-[#121212] border rounded-2xl p-4 sm:p-5 transition-all flex flex-col md:flex-row gap-5 items-start md:items-center justify-between overflow-hidden group hover:border-orange-500/40 hover:shadow-[0_0_25px_rgba(234,88,12,0.15)] ${
                        isToday
                          ? 'border-emerald-500/40 bg-gradient-to-r from-[#121212] via-[#151d18] to-[#121212]'
                          : isSeasonEnded
                          ? 'border-indigo-500/30 bg-gradient-to-r from-[#121212] via-[#151525] to-[#121212]'
                          : isSeriesEnded
                          ? 'border-neutral-700/60 bg-[#121212]'
                          : 'border-white/5'
                      }`}
                    >
                      {/* Efeito Glow lateral */}
                      <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                        isToday ? 'bg-emerald-500' :
                        isSeasonEnded ? 'bg-indigo-500' :
                        isSeriesEnded ? 'bg-neutral-600' :
                        isReleased ? 'bg-neutral-600' :
                        'bg-orange-500'
                      }`} />

                      {/* Lado Esquerdo: Poster + Informações */}
                      <div className="flex items-center gap-4 sm:gap-5 flex-1 min-w-0">
                        {/* Poster da Série */}
                        <div
                          onClick={() => onItemClick(ep.seriesId)}
                          className="w-16 sm:w-20 aspect-[2/3] rounded-xl overflow-hidden shadow-lg border border-neutral-800 shrink-0 cursor-pointer group-hover:scale-105 transition-transform bg-[#1a1a1a]"
                        >
                          <img
                            src={ep.seriesPoster}
                            alt={ep.seriesTitle}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = ep.seriesBackdrop || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=500&q=80";
                            }}
                          />
                        </div>

                        {/* Detalhes do Episódio */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="px-2 py-0.5 rounded bg-white/10 text-neutral-300 text-[10px] font-bold uppercase tracking-wider">
                              {ep.provider}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isEnded
                                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-orange-600/20 text-orange-400 border border-orange-500/30'
                            }`}>
                              T{ep.seasonNumber}:E{ep.episodeNumber}
                            </span>
                            
                            {/* Tag de Status */}
                            {isToday ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm whitespace-nowrap shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping shrink-0"></span>
                                Estreia Hoje ({ep.airTime})
                              </span>
                            ) : isSeasonEnded ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0">
                                <CheckCircle2 className="w-3 h-3 text-indigo-400 shrink-0" />
                                <span>Temporada Concluída</span>
                                <span className="hidden sm:inline">• Aguardando Nova Temporada</span>
                              </span>
                            ) : isSeriesEnded ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700 text-[10px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0">
                                <CheckCircle2 className="w-3 h-3 text-neutral-500 shrink-0" />
                                <span>Série Concluída</span>
                                <span className="hidden sm:inline">(Finalizada)</span>
                              </span>
                            ) : isReleased ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 text-[10px] font-semibold whitespace-nowrap shrink-0">
                                Já Lançado
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[10px] font-semibold whitespace-nowrap shrink-0">
                                {ep.dayOfWeek} às {ep.airTime}
                              </span>
                            )}
                          </div>

                          <h3
                            onClick={() => onItemClick(ep.seriesId)}
                            className="font-black text-base sm:text-lg text-white hover:text-orange-400 transition-colors cursor-pointer truncate"
                          >
                            {ep.seriesTitle}
                          </h3>

                          <p className="text-sm font-semibold text-neutral-200 mt-0.5 truncate">
                            {ep.episodeTitle}
                          </p>

                          <p className="text-xs text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                            {ep.synopsis}
                          </p>

                          {/* Data formatada */}
                          <div className="flex items-center gap-3 text-xs text-neutral-400 mt-2">
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="w-3.5 h-3.5 text-neutral-500" />
                              {isEnded ? "Último exibido: " : ""}
                              {new Date(ep.airDate + "T12:00:00").toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                            </span>
                            {!isEnded && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-neutral-500" />
                                  {ep.airTime} (Horário de Brasília)
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lado Direito: Ações */}
                      <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto shrink-0 justify-end pt-2 md:pt-0 border-t md:border-t-0 border-white/5">
                        {/* Botão Assistir Episódio */}
                        <button
                          onClick={() => {
                            onPlay?.(
                              `${ep.seriesTitle} - T${ep.seasonNumber}:E${ep.episodeNumber}`,
                              ep.playerUrl,
                              'series',
                              ep.tmdbId,
                              ep.imdbId,
                              ep.seasonNumber,
                              ep.episodeNumber,
                              undefined,
                              false,
                              undefined,
                              false,
                              ep.seriesBackdrop || ep.seriesPoster,
                              ep.seriesBackdrop,
                              ep.seriesPoster
                            );
                          }}
                          className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-full font-bold text-xs transition-all cursor-pointer ${
                            isToday
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                              : isSeasonEnded
                              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                              : 'bg-orange-600 hover:bg-orange-500 text-white shadow-[0_0_15px_rgba(234,88,12,0.3)]'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{isEnded ? "Assistir Último Ep" : "Assistir Episódio"}</span>
                        </button>

                        {/* Botão Ver Série */}
                        <button
                          onClick={() => onItemClick(ep.seriesId)}
                          className="px-3.5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                          title="Ver detalhes da série"
                        >
                          Ver Série
                        </button>

                        {/* Botão Seguir/Favorito */}
                        <button
                          onClick={() => handleToggleFav(ep.seriesId)}
                          className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-orange-500 border border-white/10 transition-colors cursor-pointer"
                          title="Remover série dos favoritos"
                        >
                          <BookmarkCheck className="w-4 h-4 fill-current" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-[#121212] border border-white/5 rounded-3xl p-12 text-center my-6 flex flex-col items-center">
                <CalendarIcon className="w-12 h-12 text-neutral-600 mb-3" />
                <h3 className="text-lg font-bold text-white mb-1">Nenhum episódio encontrado para este filtro</h3>
                <p className="text-xs text-neutral-400 max-w-sm mb-4">
                  Não há episódios programados para os critérios selecionados nas suas séries seguidas.
                </p>
                <button
                  onClick={() => { setFilterTab('all'); setSelectedDay(null); }}
                  className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Ver Todos os Lançamentos
                </button>
              </div>
            )}
          </>
        ) : (
          /* ESTADO VAZIO: NENHUMA SÉRIE FAVORITADA AINDA */
          <div className="mt-8 space-y-10">
            <div className="bg-[#121212] border border-orange-500/20 rounded-3xl p-8 sm:p-12 text-center flex flex-col items-center shadow-2xl relative overflow-hidden">
              <div className="w-20 h-20 rounded-full bg-orange-600/10 border border-orange-500/30 flex items-center justify-center text-orange-500 mb-6 shadow-[0_0_30px_rgba(234,88,12,0.2)]">
                <Bookmark className="w-10 h-10" />
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight mb-3">
                Seu Calendário está Vazio
              </h2>
              <p className="text-neutral-400 text-sm sm:text-base max-w-lg mb-8 leading-relaxed">
                Para ver os dias e horários em que os novos episódios vão sair, basta <strong className="text-orange-400">adicionar suas séries favoritas</strong>. Elas também aparecerão no seu perfil automaticamente!
              </p>

              {onNavigateToSeries && (
                <button
                  onClick={onNavigateToSeries}
                  className="px-8 py-3.5 rounded-full bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm shadow-[0_0_25px_rgba(234,88,12,0.4)] transition-all cursor-pointer flex items-center gap-2"
                >
                  <Tv className="w-4 h-4" />
                  <span>Explorar Catálogo de Séries</span>
                </button>
              )}
            </div>

            {/* SEÇÃO DE SUGESTÕES DE SÉRIES POPULARES PARA FAVORITAR COM 1 CLIQUE */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                    Séries Populares para Seguir
                  </h3>
                  <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
                    Adicione com 1 clique para preencher sua agenda de lançamentos
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                {allSeries.map(series => {
                  const isFav = favoriteIds.includes(series.id);
                  const hasSchedule = !!SERIES_EPISODE_SCHEDULE[series.id];

                  return (
                    <div
                      key={series.id}
                      className="group relative rounded-2xl overflow-hidden bg-[#121212] border border-white/5 hover:border-orange-500/50 transition-all duration-300 flex flex-col"
                    >
                      {/* Pôster com Overlay */}
                      <div
                        onClick={() => onItemClick(series.id, series)}
                        className="relative aspect-[2/3] w-full overflow-hidden cursor-pointer"
                      >
                        <img
                          src={series.posterUrl || series.imageUrl}
                          alt={series.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = series.backdropUrl || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=500&q=80";
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>

                        {hasSchedule && (
                          <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded bg-orange-600/90 text-white text-[9px] font-black uppercase tracking-wider backdrop-blur-md">
                            Novos Episódios
                          </div>
                        )}
                      </div>

                      {/* Informações e Botão Seguir */}
                      <div className="p-3.5 flex flex-col flex-1 justify-between bg-[#121212]">
                        <div>
                          <h4
                            onClick={() => onItemClick(series.id, series)}
                            className="font-bold text-xs sm:text-sm text-white hover:text-orange-400 transition-colors cursor-pointer truncate"
                          >
                            {series.title}
                          </h4>
                          <span className="text-[11px] text-neutral-400 block mt-0.5">
                            {series.duration || "Série"} • {series.genres?.[0]}
                          </span>
                        </div>

                        <button
                          onClick={() => handleToggleFav(series.id)}
                          className={`mt-3 w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            isFav
                              ? 'bg-orange-600/20 text-orange-400 border border-orange-500/40'
                              : 'bg-white/10 hover:bg-orange-600 hover:text-white text-neutral-200'
                          }`}
                        >
                          {isFav ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Seguindo</span>
                            </>
                          ) : (
                            <>
                              <Bookmark className="w-3.5 h-3.5" />
                              <span>+ Seguir Série</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
