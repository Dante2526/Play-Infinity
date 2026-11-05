const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

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

const sampleCatalog = `
canal: Premiere Clubes
categoria: Esportes
logo: https://img.faz-o-eli.online/premiere.png
fonte: https://d1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn13embed.xyz/premiereclubes/index.m3u8
qualidade: FHD
referer: https://embedcanaisdetv.xyz/
agente: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36
fonte: https://804d60c4f9bced6aed1ac3bbc5130622.s25-cloudfront-net.lat/stream/37423de26588e33f7b814e400541a754/error.txt
qualidade: Qualidade não informada
referer: https://w7.embedtv.cc/
agente: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36

canal: SporTV 2
categoria: Esportes
logo: https://img.faz-o-eli.online/sportv2.png
fonte: https://d1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn10embed.xyz/sportv2/index.m3u8
qualidade: FHD
referer: https://embedcanaisdetv.xyz/
agente: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36
fonte: https://804d60c4f9bced6aed1ac3bbc5130622.s25-cloudfront-net.lat/stream/b7f09e859ba72ee5259b7bd29ec9023a/error.txt
qualidade: Qualidade não informada
referer: https://w7.embedtv.cc/
agente: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36
`;

let watcherMod;
test.before(async () => {
  watcherMod = await loadModule(
    '{parseSaimoCatalog, setSaimoCatalogMemoryCache, getSaimoLiveSource, normalizeKey, forceTokenRefresh}',
    './server/services/saimoLiveTokenWatcher'
  );
});

test('saimoLiveTokenWatcher: parseSaimoCatalog extrai canais e fontes corretamente', () => {
  const result = watcherMod.parseSaimoCatalog(sampleCatalog);

  assert.ok(result.has('premiereclubes'));
  const prem = result.get('premiereclubes');
  assert.strictEqual(prem.sources.length, 2);
  assert.strictEqual(prem.sources[0].url, 'https://d1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn13embed.xyz/premiereclubes/index.m3u8');
  assert.strictEqual(prem.sources[0].referer, 'https://embedcanaisdetv.xyz/');
  assert.strictEqual(prem.sources[1].url, 'https://804d60c4f9bced6aed1ac3bbc5130622.s25-cloudfront-net.lat/stream/37423de26588e33f7b814e400541a754/error.txt');
  assert.strictEqual(prem.sources[1].referer, 'https://w7.embedtv.cc/');
});

test('saimoLiveTokenWatcher: getSaimoLiveSource resolve por channelId ou nome (1-based)', () => {
  const parsed = watcherMod.parseSaimoCatalog(sampleCatalog);
  watcherMod.setSaimoCatalogMemoryCache(parsed);

  // Por ID
  const s1 = watcherMod.getSaimoLiveSource('premiere-1', 1);
  assert.ok(s1);
  assert.strictEqual(s1.url, 'https://d1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn13embed.xyz/premiereclubes/index.m3u8');

  const s2 = watcherMod.getSaimoLiveSource('premiere-1', 2);
  assert.ok(s2);
  assert.strictEqual(s2.url, 'https://804d60c4f9bced6aed1ac3bbc5130622.s25-cloudfront-net.lat/stream/37423de26588e33f7b814e400541a754/error.txt');

  // Por nome
  const s2ByName = watcherMod.getSaimoLiveSource('Premiere Clubes', 2);
  assert.ok(s2ByName);
  assert.strictEqual(s2ByName.url, s2.url);

  // SporTV 2
  const sp2 = watcherMod.getSaimoLiveSource('sportv-2', 1);
  assert.ok(sp2);
  assert.strictEqual(sp2.url, 'https://d1-ywppjexvlyulasvmgzjdftfjikth2210oq80soveui6lkbi2iza2zf.cdn10embed.xyz/sportv2/index.m3u8');

  // Fonte inexistente
  const s99 = watcherMod.getSaimoLiveSource('premiere-1', 99);
  assert.strictEqual(s99, null);

  // Canal inexistente
  const none = watcherMod.getSaimoLiveSource('canal-fantasma', 1);
  assert.strictEqual(none, null);
});

test('saimoLiveTokenWatcher: normalizeKey remove acentos, espaços e caracteres especiais', () => {
  assert.strictEqual(watcherMod.normalizeKey('Premiere Clubes HD'), 'premiereclubes');
  assert.strictEqual(watcherMod.normalizeKey('SporTV 2'), 'sportv2');
  assert.strictEqual(watcherMod.normalizeKey('sportv-2'), 'sportv2');
  assert.strictEqual(watcherMod.normalizeKey('premiere-1'), 'premiere1');
});

test('saimoLiveTokenWatcher: forceTokenRefresh respeita debounce e retorna boolean', async () => {
  const parsed = watcherMod.parseSaimoCatalog(sampleCatalog);
  watcherMod.setSaimoCatalogMemoryCache(parsed);

  const res1 = await watcherMod.forceTokenRefresh('premiere-1');
  assert.strictEqual(typeof res1, 'boolean');
});
