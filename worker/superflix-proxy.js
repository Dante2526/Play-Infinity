/**
 * Cloudflare Worker — Proxy Universal para sites Cloudflare-protected
 *
 * POR QUE ESTE WORKER EXISTE:
 * - bolodechocolate.fit, superflix48.lol, vizer.autos, encontrei.me, redecanais.*
 *   todos usam Cloudflare anti-bot (403 pra servidores, IP-based blocking)
 * - Render, Vercel, Oracle VPS, qualquer datacenter → 403
 * - Cloudflare Worker faz fetch DE DENTRO da rede Cloudflare → passa direto
 *   (IP reputation é da própria Cloudflare, anti-bot permite)
 *
 * COMO USAR:
 *   GET https://<seu-worker>.workers.dev/api/proxy?url=<encoded-url>
 *   Retorna: HTML/JSON do site alvo, com CORS headers
 *
 * SEGURANÇA:
 * - Whitelist de hostnames permitidos (não é open proxy)
 * - Cache em memória (5min) pra reduzir load
 *
 * Deploy (5 min):
 *   npm install -g wrangler
 *   wrangler login
 *   cd worker/
 *   wrangler deploy
 *   → Copia URL do Worker
 *   → Setar WORKER_PROXY_URL no Render
 */

const ALLOWED_HOSTNAMES = [
  'superflix48.lol',
  'bolodechocolate.fit',
  'www.painel-aso.sbs',  // não precisa mas fica de fallback
  'painel-aso.sbs',
  'vizer.autos',
  'www17.vizer.autos',
  'www.vizer.autos',
  'encontrei.me',
  'www.encontrei.me',
  'www17.redecanais.in',
  'redecanais.in',
  'www17.redecanais.to',
  'redecanais.to',
];

// Cache em memória (5min TTL, 50 entries max LRU)
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 50;

function isAllowed(hostname) {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  return ALLOWED_HOSTNAMES.some(allowed => {
    const a = allowed.toLowerCase().replace(/^www\./, '');
    return h === a || h.endsWith('.' + a);
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    };

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/' || url.pathname === '/api/health') {
      return new Response(JSON.stringify({
        ok: true,
        service: 'cloudflare-proxy',
        allowed_hosts: ALLOWED_HOSTNAMES.length,
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Rota principal: /api/proxy?url=<encoded>
    if (url.pathname !== '/api/proxy') {
      return new Response(JSON.stringify({
        error: 'Not found',
        usage: 'GET /api/proxy?url=<encoded-target-url>',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      return new Response(JSON.stringify({
        error: 'Parâmetro "url" é obrigatório',
        usage: 'GET /api/proxy?url=<encoded-target-url>',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    let parsedTarget;
    try {
      parsedTarget = new URL(targetUrl);
    } catch {
      return new Response(JSON.stringify({ error: 'URL inválida' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!isAllowed(parsedTarget.hostname)) {
      return new Response(JSON.stringify({
        error: 'Hostname não permitido pelo whitelist',
        hostname: parsedTarget.hostname,
        allowed: ALLOWED_HOSTNAMES,
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Cache check
    const cacheKey = targetUrl;
    const cached = _cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return new Response(cached.body, {
        headers: {
          'Content-Type': cached.contentType,
          'X-Cache': 'HIT',
          ...corsHeaders,
        },
      });
    }

    try {
      const upstream = await fetch(targetUrl, {
        method: request.method === 'OPTIONS' ? 'GET' : request.method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Referer': parsedTarget.origin + '/',
        },
        // Cloudflare Workers fetch não tem redirect: 'follow' default, deixa assim
      });

      // Clone headers e remove alguns problemáticos
      const responseHeaders = new Headers();
      const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
      responseHeaders.set('Content-Type', contentType);
      responseHeaders.set('X-Original-Status', String(upstream.status));
      responseHeaders.set('X-Original-URL', targetUrl);
      responseHeaders.set('X-Cache', 'MISS');
      // CORS
      for (const [k, v] of Object.entries(corsHeaders)) {
        responseHeaders.set(k, v);
      }

      const body = await upstream.text();

      // Cache hit (5min, LRU 50)
      if (_cache.size >= CACHE_MAX) {
        const oldest = _cache.keys().next().value;
        if (oldest) _cache.delete(oldest);
      }
      _cache.set(cacheKey, {
        body,
        contentType,
        expires: Date.now() + CACHE_TTL,
      });

      // Detecta Cloudflare challenge
      const isCFBlocked = body.includes('Attention Required') || body.includes('Just a moment');

      return new Response(body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: 'Erro ao fetchar URL',
        detail: err.message,
        url: targetUrl,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};
