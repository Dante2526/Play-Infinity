const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const Module = require('node:module');

let api;
const storageMock = {};

global.localStorage = {
  getItem: key => storageMock[key] || null,
  setItem: (key, val) => { storageMock[key] = String(val); },
  removeItem: key => { delete storageMock[key]; },
  clear: () => { for (const k of Object.keys(storageMock)) delete storageMock[k]; }
};

if (typeof window === 'undefined') {
  global.window = {
    dispatchEvent: () => {},
    addEventListener: () => {}
  };
  global.document = {
    addEventListener: () => {},
    visibilityState: 'visible'
  };
  global.CustomEvent = class CustomEvent {};
}

async function compileService() {
  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    stdin: {
      contents: `export * from './src/services/watchedEpisodes.ts';`,
      resolveDir: root,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    write: false,
    plugins: [{
      name: 'mock-firebase',
      setup(build) {
        build.onResolve({ filter: /firebase/ }, args => ({ path: args.path, namespace: 'mock-fb' }));
        build.onLoad({ filter: /.*/, namespace: 'mock-fb' }, () => ({
          contents: `export const db = {}; export const auth = { currentUser: null }; export const doc = () => ({}); export const getDoc = async () => ({ exists: () => false }); export const setDoc = async () => {};`
        }));
      }
    }]
  });

  const filename = path.join(root, 'tests/virtual-watched-episodes.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

beforeEach(async () => {
  global.localStorage.clear();
  api = await compileService();
});

test('isSeasonFullyWatched returns false when only some episodes of a season are watched', () => {
  const seriesId = 99125;
  const season = 5;
  const totalEpisodes = 5;

  api.markEpisodeWatched(seriesId, season, 1, true);
  api.markEpisodeWatched(seriesId, season, 2, true);
  api.markEpisodeWatched(seriesId, season, 3, true);

  // 3 de 5 episódios assistidos -> deve ser false
  assert.equal(api.isSeasonFullyWatched(seriesId, season, totalEpisodes), false);
  assert.equal(api.getSeasonWatchedCount(seriesId, season, totalEpisodes), 3);
});

test('isSeasonFullyWatched returns true only when all episodes are watched', () => {
  const seriesId = 99125;
  const season = 5;
  const totalEpisodes = 5;

  for (let i = 1; i <= totalEpisodes; i++) {
    api.markEpisodeWatched(seriesId, season, i, true);
  }

  assert.equal(api.isSeasonFullyWatched(seriesId, season, totalEpisodes), true);
  assert.equal(api.getSeasonWatchedCount(seriesId, season, totalEpisodes), 5);
});

test('isSeasonFullyWatched guards against outdated TMDB episodeCount=1 when higher episodes are already watched', () => {
  const seriesId = 99125;
  const season = 5;

  // Usuário assistiu até o ep 3 (mas ep 2 e 3 existem)
  api.markEpisodeWatched(seriesId, season, 1, true);
  api.markEpisodeWatched(seriesId, season, 3, true); // pulou o 2

  // Se o TMDB passar episodeCount: 1 (desatualizado), o guard detecta maxWatchedEp = 3 e não marca como completa
  assert.equal(api.isSeasonFullyWatched(seriesId, season, 1), false);
});
