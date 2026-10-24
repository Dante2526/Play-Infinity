const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const nativeFetch = global.fetch;
let api;
const listing = '<html><title>Vizer</title><a href="/series/online/example-dublado-123/">Example</a></html>';
async function compile(route = false) {
  const root = path.resolve(__dirname, '..');
  const output = await esbuild.build({
    stdin: { contents: `export * from './server/services/vizerDomains';${route ? "export {default as router} from './server/routes/encontreiLookup'; export {getVizerCatalogStatus,getStreamtapeSources,getMixdropSources,getByseSources,getPlaybackCataloguePresence} from './server/routes/encontreiLookup';" : ''}`, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{ name: 'no-external-catalogue', setup(build) {
      build.onResolve({ filter: /^fs$|vidsrcRoutes$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'fs' ? `export default {existsSync:p=>!!globalThis.__vizerCatalogueFixture && String(p).endsWith('-catalog.json'), statSync:()=>({mtimeMs:1}), readFileSync:p=>JSON.stringify(globalThis.__vizerCatalogueFixture[String(p).includes('vizer-catalog')?'vizer':'encontrei'])};` : 'export const checkVidsrcSeason=async()=>false;' }));
    } }],
  });
  const filename = path.join(root, 'tests/virtual-vizer.cjs');
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename); return compiled.exports;
}
beforeEach(async () => { api = await compile(); });
afterEach(() => { global.fetch = nativeFetch; delete global.__vizerCatalogueFixture; });

