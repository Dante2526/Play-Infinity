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
      results[resultIndex] = Object.assign([{ transcript }], { isFinal });
      this.onresult({ resultIndex, results });
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
    SpeechRecognition: MockSpeechRecognition,
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
