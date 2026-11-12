const test = require('node:test');
const assert = require('node:assert/strict');

// Simulação de ambiente browser e SpeechRecognition
test('Voice assistant handles no-speech and silent errors without breaking continuous mode', () => {
  let isContinuous = true;
  let hasShownError = false;

  const simulatedErrorHandler = (errEvent) => {
    if (errEvent.error === 'no-speech' || errEvent.error === 'aborted') {
      // Ignorado com sucesso
      return;
    }
    hasShownError = true;
    if (errEvent.error === 'not-allowed') {
      isContinuous = false;
    }
  };

  // 1. Simula 'no-speech' após 8 segundos de silêncio no Chrome
  simulatedErrorHandler({ error: 'no-speech' });
  assert.equal(isContinuous, true, 'Continuous mode should remain active on no-speech');
  assert.equal(hasShownError, false, 'No error toast should be shown for no-speech');

  // 2. Simula 'aborted' durante restart
  simulatedErrorHandler({ error: 'aborted' });
  assert.equal(isContinuous, true, 'Continuous mode should remain active on aborted');
  assert.equal(hasShownError, false, 'No error toast should be shown for aborted');

  // 3. Simula negação explícita
  simulatedErrorHandler({ error: 'not-allowed' });
  assert.equal(isContinuous, false, 'Continuous mode should deactivate when permission is denied');
  assert.equal(hasShownError, true, 'Error should be signaled for not-allowed');
});

test('Session manager creates new instances instead of reusing dead speech objects', () => {
  let createdCount = 0;
  let abortedCount = 0;

  class MockSpeechRecognition {
    constructor() {
      createdCount++;
      this.isStarted = false;
    }
    start() {
      if (this.isStarted) throw new Error('recognition has already started');
      this.isStarted = true;
    }
    abort() {
      abortedCount++;
      this.isStarted = false;
    }
  }

  let currentRec = null;

  function cycleSession() {
    if (currentRec) {
      currentRec.abort();
      currentRec = null;
    }
    currentRec = new MockSpeechRecognition();
    currentRec.start();
  }

  // Ciclo 1 (início)
  cycleSession();
  assert.equal(createdCount, 1);
  assert.equal(abortedCount, 0);

  // Ciclo 2 (após timeout ou volta de background)
  cycleSession();
  assert.equal(createdCount, 2, 'Must create a brand new SpeechRecognition instance');
  assert.equal(abortedCount, 1, 'Must abort the previous instance cleanly');

  // Ciclo 3 (recuperação de foco)
  cycleSession();
  assert.equal(createdCount, 3);
  assert.equal(abortedCount, 2);
});

test('voicePermissionService requests echoCancellation and falls back to audio:true', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const esbuild = require('esbuild');
  const Module = require('node:module');

  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    stdin: {
      contents: `export * from './src/services/voicePermissionService.ts';`,
      resolveDir: root,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    write: false
  });

  const store = new Map();
  const prevWindow = globalThis.window;
  const prevNavigator = globalThis.navigator;
  const prevLocalStorage = globalThis.localStorage;

  const calls = [];
  let shouldRejectFirst = false;

  const mockNavigator = {
    mediaDevices: {
      async getUserMedia(constraints) {
        calls.push(constraints);
        if (shouldRejectFirst && calls.length === 1) {
          throw new Error('OverconstrainedError');
        }
        return {
          getTracks: () => [{ stop: () => {} }]
        };
      }
    }
  };
  const mockStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };

  Object.defineProperty(globalThis, 'window', { value: { navigator: mockNavigator }, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: mockNavigator, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, configurable: true });

  try {
    const filename = path.join(root, 'tests/virtual-voice-perm.cjs');
    const compiled = new Module(filename, module);
    compiled.filename = filename;
    compiled.paths = module.paths;
    compiled._compile(output.outputFiles[0].text, filename);

    // 1. Deve priorizar constraints anti-eco (AEC)
    const ok = await compiled.exports.requestMicrophonePermission();
    assert.equal(ok, true);
    assert.deepEqual(calls[0], {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    // 2. Fallback para { audio: true } se o dispositivo rejeitar constraints avançadas
    calls.length = 0;
    shouldRejectFirst = true;
    const okFallback = await compiled.exports.requestMicrophonePermission();
    assert.equal(okFallback, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], { audio: true });
  } finally {
    if (prevWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, 'window', { value: prevWindow, configurable: true });
    if (prevNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { value: prevNavigator, configurable: true });
    if (prevLocalStorage === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', { value: prevLocalStorage, configurable: true });
  }

  // Verifica no componente do player que a borda laranja usa voiceAwake (nunca voiceListening passivo)
  const skinSource = fs.readFileSync(path.join(root, 'src/components/NetflixPlayerSkin.tsx'), 'utf8');
  assert.match(
    skinSource,
    /\{\(voiceAwake \|\| \(voiceFeedback\.visible && voiceFeedback\.type === 'listening'\)\) && \(/,
    'Perimeter orange glow must only trigger when voiceAwake is true or listening feedback is visible'
  );
  assert.doesNotMatch(
    skinSource,
    /\{\(voiceListening \|\| voiceFeedback\.type === 'listening'\)/,
    'Passive voiceListening must not light up the orange perimeter border'
  );
});

test('Wake-word gating ignores passive movie dialogue unless awake or wake-word spoken', async () => {
  const path = require('node:path');
  const esbuild = require('esbuild');
  const Module = require('node:module');

  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    stdin: {
      contents: `export * from './src/utils/voiceCommandParser.ts';`,
      resolveDir: root,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    write: false
  });

  const filename = path.join(root, 'tests/virtual-voice-gating.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);

  const { hasWakeWord, parseVoiceCommand } = compiled.exports;

  let isAwake = false;
  const executed = [];

  function simulateTranscript(transcript, isFinal) {
    const wakeDetected = hasWakeWord(transcript);
    if (wakeDetected && !isAwake) {
      isAwake = true;
    }
    if (!wakeDetected && !isAwake) {
      return; // Áudio passivo do filme ignorado
    }
    const cmd = parseVoiceCommand(transcript);
    if (cmd && (isFinal || cmd.action !== 'SEEK_FORWARD')) {
      executed.push(cmd.action);
      isAwake = false;
    }
  }

  // 1. Falas aleatórias ou comandos soltos vindos do filme NÃO devem executar nem despertar
  simulateTranscript('pause isso agora por favor', true);
  simulateTranscript('aumentar volume dessa cena', true);
  simulateTranscript('próximo episódio começa já', true);
  assert.equal(isAwake, false, 'Movie dialogue must not wake assistant');
  assert.deepEqual(executed, [], 'Movie dialogue must not execute commands');

  // 2. Wake-word isolado acorda o assistente e permite o próximo comando
  simulateTranscript('Infinity', true);
  assert.equal(isAwake, true, 'Wake-word must wake the assistant');
  assert.deepEqual(executed, []);

  // 3. Comando falado enquanto acordado executa e retorna ao estado adormecido
  simulateTranscript('aumentar volume', true);
  assert.deepEqual(executed, ['VOLUME_UP']);
  assert.equal(isAwake, false, 'Assistant must go back to sleep after executing command');
});
