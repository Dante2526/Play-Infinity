import React, { useEffect, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  Check,
  Loader2,
  X,
  Clapperboard,
  Tv,
  Megaphone,
  ShieldAlert,
  Settings2,
  ExternalLink,
} from "lucide-react";
import type { User } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import {
  registerFcmToken,
  markNotifGranted,
  markNotifDismissed,
  markNotifDenied,
  decideNotifGate,
  wasSessionDismissedRecently,
} from "../services/pushNotifications";

/**
 * Gate global de permissão de notificações push.
 *
 * Comportamento (modelagem de 3 estados no Firestore):
 *  - 'granted'   → usuário aceitou (em qualquer dispositivo).
 *  - 'dismissed' → dispensou o modal educativo sem decidir. Re-promptamos o
 *                  modal após cooldown crescente (7 → 14 → 30 dias).
 *  - 'denied'    → navegador/app BLOQUEOU no nível do sistema. Não dá pra
 *                  re-promptar nativo — mostramos um modal de instruções
 *                  (como desbloquear nas settings do navegador) periodicamente
 *                  (30 dias).
 *
 * Fluxo ao montar (logado, não-admin, não-SmartTV):
 *  1. Pega Notification.permission (ou 'native' se Capacitor).
 *  2. Lê o doc do usuário no Firestore (notifPermission/notifDecidedAt/notifPromptCount).
 *  3. decideNotifGate() retorna: 'hidden' | 'prompt' | 'instructions' | 'register-silent'.
 *  4. Executa a ação correspondente.
 *
 * Sessão: se o usuário dispensou há < 1h nesta sessão (wasSessionDismissedRecently),
 * nem consulta Firestore — pula. Evita reabrir o modal no SPA.
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
  // phase: estado da UI do modal.
  //  - 'hidden'         → nada renderiza.
  //  - 'prompt'         → modal educativo (botão "Ativar" → prompt nativo).
  //  - 'instructions'   → modal explicando como desbloquear nas settings do navegador.
  //  - 'working'        → registrando token (spinner).
  //  - 'success'        → registrado com sucesso (fecha em 1.8s).
  //  - 'fail-dismissed' → usuário dispensou o prompt nativo sem decidir (fecha em 1.5s).
  //  - 'fail-denied'    → navegador bloqueou (transição para 'instructions').
  const [phase, setPhase] = useState<
    | "hidden"
    | "prompt"
    | "instructions"
    | "working"
    | "success"
    | "fail-dismissed"
    | "fail-denied"
  >("hidden");
  const evaluatedRef = useRef(false);

  useEffect(() => {
    if (!isAuthInitialized || !currentUser || !enabled) return;
    if (evaluatedRef.current) return;
    evaluatedRef.current = true;

    let cancelled = false;
    const uid = currentUser.uid;

    const evaluate = async () => {
      // Delay para não competir com o carregamento inicial da página.
      await new Promise((r) => setTimeout(r, 2500));
      if (cancelled) return;

      // Sessão: dispensou há pouco — não reabre.
      if (wasSessionDismissedRecently()) return;

      // Determina a permissão do navegador/app.
      let browserPerm: "native" | NotificationPermission;
      if (Capacitor.isNativePlatform()) {
        browserPerm = "native";
      } else if (typeof Notification === "undefined") {
        // Browser sem API Notification (raro hoje) — silêncio.
        return;
      } else {
        browserPerm = Notification.permission;
      }

      // Lê o doc do usuário no Firestore uma única vez.
      let userDoc: any = null;
      try {
        const snap = await getDoc(doc(db, "usuarios", uid));
        if (snap.exists()) userDoc = snap.data();
      } catch { /* doc ilegível — segue com userDoc null (trata como 1ª vez) */ }

      const action = decideNotifGate(userDoc, browserPerm, Date.now());
      if (cancelled) return;

      switch (action) {
        case "hidden":
          return;
        case "register-silent":
          // Browser já concedeu neste aparelho — registra token em background
          // e garante 'granted' no Firestore (consistência entre devices).
          await registerFcmToken(uid);
          await markNotifGranted(uid).catch(() => undefined);
          return;
        case "prompt":
          setPhase("prompt");
          return;
        case "instructions":
          setPhase("instructions");
          return;
      }
    };

    void evaluate();
    return () => { cancelled = true; };
  }, [currentUser, isAuthInitialized, enabled]);

  // --- Handlers do modal "prompt" (modal educativo + prompt nativo) ---

  const handleActivate = async () => {
    if (!currentUser) return;
    setPhase("working");
    const ok = await registerFcmToken(currentUser.uid);
    if (ok) {
      await markNotifGranted(currentUser.uid).catch(() => undefined);
      setPhase("success");
      setTimeout(() => setPhase("hidden"), 1800);
      return;
    }
    // Falha: distingue dismissed (ainda default) de denied (bloqueou).
    const perm = typeof Notification !== "undefined" ? Notification.permission : "default";
    if (perm === "denied") {
      // Usuário bloqueou no prompt nativo — navegador não deixa re-promptar.
      // Marca 'denied' (inicia cooldown de 30d p/ reexibir instruções) e
      // transiciona para o modal de instruções (mostra como desbloquear).
      await markNotifDenied(currentUser.uid).catch(() => undefined);
      setPhase("fail-denied");
      setTimeout(() => setPhase("instructions"), 1500);
    } else {
      // Dispensou o prompt nativo sem decidir (ou falha técnica). Marca
      // 'dismissed' — re-promptaremos após o cooldown (7/14/30d).
      await markNotifDismissed(currentUser.uid).catch(() => undefined);
      setPhase("fail-dismissed");
      setTimeout(() => setPhase("hidden"), 1800);
    }
  };

  const handleDismiss = async () => {
    // Botão "Agora não" ou X — usuário dispensou sem decidir no nível do browser.
    if (currentUser) {
      await markNotifDismissed(currentUser.uid).catch(() => undefined);
    }
    setPhase("hidden");
  };

  // --- Handler do modal "instructions" ---

  const handleInstructionsClose = async () => {
    // Marca 'denied' (atualiza timestamp) para iniciar cooldown de 30 dias
    // até reexibir as instruções. Se o usuário desbloquear nas settings do
    // navegador e voltar, na próxima avaliação decideNotifGate retorna
    // 'register-silent' (perm='granted') e registramos o token.
    if (currentUser) {
      await markNotifDenied(currentUser.uid).catch(() => undefined);
    }
    setPhase("hidden");
  };

  const handleRetryNativePrompt = async () => {
    // Alguns browsers re-exibem o prompt nativo se invocado via gesture do
    // usuário (clique em botão da página). Tenta de novo.
    if (!currentUser) return;
    setPhase("working");
    const ok = await registerFcmToken(currentUser.uid);
    if (ok) {
      await markNotifGranted(currentUser.uid).catch(() => undefined);
      setPhase("success");
      setTimeout(() => setPhase("hidden"), 1800);
    } else {
      // Continua bloqueado — volta pro modal de instruções.
      await markNotifDenied(currentUser.uid).catch(() => undefined);
      setPhase("instructions");
    }
  };

  if (phase === "hidden" || !enabled) return null;

  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 sm:p-6 animate-fade-in">
      <div className="bg-[#1c1c1e]/95 backdrop-blur-3xl border border-white/10 w-full max-w-sm overflow-hidden relative shadow-[0_8px_32px_rgba(0,0,0,0.6)] rounded-[28px]">
        {(phase === "prompt" || phase === "instructions") && (
          <button
            type="button"
            aria-label="Fechar"
            onClick={phase === "prompt" ? handleDismiss : handleInstructionsClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all cursor-pointer z-10"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="p-6 sm:p-8 flex flex-col items-center text-center gap-4">
          {/* ===== Modal PROMPT (primeira vez ou re-prompt após cooldown dismissed) ===== */}
          {phase === "prompt" && (
            <PromptContent
              onActivate={handleActivate}
              onDismiss={handleDismiss}
            />
          )}

          {/* ===== Modal INSTRUCTIONS (browser bloqueou — como desbloquear) ===== */}
          {phase === "instructions" && (
            <InstructionsContent
              onClose={handleInstructionsClose}
              onRetry={handleRetryNativePrompt}
            />
          )}

          {/* ===== Fases transientes ===== */}
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

          {phase === "fail-dismissed" && (
            <div className="w-full mt-1 p-4 bg-white/5 border border-white/10 rounded-[20px] text-white/60 text-xs leading-relaxed text-center">
              Sem problema — você pode ativar depois a qualquer momento pelo seu perfil.
              <span className="block mt-1 text-white/35">
                Vamos lembrar de novo em alguns dias.
              </span>
            </div>
          )}

          {phase === "fail-denied" && (
            <div className="w-full mt-1 p-4 bg-amber-500/10 border border-amber-500/25 rounded-[20px] text-amber-400 text-xs leading-relaxed text-center">
              Você bloqueou as notificações no navegador. Vamos te mostrar como reativar...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conteúdo do modal PROMPT — educativo, com benefícios e botão "Ativar".
// ---------------------------------------------------------------------------

function PromptContent({
  onActivate,
  onDismiss,
}: {
  onActivate: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
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

      <div className="w-full flex flex-col gap-2.5 mt-1">
        <button
          type="button"
          onClick={onActivate}
          className="w-full px-6 py-3.5 bg-orange-600 hover:bg-orange-500 active:scale-[0.98] text-white font-bold text-sm rounded-[20px] transition-all shadow-[0_4px_14px_rgba(234,88,12,0.4)] flex items-center justify-center gap-2 cursor-pointer"
        >
          <Bell className="w-4 h-4" />
          Ativar notificações
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full px-6 py-2.5 text-white/50 hover:text-white/80 font-medium text-sm rounded-[20px] transition-colors cursor-pointer"
        >
          Agora não
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Conteúdo do modal INSTRUCTIONS — como desbloquear nas settings do browser.
// ---------------------------------------------------------------------------

type BrowserKind = "chrome" | "firefox" | "safari" | "samsung" | "edge" | "other";

function detectBrowser(): BrowserKind {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Firefox\//i.test(ua) && !/Seamonkey/i.test(ua)) return "firefox";
  if (/Edg\//i.test(ua)) return "edge";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua)) return "chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "safari";
  return "other";
}

function browserInstructions(browser: BrowserKind): { steps: string[]; browserName: string } {
  const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad/i.test(navigator.userAgent);
  switch (browser) {
    case "chrome":
      return {
        browserName: "Google Chrome",
        steps: isMobile
          ? [
              "Toque no menu ⋮ (canto superior direito)",
              "Vá em Configurações → Configurações do site",
              "Toque em Notificações",
              "Encontre play-infinity.stream e selecione Permitir",
            ]
          : [
              "Clique no ícone ⚙️ ao lado da URL (ou no cadeado 🔒)",
              "Vá em Configurações do site → Notificações",
              "Mude para Permitir",
              "Recarregue a página",
            ],
      };
    case "edge":
      return {
        browserName: "Microsoft Edge",
        steps: isMobile
          ? [
              "Toque no menu ⋯ → Configurações",
              "Vá em Permissões do site → Notificações",
              "Encontre play-infinity.stream e selecione Permitir",
            ]
          : [
              "Clique no ícone 🔒 / ⚙️ ao lado da URL",
              "Vá em Permissões do site → Notificações → Permitir",
              "Recarregue a página",
            ],
      };
    case "firefox":
      return {
        browserName: "Mozilla Firefox",
        steps: isMobile
          ? [
              "Toque no menu ⋮ → Configurações",
              "Vá em Privacidade e segurança → Permissões → Notificações",
              "Encontre play-infinity.stream → Permitir",
            ]
          : [
              "Clique no ícone 🔒 ao lado da URL",
              "Remova o bloqueio de Notificações",
              "Recarregue a página e clique em Ativar",
            ],
      };
    case "safari":
      return {
        browserName: "Safari",
        steps: [
          "No menu Safari → Ajustes (ou Preferências)",
          "Vá em Sites → Notificações",
          "Encontre play-infinity.stream e mude para Permitir",
          "Recarregue a página",
        ],
      };
    case "samsung":
      return {
        browserName: "Samsung Internet",
        steps: [
          "Toque no menu ☰ → Configurações",
          "Vá em Sites → Permissões de notificação",
          "Encontre play-infinity.stream e selecione Permitir",
        ],
      };
    default:
      return {
        browserName: "seu navegador",
        steps: [
          "Abra as configurações/ajustes do navegador",
          "Procure por Permissões de site → Notificações",
          "Encontre play-infinity.stream e mude para Permitir",
          "Recarregue esta página",
        ],
      };
  }
}

function InstructionsContent({
  onClose,
  onRetry,
}: {
  onClose: () => void;
  onRetry: () => void;
}) {
  const browser = detectBrowser();
  const { steps, browserName } = browserInstructions(browser);

  return (
    <>
      <div className="p-4 bg-gradient-to-br from-amber-500/25 to-orange-600/25 text-amber-400 rounded-2xl border border-white/10">
        <ShieldAlert className="w-8 h-8" />
      </div>

      <div>
        <h3 className="text-xl font-black text-white">Notificações bloqueadas</h3>
        <p className="text-white/50 text-sm mt-1.5 leading-relaxed">
          O navegador está bloqueando as notificações do Play Infinity neste aparelho.
          Para reativar, siga os passos abaixo no <span className="text-white/80 font-semibold">{browserName}</span>:
        </p>
      </div>

      <div className="w-full text-left bg-white/5 border border-white/5 rounded-2xl p-4">
        <ol className="space-y-2.5">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 items-start">
              <div className="shrink-0 w-6 h-6 rounded-full bg-orange-600/20 border border-orange-500/30 text-orange-400 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </div>
              <span className="text-sm text-white/85 leading-snug pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-white/40 text-[11px] leading-relaxed -mt-1">
        <Settings2 className="w-3 h-3 inline mr-1 -mt-0.5" />
        Após permitir, recarregue a página — ativamos as notificações automaticamente.
      </p>

      <div className="w-full flex flex-col gap-2.5 mt-1">
        <button
          type="button"
          onClick={onRetry}
          className="w-full px-6 py-3 bg-orange-600 hover:bg-orange-500 active:scale-[0.98] text-white font-bold text-sm rounded-[20px] transition-all shadow-[0_4px_14px_rgba(234,88,12,0.4)] flex items-center justify-center gap-2 cursor-pointer"
        >
          <BellRing className="w-4 h-4" />
          Já permiti — tentar de novo
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full px-6 py-2.5 text-white/50 hover:text-white/80 font-medium text-sm rounded-[20px] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Lembrar depois
        </button>
      </div>
    </>
  );
}
