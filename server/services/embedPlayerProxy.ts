import type { Request, Response } from "express";
import { getMinhaTelaEmbedHosts } from "./minhatelaCatalog";

/**
 * Proxy sanitizador de páginas embed de TV ao vivo (fontes MinhaTela:
 * rdcanais, embedtv, meuplayeronlinehd, sporturbo, redecanaistv...).
 *
 * Problema: cada fonte é uma página de player DE TERCEIROS cheia de
 * publicidade hostil — popunder com camada transparente sobre o player
 * (window.open no primeiro clique), âncoras target=_blank, frame-busting
 * (top.location=...) e detectores de sandbox que bloqueiam o player quando
 * o iframe usa o atributo sandbox (ex.: rdcanais "sbChecker").
 *
 * Solução: o LivePlayerModal aponta o iframe para
 *   /api/embed-player?url=<embed original>
 * e este serviço:
 *   1. Busca o HTML no servidor (UA de browser, segue redirects HTTP e
 *      stubs meta-refresh/location.replace — cadeia do redecanaistv.pk).
 *   2. Remove os blocos <script> de detecção de sandbox e frame-busting.
 *   3. Injeta, ANTES de qualquer script deles, um sanitizador que:
 *        - trava window.open permanentemente (popunder morto);
 *        - shima localStorage/sessionStorage/document.cookie (a página roda
 *          com origem opaca por causa do sandbox do iframe);
 *        - neutraliza cliques em âncoras e submits de form;
 *        - TAKEOVER de layout: o container do player (ou o maior iframe)
 *          vira position:fixed fullscreen com object-fit:contain — a página
 *          deles "se adapta" ao nosso player sem mexer no player deles.
 *   4. Serve com <base href> do site original (recursos relativos seguem
 *      funcionando) e Referrer-Policy: no-referrer.
 *
 * Fallback: se o servidor não conseguir buscar a página (Cloudflare 403
 * para IP de datacenter, timeout etc.), devolve um stub que faz o próprio
 * iframe navegar (location.replace) para a URL original — o sandbox do
 * iframe continua ativo, então os pop-ups seguem bloqueados no navegador,
 * apenas sem a adaptação de layout.
 *
 * Segurança:
 *   - Entry URL precisa ser https pública com host no allowlist dinâmico
 *     (hosts das fontes do snapshot MinhaTela + EMBED_PLAYER_EXTRA_HOSTS).
 *   - Saltos de redirect aceitam qualquer https público (anti-SSRF).
 *   - A página é servida da NOSSA origem mas o iframe usa sandbox sem
 *     allow-same-origin → origem opaca → o script deles não acessa a app,
 *     cookies ou tokens do Play Infinity. sandbox sem allow-popups e sem
 *     allow-top-navigation → pop-ups e sequestro de aba bloqueados a nível
 *     de navegador.
 */

const FETCH_TIMEOUT_MS = 9000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const REDIRECT_HOPS = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 400;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Allowlist de hosts (entry URLs)
// ---------------------------------------------------------------------------

/** https público, sem hosts privados/loopback (defesa anti-SSRF). */
export function isSafePublicHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".invalid")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
    if (h === "::1" || h === "[::1]") return false;
    if (!h.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}

