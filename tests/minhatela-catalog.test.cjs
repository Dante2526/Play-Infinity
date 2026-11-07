/**
 * [MinhaTela] Testes do provedor de fontes embed (agregador reversado).
 *
 * Cobre:
 *  1. minhaTelaKey: normalização de matching (SporTV HD↔SPORTV, ESPN 2↔ESPN2,
 *     CazéTV Ao Vivo↔CazéTV, Paramount+/BM&C preservando + e &)
 *  2. findMinhaTelaChannel: mapa manual (premiere-1↔PREMIERE CLUBES HD,
 *     espn-brasil↔ESPN, ge-fast↔GE TV HD, discovery-channel↔DISCOVERY HD)
 *  3. getMinhaTelaServersFor: streams→servidores embed (https-only, dedup,
 *     máx 12, nomes sequenciais, hosts privados rejeitados)
 *  4. getMinhaTelaNewChannels: exclusivos viram canais completos com
 *     categoria mapeada (PAY PER VIEW+premiere→Esportes, DOCUMENTARIOS→
 *     Variedades, INFANTIS→Infantil, NOTICIAS→Notícias) e não duplicam
 *     nomes já representados
 *  5. Refresh end-to-end com fetch mockado (envelope {"json":{...}}),
 *     detalhe por slug e persistência do cache em disco
 *  6. getPublicLiveChannels injeta fontes sem mutar INITIAL_LIVE_CHANNELS
 *     (externalCatalog e minhatelaCatalog COMPARTILHAM a mesma instância —
 *     plugin esbuild de módulo compartilhado)
 *  7. probeChannelServers: canal 100% embed → online (sem alerta falso)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf-8');

// Cache em disco isolado ANTES do load dos módulos (CACHE_FILE é capturado
// no top-level do serviço no momento do bundle).
const TMP_CACHE = path.join(os.tmpdir(), `minhatela-test-${process.pid}.json`);
process.env.MINHATELA_CACHE_FILE = TMP_CACHE;

// Registro global de módulos compartilhados entre bundles esbuild: o
// externalCatalog importa './minhatelaCatalog' — sem isso, cada bundle
// teria seu próprio estado de snapshot e o teste 6 não veria a injeção.
const SHARED = (globalThis.__MT_SHARED__ = globalThis.__MT_SHARED__ || {});

async function loadModule(exportsFrom, file, shared = {}) {
  const sharedKeys = Object.keys(shared);
  const plugin = {
    name: 'mt-shared-modules',
    setup(build) {
      if (sharedKeys.length === 0) return;
      const filter = new RegExp(
        '^(' + sharedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')$'
      );
      build.onResolve({ filter }, args => ({ path: args.path, namespace: 'mt-shared' }));
      build.onLoad({ filter: /.*/, namespace: 'mt-shared' }, args => ({
        contents: `module.exports = globalThis.__MT_SHARED__[${JSON.stringify(args.path)}];`,
        loader: 'js',
      }));
    },
  };
  const output = await esbuild.build({
    stdin: {
      contents: `export ${exportsFrom} from '${file}';`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [plugin],
  });
  const filename = path.join(root, `tests/virtual-${path.basename(file, '.ts')}.cjs`);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

let mt, probe, catalog;
test.before(async () => {
  mt = await loadModule(
    '{minhaTelaKey, findMinhaTelaChannel, getMinhaTelaServersFor, getMinhaTelaNewChannels, __setSnapshotForTests, __refreshSnapshotForTests, minhaTelaStats}',
    './server/services/minhatelaCatalog'
  );
  // Instância única de minhatelaCatalog visível para o bundle do externalCatalog.
  SHARED['./minhatelaCatalog'] = mt;
  probe = await loadModule(
    '{probeChannelServers}',
    './server/services/liveChannelProbe'
  );
  catalog = await loadModule(
    '{getPublicLiveChannels}',
    './server/services/externalCatalog',
    { './minhatelaCatalog': mt }
  );
});

test.after(() => {
  mt.__setSnapshotForTests(null);
  delete process.env.MINHATELA_CACHE_FILE;
  try { fs.rmSync(TMP_CACHE, { force: true }); } catch {}
});

const MT_CHANNELS = [
  {
    slug: 'premiere-clubes-hd', name: 'PREMIERE CLUBES HD', category: 'PAY PER VIEW',
    logo: 'https://www.clarotvmais.com.br/img/channels/premiere_clubes.png',
    now: { title: 'VT - Fluminense x Internacional' },
    streams: [
      { id: 127, label: 'PFC1 [MPHD]', url: 'https://meuplayeronlinehd.com/myplay/watch.html?id=premiere', quality: 'FHD' },
      { id: 129, label: 'PFC1 [SPTURBO]', url: 'https://sporturbo.link/player/canais/ampv-pfc1', quality: 'FHD' },
      { id: 133, label: 'PFC1 [HLS]', url: 'https://player-c8y.pages.dev/player?canal=premiere', quality: 'HD' },
      // duplicada exata — deve cair no dedup
      { id: 133, label: 'PFC1 [HLS]', url: 'https://player-c8y.pages.dev/player?canal=premiere', quality: 'HD' },
      // http (não https) — rejeitada
      { url: 'http://inseguro.example.com/premiere', quality: 'HD' },
      // hosts privados — rejeitados (anti-SSRF)
      { url: 'https://192.168.0.10/premiere', quality: 'HD' },
      { url: 'https://localhost/premiere', quality: 'HD' },
    ],
  },
  {
    slug: 'sportv', name: 'SPORTV', category: 'ESPORTES',
    logo: 'https://www.clarotvmais.com.br/img/channels/sportv.png',
    streams: [
      { label: 'SPORTV [MPHD]', url: 'https://meuplayeronlinehd.com/myplay/watch.html?id=sportv', quality: 'FHD' },
      { label: 'SPORTV [RDC]', url: 'https://rdcanais.net/sportv', quality: 'HD' },
    ],
  },
  {
    slug: 'espn', name: 'ESPN', category: 'ESPORTES',
    streams: [{ label: 'ESPN [RDC]', url: 'https://rdcanais.net/espn', quality: 'HD' }],
  },
  {
    slug: 'espn2', name: 'ESPN2', category: 'ESPORTES',
    streams: [{ label: 'ESPN [RDC]', url: 'https://rdcanais.net/espn', quality: 'HD' }],
  },
  {
    slug: 'ge-tv-hd', name: 'GE TV HD', category: 'ESPORTES',
    streams: [{ label: 'GE [EMB]', url: 'https://ww5.embedtv.lat/getv', quality: 'HD' }],
  },
  {
    slug: 'discovery-hd', name: 'DISCOVERY HD', category: 'DOCUMENTARIOS',
    streams: [{ label: 'DISC [EMB]', url: 'https://ww5.embedtv.lat/discovery', quality: 'HD' }],
  },
  {
    slug: 'bm-c-hd', name: 'BM&C HD', category: 'NOTICIAS',
    streams: [{ label: 'BMC [EMB]', url: 'https://ww5.embedtv.lat/bmc', quality: 'HD' }],
  },
  {
    slug: 'cazetv', name: 'CazéTV', category: 'ESPORTES',
    streams: [{ label: 'CAZE [EMB]', url: 'https://ww5.embedtv.lat/cazetv', quality: 'HD' }],
  },
  {
    slug: 'paramount-1', name: 'Paramount+ 1', category: 'PAY PER VIEW',
    logo: 'https://www.clarotvmais.com.br/img/channels/paramount.png',
    streams: [{ label: 'PAR+ [NSSPL]', url: 'https://nossoplayeronlinehd.ink/tv/paramount1', quality: 'HD' }],
  },
  {
    slug: 'premiere-8', name: 'Premiere 8', category: 'PAY PER VIEW',
    streams: [{ label: 'PFC8 [RDC]', url: 'https://rdcanais.net/premiere8', quality: 'HD' }],
  },
  {
    slug: 'a-fazenda-18-sinal-1', name: 'A Fazenda 18 - Sinal 1', category: 'A FAZENDA 18',
    streams: [{ label: 'FAZ [EMB]', url: 'https://embedcanaisdetv.xyz/e/index.php?canal=fazenda1', quality: 'HD' }],
  },
  {
    slug: 'cartoon-hd', name: 'CARTOON HD', category: 'INFANTIS',
    streams: [{ label: 'CTN [EMB]', url: 'https://ww5.embedtv.lat/cartoon', quality: 'HD' }],
  },
  {
    slug: 'band-news', name: 'BAND NEWS', category: 'NOTICIAS',
    streams: [{ label: 'BND [EMB]', url: 'https://ww5.embedtv.lat/bandnews', quality: 'HD' }],
  },
  {
    slug: 'discovery-science-hd', name: 'DISCOVERY SCIENCE HD', category: 'DOCUMENTARIOS',
    streams: [{ label: 'DSC [EMB]', url: 'https://ww5.embedtv.lat/discoveryscience', quality: 'HD' }],
  },
];

test.beforeEach(() => {
  mt.__setSnapshotForTests(MT_CHANNELS);
});

// ---------------------------------------------------------------------------
// 1. Normalização / matching
// ---------------------------------------------------------------------------
test('minhaTelaKey: normaliza acentos, case, espaços, hd/sd/ao vivo e parenteses', () => {
  assert.equal(mt.minhaTelaKey('SporTV HD'), 'sportv');
  assert.equal(mt.minhaTelaKey('SPORTV'), 'sportv');
  assert.equal(mt.minhaTelaKey('ESPN 2 HD'), 'espn2');
  assert.equal(mt.minhaTelaKey('ESPN2'), 'espn2');
  assert.equal(mt.minhaTelaKey('CazéTV Ao Vivo'), 'cazetv');
  assert.equal(mt.minhaTelaKey('CazéTV'), 'cazetv');
  assert.equal(mt.minhaTelaKey('ge Fast (Globo Esporte)'), 'gefast');
  assert.equal(mt.minhaTelaKey('Combate HD'), 'combate');
  assert.equal(mt.minhaTelaKey('Band Sports HD'), 'bandsports');
  assert.equal(mt.minhaTelaKey('Animal Planet HD'), 'animalplanet');
  // + e & preservados (Paramount+, BM&C, A&E)
  assert.equal(mt.minhaTelaKey('Paramount+ 1'), 'paramount+1');
  assert.equal(mt.minhaTelaKey('BM&C HD'), 'bm&c');
});

// ---------------------------------------------------------------------------
// 2. Matching de canal (manual + automático)
// ---------------------------------------------------------------------------
test('findMinhaTelaChannel: mapa manual resolve os nomes divergentes', () => {
  assert.equal(mt.findMinhaTelaChannel('premiere-1', 'Premiere 1 HD')?.slug, 'premiere-clubes-hd');
  assert.equal(mt.findMinhaTelaChannel('espn-brasil', 'ESPN Brasil HD')?.slug, 'espn');
  assert.equal(mt.findMinhaTelaChannel('ge-fast', 'ge Fast (Globo Esporte)')?.slug, 'ge-tv-hd');
  assert.equal(mt.findMinhaTelaChannel('discovery-channel', 'Discovery Channel HD')?.slug, 'discovery-hd');
  assert.equal(mt.findMinhaTelaChannel('bmc-news', 'BM&C News')?.slug, 'bm-c-hd');
});

test('findMinhaTelaChannel: matching automático por nome normalizado', () => {
  assert.equal(mt.findMinhaTelaChannel('sportv', 'SporTV HD')?.slug, 'sportv');
  assert.equal(mt.findMinhaTelaChannel('espn-2', 'ESPN 2 HD')?.slug, 'espn2');
  assert.equal(mt.findMinhaTelaChannel('cazetv', 'CazéTV Ao Vivo')?.slug, 'cazetv');
  // canal sem correspondente no MinhaTela
  assert.equal(mt.findMinhaTelaChannel('globo', 'Rede Globo HD'), null);
  assert.equal(mt.findMinhaTelaChannel('history', 'History HD'), null);
});

test('findMinhaTelaChannel: snapshot vazio → null (API caída não quebra nada)', () => {
  mt.__setSnapshotForTests(null);
  assert.equal(mt.findMinhaTelaChannel('premiere-1', 'Premiere 1 HD'), null);
  assert.deepEqual(mt.getMinhaTelaServersFor('premiere-1', 'Premiere 1 HD'), []);
  assert.deepEqual(mt.getMinhaTelaNewChannels(new Set()), []);
});

// ---------------------------------------------------------------------------
// 3. Streams → servidores embed
// ---------------------------------------------------------------------------
test('getMinhaTelaServersFor: https-only, dedup, nomes sequenciais, isEmbed', () => {
  const servers = mt.getMinhaTelaServersFor('premiere-1', 'Premiere 1 HD');
  assert.equal(servers.length, 3);
  assert.deepEqual(servers.map(s => s.name), ['Servidor 1', 'Servidor 2', 'Servidor 3']);
  for (const s of servers) {
    assert.equal(s.isEmbed, true);
    assert.ok(s.url.startsWith('https://'));
  }
  assert.ok(servers.some(s => s.url === 'https://meuplayeronlinehd.com/myplay/watch.html?id=premiere'));
  // dedup: a URL duplicada não aparece duas vezes
  assert.equal(servers.filter(s => s.url === 'https://player-c8y.pages.dev/player?canal=premiere').length, 1);
});

test('getMinhaTelaServersFor: hosts privados/http rejeitados (anti-SSRF)', () => {
  const servers = mt.getMinhaTelaServersFor('premiere-1', 'Premiere 1 HD');
  const urls = servers.map(s => s.url).join(' ');
  assert.ok(!urls.includes('192.168.'));
  assert.ok(!urls.includes('localhost'));
  assert.ok(!urls.includes('http://inseguro'));
});

// ---------------------------------------------------------------------------
// 4. Canais exclusivos
// ---------------------------------------------------------------------------
test('getMinhaTelaNewChannels: exclusivos com categoria mapeada + EPG now', () => {
  const represented = new Set([
    'premiereclubes', 'premiere1', 'sportv', 'espn2', 'espn', 'cazetv', 'combate', 'animalplanet',
    'gefast', 'getv', 'discovery', 'bmc', 'bm&c',
  ]);
  const news = mt.getMinhaTelaNewChannels(represented);
  const byId = Object.fromEntries(news.map(c => [c.id, c]));

  // Paramount+ 1 → PPV não-esportivo → Filmes & Séries
  assert.equal(byId['mt-paramount-1']?.category, 'Filmes & Séries');
  assert.equal(byId['mt-paramount-1']?.quality, 'HD');
  assert.equal(byId['mt-paramount-1']?.servers.length, 1);
  assert.equal(byId['mt-paramount-1']?.servers[0]?.isEmbed, true);

  // Premiere 8 → PPV esportivo → Esportes
  assert.equal(byId['mt-premiere-8']?.category, 'Esportes');

  // A Fazenda (A FAZENDA 18) → Variedades
  assert.equal(byId['mt-a-fazenda-18-sinal-1']?.category, 'Variedades');

  // Cartoon → Infantil | Band News → Notícias | Discovery Science → Variedades
  assert.equal(byId['mt-cartoon-hd']?.category, 'Infantil');
  assert.equal(byId['mt-band-news']?.category, 'Notícias');
  assert.equal(byId['mt-discovery-science-hd']?.category, 'Variedades');

  // Nenhum canal representado vira novo
  assert.ok(!byId['mt-sportv']);
  assert.ok(!byId['mt-premiere-clubes-hd']);
});

// ---------------------------------------------------------------------------
// 5. Refresh end-to-end com fetch mockado (envelope + batch + disco)
// ---------------------------------------------------------------------------
test('refreshSnapshot: envelope {"json":...}, detalhe por slug e cache em disco', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    const body = JSON.parse(init?.body || '{}');
    const respond = (json) => ({ ok: true, status: 200, json: async () => ({ json }) });
    if (String(url).endsWith('/channels/list')) {
      assert.deepEqual(body, { json: {} });
      return respond({ channels: [
        { slug: 'premiere-clubes-hd', name: 'PREMIERE CLUBES HD', category: 'PAY PER VIEW' },
        { slug: 'sportv', name: 'SPORTV', category: 'ESPORTES' },
      ]});
    }
    if (String(url).endsWith('/channels/get')) {
      assert.deepEqual(Object.keys(body.json), ['slug']);
      if (body.json.slug === 'premiere-clubes-hd') {
        return respond({ slug: 'premiere-clubes-hd', name: 'PREMIERE CLUBES HD', category: 'PAY PER VIEW',
          now: { title: 'Jogo ao vivo' },
          streams: [
            { label: 'A', url: 'https://a.example.com/p1', quality: 'FHD' },
            { label: 'B', url: 'https://b.example.com/p1', quality: 'HD' },
          ] });
      }
      return respond({ slug: 'sportv', name: 'SPORTV', category: 'ESPORTES',
        streams: [{ label: 'C', url: 'https://c.example.com/sv', quality: 'HD' }] });
    }
    throw new Error('rota inesperada: ' + url);
  };
  try {
    mt.__setSnapshotForTests(null);
    await mt.__refreshSnapshotForTests();
    // 1 lista + 2 detalhes
    assert.equal(calls.filter(u => u.endsWith('/channels/list')).length, 1);
    assert.equal(calls.filter(u => u.endsWith('/channels/get')).length, 2);

    const servers = mt.getMinhaTelaServersFor('premiere-1', 'Premiere 1 HD');
    assert.equal(servers.length, 2);
    assert.equal(servers[0]?.url, 'https://a.example.com/p1');

    const stats = mt.minhaTelaStats();
    assert.equal(stats.channels, 2);
    assert.equal(stats.sources, 3);
    assert.equal(stats.stale, false);

    // EPG "now" do detalhe disponível no canal novo
    const represented = new Set(['sportv', 'premiereclubes', 'premiere1']);
    const news = mt.getMinhaTelaNewChannels(represented);
    assert.ok(!news.some(c => c.id === 'mt-sportv'));

    // cache em disco persistiu (arquivo isolado do TMP)
    const disk = JSON.parse(fs.readFileSync(TMP_CACHE, 'utf-8'));
    assert.equal(disk.channels.length, 2);
    assert.ok(disk.fetchedAt > 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------------------------------------------------------------------------
// 6. getPublicLiveChannels injeta sem mutar o catálogo estático
// ---------------------------------------------------------------------------
test.skip('getPublicLiveChannels: anexa fontes embed sem mutar INITIAL_LIVE_CHANNELS (desativado: MinhaTela desvinculado a pedido do dono)', () => {
  const beforeServers = read('src/data/liveChannels.ts');
  const channels = catalog.getPublicLiveChannels();

  // Premiere Clubes (id premiere-1) está travado (lockServers:true) nas fontes
  // curadas Saimo HD + embedTV — NÃO recebe embeds do MinhaTela e fica com 2 servidores
  // (proxy assinado). SporTV (id sportv) também foi travado na mesma fonte.
  const premiere = channels.find(c => c.id === 'premiere-1');
  assert.ok(premiere, 'premiere-1 presente');
  assert.equal(premiere.name, 'Premiere Clubes');
  assert.equal(premiere.lockServers, true);
  assert.equal(premiere.servers.filter(s => s.isEmbed).length, 0); // sem embeds anexados
  assert.equal(premiere.servers.length, 2); // travado nas fontes curadas (Saimo HD + embedTV)
  assert.ok(premiere.servers[0]?.url.startsWith('/api/live-stream-proxy?url='), 'servidor 1 é o proxy assinado Saimo HD');

  const sportv = channels.find(c => c.id === 'sportv');
  assert.equal(sportv.lockServers, true);
  assert.equal(sportv.servers.filter(s => s.isEmbed).length, 0); // travado, sem embeds

  // CazéTV (id cazetv) está travado (lockServers:true) nas 2 fontes curadas (Saimo FHD + embedTV),
  // sem embeds de terceiros anexados.
  const cazetv = channels.find(c => c.id === 'cazetv');
  assert.ok(cazetv, 'cazetv presente');
  assert.equal(cazetv.lockServers, true);
  assert.equal(cazetv.servers.filter(s => s.isEmbed).length, 0);

  // BM&C News (id bmc-news) NÃO está travado -> continua recebendo embeds do MinhaTela.
  // Cobertura do merge "anexa fontes embed" para canais não-locked.
  const bmc = channels.find(c => c.id === 'bmc-news');
  assert.ok(bmc, 'bmc-news presente');
  assert.ok(!bmc.lockServers);
  assert.ok(bmc.servers.filter(s => s.isEmbed).length >= 1, 'bmc-news recebe embeds do MinhaTela');

  // Canal exclusivo novo entrou no catálogo público
  const paramount = channels.find(c => c.id === 'mt-paramount-1');
  assert.ok(paramount, 'mt-paramount-1 no catálogo');
  assert.equal(paramount.category, 'Filmes & Séries');
  assert.ok(paramount.servers.every(s => s.isEmbed));

  // O arquivo estático não mudou (fonte da verdade intacta — sem mutação)
  assert.equal(read('src/data/liveChannels.ts'), beforeServers);
});

// ---------------------------------------------------------------------------
// 7. Probe: canal 100% embed não gera alerta falso
// ---------------------------------------------------------------------------
test('probeChannelServers: canal só de embeds → online (sem sinal HLS verificável é esperado)', async () => {
  const neverCalled = async () => { throw new Error('não deveria provar embed'); };
  const res = await probe.probeChannelServers(
    [
      { url: 'https://a.example.com/e1', isEmbed: true },
      { url: 'https://b.example.com/e2', isEmbed: true },
    ],
    neverCalled
  );
  assert.equal(res.online, true);

  // misto: embed é pulado e o HLS é provado
  const probed = [];
  const res2 = await probe.probeChannelServers(
    [
      { url: 'https://embed.example.com/e1', isEmbed: true },
      { url: 'https://hls.example.com/live.m3u8' },
    ],
    async (url) => { probed.push(url); return { online: true, statusCode: 200 }; }
  );
  assert.equal(res2.online, true);
  assert.deepEqual(probed, ['https://hls.example.com/live.m3u8']);
});

// ---------------------------------------------------------------------------
// 8. Guards de integração
// ---------------------------------------------------------------------------
test.skip('guard: server.ts inicia o watcher MinhaTela (desativado a pedido do dono)', () => {
  const src = read('server.ts');
  assert.ok(src.includes('startMinhaTelaWatcher'), 'watcher chamado no boot');
  assert.ok(src.includes('minhatelaCatalog'), 'import do serviço presente');
});

test('guard: .gitignore cobre o cache dinâmico do MinhaTela', () => {
  const gi = read('.gitignore');
  assert.ok(gi.includes('data/minhatela-cache.json'));
});

test.skip('guard: getPublicLiveChannels injeta MinhaTela após o Saimo (desativado a pedido do dono)', () => {
  const src = read('server/services/externalCatalog.ts');
  assert.ok(src.includes('getMinhaTelaServersFor'), 'anexa fontes nos canais existentes');
  assert.ok(src.includes('getMinhaTelaNewChannels'), 'adiciona canais exclusivos');
  assert.ok(src.includes('{ ...ch, servers: [...ch.servers, ...extra] }'), 'cópia imutável do canal');
});
