import availableTmdbIdsData from "../../data/available-tmdb-ids.json";

export type CatalogItem = {
  id: number;
  tmdbId?: number;
  imdbId?: string;
  title: string;
  imageUrl: string;
  posterUrl?: string;
  backdropUrl?: string;
  type: 'movie' | 'series';
  genres: string[];
  synopsis?: string;
  year?: number;
  rating?: string;
  duration?: string;
  match?: number;
  playerUrl?: string;
  quality?: 'CAM' | 'TS' | 'HD' | '4K' | 'FULL HD';
  provider?: string;
  isAnime?: boolean;
  isDorama?: boolean;
};

// Set O(1) de todos os tmdb_ids disponíveis no catálogo encontrei (movies + episodes).
// Carregado uma única vez no module load a partir de data/available-tmdb-ids.json (61KB).
// Gerado por scripts/extract-available-tmdb-ids.cjs (roda antes do vite build).
// Se o arquivo estiver vazio/ausente, availableTmdbIds.size === 0 e o filtro
// deixa tudo passar (comportamento antigo, degradação graciosa).
const availableTmdbIds: Set<number> = new Set(
  Array.isArray((availableTmdbIdsData as any)?.ids)
    ? (availableTmdbIdsData as any).ids
    : []
);

/** Verifica se um item possui qualidade CAM (gravação de cinema) */
export function checkIsCam(title?: string, quality?: string): boolean {
  if (quality === 'CAM' || quality === 'TS') return true;
  if (!title) return false;
  const upper = title.toUpperCase();
  if (upper.includes('CAM') || upper.includes('CINEMA') || upper.includes('TS')) return true;
  if (upper.includes('HOMEM-ARANHA: UM NOVO DIA') || upper.includes('HOMEM-ARANHA 4')) return true;
  return false;
}

export const WATCHPLAY_ANIME_IDS = [
  31911, 37216, 21262, 100583, 114410, 46260, 42381, 108399, 129656, 126938,
  114472, 237149, 196860, 115036, 122176, 121023, 203901, 195726, 252994,
  87108, 94605, 129215, 122557, 121406, 127532, 121545, 137435, 128913, 118465,
  138018, 125139, 218706, 211021, 236054, 250162, 134149, 137256, 129654,
  216315, 211025, 239086, 222037, 218001, 213340, 204550, 195937, 135760, 
  128268, 127918, 124376, 236248, 239077, 238386, 236261, 233145, 222129,
  221941, 122241, 119859, 118742, 116278, 114881, 114532, 100913, 91599, 90848,
  88034, 85937, 83121, 80004, 73750, 45857, 133276, 61550, 60625, 30983,
  46006, 60841, 129856, 132646, 255280, 252271
];

export const WATCHPLAY_DORAMA_IDS = [
  93405,  // Round 6
  127529, // Cães de Caça (Bloodhounds)
  122530, // Nosso Destino
  218055, // A Criatura de Gyeongseong
  210963, // Zumbiverso
  200547, // A Esposa do Meu Marido
  114408, // Desgraça ao Seu Dispor
  115201, // Pousando no Amor
  118182, // Vincenzo
  203499, // Sorriso Real
  112888, // Tudo Bem Não Ser Normal
  238865, // O Jogo da Morte
  99966,  // All of Us Are Dead
  96462,  // Sweet Home
  117376, // Alice in Borderland
  218320, // Rainha das Lágrimas
  154825, // Alquimia das Almas
  223326, // My Demon
  212879, // Celebridade
  114461, // Beleza Verdadeira (True Beauty)
  157143, // Uma Advogada Extraordinária
  138120, // Pretendente Surpresa
  138501, // Vinte e Cinco, Vinte e Um
  155254, // Money Heist: Korea
  128330, // Profecia do Inferno
  106651  // Pousando no Amor (alternativo)
];

export const UNAVAILABLE_TITLES_OR_IDS = [
  939243,  // A Ilha Esquecida
  1059955, // The Last Photograph
  65733,   // Doraemon: O Gato do Futuro
  57911,   // Doraemon (1979)
  299627,  // Doraemon Specials
  45857,   // REBORN!
  30983,   // Detetive Conan
  241002,  // Modaete yo, Adam-kun
  233643,  // Secret Mission
  70998,   // Uma Noite Pecaminosa
  232938,  // Futaribeya
  154829,  // O Mito de Sísifo
  68369,   // One Piece (Seasons com problemas de metadados em alguns providers)
];

export const UNAVAILABLE_SEASONS: Record<number, number[]> = {
  // map de ids para seasons indisponíveis ou banidas
};

export const isMediaAvailable = (item: { id?: number; tmdbId?: number; title?: string; name?: string }): boolean => {
  const id = Number(item.tmdbId || item.id || 0);
  if (id && UNAVAILABLE_TITLES_OR_IDS.includes(id)) return false;
  const name = (item.title || item.name || "").toLowerCase();
  if (name.includes("doraemon")) return false;
  // Filtro real por catálogo: se temos a lista de tmdb_ids disponíveis carregada
  // (snapshot do encontrei-catalog.json), só deixa passar items que tenham
  // servidor de vídeo pronto (mixdrop/streamtape/doodstream).
  // Se a lista estiver vazia (arquivo não gerado / primeiro load), deixa tudo
  // passar pra não quebrar o app (degradação graciosa).
  if (availableTmdbIds.size > 0 && id && !availableTmdbIds.has(id)) {
    return false;
  }
  return true;
};

