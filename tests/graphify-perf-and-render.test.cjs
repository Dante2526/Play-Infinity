const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const Module = require('node:module');

const storageMock = {};
global.localStorage = {
  getItem: (key) => (Object.prototype.hasOwnProperty.call(storageMock, key) ? storageMock[key] : null),
  setItem: (key, val) => { storageMock[key] = String(val); },
  removeItem: (key) => { delete storageMock[key]; },
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
  global.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
}

async function compileTsService(relPath, virtualName) {
  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    stdin: {
      contents: `export * from './${relPath}';`,
      resolveDir: root,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    write: false,
    plugins: [{
      name: 'mock-externals',
      setup(build) {
        build.onResolve({ filter: /firebase/ }, (args) => ({ path: args.path, namespace: 'mock-fb' }));
        build.onLoad({ filter: /.*/, namespace: 'mock-fb' }, () => ({
          contents: `
            export const db = {};
            export const auth = { currentUser: null };
            export const doc = () => ({});
            export const getDoc = async () => ({ exists: () => false });
            export const setDoc = async () => {};
            export const updateDoc = async () => {};
          `
        }));
        build.onResolve({ filter: /\/tmdb$/ }, (args) => ({ path: args.path, namespace: 'mock-tmdb' }));
        build.onLoad({ filter: /.*/, namespace: 'mock-tmdb' }, () => ({
          contents: `
            export const getDetails = async () => null;
            export const getSeriesDetails = async () => null;
            export const formatImageUrl = (p) => p || '';
            export const getMovieDetails = async () => null;
            export const FALLBACK_POSTER_IMAGE = '';
            export const FALLBACK_BACKDROP_IMAGE = '';
          `
        }));
      }
    }]
  });

  const filename = path.join(root, 'tests', virtualName);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

let watchedApi;
let favoritesApi;
let historyApi;

beforeEach(async () => {
  global.localStorage.clear();
  if (!watchedApi) {
    watchedApi = await compileTsService('src/services/watchedEpisodes.ts', 'virtual-perf-watched.cjs');
    favoritesApi = await compileTsService('src/services/favorites.ts', 'virtual-perf-favorites.cjs');
    historyApi = await compileTsService('src/services/playbackHistory.ts', 'virtual-perf-history.cjs');
  }
});

test('watchedEpisodes usa cache O(1) em memória e invalida ao limpar localStorage', () => {
  watchedApi.markEpisodeWatched(999, 1, 1);

  const originalParse = JSON.parse;
  let parseCount = 0;
  JSON.parse = (...args) => {
    parseCount++;
    return originalParse(...args);
  };

  try {
    // Primeiro lote após save já deve estar em cache (0 JSON.parse!)
    for (let i = 0; i < 50; i++) {
      assert.equal(watchedApi.isEpisodeWatched(999, 1, 1), true);
      assert.equal(watchedApi.isEpisodeWatched(999, 1, 2), false);
    }
    assert.equal(parseCount, 0, 'Leituras repetidas após gravação não devem re-executar JSON.parse');

    // Simula alteração externa / troca de conta no localStorage
    global.localStorage.removeItem('playinfinity_watched_episodes');
    assert.equal(watchedApi.isEpisodeWatched(999, 1, 1), false, 'Cache deve invalidar quando localStorage é limpo');

    // Escrita direta no localStorage deve ser lida uma única vez e depois ficar em cache
    global.localStorage.setItem('playinfinity_watched_episodes', JSON.stringify({ [watchedApi.makeEpisodeKey(999, 1, 2)]: true }));
    parseCount = 0;
    for (let i = 0; i < 30; i++) {
      assert.equal(watchedApi.isEpisodeWatched(999, 1, 2), true);
    }
    assert.equal(parseCount, 1, 'Deve parsear JSON apenas 1 vez após mudança externa no localStorage');
  } finally {
    JSON.parse = originalParse;
  }
});

