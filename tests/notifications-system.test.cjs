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

// ---------------------------------------------------------------------------
// Testes do gate de permissão (decideNotifGate + dismissedCooldownMs).
// Lógica pura em src/services/notifGateLogic.ts — sem Firebase/Capacitor.
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

async function loadGate() {
  return await compileService('src/services/notifGateLogic');
}

test('dismissedCooldownMs: backoff crescente 7 -> 14 -> 30 dias', async () => {
  const gate = await loadGate();
  assert.equal(gate.dismissedCooldownMs(0), 7 * DAY);
  assert.equal(gate.dismissedCooldownMs(1), 7 * DAY);
  assert.equal(gate.dismissedCooldownMs(2), 14 * DAY);
  assert.equal(gate.dismissedCooldownMs(3), 30 * DAY);
  assert.equal(gate.dismissedCooldownMs(10), 30 * DAY);
});

test('decideNotifGate: primeira vez (sem doc) mostra prompt', async () => {
  const gate = await loadGate();
  assert.equal(gate.decideNotifGate(null, 'default', Date.now()), 'prompt');
  assert.equal(gate.decideNotifGate({}, 'default', Date.now()), 'prompt');
});

test('decideNotifGate: browser granted + stored granted -> register-silent', async () => {
  const gate = await loadGate();
  assert.equal(gate.decideNotifGate({ notifPermission: 'granted' }, 'granted', Date.now()), 'register-silent');
});

test('decideNotifGate: browser granted + stored denied (desativou pelo perfil) -> hidden (respeita decisao)', async () => {
  const gate = await loadGate();
  // Usuario desativou pelo toggle do perfil mas browser continua granted.
  // Nao re-registra token sozinho — so reativa via toggle.
  assert.equal(gate.decideNotifGate({ notifPermission: 'denied', notifDecidedAt: Date.now() }, 'granted', Date.now()), 'hidden');
});

test('decideNotifGate: browser denied + stored denied dentro cooldown 30d -> hidden', async () => {
  const gate = await loadGate();
  const now = Date.now();
  const ha10dias = now - 10 * DAY;
  assert.equal(gate.decideNotifGate({ notifPermission: 'denied', notifDecidedAt: ha10dias }, 'denied', now), 'hidden');
});

test('decideNotifGate: browser denied + stored denied apos 30d -> instructions (reexibir modal)', async () => {
  const gate = await loadGate();
  const now = Date.now();
  const ha40dias = now - 40 * DAY;
  assert.equal(gate.decideNotifGate({ notifPermission: 'denied', notifDecidedAt: ha40dias }, 'denied', now), 'instructions');
});

test('decideNotifGate: browser denied + stored granted (concedeu em outro device mas este bloqueou) -> instructions', async () => {
  const gate = await loadGate();
  assert.equal(gate.decideNotifGate({ notifPermission: 'granted' }, 'denied', Date.now()), 'instructions');
});

test('decideNotifGate: browser denied + sem decisao registrada -> instructions', async () => {
  const gate = await loadGate();
  assert.equal(gate.decideNotifGate({}, 'denied', Date.now()), 'instructions');
});

test('decideNotifGate: browser default + stored dismissed dentro cooldown 7d -> hidden', async () => {
  const gate = await loadGate();
  const now = Date.now();
  const ha3dias = now - 3 * DAY;
  // promptCount=1 -> cooldown 7d; ha3dias < 7d -> hidden
  assert.equal(gate.decideNotifGate({ notifPermission: 'dismissed', notifDecidedAt: ha3dias, notifPromptCount: 1 }, 'default', now), 'hidden');
});

test('decideNotifGate: browser default + stored dismissed apos 7d -> prompt (re-promptar nativo)', async () => {
  const gate = await loadGate();
  const now = Date.now();
  const ha10dias = now - 10 * DAY;
  // promptCount=1 -> cooldown 7d; ha10dias > 7d -> prompt
  assert.equal(gate.decideNotifGate({ notifPermission: 'dismissed', notifDecidedAt: ha10dias, notifPromptCount: 1 }, 'default', now), 'prompt');
});

