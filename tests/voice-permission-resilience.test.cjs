const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');

let cachedVoiceBundleText = null;
async function getVoiceBundleText() {
  if (cachedVoiceBundleText) return cachedVoiceBundleText;
  const output = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/hooks/usePlayerVoiceAssistant.ts';
        export * from './src/services/voicePermissionService.ts';
        export * from './src/utils/voiceCommandParser.ts';
      `,
      resolveDir: root,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['react'],
    write: false
  });
  cachedVoiceBundleText = output.outputFiles[0].text;
  return cachedVoiceBundleText;
}

function createFakeClock(initialNow = 1_000_000) {
  let nextId = 1;
  const timers = new Map();
  const clock = {
    now: initialNow,
    setTimeout(fn, delay = 0) {
      const id = nextId++;
      timers.set(id, { id, fn, due: clock.now + Math.max(0, Number(delay) || 0), interval: null });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval(fn, delay = 1) {
      const id = nextId++;
      const ms = Math.max(1, Number(delay) || 1);
      timers.set(id, { id, fn, due: clock.now + ms, interval: ms });
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    async advance(ms) {
      const target = clock.now + ms;
      while (true) {
        let next = null;
        for (const item of timers.values()) {
          if (item.due <= target && (!next || item.due < next.due)) {
            next = item;
          }
        }
        if (!next) break;
        clock.now = next.due;
        if (next.interval !== null) {
          next.due += next.interval;
        } else {
          timers.delete(next.id);
        }
        next.fn();
        await Promise.resolve();
        await Promise.resolve();
      }
      clock.now = target;
      await Promise.resolve();
    }
  };
  return clock;
}

async function createVoiceHookHarness(options = {}) {
  const bundleCode = await getVoiceBundleText();
  const clock = createFakeClock();
  const store = new Map(Object.entries(options.initialStorage || {}));
  let permissionState = options.permissionState || 'granted';
  const instances = [];
  const docListeners = new Map();
  const winListeners = new Map();

  class MockSpeechRecognition {
    constructor() {
      this.continuous = false;
      this.interimResults = false;
      this.lang = '';
      this.maxAlternatives = 1;
      this.onstart = null;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.startedAt = null;
      this.abortedAt = null;
      this.aborted = false;
      this.id = instances.length + 1;
      instances.push(this);
    }
    start() {
      if (options.onStartHook) options.onStartHook(this);
      this.startedAt = clock.now;
      if (options.autoStart !== false) {
        queueMicrotask(() => {
          if (!this.aborted && this.onstart) this.onstart({});
        });
      }
    }
    abort() {
      this.aborted = true;
      this.abortedAt = clock.now;
    }
    stop() {
      this.aborted = true;
      this.abortedAt = clock.now;
    }
    emitResult(transcript, isFinal = true, resultIndex = 0) {
      if (!this.onresult) return;
      const results = [];
      const alts = Array.isArray(transcript)
        ? transcript.map(t => ({ transcript: t }))
        : [{ transcript }];
      results[resultIndex] = Object.assign(alts, { isFinal });
      this.onresult({ resultIndex, results });
    }
    emitCumulativeResults(items, eventResultIndex = 0) {
      if (!this.onresult) return;
      const results = items.map(item =>
        Object.assign([{ transcript: item.text }], { isFinal: !!item.isFinal })
      );
      this.onresult({ resultIndex: eventResultIndex, results });
    }
    emitError(error) {
      if (this.onerror) this.onerror({ error });
    }
    emitEnd() {
      if (this.onend) this.onend({});
    }
  }

  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };

  const mockNavigator = {
    userAgent: options.userAgent || 'Mozilla/5.0',
    permissions: options.hasPermissionsApi === false ? undefined : {
      async query() {
        return { state: permissionState };
      }
    },
    mediaDevices: {
      async getUserMedia(constraints) {
        if (options.onGetUserMedia) return options.onGetUserMedia(constraints);
        return { getTracks: () => [{ stop: () => {} }] };
      }
    }
  };

  const mockDocument = {
    visibilityState: 'visible',
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    },
    dispatch(type) {
      for (const fn of [...(docListeners.get(type) || [])]) fn({});
    }
  };

  const mockWindow = {
    SpeechRecognition: options.SpeechRecognition !== undefined ? options.SpeechRecognition : MockSpeechRecognition,
    AudioContext: options.AudioContext,
    fetch: options.fetch,
    navigator: mockNavigator,
    dispatchEvent() {},
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      winListeners.get(type)?.delete(fn);
    },
    dispatch(type) {
      for (const fn of [...(winListeners.get(type) || [])]) fn({});
    }
  };

  const states = [];
  const refs = [];
  const callbacks = [];
  const effects = [];
  let cursor = { state: 0, ref: 0, cb: 0, effect: 0 };
  let mounted = true;
  let rerenderScheduled = false;
  let hookResult = null;
  let hookProps = options.hookProps || {};

  const depsChanged = (prev, next) => {
    if (!prev || !next) return true;
    if (prev.length !== next.length) return true;
    for (let i = 0; i < next.length; i++) {
      if (!Object.is(prev[i], next[i])) return true;
    }
    return false;
  };

  const reactShim = {
    useState(init) {
      const idx = cursor.state++;
      if (!(idx in states)) {
        states[idx] = typeof init === 'function' ? init() : init;
      }
      const setState = (val) => {
        const nextVal = typeof val === 'function' ? val(states[idx]) : val;
        if (!Object.is(states[idx], nextVal)) {
          states[idx] = nextVal;
          if (mounted && !rerenderScheduled) {
            rerenderScheduled = true;
            queueMicrotask(() => {
              rerenderScheduled = false;
              if (mounted) render();
            });
          }
        }
      };
      return [states[idx], setState];
    },
    useRef(init) {
      const idx = cursor.ref++;
      if (!(idx in refs)) refs[idx] = { current: init };
      return refs[idx];
    },
    useCallback(fn, deps) {
      const idx = cursor.cb++;
      const prev = callbacks[idx];
      if (!prev || depsChanged(prev.deps, deps)) {
        callbacks[idx] = { fn, deps };
      }
      return callbacks[idx].fn;
    },
    useEffect(fn, deps) {
      const idx = cursor.effect++;
      const prev = effects[idx];
      if (!prev || depsChanged(prev.deps, deps)) {
        effects[idx] = { fn, deps, cleanup: prev?.cleanup, dirty: true };
      }
    }
  };

  class FakeDate extends Date {
    static now() { return clock.now; }
  }

  const sandboxModule = { exports: {} };
  const sandbox = {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require: (id) => {
      if (id === 'react') return reactShim;
      return require(id);
    },
    window: mockWindow,
    document: mockDocument,
    navigator: mockNavigator,
    localStorage: storage,
    CustomEvent: function CustomEvent(name, detail) { return { type: name, ...detail }; },
    Date: FakeDate,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    console,
    Math,
    Promise
  };

  vm.runInNewContext(bundleCode, sandbox);
  const exportsObj = sandboxModule.exports;

  function render() {
    cursor = { state: 0, ref: 0, cb: 0, effect: 0 };
    hookResult = exportsObj.usePlayerVoiceAssistant(hookProps);
    for (const eff of effects) {
      if (eff.dirty) {
        eff.dirty = false;
        if (typeof eff.cleanup === 'function') eff.cleanup();
        eff.cleanup = eff.fn();
      }
    }
  }

  render();
  await Promise.resolve();
  await Promise.resolve();

  return {
    exportsObj,
    clock,
    instances,
    mockWindow,
    mockDocument,
    storage,
    setPermissionState: (next) => { permissionState = next; },
    setProps(nextProps) {
      hookProps = { ...hookProps, ...nextProps };
      render();
    },
    getHook: () => hookResult,
    unmount() {
      mounted = false;
      for (const eff of effects) {
        if (typeof eff.cleanup === 'function') eff.cleanup();
      }
    }
  };
}

test('computeVoiceBackoffMs scales exponentially up to 30s', async () => {
  const code = await getVoiceBundleText();
  const fakeMod = { exports: {} };
  new Function('module', 'exports', 'require', code)(fakeMod, fakeMod.exports, (id) => (id === 'react' ? {} : require(id)));
  const { computeVoiceBackoffMs } = fakeMod.exports;

  assert.equal(computeVoiceBackoffMs(0), 0);
  assert.equal(computeVoiceBackoffMs(1), 1000);
  assert.equal(computeVoiceBackoffMs(2), 2000);
  assert.equal(computeVoiceBackoffMs(3), 4000);
  assert.equal(computeVoiceBackoffMs(4), 8000);
  assert.equal(computeVoiceBackoffMs(5), 16000);
  assert.equal(computeVoiceBackoffMs(6), 30000);
  assert.equal(computeVoiceBackoffMs(10), 30000);
});

test('checkMicrophonePermissionStatus detects revoked permission despite stale localStorage cache', async () => {
  const harness = await createVoiceHookHarness({
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    },
    permissionState: 'denied'
  });
  try {
    const status = await harness.exportsObj.checkMicrophonePermissionStatus();
    assert.equal(status, 'denied');
    assert.equal(harness.storage.getItem('playinfinity_mic_permission'), 'denied');

    harness.setPermissionState('granted');
    const restored = await harness.exportsObj.checkMicrophonePermissionStatus();
    assert.equal(restored, 'granted');
    assert.equal(harness.storage.getItem('playinfinity_mic_permission'), 'granted');
  } finally {
    harness.unmount();
  }
});

test('long-running preventive renew separates abort() and start() by >= 150ms and cleans up start() exceptions', async () => {
  let throwOnStartNumber = -1;
  const harness = await createVoiceHookHarness({
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    },
    onStartHook(rec) {
      if (rec.id === throwOnStartNumber) {
        throw Object.assign(new Error('already started'), { name: 'InvalidStateError' });
      }
    }
  });
  try {
    assert.equal(harness.instances.length, 1);
    const first = harness.instances[0];
    assert.ok(first.startedAt !== null);

    // Simula silêncio até os 45s de renovação preventiva
    await harness.clock.advance(45000);
    assert.equal(first.aborted, true, 'Preventive renewal must abort the 45s session');
    assert.equal(harness.instances.length, 1, 'Must NOT start new recognition on the same tick as abort()');

    // Aguarda cooldown seguro de 150ms
    await harness.clock.advance(150);
    assert.equal(harness.instances.length, 2, 'New clean session starts after 150ms cooldown');
    assert.ok(harness.instances[1].startedAt - first.abortedAt >= 150);

    // Se rec.start() lançar erro na próxima tentativa (instância 3), deve limpar referência e aplicar backoff (1000ms)
    throwOnStartNumber = 3;
    await harness.clock.advance(45000 + 1350 + 150);
    assert.equal(harness.instances.length, 3);
    assert.equal(harness.getHook().isListening, false);

    // Após 80ms NÃO deve tentar de novo (backoff = 1000ms)
    await harness.clock.advance(200);
    assert.equal(harness.instances.length, 3);

    // Passando 1000ms do start falho, instância 4 inicia limpa
    throwOnStartNumber = -1;
    await harness.clock.advance(900);
    assert.equal(harness.instances.length, 4);
    assert.equal(harness.getHook().isListening, true);
  } finally {
    harness.unmount();
  }
});

test('network/audio-capture errors apply exponential backoff without 80ms storm and focus preserves healthy session', async () => {
  const harness = await createVoiceHookHarness({
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    },
    autoStart: false
  });
  try {
    assert.equal(harness.instances.length, 1);
    harness.instances[0].onstart({});
    await Promise.resolve();
    assert.equal(harness.getHook().isListening, true);

    // Foco voltando do iframe para a janela não deve derrubar sessão saudável
    harness.mockWindow.dispatch('focus');
    harness.mockDocument.dispatch('visibilitychange');
    await harness.clock.advance(300);
    assert.equal(harness.instances.length, 1);
    assert.equal(harness.instances[0].aborted, false);

    // 1ª falha de rede -> espera 1000ms (nada em 80ms)
    harness.instances[0].emitError('network');
    harness.instances[0].emitEnd();
    await harness.clock.advance(300);
    assert.equal(harness.instances.length, 1, 'Must wait 1s backoff, not restart at 80ms');
    await harness.clock.advance(750);
    assert.equal(harness.instances.length, 2);

    // 2ª falha seguida -> espera 2000ms
    harness.instances[1].emitError('audio-capture');
    harness.instances[1].emitEnd();
    await harness.clock.advance(1500);
    assert.equal(harness.instances.length, 2, 'Must wait 2s backoff on 2nd failure');
    await harness.clock.advance(600);
    assert.equal(harness.instances.length, 3);

    // Quando onstart confirma sucesso, backoff reseta para 1000ms numa futura falha
    harness.instances[2].onstart({});
    await Promise.resolve();
    harness.instances[2].emitError('network');
    harness.instances[2].emitEnd();
    await harness.clock.advance(900);
    assert.equal(harness.instances.length, 3);
    await harness.clock.advance(150);
    assert.equal(harness.instances.length, 4);
  } finally {
    harness.unmount();
  }
});

test('real hook wakes on interim once, executes command once on isFinal after wake-word, and sleeps immediately', async () => {
  let wakeCalls = 0;
  const commands = [];
  const harness = await createVoiceHookHarness({
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    },
    hookProps: {
      isPlaying: true,
      onWakeWordDetected: () => { wakeCalls++; },
      onCommand: (action) => { commands.push(action); }
    }
  });
  try {
    const rec = harness.instances[0];
    // 1. Interim desperta e pausa o vídeo 1 vez, mas NÃO executa comando parcial
    rec.emitResult('Infinity aumentar', false, 0);
    await Promise.resolve();
    assert.equal(wakeCalls, 1);
    assert.equal(harness.getHook().isAwake, true);
    assert.deepEqual(commands, []);

    // Outro interim no mesmo resultIndex não re-dispara onWakeWordDetected
    rec.emitResult('Infinity aumentar vo', false, 0);
    await Promise.resolve();
    assert.equal(wakeCalls, 1);
    assert.deepEqual(commands, []);

    // 2. isFinal com texto anterior de filme antes de "Infinity" corta diálogo anterior e executa 1x
    rec.emitResult('para o carro agora infinity aumentar volume', true, 0);
    await Promise.resolve();
    assert.equal(wakeCalls, 1);
    assert.deepEqual(commands, ['VOLUME_UP']);
    assert.equal(harness.getHook().isAwake, false, 'Must deactivate awake immediately after command');

    // 3. Fala seguinte do filme sem wake-word continua ignorada
    rec.emitResult('pause isso agora mesmo', true, 1);
    await Promise.resolve();
    assert.deepEqual(commands, ['VOLUME_UP']);
  } finally {
    harness.unmount();
  }
});

test('voicePermissionService requests echoCancellation, falls back to audio:true, and NetflixPlayerSkin enforces 44px touch target', async () => {
  const calls = [];
  let shouldRejectFirst = false;

  const harness = await createVoiceHookHarness({
    hasPermissionsApi: false,
    initialStorage: {},
    onGetUserMedia(constraints) {
      calls.push(constraints);
      if (shouldRejectFirst && calls.length === 1) {
        throw new Error('OverconstrainedError');
      }
      return { getTracks: () => [{ stop: () => {} }] };
    }
  });

  const prevWindow = globalThis.window;
  const prevNavigator = globalThis.navigator;
  const prevLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'window', { value: harness.mockWindow, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: harness.mockWindow.navigator, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: harness.storage, configurable: true });

  try {
    const output = await esbuild.build({
      stdin: { contents: `export * from './src/services/voicePermissionService.ts';`, resolveDir: root, loader: 'ts' },
      bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false
    });
    const filename = path.join(root, 'tests/virtual-voice-perm.cjs');
    const compiled = new Module(filename, module);
    compiled.filename = filename; compiled.paths = module.paths;
    compiled._compile(output.outputFiles[0].text, filename);

    const ok = await compiled.exports.requestMicrophonePermission();
    assert.equal(ok, true);
    assert.deepEqual(calls[0], {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });

    calls.length = 0;
    shouldRejectFirst = true;
    const okFallback = await compiled.exports.requestMicrophonePermission();
    assert.equal(okFallback, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], { audio: true });
  } finally {
    harness.unmount();
    if (prevWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, 'window', { value: prevWindow, configurable: true });
    if (prevNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { value: prevNavigator, configurable: true });
    if (prevLocalStorage === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', { value: prevLocalStorage, configurable: true });
  }

  const skinSource = fs.readFileSync(path.join(root, 'src/components/NetflixPlayerSkin.tsx'), 'utf8');
  assert.match(
    skinSource,
    /\{\(voiceAwake \|\| \(voiceFeedback\.visible && voiceFeedback\.type === 'listening'\)\) && \(/,
    'Perimeter orange glow must only trigger when voiceAwake is true or listening feedback is visible'
  );
  assert.match(
    skinSource,
    /onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*if \(voiceAwake\) \{\s*toggleContinuousMode\(\);\s*\} else \{\s*triggerPushToTalk\(\);\s*\}\s*\}\}[\s\S]*?onContextMenu=\{\(e\) => \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*toggleContinuousMode\(\);\s*\}\}[\s\S]*?min-h-\[44px\] min-w-\[44px\]/,
    'Voice button must trigger awake listening on click, toggle on contextmenu/awake-click, and use 44x44px touch target'
  );
});

test('triggerPushToTalk keeps active recognition session, interim extends awake window, and onWakeExpired fires on timeout', async () => {
  let wakeCalls = 0;
  let expiredCalls = 0;
  const commands = [];
  const harness = await createVoiceHookHarness({
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    },
    hookProps: {
      isPlaying: true,
      onWakeWordDetected: () => { wakeCalls++; },
      onWakeExpired: () => { expiredCalls++; },
      onCommand: (action) => { commands.push(action); }
    }
  });
  try {
    assert.equal(harness.instances.length, 1);
    const rec = harness.instances[0];
    assert.equal(harness.getHook().isListening, true);

    // 1. Clique em triggerPushToTalk NÃO aborta sessão saudável já ouvindo e acorda o botão (laranja)
    await harness.getHook().triggerPushToTalk();
    await Promise.resolve();
    assert.equal(harness.instances.length, 1, 'Must keep live recognition session without creating blind gap');
    assert.equal(rec.aborted, false, 'Must NOT abort active recognition session on click');
    assert.equal(harness.getHook().isAwake, true);
    assert.equal(wakeCalls, 1);

    // 2. Interim aos 4s estende a janela de awake para não perder comando finalizado aos 6.5s
    await harness.clock.advance(4000);
    assert.equal(harness.getHook().isAwake, true);
    rec.emitResult('aumentar', false, 0);
    await harness.clock.advance(2500);
    assert.equal(harness.getHook().isAwake, true, 'Interim speech must extend awake timeout beyond initial 6s');

    rec.emitResult('aumentar volume', true, 0);
    await Promise.resolve();
    assert.deepEqual(commands, ['VOLUME_UP']);
    assert.equal(harness.getHook().isAwake, false);

    // 3. Se acordar e expirar sem comando, dispara onWakeExpired para retomar reprodução
    rec.emitResult('Infinity', true, 1);
    await Promise.resolve();
    assert.equal(harness.getHook().isAwake, true);
    await harness.clock.advance(4500);
    assert.equal(harness.getHook().isAwake, false);
    assert.equal(expiredCalls, 1, 'Must fire onWakeExpired when awake window times out without a command');
  } finally {
    harness.unmount();
  }
});

test('maxAlternatives=5 captures secondary phonetic matches and flushes distant interim commands on natural onend', async () => {
  const commands = [];
  let expiredCalls = 0;
  const harness = await createVoiceHookHarness({
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    },
    hookProps: {
      isPlaying: true,
      onWakeExpired: () => { expiredCalls++; },
      onCommand: (action) => { commands.push(action); }
    }
  });
  try {
    const rec1 = harness.instances[0];
    assert.equal(rec1.maxAlternatives, 5);

    // 1. Alternativa[0] veio errada pela distância/timbre, mas alternativa[2] trouxe "infinity aumentar volume"
    rec1.emitResult(['fim de semana', 'infinito nada', 'infinity aumentar volume'], true, 0);
    await Promise.resolve();
    assert.deepEqual(commands, ['VOLUME_UP']);
    assert.equal(harness.getHook().isAwake, false);

    // 2. Comando falado baixo no quarto captado apenas no interim (!isFinal) quando onend dispara por corte
    await harness.getHook().triggerPushToTalk();
    await Promise.resolve();
    assert.equal(harness.getHook().isAwake, true);
    rec1.emitResult('pausar', false, 1);
    await Promise.resolve();
    assert.deepEqual(commands, ['VOLUME_UP'], 'Interim must wait for isFinal while active');

    rec1.emitEnd();
    await Promise.resolve();
    assert.deepEqual(commands, ['VOLUME_UP', 'PAUSE'], 'Natural onend while awake must flush pending interim command');
    assert.equal(expiredCalls, 0, 'Must NOT treat flushed command as wake timeout');

    // 3. Reconexão após onend natural leva ~30ms (sem abort) em vez de 150ms
    await harness.clock.advance(40);
    assert.equal(harness.instances.length, 2, 'Natural onend reconnects in <= 40ms');
  } finally {
    harness.unmount();
  }
});

test('prevents long-idle zombie sessions via 50s hard cap, >=18 results recycle, and 2s network backoff cap', async () => {
  const harness = await createVoiceHookHarness({
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    }
  });
  try {
    assert.equal(harness.instances.length, 1);
    const rec1 = harness.instances[0];

    // 1. Diálogo contínuo de filme até 49.5s não deixa o guard de silêncio prender além do teto duro de 50s
    for (let t = 500; t <= 49500; t += 500) {
      await harness.clock.advance(500);
      rec1.emitResult('fala continua do filme sem wake', false, 0);
    }
    assert.equal(rec1.aborted, false, 'Continuous chatter before 50s avoids abrupt 45s mid-speech cut');

    await harness.clock.advance(500);
    rec1.emitResult('mais fala do filme', false, 0);
    await harness.clock.advance(1000);
    assert.equal(rec1.aborted, true, 'Hard cap at 50s must force renewal even under continuous movie audio');
    assert.equal(harness.instances.length, 1);

    await harness.clock.advance(150);
    assert.equal(harness.instances.length, 2);

    // 2. Acúmulo >= 18 resultados enquanto dormente recicla sessão imediatamente para renovar VAD/AGC
    const rec2 = harness.instances[1];
    rec2.emitResult('frase aleatoria do filme', true, 17);
    await Promise.resolve();
    assert.equal(rec2.aborted, true, 'Accumulating >= 18 results while asleep must recycle session');

    await harness.clock.advance(150);
    assert.equal(harness.instances.length, 3);

    // Mas se o índice 17 trouxe wake word (acordou!), NÃO deve reciclar no meio da janela de comando
    const rec3 = harness.instances[2];
    rec3.emitResult('infinity', true, 17);
    await Promise.resolve();
    assert.equal(harness.getHook().isAwake, true);
    assert.equal(rec3.aborted, false, 'Wake word at result >= 18 must NOT abort active awake window');
  } finally {
    harness.unmount();
  }

  // 3. Quedas consecutivas de rede ('network') limitam backoff a no máximo 2000ms (nunca 4s/8s/30s)
  const netHarness = await createVoiceHookHarness({
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    },
    autoStart: false
  });
  try {
    assert.equal(netHarness.instances.length, 1);
    // Falha 1 -> 1000ms
    netHarness.instances[0].emitError('network');
    netHarness.instances[0].emitEnd();
    await netHarness.clock.advance(1050);
    assert.equal(netHarness.instances.length, 2);

    // Falha 2 -> 2000ms
    netHarness.instances[1].emitError('network');
    netHarness.instances[1].emitEnd();
    await netHarness.clock.advance(2050);
    assert.equal(netHarness.instances.length, 3);

    // Falha 3 -> deveria ser 4000ms sem teto, mas para 'network' fica travado em <= 2000ms
    netHarness.instances[2].emitError('network');
    netHarness.instances[2].emitEnd();
    await netHarness.clock.advance(2050);
    assert.equal(netHarness.instances.length, 4, '3rd network failure must reconnect within <= 2s');

    // Falha 4 -> também travada em <= 2000ms
    netHarness.instances[3].emitError('network');
    netHarness.instances[3].emitEnd();
    await netHarness.clock.advance(2050);
    assert.equal(netHarness.instances.length, 5, '4th network failure must also reconnect within <= 2s');
  } finally {
    netHarness.unmount();
  }
});

test('mobile browsers (Samsung Internet/iOS): does not loop play/pause on duplicate results, respects audioFocus guard, and auto-heals on physical touch', async () => {
  const commands = [];
  let wakeCalls = 0;
  let expiredCalls = 0;
  const harness = await createVoiceHookHarness({
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    },
    hookProps: {
      isPlaying: true,
      onCommand: (action) => commands.push(action),
      onWakeWordDetected: () => wakeCalls++,
      onWakeExpired: () => expiredCalls++
    }
  });
  try {
    assert.equal(harness.instances.length, 1);
    const rec1 = harness.instances[0];

    // 1. "infinity reproduzir" executa PLAY sem pausar antes (wakeCalls === 0)
    rec1.emitResult('infinity reproduzir', true, 0);
    await Promise.resolve();
    assert.deepEqual(commands, ['PLAY']);
    assert.equal(wakeCalls, 0, 'Must NOT trigger pause onWakeWordDetected when command is PLAY');
    assert.equal(harness.getHook().isAwake, false, 'Awake must deactivate immediately upon executing command');

    // 2. Pacote duplicado tardio do Samsung Internet não dispara wake nem pause
    rec1.emitResult('infinity reproduzir', true, 0);
    await Promise.resolve();
    assert.equal(wakeCalls, 0, 'Duplicate packet within cooldown must NOT trigger wake');
    assert.deepEqual(commands, ['PLAY']);

    // 3. Após PLAY, onend aguarda pelo menos 800ms (PLAY_AUDIO_FOCUS_GUARD_MS) antes de reconectar
    rec1.emitEnd();
    await harness.clock.advance(300);
    assert.equal(harness.instances.length, 1, 'Must NOT reconnect immediately to avoid AudioFocus collision');
    await harness.clock.advance(550);
    assert.equal(harness.instances.length, 2, 'Reconnects after 800ms AudioFocus guard');

    // 4. Erro transitório 'not-allowed' em mobile com permissão concedida não desliga o modo contínuo
    const rec2 = harness.instances[1];
    rec2.emitError('not-allowed');
    await Promise.resolve();
    assert.equal(harness.getHook().isContinuous, true, 'Must preserve continuous mode on transient not-allowed');
    assert.equal(harness.storage.getItem('playinfinity_mic_permission'), 'granted');

    // 5. Toque físico na tela (User Gesture do clique em Play/skin) acorda a escuta na hora
    rec2.emitEnd();
    await harness.clock.advance(50);
    harness.mockWindow.dispatch('pointerdown');
    await harness.clock.advance(50);
    assert.equal(harness.instances.length, 3, 'User interaction (pointerdown) immediately auto-heals idle/blocked session');
  } finally {
    harness.unmount();
  }
});

test('Samsung Internet simulation: 2-step cumulative speech, mic abort before PLAY, AudioFocus guard and self-heal without play/pause loop', async () => {
  const SAMSUNG_UA =
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
  const events = [];
  let wakeCalls = 0;
  let audioFocusResumes = 0;
  let abortedBeforePlay = false;
  let harness;

  harness = await createVoiceHookHarness({
    userAgent: SAMSUNG_UA,
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    },
    hookProps: {
      isPlaying: false,
      onWakeWordDetected: () => {
        wakeCalls++;
        events.push('WAKE_PAUSE');
      },
      onAudioFocusConflict: () => {
        audioFocusResumes++;
        events.push('AUDIO_FOCUS_RESUME_PLAY');
        harness.setProps({ isPlaying: true });
      },
      onCommand: (action) => {
        if (action === 'PLAY') {
          abortedBeforePlay = harness.instances[0]?.aborted === true;
          harness.setProps({ isPlaying: true });
        } else if (action === 'PAUSE') {
          harness.setProps({ isPlaying: false });
        }
        events.push(action);
      }
    }
  });

  try {
    assert.equal(harness.instances.length, 1);
    const rec1 = harness.instances[0];

    // 1. Etapa 1 da fala no Android: usuário chama "Infinity" com o vídeo pausado
    rec1.emitCumulativeResults([{ text: 'Infinity', isFinal: true }], 0);
    await Promise.resolve();
    assert.equal(harness.getHook().isAwake, true);
    assert.equal(wakeCalls, 0);

    // 2. Etapa 2: Android re-emite array cumulativo começando em resultIndex = 0 com [0: "Infinity", 1: "reproduz"]
    rec1.emitCumulativeResults(
      [
        { text: 'Infinity', isFinal: true },
        { text: 'reproduz', isFinal: true }
      ],
      0
    );
    await Promise.resolve();
    assert.deepEqual(events, ['PLAY']);
    assert.equal(abortedBeforePlay, true, 'Mic session must be aborted BEFORE calling PLAY to release OS AudioFocus');
    assert.equal(harness.getHook().isAwake, false);

    // Re-emissão tardia ou eco do mesmo texto em < 3s é ignorada e não dispara wake/pause
    rec1.emitResult('infinity reproduz', true, 1);
    await Promise.resolve();
    assert.deepEqual(events, ['PLAY']);
    assert.equal(wakeCalls, 0);

    // 3. Watchdog e pointerdown dentro dos 2.5s pós-PLAY NÃO reiniciam o microfone prematuramente
    await harness.clock.advance(1000);
    harness.mockWindow.dispatch('pointerdown');
    await harness.clock.advance(500);
    assert.equal(harness.instances.length, 1, 'Must hold SpeechRecognition off for 2500ms after mobile PLAY');

    // Aos 2500ms, rec2 inicia normalmente
    await harness.clock.advance(1050);
    assert.equal(harness.instances.length, 2, 'Reconnects cleanly after 2500ms AudioFocus guard');

    // 4. Simula Samsung Internet roubando AudioFocus e pausando o <video> quando rec2.onstart roda
    await harness.clock.advance(200);
    const rec2 = harness.instances[1];
    harness.setProps({ isPlaying: false });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(audioFocusResumes, 1, 'Must detect unexpected pause after rec.start() and resume PLAY');
    assert.equal(rec2.aborted, false, 'Must keep SpeechRecognition listening so user can still call Infinity');
    assert.deepEqual(events, ['PLAY', 'AUDIO_FOCUS_RESUME_PLAY']);

    // 5. Após o cooldown de 2.2s pós-PLAY, diálogos do filme em resultIndex = 0 (isFinal: true)
    // NÃO bloqueiam chamadas futuras de "Infinity" reutilizando resultIndex = 0 no Android!
    await harness.clock.advance(2500);
    rec2.emitResult('vamos correr para casa agora', true, 0);
    await Promise.resolve();
    assert.equal(harness.getHook().isAwake, false);

    // 6. Usuário fala "Infinity" (mesmo se STT PT-BR colocar "enfim" na 1ª alternativa e "infinity" na 2ª em resultIndex = 0)
    rec2.emitResult(['enfim', 'infinity'], true, 0);
    await Promise.resolve();
    assert.equal(harness.getHook().isAwake, true, 'Saying Infinity at reused resultIndex = 0 must wake assistant');
    assert.equal(wakeCalls, 1, 'Waking while video is playing must pause video to listen');
    assert.match(harness.getHook().feedback.text, /Ouvindo comando/);

    // 7. Em seguida usuário diz "pausar" em resultIndex = 0 e o comando é executado
    rec2.emitResult('pausar', true, 0);
    await Promise.resolve();
    assert.equal(harness.getHook().isAwake, false);
    assert.deepEqual(events, ['PLAY', 'AUDIO_FOCUS_RESUME_PLAY', 'WAKE_PAUSE', 'PAUSE']);
  } finally {
    harness.unmount();
  }
});

test('Microsoft Edge simulation: network error switches to WebAudio /api/voice-stt fallback and executes commands without loop', async () => {
  const events = [];
  const sttRequests = [];
  let activeProcessor = null;

  class MockAudioContext {
    constructor() {
      this.sampleRate = 48000;
      this.state = 'running';
      this.destination = {};
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createScriptProcessor() {
      activeProcessor = {
        onaudioprocess: null,
        connect() {},
        disconnect() {}
      };
      return activeProcessor;
    }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
    async close() {
      this.state = 'closed';
    }
  }

  const harness = await createVoiceHookHarness({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    AudioContext: MockAudioContext,
    fetch: async (url, init) => {
      sttRequests.push({ url, byteLength: init?.body?.byteLength || 0 });
      return {
        ok: true,
        async json() {
          return {
            success: true,
            alternatives: sttRequests.length === 1 ? ['Infinity'] : ['pausar']
          };
        }
      };
    },
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    },
    hookProps: {
      isPlaying: true,
      onCommand: (action) => events.push(action),
      onWakeWordDetected: () => events.push('WAKE_PAUSE')
    }
  });

  try {
    assert.equal(harness.instances.length, 1);
    const rec1 = harness.instances[0];

    // 1. Edge dispara 'network' logo após onstart
    rec1.emitError('network');
    rec1.emitEnd();

    // Avança 200ms -> em vez de criar nova instância de SpeechRecognition em loop,
    // ativa o motor WebAudio + /api/voice-stt
    await harness.clock.advance(200);
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(harness.instances.length, 1, 'Edge must NOT loop new SpeechRecognition instances after network error');
    assert.ok(activeProcessor && typeof activeProcessor.onaudioprocess === 'function', 'WebAudio ScriptProcessor must be active');
    assert.equal(harness.getHook().isListening, true, 'WebAudio fallback must mark assistant as listening');

    // Helper para simular quadros de áudio (4096 amostras a 48kHz)
    const feedFrames = (amplitude, count) => {
      const buf = new Float32Array(4096);
      buf.fill(amplitude);
      for (let i = 0; i < count; i++) {
        activeProcessor.onaudioprocess({
          inputBuffer: { getChannelData: () => buf }
        });
      }
    };

    // 2. Simula silêncio inicial (pre-roll), depois fala "Infinity" (4 quadros) + silêncio (5 quadros)
    feedFrames(0.002, 3);
    feedFrames(0.08, 4);
    feedFrames(0.002, 5);
    for (let i = 0; i < 8; i++) await Promise.resolve();

    assert.equal(sttRequests.length, 1, 'VAD must send 1st utterance to /api/voice-stt');
    assert.ok(sttRequests[0].byteLength > 4800, 'Sent PCM 16kHz buffer must include pre-roll + speech');
    assert.equal(harness.getHook().isAwake, true, 'Wake word from /api/voice-stt must wake assistant in Edge');
    assert.deepEqual(events, ['WAKE_PAUSE']);

    // 3. Simula usuário falando "pausar" (4 quadros) + silêncio (5 quadros)
    feedFrames(0.08, 4);
    feedFrames(0.002, 5);
    for (let i = 0; i < 8; i++) await Promise.resolve();

    assert.equal(sttRequests.length, 2, 'VAD must send 2nd utterance to /api/voice-stt');
    assert.equal(harness.getHook().isAwake, false);
    assert.deepEqual(events, ['WAKE_PAUSE', 'PAUSE']);
  } finally {
    harness.unmount();
  }
});

test('logs heard speech, wake status, understood action and rejection reason to F12 console', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args);

  const harness = await createVoiceHookHarness({
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    },
    hookProps: {
      isPlaying: true,
      onCommand: () => {}
    }
  });

  try {
    const rec = harness.instances[0];
    // 1. Fala sem wake-word válido -> registra no F12 o que ouviu + motivo da rejeição
    rec.emitResult('enfinite nada', true, 0);
    // 2. Fala "Infinity" seguido de comando não mapeado -> registra trecho após wake
    rec.emitResult('Infinity abre menu secreto', true, 1);
    // 3. Fala reconhecida -> registra comando entendido e execução
    rec.emitResult(['Infinity tela cheia', 'infiniti tela cheia'], true, 2);

    const flat = logs.map((entry) => String(entry[0] || ''));
    assert.ok(flat.some((s) => s.includes('Ouviu: "enfinite nada"') && s.includes('Wake "Infinity": NÃO')));
    assert.ok(flat.some((s) => s.includes('Ouviu: "Infinity abre menu secreto"') && s.includes('não casou')));
    assert.ok(flat.some((s) => s.includes('Ouviu: "Infinity tela cheia"') && s.includes('Entendeu: FULLSCREEN')));
    assert.ok(flat.some((s) => s.includes('Executado') && s.includes('FULLSCREEN')));
  } finally {
    console.log = origLog;
    harness.unmount();
  }
});

test('Android mobile (APK/Chrome): uses zero-AudioFocus WebAudio engine, resumes suspended 16kHz AudioContext, catches soft AEC speech, and recovers ended mic track', async () => {
  const ANDROID_APK_UA =
    'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.135 Mobile Safari/537.36 PlayInfinityApp/1.4.92 (vc:124)';
  const events = [];
  const sttRequests = [];
  let activeProcessor = null;
  let resumeCalls = 0;
  let getUserMediaCalls = 0;
  let latestTrack = null;

  class MockMobileAudioContext {
    constructor() {
      this.sampleRate = 16000; // Android VOICE_COMMUNICATION frequentemente opera em 16kHz
      this.state = 'suspended';
      this.destination = {};
    }
    async resume() {
      resumeCalls++;
      this.state = 'running';
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createScriptProcessor(bufferSize) {
      this.bufferSize = bufferSize;
      activeProcessor = {
        bufferSize,
        onaudioprocess: null,
        connect() {},
        disconnect() {}
      };
      return activeProcessor;
    }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
    async close() {
      this.state = 'closed';
    }
  }

  const harness = await createVoiceHookHarness({
    userAgent: ANDROID_APK_UA,
    AudioContext: MockMobileAudioContext,
    onGetUserMedia() {
      getUserMediaCalls++;
      latestTrack = {
        readyState: 'live',
        onended: null,
        stop() { this.readyState = 'ended'; }
      };
      return {
        getAudioTracks: () => [latestTrack],
        getTracks: () => [latestTrack]
      };
    },
    fetch: async (url, init) => {
      sttRequests.push({ url, byteLength: init?.body?.byteLength || 0 });
      return {
        ok: true,
        async json() {
          return {
            success: true,
            alternatives: sttRequests.length === 1 ? ['Infinity'] : ['pular abertura']
          };
        }
      };
    },
    initialStorage: {
      playinfinity_mic_permission: 'granted',
      playinfinity_voice_continuous: 'true'
    },
    hookProps: {
      isPlaying: true,
      onCommand: (action) => events.push(action),
      onWakeWordDetected: () => events.push('WAKE_PAUSE')
    }
  });

  try {
    for (let i = 0; i < 6; i++) await Promise.resolve();

    // 1. No celular com WebAudio disponível, usa getUserMedia direto (0 instâncias de SpeechRecognition disputando AudioFocus!)
    assert.equal(harness.instances.length, 0, 'Mobile with WebAudio must bypass SpeechRecognition AudioFocus conflict');
    assert.equal(getUserMediaCalls, 1);
    assert.ok(resumeCalls >= 1, 'Must call ctx.resume() on suspended mobile AudioContext');
    assert.ok(activeProcessor && activeProcessor.bufferSize === 1024, '16kHz AudioContext must use 1024-sample (~64ms) buffer');
    assert.equal(harness.getHook().isListening, true);

    const feedFrames16k = (amplitude, count) => {
      const buf = new Float32Array(1024); // 64ms por frame a 16kHz
      buf.fill(amplitude);
      for (let i = 0; i < count; i++) {
        activeProcessor.onaudioprocess({
          inputBuffer: { getChannelData: () => buf }
        });
      }
    };

    // 2. Fala suave com atenuação de AEC mobile (rms = 0.009, abaixo do antigo piso quebrado de 0.013!)
    feedFrames16k(0.001, 4); // silêncio
    feedFrames16k(0.009, 6); // ~384ms dizendo "Infinity"
    feedFrames16k(0.001, 7); // ~448ms de silêncio -> dispara envio
    for (let i = 0; i < 8; i++) await Promise.resolve();

    assert.equal(sttRequests.length, 1, 'Soft mobile AEC voice (rms=0.009) must trigger /api/voice-stt');
    assert.equal(harness.getHook().isAwake, true, 'Assistant must wake up and respond visually');
    assert.match(harness.getHook().feedback.text, /Ouvindo comando/);
    assert.deepEqual(events, ['WAKE_PAUSE']);

    // 3. Comando subsequente "pular abertura" dentro da janela de 6s
    feedFrames16k(0.011, 6);
    feedFrames16k(0.001, 7);
    for (let i = 0; i < 8; i++) await Promise.resolve();

    assert.equal(sttRequests.length, 2);
    assert.equal(harness.getHook().isAwake, false);
    assert.deepEqual(events, ['WAKE_PAUSE', 'SKIP_INTRO']);

    // 4. Se o Android encerrar a track do microfone (notificação/chamada), reconecta automaticamente
    latestTrack.readyState = 'ended';
    if (latestTrack.onended) latestTrack.onended();
    await harness.clock.advance(400);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    assert.equal(getUserMediaCalls, 2, 'Ended MediaStreamTrack must automatically reopen microphone session');

    // 5. Se onaudioprocess congelar por >4s (ex: transição tela cheia / GC mobile aos ~10s), o watchdog reinicia a captura sozinho!
    await harness.clock.advance(4600);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    assert.equal(getUserMediaCalls, 3, 'Frozen onaudioprocess (>4s without frames) must auto-heal via watchdog');
    assert.equal(harness.instances.length, 0, 'Must never fall back to broken mobile SpeechRecognition');
  } finally {
    harness.unmount();
  }
});
