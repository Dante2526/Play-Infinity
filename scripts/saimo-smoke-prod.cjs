#!/usr/bin/env node
/**
 * ============================================================================
 * SAIMO VOD — SMOKE TEST DE PRODUÇÃO
 * ============================================================================
 *
 * Propósito (ADR-0003): validar de ponta a ponta, contra a produção, que o
 * catálogo Saimo entrega streams reproduzíveis. Teria pegado em 26/10 o bug
 * latente em que a chave curta "embedplay" da blacklist matava 95% do HLS
 * (todas as amostras HLS retornariam 502) — sem depender de um usuário
 * abrir o app e reportar tela preta.
 *
 * O que ele faz:
 *   1. Confere /api/health (release sob teste).
 *   2. Amostra N TMDB IDs do catálogo Saimo:
 *        --ids 123,456        → lista explícita
 *        data/saimo-catalog.db → SELECT RANDOM local (se existir)
 *        fichas.txt upstream   → https://filmes-saimo.pages.dev/fichas.txt
 *        fallback embutido     → IDs conhecidos dos testes
 *   3. Para cada ID: GET /api/saimo-stream?prefer=<hls|mp4> com leitura de
 *      UM único chunk (não baixa o vídeo inteiro) e classifica:
 *        200 + video/*  → OK (registra content-type: HLS vs MP4)
 *        404            → fora do catálogo (excluído do denominador)
 *        502            → FALHA: catálogo tem, fontes todas mortas
 *        5xx/rede/timeout → FALHA
 *   4. Exit code 0 se taxa de sucesso >= --min-rate (default 0.5), senão 1.
 *
 * Uso:
 *   node scripts/saimo-smoke-prod.cjs                       # 12 amostras, prefer=hls
 *   node scripts/saimo-smoke-prod.cjs --n 30 --prefer mp4   # valida a família MP4
 *   node scripts/saimo-smoke-prod.cjs --ids 978592,299534   # IDs específicos
 *   node scripts/saimo-smoke-prod.cjs --json                # saída máquina
 */
'use strict';

const DEFAULTS = {
  base: 'https://play-infinity.stream',
  fichasUrl: 'https://filmes-saimo.pages.dev/fichas.txt',
  n: 12,
  prefer: 'hls',
  audio: 'dub',
  timeoutMs: 25000,
  concurrency: 4,
  minRate: 0.5,
};

// Amostras mínimas conhecidas (mesmas dos testes) caso DB e rede falhem.
const FALLBACK_SAMPLES = [
  { id: 978592, type: 'movie' }, // A Teia (filme)
  { id: 299939, type: 'tv', s: 1, e: 2 }, // Monstro: A História de Lizzie Borden S01E02
];

function parseArgs(argv) {
  const out = { ...DEFAULTS, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--n') out.n = Math.max(1, parseInt(next(), 10) || DEFAULTS.n);
    else if (a === '--ids') out.ids = String(next()).split(',').map(x => parseInt(x.trim(), 10)).filter(Number.isFinite);
    else if (a === '--base') out.base = String(next()).replace(/\/+$/, '');
    else if (a === '--prefer') out.prefer = next() === 'mp4' ? 'mp4' : 'hls';
    else if (a === '--audio') out.audio = next() === 'leg' ? 'leg' : 'dub';
    else if (a === '--timeout-ms') out.timeoutMs = Math.max(3000, parseInt(next(), 10) || DEFAULTS.timeoutMs);
    else if (a === '--concurrency') out.concurrency = Math.max(1, parseInt(next(), 10) || DEFAULTS.concurrency);
    else if (a === '--min-rate') out.minRate = Math.min(1, Math.max(0, parseFloat(next()) || DEFAULTS.minRate));
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') {
      console.log('uso: node scripts/saimo-smoke-prod.cjs [--n 12] [--ids 1,2] [--base URL] [--prefer hls|mp4] [--min-rate 0.5] [--json]');
      process.exit(0);
    }
  }
  return out;
}

