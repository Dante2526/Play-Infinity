/**
 * Guarda de regressão Anti-SSRF: nixplayRoutes + doodstreamRoutes (relatório #8)
 *
 * Contexto: /api/nixplay-proxy e /api/nixplay-resolve fetchavam QUALQUER URL
 * da query sem allowlist e sem isPrivateOrLocalHost (proxy aberto + oráculo de
 * rede interna — confirmado em produção streamando o /api/health do loopback);
 * /api/proxy-test devolvia o CORPO de qualquer URL sem autenticação (SSRF
 * full-read); /api/doodstream-stream validava com includes("dood") na STRING
 * INTEIRA — http://127.0.0.1:3000/x?dood passava (bypass confirmado em prod).
 *
 * Fix: parse formal new URL() + protocolo http/https + allowlist de HOSTNAME
 * + isPrivateOrLocalHost (DNS ativo) nos 3 endpoints de mídia; proxy-test
 * protegido por requireAdminAuth.
 *
 * Estratégia: routers reais bundleados via esbuild (plugin mockando
 * server/utils/helpers com isPrivateOrLocalHost controlável via globalThis),
 * montados num Express real em porta efemera, com global.fetch mockado —
 * assertion central: URL bloqueada JAMAIS chega ao fetch.
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), Module = require('node:module');
const esbuild = require('esbuild');
const express = require('express');

let nixplayRouter, doodstreamRouter;
const nativeFetch = global.fetch;
let capturedUrls = [];
let app, server, baseUrl;

// Hosts considerados privados pelo mock (globalThis para controle por teste)
globalThis.__MOCK_PRIVATE_HOSTS = new Set();

before(async () => {
  const root = path.resolve(__dirname, '..');
  const privateHostsSrc = 'export async function isPrivateOrLocalHost(h) { return (globalThis.__MOCK_PRIVATE_HOSTS || new Set()).has(String(h).toLowerCase()); }';
  const out = await esbuild.build({
    stdin: {
      contents: "export { default as nixplayRouter } from './server/routes/nixplayRoutes';\nexport { doodstreamRouter } from './server/routes/doodstreamRoutes';",
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
        // Substitui ../utils/helpers por mock (os dois routers só usam isPrivateOrLocalHost)
        b.onResolve({ filter: /utils\/helpers$/ }, a => ({
          path: a.path, namespace: 'helpers-fixture'
        }));
        b.onLoad({ filter: /.*/, namespace: 'helpers-fixture' }, () => ({
          contents: privateHostsSrc
        }));
      }
    }]
  });

  const virtualPath = path.join(root, 'tests/virtual-nixplay-doodstream.cjs');
  const m = new Module(virtualPath, module);
  m.filename = virtualPath;
  m.paths = module.paths;
  m._compile(out.outputFiles[0].text, virtualPath);
  nixplayRouter = m.exports.nixplayRouter;
  doodstreamRouter = m.exports.doodstreamRouter;

  app = express();
  app.use(nixplayRouter);
  app.use(doodstreamRouter);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  globalThis.__MOCK_PRIVATE_HOSTS = new Set();
  capturedUrls = [];
  global.fetch = (async (url, opts) => {
    capturedUrls.push(String(url));
    return new Response('#EXTM3U mock\n', {
      status: 200,
      headers: { 'content-type': 'application/vnd.apple.mpegurl' }
    });
  });
});

after(async () => {
  global.fetch = nativeFetch;
  delete globalThis.__MOCK_PRIVATE_HOSTS;
  if (server) await new Promise((r) => server.close(r));
});

function mockFetchRedirect(location) {
  global.fetch = (async (url) => {
    capturedUrls.push(String(url));
    return new Response(null, { status: 302, headers: { location } });
  });
}

