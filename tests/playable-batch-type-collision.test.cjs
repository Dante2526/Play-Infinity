const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('encontreiLookup check-playable-batch isola verificação de filme e série com mesmo TMDB ID', () => {
  const content = fs.readFileSync(path.join(__dirname, '../server/routes/encontreiLookup.ts'), 'utf-8');

  // 1. Deve declarar _playableProbeCache como Map<string, ...>
  assert.match(
    content,
    /const\s+_playableProbeCache\s*=\s*new\s+Map<string,\s*\{/,
    '_playableProbeCache deve usar chave string tipada'
  );

  // 2. Deve conter helper getProbeCacheKey
  assert.match(
    content,
    /function\s+getProbeCacheKey\s*\(id:\s*number,\s*type\?:\s*string\)/,
    'Deve implementar getProbeCacheKey'
  );

  // 3. Verificação de índice estático deve respeitar isExplicitMovie e isExplicitTv
  assert.match(
    content,
    /if\s*\(\s*isExplicitMovie\s*\)\s*\{[\s\S]*?if\s*\(\s*inMovieIndex\s*\)\s*\{[\s\S]*?playableMovieIds\.push\(id\);/m,
    'Item do tipo movie só pode alimentar playableMovieIds e checar inMovieIndex'
  );

  assert.match(
    content,
    /else\s+if\s*\(\s*isExplicitTv\s*\)\s*\{[\s\S]*?if\s*\(\s*inSeriesIndex\s*\)\s*\{[\s\S]*?playableSeriesIds\.push\(id\);/m,
    'Item do tipo tv/series só pode alimentar playableSeriesIds e checar inSeriesIndex'
  );

  // 4. Gravação do cache de probe deve usar a chave tipada
  assert.match(
    content,
    /_playableProbeCache\.set\(\s*cacheKey,\s*\{/,
    'Gravação do cache de probe deve usar cacheKey tipada'
  );
});

test('episodeAvailability checkPlayableBatch usa chave tipada e separa playableMovieIds de playableSeriesIds', () => {
  const content = fs.readFileSync(path.join(__dirname, '../src/services/episodeAvailability.ts'), 'utf-8');

  // 1. clientPlayableCache deve ser Map<string, boolean>
  assert.match(
    content,
    /const\s+clientPlayableCache\s*=\s*new\s+Map<string,\s*boolean>\(\);/,
    'clientPlayableCache deve usar chave string'
  );

  // 2. Helper getClientPlayableCacheKey deve existir
  assert.match(
    content,
    /function\s+getClientPlayableCacheKey\s*\(id:\s*number,\s*type\?:\s*string\)/,
    'Deve implementar getClientPlayableCacheKey'
  );

  // 3. Deve verificar movieSet e seriesSet de acordo com o tipo
  assert.match(
    content,
    /const\s+movieSet\s*=\s*new\s+Set<number>\(data\.playableMovieIds\s*\|\|\s*\[\]\);/,
    'Deve ler playableMovieIds da resposta'
  );
  assert.match(
    content,
    /const\s+seriesSet\s*=\s*new\s+Set<number>\(data\.playableSeriesIds\s*\|\|\s*\[\]\);/,
    'Deve ler playableSeriesIds da resposta'
  );
  assert.match(
    content,
    /if\s*\(\s*isMovie\s*\)\s*\{[\s\S]*?isPlayable\s*=\s*movieSet\.has\(item\.id\);[\s\S]*?\}\s*else\s+if\s*\(\s*isTv\s*\)\s*\{[\s\S]*?isPlayable\s*=\s*seriesSet\.has\(item\.id\);/m,
    'Deve testar pertinência contra o set do tipo correspondente'
  );
});
