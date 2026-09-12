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
  Upload,
  FileUp,
  FolderOpen
} from 'lucide-react';
import { LiveChannel, INITIAL_LIVE_CHANNELS } from '../data/liveChannels';
import { ChannelLogo } from './ChannelLogo';
import { 
  getAllChannels, 
  saveCustomChannel, 
  deleteCustomChannel, 
  clearAllCustomChannels,
  getFavoriteChannelIds, 
  toggleFavoriteChannel,
  parseM3UPlaylist,
  setLastPlayedChannelId,
  getLastPlayedChannelId
} from '../services/liveTvStorage';
import { LivePlayerModal } from './LivePlayerModal';

interface LiveTvPageProps {
  onBack?: () => void;
}

export const LiveTvPage: React.FC<LiveTvPageProps> = () => {
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Player state
  const [activeChannel, setActiveChannel] = useState<LiveChannel | null>(null);

  // Modais
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingChannel, setEditingChannel] = useState<LiveChannel | null>(null);
  const [modalTab, setModalTab] = useState<'single' | 'm3u'>('single');

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
  const [m3uText, setM3uText] = useState<string>('');
  const [m3uUrl, setM3uUrl] = useState<string>('');
  const [m3uInputType, setM3uInputType] = useState<'url' | 'text' | 'file'>('url');
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [validateStreamsCheck, setValidateStreamsCheck] = useState<boolean>(true);
  const [isAnalyzingM3u, setIsAnalyzingM3u] = useState<boolean>(false);
  const [m3uFilterView, setM3uFilterView] = useState<'online' | 'all' | 'offline'>('online');
  const [m3uAnalysisResult, setM3uAnalysisResult] = useState<{
    total: number;
    onlineCount: number;
    offlineCount: number;
    validated: boolean;
    categories: Record<string, number>;
    channels: (LiveChannel & { isOnline?: boolean; status?: string; responseTimeMs?: number; error?: string })[];
    sample: LiveChannel[];
  } | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string>('');
  const [importErrorMsg, setImportErrorMsg] = useState<string>('');

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
    setLastPlayedChannelId(channel.id);
    setActiveChannel(channel);
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
      setModalTab('single');
    } else {
      setEditingChannel(null);
      setFormName('');
      setFormCategory('Esportes');
      setFormStreamUrl('');
      setFormLogoUrl('');
      setFormQuality('1080p');
      setModalTab('single');
    }
    setImportSuccessMsg('');
    setImportErrorMsg('');
    setM3uAnalysisResult(null);
    setIsAddModalOpen(true);
  };

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
      setActiveChannel(newChannel);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setImportErrorMsg('');
    setImportSuccessMsg('');
    setM3uAnalysisResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setM3uText(content);
      }
    };
    reader.onerror = () => {
      setImportErrorMsg('Erro ao ler o arquivo anexado.');
    };
    reader.readAsText(file);
  };

  const handleAnalyzeM3U = async () => {
    setImportErrorMsg('');
    setImportSuccessMsg('');
    setM3uAnalysisResult(null);

    const isUrl = m3uInputType === 'url';
    const payload = isUrl 
      ? { url: m3uUrl.trim(), validateStreams: validateStreamsCheck } 
      : { content: m3uText.trim(), validateStreams: validateStreamsCheck };

    if (isUrl && !m3uUrl.trim()) {
      setImportErrorMsg('Por favor, insira o link da playlist M3U.');
      return;
    }
    if (!isUrl && !m3uText.trim()) {
      setImportErrorMsg(m3uInputType === 'file' ? 'Por favor, selecione um arquivo de lista M3U.' : 'Por favor, cole o texto da playlist M3U.');
      return;
    }

    setIsAnalyzingM3u(true);
    try {
      const res = await fetch('/api/parse-m3u-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao analisar a lista M3U');
      }

      if (data.total === 0) {
        setImportErrorMsg('Nenhum canal com link de stream válido foi encontrado nessa lista.');
      } else {
        setM3uAnalysisResult(data);
        setM3uFilterView(data.onlineCount > 0 ? 'online' : 'all');
      }
    } catch (err: any) {
      setImportErrorMsg(err.message || 'Falha de conexão ao processar lista M3U.');
    } finally {
      setIsAnalyzingM3u(false);
    }
  };

  const handleImportParsedChannels = (onlyOnline: boolean = false) => {
    if (!m3uAnalysisResult || m3uAnalysisResult.channels.length === 0) return;

    const channelsToSave = onlyOnline 
      ? m3uAnalysisResult.channels.filter(c => c.isOnline)
      : m3uAnalysisResult.channels;

    if (channelsToSave.length === 0) {
      setImportErrorMsg('Nenhum canal selecionado para importação.');
      return;
    }

    channelsToSave.forEach(c => saveCustomChannel(c));
    refreshChannels();
    setImportSuccessMsg(`${channelsToSave.length} canais adicionados com sucesso ao seu catálogo!`);
    setTimeout(() => {
      setIsAddModalOpen(false);
      setM3uText('');
      setM3uUrl('');
      setM3uAnalysisResult(null);
      setImportSuccessMsg('');
    }, 1500);
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
      setActiveChannel(null);
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
                  onClick={() => handlePlayChannel(heroChannel)}
                  className="flex items-center justify-center gap-2.5 px-6 sm:px-7 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm md:text-base transition-all shadow-[0_10px_25px_rgba(234,88,12,0.5)] active:scale-95 cursor-pointer min-h-[44px]"
                >
                  <Play className="w-5 h-5 fill-white" />
                  <span>Sintonizar Canal</span>
                </button>

                <button
                  onClick={() => openAddModal()}
                  className="flex items-center justify-center gap-2 px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs sm:text-sm border border-white/15 transition-all cursor-pointer min-h-[44px]"
                >
                  <Plus className="w-4 h-4 text-orange-400" />
                  <span>Importar Lista M3U</span>
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
            placeholder="Buscar canais de TV, Premiere, SporTV, notícias..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-neutral-900/80 border border-white/10 text-white placeholder-neutral-500 text-xs sm:text-sm focus:outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/60 transition-all shadow-inner min-h-[44px]"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Botão Principal de Adicionar / Importar Lista M3U */}
          <button
            onClick={() => openAddModal()}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs sm:text-sm transition-all shadow-md shadow-orange-600/30 active:scale-95 cursor-pointer min-h-[44px] shrink-0"
            title="Importar lista M3U ou adicionar canal"
          >
            <Plus className="w-4 h-4" />
            <span>Importar M3U</span>
          </button>

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

      {/* CHIPS DE CATEGORIAS (Scroll fluido com bleed no mobile) */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-3 mb-6 sm:mb-8 scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0">
        <button
          onClick={() => openAddModal()}
          className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/40 shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>+ Importar Lista M3U</span>
        </button>

        {customChannelsCount > 0 && (
          <button
            type="button"
            onClick={handleClearAllCustom}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 shadow-sm active:scale-95"
            title="Remover todos os canais que você importou"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar Importados ({customChannelsCount})</span>
          </button>
        )}

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
          {filteredChannels.map((channel) => {
            const isFav = favoriteIds.includes(channel.id);
            return (
              <div
                key={channel.id}
                onClick={() => handlePlayChannel(channel)}
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
                    onClick={() => handlePlayChannel(channel)}
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
          {filteredChannels.map((channel) => {
            const isFav = favoriteIds.includes(channel.id);
            return (
              <div
                key={channel.id}
                onClick={() => handlePlayChannel(channel)}
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

      {/* PLAYER MODAL ATIVO */}
      {activeChannel && (
        <LivePlayerModal
          channel={activeChannel}
          allChannels={channels}
          onClose={() => setActiveChannel(null)}
          onSelectChannel={(newChan) => setActiveChannel(newChan)}
          onEditChannel={(ch) => openAddModal(ch)}
        />
      )}

      {/* MODAL: ADICIONAR / EDITAR CANAL DE TV OU IMPORTAR M3U */}
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
                  <p className="text-[11px] sm:text-xs text-neutral-400">Configure servidores de streaming ao vivo ou importe listas</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-white/5 min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Abas do Modal */}
            <div className="flex items-center gap-1 sm:gap-2 p-1 bg-black/40 rounded-xl mb-4 sm:mb-5 border border-white/5 shrink-0">
              <button
                type="button"
                onClick={() => setModalTab('single')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[38px] flex items-center justify-center ${
                  modalTab === 'single' ? 'bg-orange-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Canal Individual
              </button>
              <button
                type="button"
                onClick={() => setModalTab('m3u')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[38px] flex items-center justify-center ${
                  modalTab === 'm3u' ? 'bg-orange-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Importar Lista M3U
              </button>
            </div>

            <div className="overflow-y-auto pr-1 flex-1 space-y-4 custom-scrollbar">
              {modalTab === 'single' ? (
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
              ) : (
                <div className="space-y-4">
                  {/* Tipo de Entrada: Link URL vs Anexar Arquivo vs Texto */}
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-black/50 rounded-xl border border-white/5">
                    <button
                      type="button"
                      onClick={() => {
                        setM3uInputType('url');
                        setImportErrorMsg('');
                      }}
                      className={`py-2 px-1 text-center text-[11px] sm:text-xs font-semibold rounded-lg transition-all cursor-pointer truncate ${
                        m3uInputType === 'url' ? 'bg-white/15 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      Link / URL
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setM3uInputType('file');
                        setImportErrorMsg('');
                      }}
                      className={`py-2 px-1 text-center text-[11px] sm:text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 truncate ${
                        m3uInputType === 'file' ? 'bg-orange-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      <span>Anexar Arquivo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setM3uInputType('text');
                        setImportErrorMsg('');
                      }}
                      className={`py-2 px-1 text-center text-[11px] sm:text-xs font-semibold rounded-lg transition-all cursor-pointer truncate ${
                        m3uInputType === 'text' ? 'bg-white/15 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      Colar Texto
                    </button>
                  </div>

                  {/* Toggle para Testar Links em Tempo Real */}
                  <div className="flex items-center justify-between p-2.5 bg-black/40 border border-white/10 rounded-xl">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-white block">
                        Testar Links e Conectividade
                      </span>
                      <p className="text-[10px] text-neutral-400">
                        Verifica automaticamente em tempo real quais transmissões estão online e sem travas.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={validateStreamsCheck}
                        onChange={(e) => setValidateStreamsCheck(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                    </label>
                  </div>

                  {m3uInputType === 'url' && (
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                        Link público da lista (.m3u, .m3u8 ou raw GitHub)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          placeholder="https://exemplo.com/minha-lista.m3u"
                          value={m3uUrl}
                          onChange={(e) => setM3uUrl(e.target.value)}
                          className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-orange-500"
                        />
                        <button
                          type="button"
                          disabled={isAnalyzingM3u || !m3uUrl.trim()}
                          onClick={handleAnalyzeM3U}
                          className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 shadow-md shadow-orange-600/30"
                        >
                          {isAnalyzingM3u ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Testando links...</span>
                            </>
                          ) : (
                            <>
                              <Search className="w-3.5 h-3.5" />
                              <span>Analisar e Testar</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1.5">
                        O sistema baixa a lista, faz o teste de conexão de cada canal e categoriza tudo.
                      </p>
                    </div>
                  )}

                  {m3uInputType === 'file' && (
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        Selecione o arquivo da sua Lista (.m3u, .m3u8, .txt)
                      </label>
                      <div 
                        onClick={() => document.getElementById('m3u-file-upload-input')?.click()}
                        className="border-2 border-dashed border-white/20 hover:border-orange-500/60 rounded-2xl p-5 sm:p-6 text-center bg-black/30 hover:bg-orange-500/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-2.5 group"
                      >
                        <input
                          id="m3u-file-upload-input"
                          type="file"
                          accept=".m3u,.m3u8,.txt,text/plain"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <div className="w-12 h-12 rounded-full bg-orange-500/20 group-hover:bg-orange-500/30 text-orange-400 flex items-center justify-center transition-all">
                          <FileUp className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs sm:text-sm font-bold text-white">
                            {selectedFileName ? selectedFileName : 'Toque aqui para anexar seu arquivo M3U'}
                          </p>
                          <p className="text-[11px] text-neutral-400">
                            Suporta arquivos baixados .m3u, .m3u8 e listas em texto (.txt)
                          </p>
                        </div>
                        {selectedFileName && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                            <Check className="w-3.5 h-3.5" /> Arquivo Carregado ({m3uText.length > 0 ? `${(m3uText.length / 1024).toFixed(1)} KB` : 'Pronto'})
                          </span>
                        )}
                      </div>

                      {m3uText.trim() && (
                        <button
                          type="button"
                          disabled={isAnalyzingM3u}
                          onClick={handleAnalyzeM3U}
                          className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-orange-600/30"
                        >
                          {isAnalyzingM3u ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Testando links do arquivo anexado...</span>
                            </>
                          ) : (
                            <>
                              <Search className="w-4 h-4" />
                              <span>Analisar e Testar Canais do Arquivo</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {m3uInputType === 'text' && (
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                        Cole o conteúdo da Lista M3U / M3U8
                      </label>
                      <textarea
                        rows={4}
                        placeholder={`#EXTM3U\n#EXTINF:-1 tvg-logo="..." group-title="Esportes",Premiere 1 HD\nhttp://exemplo.com/premiere.m3u8`}
                        value={m3uText}
                        onChange={(e) => setM3uText(e.target.value)}
                        className="w-full p-3 rounded-xl bg-black/50 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-orange-500 custom-scrollbar"
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          type="button"
                          disabled={isAnalyzingM3u || !m3uText.trim()}
                          onClick={handleAnalyzeM3U}
                          className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          {isAnalyzingM3u ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Testando links...</span>
                            </>
                          ) : (
                            <>
                              <Search className="w-3.5 h-3.5" />
                              <span>Analisar e Testar Texto</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mensagens de Erro */}
                  {importErrorMsg && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                      <X className="w-4 h-4 text-red-500 shrink-0" />
                      <span>{importErrorMsg}</span>
                    </div>
                  )}

                  {/* Resumo da Análise e Diagnóstico dos Canais */}
                  {m3uAnalysisResult && (
                    <div className="bg-black/60 border border-white/10 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-200">
                      {/* Placar de Saúde dos Links */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-2">
                          <span className="text-[10px] text-neutral-400 block font-semibold">Total</span>
                          <span className="text-sm sm:text-base font-black text-white">{m3uAnalysisResult.total}</span>
                        </div>
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2">
                          <span className="text-[10px] text-emerald-400 block font-semibold flex items-center justify-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Online
                          </span>
                          <span className="text-sm sm:text-base font-black text-emerald-400">{m3uAnalysisResult.onlineCount}</span>
                        </div>
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-2">
                          <span className="text-[10px] text-red-400 block font-semibold">Inativos</span>
                          <span className="text-sm sm:text-base font-black text-red-400">{m3uAnalysisResult.offlineCount}</span>
                        </div>
                      </div>

                      {/* Categorias Detectadas */}
                      <div>
                        <span className="text-[10px] text-neutral-400 block mb-1.5 font-semibold uppercase tracking-wider">
                          Categorias Detectadas:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(m3uAnalysisResult.categories).map(([cat, count]) => (
                            <span key={cat} className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-neutral-300">
                              <strong className="text-white">{cat}:</strong> {count}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Filtro da Prévia */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
                            Lista de Canais:
                          </span>
                          <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/5">
                            <button
                              type="button"
                              onClick={() => setM3uFilterView('online')}
                              className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                                m3uFilterView === 'online' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'
                              }`}
                            >
                              Online ({m3uAnalysisResult.onlineCount})
                            </button>
                            <button
                              type="button"
                              onClick={() => setM3uFilterView('all')}
                              className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                                m3uFilterView === 'all' ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
                              }`}
                            >
                              Todos ({m3uAnalysisResult.total})
                            </button>
                            {m3uAnalysisResult.offlineCount > 0 && (
                              <button
                                type="button"
                                onClick={() => setM3uFilterView('offline')}
                                className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                                  m3uFilterView === 'offline' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'
                                }`}
                              >
                                Inativos ({m3uAnalysisResult.offlineCount})
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Lista de Canais com Status Badge */}
                        <div className="max-h-36 overflow-y-auto space-y-1 pr-1 custom-scrollbar text-xs">
                          {m3uAnalysisResult.channels
                            .filter(ch => {
                              if (m3uFilterView === 'online') return ch.isOnline;
                              if (m3uFilterView === 'offline') return !ch.isOnline;
                              return true;
                            })
                            .slice(0, 15)
                            .map((ch, idx) => (
                              <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-white/5 text-[11px] gap-2">
                                <span className="font-semibold text-white truncate max-w-[170px] sm:max-w-[220px]">
                                  {ch.name}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[9px] text-neutral-400">{ch.category}</span>
                                  {ch.isOnline ? (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                      <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                                      {ch.responseTimeMs ? `${ch.responseTimeMs}ms` : 'Online'}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                                      Offline
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Botões de Ação para Importar */}
                      <div className="space-y-2 pt-1">
                        {m3uAnalysisResult.onlineCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleImportParsedChannels(true)}
                            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md shadow-emerald-600/30 cursor-pointer flex items-center justify-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Adicionar Apenas os {m3uAnalysisResult.onlineCount} Canais Online (Recomendado)</span>
                          </button>
                        ) : (
                          <p className="text-xs text-red-400 text-center py-1">
                            Nenhum canal respondeu ao teste de stream nesta lista no momento.
                          </p>
                        )}

                        <button
                          type="button"
                          onClick={() => handleImportParsedChannels(false)}
                          className="w-full py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-semibold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-white/10"
                        >
                          <span>Importar Todos os {m3uAnalysisResult.total} Canais Mesmo Assim</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {importSuccessMsg && (
                    <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs flex items-center gap-2">
                      <Check className="w-4 h-4 text-orange-500 shrink-0" />
                      <span>{importSuccessMsg}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
                    {customChannelsCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          handleClearAllCustom();
                          setIsAddModalOpen(false);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-semibold cursor-pointer min-h-[42px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remover Todos os {customChannelsCount} Manuais</span>
                      </button>
                    ) : <div />}
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-neutral-400 hover:text-white text-xs font-medium cursor-pointer min-h-[42px]"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
