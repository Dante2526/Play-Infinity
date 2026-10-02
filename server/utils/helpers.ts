
import crypto from "crypto";
import dns from "dns";
import net from "net";
import { isServerBlacklisted } from "../../src/data/serverBlacklist";

// Removed definitions from here, importing them properly if needed.
// Actually, let's just copy the block and export them.

function sanitizeString(val: any, maxLength = 100): string {
  if (typeof val !== "string") return "";
  return val
    .replace(/<[^>]*>?/gm, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .trim()
    .slice(0, maxLength);
}

// Rate-limit e proteção contra inflação de views no /api/track-play:
// IP -> { timestamps: number[], titleCooldown: Map<string, number> }
const trackPlayRateLimits = new Map<string, { timestamps: number[]; titleCooldown: Map<string, number> }>();

function checkTrackPlayRateLimit(ip: string, titleKey: string): { allowed: boolean; shouldIncrement: boolean; error?: string } {
  const now = Date.now();
  let record = trackPlayRateLimits.get(ip);
  if (!record) {
    record = { timestamps: [], titleCooldown: new Map() };
    trackPlayRateLimits.set(ip, record);
  }

  // 1. Limpa timestamps com mais de 60 segundos
  record.timestamps = record.timestamps.filter(ts => now - ts < 60000);

  // 2. Limite global por IP: máx 15 requisições por minuto
  if (record.timestamps.length >= 15) {
    return { allowed: false, shouldIncrement: false, error: "Muitas requisições de reprodução. Aguarde um momento." };
  }

  record.timestamps.push(now);

  // 3. Debounce por título: mesmo IP só incrementa views para o mesmo título a cada 45 segundos
  const lastPlayForTitle = record.titleCooldown.get(titleKey) || 0;
  if (now - lastPlayForTitle < 45000) {
    return { allowed: true, shouldIncrement: false }; // Aceita a request, mas não infla o contador de views
  }

  record.titleCooldown.set(titleKey, now);

  // Limpeza de cooldowns expirados se a lista crescer
  if (record.titleCooldown.size > 100) {
    for (const [key, ts] of record.titleCooldown.entries()) {
      if (now - ts > 120000) record.titleCooldown.delete(key);
    }
  }

  return { allowed: true, shouldIncrement: true };
}

/**
 * Heurística robusta anti-Superflix:
 * Detecta qualquer tentativa de redirecionamento para o ecossistema Superflix
 * através de regex multi-domínio, meta refreshes, scripts e URLs de iframe.
 */
function isSuperflixDetected(content: string, url: string = ""): boolean {
  if (!content && !url) return false;
  
  // 1. Regex de domínios conhecidos e variações TLD
  const superflixDomainRegex = /superflix[a-z0-9-]*\.(top|net|org|com|shop|site|app|api|online|link|xyz|cc|to|vip|pro)/i;
  
  if (url && superflixDomainRegex.test(url)) return true;
  if (superflixDomainRegex.test(content)) return true;

  // 2. Palavras-chave no HTML/JS excluindo o comentário do nosso próprio filtro
  const lower = content.toLowerCase();
  const keywords = ["superflixapi", "superflix", "sfapi", "super-flix", "superflix.player"];
  for (const kw of keywords) {
    if (lower.includes(kw) && !lower.includes("superflix-ad-filter")) {
      return true;
    }
  }

  // 3. Meta refreshes ou scripts de redirecionamento
  const metaRefresh = content.match(/<meta\s+http-equiv=["']refresh["']\s+content=["'][^"']*url=([^"']+)["']/i);
  if (metaRefresh && metaRefresh[1]) {
    const target = metaRefresh[1].toLowerCase();
    if (target.includes("superflix") || superflixDomainRegex.test(target)) {
      return true;
    }
  }

  return false;
}

/**
 * ========================================================
 * PROTEÇÃO ANTI-SSRF (SERVER-SIDE REQUEST FORGERY)
 * ========================================================
 * Bloqueia estritamente requisições a redes locais/privadas,
 * metadados de nuvem e domínios fora da allowlist autorizada.
 */
const ALLOWED_STREAMING_DOMAINS = [
  "watchplay.shop",
  "v1.watchplay.shop",
  "playerflix.ink",
  "playerflix.biz",
  "myembed.biz",
  "superflixapi.top",
  "embedder.net",
  "warezcdn.net",
  "warezcdn.com",
  "encontrei.info",
  "themoviedb.org",
  "tmdb.org",
  "youtube.com",
  "youtu.be",
  "unsplash.com",
  "image.tmdb.org",
  "vixsrc.to",
  "vix-content.net",
  "videasy.to",
  "videasy.net",
  "vidlink.pro",
  "2embed.cc",
  "autoembed.cc",
  "player.autoembed.cc",
  "speedracelight.com",
  "animesonlinecc.to",
  "blogger.com",
  "mixdrop.co",
  "mixdrop.to",
  "mixdrop.ch",
  "mixdrop.bz",
  "mixdrop.vc",
  "mixdrop.ag",
  "mxdrop.to",
  "mxdrop.top",
  "mxcontent.net"
];

const ALLOWED_LIVE_STREAMING_DOMAINS = [
  "up.kiwi",
  "wurl.com",
  "jmp2.uk",
  "amagi.tv",
  "otteravision.com",
  "jmvstream.com",
  "cdntvms.com.br",
  "pluto.tv",
  "bolodechocolate.fit",
  "akamaihd.net",
  "cloudfront.net",
  "fastly.net",
  "qzz.io",
  "watchplay.shop",
  "v1.watchplay.shop",
  "vixsrc.to",
  "vixsrc.net",
  "vix-content.net",
  "embedplayer2.xyz",
  "embedplayer.site",
  "playerflix.ink",
  "playerflix.biz",
  "myembed.biz",
  "embedder.net",
  "warezcdn.net",
  "warezcdn.com",
  "45.162.64.114",
  ...ALLOWED_STREAMING_DOMAINS
];

function isAllowedLiveStreamingDomain(hostname: string, referer?: string): boolean {
  if (!hostname || typeof hostname !== "string") return false;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").trim();

  // Bloqueio mandatória de qualquer servidor na blacklist (Superflix, BYSE, EmbedPlay, etc.)
  if (isSuperflixDetected(host)) return false;
  if (
    /superflix|sfapi|byse|streamberry|embedplay(?!er)|videasy|vidlink|autoembed|consumet|animefire|starflix|startflix|painel-aso/i.test(host)
  ) {
    return false;
  }

  // Se XTREAM_HOST estiver definido no ambiente, autoriza dinamicamente
  if (process.env.XTREAM_HOST) {
    try {
      const xtreamHost = new URL(process.env.XTREAM_HOST).hostname.toLowerCase();
      if (host === xtreamHost || host.endsWith("." + xtreamHost)) return true;
    } catch {}
  }

  // Verifica allowlist estrita
  const isAllowed = ALLOWED_LIVE_STREAMING_DOMAINS.some((domain) => {
    const d = domain.toLowerCase();
    return host === d || host.endsWith("." + d);
  });

  if (isAllowed) return true;

  // Servidores oficiais homologados de reprodução (VIP Player / MyEmbed / EmbedPlayer / Playerflix / Pomfy / Nixplay / Mixdrop)
  if (
    /embedplayer[a-z0-9-]*\.(xyz|site|top|biz|org|net|online|link|cc|to|me|com)$/i.test(host) ||
    /playerflix\.(ink|biz|to|net)$/i.test(host) ||
    /myembed\.(biz|me|to)$/i.test(host) ||
    /warezcdn\.(net|com)$/i.test(host) ||
    /embedder\.(net|com)$/i.test(host) ||
    /pomfy\.(stream|top|vip)$/i.test(host) ||
    /nixplay\.(lat|net|com)$/i.test(host) ||
    /eloialu[a-z0-9-]*\.(xyz|site|top|biz|online|net|com)$/i.test(host)
  ) {
    return true;
  }

  // CDNs conhecidas de distribuição HLS/DASH autorizadas
  if (/\.(qzz\.io|akamaihd\.net|cloudfront\.net|fastly\.net|amagi\.tv|wurl\.com|otteravision\.com|streamlock\.net)$/i.test(host)) {
    return true;
  }

  // Se a requisição vem de um referer de provedor homologado confiável
  if (referer) {
    try {
      const refHost = new URL(referer).hostname.toLowerCase();
      if (
        refHost.includes("embedplayer") ||
        refHost.includes("playerflix") ||
        refHost.includes("myembed") ||
        refHost.includes("watchplay") ||
        refHost.includes("warezcdn") ||
        refHost.includes("nixplay") ||
        refHost.includes("pomfy") ||
        refHost.includes("vixsrc") ||
        refHost.includes("play-infinity") ||
        refHost.includes("duckdns.org") ||
        refHost.includes("localhost") ||
        refHost.includes("127.0.0.1")
      ) {
        if (!/superflix|sfapi|byse|streamberry|embedplay(?!er)|videasy|vidlink|autoembed/i.test(host)) {
          return true;
        }
      }
    } catch {}
  }

  return false;
}

// Cache em memória de resolução DNS para evitar overhead de latência em requisições HLS sequenciais
const dnsResolutionCache = new Map<string, { isPrivate: boolean; expires: number }>();

/**
 * Valida se um endereço IP (IPv4 ou IPv6 em qualquer notação) pertence a faixas privadas,
 * locais, loopback, metadados de nuvem, CGNAT ou reservadas.
 */
function isPrivateOrLocalIpAddress(ip: string): boolean {
  if (!ip || typeof ip !== "string") return true;
  let cleanIp = ip.toLowerCase().replace(/^[\[\s]+|[\]\s]+$/g, "").trim();

  // Tratamento de IPv4-mapped IPv6 (ex: ::ffff:127.0.0.1 ou ::ffff:7f00:1)
  if (cleanIp.startsWith("::ffff:")) {
    const rest = cleanIp.slice(7);
    if (rest.includes(".")) {
      cleanIp = rest;
    } else if (rest.includes(":")) {
      const parts = rest.split(":");
      if (parts.length === 2) {
        const p1 = parseInt(parts[0], 16);
        const p2 = parseInt(parts[1], 16);
        cleanIp = `${(p1 >> 8) & 0xff}.${p1 & 0xff}.${(p2 >> 8) & 0xff}.${p2 & 0xff}`;
      }
    }
  }

  // Verificação estrita para IPv4
  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split(".").map(Number);
    if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b, c, d] = parts;
    if (a === 0) return true; // 0.0.0.0/8 (Broadcast/Atual rede)
    if (a === 10) return true; // 10.0.0.0/8 (RFC 1918 Privada)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a === 127) return true; // 127.0.0.0/8 (Loopback)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-local / Metadados AWS/GCP/Azure)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC 1918 Privada)
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 (6to4 relay anycast)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC 1918 Privada)
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (Benchmark)
    if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
    if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
    if (a >= 224) return true; // 224.0.0.0/4 Multicast & 240.0.0.0/4 Reservado/Broadcast
    return false;
  }

  // Verificação estrita para IPv6
  if (net.isIPv6(cleanIp)) {
    if (cleanIp === "::" || cleanIp === "::1") return true; // Inespecífico e Loopback
    if (/^fc[0-9a-f]{2}:|^fd[0-9a-f]{2}:/i.test(cleanIp) || cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true; // fc00::/7 ULA (Unique Local Address)
    if (/^fe[89ab][0-9a-f]:/i.test(cleanIp) || cleanIp.startsWith("fe80:")) return true; // fe80::/10 Link-local
    if (/^ff[0-9a-f]{2}:/i.test(cleanIp) || cleanIp.startsWith("ff")) return true; // ff00::/8 Multicast
    if (cleanIp.startsWith("64:ff9b::") || cleanIp.startsWith("100::") || cleanIp.startsWith("2001:db8:") || cleanIp.startsWith("2002:")) return true;
    return false;
  }

  return false; // Não é um endereço IP privado
}

