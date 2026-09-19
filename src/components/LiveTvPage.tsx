import React, { useState, useEffect, useMemo } from 'react';
import { 
  Tv, 
  Search, 
  Play, 
  Star, 
  Plus, 
  Flame, 
  Filter, 
  Radio, 
  Settings2, 
  FileText, 
  Check, 
  X, 
  Trash2, 
  Sparkles,
  RefreshCw,
  Trophy,
  LayoutGrid,
  List,
  FolderOpen,
  Mic,
  MicOff,
  Info
} from 'lucide-react';
import { useVoiceSearch } from '../hooks/useVoiceSearch';
import { LiveChannel, INITIAL_LIVE_CHANNELS } from '../data/liveChannels';
import { ChannelLogo } from './ChannelLogo';
import { 
  getAllChannels, 
  saveCustomChannel, 
  deleteCustomChannel, 
  clearAllCustomChannels,
  getFavoriteChannelIds, 
  toggleFavoriteChannel,
  setLastPlayedChannelId,
  getLastPlayedChannelId
} from '../services/liveTvStorage';

interface LiveTvPageProps {
  onBack?: () => void;
  // Estado e controle do player elevados para o App.tsx (mesmo padrão do player de filmes/séries),
  // para que o canal continue tocando (inclusive no mini player) ao navegar para outras páginas.
  activeChannel: LiveChannel | null;
  onPlayChannel: (channel: LiveChannel, allChannels: LiveChannel[]) => void;
  onCloseActiveChannel: () => void;
  // Quando o usuário pede para editar o canal a partir do player minimizado em outra página,
  // o App.tsx navega de volta para cá e sinaliza qual canal deve abrir no modal de edição.
  pendingEditChannelId?: string | null;
  onPendingEditHandled?: () => void;
}

