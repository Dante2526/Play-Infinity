const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const nativeFetch = global.fetch;

let tmdbApi;
let lgbtUtils;
let dataMod;
let favoritesMod;
let storage;

async function compileTs(entryRelPath, plugins = []) {
  const output = await esbuild.build({
    entryPoints: [path.join(root, entryRelPath)],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    write: false,
    define: {
      'import.meta.env.VITE_PROXY_URL': '""',
    },
    plugins,
  });
  const filename = path.join(root, `tests/virtual-${path.basename(entryRelPath)}.cjs`);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

beforeEach(async () => {
  storage = new Map();
  global.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  };

  tmdbApi = await compileTs('src/services/tmdb.ts');
  lgbtUtils = await compileTs('src/utils/lgbtUtils.ts');
  tmdbApi.resetLgbtKeywordCacheForTests();
});

afterEach(() => {
  global.fetch = nativeFetch;
  delete global.localStorage;
});

test('resolveLgbtKeywordIds resolves dynamic TMDB keywords via allowlist, includes seed 1862 and ignores unrelated terms', async () => {
  const keywordQueries = [];
  global.fetch = async (rawUrl) => {
    const url = new URL(rawUrl, 'http://localhost');
    assert.equal(url.pathname, '/api/tmdb/search/keyword');
    const q = url.searchParams.get('query');
    keywordQueries.push(q);

    if (q === 'lgbt') {
      return Response.json({
        results: [
          { id: 158718, name: 'lgbt' },
          { id: 999999, name: 'lgbt history museum unrelated' },
        ],
      });
    }
    if (q === 'gay') {
      return Response.json({
        results: [
          { id: 10180, name: 'gay' },
          { id: 555555, name: 'enola gay' },
          { id: 666666, name: 'gaylord' },
        ],
      });
    }
    if (q === 'lesbian') {
      return Response.json({
        results: [{ id: 9833, name: 'lesbian relationship' }],
      });
    }
    if (q === 'coming out') {
      return Response.json({
        results: [{ id: 1862, name: 'coming out' }],
      });
    }
    return Response.json({ results: [] });
  };

  const [ids1, ids2] = await Promise.all([
    tmdbApi.resolveLgbtKeywordIds(),
    tmdbApi.resolveLgbtKeywordIds(),
  ]);

  assert.equal(keywordQueries.length, 8, 'chamadas concorrentes devem compartilhar uma única consulta por termo');
  assert.deepEqual(ids1, ids2);
  assert.ok(ids1.includes(1862), 'deve conter a seed verificada 1862 ("coming out")');
  assert.ok(ids1.includes(158718), 'deve incluir keyword allowlisted "lgbt"');
  assert.ok(ids1.includes(10180), 'deve incluir keyword allowlisted "gay"');
  assert.ok(ids1.includes(9833), 'deve incluir keyword allowlisted "lesbian relationship"');
  assert.ok(!ids1.includes(555555), 'não deve aceitar ruído "enola gay"');
  assert.ok(!ids1.includes(666666), 'não deve aceitar ruído "gaylord"');
  assert.ok(!ids1.includes(999999), 'não deve aceitar termos fora da allowlist');
  assert.ok(storage.has('play-infinity:tmdb-lgbt-keywords:v1'), 'deve cachear keywords dinâmicas no localStorage');
});

test('resolveLgbtKeywordIds cai com segurança para a seed verificada 1862 se /search/keyword falhar sem envenenar cache persistente', async () => {
  global.fetch = async () => new Response('Unavailable', { status: 503 });

  const ids = await tmdbApi.resolveLgbtKeywordIds();
  assert.deepEqual(ids, [1862]);
  assert.equal(storage.has('play-infinity:tmdb-lgbt-keywords:v1'), false);
});

