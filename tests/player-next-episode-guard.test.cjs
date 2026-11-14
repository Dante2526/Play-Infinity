const { test } = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const Module = require('node:module');
const path = require('node:path');

const compiled = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../src/utils/playerIntegration.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const m = new Module(__filename + '.fixture', module);
m._compile(compiled.outputFiles[0].text, __filename + '.fixture');
const { computeNextEpisode } = m.exports;

test('computeNextEpisode exists as a function in playerIntegration', () => {
  assert.equal(typeof computeNextEpisode, 'function');
});

test('cenário 1: último episódio de temporada única (8/8) NÃO tem próximo episódio', () => {
  const episodesList = Array.from({ length: 8 }, (_, i) => ({
    episode_number: i + 1,
    name: `Episódio ${i + 1}`,
  }));

  const result = computeNextEpisode({
    isSeries: true,
    season: 1,
    episode: 8,
    totalEpisodes: 8,
    availableSeasons: [1],
    episodesList,
  });

  assert.equal(result, null, 'No último episódio de temporada única, computeNextEpisode deve ser null');
});

test('cenário 2: episódio intermediário (4/8) avança para o episódio 5 na mesma temporada', () => {
  const episodesList = Array.from({ length: 8 }, (_, i) => ({
    episode_number: i + 1,
    name: `Episódio ${i + 1}`,
  }));

  const result = computeNextEpisode({
    isSeries: true,
    season: 1,
    episode: 4,
    totalEpisodes: 8,
    availableSeasons: [1],
    episodesList,
  });

  assert.ok(result !== null);
  assert.equal(result.episode_number, 5);
  assert.equal(result.seasonNumber, 1);
  assert.equal(result.isNextSeason, false);
});

test('cenário 3: último episódio da temporada 1 avança para T2:E1 se a temporada 2 existir', () => {
  const episodesList = Array.from({ length: 8 }, (_, i) => ({
    episode_number: i + 1,
    name: `Episódio ${i + 1}`,
  }));

  const result = computeNextEpisode({
    isSeries: true,
    season: 1,
    episode: 8,
    totalEpisodes: 8,
    availableSeasons: [1, 2],
    episodesList,
  });

  assert.ok(result !== null);
  assert.equal(result.episode_number, 1);
  assert.equal(result.seasonNumber, 2);
  assert.equal(result.isNextSeason, true);
});

test('cenário 4: último episódio da última temporada (T2:E8) NÃO avança para temporada 3 inexistente', () => {
  const episodesList = Array.from({ length: 8 }, (_, i) => ({
    episode_number: i + 1,
    name: `Episódio ${i + 1}`,
  }));

  const result = computeNextEpisode({
    isSeries: true,
    season: 2,
    episode: 8,
    totalEpisodes: 8,
    availableSeasons: [1, 2],
    episodesList,
  });

  assert.equal(result, null, 'No último episódio da última temporada, computeNextEpisode deve ser null');
});

test('cenário 5: quando não é série (filmes), computeNextEpisode retorna null', () => {
  const result = computeNextEpisode({
    isSeries: false,
    season: 1,
    episode: 1,
    totalEpisodes: 1,
  });

  assert.equal(result, null);
});

test('cenário 6: transição de fim de temporada (ex: Você S1E10 -> S2E1) via voz, botão e handleEpisodeChange', () => {
  const fs = require('node:fs');
  const skinSrc = fs.readFileSync(path.join(__dirname, '../src/components/NetflixPlayerSkin.tsx'), 'utf8');
  const modalSrc = fs.readFileSync(path.join(__dirname, '../src/components/VideoPlayerModal.tsx'), 'utf8');

  // 1. Comando de voz NEXT_EPISODE deve delegar para handlePlayNextRef (que respeita nextEpisode.isNextSeason)
  assert.match(skinSrc, /case 'NEXT_EPISODE':[\s\S]*?handlePlayNextRef\.current\(\)/);

  // 2. handlePlayNext em mudança de temporada chama apenas onSeasonChange(nextEpisode.seasonNumber)
  assert.match(skinSrc, /if \(nextEpisode\?\.isNextSeason && onSeasonChange\)\s*\{\s*onSeasonChange\(nextEpisode\.seasonNumber\);\s*\}/);

  // 3. VideoPlayerModal redireciona automaticamente newEpisode > totalSeasonEpisodes para handleSeasonChange(nextSeason)
  assert.match(modalSrc, /newEpisode > totalSeasonEpisodes &&[\s\S]*?return handleSeasonChange\(nextSeason\)/);
});
