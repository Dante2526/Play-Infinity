const { test, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const nativeFetch = global.fetch;
let api;
const html = (id = 'fixture') => `document.getElementById('robotlink').innerHTML = '//streamtape.com/get_video?id=${id}&token=' + ('xxREAL').substring(2);`;
const redirect = url => new Response(null, { status: 302, headers: { location: url } });
before(async () => {
  const result = await esbuild.build({ entryPoints: [path.resolve(__dirname, '../server/services/streamtapeResolver.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
  const m = new Module(__filename, module); m._compile(result.outputFiles[0].text, __filename); api = m.exports;
});
afterEach(() => { global.fetch = nativeFetch; });
test('extracts multiline strings, chained substring and helper-element references without executing JS', () => {
  const page = `<div id="ideoolink">//evil.invalid/get_video?id=fixture</div>
    document.getElementById('norobotlink').innerHTML = '//streamtape.com/get_video?id=fixture&token=';
    document.getElementById('robotlink').innerHTML =
      document.getElementById('norobotlink').innerHTML + ('xyzzREAL').substring(2).substring(2);`;
  const url = new URL(api.extractStreamtapeVideoUrl(page, 'fixture'));
  assert.equal(url.hostname, 'streamtape.com'); assert.equal(url.searchParams.get('token'), 'REAL');
  assert.equal(url.searchParams.get('stream'), '1');
  assert.equal(api.extractStreamtapeVideoUrl(`document.getElementById('robotlink').innerHTML = process.exit(1);`, 'fixture'), null);
});
test('rejects links to another file/host and ignores incomplete helper when the final assignment fails', () => {
  assert.equal(api.extractStreamtapeVideoUrl(html('episode3'), 'episode4'), null);
  assert.equal(api.extractStreamtapeVideoUrl(html().replace('streamtape.com', 'unrelated.invalid'), 'fixture'), null);
  const page = `document.getElementById('norobotlink').innerHTML = '//streamtape.com/get_video?id=fixture&token=INCOMPLETE';
    document.getElementById('robotlink').innerHTML = unknownFunction();`;
  assert.equal(api.extractStreamtapeVideoUrl(page, 'fixture'), null);
});
test('GET repairs HEAD 405, HEAD 200 without Location and HEAD transport reset using the same user agent', async () => {
  for (const mode of ['405', '200', 'reset']) {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), method: options.method, agent: options.headers['User-Agent'] });
      if (String(url).includes('/e/')) return new Response(html());
      if (options.method === 'HEAD') { if (mode === 'reset') throw new TypeError('reset'); return new Response(null, { status: Number(mode) }); }
      return redirect('https://video.tapecontent.net/fixture.mp4');
    };
    const r = await api.createStreamtapeResolver().resolve('fixture');
    assert.equal(r.directUrl, 'https://video.tapecontent.net/fixture.mp4');
    assert.deepEqual(calls.map(x => x.method), ['GET', 'HEAD', 'GET']);
    assert.equal(new Set(calls.map(x => x.agent)).size, 1);
  }
});
test('concurrent cold lookups and refreshes share one token resolution', async () => {
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++; await new Promise(r => setTimeout(r, 5));
    return String(url).includes('/e/') ? new Response(html()) : redirect('https://video.tapecontent.net/fixture.mp4');
  };
  const resolver = api.createStreamtapeResolver();
  const results = await Promise.all(Array.from({ length: 12 }, () => resolver.resolve('fixture', true)));
  assert.ok(results.every(x => x.directUrl)); assert.equal(calls, 2);
  await resolver.resolve('fixture'); assert.equal(calls, 2);
  await resolver.resolve('fixture', true); assert.equal(calls, 4);
});
test('reports provider refusal separately from missing script and missing handoff redirect', async () => {
  global.fetch = async () => new Response('Forbidden', { status: 403 });
  let result = await api.createStreamtapeResolver().resolve('fixture');
  assert.deepEqual(result.failure, { stage: 'embed', code: 'upstream_http', status: 403 });
  global.fetch = async () => new Response('<html>no matching script</html>');
  result = await api.createStreamtapeResolver().resolve('fixture');
  assert.deepEqual(result.failure, { stage: 'extract', code: 'playback_link_missing' });
  global.fetch = async url => new Response(String(url).includes('/e/') ? html() : 'no redirect');
  result = await api.createStreamtapeResolver().resolve('fixture');
  assert.deepEqual(result.failure, { stage: 'handoff', code: 'redirect_missing', status: 200 });
});
test('failed resolutions are not cached as removed files and a later successful attempt works', async () => {
  let fail = true;
  global.fetch = async url => {
    if (fail) return new Response('Forbidden', { status: 403 });
    return String(url).includes('/e/') ? new Response(html()) : redirect('https://video.tapecontent.net/fixture.mp4');
  };
  const resolver = api.createStreamtapeResolver();
  assert.equal((await resolver.resolve('fixture')).directUrl, null);
  fail = false; assert.ok((await resolver.resolve('fixture')).directUrl);
});
test('one total deadline bounds unresponsive handoff attempts and clears inflight state', async () => {
  let stuck = true;
  global.fetch = async (url, { signal }) => {
    if (String(url).includes('/e/')) return new Response(html());
    if (!stuck) return redirect('https://video.tapecontent.net/fixture.mp4');
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true }));
  };
  const resolver = api.createStreamtapeResolver({ timeoutMs: 60, phaseTimeoutMs: 30 });
  const start = Date.now(); const result = await resolver.resolve('fixture');
  assert.equal(result.directUrl, null); assert.equal(result.failure.stage, 'handoff');
  assert.ok(Date.now() - start < 500);
  stuck = false; assert.ok((await resolver.resolve('fixture')).directUrl);
});
test('follows a safe embed redirect but refuses an unrelated handoff destination', async () => {
  global.fetch = async url => {
    if (String(url).includes('/e/')) return redirect('/v/fixture/');
    if (String(url).includes('/v/')) return new Response(html());
    return redirect('https://unrelated.invalid/private?token=do-not-expose');
  };
  const result = await api.createStreamtapeResolver().resolve('fixture');
  assert.deepEqual(result.failure, { stage: 'handoff', code: 'invalid_redirect' });
  assert.doesNotMatch(JSON.stringify(result), /do-not-expose/);
});

test('handoff keeps the session cookie issued by the embed without leaking it in diagnostics', async () => {
  global.fetch = async (url, options) => {
    if (String(url).includes('/e/')) return new Response(html(), { headers: { 'set-cookie': 'session=private-cookie; Path=/; HttpOnly; Secure' } });
    assert.equal(options.headers.Cookie, 'session=private-cookie');
    return redirect('https://video.tapecontent.net/fixture.mp4');
  };
  const result = await api.createStreamtapeResolver().resolve('fixture');
  assert.ok(result.directUrl); assert.doesNotMatch(JSON.stringify(result), /private-cookie/);
});
