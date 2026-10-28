const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const express = require('express');
const esbuild = require('esbuild');
const nativeFetch = global.fetch;
const root = path.resolve(__dirname, '..');
const media = Buffer.from('0123456789abcdefghij');
const mediaUrl = 'https://video.mxcontent.net/v2/object-name.mp4?fixture=1';
let proxy, recovery, server, base, options, calls;

function complete(start = 0, end = 19, status = 206, etag = '"file-a"') {
  return new Response(media.subarray(start, end + 1), {
    status, headers: {
      'content-type': 'video/mp4', 'content-length': String(end - start + 1),
      'accept-ranges': 'bytes', ...(etag ? { etag } : {}),
      ...(status === 206 ? { 'content-range': `bytes ${start}-${end}/20` } : {}),
    },
  });
}
function interrupted({ start = 0, end = 19, firstBytes = 5, status = 200, hang = false, unknownLength = false, signal }) {
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(media.subarray(start, start + firstBytes));
      if (!hang) setTimeout(() => controller.error(new Error('Simulated CDN reset')), 20);
      else signal?.addEventListener('abort', () => {
        try { controller.error(new Error('Simulated abort')); } catch {}
      }, { once: true });
    },
  }), { status, headers: {
    'content-type': 'video/mp4', etag: '"file-a"',
    ...(!unknownLength ? { 'content-length': String(end - start + 1) } : {}),
    ...(status === 206 ? { 'content-range': `bytes ${start}-${end}/20` } : {}),
  } });
}

