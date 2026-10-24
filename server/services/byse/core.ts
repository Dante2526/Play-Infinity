import { solveBysePowAsync } from "./pow";
/**
 * BYSE Resolver — Porta fiel da PoC validada (23/10/2026).
 *
 * Fluxo server-side (sem iframe, sem frame-busting, sem ads):
 *   1. GET  bysebuho.com/api/videos/{fileId}/embed/details  → embed_frame_url (n1mwq.org)
 *   2. POST n1mwq.org/api/videos/access/challenge            → challenge_id + nonce
 *   3. POST n1mwq.org/api/videos/access/attest               → token + device_id
 *      (ECDSA P-256 sobre o nonce UTF-8, assinatura r||s raw em base64url)
 *   4. POST n1mwq.org/api/videos/{code}/embed/captcha        → pow_nonce + difficulty (16)
 *   5. PoW: hash custom (porta fiel de pow-DEJGtdh2.js)
 *   6. POST .../embed/captcha/verify                          → clearance (X-Captcha-Token)
 *   7. POST .../embed/playback (X-Embed-Parent: bysebuho.com/e/{code}) → AES-256-GCM
 *   8. key = b64u(key_parts[n-1]) + b64u(key_parts[31-n-1]) (version n, tabela n..20)
 *      → decriptografa JSON com sources[0].url = m3u8 1080p na CDN r66nv9ed.com
 *
 * Cache de 20min (token m3u8 dura ~3h). Dedup de requisições concorrentes.
 */
import crypto from "node:crypto";

const BYSE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─────────────────────────────────────────────────────────────────────────────
// PoW — porta fiel e VALIDADA do pow-DEJGtdh2.js
// ─────────────────────────────────────────────────────────────────────────────
const POW_BE = 512, POW_LT = POW_BE - 1, POW_DR = 2, POW_LR = 2654435761, POW_HR = 2246822519;
const powRotl = (t: number, e: number) => ((t << e) | (t >>> (32 - e))) >>> 0;
const powMul = (t: number, e: number) => Math.imul(t, e) >>> 0;

function powMix(t: Uint32Array) {
  t[0] = (t[0] + t[1]) >>> 0; t[3] = powRotl(t[3] ^ t[0], 16);
  t[2] = (t[2] + t[3]) >>> 0; t[1] = powRotl(t[1] ^ t[2], 12);
  t[0] = (t[0] + t[1]) >>> 0; t[3] = powRotl(t[3] ^ t[0], 8);
  t[2] = (t[2] + t[3]) >>> 0; t[1] = powRotl(t[1] ^ t[2], 7);
}

