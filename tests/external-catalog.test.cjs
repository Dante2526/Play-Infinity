/**
 * [camadas externas / Saimo-style] Teste de regressão da camada de Canais Ao Vivo.
 *
 * Escopo DELIBERADAMENTE reduzido (decisão do cliente): apenas Live TV.
 * Nada de VOD/TMDB/VideoPlayerModal/NetflixPlayerSkin nesta camada.
 *
 * Cobre:
 *  1. Parser do catálogo texto (canal/categoria/logo/fonte/qualidade/referer/agente/chave)
 *  2. Parser de bases Xtream (base: idx url) + buildFonteUrl (fonte "idx:streamId")
 *  3. Validação estrita de query (validateExternalChannelName / validateExternalFormatParam)
 *  4. Resolver com fetch mockado (ordem de fontes, anti-SSRF, .invalid, DASH, cache)
 *  5. Scraper: validateChannelsText, filterBasesText (desativado.invalid), assertSaimoHost
 *  6. Scraper end-to-end com fetch mockado (escrita atômica, stats, falha mantém cache)
 *  7. Source guards: rotas registradas no server.ts, liveChannels.ts sem /api/iptv,
 *     .gitignore cobre arquivos com credenciais, redirect 302 + signProxyUrl na rota.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const dns = require('node:dns');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf-8');

// ---------------------------------------------------------------------------
// Bundle dos módulos TS (mesmo padrão do paywall-status-check.test.cjs)
// ---------------------------------------------------------------------------
async function loadModule(exportsFrom, file) {
  const output = await esbuild.build({
    stdin: {
      contents: `export ${exportsFrom} from '${file}';`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  const filename = path.join(root, `tests/virtual-${path.basename(file, '.ts')}.cjs`);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

let catalog, validation, scraper;
test.before(async () => {
  catalog = await loadModule(
    '{parseExternalChannels, parseExternalBases, buildFonteUrl, normalizeChannelName, findExternalChannel, resolveExternalChannel, clearExternalCatalogCache, externalCatalogStats, validatePlaylistContent, probeSegmentMagicBytes, NON_MEDIA_EXTENSIONS, probeExternalFonte}',
    './server/services/externalCatalog'
  );
  validation = await loadModule(
    '{validateExternalChannelName, validateExternalFormatParam}',
    './server/utils/externalValidation'
  );
  scraper = await loadModule(
    '{validateChannelsText, filterBasesText, assertSaimoHost, syncSaimoAll}',
    './server/services/saimoCatalogScraper'
  );
});

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------
const FIXTURE_CHANNELS = `# comentário de cabeçalho
canal: Premiere 2
categoria: Esportes
logo: https://exemplo.com/logo.png

fonte: https://8.8.8.8/alive1.m3u8
qualidade: FHD · 1920x1080
fonte: http://8.8.4.4:8080/alive2.m3u8
qualidade: HD
referer: https://exemplo-referer.com/
agente: Mozilla/5.0 FakeAgent
fonte: http://10.0.0.1/privado.m3u8
fonte: http://desativado.invalid/live/x/1.m3u8
fonte: https://8.8.8.8/dash.m3u8
chave: ABCDEF0123:0123456789ABCDEF
fonte: 9:12345

canal: Canal Sem Fonte
categoria: Teste

canal: SporTV
fonte: https://1.1.1.1/sportv.m3u8
`;

const FIXTURE_BASES = `# bases Xtream
base: 2 http://8.8.8.8:8080/live/user/pass/
base: 3 http://8.8.8.8:8080/live/user2/pass2
base: 4 http://desativado.invalid/movie/a/b/
base: 9 https://1.0.0.1:443/live/zzz/yyy
linha invalida sem formato
base: x http://nao-e-url
`;

function writeFixtures(dir, channelsText = FIXTURE_CHANNELS, basesText = FIXTURE_BASES) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'external-channels.txt'), channelsText);
  fs.writeFileSync(path.join(dir, 'external-bases.txt'), basesText);
}

function mockFetch(router) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    const handler = router[String(url)];
    if (!handler) {
      return { ok: false, status: 404, headers: new Map(), text: async () => 'not found', arrayBuffer: async () => new ArrayBuffer(0) };
    }
    return handler;
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function fakeResponse(status, body, contentType = 'application/vnd.apple.mpegurl') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries({ 'content-type': contentType, 'content-length': String(body ? body.length : 0) })),
    text: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

// Playlist de mídia válida com 1 segmento em `segUrl` (absoluta ou relativa à playlist)
function mediaPlaylistResponse(segUrl, opts = {}) {
  const body = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:8\n#EXT-X-MEDIA-SEQUENCE:1\n#EXTINF:8.0,\n${segUrl}\n#EXT-X-ENDLIST`;
  return fakeResponse(200, body, opts.contentType || 'application/vnd.apple.mpegurl');
}

// Playlist master com 1 variante (para testar recursão depth-1)
function masterPlaylistResponse(variantUrl) {
  const body = `#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\n${variantUrl}\n#EXT-X-ENDLIST`;
  return fakeResponse(200, body, 'application/vnd.apple.mpegurl');
}

// Segmento MPEG-TS válido: 188 bytes, byte 0 = 0x47 (sync byte)
function tsSegmentResponse() {
  const buf = Buffer.alloc(188, 0x47);
  buf[0] = 0x47;
  return {
    ok: true,
    status: 206,
    headers: new Map(Object.entries({ 'content-type': 'video/mp2t', 'content-length': '188' })),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    text: async () => { throw new Error('binary'); },
  };
}

// Segmento fMP4 com box ftyp no offset 4
function fmp4SegmentResponse() {
  const buf = Buffer.alloc(32, 0);
  buf.writeUInt32BE(0x18, 0);
  buf.write('ftyp', 4, 'ascii');
  return {
    ok: true,
    status: 200,
    headers: new Map(Object.entries({ 'content-type': 'video/mp4', 'content-length': '32' })),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    text: async () => { throw new Error('binary'); },
  };
}

// Segmento PNG (bytes 0x89 'PNG') — deve ser rejeitado pelo magic byte check
function pngSegmentResponse() {
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    ok: true,
    status: 200,
    headers: new Map(Object.entries({ 'content-type': 'image/png', 'content-length': '8' })),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    text: async () => { throw new Error('binary'); },
  };
}

// Segmento 404 (isca .png que nem existe)
function notFoundSegmentResponse() {
  return {
    ok: false,
    status: 404,
    headers: new Map(),
    text: async () => 'not found',
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

// ===========================================================================
// 1. Parser do catálogo de canais
// ===========================================================================
test('parser: extrai canal, categoria, logo e fontes em ordem', () => {
  const channels = catalog.parseExternalChannels(FIXTURE_CHANNELS);
  const p2 = channels.find(c => c.name === 'Premiere 2');
  assert.ok(p2, 'Premiere 2 deve existir');
  assert.equal(p2.category, 'Esportes');
  assert.equal(p2.logo, 'https://exemplo.com/logo.png');
  assert.equal(p2.fontes.length, 6, '6 fontes (privada/.invalid/DASH são PARSED aqui, filtradas só na resolução)');
  assert.equal(p2.fontes[0].url, 'https://8.8.8.8/alive1.m3u8');
  assert.equal(p2.fontes[0].qualidade, 'FHD · 1920x1080');
});

test('parser: referer e agente pertencem à fonte imediatamente acima', () => {
  const channels = catalog.parseExternalChannels(FIXTURE_CHANNELS);
  const p2 = channels.find(c => c.name === 'Premiere 2');
  assert.equal(p2.fontes[1].referer, 'https://exemplo-referer.com/');
  assert.equal(p2.fontes[1].agente, 'Mozilla/5.0 FakeAgent');
  assert.equal(p2.fontes[0].referer, undefined, 'fonte 1 não herda referer da fonte 2');
});

test('parser: chave (ClearKey DASH) é marcada na fonte', () => {
  const channels = catalog.parseExternalChannels(FIXTURE_CHANNELS);
  const p2 = channels.find(c => c.name === 'Premiere 2');
  assert.equal(p2.fontes[4].chave, 'ABCDEF0123:0123456789ABCDEF');
});

test('parser: canal sem fontes é descartado', () => {
  const channels = catalog.parseExternalChannels(FIXTURE_CHANNELS);
  assert.ok(!channels.find(c => c.name === 'Canal Sem Fonte'));
  assert.equal(channels.length, 2);
});

test('parser: comentários e linhas em branco são ignorados', () => {
  const out = catalog.parseExternalChannels('# header\n\ncanal: X\nfonte: https://8.8.8.8/a.m3u8\n');
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'X');
});

test('parser: fonte com formato inválido fica com url null (pulada na resolução)', () => {
  const out = catalog.parseExternalChannels('canal: X\nfonte: ftp://ruim\nfonte: 9:12345\n');
  assert.equal(out[0].fontes[0].url, null);
  assert.equal(out[0].fontes[1].raw, '9:12345');
});

// ===========================================================================
// 2. Bases Xtream + buildFonteUrl
// ===========================================================================
test('bases: parser aceita linhas válidas e completa barra final', () => {
  const bases = catalog.parseExternalBases(FIXTURE_BASES);
  assert.equal(bases.get(2), 'http://8.8.8.8:8080/live/user/pass/');
  assert.equal(bases.get(9), 'https://1.0.0.1:443/live/zzz/yyy/');
  // 4 bases parseadas: o parser NÃO filtra .invalid (filtro acontece no
  // filterBasesText do scraper e na resolução anti-SSRF) — defesa em camadas.
  assert.equal(bases.size, 4);
  assert.ok(bases.has(4), 'base desativado.invalid é parseada (mas nunca usada)');
});

test('buildFonteUrl: fonte direta passa direto; base-ref monta URL; base ausente → null', () => {
  const bases = new Map([[9, 'https://1.0.0.1:443/live/zzz/yyy/']]);
  assert.equal(catalog.buildFonteUrl({ raw: 'https://a.b/c.m3u8', url: 'https://a.b/c.m3u8' }, bases), 'https://a.b/c.m3u8');
  assert.equal(catalog.buildFonteUrl({ raw: '9:12345', url: null }, bases), 'https://1.0.0.1:443/live/zzz/yyy/12345.m3u8');
  assert.equal(catalog.buildFonteUrl({ raw: '7:1', url: null }, bases), null, 'base 7 não existe');
  assert.equal(catalog.buildFonteUrl({ raw: 'lixo', url: null }, bases), null);
});

// ===========================================================================
// 3. Validação de query
// ===========================================================================
test('validação: nome válido com acentos, parênteses e & é aceito', () => {
  const v = validation.validateExternalChannelName('CNN Brasil Money');
  assert.equal(v.ok, true);
  assert.equal(v.value, 'CNN Brasil Money');
  assert.ok(validation.validateExternalChannelName('DAZN (Jogo 1)').ok);
  assert.ok(validation.validateExternalChannelName('Filmes & Séries HD').ok);
  assert.ok(validation.validateExternalChannelName('Canal OFF').ok);
});

test('validação: name vazio/ausente/não-string é rejeitado', () => {
  assert.equal(validation.validateExternalChannelName('').ok, false);
  assert.equal(validation.validateExternalChannelName(undefined).ok, false);
  assert.equal(validation.validateExternalChannelName(null).ok, false);
  assert.equal(validation.validateExternalChannelName(123).ok, false);
  assert.equal(validation.validateExternalChannelName('   ').ok, false);
});

test('validação: path traversal no name é rejeitado', () => {
  assert.equal(validation.validateExternalChannelName('../../etc/passwd').ok, false);
  assert.equal(validation.validateExternalChannelName('..').ok, false);
});

test('validação: injeção de protocolo, barra e percent são rejeitadas', () => {
  assert.equal(validation.validateExternalChannelName('http://evil.com').ok, false);
  assert.equal(validation.validateExternalChannelName('a/b').ok, false);
  assert.equal(validation.validateExternalChannelName('a%20b').ok, false);
  assert.equal(validation.validateExternalChannelName('<script>').ok, false);
});

test('validação: name acima de 80 chars é rejeitado', () => {
  assert.equal(validation.validateExternalChannelName('x'.repeat(81)).ok, false);
  assert.equal(validation.validateExternalChannelName('x'.repeat(80)).ok, true);
});

test('validação: format ausente → redirect; json → json; outro valor → erro', () => {
  assert.equal(validation.validateExternalFormatParam(undefined).value, 'redirect');
  assert.equal(validation.validateExternalFormatParam('').value, 'redirect');
  assert.equal(validation.validateExternalFormatParam('json').value, 'json');
  assert.equal(validation.validateExternalFormatParam('xml').ok, false);
});

// ===========================================================================
// 4. Resolver (com fetch mockado e fixture em disco)
// ===========================================================================
test('resolver: primeira fonte viva em ORDEM é escolhida (fonte 1 morta, 2 viva)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extcat-'));
  writeFixtures(dir);
  process.env.EXTERNAL_CATALOG_DIR = dir;
  catalog.clearExternalCatalogCache();

  const m = mockFetch({
    'https://8.8.8.8/alive1.m3u8': fakeResponse(502, 'erro'),
    'http://8.8.4.4:8080/alive2.m3u8': mediaPlaylistResponse('http://8.8.4.4:8080/seg-1.ts'),
    'http://8.8.4.4:8080/seg-1.ts': tsSegmentResponse(),
  });
  try {
    const r = await catalog.resolveExternalChannel('Premiere 2');
    assert.ok(r, 'deve resolver');
    assert.equal(r.url, 'http://8.8.4.4:8080/alive2.m3u8', 'segunda fonte (viva) e não a primeira (morta)');
    assert.equal(r.referer, 'https://exemplo-referer.com/');
    assert.equal(r.agente, 'Mozilla/5.0 FakeAgent');
    assert.equal(r.fonteIndex, 1);
  } finally {
    m.restore();
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EXTERNAL_CATALOG_DIR;
    catalog.clearExternalCatalogCache();
  }
});

test('resolver: fontes com host privado (10.x) e .invalid NUNCA são buscadas (anti-SSRF)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extcat-'));
  writeFixtures(dir, `
canal: Premiere 2
fonte: http://10.0.0.1/privado.m3u8
fonte: http://127.0.0.1:3000/api/health
fonte: http://desativado.invalid/live/x/1.m3u8
fonte: https://8.8.8.8/ok.m3u8
`, 'base: 2 https://8.8.8.8/x/');
  process.env.EXTERNAL_CATALOG_DIR = dir;
  catalog.clearExternalCatalogCache();

  const m = mockFetch({
    'https://8.8.8.8/ok.m3u8': mediaPlaylistResponse('https://8.8.8.8/seg.ts'),
    'https://8.8.8.8/seg.ts': tsSegmentResponse(),
  });
  try {
    const r = await catalog.resolveExternalChannel('Premiere 2');
    assert.ok(r);
    assert.equal(r.url, 'https://8.8.8.8/ok.m3u8');
    const probedUrls = m.calls.map(c => c.url);
    assert.ok(!probedUrls.some(u => u.includes('10.0.0.1')), 'fonte privada nunca deve ser sondada');
    assert.ok(!probedUrls.some(u => u.includes('127.0.0.1')), 'loopback nunca deve ser sondado');
    assert.ok(!probedUrls.some(u => u.includes('.invalid')), 'host .invalid nunca deve ser sondado');
  } finally {
    m.restore();
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EXTERNAL_CATALOG_DIR;
    catalog.clearExternalCatalogCache();
  }
});

test('resolver: fontes DASH (chave ClearKey) são puladas', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extcat-'));
  writeFixtures(dir, `
canal: Premiere 2
fonte: https://8.8.8.8/dash.m3u8
chave: AAAA:BBBB
fonte: https://8.8.8.8/hls.m3u8
`);
  process.env.EXTERNAL_CATALOG_DIR = dir;
  catalog.clearExternalCatalogCache();
  const m = mockFetch({
    'https://8.8.8.8/hls.m3u8': mediaPlaylistResponse('https://8.8.8.8/seg.ts'),
    'https://8.8.8.8/seg.ts': tsSegmentResponse(),
    'https://8.8.8.8/dash.m3u8': mediaPlaylistResponse('https://8.8.8.8/dash-seg.ts'),
  });
  try {
    const r = await catalog.resolveExternalChannel('Premiere 2');
    assert.equal(r.url, 'https://8.8.8.8/hls.m3u8', 'fonte HLS escolhida, DASH pulada');
    assert.ok(!m.calls.some(c => c.url.includes('dash')), 'fonte DASH nunca é sondada');
  } finally {
    m.restore();
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EXTERNAL_CATALOG_DIR;
    catalog.clearExternalCatalogCache();
  }
});

test('resolver: fonte base-ref "idx:streamId" monta URL da base Xtream', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extcat-'));
  writeFixtures(dir, `
canal: Base Ref Canal
fonte: 9:98765
`, 'base: 9 https://1.0.0.1:443/live/zzz/yyy/');
  process.env.EXTERNAL_CATALOG_DIR = dir;
  catalog.clearExternalCatalogCache();
  const m = mockFetch({
    'https://1.0.0.1:443/live/zzz/yyy/98765.m3u8': mediaPlaylistResponse('https://1.0.0.1:443/live/zzz/yyy/98765.ts'),
    'https://1.0.0.1:443/live/zzz/yyy/98765.ts': tsSegmentResponse(),
  });
  try {
    const r = await catalog.resolveExternalChannel('Base Ref Canal');
    assert.equal(r.url, 'https://1.0.0.1:443/live/zzz/yyy/98765.m3u8');
  } finally {
    m.restore();
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EXTERNAL_CATALOG_DIR;
    catalog.clearExternalCatalogCache();
  }
});

test('resolver: canal inexistente retorna null', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extcat-'));
  writeFixtures(dir, 'canal: X\nfonte: https://8.8.8.8/a.m3u8\n');
  process.env.EXTERNAL_CATALOG_DIR = dir;
  catalog.clearExternalCatalogCache();
  try {
    assert.equal(await catalog.resolveExternalChannel('Canal Que Nao Existe'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EXTERNAL_CATALOG_DIR;
    catalog.clearExternalCatalogCache();
  }
});

test('resolver: cache de probe evita re-fetch dentro da janela positiva', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extcat-'));
  writeFixtures(dir, 'canal: X\nfonte: https://8.8.8.8/a.m3u8\n');
  process.env.EXTERNAL_CATALOG_DIR = dir;
  catalog.clearExternalCatalogCache();
  const m = mockFetch({
    'https://8.8.8.8/a.m3u8': mediaPlaylistResponse('https://8.8.8.8/seg.ts'),
    'https://8.8.8.8/seg.ts': tsSegmentResponse(),
  });
  try {
    await catalog.resolveExternalChannel('X');
    await catalog.resolveExternalChannel('X');
    const probes = m.calls.filter(c => c.url === 'https://8.8.8.8/a.m3u8');
    assert.equal(probes.length, 1, 'segunda resolução usa cache de probe');
  } finally {
    m.restore();
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EXTERNAL_CATALOG_DIR;
    catalog.clearExternalCatalogCache();
  }
});

test('resolver: todas mortas → retorna null (NÃO serve fonte sabidamente morta — fallback inteligente)', async () => {
  // Bug histórico: fallback cego antigo retornava allowed[0] mesmo quando
  // probe rejeitou (iscas confirmadas). Player recebia a isca e não tocava.
  // Novo: se TODAS foram sondadas e falharam, retorna null (502 na rota) —
  // player tenta próximo server do canal, e admin vê que precisa de atenção.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extcat-'));
  writeFixtures(dir, 'canal: X\nfonte: https://8.8.8.8/morta.m3u8\nfonte: https://8.8.4.4/morta2.m3u8\n');
  process.env.EXTERNAL_CATALOG_DIR = dir;
  catalog.clearExternalCatalogCache();
  const m = mockFetch({
    'https://8.8.8.8/morta.m3u8': fakeResponse(500, 'x'),
    'https://8.8.4.4/morta2.m3u8': fakeResponse(500, 'x'),
  });
  try {
    const r = await catalog.resolveExternalChannel('X');
    assert.equal(r, null, 'todas sondadas e mortas → null (não serve fonte ruim)');
  } finally {
    m.restore();
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EXTERNAL_CATALOG_DIR;
    catalog.clearExternalCatalogCache();
  }
});

test('resolver: deadline cortou antes de sondar todas → fallback pega primeira NÃO sondada', async () => {
  // 5 fontes: 4 sondadas (500) + 1 não sondada (deadline cortou no 2o batch)
  // Esperado: retorna a 5a fonte (não sondada) como fallback cego
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extcat-'));
  writeFixtures(dir, 'canal: X\nfonte: https://8.8.8.8/a.m3u8\nfonte: https://8.8.4.4/b.m3u8\nfonte: https://8.8.8.9/c.m3u8\nfonte: https://8.8.4.5/d.m3u8\nfonte: https://8.8.8.10/e.m3u8\n');
  process.env.EXTERNAL_CATALOG_DIR = dir;
  catalog.clearExternalCatalogCache();

  // Mock fetch com delay real (5ms) para o deadline cortar entre batches.
  // mockFetch padrão resolve síncrono — Date.now() não avança, deadline não dispara.
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    await new Promise(r => setTimeout(r, 5));
    return {
      ok: false, status: 500,
      headers: new Map(Object.entries({ 'content-type': 'application/vnd.apple.mpegurl', 'content-length': '1' })),
      text: async () => 'x',
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
  const dnsStub = { address: '104.21.5.10', family: 4 };
  const originalLookup = dns.promises.lookup;
  dns.promises.lookup = async () => [dnsStub];
  try {
    // deadline 1ms — primeiro batch roda (4 sources paralelas em ~5ms),
    // próximo batch cortado pelo deadline
    const r = await catalog.resolveExternalChannel('X', { deadlineMs: 1, batch: 4 });
    assert.ok(r, 'deve resolver via fallback não-sondado');
    assert.equal(r.url, 'https://8.8.8.10/e.m3u8', '5a fonte (não sondada) retornada');
    assert.ok(!calls.some(c => c.url.includes('8.8.8.10/e.m3u8')), '5a fonte nunca é sondada');
  } finally {
    dns.promises.lookup = originalLookup;
    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EXTERNAL_CATALOG_DIR;
    catalog.clearExternalCatalogCache();
  }
});

test('lookup: match normalizado (case/acento) e por contenção', () => {
  const channels = catalog.parseExternalChannels('canal: SporTV\nfonte: https://8.8.8.8/a.m3u8\ncanal: Premiere 2\nfonte: https://8.8.8.8/b.m3u8\n');
  assert.ok(catalog.findExternalChannel('sportv', channels), 'case-insensitive');
  assert.ok(catalog.findExternalChannel('PREMIERE 2', channels));
  assert.ok(catalog.findExternalChannel('Premiere 2 HD', channels), 'contenção: query contém nome do catálogo');
  assert.equal(catalog.findExternalChannel('Canal Inexistente Zzz', channels), null);
});

// ===========================================================================
// 4b. Probe profundo — valida que playlists-isca NÃO passam (bug .png/.woff)
// ===========================================================================
test('validatePlaylistContent: aceita playlist de mídia válida com #EXTINF + URL .ts', () => {
  const r = catalog.validatePlaylistContent(
    '#EXTM3U\n#EXTINF:8.0,\nhttps://example.com/seg-1.ts\n#EXT-X-ENDLIST',
    'https://example.com/p.m3u8'
  );
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'media');
  assert.equal(r.firstUrl, 'https://example.com/seg-1.ts');
});

test('validatePlaylistContent: aceita master playlist com #EXT-X-STREAM-INF', () => {
  const r = catalog.validatePlaylistContent(
    '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nhttps://example.com/var.m3u8\n#EXT-X-ENDLIST',
    'https://example.com/master.m3u8'
  );
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'master');
  assert.equal(r.firstUrl, 'https://example.com/var.m3u8');
});

test('validatePlaylistContent: REJEITA playlist sem #EXTM3U (página HTML)', () => {
  const r = catalog.validatePlaylistContent('<html>Cloudflare block</html>');
  assert.equal(r.ok, false);
  assert.match(r.reason, /#EXTM3U/);
});

test('validatePlaylistContent: REJEITA playlist com #EXTM3U mas sem #EXTINF/#EXT-X-STREAM-INF', () => {
  const r = catalog.validatePlaylistContent('#EXTM3U\n#EXT-X-VERSION:3\n');
  assert.equal(r.ok, false);
  assert.match(r.reason, /EXTINF/);
});

test('validatePlaylistContent: REJEITA playlist-isca com segmentos .png (bug observado em prod)', () => {
  // Bug concreto da família meufut.top (aws.s13-s1001604.lat): playlist
  // sintaticamente válido mas segmentos são .png que 404.
  const r = catalog.validatePlaylistContent(
    '#EXTM3U\n#EXTINF:8.0,\nhttps://aws.s13-s1001604.lat/uploads/abc.png\n#EXT-X-ENDLIST',
    'https://aws.s13-s1001604.lat/stream/x/sportv.m3u8'
  );
  assert.equal(r.ok, false, '.png é extensão isca');
  assert.match(r.reason, /\.png/);
});

test('validatePlaylistContent: REJEITA segmento .woff (família error.txt)', () => {
  const r = catalog.validatePlaylistContent(
    '#EXTM3U\n#EXTINF:6.0,\nhttps://x.s25-cloudfront-net.lat/assets/y.woff\n#EXT-X-ENDLIST',
    'https://x.s25-cloudfront-net.lat/stream/z/p.m3u8'
  );
  assert.equal(r.ok, false, '.woff é extensão isca');
  assert.match(r.reason, /woff/);
});

test('validatePlaylistContent: resolve URL relativa contra baseUrl', () => {
  const r = catalog.validatePlaylistContent(
    '#EXTM3U\n#EXTINF:8.0,\nseg-1.ts\n#EXT-X-ENDLIST',
    'https://example.com/p.m3u8'
  );
  assert.equal(r.ok, true);
  assert.equal(r.firstUrl, 'https://example.com/seg-1.ts');
});

test('validatePlaylistContent: aceita segmento sem extensão (Xtream com query)', () => {
  const r = catalog.validatePlaylistContent(
    '#EXTM3U\n#EXTINF:8.0,\nhttp://x:80/live/u/p/123?token=abc\n#EXT-X-ENDLIST',
    'http://x:80/master.m3u8'
  );
  assert.equal(r.ok, true, 'sem extensão é permitido (denylist, não allowlist)');
});

test('probeSegmentMagicBytes: aceita segmento MPEG-TS (byte 0 = 0x47)', async () => {
  const m = mockFetch({ 'https://x/seg.ts': tsSegmentResponse() });
  try {
    const ok = await catalog.probeSegmentMagicBytes('https://x/seg.ts');
    assert.equal(ok, true);
  } finally { m.restore(); }
});

test('probeSegmentMagicBytes: aceita segmento fMP4 (ftyp no offset 4)', async () => {
  const m = mockFetch({ 'https://x/seg.m4s': fmp4SegmentResponse() });
  try {
    const ok = await catalog.probeSegmentMagicBytes('https://x/seg.m4s');
    assert.equal(ok, true);
  } finally { m.restore(); }
});

test('probeSegmentMagicBytes: REJEITA segmento PNG (bytes 0x89 PNG)', async () => {
  const m = mockFetch({ 'https://x/fake.png': pngSegmentResponse() });
  try {
    const ok = await catalog.probeSegmentMagicBytes('https://x/fake.png');
    assert.equal(ok, false, 'magic bytes PNG não deve passar');
  } finally { m.restore(); }
});

test('probeSegmentMagicBytes: REJEITA segmento 404', async () => {
  const m = mockFetch({ 'https://x/missing.ts': notFoundSegmentResponse() });
  try {
    const ok = await catalog.probeSegmentMagicBytes('https://x/missing.ts');
    assert.equal(ok, false, '404 não deve passar');
  } finally { m.restore(); }
});

test('probeExternalFonte: REJEITA playlist-isca .png (bug real da família meufut.top)', async () => {
  const m = mockFetch({
    'https://aws.s13-s1001604.lat/p.m3u8': mediaPlaylistResponse('https://aws.s13-s1001604.lat/uploads/abc.png'),
    // segment .png não precisa nem estar mockado — denylist rejeita antes do fetch
  });
  try {
    const ok = await catalog.probeExternalFonte('https://aws.s13-s1001604.lat/p.m3u8');
    assert.equal(ok, false, 'playlist-isca com .png deve ser rejeitada no probe');
    // Garante que o segmento .png nunca chegou a ser buscado
    assert.ok(!m.calls.some(c => c.url.includes('abc.png')), 'segmento .png nunca é buscado (denylist corta antes)');
  } finally { m.restore(); catalog.clearExternalCatalogCache(); }
});

test('probeExternalFonte: REJEITA playlist com segmento .woff', async () => {
  const m = mockFetch({
    'https://x/p.m3u8': mediaPlaylistResponse('https://x/assets/y.woff'),
  });
  try {
    const ok = await catalog.probeExternalFonte('https://x/p.m3u8');
    assert.equal(ok, false);
  } finally { m.restore(); catalog.clearExternalCatalogCache(); }
});

test('probeExternalFonte: REJEITA playlist válida mas com segmento PNG nos bytes (isca mais sofisticada)', async () => {
  // Isca que tem .ts na URL mas serve PNG nos bytes — magic byte check pega
  const m = mockFetch({
    'https://x/p.m3u8': mediaPlaylistResponse('https://x/seg.ts'),
    'https://x/seg.ts': pngSegmentResponse(),
  });
  try {
    const ok = await catalog.probeExternalFonte('https://x/p.m3u8');
    assert.equal(ok, false, 'segmento com magic bytes PNG deve falhar');
  } finally { m.restore(); catalog.clearExternalCatalogCache(); }
});

test('probeExternalFonte: aceita playlist válida com segmento TS real', async () => {
  const m = mockFetch({
    'https://x/p.m3u8': mediaPlaylistResponse('https://x/seg.ts'),
    'https://x/seg.ts': tsSegmentResponse(),
  });
  try {
    const ok = await catalog.probeExternalFonte('https://x/p.m3u8');
    assert.equal(ok, true);
  } finally { m.restore(); catalog.clearExternalCatalogCache(); }
});

test('probeExternalFonte: recursão master → variante de mídia (Xtream-style)', async () => {
  const m = mockFetch({
    'https://x/master.m3u8': masterPlaylistResponse('https://x/var.m3u8'),
    'https://x/var.m3u8': mediaPlaylistResponse('https://x/seg.ts'),
    'https://x/seg.ts': tsSegmentResponse(),
  });
  try {
    const ok = await catalog.probeExternalFonte('https://x/master.m3u8');
    assert.equal(ok, true, 'master com variante válida deve passar por recursão');
    // Deve ter buscado master, variante e segmento (3 fetches)
    assert.ok(m.calls.some(c => c.url.includes('master.m3u8')));
    assert.ok(m.calls.some(c => c.url.includes('var.m3u8')));
    assert.ok(m.calls.some(c => c.url.includes('seg.ts')));
  } finally { m.restore(); catalog.clearExternalCatalogCache(); }
});

test('probeExternalFonte: master com variante isca .png falha', async () => {
  const m = mockFetch({
    'https://x/master.m3u8': masterPlaylistResponse('https://x/uploads/abc.png'),
  });
  try {
    const ok = await catalog.probeExternalFonte('https://x/master.m3u8');
    assert.equal(ok, false, 'variante .png é isca, recursão falha');
  } finally { m.restore(); catalog.clearExternalCatalogCache(); }
});

test('probeExternalFonte: página HTML de bloqueio Cloudflare é rejeitada', async () => {
  // Bug concreto da família error.txt (dbcd70be...s25-cloudfront-net.lat)
  const m = mockFetch({
    'https://dbcd70be.s25-cloudfront-net.lat/stream/x/error.txt': fakeResponse(200, '<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head></html>', 'text/html'),
  });
  try {
    const ok = await catalog.probeExternalFonte('https://dbcd70be.s25-cloudfront-net.lat/stream/x/error.txt', { referer: 'https://w7.embedtv.cc/' });
    assert.equal(ok, false, 'HTML de bloqueio não deve passar como playlist');
  } finally { m.restore(); catalog.clearExternalCatalogCache(); }
});

test('resolver: pula fonte-isca .png e escolhe a próxima fonte viva (cenário SporTV/Premiere)', async () => {
  // Cenário que reproduz o bug real: fonte #1 é isca meufut.top (.png),
  // fonte #2 é Xtream real com .ts — probe profundo deve pular a #1 e usar #2.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extcat-'));
  writeFixtures(dir, `canal: SporTV\nfonte: https://aws.s13-s1001604.lat/sportv.m3u8\nfonte: http://real-xtream.com:80/live/u/p/1.m3u8\n`, 'base: 2 https://real-xtream.com:80/live/u/p/');
  process.env.EXTERNAL_CATALOG_DIR = dir;
  catalog.clearExternalCatalogCache();
  const m = mockFetch({
    'https://aws.s13-s1001604.lat/sportv.m3u8': mediaPlaylistResponse('https://aws.s13-s1001604.lat/uploads/abc.png'),
    'http://real-xtream.com:80/live/u/p/1.m3u8': mediaPlaylistResponse('http://real-xtream.com:80/live/u/p/seg-1.ts'),
    'http://real-xtream.com:80/live/u/p/seg-1.ts': tsSegmentResponse(),
  });
  // Mock DNS para evitar NXDOMAIN em real-xtream.com (domínio de teste)
  const dnsStub = { address: '104.21.5.10', family: 4 };
  const originalLookup = dns.promises.lookup;
  dns.promises.lookup = async () => [dnsStub];
  try {
    const r = await catalog.resolveExternalChannel('SporTV');
    assert.ok(r, 'deve resolver');
    assert.equal(r.url, 'http://real-xtream.com:80/live/u/p/1.m3u8', 'deve pular isca .png e usar fonte real');
    assert.equal(r.fonteIndex, 1, 'segunda fonte (isca pulada na 0)');
    assert.ok(!m.calls.some(c => c.url.includes('abc.png')), 'segmento .png nunca buscado');
  } finally {
    dns.promises.lookup = originalLookup;
    m.restore();
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EXTERNAL_CATALOG_DIR;
    catalog.clearExternalCatalogCache();
  }
});

// ===========================================================================
// 5. Scraper — funções puras
// ===========================================================================
test('scraper: validateChannelsText aceita catálogo com canais e fontes, rejeita lixo', () => {
  // >= 10 canais (MIN_CHANNELS_TO_ACCEPT) e fontes >= canais
  const okText = Array.from({ length: 10 }, (_, i) => `canal: Canal ${i}\nfonte: https://8.8.8.8/c${i}.m3u8\n`).join('');
  const ok = scraper.validateChannelsText(okText);
  assert.equal(ok.ok, true);
  const bad = scraper.validateChannelsText('<html>erro</html>');
  assert.equal(bad.ok, false);
  const poucosCanais = scraper.validateChannelsText('canal: A\nfonte: https://x/a.m3u8\n');
  assert.equal(poucosCanais.ok, false, 'menos de 10 canais é tratado como formato quebrado');
});

test('scraper: filterBasesText pula desativado.invalid, IPs privados e linhas inválidas; preserva índices', () => {
  const out = scraper.filterBasesText(`
base: 2 http://tjtor8411.com:80/movie/Osiel123/Felicidade321/
base: 4 http://desativado.invalid/hubby.cx/movie/a/b/
base: 6 http://10.0.0.1:8080/live/x/y/
base: 7 http://192.168.1.5/live/a/b/
base: 9 http://127.0.0.1/x/
base: 10 http://169.254.169.254/latest/meta-data/
base: 11 http://outro-painel.com:80/live/u/p
base: zz linha invalida
`);
  assert.equal(out.kept, 2, 'apenas bases públicas válidas');
  assert.ok(out.lines.some(l => l.startsWith('base: 2 ')), 'índice original 2 preservado');
  assert.ok(out.lines.some(l => l.startsWith('base: 11 ')), 'índice original 11 preservado');
  assert.ok(!out.lines.some(l => l.includes('desativado.invalid')));
  assert.ok(!out.lines.some(l => l.includes('10.0.0.1')));
  assert.ok(!out.lines.some(l => l.includes('169.254')));
});

test('scraper: assertSaimoHost aceita só os 2 domínios Saimo', () => {
  assert.doesNotThrow(() => scraper.assertSaimoHost('https://canais-saimo.pages.dev/catalogo.txt'));
  assert.doesNotThrow(() => scraper.assertSaimoHost('https://filmes-saimo.pages.dev/indice.txt'));
  assert.throws(() => scraper.assertSaimoHost('https://evil.com/catalogo.txt'));
  assert.throws(() => scraper.assertSaimoHost('https://canais-saimo.pages.dev.evil.com/catalogo.txt'));
  assert.throws(() => scraper.assertSaimoHost('http://127.0.0.1:3000/api/health'));
  assert.throws(() => scraper.assertSaimoHost('url malformada'));
});

// ===========================================================================
// 6. Scraper end-to-end com fetch mockado + DNS mockado
// ===========================================================================
test('scraper: syncSaimoAll grava arquivos, retorna stats e invalida cache', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saimo-'));
  process.env.EXTERNAL_CATALOG_DIR = dir;

  const catalogText = Array.from({ length: 12 }, (_, i) => `canal: Canal ${i}\nfonte: https://8.8.8.8/c${i}.m3u8\n`).join('\n');
  const indiceText = 'base: 2 http://tjtor8411.com:80/movie/Osiel123/Felicidade321/\nbase: 4 http://desativado.invalid/x/y/\n';

  const m = mockFetch({
    'https://canais-saimo.pages.dev/catalogo.txt': fakeResponse(200, catalogText, 'text/plain'),
    'https://filmes-saimo.pages.dev/indice.txt': fakeResponse(200, indiceText, 'text/plain'),
  });
  const dnsStub = { address: '104.21.5.10', family: 4 };
  const originalLookup = dns.promises.lookup;
  dns.promises.lookup = async () => [dnsStub];
  try {
    const stats = await scraper.syncSaimoAll();
    assert.equal(stats.success, true);
    assert.equal(stats.channelsCount, 12);
    assert.equal(stats.basesCount, 1, 'base desativada pulada');
    assert.equal(stats.skippedBases, 1);

    const channelsFile = path.join(dir, 'external-channels.txt');
    const basesFile = path.join(dir, 'external-bases.txt');
    assert.ok(fs.existsSync(channelsFile));
    assert.ok(fs.existsSync(basesFile));
    assert.ok(fs.readFileSync(basesFile, 'utf-8').includes('base: 2 '));
    assert.ok(!fs.readFileSync(basesFile, 'utf-8').includes('desativado.invalid'));
    assert.equal((fs.statSync(basesFile).mode & 0o777), 0o600, 'bases com chmod 600 (credenciais)');

    // Cache do resolver foi invalidado — stats enxergam o catálogo novo
    const s = catalog.externalCatalogStats();
    assert.equal(s.channelsCount, 12);
    assert.equal(s.basesCount, 1);
  } finally {
    dns.promises.lookup = originalLookup;
    m.restore();
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EXTERNAL_CATALOG_DIR;
    catalog.clearExternalCatalogCache();
  }
});

test('scraper: formato inválido do catalogo.txt NÃO sobrescreve cache anterior', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saimo-'));
  process.env.EXTERNAL_CATALOG_DIR = dir;
  writeFixtures(dir, 'canal: Antigo\nfonte: https://8.8.8.8/antiga.m3u8\n', 'base: 2 https://8.8.8.8/live/a/b/\n');
  catalog.clearExternalCatalogCache();

  const m = mockFetch({
    'https://canais-saimo.pages.dev/catalogo.txt': fakeResponse(200, '<html>página de erro</html>', 'text/html'),
    'https://filmes-saimo.pages.dev/indice.txt': fakeResponse(200, 'base: 2 http://ok.com/a/', 'text/plain'),
  });
  const dnsStub = { address: '104.21.5.10', family: 4 };
  const originalLookup = dns.promises.lookup;
  dns.promises.lookup = async () => [dnsStub];
  try {
    const stats = await scraper.syncSaimoAll();
    assert.equal(stats.success, false);
    // arquivo antigo preservado
    assert.ok(fs.readFileSync(path.join(dir, 'external-channels.txt'), 'utf-8').includes('canal: Antigo'));
  } finally {
    dns.promises.lookup = originalLookup;
    m.restore();
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EXTERNAL_CATALOG_DIR;
    catalog.clearExternalCatalogCache();
  }
});

test('scraper: fetch com erro de rede mantém arquivos intactos', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saimo-'));
  process.env.EXTERNAL_CATALOG_DIR = dir;
  writeFixtures(dir, 'canal: Antigo\nfonte: https://8.8.8.8/antiga.m3u8\n', 'base: 2 https://8.8.8.8/live/a/b/\n');

  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  const dnsStub = { address: '104.21.5.10', family: 4 };
  const originalLookup = dns.promises.lookup;
  dns.promises.lookup = async () => [dnsStub];
  try {
    const stats = await scraper.syncSaimoAll();
    assert.equal(stats.success, false);
    assert.ok(stats.error);
    assert.ok(fs.readFileSync(path.join(dir, 'external-channels.txt'), 'utf-8').includes('canal: Antigo'));
  } finally {
    dns.promises.lookup = originalLookup;
    globalThis.fetch = original;
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.EXTERNAL_CATALOG_DIR;
    catalog.clearExternalCatalogCache();
  }
});

// ===========================================================================
// 7. Source guards — integração com o código do repo
// ===========================================================================
test('guard: server.ts registra externalRouter E inicia o cron do scraper', () => {
  const src = read('server.ts');
  assert.ok(src.includes('import externalRouter from "./server/routes/externalRoutes"'), 'import do router');
  assert.ok(src.includes('app.use(externalRouter)'), 'mount do router');
  assert.ok(src.includes('startSaimoSyncCron()'), 'cron no boot');
});

test('guard: liveChannels.ts não tem NENHUM servidor /api/iptv restante (up.kiwi morto)', () => {
  const src = read('src/data/liveChannels.ts');
  assert.equal((src.match(/\/api\/iptv\//g) || []).length, 0, 'todos os canais up.kiwi foram migrados');
});

test('guard: liveChannels.ts migrou os canais esportivos principais para external-channel', () => {
  const src = read('src/data/liveChannels.ts');
  const refs = (src.match(/\/api\/external-channel\?name=/g) || []).length;
  assert.ok(refs >= 35, `esperado >=35 refs external-channel, encontrado ${refs}`);
  for (const expected of [
    'Premiere%20Clubes', 'Premiere%202', 'Premiere%207',
    'SporTV', 'SporTV%202', 'SporTV%203',
    'ESPN', 'ESPN%202', 'ESPN%203', 'ESPN%204', 'ESPN%205',
    'BAND%20SPORTS%20HD', 'Combate', 'N%20SPORTS', 'GE%20TV',
    'Band', 'SBT', 'Record', 'Record%20News', 'CazeTV%201',
    'Discovery%20Channel', 'History', 'Animal%20Planet', 'Discovery%20ID',
  ]) {
    assert.ok(src.includes(`name=${expected}`), `canal ${expected} deve estar migrado`);
  }
});

test('guard: .gitignore cobre os 2 arquivos de catálogo com credenciais', () => {
  const gi = read('.gitignore');
  assert.ok(gi.includes('data/external-bases.txt'));
  assert.ok(gi.includes('data/external-channels.txt'));
});

test('guard: rota usa redirect 302 + signProxyUrl + validação estrita + format=json', () => {
  const src = read('server/routes/externalRoutes.ts');
  assert.ok(src.includes('res.redirect(302'), 'redirect 302 padrão (compatível com LivePlayerModal/Sentinela)');
  assert.ok(src.includes('signProxyUrl'), 'proxy assinado para Mixed Content');
  assert.ok(src.includes('validateExternalChannelName'), 'validação estrita de name');
  assert.ok(src.includes('validateExternalFormatParam'), 'validação de format');
  assert.ok(src.includes('/api/live-stream-proxy'), 'envelope no proxy interno');
  assert.ok(src.includes('"json"'), 'modo format=json disponível');
  assert.ok(src.includes('NODE_ENV === "production" ? "https" : "http"'), 'protocolo absoluto forçado (padrão iptv.ts)');
});

test('guard: scraper tem allowlist Saimo hardcoded + anti-SSRF + escrita atômica', () => {
  const src = read('server/services/saimoCatalogScraper.ts');
  assert.ok(src.includes('SAIMO_ALLOWED_HOSTS'), 'allowlist de domínios');
  assert.ok(src.includes('filmes-saimo.pages.dev'));
  assert.ok(src.includes('canais-saimo.pages.dev'));
  assert.ok(src.includes('isPrivateOrLocalHost'), 'anti-SSRF no scraper');
  assert.ok(src.includes('renameSync'), 'escrita atômica');
  assert.ok(src.includes('0o600'), 'chmod 600 para bases com credenciais');
});

test('guard: escopo reduzido respeitado — NADA de VOD/TMDB/VideoPlayerModal nesta camada', () => {
  // A camada externa não deve referenciar nada de VOD:
  const routes = read('server/routes/externalRoutes.ts');
  const svc = read('server/services/externalCatalog.ts');
  for (const src of [routes, svc]) {
    assert.ok(!/tmdb/i.test(src), 'sem TMDB');
    assert.ok(!src.includes('VideoPlayerModal'), 'sem VideoPlayerModal');
    assert.ok(!src.includes('NetflixPlayerSkin'), 'sem NetflixPlayerSkin');
    assert.ok(!src.includes('external-vod'), 'sem catálogo VOD');
  }
});

test('guard: sentinela continua compatível — probeLiveStreamUrl trata caminhos /api/ relativos', () => {
  const iptv = read('server/routes/iptv.ts');
  assert.ok(iptv.includes('targetUrl.startsWith("/")'), 'caminhos relativos /api/ são sondados via 127.0.0.1 (segue o 302 da rota externa)');
});

test('guard: timeouts da cadeia externa coerentes — painel e sentinela não estouram antes do fim', () => {
  // Bug observado em produção: sentinela usava 5s e o teste de conexão do
  // painel 7s, mas a cadeia externa (resolver com probe profundo + redirect
  // 302 + proxy re-buscando playlist upstream com timeout 8s) precisa de
  // mais tempo — o timeout estourava no meio e o canal era acusado "fora
  // do ar" mesmo funcionando. Fix: 12s para /api/external-channel em ambos
  // + resolver deadline 4500ms na rota (default do resolver segue 7s para
  // uso interno/futuro).
  const iptv = read('server/routes/iptv.ts');
  assert.ok(
    iptv.includes('targetUrl.startsWith("/api/external-channel") ? 12000 : 7000'),
    'rota probe-channel (teste de conexão do painel) usa 12s para cadeia externa'
  );
  const sentinel = read('server/services/adminSentinel.ts');
  assert.ok(
    sentinel.includes('titularServer.startsWith("/api/external-channel") ? 12000 : 5000'),
    'sentinela usa 12s para cadeia externa (canais diretos continuam 5s)'
  );
  const routes = read('server/routes/externalRoutes.ts');
  assert.ok(
    routes.includes('deadlineMs: 4500'),
    'rota externa usa resolver com deadline 4.5s (deixa folga para o redirect+proxy dentro dos 12s)'
  );
});
