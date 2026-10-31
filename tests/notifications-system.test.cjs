const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

/**
 * Compila um módulo server (TS) para CJS em memória — mesmo padrão do
 * vizer.test.cjs. Serviços testados aqui expõem apenas funções PURAS
 * (sem disco/rede/Firestore) para validar a lógica de negócio:
 *  - dunningWatcher: quem é inadimplente + mensagem de saudação
 *  - newReleasesWatcher: diff de lançamentos + montagem da mensagem de push
 */
async function compileService(relPath) {
  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    stdin: { contents: `export * from './${relPath}';`, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  const filename = path.join(root, `tests/virtual-${path.basename(relPath, '.ts')}.cjs`);
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

test('isDelinquentUser: assinatura ativa dentro da validade nao e inadimplente', async () => {
  const dunning = await compileService('server/services/dunningWatcher');
  const now = Date.now();
  const futuro = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(dunning.isDelinquentUser({ subscription: 'ACTIVE', assinatura: 'ATIVA', dataExpiracao: futuro }, now), false);
});

test('isDelinquentUser: ex-assinante vencido E inadimplente', async () => {
  const dunning = await compileService('server/services/dunningWatcher');
  const now = Date.now();
  const passado = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(dunning.isDelinquentUser({ assinatura: 'INATIVA', dataExpiracao: passado }, now), true);
  assert.equal(dunning.isDelinquentUser({ assinatura: 'EXPIRADA', dataExpiracao: passado }, now), true);
  // ATIVA mas com data vencida (cliente nao renovou) tambem conta
  assert.equal(dunning.isDelinquentUser({ assinatura: 'ATIVA', dataExpiracao: passado }, now), true);
});

test('isDelinquentUser: vitalicio nunca e inadimplente (mesmo com status vencido)', async () => {
  const dunning = await compileService('server/services/dunningWatcher');
  const now = Date.now();
  const passado = new Date(now - 300 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(dunning.isDelinquentUser({ tipoAcesso: 'vitalicio', assinatura: 'INATIVA', dataExpiracao: passado }, now), false);
  assert.equal(dunning.isDelinquentUser({ accessType: 'vitalicio', dataExpiracao: passado }, now), false);
});

test('isDelinquentUser: quem nunca assinou (trial/free) nao recebe cobranca', async () => {
  const dunning = await compileService('server/services/dunningWatcher');
  const now = Date.now();
  assert.equal(dunning.isDelinquentUser({ trialUntil: now + 1000 }, now), false);
  assert.equal(dunning.isDelinquentUser({}, now), false);
  assert.equal(dunning.isDelinquentUser(null, now), false);
});

test('isDelinquentUser: assinatura INATIVA sem data de expiracao (cancelado) e inadimplente', async () => {
  const dunning = await compileService('server/services/dunningWatcher');
  assert.equal(dunning.isDelinquentUser({ assinatura: 'INATIVA' }, Date.now()), true);
});

test('buildDunningMessage: personaliza com primeiro nome', async () => {
  const dunning = await compileService('server/services/dunningWatcher');
  const comNome = dunning.buildDunningMessage('Naylan');
  assert.match(comNome.title, /Sentimos sua falta, Naylan!/);
  assert.match(comNome.body, /reativar/i);
  const semNome = dunning.buildDunningMessage(null);
  assert.match(semNome.title, /Sentimos sua falta!/);
});

test('buildReleaseMessage: um filme com titulo gera push especifico', async () => {
  const releases = await compileService('server/services/newReleasesWatcher');
  const msg = releases.buildReleaseMessage([{ kind: 'movie', title: 'Devoradores de Estrelas' }], []);
  assert.equal(msg.title, '🎬 Novo filme: Devoradores de Estrelas');
  assert.match(msg.body, /Devoradores de Estrelas/);
});

test('buildReleaseMessage: uma serie com titulo gera push especifico', async () => {
  const releases = await compileService('server/services/newReleasesWatcher');
  const msg = releases.buildReleaseMessage([], [{ kind: 'series', title: 'Lupin' }]);
  assert.equal(msg.title, '📺 Nova série: Lupin');
  assert.match(msg.body, /Lupin/);
});

test('buildReleaseMessage: varios lancamentos viram resumo citando ate 2 titulos', async () => {
  const releases = await compileService('server/services/newReleasesWatcher');
  const msg = releases.buildReleaseMessage(
    [{ kind: 'movie', title: 'Filme A' }, { kind: 'movie', title: null }, { kind: 'movie', title: null }],
    [{ kind: 'series', title: 'Série B' }]
  );
  assert.match(msg.title, /3 filmes e 1 série novas no catálogo!/);
  assert.match(msg.body, /Filme A, Série B/);
  assert.match(msg.body, /e mais 2 novidades/);
});

test('buildReleaseMessage: sem lancamentos retorna null', async () => {
  const releases = await compileService('server/services/newReleasesWatcher');
  assert.equal(releases.buildReleaseMessage([], []), null);
});

test('diffReleases: apenas IDs novos contam como lancamento', async () => {
  const releases = await compileService('server/services/newReleasesWatcher');
  const diff = releases.diffReleases([1, 2, 3, 4], [10, 11], { movieIds: [1, 2], seriesIds: [10, 99], lastPushAt: 0 });
  assert.deepEqual(diff.newMovieIds, [3, 4]);
  assert.deepEqual(diff.newSeriesIds, [11]);
});

test('prettySeriesNameFromSlug: remove sufixo dublado/legendado e capitaliza', async () => {
  const releases = await compileService('server/services/newReleasesWatcher');
  assert.equal(releases.prettySeriesNameFromSlug('presidente-curtis-dublado'), 'Presidente Curtis');
  assert.equal(releases.prettySeriesNameFromSlug('lupin-legendado'), 'Lupin');
  assert.equal(releases.prettySeriesNameFromSlug(''), '');
});
