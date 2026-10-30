const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const express = require('express');
const esbuild = require('esbuild');
let server, base;
const nativeFetch = global.fetch;
const cookie = process.env.ENCONTREI_COOKIE;
before(async () => {
  process.env.ENCONTREI_COOKIE = 'test-session';
  const output = await esbuild.build({ entryPoints: ['server/routes/encontreiLookup.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false });
  const filename = path.join(process.cwd(), 'tests/virtual-catalog-season.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  const app = express(); app.use(compiled.exports.default);
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  global.fetch = async (url, opts) => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'encontrei.me');
    assert.equal(parsed.searchParams.get('id'), '53251');
    assert.equal(parsed.searchParams.get('audio'), 'Dublado');
    assert.equal(opts.redirect, 'manual');
    if (parsed.searchParams.get('season') === '4') return new Response('login', { status: 302 });
    return Response.json({ episodes: [
      { number: 52, id: 3, url: '/episode-3/' },
      { number: 1, id: 1, url: '/episode-1/' },
      { number: 52, id: 3 }, { number: 0 }, { number: 'broken' },
    ] });
  };
});
after(async () => {
  global.fetch = nativeFetch;
  if (cookie === undefined) delete process.env.ENCONTREI_COOKIE;
  else process.env.ENCONTREI_COOKIE = cookie;
  server.closeAllConnections(); await new Promise(r => server.close(r));
});
test('season listing preserves provider episode numbers, deduplicates and exposes no source IDs', async () => {
  const r = await nativeFetch(base + '/api/catalog-season?tmdb_id=73223&season=2');
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual(d.episodes, [1, 52]);
  assert.equal(d.source, 'encontrei-live');
  assert.equal(d.season, 2);
  assert.ok(!JSON.stringify(d).includes('episode-'));
});
test('missing authentication falls back to listed snapshot episodes, not guessed counts', async () => {
  delete process.env.ENCONTREI_COOKIE;
  const r = await nativeFetch(base + '/api/catalog-season?tmdb_id=73223&season=1');
  const d = await r.json();
  assert.equal(d.source, 'snapshot');
  assert.equal(d.episodes.length, 51);
  assert.equal(d.episodes[50], 51);
  process.env.ENCONTREI_COOKIE = 'test-session';
});
test('login redirects never become a successful complete listing', async () => {
  const r = await nativeFetch(base + '/api/catalog-season?tmdb_id=73223&season=4');
  const d = await r.json();
  assert.equal(d.source, 'snapshot');
  assert.deepEqual(d.episodes, []);
});
test('invalid season requests are rejected', async () => {
  const r = await nativeFetch(base + '/api/catalog-season?tmdb_id=73223&season=-1');
  assert.equal(r.status, 400);
});
