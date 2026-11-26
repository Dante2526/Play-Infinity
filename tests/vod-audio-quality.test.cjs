const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');

function loadTsModule(relPath) {
  const build = esbuild.buildSync({
    entryPoints: [path.join(root, relPath)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  const filename = path.join(root, relPath);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod._compile(build.outputFiles[0].text, filename);
  return mod.exports;
}

test('ARTPLAYER_VOLUME_FIX_SNIPPET repara volume 0.7 salvo no localStorage para 1.0 (100%)', () => {
  const { ARTPLAYER_VOLUME_FIX_SNIPPET } = loadTsModule('server/utils/playerAudioBoost.ts');
  const store = { artplayer_settings: JSON.stringify({ volume: 0.7, muted: false }) };
  const sandbox = {
    localStorage: {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); },
    }
  };
  vm.runInNewContext(ARTPLAYER_VOLUME_FIX_SNIPPET, sandbox);
  const repaired = JSON.parse(store.artplayer_settings);
  assert.equal(repaired.volume, 1, 'Volume 0.7 antigo do Artplayer deve ser elevado para 1');
});

test('buildPlayerAudioNormalizerScript aplica EQ+Compressor+Gain+Limiter em same-origin/blob e NUNCA muta cross-origin ou AudioContext suspenso', async () => {
  const { buildPlayerAudioNormalizerScript } = loadTsModule('server/utils/playerAudioBoost.ts');
  const script = buildPlayerAudioNormalizerScript('videoEl');

  function runHarness(src, initialCtxState = 'running') {
    const connections = [];
    const nodes = [];
    const videoListeners = {};
    const videoEl = {
      currentSrc: src,
      src,
      addEventListener(type, fn) {
        (videoListeners[type] ||= []).push(fn);
      }
    };

    class MockAudioContext {
      constructor() {
        this.state = initialCtxState;
        this.destination = { kind: 'destination' };
        this.closed = false;
      }
      resume() {
        if (initialCtxState === 'resumable') {
          this.state = 'running';
          return Promise.resolve();
        }
        return Promise.resolve();
      }
      close() { this.closed = true; this.state = 'closed'; }
      createMediaElementSource(el) {
        const n = { kind: 'source', el, connect(dest) { connections.push(['source', dest.kind]); } };
        nodes.push(n);
        return n;
      }
      createBiquadFilter() {
        const n = { kind: 'biquad', type: '', frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 }, connect(dest) { connections.push(['biquad', dest.kind]); } };
        nodes.push(n);
        return n;
      }
      createDynamicsCompressor() {
        const count = nodes.filter(x => x.kind.startsWith('comp')).length;
        const kind = count === 0 ? 'comp_dialogue' : 'comp_limiter';
        const n = { kind, threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect(dest) { connections.push([kind, dest.kind]); } };
        nodes.push(n);
        return n;
      }
      createGain() {
        const n = { kind: 'gain', gain: { value: 1 }, connect(dest) { connections.push(['gain', dest.kind]); } };
        nodes.push(n);
        return n;
      }
    }

    const sandbox = {
      videoEl,
      URL,
      setTimeout: () => 0,
      window: {
        location: { origin: 'https://play-infinity.stream', href: 'https://play-infinity.stream/api/byse-proxy-iframe' },
        AudioContext: MockAudioContext,
        addEventListener: () => {},
      }
    };
    vm.runInNewContext(script, sandbox);
    for (const fn of videoListeners.play || []) fn();
    return { videoEl, nodes, connections };
  }

  // 1. Same-origin (/api/byse-stream) -> conecta cadeia completa com makeup gain 1.45 e limiter
  const sameOrigin = runHarness('/api/byse-stream?ticket=abc', 'running');
  assert.equal(sameOrigin.videoEl.__piAudioBoosted, true);
  assert.deepEqual(sameOrigin.connections, [
    ['source', 'biquad'],
    ['biquad', 'comp_dialogue'],
    ['comp_dialogue', 'gain'],
    ['gain', 'comp_limiter'],
    ['comp_limiter', 'destination'],
  ]);
  const gainNode = sameOrigin.nodes.find(n => n.kind === 'gain');
  assert.equal(gainNode.gain.value, 1.45);

  // 2. Blob MSE (hls.js / mp4-mse-engine) -> também conecta com segurança
  const blobMse = runHarness('blob:https://play-infinity.stream/1234', 'running');
  assert.equal(blobMse.videoEl.__piAudioBoosted, true);

  // 3. Cross-origin sem CORS -> NUNCA chama createMediaElementSource (evita áudio mudo!)
  const crossOrigin = runHarness('https://cdn.externo.invalid/video.mp4', 'running');
  assert.equal(crossOrigin.videoEl.__piAudioBoosted, undefined);
  assert.equal(crossOrigin.connections.length, 0);

  // 4. AudioContext preso em suspended (autoplay bloqueado) -> NUNCA captura o <video> antes de rodar
  const suspended = runHarness('/api/saimo-stream?id=1', 'suspended');
  assert.equal(suspended.videoEl.__piAudioBoosted, undefined);
  assert.equal(suspended.connections.length, 0);
});