function powHash(t: Uint8Array): Uint32Array {
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

function powLeadingZeros(t: Uint32Array): number {
  let e = 0;
  for (let r = 0; r < t.length; r++) {
    const n = t[r];
    if (n === 0) { e += 32; continue; }
    return e + Math.clz32(n);
  }
  return e;
}

function powStrBytes(t: string): Uint8Array {
  const e = new Uint8Array(t.length);
  for (let r = 0; r < t.length; r++) e[r] = t.charCodeAt(r) & 255;
  return e;
}

function solveBysePow(nonce: string, difficulty: number, timeoutMs = 30000): string | null {
  if (difficulty <= 0) return "0";
  const prefix = nonce + ":";
  const start = Date.now();
  let s = 0;
  for (;;) {
    for (let c = 0; c < 1024; c++) {
      if (powLeadingZeros(powHash(powStrBytes(prefix + s))) >= difficulty) return String(s);
      s++;
    }
    if (Date.now() - start > timeoutMs) return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSÃO BYSE (identidade persistente por processo — como o browser faz)
// ─────────────────────────────────────────────────────────────────────────────
const b64u = (buf: Buffer | string) => Buffer.from(buf as string).toString("base64url");

function rndId(len = 22): string {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let s = "";
  for (let i = 0; i < len; i++) s += abc[crypto.randomInt(abc.length)];
  return s;
}

interface ByseSession {
  viewerId: string;
  privateKey: crypto.KeyObject;
  publicJwk: { kty: string; crv: string; x: string; y: string };
  attest: { token: string; deviceId: string; confidence: number; expiresAt: number } | null;
}
let _session: ByseSession | null = null;

function getByseSession(): ByseSession {
  if (_session) return _session;
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" }) as { kty: string; crv: string; x: string; y: string };
  _session = {
    viewerId: rndId(22),
    privateKey,
    publicJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    attest: null,
  };
  return _session;
}

let stableFingerprint: ReturnType<typeof createClientFingerprint> | undefined;
function buildClientFingerprint() { return stableFingerprint ||= createClientFingerprint(); }
function createClientFingerprint() {
  return {
    user_agent: BYSE_UA,
    architecture: "x86", bitness: "64", platform: "Win32", platform_version: "10.0", model: "",
    ua_full_version: "131.0.0.0",
    brand_full_versions: [
      { brand: "Google Chrome", version: "131.0.0.0" },
      { brand: "Chromium", version: "131.0.0.0" },
      { brand: "Not A(Brand", version: "24.0.0.0" },
    ],
    pixel_ratio: 1, screen_width: 1920, screen_height: 1080, color_depth: 24,
    languages: ["pt-BR", "pt", "en"], timezone: "America/Sao_Paulo",
    hardware_concurrency: 8, device_memory: 8, touch_points: 0,
    webgl_vendor: "Google Inc. (NVIDIA)",
    webgl_renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0)",
    canvas_hash: b64u(crypto.randomBytes(24)),
    audio_hash: b64u(crypto.randomBytes(24)),
    webgl_params_hash: b64u(crypto.randomBytes(24)),
    fonts_hash: b64u(crypto.randomBytes(24)),
    codecs_hash: b64u(crypto.randomBytes(24)),
    media_devices: b64u(crypto.randomBytes(10)),
    pointer_type: "fine,hover",
    extra: {
      vendor: "Google Inc.",
      appVersion: "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  };
}

async function byseJsonFetch(url: string, opts: { method?: string; body?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(url, {
    method: opts.method || "GET",
    redirect: "manual",
    body: opts.body,
    headers: {
      "User-Agent": BYSE_UA,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error('BYSE upstream HTTP ' + res.status);
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* resposta não-JSON */ }
  return { status: res.status, json, text };
}

let attestPending: ReturnType<typeof createByseAttest> | undefined;
async function getByseAttest(N1: string, embedUrl: string) {
  return await (attestPending ||= createByseAttest(N1, embedUrl).finally(() => { attestPending = undefined; }));
}
async function createByseAttest(N1: string, embedUrl: string) {
  const sess = getByseSession();
  if (sess.attest && sess.attest.expiresAt > Date.now()) {
    return { token: sess.attest.token, deviceId: sess.attest.deviceId, confidence: sess.attest.confidence };
  }
  const base = { Origin: N1, Referer: embedUrl, Cookie: `byse_viewer_id=${sess.viewerId}` };
  const ch = await byseJsonFetch(`${N1}/api/videos/access/challenge`, { method: "POST", body: "{}", headers: base });
  if (!ch.json || typeof ch.json !== "object" || !("nonce" in ch.json) || !("challenge_id" in ch.json)) {
    throw new Error(`challenge falhou (${ch.status}): [upstream]`);
  }
  const cj = ch.json as { nonce: string; challenge_id: string };
  const signature = b64u(crypto.sign("sha256", Buffer.from(cj.nonce, "utf8"), sess.privateKey));
  const att = await byseJsonFetch(`${N1}/api/videos/access/attest`, {
    method: "POST",
    body: JSON.stringify({
      viewer_id: "", device_id: "",
      challenge_id: cj.challenge_id,
      nonce: cj.nonce,
      signature,
      public_key: { crv: "P-256", ext: true, key_ops: ["verify"], kty: "EC", x: sess.publicJwk.x, y: sess.publicJwk.y },
      client: buildClientFingerprint(),
      storage: {},
      attributes: { entropy: "high" },
    }),
    headers: base,
  });
  if (!att.json || typeof att.json !== "object" || !("token" in att.json) || !("device_id" in att.json)) {
    throw new Error(`attest falhou (${att.status}): [upstream]`);
  }
  const aj = att.json as { token: string; device_id: string; confidence?: number };
  const confidence = Number(aj.confidence ?? 0.55);
  sess.attest = { token: aj.token, deviceId: aj.device_id, confidence, expiresAt: Date.now() + 8 * 60 * 1000 };
  return { token: aj.token, deviceId: aj.device_id, confidence };
}

// ─────────────────────────────────────────────────────────────────────────────
// DECRYPT — chave AES via tabela de versões (version n → partes [n, 31-n])
// ─────────────────────────────────────────────────────────────────────────────
function b64uToBuf(s: string): Buffer { return Buffer.from(s, "base64url"); }

function deriveByseKey(playback: any): Buffer | null {
  const parts: string[] = Array.isArray(playback?.key_parts) ? playback.key_parts : [];
  if (parts.length === 0) return null;
  const n = Number(String(playback?.version ?? "").trim());
  let sel: string[];
  if (Number.isInteger(n) && n >= 1 && n <= 20 && n <= parts.length && 31 - n >= 1 && 31 - n <= parts.length) {
    sel = [parts[n - 1], parts[31 - n - 1]];
  } else {
    return null;
  }
  const bufs = sel.filter((p) => typeof p === "string" && p.length > 0).map(b64uToBuf);
  if (bufs.length === 0) return null;
  return Buffer.concat(bufs);
}

function decryptBysePlayback(playback: any): any | null {
  try {
    const key = deriveByseKey(playback);
    const iv = b64uToBuf(String(playback.iv));
    const payload = b64uToBuf(String(playback.payload));
    if (!key || key.length !== 32 || iv.length !== 12 || payload.length <= 16) return null;
    const ct = payload.subarray(0, payload.length - 16);
    const tag = payload.subarray(payload.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(plain.toString("utf8"));
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVEDOR PRINCIPAL (com cache + dedup)
// ─────────────────────────────────────────────────────────────────────────────
export interface ByseResolved {
  fileId: string;
  m3u8: string;
  resolvedAt: number;
  expiresAt: number;
}

const byseResolveCache = new Map<string, ByseResolved>();
const byseResolveInflight = new Map<string, Promise<ByseResolved>>();
const BYSE_CACHE_TTL = 20 * 60 * 1000;

async function resolveByseStreamUncached(fileId: string): Promise<ByseResolved> {
  const det = await byseJsonFetch(
    `https://bysebuho.com/api/videos/${encodeURIComponent(fileId)}/embed/details`,
    { headers: { Referer: `https://bysebuho.com/e/${encodeURIComponent(fileId)}` } }
  );
  if (!det.json || typeof det.json !== "object" || !("embed_frame_url" in det.json)) {
    throw new Error(`embed/details falhou (${det.status}): [upstream]`);
  }
  const embedFrameUrl = String((det.json as any).embed_frame_url);
  if (!embedFrameUrl || !/^https:\/\//.test(embedFrameUrl)) {
    throw new Error("embed_frame_url inválido");
  }
  const embedUrl = new URL(embedFrameUrl);
  if (embedUrl.protocol !== 'https:' || embedUrl.username || embedUrl.password || embedUrl.hostname !== 'n1mwq.org' || embedUrl.port) throw new Error('Origem BYSE inválida');
  const N1 = embedUrl.origin;

  const { token, deviceId, confidence } = await getByseAttest(N1, embedUrl.href);
  const sess = getByseSession();
  const fingerprint = { token, viewer_id: sess.viewerId, device_id: deviceId, confidence };
  const cookie = `byse_viewer_id=${sess.viewerId}; byse_device_id=${deviceId}`;

  const cap = await byseJsonFetch(`${N1}/api/videos/${encodeURIComponent(fileId)}/embed/captcha`, {
    method: "POST",
    body: JSON.stringify({ fingerprint }),
    headers: { Origin: N1, Referer: embedUrl.href, Cookie: cookie },
  });
  if (!cap.json || typeof cap.json !== "object" || !("pow_nonce" in cap.json) || typeof (cap.json as any).pow_difficulty !== "number") {
    throw new Error(`captcha falhou (${cap.status}): [upstream]`);
  }
  const cj = cap.json as { pow_nonce: string; pow_difficulty: number; pow_token: string };
  const solution = await solveBysePowAsync(cj.pow_nonce, cj.pow_difficulty);
  if (solution === null) throw new Error("PoW não convergiu em 30s");

  const ver = await byseJsonFetch(`${N1}/api/videos/${encodeURIComponent(fileId)}/embed/captcha/verify`, {
    method: "POST",
    body: JSON.stringify({ pow_token: cj.pow_token, solution, fingerprint }),
    headers: { Origin: N1, Referer: embedUrl.href, Cookie: cookie },
  });
  if (!ver.json || typeof ver.json !== "object" || (ver.json as any).status !== "ok" || !(ver.json as any).token) {
    throw new Error(`captcha/verify falhou (${ver.status}): [upstream]`);
  }
  const vj = ver.json as { token: string };

  const pb = await byseJsonFetch(`${N1}/api/videos/${encodeURIComponent(fileId)}/embed/playback`, {
    method: "POST",
    body: JSON.stringify({ fingerprint }),
    headers: {
      Origin: N1,
      Referer: embedUrl.href,
      Cookie: cookie,
      "X-Captcha-Token": vj.token,
      "X-Embed-Parent": `https://bysebuho.com/e/${encodeURIComponent(fileId)}`,
    },
  });
  if (!pb.json || typeof pb.json !== "object" || !((pb.json as any).playback)) {
    throw new Error(`playback falhou (${pb.status}): [upstream]`);
  }
  const info = decryptBysePlayback((pb.json as any).playback);
  const m3u8 = info?.sources?.[0]?.url;
  if (!m3u8 || !allowedByseMediaUrl(String(m3u8))) {
    throw new Error("payload decriptografado sem fonte HLS válida");
  }
  return { fileId, m3u8: String(m3u8), resolvedAt: Date.now(), expiresAt: Date.now() + BYSE_CACHE_TTL };
}

export async function resolveByseStream(fileId: string, refresh = false): Promise<ByseResolved> {
  const cleanId = String(fileId || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(cleanId)) throw new Error("fileId inválido");
  if (refresh) byseResolveCache.delete(cleanId);
  const cached = byseResolveCache.get(cleanId);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const inflight = byseResolveInflight.get(cleanId);
  if (inflight) return inflight;
  if (byseResolveInflight.size >= 6) throw new Error('BYSE ocupado');
  const p = resolveByseStreamUncached(cleanId)
    .then((r) => { if (byseResolveCache.size >= 500) byseResolveCache.delete(byseResolveCache.keys().next().value!); byseResolveCache.set(cleanId, r); return r; })
    .finally(() => byseResolveInflight.delete(cleanId));
  byseResolveInflight.set(cleanId, p);
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROXY HLS — allowlist de hosts
// ─────────────────────────────────────────────────────────────────────────────
export function allowedByseMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
    const h = url.hostname.toLowerCase();
    return (
      /(^|\.)((r66nv9ed|owphbf24)\.com)$/.test(h) ||
      /(^|\.)sprintcdn\.[a-z0-9-]+$/.test(h) ||
      h === "n1mwq.org" || h.endsWith(".n1mwq.org") ||
      h === "bysebuho.com" || h.endsWith(".bysebuho.com") ||
      h === "img-place.com" || h.endsWith(".img-place.com")
    );
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// WRAPPER HTML — hls.js inline (CDN fallback) + protocolo WATCHPLAY
// ─────────────────────────────────────────────────────────────────────────────
export function buildByseWrapperHtml(streamUrl: string, fileId: string, initialTime: number): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Byse Player</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; overflow: hidden; width: 100%; height: 100%; }
  #container { width: 100%; height: 100%; position: relative; }
  video { width: 100%; height: 100%; object-fit: contain; }
</style>
</head>
<body>
  <div id="container">
    <video id="video" playsinline webkit-playsinline></video>
  </div>
  <script src="/api/byse-hls.js"><\/script>
  <script>
  (function() {
    var v = document.getElementById("video");
    var streamUrl = ${JSON.stringify(streamUrl)};
    var initialSeek = ${Number(initialTime) || 0};
    var fatalReported = false;
    var appliedInitial = false;

    function applySeek() {
      if (!appliedInitial && v && v.readyState >= 1 && initialSeek > 0) {
        appliedInitial = true;
        try { v.currentTime = initialSeek; } catch (e) {}
      }
    }

    function sendStatus() {
      if (!v) return;
      var dur = v.duration || 0;
      var cur = v.currentTime || 0;
      var bufferedEnd = 0;
      if (v.buffered && v.buffered.length > 0) {
        bufferedEnd = v.buffered.end(v.buffered.length - 1);
      }
      try {
        window.parent.postMessage({
          type: "WATCHPLAY_STATUS",
          currentTime: cur,
          duration: dur,
          paused: !!v.paused,
          muted: !!v.muted,
          volume: typeof v.volume === "number" ? v.volume : 1,
          buffered: bufferedEnd,
          playbackRate: v.playbackRate || 1,
          readyState: v.readyState || 0
        }, "*");
      } catch (e) {}
    }
    setInterval(sendStatus, 300);

    v.addEventListener("loadedmetadata", applySeek);
    v.addEventListener("canplay", applySeek);
    v.addEventListener("play", function() {
      applySeek();
      try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_PLAYING" }, "*"); } catch (e) {}
    });
    v.addEventListener("pause", function() {
      try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_PAUSED" }, "*"); } catch (e) {}
    });
    v.addEventListener("ended", function() {
      try { window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*"); } catch (e) {}
    });
    v.addEventListener("error", function() {
      reportFatal("Byse: erro de mídia no elemento de vídeo");
    });

    window.addEventListener("message", function(event) {
      if (event.source !== window.parent || !event.data) return;
      var d = event.data;
      if (d.type === "PAUSE" && v) v.pause();
      if (d.type === "PLAY" && v) v.play().catch(function() {});
      if (d.type === "SEEK" && v && typeof d.targetTime === "number") {
        if (v.readyState >= 1) v.currentTime = d.targetTime; else initialSeek = d.targetTime;
      }
      if (d.type === "SEEK_ABSOLUTE" && v && typeof d.time === "number") {
        if (v.readyState >= 1) v.currentTime = d.time; else initialSeek = d.time;
      }
      if (d.type === "SEEK_RELATIVE" && v && typeof d.seconds === "number") v.currentTime = Math.max(0, v.currentTime + d.seconds);
      if (d.type === "SKIP_INTRO" && v) {
        var secIntro = typeof d.seconds === "number" ? d.seconds : 75;
        v.currentTime = Math.max(0, Math.min(v.currentTime + secIntro, (v.duration || 99999) - 5));
      }
      if (d.type === "SET_MUTED") v.muted = !!d.muted;
      if (d.type === "TOGGLE_PLAY") { if (v.paused) v.play().catch(function(){}); else v.pause(); }
      if (d.type === "MUTE" && v) v.muted = true;
      if (d.type === "UNMUTE" && v) v.muted = false;
      if (d.type === "SET_VOLUME" && v && typeof d.volume === "number") v.volume = d.volume;
      if (d.type === "SET_PLAYBACK_RATE" && v && typeof d.rate === "number") v.playbackRate = d.rate;
    });

    function reportFatal(reason) {
      if (fatalReported) return;
      fatalReported = true;
      try { window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: reason }, "*"); } catch (e) {}
    }

    var activeHls;
    window.addEventListener("pagehide",function(){if(activeHls)activeHls.destroy()});
    function startHls() {
      if(activeHls){activeHls.destroy();activeHls=null;}
      if (window.Hls && window.Hls.isSupported()) {
        var hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          backBufferLength: 30,
          fragLoadingMaxRetry: 4,
          manifestLoadingMaxRetry: 2,
          levelLoadingMaxRetry: 2
        });
        activeHls=hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(v);
        hls.on(window.Hls.Events.ERROR, function(evt, data) {
          if (!data || !data.fatal) return;
          switch (data.type) {
            case window.Hls.ErrorTypes.NETWORK_ERROR:
              if (data.details === window.Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
                  data.details === window.Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT) {
                reportFatal("Byse: manifesto HLS indisponível (CDN offline ou link expirado)");
              } else {
                try { hls.startLoad(); } catch (e) {}
              }
              break;
            case window.Hls.ErrorTypes.MEDIA_ERROR:
              try { hls.recoverMediaError(); } catch (e) {}
              break;
            default:
              reportFatal("Byse: erro fatal no player HLS (" + (data.details || "?") + ")");
          }
        });
      } else if (v.canPlayType && v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = streamUrl;
      } else {
        reportFatal("Byse: navegador sem suporte a HLS");
      }
    }
    startHls();

    var playPromise = v.play();
    if (playPromise !== undefined) {
      playPromise.catch(function() {
        v.muted = true;
        v.play().catch(function() {});
      });
    }
  })();
  <\/script>
</body>
</html>`;
}

export function notFoundHtml(msg: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
  </style></head><body>
  <div><h2>Byse Indisponível</h2><p>${msg}</p></div>
  <script>
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "Byse: ${msg.replace(/"/g, "'")}" }, "*");
      }
    } catch(e) {}
  <\/script>
  </body></html>`;
}

/** Reescreve todas as URLs de um m3u8 para passar pelo nosso proxy. */
export function rewriteM3u8(body: string, playlistUrl: string, proxyPrefix: string | ((url: string) => string)): string {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  const proxied = (url: string) => typeof proxyPrefix === "function" ? proxyPrefix(url) : `${proxyPrefix}?url=${encodeURIComponent(url)}`;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") { out.push(raw); continue; }
    if (line.startsWith("#")) {
      if (/URI="/i.test(line)) {
        out.push(
          line.replace(/URI="([^"]+)"/gi, (m, uri: string) => {
            try {
              const abs = new URL(uri, playlistUrl).toString();
              if (allowedByseMediaUrl(abs)) return `URI="${proxied(abs)}"`;
            } catch { /* mantém original */ }
            throw new Error("Recurso HLS não autorizado");
          })
        );
      } else { out.push(raw); }
      continue;
    }
    try {
      const abs = new URL(line, playlistUrl).toString();
      if (!allowedByseMediaUrl(abs)) throw new Error("Recurso HLS não autorizado");
      out.push(proxied(abs));
    } catch { throw new Error("Recurso HLS não autorizado"); }
  }
  return out.join("\n");
}

export const BYSE_USER_AGENT = BYSE_UA;
