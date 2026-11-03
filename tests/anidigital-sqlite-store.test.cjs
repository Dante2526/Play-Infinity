/**
 * Testes do anidigitalSqliteStore.ts + path tmdb_id do anidigitalResolver.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Module = require('node:module');
const esbuild = require('esbuild');
const sqlite3 = (() => { try { return require('node:sqlite'); } catch { return null; } })();

const root = path.resolve(__dirname, '..');

async function compile() {
  const output = await esbuild.build({
    stdin: {
      contents: `
        export { openAnidigitalSqlite, findAnidigitalDb, isAnidigitalSqliteAvailable, getAnidigitalStore } from './server/services/anidigitalSqliteStore';
        export { resolveAnidigitalStream } from './server/services/anidigitalResolver';
      `,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    write: false,
  });
  const filename = path.join(root, 'tests/virtual-anidigital-store.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

function buildTempDb(dbPath) {
  if (!sqlite3) throw new Error('node:sqlite indisponível');
  const db = new sqlite3.DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE movies (tmdb_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, slug TEXT);
    CREATE TABLE episodes (
      tmdb_id INTEGER NOT NULL, season INTEGER NOT NULL, episode INTEGER NOT NULL,
      payload TEXT NOT NULL, slug TEXT,
      PRIMARY KEY (tmdb_id, season, episode)
    );
    CREATE TABLE serie_ids (tmdb_id INTEGER PRIMARY KEY, serie_id INTEGER NOT NULL);
  `);
  const epPayload = JSON.stringify({
    title: 'Test Anime', slug: 'test-anime',
    leg: { slug: 'test-anime', streamUrl: 'https://cdn-s01.mywallpaper-4k-image.net/stream/sv/t/test-anime/01.mp4/index.m3u8' },
    dub: { slug: 'test-anime-dublado', streamUrl: 'https://cdn-s01.mywallpaper-4k-image.net/stream/sv/t/test-anime-dublado/01.mp4/index.m3u8' },
  });
  const moviePayload = JSON.stringify({
    title: 'Test Movie', slug: 'test-movie',
    dub: { slug: 'test-movie', streamUrl: 'https://cdn-sv01.maximaimg.online/stream/c/test-movie/01.mp4/index.m3u8' },
  });
  db.prepare("INSERT INTO meta(key,value) VALUES('schema_version','1')").run();
  db.prepare("INSERT INTO meta(key,value) VALUES('source','anidigital-test')").run();
  db.prepare("INSERT INTO episodes(tmdb_id,season,episode,payload,slug) VALUES(999999,1,1,?,?)").run(epPayload, 'test-anime');
  db.prepare("INSERT INTO serie_ids(tmdb_id,serie_id) VALUES(999999,999999)").run();
  db.prepare("INSERT INTO movies(tmdb_id,payload,slug) VALUES(888888,?,?)").run(moviePayload, 'test-movie');
  db.close();
}

test('anidigitalSqliteStore: node:sqlite disponível', async () => {
  const m = await compile();
  assert.equal(m.isAnidigitalSqliteAvailable(), true);
});

test('anidigitalSqliteStore: abre .db temporário e consulta episódio por tmdb_id', async () => {
  if (!sqlite3) { test.skip('node:sqlite indisponível'); return; }
  const m = await compile();
  const tmp = path.join(os.tmpdir(), `anidigital-test-${process.pid}.db`);
  buildTempDb(tmp);
  try {
    const store = m.openAnidigitalSqlite(tmp);
    assert.ok(store, 'store deve abrir');
    assert.equal(store.meta('schema_version'), '1');
    const p = store.episodeIndex.get('999999:1:1');
    assert.ok(p, 'episódio 999999:1:1 deve existir');
    assert.ok(p.dub && p.leg, 'payload deve ter leg E dub');
    assert.ok(p.dub.streamUrl.includes('test-anime-dublado'), 'streamUrl dub correto');
    store.close();
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
});

test('resolveAnidigitalStream({tmdbId}): SQLite-first retorna m3u8 sem live search', async () => {
  if (!sqlite3) { test.skip('node:sqlite indisponível'); return; }
  const m = await compile();
  const dbPath = path.join(root, 'data', 'anidigital-catalog.db');
  const existed = fs.existsSync(dbPath);
  buildTempDb(dbPath);
  try {
    const res = await m.resolveAnidigitalStream({
      tmdbId: 999999, type: 'tv', episode: 1, audio: 'dub', name: 'zzz-nonexistent-title',
    });
    assert.ok(res.m3u8, 'deve resolver m3u8 via SQLite');
    assert.ok(res.m3u8.includes('test-anime-dublado'), 'm3u8 deve ser o dub do payload');
    assert.equal(res.dub, true);
    assert.equal(res.leg, true);
  } finally {
    if (!existed) try { fs.unlinkSync(dbPath); } catch {}
    const store = m.getAnidigitalStore(); if (store) store.close();
  }
});

test('resolveAnidigitalStream({tmdbId}): pede leg e cai no dub quando leg ausente no filme', async () => {
  if (!sqlite3) { test.skip('node:sqlite indisponível'); return; }
  const m = await compile();
  const dbPath = path.join(root, 'data', 'anidigital-catalog.db');
  const existed = fs.existsSync(dbPath);
  buildTempDb(dbPath);
  try {
    const res = await m.resolveAnidigitalStream({
      tmdbId: 888888, type: 'movie', audio: 'leg', name: 'zzz-nonexistent',
    });
    assert.ok(res.m3u8, 'filme deve resolver via fallback dub');
    assert.ok(res.m3u8.includes('test-movie'), 'm3u8 do filme');
  } finally {
    if (!existed) try { fs.unlinkSync(dbPath); } catch {}
    const store = m.getAnidigitalStore(); if (store) store.close();
  }
});

test('resolveAnidigitalStream({tmdbId}): fallback graceful quando .db ausente', async () => {
  const m = await compile();
  const dbPath = path.join(root, 'data', 'anidigital-catalog.db');
  if (fs.existsSync(dbPath)) { test.skip('.db presente — não dá pra testar fallback ausente'); return; }
  const res = await m.resolveAnidigitalStream({
    tmdbId: 12345, type: 'tv', episode: 1, audio: 'leg', name: 'zzz',
  });
  assert.ok(!res.m3u8 || typeof res.m3u8 === 'string', 'sem crash; m3u8 ausente ou string');
});
