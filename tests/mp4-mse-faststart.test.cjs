const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const express = require('express');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

function loadMseModule(sandboxGlobals) {
  const engineSrc = fs.readFileSync(path.join(root, 'public', 'mp4-mse-engine.js'), 'utf8');
  const fakeModule = { exports: {} };
  const fakeWindow = Object.assign({}, sandboxGlobals);
  fakeWindow.window = fakeWindow;
  new Function('module', 'window', 'globalThis', engineSrc)(fakeModule, fakeWindow, fakeWindow);
  return fakeModule.exports;
}

/**
 * Monta um MP4 sintético válido para o parser/fragmentador do engine.
 * 20 samples de 500ms (10s total), 1000 bytes/sample, keyframes a cada 1.0s.
 */
function buildSyntheticMp4({ extraMoovPad = 0, moovAtTail = false, mdatBytes = 20000 }) {
  const { _BoxWriter: BoxWriter } = loadMseModule({});
  const sampleCount = 20;
  const sampleSize = 1000;
  const syncSamples = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]; // 0s, 1s, ..., 9s
  const mdatPayload = new Uint8Array(Math.max(mdatBytes, sampleCount * sampleSize));
  for (let i = 0; i < mdatPayload.length; i++) mdatPayload[i] = (i * 31) & 0xff;

  const ftyp = new BoxWriter().box('ftyp', (f) => {
    f.ascii('isom'); f.u32(0); f.ascii('iso2'); f.ascii('mp41');
  }).build();

  function buildMoov(chunkOffset) {
    return new BoxWriter().box('moov', (m) => {
      m.box('mvhd', (mv) => {
        mv.u8(0); mv.u24(0);
        mv.u32(0); mv.u32(0);
        mv.u32(1000); mv.u32(10000);
        mv.u32(0x00010000);
        mv.u16(0x0100); mv.u16(0);
        mv.u32(0); mv.u32(0);
        mv.matrix();
        for (let i = 0; i < 6; i++) mv.u32(0);
        mv.u32(2);
      });
      if (extraMoovPad > 0) {
        m.box('free', (fr) => fr.raw(new Uint8Array(extraMoovPad)));
      }
      m.box('trak', (t) => {
        t.box('tkhd', (tk) => {
          tk.u8(0); tk.u24(0x7);
          tk.u32(0); tk.u32(0);
          tk.u32(1); tk.u32(0);
          tk.u32(10000);
          tk.u32(0); tk.u32(0);
          tk.u16(0); tk.u16(0); tk.u16(0); tk.u16(0);
          tk.matrix();
          tk.u32(320 << 16); tk.u32(240 << 16);
        });
        t.box('mdia', (md) => {
          md.box('mdhd', (mh) => {
            mh.u8(0); mh.u24(0);
            mh.u32(0); mh.u32(0);
            mh.u32(1000); mh.u32(10000);
            mh.u16(0x55c4); mh.u16(0);
          });
          md.box('hdlr', (h) => {
            h.u8(0); h.u24(0);
            h.u32(0); h.ascii('vide');
            h.u32(0); h.u32(0); h.u32(0);
            h.ascii('Video\x00');
          });
          md.box('minf', (mi) => {
            mi.box('vmhd', (v) => { v.u8(0); v.u24(1); v.u16(0); v.u16(0); v.u16(0); v.u16(0); });
            mi.box('dinf', (d) => {
              d.box('dref', (dr) => {
                dr.u8(0); dr.u24(0); dr.u32(1);
                dr.box('url ', (u) => { u.u8(0); u.u24(1); });
              });
            });
            mi.box('stbl', (sb) => {
              sb.box('stsd', (sd) => {
                sd.u8(0); sd.u24(0); sd.u32(1);
                sd.box('avc1', (av) => {
                  av.raw(new Uint8Array(6)); // reserved
                  av.u16(1);                 // data_reference_index
                  av.u16(0); av.u16(0);      // pre_defined / reserved
                  av.u32(0); av.u32(0); av.u32(0);
                  av.u16(320); av.u16(240);
                  av.u32(0x00480000); av.u32(0x00480000);
                  av.u32(0); av.u16(1);
                  av.raw(new Uint8Array(32)); // compressorname
                  av.u16(24); av.u16(0xffff);
                  av.box('avcC', (c) => {
                    c.raw(new Uint8Array([1, 0x64, 0x00, 0x1f, 0xff, 0xe1, 0, 1, 0x67, 1, 0, 1, 0x68]));
                  });
                });
              });
              sb.box('stts', (s) => { s.u8(0); s.u24(0); s.u32(1); s.u32(sampleCount); s.u32(500); });
              sb.box('stsc', (s) => { s.u8(0); s.u24(0); s.u32(1); s.u32(1); s.u32(sampleCount); s.u32(1); });
              sb.box('stsz', (s) => { s.u8(0); s.u24(0); s.u32(sampleSize); s.u32(sampleCount); });
              sb.box('stss', (s) => {
                s.u8(0); s.u24(0); s.u32(syncSamples.length);
                for (const idx of syncSamples) s.u32(idx);
              });
              sb.box('stco', (s) => { s.u8(0); s.u24(0); s.u32(1); s.u32(chunkOffset); });
            });
          });
        });
      });
    }).build();
  }

  const mdatBox = new BoxWriter().box('mdat', (md) => md.raw(mdatPayload)).build();
  const probeMoov = buildMoov(0);
  const dataOffset = moovAtTail ? (ftyp.length + 8) : (ftyp.length + probeMoov.length + 8);
  const moov = buildMoov(dataOffset);
  assert.equal(moov.length, probeMoov.length);

  const total = new Uint8Array(ftyp.length + moov.length + mdatBox.length);
  let pos = 0;
  total.set(ftyp, pos); pos += ftyp.length;
  if (moovAtTail) {
    total.set(mdatBox, pos); pos += mdatBox.length;
    total.set(moov, pos);
  } else {
    total.set(moov, pos); pos += moov.length;
    total.set(mdatBox, pos);
  }
  return { bytes: total, dataOffset, moovSize: moov.length, ftypSize: ftyp.length };
}