test('decideNotifGate: browser default + stored dismissed promptCount=2 dentro 14d -> hidden', async () => {
  const gate = await loadGate();
  const now = Date.now();
  const ha10dias = now - 10 * DAY;
  // promptCount=2 -> cooldown 14d; ha10dias < 14d -> hidden
  assert.equal(gate.decideNotifGate({ notifPermission: 'dismissed', notifDecidedAt: ha10dias, notifPromptCount: 2 }, 'default', now), 'hidden');
});

test('decideNotifGate: browser default + stored dismissed promptCount=2 apos 14d -> prompt', async () => {
  const gate = await loadGate();
  const now = Date.now();
  const ha20dias = now - 20 * DAY;
  // promptCount=2 -> cooldown 14d; ha20dias > 14d -> prompt
  assert.equal(gate.decideNotifGate({ notifPermission: 'dismissed', notifDecidedAt: ha20dias, notifPromptCount: 2 }, 'default', now), 'prompt');
});

test('decideNotifGate: browser default + stored dismissed promptCount=3 dentro 30d -> hidden (backoff maximo)', async () => {
  const gate = await loadGate();
  const now = Date.now();
  const ha20dias = now - 20 * DAY;
  // promptCount=3 -> cooldown 30d; ha20dias < 30d -> hidden
  assert.equal(gate.decideNotifGate({ notifPermission: 'dismissed', notifDecidedAt: ha20dias, notifPromptCount: 3 }, 'default', now), 'hidden');
});

test('decideNotifGate: browser default + stored dismissed promptCount=3 apos 30d -> prompt', async () => {
  const gate = await loadGate();
  const now = Date.now();
  const ha40dias = now - 40 * DAY;
  // promptCount=3 -> cooldown 30d; ha40dias > 30d -> prompt
  assert.equal(gate.decideNotifGate({ notifPermission: 'dismissed', notifDecidedAt: ha40dias, notifPromptCount: 3 }, 'default', now), 'prompt');
});

test('decideNotifGate: browser default + stored granted (concedeu em outro device) -> prompt', async () => {
  const gate = await loadGate();
  // Concedeu em outro dispositivo mas neste browser ainda nao decidiu.
  // Mostra modal educativo para pedir permissao nativa neste device tambem.
  assert.equal(gate.decideNotifGate({ notifPermission: 'granted' }, 'default', Date.now()), 'prompt');
});

test('decideNotifGate: browser default + stored denied dentro 30d -> hidden', async () => {
  const gate = await loadGate();
  const now = Date.now();
  const ha10dias = now - 10 * DAY;
  // Outro dispositivo bloqueou; neste browser default. Cooldown 30d.
  assert.equal(gate.decideNotifGate({ notifPermission: 'denied', notifDecidedAt: ha10dias }, 'default', now), 'hidden');
});

test('decideNotifGate: browser default + stored denied apos 30d -> prompt (re-tentar nativo)', async () => {
  const gate = await loadGate();
  const now = Date.now();
  const ha40dias = now - 40 * DAY;
  // Apos 30d, re-promptar nativo (pode ser que o browser resetou permissoes).
  assert.equal(gate.decideNotifGate({ notifPermission: 'denied', notifDecidedAt: ha40dias }, 'default', now), 'prompt');
});

test('decideNotifGate: app nativo (Capacitor) + stored granted -> register-silent', async () => {
  const gate = await loadGate();
  assert.equal(gate.decideNotifGate({ notifPermission: 'granted' }, 'native', Date.now()), 'register-silent');
});

test('decideNotifGate: app nativo + stored denied -> hidden (nao re-pergunta no app)', async () => {
  const gate = await loadGate();
  assert.equal(gate.decideNotifGate({ notifPermission: 'denied' }, 'native', Date.now()), 'hidden');
});

test('decideNotifGate: app nativo + sem decisao -> prompt (dialog do sistema)', async () => {
  const gate = await loadGate();
  assert.equal(gate.decideNotifGate({}, 'native', Date.now()), 'prompt');
});
