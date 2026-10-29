/**
 * Status da assinatura do usuário — derivado puramente do documento Firestore,
 * sem dependências Firebase/React. Compartilhado entre:
 *  - useSubscription() (hook React que escuta onSnapshot do doc do usuário)
 *  - PaywallModal.handleCheckPayment() (botão "verificar pagamento" após PIX)
 *
 * Histórico (relatório #11): o handleCheckPayment checava 3 campos inexistentes
 * (assinatura === 'premium', isPremium === true, assinaturaStatus === 'ACTIVE')
 * enquanto o webhook do Asaas só escreve assinatura === 'ATIVA' | 'INATIVA' e o
 * deriveStatus checava subscription === 'ACTIVE' || assinatura === 'ATIVA'.
 * O botão de verificação nunca confirmava premium mesmo após pagamento
 * confirmado. A solução é chamar deriveStatus() em ambos os caminhos.
 */

import { safeLocalStorage } from "./safeStorage";

export const TRIAL_DURATION_MS = 30 * 60 * 1000; // 30 minutos

/**
 * E-mails administrativos (donos do sistema). Qualquer um deles recebe
 * isPremium + isVitalicio IMEDIATAMENTE true, sem passar por verificação de
 * data de expiração — resolve a "cobrança fantasma" para o dono após deploys
 * e recarregamentos, em que o doc do Firestore ainda nem resolveu a sessão.
 * Mantido em sincronia com as listas de App.tsx / AdminPage.tsx.
 */
export const ADMIN_EMAILS = ["naylanmoreira350@gmail.com", "cbeth761@gmail.com"];

/** Normaliza e checa se o e-mail pertence à lista administrativa. */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Cache local síncrono do status de assinatura (anti-flash de cobrança).
 *
 * Problema que resolve: após reload/deploy, o useSubscription nasce com
 * isPremium=false enquanto Firebase Auth + Firestore resolvem a sessão
 * (loading=true). Componentes que só checam !isPremium renderizam o
 * paywall por alguns segundos até o onSnapshot confirmar ATIVA — o famoso
 * "paywall piscando" para clientes em dia e para o dono.
 *
 * Solução: o último status confirmado pelo Firestore é espelhado no
 * localStorage; no próximo boot do hook o valor é lido SINCRONAMENTE antes
 * do primeiro render, então isPremium já nasce true para quem era Premium.
 * O onSnapshot continua sendo a fonte da verdade e sobrescreve/corrige o
 * cache em segundos (inclusive rebaixando para false se expirou/revogou).
 */
export const SUBSCRIPTION_CACHE_KEY = "playinfinity_cached_subscription";

/** Janela de validade do cache (7 dias): evita premium "eterno" offline. */
export const SUBSCRIPTION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CachedSubscription {
  isPremium: boolean;
  isPlus: boolean;
  isVitalicio: boolean;
  savedAt: number;
}

