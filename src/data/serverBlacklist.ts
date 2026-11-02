/**
 * ============================================================================
 * PLAY INFINITY - LISTA NEGRA PERMANENTE DE SERVIDORES DE VÍDEO (BLACKLIST)
 * ============================================================================
 * 
 * ATENÇÃO A TODOS OS AGENTES DE IA E DESENVOLVEDORES:
 * ESTE ARQUIVO É UMA RESTRIÇÃO PERMANENTE DO PROJETO.
 * 
 * MOTIVO:
 * Todos os provedores listados abaixo foram removidos por instabilidade,
 * redirecionamentos maliciosos (popups/popunders), quebra de iframe,
 * frame-busting que recarregava a página do usuário ou falta de suporte
 * ao player nativo PT-BR.
 * 
 * REGRA MANDATÓRIA:
 * 1. Consulte AGENTS.md e os seletores para os reprodutores homologados.
 *    BYSE próprio same-origin foi autorizado pelo dono em 23/10/2026.
 *    - WATCHPLAYER (Oficial Principal)
 *    - VIP PLAYER (Secundário / Sanitizado via /api/myembed-stream)
 * 2. NUNCA reintroduza, desfaça o bloqueio ou adicione fallbacks para qualquer
 *    dos domínios, chaves ou serviços listados nesta blacklist.
 * 3. PRIORIZAR SEMPRE fontes e fluxos com áudio em Português do Brasil (Dublado PT-BR / Nacional).
 * 
 * HIERARQUIA DE DECISÃO (ADR-0002 — docs/adr/0002-allowlist-vs-blacklist.md):
 *   1. Host EXATAMENTE na allowlist compartilhada (src/data/streamingAllowlist.ts)
 *      vence as KEYS desta blacklist — protege domínios homologados de
 *      colisões acidentais de substring (caso histórico: a chave curta
 *      "embedplay" bloqueava embedplayer2.xyz, o CDN FirePlayer do Saimo,
 *      matando 95% do HLS do catálogo em 02/11/2026).
 *   2. REGEX/patterns deliberados desta lista vencem a allowlist — banimento
 *      explícito do dono nunca é sobrescrito (ex.: superflixapi.top segue
 *      bloqueado pelo regex de família /superflix[a-z0-9-]*\.(top|...)/i
 *      embora conste na allowlist VOD por legado).
 *   Para banir um domínio que está na allowlist: adicione um REGEX de
 *   família à entrada correspondente E remova o domínio da allowlist.
 * 
 * SEMÂNTICA DE CASAMENTO DE KEYS E PATTERNS STRING (fix 02/11/2026):
 *   Casamento por FRONTEIRA DE PALAVRA, não por substring crua. A chave
 *   "vidlink" casa "vidlink.pro" (fronteira no ".") mas NÃO casa
 *   "vidlinker.com"; a chave "embedplay" nunca mais casará
 *   "embedplayer2.xyz". Underscore É fronteira: composições de ID como
 *   "srv_embedplay_hd" continuam casando "srv_embedplay". Strings com rota
 *   ("/api/embedplay-direct") continuam casando com querystring anexada
 *   ("?x=1" é fronteira).
 * ============================================================================
 */

import { isExactAllowedStreamingDomain } from "./streamingAllowlist";

export interface BlacklistedServerEntry {
  id: string;
  name: string;
  keys: string[];
  patterns: (string | RegExp)[];
  reason: string;
  blockedAt: string;
}

