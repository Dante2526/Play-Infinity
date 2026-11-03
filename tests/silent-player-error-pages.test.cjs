/**
 * Contrato das páginas de erro INVISÍVEIS dos iframes de player.
 *
 * Contexto (print do usuário, 03/11/2026, "Velocidade e Paixão" no Android):
 * o StreamTape falhava a resolução e o iframe renderizava uma página 502
 * VISÍVEL — "Vídeo Indisponível / Não foi possível iniciar este vídeo no
 * StreamTape" — exposta ao usuário final por cima da skin, junto ao estado
 * congelado do filme (1:18:14). O nome interno do servidor nunca deve chegar
 * ao usuário: a falha é um sinal interno (postMessage WATCHPLAY_ERROR) que
 * aciona o fallback silencioso, e o estado visual permanece o spinner
 * "Carregando..." do modal.
 *
 * Estes guards travam o contrato:
 *  1. buildSilentPlayerErrorPage: página preta e muda, sinal interno com
 *     playerFrameUrl (identifica o frame novo na janela de transição do
 *     VideoPlayerModal) e reenvios (0/800/2000/3500ms) para vencer a janela
 *     de ignorância pós-troca sem esperar o watchdog de startup (45–95s).
 *  2. Rotas reais (StreamTape via HTTP): 502 sem NENHUM texto visível.
 *  3. Invariante global: nenhum heading h1–h6 em páginas server-side (nenhum
 *     provedor voltou a renderizar erro visível).
 *  4. onFatal dos players embutidos carrega playerFrameUrl (fast-path do
 *     modal mesmo dentro da janela de transição).
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const express = require('express');
const esbuild = require('esbuild');

const REPO = path.resolve(__dirname, '..');
let api, server, base;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

/** Remove blocos <script> e tags: sobra só o texto realmente visível. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

before(async () => {
  const result = await esbuild.build({
    stdin: {
      contents: `export * from './server/services/playerErrorPage'; export { streamtapeRouter } from './server/routes/streamtapeRoutes';`,
      resolveDir: REPO,
      loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{
      name: 'catalog-fixture',
      setup(build) {
        build.onResolve({ filter: /encontreiLookup$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: `export const getStreamtapeSources = async()=>[]; export const resolveEncontreiEpisode = async()=>null; export const resolveVizerEpisode=resolveEncontreiEpisode; export const resolveEncontreiMovie=resolveEncontreiEpisode; export const resolveVizerMovie=resolveEncontreiEpisode;`,
        }));
      },
    }],
  });
  const filename = path.join(REPO, 'tests/virtual-silent-player-error.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(result.outputFiles[0].text, filename);
  api = compiled.exports;
  const app = express();
  app.use(api.streamtapeRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

test('buildSilentPlayerErrorPage: sinal interno completo (exhausted + playerFrameUrl + reenvios) sem texto visível', () => {
  const page = api.buildSilentPlayerErrorPage({ reason: 'StreamTape: Não foi possível iniciar este vídeo', exhaustedKey: 'streamtapeExhausted' });
  assert.match(page, /"type":"WATCHPLAY_ERROR"/);
  assert.match(page, /"reason":"StreamTape: Não foi possível iniciar este vídeo"/);
  assert.match(page, /"streamtapeExhausted":true/);
  assert.match(page, /payload\.playerFrameUrl = window\.location\.href/);
  const retries = (page.match(/setTimeout\(report/g) || []).length;
  assert.ok(retries >= 3, `sinal precisa de reenvios para vencer a janela de transição do modal (achou ${retries})`);
  assert.equal(visibleText(page), '', 'página deve ser preta e muda — zero texto visível');
  assert.doesNotMatch(page, /<h[1-6][\s>]|<p[\s>]/i, 'nenhum elemento de texto visível');
});

test('buildSilentPlayerErrorPage: sem flag de esgotamento quando o caller não marca (retry do mesmo servidor segue permitido)', () => {
  const page = api.buildSilentPlayerErrorPage({ reason: 'X: erro interno' });
  assert.doesNotMatch(page, /Exhausted/);
  assert.match(page, /"reason":"X: erro interno"/);
});

test('buildSilentPlayerErrorPage: reason hostil (</script>) não quebra o wrapper do iframe', () => {
  const page = api.buildSilentPlayerErrorPage({ reason: '</script><h1>hacked</h1>' });
  // O </script> do reason precisa vir escapado (\u003c) para não fechar o bloco.
  assert.doesNotMatch(page, /"reason":"<\//);
  assert.match(page, /\\u003c/);
  assert.equal(visibleText(page), '');
});

test('StreamTape iframe real: falha de resolução devolve 502 silencioso (sem "Vídeo Indisponível" visível)', async () => {
  const response = await fetch(base + '/api/streamtape-proxy-iframe?id=987654');
  assert.equal(response.status, 502);
  const html = await response.text();
  assert.match(html, /"streamtapeExhausted":true/, 'sinal interno de esgotamento preservado');
  assert.match(html, /payload\.playerFrameUrl = window\.location\.href/);
  assert.ok((html.match(/setTimeout\(report/g) || []).length >= 3, 'reenvios presentes');
  assert.equal(visibleText(html), '', 'nenhum texto visível — o usuário fica no spinner do modal');
  assert.doesNotMatch(visibleText(html), /StreamTape|Vídeo Indisponível/i);
});

test('invariante global: nenhum provedor server-side renderiza heading de erro visível (h1–h6)', () => {
  for (const file of walk(path.join(REPO, 'server'))) {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      content,
      /<h[1-6][\s>]/,
      `${path.relative(REPO, file)} renderiza HTML visível de erro — use buildSilentPlayerErrorPage`,
    );
  }
});

test('onFatal dos players embutidos carrega playerFrameUrl (fast-path na janela de transição)', () => {
  const streamtape = fs.readFileSync(path.join(REPO, 'server/routes/streamtapeRoutes.ts'), 'utf8');
  assert.match(
    streamtape,
    /streamtapeExhausted: true, playerFrameUrl: window\.location\.href/,
    'StreamTape: recovery fatal precisa identificar o frame',
  );
  const mixdrop = fs.readFileSync(path.join(REPO, 'server/routes/mixdrop.ts'), 'utf8');
  assert.match(
    mixdrop,
    /mixdropFileId: \$\{scriptJson\(fileId\)\}, playerFrameUrl: window\.location\.href/,
    'MixDrop: recovery fatal precisa identificar o frame',
  );
  const byse = fs.readFileSync(path.join(REPO, 'server/services/byse/core.ts'), 'utf8');
  assert.match(
    byse,
    /type: "WATCHPLAY_ERROR", reason: reason, playerFrameUrl: window\.location\.href/,
    'Byse: wrapper fatal precisa identificar o frame',
  );
});

test('rotas de player convergiram para o helper silencioso compartilhado', () => {
  const consumers = [
    'server/routes/streamtapeRoutes.ts',
    'server/routes/mixdrop.ts',
    'server/routes/byseRoutes.ts',
    'server/routes/saimoRoutes.ts',
    'server/routes/doodstreamRoutes.ts',
    'server/routes/anidigitalRoutes.ts',
  ];
  for (const rel of consumers) {
    const content = fs.readFileSync(path.join(REPO, rel), 'utf8');
    assert.ok(
      content.includes('buildSilentPlayerErrorPage'),
      `${rel} deve usar buildSilentPlayerErrorPage para falhas de iframe`,
    );
  }
  const byseCore = fs.readFileSync(path.join(REPO, 'server/services/byse/core.ts'), 'utf8');
  assert.ok(byseCore.includes('buildSilentPlayerErrorPage'), 'byse/core.ts notFoundHtml usa o helper');
});