/**
 * Validação Anti-SSRF completa com resolução DNS ativa:
 * Resolve o domínio e valida todos os IPs retornados (IPv4 e IPv6).
 * Mitiga DNS Rebinding, domínios que apontam para 127.0.0.1, IPv6 ULA (fd00::) e formatos hex/octal.
 */
async function isPrivateOrLocalHost(hostname: string): Promise<boolean> {
  if (!hostname || typeof hostname !== "string") return true;
  const host = hostname.toLowerCase().replace(/^[\[\s]+|[\]\s]+$/g, "").trim();

  // 1. Verificações rápidas textuais de loopback e intranet
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  if (!host.includes(".")) return true; // Nomes curtos de intranet sem TLD
  if (/\.(local|internal|lan|corp|home|onion|test|example|invalid)$/i.test(host)) return true;
  if (/^169\.254\./.test(host) || host.includes("metadata.google") || host.includes("metadata.aws") || host.includes("metadata.azure")) return true;

  // 2. Notações alternativas de IP (hexadecimal 0x7f.1, octal 0177.0.0.1, inteiro 2130706433)
  if (/^0x[0-9a-f]+(\.[0-9a-f]+)*$/i.test(host) || /^[0-9]+$/.test(host) || /^0[0-7]+(\.[0-7]+)*$/.test(host)) {
    return true;
  }

  // 3. Se for IP puro válido (IPv4 ou IPv6), valida sem precisar de DNS
  if (net.isIP(host)) {
    return isPrivateOrLocalIpAddress(host);
  }

  // 4. Cache em memória de resolução DNS
  const cached = dnsResolutionCache.get(host);
  if (cached && cached.expires > Date.now()) {
    return cached.isPrivate;
  }

  // 5. Resolução ativa de DNS (consulta tanto registros A quanto AAAA)
  try {
    const addresses = await dns.promises.lookup(host, { all: true, verbatim: true });
    if (!addresses || addresses.length === 0) {
      dnsResolutionCache.set(host, { isPrivate: true, expires: Date.now() + 60000 });
      return true;
    }

    for (const record of addresses) {
      if (isPrivateOrLocalIpAddress(record.address)) {
        dnsResolutionCache.set(host, { isPrivate: true, expires: Date.now() + 60000 });
        return true;
      }
    }

    // Todos os IPs resolvidos são públicos e válidos
    dnsResolutionCache.set(host, { isPrivate: false, expires: Date.now() + 60000 });
    return false;
  } catch (err) {
    // Domínio inexistente ou falha na resolução -> bloqueia
    dnsResolutionCache.set(host, { isPrivate: true, expires: Date.now() + 60000 });
    return true;
  }
}

