/**
 * Harness mínimo que replica a topologia de rate-limiting real do server.ts:
 *   globalLimiter (600/min) → [static] → middleware de seleção:
 *     scrapingPrefixes → scraperLimiter (30/min)
 *     senão            → apiLimiter (150/min)
 * trust proxy = 1 (como em produção atrás do nginx).
 *
 * Simula N sessões de usuário (IPs distintos via X-Forwarded-For) abrindo
 * episódios em sequência: cada "abertura" = 1× /api/playback-candidates +
 * 2× /api/playback-health, e cada health faz 1 fetch interno 127.0.0.1
 * para um resolver de scraping (/api/md-stream | /api/myembed-stream).
 * Verifica se alguma sub-requisição interna leva 429.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { Worker, isMainThread, parentPort } = require('node:worker_threads');

// ---- app replicado (roda no worker; produção tem 2 workers atrás do PM2) ----
if (!isMainThread) {
  const app = express();
  app.set('trust proxy', 1);
  const scrapingPrefixes = ['/watchplayer-stream','/myembed-stream','/byse-resolve','/md-stream','/stream-proxy','/vidsrc-stream','/nixplay'];
  const mkScraper = () => rateLimit({ windowMs: 60000, max: 30, message: { success:false, error:'Limite de scraping excedido.' }, standardHeaders: true, legacyHeaders: false, skip: process.env.SKIP_LOCALHOST === '1' ? (req) => req.ip === '127.0.0.1' : undefined });
  const scraperLimiter = mkScraper();
  const apiLimiter = rateLimit({ windowMs: 60000, max: 150, message: { success:false, error:'Limite de API excedido.' }, standardHeaders: true, legacyHeaders: false });

  // Reproduz o mount real: app.use("/api", ...) → req.path relativo ao mount,
  // prefixos "/md-stream" etc. dão match nos paths reais /api/md-stream
  app.use('/api', (req, res, next) => {
    if (scrapingPrefixes.some(p => req.path.startsWith(p))) return scraperLimiter(req, res, next);
    return apiLimiter(req, res, next);
  });

  // resolvers de scraping (o que /api/md-stream e /api/myembed-stream fazem
  // de verdade: fetch externo. Aqui só contamos a requisição)
  let internalHits = 0, internal429 = 0;
  app.get('/api/md-stream', (req, res) => { if (res.statusCode === 429) internal429++; internalHits++; res.json({ proxyUrl: '/api/md-proxy?x=1' }); });
  app.get('/api/myembed-stream', (req, res) => { if (res.statusCode === 429) internal429++; internalHits++; res.json({ proxyUrl: '/api/stream-proxy?x=1' }); });

  // endpoints que o browser chama; o health faz fetch interno ao próprio servidor
  app.get('/api/playback-candidates', (req, res) => res.json({ servers: {} }));
  app.get('/api/playback-health', async (req, res) => {
    const port = req.socket.localPort;
    const origin = `http://127.0.0.1:${port}`;
    const results = await Promise.all(['/api/md-stream', '/api/myembed-stream'].map(async (p) => {
      const r = await fetch(origin + p, { headers: {} }); // SEM X-Forwarded-For → IP = 127.0.0.1
      return { path: p, status: r.status };
    }));
    res.json({ results, counters: { internalHits, internal429 } });
  });

  const srv = app.listen(0, '127.0.0.1', () => parentPort.postMessage({ port: srv.address().port }));
  return;
}

// ---- teste (thread principal) ----
let base;
const workers = [];

const spawnApp = (env) => new Promise(resolve => {
  const w = new Worker(__filename, env ? { env: { ...process.env, ...env } } : {});
  workers.push(w);
  w.once('message', msg => resolve(`http://127.0.0.1:${msg.port}`));
});

before(async () => { base = await spawnApp(); });

// Workers com servidores express manteriam o event loop vivo e travariam o
// node --test da suíte completa — termina todos explicitamente.
after(async () => {
  await Promise.all(workers.map(w => w.terminate()));
});

const session = async (userIp) => {
  // 1 candidates + 2 healths (padrão preparePlaybackStartup), por episódio
  const out = [];
  for (let ep = 0; ep < 10; ep++) {
    await fetch(`${base}/api/playback-candidates?id=1&type=tv&s=1&e=${ep+1}`, { headers: { 'X-Forwarded-For': userIp } });
    for (let h = 0; h < 2; h++) {
      const r = await fetch(`${base}/api/playback-health?id=1&type=tv&s=1&e=${ep+1}&servers=srv_mixdrop,srv_vip`, { headers: { 'X-Forwarded-For': userIp } });
      out.push(await r.json());
    }
  }
  return out;
};

test('zapeando 10 episódios seguidos: sub-requisições internas levam 429 (limite de 30/min estoura)', async () => {
  const results = await session('203.0.113.10');
  // 10 episódios × 2 healths × 2 resolvers internos = 40 fetches internos em 127.0.0.1
  const internal = results.flatMap(r => r.results || []);
  const four29 = internal.filter(r => r.status === 429);
  console.log(`internos: ${internal.length}, 429: ${four29.length}`);
  assert.ok(four29.length > 0, `Esperava >=1 interno com 429; obtido ${four29.length}/${internal.length}`);
});

test('3 usuários simultâneos x 3 episódios: 429 compartilhado entre todos pelo IP 127.0.0.1', async () => {
  // janela nova: cria outra app (outro worker) pra resetar contadores
  const fresh = await spawnApp();
  const run = (ip) => (async () => {
    const out = [];
    for (let ep = 0; ep < 3; ep++) {
      await fetch(`${fresh}/api/playback-candidates?id=1&type=tv&s=1&e=${ep+1}`, { headers: { 'X-Forwarded-For': ip } });
      for (let h = 0; h < 2; h++) {
        const r = await fetch(`${fresh}/api/playback-health?id=1&type=tv&s=1&e=${ep+1}&servers=srv_mixdrop,srv_vip`, { headers: { 'X-Forwarded-For': ip } });
        out.push(await r.json());
      }
    }
    return out;
  })();
  const all = await Promise.all([run('203.0.113.1'), run('203.0.113.2'), run('203.0.113.3')]);
  const internal = all.flat().flatMap(r => r.results || []);
  const four29 = internal.filter(r => r.status === 429);
  console.log(`internos: ${internal.length}, 429: ${four29.length}`);
  assert.ok(four29.length > 0, 'Esperava 429 compartilhado entre usuários distintos');
});

test('com skip de 127.0.0.1 nos limiters, 10 episódios seguidos não geram 429 interno', async () => {
  const fresh = await spawnApp({ SKIP_LOCALHOST: '1' });
  const results = await session2(fresh, '203.0.113.99');
  const internal = results.flatMap(r => r.results || []);
  const four29 = internal.filter(r => r.status === 429);
  assert.equal(four29.length, 0, `skip resolveria: 429 obtido em ${JSON.stringify(four29)}`);
  assert.ok(internal.length >= 40, 'deve ter feito as 40 sub-requisições internas');

  // O skip NÃO pode enfraquecer o limite para clientes externos: 35 hits
  // diretos num endpoint de scraping a partir de um IP externo continuam
  // limitados a 30/min (o 31º em diante recebe 429)
  let external429 = 0;
  for (let i = 0; i < 35; i++) {
    const r = await fetch(`${fresh}/api/md-stream?id=1&name=x`, { headers: { 'X-Forwarded-For': '198.51.100.7' } });
    if (r.status === 429) external429++;
  }
  assert.ok(external429 >= 5, `cliente externo deve continuar limitado; 429 obtido: ${external429}/35`);

  async function session2(b, userIp) {
    const out = [];
    for (let ep = 0; ep < 10; ep++) {
      await fetch(`${b}/api/playback-candidates?id=1&type=tv&s=1&e=${ep+1}`, { headers: { 'X-Forwarded-For': userIp } });
      for (let h = 0; h < 2; h++) {
        const r = await fetch(`${b}/api/playback-health?id=1&type=tv&s=1&e=${ep+1}&servers=srv_mixdrop,srv_vip`, { headers: { 'X-Forwarded-For': userIp } });
        out.push(await r.json());
      }
    }
    return out;
  }
});
