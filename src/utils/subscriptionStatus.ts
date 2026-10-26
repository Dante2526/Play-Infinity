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

export const TRIAL_DURATION_MS = 30 * 60 * 1000; // 30 minutos

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
 */
export function deriveStatus(data: any): DerivedUserStatus {
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

  const isPlus = data.plano === "plus";
  const isVitalicio = data.tipoAcesso === "vitalicio" || data.tipoAcesso === "vitalício";

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