export const SERVER_BLACKLIST: BlacklistedServerEntry[] = [
  {
    id: "superflix",
    name: "Superflix / SFAPI",
    keys: ["srv_superflix", "superflix", "sfapi"],
    patterns: [
      /superflix[a-z0-9-]*\.(top|net|org|com|shop|site|app|api|online|link|xyz|cc|to|vip|pro)/i,
      /sfapi/i,
      "superflix"
    ],
    reason: "Redirecionamentos forçados, popups invasivos e instabilidade de streaming",
    blockedAt: "2026-09"
  },
  {
    id: "embedplay",
    name: "EmbedPlay",
    // NOTA (fix 02/11/2026): a chave curta "embedplay" foi REMOVIDA das keys.
    // O casamento por substring (target.includes(k)) pegava "embedplay"
    // embutido em "embedplayer2.xyz" — o CDN FirePlayer do catálogo HLS do
    // Saimo TV (2.611 fontes HLS), que é servidor HOMOLOGADO em três outros
    // lugares do código: allowlist ALLOWED_LIVE_STREAMING_DOMAINS e o regex
    // /embedplayer[a-z0-9-]*\.(xyz|...)/i de isAllowedLiveStreamingDomain
    // (server/utils/helpers.ts), e o tratamento de Referer/Origin dedicado
    // em server/routes/saimoRoutes.ts. O bloqueio do provedor EmbedPlay
    // permanece ÍNTEGRO pelo padrão /embedplay(?!er)/i — que casa
    // "embedplay" NÃO seguido de "er" (embedplay.cc, embedplay.xyz...) —
    // e pela chave exata srv_embedplay + /api/embedplay-direct.
    keys: ["srv_embedplay"],
    patterns: [
      /embedplay(?!er)/i,
      "/api/embedplay-direct"
    ],
    reason: "Instabilidade e servidores frequentemente fora do ar",
    blockedAt: "2026-09"
  },
  {
    id: "videasy",
    name: "Videasy",
    keys: ["srv_videasy", "videasy"],
    patterns: [
      /videasy\.(net|to|org|cc)/i,
      "player.videasy.net",
      "player.videasy.to"
    ],
    reason: "Bloqueio de CORS, instabilidade de carregamento e áudio não correspondente",
    blockedAt: "2026-09"
  },
  {
    id: "vidlink",
    name: "VidLink HD",
    keys: ["srv_vidlink", "vidlink"],
    patterns: [
      /vidlink\.pro/i,
      "vidlink"
    ],
    reason: "Lentidão excessiva e falha na sincronização de legendas/áudio em português",
    blockedAt: "2026-09"
  },
  {
    id: "autoembed",
    name: "AutoEmbed",
    keys: ["srv_autoembed", "autoembed"],
    patterns: [
      /autoembed\.cc/i,
      "autoembed"
    ],
    reason: "Anúncios intrusivos e quebra de sandbox",
    blockedAt: "2026-09"
  },
  {
    id: "consumet",
    name: "Consumet / AnimeFire Iframe",
    keys: ["srv_consumet", "consumet"],
    patterns: [
      /anime-stream\?provider=consumet/i,
      "consumet"
    ],
    reason: "Servidores externos de animes instáveis e bloqueios de cloudflare",
    blockedAt: "2026-09"
  },
  {
    id: "embedmovies",
    name: "EmbedMovies / Fake Embeds",
    keys: ["embedmovies", "srv_embedmovies"],
    patterns: [
      /embedmovies\.(org|net|com|top|cc)/i,
      "embedmovies.org",
      "embedmovies"
    ],
    reason: "Player fantasma sem stream de vídeo real, exibindo apenas imagem estática e marca d'água",
    blockedAt: "2026-09"
  },
  {
    id: "generic_scrapers",
    name: "Scrapers / Iframe Hubs Genéricos",
    keys: ["multiembed", "embed.su"],
    patterns: [
      /multiembed/i,
      /embed\.su/i
    ],
    reason: "Invasão de popups, rastreadores terceiros e quebra de política de privacidade",
    blockedAt: "2026-09"
  },
  {
    id: "starflix",
    name: "Starflix / Startflix",
    keys: ["srv_starflix", "starflix", "srv_startflix", "startflix"],
    patterns: [
      /starflix/i,
      /startflix/i,
      /painel-aso\.sbs/i,
      "starflix",
      "startflix"
    ],
    reason: "Removido por solicitação do usuário e incompatibilidade com os reprodutores homologados",
    blockedAt: "2026-09"
  },
  {
    id: "seriesflix_vidsrc",
    name: "Seriesflix HD (Vidsrc)",
    keys: ["srv_vidsrc", "vidsrc"],
    patterns: [
      /vidsrc/i,
      /opalescentoblivion/i
    ],
    reason: "A infraestrutura original ativou proteção Cloudflare severa (Turnstile) bloqueando nosso proxy (403), e também está retornando 522 Connection Timed Out. O player está morto no momento.",
    blockedAt: "2026-09"
  },
  {
    id: "pomfy",
    name: "Pomfy Stream",
    keys: ["srv_pomfy", "pomfy"],
    patterns: [
      /pomfy\.(stream|top|vip)/i,
      "/api/pomfy-stream",
      "pomfy"
    ],
    reason: "Removido por solicitação do usuário. Instável.",
    blockedAt: "2026-10"
  }
];