/**
 * Versão síncrona para compatibilidade com helpers existentes
 */
function isPrivateOrLocalIp(hostname: string): boolean {
  if (!hostname || typeof hostname !== "string") return true;
  const host = hostname.toLowerCase().replace(/^[\[\s]+|[\]\s]+$/g, "").trim();

  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  if (!host.includes(".")) return true;
  if (/\.(local|internal|lan|corp|home|onion|test|example|invalid)$/i.test(host)) return true;
  if (/^169\.254\./.test(host) || host.includes("metadata.google") || host.includes("metadata.aws") || host.includes("metadata.azure")) return true;

  // Notações hex/octal/decimal
  if (/^0x[0-9a-f]+(\.[0-9a-f]+)*$/i.test(host) || /^[0-9]+$/.test(host) || /^0[0-7]+(\.[0-7]+)*$/.test(host)) {
    return true;
  }

  if (net.isIP(host)) {
    return isPrivateOrLocalIpAddress(host);
  }

  const cached = dnsResolutionCache.get(host);
  if (cached && cached.expires > Date.now()) {
    return cached.isPrivate;
  }

  return false;
}

function validateSafeUrl(rawUrl: string, customAllowed = ALLOWED_STREAMING_DOMAINS): { valid: boolean; error?: string; parsedUrl?: URL } {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "A URL é obrigatória e deve ser uma string." };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (e) {
    return { valid: false, error: "Formato de URL inválido." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Protocolo inválido. Apenas HTTP e HTTPS são permitidos." };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateOrLocalIp(hostname)) {
    return { valid: false, error: "Acesso a endereço IP privado ou interno bloqueado por segurança (Anti-SSRF)." };
  }

  if (customAllowed && customAllowed.length > 0) {
    const isDomainAllowed = customAllowed.some((domain) => {
      const d = domain.toLowerCase();
      return hostname === d || hostname.endsWith("." + d);
    });

    if (!isDomainAllowed) {
      const isKnownVideoCdn = /\.(qzz\.io|akamaihd\.net|cloudfront\.net|fastly\.net|m3u8)$/i.test(hostname);
      if (!isKnownVideoCdn) {
        return { valid: false, error: `Domínio '${hostname}' não autorizado na lista segura.` };
      }
    }
  }

  return { valid: true, parsedUrl: parsed };
}

