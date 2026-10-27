const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('getCollection in src/services/tmdb.ts requests TMDB with ?language=pt-BR', () => {
  const tmdbCode = fs.readFileSync(path.join(__dirname, '../src/services/tmdb.ts'), 'utf8');
  assert.match(tmdbCode, /export const getCollection = async \(collectionId: number\)/);
  assert.match(tmdbCode, /\/collection\/\$\{collectionId\}\?language=pt-BR/);
});

test('VideoPlayerModal uses getCollection with pt-BR and gets translated movie details', () => {
  const modalCode = fs.readFileSync(path.join(__dirname, '../src/components/VideoPlayerModal.tsx'), 'utf8');
  // Must NOT contain hardcoded collection URL without language
  assert.ok(!modalCode.includes('/api/tmdb/collection/${colId}`'), 'Must not have unlocalized collection fetch');
  // Must use getCollection(colId)
  assert.match(modalCode, /getCollection\(colId\)/);
  // Must call getDetails for nextPart.id to ensure PT-BR title and overview
  assert.match(modalCode, /getDetails\(nextPart\.id,\s*'movie'\)/);
  // Must pass imdb_id to onPlayMovie
  assert.match(modalCode, /movie\.imdb_id/);
});

test('NetflixPlayerSkin NextMovieInfo interface supports imdb_id and retains PT-BR sagaTitle', () => {
  const skinCode = fs.readFileSync(path.join(__dirname, '../src/components/NetflixPlayerSkin.tsx'), 'utf8');
  assert.match(skinCode, /export interface NextMovieInfo/);
  assert.match(skinCode, /imdb_id\?: string;/);
  assert.match(skinCode, /nextMovieInfo\?\.title/);
});
