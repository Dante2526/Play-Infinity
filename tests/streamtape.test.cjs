const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const express = require('express');
const esbuild = require('esbuild');
const nativeFetch = global.fetch;
let api, server, base;
before(async () => {
  const root = path.resolve(__dirname, '..');
  const result = await esbuild.build({
    stdin: { contents: `export * from './server/routes/streamtapeRoutes'; export * from './server/services/streamtapeRecovery'; export * from './server/services/streamtapeMediaProxy'; export * from './src/utils/playerFrameMessages';`, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{ name: 'catalog-fixture', setup(build) {
      build.onResolve({ filter: /encontreiLookup$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const getStreamtapeSources = async()=>[]; export const resolveEncontreiEpisode = async()=>null; export const resolveVizerEpisode=resolveEncontreiEpisode; export const resolveEncontreiMovie=resolveEncontreiEpisode; export const resolveVizerMovie=resolveEncontreiEpisode;` }));
    } }],
  });
  const filename = path.join(root, 'tests/virtual-streamtape.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(result.outputFiles[0].text, filename);
  api = compiled.exports;
  const app = express();
  app.get('/proxy-fixture', (req, res) => api.proxyStreamtapeMedia(req, res, {
    url: String(req.query.url || 'https://video.tapecontent.net/old.mp4'), fileId: 'episode4',
    timeoutMs: 60, refresh: async () => 'https://video.tapecontent.net/fresh.mp4',
  }));
  app.use(api.streamtapeRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  global.fetch = nativeFetch;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const listeners = {};
  const fatal = [], requests = [], timers = new Map();
  let resolveFetch;
  const video = {
    currentTime: 0, readyState: 0, error: { code: 4 }, plays: 0, loads: 0,
    addEventListener(name, fn, options) { (listeners[name] ||= []).push({ fn, once: options?.once }); },
    emit(name) { for (const event of [...(listeners[name] || [])]) { if (event.once) listeners[name].splice(listeners[name].indexOf(event), 1); event.fn(); } },
    play() { this.plays++; return Promise.resolve(); }, load() { this.loads++; },
  };
  const ctx = { AbortController, encodeURIComponent, fetch: (url, options) => {
    requests.push({ url, options }); return new Promise(resolve => { resolveFetch = resolve; });
  }, setTimeout(fn) { const id = {}; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
  const factory = vm.runInNewContext('(' + api.createStreamtapeRecovery.toString() + ')', ctx);
  const recovery = factory(video, { fileId: 'fixture', getTime: () => video.currentTime, onFatal: reason => fatal.push(reason) });
  return { video, recovery, fatal, requests, timers, resolved: async (ok = true) => {
    resolveFetch({ ok, json: async () => ({ proxyUrl: '/fresh-video' }) }); await tick();
  } };
}

test('first-click media failure renews the token before asking to switch providers', async () => {
  const f = fixture(); f.video.emit('error');
  assert.equal(f.fatal.length, 0);
  assert.match(f.requests[0].url, /refresh=1/);
  await f.resolved();
  assert.equal(f.video.src, '/fresh-video'); assert.equal(f.video.loads, 1);
  f.video.readyState = 1; f.video.emit('loadedmetadata'); f.video.emit('playing');
  assert.equal(f.video.plays, 1); assert.equal(f.timers.size, 0);
});
test('retry preserves position and a seek requested while resolving', async () => {
  const f = fixture(); f.video.currentTime = 625; f.video.emit('error');
  f.recovery.seek(410); await f.resolved(); f.video.emit('loadedmetadata');
  assert.equal(f.video.currentTime, 410);
});
test('explicit pause during renewal prevents autoplay without leaving a timer', async () => {
  const f = fixture(); f.video.emit('error'); f.recovery.setPaused(true);
  await f.resolved(); f.video.emit('loadedmetadata');
  assert.equal(f.video.plays, 0); assert.equal(f.timers.size, 0);
});
test('a failed second media request triggers fallback exactly once', async () => {
  const f = fixture(); f.video.emit('error'); await f.resolved();
  f.video.emit('error'); f.video.emit('error');
  assert.equal(f.requests.length, 1); assert.equal(f.fatal.length, 1);
});
test('a hung renewal or reload times out and ignores late resolver completion', async () => {
  const f = fixture(); f.video.emit('error');
  [...f.timers.values()][0]();
  assert.equal(f.requests[0].options.signal.aborted, true);
  await f.resolved(); assert.equal(f.video.loads, 0); assert.equal(f.fatal.length, 1);
});
test('failed resolver and decode errors report a useful bounded failure', async () => {
  const f = fixture(); f.video.emit('error'); await f.resolved(false);
  assert.equal(f.fatal.length, 1);
  const decode = fixture(); decode.video.error.code = 3; decode.video.emit('error');
  assert.equal(decode.requests.length, 0); assert.match(decode.fatal[0], /código 3/);
});
test('refresh endpoint bypasses an existing token and updates subsequent cached requests', async () => {
  let version = 0, embeds = 0;
  global.fetch = async (url, options) => {
    if (options?.method === 'HEAD') return new Response(null, { status: 302, headers: { location: `https://video.tapecontent.net/video-${version}.mp4` } });
    embeds++; version++;
    return new Response(`document.getElementById('robotlink').innerHTML = '//streamtape.com/get_video?id=fixture';`);
  };
  try {
    const first = await nativeFetch(base + '/api/streamtape-resolve?fileId=fixture');
    const old = await first.json();
    const cached = await api.resolveStreamTapeToken('fixture');
    assert.equal(cached, old.directUrl); assert.equal(embeds, 1);
    const fresh = await nativeFetch(base + '/api/streamtape-resolve?fileId=fixture&refresh=1');
    assert.equal(fresh.headers.get('cache-control'), 'no-store');
    const renewed = await fresh.json(); assert.notEqual(renewed.directUrl, old.directUrl);
    assert.equal(await api.resolveStreamTapeToken('fixture'), renewed.directUrl); assert.equal(embeds, 2);
    const html = await (await nativeFetch(base + '/api/streamtape-proxy-iframe?fileId=fixture')).text();
    assert.match(html, /refresh=1/); assert.match(html, /recovery.setPaused\(true\)/);
  } finally { global.fetch = nativeFetch; }
});

test('proxy recovers a transport reset before headers with a fresh token and the same Range', async () => {
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), range: options.headers.Range });
    if (requests.length === 1) throw new TypeError('fetch failed');
    return new Response(Buffer.from([1, 2, 3, 4]), { status: 206, headers: {
      'content-type': 'video/mp4', 'content-length': '4', 'content-range': 'bytes 100-103/1000', 'accept-ranges': 'bytes',
    } });
  };
  try {
    const r = await nativeFetch(base + '/proxy-fixture', { headers: { Range: 'bytes=100-103' } });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('content-range'), 'bytes 100-103/1000');
    assert.equal(r.headers.get('x-accel-buffering'), 'no');
    assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [1, 2, 3, 4]);
    assert.deepEqual(requests.map(x => x.range), ['bytes=100-103', 'bytes=100-103']);
    assert.match(requests[1].url, /fresh\.mp4$/);
  } finally { global.fetch = nativeFetch; }
});
test('normal GET completion does not abort the active upstream media response', async () => {
  let signal;
  global.fetch = async (url, options) => {
    signal = options.signal;
    await new Promise(r => setTimeout(r, 20));
    assert.equal(signal.aborted, false);
    return new Response('video-bytes', { headers: { 'content-type': 'video/mp4' } });
  };
  try {
    const r = await nativeFetch(base + '/proxy-fixture');
    assert.equal(r.status, 200); assert.equal(await r.text(), 'video-bytes');
  } finally { global.fetch = nativeFetch; }
});
test('proxy retries CDN 503 and false HTML success before exposing any media headers', async () => {
  for (const status of [503, 200]) {
    let count = 0;
    global.fetch = async () => {
      if (++count === 1) return new Response('<html>upstream error</html>', { status, headers: { 'content-type': 'text/html' } });
      return new Response('mp4', { headers: { 'content-type': 'video/mp4' } });
    };
    try {
      const r = await nativeFetch(base + '/proxy-fixture');
      assert.equal(r.status, 200); assert.equal(await r.text(), 'mp4'); assert.equal(count, 2);
    } finally { global.fetch = nativeFetch; }
  }
});
test('header deadlines retry once and return 502 instead of empty successful video', async () => {
  let count = 0;
  global.fetch = (url, { signal }) => new Promise((resolve, reject) => {
    count++;
    signal.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError')), { once: true });
  });
  try {
    const r = await nativeFetch(base + '/proxy-fixture');
    assert.equal(r.status, 502); await r.text(); assert.equal(count, 2);
  } finally { global.fetch = nativeFetch; }
});
test('client cancellation stops the latest fetch without starting a renewal', async () => {
  let aborted = false, started;
  const ready = new Promise(r => { started = r; });
  global.fetch = (url, { signal }) => new Promise((resolve, reject) => {
    started();
    signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Closed', 'AbortError')); }, { once: true });
  });
  try {
    const controller = new AbortController();
    const request = nativeFetch(base + '/proxy-fixture', { signal: controller.signal }).catch(() => {});
    await ready; controller.abort(); await request;
    await new Promise(r => setTimeout(r, 20));
    assert.equal(aborted, true);
  } finally { global.fetch = nativeFetch; }
});
test('media proxy rejects an unrelated host containing a provider name in the query', async () => {
  let count = 0; global.fetch = async () => { count++; return new Response('bad'); };
  try {
    const r = await nativeFetch(base + '/proxy-fixture?url=' + encodeURIComponent('https://unrelated.invalid/?streamtape.com'));
    assert.equal(r.status, 400); await r.text(); assert.equal(count, 0);
  } finally { global.fetch = nativeFetch; }
});
test('episode 3 errors cannot control episode 4 while its frame is absent or after replacement', () => {
  const ep3 = {}, ep4 = {}, appWindow = {};
  assert.equal(api.isCurrentPlayerMessageSource(ep3, ep3, appWindow, false), true);
  assert.equal(api.isCurrentPlayerMessageSource(ep3, null, appWindow, false), false);
  assert.equal(api.isCurrentPlayerMessageSource(ep3, ep4, appWindow, false), false);
  assert.equal(api.isCurrentPlayerMessageSource(ep4, ep4, appWindow, false), true);
  assert.equal(api.isCurrentPlayerMessageSource(appWindow, null, appWindow, false), false);
  assert.equal(api.isCurrentPlayerMessageSource(appWindow, null, appWindow, true), true);
  assert.equal(api.isCurrentPlayerMessageSource(appWindow, ep4, appWindow, false, '/ep3', '/ep4'), false);
  assert.equal(api.isCurrentPlayerMessageSource(appWindow, ep4, appWindow, false, '/ep4', '/ep4'), true);
});
test('slow episode lookup cannot hold the player indefinitely', async () => {
  await api.waitForPlayerLookup(new Promise(() => {}), 15);
  await api.waitForPlayerLookup(Promise.resolve('episode4'), 100);
});


test('resolver HTTP errors expose a safe stage diagnostic without caching a provider refusal', async () => {
  global.fetch = async () => new Response('private upstream HTML token=secret', { status: 403 });
  try {
    const response = await nativeFetch(base + '/api/streamtape-resolve?fileId=diagnostic-fixture');
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.deepEqual(body.diagnostic, { stage: 'embed', code: 'upstream_http', status: 403 });
    assert.equal(body.success, false);
    assert.doesNotMatch(JSON.stringify(body), /secret|private upstream/);
  } finally { global.fetch = nativeFetch; }
});
