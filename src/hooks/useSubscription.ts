import { useState, useEffect } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { isAiStudioOrDevEnvironment } from "../utils/envUtils";

export const TRIAL_DURATION_MS = 30 * 60 * 1000; // 30 minutos

export interface TrialStatus {
  /** Timestamp (ms) até quando o teste de 30 min está liberado (null = nunca ativou) */
  trialUntil: number | null;
  isTrialActive: boolean;
  hasUsedTrial: boolean;
  /** true = pode ativar o teste de 30 min (conta sem trial anterior e sem Premium ativo) */
  canUseTrial: boolean;
}

const NO_TRIAL: TrialStatus = {
  trialUntil: null,
  isTrialActive: false,
  hasUsedTrial: false,
  canUseTrial: false,
};

function parseTrialTimestamp(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.getTime();
}

interface DerivedUserStatus {
  isPremium: boolean;
  trial: TrialStatus;
}

function deriveStatus(data: any): DerivedUserStatus {
  const isExplicitlyActive = data.subscription === "ACTIVE" || data.assinatura === "ATIVA";
  const expDateStr = data.dataExpiracao || data.expirationDate;
  let isExpired = false;

  if (expDateStr) {
    const expDate = new Date(expDateStr);
    if (!isNaN(expDate.getTime()) && expDate.getFullYear() < 2099) {
      isExpired = expDate.getTime() <= Date.now();
    }
  }

  const isPremium = isExplicitlyActive && !isExpired;

  const trialUntil = parseTrialTimestamp(
    data.testarAte ?? data.testarAteEm ?? data.testeExpiracao ?? data.trialUntil
  );
  const hasUsedTrial = trialUntil !== null;
  const isTrialActive = hasUsedTrial && trialUntil! > Date.now();

  return {
    isPremium,
    trial: {
      trialUntil,
      isTrialActive,
      hasUsedTrial,
      canUseTrial: !hasUsedTrial && !isPremium,
    },
  };
}

/** Ativa o teste de 30 minutos, gravando a expiração no Firestore do usuário logado. */
export async function startTrial(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const untilIso = new Date(Date.now() + TRIAL_DURATION_MS).toISOString();
    await setDoc(
      doc(db, "usuarios", user.uid),
      {
        testeExpiracao: untilIso,
        trialUntil: untilIso,
        trialUsado: true,
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error("[Trial] Falha ao ativar teste de 30 min:", err);
    return false;
  }
}

export function useSubscription() {
  const isDev = isAiStudioOrDevEnvironment();
  const [isPremium, setIsPremium] = useState<boolean>(isDev);
  const [trial, setTrial] = useState<TrialStatus>(NO_TRIAL);
  const [loading, setLoading] = useState<boolean>(!isDev);

  useEffect(() => {
    const expiryTimerRef: { current: number | null } = { current: null };
    const dataRef: { current: any | null } = { current: null };
    let disposed = false;

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
      scheduleExpiryCheck(data);
    };

    // Escuta a autenticação para atrelar o snapshot ao usuário logado
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        // Cria um listener em tempo real no documento do usuário na coleção 'usuarios'
        const userRef = doc(db, "usuarios", user.uid);
        const unsubscribeSnap = onSnapshot(
          userRef,
          async (snapshot) => {
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
                } catch (e) {}
              }

              setLoading(false);
            } else {
              try {
                const { getDoc } = await import("firebase/firestore");
                const legacySnap = await getDoc(doc(db, "users", user.uid));
                if (legacySnap.exists()) {
                  const data = legacySnap.data();
                  applyStatus(data);
                  setLoading(false);
                  return;
                }
              } catch (e) {}
              clearExpiryTimer();
              setIsPremium(isDev);
              setTrial(NO_TRIAL);
              setLoading(false);
            }
          },
          (err) => {
            console.error("Erro ao escutar assinatura do usuário:", err);
            clearExpiryTimer();
            setIsPremium(isDev);
            setTrial(NO_TRIAL);
            setLoading(false);
          }
        );

        return () => {
          clearExpiryTimer();
          unsubscribeSnap();
        };
      } else {
        clearExpiryTimer();
        setIsPremium(isDev);
        setTrial(NO_TRIAL);
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
      clearExpiryTimer();
      unsubscribeAuth();
    };
  }, []);

  return { isPremium, trial, loading };
}