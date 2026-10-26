/**
 * Testes de integração da rota /api/admin/server-blocks
 * Contexto: frontend ServerBlocksAdmin.tsx oferece srv_byse desde a homologação
 * do BYSE HD, mas o backend rejeitava com 400 (whitelist sem "srv_byse").
 * Fix: "srv_byse" adicionado ao VALID_SERVER_KEYS (server/routes/serverBlocks.ts).
 *
 * Estratégia: mesma dos testes byse-routes — empacota a rota com esbuild
 * (middlewares de auth Firebase mockados), sobe em express com token bypass
 * "system-seed" (permitido fora de produção) e valida HTTP de verdade.
 * O cwd é trocado pra um diretório temporário ANTES do import para que
 * data/server-blocks.json de teste não toque os dados reais do repo.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), Module = require('node:module');
const fs = require('node:fs'), os = require('node:os');
const esbuild = require('esbuild'), express = require('express');

let server, base, api, tmpDir;
const nativeFetch = global.fetch;

before(async () => {
  // cwd temporário: BLOCKS_FILE = process.cwd()/data/server-blocks.json fica isolado
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-blocks-test-'));
  process.chdir(tmpDir);

  const root = path.resolve(__dirname, '..');
  const out = await esbuild.build({
    stdin: {
      // Named re-export: com format=cjs o default viraria .default e não module.exports
      contents: "export { default as serverBlocksRouter } from './server/routes/serverBlocks';",
      loader: 'ts',
      resolveDir: root
    },
    bundle: true,
    platform: 'node',
    packages: 'external',
    format: 'cjs',
    write: false,
    plugins: [{
      name: 'auth-fixture',
      setup(b) {
        // Middlewares de Firebase nunca são chamados (bypass system-seed),
        // mas precisam resolver no bundle
        b.onResolve({ filter: /requireAdminAuth$|firebaseAdmin$/ }, a => ({
          path: a.path, namespace: 'auth-fixture'
        }));
        b.onLoad({ filter: /.*/, namespace: 'auth-fixture' }, () => ({
          contents: 'export const verifyFirebaseUserToken = async () => null; export const getAdminDb = () => null;'
        }));
      }
    }]
  });

  const virtualPath = path.join(root, 'tests/virtual-server-blocks.cjs');
  const m = new Module(virtualPath, module);
  m.filename = virtualPath;
  m.paths = module.paths;
  m._compile(out.outputFiles[0].text, virtualPath);
  api = m.exports.serverBlocksRouter;

  const app = express();
  app.use(express.json());
  app.use(api);
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  if (server.closeAllConnections) server.closeAllConnections();
  await new Promise(r => server.close(r));
});

const post = (body) => nativeFetch(base + '/api/admin/server-blocks', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-token': 'system-seed' },
  body: JSON.stringify(body)
});

test('POST de bloqueio de srv_byse é aceito (regressão: antes HTTP 400)', async () => {
  const res = await post({ tmdbId: 987654, serverKey: 'srv_byse', contentType: 'movie', title: 'Filme Teste BYSE', reason: 'fonte quebrada' });
  assert.equal(res.status, 200, 'POST com srv_byse deve ser aceito, não rejeitado');
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.block.serverKey, 'srv_byse');
  assert.equal(data.block.id, '987654_srv_byse');
});

test('serverKey desconhecido continua rejeitado com 400', async () => {
  const res = await post({ tmdbId: 987654, serverKey: 'srv_inexistente' });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /serverKey inválido/);
});

test('GET ?tmdb_id= informa srv_byse como bloqueado (contrato com o VideoPlayerModal)', async () => {
  const res = await nativeFetch(base + '/api/server-blocks?tmdb_id=987654');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.blockedServerKeys.includes('srv_byse'), 'srv_byse deve constar nos bloqueios do título');
});

test('bloqueio persiste em data/server-blocks.json do ambiente isolado', async () => {
  const file = path.join(tmpDir, 'data', 'server-blocks.json');
  assert.ok(fs.existsSync(file), 'arquivo de persistência deve existir');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(raw) && raw.some(b => b.serverKey === 'srv_byse'));
});

test('DELETE remove o bloqueio de srv_byse e o GET passa a não listá-lo', async () => {
  const res = await nativeFetch(base + '/api/admin/server-blocks/987654_srv_byse', {
    method: 'DELETE',
    headers: { 'x-admin-token': 'system-seed' }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.removed.serverKey, 'srv_byse');

  const list = await (await nativeFetch(base + '/api/server-blocks?tmdb_id=987654')).json();
  assert.deepEqual(list.blockedServerKeys, []);
});

test('sem token admin o POST é rejeitado com 401', async () => {
  const res = await nativeFetch(base + '/api/admin/server-blocks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tmdbId: 1, serverKey: 'srv_byse' })
  });
  assert.equal(res.status, 401);
});