before(async () => {
  const result = await esbuild.build({
    absWorkingDir: root,
    stdin: { contents: `
      export { default as router } from './server/routes/mixdrop';
      export { proxyMixdropVideo } from './server/services/mixdropProxy';
      export { createMixdropRecovery } from './server/services/mixdropRecovery';
    `, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external',
    plugins: [{ name: 'embed-fixture', setup(build) {
      build.onResolve({ filter: /encontreiLookup$/ }, args => ({ path: args.path, namespace: 'catalogue-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'catalogue-fixture' }, () => ({ contents: 'export const getMixdropSources=async()=>[];' }));
      build.onResolve({ filter: /utils\/helpers/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
        export const validateSafeUrl = value => ({valid:true,parsedUrl:new URL(value)});
        export const isPrivateOrLocalIp = () => false;
        export const isPrivateOrLocalHost = () => false;
      ` }));
    } }],
  });
  const filename = path.join(root, 'tests', 'virtual-mixdrop.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(result.outputFiles[0].text, filename);
  proxy = compiled.exports.proxyMixdropVideo;
  recovery = compiled.exports.createMixdropRecovery;
  const app = express();
  app.get('/proxy', (req, res) => proxy(req, res, options));
  app.use(compiled.exports.router);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  calls = [];
  options = {
    videoUrl: mediaUrl, idleTimeoutMs: 40, headerTimeoutMs: 40,
    fetchImpl: async (url, request) => { calls.push({ url, ...request }); return complete(); },
  };
});
after(async () => {
  global.fetch = nativeFetch;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

test('forwards exact byte ranges and prevents Nginx buffering', async () => {
  options.fetchImpl = async (url, request) => { calls.push(request); return complete(3, 14); };
  const response = await nativeFetch(base + '/proxy', { headers: { Range: 'bytes=3-14' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 3-14/20');
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  assert.equal(await response.text(), media.subarray(3, 15).toString());
  assert.equal(calls[0].headers.Range, 'bytes=3-14');
});

test('resumes a reset full response at the first missing byte without duplicates', async () => {
  options.fetchImpl = async (url, request) => {
    calls.push(request);
    return calls.length === 1 ? interrupted({ signal: request.signal }) : complete(5, 19);
  };
  const response = await nativeFetch(base + '/proxy');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), media.toString());
  assert.equal(calls[1].headers.Range, 'bytes=5-19');
  assert.equal(calls[1].headers['If-Range'], '"file-a"');
});

test('resumes a partial seek response with the correct absolute byte offset', async () => {
  options.fetchImpl = async (url, request) => {
    calls.push(request);
    return calls.length === 1 ? interrupted({ start: 3, end: 14, firstBytes: 4, status: 206 }) : complete(7, 14);
  };
  const response = await nativeFetch(base + '/proxy', { headers: { Range: 'bytes=3-14' } });
  assert.equal(await response.text(), media.subarray(3, 15).toString());
  assert.equal(calls[1].headers.Range, 'bytes=7-14');
});

test('uses Last-Modified for safe resume when the CDN has no strong ETag', async () => {
  options.fetchImpl = async (url, request) => {
    calls.push(request);
    const response = calls.length === 1 ? interrupted({}) : complete(5, 19);
    response.headers.delete('etag');
    response.headers.set('last-modified', 'Thu, 22 Oct 2026 00:00:00 GMT');
    response.headers.set('date', 'Thu, 22 Oct 2026 01:00:00 GMT');
    return response;
  };
  assert.equal(await (await nativeFetch(base + '/proxy')).text(), media.toString());
  assert.equal(calls[1].headers['If-Range'], 'Thu, 22 Oct 2026 00:00:00 GMT');
});

test('refuses to splice a response without a strong object validator', async () => {
  options.fetchImpl = async (url, request) => {
    calls.push(request);
    const response = interrupted({});
    response.headers.delete('etag');
    return response;
  };
  await assert.rejects(async () => (await nativeFetch(base + '/proxy')).text());
  assert.equal(calls.length, 1);
});

test('detects body inactivity after headers and resumes the stalled CDN', async () => {
  let invalidations = 0; options.onStreamError = () => invalidations++;
  options.fetchImpl = async (url, request) => {
    calls.push(request);
    return calls.length === 1 ? interrupted({ hang: true, signal: request.signal }) : complete(5, 19);
  };
  assert.equal(await (await nativeFetch(base + '/proxy')).text(), media.toString());
  assert.equal(calls.length, 2);
  assert.equal(calls[1].headers.Range, 'bytes=5-19');
  assert.equal(invalidations, 1);
});

test('resumes a real upstream HTTP connection reset without changing the video bytes', async () => {
  const http = require('node:http');
  const payload = Buffer.alloc(256 * 1024, 73);
  const ranges = [];
  const upstream = http.createServer((req, res) => {
    ranges.push(req.headers.range);
    const start = req.headers.range ? Number(req.headers.range.match(/bytes=(\d+)/)[1]) : 0;
    res.writeHead(start ? 206 : 200, {
      'content-type': 'video/mp4', 'content-length': String(payload.length - start), etag: '"real-file"',
      ...(start ? { 'content-range': `bytes ${start}-${payload.length - 1}/${payload.length}` } : {}),
    });
    if (!start) {
      res.write(payload.subarray(0, 64 * 1024));
      setTimeout(() => res.destroy(), 20);
    } else res.end(payload.subarray(start));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  options.headerTimeoutMs = 1000; options.idleTimeoutMs = 200;
  options.fetchImpl = (url, request) => nativeFetch(`http://127.0.0.1:${upstream.address().port}/video`, request);
  try {
    const result = Buffer.from(await (await nativeFetch(base + '/proxy')).arrayBuffer());
    assert.deepEqual(result, payload);
    assert.equal(ranges.length, 2);
    assert.equal(ranges[1], `bytes=65536-${payload.length - 1}`);
  } finally { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); }
});

test('renews an expired token and retries the original range', async () => {
  let renewals = 0;
  options.renewUrl = async () => { renewals++; return 'https://other.mxcontent.net/v2/object-name.mp4?new=1'; };
  options.fetchImpl = async (url, request) => {
    calls.push({ url, ...request });
    return calls.length === 1 ? new Response('expired', { status: 403 }) : complete(3, 14);
  };
  const response = await nativeFetch(base + '/proxy', { headers: { Range: 'bytes=3-14' } });
  assert.equal(await response.text(), media.subarray(3, 15).toString());
  assert.equal(renewals, 1);
  assert.equal(calls[1].headers.Range, 'bytes=3-14');
  assert.match(calls[1].url, /other\.mxcontent\.net/);
});

test('rejects a resumed full 200, changed object, or wrong offset instead of corrupting bytes', async () => {
  for (const second of [() => complete(0, 19, 200), () => complete(5, 19, 206, '"file-b"'), () => complete(4, 19)]) {
    calls = [];
    options.fetchImpl = async (url, request) => {
      calls.push(request);
      return calls.length === 1 ? interrupted({}) : second();
    };
    await assert.rejects(async () => (await nativeFetch(base + '/proxy')).arrayBuffer());
    assert.ok(calls.length <= 3);
  }
});

test('does not report a truncated chunked HTTP 200 as a successful video', async () => {
  options.fetchImpl = async (url, request) => {
    calls.push(request);
    return interrupted({ unknownLength: true });
  };
  await assert.rejects(async () => (await nativeFetch(base + '/proxy')).text());
  assert.equal(calls.length, 1);
});

test('stops retrying on disconnect and cancels the upstream request', async () => {
  let aborted = false;
  options.fetchImpl = async (url, request) => {
    calls.push(request);
    request.signal.addEventListener('abort', () => { aborted = true; });
    return interrupted({ hang: true, signal: request.signal });
  };
  const controller = new AbortController();
  const response = await nativeFetch(base + '/proxy', { signal: controller.signal });
  const reader = response.body.getReader();
  await reader.read();
  controller.abort();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(aborted, true);
  assert.equal(calls.length, 1);
});

test('bounds header timeouts and returns an error rather than an empty successful video', async () => {
  options.fetchImpl = async (url, request) => {
    calls.push(request);
    return new Promise((resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('timeout'))));
  };
  const response = await nativeFetch(base + '/proxy');
  assert.equal(response.status, 502);
  assert.equal(calls.length, 3);
});

test('rejects invalid hosts, schemes, credentials, and redirects without fetching them', async () => {
  for (const url of ['http://video.mxcontent.net/a', 'https://mxcontent.net.attacker.invalid/a', 'https://127.0.0.1/?mxcontent.net', 'https://user:secret@video.mxcontent.net/a']) {
    options.videoUrl = url;
    assert.equal((await nativeFetch(base + '/proxy')).status, 400);
  }
  assert.equal(calls.length, 0);
  options.videoUrl = mediaUrl;
  options.fetchImpl = async (url, request) => {
    calls.push(url);
    assert.equal(url, mediaUrl);
    return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } });
  };
  assert.equal((await nativeFetch(base + '/proxy')).status, 502);
});

test('supports suffix ranges and rejects invalid or multi-range requests', async () => {
  options.fetchImpl = async () => complete(15, 19);
  const suffix = await nativeFetch(base + '/proxy', { headers: { Range: 'bytes=-5' } });
  assert.equal(await suffix.text(), 'fghij');
  for (const range of ['bytes=5-1', 'bytes=-0', 'bytes=0-3,6-7']) {
    assert.equal((await nativeFetch(base + '/proxy', { headers: { Range: range } })).status, 416);
  }
});

test('downstream backpressure is not mistaken for an idle CDN', async () => {
  const req = new EventEmitter(); req.headers = {};
  const res = new EventEmitter(); let body = Buffer.alloc(0);
  res.headersSent = false; res.setHeader = res.removeHeader = () => {};
  res.status = () => res;
  res.write = chunk => {
    res.headersSent = true; body = Buffer.concat([body, chunk]);
    setTimeout(() => res.emit('drain'), 80);
    return false;
  };
  let ended = false; res.end = () => { ended = true; }; res.destroy = () => assert.fail('Unexpected stream termination');
  options.idleTimeoutMs = 20;
  await proxy(req, res, options);
  assert.equal(ended, true);
  assert.deepEqual(body, media);
  assert.equal(calls.length, 1);
});

function browser(source) {
  let clock = 100000, buffer = 0;
  const intervals = new Map(), events = new Map(), windowEvents = new Map(), messages = [];
  let nextId = 0, loads = 0, plays = 0;
  const video = {
    currentTime: 619, duration: 3119, paused: false, ended: false, seeking: false,
    readyState: 2, networkState: 2, volume: 1, playbackRate: 1,
    buffered: { get length() { return buffer > 0 ? 1 : 0; }, start() { return video.currentTime; }, end() { return video.currentTime + buffer; } },
    addEventListener(name, fn, opts) { const list = events.get(name) || []; list.push({ fn, once: opts?.once }); events.set(name, list); },
    removeEventListener(name, fn) { events.set(name, (events.get(name) || []).filter(item => item.fn !== fn)); },
    emit(name) { for (const item of [...(events.get(name) || [])]) { if (item.once) video.removeEventListener(name, item.fn); item.fn(); } },
    pause() { video.paused = true; video.emit('pause'); },
    play() { plays++; video.paused = false; video.emit('play'); video.emit('playing'); return Promise.resolve(); },
    load() { loads++; video.currentTime = 0; video.readyState = 0; },
    setAttribute() {}, getVideoPlaybackQuality() { return { totalVideoFrames: 100, droppedVideoFrames: 0 }; },
  };
  const window = { location: { href: 'http://fixture/api/md-stream' }, parent: { postMessage: value => messages.push(value) },
    addEventListener(name, fn) { const list = windowEvents.get(name) || []; list.push(fn); windowEvents.set(name, list); } };
  const context = vm.createContext({
    video, window, options: { sourceUrl: '/api/md-proxy?fileId=original', onFatal: reason => messages.push({ type: 'FATAL', reason }) },
    document: { querySelector: () => video, addEventListener() {}, getElementById: () => null, visibilityState: 'visible' },
    Date: class extends Date { static now() { return clock; } },
    console: new Proxy({}, { get: () => () => {} }),
    setInterval(fn) { const id = ++nextId; intervals.set(id, fn); return id; }, clearInterval(id) { intervals.delete(id); },
    setTimeout() { return ++nextId; }, clearTimeout() {},
    Artplayer: class {
      constructor() { this.video = video; }
      get currentTime() { return video.currentTime; } set currentTime(value) { video.currentTime = value; }
      get playing() { return !video.paused; } on() {} play() { return video.play(); } pause() { video.pause(); }
    },
  });
  vm.runInContext(source || `window.recovery = (${recovery.toString()})(video, options);`, context);
  return {
    video, messages, context, get loads() { return loads; }, get plays() { return plays; },
    get controller() { return context.window.recovery; },
    setBuffer(value) { buffer = value; },
    tick(seconds = 1) { for (let i = 0; i < seconds; i++) { clock += 1000; for (const fn of [...intervals.values()]) fn(); } },
    command(type, extra = {}) { for (const fn of windowEvents.get('message') || []) fn({ data: { type, ...extra } }); },
  };
}

test('waits for a five-second reserve instead of restarting on a tiny canplay buffer', () => {
  const b = browser(); b.video.emit('waiting');
  assert.equal(b.controller.holding, true);
  b.setBuffer(1.4); b.video.readyState = 4; b.video.emit('canplay'); b.tick(2);
  assert.equal(b.plays, 0);
  b.setBuffer(5.2); b.tick();
  assert.equal(b.plays, 1);
  assert.equal(b.controller.holding, false);
});

test('recovery handles waiting with positive buffered time but no future decodable data', () => {
  const b = browser(); b.setBuffer(0.73); b.video.readyState = 2;
  b.video.emit('waiting');
  assert.equal(b.controller.holding, true);
  assert.equal(b.video.paused, true);
  b.setBuffer(5.2); b.video.readyState = 3; b.tick();
  assert.equal(b.plays, 1);
});

test('user pause during rebuffer never triggers automatic resume', () => {
  const b = browser(); b.video.emit('waiting');
  b.controller.command('PAUSE'); b.video.pause();
  b.setBuffer(6); b.video.readyState = 4; b.tick(30);
  assert.equal(b.plays, 0); assert.equal(b.loads, 0);
  assert.equal(b.messages.length, 0);
});

test('mobile read-ahead idle policy can resume with a smaller decoded reserve', () => {
  const b = browser(); b.video.emit('waiting');
  b.setBuffer(2.2); b.video.readyState = 4; b.video.networkState = 1; b.tick();
  assert.equal(b.plays, 1);
});

test('pausing during source reload preserves position without forcing playback', () => {
  const b = browser(); b.video.emit('waiting'); b.tick(12);
  b.controller.command('PAUSE'); b.video.pause(); b.video.emit('loadedmetadata');
  b.setBuffer(6); b.video.readyState = 4; b.tick(30);
  assert.equal(b.video.currentTime, 619); assert.equal(b.plays, 0);
});

test('one bounded source reload restores the same position and falls back if recovery fails', () => {
  const b = browser(); b.video.emit('waiting'); b.tick(12);
  assert.equal(b.loads, 1);
  b.video.emit('loadedmetadata'); assert.equal(b.video.currentTime, 619);
  b.tick(20);
  assert.equal(b.loads, 1);
  assert.equal(b.messages.filter(m => m.type === 'FATAL').length, 1);
  b.tick(10); assert.equal(b.messages.filter(m => m.type === 'FATAL').length, 1);
});

test('manual seek cancels a pending source-position restore', () => {
  const b = browser(); b.video.emit('waiting'); b.tick(12);
  b.controller.command('SEEK_ABSOLUTE'); b.video.currentTime = 900;
  b.video.emit('loadedmetadata');
  assert.equal(b.video.currentTime, 900);
});

test('near the end, resumes with remaining content instead of waiting for impossible reserve', () => {
  const b = browser(); b.video.currentTime = 3118; b.video.emit('waiting');
  b.setBuffer(0.99); b.video.readyState = 4; b.tick();
  assert.equal(b.plays, 1);
});

test('ended or paused videos are not reloaded by the recovery timer', () => {
  for (const ended of [false, true]) {
    const b = browser(); b.video.ended = ended; b.video.paused = !ended;
    b.video.emit('waiting'); b.tick(25);
    assert.equal(b.loads, 0); assert.equal(b.messages.length, 0);
  }
});

async function playerHtml() {
  const source = 'MDCore.wurl=' + JSON.stringify(mediaUrl) + ';';
  const packed = '<title>MixDrop - Watch fixture</title><script>eval(function(p,a,c,k,e,d){return ' + JSON.stringify(source) + ';}("x",1,1,"",0,{}))</script>';
  global.fetch = async url => {
    assert.ok(new URL(url).pathname.endsWith('/originalEmbedId'));
    return new Response(packed);
  };
  try {
    const response = await nativeFetch(base + '/api/md-stream?url=' + encodeURIComponent('https://mxdrop.top/e/originalEmbedId'));
    assert.equal(response.status, 200);
    return await response.text();
  } finally { global.fetch = nativeFetch; }
}

test('generated iframe keeps the original embed ID when the CDN filename differs', async () => {
  const html = await playerHtml();
  assert.ok(html.includes('&fileId=originalEmbedId'));
});

test('router renews using the explicit original embed ID, sharing concurrent refreshes', async () => {
  let embedRequests = 0;
  const freshUrl = 'https://renewed.mxcontent.net/v2/different-object.mp4?fresh=1';
  const source = 'MDCore.wurl=' + JSON.stringify(freshUrl) + ';';
  const packed = '<script>eval(function(p,a,c,k,e,d){return ' + JSON.stringify(source) + ';}("x",1,1,"",0,{}))</script>';
  global.fetch = async url => {
    const parsed = new URL(url);
    if (parsed.hostname === 'mxdrop.top') {
      assert.equal(parsed.pathname, '/e/originalRefreshId');
      embedRequests++;
      await new Promise(resolve => setTimeout(resolve, 20));
      return new Response(packed);
    }
    return parsed.hostname === 'renewed.mxcontent.net' ? complete(0, 19, 200) : new Response('expired', { status: 403 });
  };
  try {
    const request = () => nativeFetch(base + '/api/md-proxy?url=' + encodeURIComponent(mediaUrl) + '&fileId=originalRefreshId');
    const responses = await Promise.all([request(), request()]);
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(await response.text(), media.toString());
    }
    assert.equal(embedRequests, 1);
  } finally { global.fetch = nativeFetch; }
});

test('actual iframe HTML reports persistent dry-buffer duration and applies relative seek', async () => {
  const html = await playerHtml();
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(text => text.includes('new Artplayer'));
  const b = browser(script);
  b.video.emit('playing'); b.video.emit('waiting'); b.tick(8);
  const stalls = b.messages.filter(m => m.type === 'NIXPLAY_TELEMETRY_EVENT' && m.event === 'stall');
  assert.ok(stalls.some(m => m.duration >= 7 && m.bufferAhead === 0));
  assert.equal(b.messages.filter(m => m.type === 'WATCHPLAY_ERROR').length, 0);
  assert.equal(b.loads, 1);
  assert.match(b.video.src, /refresh=1/);
  b.video.emit('loadedmetadata');
  b.command('SEEK_RELATIVE', { seconds: 0.01 });
  assert.equal(b.video.currentTime, 619.01);
});

test('toggle pause during iframe rebuffer is treated as user pause', async () => {
  const html = await playerHtml();
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(text => text.includes('new Artplayer'));
  const b = browser(script); b.video.emit('waiting');
  b.command('TOGGLE_PLAY'); b.setBuffer(6); b.video.readyState = 4; b.tick(10);
  assert.equal(b.video.paused, true);
  assert.equal(b.plays, 0);
});

test('catalogue-backed recovery uses a shorter bounded retry window before trying another copy', () => {
  const b = browser();
  b.context.options.reloadAfterMs = 4000; b.context.options.stallTimeoutMs = 10000; b.context.options.retryWindowMs = 6000;
  b.video.emit('waiting'); b.tick(4); assert.equal(b.loads, 1);
  b.tick(6); assert.equal(b.messages.filter(message => message.type === 'FATAL').length, 1);
});