test('getLgbtMovies e getLgbtSeries usam parâmetros PT-BR corretos e caem para vote_count.gte=1 se vazio', async () => {
  const calls = [];
  global.fetch = async (rawUrl) => {
    const url = new URL(rawUrl, 'http://localhost');
    calls.push(url);

    if (url.pathname === '/api/tmdb/search/keyword') {
      const q = url.searchParams.get('query');
      if (q === 'lgbt') return Response.json({ results: [{ id: 158718, name: 'lgbt' }] });
      return Response.json({ results: [] });
    }

    if (url.pathname === '/api/tmdb/discover/movie') {
      if (url.searchParams.get('vote_count.gte') === '5') {
        return Response.json({ page: 1, results: [], total_pages: 0, total_results: 0 });
      }
      return Response.json({
        page: 1,
        results: [{ id: 376867, title: 'Moonlight', poster_path: '/moonlight.jpg', backdrop_path: null, vote_average: 7.4, genre_ids: [18] }],
        total_pages: 1,
        total_results: 1,
      });
    }

    if (url.pathname === '/api/tmdb/discover/tv') {
      return Response.json({
        page: 2,
        results: [{ id: 124834, name: 'Heartstopper', poster_path: '/hs.jpg', backdrop_path: null, vote_average: 8.6, genre_ids: [18, 10749] }],
        total_pages: 2,
        total_results: 1,
      });
    }

    return new Response('Not found', { status: 404 });
  };

  const [moviesRes, seriesRes] = await Promise.all([
    tmdbApi.getLgbtMovies(1),
    tmdbApi.getLgbtSeries(2),
  ]);

  assert.equal(moviesRes.results.length, 1);
  assert.equal(moviesRes.results[0].id, 376867);
  assert.equal(seriesRes.results.length, 1);
  assert.equal(seriesRes.results[0].id, 124834);

  const movieCalls = calls.filter((u) => u.pathname === '/api/tmdb/discover/movie');
  assert.equal(movieCalls.length, 2, 'deve tentar vote_count.gte=5 e depois fallback vote_count.gte=1');
  assert.equal(movieCalls[0].searchParams.get('language'), 'pt-BR');
  assert.equal(movieCalls[0].searchParams.get('sort_by'), 'popularity.desc');
  assert.equal(movieCalls[0].searchParams.get('include_adult'), 'false');
  assert.equal(movieCalls[0].searchParams.get('with_keywords'), '1862|158718');
  assert.equal(movieCalls[1].searchParams.get('vote_count.gte'), '1');

  const tvCall = calls.find((u) => u.pathname === '/api/tmdb/discover/tv');
  assert.ok(tvCall);
  assert.equal(tvCall.searchParams.get('page'), '2');
  assert.equal(tvCall.searchParams.get('language'), 'pt-BR');
  assert.equal(tvCall.searchParams.get('with_keywords'), '1862|158718');
});

test('mapTmdbToLgbtCard valida hasTmdbArtwork, aplica formatPosterUrl (w500 vs w780) e gera playerUrl correto', () => {
  const noArt = lgbtUtils.mapTmdbToLgbtCard(
    { id: 10, title: 'Sem Capa', poster_path: '', backdrop_path: 'null', overview: '', vote_average: 7, genre_ids: [] },
    'movie'
  );
  assert.equal(noArt, null);

  const withPoster = lgbtUtils.mapTmdbToLgbtCard(
    { id: 258480, title: 'Carol', poster_path: '/carol.jpg', backdrop_path: '/carol-bg.jpg', overview: 'Sinopse', vote_average: 7.8, release_date: '2015-11-20', genre_ids: [18, 10749] },
    'movie'
  );
  assert.equal(withPoster.imageUrl, 'https://image.tmdb.org/t/p/w500/carol.jpg');
  assert.equal(withPoster.backdropUrl, 'https://image.tmdb.org/t/p/original/carol-bg.jpg');
  assert.equal(withPoster.playerUrl, 'https://v1.watchplay.shop/movie/258480');
  assert.equal(withPoster.type, 'movie');

  const backdropOnlySeries = lgbtUtils.mapTmdbToLgbtCard(
    { id: 124834, name: 'Heartstopper', poster_path: '', backdrop_path: '/hs-bg.jpg', overview: 'Sinopse', vote_average: 8.6, first_air_date: '2022-04-22', genre_ids: [18] },
    'tv'
  );
  assert.equal(backdropOnlySeries.imageUrl, 'https://image.tmdb.org/t/p/w780/hs-bg.jpg');
  assert.equal(backdropOnlySeries.playerUrl, 'https://v1.watchplay.shop/tvshow/124834/1/1');
  assert.equal(backdropOnlySeries.type, 'series');
});

