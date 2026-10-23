const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const nativeFetch = global.fetch;
let api, fixture, storage;
const item = (id, title = 'Release ' + id) => ({ id, title, poster_path: '/poster.jpg', release_date: '2026-10-22', vote_average: 7 });
const tick = () => new Promise(resolve => setImmediate(resolve));
beforeEach(async () => {
  fixture = global.__releaseFixture = { pages: () => ({ results: [] }), known: new Set([100]), pageCalls: [] };
  storage = new Map();
  global.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    entryPoints: [path.join(root, 'src/services/homeReleaseFeed.ts')], bundle: true, format: 'cjs', platform: 'node', packages: 'external', write: false,
    define: { 'import.meta.env.VITE_PROXY_URL': '""' },
    plugins: [{ name: 'release-fixture', setup(build) {
      build.onResolve({ filter: /(?:\/tmdb|\/mediaUtils)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('/tmdb') ? `
        const page=(type,p)=>{globalThis.__releaseFixture.pageCalls.push({type,page:p});return globalThis.__releaseFixture.pages(type,p)};
        export const getMovieReleases=async p=>page('movie',p); export const getSeriesReleases=async p=>page('tv',p);
      ` : `export const UNAVAILABLE_TITLES_OR_IDS=[999]; export const isMediaAvailable=item=>globalThis.__releaseFixture.known.has(item.id);` }));
    } }],
  });
  const filename = path.join(root, 'tests/virtual-home-releases.cjs');
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename); api = compiled.exports;
});
afterEach(() => { global.fetch = nativeFetch; delete global.localStorage; delete global.__releaseFixture; });

test('a new title outside the build snapshot appears after live StreamTape confirmation', async () => {
  fixture.pages = (_, page) => ({ results: page === 1 ? [item(200)] : [] });
  global.fetch = async raw => {
    const url = new URL(raw, 'http://fixture');
    assert.equal(url.searchParams.get('tmdb_id'), '200'); assert.equal(url.searchParams.get('name'), 'Release 200');
    return Response.json({ streamtape: 'actual-file-id' });
  };
  const updates = [];
  await api.loadHomeReleases('movie', new AbortController().signal, items => updates.push(items));
  assert.deepEqual(updates.at(-1).map(i => i.id), [200]);
  assert.deepEqual(api.readHomeReleases('movie').map(i => i.id), [200]);
});
test('known results publish before slower live lookups finish', async () => {
  fixture.pages = (_, page) => ({ results: page === 1 ? [item(200), item(100)] : [] });
  let finish;
  global.fetch = () => new Promise(resolve => { finish = resolve; });
  const updates = [];
  const pending = api.loadHomeReleases('movie', new AbortController().signal, items => updates.push(items));
  await tick(); assert.deepEqual(updates[0].map(i => i.id), [100]);
  finish(Response.json({ mixdrop: 'new-file' })); await pending;
  assert.deepEqual(updates.at(-1).map(i => i.id), [200, 100]);
});
test('metadata pages are independent, deduplicated and preserve release order and exclusions', async () => {
  fixture.known = new Set([100, 101, 102, 999]);
  fixture.pages = (_, page) => {
    if (page === 2) throw new Error('One page failed');
    return { results: page === 1 ? [item(100), item(999), item(102, 'Doraemon')] : [item(100), item(101)] };
  };
  const updates = [];
  await api.loadHomeReleases('movie', new AbortController().signal, items => updates.push(items));
  assert.deepEqual(updates.at(-1).map(i => i.id), [100, 101]);
  assert.equal(fixture.pageCalls.length, 3);
});
test('network or empty metadata retains the last successful persisted row', async () => {
  api.saveHomeReleases('tv', [item(200)]);
  fixture.pages = () => { throw new Error('TMDB timeout'); };
  await assert.rejects(api.loadHomeReleases('tv', new AbortController().signal, () => assert.fail('Do not publish empty data')), /No release metadata/);
  assert.deepEqual(api.readHomeReleases('tv').map(i => i.id), [200]);
});
test('missing sources never become visible simply because TMDB lists the title', async () => {
  fixture.pages = (_, page) => ({ results: page === 1 ? [item(200)] : [] });
  global.fetch = async () => Response.json({ mixdrop: null, streamtape: null });
  await api.loadHomeReleases('movie', new AbortController().signal, () => assert.fail('Unconfirmed title published'));
  assert.equal(api.readHomeReleases('movie').length, 0);
});
test('lookups are capped and later refreshes examine remaining candidates', async () => {
  fixture.pages = (_, page) => ({ results: page === 1 ? Array.from({ length: 12 }, (_, i) => item(200 + i)) : [] });
  let active = 0, maximum = 0; const calls = [];
  global.fetch = async raw => {
    calls.push(new URL(raw, 'http://fixture').searchParams.get('tmdb_id'));
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 3)); active--;
    return Response.json({});
  };
  await api.loadHomeReleases('movie', new AbortController().signal, () => {});
  assert.equal(calls.length, 8); assert.equal(maximum, 2);
  await api.loadHomeReleases('movie', new AbortController().signal, () => {});
  for (const id of ['208', '209', '210', '211']) assert.ok(calls.includes(id));
});
test('unmount prevents late lookup results from publishing or persisting', async () => {
  fixture.pages = (_, page) => ({ results: page === 1 ? [item(200)] : [] });
  let finish; global.fetch = () => new Promise(resolve => { finish = resolve; });
  const controller = new AbortController();
  const pending = api.loadHomeReleases('movie', controller.signal, () => assert.fail('Late state update'));
  await tick(); controller.abort(); finish(Response.json({ mixdrop: 'file' })); await pending;
  assert.equal(storage.size, 0);
});
test('movie and series IDs use separate caches and the series lookup specifies S1E1', async () => {
  fixture.pages = (_, page) => ({ results: page === 1 ? [item(200)] : [] });
  const calls = [];
  global.fetch = async raw => {
    const url = new URL(raw, 'http://fixture'); calls.push(url);
    if (url.searchParams.get('type') === 'tv') {
      assert.equal(url.searchParams.get('season'), '1'); assert.equal(url.searchParams.get('episode'), '1');
    }
    return Response.json({ mixdrop: 'file' });
  };
  await Promise.all(['movie', 'tv'].map(type => api.loadHomeReleases(type, new AbortController().signal, () => {})));
  assert.equal(calls.length, 2); assert.equal(storage.size, 2);
});
test('transient lookup errors are retried instead of becoming permanent negatives', async () => {
  fixture.pages = (_, page) => ({ results: page === 1 ? [item(200)] : [] });
  let calls = 0; global.fetch = async () => ++calls === 1 ? new Response('', { status: 503 }) : Response.json({ streamtape: 'file' });
  await api.loadHomeReleases('movie', new AbortController().signal, () => assert.fail('Failed title published'));
  const updates = []; await api.loadHomeReleases('movie', new AbortController().signal, items => updates.push(items));
  assert.equal(calls, 2); assert.equal(updates.at(-1)[0].id, 200);
});
test('expired or corrupt persistent cache is ignored safely', () => {
  storage.set('playinfinity:home-releases:v1:movie', JSON.stringify({ savedAt: Date.now() - 25 * 3600000, items: [item(200)] }));
  assert.equal(api.readHomeReleases('movie').length, 0);
  storage.set('playinfinity:home-releases:v1:tv', '{bad-json');
  assert.equal(api.readHomeReleases('tv').length, 0);
});
