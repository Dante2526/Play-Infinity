/**
 * [EmbedProbe] Testes do probe de vida de embeds (fontes MinhaTela).
 *
 * Cobre:
 *  1. probeEmbedPlayer: URL fora do allowlist → status=denied, alive=false
 *  2. probeEmbedPlayer: fetch falha (página não responde / 403) →
 *     resolveEmbedPlayerHtml devolve o stub de fallback → status=fetch_failed,
 *     fallback=true, alive=false
 *  3. probeEmbedPlayer: página legítima com <video>/hls.js → status=ok,
 *     hasPlayer=true, alive=true
 *  4. probeEmbedPlayer: stub pequeno com location.replace (sem player) →
 *     detecta como fallback, alive=false
 *  5. probeEmbedPlayer: página carregada sem player mas grande (>=4KB) →
 *     conservadoramente alive=true (não marca como morto sem certeza)
 *  6. Rota GET /api/embed-probe: devolve JSON { alive, hasPlayer, ... };
 *     sem url → 400; allowlist deny → 200 com status=denied
 *  7. Cache: mesmo URL chamado 2x só faz fetch 1 vez (reaproveita cache
 *     do resolveEmbedPlayerHtml)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const TMP_CACHE = path.join(os.tmpdir(), `embed-probe-test-${process.pid}.json`);
process.env.MINHATELA_CACHE_FILE = TMP_CACHE;

const SHARED = (globalThis.__MT_SHARED__ = globalThis.__MT_SHARED__ || {});

async function loadModule(exportsFrom, file, shared = {}) {
  const sharedKeys = Object.keys(shared);
  const plugin = {
    name: 'mt-shared-modules',
    setup(build) {
      if (sharedKeys.length === 0) return;
      const filter = new RegExp(
        '^(' + sharedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')$'
      );
      build.onResolve({ filter }, args => ({ path: args.path, namespace: 'mt-shared' }));
      build.onLoad({ filter: /.*/, namespace: 'mt-shared' }, args => ({
        contents: `module.exports = globalThis.__MT_SHARED__[${JSON.stringify(args.path)}];`,
        loader: 'js',
      }));
    },
  };
  const output = await esbuild.build({
    stdin: {
      contents: `export ${exportsFrom} from '${file}';`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [plugin],
  });
  const filename = path.join(root, `tests/virtual-${path.basename(file, '.ts')}-probe.cjs`);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

let probe, mt;
let originalFetch;

// Snapshot de teste: rdcanais.net e meuplayeronlinehd.com no allowlist
// (formato real do snapshot MinhaTela — array de canais com streams).
const SNAPSHOT = [
  {
    slug: 'premiere-1-hd',
    name: 'PREMIERE 1 HD',
    streams: [
      { url: 'https://meuplayeronlinehd.com/myplay/watch.html?id=premiere' },
      { url: 'https://rdcanais.net/premiere' },
      { url: 'https://ww5.embedtv.lat/premiere' },
    ],
  },
];

test.before(async () => {
  mt = await loadModule(
    '{__setSnapshotForTests, getMinhaTelaEmbedHosts}',
    './server/services/minhatelaCatalog'
  );
  SHARED['./minhatelaCatalog'] = mt;
  mt.__setSnapshotForTests(SNAPSHOT);
  probe = await loadModule(
    '{probeEmbedPlayer, __clearEmbedCacheForTests}',
    './server/services/embedPlayerProxy',
    { './minhatelaCatalog': true }
  );
  originalFetch = globalThis.fetch;
});

test.after(() => {
  mt.__setSnapshotForTests(null);
  try { fs.unlinkSync(TMP_CACHE); } catch {}
  globalThis.fetch = originalFetch;
  probe.__clearEmbedCacheForTests();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LEGIT_HTML = `<!DOCTYPE html>
<html><head><title>Premiere</title>
<script src="https://cdn.example.com/hls.light.min.js"></script>
</head>
<body>
<div id="player"><video class="h-full w-full bg-black object-contain" playsinline></video></div>
<script>top.location='https://sequestro.example.com';</script>
</body></html>`;

const STUB_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style></head><body><script>location.replace("https://meuplayeronlinehd.com/myplay/watch.html?id=premiere");</script></body></html>`;

const BIG_NOPPLAYER_HTML = '<html><head><title>Site</title></head><body>' + 'x'.repeat(8000) + '</body></html>';

// ---------------------------------------------------------------------------
// 1. URL fora do allowlist
// ---------------------------------------------------------------------------

test('probeEmbedPlayer: host não permitido → status=denied, alive=false', async () => {
  const r = await probe.probeEmbedPlayer('https://phishing.example.com/premiere');
  assert.equal(r.status, 'denied');
  assert.equal(r.alive, false);
  assert.equal(r.fallback, false);
});

// ---------------------------------------------------------------------------
// 2. Fetch falha → stub de fallback → alive=false
// ---------------------------------------------------------------------------

test('probeEmbedPlayer: fetch retorna null → fallback stub, alive=false', async () => {
  probe.__clearEmbedCacheForTests();
  globalThis.fetch = async () => null;
  const r = await probe.probeEmbedPlayer('https://meuplayeronlinehd.com/myplay/watch.html?id=premiere');
  assert.equal(r.status, 'fetch_failed');
  assert.equal(r.fallback, true);
  assert.equal(r.alive, false);
  assert.equal(r.hasPlayer, false);
});

// ---------------------------------------------------------------------------
// 3. Página legítima com <video> e hls.js → alive=true, hasPlayer=true
// ---------------------------------------------------------------------------

test('probeEmbedPlayer: HTML com video+hls.js → alive=true, hasPlayer=true', async () => {
  probe.__clearEmbedCacheForTests();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: (h) => h === 'content-type' ? 'text/html; charset=utf-8' : null },
    arrayBuffer: async () => new TextEncoder().encode(LEGIT_HTML).buffer,
  });
  const r = await probe.probeEmbedPlayer('https://meuplayeronlinehd.com/myplay/watch.html?id=premiere');
  assert.equal(r.status, 'ok');
  assert.equal(r.fallback, false);
  assert.equal(r.hasPlayer, true);
  assert.equal(r.alive, true);
  assert.ok(r.sizeBytes > 100, 'sizeBytes refletindo o HTML sanitizado');
});

// ---------------------------------------------------------------------------
// 4. Stub de fallback real (fetch falha com null) → alive=false
// ---------------------------------------------------------------------------

test('probeEmbedPlayer: stub de fallback (location.replace sem player) → alive=false', async () => {
  probe.__clearEmbedCacheForTests();
  // fetch devolve null (como em 403 Cloudflare) → resolveEmbedPlayerHtml
  // cai no stub de fallback (location.replace da URL original).
  globalThis.fetch = async () => null;
  const r = await probe.probeEmbedPlayer('https://meuplayeronlinehd.com/myplay/watch.html?id=premiere');
  assert.equal(r.fallback, true);
  assert.equal(r.alive, false);
  assert.equal(r.status, 'fetch_failed');
  assert.equal(r.hasPlayer, false);
});

// ---------------------------------------------------------------------------
// 5. Página grande sem player → conservadoramente alive=true
// ---------------------------------------------------------------------------

test('probeEmbedPlayer: HTML grande sem player → conservadoramente alive=true', async () => {
  probe.__clearEmbedCacheForTests();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: (h) => h === 'content-type' ? 'text/html; charset=utf-8' : null },
    arrayBuffer: async () => new TextEncoder().encode(BIG_NOPPLAYER_HTML).buffer,
  });
  const r = await probe.probeEmbedPlayer('https://meuplayeronlinehd.com/myplay/watch.html?id=premiere');
  assert.equal(r.fallback, false);
  assert.equal(r.hasPlayer, false);
  assert.equal(r.alive, true, 'conservadoramente vivo — não marca morto sem certeza');
  assert.ok(r.sizeBytes >= 8000);
});

// ---------------------------------------------------------------------------
// 6. URL não-string / vazia
// ---------------------------------------------------------------------------

test('probeEmbedPlayer: URL vazia → denied', async () => {
  const r = await probe.probeEmbedPlayer('');
  assert.equal(r.status, 'denied');
  assert.equal(r.alive, false);
});

// ---------------------------------------------------------------------------
// 7. Cache: mesmo URL chamado 2x só faz fetch 1 vez
// ---------------------------------------------------------------------------

test('probeEmbedPlayer: cache evita refetch no segundo probe do mesmo URL', async () => {
  probe.__clearEmbedCacheForTests();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return {
      ok: true,
      status: 200,
      headers: { get: (h) => h === 'content-type' ? 'text/html; charset=utf-8' : null },
      arrayBuffer: async () => new TextEncoder().encode(LEGIT_HTML).buffer,
    };
  };
  const url = 'https://meuplayeronlinehd.com/myplay/watch.html?id=premiere';
  const r1 = await probe.probeEmbedPlayer(url);
  const r2 = await probe.probeEmbedPlayer(url);
  assert.equal(r1.alive, true);
  assert.equal(r2.alive, true);
  assert.equal(calls, 1, 'fetch chamado 1 vez só (segundo veio do cache)');
});

// ---------------------------------------------------------------------------
// 8. URL http (não https) → denied
// ---------------------------------------------------------------------------

test('probeEmbedPlayer: URL http (não https) → denied', async () => {
  const r = await probe.probeEmbedPlayer('http://meuplayeronlinehd.com/premiere');
  assert.equal(r.status, 'denied');
  assert.equal(r.alive, false);
});
