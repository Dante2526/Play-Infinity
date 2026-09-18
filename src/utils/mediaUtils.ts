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
  return true;
};
