import React, { useState, useEffect, useCallback, useRef } from "react";
import { adminFetch } from "../services/adminApi";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Tv,
  Bug,
  Activity,
  Layers,
  ChevronRight,
  ExternalLink,
  ShieldCheck
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
    vizerOk?: boolean;
    activeAdmins: number;
  };
  isProbing: boolean;
}

interface AdminMascotWidgetProps {
  onSelectSection: (section: "users" | "deploy" | "blocks" | "health" | "bugs" | "push" | "channels") => void;
}

// ============================================================================
// Posição arrastável do Byte (persistida por dispositivo via localStorage)
// ============================================================================
const BYTE_POS_STORAGE_KEY = "playinfinity:byteWidgetPos:v1";
const BYTE_EDGE_MARGIN = 10; // px — folga mínima das bordas da tela
const BYTE_DRAG_THRESHOLD = 6; // px — abaixo disso é clique, não arrasto

interface BytePosition {
  x: number;
  y: number;
}

function readSavedPosition(): BytePosition | null {
  try {
    const raw = localStorage.getItem(BYTE_POS_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.x !== "number" || typeof p?.y !== "number" || !isFinite(p.x) || !isFinite(p.y)) {
      return null;
    }
    return { x: p.x, y: p.y };
  } catch {
    return null; // storage indisponível (modo privado etc.) — usa o canto padrão
  }
}

function clampToViewport(p: BytePosition, el?: HTMLElement | null): BytePosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Tamanho real do widget; estimativa quando o elemento ainda não existe
  const w = el?.offsetWidth || 104;
  const h = el?.offsetHeight || 48;
  const maxX = Math.max(BYTE_EDGE_MARGIN, vw - w - BYTE_EDGE_MARGIN);
  const maxY = Math.max(BYTE_EDGE_MARGIN, vh - h - BYTE_EDGE_MARGIN);
  return {
    x: Math.min(Math.max(BYTE_EDGE_MARGIN, p.x), maxX),
    y: Math.min(Math.max(BYTE_EDGE_MARGIN, p.y), maxY),
  };
}