test('favorites usa cache O(1), devolve cópia segura e invalida ao limpar localStorage', () => {
  favoritesApi.toggleFavorite(42);
  favoritesApi.toggleFavorite(108);

  const originalParse = JSON.parse;
  let parseCount = 0;
  JSON.parse = (...args) => {
    parseCount++;
    return originalParse(...args);
  };

  try {
    for (let i = 0; i < 50; i++) {
      assert.equal(favoritesApi.getFavoriteIds().includes(42), true);
      assert.equal(favoritesApi.getFavoriteIds().includes(777), false);
    }
    assert.equal(parseCount, 0, 'getFavoriteIds em loop não deve chamar JSON.parse repetidamente');

    // Mutação externa no array retornado não pode corromper o cache interno
    const ids = favoritesApi.getFavoriteIds();
    ids.push(999999);
    assert.equal(favoritesApi.getFavoriteIds().includes(999999), false);

    // Limpeza do localStorage (troca de conta) invalida cache
    global.localStorage.removeItem('playinfinity_user_favorites');
    assert.deepEqual(favoritesApi.getFavoriteIds(), []);
  } finally {
    JSON.parse = originalParse;
  }
});

test('playbackHistory isola filme e série com mesmo TMDB ID e mantém compatibilidade legada', () => {
  historyApi.savePlaybackProgress({
    id: 550,
    tmdbId: 550,
    title: 'Clube da Luta',
    type: 'movie',
    currentTime: 1200,
    duration: 7200,
  });

  historyApi.savePlaybackProgress({
    id: 550,
    tmdbId: 550,
    title: 'Série Colisão ID 550',
    type: 'series',
    season: 2,
    episode: 4,
    currentTime: 600,
    duration: 3000,
  });

  const all = historyApi.getPlaybackHistory();
  assert.equal(all.length, 2, 'Filme e série com mesmo ID 550 devem coexistir no histórico');

  const movieRec = historyApi.getItemPlayback(550, 'movie');
  const seriesRec = historyApi.getItemPlayback(550, 'series');
  assert.equal(movieRec?.title, 'Clube da Luta');
  assert.equal(movieRec?.currentTime, 1200);
  assert.equal(seriesRec?.title, 'Série Colisão ID 550');
  assert.equal(seriesRec?.season, 2);
  assert.equal(seriesRec?.episode, 4);

  // Remover o filme NÃO pode apagar a série
  historyApi.removePlaybackItem(550, 'movie');
  assert.equal(historyApi.getItemPlayback(550, 'movie'), null);
  assert.equal(historyApi.getItemPlayback(550, 'series')?.title, 'Série Colisão ID 550');
  assert.equal(historyApi.getPlaybackHistory().length, 1);

  // Compatibilidade com chave legada sem prefixo ("777")
  global.localStorage.setItem('playinfinity_playback_history', JSON.stringify({
    '777': {
      id: 777,
      title: 'Legado Série',
      type: 'series',
      season: 1,
      episode: 3,
      currentTime: 400,
      duration: 2400,
      progressPercent: 17,
      updatedAt: Date.now()
    }
  }));

  const legacy = historyApi.getItemPlayback(777, 'series');
  assert.equal(legacy?.title, 'Legado Série');
  assert.equal(historyApi.getItemPlayback(777, 'movie'), null, 'Chave legada de série não deve casar consulta de filme');

  historyApi.removePlaybackItem(777, 'series');
  assert.equal(historyApi.getItemPlayback(777, 'series'), null);
  assert.equal(historyApi.getPlaybackHistory().length, 0);
});

test('playbackHistory usa cache O(1) em leituras consecutivas', () => {
  historyApi.savePlaybackProgress({
    id: 101,
    title: 'Teste Cache',
    type: 'movie',
    currentTime: 300,
    duration: 3600,
  });

  const originalParse = JSON.parse;
  let parseCount = 0;
  JSON.parse = (...args) => {
    parseCount++;
    return originalParse(...args);
  };

  try {
    for (let i = 0; i < 40; i++) {
      assert.equal(historyApi.getItemPlayback(101, 'movie')?.currentTime, 300);
    }
    assert.equal(parseCount, 0, 'Leituras repetidas do histórico não devem refazer JSON.parse');
  } finally {
    JSON.parse = originalParse;
  }
});

