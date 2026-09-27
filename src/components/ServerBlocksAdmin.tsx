import React, { useState, useEffect, useCallback } from "react";
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

const SERVER_LABELS: Record<string, string> = {
  srv_watchplay: "WatchPlayer",
  srv_mixdrop: "MixDrop",
  srv_vip: "VIP Player",
  srv_nixplay: "Nixplay",
  srv_vidsrc: "Seriesflix HD",
};

const SERVER_OPTIONS = Object.entries(SERVER_LABELS).map(([key, label]) => ({
  key,
  label,
}));

export function ServerBlocksAdmin() {
  const [blocks, setBlocks] = useState<ServerBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [fTmdbId, setFTmdbId] = useState<string>("");
  const [fServerKey, setFServerKey] = useState<string>("srv_watchplay");
  const [fContentType, setFContentType] = useState<"movie" | "series">("movie");
  const [fTitle, setFTitle] = useState<string>("");
  const [fReason, setFReason] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Busca por TMDB ID (autocomplete via TMDB proxy)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ id: number; title: string; release_date?: string; poster_path?: string; media_type?: string }>
  >([]);
  const [searching, setSearching] = useState(false);

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

  // Busca no TMDB via /api/tmdb (proxy que oculta a chave)
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      // Tenta como número primeiro (TMDB ID direto)
      const asNum = parseInt(q, 10);
      if (!isNaN(asNum) && /^\d+$/.test(q)) {
        const r = await fetch(`/api/tmdb?path=movie/${asNum}&language=pt-BR`);
        if (r.ok) {
          const d = await r.json();
          if (d.id) {
            setSearchResults([
              {
                id: d.id,
                title: d.title || d.name || `TMDB ${d.id}`,
                release_date: d.release_date,
                poster_path: d.poster_path,
                media_type: "movie",
              },
            ]);
          }
        }
      } else {
        // Busca por título (multi — inclui tv e movie)
        const r = await fetch(`/api/tmdb?path=search/multi&query=${encodeURIComponent(q)}&language=pt-BR&page=1`);
        if (r.ok) {
          const d = await r.json();
          const results = (d.results || [])
            .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
            .slice(0, 8)
            .map((r: any) => ({
              id: r.id,
              title: r.title || r.name,
              release_date: r.release_date || r.first_air_date,
              poster_path: r.poster_path,
              media_type: r.media_type,
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

  // Quando seleciona um resultado da busca, preenche o form
  const selectResult = (r: typeof searchResults[number]) => {
    setFTmdbId(String(r.id));
    setFTitle(r.title || "");
    setFContentType((r.media_type as "movie" | "series") || "movie");
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleAddBlock = async () => {
    setError(null);
    setSuccess(null);

    const tmdbIdNum = parseInt(fTmdbId, 10);
    if (isNaN(tmdbIdNum) || tmdbIdNum <= 0) {
      setError("TMDB ID inválido");
      return;
    }
    if (!fTitle.trim()) {
      setError("Título é obrigatório (pra identificação na lista)");
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
          tmdbId: tmdbIdNum,
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
      setSuccess(`Bloqueio adicionado: ${fTitle} → ${SERVER_LABELS[fServerKey]}`);
      setFTmdbId("");
      setFTitle("");
      setFReason("");
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

        {/* Search bar with autocomplete */}
        <div className="relative">
          <label className="block text-xs font-semibold text-white/60 mb-1.5">
            Buscar filme/série (por título ou TMDB ID)
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ex: F1, Homem-Aranha, 911430..."
              className="w-full pl-10 pr-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-orange-500/50"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 animate-spin" />
            )}
          </div>
          {/* Autocomplete dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute z-30 mt-1 w-full bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
              {searchResults.map((r) => (
                <button
                  key={`${r.media_type}-${r.id}`}
                  onClick={() => selectResult(r)}
                  className="w-full flex items-center gap-3 p-2.5 hover:bg-white/5 text-left transition-colors"
                >
                  {r.poster_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w45${r.poster_path}`}
                      alt=""
                      className="w-9 h-12 rounded object-cover shrink-0"
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
                    <div className="text-white/40 text-xs">
                      TMDB {r.id} • {r.media_type === "tv" ? "Série" : "Filme"}
                      {r.release_date ? ` • ${r.release_date.slice(0, 4)}` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Form grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5">TMDB ID</label>
            <input
              type="number"
              value={fTmdbId}
              onChange={(e) => setFTmdbId(e.target.value)}
              placeholder="911430"
              className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-orange-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5">Título (identificação)</label>
            <input
              type="text"
              value={fTitle}
              onChange={(e) => setFTitle(e.target.value)}
              placeholder="F1: O Filme"
              className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-orange-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5">Tipo</label>
            <select
              value={fContentType}
              onChange={(e) => setFContentType(e.target.value as "movie" | "series")}
              className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500/50"
            >
              <option value="movie">Filme</option>
              <option value="series">Série</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5">Servidor a bloquear</label>
            <select
              value={fServerKey}
              onChange={(e) => setFServerKey(e.target.value)}
              className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500/50"
            >
              {SERVER_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/60 mb-1.5">
            Motivo (opcional — pra registro)
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
          disabled={saving || !fTmdbId || !fTitle}
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
            Nenhum bloqueio ativo. Adicione acima.
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByTmdb.map(([tmdbId, blocksForTmdb]) => (
              <div
                key={tmdbId}
                className="border border-white/5 rounded-xl overflow-hidden"
              >
                {/* Header do grupo */}
                <div className="bg-black/30 px-4 py-2.5 flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {blocksForTmdb[0].contentType === "series" ? (
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
                  {blocksForTmdb.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-white/5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                            {SERVER_LABELS[b.serverKey] || b.serverKey}
                          </span>
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
                            `${b.title} → ${SERVER_LABELS[b.serverKey] || b.serverKey}`
                          )
                        }
                        className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Remover bloqueio"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
