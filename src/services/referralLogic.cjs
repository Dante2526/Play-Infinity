/**
 * Lógica pura de Genealogia e Rastreamento de Indicações (Play Infinity)
 * Compatível com Node CJS para testes automatizados e backend.
 */

function extractReferralCode(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const urlStr = rawUrl.startsWith('http') ? rawUrl : `https://dummy.local${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    const url = new URL(urlStr);
    const code = url.searchParams.get('ref') || url.searchParams.get('ind') || url.searchParams.get('r');
    if (!code) return null;
    return code.trim().toLowerCase();
  } catch (e) {
    // Fallback regex se a URL não for parseável pelo construtor URL
    const match = rawUrl.match(/[?&](?:ref|ind|r)=([a-zA-Z0-9_-]+)/i);
    return match ? match[1].trim().toLowerCase() : null;
  }
}

function generateReferralCode(name, email, uid) {
  let base = '';
  if (name && typeof name === 'string' && name.trim()) {
    base = name.trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }
  if (!base && email && typeof email === 'string') {
    base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  if (!base) {
    base = 'user';
  }

  // Gera sufixo alfanumérico curto baseado no uid ou random
  const suffix = (uid || Math.random().toString(36).substring(2, 6))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 4)
    .toLowerCase();

  return `${base}-${suffix || '1001'}`;
}

/**
 * Calcula a linhagem e herança de raiz (Root Referrer) para um novo usuário indicado.
 * Garante que mesmo no nível 31, o rootReferrer seja sempre o amigo original (A).
 */
function computeReferralLineage(parentReferrer) {
  if (!parentReferrer) {
    return {
      referredBy: null,
      referredByName: null,
      rootReferrer: null,
      rootReferrerName: null,
      referralLevel: 0,
      referralChain: []
    };
  }

  const parentId = parentReferrer.id || parentReferrer.uid;
  const parentName = parentReferrer.name || parentReferrer.nome || parentReferrer.displayName || parentReferrer.email || 'Amigo';

  // Se o indicador já tiver um rootReferrer, herda a raiz original!
  // Se ele não tiver (ou for nível 0), o indicador é a própria raiz!
  const rootReferrer = parentReferrer.rootReferrer || parentId;
  const rootReferrerName = parentReferrer.rootReferrerName || parentName;

  const currentLevel = (typeof parentReferrer.referralLevel === 'number') ? parentReferrer.referralLevel : 0;
  const nextLevel = currentLevel + 1;

  const parentChain = Array.isArray(parentReferrer.referralChain) ? parentReferrer.referralChain : [];
  const nextChain = [...parentChain, parentId];

  return {
    referredBy: parentId,
    referredByName: parentName,
    rootReferrer,
    rootReferrerName,
    referralLevel: nextLevel,
    referralChain: nextChain
  };
}

/**
 * Classifica o ciclo de vida do indicado:
 * - 'active': Assinante pago com assinatura ativa
 * - 'trial': Testando nos 30 minutos grátis
 * - 'trial_expired': Já usou os 30 minutos e ainda não assinou
 * - 'inactive': Assinatura expirada
 * - 'registered': Apenas cadastrou (ainda não testou nem assinou)
 */
function classifyReferralStatus(userData) {
  if (!userData) return 'registered';

  const isExplicitlyActive = userData.subscription === 'ACTIVE' || userData.assinatura === 'ATIVA';
  const expDateStr = userData.expirationDate || userData.dataExpiracao;
  let isExpired = false;
  if (expDateStr) {
    const expDate = new Date(expDateStr);
    if (!isNaN(expDate.getTime()) && expDate.getFullYear() < 2099 && expDate.getTime() <= Date.now()) {
      isExpired = true;
    }
  }

  if (isExplicitlyActive && !isExpired && userData.accessType !== '30min' && userData.accessType !== 'teste') {
    return 'active';
  }

  // Verifica teste grátis (30 min)
  const trialDateStr = userData.trialUntil || userData.testarAte || userData.testarAteEm || userData.testeExpiracao;
  if (trialDateStr) {
    const trialDate = new Date(trialDateStr);
    if (!isNaN(trialDate.getTime())) {
      if (trialDate.getTime() > Date.now()) {
        return 'trial';
      } else {
        return isExplicitlyActive && !isExpired ? 'active' : 'trial_expired';
      }
    }
  }

  if (userData.accessType === '30min' || userData.accessType === 'teste') {
    if (isExplicitlyActive && !isExpired) {
      return 'trial';
    } else {
      return 'trial_expired';
    }
  }

  if (isExpired) {
    return 'inactive';
  }

  return 'registered';
}

module.exports = {
  extractReferralCode,
  generateReferralCode,
  computeReferralLineage,
  classifyReferralStatus
};
