/**
 * Testes de unidade do probeLiveStreamUrl (server/routes/iptv.ts)
 *
 * Contexto (relatório de revisão #4): URLs relativas de canal que não começam
 * com /api/iptv/ (ex: /api/live-stream-proxy?url=...) caíam no branch
 * `else if (targetUrl.startsWith("/"))` e eram sondadas contra
 * http://127.0.0.1:8080 quando process.env.PORT não estava definido.
 * O 8080 é o video-proxy (processo SEPARADO, watchdog.sh), que NÃO serve as
 * rotas do Express — na prática o probe daria 404/connection refused e o
 * canal apareceria "fora do ar" falsamente.
 *
 * Nota de produção: o PM2 injeta PORT=3000 via ecosystem.config.cjs, então o
 * fallback nunca disparava em produção — o impacto real era dev local e
 * execução direta (node dist/server.cjs). O fix alinha o default a
 * server.ts:45 e encontreiLookup.ts:57/87 (todos 3000).
 *
 * Estratégia: unit test com global.fetch mockado — não sobe servidor; apenas
 * captura a URL que o probe tentaria atingir e valida a porta.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), Module = require('node:module');
const esbuild = require('esbuild');

let probeLiveStreamUrl;
const nativeFetch = global.fetch;
let capturedUrls = [];
let savedPort;

before(async () => {
  const root = path.resolve(__dirname, '..');
  const out = await esbuild.build({
    stdin: {
      // Named re-export: com format=cjs o default viraria .default
      contents: "export { probeLiveStreamUrl } from './server/routes/iptv';",
      loader: 'ts',
      resolveDir: root
    },
    bundle: true,
    platform: 'node',
    packages: 'external',
    format: 'cjs',
    write: false
  });

  const virtualPath = path.join(root, 'tests/virtual-iptv-probe.cjs');
  const m = new Module(virtualPath, module);
  m.filename = virtualPath;
  m.paths = module.paths;
  m._compile(out.outputFiles[0].text, virtualPath);
  probeLiveStreamUrl = m.exports.probeLiveStreamUrl;
});

after(() => {
  global.fetch = nativeFetch;
  if (savedPort === undefined) delete process.env.PORT;
  else process.env.PORT = savedPort;
});

function mockFetch(status = 200, body = '#EXTM3U\n') {
  capturedUrls = [];
  global.fetch = (async (url) => {
    capturedUrls.push(String(url));
    return new Response(body, { status });
  });
}

test('sem PORT definida, URL relativa é sondada contra a porta do app Express (3000), não a 8080 do video-proxy', async () => {
  savedPort = process.env.PORT;
  delete process.env.PORT;
  mockFetch();

  const res = await probeLiveStreamUrl('/api/live-stream-proxy?url=https%3A%2F%2Fexemplo.com%2Fx.m3u8');

  // A rota /api/live-stream-proxy só existe no app Express (3000);
  // no video-proxy (8080) ela retorna 404 (verificado em produção).
  assert.equal(capturedUrls.length, 1, 'fetch deve ser chamado exatamente 1 vez');
  assert.match(capturedUrls[0], /^http:\/\/127\.0\.0\.1:3000\//,
    `URL sondada deveria começar com http://127.0.0.1:3000/ — foi: ${capturedUrls[0]}`);
  assert.doesNotMatch(capturedUrls[0], /:8080/,
    'probe não deve mirar a porta 8080 do video-proxy para rotas do Express');

  // resposta m3u8 válida → online
  assert.equal(res.online, true);
  assert.equal(res.statusCode, 200);
});

test('PORT customizada via ambiente é respeitada', async () => {
  process.env.PORT = '9876';
  mockFetch();

  const res = await probeLiveStreamUrl('/api/outra-rota-relativa');

  assert.match(capturedUrls[0], /^http:\/\/127\.0\.0\.1:9876\//,
    `PORT=9876 deveria ser usada — foi: ${capturedUrls[0]}`);
  assert.equal(res.online, true);
});

test('URL absoluta não ganha host local (comportamento preservado)', async () => {
  delete process.env.PORT;
  mockFetch();

  await probeLiveStreamUrl('https://cdn.exemplo.com/canal.m3u8');

  assert.equal(capturedUrls[0], 'https://cdn.exemplo.com/canal.m3u8');
});

test('path relativo sem barra inicial não cai no branch de self-probe', async () => {
  delete process.env.PORT;
  mockFetch();

  await probeLiveStreamUrl('api/sem-barra');

  assert.equal(capturedUrls[0], 'api/sem-barra');
});
