import React, { useEffect, useRef, useState } from "react";
import { Bell, BellRing, Check, Loader2, X, Clapperboard, Tv, Megaphone } from "lucide-react";
import type { User } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import {
  registerFcmToken,
  saveNotifPermission,
  isNotifLocallyDeclined,
  setNotifLocallyDeclined,
} from "../services/pushNotifications";

/**
 * Gate global de permissão de notificações push.
 *
 * Comportamento (decisão persistida — quem recusou NUNCA é perguntado de novo):
 *  1. Navegador já concedeu (Notification.permission === 'granted'):
 *     re-registra o token silenciosamente e marca 'granted' no Firestore. Sem modal.
 *  2. Navegador negou ('denied'): marca 'denied' (Firestore + flag local) e nunca
 *     mais solicita — o próprio navegador bloqueia novo pedido.
 *  3. Ainda não perguntado ('default'): se o usuário já recusou o nosso modal
 *     antes (flag local OU notifPermission === 'denied' no Firestore), não
 *     pergunta. Caso contrário, mostra o modal educativo com 2 botões.
 *     - "Ativar notificações" → registerFcmToken (prompt nativo do navegador/app)
 *     - "Agora não" → persiste 'denied' e nunca mais pergunta.
 *
 * Reativar depois: único caminho é manual, pelo perfil do usuário.
 * (App nativo Capacitor/Android: mesma lógica usando a flag local + Firestore.)
 */
