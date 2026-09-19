// A chave de API do TMDB foi movida para o servidor para segurança (evitar vazamento no DevTools).
// As requisições agora passam pelo proxy /api/tmdb definido em server.ts.

const BASE_URL = '/api/tmdb';

const options = {
  method: 'GET',
  headers: {
    accept: 'application/json'
  }
};

// Types
export interface TMDBItem {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: 'movie' | 'tv';
  genre_ids: number[];
  popularity?: number;
}

export interface TMDBResponse {
  page: number;
  results: TMDBItem[];
  total_pages: number;
  total_results: number;
}

export interface Episode {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  still_path: string;
  air_date: string;
}

export interface Season {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  poster_path: string;
  episodes?: Episode[];
}

export interface TMDBDetails {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  genres: { id: number; name: string }[];
  seasons?: Season[];
  number_of_seasons?: number;
  imdb_id?: string;
}

// Map Genres
const genreMap: Record<number, string> = {
  28: 'Ação', 12: 'Aventura', 16: 'Animação', 35: 'Comédia', 80: 'Crime',
  99: 'Documentário', 18: 'Drama', 10751: 'Família', 14: 'Fantasia',
  36: 'História', 27: 'Terror', 10402: 'Música', 9648: 'Mistério',
  10749: 'Romance', 878: 'Ficção científica', 10770: 'Cinema TV',
  53: 'Thriller', 10752: 'Guerra', 37: 'Faroeste', 10759: 'Action & Adventure',
  10762: 'Kids', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy',
  10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics'
};

export const getGenreNames = (genreIds: number[]) => {
  return genreIds.map(id => genreMap[id]).filter(Boolean);
};

// Format item
export const FALLBACK_POSTER_IMAGE = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=500&q=80';
export const FALLBACK_BACKDROP_IMAGE = 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80';

export const formatImageUrl = (path: string | null | undefined, size: string = 'w500') => {
  if (!path || typeof path !== 'string' || path.trim() === '' || path === 'null' || path === 'undefined') {
    return size === 'original' ? FALLBACK_BACKDROP_IMAGE : FALLBACK_POSTER_IMAGE;
  }
  if (path.startsWith('http')) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `https://image.tmdb.org/t/p/${size}${cleanPath}`;
};

// Fallbacks seguros para evitar crashes se a API falhar
const DEFAULT_EMPTY_RESPONSE: TMDBResponse = {
  page: 1,
  results: [],
  total_pages: 0,
  total_results: 0,
};

const DEFAULT_DETAILS: TMDBDetails = {
  id: 0,
  overview: "",
  poster_path: "",
  backdrop_path: "",
  vote_average: 0,
  genres: [],
};

const DEFAULT_SEASON: Season = {
  id: 0,
  name: "",
  season_number: 1,
  episode_count: 0,
  poster_path: "",
  episodes: [],
};

/**
 * Wrapper de requisição resiliente ao TMDB:
 * Valida res.ok, status HTTP (401/404/429) e JSON seguro com fallback.
 */
async function fetchTmdbSafe<T>(url: string, fallback: T): Promise<T> {
  // 1. Tenta a rota interna /api/tmdb (Express proxy seguro)
  try {
    const res = await fetch(url, options);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === "object") {
        if (!("status_code" in data) || (data as any).status_code === 1) {
          return data as T;
        }
      }
    } else {
      console.warn(`[TMDB Service] Proxy local retornou status ${res.status}. Ativando fallback de deploy...`);
    }
  } catch (err: any) {
    console.warn(`[TMDB Service] Proxy local inacessível (${err?.message || err}). Ativando fallback de deploy...`);
  }



  return fallback;
}

// API Calls
export const getTrending = async (type: 'movie' | 'tv' | 'all' = 'all', timeWindow: 'day' | 'week' = 'week'): Promise<TMDBResponse> => {
  return fetchTmdbSafe<TMDBResponse>(`${BASE_URL}/trending/${type}/${timeWindow}?language=pt-BR`, DEFAULT_EMPTY_RESPONSE);
};

export const getPopularMovies = async (): Promise<TMDBResponse> => {
  return fetchTmdbSafe<TMDBResponse>(`${BASE_URL}/movie/popular?language=pt-BR&page=1`, DEFAULT_EMPTY_RESPONSE);
};

export const getPopularSeries = async (): Promise<TMDBResponse> => {
  return fetchTmdbSafe<TMDBResponse>(`${BASE_URL}/tv/popular?language=pt-BR&page=1`, DEFAULT_EMPTY_RESPONSE);
};