/** Lê o cache de forma segura; retorna null se ausente, malformado ou expirado. */
export function readCachedSubscription(): CachedSubscription | null {
  try {
    const raw = safeLocalStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedSubscription>;
    if (
      typeof parsed.isPremium !== "boolean" ||
      typeof parsed.savedAt !== "number" ||
      !isFinite(parsed.savedAt)
    ) {
      return null;
    }
    // Cache vencido não confia mais — deixa o estado nascer "limpo"
    // (o onSnapshot resolve em segundos e regrava um cache fresco).
    if (Date.now() - parsed.savedAt > SUBSCRIPTION_CACHE_TTL_MS) return null;
    return {
      isPremium: parsed.isPremium,
      isPlus: parsed.isPlus === true,
      isVitalicio: parsed.isVitalicio === true,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

/** Espelha o último status derivado do Firestore no localStorage. */
export function writeCachedSubscription(status: {
  isPremium: boolean;
  isPlus: boolean;
  isVitalicio: boolean;
}): void {
  try {
    safeLocalStorage.setItem(
      SUBSCRIPTION_CACHE_KEY,
      JSON.stringify({ ...status, savedAt: Date.now() } satisfies CachedSubscription)
    );
  } catch {
    /* Smart TV pode recusar quota — cache é best-effort */
  }
}

/** Limpa o cache (chamado no signout e na troca/revogação de conta). */
export function clearCachedSubscription(): void {
  try {
    safeLocalStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
  } catch {
    /* best-effort */
  }
}

export interface TrialStatus {
  /** Timestamp (ms) até quando o teste de 30 min está liberado (null = nunca ativou) */
  trialUntil: number | null;
  isTrialActive: boolean;
  hasUsedTrial: boolean;
  /** true = pode ativar o teste de 30 min (conta sem trial anterior e sem Premium ativo) */
  canUseTrial: boolean;
}

export const NO_TRIAL: TrialStatus = {
  trialUntil: null,
  isTrialActive: false,
  hasUsedTrial: false,
  canUseTrial: false,
};

export interface DerivedUserStatus {
  isPremium: boolean;
  trial: TrialStatus;
  isPlus: boolean;
  isVitalicio: boolean;
}

export function parseTrialTimestamp(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Deriva o status completo de assinatura a partir do documento Firestore do
 * usuário. Espelha exatamente o que o webhook Asaas (server/routes/payments.ts)
 * escreve: assinatura "ATIVA" em pagamento confirmado, "INATIVA" em revogação.
 * O cliente escreve "EXPIRADA" quando detecta vencimento passado no doc.
 *
 * isPremium = explicitamente ativo (assinatura "ATIVA" ou subscription "ACTIVE")
 * E data de expiração (se houver) ainda no futuro. O ano 2099 é sentinel para
 * assinaturas vitalícias/perpétuas — não deve expirar por relógio.
 *
 * PRIORIDADE ABSOLUTA (bypass de expiração): administradores (email na lista
 * ADMIN_EMAILS, via parâmetro opcional `email`) e vitalícios
 * (tipoAcesso/accessType === "vitalicio") são Premium na hora, sem checagem
 * de data — evita cobrança fantasma para o dono e vitalícios após reload.
 */
export function deriveStatus(data: any, email?: string | null): DerivedUserStatus {
  const isAdmin = isAdminEmail(email);

  // Vitalício: campo em português (tipoAcesso) ou inglês (accessType),
  // com ou sem acento ("vitalicio" / "vitalício").
  const isVitalicio =
    data.tipoAcesso === "vitalicio" ||
    data.tipoAcesso === "vitalício" ||
    data.accessType === "vitalicio" ||
    data.accessType === "vitalício" ||
    isAdmin;

  const isExplicitlyActive = data.subscription === "ACTIVE" || data.assinatura === "ATIVA";
  const expDateStr = data.dataExpiracao || data.expirationDate;
  let isExpired = false;

  if (expDateStr) {
    const expDate = new Date(expDateStr);
    if (!isNaN(expDate.getTime()) && expDate.getFullYear() < 2099) {
      isExpired = expDate.getTime() <= Date.now();
    }
  }

  // Admin e vitalício NUNCA passam pela verificação de expiração.
  const isPremium = isAdmin || isVitalicio || (isExplicitlyActive && !isExpired);

  const trialUntil = parseTrialTimestamp(
    data.testarAte ?? data.testarAteEm ?? data.testeExpiracao ?? data.trialUntil
  );
  const hasUsedTrial = trialUntil !== null;
  const isTrialActive = hasUsedTrial && trialUntil! > Date.now();

  const isPlus = data.plano === "plus";

  return {
    isPremium,
    trial: {
      trialUntil,
      isTrialActive,
      hasUsedTrial,
      canUseTrial: !hasUsedTrial && !isPremium,
    },
    isPlus,
    isVitalicio,
  };
}
