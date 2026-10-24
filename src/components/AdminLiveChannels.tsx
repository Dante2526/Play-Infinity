import React, { useState, useEffect, useMemo } from 'react';
import { 
  Tv, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  RotateCcw, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Check, 
  X, 
  Loader2, 
  Radio, 
  Activity, 
  Sparkles,
  SlidersHorizontal,
  ChevronDown,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { INITIAL_LIVE_CHANNELS, LiveChannel } from '../data/liveChannels';
import { 
  LiveChannelSettings, 
  LiveChannelServer,
  fetchLiveChannelSettings, 
  subscribeLiveChannelSettings, 
  toggleChannelBlock, 
  saveChannelCustomServers, 
  resetChannelCustomServers,
  mergeChannelsWithSettings
} from '../services/liveChannelService';
import { ChannelLogo } from './ChannelLogo';

interface StreamSearchResult {
  streamId: string;
  name: string;
  streamType?: string;
  category?: string;
}

// Extrai termo inteligente de busca para o canal automaticamente
function getSmartSearchTerm(channel: LiveChannel): { term: string; chips: string[] } {
  const norm = channel.name.toLowerCase();
  if (norm.includes('premiere 1') || norm.includes('premiere clubes')) {
    return { term: 'premiere clubes', chips: ['premiere clubes', 'premiere 1', 'premiere'] };
  }
  if (norm.includes('premiere 2')) return { term: 'premiere 2', chips: ['premiere 2', 'premiere'] };
  if (norm.includes('premiere 3')) return { term: 'premiere 3', chips: ['premiere 3', 'premiere'] };
  if (norm.includes('premiere 4')) return { term: 'premiere 4', chips: ['premiere 4', 'premiere'] };
  if (norm.includes('premiere 5')) return { term: 'premiere 5', chips: ['premiere 5', 'premiere'] };
  if (norm.includes('premiere 6')) return { term: 'premiere 6', chips: ['premiere 6', 'premiere'] };
  if (norm.includes('premiere 7')) return { term: 'premiere 7', chips: ['premiere 7', 'premiere'] };
  if (norm.includes('sportv 3')) return { term: 'sportv 3', chips: ['sportv 3', 'sportv'] };
  if (norm.includes('sportv 2')) return { term: 'sportv 2', chips: ['sportv 2', 'sportv'] };
  if (norm.includes('sportv')) return { term: 'sportv', chips: ['sportv', 'sportv 2', 'sportv 3'] };
  if (norm.includes('espn 2')) return { term: 'espn 2', chips: ['espn 2', 'espn'] };
  if (norm.includes('espn 3')) return { term: 'espn 3', chips: ['espn 3', 'espn'] };
  if (norm.includes('espn 4')) return { term: 'espn 4', chips: ['espn 4', 'espn'] };
  if (norm.includes('espn 5')) return { term: 'espn 5', chips: ['espn 5', 'espn'] };
  if (norm.includes('espn')) return { term: 'espn', chips: ['espn', 'espn brasil'] };
  if (norm.includes('globo')) return { term: 'globo', chips: ['globo'] };
  if (norm.includes('band sports') || norm.includes('bandsports')) return { term: 'bandsports', chips: ['bandsports', 'band'] };
  if (norm.includes('band')) return { term: 'band', chips: ['band'] };
  if (norm.includes('sbt')) return { term: 'sbt', chips: ['sbt'] };
  if (norm.includes('record')) return { term: 'record', chips: ['record'] };
  if (norm.includes('tnt sports') || norm.includes('tnt')) return { term: 'tnt', chips: ['tnt sports', 'tnt'] };
  if (norm.includes('combate')) return { term: 'combate', chips: ['combate'] };
  if (norm.includes('discovery')) return { term: 'discovery', chips: ['discovery'] };
  if (norm.includes('history')) return { term: 'history', chips: ['history'] };
  if (norm.includes('animal planet')) return { term: 'animal planet', chips: ['animal planet'] };
  if (norm.includes('cartoon')) return { term: 'cartoon', chips: ['cartoon', 'cartoon network', 'cartoonito'] };

  const cleaned = channel.name.replace(/\b(HD|FHD|4K|SD|Ao Vivo|Brasil)\b/gi, '').trim();
  return { term: cleaned, chips: [cleaned] };
}

export function AdminLiveChannels() {
  const [settings, setSettings] = useState<LiveChannelSettings>({
    blockedChannelIds: [],
    customServers: {}
  });
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'visible' | 'hidden' | 'custom'>('all');

  // Estado de sondagem em tempo real (cache local de status dos servidores)
  const [probeResults, setProbeResults] = useState<Record<string, { online: boolean; status: number | string; probing?: boolean }>>({});
  const [isProbingAll, setIsProbingAll] = useState(false);
  const [probingProgress, setProbingProgress] = useState({ current: 0, total: 0 });

  // Modal de edição / substituição de servidores
  const [editingChannel, setEditingChannel] = useState<LiveChannel | null>(null);
  const [editServers, setEditServers] = useState<LiveChannelServer[]>([]);
  const [providerSearchQuery, setProviderSearchQuery] = useState('');
  const [providerSearchResults, setProviderSearchResults] = useState<StreamSearchResult[]>([]);
  const [searchingProvider, setSearchingProvider] = useState(false);
  const [savingServers, setSavingServers] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // Sincronização em tempo real das configurações do Firestore
  useEffect(() => {
    fetchLiveChannelSettings().then(s => {
      setSettings(s);
      setLoadingSettings(false);
    });

    const unsubscribe = subscribeLiveChannelSettings((updated) => {
      setSettings(updated);
      setLoadingSettings(false);
    });

    return () => unsubscribe();
  }, []);

  // Catálogo completo mesclado (incluindo canais bloqueados para visualização do admin)
  const allChannels = useMemo(() => {
    return mergeChannelsWithSettings(INITIAL_LIVE_CHANNELS, settings, true);
  }, [settings]);

  // Categorias disponíveis
  const categories = useMemo(() => {
    const set = new Set<string>();
    INITIAL_LIVE_CHANNELS.forEach(c => set.add(c.category));
    return Array.from(set);
  }, []);

  // Canais filtrados para exibição
  const filteredChannels = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allChannels.filter(channel => {
      const isBlocked = settings.blockedChannelIds.includes(channel.id);
      const isCustom = Boolean(settings.customServers[channel.id]?.length);

      // Filtro de status
      if (statusFilter === 'visible' && isBlocked) return false;
      if (statusFilter === 'hidden' && !isBlocked) return false;
      if (statusFilter === 'custom' && !isCustom) return false;

      // Filtro de categoria
      if (selectedCategory !== 'all' && channel.category !== selectedCategory) return false;

      // Busca por nome
      if (q && !channel.name.toLowerCase().includes(q) && !channel.id.toLowerCase().includes(q)) {
        return false;
      }

      return true;
    });
  }, [allChannels, settings, searchQuery, selectedCategory, statusFilter]);

  // Contadores
  const stats = useMemo(() => {
    const total = allChannels.length;
    const hidden = settings.blockedChannelIds.length;
    const visible = Math.max(0, total - hidden);
    const custom = Object.keys(settings.customServers).length;
    return { total, visible, hidden, custom };
  }, [allChannels, settings]);

  // Sondagem individual de um servidor
  const probeSingleServer = async (serverUrl: string) => {
    setProbeResults(prev => ({
      ...prev,
      [serverUrl]: { online: false, status: '...', probing: true }
    }));

    try {
      const res = await fetch(`/api/admin/probe-channel?url=${encodeURIComponent(serverUrl)}`);
      const data = await res.json();
      setProbeResults(prev => ({
        ...prev,
        [serverUrl]: { online: Boolean(data.online), status: data.statusCode || (data.online ? 200 : 'ERR'), probing: false }
      }));
      return data.online;
    } catch {
      setProbeResults(prev => ({
        ...prev,
        [serverUrl]: { online: false, status: 'ERR', probing: false }
      }));
      return false;
    }
  };

  // Sondar todos os canais visíveis
  const handleProbeAll = async () => {
    if (isProbingAll) return;
    setIsProbingAll(true);
    setProbingProgress({ current: 0, total: filteredChannels.length });

    for (let i = 0; i < filteredChannels.length; i++) {
      const ch = filteredChannels[i];
      setProbingProgress({ current: i + 1, total: filteredChannels.length });
      if (ch.servers && ch.servers.length > 0) {
        // Testa o servidor principal (1º servidor)
        await probeSingleServer(ch.servers[0].url);
      }
    }
    setIsProbingAll(false);
  };

  // Alternar Bloqueio / Ocultação do Canal
  const handleToggleBlock = async (channelId: string) => {
    const currentlyBlocked = settings.blockedChannelIds.includes(channelId);
    try {
      await toggleChannelBlock(channelId, !currentlyBlocked);
      setActionSuccess(currentlyBlocked ? "Canal reativado com sucesso!" : "Canal ocultado de todos os clientes!");
      setTimeout(() => setActionSuccess(''), 3500);
    } catch (e: any) {
      setActionError("Erro ao alterar visibilidade: " + e.message);
      setTimeout(() => setActionError(''), 4000);
    }
  };

  // Abrir modal de edição de servidores com AUTO-BUSCA IMEDIATA
  const handleOpenEdit = (channel: LiveChannel) => {
    setEditingChannel(channel);
    setEditServers([...channel.servers]);
    const { term } = getSmartSearchTerm(channel);
    setProviderSearchQuery(term);
    setActionError('');
    // Dispara a busca automática no provedor sem o usuário precisar digitar!
    handleSearchProvider(term);
  };

  // Buscar streams no provedor Xtream
  const handleSearchProvider = async (query: string) => {
    setProviderSearchQuery(query);
    if (!query || query.trim().length < 2) {
      setProviderSearchResults([]);
      return;
    }

    setSearchingProvider(true);
    try {
      const res = await fetch(`/api/admin/iptv-streams?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.streams)) {
        setProviderSearchResults(data.streams);
      } else {
        setProviderSearchResults([]);
      }
    } catch (e) {
      console.error("Erro buscando no provedor:", e);
    } finally {
      setSearchingProvider(false);
    }
  };

  // Definir como Servidor Titular (Substitui o Servidor 1 em 1 clique)
  const handleSetPrimaryStream = (stream: StreamSearchResult) => {
    const newServer: LiveChannelServer = {
      name: `Servidor 1 (${stream.name})`,
      url: `/api/iptv/${stream.streamId}`,
      isProxy: false
    };
    // Substitui o primeiro servidor ou coloca como único
    setEditServers(prev => {
      const remaining = prev.length > 1 ? prev.slice(1) : [];
      return [newServer, ...remaining];
    });
    probeSingleServer(newServer.url);
    setActionSuccess(`Sinal "${stream.name}" definido como Titular! Clique em Salvar.`);
    setTimeout(() => setActionSuccess(''), 3000);
  };

  // Adicionar stream do provedor como Servidor de Backup
  const handleAddStreamFromServer = (stream: StreamSearchResult) => {
    const newServer: LiveChannelServer = {
      name: `Servidor Backup (${stream.name})`,
      url: `/api/iptv/${stream.streamId}`,
      isProxy: false
    };
    setEditServers(prev => [...prev, newServer]);
    probeSingleServer(newServer.url);
    setActionSuccess(`Sinal "${stream.name}" adicionado aos backups!`);
    setTimeout(() => setActionSuccess(''), 3000);
  };

  // Salvar servidores customizados
  const handleSaveCustomServers = async () => {
    if (!editingChannel) return;
    if (editServers.length === 0) {
      setActionError("O canal precisa ter pelo menos 1 servidor.");
      return;
    }

    setSavingServers(true);
    try {
      await saveChannelCustomServers(editingChannel.id, editServers);
      setActionSuccess(`Servidores do canal ${editingChannel.name} atualizados com sucesso!`);
      setEditingChannel(null);
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (e: any) {
      setActionError("Erro ao salvar servidores: " + e.message);
    } finally {
      setSavingServers(false);
    }
  };

  // Restaurar servidores originais de fábrica
  const handleResetServers = async () => {
    if (!editingChannel) return;
    if (!confirm(`Deseja restaurar os servidores originais do canal ${editingChannel.name}?`)) return;

    setSavingServers(true);
    try {
      await resetChannelCustomServers(editingChannel.id);
      const original = INITIAL_LIVE_CHANNELS.find(c => c.id === editingChannel.id);
      if (original) {
        setEditServers([...original.servers]);
      }
      setActionSuccess(`Servidores originais restaurados!`);
      setEditingChannel(null);
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (e: any) {
      setActionError("Erro ao restaurar: " + e.message);
    } finally {
      setSavingServers(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Feedback flutuante */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 animate-fade-in shadow-lg">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 animate-fade-in shadow-lg">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Cards de Métricas e Ações Rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4">
          <div className="flex items-center justify-between text-white/50 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Total Catálogo</span>
            <Tv className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">{stats.total}</div>
        </div>

        <div className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4">
          <div className="flex items-center justify-between text-white/50 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Visíveis no App</span>
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400">{stats.visible}</div>
        </div>

        <div className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4">
          <div className="flex items-center justify-between text-white/50 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Ocultados (Off)</span>
            <EyeOff className="w-3.5 h-3.5 text-red-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-red-400">{stats.hidden}</div>
        </div>

        <div className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4">
          <div className="flex items-center justify-between text-white/50 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Customizados</span>
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-cyan-400">{stats.custom}</div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Campo de Busca */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar canal por nome (ex: sportv, premiere, globo)..."
              className="w-full bg-white/5 border border-white/10 py-2 pl-10 pr-3.5 rounded-xl text-white placeholder-white/40 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Botão Sondar Todos */}
          <button
            type="button"
            disabled={isProbingAll}
            onClick={handleProbeAll}
            className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 shrink-0 shadow-md shadow-orange-600/20 cursor-pointer min-h-[44px]"
          >
            {isProbingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Testando {probingProgress.current}/{probingProgress.total}...</span>
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                <span>Testar Canais Visíveis</span>
              </>
            )}
          </button>
        </div>

        {/* Filtros em Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <span className="text-white/40 text-[11px] font-bold uppercase tracking-wider shrink-0 mr-1">Filtro:</span>
          
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-all ${
              statusFilter === 'all'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'bg-white/5 text-white/60 hover:text-white'
            }`}
          >
            Todos ({allChannels.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('visible')}
            className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-all ${
              statusFilter === 'visible'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'bg-white/5 text-white/60 hover:text-white'
            }`}
          >
            Visíveis ({stats.visible})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('hidden')}
            className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-all ${
              statusFilter === 'hidden'
                ? 'bg-red-500 text-white shadow-sm'
                : 'bg-white/5 text-white/60 hover:text-white'
            }`}
          >
            Ocultados ({stats.hidden})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('custom')}
            className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-all ${
              statusFilter === 'custom'
                ? 'bg-cyan-500 text-white shadow-sm'
                : 'bg-white/5 text-white/60 hover:text-white'
            }`}
          >
            Customizados ({stats.custom})
          </button>

          <span className="text-white/20 mx-1">|</span>

          {/* Categorias */}
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-all ${
              selectedCategory === 'all'
                ? 'bg-white/20 text-white'
                : 'bg-white/5 text-white/50 hover:text-white'
            }`}
          >
            Todas Categorias
          </button>

          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(selectedCategory === cat ? 'all' : cat)}
              className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-all ${
                selectedCategory === cat
                  ? 'bg-white/20 text-white'
                  : 'bg-white/5 text-white/50 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Canais */}
      {loadingSettings ? (
        <div className="p-8 text-center text-white/40 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
          <span>Carregando canais e configurações de nuvem...</span>
        </div>
      ) : filteredChannels.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02] text-white/40 text-sm">
          Nenhum canal encontrado com os filtros selecionados.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredChannels.map(channel => {
            const isBlocked = settings.blockedChannelIds.includes(channel.id);
            const isCustom = Boolean(settings.customServers[channel.id]?.length);
            const primaryServer = channel.servers[0];
            const primaryProbe = primaryServer ? probeResults[primaryServer.url] : null;

            return (
              <div
                key={channel.id}
                className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                  isBlocked
                    ? 'bg-red-950/15 border-red-500/20 hover:border-red-500/40 opacity-75'
                    : 'bg-black/50 border-white/10 hover:border-white/20'
                }`}
              >
                {/* Linha Superior: Logo, Nome, Badges */}
                <div className="flex items-start justify-between gap-2.5 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-black/60 border border-white/10 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                      <ChannelLogo channel={channel} className="w-full h-full object-contain" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-bold text-white text-sm sm:text-base leading-tight truncate">
                          {channel.name}
                        </h4>
                        {isBlocked ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
                            OCULTO NO APP
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                            VISÍVEL
                          </span>
                        )}
                        {isCustom && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0" title="Servidores customizados salvos pelo admin">
                            CUSTOM
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-white/50 mt-1">
                        <span>{channel.category}</span>
                        <span>•</span>
                        <span>{channel.servers.length} {channel.servers.length === 1 ? 'servidor' : 'servidores'}</span>
                        {primaryProbe && (
                          <>
                            <span>•</span>
                            <span className={primaryProbe.online ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                              {primaryProbe.probing ? 'Testando...' : (primaryProbe.online ? '● Online (200 OK)' : '● Fora do Ar')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Linha dos Servidores Atuais com Teste Rápido */}
                <div className="space-y-1.5 pt-2 border-t border-white/5 text-xs">
                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                    Servidores Configurados:
                  </div>
                  <div className="space-y-1">
                    {channel.servers.slice(0, 3).map((srv, sIdx) => {
                      const probe = probeResults[srv.url];
                      return (
                        <div key={sIdx} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white/5 text-[11px]">
                          <span className="text-white/80 truncate font-medium flex-1">
                            {sIdx + 1}. {srv.name}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {probe && (
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                probe.online ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                              }`}>
                                {probe.probing ? '...' : (probe.online ? '200 OK' : 'OFF')}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => probeSingleServer(srv.url)}
                              title="Testar sinal deste servidor"
                              className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-[10px] font-bold cursor-pointer"
                            >
                              Testar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {channel.servers.length > 3 && (
                      <div className="text-[10px] text-white/40 italic pl-1">
                        + {channel.servers.length - 3} outros servidores de backup
                      </div>
                    )}
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => handleToggleBlock(channel.id)}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[44px] ${
                      isBlocked
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20'
                        : 'bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30'
                    }`}
                  >
                    {isBlocked ? (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Reativar no App</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Ocultar do App</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(channel)}
                    className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-orange-400" />
                    <span>Gerenciar Sinais</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal / Gaveta de Substituição e Gerenciamento de Sinais (Mobile-First Bottom Sheet) */}
      {editingChannel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#1c1c1e] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 max-w-xl w-full shadow-2xl relative flex flex-col h-[94vh] sm:h-auto sm:max-h-[88vh]">
            {/* Barra puxadora no mobile */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

            {/* Cabeçalho */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-black/60 border border-white/10 p-1 flex items-center justify-center shrink-0">
                  <ChannelLogo channel={editingChannel} className="w-full h-full object-contain" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-white truncate leading-tight">
                    Gerenciar: {editingChannel.name}
                  </h3>
                  <p className="text-xs text-white/50">{editingChannel.category} • Substituir ou adicionar servidores</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingChannel(null)}
                className="p-1.5 text-white/40 hover:text-white rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="overflow-y-auto custom-scrollbar p-1 flex-1 space-y-4 my-3">
              {/* Seção 1: Pesquisa Inteligente no Provedor Xtream */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-white/80 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                    Buscar Sinais no Provedor (1.795 streams ao vivo)
                  </label>
                  {searchingProvider && <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />}
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={providerSearchQuery}
                    onChange={(e) => handleSearchProvider(e.target.value)}
                    placeholder="Digite o nome do canal (ex: sportv, premiere, espn, disney)..."
                    className="w-full bg-white/5 border border-white/10 py-2 pl-9 pr-3 rounded-xl text-white placeholder-white/30 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>

                {/* Chips de Sugestão Rápida para o canal */}
                {editingChannel && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider shrink-0">Sugestões:</span>
                    {getSmartSearchTerm(editingChannel).chips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => handleSearchProvider(chip)}
                        className={`px-2 py-0.5 rounded-md font-bold text-[10px] transition-all cursor-pointer ${
                          providerSearchQuery.toLowerCase() === chip.toLowerCase()
                            ? 'bg-orange-500 text-white'
                            : 'bg-white/10 hover:bg-white/20 text-white/70'
                        }`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                {/* Lista de Resultados da Busca com Substituição em 1 Clique */}
                {providerSearchResults.length > 0 ? (
                  <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1.5 pt-1">
                    <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider px-1">
                      {providerSearchResults.length} sinais encontrados para este canal:
                    </div>
                    {providerSearchResults.map((stream) => {
                      const probe = probeResults[`/api/iptv/${stream.streamId}`];
                      return (
                        <div
                          key={stream.streamId}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-xs gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-white block truncate">{stream.name}</span>
                            <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono mt-0.5">
                              <span>ID: {stream.streamId}</span>
                              {probe && (
                                <span className={`font-bold ${probe.online ? 'text-emerald-400' : 'text-red-400'}`}>
                                  ● {probe.online ? '200 OK (Sinal Ativo)' : 'Fora do Ar'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => probeSingleServer(`/api/iptv/${stream.streamId}`)}
                              className="px-2.5 py-1.5 sm:py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-[11px] sm:text-[10px] font-bold cursor-pointer min-h-[36px] sm:min-h-0"
                            >
                              Testar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetPrimaryStream(stream)}
                              title="Substitui o Servidor 1 titular imediatamente"
                              className="px-3 py-1.5 sm:py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[11px] sm:text-[10px] font-bold flex items-center gap-1 cursor-pointer shadow-sm min-h-[36px] sm:min-h-0"
                            >
                              <span>★ Usar como Titular</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddStreamFromServer(stream)}
                              title="Adiciona como servidor secundário de backup"
                              className="px-2.5 py-1.5 sm:py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] sm:text-[10px] font-bold flex items-center gap-1 cursor-pointer min-h-[36px] sm:min-h-0"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Backup</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : searchingProvider ? (
                  <div className="py-4 text-center text-white/40 text-xs flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                    <span>Buscando sinais no provedor...</span>
                  </div>
                ) : (
                  providerSearchQuery.length >= 2 && (
                    <div className="py-3 text-center text-white/30 text-xs">
                      Nenhum sinal encontrado para "{providerSearchQuery}". Tente outro termo nos botões acima.
                    </div>
                  )
                )}
              </div>

              {/* Seção 2: Servidores Ativos do Canal */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-white/80 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-400" />
                    Servidores que entrarão no ar ({editServers.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditServers(prev => [
                        ...prev,
                        { name: `Servidor ${prev.length + 1} (Custom)`, url: '', isProxy: false }
                      ]);
                    }}
                    className="text-[10px] text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Adicionar Manual</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {editServers.map((srv, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-white/5 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                          {idx === 0 ? '★ Servidor 1 (Titular / Primário)' : `Servidor ${idx + 1} (Backup)`}
                        </span>
                        <div className="flex items-center gap-1">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const copy = [...editServers];
                                const tmp = copy[idx];
                                copy[idx] = copy[idx - 1];
                                copy[idx - 1] = tmp;
                                setEditServers(copy);
                              }}
                              className="p-1 text-white/40 hover:text-white rounded hover:bg-white/10 text-[10px] font-bold"
                              title="Subir prioridade"
                            >
                              ▲
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditServers(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="p-1 text-red-400 hover:text-red-300 rounded hover:bg-red-500/10 cursor-pointer"
                            title="Remover servidor"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-white/50 mb-0.5">Nome do Servidor</label>
                          <input
                            type="text"
                            value={srv.name}
                            onChange={(e) => {
                              const copy = [...editServers];
                              copy[idx].name = e.target.value;
                              setEditServers(copy);
                            }}
                            className="w-full bg-white/5 border border-white/10 py-1 px-2 rounded-lg text-white text-xs font-medium focus:outline-none focus:ring-1 focus:ring-orange-500"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] text-white/50 mb-0.5">URL ou Rota do Stream</label>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={srv.url}
                              onChange={(e) => {
                                const copy = [...editServers];
                                copy[idx].url = e.target.value;
                                setEditServers(copy);
                              }}
                              placeholder="/api/iptv/ID ou http://...m3u8"
                              className="w-full bg-white/5 border border-white/10 py-1 px-2 rounded-lg text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 flex-1"
                            />
                            <button
                              type="button"
                              onClick={() => probeSingleServer(srv.url)}
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold shrink-0 cursor-pointer"
                            >
                              Testar
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Rodapé com Botões de Ação */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/10 shrink-0">
              <button
                type="button"
                onClick={handleResetServers}
                disabled={savingServers}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer min-h-[44px]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Padrão</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingChannel(null)}
                  disabled={savingServers}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-semibold transition-colors cursor-pointer min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomServers}
                  disabled={savingServers}
                  className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 shadow-md shadow-orange-600/30 cursor-pointer min-h-[44px]"
                >
                  {savingServers ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