function log(opts, ...args) {
  if (!opts.json) console.log(...args);
}

async function fetchWithTimeout(url, timeoutMs, extraHeaders = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: extraHeaders, redirect: 'manual' });
  } finally {
    clearTimeout(timer);
  }
}

/** Lê só o primeiro chunk do body e cancela — valida bytes sem baixar GBs. */
async function readOneChunk(response) {
  if (!response.body) return { bytes: 0 };
  const reader = response.body.getReader();
  try {
    const { value } = await reader.read();
    return { bytes: value ? value.byteLength : 0 };
  } finally {
    try { await reader.cancel(); } catch { /* upstream pode fechar antes */ }
  }
}

async function getHealth(opts) {
  try {
    const res = await fetchWithTimeout(`${opts.base}/api/health`, 10000);
    return await res.json();
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
}

/** IDs do banco local (se existir). Usa node:sqlite (Node >= 22.5). */
async function idsFromLocalDb(opts, n) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const fs = require('node:fs');
    const path = require('node:path');
    const dbPath = path.resolve(__dirname, '..', 'data', 'saimo-catalog.db');
    if (!fs.existsSync(dbPath)) return [];
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db.prepare('SELECT tmdb_id FROM movies ORDER BY RANDOM() LIMIT ?').all(n);
      return rows.map(r => ({ id: r.tmdb_id, type: 'movie' }));
    } finally {
      db.close();
    }
  } catch (e) {
    log(opts, `[warn] DB local indisponível: ${e.message}`);
    return [];
  }
}

/** IDs do fichas.txt upstream (mesma fonte do build_saimo_sqlite.py). */
async function idsFromFichas(opts, n) {
  try {
    const res = await fetchWithTimeout(opts.fichasUrl, 15000, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    if (!res.ok) return [];
    const text = await res.text();
    const movies = [];
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith('capa:')) continue;
      const cols = t.split('\t');
      if (cols.length >= 3 && cols[0].trim() === 'f' && /^\d+$/.test(cols[2].trim())) {
        movies.push({ id: parseInt(cols[2].trim(), 10), type: 'movie' });
      }
    }
    // amostra aleatória
    for (let i = movies.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [movies[i], movies[j]] = [movies[j], movies[i]];
    }
    return movies.slice(0, n);
  } catch (e) {
    log(opts, `[warn] fichas.txt indisponível: ${e.message}`);
    return [];
  }
}

async function resolveSamples(opts) {
  if (opts.ids && opts.ids.length) {
    return opts.ids.map(id => ({ id, type: 'movie' }));
  }
  let samples = await idsFromLocalDb(opts, opts.n);
  let source = 'data/saimo-catalog.db (local)';
  if (!samples.length) {
    samples = await idsFromFichas(opts, opts.n);
    source = 'fichas.txt (upstream Saimo)';
  }
  if (!samples.length) {
    samples = FALLBACK_SAMPLES.slice();
    source = 'fallback embutido';
  }
  return { samples: samples.slice(0, opts.n), source };
}

