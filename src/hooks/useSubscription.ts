import { useState, useEffect } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { isAiStudioOrDevEnvironment } from "../utils/envUtils";
import {
  deriveStatus,
  parseTrialTimestamp,
  NO_TRIAL,
  TRIAL_DURATION_MS,
  type TrialStatus,
} from "../utils/subscriptionStatus";

// Re-exportações para compatibilidade com quem já importa de useSubscription
// (PaywallModal.tsx importa TRIAL_DURATION_MS; App.tsx importa useSubscription).
export { TRIAL_DURATION_MS } from "../utils/subscriptionStatus";
export type { TrialStatus } from "../utils/subscriptionStatus";

/** Ativa o teste de 30 minutos, gravando a expiração no Firestore do usuário logado. */
export async function startTrial(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const token = await user.getIdToken();
    const res = await fetch("/api/start-trial", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    if (res.ok) {
      return true;
    }
    const data = await res.json().catch(() => ({}));
    console.warn("[Trial] O servidor negou o teste:", data.error);
    return false;
  } catch (err) {
    console.error("[Trial] Falha ao ativar teste de 30 min:", err);
    return false;
  }
}

export function useSubscription() {
  const isDev = isAiStudioOrDevEnvironment();
  const [isPremium, setIsPremium] = useState<boolean>(isDev);
  const [trial, setTrial] = useState<TrialStatus>(NO_TRIAL);
  const [isPlus, setIsPlus] = useState<boolean>(false);
  const [isVitalicio, setIsVitalicio] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(!isDev);

  useEffect(() => {
    const expiryTimerRef: { current: number | null } = { current: null };
    const dataRef: { current: any | null } = { current: null };
    let disposed = false;
    // Invalida retries pendentes quando a autenticação muda (logout/login rápido):
    // sem isso, um retry atrasado de um usuário podia sobrescrever o status premium
    // recém-carregado de outro.
    let authGeneration = 0;

    const clearExpiryTimer = () => {
      if (expiryTimerRef.current !== null) {
        window.clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
    };

    // Agenda uma nova verificação para o próximo vencimento (assinatura ou teste).
    // Sem isso, o isPremium só mudaria quando o doc do Firestore fosse alterado.
    const scheduleExpiryCheck = (data: any) => {
      clearExpiryTimer();
      const now = Date.now();
      const candidates: number[] = [];

      const expDateStr = data.dataExpiracao || data.expirationDate;
      if (expDateStr) {
        const exp = new Date(expDateStr);
        if (!isNaN(exp.getTime()) && exp.getFullYear() < 2099 && exp.getTime() > now) {
          candidates.push(exp.getTime());
        }
      }
      const trialUntil = parseTrialTimestamp(
        data.testarAte ?? data.testarAteEm ?? data.testeExpiracao ?? data.trialUntil
      );
      if (trialUntil !== null && trialUntil > now) {
        candidates.push(trialUntil);
      }

      if (candidates.length === 0) return;
      const next = Math.min(...candidates);
      const remaining = Math.max(0, next - now);
      expiryTimerRef.current = window.setTimeout(() => {
        expiryTimerRef.current = null;
        if (disposed || !dataRef.current) return;
        applyStatus(dataRef.current);
      }, Math.min(remaining + 250, 24 * 60 * 60 * 1000));
    };

    const applyStatus = (data: any) => {
      if (disposed) return;
      dataRef.current = data;
      const status = deriveStatus(data);
      setIsPremium(status.isPremium);
      setTrial(status.trial);
      setIsPlus(status.isPlus);
      setIsVitalicio(status.isVitalicio);
      scheduleExpiryCheck(data);
    };

    // Escuta a autenticação para atrelar o snapshot ao usuário logado
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      const gen = ++authGeneration;
      if (user) {
        let activeUnsubscribeSnap: (() => void) | null = null;

        const attachUserSubscriptionListener = (targetUser: any, retryAttempt = 0) => {
          if (disposed || gen !== authGeneration) return;
          const userRef = doc(db, "usuarios", targetUser.uid);

          activeUnsubscribeSnap = onSnapshot(
            userRef,
            async (snapshot) => {
              if (disposed || gen !== authGeneration) return;
              if (snapshot.exists()) {
                const data = snapshot.data();
                applyStatus(data);

                // Se o documento estava como ATIVA mas já expirou, atualiza no Firestore
                const isExplicitlyActive = data.subscription === "ACTIVE" || data.assinatura === "ATIVA";
                const expDateStr = data.dataExpiracao || data.expirationDate;
                let isExpired = false;
                if (expDateStr) {
                  const expDate = new Date(expDateStr);
                  if (!isNaN(expDate.getTime()) && expDate.getFullYear() < 2099) {
                    isExpired = expDate.getTime() <= Date.now();
                  }
                }
                if (isExplicitlyActive && isExpired) {
                  try {
                    const { updateDoc } = await import("firebase/firestore");
                    await updateDoc(userRef, {
                      assinatura: "EXPIRADA",
                      subscription: "INACTIVE",
                    });
                  } catch (e) {
                    console.warn("Silenced error:", e);
                  }
                }

                setLoading(false);
              } else {
                try {
                  const { getDoc } = await import("firebase/firestore");
                  const legacySnap = await getDoc(doc(db, "users", targetUser.uid));
                  if (legacySnap.exists()) {
                    applyStatus(legacySnap.data());
                    setLoading(false);
                    return;
                  }
                } catch (e) {
                  console.warn("Silenced error:", e);
                }
                clearExpiryTimer();
                setIsPremium(isDev);
                setTrial(NO_TRIAL);
                setIsPlus(false);
                setIsVitalicio(false);
                setLoading(false);
              }
            },
            (err) => {
              if (disposed || gen !== authGeneration) return;
              clearExpiryTimer();

              // Detecta rejeição transitória por expiração ou renovação de token (Missing or insufficient permissions)
              const errMsg = String(err?.message || "").toLowerCase();
              const errCode = String((err as any)?.code || "").toLowerCase();
              const isPermissionIssue =
                errCode.includes("permission-denied") ||
                errMsg.includes("permission") ||
                errMsg.includes("insufficient");

              if (isPermissionIssue && retryAttempt < 2) {
                console.warn(`[useSubscription] Sessão em renovação (tentativa ${retryAttempt + 1}/2). Atualizando credencial...`);
                (async () => {
                  try {
                    const currentUser = auth.currentUser;
                    if (currentUser) await currentUser.getIdToken(true);
                  } catch (tokenErr) {
                    console.warn("[useSubscription] Falha ao renovar token ID:", tokenErr);
                  }

                  await new Promise((resolve) => setTimeout(resolve, 600));
                  if (disposed || gen !== authGeneration) return;

                  // Reestabelece a escuta em tempo real com a nova credencial válida
                  attachUserSubscriptionListener(targetUser, retryAttempt + 1);
                })();
                return;
              }

              // Se as tentativas se esgotarem ou for outro erro de rede, registra aviso limpo e tenta leitura única
              console.warn("[useSubscription] Listener do usuário indisponível:", err?.message || err);

              (async () => {
                if (disposed || gen !== authGeneration) return;
                try {
                  const { getDoc, doc: docFn } = await import("firebase/firestore");
                  const retrySnap = await getDoc(docFn(db, "usuarios", targetUser.uid));
                  if (retrySnap.exists()) {
                    applyStatus(retrySnap.data());
                    setLoading(false);
                    return;
                  }
                } catch (retryErr) {
                  console.warn("Silenced error:", retryErr);
                }
                if (disposed || gen !== authGeneration) return;
                setIsPremium(isDev);
                setTrial(NO_TRIAL);
                setIsPlus(false);
                setIsVitalicio(false);
                setLoading(false);
              })();
            }
          );
        };

        attachUserSubscriptionListener(user, 0);

        return () => {
          clearExpiryTimer();
          if (activeUnsubscribeSnap) {
            activeUnsubscribeSnap();
          }
        };
      } else {
        clearExpiryTimer();
        setIsPremium(isDev);
        setTrial(NO_TRIAL);
        setIsPlus(false);
        setIsVitalicio(false);
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
      clearExpiryTimer();
      unsubscribeAuth();
    };
  }, []);

  return { isPremium, trial, isPlus, isVitalicio, loading };
}
