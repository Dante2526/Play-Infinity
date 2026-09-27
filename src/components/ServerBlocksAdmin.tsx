import React, { useState, useEffect, useCallback, useRef } from "react";
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
  ChevronDown,
  Check,
  X,
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

// Servidores suportados — chave, label, cor e descrição
interface ServerDef {
  key: string;
  label: string;
  short: string;
  accent: string; // tailwind classes for the badge
  description: string;
}

const SERVER_DEFS: ServerDef[] = [
  {
    key: "srv_watchplay",
    label: "WatchPlayer",
    short: "WP",
    accent: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    description: "Servidor principal oficial",
  },
  {
    key: "srv_mixdrop",
    label: "MixDrop",
    short: "MD",
    accent: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    description: "MixDrop VIP HD",
  },
  {
    key: "srv_vip",
    label: "VIP Player",
    short: "VIP",
    accent: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    description: "Player sanitizado via myembed",
  },
  {
    key: "srv_nixplay",
    label: "Nixplay",
    short: "NX",
    accent: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    description: "Nixplay Premium MP4",
  },
  {
    key: "srv_vidsrc",
    label: "Seriesflix HD",
    short: "SF",
    accent: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    description: "Vidsrc.sh decifrado",
  },
];

const SERVER_MAP: Record<string, ServerDef> = Object.fromEntries(
  SERVER_DEFS.map((s) => [s.key, s])
) as Record<string, ServerDef>;

