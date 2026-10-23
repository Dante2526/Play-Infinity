const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const nativeFetch = global.fetch;
let api, fixture;
const tv = (id = 210224, name = 'Verônica com K') => ({ id, name, media_type: 'tv', poster_path: '/poster.jpg' });
const local = (id = 1, title = 'Verônica com K') => ({ id, title, type: 'series', imageUrl: '/poster.jpg', genres: [] });
const tick = () => new Promise(resolve => setImmediate(resolve));
beforeEach(async () => {
  fixture = global.__searchFixture = { metadata: [tv()] };
  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    entryPoints: [path.join(root, 'src/services/catalogSearch.ts')], bundle: true, format: 'cjs', platform: 'node', packages: 'external', write: false,
    define: { 'import.meta.env.VITE_PROXY_URL': '"https://native.test"' },
    plugins: [{ name: 'metadata-fixture', setup(build) {
      build.onResolve({ filter: /\/tmdb$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export const searchMulti=async()=>{if(globalThis.__searchFixture.error)throw Error('TMDB timeout');return {results:globalThis.__searchFixture.metadata}};
        export const formatImageUrl=p=>p; export const getGenreNames=()=>[];
      ` }));
    } }],
  });
  const filename = path.join(root, 'tests/virtual-catalog-search.cjs');
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename); api = compiled.exports;
});
afterEach(() => { global.fetch = nativeFetch; delete global.__searchFixture; delete global.window; });

test('Verônica com K appears through the named Encontrei lookup after the old batch says unavailable', async () => {
  const calls = [];
  global.fetch = async (raw, options) => {
    const url = new URL(raw, 'http://fixture'); calls.push(url);
    if (url.pathname.endsWith('check-playable-batch')) {
      assert.deepEqual(JSON.parse(options.body), { items: [{ id: 210224, type: 'tv' }] });
      return Response.json({ playableIds: [], playableMovieIds: [], playableSeriesIds: [] });
    }
    assert.equal(url.pathname, '/api/encontrei-lookup');
    assert.equal(url.searchParams.get('tmdb_id'), '210224');
    assert.equal(url.searchParams.get('name'), 'Verônica com K');
    assert.equal(url.searchParams.get('season'), '1'); assert.equal(url.searchParams.get('episode'), '1');
    return Response.json({ mixdrop: '8ll3qpojbpdw8k', streamtape: '7Rr7yolbKPSJ2V', audio: 'Dublado' });
  };
  const updates = [];
  await api.searchCatalog('veronica com k', [], new AbortController().signal, items => updates.push(items));
  assert.equal(calls.length, 2);
  assert.deepEqual(updates.at(-1).map(i => [i.id, i.title, i.type]), [[210224, 'Verônica com K', 'series']]);
});
test('accent-insensitive local matches survive empty metadata or a metadata outage', async () => {
  global.fetch = () => assert.fail('Confirmed local item must not be probed');
  for (const error of [false, true]) {
    fixture.metadata = []; fixture.error = error;
    const updates = [];
    await api.searchCatalog('  veronica com k  ', [local()], new AbortController().signal, items => updates.push(items));
    assert.deepEqual(updates.at(-1).map(i => i.title), ['Verônica com K']);
  }
});
test('a movie and series sharing a number stay distinct and require confirmation for the correct type', async () => {
  fixture.metadata = [{ id: 5, title: 'Movie', media_type: 'movie' }, tv(5, 'Series')];
  global.fetch = async raw => raw.startsWith('/api/check') ? Response.json({ playableMovieIds: [5], playableSeriesIds: [] }) : Response.json({ error: 'Not found' });
  const updates = [];
  await api.searchCatalog('name', [], new AbortController().signal, items => updates.push(items));
  assert.deepEqual(updates.at(-1).map(i => [i.id, i.type]), [[5, 'movie']]);
});
test('metadata alone, people and error responses never become playable catalogue results', async () => {
  fixture.metadata = [tv(), { id: 3, name: 'Person', media_type: 'person' }];
  let lookups = 0;
  global.fetch = async raw => {
    if (raw.startsWith('/api/check')) return new Response('', { status: 503 });
    lookups++; return Response.json({ error: 'Not found', mixdrop: 'ignore-invalid-error-response' });
  };
  const updates = [];
  await api.searchCatalog('veronica', [], new AbortController().signal, items => updates.push(items));
  assert.equal(lookups, 1); assert.deepEqual(updates.at(-1), []);
});
test('transient failures are retried on the next search and only positive confirmations are cached', async () => {
  let succeed = false, calls = 0;
  global.fetch = async raw => {
    calls++;
    return raw.startsWith('/api/check') ? Response.json({ playableMovieIds: [], playableSeriesIds: [] }) :
      succeed ? Response.json({ streamtape: 'working' }) : new Response('', { status: 503 });
  };
  const updates = [];
  const search = () => api.searchCatalog('veronica', [], new AbortController().signal, items => updates.push(items));
  await search(); assert.deepEqual(updates.at(-1), []);
  succeed = true; await search(); assert.equal(updates.at(-1)[0].id, 210224);
  await search(); assert.equal(calls, 4);
});
test('obsolete searches cannot publish late sources or cache them for the next query', async () => {
  let finish;
  global.fetch = async raw => raw.startsWith('/api/check') ? Response.json({}) : new Promise(resolve => { finish = resolve; });
  const controller = new AbortController(), updates = [];
  const pending = api.searchCatalog('veronica', [], controller.signal, items => updates.push(items));
  await tick(); const count = updates.length; controller.abort(); finish(Response.json({ mixdrop: 'late-file' })); await pending;
  assert.equal(updates.length, count);
  let calls = 0; global.fetch = async () => { calls++; return Response.json({}); };
  await api.searchCatalog('veronica', [], new AbortController().signal, () => {});
  assert.equal(calls, 2);
});
test('catalogue lookups are limited to two simultaneous requests and publish successes incrementally', async () => {
  fixture.metadata = Array.from({ length: 5 }, (_, i) => tv(100 + i, 'Series ' + i));
  let active = 0, maximum = 0; const updates = [];
  global.fetch = async raw => {
    if (raw.startsWith('/api/check')) return Response.json({});
    active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return Response.json({ mixdrop: 'file' });
  };
  await api.searchCatalog('series', [], new AbortController().signal, items => updates.push(items));
  assert.equal(maximum, 2); assert.equal(updates.at(-1).length, 5); assert.ok(updates.some(items => items.length === 1));
});
test('native Android lookups use the configured HTTPS API origin', async () => {
  global.window = { Capacitor: { isNativePlatform: () => true }, location: { protocol: 'https:' } };
  global.fetch = async raw => {
    assert.ok(raw.startsWith('https://native.test/api/'));
    return Response.json(raw.includes('check-playable') ? {} : { streamtape: 'file' });
  };
  const updates = [];
  await api.searchCatalog('veronica', [], new AbortController().signal, items => updates.push(items));
  assert.equal(updates.at(-1)[0].id, 210224);
});

test('a stalled lookup is cancelled within the search budget and cannot block later searches', async () => {
  fixture.metadata = Array.from({ length: 6 }, (_, i) => tv(400 + i, 'Series ' + i));
  const originalTimeout = global.setTimeout;
  let aborted = 0, started = 0;
  global.setTimeout = (fn, ms, ...args) => originalTimeout(fn, ms === 4500 ? 8 : ms === 10000 ? 20 : ms, ...args);
  global.fetch = async (raw, { signal }) => {
    if (raw.startsWith('/api/check')) return Response.json({});
    started++;
    return new Promise((resolve, reject) => {
      const cancel = () => { aborted++; reject(new DOMException('Cancelled', 'AbortError')); };
      if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
    });
  };
  const updates = [];
  try {
    await api.searchCatalog('series', [], new AbortController().signal, items => updates.push(items));
    assert.ok(started > 0); assert.equal(started, aborted); assert.deepEqual(updates.at(-1), []);
  } finally { global.setTimeout = originalTimeout; }
});

test('Vizer-only lookup sources are included in search results when Encontrei has no file', async () => {
  global.fetch = async raw => Response.json(raw.startsWith('/api/check') ? {} : { mixdrop_vizer: 'vizer-only-file', mixdrop_encontrei: null, source: 'vizer-live' });
  const updates = [];
  await api.searchCatalog('veronica', [], new AbortController().signal, items => updates.push(items));
  assert.deepEqual(updates.at(-1).map(item => item.id), [210224]);
});
