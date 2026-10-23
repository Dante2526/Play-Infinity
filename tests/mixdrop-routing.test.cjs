const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const express = require('express');
const nativeFetch = global.fetch;
let api, server, base;
const identity = { id: 213375, season: 1, episode: 4, name: 'VisionQuest' };
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(1012)]);
const candidate = (fileId, source = 'encontrei') => ({ fileId, source, audio: 'Dublado' });
const tick = () => new Promise(resolve => setImmediate(resolve));
beforeEach(async () => {
  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    stdin: { contents: `export * from './src/services/mixdropSourceRouting'; export {buildMixdropStreamUrl} from './src/services/encontreiCatalog'; export {default as router} from './server/routes/mixdrop';`, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    define: { 'import.meta.env.VITE_PROXY_URL': '"https://native.test"' },
    plugins: [{ name: 'catalogue-fixture', setup(build) {
      build.onResolve({ filter: /encontreiLookup$|utils\/helpers$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('encontreiLookup') ?
        'export const getMixdropSources=async(id,s,e,name,refresh)=>{globalThis.__mixSourceCalls.push({id,s,e,name,refresh});return refresh&&globalThis.__mixFreshSources||globalThis.__mixSources||[]};' :
        'export const validateSafeUrl=value=>({valid:true,parsedUrl:new URL(value)}); export const isPrivateOrLocalIp=()=>false; export const isPrivateOrLocalHost=()=>false;' }));
    } }],
  });
  const filename = path.join(root, 'tests/virtual-mixdrop-routing.cjs');
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename); api = compiled.exports;
  global.__mixSourceCalls = []; global.__mixSources = [];
  const app = express(); app.use(api.router); server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => {
  global.fetch = nativeFetch; delete global.window; delete global.__mixSources; delete global.__mixFreshSources; delete global.__mixSourceCalls;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
});
function providerFetch(failing = new Set()) {
  return async (raw, options) => {
    const url = new URL(raw);
    if (url.hostname === 'mxdrop.top') {
      const id = url.pathname.split('/').at(-1);
      if (failing.has(id)) return new Response('Removed', { status: 404 });
      const source = 'MDCore.wurl=' + JSON.stringify('https://video.mxcontent.net/' + id + '.mp4') + ';';
      return new Response('<script>eval(function(p,a,c,k,e,d){return ' + JSON.stringify(source) + ';}("x",1,1,"",0,{}))</script>');
    }
    assert.equal(url.hostname, 'video.mxcontent.net'); assert.equal(options.headers.Range, 'bytes=0-1023');
    return new Response(mp4, { status: 206 });
  };
}
test('selected Vizer copy is tracked as the failed file rather than assuming Encontrei was chosen', async () => {
  const routing = api.createMixdropSourceRouting(); routing.ensure('episode4'); routing.track('vizer-file');
  global.fetch = async raw => {
    const url = new URL(raw, 'http://fixture'); assert.equal(url.searchParams.get('exclude'), 'vizer-file');
    assert.equal(url.searchParams.get('s'), '1'); assert.equal(url.searchParams.get('e'), '4'); assert.equal(url.searchParams.get('name'), 'VisionQuest');
    return Response.json({ fileId: 'encontrei-file' });
  };
  const result = await routing.next(identity); assert.equal(result.kind, 'selected'); assert.equal(result.fileId, 'encontrei-file');
  assert.deepEqual(result.exclude, ['vizer-file']);
});
test('failed copies cannot ping-pong and a duplicate response exhausts MixDrop before outer fallback', async () => {
  const routing = api.createMixdropSourceRouting(); routing.ensure('episode4'); routing.track('a');
  global.fetch = async () => Response.json({ fileId: 'b' }); assert.equal((await routing.next(identity)).kind, 'selected');
  global.fetch = async raw => {
    assert.equal(new URL(raw, 'http://fixture').searchParams.get('exclude'), 'a,b'); return Response.json({ fileId: 'a' });
  };
  assert.equal((await routing.next(identity)).kind, 'exhausted');
  global.fetch = () => assert.fail('Do not restart an exhausted cycle'); assert.equal((await routing.next(identity)).kind, 'exhausted');
});
test('duplicate error events share one attempt and obsolete episode results cannot affect the new episode', async () => {
  const routing = api.createMixdropSourceRouting(); routing.ensure('episode3'); routing.track('ep3-file'); let finish, calls = 0;
  global.fetch = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const pending = routing.next({ ...identity, episode: 3 }); assert.equal((await routing.next(identity)).kind, 'busy'); assert.equal(calls, 1);
  routing.ensure('episode4'); finish(Response.json({ fileId: 'late-ep3' })); assert.equal((await pending).kind, 'cancelled');
  global.fetch = async raw => { assert.equal(new URL(raw, 'http://fixture').searchParams.get('exclude'), ''); return Response.json({ fileId: 'ep4-file' }); };
  assert.equal((await routing.next(identity)).fileId, 'ep4-file');
});
test('manual retry resets exclusions while unavailable sources do not start endless retries', async () => {
  const routing = api.createMixdropSourceRouting(); routing.ensure('episode4'); routing.track('a');
  global.fetch = async () => new Response('', { status: 502 }); assert.equal((await routing.next(identity)).kind, 'exhausted');
  routing.reset('episode4'); global.fetch = async raw => { assert.equal(new URL(raw, 'http://fixture').searchParams.get('exclude'), ''); return Response.json({ fileId: 'a' }); };
  assert.equal((await routing.next(identity)).kind, 'selected');
});
test('native app uses its configured HTTPS API and cancelled lookups cannot switch sources', async () => {
  global.window = { Capacitor: { isNativePlatform: () => true } };
  const routing = api.createMixdropSourceRouting(); routing.ensure('episode4'); const controller = new AbortController();
  let finish; global.fetch = (raw, options) => { assert.ok(raw.startsWith('https://native.test/api/md-stream?')); return new Promise(resolve => { finish = resolve; }); };
  const pending = routing.next(identity, controller.signal); controller.abort(); finish(Response.json({ fileId: 'late' }));
  assert.equal((await pending).kind, 'cancelled');
});
test('URL builder carries exact content, position and exclusions but keeps legacy file-only playback', () => {
  const url = new URL(api.buildMixdropStreamUrl('file', { ...identity, time: 620, exclude: ['failed'] }), 'http://fixture');
  assert.equal(url.searchParams.get('id'), '213375'); assert.equal(url.searchParams.get('s'), '1'); assert.equal(url.searchParams.get('e'), '4');
  assert.equal(url.searchParams.get('t'), '620'); assert.equal(url.searchParams.get('exclude'), 'failed');
  assert.equal(api.buildMixdropStreamUrl(null), null); assert.ok(api.buildMixdropStreamUrl('legacy').includes('url='));
  assert.ok(api.buildMixdropStreamUrl(null, identity).includes('id=213375'));
});
test('HTTP selection verifies two catalogue copies, returns the actual file and selects the other after failure', async () => {
  global.__mixSources = [candidate('enc-file'), candidate('vizer-file', 'vizer')]; global.fetch = providerFetch();
  const url = base + '/api/md-stream?id=213375&s=1&e=4&name=VisionQuest';
  const first = await (await nativeFetch(url + '&format=json')).json(); assert.equal(first.success, true); assert.ok(first.fileId);
  const next = await (await nativeFetch(url + '&format=json&exclude=' + first.fileId)).json(); assert.equal(next.success, true); assert.notEqual(next.fileId, first.fileId);
  assert.equal((await nativeFetch(url + '&format=json&exclude=enc-file,vizer-file')).status, 502);
  const html = await (await nativeFetch(url + '&t=620')).text();
  assert.match(html, /WATCHPLAY_SOURCE/); assert.match(html, /resumeAt = 620/); assert.match(html, /reloadAfterMs: 4000/);
  assert.deepEqual(global.__mixSourceCalls[0], { id: 213375, s: 1, e: 4, name: 'VisionQuest', refresh: undefined });
});
test('HTTP selection refreshes replaced file IDs and reports exhaustion to the parent only after both fail', async () => {
  global.__mixSources = [candidate('removed')]; global.__mixFreshSources = [candidate('replacement', 'vizer')]; global.fetch = providerFetch(new Set(['removed']));
  const response = await nativeFetch(base + '/api/md-stream?id=213375&s=1&e=4&format=json');
  assert.equal((await response.json()).fileId, 'replacement');
  global.__mixFreshSources = []; global.__mixSources = [];
  const html = await (await nativeFetch(base + '/api/md-stream?id=213375&s=1&e=5')).text(); assert.match(html, /mixdropExhausted:true/);
});
test('identical MixDrop IDs in both catalogues do not create a fake second copy', async () => {
  global.__mixSources = [candidate('same'), candidate('same', 'vizer')]; let requests = 0; const upstream = providerFetch();
  global.fetch = (...args) => { requests++; return upstream(...args); };
  const url = base + '/api/md-stream?id=213375&s=1&e=4&format=json';
  assert.equal((await (await nativeFetch(url)).json()).fileId, 'same'); assert.equal(requests, 2);
  assert.equal((await nativeFetch(url + '&exclude=same')).status, 502);
});

