import { Worker } from 'node:worker_threads';
const WORKER_SOURCE = String.raw`
"use strict";
const POW_BE = 512, POW_LT = POW_BE - 1, POW_DR = 2, POW_LR = 2654435761, POW_HR = 2246822519;
const powRotl = (t, e) => ((t << e) | (t >>> (32 - e))) >>> 0;
const powMul = (t, e) => Math.imul(t, e) >>> 0;
function powMix(t) {
  t[0] = (t[0] + t[1]) >>> 0; t[3] = powRotl(t[3] ^ t[0], 16);
  t[2] = (t[2] + t[3]) >>> 0; t[1] = powRotl(t[1] ^ t[2], 12);
  t[0] = (t[0] + t[1]) >>> 0; t[3] = powRotl(t[3] ^ t[0], 8);
  t[2] = (t[2] + t[3]) >>> 0; t[1] = powRotl(t[1] ^ t[2], 7);
}
function powHash(t) {
  const e = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762]);
  for (let i = 0; i < t.length; i++) { e[0] = (e[0] + t[i]) >>> 0; e[0] = powRotl(e[0], 7); powMix(e); }
  for (let i = 0; i < 8; i++) powMix(e);
  const r = new Uint32Array(POW_BE);
  for (let i = 0; i < POW_BE; i++) { powMix(e); r[i] = (e[0] ^ e[2]) >>> 0; }
  for (let i = 0; i < POW_DR; i++) {
    for (let s = 0; s < POW_BE; s++) {
      const a = r[s] & POW_LT;
      let c = (r[s] + r[a]) >>> 0;
      c = powRotl(c, 13);
      c = (c ^ powMul(r[(s + 1) & POW_LT], POW_LR)) >>> 0;
      r[s] = c; e[0] = (e[0] ^ c) >>> 0; powMix(e);
    }
  }
  const n = new Uint32Array(8), o = POW_BE / 8;
  for (let i = 0; i < 8; i++) {
    powMix(e);
    let s = e[0];
    const a = i * o;
    for (let c = 0; c < o; c++) {
      const d = r[a + c];
      s = (s + d) >>> 0; s = powRotl(s, 5); s = (s ^ powMul(d, POW_HR)) >>> 0;
    }
    n[i] = (s ^ e[2]) >>> 0;
  }
  return n;
}
function powLeadingZeros(t) {
  let e = 0;
  for (let r = 0; r < t.length; r++) {
    const n = t[r];
    if (n === 0) { e += 32; continue; }
    return e + Math.clz32(n);
  }
  return e;
}
function powStrBytes(t) {
  const e = new Uint8Array(t.length);
  for (let r = 0; r < t.length; r++) e[r] = t.charCodeAt(r) & 255;
  return e;
}
const { parentPort } = require("node:worker_threads");
parentPort.on("message", (m) => {
  const { nonce, difficulty, timeoutMs } = m;
  if (!(typeof nonce === "string") || !(typeof difficulty === "number")) {
    parentPort.postMessage({ id: m.id, solution: null, error: "argumentos inválidos" });
    return;
  }
  if (difficulty <= 0) { parentPort.postMessage({ id: m.id, solution: "0" }); return; }
  const prefix = nonce + ":";
  const start = Date.now();
  let s = 0;
  for (;;) {
    for (let c = 0; c < 1024; c++) {
      if (powLeadingZeros(powHash(powStrBytes(prefix + s))) >= difficulty) {
        parentPort.postMessage({ id: m.id, solution: String(s), ms: Date.now() - start });
        return;
      }
      s++;
    }
    if (Date.now() - start > timeoutMs) {
      parentPort.postMessage({ id: m.id, solution: null, ms: Date.now() - start, timeout: true });
      return;
    }
  }
});
`;

type Job = { nonce: string; difficulty: number; expires: number; resolve: (value: string | null) => void };
const queue: Job[] = [];
const MAX_ACTIVE_WORKERS = 2;
const MAX_QUEUE_LENGTH = 8;
let activeWorkers = 0;

function pump() {
  while (activeWorkers < MAX_ACTIVE_WORKERS && queue.length > 0) {
    const job = queue.shift()!;
    const remaining = job.expires - Date.now();
    if (remaining <= 0) {
      job.resolve(null);
      continue;
    }
    activeWorkers++;
    let worker: Worker | undefined, settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker?.terminate();
      activeWorkers = Math.max(0, activeWorkers - 1);
      job.resolve(value);
      pump();
    };
    const timer = setTimeout(() => finish(null), remaining);
    try {
      worker = new Worker(WORKER_SOURCE, { eval: true, resourceLimits: { maxOldGenerationSizeMb: 32 } });
      worker.once('message', value => finish(typeof value.solution === 'string' ? value.solution : null));
      worker.once('error', () => finish(null));
      worker.once('exit', () => finish(null));
      worker.postMessage({ id: 1, nonce: job.nonce, difficulty: job.difficulty, timeoutMs: remaining });
    } catch {
      finish(null);
    }
  }
}

export function solveBysePowAsync(nonce: string, difficulty: number, timeoutMs = 30000): Promise<string | null> {
  if (typeof nonce !== 'string' || nonce.length > 256 || !Number.isInteger(difficulty) || difficulty < 0 || difficulty > 24 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.resolve(null);
  if (difficulty === 0) return Promise.resolve('0');
  if (queue.length >= MAX_QUEUE_LENGTH) return Promise.resolve(null);
  return new Promise(resolve => {
    queue.push({ nonce, difficulty, expires: Date.now() + Math.min(timeoutMs, 30000), resolve });
    pump();
  });
}
