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
const { isEpisodeUpcoming, formatEpisodeAirDate, getLocalTodayDateString, computeNextEpisode } = m.exports;

test('funções existem em playerIntegration', () => {
  assert.equal(typeof isEpisodeUpcoming, 'function');
  assert.equal(typeof formatEpisodeAirDate, 'function');
  assert.equal(typeof getLocalTodayDateString, 'function');
});

test('getLocalTodayDateString formata corretamente em YYYY-MM-DD', () => {
  const d = new Date(2026, 10, 5); // 05 de novembro de 2026
  assert.equal(getLocalTodayDateString(d), '2026-11-05');
});

test('isEpisodeUpcoming: identifica episódio no futuro (ex: VisionQuest Ep 8 em 10/11/2026)', () => {
  const ref = new Date(2026, 10, 5); // Hoje: 05/11/2026
  assert.equal(isEpisodeUpcoming('2026-11-10', ref), true);
  assert.equal(isEpisodeUpcoming('2026-11-06', ref), true);
});

test('isEpisodeUpcoming: episódio de hoje ou do passado NÃO é upcoming', () => {
  const ref = new Date(2026, 10, 5); // Hoje: 05/11/2026
  assert.equal(isEpisodeUpcoming('2026-11-05', ref), false); // Hoje
  assert.equal(isEpisodeUpcoming('2026-11-04', ref), false); // Ontem
  assert.equal(isEpisodeUpcoming('2026-10-20', ref), false); // Mês passado
  assert.equal(isEpisodeUpcoming(null, ref), false);
  assert.equal(isEpisodeUpcoming(undefined, ref), false);
  assert.equal(isEpisodeUpcoming('', ref), false);
  assert.equal(isEpisodeUpcoming('data-invalida', ref), false);
});

test('formatEpisodeAirDate: formata para DD/MM limpo', () => {
  assert.equal(formatEpisodeAirDate('2026-11-10'), '10/11');
  assert.equal(formatEpisodeAirDate('2026-12-25'), '25/12');
  assert.equal(formatEpisodeAirDate('2026-01-01'), '01/01');
  assert.equal(formatEpisodeAirDate(null), null);
  assert.equal(formatEpisodeAirDate(''), null);
  assert.equal(formatEpisodeAirDate('invalido'), null);
});

test('computeNextEpisode: não avança para episódio inédito cujo air_date é futuro', () => {
  // Simulando Vision Quest: Episódios 1-7 já lançados, Episódio 8 lança em 2026-11-10 (futuro)
  const futureDate = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
  const episodesList = [
    { episode_number: 6, air_date: '2026-10-27' },
    { episode_number: 7, air_date: '2026-11-03' },
    { episode_number: 8, air_date: futureDate },
  ];

  // No episódio 7, o episódio 8 ainda não foi ao ar -> não deve ter próximo episódio
  const result = computeNextEpisode({
    isSeries: true,
    season: 1,
    episode: 7,
    availableSeasons: [1],
    episodesList,
  });

  assert.equal(result, null, 'Episódio futuro ainda não transmitido não deve ser sugerido no player');
});
