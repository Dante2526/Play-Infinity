/**
 * [EmbedPlayerProxy] Testes do proxy sanitizador de embeds MinhaTela.
 *
 * Cobre:
 *  1. sanitizeEmbedHtml: injeta <base> + sanitizador antes dos scripts
 *     deles; remove detector de sandbox (sbChecker do rdcanais) e
 *     frame-buster (top.location=); preserva scripts legítimos
 *  2. extractRedirectUrl: stubs meta-refresh/location.replace com escapes
 *     hex (%72%65..., \x3d) — cadeia redecanaistv.pk → .by
 *  3. isAllowedEmbedUrl: allowlist dinâmico do snapshot MinhaTela +
 *     EMBED_PLAYER_EXTRA_HOSTS; http/privado/desconhecido rejeitados
 *  4. resolveEmbedPlayerHtml com fetch mockado: 403 → fallback
 *     (location.replace da URL original); 200 → HTML sanitizado;
 *     stub de redirect é seguido (2 saltos) e sanitizado com base do
 *     destino; cache evita refetch
 *  5. handleEmbedPlayerRequest: allowlist deny → 403/no-store; sucesso →
 *     200 text/html + Referrer-Policy no-referrer
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf-8');

// Cache em disco isolado ANTES do load dos módulos (capturado no bundle).
const TMP_CACHE = path.join(os.tmpdir(), `embed-proxy-test-${process.pid}.json`);
process.env.MINHATELA_CACHE_FILE = TMP_CACHE;

// embedPlayerProxy importa './minhatelaCatalog' — módulo COMPARTILHADO entre
// bundles para o snapshot injetado valer também para o allowlist.
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
  const filename = path.join(root, `tests/virtual-${path.basename(file, '.ts')}.cjs`);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

let proxy, mt;
test.before(async () => {
  mt = await loadModule(
    '{__setSnapshotForTests, getMinhaTelaEmbedHosts}',
    './server/services/minhatelaCatalog'
  );
  // Instância única de minhatelaCatalog visível para o bundle do embedPlayerProxy
  // (a chave é o spec relativo exatamente como escrito no import do serviço).
  SHARED['./minhatelaCatalog'] = mt;
  proxy = await loadModule(
    '{sanitizeEmbedHtml, extractRedirectUrl, isAllowedEmbedUrl, isSafePublicHttpsUrl, buildEmbedFallbackHtml, resolveEmbedPlayerHtml, handleEmbedPlayerRequest, unwrapKnownEmbedUrl, rewriteChildIframes, __clearEmbedCacheForTests}',
    './server/services/embedPlayerProxy',
    { './minhatelaCatalog': true }
  );
});

test.after(() => {
  mt.__setSnapshotForTests(null);
  try { fs.unlinkSync(TMP_CACHE); } catch {}
});

// ---------------------------------------------------------------------------
// Fixtures reais (capturadas das páginas dos provedores)
// ---------------------------------------------------------------------------

// rdcanais.net/premiere — wrapper com detector de sandbox (sbChecker) +
// iframe aninhado. Retrato fiel do bloco <script> adversário.
const RDCANAIS_HTML = `<!DOCTYPE html>
<html>
<head>
    <title>Player</title>
    <script type="text/javascript">
        function sbChecker() {
            try {
                var f = window.frameElement;
                if (f != null && f.hasAttribute('sandbox')) {
                    return true;
                }
            } catch (err) {
                return true;
            }

            try {
                document.domain = document.domain;
            } catch (e) {
                return true;
            }

            return false;
        }

        window.onload = function() {
            if (sbChecker()) {
                document.body.innerHTML = 'BLOQUEADO';
            }
        };
    </script>
    <script src="https://cdn.example.com/hls.js"></script>
</head>
<body>

<iframe src="https://rdcanais.org/premiere" allow="encrypted-media" allowfullscreen="" frameborder="0"></iframe>

</body>
</html>`;

// redecanaistv.pk/player3/ch.php — stub de redirect hex-encoded (real).
const REDECANAISTV_PK_STUB = `<HTML><HEAD>
<meta http-equiv="content-type" content="text/html;charset=utf-8">
<TITLE>Redirecting</TITLE>
<META HTTP-EQUIV="refresh" content="1; url=https://%72%65%64%65%63%61%6E%61%69%73%74%76.%62%79/%70%6C%61%79%65%72%33/%63%68.%70%68%70?%63%61%74%65%67%6F%72%69%61=%6C%69%76%65&amp;%63%61%6E%61%6C=%70%72%65%6D%69%65%72%65%63%6C%75%62%65%73">
</HEAD>
<BODY onLoad="location.replace('https://%72%65%64%65%63%61%6E%61%69%73%74%76.%62%79/%70%6C%61%79%65%72%33/%63%68.%70%68%70?%63%61%74%65%67%6F%72%69%61\x3d\x6C\x69\x76\x65\x26\x63\x61\x6E\x61\x6C\x3d\x70\x72\x65\x6D\x69\x65\x72\x65\x63\x6C\x75\x62\x65\x73'+document.location.hash)">
Redirecting you to https://redecanaistv.by/player3/ch.php</BODY></HTML>`;

// Página de player legítima (estilo embedtv.lat): popunder com window.open
// no primeiro clique + player fullscreen.
const LEGIT_PLAYER_HTML = `<!DOCTYPE html>
<html><head><title>Premiere</title>
<script src="/hls.light.min.js"></script>
</head>
<body class="text-white">
<div id="player" class="relative h-full w-full">
  <video data-ref="adVideo" class="h-full w-full bg-black object-contain" playsinline></video>
</div>
<script>
  var popunder = document.createElement('div');
  popunder.addEventListener('click', function () { window.open('https://anuncio.example.com', '_blank'); });
  document.body.appendChild(popunder);
</script>
<script>
  top.location = 'https://sequestro.example.com';
</script>
</body></html>`;

// ---------------------------------------------------------------------------
// 1. sanitizeEmbedHtml
// ---------------------------------------------------------------------------

test('sanitizeEmbedHtml: injeta <base> e sanitizador antes dos scripts deles', () => {
  const out = proxy.sanitizeEmbedHtml(RDCANAIS_HTML, 'https://rdcanais.net/premiere');
  const headOpen = out.indexOf('<head>');
  const sanitizerAt = out.indexOf('window, \'open\'') >= 0 ? out.indexOf("window, 'open'") : -1;
  const theirScriptAt = out.indexOf('https://cdn.example.com/hls.js');
  assert.ok(out.includes('<base href="https://rdcanais.net/">'), 'injeta <base> da origem');
  assert.ok(headOpen >= 0 && sanitizerAt > headOpen, 'sanitizador dentro do <head>');
  assert.ok(theirScriptAt < 0 || sanitizerAt < theirScriptAt, 'sanitizador vem antes do script deles');
  assert.ok(out.includes('2147483647'), 'takeover com z-index máximo');
  assert.ok(out.includes('object-fit:contain'), 'video com object-fit contain');
});

test('sanitizeEmbedHtml: remove detector de sandbox (sbChecker) e mantém player', () => {
  const out = proxy.sanitizeEmbedHtml(RDCANAIS_HTML, 'https://rdcanais.net/premiere');
  assert.ok(!out.includes('sbChecker'), 'bloco sbChecker removido');
  assert.ok(!out.includes('document.domain'), 'probe document.domain removido');
  assert.ok(!out.includes('frameElement'), 'probe frameElement removido');
  assert.ok(out.includes('https://rdcanais.org/premiere'), 'iframe aninhado preservado');
  assert.ok(out.includes('https://cdn.example.com/hls.js'), 'script legítimo preservado');
});

test('sanitizeEmbedHtml: remove frame-buster top.location e mantém popunder-morto', () => {
  const out = proxy.sanitizeEmbedHtml(LEGIT_PLAYER_HTML, 'https://ww5.embedtv.cc/premiere');
  assert.ok(!out.includes("top.location = 'https://sequestro"), 'frame-buster removido');
  assert.ok(out.includes('window.open'), 'código de popunder permanece (morto em runtime pelo lock)');
  assert.ok(out.includes("window, 'open'"), 'lock de window.open injetado');
  assert.ok(out.includes('<base href="https://ww5.embedtv.cc/">'), 'base da origem final');
});

test('sanitizeEmbedHtml: não duplica <base> existente e lida com página sem <head>', () => {
  const withBase = '<html><head><base href="https://outro.example/"><script>var a=1;</script></head><body></body></html>';
  const out1 = proxy.sanitizeEmbedHtml(withBase, 'https://rdcanais.net/premiere');
  assert.equal((out1.match(/<base\s/gi) || []).length, 1, 'base original preservado, sem duplicar');
  const noHead = '<!DOCTYPE html><body><video></video></body>';
  const out2 = proxy.sanitizeEmbedHtml(noHead, 'https://a.example/x');
  assert.ok(out2.includes('<base href="https://a.example/">'), 'injeta base mesmo sem head');
  assert.ok(out2.indexOf('<script>') < out2.indexOf('<video>'), 'sanitizador antes do body');
});

// ---------------------------------------------------------------------------
// 2. extractRedirectUrl
// ---------------------------------------------------------------------------

test('extractRedirectUrl: decodifica stub hex do redecanaistv.pk', () => {
  const u = proxy.extractRedirectUrl(REDECANAISTV_PK_STUB);
  assert.equal(u, 'https://redecanaistv.by/player3/ch.php?categoria=live&canal=premiereclubes');
});

test('extractRedirectUrl: null em página grande, sem redirect ou não-http', () => {
  assert.equal(proxy.extractRedirectUrl('<html><body>' + 'x'.repeat(5000) + '</body></html>'), null, 'página grande não é stub');
  assert.equal(proxy.extractRedirectUrl('<html><body>ok</body></html>'), null, 'sem redirect');
  assert.equal(proxy.extractRedirectUrl('<meta http-equiv="refresh" content="1; url=javascript:alert(1)">'), null, 'javascript: rejeitado');
  const ftp = '<meta http-equiv="refresh" content="1; url=ftp://evil.example/x">';
  assert.equal(proxy.extractRedirectUrl(ftp), null, 'ftp rejeitado');
});

// ---------------------------------------------------------------------------
// 3. Allowlist
// ---------------------------------------------------------------------------

test('isAllowedEmbedUrl: allowlist do snapshot MinhaTela + extras do env', () => {
  mt.__setSnapshotForTests([
    { slug: 'premiere-clubes-hd', name: 'PREMIERE CLUBES HD', streams: [
      { url: 'https://rdcanais.net/premiere' },
      { url: 'https://ww5.embedtv.lat/premiere' },
      { url: 'http://inseguro.example.com/x' },
      { url: 'https://10.0.0.5/x' },
    ]},
  ]);
  const hosts = mt.getMinhaTelaEmbedHosts();
  assert.ok(hosts.has('rdcanais.net') && hosts.has('ww5.embedtv.lat'), 'hosts válidos no set');
  assert.ok(!hosts.has('inseguro.example.com') && !hosts.has('10.0.0.5'), 'http/privado fora do set');

  assert.ok(proxy.isAllowedEmbedUrl('https://rdcanais.net/premierealternativo'), 'host conhecido + path novo ok');
  assert.ok(proxy.isAllowedEmbedUrl('https://ww5.embedtv.lat/premiere'), 'host conhecido ok');
  assert.ok(!proxy.isAllowedEmbedUrl('https://phishing.example.com/login'), 'host desconhecido negado');
  assert.ok(!proxy.isAllowedEmbedUrl('http://rdcanais.net/premiere'), 'http negado');
  assert.ok(!proxy.isAllowedEmbedUrl('https://127.0.0.1/x'), 'loopback negado');
  assert.ok(!proxy.isAllowedEmbedUrl('https://192.168.0.10/x'), 'privado negado');
  assert.ok(!proxy.isAllowedEmbedUrl('file:///etc/passwd'), 'esquema arbitrário negado');
  assert.ok(!proxy.isAllowedEmbedUrl(''), 'vazio negado');

  process.env.EMBED_PLAYER_EXTRA_HOSTS = 'extra.example.com, Outro.EXAMPLE.net';
  try {
    assert.ok(proxy.isAllowedEmbedUrl('https://extra.example.com/qualquer'), 'extra host via env');
    assert.ok(proxy.isAllowedEmbedUrl('https://outro.example.net/x'), 'extra host case-insensitive');
  } finally {
    delete process.env.EMBED_PLAYER_EXTRA_HOSTS;
  }
});

test('isSafePublicHttpsUrl: sanidade anti-SSRF', () => {
  assert.ok(proxy.isSafePublicHttpsUrl('https://play-infinity.stream/api/health'));
  assert.ok(!proxy.isSafePublicHttpsUrl('https://localhost/x'));
  assert.ok(!proxy.isSafePublicHttpsUrl('https://172.16.0.1/x'));
  assert.ok(!proxy.isSafePublicHttpsUrl('https://169.254.169.254/latest/meta-data'));
  assert.ok(!proxy.isSafePublicHttpsUrl('https://sem-ponto/x'));
});

// ---------------------------------------------------------------------------
// 4. resolveEmbedPlayerHtml (fetch mockado)
// ---------------------------------------------------------------------------

function mockFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const hit = routes.find(r => r.url === url);
    if (!hit) return { ok: false, status: 404, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) };
    if (hit.body instanceof Error) throw hit.body;
    return {
      ok: hit.ok !== false,
      status: hit.status || 200,
      headers: new Map([['content-type', hit.ct || 'text/html']]),
      arrayBuffer: async () => new TextEncoder().encode(hit.body).buffer,
    };
  };
  return { fn, calls };
}

test('resolveEmbedPlayerHtml: 403 do terceiro → stub de fallback com location.replace', async () => {
  proxy.__clearEmbedCacheForTests();
  const origFetch = globalThis.fetch;
  const { fn, calls } = mockFetch([{ url: 'https://meuplayeronlinehd.com/myplay/watch.html?id=premiere', ok: false, status: 403, body: 'Forbidden' }]);
  globalThis.fetch = fn;
  try {
    const out = await proxy.resolveEmbedPlayerHtml('https://meuplayeronlinehd.com/myplay/watch.html?id=premiere');
    assert.ok(out.includes('location.replace('), 'fallback navega p/ original');
    assert.ok(out.includes('meuplayeronlinehd.com'), 'URL original no replace');
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('resolveEmbedPlayerHtml: rede fora → fallback', async () => {
  proxy.__clearEmbedCacheForTests();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const out = await proxy.resolveEmbedPlayerHtml('https://sporturbo.link/player/canais/ampv-pfc1');
    assert.ok(out.includes('location.replace('), 'fallback em erro de rede');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('resolveEmbedPlayerHtml: segue stub de redirect (redecanaistv.pk → .by) e sanitiza o destino', async () => {
  proxy.__clearEmbedCacheForTests();
  const origFetch = globalThis.fetch;
  const FINAL = '<html><head><title>Player</title></head><body><div id="player"><video class="w-full"></video></div><script>var x=1;</script></body></html>';
  const { fn, calls } = mockFetch([
    { url: 'https://redecanaistv.pk/player3/ch.php?categoria=live&canal=premiereclubes', body: REDECANAISTV_PK_STUB },
    { url: 'https://redecanaistv.by/player3/ch.php?categoria=live&canal=premiereclubes', body: FINAL },
  ]);
  globalThis.fetch = fn;
  try {
    const out = await proxy.resolveEmbedPlayerHtml('https://redecanaistv.pk/player3/ch.php?categoria=live&canal=premiereclubes');
    assert.deepEqual(calls, [
      'https://redecanaistv.pk/player3/ch.php?categoria=live&canal=premiereclubes',
      'https://redecanaistv.by/player3/ch.php?categoria=live&canal=premiereclubes',
    ], 'seguiu o salto do stub');
    assert.ok(out.includes('<base href="https://redecanaistv.by/">'), 'base do destino final');
    assert.ok(out.includes("window, 'open'"), 'sanitizador aplicado na página final');
    assert.ok(!out.includes('location.replace('), 'não é fallback');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('resolveEmbedPlayerHtml: salto para host privado não é seguido (anti-SSRF)', async () => {
  proxy.__clearEmbedCacheForTests();
  const origFetch = globalThis.fetch;
  const EVIL = '<meta http-equiv="refresh" content="0; url=https://192.168.1.10/steal">';
  const { fn, calls } = mockFetch([
    { url: 'https://redecanaistv.pk/evil', body: EVIL },
  ]);
  globalThis.fetch = fn;
  try {
    const out = await proxy.resolveEmbedPlayerHtml('https://redecanaistv.pk/evil');
    assert.equal(calls.length, 1, 'não seguiu o salto privado');
    assert.ok(out.includes('window, \'open\'') || out.includes('location.replace('), 'sanitizou a página do stub');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('resolveEmbedPlayerHtml: cache em memória evita refetch em 5 min', async () => {
  proxy.__clearEmbedCacheForTests();
  const origFetch = globalThis.fetch;
  let hits = 0;
  const BODY = '<html><head></head><body><video></video></body></html>';
  globalThis.fetch = async () => { hits++; return { ok: true, status: 200, headers: new Map([['content-type', 'text/html']]), arrayBuffer: async () => new TextEncoder().encode(BODY).buffer }; };
  try {
    const url = 'https://rdcanais.net/premiere';
    const a = await proxy.resolveEmbedPlayerHtml(url);
    const b = await proxy.resolveEmbedPlayerHtml(url);
    assert.equal(hits, 1, 'segunda chamada servida do cache');
    assert.equal(a, b);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ---------------------------------------------------------------------------
// 5. handleEmbedPlayerRequest
// ---------------------------------------------------------------------------

function mockRes() {
  const state = { status: 200, headers: {}, body: '' };
  return {
    state,
    status(c) { state.status = c; return this; },
    set(k, v) { state.headers[k.toLowerCase()] = v; return this; },
    setHeader(k, v) { state.headers[k.toLowerCase()] = v; return this; },
    send(b) { state.body = b; return this; },
    json(b) { state.body = JSON.stringify(b); return this; },
  };
}

test('handleEmbedPlayerRequest: host fora do allowlist → 403 + no-store', async () => {
  const res = mockRes();
  await proxy.handleEmbedPlayerRequest({ query: { url: 'https://phishing.example.com/login' } }, res);
  assert.equal(res.state.status, 403);
  assert.equal(res.state.headers['cache-control'], 'no-store');
  assert.equal(res.state.headers['referrer-policy'], 'no-referrer');
  assert.ok(!res.state.body.includes('location.replace'));
});

test('handleEmbedPlayerRequest: sem parâmetro → 403', async () => {
  const res = mockRes();
  await proxy.handleEmbedPlayerRequest({ query: {} }, res);
  assert.equal(res.state.status, 403);
});

test('handleEmbedPlayerRequest: sucesso → 200 text/html com sanitizador', async () => {
  proxy.__clearEmbedCacheForTests();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    headers: new Map([['content-type', 'text/html']]),
    arrayBuffer: async () => new TextEncoder().encode(RDCANAIS_HTML).buffer,
  });
  try {
    const res = mockRes();
    await proxy.handleEmbedPlayerRequest({ query: { url: 'https://rdcanais.net/premiere' } }, res);
    assert.equal(res.state.status, 200);
    assert.ok(res.state.headers['content-type'].startsWith('text/html'));
    assert.equal(res.state.headers['referrer-policy'], 'no-referrer');
    assert.ok(res.state.body.includes('<base href="https://rdcanais.net/">'));
    assert.ok(!res.state.body.includes('sbChecker'), 'detector removido na resposta HTTP');
    assert.ok(res.state.body.includes('rdcanais.org/premiere'), 'iframe aninhado intacto');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ---------------------------------------------------------------------------
// 6. Anti-sandbox shims, iframes aninhados e desempacotamento
// ---------------------------------------------------------------------------

test('sanitizeEmbedHtml: injeta shims anti-sandbox e interceptador de iframes', () => {
  const out = proxy.sanitizeEmbedHtml('<html><head></head><body><video></video></body></html>', 'https://rdcanais.net/premiere');
  assert.ok(out.includes('#sb-message, [id*="sb-message"]'), 'css contra aviso #sb-message injetado');
  assert.ok(out.includes("document['domain']"), 'getter/setter de document.domain injetado');
  assert.ok(out.includes("window, 'frame' + 'Element'"), 'shim de window.frameElement injetado');
  assert.ok(out.includes('/api/embed-player?url='), 'interceptor de iframe injetado');
});

test('sanitizeEmbedHtml: preserva search e parâmetros de URL (?id=premiere)', () => {
  const pageWithSearch = '<html><head></head><body><script>const id = new URLSearchParams(window.location.search).get("id");</script></body></html>';
  const out = proxy.sanitizeEmbedHtml(pageWithSearch, 'https://meuplayeronlinehd.com/myplay/watch2.html?id=premiere');
  assert.ok(out.includes('window.__EMBED_SEARCH__ = "?id=premiere"'), 'search original injetado');
  assert.ok(out.includes('RealUSP'), 'shim de URLSearchParams injetado');
  assert.ok(out.includes('(window.__EMBED_SEARCH__ || location.search)'), 'acesso a location.search protegido');
});

test('rewriteChildIframes: roteia iframes aninhados pelo /api/embed-player', () => {
  const html = '<iframe src="https://rdcanais.org/premiere" width="100%"></iframe>';
  const rewritten = proxy.rewriteChildIframes(html);
  assert.ok(rewritten.includes('src="/api/embed-player?url=https://rdcanais.org/premiere"'), 'iframe reescrito para o proxy');
  assert.ok(proxy.isAllowedEmbedUrl('https://rdcanais.org/premiere'), 'host do iframe filho autorizado no allowlist');
});

test('unwrapKnownEmbedUrl e extractRedirectUrl: desempacotam watch.html para watch2.html', () => {
  const unwrapped = proxy.unwrapKnownEmbedUrl('https://meuplayeronlinehd.com/myplay/watch.html?id=combate');
  assert.equal(unwrapped, 'https://meuplayeronlinehd.com/myplay/watch2.html?id=combate');

  const wrapperHtml = '<html><body><script>var baseURL="watch2.html?id={id}"; var id = getParameterByName("id");</script></body></html>';
  const next = proxy.extractRedirectUrl(wrapperHtml, 'https://meuplayeronlinehd.com/myplay/watch.html?id=combate');
  assert.equal(next, 'https://meuplayeronlinehd.com/myplay/watch2.html?id=combate');
});

test('sanitizeEmbedHtml: o script injetado possui sintaxe JavaScript 100% válida', () => {
  const out = proxy.sanitizeEmbedHtml('<html><head></head><body><video></video></body></html>', 'https://meuplayeronlinehd.com/myplay/watch2.html?id=premiere');
  const match = out.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'bloco <script> injetado encontrado');
  assert.doesNotThrow(() => {
    new Function(match[1]);
  }, 'o script injetado compila sem nenhum SyntaxError');
});

test('rewriteChildIframes: não confunde data-src com src', () => {
  const html = '<iframe data-src="https://rdcanais.org/lazy" class="player"></iframe>';
  const notRewritten = proxy.rewriteChildIframes(html);
  assert.ok(notRewritten.includes('data-src="https://rdcanais.org/lazy"'), 'data-src mantido sem corrupção');
});
