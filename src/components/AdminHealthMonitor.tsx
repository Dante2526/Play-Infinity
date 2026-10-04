import React, { useState, useEffect } from "react";
import { Activity, CheckCircle2, XCircle, Loader2, RefreshCw, Globe, AlertTriangle } from "lucide-react";

interface HealthResult {
  name: string;
  url: string;
  status: "ONLINE" | "OFFLINE";
  latencyMs: number | null;
  statusCode: number;
  error?: string;
}

export function AdminHealthMonitor() {
  const [results, setResults] = useState<HealthResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [error, setError] = useState("");

  const checkHealth = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/diagnostics/health-check");
      const data = await response.json();
      if (data.success) {
        setResults(data.results);
        setLastCheck(new Date(data.timestamp));
      } else {
        setError("Erro ao obter o status de saúde.");
      }
    } catch (err: any) {
      setError(err.message || "Erro de rede ao contactar o servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="bg-[#1c1c1e]/60 border border-white/10 backdrop-blur-xl rounded-[28px] p-6 sm:p-8 shadow-xl animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="text-2xl font-bold text-white">Monitor de Saúde dos Domínios</h3>
          </div>
          <p className="text-white/50 text-sm mt-2 ml-12">
            Verifica em tempo real se os catálogos (Vizer, Encontrei) e provedores de vídeo estão respondendo, ajudando a detectar trocas de domínio silenciosas.
          </p>
        </div>

        <button
          onClick={checkHealth}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Testando..." : "Testar Agora"}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {lastCheck && (
        <p className="text-white/40 text-xs mb-4">
          Última verificação: {lastCheck.toLocaleTimeString()}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((item, idx) => (
          <div 
            key={idx}
            className={`p-4 rounded-xl border flex flex-col gap-2 ${
              item.status === "ONLINE" 
                ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40" 
                : "bg-red-500/5 border-red-500/20 hover:border-red-500/40"
            } transition-colors`}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-white font-bold text-sm truncate pr-2">{item.name}</h4>
              {item.status === "ONLINE" ? (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  ONLINE
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 text-red-400 rounded-lg text-xs font-bold">
                  <XCircle className="w-3.5 h-3.5" />
                  OFFLINE
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-white/50 text-xs font-mono mt-1">
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate" title={item.url}>{new URL(item.url).hostname}</span>
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
              <div className="text-xs text-white/40">
                HTTP {item.statusCode}
              </div>
              {item.latencyMs !== null && (
                <div className="text-xs font-mono text-white/50">
                  {item.latencyMs}ms
                </div>
              )}
            </div>

            {item.error && (
              <div className="mt-2 text-[10px] text-red-400/80 leading-tight">
                {item.error}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {results.length > 0 && results.some(r => r.status === "OFFLINE") && (
        <div className="mt-6 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div className="text-sm text-orange-200/80">
            <p className="font-bold text-orange-400 mb-1">Atenção Necessária</p>
            <p>Um ou mais provedores estão marcados como OFFLINE. Isso geralmente significa que o domínio mudou (ex: vizer.beauty para vizer.website), ou que o servidor está bloqueando as requisições (Cloudflare/CORS).</p>
            <p className="mt-2">Caso seja uma troca de domínio do Vizer ou Encontrei, você precisará atualizar a variável no arquivo <code className="bg-black/30 px-1.5 py-0.5 rounded text-orange-300">encontreiLookup.ts</code> ou <code className="bg-black/30 px-1.5 py-0.5 rounded text-orange-300">videoScrapers.ts</code>.</p>
          </div>
        </div>
      )}
    </div>
  );
}
