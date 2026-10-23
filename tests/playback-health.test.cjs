const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const express = require('express');
const esbuild = require('esbuild');
let api, server, base;
const nativeFetch = global.fetch;
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(1012)]);
const result = state => ({ state, checkedAt: Date.now(), reason: 'fixture' });
before(async () => {
  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    stdin: { contents: `export { default as router } from './server/routes/playbackHealth'; export * from './server/services/playbackHealth'; export * from './src/services/playbackHealth';`, loader: 'ts', resolveDir: root },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, define: { 'import.meta.env.VITE_PROXY_URL': '""' },
  });
  const filename = path.join(root, 'tests/virtual-playback-health.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename); api = compiled.exports;
  const app = express(); app.use(api.router);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { global.fetch = nativeFetch; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test('concurrent viewers share a probe, with cached results and separate episode keys', async () => {
  const check = api.createPlaybackHealthCache(); let calls = 0;
  const probe = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return { state: 'available', reason: 'media_verified' }; };
  const [a, b] = await Promise.all([check('tv:10:1:2', probe), check('tv:10:1:2', probe)]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  await check('tv:10:1:2', probe); assert.equal(calls, 1);
  await check('tv:10:1:3', probe); assert.equal(calls, 2);
});
test('deadline aborts stalled fetches and returns unknown rather than missing content', async () => {
  const check = api.createPlaybackHealthCache({ timeoutMs: 25 }); let signal;
  const response = await check('hung', value => { signal = value; return new Promise(() => {}); });
  assert.equal(signal.aborted, true); assert.equal(response.state, 'unknown'); assert.equal(response.reason, 'timeout');
});
test('busy admission control has no queue and bounded cache evicts older entries', async () => {
  const check = api.createPlaybackHealthCache({ concurrency: 1, timeoutMs: 25, maxEntries: 1 });
  const first = check('a', () => new Promise(() => {}));
  assert.equal((await check('b', async () => result('available'))).reason, 'busy'); await first;
  let calls = 0;
  const probe = async () => { calls++; return result('available'); };
  await check('b', probe); await check('a', probe); assert.equal(calls, 2);
});
test('verifies actual MP4 or HLS bytes, never HTTP 200 login pages or empty video responses', async () => {
  for (const [body, type, expected] of [[mp4, 'video/mp4', 'available'], ['#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvideo.m3u8', 'application/vnd.apple.mpegurl', 'available'], ['<html>Login</html>', 'video/mp4', 'unknown'], ['', 'video/mp4', 'unknown']]) {
    const found = await api.probeHealthMedia('http://fixture', new AbortController().signal, async (_, request) => {
      assert.equal(request.headers.Range, 'bytes=0-1023'); return new Response(body, { headers: { 'content-type': type } });
    });
    assert.equal(found.state, expected);
  }
});
test('small media reads cancel full downloads when the CDN ignores Range', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(Buffer.alloc(100000)); }, cancel() { cancelled = true; } }));
  assert.equal((await api.readHealthPrefix(response, 1024)).length, 1024); assert.equal(cancelled, true);
});
test('transient upstream failures and throttling remain unknown; explicit 404 is unavailable', async () => {
  for (const status of [403, 429, 502, 404, 410]) {
    const found = await api.probeHealthMedia('http://fixture', new AbortController().signal, async () => new Response('', { status }));
    assert.equal(found.state, status === 404 || status === 410 ? 'unavailable' : 'unknown');
  }
});
test('startup can bypass a slow provider but never interrupts established playback', () => {
  const servers = [{ key: 'tape' }, { key: 'mix' }, { key: 'vip' }];
  const health = { tape: result('unknown'), mix: result('available'), vip: result('available') };
  assert.equal(api.chooseHealthStartupServer(servers, health, 'tape', false, new Set()).key, 'mix');
  assert.equal(api.chooseHealthStartupServer(servers, health, 'tape', true, new Set()), undefined);
  assert.equal(api.chooseHealthStartupServer(servers, health, 'mix', false, new Set()), undefined);
  assert.equal(api.chooseHealthStartupServer(servers, health, 'tape', false, new Set(['mix'])).key, 'vip');
});
test('fallback prioritizes verified sources, retains unknown and excludes only confirmed unavailable', () => {
  const servers = [{ key: 'tape' }, { key: 'mix' }, { key: 'vip' }];
  assert.deepEqual(api.rankPlaybackServers(servers, { tape: result('unknown'), mix: result('available'), vip: result('unavailable') }).map(s => s.key), ['mix', 'tape']);
  assert.deepEqual(servers.map(s => s.key), ['tape', 'mix', 'vip']);
});
test('expired negative health cannot keep hiding a server after a network outage', () => {
  const stale = { tape: { ...result('unavailable'), checkedAt: Date.now() - 21000 }, mix: { ...result('available'), checkedAt: Date.now() - 76000 } };
  assert.deepEqual(api.rankPlaybackServers([{ key: 'tape' }, { key: 'mix' }], stale).map(s => s.key), ['tape', 'mix']);
  assert.equal(api.chooseHealthStartupServer([{ key: 'tape' }, { key: 'mix' }], stale, 'tape', false, new Set()), undefined);
});
test('client rejects health belonging to a different episode', async () => {
  global.fetch = async () => Response.json({ identity: 'tv:10:1:2', servers: { srv_mixdrop: result('available') } });
  try {
    await assert.rejects(api.fetchPlaybackHealth({ id: '10', type: 'tv', season: 1, episode: 3, servers: ['srv_mixdrop'] }, new AbortController().signal), /content mismatch/);
  } finally { global.fetch = nativeFetch; }
});
test('HTTP health rejects arbitrary and blacklisted servers and invalid content before upstream requests', async () => {
  global.fetch = () => { throw new Error('Must not contact upstream'); };
  try {
    for (const query of ['id=10&type=tv&servers=srv_superflix', 'id=10&type=tv&servers=srv_vidsrc', 'id=10&type=tv&servers=https://evil', 'id=10&type=tv&s=-1&servers=srv_mixdrop', 'id=abc&type=movie&servers=srv_mixdrop']) {
      assert.equal((await nativeFetch(base + '/api/playback-health?' + query)).status, 400);
    }
  } finally { global.fetch = nativeFetch; }
});
test('HTTP batch probes the requested episode, shares catalog lookup and hides signed URLs', async () => {
  const calls = [];
  global.fetch = async (raw, options) => {
    const url = new URL(raw); calls.push(url);
    assert.equal(url.origin, base);
    if (url.pathname === '/api/encontrei-lookup') {
      assert.equal(url.searchParams.get('season'), '2'); assert.equal(url.searchParams.get('episode'), '3');
      return Response.json({ mixdrop: 'mix-id', streamtape: 'tape-id' });
    }
    if (url.pathname === '/api/md-stream') return Response.json({ videoUrl: base + '/api/md-proxy?url=fixture-signed-secret' });
    if (url.pathname === '/api/streamtape-resolve') return Response.json({ proxyUrl: '/api/streamtape-stream?url=fixture-signed-secret' });
    assert.match(url.pathname, /\/api\/(md-proxy|streamtape-stream)/); assert.equal(options.headers.Range, 'bytes=0-1023');
    return new Response(mp4, { status: 206 });
  };
  try {
    const response = await nativeFetch(base + '/api/playback-health?id=213375&type=tv&s=2&e=3&servers=srv_streamtape,srv_mixdrop', { headers: { Host: 'untrusted.invalid' } });
    const text = await response.text(); assert.doesNotMatch(text, /signed-secret|proxyUrl|videoUrl/);
    const data = JSON.parse(text); assert.equal(data.servers.srv_mixdrop.state, 'available'); assert.equal(data.servers.srv_streamtape.state, 'available');
    assert.equal(calls.filter(url => url.pathname === '/api/encontrei-lookup').length, 0);
    const mixProbe = calls.find(url => url.pathname === '/api/md-stream');
    assert.equal(mixProbe.searchParams.get('id'), '213375'); assert.equal(mixProbe.searchParams.get('s'), '2'); assert.equal(mixProbe.searchParams.get('e'), '3');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally { global.fetch = nativeFetch; }
});
test('VIP, WatchPlayer and Nixplay probes use exact episode adapters and verify media', async () => {
  const calls = [];
  global.fetch = async raw => {
    const url = new URL(raw); calls.push(url);
    assert.equal(url.origin, base);
    if (url.pathname === '/api/myembed-stream') {
      assert.equal(url.searchParams.get('s'), '3'); assert.equal(url.searchParams.get('e'), '4');
      return new Response('var hlsUrl = "/api/live-stream-proxy?url=signed";');
    }
    if (url.pathname === '/api/watchplayer-stream') {
      assert.match(url.searchParams.get('url'), /\/tvshow\/77777\/3\/4$/);
      return new Response('Unavailable', { status: 404 });
    }
    if (url.pathname === '/api/nixplay-episode-id') {
      assert.equal(url.searchParams.get('seriesId'), '123'); assert.equal(url.searchParams.get('episode'), '4');
      return Response.json({ nixplayUrl: 'https://nixplay.lat/series/fixture.mp4' });
    }
    if (url.pathname === '/api/nixplay-proxy') return new Response(mp4);
    assert.ok(['/api/live-stream-proxy'].includes(url.pathname));
    return new Response('#EXTM3U\n#EXTINF:10,\nsegment.ts');
  };
  try {
    const response = await nativeFetch(base + '/api/playback-health?id=77777&type=tv&s=3&e=4&nixId=123&servers=srv_vip,srv_watchplay,srv_nixplay');
    const data = await response.json();
    assert.equal(data.servers.srv_watchplay.state, 'unavailable');
    for (const key of ['srv_vip', 'srv_nixplay']) assert.equal(data.servers[key].state, 'available');
  } finally { global.fetch = nativeFetch; }
});

test('a background health poll cannot skip StreamTape catalogue failover before the iframe exhausts it', () => {
  const servers = [{ key: 'srv_streamtape' }, { key: 'srv_mixdrop' }];
  for (const state of ['unknown', 'unavailable']) {
    assert.equal(api.chooseHealthStartupServer(servers, { srv_streamtape: result(state), srv_mixdrop: result('available') }, 'srv_streamtape', false, new Set()), undefined);
  }
});

test('background health waits for MixDrop to exhaust its own two catalogue copies', () => {
  assert.equal(api.chooseHealthStartupServer([{ key: 'srv_mixdrop' }, { key: 'srv_vip' }], { srv_mixdrop: result('unknown'), srv_vip: result('available') }, 'srv_mixdrop', false, new Set()), undefined);
});