test('guards estruturais de performance, memoização e anti-leak nas telas principais', () => {
  const root = path.resolve(__dirname, '..');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

  // ContentRow & ContinueWatchingRow
  const contentRow = read('src/components/ContentRow.tsx');
  assert.ok(contentRow.includes('dragCleanupRef'), 'ContentRow deve limpar listeners de drag no unmount');
  assert.ok(contentRow.includes('prev.onItemClick === next.onItemClick'), 'ContentRow/ContentCard devem comparar onItemClick no React.memo');
  assert.ok(contentRow.includes('prev.item.quality === next.item.quality'), 'ContentCard deve comparar item.quality no React.memo');
  assert.ok(contentRow.includes('prev.item.provider === next.item.provider'), 'ContentCard deve comparar item.provider no React.memo');

  const cwRow = read('src/components/ContinueWatchingRow.tsx');
  assert.ok(cwRow.includes('dragCleanupRef'), 'ContinueWatchingRow deve limpar listeners de drag no unmount');
  assert.ok(cwRow.includes('React.memo(ContinueWatchingRowInner)'), 'ContinueWatchingRow deve ser exportado com React.memo');

  // App.tsx & HomePage.tsx
  const appSrc = read('src/App.tsx');
  assert.ok(appSrc.includes('const viewStateRef = useRef(viewState);'), 'App.tsx deve manter viewStateRef para callbacks estáveis');
  assert.ok(appSrc.includes('const subscriptionStateRef = useRef('), 'App.tsx deve manter subscriptionStateRef para openPlayer estável');
  assert.ok(appSrc.includes('const navigateToDetails = useCallback('), 'navigateToDetails deve usar useCallback');
  assert.ok(appSrc.includes('const openPlayer = useCallback('), 'openPlayer deve usar useCallback');
  assert.ok(appSrc.includes('const handleProviderSelect = useCallback('), 'handleProviderSelect deve usar useCallback');

  const homeSrc = read('src/pages/HomePage.tsx');
  assert.ok(homeSrc.includes('const handleRemoveHistoryItem = React.useCallback('), 'HomePage handleRemoveHistoryItem deve usar useCallback');
  assert.ok(homeSrc.includes('iType === targetType'), 'HomePage deve filtrar histórico por chave composta (id + mediaType)');

  // NetflixPlayerSkin.tsx
  const skinSrc = read('src/components/NetflixPlayerSkin.tsx');
  assert.ok(skinSrc.includes('isSeekingTransitionRef'), 'NetflixPlayerSkin deve ler isSeekingTransition via ref no handleMessage');
  assert.ok(skinSrc.includes('controlsVisibleRef'), 'NetflixPlayerSkin deve ler controlsVisible via ref para throttle adaptativo');
  assert.ok(skinSrc.includes('hasActiveSubtitlesRef'), 'NetflixPlayerSkin deve ler estado de legendas via ref');
  assert.ok(skinSrc.includes('}, [sendCommand, isTrustedMessageOrigin]);'), 'Listener message do NetflixPlayerSkin não deve reiniciar em cada seek');
  assert.ok(skinSrc.includes('setIsSyncStale((prev) => (prev ? false : prev));'), 'setIsSyncStale deve evitar update redundante');
  assert.ok(skinSrc.includes('setAutoplayMutedBanner((prev) => (prev ? false : prev));'), 'setAutoplayMutedBanner deve evitar update redundante');
  assert.match(skinSrc, /if \(isUnchanged\) \{\r?\n\s+return prev;/, 'setPlayerStatus deve retornar prev quando nada relevante mudou');

  // LiveTvPage.tsx
  const liveTvSrc = read('src/components/LiveTvPage.tsx');
  assert.ok(liveTvSrc.includes('const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);'), 'LiveTvPage deve converter favoriteIds para Set O(1)');
  assert.ok(liveTvSrc.includes('const LiveChannelListItem = React.memo('), 'LiveTvPage deve memoizar item de lista');
  assert.ok(liveTvSrc.includes('const LiveChannelGridCard = React.memo('), 'LiveTvPage deve memoizar card de grade');
  assert.ok(liveTvSrc.includes('min-w-[44px] min-h-[44px]'), 'LiveTvPage deve manter alvos táteis >= 44x44px');

  // AdminPage.tsx
  const adminSrc = read('src/pages/AdminPage.tsx');
  assert.ok(adminSrc.includes('let unsubscribeAuth: (() => void) | null = null;'), 'AdminPage deve cancelar onAuthStateChanged no unmount');
  assert.ok(adminSrc.includes('migratedExpiredIdsRef'), 'AdminPage deve deduplicar updateDoc de expiração entre polls de 60s');
  assert.ok(adminSrc.includes('migratedFeeIdsRef'), 'AdminPage deve deduplicar updateDoc de mensalidade entre polls de 60s');
});