function persistPosition(p: BytePosition) {
  try {
    localStorage.setItem(BYTE_POS_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage cheio/indisponível — posição vale só pra sessão atual */
  }
}

export function AdminMascotWidget({ onSelectSection }: AdminMascotWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<SentinelStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [probingNow, setProbingNow] = useState(false);

  // ===== Byte arrastável: posição, gesto de arrasto e memorização =====
  const asideRef = useRef<HTMLElement | null>(null);
  // null = canto padrão (inferior direito, via classes); objeto = posição custom salva
  const [pos, setPos] = useState<BytePosition | null>(() => {
    const saved = readSavedPosition();
    return saved ? clampToViewport(saved) : null;
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    moved: boolean;
    last: BytePosition;
  } | null>(null);
  const swallowClickRef = useRef(false);

  // Re-ajusta na montagem (tamanho real) e quando a janela muda de tamanho/gira
  useEffect(() => {
    setPos((p) => (p ? clampToViewport(p, asideRef.current) : p));
    const onViewportChange = () => setPos((p) => (p ? clampToViewport(p, asideRef.current) : p));
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
    };
  }, []);

  const beginDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return; // só botão esquerdo
    const aside = asideRef.current;
    if (!aside) return;
    swallowClickRef.current = false; // novo gesto começa limpo
    const rect = aside.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      // Sem posição salva o widget fica ancorado por classes (bottom/right):
      // parte da posição real medida na tela na hora do gesto
      origLeft: pos?.x ?? rect.left,
      origTop: pos?.y ?? rect.top,
      moved: false,
      last: pos ?? { x: rect.left, y: rect.top },
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* navegador sem pointer capture — arrasto via move/up ainda funciona */
    }
  };

  const moveDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dx) < BYTE_DRAG_THRESHOLD && Math.abs(dy) < BYTE_DRAG_THRESHOLD) return;
      d.moved = true;
      setDragging(true);
      setIsOpen(false); // card fecha durante o arrasto
    }
    d.last = clampToViewport({ x: d.origLeft + dx, y: d.origTop + dy }, asideRef.current);
    // Atualiza o DOM direto (sem re-render) pra manter 60fps no arrasto
    const aside = asideRef.current;
    if (aside) {
      aside.style.left = `${d.last.x}px`;
      aside.style.top = `${d.last.y}px`;
      aside.style.right = "auto";
      aside.style.bottom = "auto";
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!d.moved) return; // foi um toque/clique comum — deixa o onClick agir
    setDragging(false);
    // O clique sintético disparado logo após soltar não deve abrir o card
    swallowClickRef.current = true;
    const final = clampToViewport(d.last, asideRef.current);
    setPos(final);
    persistPosition(final); // 🧠 memoriza onde o Byte ficou
  };

  const handleWidgetClick = () => {
    if (swallowClickRef.current) {
      swallowClickRef.current = false;
      return;
    }
    setIsOpen((prev) => !prev);
  };

  // Duplo clique restaura o canto padrão (inferior direito)
  const handleWidgetDoubleClick = () => {
    swallowClickRef.current = false;
    try {
      localStorage.removeItem(BYTE_POS_STORAGE_KEY);
    } catch {
      /* ignora */
    }
    setPos(null);
    setIsOpen(false);
    // Limpa estilos inline aplicados manualmente durante o último arrasto
    const aside = asideRef.current;
    if (aside) {
      aside.style.left = "";
      aside.style.top = "";
      aside.style.right = "";
      aside.style.bottom = "";
    }
  };

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

  useEffect(() => {
    fetchStatus(true);
    const interval = setInterval(() => {
      fetchStatus(false);
    }, 30000); // 30 segundos
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const rawMood = status?.mood || "happy";
  const alerts = status?.activeAlerts || [];
  const alertCount = alerts.length;

  // Modo noturno automático (00:00 às 06:00) quando está tudo 100% online
  // Permite também testar imediatamente via query param ?byte=sleep ou ?byte=blue
  const isNightHour = (() => {
    try {
      const h = new Date().getHours();
      const params = new URLSearchParams(window.location.search);
      return (h >= 0 && h < 6) || params.get("byte") === "sleep" || params.get("byte") === "blue";
    } catch {
      const h = new Date().getHours();
      return h >= 0 && h < 6;
    }
  })();
  const mood: "happy" | "warning" | "alert" | "sleep" = (rawMood === "happy" && alertCount === 0 && isNightHour) ? "sleep" : rawMood;

  // Mantém o Byte dentro da tela quando o balão de alertas aparece/some
  // (a altura do aside muda e o botão pode encostar na borda)
  useEffect(() => {
    setPos((p) => (p ? clampToViewport(p, asideRef.current) : p));
  }, [alertCount, isOpen]);

  // Direção de abertura do card conforme o canto em que o Byte foi deixado
  const openUpward = !pos ? true : pos.y > window.innerHeight / 2;
  const alignRight = !pos ? true : pos.x > window.innerWidth / 2;

  // Cores dinâmicas por humor
  const moodColors = {
    happy: {
      aura: "bg-emerald-500/20",
      accent: "#10b981",
      badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      glowClass: "filter drop-shadow-[0_0_8px_rgba(16,185,129,0.7)]"
    },
    sleep: {
      aura: "bg-cyan-500/20",
      accent: "#06b6d4",
      badge: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
      glowClass: "filter drop-shadow-[0_0_8px_rgba(6,182,212,0.7)]"
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
        ref={asideRef}
        aria-label="Assistente Byte"
        className={`fixed flex flex-col items-end pointer-events-auto select-none ${
          dragging ? "z-50" : "z-40"
        }${pos ? "" : " bottom-4 right-4 sm:bottom-6 sm:right-6"}`}
        style={
          pos
            ? { left: `${pos.x}px`, top: `${pos.y}px`, right: "auto", bottom: "auto" }
            : undefined
        }
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
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={handleWidgetClick}
          onDoubleClick={handleWidgetDoubleClick}
          style={{ touchAction: "none" }}
          className={`group flex items-center gap-2.5 p-1.5 pr-3 sm:pr-4 rounded-full border shadow-2xl backdrop-blur-xl transition-all duration-300 min-h-[48px] min-w-[48px] cursor-grab ${
            dragging ? "cursor-grabbing scale-105" : ""
          } ${
            isOpen
              ? "bg-[#1f1f23] border-white/20 scale-105"
              : mood === "alert"
              ? "bg-[#18181b]/90 border-red-500/50 hover:border-red-500 shadow-red-500/20"
              : mood === "warning"
              ? "bg-[#18181b]/90 border-orange-500/40 hover:border-orange-500 shadow-orange-500/20"
              : mood === "sleep"
              ? "bg-[#18181b]/90 border-cyan-500/40 hover:border-cyan-400 shadow-cyan-500/20"
              : "bg-[#18181b]/90 border-emerald-500/30 hover:border-emerald-500 shadow-emerald-500/10"
          }`}
          title="Guardião Byte — clique para o status, arraste para mover, duplo clique volta pro canto padrão"
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
              ) : mood === "sleep" ? (
                <g className={moodColors.glowClass}>
                  {/* Olhos Fechados Dormindo */}
                  <path d="M35 44 Q40 48 45 44" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  <path d="M55 44 Q60 48 65 44" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  {/* Zzz sutil */}
                  <text x="68" y="32" fill="#06b6d4" fontSize="9" fontWeight="bold" opacity="0.85">z</text>
                  <text x="74" y="24" fill="#06b6d4" fontSize="11" fontWeight="bold">Z</text>
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
              {mood === "alert" ? "Quedas detectadas" : mood === "warning" ? "Requer atenção" : mood === "sleep" ? "Modo Noturno (Zzz)" : "100% Online"}
            </span>
          </div>
        </button>

        {/* Modal / Card Expansível do Mascote */}
        {isOpen && (
          <div
            className={`absolute w-[calc(100vw-32px)] max-w-sm sm:w-96 bg-[#121214]/95 border border-white/15 rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-2xl flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-200 ${
              openUpward ? "bottom-16" : "top-16"
            } ${alignRight ? "right-0" : "left-0"}`}
          >
            
            {/* Header do Card */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${mood === "alert" ? "bg-red-500 animate-pulse" : mood === "warning" ? "bg-orange-500" : mood === "sleep" ? "bg-cyan-400 animate-pulse" : "bg-emerald-500"}`} />
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
                <ShieldCheck className={`w-5 h-5 ${mood === "alert" ? "text-red-400" : mood === "warning" ? "text-orange-400" : mood === "sleep" ? "text-cyan-400" : "text-emerald-400"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs leading-relaxed font-medium">
                  {mood === "sleep"
                    ? "Zzz... Modo Noturno ativo. Sistema calmo e monitorando tudo nos bastidores, chefe!"
                    : alertCount === 0
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
                  <span className="text-white/40 text-[10px]">Vizer & Encontrei</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-white font-bold text-xs truncate">Domínios 100%</span>
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

            {/* Ação do Rodapé: Testar Agora (Centralizado com tamanho natural) */}
            <div className="flex items-center justify-center pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={handleCheckNow}
                disabled={probingNow}
                className="w-auto px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-orange-600/20 active:scale-95 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${probingNow ? "animate-spin" : ""}`} />
                <span>{probingNow ? "Testando..." : "Testar Agora"}</span>
              </button>
            </div>

          </div>
        )}
      </aside>
    </>
  );
}
