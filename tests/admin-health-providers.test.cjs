/**
 * Testes do /api/admin/health-check (aba de Saúde do painel admin):
 * - Cobertura completa de provedores: catálogos (Encontrei, Vizer, Saimo,
 *   AnimesDigital) + servidores de vídeo individuais (MixDrop, Streamtape,
 *   Byse, VIP Player, Watchplayer) + API (TMDB).
 * - Campo category em cada resultado (o painel agrupa por ele).
 * - speedKbps medido a partir do corpo da resposta (throughput de download).
 * - Card do AnimesDigital informa por que o catálogo SQLite local não está
 *   ativo (node:sqlite indisponível OU .db ausente) sem derrubar o status.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const express = require('express');

const root = path.resolve(__dirname, '..');
const nativeFetch = global.fetch;
let api, server, base;

// Corpo com chunks espaçados no tempo pra a medição de velocidade ter duração
// mensurável (>= 20ms) mesmo vindo de um mock local.
function delayedBody(totalBytes, chunkCount, delayMs, prefix = '') {
  const { ReadableStream } = require('node:stream/web');
  const prefixBytes = Buffer.from(prefix, 'utf8');
  const rest = totalBytes - prefixBytes.length;
  const chunkSize = Math.max(1, Math.ceil(rest / chunkCount));
  let sent = 0;
  let prefixSent = false;
  return new ReadableStream({
    async pull(controller) {
      if (!prefixSent) {
        prefixSent = true;
        controller.enqueue(prefixBytes);
        if (rest <= 0) { controller.close(); return; }
        await new Promise(r => setTimeout(r, delayMs));
        return;
      }
      if (sent >= rest) { controller.close(); return; }
      const n = Math.min(chunkSize, rest - sent);
      controller.enqueue(new Uint8Array(n).fill(0x61)); // 'a'
      sent += n;
      await new Promise(r => setTimeout(r, delayMs));
    }
  });
}

function pageResponse(url, totalBytes = 120 * 1024) {
  const response = new Response(delayedBody(totalBytes, 24, 4), { status: 200, headers: { 'content-type': 'text/html' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

const fetchLog = [];
async function mockFetch(url, options = {}) {
  const href = String(url);
  fetchLog.push(href);
  if (href.startsWith('https://encontrei.me')) {
    const response = new Response(
      delayedBody(120 * 1024, 24, 4, '<html><head><title>Encontrei</title></head><body><a href="/series/online/foo-1/">s</a>'),
      { status: 200, headers: { 'content-type': 'text/html' } }
    );
    Object.defineProperty(response, 'url', { value: 'https://encontrei.me/' });
    return response;
  }
  if (href.startsWith('https://www.vizer.host')) {
    // O checkVizerHealth valida a listagem real: precisa de um link
    // /series/online/<slug>-<id>/ no HTML da página.
    return new Response(
      delayedBody(120 * 1024, 24, 4, '<html><body><a href="/series/online/serie-teste-123/">s</a>'),
      { status: 200, headers: { 'content-type': 'text/html' } }
    );
  }
  if (href.startsWith('https://saimo-tv.pages.dev')) {
    return new Response(delayedBody(200 * 1024, 20, 5), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (href.startsWith('https://animesdigital.org')) {
    return pageResponse(href);
  }
  if (href.startsWith('https://api.themoviedb.org')) {
    return new Response(JSON.stringify({ images: { base_url: 'http://image.tmdb.org' } }), { status: 200 });
  }
  // Servidores de vídeo individuais + players embed
  if (/^https:\/\/(mxdrop\.top|streamtape\.com|n1mwq\.org|myembed\.biz|v1\.watchplay\.shop)/.test(href)) {
    return pageResponse(href);
  }
  throw new Error('URL não mockada no teste: ' + href);
}

before(async () => {
  const out = await esbuild.build({
    stdin: {
      contents: "export { adminOpsRouter } from './server/routes/adminOps';",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    write: false,
    plugins: [{
      name: 'stubs',
      setup(b) {
        // Um namespace distinto por stub: cada onLoad devolve exatamente o
        // seu contents (evita colisão quando vários filtros compartilham
        // o mesmo namespace).
        let seq = 0;
        const stubs = [
          [/firebaseAdmin$/, 'export const getAdminMessaging=()=>null;export const getAdminDb=()=>null;export const getAdminFieldValue=()=>null;'],
          [/^ssh2$/, 'export class Client{constructor(){}}'],
          [/adminSentinel$/, 'export const getSentinelStatus=()=>({});export const runSentinelCheck=async()=>({});export const registerAdminPushToken=()=>{};export const sendPushToAdmins=async()=>({});'],
          [/dunningWatcher$/, 'export const isDelinquentUser=async()=>false;'],
          [/encontreiLookup$/, 'export const getEncontreiResolverStatus=()=>({ok:true});export const getVizerCatalogStatus=()=>({movies:11,episodes:22,series:33});export const getEncontreiCatalogStatus=()=>({movies:44,episodes:55,series:66});'],
        ];
        for (const [filter, contents] of stubs) {
          const namespace = 'stub' + (seq++);
          b.onResolve({ filter }, a => ({ path: a.path, namespace }));
          b.onLoad({ filter: /.*/, namespace }, () => ({ contents, loader: 'js' }));
        }
      },
    }],
  });
  const m = new Module(path.join(root, 'tests/virtual-admin-health.cjs'), module);
  m.filename = path.join(root, 'tests/virtual-admin-health.cjs');
  m.paths = module.paths;
  m._compile(out.outputFiles[0].text, m.filename);
  api = m.exports;

  delete process.env.ENCONTREI_COOKIE;
  global.fetch = mockFetch;
  const app = express();
  app.use('/api/admin', api.adminOpsRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  global.fetch = nativeFetch;
  server.closeAllConnections();
  await new Promise(r => server.close(r));
});

