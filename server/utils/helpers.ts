
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

function isPrivateOrLocalIp(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").trim();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0"
  ) {
    return true;
  }
  // RFC 1918 Private IPv4 Ranges & Cloud Metadata
  if (/^10\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true; // AWS/GCP/Azure link-local metadata (169.254.169.254)
  if (!host.includes(".")) return true; // Hosts locais sem domínio público
  if (/\.(local|internal|lan|corp|home)$/i.test(host)) return true;
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

export { sanitizeString, checkTrackPlayRateLimit, isSuperflixDetected, isPrivateOrLocalIp, validateSafeUrl, ALLOWED_STREAMING_DOMAINS };
