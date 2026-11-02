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
// O catálogo SQLite (102MB) é artefato gerado por scripts/build_saimo_sqlite.py
// (baixa do upstream Saimo, ~15s com rede). Sem o arquivo, os testes que o
// exigem pulam com instrução — em vez de falhar a suíte em fresh clone/sandbox.
const SAIMO_DB_PATH = path.join(root, 'data', 'saimo-catalog.db');
const SAIMO_DB_SKIP = !fs.existsSync(SAIMO_DB_PATH)
  ? 'data/saimo-catalog.db ausente — gere com: python3 scripts/build_saimo_sqlite.py (requer rede p/ filmes-saimo.pages.dev)'
  : false;
const dbTest = (name, fn) => test(name, SAIMO_DB_SKIP ? { skip: SAIMO_DB_SKIP } : undefined, fn);

async function compileStore() {
  const output = await esbuild.build({
    stdin: {
      contents: `
        export { openSaimoSqlite, findSaimoDb, isSaimoSqliteAvailable, getSaimoStore } from './server/services/saimoSqliteStore';
        export { saimoRouter } from './server/routes/saimoRoutes';
        export { getPlaybackCataloguePresence } from './server/routes/encontreiLookup';
        export { isExternalIframePlayer } from './src/utils/playerIntegration';
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

dbTest('saimoSqliteStore: localiza e abre saimo-catalog.db em modo read-only', async () => {
  const storeMod = await compileStore();
  const dbPath = storeMod.findSaimoDb();
  assert.ok(dbPath, 'deve encontrar o banco saimo-catalog.db');
  assert.ok(fs.existsSync(dbPath), 'o arquivo .db deve existir fisicamente');

  const store = storeMod.openSaimoSqlite(dbPath);
  assert.ok(store, 'loja Saimo SQLite deve ser instanciada com sucesso');
  assert.equal(store.meta('schema_version'), '1', 'schema_version deve ser 1');
  assert.equal(store.meta('source'), 'saimo-vod', 'source deve ser saimo-vod');
});

dbTest('saimoSqliteStore: consulta filme por TMDB ID com sucesso em O(1)', async () => {
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

dbTest('saimoSqliteStore: consulta episódio de série por TMDB ID, temporada e episódio', async () => {
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

dbTest('getPlaybackCataloguePresence: inclui srv_saimo com prioridade dublado para itens existentes', async () => {
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

test('isExternalIframePlayer: reconhece saimo-proxy-iframe como player integrado', async () => {
  const storeMod = await compileStore();
  const isExternal1 = storeMod.isExternalIframePlayer('/api/saimo-proxy-iframe?id=299939&type=tv&s=1&e=2');
  assert.equal(isExternal1, false, '/api/saimo-proxy-iframe deve ser integrado (não externo)');

  const isExternal2 = storeMod.isExternalIframePlayer('/api/saimo-stream?id=299939&type=tv');
  assert.equal(isExternal2, false, '/api/saimo-stream deve ser integrado (não externo)');
});

dbTest('saimoRoutes: lida com fontes 404 (Monstro: A História de Lizzie Borden) sem travar', async () => {
  const storeMod = await compileStore();
  const store = storeMod.getSaimoStore();
  const ep2 = store.findEpisode(299939, 1, 2);
  assert.ok(ep2, 'Lizzie Borden S01E02 deve existir no catálogo Saimo');
  assert.ok(ep2.servers?.saimo_dub?.length > 0, 'deve ter URLs registradas');
});

test('saimoRoutes: trava anti-SSRF bloqueia hosts privados e locais no /api/saimo-hls-segment', async () => {
  const storeMod = await compileStore();
  const router = storeMod.saimoRouter;
  
  // Encontra o handler de /api/saimo-hls-segment
  const layer = router.stack.find(l => l.route && l.route.path === '/api/saimo-hls-segment');
  assert.ok(layer, 'rota /api/saimo-hls-segment deve estar registrada no router');

  const handler = layer.route.stack[0].handle;

  // Teste 1: host privado 127.0.0.1
  let status1 = null;
  let body1 = null;
  const req1 = {
    query: { url: 'http://127.0.0.1:8080/secret' },
    once: () => {},
  };
  const res1 = {
    status: (s) => { status1 = s; return res1; },
    send: (b) => { body1 = b; },
  };
  await handler(req1, res1);
  assert.equal(status1, 403, 'deve retornar 403 para IP privado/local');

  // Teste 2: host desativado no Saimo (ex: 146.0.32.89)
  let status2 = null;
  let body2 = null;
  const req2 = {
    query: { url: 'http://146.0.32.89/playlist.m3u8' },
    once: () => {},
  };
  const res2 = {
    status: (s) => { status2 = s; return res2; },
    send: (b) => { body2 = b; },
  };
  await handler(req2, res2);
  assert.equal(status2, 403, 'deve retornar 403 para host desativado no Saimo');
});

