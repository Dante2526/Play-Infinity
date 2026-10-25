import React, { useState, useEffect, useCallback } from "react";
import { adminFetch } from "../services/adminApi";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  X,
  Tv,
  Bug,
  Activity,
  Layers,
  ChevronRight,
  ExternalLink,
  Loader2,
  Sparkles
} from "lucide-react";

export interface SentinelAlertItem {
  id: string;
  category: "tv" | "bug" | "scraper" | "deploy" | "system";
  title: string;
  message: string;
  level: "info" | "warning" | "error";
  actionTab: "channels" | "bugs" | "health" | "deploy" | "users";
  actionUrl: string;
  detectedAt: number;
}

export interface SentinelStatusData {
  mood: "happy" | "warning" | "alert";
  activeAlerts: SentinelAlertItem[];
  lastCheckTime: number;
  monitoredCounts: {
    channelsTotal: number;
    channelsDown: number;
    pendingBugs: number;
    cookieOk: boolean;
    activeAdmins: number;
  };
  isProbing: boolean;
}

interface AdminMascotWidgetProps {
  onSelectSection: (section: "users" | "deploy" | "blocks" | "health" | "bugs" | "push" | "channels") => void;
}

export function AdminMascotWidget({ onSelectSection }: AdminMascotWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<SentinelStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [probingNow, setProbingNow] = useState(false);
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testPushFeedback, setTestPushFeedback] = useState<string | null>(null);

  // Busca status do sentinela
  const fetchStatus = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await adminFetch("/api/admin/sentinel/status");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.status) {
          setStatus(data.status);
        }
      }
    } catch (err) {
      console.warn("[AdminMascotWidget] Falha ao obter status do Sentinela:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  // Força checagem imediata
  const handleCheckNow = async () => {
    if (probingNow) return;
    setProbingNow(true);
    try {
      const res = await adminFetch("/api/admin/sentinel/check-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forcePush: false })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.status) {
          setStatus(data.status);
        }
      }
    } catch (err) {
      console.warn("[AdminMascotWidget] Erro ao forçar checagem:", err);
    } finally {
      setProbingNow(false);
    }
  };

  // Dispara push de teste para o celular do admin
  const handleTestPush = async () => {
    if (testPushLoading) return;
    setTestPushLoading(true);
    setTestPushFeedback(null);
    try {
      const res = await adminFetch("/api/admin/sentinel/test-push", {
        method: "POST"
      });
      const data = await res.json();
      if (data.success) {
        const count = data.sentCount || 0;
        setTestPushFeedback(count > 0
          ? `Push enviado para ${count} aparelho(s)!`
          : "Nenhum aparelho admin registrado ainda.");
      } else {
        setTestPushFeedback("Erro ao enviar push de teste.");
      }
    } catch {
      setTestPushFeedback("Falha na requisição de push.");
    } finally {
      setTestPushLoading(false);
      setTimeout(() => setTestPushFeedback(null), 4000);
    }
  };

  useEffect(() => {
    fetchStatus(true);
    const interval = setInterval(() => {
      fetchStatus(false);
    }, 30000); // 30 segundos
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const mood = status?.mood || "happy";
  const alerts = status?.activeAlerts || [];
  const alertCount = alerts.length;

  // Cores dinâmicas por humor
  const moodColors = {
    happy: {
      aura: "bg-emerald-500/20",
      accent: "#10b981",
      badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      glowClass: "filter drop-shadow-[0_0_8px_rgba(16,185,129,0.7)]"
    },
    warning: {
      aura: "bg-orange-500/25",
      accent: "#f59e0b",
      badge: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      glowClass: "filter drop-shadow-[0_0_8px_rgba(245,158,11,0.7)]"
    },
    alert: {
      aura: "bg-red-500/30",
      accent: "#ef4444",
      badge: "bg-red-500/20 text-red-400 border-red-500/30",
      glowClass: "filter drop-shadow-[0_0_10px_rgba(239,68,68,0.85)]"
    }
  }[mood];

  return (
    <>
      {/* Botão Flutuante do Mascote (Canto Inferior Direito) */}
      <aside
        aria-label="Assistente Byte"
        className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6 flex flex-col items-end pointer-events-auto select-none"
      >
        {/* Balão de fala sutil quando recolhido com alertas */}
        {!isOpen && alertCount > 0 && (
          <div
            onClick={() => setIsOpen(true)}
            role="button"
            tabIndex={0}
            className="mb-2 px-3 py-1.5 rounded-2xl bg-[#18181b]/95 border border-red-500/40 text-white text-xs font-semibold shadow-2xl backdrop-blur-md flex items-center gap-1.5 animate-bounce cursor-pointer max-w-[220px] truncate"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
            <span className="truncate">{alertCount} {alertCount === 1 ? "alerta pendente!" : "alertas pendentes!"}</span>
          </div>
        )}

        {/* Botão de Pílula com o Mascote */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`group flex items-center gap-2.5 p-1.5 pr-3 sm:pr-4 rounded-full border shadow-2xl backdrop-blur-xl transition-all duration-300 min-h-[48px] min-w-[48px] ${
            isOpen
              ? "bg-[#1f1f23] border-white/20 scale-105"
              : mood === "alert"
              ? "bg-[#18181b]/90 border-red-500/50 hover:border-red-500 shadow-red-500/20"
              : mood === "warning"
              ? "bg-[#18181b]/90 border-orange-500/40 hover:border-orange-500 shadow-orange-500/20"
              : "bg-[#18181b]/90 border-emerald-500/30 hover:border-emerald-500 shadow-emerald-500/10"
          }`}
          title="Guardião Byte - Clique para ver o status da plataforma"
        >
          {/* Container do Mascote SVG Miniatura */}
          <div className="relative w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center shrink-0">
            <div className={`absolute inset-0 rounded-full blur-md ${moodColors.aura}`} />
            
            {/* SVG do Mascote */}
            <svg
              className="w-8 h-8 sm:w-9 sm:h-9 relative z-10 transition-transform duration-300 group-hover:scale-110"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Antena */}
              <line x1="50" y1="22" x2="50" y2="10" stroke="#71717a" strokeWidth="3" strokeLinecap="round" />
              <circle cx="50" cy="8" r="5" fill={moodColors.accent} />

              {/* Orelhas */}
              <rect x="18" y="38" width="6" height="18" rx="3" fill="#3f3f46" />
              <rect x="76" y="38" width="6" height="18" rx="3" fill="#3f3f46" />
              <circle cx="21" cy="47" r="2" fill={moodColors.accent} />
              <circle cx="79" cy="47" r="2" fill={moodColors.accent} />

              {/* Cabeça */}
              <rect x="24" y="22" width="52" height="48" rx="18" fill="#18181b" stroke="#3f3f46" strokeWidth="2.5" />
              {/* Visor */}
              <rect x="29" y="30" width="42" height="30" rx="12" fill="#09090b" stroke="#27272a" strokeWidth="1.5" />

              {/* Expressões dos Olhos */}
              {mood === "alert" ? (
                <g className={moodColors.glowClass}>
                  <circle cx="39" cy="44" r="6" fill="#ef4444" />
                  <path d="M36 41 L42 47 M42 41 L36 47" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="61" cy="44" r="6" fill="#ef4444" />
                  <path d="M58 41 L64 47 M64 41 L58 47" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
                  <ellipse cx="50" cy="53" rx="3.5" ry="4" fill="#ef4444" />
                </g>
              ) : mood === "warning" ? (
                <g className={moodColors.glowClass}>
                  <ellipse cx="40" cy="44" rx="4.5" ry="5.5" fill="#f59e0b" />
                  <circle cx="42" cy="42" r="1.5" fill="#ffffff" />
                  <ellipse cx="60" cy="44" rx="4.5" ry="5.5" fill="#f59e0b" />
                  <circle cx="62" cy="42" r="1.5" fill="#ffffff" />
                  <line x1="46" y1="52" x2="54" y2="52" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                </g>
              ) : (
                <g className={moodColors.glowClass}>
                  <ellipse cx="40" cy="44" rx="4.5" ry="6" fill="#10b981" />
                  <circle cx="42" cy="42" r="1.5" fill="#ffffff" />
                  <ellipse cx="60" cy="44" rx="4.5" ry="6" fill="#10b981" />
                  <circle cx="62" cy="42" r="1.5" fill="#ffffff" />
                  <path d="M46 51 Q50 54 54 51" stroke="#10b981" strokeWidth="2" strokeLinecap="round" fill="none" />
                </g>
              )}

              {/* Propulsor Base */}
              <ellipse cx="50" cy="72" rx="8" ry="2.5" fill="#3f3f46" />
              <polygon points="45,74 55,74 50,81" fill={moodColors.accent} opacity="0.85" />
            </svg>
          </div>

          {/* Rótulo de Texto + Indicador */}
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-white font-black text-xs tracking-wide">Byte</span>
              {alertCount > 0 && (
                <span className="px-1.5 py-0.2 bg-red-500 text-white font-bold text-[10px] rounded-full shrink-0">
                  {alertCount}
                </span>
              )}
            </div>
            <span className="text-[10px] text-white/50 leading-tight">
              {mood === "alert" ? "Quedas detectadas" : mood === "warning" ? "Requer atenção" : "100% Online"}
            </span>
          </div>
        </button>

        {/* Modal / Card Expansível do Mascote */}
        {isOpen && (
          <div className="absolute bottom-16 right-0 w-[calc(100vw-32px)] max-w-sm sm:w-96 bg-[#121214]/95 border border-white/15 rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-2xl flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header do Card */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${mood === "alert" ? "bg-red-500 animate-pulse" : mood === "warning" ? "bg-orange-500" : "bg-emerald-500"}`} />
                <h3 className="text-white font-bold text-sm tracking-wide truncate">
                  Guardião da Plataforma
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Balão de Fala do Mascote */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs leading-relaxed font-medium">
                  {alertCount === 0
                    ? "Tudo funcionando perfeitamente, chefe! Todos os canais, bugs e conexões estão sob controle."
                    : alertCount === 1
                    ? "Atenção chefe: encontrei 1 ocorrência que requer sua ação no painel."
                    : `Atenção chefe: encontrei ${alertCount} ocorrências que precisam de atenção no painel.`}
                </p>
                {status?.lastCheckTime ? (
                  <span className="text-[10px] text-white/40 block mt-1">
                    Última verificação: {new Date(status.lastCheckTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Lista de Alertas Ativos */}
            {alerts.length > 0 ? (
              <div className="max-h-52 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {alerts.map((al) => (
                  <div
                    key={al.id}
                    className={`p-2.5 sm:p-3 rounded-2xl border transition-all ${
                      al.level === "error"
                        ? "bg-red-500/10 border-red-500/30 text-red-200"
                        : "bg-orange-500/10 border-orange-500/30 text-orange-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {al.category === "tv" ? (
                          <Tv className="w-4 h-4 text-orange-400 shrink-0" />
                        ) : al.category === "bug" ? (
                          <Bug className="w-4 h-4 text-red-400 shrink-0" />
                        ) : (
                          <Activity className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <h4 className="text-xs font-bold text-white truncate">{al.title}</h4>
                      </div>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-black/40 text-white/60 font-mono shrink-0">
                        {al.level}
                      </span>
                    </div>

                    <p className="text-[11px] text-white/70 mt-1 leading-snug">
                      {al.message}
                    </p>

                    {/* Botão de Salto Rápido para a Aba */}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSection(al.actionTab);
                        setIsOpen(false);
                      }}
                      className="mt-2 w-full py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 active:scale-98 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all"
                    >
                      <span>Abrir na Aba {al.actionTab === "channels" ? "TV Ao Vivo" : al.actionTab === "bugs" ? "Bugs" : "Scrapers"}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-orange-400" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              /* Resumo dos Contadores Quando Tudo Está 100% */
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-2xl bg-black/30 border border-white/5 flex flex-col">
                  <span className="text-white/40 text-[10px]">TV Ao Vivo</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-white font-bold text-xs">{status?.monitoredCounts?.channelsTotal || 39} Canais OK</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-2xl bg-black/30 border border-white/5 flex flex-col">
                  <span className="text-white/40 text-[10px]">Bugs Pendentes</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-white font-bold text-xs">0 Pendentes</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-2xl bg-black/30 border border-white/5 flex flex-col">
                  <span className="text-white/40 text-[10px]">Cookie Encontrei</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-white font-bold text-xs">Válido & Ativo</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-2xl bg-black/30 border border-white/5 flex flex-col">
                  <span className="text-white/40 text-[10px]">Dispositivos Admin</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Bell className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-white font-bold text-xs">{status?.monitoredCounts?.activeAdmins || 1} Registrado(s)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Ações do Rodapé: Verificar Agora + Push de Teste */}
            <div className="flex items-center gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={handleCheckNow}
                disabled={probingNow}
                className="flex-1 py-2 px-3 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-orange-600/20 active:scale-95"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${probingNow ? "animate-spin" : ""}`} />
                <span>{probingNow ? "Testando..." : "Testar Agora"}</span>
              </button>

              <button
                type="button"
                onClick={handleTestPush}
                disabled={testPushLoading}
                className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white/80 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
                title="Envia notificação push teste para o seu celular"
              >
                {testPushLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-purple-400" />
                )}
                <span>Testar Push</span>
              </button>
            </div>

            {testPushFeedback && (
              <p className="text-[11px] text-center font-medium text-orange-400 animate-in fade-in">
                {testPushFeedback}
              </p>
            )}

          </div>
        )}
      </aside>
    </>
  );
}