const getResults = async () => {
  const data = await (await nativeFetch(base + '/api/admin/health-check')).json();
  assert.equal(data.success, true);
  return data.results;
};

test('health-check cobre catálogos, servidores de vídeo individuais e APIs com category em cada card', async () => {
  const results = await getResults();
  const byName = Object.fromEntries(results.map(r => [r.name, r]));

  const expected = {
    'Catálogo Encontrei.me': 'catalog',
    'Catálogo Vizer': 'catalog',
    'Catálogo Saimo TV': 'catalog',
    'Catálogo AnimesDigital': 'catalog',
    'MixDrop': 'server',
    'Streamtape': 'server',
    'Byse': 'server',
    'VIP Player': 'server',
    'Watchplayer': 'server',
    'TMDB API': 'api',
  };
  assert.deepEqual(results.map(r => r.name).sort(), Object.keys(expected).sort());
  for (const [name, category] of Object.entries(expected)) {
    assert.equal(byName[name].category, category, `${name} deveria ser category=${category}`);
    assert.equal(byName[name].status, 'ONLINE', `${name} deveria estar ONLINE`);
    assert.equal(byName[name].statusCode, 200, `${name} deveria responder HTTP 200`);
  }
  // A aba do painel promete velocidade pros servidores individuais e catálogos
  for (const name of ['MixDrop', 'Streamtape', 'Byse', 'Catálogo Encontrei.me', 'Catálogo Saimo TV', 'Catálogo AnimesDigital']) {
    assert.ok(typeof byName[name].speedKbps === 'number' && byName[name].speedKbps > 0, `${name} deveria ter speedKbps > 0`);
  }
  // Corpo pequeno (JSON de configuração) não gera métrica de velocidade
  assert.ok(!byName['TMDB API'].speedKbps, 'TMDB (corpo pequeno) não deveria reportar speedKbps');
  assert.equal(byName['Streamtape'].url, 'https://streamtape.com');
  assert.equal(byName['Byse'].url, 'https://n1mwq.org');
});

test('card do AnimesDigital explica por que o catálogo SQLite local está inativo (sem .db ou sem node:sqlite)', async () => {
  const results = await getResults();
  const card = results.find(r => r.name === 'Catálogo AnimesDigital');
  const hasDb = card.catalog && card.catalog.episodes > 0;
  if (hasDb) {
    assert.ok(!card.note, 'com .db ativo não deveria haver note');
  } else {
    assert.ok(card.note && /live search/i.test(card.note), 'deveria explicar o motivo e o fallback: ' + card.note);
  }
});

test('catálogos carregam stats locais e o Vizer valida a listagem real antes de ficar ONLINE', async () => {
  const results = await getResults();
  const byName = Object.fromEntries(results.map(r => [r.name, r]));
  // Stubs do encontreiLookup refletem os contadores dos catálogos em memória
  assert.deepEqual(byName['Catálogo Encontrei.me'].catalog, { movies: 44, episodes: 55, series: 66 });
  assert.deepEqual(byName['Catálogo Vizer'].catalog, { movies: 11, episodes: 22, series: 33 });
  // O mock do vizer.host devolve HTML de listagem com link /series/online/<slug>-<id>/
  assert.ok(fetchLog.some(u => u.startsWith('https://www.vizer.host/series/online/')), 'deveria ter probado a listagem do Vizer');
});

test('provedor de vídeo individual fora do ar aparece OFFLINE sem quebrar os demais', async () => {
  const broken = async (url) => { if (String(url).startsWith('https://streamtape.com')) throw new Error('socket hang up'); return mockFetch(url); };
  const previous = global.fetch;
  global.fetch = broken;
  try {
    const data = await (await nativeFetch(base + '/api/admin/health-check')).json();
    assert.equal(data.success, true);
    const byName = Object.fromEntries(data.results.map(r => [r.name, r]));
    assert.equal(byName['Streamtape'].status, 'OFFLINE');
    assert.equal(byName['Streamtape'].latencyMs, null);
    assert.match(byName['Streamtape'].error, /socket hang up/);
    assert.equal(byName['MixDrop'].status, 'ONLINE');
    assert.equal(byName['Byse'].status, 'ONLINE');
  } finally {
    global.fetch = previous;
  }
});