export function ServerBlocksAdmin() {
  const [blocks, setBlocks] = useState<ServerBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state — TMDB ID e Tipo são automáticos (vindos da busca)
  const [fTmdbId, setFTmdbId] = useState<number | null>(null);
  const [fServerKey, setFServerKey] = useState<string>("srv_watchplay");
  const [fContentType, setFContentType] = useState<"movie" | "series">("movie");
  const [fTitle, setFTitle] = useState<string>("");
  const [fReason, setFReason] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Busca por TMDB ID (autocomplete via TMDB proxy)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{
      id: number;
      title: string;
      release_date?: string;
      poster_path?: string;
      media_type?: string;
      overview?: string;
    }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [serverDropdownOpen, setServerDropdownOpen] = useState(false);
  const serverDropdownRef = useRef<HTMLDivElement>(null);

  // Carrega token de admin do sessionStorage
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
        setError(data.error || "Falha ao carregar blocks");
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

  // Fecha dropdown de servidor quando clica fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        serverDropdownRef.current &&
        !serverDropdownRef.current.contains(e.target as Node)
      ) {
        setServerDropdownOpen(false);
      }
    };
    if (serverDropdownOpen) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [serverDropdownOpen]);

  // Busca no TMDB via /api/tmdb (proxy que oculta a chave)
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      // Tenta como número primeiro (TMDB ID direto) — pra debug, mas mantém
      const asNum = parseInt(q, 10);
      if (!isNaN(asNum) && /^\d+$/.test(q)) {
        // Tenta como movie primeiro, depois como tv
        const r1 = await fetch(`/api/tmdb?path=movie/${asNum}&language=pt-BR`);
        if (r1.ok) {
          const d = await r1.json();
          if (d.id) {
            setSearchResults([
              {
                id: d.id,
                title: d.title || d.name || `TMDB ${d.id}`,
                release_date: d.release_date,
                poster_path: d.poster_path,
                media_type: "movie",
                overview: d.overview,
              },
            ]);
            return;
          }
        }
        // Tenta como tv
        const r2 = await fetch(`/api/tmdb?path=tv/${asNum}&language=pt-BR`);
        if (r2.ok) {
          const d = await r2.json();
          if (d.id) {
            setSearchResults([
              {
                id: d.id,
                title: d.name || d.title || `TMDB ${d.id}`,
                release_date: d.first_air_date,
                poster_path: d.poster_path,
                media_type: "tv",
                overview: d.overview,
              },
            ]);
            return;
          }
        }
        setSearchResults([]);
      } else {
        // Busca por título (multi — inclui tv e movie)
        const r = await fetch(
          `/api/tmdb?path=search/multi&query=${encodeURIComponent(q)}&language=pt-BR&page=1`
        );
        if (r.ok) {
          const d = await r.json();
          const results = (d.results || [])
            .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
            .sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))
            .slice(0, 10)
            .map((r: any) => ({
              id: r.id,
              title: r.title || r.name,
              release_date: r.release_date || r.first_air_date,
              poster_path: r.poster_path,
              media_type: r.media_type,
              overview: r.overview,
            }));
          setSearchResults(results);
        }
      }
    } catch (err) {
      console.warn("[ServerBlocksAdmin] Search error:", err);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(handleSearch, 350);
    return () => clearTimeout(t);
  }, [handleSearch]);

  // Quando seleciona um resultado da busca, preenche o form automaticamente
  const selectResult = (r: typeof searchResults[number]) => {
    setFTmdbId(r.id);
    setFTitle(r.title || "");
    setFContentType((r.media_type as "movie" | "series") || "movie");
    setSearchQuery("");
    setSearchResults([]);
  };

  // Limpa seleção atual (volta pra estado inicial)
  const clearSelection = () => {
    setFTmdbId(null);
    setFTitle("");
    setFContentType("movie");
    setFReason("");
  };

  const handleAddBlock = async () => {
    setError(null);
    setSuccess(null);

    if (!fTmdbId || fTmdbId <= 0) {
      setError("Selecione um filme/série da busca antes de salvar");
      return;
    }
    if (!fTitle.trim()) {
      setError("Título não preenchido");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/server-blocks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": getAdminToken(),
        },
        body: JSON.stringify({
          tmdbId: fTmdbId,
          serverKey: fServerKey,
          contentType: fContentType,
          title: fTitle.trim(),
          reason: fReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSuccess(
        `Bloqueio adicionado: ${fTitle} → ${SERVER_MAP[fServerKey]?.label || fServerKey}`
      );
      clearSelection();
      await loadBlocks();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBlock = async (id: string, label: string) => {
    if (!confirm(`Remover bloqueio: ${label}?`)) return;
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
      setSuccess("Bloqueio removido");
      await loadBlocks();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Agrupa por TMDB ID pra facilitar visualização
  const groupedByTmdb = React.useMemo(() => {
    const map = new Map<number, ServerBlock[]>();
    for (const b of blocks) {
      if (!map.has(b.tmdbId)) map.set(b.tmdbId, []);
      map.get(b.tmdbId)!.push(b);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [blocks]);

  const selectedServer = SERVER_MAP[fServerKey];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-orange-500/20 text-orange-400 rounded-xl">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Conteúdo Bloqueado por Servidor</h2>
            <p className="text-sm text-white/50">
              Ignora um servidor específico para um filme/série — outros servidores continuam disponíveis
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

      {/* Success / Error banners */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Add form */}
      <div className="bg-[#1c1c1e]/60 border border-white/5 backdrop-blur-xl rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white/80 uppercase tracking-wide">
          Adicionar Novo Bloqueio
        </h3>

        {/* === BUSCA POR NOME === */}
        {/* Se já tem um resultado selecionado, mostra ele; senão mostra o input de busca */}
        {fTmdbId ? (
          // Card do item selecionado
          <div className="flex items-center gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2 bg-orange-500/20 rounded-lg shrink-0">
                {fContentType === "series" ? (
                  <Tv className="w-4 h-4 text-orange-400" />
                ) : (
                  <Film className="w-4 h-4 text-orange-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-white font-semibold text-sm truncate">{fTitle}</div>
                <div className="text-white/40 text-xs">
                  TMDB {fTmdbId} • {fContentType === "series" ? "Série" : "Filme"}
                </div>
              </div>
            </div>
            <button
              onClick={clearSelection}
              className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Limpar seleção"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          // Input de busca
          <div className="relative">
            <label className="block text-xs font-semibold text-white/60 mb-1.5">
              Buscar filme ou série pelo nome
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ex: F1, Homem-Aranha, Fantasmas..."
                className="w-full pl-10 pr-3 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-orange-500/50"
                autoComplete="off"
                autoFocus
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 animate-spin" />
              )}
            </div>
            {/* Autocomplete dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute z-30 mt-1 w-full bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={`${r.media_type}-${r.id}`}
                    onClick={() => selectResult(r)}
                    className="w-full flex items-center gap-3 p-2.5 hover:bg-white/5 text-left transition-colors border-b border-white/5 last:border-0"
                  >
                    {r.poster_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w45${r.poster_path}`}
                        alt=""
                        className="w-9 h-12 rounded object-cover shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-9 h-12 bg-white/5 rounded flex items-center justify-center shrink-0">
                        {r.media_type === "tv" ? (
                          <Tv className="w-4 h-4 text-white/30" />
                        ) : (
                          <Film className="w-4 h-4 text-white/30" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-white text-sm font-semibold truncate">{r.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            r.media_type === "tv"
                              ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                              : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                          }`}
                        >
                          {r.media_type === "tv" ? "SÉRIE" : "FILME"}
                        </span>
                        <span className="text-white/40 text-xs">
                          {r.release_date ? r.release_date.slice(0, 4) : "—"} • TMDB {r.id}
                        </span>
                      </div>
                      {r.overview && (
                        <p className="text-white/40 text-xs mt-1 line-clamp-2">{r.overview}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchResults.length === 0 && searchQuery.length >= 2 && !searching && (
              <p className="text-white/40 text-xs mt-2 pl-1">
                Nenhum resultado. Tente outro nome.
              </p>
            )}
          </div>
        )}

        {/* === DROPDOWN CUSTOM DE SERVIDOR (não-nativo) === */}
        <div ref={serverDropdownRef} className="relative">
          <label className="block text-xs font-semibold text-white/60 mb-1.5">
            Servidor a bloquear
          </label>
          <button
            type="button"
            onClick={() => setServerDropdownOpen((o) => !o)}
            disabled={!fTmdbId}
            className={`w-full flex items-center justify-between gap-3 px-3 py-3 bg-black/40 border rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              serverDropdownOpen
                ? "border-orange-500/60"
                : "border-white/10 hover:border-white/20"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {selectedServer ? (
                <>
                  <span
                    className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border font-bold text-xs shrink-0 ${selectedServer.accent}`}
                  >
                    {selectedServer.short}
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="text-white font-semibold text-sm truncate">
                      {selectedServer.label}
                    </div>
                    <div className="text-white/40 text-xs truncate">
                      {selectedServer.description}
                    </div>
                  </div>
                </>
              ) : (
                <span className="text-white/40">Selecione um servidor</span>
              )}
            </div>
            <ChevronDown
              className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${
                serverDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown menu */}
          {serverDropdownOpen && (
            <div className="absolute z-30 mt-1 w-full bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
              {SERVER_DEFS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setFServerKey(s.key);
                    setServerDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 p-3 hover:bg-white/5 text-left transition-colors border-b border-white/5 last:border-0 ${
                    fServerKey === s.key ? "bg-white/5" : ""
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border font-bold text-xs shrink-0 ${s.accent}`}
                  >
                    {s.short}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-white font-semibold text-sm truncate">{s.label}</div>
                    <div className="text-white/40 text-xs truncate">{s.description}</div>
                  </div>
                  {fServerKey === s.key && (
                    <Check className="w-4 h-4 text-orange-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Motivo */}
        <div>
          <label className="block text-xs font-semibold text-white/60 mb-1.5">
            Motivo (opcional — para registro)
          </label>
          <textarea
            value={fReason}
            onChange={(e) => setFReason(e.target.value)}
            rows={2}
            placeholder="Ex: Versão WatchPlayer estava em inglês; outras fontes têm PT-BR"
            className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-orange-500/50 resize-none"
          />
        </div>

        <button
          onClick={handleAddBlock}
          disabled={saving || !fTmdbId}
          className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors cursor-pointer shadow-lg shadow-orange-600/20"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Adicionar Bloqueio
        </button>
      </div>

      {/* Blocks list */}
      <div className="bg-[#1c1c1e]/60 border border-white/5 backdrop-blur-xl rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white/80 uppercase tracking-wide mb-4">
          Bloqueios Ativos ({blocks.length})
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
        ) : blocks.length === 0 ? (
          <div className="text-center py-12 text-white/40 text-sm">
            Nenhum bloqueio ativo. Busque um filme/série acima para começar.
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByTmdb.map(([tmdbId, blocksForTmdb]) => {
              const contentType = blocksForTmdb[0].contentType;
              return (
                <div
                  key={tmdbId}
                  className="border border-white/5 rounded-xl overflow-hidden"
                >
                  {/* Header do grupo */}
                  <div className="bg-black/30 px-4 py-2.5 flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {contentType === "series" ? (
                        <Tv className="w-4 h-4 text-orange-400 shrink-0" />
                      ) : (
                        <Film className="w-4 h-4 text-orange-400 shrink-0" />
                      )}
                      <span className="text-white font-semibold text-sm truncate">
                        {blocksForTmdb[0].title || "—"}
                      </span>
                    </div>
                    <span className="text-white/40 text-xs font-mono shrink-0">
                      TMDB {tmdbId}
                    </span>
                  </div>
                  {/* Lista de servers bloqueados pra esse TMDB */}
                  <div className="divide-y divide-white/5">
                    {blocksForTmdb.map((b) => {
                      const srv = SERVER_MAP[b.serverKey];
                      return (
                        <div
                          key={b.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-white/5"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {srv ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${srv.accent}`}
                                >
                                  <span className="font-mono">{srv.short}</span>
                                  {srv.label}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                                  {b.serverKey}
                                </span>
                              )}
                              <span className="text-white/40 text-xs">
                                {new Date(b.blockedAt).toLocaleString("pt-BR")}
                              </span>
                            </div>
                            {b.reason && (
                              <p className="text-white/60 text-xs mt-1.5 leading-relaxed">
                                {b.reason}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() =>
                              handleDeleteBlock(
                                b.id,
                                `${b.title} → ${srv?.label || b.serverKey}`
                              )
                            }
                            className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Remover bloqueio"
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
