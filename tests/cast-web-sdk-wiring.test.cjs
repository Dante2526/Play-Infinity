/**
 * Regression guards para a transmissão Chromecast no SITE (navegador web)
 * via Google Cast Framework SDK — src/services/webCastSdk.ts + CastModal.
 *
 * Contexto: no navegador, o botão Transmitir dependia de Remote Playback
 * API / Presentation API, que o Chrome bloqueia com player MSE (hls.js) e
 * que não existem no desktop. A correção carrega o Cast Framework SDK do
 * Google de forma tardia (lazy) e abre o seletor nativo do navegador; a TV
 * busca o stream direto da URL (o mesmo modelo do app Android nativo).
 *
 * Contratos travados aqui:
 *  - SDK oficial do Google (cast_sender.js?loadCastFramework=1) e SOMENTE lazy
 *    (index.html não pode carregar eager — custo em todo page view + WebView
 *    do app Android, onde o cast é do plugin nativo);
 *  - callback __onGCastApiAvailable definido ANTES do script entrar no DOM;
 *  - receiver web = CC1AD845 (Default Media Receiver) — o MESMO do strings.xml
 *    do Android (senão app e site lançam receivers diferentes);
 *  - Chromium apenas (iOS WebKit fora — AirPlay cobre; TV não transmite p/ si);
 *  - fluxo do CastModal web: resolveCastStreamUrl → requestSession →
 *    getCurrentSession → loadMedia; cancel não é erro; cada estágio reporta;
 *  - resolução de URL direta compartilhada entre App Externo e cast web.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const sdkPath = path.join(REPO, 'src/services/webCastSdk.ts');
const castModalPath = path.join(REPO, 'src/components/CastModal.tsx');
const androidStringsPath = path.join(REPO, 'android/app/src/main/res/values/strings.xml');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

test('webCastSdk: carrega o cast_sender oficial do Google com loadCastFramework=1 (e o site NÃO carrega eager)', () => {
  const content = read(sdkPath);
  assert.ok(
    content.includes('https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'),
    'deve usar o SDK oficial do Google'
  );
  const indexHtml = read(path.join(REPO, 'index.html'));
  assert.ok(
    !indexHtml.includes('cast_sender'),
    'index.html não deve carregar o SDK eager — só no clique em Transmitir (custo de page view + WebView do app)'
  );
});

test('webCastSdk: __onGCastApiAvailable definido ANTES do script entrar no DOM', () => {
  const content = read(sdkPath);
  const cbIdx = content.indexOf('__onGCastApiAvailable =');
  const appendIdx = content.indexOf('document.head.appendChild(script)');
  assert.ok(cbIdx !== -1, 'deve definir o callback global de disponibilidade');
  assert.ok(appendIdx !== -1, 'deve inserir o script no DOM');
  assert.ok(
    cbIdx < appendIdx,
    'o callback precisa existir antes do appendChild, senão o evento de carga é perdido'
  );
});

test('webCastSdk: setOptions usa o Default Media Receiver — o MESMO receiver do app Android', () => {
  const content = read(sdkPath);
  assert.ok(
    /receiverApplicationId:\s*CAST_DEFAULT_RECEIVER_APP_ID/.test(content),
    'o SDK web configura o receiver via setOptions({ receiverApplicationId }) — chave correta do SDK web'
  );
  assert.ok(
    /CAST_DEFAULT_RECEIVER_APP_ID\s*=\s*['"]CC1AD845['"]/.test(content),
    'constante do receiver deve ser CC1AD845'
  );
  const androidStrings = read(androidStringsPath);
  assert.ok(
    /<string name="app_id">\s*CC1AD845\s*<\/string>/.test(androidStrings),
    'web e Android devem lançar o MESMO receiver (CC1AD845 no strings.xml do app)'
  );
});

test('webCastSdk: Chromium apenas — iOS WebKit e navegador de TV ficam fora do fluxo', () => {
  const content = read(sdkPath);
  assert.ok(
    /CriOS\|FxiOS\|EdgiOS/.test(content),
    'CriOS/FxiOS/EdgiOS são WebKit no iOS (SDK não roda; AirPlay cobre o Safari)'
  );
  assert.ok(
    /Tizen|Web0S|Android TV/.test(content),
    'navegador de Smart TV não deve entrar no fluxo de cast (o natural é abrir o site na TV)'
  );
});

test('webCastSdk: timeout de carga — o modal não pode esperar para sempre', () => {
  const content = read(sdkPath);
  assert.ok(/setTimeout/.test(content), 'deve ter timeout de carga do SDK');
  assert.ok(/Tempo esgotado/.test(content), 'mensagem de timeout definida');
});

test('CastModal: fluxo web = loadCastFramework → resolveCastStreamUrl → requestSession → getCurrentSession → loadMedia', () => {
  const content = read(castModalPath);
  const webCast = content.slice(
    content.indexOf('const handleWebCastFramework'),
    content.indexOf('const handleNativeCast')
  );
  assert.ok(webCast.length > 400, 'função handleWebCastFramework deve existir no CastModal');
  assert.ok(/await loadCastFramework\(\)/.test(webCast), 'carrega o SDK');
  assert.ok(/await resolveCastStreamUrl\(\)/.test(webCast), 'resolve a URL direta antes de abrir o seletor');
  assert.ok(/await ctx\.requestSession\(\)/.test(webCast), 'abre o seletor nativo do navegador');
  assert.ok(/ctx\.getCurrentSession\(\)/.test(webCast), 'obtém a sessão escolhida');
  assert.ok(/session\.loadMedia\(/.test(webCast), 'carrega a mídia na TV');
  assert.ok(
    /buildWebCastLoadRequest\(\{\s*url: absoluteUrl,\s*isLive,\s*title\s*\}\)/.test(webCast),
    'loadMedia recebe o LoadRequest montado pelo serviço (HLS p/ live, MP4 p/ VOD)'
  );
});

test('CastModal: cancel do seletor web NÃO é erro (mesma regra do fluxo nativo)', () => {
  const content = read(castModalPath);
  const webCast = content.slice(
    content.indexOf('const handleWebCastFramework'),
    content.indexOf('const handleNativeCast')
  );
  assert.ok(/isCastUserCancel/.test(webCast), 'cancel deve ser classificado via isCastUserCancel');
  assert.ok(
    /if \(!session\) \{/.test(webCast),
    'janela fechada sem escolher TV (sessão null) deve ser tratada sem erro barulhento'
  );
});

test('CastModal: erros do fluxo web viram mensagem visível (não engolidos)', () => {
  const content = read(castModalPath);
  const webCast = content.slice(
    content.indexOf('const handleWebCastFramework'),
    content.indexOf('const handleNativeCast')
  );
  assert.ok(
    /Não foi possível conectar na TV/.test(webCast),
    'falha de requestSession deve exibir mensagem de rede'
  );
  assert.ok(
    /não conseguiu reproduzir/.test(webCast),
    'falha de loadMedia deve exibir mensagem de reprodução na TV'
  );
});

test('CastModal: resolução de URL direta compartilhada entre App Externo e cast web', () => {
  const content = read(castModalPath);
  assert.ok(
    /const resolveCastStreamUrl = async \(\)/.test(content),
    'resolver de URL direta deve ser função própria'
  );
  const extPlayer = content.slice(
    content.indexOf('const handleExternalPlayer'),
    content.indexOf('const handleWebCastFramework')
  );
  assert.ok(
    /await resolveCastStreamUrl\(\)/.test(extPlayer),
    'handleExternalPlayer usa o mesmo resolver (sem duplicação da lógica mixdrop/find-cast-source)'
  );
});

test('CastModal: botão Transmitir visível também no navegador (não só no app nativo)', () => {
  const content = read(castModalPath);
  assert.ok(/onClick=\{handleNativeCast\}/.test(content), 'botão de transmitir existe');
  assert.ok(
    !/\{Capacitor\.isNativePlatform\(\) && \(\s*<button[^>]*onClick=\{handleNativeCast\}/s.test(content),
    'botão Transmitir não pode ficar escondido no web (era o caso antes: só renderizava no nativo)'
  );
  assert.ok(/Transmitir para a TV/.test(content), 'label do botão no navegador');
});

test('CastModal: chave receiverApplicationId continua PROIBIDA no CastModal (contrato nativo usa appId)', () => {
  const content = read(castModalPath);
  const codeOnly = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => !l.startsWith('//') && !l.startsWith('*'))
    .join('\n');
  assert.ok(
    !codeOnly.includes('receiverApplicationId'),
    'o receiver web vive no webCastSdk.ts; no CastModal a chave continuaria sendo a errada para o plugin nativo'
  );
  assert.ok(
    !content.includes('cast_sender'),
    'o carregamento do SDK fica centralizado no serviço (não no componente)'
  );
});

test('CastModal: fluxo web do Cast SDK só roda em Chromium — AirPlay/Presentation preservados como fallback', () => {
  const content = read(castModalPath);
  const webBranch = content.slice(
    content.indexOf('// Navegador (web)'),
    content.indexOf('const videos = videoElement')
  );
  assert.ok(
    /if \(isChromiumBrowser\(\)\) \{\s*\n\s*const handled = await handleWebCastFramework\(\);\s*\n\s*if \(handled\) return;/.test(webBranch),
    'o cast do SDK deve ser tentado primeiro e só em Chromium'
  );
  // Safari (AirPlay) e Presentation seguem disponíveis para os demais browsers.
  assert.ok(/video\.remote\.prompt/.test(content), 'Remote Playback API (AirPlay) preservado');
  assert.ok(/webkitShowPlaybackTargetPicker/.test(content), 'AirPlay legado preservado');
  assert.ok(/presentation\.defaultRequest/.test(content), 'Presentation API preservado');
});
