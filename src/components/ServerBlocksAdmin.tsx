import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search,
  Trash2,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Server,
  Film,
  Tv,
  RefreshCw,
  X,
  RotateCcw,
  Check,
  Calendar,
  Sparkles,
  ShieldCheck,
  Ban,
  Layers,
} from "lucide-react";

interface ServerBlock {
  id: string;
  tmdbId: number;
  serverKey: string;
  contentType: "movie" | "series";
  title: string;
  reason: string;
  blockedAt: string;
  blockedBy: string;
}

interface SelectedMedia {
  id: number;
  title: string;
  originalTitle?: string;
  releaseYear?: string;
  posterPath?: string | null;
  contentType: "movie" | "series";
}

interface ServerOption {
  key: string;
  label: string;
  badge: string;
  badgeColor: string;
  description: string;
}

const HOMOLOGATED_SERVERS: ServerOption[] = [
  {
    key: "srv_watchplay",
    label: "WatchPlayer",
    badge: "Oficial",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    description: "Player padrão do app (CDN direta)",
  },
  {
    key: "srv_vip",
    label: "VIP Player",
    badge: "Dublado PT-BR",
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    description: "Fontes prioritárias com áudio nacional",
  },
  {
    key: "srv_mixdrop",
    label: "MixDrop",
    badge: "Secundário",
    badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    description: "Player alternativo de alta velocidade",
  },
  {
    key: "srv_nixplay",
    label: "Nixplay",
    badge: "Acervo",
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    description: "Catálogo complementar homologado",
  },
  {
    key: "srv_vidsrc",
    label: "Seriesflix HD",
    badge: "Séries / Multi",
    badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    description: "Stream multi-episódios para séries",
  },
];

const SERVER_LABELS: Record<string, string> = {
  srv_watchplay: "WatchPlayer",
  srv_vip: "VIP Player",
  srv_mixdrop: "MixDrop",
  srv_nixplay: "Nixplay",
  srv_vidsrc: "Seriesflix HD",
};

