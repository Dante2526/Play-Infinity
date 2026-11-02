/**
 * Guarda de regressão da hierarquia allowlist vs blacklist (ADR-0002).
 *
 * Motivação (bug 02/11/2026): a chave curta "embedplay" casava por substring
 * o domínio homologado embedplayer2.xyz (CDN FirePlayer do catálogo Saimo) —
 * 95% das fontes HLS mortas. Este arquivo fixa as três propriedades que
 * impedem a classe inteira de bug de voltar:
 *
 *   P1. Domínios homologados exatamente na allowlist nunca são bloqueados
 *       por KEYS da blacklist (mesmo que uma chave curta volte a existir).
 *   P2. Casamento de keys/padrões-string é por FRONTEIRA DE PALAVRA —
 *       "vidlink" não casa "vidlinker.com"; "autoembed" não casa
 *       "autoembedplayer.com".
 *   P3. REGEX deliberados da blacklist VENCEM a allowlist — banimento
 *       explícito do dono não é sobrescrito (superflixapi.top segue
 *       bloqueado pelo regex de família apesar de constar na allowlist VOD).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

async function loadBlacklist() {
  const output = await esbuild.build({
    stdin: {
      contents: `export { isServerBlacklisted, SERVER_BLACKLIST, filterAllowedServers } from './src/data/serverBlacklist';`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  const filename = path.join(root, 'tests/virtual-blacklist-guard.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

test('P0: provedores banidos continuam bloqueados nos alvos legítimos de sempre', async () => {
  const bl = await loadBlacklist();
  // URLs reais dos provedores banidos (fronteira em "." da URL)
  assert.equal(bl.isServerBlacklisted('https://embedplay.cc/watch/1'), true, 'embedplay.cc bloqueado');
  assert.equal(bl.isServerBlacklisted('https://www.embedplay.xyz/x'), true, 'embedplay.xyz bloqueado');
  assert.equal(bl.isServerBlacklisted('https://vidlink.pro/x'), true, 'vidlink.pro bloqueado');
  assert.equal(bl.isServerBlacklisted('https://autoembed.cc/x'), true, 'autoembed.cc bloqueado');
  assert.equal(bl.isServerBlacklisted('https://player.autoembed.cc/x'), true, 'player.autoembed.cc bloqueado');
  assert.equal(bl.isServerBlacklisted('https://superflix.to/x'), true, 'superflix.to bloqueado');
  assert.equal(bl.isServerBlacklisted('https://vidsrc.to/x'), true, 'vidsrc.to bloqueado');
  assert.equal(bl.isServerBlacklisted('https://pomfy.stream/x'), true, 'pomfy.stream bloqueado');
  assert.equal(bl.isServerBlacklisted('https://embedmovies.org/x'), true, 'embedmovies.org bloqueado');
  assert.equal(bl.isServerBlacklisted('https://multiembed.com/x'), true, 'multiembed bloqueado');
  // Chaves exatas de servidor e rotas internas
  assert.equal(bl.isServerBlacklisted('srv_embedplay'), true, 'chave srv_embedplay bloqueada');
  assert.equal(bl.isServerBlacklisted('srv_superflix'), true, 'chave srv_superflix bloqueada');
  assert.equal(bl.isServerBlacklisted('srv_vidlink'), true, 'chave srv_vidlink bloqueada');
  assert.equal(bl.isServerBlacklisted('/api/embedplay-direct?x=1'), true, 'rota embedplay-direct bloqueada');
  assert.equal(bl.isServerBlacklisted('/api/pomfy-stream'), true, 'rota pomfy-stream bloqueada');
  assert.equal(bl.isServerBlacklisted('anime-stream?provider=consumet'), true, 'provider=consumet bloqueado');
  // BYSE mesmo-origin foi autorizado pelo dono (23/10/2026)
  assert.equal(bl.isServerBlacklisted('srv_byse'), false, 'srv_byse liberado (autorização do dono)');
});

test('P1: domínios homologados exatamente na allowlist são imunes a keys (regressão embedplay)', async () => {
  const bl = await loadBlacklist();

  // Estado atual: CDN do Saimo e players homologados nunca bloqueados
  assert.equal(bl.isServerBlacklisted('https://embedplayer2.xyz/cdn/hls/abc/master.txt'), false, 'embedplayer2.xyz (CDN Saimo) liberado');
  assert.equal(bl.isServerBlacklisted('https://embedplayer2.xyz/movie.mp4'), false, 'embedplayer2.xyz MP4 liberado');
  assert.equal(bl.isServerBlacklisted('https://embedplayer.site/x'), false, 'embedplayer.site liberado');
  assert.equal(bl.isServerBlacklisted('https://playerflix.ink/x'), false, 'playerflix.ink liberado');
  assert.equal(bl.isServerBlacklisted('https://warezcdn.net/x'), false, 'warezcdn.net liberado');
  assert.equal(bl.isServerBlacklisted('https://wurl.com/live/seg.ts'), false, 'wurl.com liberado');

  // Simulação adversária: e se uma chave curta "embedplayer2" voltasse a
  // existir na blacklist? O host exato na allowlist deve vencê-la.
  bl.SERVER_BLACKLIST.push({
    id: 'adversarial-test',
    name: 'Adversarial',
    keys: ['embedplayer2'],
    patterns: [],
    reason: 'teste',
    blockedAt: '2026-11',
  });
  try {
    assert.equal(bl.isServerBlacklisted('https://embedplayer2.xyz/cdn/hls/abc/master.txt'), false,
      'host EXATAMENTE na allowlist vence keys — imunidade contra reintrodução de chave curta');
    assert.equal(bl.isServerBlacklisted('https://evil-embedplayer2.com/x'), true,
      'domínio parecido fora da allowlist continua bloqueado pela key (fronteira no hífen)');
    assert.equal(bl.isServerBlacklisted('srv_embedplayer2'), true,
      'chave não-URL (server key) não tem hostname — keys aplicam normalmente');
    assert.equal(bl.isServerBlacklisted('https://cdn.embedplayer2.xyz/x'), true,
      'apenas host EXATO é imune; subdomínio não-allowlisted respeita keys');
  } finally {
    bl.SERVER_BLACKLIST.pop();
  }
});

test('P2: keys e padrões-string casam por fronteira de palavra, não substring crua', async () => {
  const bl = await loadBlacklist();
  // Falsos positivos da semântica antiga (includes) que agora não casam:
  assert.equal(bl.isServerBlacklisted('https://vidlinker.com/x'), false, 'vidlinker.com ≠ vidlink (fronteira)');
  assert.equal(bl.isServerBlacklisted('https://autoembedplayer.com/x'), false, 'autoembedplayer.com ≠ autoembed');
  assert.equal(bl.isServerBlacklisted('https://consumetion.net/x'), false, 'consumetion.net ≠ consumet');
  // Regex deliberado SEM âncora (/startflix/i) casa por substring — intenção
  // explícita do autor da entrada, fora do escopo da fronteira de palavra:
  assert.equal(bl.isServerBlacklisted('https://startflixapi.io/x'), true,
    'regex deliberado /startflix/i sem âncora continua casando substrings (intenção explícita)');
  // Nome de exibição com fronteira de espaço continua casando:
  assert.equal(bl.isServerBlacklisted('VidLink HD Player'), true, 'nome com fronteira de espaço casa');
});

test('P3: regex deliberado da blacklist vence a allowlist (banimento explícito do dono)', async () => {
  const bl = await loadBlacklist();
  // superflixapi.top CONSTA na allowlist VOD (legado) mas o regex de família
  // /superflix[a-z0-9-]*\.(top|...)/i da entrada superflix é um banimento
  // deliberado — deve continuar bloqueado.
  assert.equal(bl.isServerBlacklisted('https://superflixapi.top/api?v=1'), true,
    'superflixapi.top segue bloqueado pelo regex de família apesar da allowlist VOD legada');
  // O mesmo vale para qualquer variante TLD da família superflix:
  assert.equal(bl.isServerBlacklisted('https://superflixhd.net/x'), true, 'superflixhd.net bloqueado');
  // E o sfapi (string pattern) por fronteira:
  assert.equal(bl.isServerBlacklisted('https://sfapi.cc/x'), true, 'sfapi.cc bloqueado');
});

test('filterAllowedServers: remove banidos e preserva homologados/Saimo', async () => {
  const bl = await loadBlacklist();
  const servers = [
    { key: 'srv_saimo_hls', name: 'Saimo Play HD', url: '/api/saimo-proxy-iframe?id=1' },
    { key: 'srv_saimo_mp4', name: 'Saimo Turbo', url: '/api/saimo-proxy-iframe?id=1&prefer=mp4' },
    { key: 'srv_vidlink', name: 'VidLink', url: 'https://vidlink.pro/x' },
    { key: 'srv_byse', name: 'BYSE', url: '/byse/watch' },
    { key: 'srv_embedplay', name: 'EmbedPlay', url: 'https://embedplay.cc/x' },
  ];
  const allowed = bl.filterAllowedServers(servers);
  const keys = allowed.map(s => s.key);
  assert.ok(keys.includes('srv_saimo_hls'), 'Saimo HLS preservado');
  assert.ok(keys.includes('srv_saimo_mp4'), 'Saimo MP4 preservado');
  assert.ok(keys.includes('srv_byse'), 'BYSE (autorizado) preservado');
  assert.ok(!keys.includes('srv_vidlink'), 'VidLink removido');
  assert.ok(!keys.includes('srv_embedplay'), 'EmbedPlay removido');
});
