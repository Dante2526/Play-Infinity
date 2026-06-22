import { useState, useEffect } from "react";
import {
  Play, Bookmark, Home, Film, Tv, Search, Star, ArrowLeft, ChevronRight, ThumbsUp, Send, Loader2
} from "lucide-react";
import { 
  getTrending, getPopularMovies, getPopularSeries, searchMulti, getDetails, getSeasonDetails, 
  formatImageUrl, getGenreNames, TMDBItem, TMDBDetails, Season, Episode
} from "./services/tmdb";
import { providers } from "./data";

export default function App() {
  const [viewState, setViewState] = useState<{ 
    type: 'home' | 'movies' | 'series' | 'provider' | 'search' | 'profile' | 'favorites' | 'details', 
    id?: number,
    mediaType?: 'movie' | 'tv',
    previous?: any
  }>({ type: 'home' });

  const navigateToDetails = (id: number, mediaType: 'movie' | 'tv' = 'movie') => {
    setViewState(prev => ({ type: 'details', id, mediaType, previous: prev }));
  };

  return (
    <div className="bg-[#0a0a0a] min-h-screen text-white font-sans flex flex-col md:pb-0">
      {/* HEADER DESKTOP */}
      <header className="hidden md:flex fixed top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-6xl items-center justify-between px-6 py-3 bg-[#0a0a0a]/60 backdrop-blur-2xl border border-white/10 rounded-full z-50 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)]">
        <div 
          className="font-black text-2xl tracking-tighter flex items-center shrink-0 ml-2 cursor-pointer"
          onClick={() => setViewState({ type: 'home' })}
        >
          <span className="text-white">PLAY</span>
          <span className="text-orange-500 ml-1">INFINITY</span>
        </div>
        <nav className="flex items-center gap-1 bg-black/40 p-1.5 rounded-full border border-white/5">
          <button onClick={() => setViewState({ type: 'home' })} className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${viewState.type === 'home' || viewState.type === 'provider' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}>Início</button>
          <button onClick={() => setViewState({ type: 'movies' })} className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${viewState.type === 'movies' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}>Filmes</button>
          <button onClick={() => setViewState({ type: 'series' })} className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${viewState.type === 'series' ? 'bg-orange-600/20 text-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.1)]' : 'hover:bg-white/10 text-neutral-300 hover:text-white'}`}>Séries</button>
        </nav>
        <div className="flex items-center gap-4 shrink-0 mr-1">
          <button 
            onClick={() => setViewState({ type: 'search' })}
            className={`transition-colors p-2.5 rounded-full border ${viewState.type === 'search' ? 'bg-orange-600/20 text-orange-500 border-orange-500/50' : 'text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border-white/10'}`}
          >
            <Search className="w-4 h-4" />
          </button>
          <div 
            onClick={() => setViewState({ type: 'profile' })}
            className={`w-10 h-10 rounded-full bg-gradient-to-tr from-orange-600 to-orange-400 border-[2px] flex items-center justify-center font-bold text-sm cursor-pointer hover:scale-105 transition-all ${viewState.type === 'profile' ? 'border-orange-500 shadow-[0_0_20px_rgba(234,88,12,0.8)]' : 'border-[#0a0a0a] shadow-[0_0_15px_rgba(234,88,12,0.4)]'}`}
          >
            N
          </div>
        </div>
      </header>

      {viewState.type === 'details' && viewState.id ? (
        <DetailsPage 
          itemId={viewState.id}
          mediaType={viewState.mediaType || 'movie'}
          onBack={() => setViewState(viewState.previous || { type: 'home' })} 
          onItemClick={navigateToDetails}
        />
      ) : viewState.type === 'movies' || viewState.type === 'series' ? (
        <GlobalCatalogPage type={viewState.type} onItemClick={navigateToDetails} />
      ) : viewState.type === 'search' ? (
        <GlobalSearchPage onItemClick={navigateToDetails} />
      ) : viewState.type === 'profile' ? (
        <UserProfilePage />
      ) : viewState.type === 'favorites' ? (
        <FavoritesPage onBack={() => setViewState({ type: 'profile' })} />
      ) : (
        <HomePage onProviderSelect={(p) => setViewState({ type: 'provider', id: p as any })} onItemClick={navigateToDetails} />
      )}

      {/* MOBILE BOTTOM NAVIGATION */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-50 pointer-events-none">
        <nav className="bg-[#111111]/80 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-2 flex justify-between items-center shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] pointer-events-auto">
          <div className="flex justify-around items-center flex-1">
            <NavItem onClick={() => setViewState({ type: 'home' })} icon={<Home />} label="Início" isActive={viewState.type === 'home' || viewState.type === 'provider'} />
            <NavItem onClick={() => setViewState({ type: 'movies' })} icon={<Film />} label="Filmes" isActive={viewState.type === 'movies'} />
            <NavItem onClick={() => setViewState({ type: 'series' })} icon={<Tv />} label="Séries" isActive={viewState.type === 'series'} />
            <NavItem onClick={() => setViewState({ type: 'search' })} icon={<Search />} label="Buscar" isActive={viewState.type === 'search'} />
          </div>
        </nav>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

function HomePage({ onProviderSelect, onItemClick }: { onProviderSelect: (p: string) => void, onItemClick: (id: number, type: 'movie'|'tv') => void }) {
  const [heroItem, setHeroItem] = useState<TMDBItem | null>(null);
  const [topMovies, setTopMovies] = useState<TMDBItem[]>([]);
  const [trendingMovies, setTrendingMovies] = useState<TMDBItem[]>([]);
  const [trendingSeries, setTrendingSeries] = useState<TMDBItem[]>([]);
  const [topSeries, setTopSeries] = useState<TMDBItem[]>([]);

  useEffect(() => {
    getTrending('all', 'week').then(res => setHeroItem(res.results[0]));
    getPopularMovies().then(res => setTopMovies(res.results.slice(0, 10)));
    getTrending('movie', 'day').then(res => setTrendingMovies(res.results.slice(0, 15)));
    getTrending('tv', 'day').then(res => setTrendingSeries(res.results.slice(0, 15)));
    getPopularSeries().then(res => setTopSeries(res.results.slice(0, 10)));
  }, []);

  const bgImage = heroItem ? formatImageUrl(heroItem.backdrop_path, 'original') : '';
  const genres = heroItem && heroItem.genre_ids ? getGenreNames(heroItem.genre_ids).slice(0, 3) : [];
  const title = heroItem?.title || heroItem?.name || 'Carregando...';

  return (
    <>
      <section className="relative w-full h-[75vh] md:h-[85vh] flex-shrink-0">
        <div className="absolute inset-0 bg-cover bg-center transition-all duration-700" style={{ backgroundImage: `url(${bgImage})` }}></div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent md:via-[#0a0a0a]/50"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-transparent to-transparent hidden md:block"></div>

        <div className="absolute inset-0 flex flex-col justify-end items-center md:items-start text-center md:text-left px-6 py-12 md:px-20 md:py-32 z-10">
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-4 leading-none" style={{ textShadow: "0 4px 20px rgba(0,0,0,0.8)" }}>
            {title}
          </h1>

          <div className="flex items-center gap-3 text-sm md:text-base font-medium text-neutral-300 mb-4">
             <span>{heroItem ? (heroItem.release_date || heroItem.first_air_date || '').split('-')[0] : ''}</span>
             <span className="w-1 h-1 rounded-full bg-neutral-600"></span>
             <div className="flex text-orange-500">
               <Star className="w-4 h-4 fill-orange-500" />
               <span className="ml-1 text-white">{heroItem?.vote_average?.toFixed(1)}</span>
             </div>
          </div>

          <div className="flex items-center gap-3 mb-6">
            {genres.map((g) => (
              <span key={g} className="px-3 py-1 bg-white/10 backdrop-blur-md border border-white/10 rounded-md text-xs font-semibold text-neutral-200">
                {g}
              </span>
            ))}
          </div>

          <p className="text-sm md:text-lg text-neutral-400 max-w-[90%] md:max-w-2xl leading-relaxed mb-8 line-clamp-3 md:line-clamp-none">
            {heroItem?.overview}
          </p>

          <div className="flex items-center gap-4 w-full md:w-auto justify-center md:justify-start">
            <button 
              onClick={() => heroItem && onItemClick(heroItem.id, heroItem.media_type || (heroItem.title ? 'movie' : 'tv'))}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 md:py-4 px-6 md:px-8 rounded-xl transition-all shadow-[0_0_20px_rgba(234,88,12,0.4)] hover:shadow-[0_0_30px_rgba(234,88,12,0.6)]"
            >
              <Play className="w-5 h-5 fill-current" /> Assistir
            </button>
          </div>
        </div>
      </section>

      <main className="flex-1 w-full bg-[#0a0a0a] pb-12 z-20 relative px-4 md:px-12 space-y-12">
        {/* Providers */}
        <section>
          <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pt-2 pb-4 scrollbar-hide">
            {providers.map((p) => {
              const logos: Record<string, { url: string, filter?: string, customClass?: string }> = {
                "NETFLIX": { url: "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg", customClass: "h-6 md:h-8" },
                "Disney+": { url: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg", filter: "brightness(0) invert(1) opacity(0.9)", customClass: "h-12 md:h-16" },
                "Max": { url: "https://upload.wikimedia.org/wikipedia/commons/c/ce/Max_logo.svg", filter: "brightness(0) invert(1) opacity(0.9)", customClass: "h-5 md:h-7" },
                "Prime Video": { url: "https://upload.wikimedia.org/wikipedia/commons/1/11/Amazon_Prime_Video_logo.svg", filter: "brightness(0) invert(1) opacity(0.9)", customClass: "h-6 md:h-8" },
                "Apple TV+": { url: "https://upload.wikimedia.org/wikipedia/commons/2/28/Apple_TV_Plus_Logo.svg", filter: "brightness(0) invert(1) opacity(0.9)", customClass: "h-6 md:h-8" },
              };
              const logoInfo = logos[p];
              return (
                <button
                  key={p}
                  className={`group snap-start shrink-0 h-20 md:h-28 px-8 md:px-12 backdrop-blur-md border rounded-2xl flex items-center justify-center min-w-[150px] md:min-w-[200px] transition-all bg-white/5 border-white/5 cursor-default`}
                >
                  {logoInfo ? (
                    <img src={logoInfo.url} alt={p} className={`${logoInfo.customClass} object-contain`} style={{ filter: logoInfo.filter }} />
                  ) : (
                    <span className="font-black text-xl text-neutral-300 tracking-tight">{p}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <ContentRow title="Top 10 Filmes" items={topMovies} isTop10 type="movie" onItemClick={onItemClick} />
        <ContentRow title="Lançamentos" items={trendingMovies} aspect="portait" type="movie" onItemClick={onItemClick} />
        <ContentRow title="Séries em Alta" items={trendingSeries} aspect="portait" type="tv" onItemClick={onItemClick} />
        <ContentRow title="10 Séries Mais Assistidas" items={topSeries} isTop10 startNumber={1} type="tv" onItemClick={onItemClick} />
      </main>
    </>
  );
}

function DetailsPage({ itemId, mediaType, onBack, onItemClick }: { itemId: number, mediaType: 'movie'|'tv', onBack: () => void, onItemClick: (id: number, type: 'movie'|'tv') => void }) {
  const [item, setItem] = useState<TMDBDetails | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlayer, setShowPlayer] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<'myembed' | 'superflix' | 'embedplay'>('embedplay');

  useEffect(() => {
    setLoading(true);
    getDetails(itemId, mediaType).then(res => {
      setItem(res);
      if (mediaType === 'tv' && res.seasons && res.seasons.length > 0) {
        const firstSeason = res.seasons.find(s => s.season_number > 0) || res.seasons[0];
        setSelectedSeason(firstSeason.season_number);
      }
      setLoading(false);
    });
  }, [itemId, mediaType]);

  useEffect(() => {
    if (mediaType === 'tv' && selectedSeason) {
      getSeasonDetails(itemId, selectedSeason).then(res => {
        setEpisodes(res.episodes || []);
        setSelectedEpisode(1);
      });
    }
  }, [selectedSeason, itemId, mediaType]);

  if (loading || !item) {
    return <div className="flex-1 w-full flex items-center justify-center min-h-screen"><Loader2 className="w-10 h-10 animate-spin text-orange-500" /></div>;
  }

  const title = item.title || item.name;
  const year = (item.release_date || item.first_air_date || '').split('-')[0];
  const duration = mediaType === 'movie' && item.runtime ? `${Math.floor(item.runtime/60)}h ${item.runtime%60}m` : (item.seasons ? `${item.seasons.length} Temporada(s)` : '');
  
  const getEmbedUrl = () => {
    if (selectedPlayer === 'superflix') {
      let u = mediaType === 'movie' 
        ? `https://superflixapi.cyou/filme/${itemId}//`
        : `https://superflixapi.cyou/serie/${itemId}/${selectedSeason}/${selectedEpisode}`;
      return u.replace(/([^:])(\/{2,})/g, "$1/");
    }
    if (selectedPlayer === 'embedplay') {
      return mediaType === 'movie' 
        ? `https://embedplayapi.top/embed/${itemId}`
        : `https://embedplayapi.top/embed/${itemId}/${selectedSeason}/${selectedEpisode}`;
    }
    return mediaType === 'movie' 
      ? `https://myembed.biz/filme/${itemId}` 
      : `https://myembed.biz/serie/${itemId}/${selectedSeason}/${selectedEpisode}`;
  };

  const embedUrl = getEmbedUrl();

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen bg-[#0a0a0a] animate-in fade-in duration-500">
      
      {showPlayer ? (
        <div className="relative w-full h-[60vh] md:h-[80vh] bg-black pt-[15vh]">
          <button onClick={() => setShowPlayer(false)} className="absolute top-[8vh] left-6 z-50 px-4 py-2 bg-neutral-800 text-white rounded-full flex items-center gap-2 hover:bg-neutral-700 shadow-xl border border-white/10">
            <ArrowLeft className="w-4 h-4"/> Voltar
          </button>
          <iframe 
            src={embedUrl} 
            width="100%" 
            height="100%" 
            frameBorder="0" 
            allowFullScreen 
            loading="lazy"
            className="rounded-b-2xl shadow-[0_0_30px_rgba(0,0,0,0.8)]"
          ></iframe>
        </div>
      ) : (
        <div className="relative w-full h-[70vh] md:h-[85vh] 2xl:h-[90vh] group">
          <img src={formatImageUrl(item.backdrop_path, 'original')} alt={title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/70 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent"></div>
          
          <button 
            onClick={onBack}
            className="absolute top-8 left-4 md:top-12 md:left-12 z-50 flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white px-4 py-2 bg-black/50 backdrop-blur-md rounded-full hover:bg-black/70 transition-colors border border-white/10 shadow-lg"
          >
            <ArrowLeft className="w-5 h-5" /> Voltar
          </button>

          <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-end px-4 py-12 md:px-12 md:py-20 z-10 mx-auto max-w-7xl">
            <div className="max-w-4xl">
              <h1 className="text-5xl md:text-7xl lg:text-[5rem] font-black text-white tracking-tighter uppercase drop-shadow-[0_0_20px_rgba(0,0,0,0.8)] leading-[0.9] mb-6">
                {title}
              </h1>

              <div className="flex flex-wrap items-center gap-3 md:gap-5 text-sm md:text-base font-semibold text-neutral-200 mb-8 drop-shadow-md">
                <span className="text-orange-500 font-bold flex items-center"><Star className="w-4 h-4 mr-1 fill-orange-500" /> {item.vote_average?.toFixed(1)}/10</span>
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-600"></span>
                <span>{year}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-600"></span>
                <span>{duration}</span>
              </div>

              <div className="flex items-center gap-4 flex-wrap mb-2">
                <button onClick={() => { setSelectedPlayer('embedplay'); setShowPlayer(true); }} className="flex items-center justify-center gap-3 bg-orange-600 text-white hover:bg-orange-500 font-bold py-3.5 md:py-4 px-8 md:px-10 rounded-full transition-all text-base md:text-lg shadow-xl">
                  <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" /> EmbedPlay
                </button>
                <button onClick={() => { setSelectedPlayer('superflix'); setShowPlayer(true); }} className="flex items-center justify-center gap-3 bg-neutral-800 text-white hover:bg-neutral-700 font-bold py-3.5 md:py-4 px-8 md:px-10 rounded-full transition-all text-base md:text-lg shadow-xl border border-white/10">
                  <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" /> SuperFlix
                </button>
                <button onClick={() => { setSelectedPlayer('myembed'); setShowPlayer(true); }} className="flex items-center justify-center gap-3 bg-neutral-800 text-white hover:bg-neutral-700 font-bold py-3.5 md:py-4 px-8 md:px-10 rounded-full transition-all text-base md:text-lg shadow-xl border border-white/10">
                  <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" /> MyEmbed
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 md:px-12 pb-24 w-full grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-16 relative z-30 pt-12">
        <div className="lg:col-span-2 space-y-12">
          <div className="space-y-6">
             <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-[0.2em] mb-2">Visão Geral</h3>
             <p className="text-lg md:text-xl text-neutral-300 leading-relaxed font-normal">
               {item.overview || "Nenhuma sinopse disponível."}
             </p>
             <div className="pt-4 flex flex-wrap gap-2">
               {item.genres?.map(g => (
                 <span key={g.id} className="px-4 py-1.5 bg-[#171717] border border-neutral-800 rounded-full text-sm font-medium text-neutral-300">
                   {g.name}
                 </span>
               ))}
             </div>
          </div>

          {/* Season and Episodes Selector for TV Shows */}
          {mediaType === 'tv' && item.seasons && (
            <div className="space-y-6 pt-8 border-t border-neutral-800">
               <h3 className="text-2xl font-bold text-white flex items-center gap-3">Temporadas e Episódios</h3>
               
               <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
                 {item.seasons.filter(s => s.season_number > 0).map(s => (
                    <button 
                      key={s.id}
                      onClick={() => setSelectedSeason(s.season_number)}
                      className={`px-5 py-2.5 rounded-full whitespace-nowrap font-semibold transition-all shrink-0 ${selectedSeason === s.season_number ? 'bg-orange-500 text-white shadow-lg' : 'bg-[#171717] text-neutral-400 hover:text-white hover:bg-[#222]'}`}
                    >
                      Temporada {s.season_number}
                    </button>
                 ))}
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                  {episodes.map(ep => (
                    <div 
                      key={ep.id} 
                      onClick={() => { setSelectedEpisode(ep.episode_number); setShowPlayer(true); window.scrollTo({top: 0, behavior: 'smooth'}); }}
                      className={`relative aspect-video rounded-xl overflow-hidden cursor-pointer group border-2 transition-all ${selectedEpisode === ep.episode_number ? 'border-orange-500' : 'border-transparent hover:border-neutral-600'}`}
                    >
                      <img src={formatImageUrl(ep.still_path, 'w500')} alt={ep.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/60 group-hover:bg-black/40 transition-colors"></div>
                      <div className="absolute inset-0 flex flex-col justify-end p-3">
                        <div className="font-bold text-white truncate text-sm">E{ep.episode_number} - {ep.name}</div>
                        <div className="text-xs text-neutral-400">{ep.air_date?.split('-')[0]}</div>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <Play className="w-10 h-10 text-white drop-shadow-md fill-white" />
                      </div>
                      {selectedEpisode === ep.episode_number && (
                        <div className="absolute top-2 right-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded">Selecionado</div>
                      )}
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GlobalCatalogPage({ type, onItemClick }: { type: 'movies' | 'series', onItemClick: (id: number, type: 'movie'|'tv') => void }) {
  const [items, setItems] = useState<TMDBItem[]>([]);
  const mediaType = type === 'movies' ? 'movie' : 'tv';

  useEffect(() => {
    getTrending(mediaType, 'week').then(res => setItems(res.results));
  }, [type, mediaType]);

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen">
      <div className="relative pt-32 pb-8 px-6 md:px-12 bg-[#0a0a0a]">
        <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter drop-shadow-lg leading-none uppercase">
          {type === 'movies' ? 'Filmes' : 'Séries'}
        </h1>
        <p className="text-neutral-400 mt-4 max-w-2xl text-lg">Em Alta na Semana</p>
      </div>

      <main className="flex-1 px-4 md:px-12 py-6 space-y-12 bg-[#0a0a0a]">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {items.map(item => (
            <div key={item.id} onClick={() => onItemClick(item.id, mediaType)} className="relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group cursor-pointer aspect-[2/3] hover:border-orange-500/50 hover:shadow-[0_0_20px_rgba(234,88,12,0.15)] transition-all duration-300">
              <img src={formatImageUrl(item.poster_path)} alt={item.title || item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent"></div>
              <span className="absolute bottom-4 inset-x-0 mx-4 text-center font-bold text-sm md:text-base uppercase text-white drop-shadow-lg">{item.title || item.name}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function GlobalSearchPage({ onItemClick }: { onItemClick: (id: number, type: 'movie'|'tv') => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TMDBItem[]>([]);

  useEffect(() => {
    if (query.trim().length > 2) {
      const timeout = setTimeout(() => {
        searchMulti(query).then(res => setResults(res.results.filter(i => i.media_type === 'movie' || i.media_type === 'tv')));
      }, 500);
      return () => clearTimeout(timeout);
    } else {
      setResults([]);
    }
  }, [query]);

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen pt-32 px-4 md:px-12 bg-[#0a0a0a]">
      <div className="max-w-4xl mx-auto w-full flex flex-col items-center">
        <div className="relative w-full mb-12 group">
          <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
            <Search className="w-6 h-6 text-neutral-500 group-focus-within:text-orange-500" />
          </div>
          <input 
            type="text" 
            placeholder="Buscar filmes, séries..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-[#111111] border border-white/10 rounded-full py-4 pl-16 pr-6 text-lg text-white font-medium focus:outline-none focus:border-orange-500/50"
            autoFocus
          />
        </div>
        <div className="w-full">
          {results.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
              {results.map(item => (
                <div key={item.id} onClick={() => onItemClick(item.id, item.media_type as any)} className="relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group cursor-pointer aspect-[2/3] hover:border-orange-500">
                  <img src={formatImageUrl(item.poster_path)} alt={item.title || item.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 to-transparent"></div>
                  <span className="absolute bottom-4 inset-x-0 mx-4 text-center font-bold text-sm uppercase text-white">{item.title || item.name}</span>
                </div>
              ))}
            </div>
          ) : query.length > 2 ? (
            <p className="text-center text-neutral-500">Nenhum resultado para "{query}"</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UserProfilePage() {
  return <div className="pt-32 px-12"><h1 className="text-3xl text-white">Perfil - Em Breve</h1></div>;
}

function FavoritesPage({ onBack }: { onBack: () => void }) {
  return <div className="pt-32 px-12"><button onClick={onBack} className="text-white">Voltar</button><h1 className="text-3xl text-white">Favoritos - Em Breve</h1></div>;
}

function ContentRow({ title, items, isTop10 = false, aspect = "landscape", startNumber = 1, type, onItemClick }: { title: string, items: TMDBItem[], isTop10?: boolean, aspect?: "landscape" | "portait", startNumber?: number, type: 'movie'|'tv', onItemClick: (id: number, type: 'movie'|'tv') => void }) {
  return (
    <section>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-6 pl-2 border-l-4 border-orange-500">{title}</h2>
      <div className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory pb-6 pl-2 pr-4 scrollbar-hide">
        {items.map((item, idx) => (
          <div key={item.id} onClick={() => onItemClick(item.id, type)} className="snap-start shrink-0 relative group cursor-pointer transition-transform duration-300 hover:scale-105">
            {isTop10 ? (
              <div className="flex relative w-[280px] md:w-[320px] h-[160px] md:h-[180px]">
                <span className="absolute -left-6 bottom-[-25px] text-[150px] leading-none font-black text-neutral-800 -z-10 tracking-tighter">{idx + startNumber}</span>
                <div className="relative w-[85%] ml-auto h-full rounded-xl overflow-hidden shadow-lg border border-neutral-800 group-hover:border-orange-500/50">
                   <img src={formatImageUrl(item.backdrop_path)} alt={item.title || item.name} className="w-full h-full object-cover" loading="lazy" />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                   <span className="absolute bottom-3 left-3 font-bold text-lg md:text-xl text-white uppercase text-shadow">{item.title || item.name}</span>
                </div>
              </div>
            ) : (
              <div className={`relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group-hover:border-orange-500/50 ${aspect === 'landscape' ? 'w-[240px] md:w-[300px] h-[135px] md:h-[170px]' : 'w-[160px] md:w-[200px] h-[240px] md:h-[300px]'}`}>
                <img src={formatImageUrl(aspect === 'landscape' ? item.backdrop_path : item.poster_path)} alt={item.title || item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
                <span className={`absolute ${aspect === 'landscape' ? 'bottom-3 left-3' : 'bottom-4 inset-x-0 mx-4 text-center font-black'} uppercase text-white drop-shadow-lg`}>{item.title || item.name}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function NavItem({ icon, label, isActive = false, onClick }: { icon: React.ReactNode, label: string, isActive?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center w-14 h-14 rounded-[1.5rem] transition-all duration-500 overflow-hidden ${isActive ? 'text-orange-500' : 'text-neutral-500 hover:text-neutral-200 hover:bg-white/5'}`}
    >
      {isActive && <div className="absolute inset-0 bg-orange-500/10 rounded-[1.5rem]"></div>}
      <div className={`relative w-[22px] h-[22px] transition-all duration-300 [&>svg]:w-full [&>svg]:h-full ${isActive ? 'translate-y-[-8px] drop-shadow-[0_0_8px_rgba(234,88,12,0.8)] scale-110' : ''}`}>
        {icon}
      </div>
      <span className={`absolute bottom-2 text-[10px] font-bold tracking-wide transition-all duration-300 ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {label}
      </span>
    </button>
  );
}
function FilterChip({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) { return ( <button onClick={onClick} className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold transition-all shrink-0 border ${active ? 'bg-orange-500 text-white border-orange-500' : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10'}`}> {label} </button> ); }