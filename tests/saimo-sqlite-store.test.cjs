/**
 * Testes automatizados do Adaptador SQLite Saimo TV VOD (saimoSqliteStore.ts).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

async function compileStore() {
  const output = await esbuild.build({
    stdin: {
      contents: `
        export { openSaimoSqlite, findSaimoDb, isSaimoSqliteAvailable, getSaimoStore } from './server/services/saimoSqliteStore';
        export { saimoRouter } from './server/routes/saimoRoutes';
        export { getPlaybackCataloguePresence } from './server/routes/encontreiLookup';
      `,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    write: false,
  });
  const filename = path.join(root, 'tests/virtual-saimo-store.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

test('saimoSqliteStore: node:sqlite está disponível no ambiente', async () => {
  const storeMod = await compileStore();
  assert.equal(storeMod.isSaimoSqliteAvailable(), true, 'node:sqlite com DatabaseSync deve estar disponível');
});

test('saimoSqliteStore: localiza e abre saimo-catalog.db em modo read-only', async () => {
  const storeMod = await compileStore();
  const dbPath = storeMod.findSaimoDb();
  assert.ok(dbPath, 'deve encontrar o banco saimo-catalog.db');
  assert.ok(fs.existsSync(dbPath), 'o arquivo .db deve existir fisicamente');

  const store = storeMod.openSaimoSqlite(dbPath);
  assert.ok(store, 'loja Saimo SQLite deve ser instanciada com sucesso');
  assert.equal(store.meta('schema_version'), '1', 'schema_version deve ser 1');
  assert.equal(store.meta('source'), 'saimo-vod', 'source deve ser saimo-vod');
});

test('saimoSqliteStore: consulta filme por TMDB ID com sucesso em O(1)', async () => {
  const storeMod = await compileStore();
  const store = storeMod.getSaimoStore();
  assert.ok(store, 'loja deve estar aberta');

  // Consulta filme (ex: TMDB 978592 - A Teia ou outro existente no banco)
  // Verifica se a tabela de filmes contém dezenas de milhares de registros
  assert.ok(store.movieIndex.size > 20000, `deve ter > 20.000 filmes (tem ${store.movieIndex.size})`);
  
  const movie = store.findMovie(978592);
  if (movie) {
    assert.equal(movie.id, 978592);
    assert.ok(movie.servers, 'deve ter servidores dub/leg');
    assert.ok(Array.isArray(movie.servers.saimo_dub) || Array.isArray(movie.servers.saimo_leg));
  }
});

test('saimoSqliteStore: consulta episódio de série por TMDB ID, temporada e episódio', async () => {
  const storeMod = await compileStore();
  const store = storeMod.getSaimoStore();
  assert.ok(store, 'loja deve estar aberta');

  assert.ok(store.episodeIndex.size > 100000, `deve ter centenas de milhares de episódios (tem ${store.episodeIndex.size})`);
  
  // Consulta episódio da série "A Academia" TMDB 250713 S01E01
  const ep = store.findEpisode(250713, 1, 1);
  if (ep) {
    assert.equal(ep.tmdb_id, 250713);
    assert.equal(ep.season, 1);
    assert.equal(ep.episode, 1);
    assert.ok(ep.servers, 'deve ter servidores dub/leg');
  }
});

test('saimoRouter: exporta o router Express com rotas de lookup e stream', async () => {
  const storeMod = await compileStore();
  assert.ok(storeMod.saimoRouter, 'deve exportar saimoRouter');
  assert.equal(typeof storeMod.saimoRouter, 'function', 'deve ser um middleware/router Express');
});

test('getPlaybackCataloguePresence: inclui srv_saimo com prioridade dublado para itens existentes', async () => {
  const storeMod = await compileStore();
  // Filme existente (ex: 978592)
  const hints = storeMod.getPlaybackCataloguePresence(978592);
  assert.ok(hints.srv_saimo, 'deve conter srv_saimo no mapa de presença');
  assert.equal(hints.srv_saimo.listed, true, 'deve estar listed=true');
  assert.equal(hints.srv_saimo.audioPriority, 0, 'áudio dublado deve ter prioridade 0');

  // Item inexistente
  const hintsGhost = storeMod.getPlaybackCataloguePresence(999999999);
  assert.equal(hintsGhost.srv_saimo, undefined, 'item inexistente não deve constar como listed');
});