/** Hosts permitidos: fontes do snapshot MinhaTela + variável de ambiente. */
function extraHosts(): string[] {
  return (process.env.EMBED_PLAYER_EXTRA_HOSTS || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Entry URL válida? Precisa ser https pública E o host precisa estar no
 * allowlist (catálogo MinhaTela vivo). Impede o uso como proxy aberto de
 * HTML arbitrário (phishing etc.).
 */
export function isAllowedEmbedUrl(raw: string): boolean {
  if (!isSafePublicHttpsUrl(raw)) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (getMinhaTelaEmbedHosts().has(host)) return true;
    return extraHosts().includes(host);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sanitizador injetado (roda ANTES de qualquer script da página)
// ---------------------------------------------------------------------------

// Sem backticks/`${}` deliberadamente — é embutido numa template literal TS.
const SANITIZER_JS = [
"(function () {",
"  'use strict';",
"  var MAXZ = 2147483647;",
"",
"  /* 1) Popunder killer: window.open travado permanentemente */",
"  var fakeWin = null;",
"  function makeFakeWin() {",
"    if (fakeWin) return fakeWin;",
"    var doc = {",
"      write: function () {}, writeln: function () {},",
"      open: function () { return makeFakeWin().document; },",
"      close: function () {},",
"      createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {} }; },",
"      body: { appendChild: function () {} }",
"    };",
"    fakeWin = {",
"      closed: false, name: '', opener: null, document: doc,",
"      location: { href: 'about:blank', assign: function () {}, replace: function () {} },",
"      close: function () {}, focus: function () {}, blur: function () {},",
"      moveTo: function () {}, resizeTo: function () {}, postMessage: function () {},",
"      setTimeout: function () { return 0; }, setInterval: function () { return 0; },",
"      clearTimeout: function () {}, clearInterval: function () {}",
"    };",
"    return fakeWin;",
"  }",
"  try {",
"    Object.defineProperty(window, 'open', {",
"      writable: false, configurable: false,",
"      value: function () { return makeFakeWin(); }",
"    });",
"  } catch (e) { try { window.open = function () { return null; }; } catch (e2) {} }",
"",
"  /* 2) Shims de storage p/ origem opaca (sandbox sem allow-same-origin) */",
"  function shimStorage(name) {",
"    try { window[name].getItem(''); }",
"    catch (e) {",
"      var mem = {};",
"      try {",
"        Object.defineProperty(window, name, {",
"          configurable: true,",
"          get: function () {",
"            return {",
"              getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },",
"              setItem: function (k, v) { mem[k] = String(v); },",
"              removeItem: function (k) { delete mem[k]; },",
"              clear: function () { mem = {}; },",
"              key: function (i) { return Object.keys(mem)[i] || null; },",
"              get length() { return Object.keys(mem).length; }",
"            };",
"          }",
"        });",
"      } catch (e2) {}",
"    }",
"  }",
"  shimStorage('localStorage');",
"  shimStorage('sessionStorage');",
"  try { document.cookie; } catch (e) {",
"    try {",
"      Object.defineProperty(document, 'cookie', { configurable: true, get: function () { return ''; }, set: function () {} });",
"    } catch (e2) {}",
"  }",
"",
"  /* 3) Âncoras e forms não navegam (popunder de primeiro clique) */",
"  document.addEventListener('click', function (e) {",
"    try {",
"      var t = e.target;",
"      while (t && t !== document) {",
"        if (t.tagName === 'A') { e.preventDefault(); e.stopPropagation(); return; }",
"        t = t.parentNode;",
"      }",
"    } catch (_) {}",
"  }, true);",
"  document.addEventListener('submit', function (e) {",
"    try {",
"      var a = e.target && e.target.action;",
"      if (a && /^https?:/i.test(a)) { e.preventDefault(); e.stopPropagation(); }",
"    } catch (_) {}",
"  }, true);",
"",
"  /* 4) Takeover: adapta o layout deles ao nosso player */",
"  var took = false;",
"  function rectArea(r) { return Math.max(0, r.width) * Math.max(0, r.height); }",
"  function classId(el) {",
"    try {",
"      var c = el.className;",
"      if (c && c.baseVal !== undefined) c = c.baseVal;",
"      return ((c || '') + ' ' + (el.id || '')).toLowerCase();",
"    } catch (e) { return ''; }",
"  }",
"  var PLAYER_RE = /player|jw|vjs|video|bitmovin|shaka|plyr|dplayer|flowplayer|fluid|media|stage|container|holder|embed/;",
"  function playerRoot(el) {",
"    var cur = el, any = false;",
"    for (var i = 0; i < 6; i++) {",
"      var p = cur.parentElement;",
"      if (!p || p === document.documentElement || p === document.body) break;",
"      if (PLAYER_RE.test(classId(p))) { cur = p; any = true; }",
"      else if (!any && i === 0) { cur = p; } /* inclui wrapper de controles */",
"      else break;",
"    }",
"    return cur;",
"  }",
"  function takeover(root, media) {",
"    if (took) return;",
"    took = true;",
"    try {",
"      var st = document.createElement('style');",
"      st.textContent = 'html{overflow:hidden!important;background:#000!important}body{margin:0!important;padding:0!important;overflow:hidden!important;min-height:100vh!important;background:#000!important}';",
"      document.documentElement.appendChild(st);",
"    } catch (e) {}",
"    try {",
"      var r = (root === document.body || root === document.documentElement) ? media : root;",
"      r.setAttribute('style', (r.getAttribute('style') || '') + ';position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;max-width:100vw!important;max-height:100vh!important;margin:0!important;padding:0!important;border:0!important;z-index:' + MAXZ + '!important;background:#000!important;transform:none!important');",
"      if (media && media !== r) {",
"        media.setAttribute('style', (media.getAttribute('style') || '') + ';position:relative!important;display:block!important;width:100%!important;height:100%!important;margin:0!important;border:0!important' + (media.tagName === 'VIDEO' ? ';object-fit:contain!important' : ''));",
"      }",
"    } catch (e) {}",
"  }",
"  function scan() {",
"    if (took) return true;",
"    var vids = [];",
"    try { vids = Array.prototype.slice.call(document.querySelectorAll('video')); } catch (e) {}",
"    var best = null, bestA = 0;",
"    for (var i = 0; i < vids.length; i++) {",
"      var v = vids[i];",
"      var a = rectArea(v.getBoundingClientRect());",
"      if (a > bestA) { bestA = a; best = v; }",
"    }",
"    if (best && bestA >= 10000) { takeover(playerRoot(best), best); return true; }",
"    /* sem <video> ainda: wrapper de iframe (cadeia rdcanais) */",
"    var ifr = [];",
"    try { ifr = Array.prototype.slice.call(document.querySelectorAll('iframe')); } catch (e) {}",
"    var bestF = null, bestFA = 0;",
"    for (var j = 0; j < ifr.length; j++) {",
"      var f = ifr[j];",
"      var fa = rectArea(f.getBoundingClientRect());",
"      if (fa > bestFA) { bestFA = fa; bestF = f; }",
"    }",
"    if (bestF && bestFA >= 0.3 * window.innerWidth * window.innerHeight) { takeover(playerRoot(bestF), bestF); return true; }",
"    return false;",
"  }",
"  var tries = 0;",
"  function tick() {",
"    if (took) { if (timer) clearInterval(timer); return; }",
"    tries++;",
"    if (scan() || tries > 40) { if (timer) clearInterval(timer); }",
"  }",
"  var timer = setInterval(tick, 500);",
"  try {",
"    var mo = new MutationObserver(function () { if (!took) scan(); });",
"    mo.observe(document.documentElement, { childList: true, subtree: true });",
"    setTimeout(function () { try { mo.disconnect(); } catch (e) {} }, 30000);",
"  } catch (e) {}",
"  if (document.readyState === 'loading') {",
"    document.addEventListener('DOMContentLoaded', function () { scan(); });",
"  } else { scan(); }",
"})();",
].join("\n");

/**
 * Remove <script> inline que detectam sandbox (rdcanais sbChecker:
 * frameElement + document.domain + hasAttribute('sandbox')) ou fazem
 * frame-busting (top.location = / parent.location =).
 */
function stripAdversarialScripts(html: string): string {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole: string, _attrs: string, body: string) => {
    const sandboxDetect =
      /hasAttribute\s*\(\s*['"]sandbox/i.test(body) ||
      (/document\s*\.\s*domain/.test(body) && /frameElement/.test(body));
    const frameBust =
      /(top|parent)\s*\.\s*location\s*(=|\.href\s*=|\.replace\s*\(|\.assign\s*\()/.test(body);
    return sandboxDetect || frameBust ? "" : whole;
  });
}

/** Injeta <base> + sanitizador o mais cedo possível no <head>. */
export function sanitizeEmbedHtml(html: string, baseUrl: string): string {
  let out = stripAdversarialScripts(html);
  let baseTag = "";
  if (!/<base\s/i.test(out)) {
    try {
      const u = new URL(baseUrl);
      if (u.protocol === "https:") baseTag = `<base href="${u.origin}/">`;
    } catch {
      /* sem base — página com URLs absolutas */
    }
  }
  const inject = `${baseTag}<script>${SANITIZER_JS}</script>`;
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => m + inject);
  } else if (/<html[^>]*>/i.test(out)) {
    out = out.replace(/<html[^>]*>/i, (m) => m + inject);
  } else if (/<body[^>]*>/i.test(out)) {
    out = out.replace(/<body[^>]*>/i, (m) => m + inject);
  } else {
    out = inject + out;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Redirects tipo stub (redecanaistv.pk → .by, hex-encoded)
// ---------------------------------------------------------------------------

/**
 * Extrai a URL de stubs de redirect (meta refresh ou location.replace),
 * decodificando escapes hex (%72%65..., \\x3d). Só considera páginas
 * pequenas — página grande com meta refresh não é stub.
 */
export function extractRedirectUrl(html: string): string | null {
  if (!html || html.length > 4096) return null;
  let raw: string | undefined;
  const meta = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?[^"']*url=([^"'>\s]+)/i);
  if (meta) raw = meta[1];
  if (!raw) {
    const js = html.match(/location\s*\.\s*(?:replace|assign)\s*\(\s*['"]([^'"]+)['"]/i);
    if (js) raw = js[1];
  }
  if (!raw) return null;
  let u = raw.replace(/\\x([0-9a-fA-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
  u = u.replace(/&amp;/g, "&");
  try {
    u = decodeURIComponent(u);
  } catch {
    /* hex parcial — segue com o que decodificou */
  }
  if (!/^https?:\/\//i.test(u)) return null;
  return u;
}

// ---------------------------------------------------------------------------
// Fetch + ressanitização da cadeia
// ---------------------------------------------------------------------------

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": BROWSER_UA,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
        referer: url,
      },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct && !/text\/html|application\/xhtml/.test(ct)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_HTML_BYTES) return null;
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Stub de fallback: o iframe navega para a URL original (sandbox ativo). */
export function buildEmbedFallbackHtml(url: string): string {
  const safe = JSON.stringify(url);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style></head><body><script>location.replace(${safe});</script></body></html>`;
}

const htmlCache = new Map<string, { at: number; value: string }>();

function cacheGet(url: string): string | null {
  const hit = htmlCache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    htmlCache.delete(url);
    return null;
  }
  return hit.value;
}

function cacheSet(url: string, value: string): void {
  htmlCache.set(url, { at: Date.now(), value });
  if (htmlCache.size > CACHE_MAX_ENTRIES) {
    const oldest = htmlCache.keys().next().value;
    if (oldest !== undefined) htmlCache.delete(oldest);
  }
}

/**
 * Resolve a página embed: segue redirects HTTP + stubs meta-refresh (até
 * REDIRECT_HOPS saltos), sanitiza a página final e devolve o HTML pronto.
 * Em caso de falha devolve o stub de fallback (location.replace original).
 */
export async function resolveEmbedPlayerHtml(url: string): Promise<string> {
  const cached = cacheGet(url);
  if (cached) return cached;
  const { html, fellBack } = await resolveEmbedPlayerHtmlWithMeta(url);
  cacheSet(url, html);
  return html;
}

/**
 * Variante que devolve metadata sobre o resultado — usada pelo probe
 * /api/embed-probe para saber se o HTML veio do stub de fallback (fetch
 * falhou) ou de uma página real sanitizada.
 */
export async function resolveEmbedPlayerHtmlWithMeta(url: string): Promise<{ html: string; fellBack: boolean; rawHtml: string | null }> {
  const cached = cacheGet(url);
  if (cached) {
    // Não dá pra saber se o cache veio de fallback ou não sem guardar —
    //assume sanitized (o caller do probe só quer saber de vida, e o cache
    // só dura 5min, então se voltou no cache é porque alguem probeou antes).
    return { html: cached, fellBack: false, rawHtml: null };
  }

  let current = url;
  let html: string | null = null;
  for (let hop = 0; hop < REDIRECT_HOPS; hop++) {
    const page = await fetchHtml(current);
    if (page == null) {
      html = null;
      break;
    }
    html = page;
    const next = extractRedirectUrl(page);
    if (next && next !== current && isSafePublicHttpsUrl(next)) {
      current = next;
      continue;
    }
    break;
  }

  if (html != null) {
    return { html: sanitizeEmbedHtml(html, current), fellBack: false, rawHtml: html };
  }
  return { html: buildEmbedFallbackHtml(url), fellBack: true, rawHtml: null };
}

// ---------------------------------------------------------------------------
// Handler express
// ---------------------------------------------------------------------------

function buildDeniedHtml(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000;color:#555;display:flex;align-items:center;justify-content:center;font:13px system-ui,sans-serif}</style></head><body><div>Fonte não permitida.</div></body></html>`;
}

export async function handleEmbedPlayerRequest(req: Request, res: Response): Promise<void> {
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  if (!raw || !isAllowedEmbedUrl(raw)) {
    res.status(403)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .set("Referrer-Policy", "no-referrer")
      .set("X-Content-Type-Options", "nosniff")
      .send(buildDeniedHtml());
    return;
  }
  try {
    const html = await resolveEmbedPlayerHtml(raw);
    res.status(200)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "public, max-age=300")
      .set("Referrer-Policy", "no-referrer")
      .set("X-Content-Type-Options", "nosniff")
      .send(html);
  } catch {
    res.status(502)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .set("Referrer-Policy", "no-referrer")
      .set("X-Content-Type-Options", "nosniff")
      .send(buildEmbedFallbackHtml(raw));
  }
}

/** [TESTES] Limpa o cache em memória. */
export function __clearEmbedCacheForTests(): void {
  htmlCache.clear();
}

// ---------------------------------------------------------------------------
// Probe de vida (sem servir o HTML) — usado pelo LivePlayerModal para
// saber quais servidores embed estão realmente funcionando antes de
// setar o iframe src. Reaproveita o mesmo cache 5min/400 do proxy.
// ---------------------------------------------------------------------------

export interface EmbedProbeResult {
  /** URL original consultada. */
  url: string;
  /** Resposta HTTP geral (deny/fetch_failed/ok). */
  status: "ok" | "denied" | "fetch_failed";
  /** true quando o proxy caiu no stub de fallback (location.replace) — página original não foi buscada. */
  fallback: boolean;
  /** Tamanho do HTML sanitizado servido pelo proxy (bytes UTF-8). */
  sizeBytes: number;
  /** HTML tem indícios de player (video tag, iframe aninhado, libs como jwplayer/videojs/clappr/hls.js...). */
  hasPlayer: boolean;
  /** Veredito final: o iframe provavelmente vai renderizar um player. */
  alive: boolean;
  /** Timestamp do probe (ms). */
  probedAt: number;
}

const PLAYER_RE =
  /<(?:video|iframe)\b|jwplayer|videojs|video\.js|clappr|dplayer|plyr|bitmovin|shaka(?:-player)?|flowplayer|fluidplayer|hls\.js|\.m3u8|hlsjs/i;

/**
 * Probeia uma URL embed: resolve via o mesmo pipeline do proxy (cache +
 * redirects + sanitização) e devolve um veredito sem servir o HTML.
 *
 * - status "denied": host fora do allowlist (não é fonte MinhaTela).
 * - status "fetch_failed" + fallback true: o servidor não conseguiu buscar
 *   a página original (404, 403 Cloudflare, timeout) — caiu no stub.
 * - status "ok" + hasPlayer true: a página tem player real → alive.
 * - status "ok" + hasPlayer false + sizeBytes grande: página carregou mas
 *   não encontramos player → indeterminado (conservadoramente alive).
 * - status "ok" + sizeBytes pequeno: provável stub → !alive.
 */
export async function probeEmbedPlayer(url: string): Promise<EmbedProbeResult> {
  const probedAt = Date.now();
  if (!isAllowedEmbedUrl(url)) {
    return { url, status: "denied", fallback: false, sizeBytes: 0, hasPlayer: false, alive: false, probedAt };
  }
  let html: string;
  let rawHtml: string | null;
  let fellBack: boolean;
  try {
    const meta = await resolveEmbedPlayerHtmlWithMeta(url);
    html = meta.html;
    rawHtml = meta.rawHtml;
    fellBack = meta.fellBack;
    // Guarda no cache pra o próximo probe/iframe não refetch.
    cacheSet(url, html);
  } catch {
    return { url, status: "fetch_failed", fallback: true, sizeBytes: 0, hasPlayer: false, alive: false, probedAt };
  }
  // hasPlayer examina o HTML cru (não sanitizado) — o sanitizer injeta
  // ~5KB de JS que contém nomes de libs (bitmovin, shaka...) no próprio
  // regex dele, o que causaria falso positivo.
  const probeHtml = rawHtml ?? html;
  const hasPlayer = PLAYER_RE.test(probeHtml);
  const probeBytes = Buffer.byteLength(probeHtml, "utf-8");
  // vivo: NÃO caiu no stub de fallback E (tem player OU HTML cru grande
  // o suficiente pra ser uma página real).
  const alive = !fellBack && (hasPlayer || probeBytes >= 4000);
  const sizeBytes = Buffer.byteLength(html, "utf-8");
  return {
    url,
    status: fellBack ? "fetch_failed" : "ok",
    fallback: fellBack,
    sizeBytes,
    hasPlayer,
    alive,
    probedAt,
  };
}
