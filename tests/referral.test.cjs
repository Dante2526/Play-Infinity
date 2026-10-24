const test = require('node:test');
const assert = require('node:assert/strict');

// Importaremos a lógica pura ou funções do referralService
const {
  extractReferralCode,
  generateReferralCode,
  computeReferralLineage,
  classifyReferralStatus
} = require('../src/services/referralLogic.cjs');

test('extractReferralCode captures ref, ind or r parameters case-insensitively', () => {
  assert.equal(extractReferralCode('https://play-infinity.stream/?ref=carlos123'), 'carlos123');
  assert.equal(extractReferralCode('https://play-infinity.stream/?ind=AMIGO_RAIZ'), 'amigo_raiz');
  assert.equal(extractReferralCode('https://play-infinity.stream/?r=joao456&utm_source=wa'), 'joao456');
  assert.equal(extractReferralCode('https://play-infinity.stream/'), null);
  assert.equal(extractReferralCode(''), null);
});

test('generateReferralCode creates a clean slug from name or email', () => {
  const code1 = generateReferralCode('Carlos Alberto', 'carlos@gmail.com', 'user123');
  assert.ok(code1.startsWith('carlos-') || code1.length >= 6);
  assert.match(code1, /^[a-z0-9_-]+$/);

  const code2 = generateReferralCode('', 'marcos_silva@yahoo.com', 'user456');
  assert.ok(code2.startsWith('marcos') || code2.length >= 6);
});

test('computeReferralLineage inherits Root Referrer up to 31 levels without losing original friend', () => {
  // Amigo A (Amigo Original / Raiz da Rede)
  const userA = {
    id: 'uid_A',
    name: 'Amigo Original A',
    email: 'amigoA@gmail.com',
    referralCode: 'amigo-a',
    referredBy: null,
    rootReferrer: null,
    rootReferrerName: null,
    referralLevel: 0,
    referralChain: []
  };

  // Usuário B indicado por A (Nível 1)
  const lineageB = computeReferralLineage(userA);
  assert.equal(lineageB.referredBy, 'uid_A');
  assert.equal(lineageB.referredByName, 'Amigo Original A');
  assert.equal(lineageB.rootReferrer, 'uid_A', 'B must have A as rootReferrer');
  assert.equal(lineageB.rootReferrerName, 'Amigo Original A');
  assert.equal(lineageB.referralLevel, 1);
  assert.deepEqual(lineageB.referralChain, ['uid_A']);

  const userB = {
    id: 'uid_B',
    name: 'Amigo B',
    ...lineageB
  };

  // Usuário C indicado por B (Nível 2)
  const lineageC = computeReferralLineage(userB);
  assert.equal(lineageC.referredBy, 'uid_B');
  assert.equal(lineageC.referredByName, 'Amigo B');
  assert.equal(lineageC.rootReferrer, 'uid_A', 'C must inherit original rootReferrer A from B');
  assert.equal(lineageC.rootReferrerName, 'Amigo Original A');
  assert.equal(lineageC.referralLevel, 2);
  assert.deepEqual(lineageC.referralChain, ['uid_A', 'uid_B']);

  // Simulação sequencial de B até o 31º amigo
  let currentUser = userB;
  for (let level = 2; level <= 31; level++) {
    const nextLineage = computeReferralLineage(currentUser);
    const nextUser = {
      id: `uid_${level}`,
      name: `Amigo ${level}`,
      ...nextLineage
    };

    assert.equal(nextUser.rootReferrer, 'uid_A', `Level ${level} MUST still have Amigo Original A as rootReferrer`);
    assert.equal(nextUser.rootReferrerName, 'Amigo Original A');
    assert.equal(nextUser.referredBy, currentUser.id, `Level ${level} must point directly to previous friend`);
    assert.equal(nextUser.referralLevel, level);
    assert.equal(nextUser.referralChain.length, level);
    assert.equal(nextUser.referralChain[0], 'uid_A', 'Root of chain must always be A');

    currentUser = nextUser;
  }

  // Verificação final do 31º amigo
  assert.equal(currentUser.referralLevel, 31);
  assert.equal(currentUser.rootReferrer, 'uid_A');
  assert.equal(currentUser.referredBy, 'uid_30');
});

test('classifyReferralStatus correctly tracks user lifecycle (registered -> trial -> active -> inactive)', () => {
  // 1. Cadastrou mas não testou nem assinou
  assert.equal(classifyReferralStatus({
    subscription: 'INACTIVE',
    trialUntil: null,
    accessType: 'mensal'
  }), 'registered');

  // 2. Está no teste grátis ativo (30 min)
  const futureTrial = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  assert.equal(classifyReferralStatus({
    subscription: 'INACTIVE',
    trialUntil: futureTrial,
    accessType: '30min'
  }), 'trial');

  // 3. Teste expirou e não assinou
  const pastTrial = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(classifyReferralStatus({
    subscription: 'INACTIVE',
    trialUntil: pastTrial,
    accessType: '30min'
  }), 'trial_expired');

  // 4. Assinante ativo (mensal/vitalício pago)
  assert.equal(classifyReferralStatus({
    subscription: 'ACTIVE',
    accessType: 'mensal'
  }), 'active');

  // 5. Assinatura vencida/inativa
  assert.equal(classifyReferralStatus({
    subscription: 'INACTIVE',
    accessType: 'mensal',
    expirationDate: pastTrial
  }), 'inactive');
});
