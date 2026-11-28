const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');

async function loadBundledTs(relPath, plugins = []) {
  const fullPath = path.join(ROOT, relPath);
  const out = await esbuild.build({
    entryPoints: [fullPath],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    write: false,
    plugins,
  });
  const virtualName = path.join(ROOT, 'tests', `virtual-${path.basename(relPath, '.ts')}.cjs`);
  const m = new Module(virtualName, module);
  m.filename = virtualName;
  m.paths = module.paths;
  m._compile(out.outputFiles[0].text, virtualName);
  return m.exports;
}

test('TMDB backdrop responsivo escolhe w780 no mobile e w1280 no desktop (nunca original 4K)', async () => {
  const tmdbSrc = fs.readFileSync(path.join(ROOT, 'src/services/tmdb.ts'), 'utf8');
  assert.match(tmdbSrc, /export const getResponsiveBackdropSize/);
  assert.match(tmdbSrc, /export const formatResponsiveBackdropUrl/);
  assert.match(tmdbSrc, /export const buildBackdropSrcSet/);
  assert.match(tmdbSrc, /append_to_response=videos,recommendations/);

  const {
    getResponsiveBackdropSize,
    formatResponsiveBackdropUrl,
    buildBackdropSrcSet,
    rankAndFormatTrailerVideos,
  } = await loadBundledTs('src/services/tmdb.ts', [{
    name: 'stub',
    setup(build) {
      build.onResolve({ filter: /(?:\.\.\/data|\.\.\/utils\/apiBaseUrl|\.\.\/utils\/mediaUtils)$/ }, (args) => ({
        path: args.path,
        namespace: 'stub',
      }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: 'export const UNAVAILABLE_SEASONS={}; export const getApiBaseUrl=()=>""; export const titleSimilarity=()=>0;',
      }));
    },
  }]);

  assert.equal(getResponsiveBackdropSize(390), 'w780');
  assert.equal(getResponsiveBackdropSize(767), 'w780');
  assert.equal(getResponsiveBackdropSize(1024), 'w1280');
  assert.equal(formatResponsiveBackdropUrl('/abc.jpg', 412), 'https://image.tmdb.org/t/p/w780/abc.jpg');
  assert.equal(formatResponsiveBackdropUrl('/abc.jpg', 1440), 'https://image.tmdb.org/t/p/w1280/abc.jpg');
  assert.equal(
    buildBackdropSrcSet('/abc.jpg'),
    'https://image.tmdb.org/t/p/w780/abc.jpg 780w, https://image.tmdb.org/t/p/w1280/abc.jpg 1280w'
  );
  assert.equal(
    buildBackdropSrcSet('https://image.tmdb.org/t/p/w780/abc.jpg'),
    'https://image.tmdb.org/t/p/w780/abc.jpg 780w, https://image.tmdb.org/t/p/w1280/abc.jpg 1280w'
  );

  const ranked = rankAndFormatTrailerVideos([
    { id: '1', key: 'en12345', site: 'YouTube', type: 'Trailer', name: 'Official Trailer', iso_639_1: 'en', official: true },
    { id: '2', key: 'pt12345', site: 'YouTube', type: 'Trailer', name: 'Trailer Oficial Dublado', iso_639_1: 'pt', official: true },
  ]);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].key, 'pt12345');
  assert.equal(ranked[0].isDubbed, true);
});

test('Levenshtein otimizado com Int32Array preserva distância exata e respeita early-exit maxDist', async () => {
  const mod = await loadBundledTs('server/services/saimoSqliteStore.ts');
  assert.equal(typeof mod.levenshtein, 'function');
  assert.equal(mod.levenshtein('matrix', 'matrix', 1), 0);
  assert.equal(mod.levenshtein('matrix', 'matrx', 1), 1);
  assert.equal(mod.levenshtein('matrix', 'matris', 1), 1);
  assert.equal(mod.levenshtein('matrix', 'avatar', 1) > 1, true);
  assert.equal(mod.levenshtein('interstellar', 'interstelar', 1), 1);
  // String maior que o buffer inicial de 64 chars (testa resize automático)
  const longA = 'a'.repeat(80);
  const longB = 'a'.repeat(79) + 'b';
  assert.equal(mod.levenshtein(longA, longB, 1), 1);
});

test('Guardas estruturais: preconnect, Hero <img> LCP, lazy modals, throttle 5s e limpeza de .db no Vite', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(indexHtml, /rel="preconnect"\s+href="https:\/\/image\.tmdb\.org"/);

  const homeSrc = fs.readFileSync(path.join(ROOT, 'src/pages/HomePage.tsx'), 'utf8');
  assert.equal(homeSrc.includes("formatImageUrl(item.backdrop_path, 'original')"), false);
  assert.match(homeSrc, /fetchPriority="high"/);
  assert.match(homeSrc, /checkLiveAvailabilityBatch/);
  assert.match(homeSrc, /requestIdleCallback/);

  const detailsSrc = fs.readFileSync(path.join(ROOT, 'src/pages/DetailsPage.tsx'), 'utf8');
  assert.equal(detailsSrc.includes("'original'"), false);
  assert.match(detailsSrc, /const CastModal = lazyWithRetry/);
  assert.match(detailsSrc, /const ReportBugModal = lazyWithRetry/);
  assert.match(detailsSrc, /rankAndFormatTrailerVideos/);

  const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /const AuthModal = lazyWithRetry/);
  assert.match(appSrc, /const PaywallModal = lazyWithRetry/);
  assert.match(appSrc, /const WhatsNewModal = lazyWithRetry/);

  const encontreiSrc = fs.readFileSync(path.join(ROOT, 'server/routes/encontreiLookup.ts'), 'utf8');
  assert.match(encontreiSrc, /CATALOG_STAT_CHECK_INTERVAL_MS = 5000/);

  const viteSrc = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
  assert.match(viteSrc, /excludePublicSqliteArtifacts/);
});
