import React, { useState, useEffect } from 'react';
import { Play, Loader2, Film } from 'lucide-react';
import { sagas, Saga } from '../data/sagas';
import { getDetails, formatImageUrl } from '../services/tmdb';
import { checkIsCam, FALLBACK_POSTER_IMAGE } from '../utils/mediaUtils';
import { OnPlayHandler } from '../types';

interface SagasPageProps {
  onItemClick: (id: number, item?: any) => void;
  onPlay?: OnPlayHandler;
}

export default function SagasPage({ onItemClick, onPlay }: SagasPageProps) {
  const [activeSaga, setActiveSaga] = useState<Saga>(sagas[0]);
  const [sagaMovies, setSagaMovies] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeSaga]);

  useEffect(() => {
    async function fetchSagaMovies() {
      setIsLoading(true);
      try {
        const promises = activeSaga.movies.map(id => getDetails(id, 'movie'));
        const results = await Promise.all(promises);
        setSagaMovies(results.filter(Boolean));
      } catch (error) {
        console.error("Erro ao buscar filmes da saga:", error);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchSagaMovies();
  }, [activeSaga]);

  return (
    <div className="flex-1 w-full bg-[#0a0a0a] min-h-screen text-white pb-24 animate-in fade-in duration-300">
      {/* Banner Principal da Saga Ativa */}
      <div className="relative w-full h-[50vh] md:h-[65vh] lg:h-[75vh]">
        <div className="absolute inset-0">
          <img 
            src={`https://image.tmdb.org/t/p/original${activeSaga.backdrop_path}`}
            alt={activeSaga.title}
            className="w-full h-full object-cover opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
        </div>

        <div className="absolute bottom-0 left-0 w-full p-4 sm:p-8 lg:p-12 z-10 flex flex-col md:flex-row gap-8 items-end">
          <div className="flex-1 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[10px] sm:text-xs font-black tracking-widest uppercase mb-2">
              <Film className="w-3.5 h-3.5" />
              Saga Completa
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-7xl font-black text-white tracking-tighter drop-shadow-2xl">
              {activeSaga.title}
            </h1>
            <p className="text-sm md:text-base lg:text-lg text-neutral-300 max-w-2xl leading-relaxed drop-shadow-md">
              {activeSaga.description}
            </p>
            <div className="flex flex-wrap gap-3 pt-4">
              <button 
                onClick={() => sagaMovies[0] && onPlay?.(sagaMovies[0].title, `https://v1.watchplay.shop/movie/${sagaMovies[0].id}`, 'movie', sagaMovies[0].id, sagaMovies[0].imdb_id)}
                className="px-6 sm:px-8 py-3.5 bg-white hover:bg-neutral-200 text-black font-bold rounded-2xl flex items-center justify-center gap-2 transition-all hover:scale-105 shadow-xl shadow-white/10"
              >
                <Play className="w-5 h-5 fill-black" />
                Assistir Parte 1
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[2000px] mx-auto px-4 sm:px-8 lg:px-12 -mt-8 relative z-20 space-y-12">
        
        {/* Seletor de Sagas */}
        <div className="bg-neutral-900/80 backdrop-blur-xl border border-white/10 p-2 sm:p-3 rounded-2xl flex gap-2 overflow-x-auto scrollbar-hide shadow-2xl">
          {sagas.map(saga => (
            <button
              key={saga.id}
              onClick={() => setActiveSaga(saga)}
              className={`whitespace-nowrap px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center gap-2 shrink-0 ${
                activeSaga.id === saga.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.02]'
                  : 'bg-transparent text-neutral-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {saga.title}
            </button>
          ))}
        </div>

        {/* Lista de Filmes da Saga */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
              Ordem Cronológica
            </h2>
            <span className="text-sm font-bold text-neutral-500">{sagaMovies.length} Filmes</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-6">
              {sagaMovies.map((movie, index) => (
                <div key={movie.id} className="relative group flex flex-col">
                  {/* Badge numérico para ordem */}
                  <div className="absolute -left-2 -top-2 w-8 h-8 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-lg shadow-blue-900/50 z-20 border-[3px] border-[#0a0a0a]">
                    {index + 1}
                  </div>
                  
                  <div 
                    onClick={() => onItemClick(movie.id, movie)} 
                    className="relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group cursor-pointer aspect-[2/3] hover:border-blue-500/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.25)] transition-all duration-300 w-full"
                  >
                    <img 
                      src={formatImageUrl(movie.poster_path, 'w500') || FALLBACK_POSTER_IMAGE} 
                      alt={movie.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 bg-neutral-900" 
                      loading="lazy" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent"></div>
                    
                    {/* Badge de nota e CAM */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
                      {checkIsCam(movie.title) ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] tracking-wider uppercase shadow-md">
                          CAM
                        </span>
                      ) : <span />}
                      <span className="px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] font-bold text-blue-400 border border-white/10">
                        {movie.vote_average?.toFixed(1) || "N/A"} ★
                      </span>
                    </div>

                    {/* Play Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlay?.(movie.title, `https://v1.watchplay.shop/movie/${movie.id}`, 'movie', movie.id, movie.imdb_id);
                        }}
                        className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all shadow-[0_0_20px_rgba(59,130,246,0.6)] text-white hover:scale-110"
                        title="Assistir agora"
                      >
                        <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                      </div>
                    </div>

                    <div className="absolute bottom-4 inset-x-0 mx-3">
                      <span className="block text-center font-bold text-sm md:text-base uppercase text-white drop-shadow-lg truncate">
                        {movie.title}
                      </span>
                      <span className="block text-center text-xs text-neutral-400 mt-0.5">
                        {movie.release_date?.substring(0, 4) || new Date().getFullYear()} • Filme
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-3 pl-1">
                    <h3 className="text-xs sm:text-sm font-bold text-neutral-200 line-clamp-2 group-hover:text-blue-400 transition-colors">
                      {movie.title}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-neutral-500 mt-1 font-semibold uppercase tracking-wider">Parte {index + 1}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
