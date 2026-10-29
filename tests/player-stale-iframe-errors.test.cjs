/**
 * Regression guards para a race do iframe moribundo no VideoPlayerModal.
 *
 * Contexto do bug (reproduzido em 29/10/2026, Lupin S4E2 no StreamTape):
 * usuário pausa > 3 min → watchdog força reload transparente do MESMO
 * servidor com token novo → handleServerSwitch bumpa transitionEpochRef e
 * começa a carregar o iframe novo (server-side ~1-3s) → ENQUANTO isso o
 * iframe ANTIGO morre (token expirado, ERR_CONTENT_LENGTH_MISMATCH), sua
 * recovery interna falha (502 no exclude) e ele emite WATCHPLAY_ERROR com
 * streamtapeExhausted=true ANTES de ser desmontado → o handler valida a
 * origem (isTrustedPlayerEvent) e ACEITA, porque durante a transição o
 * iframe antigo AINDA é o frame atual → o erro pré-datado preempta o reload
 * transparente em andamento e comuta o servidor sem necessidade
 * (streamtape→byse com fonte viva verificada).
 *
 * Fix: mensagens de ERRO (WATCHPLAY_UNAVAILABLE/WATCHPLAY_ERROR/PLAYER_ERROR/
 * VIP_UNAVAILABLE/STREAM_DISCONNECTED) que chegam na janela pós-transição
 * (< 3000ms do bump do transitionEpochRef) são do iframe em descarte e são
 * ignoradas. Erros reais do iframe novo ficam a cargo do watchdog de startup
 * (providerTimeout/startupClock), que dispara o fallback sozinho.
 *
 * Estes guards travam o contrato para impedir regressão silenciosa.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const playerPath = path.join(REPO, 'src/components/VideoPlayerModal.tsx');
const content = fs.readFileSync(playerPath, 'utf8');

/** Slice do branch de erro: da condição dos tipos até o fechamento do handler. */
function errorBranch() {
  const start = content.indexOf('event.data.type === "WATCHPLAY_UNAVAILABLE"');
  assert.ok(start !== -1, 'branch de erro deve existir no VideoPlayerModal');
  const end = content.indexOf('window.addEventListener("message", handlePlayerWindowMessages)');
  assert.ok(end > start, 'handler de mensagens deve existir depois do branch de erro');
  return content.slice(start, end);
}

test('VideoPlayerModal: branch de erro ignora mensagens na janela de transição (iframe moribundo)', () => {
  const branch = errorBranch();
  assert.ok(
    /const msSinceTransition = Date\.now\(\) - transitionEpochRef\.current;/.test(branch),
    'guard deve medir o tempo desde o último bump do transitionEpochRef'
  );
  assert.ok(
    /if \(msSinceTransition < 3000\) \{/.test(branch),
    'janela de transição de 3000ms (cobre a agonia do iframe antigo sem bloquear erros reais do novo)'
  );
  assert.ok(
    /console\.warn\(`\[VideoPlayerModal\] Erro de player ignorado — iframe anterior em descarte/.test(branch),
    'log identificável — relatos de console do usuário viram autodiagnóstico'
  );
});

test('VideoPlayerModal: guard vem ANTES de qualquer ação do branch (flags, tracking, fallback)', () => {
  const branch = errorBranch();
  const guardIdx = branch.indexOf('msSinceTransition');
  const trackIdx = branch.indexOf('mixdropRoutingRef.current.track');
  const exhaustedIdx = branch.indexOf('retrySameServerRef.current = true');
  const fallbackIdx = branch.indexOf('silentFallbackRef.current()');
  assert.ok(guardIdx !== -1, 'guard presente');
  for (const [name, idx] of [['mixdrop track', trackIdx], ['exhausted flags', exhaustedIdx], ['silentFallback', fallbackIdx]]) {
    assert.ok(idx > guardIdx, `guard deve preceder ${name} — senão o erro pré-datado ainda preempta o reload transparente`);
  }
});

test('VideoPlayerModal: esgotamento REAL continua honrado fora da janela (contrato preservado)', () => {
  const branch = errorBranch();
  assert.ok(
    /event\.data\.streamtapeExhausted === true/.test(branch) && /event\.data\.byseExhausted === true/.test(branch),
    'flags de esgotamento streamtape/byse seguem processadas (fora da janela de transição)'
  );
  assert.ok(
    /silentFallbackRef\.current\(\);/.test(branch),
    'fallback automático para próximo servidor permanece no fim do branch'
  );
});

test('VideoPlayerModal: transitionEpochRef continua sendo bumped por handleServerSwitch (base do guard)', () => {
  const switchIdx = content.indexOf('const handleServerSwitch = useCallback');
  assert.ok(switchIdx !== -1, 'handleServerSwitch deve existir');
  const switchBlock = content.slice(switchIdx, switchIdx + 2000);
  assert.ok(
    /transitionEpochRef\.current = Date\.now\(\);/.test(switchBlock),
    'handleServerSwitch bumpa o epoch ANTES de carregar o iframe novo — sem isso a janela nunca abre'
  );
});

test('VideoPlayerModal: cadeia de confiança original intacta (isTrustedPlayerEvent primeiro)', () => {
  const handlerIdx = content.indexOf('const handlePlayerWindowMessages = (event: MessageEvent) => {');
  const trustIdx = content.indexOf('if (!isTrustedPlayerEvent(event)) return;');
  assert.ok(handlerIdx !== -1 && trustIdx > handlerIdx, 'handler valida origem antes de processar');
  // O guard novo é DEFENSIVO em cima da validação de origem — não a substitui:
  // durante a transição o frame antigo passa na validação de origem porque
  // ainda é o frame atual; só a janela temporal discrimina o documento velho.
  assert.ok(
    /iframe anterior em descarte/.test(content),
    'comentário/log do guard documenta a limitação da validação de origem'
  );
});