test('health and resolver share the current configured domain order', async () => {
  const calls = [];
  global.fetch = async raw => { calls.push(raw); return new Response(listing); };
  const result = await api.checkVizerHealth();
  assert.equal(calls[0], 'https://www.vizer.press/series/online/');
  assert.equal(result.url, api.VIZER_DOMAINS[0]); assert.equal(result.status, 'ONLINE');
  assert.equal(api.getVizerWorkingDomain(), result.url);
});
test('a failed primary falls back and the working domain becomes preferred by later resolver calls', async () => {
  global.fetch = async raw => raw.includes('.press/') ? new Response('', { status: 503 }) : new Response(listing);
  const result = await api.checkVizerHealth();
  assert.equal(result.status, 'ONLINE'); assert.equal(result.url, 'https://www.vizer.uno');
  assert.equal(api.getVizerDomainOrder()[0], result.url);
});
test('migration redirects report the actual validated domain rather than the old configured URL', async () => {
  api.rememberVizerDomain('https://www.vizer.reisen');
  global.fetch = async raw => raw.includes('.reisen/') ? new Response(null, { status: 302, headers: { location: 'https://www.vizer.press/series/online/' } }) : new Response(listing);
  const result = await api.checkVizerHealth();
  assert.equal(result.url, 'https://www.vizer.press'); assert.equal(result.redirectedFrom, 'https://www.vizer.reisen');
});
test('HTTP 200 login, challenge or parked pages do not count as an available catalogue', async () => {
  for (const html of ['<title>Log In</title>' + listing, '<title>Just a moment...</title>' + listing, '<title>Domain for sale</title>']) {
    global.fetch = async () => new Response(html);
    const result = await api.checkVizerHealth();
    assert.equal(result.status, 'OFFLINE'); assert.match(result.error, /validar a listagem/);
  }
});
test('an unrelated redirect is never contacted or remembered', async () => {
  const calls = [];
  global.fetch = async raw => { calls.push(raw); return new Response(null, { status: 302, headers: { location: 'https://unrelated.invalid/private?token=secret' } }); };
  const result = await api.checkVizerHealth();
  assert.equal(result.status, 'OFFLINE'); assert.match(result.error, /domínio não configurado/);
  assert.equal(calls.length, api.VIZER_DOMAINS.length); assert.ok(calls.every(raw => !raw.includes('unrelated')));
  api.rememberVizerDomain('https://unrelated.invalid'); assert.equal(api.getVizerWorkingDomain(), null);
  assert.doesNotMatch(JSON.stringify(result), /secret|private/);
});
test('network timeouts are bounded and do not expose raw upstream exceptions', async () => {
  global.fetch = async (_, { signal }) => new Promise((resolve, reject) => {
    const stop = () => reject(new Error('private-cookie-secret'));
    if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true });
  });
  const keepAlive = setInterval(() => {}, 10);
  try {
    const result = await api.checkVizerHealth({ timeoutMs: 30, phaseTimeoutMs: 12 });
    assert.equal(result.status, 'OFFLINE'); assert.ok(result.latencyMs < 500); assert.doesNotMatch(JSON.stringify(result), /secret/);
  } finally { clearInterval(keepAlive); }
});
test('listing response bodies are bounded and cancelled after enough data is inspected', async () => {
  let cancelled = 0;
  global.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(listing + ' '.repeat(300000))); }, cancel() { cancelled++; } }));
  assert.equal((await api.checkVizerHealth()).status, 'ONLINE'); assert.equal(cancelled, 1);
});
test('Vizer-only content is returned by the public lookup and remains cached after live domain failure', async () => {
  api = await compile(true);
  const express = require('express'); const app = express(); app.use(api.router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const oldCookie = process.env.ENCONTREI_COOKIE; delete process.env.ENCONTREI_COOKIE;
  let healthy = true;
  global.fetch = async raw => {
    if (!healthy) throw new Error('domain unavailable');
    const url = new URL(raw);
    assert.ok(url.hostname.startsWith('www.vizer.'));
    if (url.searchParams.get('do') === 'episodesList') return Response.json({ episodes: [{ number: '1', url: '/episodios/online/example-1x1-dublado-124/' }] });
    if (url.searchParams.get('do') === 'playerData') return Response.json({ servers_dub: 'mixdrop=vizer-only-file&streamtape=vizer-tape', current_audio: 'Dublado' });
    if (url.pathname.includes('example-dublado-123')) return new Response('<div data-tmdb-id="999001"></div>' + ' '.repeat(600));
    return new Response(listing + ' '.repeat(600));
  };
  const endpoint = `http://127.0.0.1:${server.address().port}/api/encontrei-lookup?tmdb_id=999001&type=tv&season=1&episode=1&name=Example`;
  try {
    const first = await (await nativeFetch(endpoint)).json();
    assert.equal(first.mixdrop_vizer, 'vizer-only-file'); assert.equal(first.mixdrop_encontrei, null); assert.equal(first.source, 'vizer-live');
    healthy = false; assert.equal((await api.checkVizerHealth()).status, 'OFFLINE');
    const cached = await (await nativeFetch(endpoint)).json(); assert.equal(cached.mixdrop_vizer, 'vizer-only-file');
    assert.equal(api.getVizerCatalogStatus().series > 0, true);
  } finally {
    if (oldCookie === undefined) delete process.env.ENCONTREI_COOKIE; else process.env.ENCONTREI_COOKIE = oldCookie;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

test('both catalogue StreamTape-only entries are exposed for the exact episode without requiring MixDrop or live scans', async () => {
  global.__vizerCatalogueFixture = {
    encontrei: { episodes: [{ tmdb_id: 999003, season: 1, episode: 4, audio: 'Dublado', servers: { streamtape: 'enc-episode4' } }] },
    vizer: { episodes: [{ tmdb_id: 999003, season: 1, episode: 4, audio: 'Dublado', servers: { streamtape: 'vizer-episode4' } }, { tmdb_id: 999003, season: 1, episode: 3, audio: 'Dublado', servers: { streamtape: 'wrong-episode3' } }] },
  };
  api = await compile(true);
  let calls = 0; global.fetch = async () => { calls++; throw new Error('Do not need live lookup'); };
  const results = await api.getStreamtapeSources(999003, 1, 4, 'Exact episode');
  assert.deepEqual(results, [{ fileId: 'enc-episode4', source: 'encontrei', audio: 'Dublado' }, { fileId: 'vizer-episode4', source: 'vizer', audio: 'Dublado' }]);
  assert.equal(calls, 0);
});

test('MixDrop selection reads both movie catalogues separately from StreamTape and TV IDs', async () => {
  global.__vizerCatalogueFixture = {
    encontrei: { movies: [{ tmdb_id: 999005, audio: 'Dublado', servers: { mixdrop: 'md-enc', streamtape: 'st-enc' } }] },
    vizer: { movies: [{ tmdb_id: 999005, audio: 'Dublado', servers: { mixdrop: 'md-vizer' } }], episodes: [{ tmdb_id: 999005, season: 1, episode: 1, servers: { mixdrop: 'wrong-tv-file' } }] },
  };
  api = await compile(true);
  const results = await api.getMixdropSources(999005);
  assert.deepEqual(results.map(source => source.fileId), ['md-enc', 'md-vizer']);
});

test('BYSE catalogue discovery selects exact episodes from both sources without requiring another hoster',async()=>{
 global.__vizerCatalogueFixture={encontrei:{episodes:[{tmdb_id:999007,season:1,episode:4,audio:'Dublado',servers:{byse:'byse-enc-ep4'}}]},vizer:{episodes:[{tmdb_id:999007,season:1,episode:3,servers:{byse:'wrong-ep3'}},{tmdb_id:999007,season:1,episode:4,audio:'Legendado',servers:{byse:'byse-vizer-ep4'}}]}};
 api=await compile(true);const sources=await api.getByseSources(999007,1,4,'Example');assert.deepEqual(sources.map(x=>x.fileId),['byse-enc-ep4','byse-vizer-ep4']);assert.equal(sources[0].audio,'Dublado');
});

test('startup catalogue hints distinguish exact episodes without treating absent entries as proof',async()=>{
 global.__vizerCatalogueFixture={encontrei:{episodes:[{tmdb_id:999009,season:1,episode:4,servers:{mixdrop:'md4'}}]},vizer:{episodes:[{tmdb_id:999009,season:1,episode:3,servers:{byse:'wrong3'}},{tmdb_id:999009,season:1,episode:4,servers:{streamtape:'st4'}}]}};
 api=await compile(true);const p=api.getPlaybackCataloguePresence(999009,1,4);assert.equal(p.srv_byse.listed,false);assert.equal(p.srv_mixdrop.listed,true);assert.equal(p.srv_streamtape.listed,true);assert.equal(api.getPlaybackCataloguePresence(999009,1,99).srv_mixdrop.listed,false);
});

test('one live playerData response refreshes all startup hints and preserves audio per provider',async()=>{
 const cookie=process.env.ENCONTREI_COOKIE;process.env.ENCONTREI_COOKIE='fixture-only';
 try{
  global.__vizerCatalogueFixture={encontrei:{movies:[{tmdb_id:999431,video_id:123,audio:'Dublado',servers:{}}]},vizer:{movies:[],episodes:[]}};
  api=await compile(true);global.fetch=async()=>Response.json({servers_dub:'mixdrop=mdNew&streamtape=stNew',servers_leg:'byse=byseNew'});
  await api.getByseSources(999431,undefined,undefined,'Example',true);const hints=api.getPlaybackCataloguePresence(999431);
  assert.equal(hints.srv_mixdrop.listed,true);assert.equal(hints.srv_streamtape.listed,true);assert.equal(hints.srv_byse.listed,true);assert.equal(hints.srv_mixdrop.audioPriority,0);assert.equal(hints.srv_byse.audioPriority,2);
 }finally{if(cookie===undefined)delete process.env.ENCONTREI_COOKIE;else process.env.ENCONTREI_COOKIE=cookie;}
});