test('buildDisplayedLgbtItems intercala filmes/séries, isola colisão de ID por ${type}:${id}, filtra indisponíveis e hidrata fallback', () => {
  const tmdbMovies = [
    { id: 500, tmdbId: 500, title: 'FILME 500', imageUrl: 'https://image.tmdb.org/t/p/w500/m500.jpg', type: 'movie', genres: [] },
    { id: 999, tmdbId: 999, title: 'INDISPONÍVEL', imageUrl: 'https://image.tmdb.org/t/p/w500/m999.jpg', type: 'movie', genres: [] },
    { id: 376867, tmdbId: 376867, title: 'MOONLIGHT', imageUrl: 'https://image.tmdb.org/t/p/w500/moon.jpg', type: 'movie', genres: [] },
  ];
  const tmdbSeries = [
    { id: 500, tmdbId: 500, title: 'SÉRIE 500', imageUrl: 'https://image.tmdb.org/t/p/w500/s500.jpg', type: 'series', genres: [] },
  ];
  const fallbackItems = [
    { id: 376867, tmdbId: 376867, title: 'MOONLIGHT DUPLICADO', imageUrl: 'https://image.tmdb.org/t/p/w342/old.jpg', type: 'movie', genres: [] },
    { id: 124834, tmdbId: 124834, title: 'HEARTSTOPPER', imageUrl: 'https://image.tmdb.org/t/p/w780/hs.jpg', type: 'series', genres: [] },
    { id: 258480, tmdbId: 258480, title: 'CAROL', imageUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=500&q=80', type: 'movie', genres: [] },
  ];

  const availableIds = new Set([500, 376867, 124834, 258480]);
  const itemsBeforeHydration = lgbtUtils.buildDisplayedLgbtItems({
    tmdbMovies,
    tmdbSeries,
    fallbackItems,
    isAvailable: (item) => availableIds.has(Number(item.tmdbId || item.id)),
  });

  // Ordem esperada: M(500), S(500), M(376867), Fallback com arte real S(124834).
  // M(999) filtrado; M(376867) duplicado do fallback ignorado; CAROL placeholder oculto até hidratar.
  assert.deepEqual(
    itemsBeforeHydration.map((i) => `${i.type}:${i.id}`),
    ['movie:500', 'series:500', 'movie:376867', 'series:124834']
  );

  // Após hidratação via getDetails, Heartstopper e Carol ganham pôster w500 e Carol entra na fila
  const itemsAfterHydration = lgbtUtils.buildDisplayedLgbtItems({
    tmdbMovies,
    tmdbSeries,
    fallbackItems,
    hydratedDetailsMap: {
      'series:124834': { id: 124834, overview: '', poster_path: '/hs-portrait.jpg', backdrop_path: '/hs-orig.jpg', vote_average: 8.6, genres: [] },
      'movie:258480': { id: 258480, overview: '', poster_path: '/carol-portrait.jpg', backdrop_path: '/carol-orig.jpg', vote_average: 7.8, genres: [] },
    },
    isAvailable: (item) => availableIds.has(Number(item.tmdbId || item.id)),
  });

  assert.deepEqual(
    itemsAfterHydration.map((i) => `${i.type}:${i.id}`),
    ['movie:500', 'series:500', 'movie:376867', 'series:124834', 'movie:258480']
  );
  const carol = itemsAfterHydration.find((i) => i.id === 258480);
  const hs = itemsAfterHydration.find((i) => i.id === 124834);
  assert.equal(hs.imageUrl, 'https://image.tmdb.org/t/p/w500/hs-portrait.jpg');
  assert.equal(carol.imageUrl, 'https://image.tmdb.org/t/p/w500/carol-portrait.jpg');
  assert.equal(carol.playerUrl, 'https://v1.watchplay.shop/movie/258480');
});

test('lgbtContent em src/data.ts tem apenas IDs disponíveis, dublados em PT-BR no encontrei-catalog.json, sem bans ou colisões, e registrados em favorites.ts', async () => {
  dataMod = await compileTs('src/data.ts');
  favoritesMod = await compileTs('src/services/favorites.ts', [
    {
      name: 'firebase-stub',
      setup(build) {
        build.onResolve({ filter: /^\.\/firebase$|^firebase\// }, (args) => ({
          path: args.path,
          namespace: 'firebase-stub',
        }));
        build.onLoad({ filter: /.*/, namespace: 'firebase-stub' }, () => ({
          contents: `
            export const db = {};
            export const auth = { currentUser: null };
            export const doc = () => ({});
            export const getDoc = async () => ({ exists: () => false });
            export const setDoc = async () => {};
          `,
        }));
      },
    },
  ]);

  const availSet = new Set(
    JSON.parse(fs.readFileSync(path.join(root, 'data/available-tmdb-ids.json'), 'utf8')).ids
  );
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/encontrei-catalog.json'), 'utf8'));
  const movieMap = new Map();
  for (const m of catalog.movies || []) {
    const id = Number(m.tmdb_id);
    if (!movieMap.has(id)) movieMap.set(id, []);
    movieMap.get(id).push(m);
  }
  const s1e1DubladoSet = new Set();
  for (const e of catalog.episodes || []) {
    if (Number(e.season) === 1 && Number(e.episode) === 1 && String(e.audio || '').toLowerCase().includes('dublado')) {
      s1e1DubladoSet.add(Number(e.tmdb_id));
    }
  }

  const items = dataMod.lgbtContent;
  assert.ok(Array.isArray(items) && items.length >= 20, 'lgbtContent deve ter curadoria robusta');

  const seenKeys = new Set();
  for (const item of items) {
    assert.ok(availSet.has(item.id), `ID ${item.id} (${item.title}) deve existir em available-tmdb-ids.json`);
    assert.notEqual(item.id, 196454, 'ID 196454 (Queen Charlotte) banido não deve aparecer');
    assert.notEqual(item.id, 138501, 'ID 138501 (colisão Dorama) não deve aparecer');

    const key = `${item.type}:${item.id}`;
    assert.ok(!seenKeys.has(key), `Chave duplicada em lgbtContent: ${key}`);
    seenKeys.add(key);

    if (item.type === 'movie') {
      assert.equal(item.playerUrl, `https://v1.watchplay.shop/movie/${item.id}`);
      const rows = movieMap.get(item.id) || [];
      assert.ok(
        rows.some((r) => String(r.audio || '').toLowerCase().includes('dublado')),
        `Filme ${item.id} (${item.title}) deve ter versão Dublado PT-BR no catálogo`
      );
    } else {
      assert.equal(item.type, 'series');
      assert.equal(item.playerUrl, `https://v1.watchplay.shop/tvshow/${item.id}/1/1`);
      assert.ok(
        s1e1DubladoSet.has(item.id),
        `Série ${item.id} (${item.title}) deve possuir S1E1 Dublado PT-BR no catálogo`
      );
    }
  }

  const allCatalog = favoritesMod.getAllCatalogItems();
  const catalogById = new Map(allCatalog.map((c) => [Number(c.id), c]));
  for (const item of items) {
    assert.ok(catalogById.has(item.id), `lgbtContent id ${item.id} (${item.title}) deve estar indexado em getAllCatalogItems()`);
  }
});

test('HomePage.tsx e ContentRow.tsx estão conectados corretamente para renderizar e atualizar a seção LGBT+', () => {
  const homeSrc = fs.readFileSync(path.join(root, 'src/pages/HomePage.tsx'), 'utf8');
  const rowSrc = fs.readFileSync(path.join(root, 'src/components/ContentRow.tsx'), 'utf8');

  assert.match(homeSrc, /<ContentRow\s+title="LGBT\+"\s+items=\{displayedLgbtItems\}\s+aspect="portait"\s+onItemClick=\{onItemClick\}\s*\/>/);
  assert.match(homeSrc, /getLgbtMovies\(/);
  assert.match(homeSrc, /getLgbtSeries\(/);

  const doramasPos = homeSrc.indexOf('title="Doramas"');
  const lgbtPos = homeSrc.indexOf('title="LGBT+"');
  assert.ok(doramasPos > 0 && lgbtPos > doramasPos, 'Seção LGBT+ deve aparecer após a seção Doramas na HomePage');

  assert.match(rowSrc, /prev\.item\.imageUrl\s*===\s*next\.item\.imageUrl/, 'ContentCard memo deve refletir atualização dinâmica de pôster hidratado');
});