// ============================================================================
// CHECK LIVE AVAILABILITY (Hybrid Mode)
// ============================================================================
// Para items do trending/carrossel que NÃO estão no snapshot (9.107 IDs),
// permite verificar disponibilidade em tempo real via /api/encontrei-lookup.
// Ex: Carrie a Estranha (TMDB 288673) estreou 07/10/2026, snapshot é de 22/09.
// Sem este check, ela sumiria do carrossel mesmo tendo mixdrop disponível.
//
// Cache em memória (1h) pra não re-bater API em cada render da home.
// Máx 8 checks paralelos por carregamento da home pra não estressar o encontrei.
// ============================================================================

// Itens confirmados disponíveis via check live (TTL 1h)
const liveCheckedAvailable = new Set<number>();
// Itens confirmados indisponíveis via check live (TTL 1h)
const liveCheckedUnavailable = new Set<number>();
// Promise por tmdb_id (evita 2 checks simultâneos do mesmo item)
const pendingLiveChecks = new Map<number, Promise<boolean>>();
// Timestamp de cada check (pra expirar após 1h)
const checkTimestamps = new Map<number, number>();
const LIVE_CHECK_TTL = 60 * 60 * 1000; // 1 hora

function cleanupExpiredLiveChecks() {
  const now = Date.now();
  for (const [id, ts] of checkTimestamps) {
    if (now - ts > LIVE_CHECK_TTL) {
      liveCheckedAvailable.delete(id);
      liveCheckedUnavailable.delete(id);
      checkTimestamps.delete(id);
    }
  }
}

/**
 * Faz check live no encontrei.me pra ver se um tmdb_id tem mixdrop disponível.
 * Usa cache em memória (1h) pra evitar re-bater a API em cada render.
 * Retorna true se confirmado disponível, false caso contrário.
 *
 * Não faz check se o item tá no snapshot (rápido, sem rede).
 * Não faz check se o item tá na blacklist UNAVAILABLE_TITLES_OR_IDS.
 *
 * @param tmdbId TMDB ID do item
 * @param type 'tv' | 'movie' (default 'tv')
 * @param season só pra 'tv' (default 1)
 * @param episode só pra 'tv' (default 1)
 */