test('guards dos 4 pontos de áudio: Android MODE_NORMAL, Artplayer volume:1 e BYSE/Saimo ABR HD', () => {
  const voiceHook = fs.readFileSync(path.join(root, 'src/hooks/usePlayerVoiceAssistant.ts'), 'utf8');
  assert.ok(
    voiceHook.includes('{ echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }'),
    'Microfone contínuo mobile deve desativar echoCancellation para não forçar MODE_IN_COMMUNICATION no Android'
  );

  const byseCore = fs.readFileSync(path.join(root, 'server/services/byse/core.ts'), 'utf8');
  assert.ok(byseCore.includes('capLevelToPlayerSize: false'), 'BYSE não deve limitar qualidade/áudio ao CSS width do celular');
  assert.ok(byseCore.includes('abrEwmaDefaultEstimate: 4000000'), 'BYSE deve iniciar ABR em estimativa HD (4 Mbps)');
  assert.ok(byseCore.includes('buildPlayerAudioNormalizerScript'), 'BYSE deve incluir normalizador seguro de áudio');

  const saimo = fs.readFileSync(path.join(root, 'server/routes/saimoRoutes.ts'), 'utf8');
  assert.ok(saimo.includes('lowLatencyMode: false'), 'Saimo VOD não deve usar lowLatencyMode: true');
  assert.ok(saimo.includes('capLevelToPlayerSize: false'), 'Saimo deve liberar nível HD no celular');
  assert.ok(saimo.includes('abrEwmaDefaultEstimate: 4000000'), 'Saimo deve iniciar ABR em estimativa HD');
  assert.ok(saimo.includes('buildPlayerAudioNormalizerScript'), 'Saimo deve incluir normalizador seguro de áudio');

  const mixdrop = fs.readFileSync(path.join(root, 'server/routes/mixdrop.ts'), 'utf8');
  assert.ok(mixdrop.includes('volume: 1'), 'MixDrop Artplayer deve iniciar em volume: 1 (100%)');
  assert.ok(mixdrop.includes('ARTPLAYER_VOLUME_FIX_SNIPPET'), 'MixDrop deve reparar localStorage.artplayer_settings.volume=0.7');
  assert.ok(mixdrop.includes('buildPlayerAudioNormalizerScript'), 'MixDrop deve incluir normalizador seguro de áudio');

  const scrapers = fs.readFileSync(path.join(root, 'server/routes/videoScrapers.ts'), 'utf8');
  assert.ok(scrapers.includes('ARTPLAYER_VOLUME_FIX_SNIPPET'), 'WatchPlay/VIP devem reparar volume 0.7 salvo no localStorage');
  assert.ok(scrapers.includes('buildPlayerAudioNormalizerScript'), 'WatchPlay/VIP devem incluir normalizador seguro de áudio');

  const streamtape = fs.readFileSync(path.join(root, 'server/routes/streamtapeRoutes.ts'), 'utf8');
  assert.ok(streamtape.includes('buildPlayerAudioNormalizerScript'), 'StreamTape deve incluir normalizador seguro de áudio');
});
