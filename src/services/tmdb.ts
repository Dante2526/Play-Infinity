// A chave de API do TMDB foi movida para o servidor para segurança (evitar vazamento no DevTools).
// As requisições agora passam pelo proxy /api/tmdb definido em server.ts.

const BASE_URL = '/api/tmdb';
const TMDB_DIRECT_BASE = 'https://api.themoviedb.org/3';
const getTmdbApiKey = (): string => {
  try {
    return ((import.meta as any)?.env?.VITE_TMDB_API_KEY as string) || '';
  } catch {
    return '';
  }
};

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

  // 2. Fallback de Deploy / Resiliência:
  // Se o aplicativo estiver rodando em ambiente de deploy (Vercel, Netlify, Cloud Run SPA, etc.)
  // onde o proxy Express não responde ou retorna 404, consulta diretamente o endpoint oficial da API do TMDB.
  if (url.startsWith(BASE_URL)) {
    try {
      const endpoint = url.replace(BASE_URL, "");
      const key = getTmdbApiKey();
      const sep = endpoint.includes("?") ? "&" : "?";
      const directUrl = `${TMDB_DIRECT_BASE}${endpoint}${sep}api_key=${key}`;

      const directRes = await fetch(directUrl, options);
      if (directRes.ok) {
        const directData = await directRes.json();
        if (directData && typeof directData === "object") {
          if (!("status_code" in directData) || (directData as any).status_code === 1) {
            return directData as T;
          }
        }
      } else {
        console.warn(`[TMDB Service] Fallback direto retornou status ${directRes.status}`);
      }
    } catch (directErr: any) {
      console.error(`[TMDB Service] Erro no fallback direto TMDB:`, directErr?.message || directErr);
    }
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

import { UNAVAILABLE_SEASONS } from '../data';

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

// TMDB Network IDs & Watch Provider IDs for streaming brands:
// Netflix: network 213, provider 8
// Disney+: network 2739, provider 337
// HBO / Max: network 49 / 3186, provider 1899 / 384
// Amazon Prime: network 1024, provider 119
// Apple TV+: network 2552, provider 350
// Globoplay: network 3290, provider 307
export const getProviderSeries = async (provider: string, page: number = 1): Promise<TMDBResponse> => {
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

  const url = `${BASE_URL}/discover/tv?language=pt-BR&sort_by=popularity.desc&page=${page}&with_networks=${networkId}&watch_region=BR`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const getProviderMovies = async (provider: string, page: number = 1): Promise<TMDBResponse> => {
  let providerId = 8;
  const p = provider.toLowerCase();

  if (p.includes('netflix')) providerId = 8;
  else if (p.includes('disney')) providerId = 337;
  else if (p.includes('max') || p.includes('hbo')) providerId = 1899;
  else if (p.includes('prime') || p.includes('amazon')) providerId = 119;
  else if (p.includes('apple')) providerId = 350;
  else if (p.includes('paramount')) providerId = 531;
  else if (p.includes('globo')) providerId = 307;

  const url = `${BASE_URL}/discover/movie?language=pt-BR&sort_by=popularity.desc&page=${page}&with_watch_providers=${providerId}&watch_region=BR`;
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
  const url = `${BASE_URL}/discover/movie?language=pt-BR&sort_by=primary_release_date.desc&primary_release_date.lte=${today}&vote_count.gte=3&include_adult=false&page=${page}`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const getSeriesReleases = async (page: number = 1): Promise<TMDBResponse> => {
  const today = new Date().toISOString().split('T')[0];
  const url = `${BASE_URL}/discover/tv?language=pt-BR&sort_by=first_air_date.desc&first_air_date.lte=${today}&vote_count.gte=3&include_adult=false&page=${page}`;
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
}

/**
 * Busca o melhor trailer oficial para um filme ou série no TMDB,
 * priorizando versões dubladas em português (PT-BR) e legendadas.
 */
export const getTrailer = async (id: number, type: 'movie' | 'tv'): Promise<TrailerVideo | null> => {
  if (!id || isNaN(Number(id))) return null;

  try {
    // 1. Busca vídeos em Português do Brasil (pt-BR)
    const ptUrl = `${BASE_URL}/${type}/${id}/videos?language=pt-BR`;
    const ptRes = await fetch(ptUrl, options);
    let ptVideos: any[] = [];
    if (ptRes.ok) {
      const ptData = await ptRes.json();
      ptVideos = ptData?.results || [];
    }

    const filterYouTube = (list: any[]) => list.filter(v => v.site === 'YouTube' && v.key);

    let candidates = filterYouTube(ptVideos);

    // 2. Se não houver nenhum em pt-BR, busca no catálogo geral com fallback en-US
    if (candidates.length === 0) {
      const fallbackUrl = `${BASE_URL}/${type}/${id}/videos?language=en-US`;
      const fallbackRes = await fetch(fallbackUrl, options);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        candidates = filterYouTube(fallbackData?.results || []);
      }
    }

    // 3. Fallback extra sem filtro de idioma se ainda vazio
    if (candidates.length === 0) {
      const allUrl = `${BASE_URL}/${type}/${id}/videos`;
      const allRes = await fetch(allUrl, options);
      if (allRes.ok) {
        const allData = await allRes.json();
        candidates = filterYouTube(allData?.results || []);
      }
    }

    if (candidates.length === 0) return null;

    // 4. Sistema de pontuação: Dublado > Legendado > Trailer Oficial > Outros
    const scoreVideo = (v: any) => {
      let score = 0;
      const lowerName = (v.name || '').toLowerCase();
      const isDub = lowerName.includes('dublado') || lowerName.includes('dub');
      const isLeg = lowerName.includes('legendado') || lowerName.includes('leg');

      if (isDub) score += 1000;
      if (isLeg) score += 500;
      if (v.type === 'Trailer') score += 100;
      if (v.type === 'Teaser') score += 30;
      if (v.official) score += 50;
      if (v.iso_639_1 === 'pt') score += 200;

      return score;
    };

    candidates.sort((a, b) => scoreVideo(b) - scoreVideo(a));
    const best = candidates[0];

    const lowerBestName = (best.name || '').toLowerCase();
    const isDubbed = lowerBestName.includes('dublado') || lowerBestName.includes('dub');
    const isSubtitled = lowerBestName.includes('legendado') || lowerBestName.includes('leg');

    return {
      id: best.id,
      key: best.key,
      name: best.name || 'Trailer Oficial',
      site: best.site,
      type: best.type || 'Trailer',
      isDubbed,
      isSubtitled: !isDubbed && (isSubtitled || best.iso_639_1 === 'pt'),
      language: best.iso_639_1 || 'pt'
    };
  } catch (err) {
    console.warn(`[getTrailer] Erro ao buscar trailer para ${type}/${id}:`, err);
    return null;
  }
};