/**
 * Escapa caracteres especiais de regex em uma string literal.
 */
function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Casamento por FRONTEIRA DE PALAVRA (ADR-0002): a agulha precisa aparecer
 * delimitada por caracteres que não sejam letra/dígito/underscore.
 *
 * Por que não substring crua (comportamento anterior, bug 02/11/2026):
 *   includes("embedplay") casava "embedplayer2.xyz" (CDN homologado do
 *   Saimo — 95% do HLS do catálogo morto); includes("vidlink") casaria
 *   "vidlinker.com"; includes("superflix") casa "superflixapi.top".
 *
 * O que continua casando (intenção original preservada):
 *   - igualdade exata: "srv_embedplay" === "srv_embedplay"
 *   - fronteira em pontuação de URL: "vidlink" casa "vidlink.pro",
 *     "autoembed" casa "player.autoembed.cc" e "autoembed.cc"
 *   - fronteira em separadores: "consumet" casa "provider=consumet",
 *     "pomfy" casa "/api/pomfy-stream"
 */
function matchesOnWordBoundary(target: string, needle: string): boolean {
  const n = String(needle || "").toLowerCase().trim();
  if (!n) return false;
  if (target === n) return true;
  // Fronteira = qualquer caractere NÃO alfanumérico. Underscore É fronteira
  // (IDs de servidor são vocabulário controlado do app: "srv_embedplay_hd"
  // continua casando a key "srv_embedplay", como na semântica antiga). O que
  // a fronteira mata é a continuação alfanumérica — a classe exata do bug
  // histórico: "embedplay" dentro de "embedplayer2.xyz".
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExpLiteral(n)}([^a-z0-9]|$)`);
  return re.test(target);
}

/**
 * Extrai o hostname de um alvo com forma de URL absoluta (scheme://...).
 * Devolve null para chaves de servidor, rotas relativas e nomes — nesses
 * casos o override da allowlist não se aplica (não são domínios).
 */
function extractHostnameFromTarget(target: string): string | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(target) && !target.startsWith("//")) return null;
  try {
    return new URL(target).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Verifica de forma exaustiva se uma URL, chave ou nome de servidor está na lista negra.
 *
 * Hierarquia (ADR-0002):
 *   - hostname EXATAMENTE na allowlist compartilhada → KEYS não bloqueiam
 *     (colisões acidentais); REGEX/patterns deliberados continuam valendo.
 */
export function isServerBlacklisted(urlOrKey: string): boolean {
  if (!urlOrKey) return false;
  const target = String(urlOrKey).trim().toLowerCase();

  const hostname = extractHostnameFromTarget(target);
  const exactlyAllowedHost = hostname !== null && isExactAllowedStreamingDomain(hostname);

  for (const entry of SERVER_BLACKLIST) {
    // 1. Checa correspondência por chaves registradas (fronteira de palavra).
    //    Host homologado exatamente na allowlist é imune a keys — a chave é
    //    um atalho grosseiro demais para derrubar uma homologação deliberada.
    if (!exactlyAllowedHost && entry.keys.some(k => matchesOnWordBoundary(target, k))) {
      return true;
    }

    // 2. Checa correspondência por padrões de string (fronteira de palavra)
    //    ou expressões regulares (deliberadas — vencem a allowlist).
    for (const pattern of entry.patterns) {
      if (typeof pattern === "string") {
        if (matchesOnWordBoundary(target, pattern)) {
          return true;
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(target)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Dispara uma exceção se a URL ou chave fornecida estiver na lista negra.
 */
export function assertServerAllowed(urlOrKey: string): void {
  if (isServerBlacklisted(urlOrKey)) {
    throw new Error(`[Play Infinity Security] O servidor '${urlOrKey}' está PERMANENTEMENTE bloqueado na blacklist.`);
  }
}

/**
 * Filtra qualquer servidor da lista negra de um array de servidores.
 */
export function filterAllowedServers<T extends { key?: string; url?: string; name?: string }>(servers: T[]): T[] {
  if (!Array.isArray(servers)) return [];
  return servers.filter(srv => {
    if (srv.key && isServerBlacklisted(srv.key)) return false;
    if (srv.url && isServerBlacklisted(srv.url)) return false;
    if (srv.name && isServerBlacklisted(srv.name)) return false;
    return true;
  });
}