// IMPORTANTE: o cliente HTTP do teste usa a referência NATIVA do fetch — o
// global.fetch é substituído pelo mock para simular o fetch do SERVIDOR
// (os routers bundleados chamam global.fetch). Se usássemos o global aqui,
// a request nem chegaria ao Express e todo teste receberia 200 do mock.
async function get(pathname) {
  const res = await nativeFetch(baseUrl + pathname, { redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, text };
}

// ---------------------------------------------------------------------------
// /api/nixplay-resolve — só aceita a origem Nixplay
// ---------------------------------------------------------------------------

test('nixplay-resolve: URL interna (loopback) é barrada SEM fetch', async () => {
  const r = await get('/api/nixplay-resolve?url=' + encodeURIComponent('http://127.0.0.1:3000/api/health'));
  assert.ok(r.status >= 400, `esperava >=400, veio ${r.status}`);
  assert.equal(capturedUrls.length, 0, 'nenhum fetch deve acontecer');
  assert.match(r.text, /não autorizado|Anti-SSRF|inválid/i);
});

test('nixplay-resolve: domínio arbitrário externo é barrado SEM fetch', async () => {
  const r = await get('/api/nixplay-resolve?url=' + encodeURIComponent('https://evil.com/steal'));
  assert.equal(r.status, 403);
  assert.equal(capturedUrls.length, 0);
});

test('nixplay-resolve: "nixplay.lat" escondido no path/query não conta (hostname-based)', async () => {
  const r = await get('/api/nixplay-resolve?url=' + encodeURIComponent('https://cdn.evil.com/steal?nixplay.lat'));
  assert.ok(r.status >= 400);
  assert.equal(capturedUrls.length, 0);
});

test('nixplay-resolve: URL legítima nixplay.lat fetcheia e devolve a própria URL', async () => {
  const url = 'https://nixplay.lat/movie/testelogado-vods/GwXanZ3Dj/512195.mp4';
  const r = await get('/api/nixplay-resolve?url=' + encodeURIComponent(url));
  assert.equal(r.status, 200);
  assert.equal(capturedUrls.length, 1);
  assert.equal(JSON.parse(r.text).url, url);
});

test('nixplay-resolve: segue redirect 302 e devolve o Location assinado do R2', async () => {
  mockFetchRedirect('https://pub-abc123.r2.dev/signed/512195.mp4?token=x');
  const r = await get('/api/nixplay-resolve?url=' + encodeURIComponent('https://nixplay.lat/movie/testelogado-vods/GwXanZ3Dj/512195.mp4'));
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.text).url, 'https://pub-abc123.r2.dev/signed/512195.mp4?token=x');
});

test('nixplay-resolve: nixplay.lat resolvendo pra IP privado (DNS rebinding) é barrado pelo anti-SSRF', async () => {
  globalThis.__MOCK_PRIVATE_HOSTS = new Set(['nixplay.lat']);
  const r = await get('/api/nixplay-resolve?url=' + encodeURIComponent('https://nixplay.lat/movie/x.mp4'));
  assert.equal(r.status, 403);
  assert.equal(capturedUrls.length, 0, 'o fetch NUNCA deve rodar para host privado');
});

// ---------------------------------------------------------------------------
// /api/nixplay-proxy — allowlist nixplay.lat + CDNs Cloudflare
// ---------------------------------------------------------------------------

test('nixplay-proxy: proxy aberto morreu — URL interna é barrada SEM fetch', async () => {
  const r = await get('/api/nixplay-proxy?url=' + encodeURIComponent('http://127.0.0.1:3000/api/health'));
  assert.ok(r.status >= 400, `esperava >=400, veio ${r.status}`);
  assert.equal(capturedUrls.length, 0);
});

test('nixplay-proxy: domínio arbitrário externo é barrado SEM fetch', async () => {
  const r = await get('/api/nixplay-proxy?url=' + encodeURIComponent('https://evil.com/f.mp4'));
  assert.equal(r.status, 403);
  assert.equal(capturedUrls.length, 0);
});

test('nixplay-proxy: "nixplay.lat" no path de outro host não passa (hostname-based)', async () => {
  const r = await get('/api/nixplay-proxy?url=' + encodeURIComponent('https://evil.com/nixplay.lat/f.mp4'));
  assert.ok(r.status >= 400);
  assert.equal(capturedUrls.length, 0);
});

test('nixplay-proxy: protocolo não-HTTP é barrado SEM fetch', async () => {
  const r = await get('/api/nixplay-proxy?url=' + encodeURIComponent('file:///etc/passwd'));
  assert.equal(r.status, 400);
  assert.equal(capturedUrls.length, 0);
});