export const getTopRated = async (type: 'movie' | 'tv'): Promise<TMDBResponse> => {
  return fetchTmdbSafe<TMDBResponse>(`${BASE_URL}/${type}/top_rated?language=pt-BR&page=1`, DEFAULT_EMPTY_RESPONSE);
};

export const searchMulti = async (query: string): Promise<TMDBResponse> => {
  if (!query || !query.trim()) return DEFAULT_EMPTY_RESPONSE;
  return fetchTmdbSafe<TMDBResponse>(`${BASE_URL}/search/multi?query=${encodeURIComponent(query.trim())}&language=pt-BR&page=1`, DEFAULT_EMPTY_RESPONSE);
};

import { UNAVAILABLE_SEASONS } from "../data";;;

export const getDetails = async (id: number, type: 'movie' | 'tv'): Promise<TMDBDetails> => {
  const details = await fetchTmdbSafe<TMDBDetails>(`${BASE_URL}/${type}/${id}?language=pt-BR`, DEFAULT_DETAILS);
  
  if (type === 'tv' && details && details.seasons && UNAVAILABLE_SEASONS[id]) {
    // Filtra as temporadas que estão marcadas como indisponíveis na configuração
    const unavailableList = UNAVAILABLE_SEASONS[id];
    details.seasons = details.seasons.filter(s => !unavailableList.includes(s.season_number));
    details.number_of_seasons = details.seasons.length;
  }
  
  return details;
};

export const getSeasonDetails = async (seriesId: number, seasonNumber: number): Promise<Season> => {
  return fetchTmdbSafe<Season>(`${BASE_URL}/tv/${seriesId}/season/${seasonNumber}?language=pt-BR`, DEFAULT_SEASON);
};

export const getSimilarRecommendations = async (id: number, type: 'movie' | 'tv'): Promise<TMDBResponse> => {
  return fetchTmdbSafe<TMDBResponse>(`${BASE_URL}/${type}/${id}/recommendations?language=pt-BR&page=1`, DEFAULT_EMPTY_RESPONSE);
};

