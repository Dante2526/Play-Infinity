import React, { useState, useEffect } from "react";
import { AlertTriangle, X, RefreshCw, CheckCircle2 } from "lucide-react";

interface EncontreiStatus {
  success: boolean;
  cookieConfigured: boolean;
  breakerActive: boolean;
  breakerUntil: number;
  breakerMsRemaining: number;
  inflightCount: number;
  negativeCacheCount: number;
  cookieSource: string;
  timestamp: number;
  error?: string;
}

/**
 * Banner automático que aparece no painel admin quando:
 * 1. ENCONTREI_COOKIE não tá configurado no .env
 * 2. Circuit breaker ativo (cookie expirou ou foi invalidado pelo encontrei.me)
 *
 * Faz polling de /api/admin/encontrei-status a cada 60s.
 * Some sozinho quando o problema é resolvido (cookie renovado e breaker expira).
 */
export function EncontreiCookieAlert() {
  const [status, setStatus] = useState<EncontreiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const { adminFetch } = await import("../services/adminApi");
      const response = await adminFetch("/api/admin/encontrei-status");
      const data = await response.json();
      setStatus(data);
      // Reset dismiss quando o problema some
      if (data.success && !data.breakerActive && data.cookieConfigured) {
        setDismissed(false);
      }
    } catch (err: any) {
      // Silencioso — provavelmente usuário não é admin ou endpoint offline
      // Não mostrar erro pra não poluir painel
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 60000); // 60s
    return () => clearInterval(interval);
  }, []);

  // Não renderizar nada se:
  // - Ainda carregando pela primeira vez
  // - Status OK (cookie configurado + breaker não ativo)
  // - Usuário dispensou o banner
  if (!status || !status.success) return null;
  if (status.cookieConfigured && !status.breakerActive) return null;
  if (dismissed) return null;

  const minutesRemaining = Math.ceil((status.breakerMsRemaining || 0) / 60000);

  // Cenário 1: cookie não configurado no .env
  if (!status.cookieConfigured) {
    return (
      <div className="bg-red-500/10 border border-red-500/40 backdrop-blur-xl rounded-2xl p-4 sm:p-5 mb-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-red-500/20 text-red-400 rounded-xl flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-red-300 font-semibold text-sm sm:text-base mb-1">
              ENCONTREI_COOKIE não configurado
            </h3>
            <p className="text-red-200/80 text-xs sm:text-sm leading-relaxed">
              O resolver live do encontrei.me tá desativado. Sem o cookie, o sistema
              cai só no catálogo estático + Vizer (que cobre a maioria, mas episódios
              recentes podem não ter).
            </p>
            <p className="text-red-200/60 text-xs mt-2">
              <span className="font-mono">.env</span> precisa de:{" "}
              <code className="bg-black/30 px-1.5 py-0.5 rounded text-red-300">
                ENCONTREI_COOKIE=ips4_member_id=...; ips4_login_key=...
              </code>
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-red-300/60 hover:text-red-200 transition-colors flex-shrink-0"
            aria-label="Dispensar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Cenário 2: cookie configurado mas breaker ativo (expirou)
  return (
    <div className="bg-amber-500/10 border border-amber-500/40 backdrop-blur-xl rounded-2xl p-4 sm:p-5 mb-4 shadow-xl animate-pulse">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl flex-shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-amber-300 font-semibold text-sm sm:text-base mb-1">
            Cookie do encontrei.me expirou
          </h3>
          <p className="text-amber-200/80 text-xs sm:text-sm leading-relaxed">
            O resolver AJAX live tá em pausa (circuit breaker ativo). O encontrei.me
            respondeu com redirect pra <code className="bg-black/30 px-1 rounded">/login/</code>{" "}
            ou conteúdo non-JSON — cookie inválido.
          </p>
          {status.breakerMsRemaining > 0 && (
            <p className="text-amber-200/60 text-xs mt-2">
              Próxima tentativa em <span className="font-semibold">~{minutesRemaining}min</span>.
              Enquanto isso, sistema cai pra Vizer live + catálogo estático.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button
              onClick={checkStatus}
              disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Rechecar
            </button>
            <span className="text-amber-200/40 text-xs">
              (auto-refresh a cada 60s)
            </span>
          </div>
          <p className="text-amber-200/70 text-xs mt-3 leading-relaxed">
            <span className="font-semibold">Como resolver:</span> faça login no{" "}
            <a
              href="https://encontrei.me"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-amber-100"
            >
              encontrei.me
            </a>{" "}
            marcando "Manter-me conectado", pegue o cookie novo (F12 → Application →
            Cookies → copiar ips4_*), e atualize a variável{" "}
            <code className="bg-black/30 px-1 rounded">ENCONTREI_COOKIE</code> no{" "}
            <code className="bg-black/30 px-1 rounded">.env</code> da VPS. Depois:{" "}
            <code className="bg-black/30 px-1 rounded">pm2 restart play-infinity-app</code>.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-amber-300/60 hover:text-amber-200 transition-colors flex-shrink-0"
          aria-label="Dispensar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Pequeno badge "OK" opcional pra mostrar quando tudo tá saudável.
 * Pode ser usado no header do painel admin.
 */
export function EncontreiCookieBadge() {
  const [status, setStatus] = useState<EncontreiStatus | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const { adminFetch } = await import("../services/adminApi");
        const response = await adminFetch("/api/admin/encontrei-status");
        const data = await response.json();
        setStatus(data);
      } catch {}
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!status || !status.success) return null;
  if (!status.cookieConfigured || status.breakerActive) return null;

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/15 text-emerald-300 text-xs font-medium rounded-full border border-emerald-500/30">
      <CheckCircle2 className="w-3 h-3" />
      encontrei.me live: OK
    </div>
  );
}
