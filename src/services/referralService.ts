/**
 * Serviço de Rastreamento de Indicações em Cadeia (Play Infinity)
 * Gerencia captura na URL, persistência e genealogia no Firestore.
 */

import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  extractReferralCode,
  generateReferralCode,
  computeReferralLineage,
  classifyReferralStatus
} from "./referralLogic.cjs";

export {
  extractReferralCode,
  generateReferralCode,
  computeReferralLineage,
  classifyReferralStatus
};

const STORAGE_KEY = "playinfinity_ref_code";
const COOKIE_NAME = "pi_ref";

/**
 * Captura parâmetros de indicação (?ref=, ?ind=, ?r=) da URL e persiste.
 */
export function captureReferralFromUrl(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const code = extractReferralCode(window.location.href);
    if (code) {
      localStorage.setItem(STORAGE_KEY, code);
      sessionStorage.setItem(STORAGE_KEY, code);

      // Define cookie persistente por 30 dias para evitar perdas
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `${COOKIE_NAME}=${encodeURIComponent(code)}; path=/; expires=${expires}; SameSite=Lax`;
      return code;
    }
  } catch (err) {
    console.warn("[Referral] Erro ao capturar código da URL:", err);
  }

  return getStoredReferralCode();
}

/**
 * Obtém o código de indicação salvo no navegador.
 */
export function getStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local && local.trim()) return local.trim().toLowerCase();

    const session = sessionStorage.getItem(STORAGE_KEY);
    if (session && session.trim()) return session.trim().toLowerCase();

    // Tenta ler do Cookie
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
    if (match && match[1]) {
      return decodeURIComponent(match[1]).trim().toLowerCase();
    }
  } catch (err) {
    console.warn("[Referral] Erro ao ler código salvo:", err);
  }

  return null;
}

/**
 * Limpa o código salvo após a realização do cadastro com sucesso.
 */
export function clearStoredReferralCode(): void {
  if (typeof window === "undefined") return null as any;

  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    document.cookie = `${COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  } catch (err) {
    console.warn("[Referral] Erro ao limpar código salvo:", err);
  }
}

/**
 * Constrói o link oficial de indicação para o usuário.
 */
export function buildReferralLink(code: string): string {
  const origin = typeof window !== "undefined" && window.location.origin.includes("play-infinity.stream")
    ? "https://play-infinity.stream"
    : (typeof window !== "undefined" ? window.location.origin : "https://play-infinity.stream");

  return `${origin}/?ref=${encodeURIComponent(code)}`;
}

export interface ReferrerInfo {
  id: string;
  name: string;
  email: string;
  referralCode: string;
  rootReferrer?: string | null;
  rootReferrerName?: string | null;
  referralLevel?: number;
  referralChain?: string[];
}

/**
 * Localiza no Firestore o usuário correspondente ao código de indicação.
 * Procura primeiro por referralCode, depois por id direto ou e-mail.
 */
export async function resolveReferrerData(code: string): Promise<ReferrerInfo | null> {
  if (!code || !code.trim()) return null;
  const cleanCode = code.trim().toLowerCase();

  try {
    // 1. Busca por campo referralCode
    const q = query(collection(db, "usuarios"), where("referralCode", "==", cleanCode));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      const d = docSnap.data();
      return {
        id: docSnap.id,
        name: d.nome || d.name || d.displayName || d.email || "Amigo",
        email: d.email || "",
        referralCode: d.referralCode || cleanCode,
        rootReferrer: d.rootReferrer || null,
        rootReferrerName: d.rootReferrerName || null,
        referralLevel: typeof d.referralLevel === "number" ? d.referralLevel : 0,
        referralChain: Array.isArray(d.referralChain) ? d.referralChain : []
      };
    }

    // 2. Busca por e-mail exato
    const qEmail = query(collection(db, "usuarios"), where("email", "==", cleanCode));
    const snapEmail = await getDocs(qEmail);
    if (!snapEmail.empty) {
      const docSnap = snapEmail.docs[0];
      const d = docSnap.data();
      return {
        id: docSnap.id,
        name: d.nome || d.name || d.displayName || d.email || "Amigo",
        email: d.email || "",
        referralCode: d.referralCode || cleanCode,
        rootReferrer: d.rootReferrer || null,
        rootReferrerName: d.rootReferrerName || null,
        referralLevel: typeof d.referralLevel === "number" ? d.referralLevel : 0,
        referralChain: Array.isArray(d.referralChain) ? d.referralChain : []
      };
    }

    // 3. Busca por documento com o ID direto
    const docRef = doc(db, "usuarios", cleanCode);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        name: d.nome || d.name || d.displayName || d.email || "Amigo",
        email: d.email || "",
        referralCode: d.referralCode || cleanCode,
        rootReferrer: d.rootReferrer || null,
        rootReferrerName: d.rootReferrerName || null,
        referralLevel: typeof d.referralLevel === "number" ? d.referralLevel : 0,
        referralChain: Array.isArray(d.referralChain) ? d.referralChain : []
      };
    }
  } catch (err) {
    console.warn("[Referral] Falha ao resolver indicador no Firestore:", err);
  }

  return null;
}
