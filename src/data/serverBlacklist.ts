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
 * 1. Os DOIS ÚNICOS reprodutores homologados para Filmes e Séries são:
 *    - WATCHPLAYER (Oficial Principal)
 *    - VIP PLAYER (Secundário / Sanitizado via /api/myembed-stream)
 * 2. NUNCA reintroduza, desfaça o bloqueio ou adicione fallbacks para qualquer
 *    dos domínios, chaves ou serviços listados nesta blacklist.
 * ============================================================================
 */

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
    id: "byse",
    name: "BYSE / Streamberry",
    keys: ["srv_byse", "byse", "streamberry"],
    patterns: [
      /streamberry\.com\.br/i,
      /byse/i,
      "/api/byse-stream"
    ],
    reason: "Tentativas de redirecionamento do parent window (top.location) e falhas frequentes",
    blockedAt: "2026-09"
  },
  {
    id: "embedplay",
    name: "EmbedPlay",
    keys: ["srv_embedplay", "embedplay"],
    patterns: [
      /embedplay/i,
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
    id: "generic_scrapers",
    name: "Scrapers / Iframe Hubs Genéricos",
    keys: ["vidsrc", "multiembed", "embed.su"],
    patterns: [
      /vidsrc/i,
      /multiembed/i,
      /embed\.su/i
    ],
    reason: "Invasão de popups, rastreadores terceiros e quebra de política de privacidade",
    blockedAt: "2026-09"
  }
];

/**
 * Verifica de forma exaustiva se uma URL, chave ou nome de servidor está na lista negra.
 */
export function isServerBlacklisted(urlOrKey: string): boolean {
  if (!urlOrKey) return false;
  const target = String(urlOrKey).trim().toLowerCase();

  for (const entry of SERVER_BLACKLIST) {
    // 1. Checa correspondência por chaves registradas
    if (entry.keys.some(k => target === k.toLowerCase() || target.includes(k.toLowerCase()))) {
      return true;
    }

    // 2. Checa correspondência por padrões de string ou expressões regulares
    for (const pattern of entry.patterns) {
      if (typeof pattern === "string") {
        if (target.includes(pattern.toLowerCase())) {
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