async function probeOne(opts, sample) {
  const params = new URLSearchParams({
    id: String(sample.id),
    type: sample.type,
    audio: opts.audio,
    prefer: opts.prefer,
  });
  if (sample.type === 'tv') {
    params.set('s', String(sample.s || 1));
    params.set('e', String(sample.e || 1));
  }
  const url = `${opts.base}/api/saimo-stream?${params}`;
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(url, opts.timeoutMs);
    const elapsed = Date.now() - started;
    if (res.status === 404) {
      return { sample, url, status: 404, verdict: 'not_in_catalog', elapsedMs: elapsed };
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      return { sample, url, status: res.status, verdict: 'fail', reason: `todas as fontes falharam (HTTP ${res.status})`, elapsedMs: elapsed };
    }
    if (res.status >= 500) {
      const body = await res.text().catch(() => '');
      return { sample, url, status: res.status, verdict: 'fail', reason: `HTTP ${res.status}: ${body.slice(0, 120)}`, elapsedMs: elapsed };
    }
    if (res.status >= 200 && res.status < 300) {
      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      const { bytes } = await readOneChunk(res);
      const family = /mpegurl|m3u8/.test(ctype) ? 'hls' : (/video\//.test(ctype) ? 'mp4' : 'other');
      if (bytes === 0 && family === 'other') {
        return { sample, url, status: res.status, verdict: 'fail', reason: `200 sem corpo de vídeo (content-type: ${ctype || 'vazio'})`, elapsedMs: elapsed };
      }
      return { sample, url, status: res.status, verdict: 'ok', contentType: ctype, family, firstChunkBytes: bytes, elapsedMs: elapsed };
    }
    const body = await res.text().catch(() => '');
    return { sample, url, status: res.status, verdict: 'fail', reason: `HTTP ${res.status} inesperado: ${body.slice(0, 120)}`, elapsedMs: elapsed };
  } catch (e) {
    const elapsed = Date.now() - started;
    const reason = e && e.name === 'AbortError' ? `timeout após ${elapsed}ms` : String(e && e.message || e);
    return { sample, url, status: 0, verdict: 'fail', reason, elapsedMs: elapsed };
  }
}

async function runPool(items, concurrency, worker) {
  const results = [];
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const opts = parseArgs(process.argv);
  const health = await getHealth(opts);
  if (health.error) {
    console.error(`[FALHA] /api/health inacessível: ${health.error}`);
    process.exit(2);
  }

  const { samples, source } = await resolveSamples(opts);
  log(opts, `release: ${String(health.release).slice(0, 12)}  |  prefer=${opts.prefer}  |  amostras=${samples.length} (${source})`);

  const results = await runPool(samples, opts.concurrency, s => probeOne(opts, s));

  const ok = results.filter(r => r.verdict === 'ok');
  const fail = results.filter(r => r.verdict === 'fail');
  const missing = results.filter(r => r.verdict === 'not_in_catalog');
  const denom = ok.length + fail.length;
  const rate = denom > 0 ? ok.length / denom : 0;
  const hlsOk = ok.filter(r => r.family === 'hls').length;
  const mp4Ok = ok.filter(r => r.family === 'mp4').length;
  const avgMs = ok.length ? Math.round(ok.reduce((a, r) => a + r.elapsedMs, 0) / ok.length) : 0;

  if (opts.json) {
    console.log(JSON.stringify({
      base: opts.base, prefer: opts.prefer, release: health.release,
      sampled: samples.length, source,
      ok: ok.length, fail: fail.length, notInCatalog: missing.length,
      successRate: Number(rate.toFixed(3)), hlsOk, mp4Ok, avgLatencyMs: avgMs,
      failures: fail.map(r => ({ id: r.sample.id, type: r.sample.type, status: r.status, reason: r.reason })),
    }, null, 2));
  } else {
    for (const r of ok) {
      log(opts, `  ✔ ${r.sample.type}:${r.sample.id}  ${r.family.padEnd(4)} ${(r.contentType || '').split(';')[0].padEnd(24)} ${r.elapsedMs}ms  chunk=${r.firstChunkBytes}B`);
    }
    for (const r of missing) {
      log(opts, `  – ${r.sample.type}:${r.sample.id}  fora do catálogo (404, excluído do cálculo)`);
    }
    for (const r of fail) {
      log(opts, `  ✖ ${r.sample.type}:${r.sample.id}  HTTP ${r.status}  ${r.reason}`);
    }
    log(opts, '');
    log(opts, `RESULTADO: ${ok.length}/${denom} reproduzíveis (${(rate * 100).toFixed(0)}%)  |  HLS=${hlsOk} MP4=${mp4Ok}  |  latência média ${avgMs}ms  |  ${missing.length} fora do catálogo`);
  }

  process.exit(denom === 0 || rate >= opts.minRate ? 0 : 1);
}

main().catch(e => {
  console.error(`[ERRO] ${e && e.stack || e}`);
  process.exit(2);
});
