/**
 * Regression guards para a transmissão Chromecast do player de TV ao vivo
 * (LivePlayerModal → CastModal isLive=true → plugin @caprockapps/capacitor-chromecast).
 *
 * Contexto do bug: o Cast nativo falhava com session_error por 3 causas compostas:
 *  1. initialize() era chamado com a chave "receiverApplicationId" — o plugin
 *     nativo lê pluginCall.getString("appId"); a chave errada deixava appId=null
 *     e o plugin resolvia sem configurar nada.
 *  2. O manifest do plugin registra o OPTIONS_PROVIDER raiz
 *     (com.caprockapps.plugins.chromecast.CastOptionsProvider), que lê
 *     R.string.app_id. O recurso vem hardcoded do plugin com valor "A5FA8135"
 *     (receiver de demonstração do autor do plugin), então o CastContext lançava
 *     um receiver que não existe na TV do usuário → session_error.
 *     Correção: strings.xml do APP sobrescreve app_id=CC1AD845 (Default Media
 *     Receiver; recurso do app vence o da library no merge do AAPT).
 *  3. O catch do erro nativo só fazia console.error e caía em APIs de web
 *     (Remote Playback/Presentation) que não existem no WebView do Android —
 *     o modal ficava aberto sem nenhum feedback visível de erro.
 *
 * Estes guards travam o contrato para impedir regressão silenciosa.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const castModalPath = path.join(REPO, 'src/components/CastModal.tsx');
const stringsXmlPath = path.join(REPO, 'android/app/src/main/res/values/strings.xml');
const liveModalPath = path.join(REPO, 'src/components/LivePlayerModal.tsx');
const pluginStringsPath = path.join(
  REPO, 'node_modules/@caprockapps/capacitor-chromecast/android/src/main/res/values/strings.xml'
);

test('CastModal: initialize usa a chave appId (contrato do plugin nativo)', () => {
  const content = fs.readFileSync(castModalPath, 'utf8');
  assert.ok(
    /Chromecast\.initialize\(\{\s*appId:\s*['"]CC1AD845['"]/s.test(content),
    'initialize deve chamar com a chave appId (o nativo faz pluginCall.getString("appId"))'
  );
  // Ignora comentários: a chave errada não pode aparecer em CÓDIGO, mas a
  // explicação do bug pode (e deve) ficar documentada em comentário.
  const codeOnly = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => !l.startsWith('//') && !l.startsWith('*'))
    .join('\n');
  assert.ok(
    !codeOnly.includes('receiverApplicationId'),
    'A chave receiverApplicationId não existe no initialize nativo do plugin — não deve aparecer em código no CastModal'
  );
});

test('CastModal: fluxo isLive usa requestSession + loadMedia com HLS live', () => {
  const content = fs.readFileSync(castModalPath, 'utf8');
  assert.ok(content.includes('await Chromecast.requestSession()'), 'deve aguardar requestSession');
  assert.ok(
    /loadMedia\(\{\s*contentId:\s*streamUrl,/.test(content),
    'loadMedia nativo recebe contentId com a URL do stream'
  );
  assert.ok(
    content.includes("contentType: 'application/x-mpegURL'") || content.includes('contentType: "application/x-mpegURL"'),
    'contentType HLS para canais ao vivo'
  );
  assert.ok(
    /streamType:\s*['"]live['"]/.test(content),
    'streamType live para canais ao vivo'
  );
});

test('CastModal: erros do fluxo nativo viram mensagem visível (não engolidos)', () => {
  const content = fs.readFileSync(castModalPath, 'utf8');
  // Cada estágio do fluxo nativo precisa ter setStatusMsg de erro próprio.
  assert.ok(
    /catch \(initErr/.test(content) && /Não foi possível iniciar o Chromecast/.test(content),
    'falha de initialize deve exibir mensagem'
  );
  assert.ok(
    /catch \(sessionErr/.test(content) && /mesma rede Wi-Fi/.test(content),
    'falha de requestSession deve exibir mensagem'
  );
  assert.ok(
    /catch \(mediaErr/.test(content) && /não conseguiu reproduzir/.test(content),
    'falha de loadMedia deve exibir mensagem'
  );
  // Cancelamento do seletor não é erro — deve apenas limpar a mensagem.
  assert.ok(
    /reason\.includes\(['"]cancel['"]\)/.test(content),
    'cancel do seletor deve ser tratado como não-erro'
  );
});

test('CastModal: fluxo nativo não cai nos APIs de web após erro (fall-through morto)', () => {
  const content = fs.readFileSync(castModalPath, 'utf8');
  const nativeBlock = content.slice(
    content.indexOf('if (Capacitor.isNativePlatform())'),
    content.indexOf('// Navegador (web)')
  );
  assert.ok(nativeBlock.length > 200, 'bloco nativo deve existir');
  // Todo caminho de erro do bloco nativo termina em return, sem cair no código web.
  const returns = (nativeBlock.match(/\breturn;/g) || []).length;
  assert.ok(returns >= 3, `cada estágio com erro deve retornar (achou ${returns}; esperado >=3)`);
});

test('strings.xml do app sobrescreve app_id do plugin com o Default Media Receiver', () => {
  const appStrings = fs.readFileSync(stringsXmlPath, 'utf8');
  assert.ok(
    /<string name="app_id">\s*CC1AD845\s*<\/string>/.test(appStrings),
    'app deve definir app_id=CC1AD845 (Default Media Receiver) para vencer o A5FA8135 hardcoded do plugin'
  );
  // Sanity: confirma que o plugin realmente traz o valor errado (se o plugin
  // mudar este default, o override vira redundância inofensiva — teste documentado).
  if (fs.existsSync(pluginStringsPath)) {
    const pluginStrings = fs.readFileSync(pluginStringsPath, 'utf8');
    assert.ok(
      /<string name="app_id">\s*A5FA8135\s*<\/string>/.test(pluginStrings),
      'plugin continua hardcodando A5FA8135 — manter override; se isto falhar, o plugin mudou e o override deve ser reavaliado'
    );
  }
});

test('LivePlayerModal: abre CastModal com URL absoluta HTTPS + isLive + vídeo ativo', () => {
  const content = fs.readFileSync(liveModalPath, 'utf8');
  assert.ok(
    /streamUrl=\{new URL\(streamUrl,\s*['"]https:\/\/play-infinity\.stream['"]\)\.href\}/.test(content),
    'CastModal deve receber URL absoluta (a TV busca o stream direto, sem origem do app)'
  );
  assert.ok(
    /isLive\s+videoElement=\{videoRef\.current\}/.test(content),
    'CastModal deve receber isLive e o vídeo ativo'
  );
});
