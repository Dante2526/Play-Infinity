const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const vm = require('node:vm');
const express = require('express');
const nativeFetch = global.fetch;
let api, server, base;
const source = (fileId, source = 'encontrei', audio = 'Dublado') => ({ fileId, source, audio });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const tick = () => new Promise(resolve => setImmediate(resolve));
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(1012)]);
before(async () => {
  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    stdin: { contents: `export * from './server/services/streamtapeSources'; export * from './server/services/streamtapeRecovery'; export {default as router} from './server/routes/streamtapeRoutes';`, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{ name: 'catalogue-candidates', setup(build) {
      build.onResolve({ filter: /encontreiLookup$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const getStreamtapeSources=async(id,s,e,name,refresh)=>{globalThis.__tapeSourceCalls.push({id,s,e,name});return (refresh&&globalThis.__tapeSourcesRefreshed)||globalThis.__tapeSources||[]};` }));
    } }],
  });
  const filename = path.join(root, 'tests/virtual-streamtape-sources.cjs');
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename); api = compiled.exports;
  global.__tapeSourceCalls = [];
  const app = express(); app.use(api.router); server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  global.fetch = nativeFetch; delete global.__tapeSourceCalls; delete global.__tapeSources; delete global.__tapeSourcesRefreshed;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
});
const pool = options => api.createStreamtapeSourcePool({ resolve: async id => 'https://video.tapecontent.net/' + id, probe: async () => true, ...options });

test('faster verified StreamTape copy wins, independent of catalogue order', async () => {
  const p = pool({ probe: async url => { await wait(url.endsWith('/slow') ? 35 : 2); return true; } });
  const selected = await p.select([source('slow'), source('fast', 'vizer')]);
  assert.equal(selected.fileId, 'fast'); assert.equal(selected.source, 'vizer');
});
test('active proxy requests distribute new selections and releasing twice cannot make counts negative', async () => {
  const p = pool({}); const candidates = [source('a'), source('b', 'vizer')];
  const initial = await p.select(candidates);
  const release = p.begin(initial.fileId);
  const second = await p.select(candidates); assert.notEqual(second.fileId, initial.fileId);
  release(); release(); p.report(initial.fileId, true, 1); p.report(second.fileId, true, 5000);
  assert.equal((await p.select(candidates)).fileId, initial.fileId);
});
test('recent failures penalize a copy while another verified file remains eligible', async () => {
  const p = pool({}); const candidates = [source('a'), source('b', 'vizer')]; await p.select(candidates);
  p.report('a', false); p.report('a', false);
  assert.equal((await p.select(candidates)).fileId, 'b');
});
test('identical IDs from Encontrei and Vizer cause only one probe and cannot be an alternate', async () => {
  let probes = 0; const p = pool({ probe: async () => { probes++; return true; } });
  const candidates = [source('same'), source('same', 'vizer')];
  assert.equal((await p.select(candidates)).fileId, 'same'); assert.equal(probes, 1);
  assert.equal(await p.select(candidates, ['same']), null);
});
test('concurrent viewers share verification and its short cache', async () => {
  let resolves = 0, probes = 0;
  const p = pool({ resolve: async id => { resolves++; await wait(5); return 'https://video.tapecontent.net/' + id; }, probe: async () => { probes++; return true; } });
  await Promise.all(Array.from({ length: 20 }, () => p.select([source('same')])));
  await p.select([source('same')]); assert.equal(resolves, 1); assert.equal(probes, 1);
});
test('Portuguese sources are checked before original audio, which is eligible only after they fail', async () => {
  const calls = [];
  const p = pool({ probe: async url => { calls.push(url); return !url.endsWith('/dub-failed'); } });
  assert.equal((await p.select([source('leg', 'vizer', 'Legendado'), source('dub')])).fileId, 'dub');
  assert.equal(calls.length, 1);
  assert.equal((await p.select([source('leg', 'vizer', 'Legendado'), source('dub-failed')])).fileId, 'leg');
});
test('unresponsive probes have deadlines, admission control and cannot apply late success', async () => {
  let finish;
  const p = pool({ timeoutMs: 20, probe: async () => new Promise(resolve => { finish = resolve; }) });
  assert.equal(await p.select([source('hung')]), null); finish(true); await tick();
  assert.equal(await p.select([source('hung')]), null);
  const busy = pool({ timeoutMs: 20, resolve: async () => new Promise(() => {}) });
  const pending = Array.from({ length: 6 }, (_, i) => busy.select([source('busy' + i)]));
  assert.equal(await busy.select([source('excess')]), null); await Promise.all(pending);
});
test('media verification reads only a prefix, cancels streams and rejects HTML despite HTTP 200', async () => {
  let cancelled = false;
  global.fetch = async (_, options) => {
    assert.equal(options.headers.Range, 'bytes=0-1023');
    return new Response(new ReadableStream({ start(c) { c.enqueue(mp4); }, cancel() { cancelled = true; } }), { status: 206 });
  };
  try {
    const p = api.createStreamtapeSourcePool({ resolve: async () => 'https://video.tapecontent.net/media' });
    assert.ok(await p.select([source('media')])); assert.equal(cancelled, true);
    global.fetch = async () => new Response('<html>temporary error</html>');
    assert.equal(await p.select([source('bad')]), null);
  } finally { global.fetch = nativeFetch; }
});
function recovery() {
  const listeners = {}, requests = [], timers = new Map(), fatal = [];
  const video = { currentTime: 620, paused: false, error: { code: 4 }, loads: 0, plays: 0,
    addEventListener(name, fn, options) { (listeners[name] ||= []).push({ fn, once: options?.once }); },
    emit(name) { for (const event of [...(listeners[name] || [])]) { if (event.once) listeners[name].splice(listeners[name].indexOf(event), 1); event.fn(); } },
    load() { this.loads++; }, play() { this.plays++; return Promise.resolve(); } };
  const context = { AbortController, encodeURIComponent, fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
    setTimeout(fn, ms) { const id = {}; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); } };
  const factory = vm.runInNewContext('(' + api.createStreamtapeRecovery.toString() + ')', context);
  const handle = factory(video, { fileId: 'enc-file', context: { id: 213375, season: 1, episode: 4, name: 'VisionQuest' }, getTime: () => video.currentTime, onFatal: reason => fatal.push(reason) });
  const resolve = async (index, data, ok = true) => { requests[index].resolve({ ok, json: async () => data }); await tick(); };
  return { video, requests, timers, fatal, handle, resolve };
}
test('renewal failure switches to the alternate catalogue before emitting provider fallback and preserves position', async () => {
  const f = recovery(); f.video.emit('error'); await f.resolve(0, {}, false);
  assert.equal(f.fatal.length, 0); assert.match(f.requests[1].url, /id=213375/); assert.match(f.requests[1].url, /s=1&e=4/); assert.match(f.requests[1].url, /exclude=enc-file/);
  await f.resolve(1, { fileId: 'vizer-file', proxyUrl: '/alternate' }); f.video.emit('loadedmetadata'); f.video.emit('playing');
  assert.equal(f.video.src, '/alternate'); assert.equal(f.video.currentTime, 620); assert.equal(f.video.plays, 1); assert.equal(f.timers.size, 0);
});
test('a second media error after renewal tries the other copy instead of abandoning StreamTape', async () => {
  const f = recovery(); f.video.emit('error'); await f.resolve(0, { fileId: 'enc-file', proxyUrl: '/renewed' });
  f.video.emit('error'); assert.match(f.requests[1].url, /exclude=enc-file/); assert.equal(f.fatal.length, 0);
  f.handle.setPaused(true); f.handle.seek(800);
  await f.resolve(1, { fileId: 'vizer-file', proxyUrl: '/alternate' }); f.video.emit('loadedmetadata');
  assert.equal(f.video.currentTime, 800); assert.equal(f.video.plays, 0);
});
test('exhausted or repeated identical alternatives trigger outer fallback exactly once', async () => {
  const f = recovery(); f.video.error.code = 3; f.video.emit('error');
  assert.match(f.requests[0].url, /exclude=enc-file/); await f.resolve(0, { fileId: 'enc-file', proxyUrl: '/same' });
  f.video.emit('error'); assert.equal(f.fatal.length, 1); assert.equal(f.video.loads, 0);
});
test('all tried files are excluded on later failures, preventing ping-pong between copies', async () => {
  const f = recovery(); f.video.error.code = 3; f.video.emit('error');
  await f.resolve(0, { fileId: 'vizer-file', proxyUrl: '/alternate' }); f.video.emit('loadedmetadata'); f.video.emit('playing');
  f.video.emit('error'); assert.match(f.requests[1].url, /exclude=enc-file%2Cvizer-file/);
  await f.resolve(1, {}, false); assert.equal(f.fatal.length, 1);
});
test('a long dry buffer changes source, but a pause or short buffer recovery does not', async () => {
  const f = recovery(); f.video.emit('waiting'); f.video.emit('playing'); assert.equal(f.requests.length, 0); assert.equal(f.timers.size, 0);
  f.video.emit('waiting'); [...f.timers.values()].find(t => t.ms === 8000).fn();
  assert.match(f.requests[0].url, /exclude=enc-file/);
  await f.resolve(0, { fileId: 'vizer-file', proxyUrl: '/alternate' }); f.video.emit('loadedmetadata'); f.video.emit('playing');
  const paused = recovery(); paused.video.emit('waiting'); paused.handle.setPaused(true); assert.equal(paused.timers.size, 0);
});
test('bounded source recovery aborts and ignores late alternate completion', async () => {
  const f = recovery(); f.video.error.code = 3; f.video.emit('error'); [...f.timers.values()][0].fn();
  assert.equal(f.requests[0].options.signal.aborted, true); await f.resolve(0, { fileId: 'vizer-file', proxyUrl: '/late' });
  assert.equal(f.fatal.length, 1); assert.equal(f.video.loads, 0);
});
test('HTTP selection binds both candidates and recovery to the exact episode, ignores stale client ID and escapes script context', async () => {
  global.__tapeSources = [source('http-enc'), source('http-vizer', 'vizer')];
  global.fetch = async (raw, options) => {
    const url = new URL(raw);
    if (url.pathname.startsWith('/e/')) {
      const id = url.pathname.split('/')[2];
      return new Response(`document.getElementById('robotlink').innerHTML='//streamtape.com/get_video?id=${id}';`);
    }
    if (url.pathname === '/get_video') return new Response(null, { status: 302, headers: { location: 'https://video.tapecontent.net/' + url.searchParams.get('id') } });
    return new Response(mp4, { status: 206 });
  };
  try {
    const title = 'VisionQuest </script><script>unsafe</script>';
    const html = await (await nativeFetch(base + '/api/streamtape-proxy-iframe?id=213375&s=1&e=4&fileId=episode3&name=' + encodeURIComponent(title))).text();
    assert.doesNotMatch(html, /fileId=episode3|<script>unsafe/);
    const context = JSON.parse(html.match(/context: (\{[^\n]+\}),/)[1]); assert.equal(context.name, title);
    assert.deepEqual(global.__tapeSourceCalls.at(-1), { id: 213375, s: 1, e: 4, name: title });
    const firstFile = html.match(/fileId=([^"&]+)/)[1];
    const response = await nativeFetch(base + '/api/streamtape-resolve?id=213375&s=1&e=4&exclude=' + firstFile);
    const alternate = await response.json(); assert.notEqual(alternate.fileId, firstFile); assert.equal(alternate.success, true);
    assert.equal((await nativeFetch(base + '/api/streamtape-resolve?id=213375&s=1&e=4&exclude=http-enc,http-vizer')).status, 502);
  } finally { global.fetch = nativeFetch; global.__tapeSources = []; }
});

test('an expired signed media URL is renewed before the source is considered failed', async () => {
  const refreshes = [];
  const p = pool({ resolve: async (id, refresh) => { refreshes.push(!!refresh); return 'https://video.tapecontent.net/' + (refresh ? 'fresh' : 'expired'); }, probe: async url => url.endsWith('/fresh') });
  assert.equal((await p.select([source('file')])).directUrl, 'https://video.tapecontent.net/fresh');
  assert.deepEqual(refreshes, [false, true]);
});

test('replaced catalogue files are refreshed once before provider fallback', async () => {
  global.__tapeSources = [source('removed-file')]; global.__tapeSourcesRefreshed = [source('replacement-file', 'vizer')];
  global.fetch = async raw => {
    const url = new URL(raw);
    if (url.pathname.includes('/removed-file/')) return new Response('Video not found', { status: 404 });
    if (url.pathname.startsWith('/e/')) return new Response("document.getElementById('robotlink').innerHTML='//streamtape.com/get_video?id=replacement-file';");
    if (url.pathname === '/get_video') return new Response(null, { status: 302, headers: { location: 'https://video.tapecontent.net/replacement-file' } });
    return new Response(mp4, { status: 206 });
  };
  try {
    const response = await nativeFetch(base + '/api/streamtape-resolve?id=213375&s=1&e=5');
    const result = await response.json(); assert.equal(response.status, 200); assert.equal(result.fileId, 'replacement-file');
  } finally { global.fetch = nativeFetch; global.__tapeSources = []; delete global.__tapeSourcesRefreshed; }
});
