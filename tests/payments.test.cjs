const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const express = require('express');
const esbuild = require('esbuild');

// Exercise the real HTTP router. Only authentication, Firestore and Asaas are
// replaced; no real accounts, credentials or payments are used.
const nativeFetch = global.fetch;
const originalKey = process.env.ASAAS_API_KEY;
const originalToken = process.env.ASAAS_WEBHOOK_TOKEN;
let server, base, documents, writes, subscriptionCalls, providerPayment;
let providerUnavailable, dbUnavailable, subscriptionOwner, transactionQueue;
const userPath = 'usuarios/test-user';

function ref(documentPath) {
  return {
    path: documentPath,
    collection: name => ({ doc: id => ref(`${documentPath}/${name}/${id}`) }),
    get: async () => snapshot(documentPath),
  };
}
function snapshot(documentPath) {
  const data = documents.get(documentPath);
  return { exists: data !== undefined, data: () => data && structuredClone(data) };
}
const db = {
  collection: name => ({ doc: id => ref(`${name}/${id}`) }),
  // Serialize and commit atomically, matching the relevant transaction contract.
  runTransaction(callback) {
    const operation = transactionQueue.then(async () => {
      const pending = [];
      const result = await callback({
        get: async document => snapshot(document.path),
        set: (document, data, options) => pending.push({ document, data, options }),
      });
      for (const { document, data, options } of pending) {
        const previous = options?.merge ? documents.get(document.path) : {};
        documents.set(document.path, { ...previous, ...structuredClone(data) });
        writes.push(document.path);
      }
      return result;
    });
    transactionQueue = operation.catch(() => {});
    return operation;
  },
};

before(async () => {
  const root = path.resolve(__dirname, '..');
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ['server/routes/payments.ts'],
    bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external',
    plugins: [{ name: 'payment-fixtures', setup(build) {
      build.onResolve({ filter: /firebaseAdmin|requireAdminAuth/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        loader: 'js',
        contents: args.path.includes('firebaseAdmin')
          ? 'export const getAdminDb = () => globalThis.__paymentTestDb();'
          : 'export const verifyFirebaseUserToken = async token => token === "test-token" ? {uid:"test-user",email:"test@example.invalid"} : null;',
      }));
    } }],
  });
  globalThis.__paymentTestDb = () => dbUnavailable ? null : db;
  const filename = path.join(root, 'tests', 'virtual-payments.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(result.outputFiles[0].text, filename);
  const app = express();
  app.use(express.json());
  app.use(compiled.exports.default);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  global.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/customers')) return Response.json({ data: [{ id: 'cus_test' }] });
    if (url.pathname.endsWith('/subscriptions/sub_test') && !options.method) {
      return Response.json({ id: 'sub_test', externalReference: subscriptionOwner, status: 'ACTIVE' });
    }
    if (/\/subscriptions(?:\/sub_test)?$/.test(url.pathname)) {
      subscriptionCalls.push({ method: options.method, payload: JSON.parse(options.body) });
      return Response.json({ id: 'sub_test' });
    }
    if (url.pathname.endsWith('/payments')) {
      return Response.json({ data: [{ id: 'pay_test', invoiceUrl: 'https://example.invalid/invoice' }] });
    }
    if (url.pathname.endsWith('/payments/pay_test')) {
      if (providerUnavailable) throw new Error('Simulated Asaas outage');
      return Response.json(providerPayment);
    }
    throw new Error(`Unexpected external request: ${url.hostname}${url.pathname}`);
  };
});

beforeEach(() => {
  documents = new Map([[userPath, { assinatura: 'ATIVA', valorMensalidade: 13 }]]);
  writes = [];
  subscriptionCalls = [];
  providerUnavailable = dbUnavailable = false;
  subscriptionOwner = 'test-user';
  transactionQueue = Promise.resolve();
  providerPayment = {
    id: 'pay_test', externalReference: 'test-user', subscription: 'sub_test',
    status: 'RECEIVED', paymentDate: '2026-01-31', dueDate: '2026-01-31',
  };
  process.env.ASAAS_API_KEY = 'test-placeholder';
  process.env.ASAAS_WEBHOOK_TOKEN = 'test-webhook';
});

