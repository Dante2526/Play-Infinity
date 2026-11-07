const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('VideoPlayerModal guarda: srv_anidigital só é injetado se isAnimeMedia for true', () => {
  const modalCode = fs.readFileSync(path.join(__dirname, '../src/components/VideoPlayerModal.tsx'), 'utf8');
  // Verifica se a guarda inclui isAnimeMedia
  assert.match(
    modalCode,
    /if\s*\(\s*anidigitalName\.length\s*>=\s*2\s*&&\s*isAnimeMedia\s*\)/,
    'srv_anidigital DEVE ser condicionado estritamente a isAnimeMedia'
  );
});

test('Favorites blindagem: ID 1101412 e filmes nunca buscam episódios de TV no cronograma', () => {
  const favCode = fs.readFileSync(path.join(__dirname, '../src/services/favorites.ts'), 'utf8');
  // Verifica se 1101412 é explicitamente ignorado na busca de cronograma de séries
  assert.match(
    favCode,
    /if\s*\(\s*id\s*===\s*1101412/,
    'fetchDynamicScheduleForFavorites DEVE ignorar 1101412 antes de chamar getDetails tv'
  );
  // Verifica se dynamicMeta com type movie é ignorado
  assert.match(
    favCode,
    /if\s*\(\s*dynamicMeta\s*&&\s*dynamicMeta\.type\s*===\s*['"]movie['"]\s*\)\s*return/,
    'Itens favoritados conhecidos como filme devem retornar antes de consultar TV'
  );
});

test('TMDB Service: lookupDetails utiliza silent: true para não poluir console com 404 durante cross-type lookup', () => {
  const tmdbCode = fs.readFileSync(path.join(__dirname, '../src/services/tmdb.ts'), 'utf8');
  assert.match(
    tmdbCode,
    /fetchTmdbRaw<TMDBDetails>\(`\$\{BASE_URL\}\/\$\{type\}\/\$\{id\}\?language=pt-BR`,\s*\{\s*silent:\s*true\s*\}\)/,
    'lookupDetails inicial DEVE usar { silent: true }'
  );
  assert.match(
    tmdbCode,
    /fetchTmdbRaw<TMDBDetails>\(`\$\{BASE_URL\}\/\$\{other\}\/\$\{id\}\?language=pt-BR`,\s*\{\s*silent:\s*true\s*\}\)/,
    'lookupDetails alternativo DEVE usar { silent: true }'
  );
});
