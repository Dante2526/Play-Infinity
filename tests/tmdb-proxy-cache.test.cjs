/**
 * Testes de integração da rota /api/tmdb via server/routes/tmdbProxy.ts
 *
 * Contexto (relatório de revisão #5): o router com cache LRU de 15 min
 * (tmdbCache em server/utils/caches) + deduplicação de requests inflight
 * existia em tmdbProxy.ts mas NUNCA foi montado no server.ts — a rota antiga
 * inline (linha ~516) fazia fetch direto no TMDB a cada requisição, sem
 * cache e sem timeout. Fix: router montado via app.use(tmdbProxyRouter) e
 * bloco antigo removido.
 *
 * Estratégia: empacota o router com esbuild, sobe em Express real (porta
 * efêmera) e mocka global.fetch SOMENTE para api.themoviedb.org — chamadas
 * ao servidor local de teste passam pelo fetch nativo.
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), Module = require('node:module');
const esbuild = require('esbuild'), express = require('express');

let server, base, router, tmdbCache;
const nativeFetch = global.fetch;

// Estado do mock de upstream
let upstreamCalls = [];
let upstreamStatus = 200;
let upstreamBody = { page: 1, results: [{ id: 1, title: 'Filme Teste' }] };
let upstreamDelayMs = 0;

before(async () => {
  const root = path.resolve(__dirname, '..');
  const out = await esbuild.build({
    stdin: {
      // Named re-exports: com format=cjs o default viraria .default
      contents: "import tmdbProxyRouter from './server/routes/tmdbProxy'; import { tmdbCache } from './server/utils/caches'; export { tmdbProxyRouter, tmdbCache };",
      loader: 'ts',
      resolveDir: root
    },
    bundle: true,
    platform: 'node',
    packages: 'external',
    format: 'cjs',
    write: false
  });

  const virtualPath = path.join(root, 'tests/virtual-tmdb-proxy.cjs');
  const m = new Module(virtualPath, module);
  m.filename = virtualPath;
  m.paths = module.paths;
  m._compile(out.outputFiles[0].text, virtualPath);
  router = m.exports.tmdbProxyRouter;
  tmdbCache = m.exports.tmdbCache;

  const app = express();
  app.use(router);
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;

  // Mock de upstream: só intercepta TMDB; resto (servidor local) passa direto
  global.fetch = (async (url, opts) => {
    const u = String(url);
    if (u.includes('api.themoviedb.org')) {
      upstreamCalls.push(u);
      if (upstreamDelayMs > 0) await new Promise(r => setTimeout(r, upstreamDelayMs));
      return new Response(JSON.stringify(upstreamBody), {
        status: upstreamStatus,
        headers: { 'content-type': 'application/json' }
      });
    }
    return nativeFetch(url, opts);
  });
});

beforeEach(() => {
  upstreamCalls = [];
  upstreamStatus = 200;
  upstreamBody = { page: 1, results: [{ id: 1, title: 'Filme Teste' }] };
  upstreamDelayMs = 0;
  tmdbCache.clear();
});

after(async () => {
  global.fetch = nativeFetch;
  if (server) await new Promise(r => server.close(r));
});

test('requisição repetida ao mesmo path é servida do cache LRU (1 único fetch upstream)', async () => {
  const url = `${base}/api/tmdb/trending/movie/week?language=pt-BR`;

  const r1 = await fetch(url);
  assert.equal(r1.status, 200);
  assert.equal(upstreamCalls.length, 1, 'primeira requisição deve ir ao upstream');
  // 200 fresco → header de cache curto
  assert.match(r1.headers.get('cache-control') || '', /max-age=120/);

  const d1 = await r1.json();
  const r2 = await fetch(url);
  const d2 = await r2.json();

  assert.equal(upstreamCalls.length, 1, 'segunda requisição NÃO deve ir ao upstream (cache LRU)');
  // hit de cache → header de cache longo
  assert.match(r2.headers.get('cache-control') || '', /max-age=900/);
  assert.deepEqual(d1, d2, 'dados do cache devem ser idênticos');
});

test('requests concorrentes idênticos são deduplicados (inflight)', async () => {
  upstreamDelayMs = 80; // segura o upstream para ambas chegarem "inflight"
  const url = `${base}/api/tmdb/movie/550?language=pt-BR`;

  const [r1, r2] = await Promise.all([fetch(url), fetch(url)]);

  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(upstreamCalls.length, 1, '2 requests simultâneios devem gerar 1 único fetch upstream');
});

test('query params diferentes têm chaves de cache distintas', async () => {
  await fetch(`${base}/api/tmdb/search/movie?query=batman`);
  await fetch(`${base}/api/tmdb/search/movie?query=matrix`);

  assert.equal(upstreamCalls.length, 2, 'queries distintas devem gerar 2 upstream calls');
  assert.ok(upstreamCalls[0].includes('query=batman'));
  assert.ok(upstreamCalls[1].includes('query=matrix'));
});

test('erro upstream (401) repassa status e NÃO é cacheado', async () => {
  upstreamStatus = 401;
  upstreamBody = { success: false, status_message: 'Invalid API key' };

  const r1 = await fetch(`${base}/api/tmdb/movie/999`);
  assert.equal(r1.status, 401);
  assert.equal(upstreamCalls.length, 1);
  assert.equal(r1.headers.get('cache-control'), null, 'resposta de erro não deve ter header de cache');

  const r2 = await fetch(`${base}/api/tmdb/movie/999`);
  assert.equal(r2.status, 401);
  assert.equal(upstreamCalls.length, 2, 'erro não deve ser cacheado — 2ª chamada volta ao upstream');
});

test('forma ?path= é suportada e api_key do servidor é anexada ao upstream (chave oculta do cliente)', async () => {
  process.env.TMDB_API_KEY = 'chave-teste-123';
  try {
    const r = await fetch(`${base}/api/tmdb?path=/movie/550`);
    assert.equal(r.status, 200);

    assert.equal(upstreamCalls.length, 1);
    assert.ok(upstreamCalls[0].startsWith('https://api.themoviedb.org/3/movie/550?'),
      `upstream URL inesperada: ${upstreamCalls[0]}`);
    assert.ok(upstreamCalls[0].includes('api_key=chave-teste-123'),
      'api_key do .env deve ser injetada pelo servidor');
    // path é removido da query repassada
    assert.ok(!upstreamCalls[0].includes('path='), 'param path não deve vazar ao upstream');
  } finally {
    delete process.env.TMDB_API_KEY;
  }
});