export function ServerBlocksAdmin() {
  const [blocks, setBlocks] = useState<ServerBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const [fServerKey, setFServerKey] = useState<string>("srv_watchplay");
  const [fReason, setFReason] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Search state (busca por nome/título)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{
    id: number;
    title: string;
    original_title?: string;
    release_date?: string;
    poster_path?: string | null;
    media_type: "movie" | "tv";
  }>>([]);
  const [searching, setSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Filter in active blocks
  const [blocksFilter, setBlocksFilter] = useState("");

  const getAdminToken = () => sessionStorage.getItem("adminSessionToken") || "";

  const loadBlocks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/server-blocks", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setBlocks(data.blocks || []);
      } else {
        setError(data.error || "Falha ao carregar bloqueios");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  // Fecha o dropdown de autocomplete ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Busca no TMDB unificada (multi: filmes e séries)
  const executeSearch = useCallback(async (queryText: string) => {
    const q = queryText.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setIsSearchOpen(false);
      return;
    }
    setSearching(true);
    try {
      // Se for apenas número, pesquisa direto pelo ID do TMDB
      if (/^\d+$/.test(q)) {
        const idNum = parseInt(q, 10);
        // Tenta buscar como série primeiro ou filme
        const [movieRes, tvRes] = await Promise.allSettled([
          fetch(`/api/tmdb/movie/${idNum}?language=pt-BR`).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/tmdb/tv/${idNum}?language=pt-BR`).then((r) => (r.ok ? r.json() : null)),
        ]);

        const results: any[] = [];
        if (tvRes.status === "fulfilled" && tvRes.value && tvRes.value.id) {
          const d = tvRes.value;
          results.push({
            id: d.id,
            title: d.name || d.original_name || `Série #${d.id}`,
            original_title: d.original_name,
            release_date: d.first_air_date,
            poster_path: d.poster_path,
            media_type: "tv",
          });
        }
        if (movieRes.status === "fulfilled" && movieRes.value && movieRes.value.id) {
          const d = movieRes.value;
          results.push({
            id: d.id,
            title: d.title || d.original_title || `Filme #${d.id}`,
            original_title: d.original_title,
            release_date: d.release_date,
            poster_path: d.poster_path,
            media_type: "movie",
          });
        }
        setSearchResults(results);
        setIsSearchOpen(results.length > 0);
      } else {
        // Busca textual por nome (ex: "Fantasmas", "Ghosts", "F1", "Wandinha")
        const res = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(q)}&language=pt-BR&page=1`);
        if (res.ok) {
          const data = await res.json();
          const items = (data.results || [])
            .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
            .slice(0, 10)
            .map((r: any) => ({
              id: r.id,
              title: r.title || r.name,
              original_title: r.original_title || r.original_name,
              release_date: r.release_date || r.first_air_date,
              poster_path: r.poster_path,
              media_type: r.media_type as "movie" | "tv",
            }));
          setSearchResults(items);
          setIsSearchOpen(items.length > 0);
        }
      }
    } catch (err) {
      console.warn("[ServerBlocksAdmin] Search error:", err);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounce da busca
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        executeSearch(searchQuery);
      } else {
        setSearchResults([]);
        setIsSearchOpen(false);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [searchQuery, executeSearch]);

  // Ao selecionar um filme ou série da busca por nome
  const handleSelectMedia = (item: typeof searchResults[number]) => {
    setSelectedMedia({
      id: item.id,
      title: item.title,
      originalTitle: item.original_title !== item.title ? item.original_title : undefined,
      releaseYear: item.release_date ? item.release_date.slice(0, 4) : undefined,
      posterPath: item.poster_path,
      contentType: item.media_type === "tv" ? "series" : "movie",
    });
    setSearchQuery("");
    setSearchResults([]);
    setIsSearchOpen(false);
    setError(null);
  };

  const handleClearSelected = () => {
    setSelectedMedia(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleAddBlock = async () => {
    if (!selectedMedia) {
      setError("Por favor, busque e selecione um filme ou série pelo nome.");
      return;
    }

    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await fetch("/api/admin/server-blocks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": getAdminToken(),
        },
        body: JSON.stringify({
          tmdbId: selectedMedia.id,
          serverKey: fServerKey,
          contentType: selectedMedia.contentType,
          title: selectedMedia.title,
          reason: fReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const serverName = SERVER_LABELS[fServerKey] || fServerKey;
      setSuccess(`Bloqueio ativado com sucesso: "${selectedMedia.title}" terá o servidor ${serverName} ignorado.`);
      
      // Reseta formulário mantendo seletor pronto para o próximo
      setSelectedMedia(null);
      setFReason("");
      await loadBlocks();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar bloqueio de servidor.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBlock = async (id: string, label: string) => {
    if (!confirm(`Remover bloqueio de ${label}? O servidor voltará a ser consultado para este título.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/server-blocks/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": getAdminToken() },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSuccess("Bloqueio removido com sucesso!");
      await loadBlocks();
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: any) {
      setError(err.message || "Erro ao remover bloqueio.");
    }
  };

  // Agrupa os bloqueios existentes por TMDB ID
  const groupedByTmdb = useMemo(() => {
    const filtered = blocksFilter.trim()
      ? blocks.filter(
          (b) =>
            b.title.toLowerCase().includes(blocksFilter.toLowerCase()) ||
            (SERVER_LABELS[b.serverKey] || "").toLowerCase().includes(blocksFilter.toLowerCase()) ||
            String(b.tmdbId).includes(blocksFilter.trim())
        )
      : blocks;

    const map = new Map<number, ServerBlock[]>();
    for (const b of filtered) {
      if (!map.has(b.tmdbId)) map.set(b.tmdbId, []);
      map.get(b.tmdbId)!.push(b);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [blocks, blocksFilter]);

  const selectedServerInfo = HOMOLOGATED_SERVERS.find((s) => s.key === fServerKey);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-orange-500/20 text-orange-400 rounded-xl">
            <Ban className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Bloqueio de Servidor por Conteúdo</h2>
            <p className="text-sm text-white/50">
              Ignore um servidor problemático para um filme ou série específico — os outros servidores homologados continuam ativos
            </p>
          </div>
        </div>
        <button
          onClick={loadBlocks}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white rounded-xl transition-colors text-xs font-semibold cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Recarregar
        </button>
      </div>

      {/* Mensagens de Sucesso ou Erro */}
      {success && (
        <div className="flex items-center gap-2 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm animate-fade-in">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* CARD PRINCIPAL: Adicionar Novo Bloqueio */}
      <div className="bg-[#1c1c1e]/70 border border-white/10 backdrop-blur-xl rounded-[28px] p-5 sm:p-6 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 rounded-full bg-orange-500"></span>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Adicionar Novo Bloqueio de Servidor
            </h3>
          </div>
          <span className="text-xs text-white/40 font-medium hidden sm:inline">
            Busque pelo nome • Tipo detectado automaticamente
          </span>
        </div>

        {/* ETAPA 1: Busca pelo Nome */}
        <div className="space-y-2" ref={searchContainerRef}>
          <label className="block text-xs font-semibold text-white/70">
            1. Buscar filme ou série pelo nome
          </label>

          {!selectedMedia ? (
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => {
                  if (searchResults.length > 0) setIsSearchOpen(true);
                }}
                placeholder="Digite o título (ex: Fantasmas, Ghosts, Wandinha, Avatar, F1...)"
                className="w-full pl-10 pr-10 py-3 bg-black/40 border border-white/15 focus:border-orange-500/70 rounded-2xl text-white placeholder-white/30 text-sm focus:outline-none transition-all"
              />
              {searching ? (
                <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400 animate-spin" />
              ) : searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setIsSearchOpen(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white rounded-full hover:bg-white/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}

              {/* Lista suspensa com resultados da busca */}
              {isSearchOpen && searchResults.length > 0 && (
                <div className="absolute z-40 mt-2 w-full bg-[#1c1c1e] border border-white/15 rounded-2xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-white/5">
                  <div className="px-3.5 py-2 bg-black/40 text-[11px] font-semibold text-white/40 uppercase tracking-wider flex items-center justify-between">
                    <span>Resultados encontrados ({searchResults.length})</span>
                    <span>Clique para selecionar</span>
                  </div>
                  {searchResults.map((r) => {
                    const isTv = r.media_type === "tv";
                    const year = r.release_date ? r.release_date.slice(0, 4) : "";
                    const hasOriginal = r.original_title && r.original_title !== r.title;

                    return (
                      <button
                        key={`${r.media_type}-${r.id}`}
                        type="button"
                        onClick={() => handleSelectMedia(r)}
                        className="w-full flex items-center gap-3.5 p-3 hover:bg-white/10 text-left transition-colors cursor-pointer group"
                      >
                        {/* Poster */}
                        {r.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${r.poster_path}`}
                            alt=""
                            className="w-10 h-14 rounded-lg object-cover shrink-0 shadow-md border border-white/10 group-hover:scale-105 transition-transform"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-10 h-14 bg-white/5 rounded-lg flex items-center justify-center shrink-0 border border-white/5">
                            {isTv ? (
                              <Tv className="w-5 h-5 text-purple-400/60" />
                            ) : (
                              <Film className="w-5 h-5 text-sky-400/60" />
                            )}
                          </div>
                        )}

                        {/* Detalhes do item */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white text-sm font-semibold truncate group-hover:text-orange-400 transition-colors">
                              {r.title}
                            </span>
                            {/* Badge do Tipo (Série ou Filme) */}
                            {isTv ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                <Tv className="w-2.5 h-2.5" />
                                Série
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                                <Film className="w-2.5 h-2.5" />
                                Filme
                              </span>
                            )}
                          </div>

                          {hasOriginal && (
                            <div className="text-white/40 text-xs truncate">
                              Título original: {r.original_title}
                            </div>
                          )}

                          <div className="text-white/40 text-xs mt-0.5 flex items-center gap-2">
                            {year && <span>{year}</span>}
                            <span>•</span>
                            <span className="font-mono text-[11px] text-white/50">TMDB #{r.id}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Card do Conteúdo Selecionado (dispensa campos manuais de ID e Tipo) */
            <div className="p-3.5 sm:p-4 bg-orange-500/10 border border-orange-500/30 rounded-2xl flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-3.5 min-w-0">
                {selectedMedia.posterPath ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w92${selectedMedia.posterPath}`}
                    alt=""
                    className="w-12 h-16 rounded-xl object-cover shrink-0 shadow-lg border border-orange-500/30"
                  />
                ) : (
                  <div className="w-12 h-16 bg-white/5 rounded-xl flex items-center justify-center shrink-0 border border-white/10">
                    {selectedMedia.contentType === "series" ? (
                      <Tv className="w-6 h-6 text-purple-400" />
                    ) : (
                      <Film className="w-6 h-6 text-sky-400" />
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-white text-base font-bold truncate">
                      {selectedMedia.title}
                    </h4>
                    {selectedMedia.contentType === "series" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/25 text-purple-200 border border-purple-500/40">
                        <Tv className="w-3 h-3" />
                        Série de TV
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/25 text-sky-200 border border-sky-500/40">
                        <Film className="w-3 h-3" />
                        Filme
                      </span>
                    )}
                  </div>

                  {selectedMedia.originalTitle && (
                    <p className="text-white/50 text-xs truncate">
                      Original: {selectedMedia.originalTitle}
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-white/50 text-xs mt-1">
                    {selectedMedia.releaseYear && <span>{selectedMedia.releaseYear}</span>}
                    <span>•</span>
                    <span className="font-mono text-orange-300">TMDB #{selectedMedia.id}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Tipo identificado
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClearSelected}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                title="Buscar outro título"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Trocar título
              </button>
            </div>
          )}
        </div>

        {/* ETAPA 2: Seletor de Servidor Customizado (100% interno, NADA de select nativo do navegador) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-white/70">
              2. Qual servidor você quer ignorar para este conteúdo?
            </label>
            <span className="text-[11px] text-white/40">
              Selecione o provedor abaixo
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {HOMOLOGATED_SERVERS.map((server) => {
              const isSelected = fServerKey === server.key;

              return (
                <button
                  key={server.key}
                  type="button"
                  onClick={() => setFServerKey(server.key)}
                  className={`relative p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                    isSelected
                      ? "bg-orange-500/15 border-orange-500 ring-2 ring-orange-500/30 shadow-lg shadow-orange-500/10 text-white"
                      : "bg-black/40 border-white/10 hover:border-white/20 hover:bg-white/5 text-white/70 hover:text-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? "border-orange-500 bg-orange-500"
                            : "border-white/30 bg-transparent"
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 text-black stroke-[3]" />}
                      </div>
                      <span className="font-bold text-sm text-white truncate">
                        {server.label}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${server.badgeColor}`}
                    >
                      {server.badge}
                    </span>
                  </div>

                  <p className="text-xs text-white/50 leading-relaxed">
                    {server.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ETAPA 3: Motivo do bloqueio (opcional) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-white/70">
            3. Motivo do bloqueio (opcional — para seu histórico de controle)
          </label>
          <textarea
            value={fReason}
            onChange={(e) => setFReason(e.target.value)}
            rows={2}
            placeholder="Ex: Este servidor estava com áudio original em inglês; outros servidores possuem versão dublada PT-BR"
            className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 focus:border-orange-500/70 rounded-2xl text-white placeholder-white/30 text-sm focus:outline-none transition-all resize-none"
          />
        </div>

        {/* Botão de Ação */}
        <div>
          <button
            type="button"
            onClick={handleAddBlock}
            disabled={saving || !selectedMedia}
            className={`w-full py-3.5 px-6 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              selectedMedia && !saving
                ? "bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-xl shadow-orange-600/25 hover:scale-[1.01]"
                : "bg-white/5 text-white/30 border border-white/5 cursor-not-allowed"
            }`}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Gravando bloqueio no servidor...</span>
              </>
            ) : !selectedMedia ? (
              <>
                <Search className="w-4 h-4 text-white/40" />
                <span>1º Busque e selecione um filme ou série pelo nome acima</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>
                  Bloquear {selectedServerInfo?.label || "Servidor"} em "{selectedMedia.title}"
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* LISTA DE BLOQUEIOS ATIVOS */}
      <div className="bg-[#1c1c1e]/60 border border-white/10 backdrop-blur-xl rounded-[28px] p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-orange-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Bloqueios Ativos no Catálogo ({blocks.length})
            </h3>
          </div>

          {/* Campo de filtro nos bloqueios existentes */}
          {blocks.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
              <input
                type="text"
                value={blocksFilter}
                onChange={(e) => setBlocksFilter(e.target.value)}
                placeholder="Filtrar por título ou servidor..."
                className="w-full pl-9 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-white/30 text-xs focus:outline-none focus:border-orange-500/50"
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
        ) : blocks.length === 0 ? (
          <div className="text-center py-12 text-white/40 text-sm">
            Nenhum servidor bloqueado atualmente. Quando precisar ignorar uma fonte em algum título, adicione no formulário acima.
          </div>
        ) : groupedByTmdb.length === 0 ? (
          <div className="text-center py-8 text-white/40 text-xs">
            Nenhum bloqueio encontrado com o filtro "{blocksFilter}".
          </div>
        ) : (
          <div className="space-y-3">
            {groupedByTmdb.map(([tmdbId, blocksForTmdb]) => {
              const first = blocksForTmdb[0];
              const isSeries = first.contentType === "series";

              return (
                <div
                  key={tmdbId}
                  className="border border-white/10 rounded-2xl overflow-hidden bg-black/20"
                >
                  {/* Cabeçalho do Grupo (Filme / Série) */}
                  <div className="bg-white/5 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isSeries ? (
                        <div className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg shrink-0">
                          <Tv className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="p-1.5 bg-sky-500/20 text-sky-300 rounded-lg shrink-0">
                          <Film className="w-4 h-4" />
                        </div>
                      )}
                      <span className="text-white font-bold text-sm truncate">
                        {first.title || `TMDB #${tmdbId}`}
                      </span>
                      <span className="text-[10px] font-semibold text-white/50 px-2 py-0.5 rounded-full bg-white/5">
                        {isSeries ? "Série" : "Filme"}
                      </span>
                    </div>

                    <span className="text-white/40 text-xs font-mono shrink-0">
                      TMDB #{tmdbId}
                    </span>
                  </div>

                  {/* Lista de servidores ignorados para este conteúdo */}
                  <div className="divide-y divide-white/5">
                    {blocksForTmdb.map((b) => {
                      const serverName = SERVER_LABELS[b.serverKey] || b.serverKey;
                      const dateStr = b.blockedAt
                        ? new Date(b.blockedAt).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "";

                      return (
                        <div
                          key={b.id}
                          className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1.5">
                                <Ban className="w-3 h-3 text-red-400" />
                                Servidor {serverName} ignorado
                              </span>
                              {dateStr && (
                                <span className="text-white/40 text-[11px]">
                                  {dateStr}
                                </span>
                              )}
                            </div>

                            {b.reason && (
                              <p className="text-white/60 text-xs mt-1.5 leading-relaxed bg-black/30 p-2 rounded-xl border border-white/5">
                                <span className="text-white/40 font-semibold">Motivo: </span>
                                {b.reason}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteBlock(b.id, `"${b.title}" no servidor ${serverName}`)}
                            className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer shrink-0"
                            title="Desbloquear servidor para este título"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