test('pause and seek commands during alternate selection are retained in the new iframe URL', async () => {
  const routing = api.createMixdropSourceRouting(); routing.ensure('episode4'); routing.track('old'); let finish;
  global.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = routing.next(identity); routing.command('PAUSE', {}, 620); routing.command('SEEK_ABSOLUTE', { time: 800 }, 620);
  finish(Response.json({ fileId: 'new' })); const next = await pending;
  const url = new URL(api.buildMixdropStreamUrl(next.fileId, { ...identity, time: routing.seekTarget, paused: routing.paused, exclude: next.exclude }), 'http://fixture');
  assert.equal(url.searchParams.get('t'), '800'); assert.equal(url.searchParams.get('paused'), '1'); assert.equal(url.searchParams.get('exclude'), 'old');
  routing.command('PLAY', {}, 800); assert.equal(routing.paused, false);
});

test('MixDrop chooses the faster verified copy rather than hardcoding Encontrei first', async () => {
  global.__mixSources = [candidate('slow-enc'), candidate('fast-vizer', 'vizer')]; const upstream = providerFetch();
  global.fetch = async (raw, options) => { if (String(raw).includes('mxcontent.net/slow-enc')) await new Promise(resolve => setTimeout(resolve, 40)); return upstream(raw, options); };
  const result = await (await nativeFetch(base + '/api/md-stream?id=213375&s=1&e=4&format=json')).json();
  assert.equal(result.fileId, 'fast-vizer'); assert.equal(result.source, 'vizer');
});