function createMseTestHarness(mp4Bytes) {
  const requests = [];
  const appends = [];
  const nativeFetch = global.fetch;
  const nativeCreateObjectURL = URL.createObjectURL;
  const nativeRevokeObjectURL = URL.revokeObjectURL;

  class FakeTimeRanges {
    constructor(ranges) { this._ranges = ranges; }
    get length() { return this._ranges.length; }
    start(i) { return this._ranges[i][0]; }
    end(i) { return this._ranges[i][1]; }
  }

  class FakeEmitter {
    constructor() { this._l = new Map(); }
    addEventListener(type, fn) {
      if (!this._l.has(type)) this._l.set(type, new Set());
      this._l.get(type).add(fn);
    }
    removeEventListener(type, fn) { this._l.get(type)?.delete(fn); }
    dispatch(type, extra = {}) {
      const ev = { type, target: this, ...extra };
      for (const fn of [...(this._l.get(type) || [])]) fn(ev);
    }
  }

  let currentEndSec = 0;
  class FakeSourceBuffer extends FakeEmitter {
    constructor() {
      super();
      this.updating = false;
      this.buffered = new FakeTimeRanges([]);
      this.mode = 'segments';
    }
    appendBuffer(ab) {
      appends.push(new Uint8Array(ab));
      this.updating = true;
      queueMicrotask(() => {
        this.updating = false;
        if (appends.length === 2) currentEndSec = 2;
        else if (appends.length >= 3) currentEndSec = 8;
        this.buffered = currentEndSec > 0 ? new FakeTimeRanges([[0, currentEndSec]]) : new FakeTimeRanges([]);
        this.dispatch('updateend');
      });
    }
    remove() {}
    abort() {}
  }

  let activeMs = null;
  class FakeMediaSource extends FakeEmitter {
    constructor() {
      super();
      this.readyState = 'closed';
      this.duration = NaN;
      activeMs = this;
    }
    static isTypeSupported(mime) { return typeof mime === 'string' && mime.startsWith('video/mp4'); }
    addSourceBuffer() { return new FakeSourceBuffer(); }
    endOfStream() { this.readyState = 'ended'; }
    close() { this.readyState = 'closed'; }
  }

  const video = new FakeEmitter();
  video.currentTime = 0;
  video.paused = false;
  video.ended = false;
  video.seeking = false;
  video.readyState = 0;
  let _src = '';
  Object.defineProperty(video, 'src', {
    get() { return _src; },
    set(val) {
      _src = val;
      if (activeMs) {
        queueMicrotask(() => {
          activeMs.readyState = 'open';
          activeMs.dispatch('sourceopen');
        });
      }
    },
  });

  const fakeFetch = async (url, init = {}) => {
    const rangeHeader = String(init.headers?.Range || init.headers?.range || '');
    const m = rangeHeader.match(/bytes=(\d+)-(\d+)/);
    assert.ok(m, `Expected Range header, got "${rangeHeader}"`);
    const start = Number(m[1]);
    const end = Math.min(Number(m[2]), mp4Bytes.length - 1);
    const slice = mp4Bytes.subarray(start, end + 1);
    requests.push({ url, range: rangeHeader, start, end, bytes: slice.length });
    return new Response(slice, {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${start}-${end}/${mp4Bytes.length}`,
        'Content-Length': String(slice.length),
      },
    });
  };

  URL.createObjectURL = () => 'blob:mock-mse-object';
  URL.revokeObjectURL = () => {};
  global.fetch = fakeFetch;

  const mse = loadMseModule({
    MediaSource: FakeMediaSource,
    fetch: fakeFetch,
    URL,
  });

  return {
    mse,
    video,
    requests,
    appends,
    restore() {
      global.fetch = nativeFetch;
      URL.createObjectURL = nativeCreateObjectURL;
      URL.revokeObjectURL = nativeRevokeObjectURL;
    },
  };
}

async function waitUntil(pred, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('Timed out waiting for condition');
}

test('mp4-mse-engine uses 256KB prologue, stitches remaining moov bytes without re-fetch, and loads 1.5s initial window', async () => {
  const fixture = buildSyntheticMp4({ extraMoovPad: 320 * 1024, moovAtTail: false });
  assert.ok(fixture.ftypSize + fixture.moovSize > 256 * 1024);
  const harness = createMseTestHarness(fixture.bytes);
  let eng;
  try {
    let fallback = null;
    let fatal = null;
    eng = harness.mse.attach(harness.video, 'https://example.invalid/video.mp4', {
      onFallback: (r) => { fallback = r; },
      onFatal: (r) => { fatal = r; },
    });
    await waitUntil(() => eng.stats.windows >= 2 || fallback || fatal);
    assert.equal(fallback, null);
    assert.equal(fatal, null);

    // Sem Range 0-0 redundante; Req 0 = prologue 256 KB; Req 1 = resto do moov a partir de 262144
    assert.equal(harness.requests.some((r) => r.range === 'bytes=0-0'), false);
    assert.equal(harness.requests[0].range, 'bytes=0-262143');
    const expectedMoovEnd = fixture.ftypSize + fixture.moovSize - 1;
    assert.equal(harness.requests[1].range, `bytes=262144-${expectedMoovEnd}`);

    // Janela inicial usa initialSegmentSeconds (1.5s -> keyframe 2.0s = 4 samples = 4000B)
    // Segunda janela usa segmentSeconds (6s -> [2s..8s) = 12 samples = 12000B)
    assert.equal(harness.requests[2].start, fixture.dataOffset);
    assert.equal(harness.requests[2].bytes, 4000);
    assert.equal(harness.requests[3].start, fixture.dataOffset + 4000);
    assert.equal(harness.requests[3].bytes, 12000);
  } finally {
    if (eng) eng.destroy();
    harness.restore();
  }
});

test('mp4-mse-engine reuses Content-Range totalFileBytes on tail-moov files without Range bytes=0-0', async () => {
  const fixture = buildSyntheticMp4({ mdatBytes: 300 * 1024, moovAtTail: true });
  const harness = createMseTestHarness(fixture.bytes);
  let eng;
  try {
    let fallback = null;
    let fatal = null;
    eng = harness.mse.attach(harness.video, 'https://example.invalid/classic.mp4', {
      onFallback: (r) => { fallback = r; },
      onFatal: (r) => { fatal = r; },
    });
    await waitUntil(() => eng.stats.windows >= 1 || fallback || fatal);
    assert.equal(fallback, null);
    assert.equal(fatal, null);

    assert.equal(harness.requests[0].range, 'bytes=0-262143');
    assert.equal(harness.requests.some((r) => r.range === 'bytes=0-0'), false);
    // Req 1 busca tail com moov no final do arquivo; Req 2 baixa apenas os 4000B da janela inicial
    assert.equal(harness.requests[1].end, fixture.bytes.length - 1);
    assert.equal(harness.requests[2].start, fixture.dataOffset);
    assert.equal(harness.requests[2].bytes, 4000);
  } finally {
    if (eng) eng.destroy();
    harness.restore();
  }
});

test('streamtape proxy-iframe defers autoplay until canplay when MSE attaches, emits WATCHPLAY_READY, and starts immediately without MSE', async () => {
  const nativeFetch = global.fetch;
  const result = await esbuild.build({
    stdin: {
      contents: `export * from './server/routes/streamtapeRoutes';`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    write: false,
    plugins: [{
      name: 'catalog-fixture',
      setup(build) {
        build.onResolve({ filter: /encontreiLookup$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
        build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: `export const getStreamtapeSources = async()=>[];`,
        }));
      },
    }],
  });

  const filename = path.join(root, 'tests/virtual-streamtape-faststart.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(result.outputFiles[0].text, filename);

  const app = express();
  app.use(compiled.exports.streamtapeRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  let html = '';
  try {
    global.fetch = async (url) => {
      const target = String(url);
      if (target.startsWith('https://streamtape.com/e/st-fast/')) {
        return new Response(
          `<html><div id="robotlink"></div><script>document.getElementById('robotlink').innerHTML = "//streamtape.com/get_video?id=st-fast&token=ok";</script></html>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }
      if (target.startsWith('https://streamtape.com/get_video')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://video.tapecontent.net/stream/st-fast.mp4' },
        });
      }
      throw new Error('Unexpected fetch URL in fixture: ' + target);
    };
    const res = await nativeFetch(`${base}/api/streamtape-proxy-iframe?fileId=st-fast`);
    assert.equal(res.status, 200);
    html = await res.text();
  } finally {
    global.fetch = nativeFetch;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  const scriptMatch = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/);
  assert.ok(scriptMatch, 'Expected inline player script in streamtape-proxy-iframe HTML');
  const inlineScript = scriptMatch[1];

  function runPlayerHtmlScript({ mseAvailable, rejectFirstPlay = false }) {
    const videoListeners = new Map();
    const windowListeners = new Map();
    const postedMessages = [];
    const intervals = [];
    let playCalls = 0;

    const video = {
      src: '',
      currentSrc: '',
      currentTime: 0,
      duration: 120,
      paused: true,
      muted: false,
      volume: 1,
      playbackRate: 1,
      readyState: 0,
      buffered: { length: 0, start: () => 0, end: () => 0 },
      addEventListener(type, fn) {
        if (!videoListeners.has(type)) videoListeners.set(type, []);
        videoListeners.get(type).push(fn);
      },
      dispatch(type) {
        for (const fn of (videoListeners.get(type) || [])) fn({ type, target: video });
      },
      play() {
        playCalls++;
        if (rejectFirstPlay && playCalls === 1) {
          return Promise.reject(Object.assign(new Error('Autoplay blocked'), { name: 'NotAllowedError' }));
        }
        video.paused = false;
        return Promise.resolve();
      },
      pause() { video.paused = true; },
    };

    const sandboxWindow = {
      location: { href: 'http://127.0.0.1/api/streamtape-proxy-iframe?fileId=st-fast' },
      parent: { postMessage(msg) { postedMessages.push(msg); } },
      addEventListener(type, fn) {
        if (!windowListeners.has(type)) windowListeners.set(type, []);
        windowListeners.get(type).push(fn);
      },
      dispatchMessage(data) {
        for (const fn of (windowListeners.get('message') || [])) fn({ data });
      },
    };
    if (mseAvailable) {
      sandboxWindow.MediaSource = { isTypeSupported: () => true };
      sandboxWindow.PlayInfinityMp4Mse = {
        attach(v) {
          return { destroy() {} };
        },
      };
    }

    const ctx = {
      window: sandboxWindow,
      document: { getElementById: () => video },
      console,
      setInterval: (fn) => { const id = intervals.length + 1; intervals.push(id); return id; },
      clearInterval: () => {},
      setTimeout,
      clearTimeout,
      encodeURIComponent,
      AbortController,
      fetch: async () => new Response(JSON.stringify({ proxyUrl: '/fresh' }), { status: 200 }),
    };

    vm.runInNewContext(inlineScript, ctx);
    return { video, sandboxWindow, postedMessages, getPlayCalls: () => playCalls };
  }

  // Cenário A1: Com MSE anexado, play() NÃO roda em t=0 sem src, mas roda em canplay + emite WATCHPLAY_READY
  {
    const env = runPlayerHtmlScript({ mseAvailable: true });
    assert.equal(env.getPlayCalls(), 0, 'Must not call video.play() before MSE assigns blob URL');
    env.video.src = 'blob:mse-stream';
    env.video.readyState = 1;
    env.video.dispatch('loadedmetadata');
    assert.ok(env.postedMessages.some((m) => m.type === 'WATCHPLAY_READY'));
    assert.equal(env.getPlayCalls(), 0);
    env.video.readyState = 3;
    env.video.dispatch('canplay');
    assert.equal(env.getPlayCalls(), 1);
  }

  // Cenário A2: Autoplay com áudio bloqueado cai para muted + postMessage WATCHPLAY_AUTOPLAY_MUTED
  {
    const env = runPlayerHtmlScript({ mseAvailable: true, rejectFirstPlay: true });
    env.video.src = 'blob:mse-stream';
    env.video.readyState = 3;
    env.video.dispatch('loadeddata');
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(env.getPlayCalls(), 2);
    assert.equal(env.video.muted, true);
    assert.ok(env.postedMessages.some((m) => m.type === 'WATCHPLAY_AUTOPLAY_MUTED'));
  }

  // Cenário A3: PAUSE explícito da skin antes de canplay impede autoplay indesejado
  {
    const env = runPlayerHtmlScript({ mseAvailable: true });
    env.video.src = 'blob:mse-stream';
    env.sandboxWindow.dispatchMessage({ type: 'PAUSE' });
    env.video.readyState = 3;
    env.video.dispatch('canplay');
    assert.equal(env.getPlayCalls(), 0);
  }

  // Cenário A4: SET_MUTED enviado pelo comando de voz/skin muta e desmuta corretamente
  {
    const env = runPlayerHtmlScript({ mseAvailable: true });
    assert.equal(env.video.muted, false);
    env.sandboxWindow.dispatchMessage({ type: 'SET_MUTED', muted: true });
    assert.equal(env.video.muted, true);
    env.sandboxWindow.dispatchMessage({ type: 'SET_MUTED', muted: false });
    assert.equal(env.video.muted, false);
  }

  // Cenário B: Sem MSE, atribui streamUrl direto e chama play() imediatamente
  {
    const env = runPlayerHtmlScript({ mseAvailable: false });
    assert.match(env.video.src, /^\/api\/streamtape-stream\?/);
    assert.equal(env.getPlayCalls(), 1);
  }
});
