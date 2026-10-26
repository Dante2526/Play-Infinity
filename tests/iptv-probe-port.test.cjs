/**
 * Testes de unidade do probeLiveStreamUrl (server/routes/iptv.ts)
 *
 * Contexto 1 (relatório #4): URLs relativas sondadas contra a porta do app
 * Express (3000) e não a 8080 do video-proxy — default alinhado a server.ts.
 *
 * Contexto 2 (relatório #7): URLs absolutas externas passavam SEM validação
 * Anti-SSRF — o endpoint /api/admin/probe-channel permitia escanear a rede
 * interna do VPS (127.0.0.1, 10.x, 169.254.169.254). Fix: branch
 * /^https?:\/\// chama isPrivateOrLocalHost e bloqueia hosts privados.
 *
 * Estratégia: unit test com global.fetch mockado + esbuild plugin mockando
 * server/utils/helpers (isPrivateOrLocalHost controlável via globalThis).
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), Module = require('node:module');
const esbuild = require('esbuild');

let probeLiveStreamUrl;
const nativeFetch = global.fetch;
let capturedUrls = [];
let savedPort;

// Hosts considerados privados pelo mock (globalThis para controle por teste)
globalThis.__MOCK_PRIVATE_HOSTS = new Set();

before(async () => {
  const root = path.resolve(__dirname, '..');
  const privateHostsSrc = 'export async function isPrivateOrLocalHost(h) { return (globalThis.__MOCK_PRIVATE_HOSTS || new Set()).has(h); }';
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
    write: false,
    plugins: [{
      name: 'helpers-fixture',
      setup(b) {
        // Substitui ../utils/helpers por mock (iptv.ts só usa isPrivateOrLocalHost)
        b.onResolve({ filter: /utils\/helpers$/ }, a => ({
          path: a.path, namespace: 'helpers-fixture'
        }));
        b.onLoad({ filter: /.*/, namespace: 'helpers-fixture' }, () => ({
          contents: privateHostsSrc
        }));
      }
    }]
  });

  const virtualPath = path.join(root, 'tests/virtual-iptv-probe.cjs');
  const m = new Module(virtualPath, module);
  m.filename = virtualPath;
  m.paths = module.paths;
  m._compile(out.outputFiles[0].text, virtualPath);
  probeLiveStreamUrl = m.exports.probeLiveStreamUrl;
});

beforeEach(() => {
  globalThis.__MOCK_PRIVATE_HOSTS = new Set();
});

after(() => {
  global.fetch = nativeFetch;
  delete globalThis.__MOCK_PRIVATE_HOSTS;
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

  assert.equal(capturedUrls.length, 1, 'fetch deve ser chamado exatamente 1 vez');
  assert.match(capturedUrls[0], /^http:\/\/127\.0\.0\.1:3000\//,
    `URL sondada deveria começar com http://127.0.0.1:3000/ — foi: ${capturedUrls[0]}`);
  assert.doesNotMatch(capturedUrls[0], /:8080/,
    'probe não deve mirar a porta 8080 do video-proxy para rotas do Express');

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

test('URL absoluta pública não ganha host local e prossegue para o fetch (comportamento preservado)', async () => {
  delete process.env.PORT;
  mockFetch();

  await probeLiveStreamUrl('https://cdn.exemplo.com/canal.m3u8');

  assert.equal(capturedUrls[0], 'https://cdn.exemplo.com/canal.m3u8');
});

test('path relativo sem barra inicial não cai em nenhum branch de normalização', async () => {
  delete process.env.PORT;
  mockFetch();

  await probeLiveStreamUrl('api/sem-barra');

  assert.equal(capturedUrls[0], 'api/sem-barra');
});

// ===========================================================================
// Anti-SSRF (relatório #7): URLs absolutas com host privado são bloqueadas
// ===========================================================================

test('URL absoluta com host privado (10.x) é bloqueada SEM fetch', async () => {
  delete process.env.PORT;
  globalThis.__MOCK_PRIVATE_HOSTS = new Set(['10.0.0.5']);
  mockFetch();

  const res = await probeLiveStreamUrl('http://10.0.0.5:8080/interno.m3u8');

  assert.equal(capturedUrls.length, 0, 'fetch NÃO deve ser chamado para host privado');
  assert.equal(res.online, false);
  assert.equal(res.statusCode, 0);
  assert.match(res.error || '', /Anti-SSRF/i);
});

test('URL absoluta com localhost é bloqueada SEM fetch', async () => {
  delete process.env.PORT;
  globalThis.__MOCK_PRIVATE_HOSTS = new Set(['localhost']);
  mockFetch();

  const res = await probeLiveStreamUrl('http://localhost:3000/api/health');

  assert.equal(capturedUrls.length, 0);
  assert.equal(res.online, false);
  assert.match(res.error || '', /Anti-SSRF/i);
});

test('URL absoluta com IP de metadata (169.254.169.254) é bloqueada SEM fetch', async () => {
  delete process.env.PORT;
  globalThis.__MOCK_PRIVATE_HOSTS = new Set(['169.254.169.254']);
  mockFetch();

  const res = await probeLiveStreamUrl('http://169.254.169.254/opc/v2/instance/');

  assert.equal(capturedUrls.length, 0);
  assert.equal(res.online, false);
  assert.match(res.error || '', /Anti-SSRF/i);
});

test('hostname público que resolve para IP privado via DNS é bloqueado (DNS rebinding)', async () => {
  delete process.env.PORT;
  globalThis.__MOCK_PRIVATE_HOSTS = new Set(['rebind.atacante.com']);
  mockFetch();

  const res = await probeLiveStreamUrl('https://rebind.atacante.com/stream.m3u8');

  assert.equal(capturedUrls.length, 0, 'hosts que resolvem para privado devem ser bloqueados');
  assert.equal(res.online, false);
  assert.match(res.error || '', /Anti-SSRF/i);
});

test('URL absoluta pública segue para o fetch mesmo com privados configurados (não sobe o bloqueio)', async () => {
  delete process.env.PORT;
  globalThis.__MOCK_PRIVATE_HOSTS = new Set(['10.0.0.5', '169.254.169.254']);
  mockFetch();

  const res = await probeLiveStreamUrl('https://cdn.publico.com/canal.m3u8');

  assert.equal(capturedUrls.length, 1, 'host público deve seguir para fetch');
  assert.equal(capturedUrls[0], 'https://cdn.publico.com/canal.m3u8');
  assert.equal(res.online, true);
});
