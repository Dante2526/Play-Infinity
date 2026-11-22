const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

function loadSubscriptionHistoryModule() {
  const root = path.resolve(__dirname, '..');
  const res = esbuild.buildSync({
    absWorkingDir: root,
    entryPoints: ['src/utils/subscriptionHistory.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  const filename = path.join(root, 'tests', 'virtual-subscription-history.cjs');
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod._compile(res.outputFiles[0].text, filename);
  return mod.exports;
}

const {
  buildClientSubscriptionHistory,
  createSubscriptionHistoryEntry,
} = loadSubscriptionHistoryModule();

test('buildClientSubscriptionHistory: identifica mês de entrada, 1ª assinatura, mês que não renovou, quando renovou novamente e origem (App vs Manual)', () => {
  const nowMs = new Date('2026-11-22T12:00:00.000Z').getTime();

  // Cliente entrou em Setembro/2026 pelo App, não renovou em Outubro/2026, e renovou manualmente em Novembro/2026
  const summary = buildClientSubscriptionHistory(
    {
      criadoEm: '2026-09-10T14:00:00.000Z',
      assinatura: 'ATIVA',
      tipoAcesso: 'mensal',
      valor: '13,00',
      dataPagamento: '2026-11-18T15:00:00.000Z',
      dataExpiracao: '2026-12-18T15:00:00.000Z',
      lastPaymentOrigin: 'manual_admin',
      subscriptionHistory: [
        createSubscriptionHistoryEntry({
          type: 'joined',
          origin: 'app',
          date: '2026-09-10T14:00:00.000Z',
        }),
        createSubscriptionHistoryEntry({
          type: 'first_subscription',
          origin: 'app',
          date: '2026-09-10T14:05:00.000Z',
          expirationDate: '2026-10-10T14:05:00.000Z',
          plan: 'mensal',
          amount: '13,00',
        }),
        createSubscriptionHistoryEntry({
          type: 'not_renewed',
          origin: 'system',
          date: '2026-10-10T14:05:00.000Z',
          monthKey: '2026-10',
        }),
        createSubscriptionHistoryEntry({
          type: 'renewal',
          origin: 'manual_admin',
          date: '2026-11-18T15:00:00.000Z',
          expirationDate: '2026-12-18T15:00:00.000Z',
          plan: 'mensal',
          amount: '13,00',
        }),
      ],
    },
    nowMs
  );

  // 1. Desde que mês o cliente está no app
  assert.equal(summary.joinedMonthLabel, 'Setembro de 2026');
  assert.ok(summary.tenureLabel.includes('2 meses'), `Esperava 2 meses, recebeu: ${summary.tenureLabel}`);

  // 2. Quando ele assinou pela 1ª vez e origem
  assert.equal(summary.firstSubscribedOrigin, 'app');
  assert.ok(summary.firstSubscribedAt.startsWith('2026-09-10'));

  // 3. Mês que ele não renovou
  assert.deepEqual(summary.monthsWithoutRenewal, ['Out/2026']);
  assert.deepEqual(summary.monthsWithoutRenewalKeys, ['2026-10']);

  // 4. Quando renovou novamente (reativação após mês sem renovar)
  assert.ok(summary.lastRenewedAgainAt && summary.lastRenewedAgainAt.startsWith('2026-11-18'));
  assert.ok(summary.lastRenewedAgainLabel);

  // 5. Origem do pagamento atual e contadores App vs Manual
  assert.equal(summary.lastPaymentOrigin, 'manual_admin');
  assert.equal(summary.totalAppRenewals, 1);
  assert.equal(summary.totalManualRenewals, 1);

  // 6. Linha do tempo mês a mês
  assert.equal(summary.monthlyTimeline.length, 3);
  assert.equal(summary.monthlyTimeline[0].monthKey, '2026-09');
  assert.equal(summary.monthlyTimeline[0].status, 'first_subscription');
  assert.equal(summary.monthlyTimeline[0].origin, 'app');

  assert.equal(summary.monthlyTimeline[1].monthKey, '2026-10');
  assert.equal(summary.monthlyTimeline[1].status, 'not_renewed');
  assert.equal(summary.monthlyTimeline[1].statusLabel, 'Não Renovou');

  assert.equal(summary.monthlyTimeline[2].monthKey, '2026-11');
  assert.equal(summary.monthlyTimeline[2].status, 'reactivated');
  assert.equal(summary.monthlyTimeline[2].statusLabel, 'Renovou Novamente');
  assert.equal(summary.monthlyTimeline[2].origin, 'manual_admin');
});

test('buildClientSubscriptionHistory: reconstrói histórico automaticamente para clientes antigos sem subscriptionHistory gravado', () => {
  const nowMs = new Date('2026-11-22T12:00:00.000Z').getTime();

  // Cliente antigo que pagou pelo App em Setembro, venceu em Outubro e ainda não renovou
  const expiredAppUser = buildClientSubscriptionHistory(
    {
      criadoEm: '2026-09-05T10:00:00.000Z',
      assinatura: 'EXPIRADA',
      tipoAcesso: 'mensal',
      asaasPaymentId: 'pay_12345',
      asaasPaymentDate: '2026-09-05T10:05:00.000Z',
      dataPagamento: '2026-09-05T10:05:00.000Z',
      dataExpiracao: '2026-10-05T10:05:00.000Z',
    },
    nowMs
  );

  assert.equal(expiredAppUser.joinedMonthLabel, 'Setembro de 2026');
  assert.equal(expiredAppUser.lastPaymentOrigin, 'app');
  assert.deepEqual(expiredAppUser.monthsWithoutRenewal, ['Out/2026', 'Nov/2026']);
});

test('Painel Admin e Webhook Asaas: integração completa do Controle de Histórico', () => {
  const adminSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'pages', 'AdminPage.tsx'),
    'utf-8'
  );
  const paymentsSrc = fs.readFileSync(
    path.join(__dirname, '..', 'server', 'routes', 'payments.ts'),
    'utf-8'
  );

  assert.ok(
    adminSrc.includes('Controle de Histórico —') &&
    adminSrc.includes('No App Desde') &&
    adminSrc.includes('Quando Assinou (1ª Vez)') &&
    adminSrc.includes('Meses que Não Renovou') &&
    adminSrc.includes('Última Renovação & Origem') &&
    adminSrc.includes('Pago pelo App') &&
    adminSrc.includes('Renovação Manual'),
    'AdminPage.tsx deve renderizar o Controle de Histórico com mês de entrada, 1ª assinatura, meses sem renovar, reativação e origem App vs Manual'
  );

  assert.ok(
    paymentsSrc.includes('subscriptionHistory: prevHistory') &&
    paymentsSrc.includes('lastPaymentOrigin: "app"') &&
    paymentsSrc.includes('firstSubscribedAt: user.firstSubscribedAt || paidDate.toISOString()'),
    'payments.ts deve gravar subscriptionHistory e lastPaymentOrigin="app" nos pagamentos confirmados pelo Asaas'
  );
});
