/**
 * [relatorio #11] handleCheckPayment no PaywallModal checava 3 campos
 * inexistentes no documento Firestore do usuário:
 *   - data.assinatura === 'premium' (ninguém escreve essa string lowercase)
 *   - data.isPremium === true (isPremium é estado React do hook, não campo Firestore)
 *   - data.assinaturaStatus === 'ACTIVE' (campo inexistente; real é `assinatura`,
 *     valor real é "ATIVA" em português)
 *
 * Resultado: botão "Verificar Pagamento" no PaywallModal nunca confirmava
 * premium mesmo após pagamento PIX confirmado pelo webhook Asaas (que escreve
 * assinatura: "ATIVA" no Firestore). Usuário ficava preso até reload manual.
 *
 * Fix: PaywallModal agora chama deriveStatus(data) — mesma função que o hook
 * useSubscription usa. Esta função foi extraída para src/utils/subscriptionStatus.ts
 * (sem deps Firebase/React) para ser testável em node puro.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

async function loadSubscriptionStatus() {
  const output = await esbuild.build({
    stdin: { contents: "export {deriveStatus, parseTrialTimestamp, NO_TRIAL, TRIAL_DURATION_MS} from './src/utils/subscriptionStatus';", resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  const filename = path.join(root, 'tests/virtual-subscription-status.cjs');
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

// ============================================================
// Testes funcionais: deriveStatus reconhece todos os estados que
// o webhook Asaas e o cliente podem escrever no Firestore
// ============================================================

test('deriveStatus: assinatura "ATIVA" sem dataExpiracao → isPremium=true', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  const status = deriveStatus({ assinatura: 'ATIVA' });
  assert.equal(status.isPremium, true, 'assinatura ATIVA deve ser premium');
});

test('deriveStatus: assinatura "ATIVA" com dataExpiracao futura → isPremium=true', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const status = deriveStatus({ assinatura: 'ATIVA', dataExpiracao: future });
  assert.equal(status.isPremium, true, 'ATIVA com expiração futura deve ser premium');
});

test('deriveStatus: assinatura "ATIVA" com dataExpiracao passada → isPremium=false (webhook não renovou)', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const status = deriveStatus({ assinatura: 'ATIVA', dataExpiracao: past });
  assert.equal(status.isPremium, false, 'ATIVA com expiração passada NAO deve ser premium');
});

test('deriveStatus: assinatura "ATIVA" com dataExpiracao ano 2099 → isPremium=true (sentinel vitalício)', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  const status = deriveStatus({ assinatura: 'ATIVA', dataExpiracao: '2099-12-31T23:59:59Z' });
  assert.equal(status.isPremium, true, '2099 é sentinel vitalício, não deve expirar');
});

test('deriveStatus: assinatura "INATIVA" (webhook revogou) → isPremium=false', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  const status = deriveStatus({ assinatura: 'INATIVA' });
  assert.equal(status.isPremium, false, 'INATIVA não deve ser premium');
});

test('deriveStatus: assinatura "EXPIRADA" (cliente marcou após vencimento) → isPremium=false', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  const status = deriveStatus({ assinatura: 'EXPIRADA' });
  assert.equal(status.isPremium, false, 'EXPIRADA não deve ser premium');
});

test('deriveStatus: subscription "ACTIVE" (campo inglês) → isPremium=true', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  const status = deriveStatus({ subscription: 'ACTIVE' });
  assert.equal(status.isPremium, true, 'subscription ACTIVE deve ser premium');
});

test('deriveStatus: subscription "INACTIVE" → isPremium=false', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  const status = deriveStatus({ subscription: 'INACTIVE' });
  assert.equal(status.isPremium, false, 'subscription INACTIVE não deve ser premium');
});

test('deriveStatus: documento vazio → isPremium=false', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  const status = deriveStatus({});
  assert.equal(status.isPremium, false, 'doc vazio não deve ser premium');
});

test('deriveStatus: bug guard — valores antigos NUNCA devem retornar isPremium=true', async () => {
  const { deriveStatus } = await loadSubscriptionStatus();
  // O relatório #11 mencionava "assinatura: 'premium'" como campo esperado pelo
  // handleCheckPayment antigo. Se alguém voltar a escrever isso no Firestore
  // por engano, deriveStatus NÃO deve tratar como ativo.
  assert.equal(deriveStatus({ assinatura: 'premium' }).isPremium, false, 'string lowercase "premium" não é status válido');
  assert.equal(deriveStatus({ isPremium: true }).isPremium, false, 'isPremium é estado React, não campo Firestore válido');
  assert.equal(deriveStatus({ assinaturaStatus: 'ACTIVE' }).isPremium, false, 'campo inexistente não deve ser reconhecido');
});

// ============================================================
// Source guards: garante que o PaywallModal não regrediu para
// os checks bugados e que deriveStatus está alinhado entre
// os dois caminhos (hook e handleCheckPayment)
// ============================================================

test('guarda de fonte: PaywallModal importa deriveStatus de subscriptionStatus', () => {
  const src = read('src/components/PaywallModal.tsx');
  assert.ok(/from\s+['"]\.\.\/utils\/subscriptionStatus['"]/.test(src),
    'PaywallModal deve importar de utils/subscriptionStatus (single ou double quote)');
  assert.ok(src.includes('deriveStatus'),
    'PaywallModal deve chamar deriveStatus no handleCheckPayment');
});

test('guarda de fonte: PaywallModal NAO contem os 3 checks bugados', () => {
  const src = read('src/components/PaywallModal.tsx');
  assert.ok(!src.includes("data.assinatura === 'premium'"),
    'check bugado data.assinatura === \'premium\' proibido (ninguém escreve essa string)');
  assert.ok(!src.includes('data.assinaturaStatus'),
    'campo inexistente data.assinaturaStatus proibido (real é data.assinatura)');
  assert.ok(!src.includes('data.isPremium === true'),
    'check data.isPremium === true proibido (isPremium é estado React, não campo Firestore)');
});

test('guarda de fonte: useSubscription importa deriveStatus (nao tem definicao local)', () => {
  const src = read('src/hooks/useSubscription.ts');
  assert.ok(/from\s+['"]\.\.\/utils\/subscriptionStatus['"]/.test(src),
    'useSubscription deve importar de utils/subscriptionStatus (single ou double quote)');
  // A função deriveStatus não deve mais ser declarada localmente no hook.
  // A assinatura `function deriveStatus(data: any)` ou `const deriveStatus =`
  // não deve aparecer fora de um comentário.
  const withoutComments = src.replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '').replace(/^\s*\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/^\s*(export\s+)?function\s+deriveStatus\b/m.test(withoutComments),
    'deriveStatus não deve mais ser definida localmente em useSubscription.ts');
});

test('guarda de fonte: subscriptionStatus.ts exporta deriveStatus e os helpers', () => {
  const src = read('src/utils/subscriptionStatus.ts');
  assert.ok(/export\s+function\s+deriveStatus\b/.test(src),
    'deriveStatus deve ser export function');
  assert.ok(/export\s+function\s+parseTrialTimestamp\b/.test(src),
    'parseTrialTimestamp deve ser export function');
  assert.ok(/export\s+interface\s+DerivedUserStatus\b/.test(src),
    'DerivedUserStatus deve ser export interface');
  assert.ok(/export\s+interface\s+TrialStatus\b/.test(src),
    'TrialStatus deve ser export interface');
  assert.ok(/export\s+const\s+TRIAL_DURATION_MS\b/.test(src),
    'TRIAL_DURATION_MS deve ser export const');
});

test('guarda de fonte: useSubscription re-exporta TrialStatus e TRIAL_DURATION_MS p/ compat', () => {
  const src = read('src/hooks/useSubscription.ts');
  // PaywallModal importa TRIAL_DURATION_MS de useSubscription; App.tsx importa
  // useSubscription do hook. Garantir que esses exports não regrediram.
  assert.ok(/export\s*\{\s*TRIAL_DURATION_MS\s*\}\s*from/.test(src),
    'useSubscription deve re-exportar TRIAL_DURATION_MS para compat');
  assert.ok(/export\s+type\s*\{\s*TrialStatus\s*\}\s*from/.test(src),
    'useSubscription deve re-exportar TrialStatus para compat');
});

// ============================================================
// Bug guard: o webhook Asaas continua escrevendo os valores
// que deriveStatus reconhece (assinatura: "ATIVA" | "INATIVA")
// ============================================================

test('guarda de fonte: webhook Asaas escreve assinatura "ATIVA" em pagamento confirmado', () => {
  const src = read('server/routes/payments.ts');
  assert.ok(src.includes('assinatura: "ATIVA"'),
    'webhook deve continuar escrevendo assinatura: "ATIVA" em pagamento confirmado');
  assert.ok(src.includes('assinatura: "INATIVA"'),
    'webhook deve continuar escrevendo assinatura: "INATIVA" em revogação');
});

test('guarda de fonte: webhook Asaas NUNCA escreve valores bugados que PaywallModal checava', () => {
  const src = read('server/routes/payments.ts');
  assert.ok(!src.includes("assinatura: 'premium'"),
    'webhook não pode escrever assinatura: \'premium\' (string lowercase inexistente)');
  assert.ok(!src.includes('assinaturaStatus'),
    'webhook não pode escrever campo assinaturaStatus (inexistente)');
});