// TMDB Network IDs & Watch Provider IDs for streaming brands:
// Netflix: network 213, provider 8
// Disney+: network 2739, provider 337
// HBO / Max: network 49 / 3186, provider 1899 / 384
// Amazon Prime: network 1024, provider 119
// Apple TV+: network 2552, provider 350
// Globoplay: network 3290, provider 307
export const getProviderSeries = async (provider: string, page: number = 1, sortBy: string = 'popularity.desc', releaseDateLte?: string): Promise<TMDBResponse> => {
  let networkId = 213; // default Netflix
  const p = provider.toLowerCase();

  if (p.includes('netflix')) {
    networkId = 213;
  } else if (p.includes('disney')) {
    networkId = 2739;
  } else if (p.includes('max') || p.includes('hbo')) {
    networkId = 49;
  } else if (p.includes('prime') || p.includes('amazon')) {
    networkId = 1024;
  } else if (p.includes('apple')) {
    networkId = 2552;
  } else if (p.includes('paramount')) {
    networkId = 4330;
  } else if (p.includes('globo')) {
    networkId = 3290;
  }

  let url = `${BASE_URL}/discover/tv?language=pt-BR&sort_by=${sortBy}&page=${page}&with_networks=${networkId}&watch_region=BR`;
  if (releaseDateLte) url += `&first_air_date.lte=${releaseDateLte}&vote_count.gte=0&include_adult=false`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const getProviderMovies = async (provider: string, page: number = 1, sortBy: string = 'popularity.desc', releaseDateLte?: string): Promise<TMDBResponse> => {
  let providerId = 8;
  const p = provider.toLowerCase();

  if (p.includes('netflix')) providerId = 8;
  else if (p.includes('disney')) providerId = 337;
  else if (p.includes('max') || p.includes('hbo')) providerId = 1899;
  else if (p.includes('prime') || p.includes('amazon')) providerId = 119;
  else if (p.includes('apple')) providerId = 350;
  else if (p.includes('paramount')) providerId = 531;
  else if (p.includes('globo')) providerId = 307;

  let url = `${BASE_URL}/discover/movie?language=pt-BR&sort_by=${sortBy}&page=${page}&with_watch_providers=${providerId}&watch_region=BR`;
  if (releaseDateLte) url += `&primary_release_date.lte=${releaseDateLte}&vote_count.gte=0&include_adult=false`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const discoverMovies = async (page: number = 1, genreId?: number, sortBy: string = 'popularity.desc', year?: number): Promise<TMDBResponse> => {
  let url = `${BASE_URL}/discover/movie?language=pt-BR&sort_by=${sortBy}&page=${page}&include_adult=false&vote_count.gte=10`;
  if (genreId) url += `&with_genres=${genreId}`;
  if (year) url += `&primary_release_year=${year}`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const discoverSeries = async (page: number = 1, genreId?: number, sortBy: string = 'popularity.desc', year?: number): Promise<TMDBResponse> => {
  let url = `${BASE_URL}/discover/tv?language=pt-BR&sort_by=${sortBy}&page=${page}&include_adult=false&vote_count.gte=10`;
  if (genreId) url += `&with_genres=${genreId}`;
  if (year) url += `&first_air_date_year=${year}`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const getGenreIdByName = (name: string): number | undefined => {
  const entry = Object.entries(genreMap).find(([_, val]) => val.toLowerCase() === name.toLowerCase());
  return entry ? parseInt(entry[0]) : undefined;
};

export const getMovieReleases = async (page: number = 1): Promise<TMDBResponse> => {
  const today = new Date().toISOString().split('T')[0];
  const providers = "8|119|337|1899|350|531|307";
  const url = `${BASE_URL}/discover/movie?language=pt-BR&sort_by=primary_release_date.desc&primary_release_date.lte=${today}&vote_count.gte=0&include_adult=false&with_watch_providers=${providers}&watch_region=BR&page=${page}`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const getSeriesReleases = async (page: number = 1): Promise<TMDBResponse> => {
  const today = new Date().toISOString().split('T')[0];
  const providers = "8|119|337|1899|350|531|307";
  const url = `${BASE_URL}/discover/tv?language=pt-BR&sort_by=first_air_date.desc&first_air_date.lte=${today}&vote_count.gte=0&include_adult=false&with_watch_providers=${providers}&watch_region=BR&page=${page}`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const getAnimes = async (page: number = 1): Promise<TMDBResponse> => {
  const url = `${BASE_URL}/discover/tv?language=pt-BR&sort_by=popularity.desc&page=${page}&with_genres=16&with_original_language=ja&vote_count.gte=20&include_adult=false`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const getDoramas = async (page: number = 1): Promise<TMDBResponse> => {
  // Streaming providers no Brasil: Netflix (8), Prime Video (119), Disney+ (337), Max (1899), Rakuten Viki (344), Apple TV+ (350), Globoplay (307), Paramount+ (531)
  const streamingProvidersBR = '8|119|337|1899|344|350|307|531|619';
  const url = `${BASE_URL}/discover/tv?language=pt-BR&sort_by=popularity.desc&page=${page}&with_origin_country=KR&with_watch_providers=${streamingProvidersBR}&watch_region=BR&with_watch_monetization_types=flatrate|free|ads&vote_count.gte=5&include_adult=false`;
  const res = await fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
  
  // Fallback se a consulta com watch_providers retornar poucos itens
  if (!res.results || res.results.length === 0) {
    const fallbackUrl = `${BASE_URL}/discover/tv?language=pt-BR&sort_by=popularity.desc&page=${page}&with_origin_country=KR&with_genres=18&vote_count.gte=20&include_adult=false`;
    return fetchTmdbSafe<TMDBResponse>(fallbackUrl, DEFAULT_EMPTY_RESPONSE);
  }
  return res;
};

/**
 * Busca conteúdos familiares e infantis (Animação + Família) para a Área Kids
 */
export const getKidsContent = async (page: number = 1): Promise<TMDBResponse> => {
  const url = `${BASE_URL}/discover/movie?language=pt-BR&sort_by=popularity.desc&page=${page}&with_genres=16,10751&include_adult=false&vote_count.gte=20`;
  const res = await fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
  if (!res.results || res.results.length === 0) {
    const fallbackUrl = `${BASE_URL}/discover/movie?language=pt-BR&sort_by=popularity.desc&page=${page}&with_genres=16&include_adult=false&vote_count.gte=10`;
    return fetchTmdbSafe<TMDBResponse>(fallbackUrl, DEFAULT_EMPTY_RESPONSE);
  }
  return res;
};

/**
 * Busca séries e desenhos animados infantis para a Área Kids
 */
export const getKidsSeries = async (page: number = 1): Promise<TMDBResponse> => {
  const url = `${BASE_URL}/discover/tv?language=pt-BR&sort_by=popularity.desc&page=${page}&with_genres=10762&include_adult=false&vote_count.gte=5`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};


export interface TrailerVideo {
  id: string;
  key: string; // ID do YouTube
  name: string;
  site: string;
  type: string;
  isDubbed: boolean;
  isSubtitled: boolean;
  language: string;
  official?: boolean;
}

/**
 * Busca todos os trailers e teasers oficiais disponíveis para um filme ou série no TMDB,
 * consultando simultaneamente as trilhas em Português (PT-BR) e Global,
 * priorizando versões dubladas em português (PT-BR) e legendadas.
 */
export const getTrailerList = async (id: number, type: 'movie' | 'tv'): Promise<TrailerVideo[]> => {
  if (!id || isNaN(Number(id))) return [];

  try {
    // 1. Busca em paralelo vídeos em Português do Brasil (pt-BR) e no catálogo global (en-US / all)
    const ptUrl = `${BASE_URL}/${type}/${id}/videos?language=pt-BR`;
    const allUrl = `${BASE_URL}/${type}/${id}/videos`;

    const [ptRes, allRes] = await Promise.all([
      fetch(ptUrl, options).catch(() => null),
      fetch(allUrl, options).catch(() => null)
    ]);

    let rawVideos: any[] = [];

    if (ptRes && ptRes.ok) {
      try {
        const ptData = await ptRes.json();
        if (Array.isArray(ptData?.results)) {
          rawVideos.push(...ptData.results);
        }
      } catch {}
    }

    if (allRes && allRes.ok) {
      try {
        const allData = await allRes.json();
        if (Array.isArray(allData?.results)) {
          rawVideos.push(...allData.results);
        }
      } catch {}
    }

    // 2. Filtra estritamente vídeos do YouTube com chave válida
    const youtubeVideos = rawVideos.filter(
      v => v && v.site === 'YouTube' && typeof v.key === 'string' && v.key.trim().length >= 5
    );

    if (youtubeVideos.length === 0) return [];

    // 3. Deduplica por chave do YouTube (key)
    const uniqueMap = new Map<string, any>();
    for (const v of youtubeVideos) {
      const existing = uniqueMap.get(v.key);
      if (!existing) {
        uniqueMap.set(v.key, v);
      } else {
        // Se já existe, prefere a entrada que tiver mais informações ou marcação pt
        if (v.iso_639_1 === 'pt' || v.iso_3166_1 === 'BR') {
          uniqueMap.set(v.key, v);
        }
      }
    }

    const candidates = Array.from(uniqueMap.values());

    // 4. Sistema de pontuação refinado
    const scoreVideo = (v: any) => {
      let score = 0;
      const lowerName = (v.name || '').toLowerCase();
      const isDub = lowerName.includes('dublado') || lowerName.includes('dub') || lowerName.includes('áudio br') || lowerName.includes('audio br');
      const isLeg = lowerName.includes('legendado') || lowerName.includes('leg') || lowerName.includes('sub');
      const isShort = lowerName.includes('#shorts') || lowerName.includes('shorts') || lowerName.includes('short');
      const isBts = lowerName.includes('behind the scenes') || lowerName.includes('bastidores') || lowerName.includes('making of');

      if (isDub) score += 3000;
      if (isLeg) score += 2000;
      if (v.iso_639_1 === 'pt' || v.iso_3166_1 === 'BR') score += 1200;

      if (v.type === 'Trailer') score += 800;
      else if (v.type === 'Teaser') score += 400;
      else if (v.type === 'Clip') score += 100;
      else score += 50;

      if (v.official) score += 300;

      if (isShort) score -= 1500;
      if (isBts) score -= 1000;

      return score;
    };

    candidates.sort((a, b) => scoreVideo(b) - scoreVideo(a));

    return candidates.map((v) => {
      const lowerName = (v.name || '').toLowerCase();
      const isDubbed = lowerName.includes('dublado') || lowerName.includes('dub') || lowerName.includes('áudio br');
      const isSubtitled = !isDubbed && (lowerName.includes('legendado') || lowerName.includes('leg') || v.iso_639_1 === 'pt');

      return {
        id: v.id,
        key: v.key.trim(),
        name: v.name || (v.type === 'Teaser' ? 'Teaser Oficial' : 'Trailer Oficial'),
        site: v.site,
        type: v.type || 'Trailer',
        isDubbed,
        isSubtitled,
        language: v.iso_639_1 || 'pt',
        official: Boolean(v.official)
      };
    });
  } catch (err) {
    console.warn(`[getTrailerList] Erro ao buscar trailers para ${type}/${id}:`, err);
    return [];
  }
};

/**
 * Retorna o melhor trailer oficial único para um filme ou série no TMDB
 */
export const getTrailer = async (id: number, type: 'movie' | 'tv'): Promise<TrailerVideo | null> => {
  const list = await getTrailerList(id, type);
  return list.length > 0 ? list[0] : null;
};