after(async () => {
  global.fetch = nativeFetch;
  delete globalThis.__paymentTestDb;
  for (const [key, value] of [['ASAAS_API_KEY', originalKey], ['ASAAS_WEBHOOK_TOKEN', originalToken]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await new Promise(resolve => server.close(resolve));
});

async function post(endpoint, body, headers = {}) {
  const response = await nativeFetch(base + endpoint, {
    method: 'POST', headers: {
      'content-type': 'application/json', authorization: 'Bearer test-token',
      'asaas-access-token': 'test-webhook', ...headers,
    }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
const subscribe = body => post('/api/create-subscription', body);
const webhook = (event = 'PAYMENT_RECEIVED', payment = {}) => post('/api/webhook/asaas', {
  event, payment: { id: 'pay_test', externalReference: 'test-user', ...payment },
});

test('Plus always creates a full R$17 monthly subscription, including tampered fees', async () => {
  for (const fee of [13, 9.9, 16.99, 200, '16,99']) {
    documents.set(userPath, { assinatura: 'ATIVA', valorMensalidade: fee });
    assert.equal((await subscribe({ plan: 'plus', value: 0.01 })).status, 200);
    const { payload } = subscriptionCalls.at(-1);
    assert.equal(payload.value, 17);
    assert.equal(payload.cycle, 'MONTHLY');
    assert.equal(payload.externalReference, 'test-user|PLUS');
  }
});

test('standard ignores arbitrary fees and client signup dates; explicit legacy fee remains', async () => {
  for (const fee of [16.99, 0.01, '113', null]) {
    documents.set(userPath, { valorMensalidade: fee, criadoEm: '2000-01-01' });
    assert.equal((await subscribe({ plan: 'standard', description: 'plus', externalReference: 'another-user' })).status, 200);
    assert.equal(subscriptionCalls.at(-1).payload.value, 13);
    assert.equal(subscriptionCalls.at(-1).payload.externalReference, 'test-user');
  }
  documents.set(userPath, { valorMensalidade: 9.9 });
  await subscribe({ plan: 'standard' });
  assert.equal(subscriptionCalls.at(-1).payload.value, 9.9);
});

test('Plus updates the linked active subscription without creating parallel recurrence', async () => {
  documents.set(userPath, { subscriptionId: 'sub_test', valorMensalidade: 13 });
  assert.equal((await subscribe({ plan: 'plus' })).status, 200);
  assert.equal(subscriptionCalls.length, 1);
  assert.equal(subscriptionCalls[0].method, 'PUT');
  assert.equal(subscriptionCalls[0].payload.value, 17);
  assert.equal(subscriptionCalls[0].payload.updatePendingPayments, true);
  assert.equal(subscriptionCalls[0].payload.nextDueDate, undefined);
});

test('upgrade refuses a subscription owned by another user', async () => {
  documents.set(userPath, { subscriptionId: 'sub_test' });
  subscriptionOwner = 'another-user';
  assert.equal((await subscribe({ plan: 'plus' })).status, 400);
  assert.equal(subscriptionCalls.length, 0);
});

test('authentication and plan validation prevent subscription creation', async () => {
  assert.equal((await post('/api/create-subscription', {}, { authorization: '' })).status, 401);
  assert.equal((await subscribe({ plan: 'invalid' })).status, 400);
  assert.equal(subscriptionCalls.length, 0);
});

test('stale overdue/refund/deletion events cannot deactivate a received payment', async () => {
  for (const event of ['PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_DELETED']) {
    const result = await webhook(event);
    assert.equal(result.status, 200);
    assert.equal(result.body.ignored, 'Evento desatualizado');
  }
  assert.equal(writes.length, 0);
});

test('API outage or missing API key never trusts even a signed event', async () => {
  providerUnavailable = true;
  assert.equal((await webhook()).status, 503);
  providerUnavailable = false;
  delete process.env.ASAAS_API_KEY;
  assert.equal((await webhook()).status, 503);
  assert.equal(writes.length, 0);
});

test('rejects invalid webhook token, payment identity and user reference', async () => {
  assert.equal((await post('/api/webhook/asaas', {}, { 'asaas-access-token': 'wrong' })).status, 401);
  assert.equal((await webhook('PAYMENT_RECEIVED', { id: '../other' })).status, 400);
  assert.equal((await webhook('PAYMENT_RECEIVED', { externalReference: 'other-user' })).status, 400);
  assert.equal(writes.length, 0);
});

test('concurrent confirmations and redeliveries credit a payment exactly once', async () => {
  const results = await Promise.all([webhook('PAYMENT_CONFIRMED'), webhook(), webhook()]);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(writes.filter(p => p === userPath).length, 1);
  assert.equal(documents.get(userPath).dataExpiracao, '2026-02-28T00:00:00.000Z');
  const previous = structuredClone(documents.get(userPath));
  await webhook();
  assert.deepEqual(documents.get(userPath), previous);
});

test('a delayed first delivery uses the payment date, not delivery time', async () => {
  await webhook();
  assert.equal(documents.get(userPath).dataPagamento, '2026-01-31T00:00:00.000Z');
  assert.equal(documents.get(userPath).dataExpiracao, '2026-02-28T00:00:00.000Z');
});

test('an older payment cannot overwrite a newer subscription or shorten access', async () => {
  const user = { assinatura: 'ATIVA', subscriptionId: 'sub_new', asaasPaymentDate: '2026-03-01', dataExpiracao: '2026-04-01' };
  documents.set(userPath, user);
  await webhook();
  assert.deepEqual(documents.get(userPath), user);
});

test('negative events for a different payment cannot revoke the current paid period', async () => {
  const user = { assinatura: 'ATIVA', subscriptionId: 'sub_new', asaasPaymentId: 'pay_new', dataExpiracao: '2099-01-01' };
  documents.set(userPath, user);
  for (const [event, status] of [['PAYMENT_REFUNDED', 'REFUNDED'], ['PAYMENT_DELETED', 'PENDING'], ['PAYMENT_OVERDUE', 'OVERDUE']]) {
    providerPayment.status = status;
    providerPayment.deleted = event === 'PAYMENT_DELETED';
    assert.equal((await webhook(event)).status, 200);
  }
  assert.deepEqual(documents.get(userPath), user);
});

test('current payment refund revokes access; a later confirmation cannot reactivate it', async () => {
  await webhook();
  providerPayment.status = 'REFUNDED';
  await webhook('PAYMENT_REFUNDED');
  assert.equal(documents.get(userPath).assinatura, 'INATIVA');
  providerPayment.status = 'RECEIVED';
  await webhook();
  assert.equal(documents.get(userPath).assinatura, 'INATIVA');
});

test('real overdue payment revokes only an expired period of its subscription', async () => {
  documents.set(userPath, { assinatura: 'ATIVA', subscriptionId: 'sub_test', dataExpiracao: '2099-01-01' });
  providerPayment.status = 'OVERDUE';
  await webhook('PAYMENT_OVERDUE');
  assert.equal(documents.get(userPath).assinatura, 'ATIVA');
  documents.set(userPath, { assinatura: 'ATIVA', subscriptionId: 'sub_test', dataExpiracao: '2000-01-01' });
  await webhook('PAYMENT_OVERDUE');
  assert.equal(documents.get(userPath).assinatura, 'INATIVA');
});

test('a persisted payment marker prevents reapplication after a server restart', async () => {
  documents.set(`${userPath}/asaasPayments/pay_test`, { paidApplied: true, status: 'CONFIRMED' });
  const previous = structuredClone(documents.get(userPath));
  await webhook();
  assert.deepEqual(documents.get(userPath), previous);
  assert.equal(writes.length, 0);
});

test('invalid authoritative dates cannot grant access', async () => {
  providerPayment.paymentDate = 'not-a-date';
  assert.equal((await webhook()).status, 400);
  assert.equal(writes.length, 0);
});

test('Plus stores the same R$17 tariff used by the subscription', async () => {
  providerPayment.externalReference = 'test-user|PLUS';
  assert.equal((await webhook('PAYMENT_RECEIVED', { externalReference: 'test-user|PLUS' })).status, 200);
  assert.equal(documents.get(userPath).plano, 'plus');
  assert.equal(documents.get(userPath).valorMensalidade, 17);
});

test('database unavailability returns retryable errors instead of acknowledging lost payments', async () => {
  dbUnavailable = true;
  assert.equal((await webhook()).status, 503);
  assert.equal((await subscribe({ plan: 'plus' })).status, 503);
  assert.equal(writes.length, 0);
  assert.equal(subscriptionCalls.length, 0);
});
