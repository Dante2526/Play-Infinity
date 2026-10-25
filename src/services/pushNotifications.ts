/// <reference types="vite/client" />
import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { auth, db, app } from "./firebase";

const FCM_LOCAL_TOKEN_KEY = "playinfinity_fcm_token";

let registerInFlight = false;

/**
 * Salva/atualiza o token FCM do dispositivo no Firestore.
 * Usa arrayUnion no campo `fcmTokens` para suportar múltiplos dispositivos
 * por usuário sem sobrescrever o token de outros aparelhos.
 * O campo `fcmToken` é mantido por compatibilidade com leituras legadas.
 */
async function saveFcmTokenToCloud(userId: string, token: string): Promise<void> {
  try {
    await updateDoc(doc(db, "usuarios", userId), {
      fcmTokens: arrayUnion(token),
      fcmToken: token,
      fcmTokenUpdatedAt: Date.now()
    });
  } catch (error) {
    console.warn("[Push] Falha ao salvar token FCM no Firestore:", error);
  }
}

/**
 * Registra o dispositivo para receber push (FCM).
 * - App nativo (Capacitor/Android): plugin @capacitor-firebase/messaging.
 * - Web: Firebase JS SDK + service worker (public/firebase-messaging-sw.js)
 *   + VAPID key (VITE_FIREBASE_VAPID_KEY no .env, gerada no Firebase Console).
 */
export async function registerFcmToken(userId: string): Promise<void> {
  if (registerInFlight) return;
  registerInFlight = true;
  try {
    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseMessaging.requestPermissions();
      if (result?.receive === "granted") {
        const tokenResult = await FirebaseMessaging.getToken();
        const token = tokenResult?.token;
        if (token) {
          localStorage.setItem(FCM_LOCAL_TOKEN_KEY, token);
          await saveFcmTokenToCloud(userId, token);
        }
      }
      return;
    }

    // --- Web (navegador) ---
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
    if (!vapidKey) {
      console.info("[Push] Push web desativado: configure VITE_FIREBASE_VAPID_KEY (chave de par Web Push no Firebase Console).");
      return;
    }
    if (typeof Notification === "undefined" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return;

    const swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration
    });
    if (token) {
      localStorage.setItem(FCM_LOCAL_TOKEN_KEY, token);
      await saveFcmTokenToCloud(userId, token);
    }
  } catch (error) {
    console.warn("[Push] FCM bloqueado ou erro ao registrar:", error);
  } finally {
    registerInFlight = false;
  }
}

/**
 * Remove o token deste dispositivo do Firestore (usado no logout) — best effort.
 * Garante que um usuário deslogado pare de receber push neste aparelho,
 * sem afetar os tokens de outros dispositivos da mesma conta.
 */
export async function removeFcmTokenFromCloud(): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const token = localStorage.getItem(FCM_LOCAL_TOKEN_KEY);
    if (!token) return;
    await updateDoc(doc(db, "usuarios", user.uid), {
      fcmTokens: arrayRemove(token),
      fcmToken: null // campo legado: o array fcmTokens passa a ser a fonte da verdade
    });
    localStorage.removeItem(FCM_LOCAL_TOKEN_KEY);
  } catch (error) {
    console.warn("[Push] Falha ao remover token FCM no logout:", error);
  }
}

/**
 * Listener de rotação de token FCM (app nativo): mantém o Firestore atualizado
 * quando o FCM regenera o token do dispositivo.
 * Retorna função de cleanup para uso em useEffect.
 */
export function setupFcmTokenRefreshListener(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: any = null;
  let cancelled = false;
  FirebaseMessaging.addListener("tokenReceived", async (event: any) => {
    try {
      const token = event?.token;
      const user = auth.currentUser;
      if (token && user) {
        localStorage.setItem(FCM_LOCAL_TOKEN_KEY, token);
        await saveFcmTokenToCloud(user.uid, token);
      }
    } catch (error) {
      console.warn("[Push] Erro ao processar tokenReceived:", error);
    }
  })
    .then((h: any) => {
      if (cancelled) {
        h?.remove?.();
      } else {
        handle = h;
      }
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    handle?.remove?.();
  };
}


/**
 * Registra o dispositivo do administrador especificamente no Guardião (Sentinel).
 * - Gera/recupera o token Web Push ou nativo.
 * - Envia para /api/admin/sentinel/register-token.
 * - Marca isAdminDevice: true no Firestore do usuário.
 */
export async function registerAdminFcmToken(userId: string, userEmail?: string): Promise<string | null> {
  try {
    let token = localStorage.getItem(FCM_LOCAL_TOKEN_KEY);

    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseMessaging.requestPermissions();
      if (result?.receive === "granted") {
        const tokenResult = await FirebaseMessaging.getToken();
        if (tokenResult?.token) {
          token = tokenResult.token;
          localStorage.setItem(FCM_LOCAL_TOKEN_KEY, token);
        }
      }
    } else {
      // Navegador Web (Samsung Internet, Chrome, etc)
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
      if (vapidKey && typeof Notification !== "undefined" && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
          if (await isSupported()) {
            const swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
            const messaging = getMessaging(app);
            const webToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swRegistration });
            if (webToken) {
              token = webToken;
              localStorage.setItem(FCM_LOCAL_TOKEN_KEY, token);
            }
          }
        }
      }
    }

    if (!token) return null;

    // 1. Marca dispositivo no Firestore do admin
    try {
      await updateDoc(doc(db, "usuarios", userId), {
        isAdminDevice: true,
        fcmTokens: arrayUnion(token),
        fcmToken: token,
        fcmTokenUpdatedAt: Date.now()
      });
    } catch (e) {
      console.warn("[Push] Falha ao atualizar doc de admin no Firestore:", e);
    }

    // 2. Registra na VPS / Sentinela
    try {
      const { adminFetch } = await import("./adminApi");
      await adminFetch("/api/admin/sentinel/register-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: userEmail })
      });
    } catch (e) {
      console.warn("[Push] Falha ao registrar token no Sentinela da VPS:", e);
    }

    return token;
  } catch (err) {
    console.warn("[Push] Erro em registerAdminFcmToken:", err);
    return null;
  }
}
