import { useState } from "react";
import {
  Play,
  Bookmark,
  Home,
  Film,
  Tv,
  List as ListIcon,
  Search,
  Star,
  StarHalf,
  ArrowLeft,
  ChevronRight,
  ThumbsUp,
  MessageSquare,
  Send,
  Check,
  Info
} from "lucide-react";
import { featured, providers, top10, releases, newest, mostWatched, continueWatching, providerCatalogs, CatalogItem } from "./data";

export default function App() {
  const [viewState, setViewState] = useState<{ 
    type: 'home' | 'movies' | 'series' | 'provider' | 'search' | 'profile' | 'favorites' | 'details', 
    id?: string,
    previous?: any
  }>({ type: 'home' });

  const navigateToDetails = (id: number) => {
    setViewState(prev => ({ type: 'details', id: id.toString(), previous: prev }));
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


      {/* MOBILE BRANDING ON TOP */}
      <div className="md:hidden absolute top-4 left-0 w-full flex justify-center z-50 pointer-events-none">
        <div className="font-black text-2xl tracking-tighter flex items-center drop-shadow-md">
          <span className="text-white">PLAY</span>
          <span className="text-orange-500 ml-1">INFINITY</span>
        </div>
      </div>

      {viewState.type === 'details' && viewState.id ? (
        <DetailsPage 
          itemId={Number(viewState.id)} 
          onBack={() => setViewState(viewState.previous || { type: 'home' })} 
          onItemClick={navigateToDetails}
        />
      ) : viewState.type === 'provider' && viewState.id ? (
        <ProviderPage provider={viewState.id} onBack={() => setViewState({ type: 'home' })} onItemClick={navigateToDetails} />
      ) : viewState.type === 'movies' || viewState.type === 'series' ? (
        <GlobalCatalogPage type={viewState.type} onItemClick={navigateToDetails} />
      ) : viewState.type === 'search' ? (
        <GlobalSearchPage onItemClick={navigateToDetails} />
      ) : viewState.type === 'profile' ? (
        <UserProfilePage onNavigate={(type) => setViewState({ type: type as any })} />
      ) : viewState.type === 'favorites' ? (
        <FavoritesPage onBack={() => setViewState({ type: 'profile' })} onItemClick={navigateToDetails} />
      ) : (
        <HomePage onProviderSelect={(p) => setViewState({ type: 'provider', id: p })} onItemClick={navigateToDetails} />
      )}

      {/* Footer Area */}
      <footer className="pt-16 pb-24 md:pb-10 flex flex-col items-center text-center opacity-80 border-t border-neutral-900 mt-12 bg-[#0a0a0a] relative z-20">
        <div className="font-black text-4xl tracking-tighter flex items-center mb-6">
          <span className="text-neutral-500">PLAY</span>
          <span className="text-orange-500 ml-2">INFINITY</span>
        </div>
        
        <p className="text-neutral-500 text-sm max-w-md mx-auto mb-8 px-4">
          Filmes, séries e animes online grátis — atualizados todos os dias, em dublado e legendado.
        </p>

        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {["Início", "Filmes", "Séries", "Listas", "Buscar"].map(btn => (
             <button key={btn} className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 px-5 py-2.5 rounded-full text-sm font-medium transition-colors border border-neutral-800">
               {btn}
             </button>
          ))}
        </div>

        <p className="text-neutral-600 text-xs px-6 max-w-2xl mx-auto leading-relaxed">
          <span className="text-orange-500 font-bold uppercase block mb-2">Aviso Legal</span>
          Este é um aplicativo fictício criado apenas para fins de design e interface do usuário responsiva, focado na experiência de plataformas de streaming com a cor laranja predominante e o modo escuro.
        </p>
      </footer>

      {/* MOBILE BOTTOM NAVIGATION (FLOATING DOCK) */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-50 pointer-events-none">
        <nav className="bg-[#111111]/80 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-2 flex justify-between items-center shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] pointer-events-auto">
          <div className="flex justify-around items-center flex-1">
            <NavItem onClick={() => setViewState({ type: 'home' })} icon={<Home />} label="Início" isActive={viewState.type === 'home' || viewState.type === 'provider'} />
            <NavItem onClick={() => setViewState({ type: 'movies' })} icon={<Film />} label="Filmes" isActive={viewState.type === 'movies'} />
            <NavItem onClick={() => setViewState({ type: 'series' })} icon={<Tv />} label="Séries" isActive={viewState.type === 'series'} />
            <NavItem onClick={() => setViewState({ type: 'search' })} icon={<Search />} label="Buscar" isActive={viewState.type === 'search'} />
          </div>
          <div 
            onClick={() => setViewState({ type: 'profile' })}
            className={`mx-2 w-10 h-10 rounded-full bg-gradient-to-tr from-orange-600 to-orange-400 border-[2px] flex items-center justify-center font-bold text-xs shadow-lg shrink-0 pointer-events-auto cursor-pointer transition-all ${viewState.type === 'profile' ? 'border-orange-500 shadow-[0_0_20px_rgba(234,88,12,0.8)] scale-110' : 'border-black'}`}
          >
            N
          </div>
        </nav>
      </div>

      {/* CSS Utility for hiding scrollbar while keeping functionality */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none; /* IE and Edge */
            scrollbar-width: none; /* Firefox */
        }
      `}</style>
    </div>
  );
}

/* Subcomponents */

function HomePage({ onProviderSelect, onItemClick }: { onProviderSelect: (p: string) => void, onItemClick: (id: number) => void }) {
  return (
    <>
      {/* FEATURED / HERO SECTION */}
      <section className="relative w-full h-[75vh] md:h-[85vh] flex-shrink-0">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${featured.imageUrl})` }}
        ></div>
        {/* Gradients to blend with background */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent md:via-[#0a0a0a]/50"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-transparent to-transparent hidden md:block"></div>

        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-end items-center md:items-start text-center md:text-left px-6 py-12 md:px-20 md:py-32 z-10">
          
          {/* Logo / Title area for Hero */}
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-4 text-shadow-lg leading-none" style={{ textShadow: "0 4px 20px rgba(0,0,0,0.8)" }}>
            {featured.logoText.split('\n').map((line, i) => (
              <span key={i} className="block">{line}</span>
            ))}
          </h1>

          {/* Meta details */}
          <div className="flex items-center gap-3 text-sm md:text-base font-medium text-neutral-300 mb-4">
            <span>{featured.year}</span>
            <span className="w-1 h-1 rounded-full bg-neutral-600"></span>
            <div className="flex items-center gap-[2px]">
              <Tv className="w-4 h-4 mr-1 opacity-70" />
              <span>{featured.duration}</span>
            </div>
            <span className="w-1 h-1 rounded-full bg-neutral-600"></span>
            <div className="flex text-orange-500">
              <Star className="w-4 h-4 fill-orange-500" />
              <Star className="w-4 h-4 fill-orange-500" />
              <Star className="w-4 h-4 fill-orange-500" />
              <Star className="w-4 h-4 fill-orange-500" />
              <StarHalf className="w-4 h-4 fill-orange-500" />
            </div>
          </div>

          {/* Genres */}
          <div className="flex items-center gap-3 mb-6">
            {featured.genres.map((g) => (
              <span key={g} className="px-3 py-1 bg-white/10 backdrop-blur-md border border-white/10 rounded-md text-xs font-semibold text-neutral-200">
                {g}
              </span>
            ))}
          </div>

          {/* Description */}
          <p className="text-sm md:text-lg text-neutral-400 max-w-[90%] md:max-w-2xl leading-relaxed mb-8 line-clamp-3 md:line-clamp-none">
            {featured.description}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-4 w-full md:w-auto justify-center md:justify-start">
            <button className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 md:py-4 px-6 md:px-8 rounded-xl transition-all shadow-[0_0_20px_rgba(234,88,12,0.4)] hover:shadow-[0_0_30px_rgba(234,88,12,0.6)]">
              <Play className="w-5 h-5 fill-current" />
              Assistir Série
            </button>
            <button className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-neutral-800/80 hover:bg-neutral-700 backdrop-blur-md text-white font-semibold py-3 md:py-4 px-6 md:px-8 rounded-xl transition-all border border-neutral-700">
              <Bookmark className="w-5 h-5" />
              Listar
            </button>
          </div>

          {/* Pagination dots (decorative) */}
          <div className="flex items-center gap-2 mt-12 md:mt-16">
            <span className="w-3 h-3 rounded-full bg-white"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-700"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-700"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-700"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-700"></span>
          </div>
        </div>
      </section>

      {/* STRIPES / CONTENT ZONES */}
      <main className="flex-1 w-full bg-[#0a0a0a] pb-12 z-20 relative px-4 md:px-12 space-y-12">
        {/* Providers */}
        <section>
          <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pt-2 pb-4 scrollbar-hide">
            {providers.map((p) => {
              const logos: Record<string, { url: string, filter?: string, customClass?: string }> = {
                "NETFLIX": { url: "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg", customClass: "h-6 md:h-8" },
                "Disney+": { 
                  url: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg",
                  filter: "brightness(0) invert(1) opacity(0.9)",
                  customClass: "h-12 md:h-16"
                },
                "Max": { 
                  url: "https://upload.wikimedia.org/wikipedia/commons/c/ce/Max_logo.svg",
                  filter: "brightness(0) invert(1) opacity(0.9)",
                  customClass: "h-5 md:h-7"
                },
                "Prime Video": { 
                  url: "https://upload.wikimedia.org/wikipedia/commons/1/11/Amazon_Prime_Video_logo.svg",
                  filter: "brightness(0) invert(1) opacity(0.9)",
                  customClass: "h-6 md:h-8"
                },
                "Apple TV+": { 
                  url: "https://upload.wikimedia.org/wikipedia/commons/2/28/Apple_TV_Plus_Logo.svg",
                  filter: "brightness(0) invert(1) opacity(0.9)",
                  customClass: "h-6 md:h-8"
                },
              };

              const logoInfo = logos[p];

              return (
                <button
                  key={p}
                  onClick={() => onProviderSelect(p)}
                  className={`group snap-start shrink-0 h-20 md:h-28 px-8 md:px-12 backdrop-blur-md border rounded-2xl flex items-center justify-center min-w-[150px] md:min-w-[200px] transition-all bg-white/5 hover:bg-white/10 border-white/5 hover:border-orange-500/30`}
                >
                  {logoInfo ? (
                    <img 
                      src={logoInfo.url} 
                      alt={p} 
                      className={`${logoInfo.customClass || "h-6 md:h-9"} object-contain transition-transform duration-300 group-hover:scale-110`}
                      style={{ filter: logoInfo.filter }} 
                    />
                  ) : (
                    <span className="font-black text-xl text-neutral-300 tracking-tight">{p}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Continue Assistindo */}
        <section>
          <h2 className="text-xl md:text-2xl font-bold text-white mb-6 pl-2 border-l-4 border-orange-500">Continue Assistindo</h2>
          <div className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory pb-6 pl-2 pr-4 scrollbar-hide">
            {continueWatching.map((item) => (
              <div key={item.id} onClick={() => onItemClick(item.id)} className="snap-start shrink-0 relative group cursor-pointer w-[280px] md:w-[320px]">
                <div className="relative h-[160px] md:h-[180px] rounded-xl overflow-hidden shadow-lg border border-neutral-800 group-hover:border-orange-500/50 transition-colors">
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
                  
                  {/* Play Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                    <div className="w-12 h-12 bg-orange-600/90 rounded-full flex items-center justify-center backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all shadow-[0_0_15px_rgba(234,88,12,0.5)]">
                      <Play className="w-5 h-5 fill-white text-white ml-1" />
                    </div>
                  </div>

                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="flex justify-between items-end mb-2">
                      <div>
                        <h3 className="font-bold text-white text-base md:text-lg drop-shadow-md">{item.title}</h3>
                        <p className="text-neutral-300 text-xs mt-0.5 drop-shadow-md">{item.episode}</p>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500" 
                        style={{ width: `${item.progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Top 10 Hoje */}
        <ContentRow title="Top 10 Hoje" items={top10} isTop10 onItemClick={onItemClick} />

        {/* Lançamentos */}
        <ContentRow title="Lançamentos" items={releases} aspect="portait" onItemClick={onItemClick} />

        {/* Novidades */}
        <ContentRow title="Novidades" items={newest} aspect="portait" onItemClick={onItemClick} />

        {/* 10 Mais Assistidos */}
        <ContentRow title="10 Mais Assistidos" items={mostWatched} isTop10 startNumber={1} onItemClick={onItemClick} />
      </main>
    </>
  );
}

function DetailsPage({ itemId, onBack, onItemClick }: { itemId: number, onBack: () => void, onItemClick: (id: number) => void }) {
  // Find item
  const allCatalogs = Object.values(providerCatalogs).flat();
  const item = allCatalogs.find(i => i.id === itemId) || allCatalogs[0]; // fallback
  
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<{ id: number, user: string, text: string, likes: number }[]>([
    { id: 1, user: "Alex99", text: "Incrível! Não conseguia parar de assistir, reviravolta maravilhosa.", likes: 24 },
    { id: 2, user: "CinefiloBr", text: "A fotografia é perfeita, mas achei o final um pouco previsível.", likes: 12 }
  ]);
  const [isFavorite, setIsFavorite] = useState(false);

  // Fallback metadata if not defined
  const synopsis = item.synopsis || "Uma jornada inesquecível de descobertas e aventuras que desafiarão os limites da imaginação. Com personagens cativantes e uma trama cheia de emoção, prepare-se para ser surpreendido do início ao fim.";
  const year = item.year || 2024;
  const rating = item.rating || "14";
  const duration = item.duration || (item.type === 'movie' ? "1h 55m" : "1 Temporada");
  const match = item.match || 92;

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setComments([{ id: Date.now(), user: "Você", text: commentText, likes: 0 }, ...comments]);
    setCommentText("");
  };

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen bg-[#0a0a0a] animate-in fade-in duration-500">
      
      {/* Hero Cover */}
      <div className="relative w-full h-[70vh] md:h-[85vh] 2xl:h-[90vh] group">
        <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/30 to-transparent"></div>
        
        {/* Back Button */}
        <button 
          onClick={onBack}
          className="absolute top-8 left-4 md:top-12 md:left-12 z-50 flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white px-4 py-2 bg-black/30 backdrop-blur-md rounded-full hover:bg-black/50 transition-colors border border-white/10 shadow-lg"
        >
          <ArrowLeft className="w-5 h-5" />
          Voltar
        </button>

        {/* Content Wrapper */}
        <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-end px-4 py-12 md:px-12 md:py-20 z-10 mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <h1 className="text-5xl md:text-7xl lg:text-[6rem] font-black text-white tracking-tighter uppercase drop-shadow-[0_0_20px_rgba(0,0,0,0.8)] leading-[0.9] mb-6">
              {item.title}
            </h1>

            <div className="flex flex-wrap items-center gap-3 md:gap-5 text-sm md:text-base font-semibold text-neutral-200 mb-8 drop-shadow-md">
              <span className="text-orange-500 font-bold">{match}% Relevante</span>
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600"></span>
              <span>{year}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600"></span>
              <span className="px-2 py-0.5 border border-neutral-600 rounded text-xs text-neutral-300">{rating}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600"></span>
              <span>{duration}</span>
            </div>

            <div className="flex items-center gap-4 flex-wrap mb-2 w-full md:w-auto">
              {/* Feature Action Buttons */}
              <button 
                className="flex items-center justify-center gap-3 bg-white text-black hover:bg-neutral-200 font-bold py-3.5 md:py-4 px-8 md:px-10 rounded-full transition-all text-base md:text-lg shadow-xl"
              >
                <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" />
                Assistir
              </button>

              <button className="w-12 h-12 md:w-14 md:h-14 shrink-0 flex items-center justify-center rounded-full bg-neutral-900/60 hover:bg-neutral-800 backdrop-blur-md text-white transition-all border border-white/10 group/trailer" title="Ver Trailer">
                <Film className="w-5 h-5 md:w-6 md:h-6 group-hover/trailer:text-white text-neutral-400 transition-colors" />
              </button>

              <button 
                onClick={() => setIsFavorite(!isFavorite)}
                className={`w-12 h-12 md:w-14 md:h-14 shrink-0 flex items-center justify-center rounded-full transition-all border backdrop-blur-md ${isFavorite ? 'bg-orange-600/20 border-orange-500/50 text-orange-500 shadow-[0_0_15px_rgba(234,88,12,0.3)]' : 'bg-neutral-900/60 hover:bg-neutral-800 border-white/10 text-neutral-400 hover:text-white'}`}
                title="Adicionar aos Favoritos"
              >
                {isFavorite ? <Check className="w-5 h-5 md:w-6 md:h-6 stroke-[3]" /> : <Bookmark className="w-5 h-5 md:w-6 md:h-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-12 pb-24 w-full grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-16 relative z-30 pt-12 md:pt-16">
        
        {/* Left Column (Details) */}
        <div className="lg:col-span-2 space-y-12">
          <div className="space-y-6">
             <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-[0.2em] mb-2">Visão Geral</h3>
             <p className="text-xl md:text-2xl text-neutral-200 leading-relaxed font-normal">
               {synopsis}
             </p>
             
             <div className="pt-8 flex flex-wrap gap-2">
               {item.genres.map(g => (
                 <span key={g} className="px-4 py-1.5 bg-[#171717] border border-neutral-800 rounded-full text-sm font-medium text-neutral-300">
                   {g}
                 </span>
               ))}
             </div>
          </div>

          {/* Comments Section */}
          <div className="space-y-8 pt-8 border-t border-neutral-800/50">
            <h3 className="text-2xl font-bold text-white flex items-center gap-3">
              Comentários <span className="text-neutral-500 font-medium text-lg">({comments.length})</span>
            </h3>
            
            <form onSubmit={handleCommentSubmit} className="flex gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-orange-600 to-orange-400 flex items-center justify-center font-bold text-lg shadow-lg shrink-0 text-white">
                V
              </div>
              <div className="flex-1 relative">
                <textarea 
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Inicie uma discussão ou deixe sua opinião..."
                  className="w-full bg-transparent border-b border-neutral-700 pb-12 pt-3 text-white text-lg font-medium focus:outline-none focus:border-white transition-all placeholder:text-neutral-600 resize-none h-24"
                ></textarea>
                <div className="absolute bottom-3 right-0 flex justify-end">
                  <button type="submit" className={`p-2.5 rounded-full transition-all ${commentText.trim() ? 'bg-white text-black' : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'}`}>
                    <Send className="w-4 h-4 ml-0.5" />
                  </button>
                </div>
              </div>
            </form>

            <div className="space-y-8 pt-4">
              {comments.map(c => (
                <div key={c.id} className="flex gap-5 group">
                  <div className="w-12 h-12 rounded-full bg-[#171717] flex items-center justify-center font-bold text-neutral-400 shrink-0 text-lg border border-neutral-800">
                    {c.user.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-bold text-white text-lg">{c.user}</span>
                      <span className="text-sm text-neutral-500">há pouco</span>
                    </div>
                    <p className="text-neutral-300 text-lg font-normal mb-4 leading-relaxed">{c.text}</p>
                    <div className="flex items-center gap-6 text-neutral-500">
                      <button className="flex items-center gap-2 hover:text-white transition-colors text-sm font-medium">
                        <ThumbsUp className="w-4 h-4" /> {c.likes > 0 && c.likes}
                      </button>
                      <button className="font-medium text-sm hover:text-white transition-colors">
                        Responder
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (Similar/More info) */}
        <div className="space-y-6">
          <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-[0.2em] mb-4">Títulos Semelhantes</h3>
          <div className="grid grid-cols-2 gap-4">
             {allCatalogs.filter(i => i.id !== item.id && i.genres.some(g => item.genres.includes(g))).slice(0, 4).map(sim => (
               <div key={sim.id} onClick={() => onItemClick(sim.id)} className="relative rounded-lg overflow-hidden border border-neutral-800/50 group cursor-pointer aspect-[2/3] hover:border-white/20 transition-all duration-300">
                  <img src={sim.imageUrl} alt={sim.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <span className="absolute bottom-4 inset-x-0 mx-3 text-center font-bold text-xs uppercase text-white drop-shadow-md">
                    {sim.title}
                  </span>
               </div>
             ))}
          </div>
        </div>
        
      </div>
    </div>
  );
}

function GlobalSearchPage({ onItemClick }: { onItemClick: (id: number) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const allCatalogs = Object.values(providerCatalogs).flat();

  const searchResults = searchQuery.trim() === '' 
    ? [] 
    : allCatalogs.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen pt-32 px-4 md:px-12 bg-[#0a0a0a]">
      <div className="max-w-4xl mx-auto w-full flex flex-col items-center">
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-8 uppercase">Busca</h1>
        
        <div className="relative w-full mb-12 group">
          <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
            <Search className="w-6 h-6 text-neutral-500 group-focus-within:text-orange-500 transition-colors" />
          </div>
          <input 
            type="text" 
            placeholder="Buscar filmes, séries..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111111] border border-white/10 rounded-full py-4 pl-16 pr-6 text-lg text-white font-medium focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 shadow-inner transition-all placeholder:text-neutral-600"
            autoFocus
          />
        </div>

        <div className="w-full">
          {searchQuery.trim() === '' ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
              <Search className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg">Digite algo para começar a buscar</p>
            </div>
          ) : searchResults.length > 0 ? (
            <div>
              <h2 className="text-xl font-bold mb-6 text-white border-l-4 border-orange-500 pl-3">Resultados para "{searchQuery}"</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                {searchResults.map(item => (
                  <div key={item.id} onClick={() => onItemClick(item.id)} className="relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group cursor-pointer aspect-[2/3] hover:border-orange-500/50 hover:shadow-[0_0_20px_rgba(234,88,12,0.15)] transition-all duration-300">
                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent"></div>
                    
                    {/* Play Overlay */}
                    <div className="absolute inset-x-0 bottom-0 top-0 m-auto h-12 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 bg-orange-600/90 rounded-full flex items-center justify-center backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all shadow-[0_0_15px_rgba(234,88,12,0.5)]">
                        <Play className="w-5 h-5 fill-white text-white ml-1" />
                      </div>
                    </div>

                    <span className="absolute bottom-4 inset-x-0 mx-4 text-center font-bold text-sm md:text-base uppercase text-white drop-shadow-lg">
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
              <p className="text-lg mb-2">Nenhum resultado encontrado para "{searchQuery}"</p>
              <p className="text-sm">Tente palavras-chave diferentes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UserProfilePage({ onNavigate }: { onNavigate: (type: string) => void }) {
  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen pt-32 px-4 md:px-12 bg-[#0a0a0a]">
      <div className="max-w-3xl mx-auto w-full">
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-12 uppercase text-center">Perfil</h1>
        
        <div className="bg-[#111111] border border-white/5 rounded-3xl p-8 mb-8 flex flex-col md:flex-row items-center md:items-start gap-8 shadow-xl">
          <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-orange-600 to-orange-400 border-[4px] border-[#0a0a0a] flex items-center justify-center font-black text-5xl shadow-[0_0_30px_rgba(234,88,12,0.6)] shrink-0">
            N
          </div>
          
          <div className="flex flex-col items-center md:items-start flex-1 text-center md:text-left">
            <h2 className="text-3xl font-bold text-white mb-2">Naylan Moreira</h2>
            <p className="text-neutral-400 mb-6 font-medium">Assinante Premium</p>
            
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 w-full">
               <button className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full font-semibold transition-colors text-sm border border-white/10">
                 Editar Perfil
               </button>
               <button className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-full font-semibold transition-colors text-sm shadow-[0_0_15px_rgba(234,88,12,0.4)]">
                 Atualizar Plano
               </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-bold text-white mb-4 pl-3 border-l-4 border-orange-500">Configurações</h3>
          
          {[
            { label: 'Favoritos', onClick: () => onNavigate('favorites') },
            { label: 'Histórico de Visualização' },
            { label: 'Configurações do Aplicativo' },
            { label: 'Ajuda e Suporte' }
          ].map((item, i) => (
            <div key={i} onClick={item.onClick} className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl p-5 flex items-center justify-between cursor-pointer transition-colors group">
              <span className="font-semibold text-neutral-200 group-hover:text-white transition-colors">{item.label}</span>
              <ChevronRight className="w-5 h-5 text-neutral-500 group-hover:text-orange-500 transition-colors" />
            </div>
          ))}

          <button className="w-full mt-8 py-5 text-center font-bold text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-colors border border-transparent hover:border-red-500/20">
            Encerrar Sessão
          </button>
        </div>
      </div>
    </div>
  );
}

function FavoritesPage({ onBack, onItemClick }: { onBack: () => void, onItemClick: (id: number) => void }) {
  // Mock favorites picking a few items from data
  const allCatalogs = Object.values(providerCatalogs).flat();
  const favoriteItems = allCatalogs.filter(item => [101, 201, 301, 401, 501].includes(item.id));

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen pt-32 px-4 md:px-12 bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto w-full">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-neutral-400 hover:text-white px-4 py-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors w-fit mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Perfil
        </button>

        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-12 uppercase">Favoritos</h1>

        {favoriteItems.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
            {favoriteItems.map(item => (
              <div key={item.id} onClick={() => onItemClick(item.id)} className="relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group cursor-pointer aspect-[2/3] hover:border-orange-500/50 hover:shadow-[0_0_20px_rgba(234,88,12,0.15)] transition-all duration-300">
                <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent"></div>
                
                <div className="absolute top-3 right-3 z-10 text-orange-500 opacity-100 transition-all dropdown-shadow drop-shadow-md">
                   <Bookmark className="w-5 h-5 fill-current" />
                </div>

                {/* Play Overlay */}
                <div className="absolute inset-x-0 bottom-0 top-0 m-auto h-12 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 bg-orange-600/90 rounded-full flex items-center justify-center backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all shadow-[0_0_15px_rgba(234,88,12,0.5)]">
                    <Play className="w-5 h-5 fill-white text-white ml-1" />
                  </div>
                </div>

                <span className="absolute bottom-4 inset-x-0 mx-4 text-center font-bold text-sm md:text-base uppercase text-white drop-shadow-lg">
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
            <Bookmark className="w-16 h-16 mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-neutral-400">Nenhum favorito salvo</h3>
            <p className="mt-2">Filmes e séries favoritados aparecerão aqui.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function GlobalCatalogPage({ type, onItemClick }: { type: 'movies' | 'series', onItemClick: (id: number) => void }) {
  // Combine all items from all providers
  const allCatalogs = Object.values(providerCatalogs).flat();
  const typeFilter = type === 'movies' ? 'movie' : 'series';
  
  // Get items matching the type
  const typeCatalogs = allCatalogs.filter(item => item.type === typeFilter);

  const [filterGenre, setFilterGenre] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  
  // get all unique genres for this type globally
  const availableGenres = Array.from(new Set(typeCatalogs.flatMap(item => item.genres || []))).sort();

  const yearRanges = [
    { label: "Todos os Anos", value: "all" },
    { label: "2020 - 2024", min: 2020, max: 2024 },
    { label: "2010 - 2019", min: 2010, max: 2019 },
    { label: "2000 - 2009", min: 2000, max: 2009 },
    { label: "Antes de 2000", min: 0, max: 1999 }
  ];

  const filteredCatalogs = typeCatalogs.filter(item => {
    if (filterGenre !== 'all' && (!item.genres || !item.genres.includes(filterGenre))) return false;
    
    if (filterYear !== 'all') {
      const range = yearRanges.find(r => r.label === filterYear);
      if (range && range.min !== undefined && range.max !== undefined) {
        const itemYear = item.year || 0;
        if (itemYear < range.min || itemYear > range.max) return false;
      }
    }
    return true;
  });

  const pageTitle = type === 'movies' ? 'Filmes' : 'Séries';
  const pageDescription = type === 'movies' 
    ? 'Descubra os melhores filmes disponíveis em todas as plataformas.' 
    : 'Acompanhe as suas séries favoritas e encontre novas histórias.';

  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen">
      {/* Global Hero Header */}
      <div className="relative pt-32 pb-8 px-6 md:px-12 bg-[#0a0a0a]">
        <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter drop-shadow-lg leading-none uppercase">
          {pageTitle}
        </h1>
        <p className="text-neutral-400 mt-4 max-w-2xl text-lg">
          {pageDescription}
        </p>
      </div>

      <main className="flex-1 px-4 md:px-12 py-6 space-y-12 bg-[#0a0a0a] animate-in fade-in duration-500">
        {/* FILTERS */}
        {typeCatalogs.length > 0 && availableGenres.length > 0 && (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
              <FilterChip label="Todos Gêneros" active={filterGenre === 'all'} onClick={() => setFilterGenre('all')} />
              {availableGenres.map(genre => (
                <FilterChip key={genre} label={genre} active={filterGenre === genre} onClick={() => setFilterGenre(genre)} />
              ))}
            </div>
            
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
              {yearRanges.map(range => (
                <FilterChip 
                  key={range.label} 
                  label={range.label} 
                  active={filterYear === range.label || (filterYear === 'all' && range.value === 'all')} 
                  onClick={() => setFilterYear(range.value === 'all' ? 'all' : range.label)} 
                />
              ))}
            </div>
          </div>
        )}

        {filteredCatalogs.length > 0 ? (
          <section>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
              {filteredCatalogs.map(item => (
                <div key={item.id} onClick={() => onItemClick(item.id)} className="relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group cursor-pointer aspect-[2/3] hover:border-orange-500/50 hover:shadow-[0_0_20px_rgba(234,88,12,0.15)] transition-all duration-300">
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent"></div>
                  
                  {/* Play Overlay */}
                  <div className="absolute inset-x-0 bottom-0 top-0 m-auto h-12 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 bg-orange-600/90 rounded-full flex items-center justify-center backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all shadow-[0_0_15px_rgba(234,88,12,0.5)]">
                      <Play className="w-5 h-5 fill-white text-white ml-1" />
                    </div>
                  </div>

                  <span className="absolute bottom-4 inset-x-0 mx-4 text-center font-bold text-sm md:text-base uppercase text-white drop-shadow-lg">
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : typeCatalogs.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
             <h3 className="text-xl font-bold text-neutral-400">Nenhum título encontrado</h3>
             <p>Ajuste os filtros selecionados para ver mais resultados.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
            <Film className="w-16 h-16 mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-neutral-400">Catálogo Vazio</h3>
            <p>Nenhum conteúdo encontrado no momento.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function ProviderPage({ provider, onBack, onItemClick }: { provider: string, onBack: () => void, onItemClick: (id: number) => void }) {
  const catalogs = providerCatalogs[provider] || [];
  
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'series'>('all');
  const [filterGenre, setFilterGenre] = useState<string>('all');

  // get all unique genres for this provider
  const availableGenres = Array.from(new Set(catalogs.flatMap(item => item.genres || []))).sort();

  const filteredCatalogs = catalogs.filter(item => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (filterGenre !== 'all' && (!item.genres || !item.genres.includes(filterGenre))) return false;
    return true;
  });
  
  return (
    <div className="flex-1 w-full flex flex-col z-20 relative min-h-screen">
      {/* Provider Hero Header */}
      <div className="relative pt-32 pb-12 px-6 md:px-12 bg-gradient-to-b from-orange-500/10 to-[#0a0a0a] border-b border-orange-500/10">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-neutral-400 hover:text-white px-4 py-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors w-fit mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Início
        </button>
        
        <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter drop-shadow-lg leading-none uppercase">
          {provider}
        </h1>
        <p className="text-neutral-400 mt-4 max-w-2xl text-lg">
          Explore o catálogo completo de séries exclusivas, filmes e muito mais disponíveis no {provider}.
        </p>
      </div>

      <main className="flex-1 px-4 md:px-12 py-12 space-y-12 bg-[#0a0a0a] animate-in fade-in duration-500">
        {/* FILTERS */}
        {catalogs.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
              <FilterChip label="Tudo" active={filterType === 'all'} onClick={() => setFilterType('all')} />
              <FilterChip label="Filmes" active={filterType === 'movie'} onClick={() => setFilterType('movie')} />
              <FilterChip label="Séries" active={filterType === 'series'} onClick={() => setFilterType('series')} />
            </div>
            
            {availableGenres.length > 0 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                <FilterChip label="Todos Gêneros" active={filterGenre === 'all'} onClick={() => setFilterGenre('all')} />
                {availableGenres.map(genre => (
                  <FilterChip key={genre} label={genre} active={filterGenre === genre} onClick={() => setFilterGenre(genre)} />
                ))}
              </div>
            )}
          </div>
        )}

        {filteredCatalogs.length > 0 ? (
          <section>
            <div className="flex items-center gap-2 mb-8 pl-2">
              <h2 className="text-2xl md:text-3xl font-bold text-white uppercase tracking-tight">Destaques</h2>
              <ChevronRight className="w-6 h-6 text-orange-500" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
              {filteredCatalogs.map(item => (
                <div key={item.id} onClick={() => onItemClick(item.id)} className="relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group cursor-pointer aspect-[2/3] hover:border-orange-500/50 hover:shadow-[0_0_20px_rgba(234,88,12,0.15)] transition-all duration-300">
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent"></div>
                  
                  {/* Play Overlay */}
                  <div className="absolute inset-x-0 bottom-0 top-0 m-auto h-12 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 bg-orange-600/90 rounded-full flex items-center justify-center backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all shadow-[0_0_15px_rgba(234,88,12,0.5)]">
                      <Play className="w-5 h-5 fill-white text-white ml-1" />
                    </div>
                  </div>

                  <span className="absolute bottom-4 inset-x-0 mx-4 text-center font-bold text-sm md:text-base uppercase text-white drop-shadow-lg">
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : catalogs.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
             <h3 className="text-xl font-bold text-neutral-400">Nenhum título encontrado</h3>
             <p>Ajuste os filtros selecionados para ver mais resultados.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
            <Film className="w-16 h-16 mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-neutral-400">Catálogo Vazio</h3>
            <p>Nenhum conteúdo encontrado para este provedor no momento.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold transition-all shrink-0 border 
        ${active 
          ? 'bg-orange-500 text-white border-orange-500 shadow-[0_0_15px_rgba(234,88,12,0.4)]' 
          : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10 hover:border-white/20'}`}
    >
      {label}
    </button>
  );
}

function ContentRow({ 
  title, 
  items, 
  isTop10 = false, 
  aspect = "landscape",
  startNumber = 1,
  onItemClick
}: { 
  title: string, 
  items: any[], 
  isTop10?: boolean, 
  aspect?: "landscape" | "portait",
  startNumber?: number,
  onItemClick?: (id: number) => void
}) {
  return (
    <section>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-6 pl-2 border-l-4 border-orange-500">{title}</h2>
      <div className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory pb-6 pl-2 pr-4 scrollbar-hide">
        {items.map((item, idx) => (
          <div key={item.id} onClick={() => onItemClick && onItemClick(item.id)} className="snap-start shrink-0 relative group cursor-pointer transition-transform duration-300 hover:scale-105">
            {isTop10 ? (
              <div className="flex relative w-[280px] md:w-[320px] h-[160px] md:h-[180px]">
                {/* Bold background number */}
                <span className="absolute -left-6 bottom-[-25px] text-[150px] leading-none font-black text-neutral-800 -z-10 tracking-tighter drop-shadow-md select-none group-hover:text-orange-950 transition-colors">
                  {idx + startNumber}
                </span>
                {/* Image */}
                <div className="relative w-[85%] ml-auto h-full rounded-xl overflow-hidden shadow-lg border border-neutral-800 group-hover:border-orange-500/50 transition-colors">
                   <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                   <span className="absolute bottom-3 left-3 font-bold text-lg md:text-xl text-white uppercase tracking-wider text-shadow">
                     {item.title}
                   </span>
                </div>
              </div>
            ) : (
              <div className={`relative rounded-xl overflow-hidden shadow-lg border border-neutral-800 group-hover:border-orange-500/50 transition-colors 
                ${aspect === 'landscape' ? 'w-[240px] md:w-[300px] h-[135px] md:h-[170px]' : 'w-[160px] md:w-[200px] h-[240px] md:h-[300px]'}`}>
                <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
                <span className={`absolute ${aspect === 'landscape' ? 'bottom-3 left-3' : 'bottom-4 inset-x-0 mx-4 text-center font-black'} uppercase text-white drop-shadow-lg`}>
                  {item.title}
                </span>
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
      {isActive && (
        <div className="absolute inset-0 bg-orange-500/10 rounded-[1.5rem]"></div>
      )}
      <div className={`relative w-[22px] h-[22px] transition-all duration-300 [&>svg]:w-full [&>svg]:h-full ${isActive ? 'translate-y-[-8px] drop-shadow-[0_0_8px_rgba(234,88,12,0.8)] scale-110' : ''}`}>
        {icon}
      </div>
      <span className={`absolute bottom-2 text-[10px] font-bold tracking-wide transition-all duration-300 ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {label}
      </span>
    </button>
  );
}

