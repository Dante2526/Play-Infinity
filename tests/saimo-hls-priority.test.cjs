/**
 * [Saimo HLS Priority] Testes da priorização HLS vs MP4 no Saimo TV VOD.
 *
 * Contexto: os manifestos HLS do Saimo (FirePlayer, embedplayer2.xyz) são
 * multi-bitrate (360p/720p — ABR: a qualidade troca sozinha quando a rede
 * oscila) e declaram faixas de áudio por idioma + legendas embutidas. O MP4
 * progressivo não tem nada disso. A integração antiga ordenava MP4 antes do
 * HLS e nem usava HLS quando existia MP4 — o ABR era descartado sem nem
 * ser tentado.
 *
 * Testes (sugestões a+b+c aceitas pelo dono):
 *  1. /api/saimo-stream SEM prefer → tenta a fonte HLS PRIMEIRO (novo default)
 *  2. /api/saimo-stream?prefer=mp4 → tenta a fonte MP4 primeiro
 *  3. /api/saimo-stream?prefer=hls → HLS primeiro mesmo com MP4 disponível
 *  4. /api/saimo-stream: embedplayer2 recebe Referer/Origin corretos
 *  5. /api/saimo-proxy-iframe SEM prefer + fontes HLS → isHls=true,
 *     streamUrl com prefer=hls, seletor de faixas de áudio e escada de
 *     retry (swapPrefer) presentes no HTML
 *  6. /api/saimo-proxy-iframe?prefer=mp4 + fontes mistas → isHls=false,
 *     streamUrl com prefer=mp4
 *  7. /api/saimo-proxy-iframe?prefer=hls com título SÓ MP4 → cai pro MP4
 *     (isHls=false, prefer=mp4)
 *  8. /api/saimo-proxy-iframe?prefer=mp4 com título SÓ HLS → usa HLS
 *     (isHls=true, prefer=hls)
 *  9. /api/saimo-stream com fallback de família: HLS morto (404) → cai
 *     pro MP4 (a ordenação é prioridade, não filtro)
 * 10. /api/saimo-hls-segment: sub-playlist FirePlayer (/m3/<base64>, CT
 *     text/plain, sem extensão) é detectada por CONTEÚDO e reescrita com
 *     assinatura HMAC; segmentos em CDN dinâmica (cincloud1.xyz) passam com
 *     sig válida; sem sig/forjada → 403 (proxy aberto fechado); body
 *     não-playlist servido byte a byte (bug do pipe vazio)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const SHARED = (globalThis.__SAIMO_SHARED__ = globalThis.__SAIMO_SHARED__ || {});

// ---------------------------------------------------------------------------
// Fixtures: filme 299536 com uma fonte HLS + duas MP4 (mistura real do catálogo)
// ---------------------------------------------------------------------------

const MOVIE_MIXED = {
  title: 'Filme Teste', year: '2024',
  servers: {
    saimo_dub: [
      'http://cdn-a.example.com:80/movie/x/y/1.mp4',
      'https://embedplayer2.xyz/cdn/hls/abc123/master.txt',
      'http://cdn-b.example.com:80/movie/x/y/2.mp4',
    ],
    saimo_leg: [],
  },
};
const MOVIE_MP4_ONLY = {
  title: 'Filme MP4', year: '2024',
  servers: { saimo_dub: ['http://cdn-a.example.com:80/movie/x/y/1.mp4'], saimo_leg: [] },
};
const MOVIE_HLS_ONLY = {
  title: 'Filme HLS', year: '2024',
  servers: { saimo_dub: ['https://embedplayer2.xyz/cdn/hls/xyz/master.txt'], saimo_leg: [] },
};

let storeMovie = MOVIE_MIXED;
const crypto = require('node:crypto');

// Mock determinístico do par sign/verify (mesma semântica do helpers real)
const TEST_SECRET = 'saimo-test-secret';
function mockSign(url) {
  return crypto.createHmac('sha256', TEST_SECRET).update(String(url)).digest('hex');
}
function mockVerify(url, sig) {
  if (!url || !sig) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(mockSign(url)), Buffer.from(String(sig)));
  } catch { return false; }
}

SHARED['../services/saimoSqliteStore'] = {
  getSaimoStore: () => ({
    findMovie: (id) => (Number(id) === 299536 ? storeMovie : null),
    findEpisode: () => null,
  }),
};
SHARED['../utils/helpers'] = {
  isPrivateOrLocalHost: async () => false,
  signProxyUrl: mockSign,
  verifyProxySignature: mockVerify,
};

async function loadSaimoRoutes() {
  const sharedKeys = Object.keys(SHARED);
  const plugin = {
    name: 'saimo-shared',
    setup(build) {
      const filter = new RegExp('^(' + sharedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')$');
      build.onResolve({ filter }, args => ({ path: args.path, namespace: 'saimo-shared' }));
      build.onLoad({ filter: /.*/, namespace: 'saimo-shared' }, args => ({
        contents: `module.exports = globalThis.__SAIMO_SHARED__[${JSON.stringify(args.path)}];`,
        loader: 'js',
      }));
    },
  };
  const output = await esbuild.build({
    stdin: {
      contents: `export { handleSaimoStream, handleSaimoProxyIframe, handleSaimoHlsSegment } from './server/routes/saimoRoutes';`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [plugin],
  });
  const filename = path.join(root, 'tests/virtual-saimoRoutes.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

async function loadBlacklistModule() {
  const output = await esbuild.build({
    stdin: {
      contents: `export { isServerBlacklisted } from './src/data/serverBlacklist';`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  const filename = path.join(root, 'tests/virtual-blacklist-saimo.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

function mockReq(query = {}) {
  return { query, headers: {}, once() {}, on() {} };
}
function mockRes() {
  return {
    _status: 200, _headers: {}, _sent: undefined, headersSent: false,
    status(c) { this._status = c; return this; },
    setHeader(k, v) { this._headers[k.toLowerCase()] = v; return this; },
    send(x) { this._sent = x; this.headersSent = true; return this; },
    end(x) { if (x !== undefined) this._sent = x; this.headersSent = true; return this; },
    json(x) { this._sent = x; this.headersSent = true; return this; },
  };
}

const HLS_MANIFEST = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=2048000,RESOLUTION=1280x720\nmedia.m3u8\n';
const HLS_MEDIA = '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:2.0,\nseg001.ts\n#EXTINF:2.0,\nseg002.ts\n';

function respHls(text) {
  return { ok: true, status: 200, headers: { get: (h) => (h === 'content-type' ? 'text/plain' : null) }, text: async () => text };
}
function respMp4() {
  return { ok: true, status: 200, headers: { get: (h) => (h === 'content-type' ? 'video/mp4' : null) }, body: { pipe() {}, on() {} } };
}
function resp404() {
  return { ok: false, status: 404, headers: { get: () => null }, text: async () => 'Not Found' };
}

let routes;
let originalFetch;
let fetchCalls;

test.before(async () => {
  routes = await loadSaimoRoutes();
  originalFetch = globalThis.fetch;
});

test.after(() => {
  globalThis.fetch = originalFetch;
  storeMovie = MOVIE_MIXED;
});

function installFetch(impl) {
  fetchCalls = [];
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url: String(url), headers: (opts && opts.headers) || {} });
    return impl(String(url), opts);
  };
}

// ---------------------------------------------------------------------------
// /api/saimo-stream — ordenação por protocolo
// ---------------------------------------------------------------------------

test('saimo-stream SEM prefer tenta HLS primeiro (default novo)', async () => {
  storeMovie = MOVIE_MIXED;
  installFetch((url) => (url.includes('embedplayer2.xyz') ? respHls(HLS_MEDIA) : resp404()));
  const res = mockRes();
  await routes.handleSaimoStream(mockReq({ id: '299536', type: 'movie', audio: 'dub' }), res);
  assert.equal(fetchCalls[0].url, 'https://embedplayer2.xyz/cdn/hls/abc123/master.txt',
    'primeira URL tentada deve ser a HLS');
  assert.ok(String(res._sent).includes('/api/saimo-hls-segment?url='), 'manifesto reescrito pro proxy de segmento');
  assert.equal(res._headers['content-type'], 'application/vnd.apple.mpegurl; charset=utf-8');
});

test('saimo-stream?prefer=mp4 tenta MP4 primeiro', async () => {
  storeMovie = MOVIE_MIXED;
  installFetch((url) => (/\.mp4(\?|$)/i.test(url) ? respMp4() : resp404()));
  const res = mockRes();
  await routes.handleSaimoStream(mockReq({ id: '299536', type: 'movie', audio: 'dub', prefer: 'mp4' }), res);
  assert.ok(/\.mp4(\?|$)/i.test(fetchCalls[0].url), 'primeira URL tentada deve ser MP4');
  assert.equal(fetchCalls[0].url, 'http://cdn-a.example.com:80/movie/x/y/1.mp4');
  assert.equal(res._headers['content-type'], 'video/mp4');
});

test('saimo-stream?prefer=hls tenta HLS primeiro mesmo com MP4 disponível', async () => {
  storeMovie = MOVIE_MIXED;
  installFetch((url) => (url.includes('embedplayer2.xyz') ? respHls(HLS_MEDIA) : resp404()));
  const res = mockRes();
  await routes.handleSaimoStream(mockReq({ id: '299536', type: 'movie', audio: 'dub', prefer: 'hls' }), res);
  assert.equal(fetchCalls[0].url, 'https://embedplayer2.xyz/cdn/hls/abc123/master.txt');
});

test('saimo-stream manda Referer/Origin do embedplayer2 para a fonte HLS', async () => {
  storeMovie = MOVIE_MIXED;
  installFetch((url) => (url.includes('embedplayer2.xyz') ? respHls(HLS_MEDIA) : resp404()));
  const res = mockRes();
  await routes.handleSaimoStream(mockReq({ id: '299536', type: 'movie', audio: 'dub' }), res);
  const hlsCall = fetchCalls.find(c => c.url.includes('embedplayer2.xyz'));
  assert.ok(hlsCall, 'fonte HLS foi tentada');
  assert.equal(hlsCall.headers.Referer, 'https://embedplayer2.xyz/');
  assert.equal(hlsCall.headers.Origin, 'https://embedplayer2.xyz');
});

test('saimo-stream cai pro MP4 quando o HLS morre (ordenação é prioridade, não filtro)', async () => {
  storeMovie = MOVIE_MIXED;
  installFetch((url) => (/\.mp4(\?|$)/i.test(url) ? respMp4() : resp404()));
  const res = mockRes();
  await routes.handleSaimoStream(mockReq({ id: '299536', type: 'movie', audio: 'dub', prefer: 'hls' }), res);
  assert.ok(fetchCalls.length >= 2, 'mais de uma fonte tentada');
  assert.equal(fetchCalls[0].url, 'https://embedplayer2.xyz/cdn/hls/abc123/master.txt', 'HLS primeiro');
  assert.ok(/\.mp4(\?|$)/i.test(fetchCalls[fetchCalls.length - 1].url), 'caiu pro MP4');
  assert.equal(res._headers['content-type'], 'video/mp4');
});

// ---------------------------------------------------------------------------
// /api/saimo-proxy-iframe — decisão de protocolo consistente
// ---------------------------------------------------------------------------

test('saimo-proxy-iframe SEM prefer + HLS no catálogo → hls.js com prefer=hls', async () => {
  storeMovie = MOVIE_MIXED;
  const res = mockRes();
  await routes.handleSaimoProxyIframe(mockReq({ id: '299536', type: 'movie', audio: 'dub' }), res);
  const html = String(res._sent);
  assert.ok(html.includes('var isHls = true'), 'usa hls.js');
  assert.ok(html.includes('prefer=hls'), 'streamUrl repassa prefer=hls');
  assert.ok(html.includes('audioTrack'), 'seletor de faixa de áudio presente');
  assert.ok(html.includes('swapPrefer'), 'escada de retry presente (troca de protocolo)');
  assert.ok(html.includes('AUDIO_TRACKS_UPDATED'), 'reatribui faixa quando as tracks chegam');
});

test('saimo-proxy-iframe?prefer=mp4 + fontes mistas → <video> nativo com prefer=mp4', async () => {
  storeMovie = MOVIE_MIXED;
  const res = mockRes();
  await routes.handleSaimoProxyIframe(mockReq({ id: '299536', type: 'movie', audio: 'dub', prefer: 'mp4' }), res);
  const html = String(res._sent);
  assert.ok(html.includes('var isHls = false'), 'usa video.src direto');
  assert.ok(html.includes('prefer=mp4'), 'streamUrl repassa prefer=mp4');
  assert.ok(html.includes('swapPrefer(streamUrl, "hls")'), 'retry com hls.js se o MP4 morrer');
});

test('saimo-proxy-iframe?prefer=hls com título SÓ MP4 → cai pro MP4', async () => {
  storeMovie = MOVIE_MP4_ONLY;
  const res = mockRes();
  await routes.handleSaimoProxyIframe(mockReq({ id: '299536', type: 'movie', audio: 'dub', prefer: 'hls' }), res);
  const html = String(res._sent);
  assert.ok(html.includes('var isHls = false'), 'sem HLS no catálogo → video.src direto');
  assert.ok(html.includes('prefer=mp4'), 'prefer efetivo é mp4');
});

test('saimo-proxy-iframe?prefer=mp4 com título SÓ HLS → usa HLS', async () => {
  storeMovie = MOVIE_HLS_ONLY;
  const res = mockRes();
  await routes.handleSaimoProxyIframe(mockReq({ id: '299536', type: 'movie', audio: 'dub', prefer: 'mp4' }), res);
  const html = String(res._sent);
  assert.ok(html.includes('var isHls = true'), 'sem MP4 no catálogo → hls.js');
  assert.ok(html.includes('prefer=hls'), 'prefer efetivo é hls');
});

// ---------------------------------------------------------------------------
// Regressão da blacklist: o falso positivo que matava TODO o HLS do Saimo
// ---------------------------------------------------------------------------

test('blacklist: embedplayer2.xyz (CDN FirePlayer do Saimo) NÃO é bloqueado; EmbedPlay sim', async () => {
  const blacklist = await loadBlacklistModule();
  // CDN HLS homologado do Saimo (Referer/Origin em saimoRoutes + allowlist
  // de isAllowedLiveStreamingDomain em helpers.ts):
  assert.equal(blacklist.isServerBlacklisted('https://embedplayer2.xyz/cdn/hls/abc/master.txt'), false,
    'embedplayer2.xyz deve passar (CDN homologado do Saimo)');
  assert.equal(blacklist.isServerBlacklisted('https://embedplayer2.xyz/cdn/hls/abc/video.mp4'), false);
  // Provedor EmbedPlay original permanece bloqueado:
  assert.equal(blacklist.isServerBlacklisted('https://embedplay.cc/watch/1'), true, 'embedplay.cc bloqueado');
  assert.equal(blacklist.isServerBlacklisted('https://www.embedplay.xyz/x'), true, 'embedplay.xyz bloqueado');
  assert.equal(blacklist.isServerBlacklisted('srv_embedplay'), true, 'chave srv_embedplay bloqueada');
  assert.equal(blacklist.isServerBlacklisted('/api/embedplay-direct?x=1'), true, 'rota embedplay-direct bloqueada');
});

// ---------------------------------------------------------------------------
// Regressão: HLS aceito pelo health-probe (probeHealthMedia valida #EXTM3U)
// e o rewrite de sub-playlists (master → media → segmentos)
// ---------------------------------------------------------------------------

test('saimo-stream reescreve sub-playlist do master HLS (URI= encadeado)', async () => {
  storeMovie = MOVIE_HLS_ONLY;
  let hop = 0;
  installFetch(() => {
    hop++;
    if (hop === 1) return Promise.resolve(respHls(HLS_MANIFEST));
    return Promise.resolve(respHls(HLS_MEDIA));
  });
  const res = mockRes();
  await routes.handleSaimoStream(mockReq({ id: '299536', type: 'movie', audio: 'dub', prefer: 'hls' }), res);
  const out = String(res._sent);
  assert.ok(out.includes('#EXT-X-STREAM-INF'), 'master entregue');
  assert.ok(out.includes('/api/saimo-hls-segment?url='), 'sub-playlist aponta pro proxy de segmento');
});

// ---------------------------------------------------------------------------
// /api/saimo-hls-segment — sub-playlists FirePlayer (text/plain sem
// extensão, /m3/<base64>) e hosts dinâmicos de segmento (cincloud1.xyz)
// ---------------------------------------------------------------------------

// Réplica fiel da media playlist real do FirePlayer: /m3/<base64>, CT
// text/plain, segmentos .js em host CDN dinâmico.
const FIREPLAYER_MEDIA = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:2.002000,\nhttps://cincloud1.xyz/p/qJm_xCYOFa1KS2tXg7ySNe1h-IE62.js\n#EXTINF:2.002000,\nhttps://cincloud1.xyz/p/qJm_xCYOFa1KS2tXg7ySNe1h-IE63.js\n';
const MEDIA_URL = 'https://embedplayer2.xyz/m3/eFkzbEtEZk1KbXFUZWZocDdq';

function segQuery(url) {
  return { url, referer: 'https://embedplayer2.xyz/', sig: mockSign(url) };
}

test('saimo-hls-segment: sub-playlist /m3/<base64> CT text/plain é reescrita (detecção por conteúdo)', async () => {
  installFetch(() => ({
    ok: true, status: 200,
    headers: { get: (h) => (h === 'content-type' ? 'text/plain;charset=UTF-8' : null) },
    arrayBuffer: async () => new TextEncoder().encode(FIREPLAYER_MEDIA).buffer,
  }));
  const res = mockRes();
  await routes.handleSaimoHlsSegment(mockReq(segQuery(MEDIA_URL)), res);
  const out = String(res._sent);
  assert.ok(out.includes('/api/saimo-hls-segment?url='), 'segmentos reescritos pro proxy');
  assert.ok(out.includes('&sig='), 'URLs reescritas vêm assinadas');
  assert.ok(!/https:\/\/cincloud1\.xyz\/p\//.test(out), 'nenhum segmento absoluto sobrando');
  assert.equal(res._headers['content-type'], 'application/vnd.apple.mpegurl; charset=utf-8');
});

test('saimo-hls-segment: segmento em CDN dinâmico com assinatura válida é aceito', async () => {
  installFetch(() => ({
    ok: true, status: 206,
    headers: { get: (h) => (h === 'content-type' ? 'application/javascript' : null) },
    body: { pipe() {}, on() {} },
  }));
  const res = mockRes();
  const segUrl = 'https://cincloud1.xyz/p/qJm_xCYOFa1KS2tXg7ySNe1h-IE62.js';
  await routes.handleSaimoHlsSegment(mockReq(segQuery(segUrl)), res);
  assert.equal(res._status, 206, 'segmento assinado em CDN dinâmico deve passar');
  assert.equal(res._headers['content-type'], 'application/javascript');
});

test('saimo-hls-segment: URL SEM assinatura → 403 (proxy aberto fechado)', async () => {
  installFetch(() => { throw new Error('não deve ser chamado'); });
  const res = mockRes();
  await routes.handleSaimoHlsSegment(mockReq({
    url: 'https://cdn-a.example.com:80/movie/x/y/1.mp4',
    referer: 'https://embedplayer2.xyz/',
  }), res);
  assert.equal(res._status, 403, 'sem sig → 403');
  assert.equal(fetchCalls.length, 0, 'nenhum fetch feito');
});

test('saimo-hls-segment: assinatura forjada → 403', async () => {
  installFetch(() => { throw new Error('não deve ser chamado'); });
  const res = mockRes();
  await routes.handleSaimoHlsSegment(mockReq({
    url: 'https://cincloud1.xyz/p/attacker.js',
    referer: 'https://embedplayer2.xyz/',
    sig: 'deadbeef'.repeat(8),
  }), res);
  assert.equal(res._status, 403, 'sig inválida → 403');
  assert.equal(fetchCalls.length, 0, 'nenhum fetch feito');
});

test('saimo-hls-segment: body text/plain NÃO-playlist é servido byte a byte (sem pipe vazio)', async () => {
  const errBody = '<html><body>404 Not Found</body></html>';
  installFetch(() => ({
    ok: true, status: 200,
    headers: { get: (h) => (h === 'content-type' ? 'text/plain' : null) },
    arrayBuffer: async () => new TextEncoder().encode(errBody).buffer,
  }));
  const res = mockRes();
  await routes.handleSaimoHlsSegment(mockReq(segQuery('https://embedplayer2.xyz/m3/deadbeef')), res);
  assert.equal(String(res._sent), errBody, 'corpo servido íntegro (não vazio)');
  assert.equal(res._headers['content-type'], 'text/plain');
});