export async function checkLiveAvailability(
  tmdbId: number,
  type: 'tv' | 'movie' = 'tv',
  season: number = 1,
  episode: number = 1
): Promise<boolean> {
  if (!tmdbId) return false;
  
  // Blacklist: não perde tempo fazendo check
  if (UNAVAILABLE_TITLES_OR_IDS.includes(tmdbId)) return false;
  
  // Snapshot: se tá no catálogo estático, retorna true sem rede
  if (availableTmdbIds.has(tmdbId)) return true;
  
  // Limpeza periódica de checks expirados
  if (checkTimestamps.size > 100) {
    cleanupExpiredLiveChecks();
  }
  
  // Cache hit?
  if (liveCheckedAvailable.has(tmdbId)) return true;
  if (liveCheckedUnavailable.has(tmdbId)) return false;
  
  // Tem check em andamento? Aguarda
  const pending = pendingLiveChecks.get(tmdbId);
  if (pending) return pending;
  
  // Dispara check novo
  const promise = (async () => {
    try {
      const params = new URLSearchParams({
        tmdb_id: String(tmdbId),
        type,
      });
      if (type === 'tv') {
        params.set('season', String(season || 1));
        params.set('episode', String(episode || 1));
      }
      const url = `/api/encontrei-lookup?${params.toString()}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return false;
      const data = await res.json();
      const hasMixdrop = !!data.mixdrop || !!data.mixdrop_encontrei || !!data.mixdrop_vizer;
      
      // Atualiza cache
      checkTimestamps.set(tmdbId, Date.now());
      if (hasMixdrop) {
        liveCheckedAvailable.add(tmdbId);
      } else {
        liveCheckedUnavailable.add(tmdbId);
      }
      return hasMixdrop;
    } catch {
      // Erro (timeout, rede, etc): não marca como indisponível (pode ser temporário)
      // deixa pra próxima render tentar de novo
      return false;
    } finally {
      pendingLiveChecks.delete(tmdbId);
    }
  })();
  
  pendingLiveChecks.set(tmdbId, promise);
  return promise;
}

/**
 * Versão síncrona do check (não faz live lookup).
 * Retorna:
 *   - 'available': tá no snapshot, definitivamente tem
 *   - 'unavailable': tá na blacklist ou é doraemon, definitivamente NÃO tem
 *   - 'unknown': não tá no snapshot, precisa de check live
 */
export function quickAvailabilityCheck(item: { id?: number; tmdbId?: number; title?: string; name?: string }): 'available' | 'unavailable' | 'unknown' {
  const id = Number(item.tmdbId || item.id || 0);
  if (id && UNAVAILABLE_TITLES_OR_IDS.includes(id)) return 'unavailable';
  const name = (item.title || item.name || "").toLowerCase();
  if (name.includes("doraemon")) return 'unavailable';
  if (availableTmdbIds.size === 0) return 'available'; // degradação graciosa
  if (availableTmdbIds.has(id)) return 'available';
  // Se já checou live antes, usa resultado cacheado
  if (liveCheckedAvailable.has(id)) return 'available';
  if (liveCheckedUnavailable.has(id)) return 'unavailable';
  return 'unknown';
}

// Compara títulos ignorando acentos, pontuação e caixa. Retorna a fração dos
// tokens relevantes do título procurado presentes no candidato (0..1).
export const titleSimilarity = (wanted: string, candidate: string): number => {
  const norm = (s: string) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const a = norm(wanted);
  const b = norm(candidate);
  if (!a || !b) return 0;
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  const tokens = a.split(" ").filter((t) => t.length > 3);
  if (!tokens.length) return 0;
  return tokens.filter((t) => b.includes(t)).length / tokens.length;
};

// Usado para confirmar que um item realmente corresponde ao id consultado antes
// de adotar metadados (evita casar obras diferentes que compartilham o mesmo id).
export const titlesLookLikeSame = (a: string, b: string, threshold = 0.5): boolean =>
  titleSimilarity(a, b) >= threshold;

// Palavras-chave estritamente proibidas na Área Kids (Animações adultas, sátiras e animes japoneses)
const ADULT_ANIMATION_BLOCKLIST = [
  'simpson', 'family guy', 'família da pesada', 'familia da pesada', 
  'american dad', 'south park', 'rick and morty', 'rick & morty', 
  'big mouth', 'bojack', 'invincible', 'invencivel', 'hazbin', 'helluva', 
  'arcane', 'futurama', 'sausage party', 'festa da salsicha', 'f is for family', 
  'paradise pd', 'desencanto', 'disenchantment', 'robot chicken', 'frango robo', 
  'archer', 'solar opposites', 'castlevania', 'spawn', 'berserk', 'jujutsu', 
  'attack on titan', 'shingeki', 'naruto', 'dragon ball', 'bleach', 'death note', 
  'tokyo ghoul', 'demon slayer', 'kimetsu', 'hunter x hunter', 'evangelion', 
  'hellsing', 'chainsaw man', 'deadpool', 'glitch', 'glit', 'velma', 'sausage', 
  'clone high', 'harley quinn', 'arlequina', 'pantheon', 'the boys', 'smiling friends', 
  'drawn together', 'mr. pickles', 'primal', 'vox machina', 'cyberpunk', 'chainsaw',
  'terminator zero', 'blue eye samurai', 'samurai de olhos azuis', 'scavengers reign',
  'blood of zeus', 'sangue de zeus', 'hit-monkey', 'supersex', 'hentai', 'ecchi', 
  'seinen', 'yaoi', 'yuri', 'dota', 'diablo', 'castlevania', 'tomb raider',
  'resident evil', 'devil may cry', 'love, death & robots', 'love death & robots',
  'love death and robots', 'bad travelling', 'trese', 'godzilla', 'ultraman', 'baki',
  'kengan', 'record of ragnarok', 'shuumatsu', 'gantz', 'hell’s paradise', 'hells paradise',
  'dandadan', 'solo leveling', 'kaiju', 'frieren', 'mushoku', 'rezero', 'overlord',
  'tuca & bertie', 'tuca e bertie', 'captain fall', 'human resources', 'recursos humanos',
  'hoops', 'king of the hill', 'o rei do pedaço', 'beavis and butt-head', 'beavis e butt-head',
  'daria', 'brickleberry', 'inside job', 'midnight gospel', 'undone'
];

/**
 * Validação rigorosa para a Área Kids:
 * Bloqueia qualquer animação voltada para público adulto, terror, violência explícita ou anime japonês.
 */
export function isKidsSafe(item: { 
  id?: number; 
  tmdbId?: number;
  title?: string; 
  name?: string; 
  genres?: string[] | number[]; 
  genre_ids?: number[]; 
  original_language?: string;
  isAnime?: boolean;
  isDorama?: boolean;
}): boolean {
  if (item.isAnime || item.isDorama) return false;
  
  // Bloqueia idiomas asiáticos originais de animes
  const origLang = (item.original_language || '').toLowerCase();
  if (origLang === 'ja' || origLang === 'ko' || origLang === 'zh') return false;
  
  const title = (item.title || item.name || '').toLowerCase();
  
  // Verifica termos bloqueados no título
  for (const term of ADULT_ANIMATION_BLOCKLIST) {
    if (title.includes(term)) return false;
  }

  // Bloqueia IDs de animes da lista
  const id = Number(item.tmdbId || item.id || 0);
  if (id && WATCHPLAY_ANIME_IDS.includes(id)) return false;

  return true;
}
