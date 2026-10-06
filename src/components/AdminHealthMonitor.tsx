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

interface EncontreiStatus {
  success: boolean;
  cookieConfigured: boolean;
  breakerActive: boolean;
  breakerMsRemaining: number;
  inflightCount: number;
  negativeCacheCount: number;
}

export function AdminHealthMonitor() {
  const [results, setResults] = useState<HealthResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [error, setError] = useState("");
  // NOVO: status específico do circuit breaker do encontrei (cookie expirado?)
  const [encontreiStatus, setEncontreiStatus] = useState<EncontreiStatus | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    setError("");
    try {
      const { adminFetch } = await import("../services/adminApi");
      const response = await adminFetch("/api/admin/health-check");
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

  // NOVO: checa estado do circuit breaker do encontrei (paralelo ao health check)
  const checkEncontreiStatus = async () => {
    try {
      const { adminFetch } = await import("../services/adminApi");
      const r = await adminFetch("/api/admin/encontrei-status");
      const data = await r.json();
      if (data.success) setEncontreiStatus(data);
    } catch {
      // silencioso — só admin vê, e se falhar aqui não afeta o health check principal
    }
  };

  useEffect(() => {
    checkHealth();
    checkEncontreiStatus();
    // Auto-refresh a cada 60s pra detectar mudanças de status automaticamente
    // (ex: cookie do encontrei.me expirou e circuit breaker ativou)
    const interval = setInterval(() => {
      checkHealth();
      checkEncontreiStatus();
    }, 60000);
    return () => clearInterval(interval);
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
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 whitespace-nowrap shrink-0"
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
        {results.map((item, idx) => {
          // NOVO: detecta se é o card do encontrei pra turbinar com status do cookie
          const isEncontreiCard = item.name.toLowerCase().includes("encontrei");
          const encontreiCookieOk = encontreiStatus?.cookieConfigured && !encontreiStatus?.breakerActive;
          const cookieExpired = encontreiStatus?.breakerActive === true;
          const cookieMissing = encontreiStatus?.cookieConfigured === false;
          const encontreiProblem = isEncontreiCard && (cookieExpired || cookieMissing);
          const minutesRemaining = encontreiStatus ? Math.ceil(encontreiStatus.breakerMsRemaining / 60000) : 0;

          return (
          <div 
            key={idx}
            className={`p-4 rounded-xl border flex flex-col gap-2 ${
              encontreiProblem
                ? "bg-amber-500/5 border-amber-500/40 hover:border-amber-500/60 animate-pulse" // destaque âmbar pulsante
                : item.status === "ONLINE" 
                  ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40" 
                  : "bg-red-500/5 border-red-500/20 hover:border-red-500/40"
            } transition-colors`}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-white font-bold text-sm truncate pr-2">{item.name}</h4>
              {item.status === "ONLINE" && !encontreiProblem ? (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  ONLINE
                </div>
              ) : encontreiProblem ? (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/30 text-amber-300 rounded-lg text-xs font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {cookieMissing ? "SEM COOKIE" : "COOKIE EXPIRADO"}
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
              <span className="truncate" title={item.url}>{(() => {
                try { return new URL(item.url).hostname; } catch { return item.url; }
              })()}</span>
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

            {item.error && !encontreiProblem && (
              <div className="mt-2 text-[10px] text-red-400/80 leading-tight">
                {item.error}
              </div>
            )}

            {/* NOVO: alerta especial pra cookie do encontrei dentro do próprio card */}
            {encontreiProblem && (
              <div className="mt-3 pt-3 border-t border-amber-500/20 text-xs leading-relaxed">
                <p className="text-amber-300 font-bold flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {cookieMissing
                    ? "ENCONTREI_COOKIE não configurado no .env"
                    : "Cookie de sessão expirou ou foi invalidado"}
                </p>
                <p className="text-amber-200/70 mb-2">
                  {cookieMissing
                    ? "Resolver AJAX live desativado. Sistema cai só em catálogo estático + Vizer."
                    : `Resolver em pausa (circuit breaker ativo). Retoma em ~${minutesRemaining}min. Enquanto isso, cai pra Vizer.`}
                </p>
                <div className="text-amber-200/60 text-[10px] space-y-0.5">
                  <p><span className="font-semibold">Como resolver:</span></p>
                  <ol className="list-decimal ml-4 space-y-0.5">
                    <li>Faça login no <a href="https://encontrei.me" target="_blank" rel="noopener" className="underline">encontrei.me</a> marcando "Manter-me conectado"</li>
                    <li>F12 → Application → Cookies → copie os valores <code className="bg-black/40 px-1 rounded">ips4_*</code></li>
                    <li>No VPS: edite <code className="bg-black/40 px-1 rounded">.env</code> e atualize a linha <code className="bg-black/40 px-1 rounded">ENCONTREI_COOKIE=...</code></li>
                    <li>Rode: <code className="bg-black/40 px-1 rounded">pm2 restart play-infinity-app --update-env</code></li>
                  </ol>
                </div>
                {encontreiStatus && encontreiStatus.inflightCount > 0 && (
                  <p className="text-amber-200/40 text-[10px] mt-2">
                    Stats: {encontreiStatus.inflightCount} chamadas em voo, {encontreiStatus.negativeCacheCount} em negative cache.
                  </p>
                )}
              </div>
            )}
          </div>
          );
        })}
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
