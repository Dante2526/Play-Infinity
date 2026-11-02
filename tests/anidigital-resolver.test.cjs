const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const esbuild = require('esbuild');

const nativeFetch = global.fetch;
let api;

beforeEach(async () => {
  const root = path.resolve(__dirname, '..');
  const out = await esbuild.build({
    stdin: {
      contents: "export * from './server/services/anidigitalResolver';",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  const m = new Module(path.join(root, 'tests/virtual-anidigital.cjs'), module);
  m.filename = path.join(root, 'tests/virtual-anidigital.cjs');
  m.paths = module.paths;
  m._compile(out.outputFiles[0].text, m.filename);
  api = m.exports;
});

afterEach(() => { global.fetch = nativeFetch; });

// ── Fixtures do site (engenharia reversa de animesdigital.org) ──
const LISTING_HTML = '<div class="menu_filter_box" data-secury="c1deb78cd4" data-type-url="animes" data-limit="30"></div>';

function card(id, title) {
  return `\n<div class="itemA"><a href="https:\\/\\/animesdigital.org\\/video\\/a\\/${id}" title="Assistir ${title}"><div class="thumb"><img src="x.jpg"></div><div class="title"><span class="title_anime">${title}</span></div></a></div>`;
}

function searchResponse(results) {
  return { page: 1, total_results: results.length, mensagem: 'Resultados enviado!', total_page: 1, results };
}

function episodeHtml(slug, ep, cdn = 'cdn-s01.mywallpaper-4k-image.net') {
  return `<!DOCTYPE html><html><body>
  <a href="https://animesdigital.org/anime/a/${slug}">${slug}</a>
  <div id="player1" class="tab-video" data-id="1" data-video="1">
    <iframe src="https://api.anivideo.net/videohls.php?d=https://${cdn}/stream/sv/${slug[0]}/${slug}/${String(ep).padStart(2, '0')}.mp4/index.m3u8&nocache123"></iframe>
  </div>
  </body></html>`;
}

const M3U8 = '#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:10.000,\nseg-1-v1-a1.webp\n#EXTINF:10.000,\nseg-2-v1-a1.webp\n';

/**
 * Mocka o fetch com a topologia real do animesdigital:
 * slug probe (/anime/a/<slug>) → listagem (token) → POST /func/listanime
 * → pagina de episodio → m3u8.
 * `slugPages`: mapa slug→HTML para o probe direto responder 200.
 */
function mockSite({ results, episodeHtmls = {}, m3u8s = {}, searchFails = false, slugPages = {} } = {}) {
  const calls = [];
  global.fetch = async (raw, opts = {}) => {
    const url = typeof raw === 'string' ? raw : raw.url;
    const u = new URL(url);
    calls.push(u.pathname + (u.search || ''));
    if (u.pathname === '/animes-legendados-online001') {
      return new Response(LISTING_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (u.pathname === '/func/listanime') {
      if (searchFails) return new Response('err', { status: 503 });
      const body = new URLSearchParams(opts.body || '');
      assert.equal(body.get('token'), 'c1deb78cd4', 'token do data-secury é enviado');
      assert.ok(body.get('search'), 'busca sempre com termo');
      return Response.json(searchResponse(results));
    }
    // Probe direto por slug: /anime/a/<slug> (e variante -dublado) e /filme/<slug>
    const slugMatch = u.pathname.match(/^\/(?:anime\/a|filme)\/([a-z0-9-]+)/);
    if (slugMatch) {
      const html = slugPages[slugMatch[1]];
      if (html) return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
      return new Response('404', { status: 404 });
    }
    if (u.pathname.startsWith('/video/a/')) {
      const key = u.pathname.replace(/\/+$/, '').split('/').pop();
      const html = episodeHtmls[key];
      if (!html) return new Response('404', { status: 404 });
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (u.pathname.endsWith('index.m3u8')) {
      const host = u.hostname;
      if (m3u8s[host] === 'dead') return new Response('gone', { status: 404 });
      return new Response(M3U8, { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    }
    return new Response('??', { status: 404 });
  };
  return calls;
}

/** Página de série com lista de episódios (probe de slug / paginação). */
function seriesPageHtml(items) {
  const eps = items.map(([id, title]) =>
    `<a href="https://animesdigital.org/video/a/${id}/"><div class="title_anime">${title}</div></a>`).join('\n');
  return `<!DOCTYPE html><html><body><div class="itens_ep">${eps}</div></body></html>`;
}

test('cadeia completa: busca → episodio legenda­do exato → m3u8 da CDN homologada', async () => {
  const calls = mockSite({
    results: [
      card('139473', 'Tank Chair Episódio 05'),
      card('139472', 'Tank Chair Episódio 04'),
      card('139471', 'Tank Chair Episódio 03'),
    ],
    episodeHtmls: { 139473: episodeHtml('tank-chair', 5) },
  });
  const r = await api.resolveAnidigitalStream({ name: 'Tank Chair', type: 'tv', season: 1, episode: 5, audio: 'leg' });
  assert.equal(r.m3u8, 'https://cdn-s01.mywallpaper-4k-image.net/stream/sv/t/tank-chair/05.mp4/index.m3u8');
  assert.equal(r.leg, true);
  // 1 slug probe (404) + 1 listagem (token) + 1 busca + 1 pagina de episodio
  assert.equal(calls.length, 4);
});

test('probe de slug resolve título recente fora do índice de busca (no_verify_nonce)', async () => {
  // O site responde no_verify_nonce (em vez de results vazio) para títulos
  // ainda não indexados — o probe /anime/a/<slug> contorna isso em 2 requests.
  const calls = mockSite({
    results: [],
    slugPages: {
      'tank-chair': seriesPageHtml([['139473', 'Tank Chair Episódio 05']]),
    },
    episodeHtmls: { 139473: episodeHtml('tank-chair', 5) },
  });
  const r = await api.resolveAnidigitalStream({ name: 'Tank Chair', type: 'tv', season: 1, episode: 5, audio: 'leg' });
  assert.equal(r.m3u8, 'https://cdn-s01.mywallpaper-4k-image.net/stream/sv/t/tank-chair/05.mp4/index.m3u8');
  assert.equal(r.leg, true);
  // 1 slug probe + 1 pagina de episodio — busca nem é acionada
  assert.equal(calls.length, 2);
});

test('probe de slug com variante dublada quando audio=dub', async () => {
  const calls = mockSite({
    results: [],
    slugPages: {
      'one-piece-dublado': seriesPageHtml([['71547b11', 'One Piece Dublado Episódio 324']]),
    },
    episodeHtmls: { '71547b11': episodeHtml('one-piece', 324) },
  });
  const r = await api.resolveAnidigitalStream({ name: 'One Piece', type: 'tv', season: 1, episode: 324, audio: 'dub' });
  assert.equal(r.m3u8, 'https://cdn-s01.mywallpaper-4k-image.net/stream/sv/o/one-piece/324.mp4/index.m3u8');
  assert.equal(r.dub, true);
  assert.ok(calls[0].includes('/anime/a/one-piece-dublado'), 'variante -dublado é tentada primeiro');
});

test('resolucoes em voo compartilham a mesma promessa (sem scraping duplicado)', async () => {
  const calls = mockSite({
    results: [card('139473', 'Tank Chair Episódio 05')],
    episodeHtmls: { 139473: episodeHtml('tank-chair', 5) },
  });
  const all = await Promise.all(Array.from({ length: 8 }, () =>
    api.resolveAnidigitalStream({ name: 'Tank Chair', type: 'tv', season: 1, episode: 5 })));
  assert.ok(all.every(r => r.m3u8));
  assert.equal(calls.length, 4, 'uma única cadeia de scraping para 8 chamadas simultâneas');
});

test('cache: segunda resolução não refaz o scraping; force= true refaz', async () => {
  const calls = mockSite({
    results: [card('139473', 'Tank Chair Episódio 05')],
    episodeHtmls: { 139473: episodeHtml('tank-chair', 5) },
  });
  await api.resolveAnidigitalStream({ name: 'Tank Chair', type: 'tv', season: 1, episode: 5 });
  await api.resolveAnidigitalStream({ name: 'Tank Chair', type: 'tv', season: 1, episode: 5 });
  assert.equal(calls.length, 4, 'cache atende a segunda chamada');
  await api.resolveAnidigitalStream({ name: 'Tank Chair', type: 'tv', season: 1, episode: 5, force: true });
  assert.equal(calls.length, 7, 'force refaz a cadeia (token permanece cacheado)');
});

test('preferência de áudio: dub seleciona resultado Dublado quando existe', async () => {
  const calls = mockSite({
    results: [
      card('71547b11', 'One Piece (Dublado) Dublado Episódio 324'),
      card('222', 'One Piece Episódio 324'),
    ],
    episodeHtmls: { '71547b11': episodeHtml('one-piece', 324) },
  });
  const r = await api.resolveAnidigitalStream({ name: 'One Piece', type: 'tv', season: 1, episode: 324, audio: 'dub' });
  assert.equal(r.m3u8, 'https://cdn-s01.mywallpaper-4k-image.net/stream/sv/o/one-piece/324.mp4/index.m3u8');
  assert.equal(r.dub, true);
});

test('filme sem "Episódio" no título é preferido sobre episódios da série homônima', async () => {
  mockSite({
    results: [
      card('69769', 'One Piece: Filme 15 – RED Ova filme red'),
      card('71547b11', 'One Piece (Dublado) Dublado Episódio 324'),
    ],
    episodeHtmls: { 69769: episodeHtml('one-piece-red', 1, 'cdn-sv01.maximaimg.online') },
  });
  const r = await api.resolveAnidigitalStream({ name: 'One Piece: Filme 15 – RED', type: 'movie' });
  assert.equal(r.m3u8, 'https://cdn-sv01.maximaimg.online/stream/sv/o/one-piece-red/01.mp4/index.m3u8');
});

test('fallback pela página da série quando a busca não devolve o episódio exato', async () => {
  const seriesHtml = `<!DOCTYPE html><html><body>
  <div class="itens_ep">
    <a href="https://animesdigital.org/video/a/139460/"><div class="title_anime">Tank Chair Episódio 04</div></a>
    <a href="https://animesdigital.org/video/a/139459/"><div class="title_anime">Tank Chair Episódio 03</div></a>
  </div>
  <ul class="content-pagination"><li><a href="https://animesdigital.org/anime/b/tank0001/page/1/">1</a></li><li><a href="https://animesdigital.org/anime/b/tank0001/page/2/">2</a></li></ul>
  </body></html>`;
  // Episódio da busca aponta pra série com slug OBFUSCADO (/anime/b/tank0001),
  // diferente do slug derivado do título — o probe de slug falha (404) e o
  // fallback via link da página do episódio resolve.
  const ep05Html = `<!DOCTYPE html><html><body>
  <a href="https://animesdigital.org/anime/b/tank0001">tank</a>
  <iframe src="https://api.anivideo.net/videohls.php?d=https://cdn-s01.mywallpaper-4k-image.net/stream/sv/t/tank-chair/05.mp4/index.m3u8&nocache123"></iframe>
  </body></html>`;
  global.fetch = async (raw) => {
    const u = new URL(typeof raw === 'string' ? raw : raw.url);
    if (u.pathname === '/animes-legendados-online001') return new Response(LISTING_HTML);
    if (u.pathname === '/func/listanime') {
      return Response.json(searchResponse([card('139473', 'Tank Chair Episódio 05')]));
    }
    if (u.pathname.replace(/\/+$/, '') === '/video/a/139473') return new Response(ep05Html);
    if (u.pathname.startsWith('/anime/b/')) return new Response(seriesHtml);
    if (u.pathname.replace(/\/+$/, '') === '/video/a/139459') return new Response(episodeHtml('tank-chair', 3));
    if (u.pathname.endsWith('index.m3u8')) return new Response(M3U8);
    return new Response('404', { status: 404 });
  };
  // Busca devolve ep 05, mas pedimos ep 03 → resolve via página da série
  const r = await api.resolveAnidigitalStream({ name: 'Tank Chair', type: 'tv', season: 1, episode: 3 });
  assert.equal(r.m3u8, 'https://cdn-s01.mywallpaper-4k-image.net/stream/sv/t/tank-chair/03.mp4/index.m3u8');
});

test('título fora do catálogo → resolução negativa (sem m3u8, sem exceção)', async () => {
  mockSite({ results: [] });
  const r = await api.resolveAnidigitalStream({ name: 'Inexistente XYZ', type: 'movie' });
  assert.equal(r.m3u8, undefined);
});

test('falha de rede na busca vira cache negativo curto, não exceção', async () => {
  mockSite({ searchFails: true });
  const r = await api.resolveAnidigitalStream({ name: 'Tank Chair', type: 'tv', season: 1, episode: 5 });
  assert.equal(r.m3u8, undefined);
  // e recupera quando o site volta
  mockSite({
    results: [card('139473', 'Tank Chair Episódio 05')],
    episodeHtmls: { 139473: episodeHtml('tank-chair', 5) },
  });
  const r2 = await api.resolveAnidigitalStream({ name: 'Tank Chair', type: 'tv', season: 1, episode: 5, force: true });
  assert.ok(r2.m3u8);
});

test('temporada > 1 tenta numeração absoluta (12/13 eps por temporada)', async () => {
  mockSite({
    results: [card('99', 'Black Clover 2 Episódio 25')],
    episodeHtmls: { 99: episodeHtml('black-clover-2', 25) },
  });
  // T3 E1 → absolutos candidatos [1, 25, 27, 49]: casa com 25 (1 + 12×2)
  const r = await api.resolveAnidigitalStream({ name: 'Black Clover 2', type: 'tv', season: 3, episode: 1 });
  assert.ok(r.m3u8);
});

// ── Validação de hosts / rewrite do manifesto ──

test('isAnidigitalCdnUrl aceita só as CDNs homologadas (series cdn-sXX / filmes cdn-svXX)', () => {
  assert.equal(api.isAnidigitalCdnUrl('https://cdn-s01.mywallpaper-4k-image.net/stream/sv/t/tank-chair/05.mp4/index.m3u8'), true);
  assert.equal(api.isAnidigitalCdnUrl('https://cdn-sv01.maximaimg.online/stream/c/x/01.mp4/index.m3u8'), true);
  assert.equal(api.isAnidigitalCdnUrl('https://cdn-s02.mywallpaper-4k-image.net/stream/a/b/index.m3u8'), true);
  assert.equal(api.isAnidigitalCdnUrl('https://evil.com/stream/sv/t/tank-chair/05.mp4/index.m3u8'), false);
  assert.equal(api.isAnidigitalCdnUrl('https://mywallpaper-4k-image.net.evil.com/index.m3u8'), false);
  assert.equal(api.isAnidigitalCdnUrl('not a url'), false);
});

test('rewrite converte segmentos relativos (.webp disfarçado) em absolutos na CDN — sem proxy de segmento', () => {
  const out = api.rewriteAnidigitalPlaylist(
    '#EXTM3U\n#EXTINF:10.000,\nseg-1-v1-a1.webp\n#EXTINF:10.000,\nseg-2-v1-a1.webp\n',
    'https://cdn-s01.mywallpaper-4k-image.net/stream/sv/t/tank-chair/05.mp4/index.m3u8'
  );
  assert.ok(out.includes('https://cdn-s01.mywallpaper-4k-image.net/stream/sv/t/tank-chair/05.mp4/seg-1-v1-a1.webp'));
  assert.ok(out.includes('https://cdn-s01.mywallpaper-4k-image.net/stream/sv/t/tank-chair/05.mp4/seg-2-v1-a1.webp'));
  assert.doesNotMatch(out, /\/api\/anidigital-hls-segment/, 'segmentos NÃO passam pelo proxy (CORS * na CDN)');
});

test('rewrite preserva segmentos já absolutos (CDN de filmes) e resolve URI="..."', () => {
  const out = api.rewriteAnidigitalPlaylist(
    '#EXTM3U\n#EXT-X-KEY:URI="key.bin"\nhttps://cdn-sv01.maximaimg.online/stream/c/x/01.mp4/seg-1-v1-a1.webp\n',
    'https://cdn-sv01.maximaimg.online/stream/c/x/01.mp4/index.m3u8'
  );
  assert.ok(out.includes('https://cdn-sv01.maximaimg.online/stream/c/x/01.mp4/key.bin'));
  assert.ok(out.includes('https://cdn-sv01.maximaimg.online/stream/c/x/01.mp4/seg-1-v1-a1.webp'));
});

// ── Protocolo WATCHPLAY do wrapper (mesmo contrato da NetflixPlayerSkin) ──

test('wrapper responde aos comandos da skin e emite WATCHPLAY_STATUS sem scripts de terceiros', () => {
  const html = api.buildAnidigitalWrapperHtml('/api/anidigital-stream?u=x&sig=y', 100, 'leg');
  assert.doesNotMatch(html, /window\.open|<iframe|https:\/\/.*<script/);
  assert.match(html, /src="\/api\/byse-hls\.js"/);

  const listeners = {}, messages = [], winListeners = {};
  const parent = { postMessage: x => messages.push(x) };
  const v = {
    currentTime: 0, readyState: 1, duration: 1480, paused: true, muted: false, volume: 1,
    buffered: { length: 0 },
    addEventListener: (k, f) => ((listeners[k] ||= []).push(f)),
    canPlayType: () => true,
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    load() {},
    removeAttribute() {},
  };
  const window = { parent, addEventListener: (k, f) => winListeners[k] = f, Hls: undefined };
  let status;
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  vm.runInNewContext(script, {
    window,
    document: { getElementById: () => v },
    setInterval: f => { status = f; return 1; },
    clearInterval: () => {},
  });

  // seek inicial aplicado no loadedmetadata
  listeners.loadedmetadata[0]();
  assert.equal(v.currentTime, 100);

  const command = data => winListeners.message({ source: parent, data });
  // PLAY / PAUSE comandados pela skin
  command({ type: 'PLAY' });
  assert.equal(v.paused, false);
  command({ type: 'PAUSE' });
  assert.equal(v.paused, true);
  // SEEK comandado pela skin
  command({ type: 'SEEK_ABSOLUTE', time: 300 });
  assert.equal(v.currentTime, 300);
  command({ type: 'SEEK_RELATIVE', seconds: 10 });
  assert.equal(v.currentTime, 310);
  // volume / mute
  command({ type: 'SET_VOLUME', volume: 0.5 });
  assert.equal(v.volume, 0.5);
  command({ type: 'SET_MUTED', muted: true });
  assert.equal(v.muted, true);
  // SKIP_INTRO
  command({ type: 'SKIP_INTRO', seconds: 75 });
  assert.equal(v.currentTime, 385);

  // status periódico com o payload completo do contrato
  status();
  const last = messages.at(-1);
  assert.equal(last.type, 'WATCHPLAY_STATUS');
  assert.equal(last.currentTime, 385);
  assert.equal(last.duration, 1480);
  assert.equal(last.paused, true);
  assert.equal(last.muted, true);
  assert.equal(last.volume, 0.5);

  // eventos de play/pause notificam a skin
  listeners.play[0]();
  assert.ok(messages.some(m => m.type === 'WATCHPLAY_VIDEO_PLAYING'));
  listeners.pause[0]();
  assert.ok(messages.some(m => m.type === 'WATCHPLAY_VIDEO_PAUSED'));
  listeners.ended[0]();
  assert.ok(messages.some(m => m.type === 'WATCHPLAY_VIDEO_ENDED'));
});

test('erro fatal de mídia (sem hls.js acoplado) reporta WATCHPLAY_ERROR uma única vez', () => {
  const html = api.buildAnidigitalWrapperHtml('/api/anidigital-stream?u=x&sig=y', 0, 'leg');
  const listeners = {}, messages = [], winListeners = {};
  const parent = { postMessage: x => messages.push(x) };
  const v = {
    currentTime: 0, readyState: 1, duration: 0, paused: true, muted: false, volume: 1,
    buffered: { length: 0 },
    addEventListener: (k, f) => ((listeners[k] ||= []).push(f)),
    canPlayType: () => false,
    play() { return Promise.resolve(); },
    pause() {},
  };
  const window = { parent, addEventListener: (k, f) => winListeners[k] = f, Hls: undefined };
  vm.runInNewContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1], {
    window,
    document: { getElementById: () => v },
    setInterval: () => 1,
    clearInterval: () => {},
  });
  listeners.error[0]();
  listeners.error[0]();
  const errors = messages.filter(m => m.type === 'WATCHPLAY_ERROR');
  assert.equal(errors.length, 1, 'fatal reportado exatamente uma vez');
  assert.match(errors[0].reason, /AnimesDigital/);
});
