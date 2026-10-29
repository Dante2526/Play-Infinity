/**
 * [ghost-paywall] Cobrança fantasma / paywall piscando para o dono e clientes
 * em dia após deploys e recarregamentos.
 *
 * Causa raiz: useSubscription() nascia com isPremium=false enquanto Firebase
 * Auth + Firestore resolviam a sessão (loading=true). O gate de reprodução do
 * App.tsx (openPlayer) checava apenas !isPremium — ignorando loading — então
 * o clique num filme logo após o reload abria o PaywallModal por alguns
 * segundos até o onSnapshot confirmar ATIVA; quando confirmava, o efeito de
 * "pagamento reconhecido" do modal disparava alert() + window.location.reload().
 *
 * Correções testadas aqui:
 *  1. Cache local síncrono (playinfinity_cached_subscription): o status
 *     confirmado pelo Firestore é espelhado no localStorage e relido ANTES do
 *     primeiro render → isPremium já nasce true; cache expirado (TTL 7 dias)
 *     é ignorado; clearCachedSubscription() limpa.
 *  2. Prioridade absoluta: admin (naylanmoreira350@gmail.com /
 *     cbeth761@gmail.com) e vitalício (tipoAcesso/accessType "vitalicio")
 *     recebem isPremium + isVitalicio direto, SEM checagem de expiração.
 *  3. Blindagem de fonte: openPlayer só abre paywall com !subscriptionLoading;
 *     PaywallModal só auto-confirma com !loading; logout limpa o cache
 *     (clearLocalUserData inclui a chave).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function makeLocalStorage(initial) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    key: i => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; }
  };
}

async function loadSubscriptionStatus() {
  const output = await esbuild.build({
    stdin: {
      contents: "export {deriveStatus, isAdminEmail, ADMIN_EMAILS, readCachedSubscription, writeCachedSubscription, clearCachedSubscription, SUBSCRIPTION_CACHE_KEY, SUBSCRIPTION_CACHE_TTL_MS} from './src/utils/subscriptionStatus';",
      resolveDir: root, loader: 'ts'
    },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  const filename = path.join(root, 'tests/virtual-ghost-paywall.cjs');
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

async function loadSafeStorage() {
  const output = await esbuild.build({
    stdin: { contents: "export {clearLocalUserData} from './src/utils/safeStorage';", resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  const filename = path.join(root, 'tests/virtual-ghost-paywall-storage.cjs');
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

// ============================================================
// 1. Prioridade absoluta: administradores e vitalícios
// ============================================================

test('deriveStatus: e-mail admin → isPremium=true e isVitalicio=true mesmo com assinatura INATIVA e expirada', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const status = deriveStatus(
    { assinatura: 'INATIVA', dataExpiracao: past },
    'naylanmoreira350@gmail.com'
  );
  assert.equal(status.isPremium, true, 'admin não pode ver cobrança mesmo com doc vencido');
  assert.equal(status.isVitalicio, true, 'admin deve ser tratado como vitalício');
});

test('deriveStatus: segundo e-mail admin (cbeth761) com e-mail em MAIÚSCULAS/espços → ainda reconhecido (normalização)', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  const status = deriveStatus({ assinatura: 'EXPIRADA' }, '  CBETH761@GMAIL.COM ');
  assert.equal(status.isPremium, true, 'normalização trim+lowercase deve reconhecer o admin');
  assert.equal(status.isVitalicio, true);
});

test('deriveStatus: tipoAcesso "vitalicio" → isPremium=true SEM checar data de expiração', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const status = deriveStatus({ tipoAcesso: 'vitalicio', assinatura: 'INATIVA', dataExpiracao: past });
  assert.equal(status.isVitalicio, true, 'tipoAcesso vitalicio deve marcar isVitalicio');
  assert.equal(status.isPremium, true, 'vitalício é premium na hora, sem verificação de data');
});

test('deriveStatus: tipoAcesso "vitalício" (com acento) e accessType "vitalicio" (campo inglês) também reconhecidos', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  assert.equal(deriveStatus({ tipoAcesso: 'vitalício' }).isPremium, true, 'variante com acento');
  assert.equal(deriveStatus({ accessType: 'vitalicio' }).isPremium, true, 'campo inglês accessType');
  assert.equal(deriveStatus({ accessType: 'vitalício' }).isVitalicio, true, 'accessType com acento marca isVitalicio');
});

test('deriveStatus: sem email e sem vitalício → comportamento original preservado (regressão)', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  // Todos os casos clássicos do paywall-status-check.test.cjs continuam válidos
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(deriveStatus({ assinatura: 'ATIVA' }).isPremium, true);
  assert.equal(deriveStatus({ assinatura: 'ATIVA', dataExpiracao: past }).isPremium, false, 'ATIVA vencida continua não-premium');
  assert.equal(deriveStatus({ assinatura: 'INATIVA' }).isPremium, false);
  assert.equal(deriveStatus({}).isPremium, false);
  assert.equal(deriveStatus({ assinatura: 'ATIVA' }, 'cliente-normal@gmail.com').isPremium, true, 'email comum não altera nada');
  assert.equal(deriveStatus({ assinatura: 'INATIVA' }, 'cliente-normal@gmail.com').isPremium, false, 'email comum não dá bypass');
});

test('isAdminEmail: null/undefined/vazio/e-mail de cliente → false; admins → true', async () => {
  const { isAdminEmail } = await loadSubscriptionStatus();
  assert.equal(isAdminEmail(null), false);
  assert.equal(isAdminEmail(undefined), false);
  assert.equal(isAdminEmail(''), false);
  assert.equal(isAdminEmail('cliente@gmail.com'), false);
  assert.equal(isAdminEmail('fake-naylanmoreira350@gmail.com.br'), false, 'sufixo diferente não é admin');
  assert.equal(isAdminEmail('naylanmoreira350@gmail.com'), true);
  assert.equal(isAdminEmail('CBETH761@GMAIL.COM'), true);
});

// ============================================================
// 2. Cache local síncrono (anti-flash)
// ============================================================

test('cache: write → read retorna exatamente o status salvo (round-trip)', async () => {
  const api = await loadSubscriptionStatus();
  const ls = makeLocalStorage({});
  global.window = { localStorage: ls };
  try {
    api.writeCachedSubscription({ isPremium: true, isPlus: false, isVitalicio: true });
    const cached = api.readCachedSubscription();
    assert.ok(cached, 'cache deve existir após write');
    assert.equal(cached.isPremium, true);
    assert.equal(cached.isPlus, false);
    assert.equal(cached.isVitalicio, true);
    assert.equal(ls.getItem(api.SUBSCRIPTION_CACHE_KEY) !== null, true, 'chave playinfinity_cached_subscription deve existir no localStorage');
  } finally {
    delete global.window;
  }
});

test('cache: clear remove a chave — próximo boot nasce sem premium fantasma', async () => {
  const api = await loadSubscriptionStatus();
  const ls = makeLocalStorage({});
  global.window = { localStorage: ls };
  try {
    api.writeCachedSubscription({ isPremium: true, isPlus: true, isVitalicio: false });
    api.clearCachedSubscription();
    assert.equal(api.readCachedSubscription(), null, 'cache deve estar vazio após clear');
    assert.equal(ls.getItem(api.SUBSCRIPTION_CACHE_KEY), null);
  } finally {
    delete global.window;
  }
});

test('cache: TTL vencido (savedAt antigo) é ignorado — premium não fica "eterno" offline', async () => {
  const api = await loadSubscriptionStatus();
  const stale = JSON.stringify({
    isPremium: true, isPlus: false, isVitalicio: false,
    savedAt: Date.now() - api.SUBSCRIPTION_CACHE_TTL_MS - 1000
  });
  const ls = makeLocalStorage({ [api.SUBSCRIPTION_CACHE_KEY]: stale });
  global.window = { localStorage: ls };
  try {
    assert.equal(api.readCachedSubscription(), null, 'cache fora da janela de 7 dias deve ser ignorado');
  } finally {
    delete global.window;
  }
});

test('cache: JSON malformado não explode — retorna null (Smart TV / quota corrompida)', async () => {
  const api = await loadSubscriptionStatus();
  const ls = makeLocalStorage({ [api.SUBSCRIPTION_CACHE_KEY]: '{não é json' });
  global.window = { localStorage: ls };
  try {
    assert.equal(api.readCachedSubscription(), null);
  } finally {
    delete global.window;
  }
});

test('cache: shape inválido (isPremium não-boolean) é rejeitado', async () => {
  const api = await loadSubscriptionStatus();
  const bad = JSON.stringify({ isPremium: 'yes', savedAt: Date.now() });
  const ls = makeLocalStorage({ [api.SUBSCRIPTION_CACHE_KEY]: bad });
  global.window = { localStorage: ls };
  try {
    assert.equal(api.readCachedSubscription(), null);
  } finally {
    delete global.window;
  }
});

test('clearLocalUserData: remove a chave do cache de assinatura no logout (não vaza pra próxima conta)', async () => {
  const storage = await loadSafeStorage();
  const sub = await loadSubscriptionStatus();
  const ls = makeLocalStorage({ [sub.SUBSCRIPTION_CACHE_KEY]: JSON.stringify({ isPremium: true, isPlus: false, isVitalicio: true, savedAt: Date.now() }) });
  global.window = { localStorage: ls };
  try {
    storage.clearLocalUserData();
    assert.equal(ls.getItem(sub.SUBSCRIPTION_CACHE_KEY), null, 'logout deve limpar o cache de assinatura');
  } finally {
    delete global.window;
  }
});

// ============================================================
// 3. Guardas de fonte: a blindagem de loading não regrediu
// ============================================================

test('guarda de fonte: App.tsx openPlayer só abre paywall com !subscriptionLoading', () => {
  const src = read('src/App.tsx');
  const gate = /if\s*\(\s*!subscriptionLoading\s*&&\s*!isPremium\s*&&\s*!isTrialActive\s*&&\s*!isDevEnvironment\s*\)\s*\{\s*setIsPaywallOpen\(true\)/;
  assert.ok(gate.test(src),
    'openPlayer deve exigir !subscriptionLoading antes de setIsPaywallOpen(true) — sem isso o paywall pisca durante o boot da sessão');
});

test('guarda de fonte: PaywallModal só auto-confirma pagamento com !subscriptionLoading', () => {
  const src = read('src/components/PaywallModal.tsx');
  assert.ok(/loading:\s*subscriptionLoading/.test(src),
    'PaywallModal deve desestruturar loading do useSubscription');
  const effect = /if\s*\(\s*isOpen\s*&&\s*!subscriptionLoading\s*&&\s*isPremium\s*\)/;
  assert.ok(effect.test(src),
    'efeito de pagamento reconhecido deve exigir !subscriptionLoading — evita alert+reload falso no flash');
});

test('guarda de fonte: useSubscription lê cache síncrono no init e grava em applyStatus', () => {
  const src = read('src/hooks/useSubscription.ts');
  assert.ok(/readCachedSubscription\(\)/.test(src),
    'hook deve chamar readCachedSubscription() na inicialização do estado');
  assert.ok(/useState<boolean>\(isDev\s*\|\|\s*\(initialCache\?\.isPremium\s*\?\?\s*false\)\)/.test(src),
    'isPremium deve nascer do cache (isDev || initialCache?.isPremium ?? false)');
  assert.ok(/writeCachedSubscription\(\s*\{/.test(src),
    'applyStatus deve espelhar o status do onSnapshot via writeCachedSubscription');
  assert.ok(/clearCachedSubscription\(\)/.test(src),
    'hook deve limpar o cache no signout (transição user→null)');
});

test('guarda de fonte: useSubscription passa o e-mail do usuário ao deriveStatus (bypass admin)', () => {
  const src = read('src/hooks/useSubscription.ts');
  assert.ok(/deriveStatus\(data,\s*emailRef\.current\)/.test(src),
    'applyStatus deve chamar deriveStatus(data, emailRef.current) para o bypass administrativo');
  assert.ok(/emailRef\.current\s*=\s*user\.email\s*\|\|\s*null/.test(src),
    'onAuthStateChanged deve alimentar emailRef com o e-mail do usuário logado');
});

test('guarda de fonte: sawSignedInUser protege o cache do null inicial do boot', () => {
  const src = read('src/hooks/useSubscription.ts');
  // O callback null do onAuthStateChanged dispara antes da sessão persistida
  // restaurar em alguns cenários; limpar o cache nesse momento anularia o fix.
  assert.ok(/sawSignedInUser/.test(src),
    'hook deve rastrear sawSignedInUser para só limpar cache em signout REAL');
  assert.ok(/if\s*\(\s*sawSignedInUser\s*\)\s*\{\s*clearCachedSubscription\(\)/.test(src),
    'clearCachedSubscription só pode rodar quando um usuário de fato saiu');
});

test('guarda de fonte: subscriptionStatus exporta os novos helpers', () => {
  const src = read('src/utils/subscriptionStatus.ts');
  assert.ok(/export const ADMIN_EMAILS/.test(src), 'ADMIN_EMAILS exportado');
  assert.ok(/export function isAdminEmail/.test(src), 'isAdminEmail exportado');
  assert.ok(/export function readCachedSubscription/.test(src), 'readCachedSubscription exportado');
  assert.ok(/export function writeCachedSubscription/.test(src), 'writeCachedSubscription exportado');
  assert.ok(/export function clearCachedSubscription/.test(src), 'clearCachedSubscription exportado');
  assert.ok(/export const SUBSCRIPTION_CACHE_KEY/.test(src), 'SUBSCRIPTION_CACHE_KEY exportado');
  // A lista admin deve conter exatamente os dois e-mails oficiais
  assert.ok(src.includes('"naylanmoreira350@gmail.com"'), 'e-mail do dono presente');
  assert.ok(src.includes('"cbeth761@gmail.com"'), 'segundo e-mail admin presente');
});

test('guarda de fonte: safeStorage inclui a chave do cache na limpeza de logout', () => {
  const src = read('src/utils/safeStorage.ts');
  assert.ok(src.includes('"playinfinity_cached_subscription"'),
    'clearLocalUserData deve remover playinfinity_cached_subscription (troca de conta não pode herdar premium)');
});
