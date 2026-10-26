/**
 * Guarda de regressão: fluxo de download /api/download (relatório #9)
 *
 * Contexto (3 bugs confirmados EM PRODUÇÃO):
 *  1. O /api/download gravava o videoUrl no mixdropMemoryCache com TTL de 4
 *     HORAS antes mesmo de validar o token na CDN — um 403 deixava a URL morta
 *     presa por 4h naquele worker, e downloads repetidos falhavam 502 sem
 *     re-scrape (confirmado: mesmo fileId, 6 min depois, 502 idêntico sem
 *     nenhuma nova chamada ao embed). O caminho de streaming se auto-cura
 *     (pool probe força refresh + md-proxy renewUrl); o download não tinha nada.
 *  2. Cliente faz fetch(url) sem Range → CDN responde 200 → server REMOVA o
 *     Content-Length (política "chunked sempre" herdada do md-proxy) →
 *     downloadService lê contentLength 0 → barra de progresso em 0% o
 *     download inteiro (200 + Transfer-Encoding: chunked confirmado em prod).
 *  3. keepLength só repassava Content-Length no 206, que nunca acontece no
 *     fluxo do app; e 206 do upstream era devolvido como 200 implícito com
 *     headers parciais (incoerência HTTP).
 *
 * Fix: resolvedor canônico resolveFreshMixdropToken (TTL 10 min, igual ao
 * resto do app) + renewal 1x em 403/404/410 (padrão do md-proxy) +
 * Content-Length repassado sem content-encoding (200 ou 206) + status 206
 * repassado ao cliente que pediu Range.
 *
 * Estratégia: router real bundleado via esbuild (mesma infra do
 * mixdrop.test.cjs), Express em porta efêmera, global.fetch mockado —
 * o cliente do teste usa a referência NATIVA do fetch (lição da #8).
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const express = require('express');
const esbuild = require('esbuild');
const fs = require('node:fs');
const nativeFetch = global.fetch;
const root = path.resolve(__dirname, '..');
const media = Buffer.from('0123456789abcdefghij');
const mediaUrl = 'https://video.mxcontent.net/v2/download-object.mp4?fixture=1';
// ATENÇÃO: mixdropMemoryCache é module-level e vive entre testes — cada teste
// usa um fileId PRÓPRIO pra começar com cache frio (determinístico).
const packerFor = (url) => {
  const source = 'MDCore.wurl=' + JSON.stringify(url) + ';';
  return '<script>eval(function(p,a,c,k,e,d){return ' + JSON.stringify(source) + ';}("x",1,1,"",0,{}))</script>';
};

let router, server, baseUrl;
let embedRequests, cdnRequests;

function cdnResponse(body, status, headers) {
  return new Response(body, { status, headers: { 'content-type': 'video/mp4', ...headers } });
}

before(async () => {
  const result = await esbuild.build({
    absWorkingDir: root,
    stdin: { contents: "export { default as router } from './server/routes/mixdrop';", resolveDir: root, loader: 'ts' },
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
  const filename = path.join(root, 'tests', 'virtual-mixdrop-download.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(result.outputFiles[0].text, filename);
  router = compiled.exports.router;
  const app = express();
  app.use(router);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => { global.fetch = nativeFetch; await server.close(); });

beforeEach(() => {
  embedRequests = []; cdnRequests = [];
  global.fetch = async (url, opts) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'mxdrop.top') {
      embedRequests.push(String(url));
      return new Response(packerFor(mediaUrl));
    }
    if (parsed.hostname === 'video.mxcontent.net') {
      cdnRequests.push(String(url));
      return cdnResponse(media, 200, { 'content-length': String(media.length), 'accept-ranges': 'bytes' });
    }
    return new Response('not found', { status: 404 });
  };
});

const downloadUrl = (fileId, extra = '') => `${baseUrl}/api/download?url=${fileId}&filename=filme.mp4${extra}`;

test('download 200 repassa Content-Length do corpo completo — progresso real do cliente habilitado', async () => {
  const response = await nativeFetch(downloadUrl('dlContentLen1'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), String(media.length));
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(await response.text(), media.toString());
  assert.equal(embedRequests.length, 1, 'cache frio: exatamente 1 scrape do embed');
});

test('download com content-encoding no upstream NÃO repassa Content-Length (tamanho pós-decodificação desconhecido)', async () => {
  global.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'mxdrop.top') return new Response(packerFor(mediaUrl));
    return cdnResponse(media, 200, { 'content-length': String(media.length), 'content-encoding': 'br' });
  };
  const response = await nativeFetch(downloadUrl('dlEnc2'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), null);
});

test('cliente com Range recebe 206 coerente com content-range e content-length parciais', async () => {
  global.fetch = async (url, opts) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'mxdrop.top') return new Response(packerFor(mediaUrl));
    const range = (opts && opts.headers && opts.headers.Range) || '';
    if (range === 'bytes=0-9') {
      return cdnResponse(media.subarray(0, 10), 206, {
        'content-length': '10', 'accept-ranges': 'bytes', 'content-range': 'bytes 0-9/20',
      });
    }
    return cdnResponse(media, 200, { 'content-length': '20' });
  };
  const response = await nativeFetch(downloadUrl('dlRange3'), { headers: { Range: 'bytes=0-9' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-length'), '10');
  assert.equal(response.headers.get('content-range'), 'bytes 0-9/20');
  assert.equal(await response.text(), media.subarray(0, 10).toString());
});

test('CDN 403 no token resolve renewal: re-scrapes o embed e entrega o corpo do token novo', async () => {
  const renewedMediaUrl = 'https://video.mxcontent.net/v2/download-renewed.mp4?fixture=2';
  let first = true;
  global.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'mxdrop.top') {
      embedRequests.push(String(url));
      // 1º scrape devolve token que a CDN vai negar; 2º devolve o renovado
      return new Response(packerFor(first ? mediaUrl : renewedMediaUrl));
    }
    if (parsed.hostname === 'video.mxcontent.net') {
      cdnRequests.push(String(url));
      if (parsed.pathname.includes('download-object')) { first = false; return new Response('forbidden', { status: 403 }); }
      return cdnResponse(media, 200, { 'content-length': String(media.length) });
    }
    return new Response('not found', { status: 404 });
  };
  const response = await nativeFetch(downloadUrl('dlRenew4'));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), media.toString());
  assert.equal(embedRequests.length, 2, 'scrape inicial + exatamente 1 renewal após o 403');
  assert.equal(cdnRequests.length, 2, 'deve tentar a CDN com o token renovado');
  assert.ok(cdnRequests[1].includes('download-renewed'));
});

test('CDN 403 persistente após renewal falha com 502 explícito (não fica preso em loop)', async () => {
  global.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'mxdrop.top') {
      embedRequests.push(String(url));
      return new Response(packerFor(mediaUrl));
    }
    cdnRequests.push(String(url));
    return new Response('forbidden', { status: 403 });
  };
  const response = await nativeFetch(downloadUrl('dlDead5'));
  assert.equal(response.status, 502);
  assert.equal(await response.text(), 'CDN retornou status 403');
  assert.equal(embedRequests.length, 2, 'renewal é limitado a 1 tentativa');
  assert.equal(cdnRequests.length, 2);
});

test('cache compartilhado: 2 downloads seguidos fazem 1 único scrape (TTL canônico de 10 min)', async () => {
  const first = await nativeFetch(downloadUrl('dlCacheShare7'));
  assert.equal(first.status, 200);
  const second = await nativeFetch(downloadUrl('dlCacheShare7'));
  assert.equal(second.status, 200);
  assert.equal(embedRequests.length, 1, 'segundo download deve reusar o cache do resolvedor canônico');
});

test('guarda de fonte: TTL de 4 horas do scraping inline não pode voltar', () => {
  const source = fs.readFileSync(path.join(root, 'server/routes/mixdrop.ts'), 'utf8');
  const downloadBlock = source.slice(source.indexOf('router.get("/api/download"'));
  assert.ok(!downloadBlock.includes('4 * 60 * 60'), 'TTL de 4h proibido no /api/download');
  assert.ok(downloadBlock.includes('resolveFreshMixdropToken'), 'deve usar o resolvedor canônico (TTL 10 min)');
  assert.ok(!downloadBlock.includes('mixdropMemoryCache.set'), 'não pode gravar no cache manualmente (bypass do TTL canônico)');
});

test('guarda de fonte: renewal 403/404/410 presente no bloco do download', () => {
  const source = fs.readFileSync(path.join(root, 'server/routes/mixdrop.ts'), 'utf8');
  const downloadBlock = source.slice(source.indexOf('router.get("/api/download"'));
  assert.ok(downloadBlock.includes('[403, 404, 410]'), 'renewal de token no download');
  assert.ok(downloadBlock.includes('res.status(206)'), 'status 206 repassado ao cliente com Range');
});
