const { test } = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const vm = require('node:vm');

// Reprodução do caso real: Lupin (tmdb 96677) no Play-Infinity.
// A fonte (encontrei) numera por "partes" da Netflix (S4E1 = Parte 4),
// mas o TMDB funde Parte 1+2 na Temporada 1 → /tv/96677/season/4 = 404.
const SHOW_DETAILS = {
  id: 96677,
  name: 'Lupin',
  seasons: [
    { id: 1, name: 'Parte 1', season_number: 1, episode_count: 10 },
    { id: 2, name: 'Parte 3', season_number: 2, episode_count: 7 },
    { id: 3, name: 'Parte 4', season_number: 3, episode_count: 8 },
  ],
};

const SEASON_3 = {
  id: 3,
  name: 'Parte 4',
  season_number: 3,
  episode_count: 8,
  episodes: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
    id: 100 + n,
    name: `Chapter ${24 + n}`,
    episode_number: n,
    season_number: 3,
    still_path: `/s3e${n}.jpg`,
    overview: '',
    air_date: '2026-10-01',
  })),
};

const SEASON_2 = {
  id: 2,
  name: 'Parte 3',
  season_number: 2,
  episode_count: 7,
  episodes: [],
};

function makeEnv(catalogEpisodes) {
  const calls = [];
  const fetchMock = async (url) => {
    calls.push(String(url));
    if (url.includes('/api/catalog-season?') && catalogEpisodes) {
      return { ok: true, status: 200, json: async () => ({ episodes: [...catalogEpisodes], source: 'encontrei-live' }) };
    }
    // Production snapshot: TMDB groups the original 170 episodes in T1,
    // while the content catalogue advertises five separate seasons.
    if (url.includes('/tv/73223?')) {
      return { ok: true, status: 200, json: async () => ({
        id: 73223, name: 'Black Clover', seasons: [
          { season_number: 1, episode_count: 170 },
          { season_number: 2, episode_count: 26 },
        ],
      }) };
    }
    if (url.includes('/tv/73223/season/2')) {
      return { ok: true, status: 200, json: async () => ({
        season_number: 2, episodes: [{ episode_number: 1, name: 'Different run' }],
      }) };
    }
    if (url.includes('/tv/96677/season/4')) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ success: false, status_code: 34, status_message: 'The resource you requested could not be found.' }),
      };
    }
    if (url.includes('/tv/96677/season/3/episode/1/images')) {
      return { ok: true, status: 200, json: async () => ({ stills: [{ file_path: '/still-ep1.jpg' }] }) };
    }
    if (url.includes('/tv/96677/season/3')) {
      return { ok: true, status: 200, json: async () => SEASON_3 };
    }
    if (url.includes('/tv/96677/season/2')) {
      return { ok: true, status: 200, json: async () => SEASON_2 };
    }
    if (url.includes('/tv/96677?')) {
      return { ok: true, status: 200, json: async () => SHOW_DETAILS };
    }
    if (url.includes('/tv/96677/images')) {
      return { ok: true, status: 200, json: async () => ({ backdrops: [{ file_path: '/bd1.jpg' }] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const exportsObj = {};
  const mod = { exports: exportsObj };
  const ctx = {
    module: mod,
    exports: exportsObj,
    window: { Capacitor: { isNativePlatform: () => false }, location: { protocol: 'https:' } },
    console,
    Date,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: fetchMock,
  };
  return { calls, mod, ctx };
}

async function buildService() {
  const build = await esbuild.build({
    entryPoints: ['src/services/tmdb.ts'],
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    write: false,
  });
  return build.outputFiles[0].text;
}

const BUNDLE_PROMISE = buildService();

test('Black Clover uses source episode numbers instead of the differently divided TMDB season', async () => {
  const { calls, mod, ctx } = makeEnv([1, 2, 52]);
  vm.runInNewContext(await BUNDLE_PROMISE, ctx);
  const season = await mod.exports.getSeasonDetails(73223, 2);
  assert.deepEqual(Array.from(season.episodes, ep => ep.episode_number), [1, 2, 52]);
  assert.equal(season.season_number, 2);
  assert.equal(season.catalogEpisodes, true);
  assert.ok(!calls.some(url => url.includes('/tv/73223/season/2')));
});

test('Black Clover T5 with one episode never creates extra playable entries', async () => {
  const { mod, ctx } = makeEnv([1]);
  vm.runInNewContext(await BUNDLE_PROMISE, ctx);
  const season = await mod.exports.getSeasonDetails(73223, 5);
  assert.equal(season.episodes.length, 1);
  assert.equal(season.episodes[0].season_number, 5);
});

test('an unavailable Black Clover listing does not fabricate TMDB episodes', async () => {
  const { calls, mod, ctx } = makeEnv();
  vm.runInNewContext(await BUNDLE_PROMISE, ctx);
  const season = await mod.exports.getSeasonDetails(73223, 2);
  assert.equal(season.episodes.length, 0);
  assert.equal(season.season_number, 2);
  assert.ok(!calls.some(url => url.includes('/tv/73223/season/2')));
});

test('an empty catalogue response can recover on the next season load', async () => {
  const episodes = [];
  const { mod, ctx } = makeEnv(episodes);
  vm.runInNewContext(await BUNDLE_PROMISE, ctx);
  assert.equal((await mod.exports.getSeasonDetails(73223, 5)).episodes.length, 0);
  episodes.push(1);
  assert.equal((await mod.exports.getSeasonDetails(73223, 5)).episodes.length, 1);
});

test('Black Clover never substitutes the sequel metadata for source parts 3–5', async () => {
  const { calls, mod, ctx } = makeEnv();
  vm.runInNewContext(await BUNDLE_PROMISE, ctx);
  for (const n of [3, 4, 5]) {
    assert.equal(await mod.exports.resolveTmdbSeasonNumber(73223, n), n);
    await mod.exports.getSeasonDetails(73223, n);
    await mod.exports.getTimelinePreviewImages(73223, 'tv', n, 1);
  }
  assert.ok(!calls.some(url => url.includes('/tv/73223/season/2')));
});

test('getSeasonDetails remapeia temporada inexistente (Lupin fonte S4 → TMDB T3) e devolve episódios reais', async () => {
  const bundle = await BUNDLE_PROMISE;
  const { calls, mod, ctx } = makeEnv();
  vm.runInNewContext(bundle, ctx);

  const season = await mod.exports.getSeasonDetails(96677, 4);

  assert.equal(season.name, 'Parte 4');
  assert.equal(season.episodes?.length, 8);
  assert.equal(season.episodes?.[0]?.name, 'Chapter 25');
  assert.ok(calls.some(u => u.includes('/tv/96677/season/4')), 'deve tentar a temporada pedida primeiro');
  assert.ok(calls.some(u => u.includes('/tv/96677/season/3?')), 'deve cair para a T3 remapeada');
  assert.ok(calls.some(u => u.includes('/tv/96677?')), 'deve consultar os detalhes da série para remapear');
});

test('temporada existente no TMDB não é remapeada (T2 continua T2, sem consulta extra)', async () => {
  const bundle = await BUNDLE_PROMISE;
  const { calls, mod, ctx } = makeEnv();
  vm.runInNewContext(bundle, ctx);

  const season = await mod.exports.getSeasonDetails(96677, 2);

  assert.equal(season.season_number, 2);
  assert.ok(calls.some(u => u.includes('/tv/96677/season/2?')));
  assert.ok(!calls.some(u => u.includes('/tv/96677/season/4')), 'não deve tentar T4');
});

test('resolveTmdbSeasonNumber mapeia S4→T3 e mantém temporadas existentes', async () => {
  const bundle = await BUNDLE_PROMISE;
  const { mod, ctx } = makeEnv();
  vm.runInNewContext(bundle, ctx);

  assert.equal(await mod.exports.resolveTmdbSeasonNumber(96677, 4), 3);
  assert.equal(await mod.exports.resolveTmdbSeasonNumber(96677, 2), 2);
  assert.equal(await mod.exports.resolveTmdbSeasonNumber(96677, 1), 1);
});

test('getTimelinePreviewImages busca stills da temporada remapeada, não da inexistente', async () => {
  const bundle = await BUNDLE_PROMISE;
  const { calls, mod, ctx } = makeEnv();
  vm.runInNewContext(bundle, ctx);

  const imgs = await mod.exports.getTimelinePreviewImages(96677, 'tv', 4, 1);

  assert.ok(imgs.length > 0, 'deve retornar stills reais da Parte 4');
  assert.ok(calls.some(u => u.includes('/tv/96677/season/3/episode/1/images')), 'deve buscar stills do episódio na T3');
  assert.ok(!calls.some(u => u.includes('/tv/96677/season/4/episode/1/images')), 'não deve insistir na T4 inexistente');
  assert.ok(!calls.some(u => u.includes('/tv/96677/season/4?')), 'não deve buscar dados da temporada 4');
});