export const LiveTvPage: React.FC<LiveTvPageProps> = ({ activeChannel, onPlayChannel, onCloseActiveChannel, pendingEditChannelId, onPendingEditHandled }) => {
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Hook de Busca por Voz para Canais
  const {
    isListening: isVoiceListening,
    interimTranscript: voiceTranscript,
    error: voiceError,
    isSupported: isVoiceSupported,
    toggleListening: toggleVoiceListening,
    clearError: clearVoiceError
  } = useVoiceSearch({
    onResult: (spokenText) => {
      setSearchQuery(spokenText);
    }
  });

  // Modais
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingChannel, setEditingChannel] = useState<LiveChannel | null>(null);

  // View mode (grid or list - great for mobile)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return (localStorage.getItem('playinfinity_live_view_mode') as 'grid' | 'list') || 'grid';
    } catch {
      return 'grid';
    }
  });

  const toggleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem('playinfinity_live_view_mode', mode);
    } catch {}
  };

  // Form states
  const [formName, setFormName] = useState<string>('');
  const [formCategory, setFormCategory] = useState<LiveChannel['category']>('Esportes');
  const [formStreamUrl, setFormStreamUrl] = useState<string>('');
  const [formLogoUrl, setFormLogoUrl] = useState<string>('');
  const [formQuality, setFormQuality] = useState<'1080p' | '720p' | 'HD'>('1080p');

  // Carrega canais e favoritos ao montar
  const refreshChannels = () => {
    setChannels(getAllChannels());
    setFavoriteIds(getFavoriteChannelIds());
  };

  useEffect(() => {
    refreshChannels();
  }, []);

  const categories = [
    { id: 'Todos', label: 'Todos os Canais', icon: <Tv className="w-4 h-4" /> },
    { id: 'Esportes', label: 'Esportes & Premiere', icon: <Trophy className="w-4 h-4" /> },
    { id: 'TV Aberta', label: 'TV Aberta', icon: <Radio className="w-4 h-4" /> },
    { id: 'Notícias', label: 'Notícias', icon: <Flame className="w-4 h-4" /> },
    { id: 'Filmes & Séries', label: 'Filmes & Séries', icon: <Tv className="w-4 h-4" /> },
    { id: 'Infantil', label: 'Infantil & Anime', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'Favoritos', label: 'Meus Favoritos', icon: <Star className="w-4 h-4" /> },
  ];

  // Filtro de canais
  const filteredChannels = useMemo(() => {
    return channels.filter(ch => {
      const matchesSearch = ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ch.currentProgram && ch.currentProgram.toLowerCase().includes(searchQuery.toLowerCase())) ||
        ch.category.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (selectedCategory === 'Todos') return true;
      if (selectedCategory === 'Favoritos') return favoriteIds.includes(ch.id);
      return ch.category === selectedCategory;
    });
  }, [channels, searchQuery, selectedCategory, favoriteIds]);

  // Performance Optimization: Progressive Rendering for large M3U playlists
  const [visibleCount, setVisibleCount] = useState(36);

  useEffect(() => {
    setVisibleCount(36); // Reset when filters change
  }, [filteredChannels.length, searchQuery, selectedCategory]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1200) {
        setVisibleCount((prev) => Math.min(prev + 36, filteredChannels.length));
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [filteredChannels.length]);

  // Canal em destaque no Banner (Premiere Clubes ou o primeiro de esportes)
  const heroChannel = useMemo(() => {
    const lastId = getLastPlayedChannelId();
    if (lastId) {
      const found = channels.find(c => c.id === lastId);
      if (found) return found;
    }
    return channels.find(c => c.id === 'premiere-clubes') || channels[0];
  }, [channels]);

  const handlePlayChannel = (channel: LiveChannel) => {
    // Entra em tela cheia imediatamente após o clique do usuário
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        (document.documentElement as any).webkitRequestFullscreen().catch(() => {});
      }
    } catch (e) {
      console.warn("Fullscreen request failed", e);
    }

    setLastPlayedChannelId(channel.id);
    onPlayChannel(channel, channels);
  };

  const handleToggleFav = (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavoriteChannel(channelId);
    setFavoriteIds(getFavoriteChannelIds());
  };

  const openAddModal = (channelToEdit?: LiveChannel) => {
    if (channelToEdit) {
      setEditingChannel(channelToEdit);
      setFormName(channelToEdit.name);
      setFormCategory(channelToEdit.category);
      setFormStreamUrl(channelToEdit.servers[0]?.url || '');
      setFormLogoUrl(channelToEdit.logo || '');
      setFormQuality(channelToEdit.quality || '1080p');
    } else {
      setEditingChannel(null);
      setFormName('');
      setFormCategory('Esportes');
      setFormStreamUrl('');
      setFormLogoUrl('');
      setFormQuality('1080p');
    }
    setIsAddModalOpen(true);
  };

  // Atende pedidos de edição feitos a partir do player minimizado em outra página do app:
  // o App.tsx navega de volta para a Live TV e sinaliza qual canal deve abrir no modal de edição.
  useEffect(() => {
    if (!pendingEditChannelId || channels.length === 0) return;
    const found = channels.find(c => c.id === pendingEditChannelId);
    if (found) {
      openAddModal(found);
    }
    onPendingEditHandled?.();
  }, [pendingEditChannelId, channels]);

  const handleSaveChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formStreamUrl.trim()) return;

    const channelId = editingChannel ? editingChannel.id : 'custom-' + Date.now();
    const newChannel: LiveChannel = {
      id: channelId,
      name: formName.trim(),
      category: formCategory,
      quality: formQuality,
      logo: formLogoUrl.trim() || 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=320&auto=format&fit=crop&q=80',
      currentProgram: editingChannel?.currentProgram || 'Transmissão Ao Vivo Personalizada',
      isCustom: true,
      servers: [
        {
          name: 'Servidor Proxy Play Infinity (Recomendado)',
          url: formStreamUrl.trim(),
          isProxy: true
        },
        {
          name: 'Servidor Direto',
          url: formStreamUrl.trim(),
          isProxy: false
        }
      ]
    };

    saveCustomChannel(newChannel);
    refreshChannels();
    setIsAddModalOpen(false);

    // Se estiver assistindo esse canal, atualiza a reprodução
    if (activeChannel?.id === channelId) {
      onPlayChannel(newChannel, channels);
    }
  };

  const [toastMsg, setToastMsg] = useState<string>('');

  const customChannelsCount = useMemo(() => {
    return channels.filter(c => c.isCustom).length;
  }, [channels]);

  const handleClearAllCustom = () => {
    clearAllCustomChannels();
    refreshChannels();
    setToastMsg('Todos os canais personalizados foram removidos!');
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleDeleteChannel = (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    deleteCustomChannel(channelId);
    refreshChannels();
    if (activeChannel?.id === channelId) {
      onCloseActiveChannel();
    }
    setToastMsg('Canal removido com sucesso!');
    setTimeout(() => setToastMsg(''), 2500);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pt-14 sm:pt-20 pb-28 md:pb-16 px-3 sm:px-4 md:px-8 max-w-7xl mx-auto w-full overflow-x-hidden">
      {/* Toast de Notificação / Feedback de Ação */}
      {toastMsg && (
        <div className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-600/95 text-white px-4 py-2 rounded-full shadow-2xl border border-emerald-400/40 flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-3 duration-200">
          <Check className="w-3.5 h-3.5" />
          <span>{toastMsg}</span>
        </div>
      )}
      {/* BANNER PRINCIPAL HERO: AO VIVO */}
      {heroChannel && (
        <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 mb-6 sm:mb-10 shadow-[0_15px_35px_rgba(0,0,0,0.8)] bg-neutral-950">
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-transparent z-10"></div>
          
          {/* Fundo decorativo sutil */}
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-30 blur-[2px] scale-105 transition-all"
            style={{ 
              backgroundImage: `url(${heroChannel.logo || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1200&auto=format&fit=crop&q=80'})` 
            }}
          />

          <div className="relative z-20 p-4 sm:p-6 md:p-12 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
            <div className="max-w-2xl w-full">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                <span className="flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.8)]">
                  <span className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-white animate-ping"></span>
                  AO VIVO AGORA
                </span>
                <span className="px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  {heroChannel.category}
                </span>
                <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold bg-white/10 text-neutral-300">
                  {heroChannel.quality}
                </span>
              </div>

              <div className="flex items-center gap-3 mb-2 sm:mb-3">
                <div className="flex lg:hidden items-center justify-center w-12 h-10 sm:w-16 sm:h-12 rounded-xl bg-black/75 p-1.5 border border-white/10 shrink-0">
                  <ChannelLogo
                    channel={heroChannel}
                    size="sm"
                    className="w-full h-full"
                  />
                </div>
                <h1 className="text-xl sm:text-3xl md:text-5xl font-black tracking-tight text-white drop-shadow-md leading-tight truncate">
                  {heroChannel.name}
                </h1>
              </div>

              <p className="text-neutral-300 text-xs sm:text-sm md:text-base leading-relaxed mb-4 sm:mb-6 line-clamp-2 sm:line-clamp-3 drop-shadow">
                {heroChannel.currentProgram || heroChannel.description || 'Transmissão contínua em tempo real com qualidade HD e múltiplos servidores.'}
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
                <button
                  tabIndex={0} role="button" onClick={() => handlePlayChannel(heroChannel)}
                  className="flex items-center justify-center gap-2.5 px-6 sm:px-7 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm md:text-base transition-all shadow-[0_10px_25px_rgba(234,88,12,0.5)] active:scale-95 cursor-pointer min-h-[44px]"
                >
                  <Play className="w-5 h-5 fill-white" />
                  <span>Sintonizar Canal</span>
                </button>


              </div>
            </div>

            {/* Logo do Canal em Alta Definição */}
            <div className="hidden lg:flex items-center justify-center w-52 h-40 bg-black/60 rounded-2xl p-4 border border-white/10 backdrop-blur-md shadow-2xl overflow-hidden">
              <ChannelLogo
                channel={heroChannel}
                size="hero"
                className="w-full h-full"
                imageClassName="max-h-32"
              />
            </div>
          </div>
        </div>
      )}

      {/* BARRA DE PESQUISA & GERENCIADOR */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-4 mb-5 sm:mb-8">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder={isVoiceListening ? "Ouvindo canal desejado..." : "Buscar canais de TV, Premiere, SporTV, notícias..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 ${searchQuery ? 'pr-20' : 'pr-12'} py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-neutral-900/80 border text-white placeholder-neutral-500 text-xs sm:text-sm focus:outline-none transition-all shadow-inner min-h-[44px] ${
              isVoiceListening
                ? 'border-orange-500 ring-2 ring-orange-500/30 shadow-[0_0_20px_rgba(234,88,12,0.3)]'
                : 'border-white/10 focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/60'
            }`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {isVoiceSupported && (
              <button
                type="button"
                onClick={toggleVoiceListening}
                className={`p-1.5 rounded-lg transition-all cursor-pointer relative flex items-center justify-center ${
                  isVoiceListening 
                    ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-[0_0_12px_rgba(239,68,68,0.7)] scale-105' 
                    : 'text-neutral-400 hover:text-orange-400 hover:bg-white/5'
                }`}
                title={isVoiceListening ? "Parar de ouvir" : "Pesquisar canal por voz"}
              >
                {isVoiceListening ? (
                  <>
                    <span className="absolute inset-0 rounded-lg bg-red-500/40 animate-ping pointer-events-none" />
                    <Mic className="w-4 h-4 relative z-10 animate-pulse text-white" />
                  </>
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">


          {customChannelsCount > 0 && (
            <button
              onClick={handleClearAllCustom}
              className="flex items-center gap-1.5 px-3 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-semibold text-xs transition-all cursor-pointer min-h-[44px] shrink-0"
              title="Remover todos os canais personalizados importados"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Limpar Importados ({customChannelsCount})</span>
            </button>
          )}

          {/* Seletor de Modo de Visualização (Grade / Lista - perfeito para celular) */}
          <div className="flex items-center bg-neutral-900/90 border border-white/10 rounded-xl sm:rounded-2xl p-0.5 shrink-0">
            <button
              onClick={() => toggleViewMode('grid')}
              className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-all cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center ${
                viewMode === 'grid' 
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30' 
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Visualização em Grade"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => toggleViewMode('list')}
              className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-all cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center ${
                viewMode === 'list' 
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30' 
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Visualização em Lista (Otimizada para celular)"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={refreshChannels}
            className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-white/10 transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            title="Atualizar lista de canais"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* HUD DE ESCUTA DE VOZ ATIVA (TV AO VIVO) */}
      {isVoiceListening && (
        <div className="mb-5 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-neutral-900/95 border border-orange-500/50 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-full bg-orange-600/20 text-orange-500 border border-orange-500/40 shrink-0">
              <span className="absolute inset-0 rounded-full bg-orange-500/30 animate-ping" />
              <Mic className="w-4 h-4 relative z-10 animate-bounce" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-xs sm:text-sm flex items-center gap-1.5">
                  Ouvindo canal...
                  <span className="flex gap-0.5 items-end h-3 ml-1">
                    <span className="w-1 h-2 bg-orange-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-3 bg-orange-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1.5 bg-orange-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </span>
                </span>
                <span className="text-neutral-400 text-xs hidden sm:inline">• Fale o nome do canal</span>
              </div>
              {voiceTranscript ? (
                <p className="text-orange-400 font-semibold text-xs sm:text-sm truncate mt-0.5">
                  "{voiceTranscript}"
                </p>
              ) : (
                <p className="text-neutral-400 text-xs truncate mt-0.5">
                  Diga "Globo", "SporTV", "Premiere", "ESPN", "Band"...
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleVoiceListening}
            className="w-full sm:w-auto px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0 text-center"
          >
            Concluir / Cancelar
          </button>
        </div>
      )}

      {/* AVISO DE ERRO DE VOZ (TV AO VIVO) */}
      {voiceError && (
        <div className="mb-5 p-3 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <Info className="w-4 h-4 text-red-400 shrink-0" />
            <span className="truncate">{voiceError}</span>
          </div>
          <button
            type="button"
            onClick={clearVoiceError}
            className="p-1 hover:text-white shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* CHIPS DE CATEGORIAS (Scroll fluido com espaço seguro para foco e contornos) */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pt-3 pb-4 mb-4 sm:mb-6 scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-2">
        {/* Chips de importação removidos */}

        {categories.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 border ${
                isActive
                  ? 'bg-orange-600 text-white border-orange-500 shadow-md shadow-orange-600/30'
                  : 'bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border-white/5'
              }`}
            >
              {cat.icon}
              <span>{cat.label}</span>
              {cat.id === 'Favoritos' && favoriteIds.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-white/20 text-white font-bold">
                  {favoriteIds.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* GRADE OU LISTA DE CANAIS */}
      {filteredChannels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center bg-neutral-950/50 rounded-2xl sm:rounded-3xl border border-white/5 p-6 sm:p-8">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-orange-600/10 border border-orange-500/30 flex items-center justify-center mb-4 text-orange-500">
            <Tv className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white mb-2">Nenhum canal encontrado</h3>
          <p className="text-neutral-400 text-xs sm:text-sm max-w-md mb-6 leading-relaxed">
            {selectedCategory === 'Favoritos' 
              ? 'Você ainda não adicionou nenhum canal aos seus favoritos. Clique na estrela em qualquer canal para salvar!'
              : 'Tente buscar com outro termo ou selecione uma categoria diferente.'}
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('Todos');
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-all cursor-pointer min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Ver Todos os Canais</span>
          </button>
        </div>
      ) : viewMode === 'list' ? (
        /* VISUALIZAÇÃO EM LISTA (EXTREMAMENTE RÁPIDA E ERGONÔMICA NO CELULAR) */
        <div className="space-y-2 sm:space-y-2.5">
          {filteredChannels.slice(0, visibleCount).map((channel) => {
            const isFav = favoriteIds.includes(channel.id);
            return (
              <div
                key={channel.id}
                tabIndex={0} role="button" onClick={() => handlePlayChannel(channel)}
                className="group relative bg-neutral-900/60 hover:bg-neutral-900 border border-white/5 hover:border-orange-500/40 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 transition-all duration-200 flex items-center justify-between gap-2.5 sm:gap-3 cursor-pointer overflow-hidden shadow-sm active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                  {/* Logo */}
                  <div className="w-12 h-9 sm:w-14 sm:h-11 rounded-lg bg-black/70 border border-white/10 p-1 flex items-center justify-center shrink-0 group-hover:border-orange-500/30 transition-all overflow-hidden">
                    <ChannelLogo 
                      channel={channel} 
                      size="sm" 
                      className="w-full h-full" 
                    />
                  </div>

                  {/* Informações */}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <h4 className="font-bold text-xs sm:text-sm text-white group-hover:text-orange-400 transition-colors truncate">
                        {channel.name}
                      </h4>
                      <span className="flex items-center gap-1 text-[8px] sm:text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-red-600 text-white tracking-wider shrink-0">
                        <span className="w-1 h-1 rounded-full bg-white animate-ping"></span>
                        AO VIVO
                      </span>
                      <span className="text-[9px] font-bold px-1 sm:px-1.5 py-0.2 rounded bg-white/5 text-neutral-400 shrink-0">
                        {channel.quality}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-neutral-400 truncate">
                      <span className="text-orange-400/90 font-medium shrink-0">{channel.category}</span>
                      <span className="w-1 h-1 rounded-full bg-neutral-700 shrink-0"></span>
                      <span className="truncate">{channel.currentProgram || channel.description || 'Programação contínua'}</span>
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => handleToggleFav(channel.id, e)}
                    className={`p-2 rounded-lg sm:rounded-xl transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center ${
                      isFav 
                        ? 'text-yellow-400 bg-yellow-400/10' 
                        : 'text-neutral-500 hover:text-white hover:bg-white/10'
                    }`}
                    title={isFav ? 'Remover dos favoritos' : 'Favoritar canal'}
                  >
                    <Star className={`w-4 h-4 ${isFav ? 'fill-yellow-400' : ''}`} />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openAddModal(channel);
                    }}
                    className="p-2 rounded-lg sm:rounded-xl text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-all min-w-[36px] min-h-[36px] flex items-center justify-center"
                    title="Editar servidores deste canal"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>

                  {channel.isCustom && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteChannel(channel.id, e)}
                      className="p-2 rounded-lg sm:rounded-xl bg-red-500/20 hover:bg-red-500/35 text-red-400 hover:text-red-300 border border-red-500/30 transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center active:scale-90 z-20 touch-manipulation shadow-sm"
                      title="Excluir canal"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  )}

                  <button
                    tabIndex={0} role="button" onClick={() => handlePlayChannel(channel)}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-orange-600 hover:bg-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-600/30 active:scale-95 ml-1 cursor-pointer shrink-0"
                    title="Assistir agora"
                  >
                    <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* VISUALIZAÇÃO EM GRADE (2 COLUNAS NO CELULAR, 3-4 NO DESKTOP) */
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-5">
          {filteredChannels.slice(0, visibleCount).map((channel) => {
            const isFav = favoriteIds.includes(channel.id);
            return (
              <div
                key={channel.id}
                tabIndex={0} role="button" onClick={() => handlePlayChannel(channel)}
                className="group relative bg-neutral-900/60 hover:bg-neutral-900 border border-white/5 hover:border-orange-500/40 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 transition-all duration-300 hover:shadow-xl hover:shadow-orange-600/10 flex flex-col justify-between cursor-pointer overflow-hidden active:scale-[0.98]"
              >
                {/* Efeito sutil ao passar o mouse */}
                <div className="absolute inset-0 bg-gradient-to-t from-orange-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                {/* Topo do Card: Logo, Badge Ao Vivo e Favorito */}
                <div>
                  <div className="flex items-start justify-between gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                    <div className="w-12 h-9 sm:w-16 sm:h-12 rounded-lg sm:rounded-xl bg-black/70 border border-white/10 p-1 sm:p-1.5 flex items-center justify-center overflow-hidden shrink-0 group-hover:border-orange-500/30 transition-all">
                      <ChannelLogo 
                        channel={channel} 
                        size="md" 
                        className="w-full h-full" 
                      />
                    </div>

                    <div className="flex items-center gap-1 sm:gap-1.5">
                      <span className="flex items-center gap-1 text-[8px] sm:text-[9px] font-black uppercase px-1.5 sm:px-2 py-0.5 rounded-full bg-red-600 text-white tracking-widest shadow-sm">
                        <span className="w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full bg-white animate-ping"></span>
                        <span className="hidden xs:inline">AO VIVO</span>
                      </span>

                      <button
                        onClick={(e) => handleToggleFav(channel.id, e)}
                        className={`p-1 sm:p-1.5 rounded-lg transition-all cursor-pointer min-w-[28px] min-h-[28px] flex items-center justify-center ${
                          isFav 
                            ? 'text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20' 
                            : 'text-neutral-500 hover:text-white hover:bg-white/10'
                        }`}
                        title={isFav ? 'Remover dos favoritos' : 'Favoritar canal'}
                      >
                        <Star className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isFav ? 'fill-yellow-400' : ''}`} />
                      </button>

                      {channel.isCustom && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteChannel(channel.id, e)}
                          className="p-1.5 sm:p-2 rounded-lg bg-red-500/20 hover:bg-red-500/35 text-red-400 hover:text-red-300 border border-red-500/30 transition-all cursor-pointer min-w-[30px] min-h-[30px] flex items-center justify-center active:scale-90 z-20 touch-manipulation shadow-sm"
                          title="Excluir canal"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Informações do Canal */}
                  <div className="space-y-0.5 sm:space-y-1">
                    <div className="flex items-center justify-between gap-1 sm:gap-2">
                      <h4 className="font-bold text-xs sm:text-sm text-white group-hover:text-orange-400 transition-colors truncate">
                        {channel.name}
                      </h4>
                      <span className="text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.2 rounded bg-white/5 text-neutral-400 shrink-0">
                        {channel.quality}
                      </span>
                    </div>

                    <p className="text-[10px] sm:text-xs text-neutral-400 line-clamp-1 sm:line-clamp-2 leading-relaxed h-4 sm:h-8">
                      {channel.currentProgram || channel.description || 'Programação contínua 24h'}
                    </p>
                  </div>
                </div>

                {/* Rodapé do Card */}
                <div className="pt-2.5 sm:pt-4 mt-2 sm:mt-3 border-t border-white/5 flex items-center justify-between text-xs">
                  <span className="text-[10px] sm:text-[11px] font-medium text-neutral-500 truncate max-w-[65px] sm:max-w-none">
                    {channel.category}
                  </span>

                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddModal(channel);
                      }}
                      className="p-1 rounded text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-all"
                      title="Editar servidores deste canal"
                    >
                      <Settings2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </button>

                    <span className="flex items-center gap-1 font-semibold text-orange-500 group-hover:translate-x-0.5 transition-transform text-[11px] sm:text-xs">
                      <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-orange-500" />
                      <span className="hidden xs:inline">Assistir</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: ADICIONAR / EDITAR CANAL DE TV */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl sm:rounded-3xl w-full max-w-lg p-4 sm:p-6 shadow-2xl relative overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 sm:pb-4 mb-3 sm:mb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-orange-600/20 text-orange-500">
                  <Tv className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    {editingChannel ? 'Editar Canal de TV' : 'Adicionar Canal de TV'}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-neutral-400">Configure servidores de streaming ao vivo</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-white/5 min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto pr-1 flex-1 space-y-4 custom-scrollbar">
              <form onSubmit={handleSaveChannel} className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Nome do Canal</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Premiere Futebol HD, SporTV, ESPN Brasil"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-base sm:text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Categoria</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-base sm:text-sm focus:outline-none focus:border-orange-500"
                    >
                      <option value="Esportes">Esportes</option>
                      <option value="TV Aberta">TV Aberta</option>
                      <option value="Notícias">Notícias</option>
                      <option value="Filmes & Séries">Filmes & Séries</option>
                      <option value="Infantil">Infantil</option>
                      <option value="Variedades">Variedades</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Qualidade</label>
                    <select
                      value={formQuality}
                      onChange={(e) => setFormQuality(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-base sm:text-sm focus:outline-none focus:border-orange-500"
                    >
                      <option value="1080p">1080p (Full HD)</option>
                      <option value="720p">720p (HD)</option>
                      <option value="HD">HD Padrão</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    URL do Stream (.m3u8 ou HLS)
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://exemplo.com/live/premiere/index.m3u8"
                    value={formStreamUrl}
                    onChange={(e) => setFormStreamUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-base sm:text-sm focus:outline-none focus:border-orange-500 font-mono text-xs"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    O app usa automaticamente nosso proxy anti-CORS integrado para permitir reprodução sem bloqueios.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    URL do Logo (Opcional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://exemplo.com/logo-canal.png"
                    value={formLogoUrl}
                    onChange={(e) => setFormLogoUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-base sm:text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-neutral-400 hover:text-white text-xs font-medium cursor-pointer min-h-[42px]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all shadow-md shadow-orange-600/30 cursor-pointer min-h-[42px]"
                  >
                    {editingChannel ? 'Salvar Alterações' : 'Adicionar Canal'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