/**
 * Validação assíncrona com resolução DNS ativa do hostname
 */
async function validateSafeUrlAsync(rawUrl: string, customAllowed = ALLOWED_STREAMING_DOMAINS): Promise<{ valid: boolean; error?: string; parsedUrl?: URL }> {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "A URL é obrigatória e deve ser uma string." };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (e) {
    return { valid: false, error: "Formato de URL inválido." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Protocolo inválido. Apenas HTTP e HTTPS são permitidos." };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (await isPrivateOrLocalHost(hostname)) {
    return { valid: false, error: "Acesso a endereço IP privado ou interno bloqueado por segurança (Anti-SSRF)." };
  }

  if (customAllowed && customAllowed.length > 0) {
    const isDomainAllowed = customAllowed.some((domain) => {
      const d = domain.toLowerCase();
      return hostname === d || hostname.endsWith("." + d);
    });

    if (!isDomainAllowed) {
      const isKnownVideoCdn = /\.(qzz\.io|akamaihd\.net|cloudfront\.net|fastly\.net|m3u8)$/i.test(hostname);
      if (!isKnownVideoCdn) {
        return { valid: false, error: `Domínio '${hostname}' não autorizado na lista segura.` };
      }
    }
  }

  return { valid: true, parsedUrl: parsed };
}

/**
 * Comparação em tempo constante para mitigar ataques de temporização (Timing Attacks)
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export {
  sanitizeString,
  checkTrackPlayRateLimit,
  isSuperflixDetected,
  isPrivateOrLocalIp,
  isPrivateOrLocalHost,
  isPrivateOrLocalIpAddress,
  validateSafeUrl,
  validateSafeUrlAsync,
  ALLOWED_STREAMING_DOMAINS,
  ALLOWED_LIVE_STREAMING_DOMAINS,
  isAllowedLiveStreamingDomain,
  timingSafeCompare
};