test('nixplay-proxy: URL legítima nixplay.lat streama o conteúdo upstream', async () => {
  const r = await get('/api/nixplay-proxy?url=' + encodeURIComponent('https://nixplay.lat/movie/testelogado-vods/GwXanZ3Dj/512195.mp4'));
  assert.equal(r.status, 200);
  assert.equal(capturedUrls.length, 1);
  assert.match(r.text, /#EXTM3U mock/);
});

test('nixplay-proxy: bucket Cloudflare R2 (pub-*.r2.dev) é aceito', async () => {
  const r = await get('/api/nixplay-proxy?url=' + encodeURIComponent('https://pub-abc123.r2.dev/signed/512195.mp4'));
  assert.equal(r.status, 200);
  assert.equal(capturedUrls.length, 1);
});

test('nixplay-proxy: worker Cloudflare (*.workers.dev) é aceito', async () => {
  const r = await get('/api/nixplay-proxy?url=' + encodeURIComponent('https://play-infinity-proxy.someone.workers.dev/video.mp4'));
  assert.equal(r.status, 200);
  assert.equal(capturedUrls.length, 1);
});

test('nixplay-proxy: host da allowlist resolvendo para IP privado (rebinding) é barrado SEM fetch', async () => {
  globalThis.__MOCK_PRIVATE_HOSTS = new Set(['pub-abc123.r2.dev']);
  const r = await get('/api/nixplay-proxy?url=' + encodeURIComponent('https://pub-abc123.r2.dev/signed/512195.mp4'));
  assert.equal(r.status, 403);
  assert.equal(capturedUrls.length, 0);
});

// ---------------------------------------------------------------------------
// /api/proxy-test — exige autenticação admin
// ---------------------------------------------------------------------------

test('proxy-test: sem token admin responde 401 e NÃO fetcheia a URL pedida', async () => {
  const r = await get('/api/proxy-test?url=' + encodeURIComponent('http://127.0.0.1:3000/api/health'));
  assert.equal(r.status, 401);
  assert.equal(capturedUrls.length, 0);
});

test('proxy-test: rota é declarada com o middleware requireAdminAuth no fonte', () => {
  const src = require('node:fs').readFileSync(
    path.resolve(__dirname, '..', 'server/routes/nixplayRoutes.ts'), 'utf8');
  assert.match(src, /router\.get\(\s*["']\/api\/proxy-test["']\s*,\s*requireAdminAuth\s*,/,
    'a declaração da rota deve aplicar requireAdminAuth ANTES do handler');
});

// ---------------------------------------------------------------------------
// /api/doodstream-stream — allowlist de hostname + anti-SSRF
// ---------------------------------------------------------------------------

test('doodstream-stream: bypass antigo (?dood no query de URL interna) não passa mais', async () => {
  const r = await get('/api/doodstream-stream?url=' + encodeURIComponent('http://127.0.0.1:3000/api/health?dood'));
  assert.equal(r.status, 400);
  assert.equal(capturedUrls.length, 0, 'nenhum fetch deve acontecer (era SSRF full-read antes do fix)');
});

test('doodstream-stream: metadata da OCI (169.254.169.254) com ?dood é barrado SEM fetch', async () => {
  const r = await get('/api/doodstream-stream?url=' + encodeURIComponent('http://169.254.169.254/opc/v1/instance/?dood=1'));
  assert.ok(r.status >= 400);
  assert.equal(capturedUrls.length, 0);
});

test('doodstream-stream: "dood" como subdomínio de terceiro (dood.evil.com) é barrado', async () => {
  const r = await get('/api/doodstream-stream?url=' + encodeURIComponent('https://dood.evil.com/f.mp4'));
  assert.equal(r.status, 400);
  assert.equal(capturedUrls.length, 0);
});

test('doodstream-stream: substring "playmogo.com" na query de outro host não passa', async () => {
  const r = await get('/api/doodstream-stream?url=' + encodeURIComponent('https://evil.com/f.mp4?ref=playmogo.com'));
  assert.equal(r.status, 400);
  assert.equal(capturedUrls.length, 0);
});

test('doodstream-stream: protocolo não-HTTP é barrado SEM fetch', async () => {
  const r = await get('/api/doodstream-stream?url=' + encodeURIComponent('file:///etc/passwd?dood'));
  assert.equal(r.status, 400);
  assert.equal(capturedUrls.length, 0);
});

test('doodstream-stream: playmogo.com (embed/pass_md5) é aceito e streama', async () => {
  const r = await get('/api/doodstream-stream?url=' + encodeURIComponent('https://playmogo.com/e/abc123def'));
  assert.equal(r.status, 200);
  assert.equal(capturedUrls.length, 1);
});

test('doodstream-stream: CDN cloudatacdn.com (com subdomínio) é aceito', async () => {
  const r = await get('/api/doodstream-stream?url=' + encodeURIComponent('https://d123.cloudatacdn.com/f/30m2x4jdhq4r/abc.mp4'));
  assert.equal(r.status, 200);
  assert.equal(capturedUrls.length, 1);
});

test('doodstream-stream: domínio rotativo dood.* (dood.wf) é aceito', async () => {
  const r = await get('/api/doodstream-stream?url=' + encodeURIComponent('https://dood.wf/30m2x4jdhq4r/abc.mp4'));
  assert.equal(r.status, 200);
  assert.equal(capturedUrls.length, 1);
});

test('doodstream-stream: subdomínio de domínio rotativo (mx41.dood.lol) é aceito', async () => {
  const r = await get('/api/doodstream-stream?url=' + encodeURIComponent('https://mx41.dood.lol/d/30m2x4jdhq4r/abc.mp4'));
  assert.equal(r.status, 200);
  assert.equal(capturedUrls.length, 1);
});

test('doodstream-stream: host allowlisted resolvendo para IP privado (rebinding) é barrado SEM fetch', async () => {
  globalThis.__MOCK_PRIVATE_HOSTS = new Set(['playmogo.com']);
  const r = await get('/api/doodstream-stream?url=' + encodeURIComponent('https://playmogo.com/e/abc123def'));
  assert.equal(r.status, 403);
  assert.equal(capturedUrls.length, 0);
});