export function NotificationPermissionGate({
  currentUser,
  isAuthInitialized,
  enabled,
}: {
  currentUser: User | null;
  isAuthInitialized: boolean;
  enabled: boolean;
}) {
  const [phase, setPhase] = useState<"hidden" | "open" | "working" | "success" | "fail">("hidden");
  const evaluatedRef = useRef(false);

  useEffect(() => {
    if (!isAuthInitialized || !currentUser || !enabled) return;
    if (evaluatedRef.current) return;
    evaluatedRef.current = true;

    let cancelled = false;
    const uid = currentUser.uid;

    const evaluate = async () => {
      // Pequeno delay para não competir com o carregamento inicial da página.
      await new Promise((r) => setTimeout(r, 2500));
      if (cancelled) return;

      // --- Caso 1/2: navegador já decidiu ---
      if (!Capacitor.isNativePlatform() && typeof Notification !== "undefined") {
        if (Notification.permission === "granted") {
          // Silenciosamente garante token registrado + status 'granted'.
          await registerFcmToken(uid);
          await saveNotifPermission(uid, "granted");
          setNotifLocallyDeclined(false);
          return;
        }
        if (Notification.permission === "denied") {
          // Negação no nível do navegador — persiste e nunca mais pergunta.
          await saveNotifPermission(uid, "denied");
          setNotifLocallyDeclined(true);
          return;
        }
      }

      // --- Caso 3: ainda não decidido (ou app nativo) — respeita recusa anterior ---
      if (isNotifLocallyDeclined()) return;

      // Consulta o Firestore uma única vez: usuário pode ter recusado em
      // outro dispositivo/navegador da mesma conta.
      try {
        const snap = await getDoc(doc(db, "usuarios", uid));
        const stored = snap.data()?.notifPermission;
        if (stored === "denied") {
          setNotifLocallyDeclined(true);
          return;
        }
        if (stored === "granted") {
          // Concedeu em outro dispositivo — registra este também sem perguntar.
          await registerFcmToken(uid);
          return;
        }
      } catch { /* doc ilegível — segue com o modal */ }

      if (!cancelled) setPhase("open");
    };

    void evaluate();
    return () => { cancelled = true; };
  }, [currentUser, isAuthInitialized, enabled]);

  const handleActivate = async () => {
    if (!currentUser) return;
    setPhase("working");
    const ok = await registerFcmToken(currentUser.uid);
    if (ok) {
      await saveNotifPermission(currentUser.uid, "granted");
      setNotifLocallyDeclined(false);
      setPhase("success");
      setTimeout(() => setPhase("hidden"), 1800);
    } else {
      // O navegador/app negou o prompt nativo (ou falhou): trata como recusa
      // definitiva — não insiste de novo nas próximas visitas.
      await saveNotifPermission(currentUser.uid, "denied");
      setNotifLocallyDeclined(true);
      setPhase("fail");
      setTimeout(() => setPhase("hidden"), 3200);
    }
  };

  const handleDecline = async () => {
    if (currentUser) {
      await saveNotifPermission(currentUser.uid, "denied");
      setNotifLocallyDeclined(true);
    }
    setPhase("hidden");
  };

  if (phase === "hidden" || !enabled) return null;

  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 sm:p-6 animate-fade-in">
      <div className="bg-[#1c1c1e]/95 backdrop-blur-3xl border border-white/10 w-full max-w-sm overflow-hidden relative shadow-[0_8px_32px_rgba(0,0,0,0.6)] rounded-[28px]">
        {phase === "open" && (
          <button
            type="button"
            aria-label="Fechar"
            onClick={handleDecline}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="p-6 sm:p-8 flex flex-col items-center text-center gap-4">
          <div className="p-4 bg-gradient-to-br from-orange-500/25 to-purple-600/25 text-orange-400 rounded-2xl border border-white/10">
            <BellRing className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-xl font-black text-white">Ativar notificações?</h3>
            <p className="text-white/50 text-sm mt-1.5 leading-relaxed">
              Fique por dentro de tudo que chega no Play Infinity — direto no seu aparelho.
            </p>
          </div>

          <div className="w-full flex flex-col gap-2 text-left">
            {[
              { icon: <Clapperboard className="w-4 h-4 text-orange-400" />, label: "Filmes e séries novas no catálogo" },
              { icon: <Tv className="w-4 h-4 text-purple-400" />, label: "Novos episódios das suas séries" },
              { icon: <Megaphone className="w-4 h-4 text-cyan-400" />, label: "Avisos importantes da plataforma" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl px-3.5 py-2.5">
                <div className="shrink-0">{item.icon}</div>
                <span className="text-sm text-white/80 font-medium">{item.label}</span>
              </div>
            ))}
          </div>

          <p className="text-white/35 text-[11px] leading-relaxed">
            Sem spam. Você pode desativar a qualquer momento no seu perfil.
          </p>

          {phase === "open" && (
            <div className="w-full flex flex-col gap-2.5 mt-1">
              <button
                type="button"
                onClick={handleActivate}
                className="w-full px-6 py-3.5 bg-orange-600 hover:bg-orange-500 active:scale-[0.98] text-white font-bold text-sm rounded-[20px] transition-all shadow-[0_4px_14px_rgba(234,88,12,0.4)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                Ativar notificações
              </button>
              <button
                type="button"
                onClick={handleDecline}
                className="w-full px-6 py-2.5 text-white/50 hover:text-white/80 font-medium text-sm rounded-[20px] transition-colors cursor-pointer"
              >
                Agora não
              </button>
            </div>
          )}

          {phase === "working" && (
            <div className="w-full mt-1 py-3 flex items-center justify-center gap-2 text-white/60 text-sm font-medium">
              <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
              Ativando notificações...
            </div>
          )}

          {phase === "success" && (
            <div className="w-full mt-1 p-4 bg-green-500/10 border border-green-500/25 rounded-[20px] flex items-center justify-center gap-2 text-green-400 text-sm font-bold">
              <Check className="w-4 h-4" />
              Notificações ativadas!
            </div>
          )}

          {phase === "fail" && (
            <div className="w-full mt-1 p-4 bg-white/5 border border-white/10 rounded-[20px] text-white/60 text-xs leading-relaxed text-center">
              Não foi possível ativar as notificações neste aparelho.
              Você pode tentar novamente a qualquer momento pelo seu perfil.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
