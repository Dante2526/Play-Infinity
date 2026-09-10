const TMDB_API_KEY = (import.meta as any).env?.VITE_TMDB_API_KEY || '';

if (!TMDB_API_KEY && typeof window !== "undefined") {
  console.warn("[TMDB Service] VITE_TMDB_API_KEY não configurada. Defina no arquivo .env.local para carregar dados do TMDB.");
}

const BASE_URL = 'https://api.themoviedb.org/3';

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
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      console.warn(`[TMDB Service] Requisição HTTP falhou: ${res.status} ${res.statusText} (${url})`);
      return fallback;
    }
    const data = await res.json();
    if (!data || typeof data !== "object") return fallback;
    if ("status_code" in data && typeof (data as any).status_code === "number" && (data as any).status_code !== 1) {
      console.warn(`[TMDB Service] Erro retornado pela API TMDB:`, (data as any).status_message || data);
      return fallback;
    }
    return data as T;
  } catch (err: any) {
    console.error(`[TMDB Service] Erro de rede ou parse ao acessar (${url}):`, err?.message || err);
    return fallback;
  }
}

// API Calls
export const getTrending = async (type: 'movie' | 'tv' | 'all' = 'all', timeWindow: 'day' | 'week' = 'week'): Promise<TMDBResponse> => {
  return fetchTmdbSafe<TMDBResponse>(`${BASE_URL}/trending/${type}/${timeWindow}?language=pt-BR&api_key=${TMDB_API_KEY}`, DEFAULT_EMPTY_RESPONSE);
};

export const getPopularMovies = async (): Promise<TMDBResponse> => {
  return fetchTmdbSafe<TMDBResponse>(`${BASE_URL}/movie/popular?language=pt-BR&page=1&api_key=${TMDB_API_KEY}`, DEFAULT_EMPTY_RESPONSE);
};

export const getPopularSeries = async (): Promise<TMDBResponse> => {
  return fetchTmdbSafe<TMDBResponse>(`${BASE_URL}/tv/popular?language=pt-BR&page=1&api_key=${TMDB_API_KEY}`, DEFAULT_EMPTY_RESPONSE);
};

export const getTopRated = async (type: 'movie' | 'tv'): Promise<TMDBResponse> => {
  return fetchTmdbSafe<TMDBResponse>(`${BASE_URL}/${type}/top_rated?language=pt-BR&page=1&api_key=${TMDB_API_KEY}`, DEFAULT_EMPTY_RESPONSE);
};

export const searchMulti = async (query: string): Promise<TMDBResponse> => {
  return fetchTmdbSafe<TMDBResponse>(`${BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=pt-BR&page=1&api_key=${TMDB_API_KEY}`, DEFAULT_EMPTY_RESPONSE);
};

export const getDetails = async (id: number, type: 'movie' | 'tv'): Promise<TMDBDetails> => {
  return fetchTmdbSafe<TMDBDetails>(`${BASE_URL}/${type}/${id}?language=pt-BR&api_key=${TMDB_API_KEY}`, DEFAULT_DETAILS);
};

export const getSeasonDetails = async (seriesId: number, seasonNumber: number): Promise<Season> => {
  return fetchTmdbSafe<Season>(`${BASE_URL}/tv/${seriesId}/season/${seasonNumber}?language=pt-BR&api_key=${TMDB_API_KEY}`, DEFAULT_SEASON);
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
  } else if (p.includes('globo')) {
    networkId = 3290;
  }

  const url = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=popularity.desc&page=${page}&with_networks=${networkId}&watch_region=BR`;
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
  else if (p.includes('globo')) providerId = 307;

  const url = `${BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=popularity.desc&page=${page}&with_watch_providers=${providerId}&watch_region=BR`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const discoverMovies = async (page: number = 1, genreId?: number, sortBy: string = 'popularity.desc', year?: number): Promise<TMDBResponse> => {
  let url = `${BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=${sortBy}&page=${page}&include_adult=false&vote_count.gte=10`;
  if (genreId) url += `&with_genres=${genreId}`;
  if (year) url += `&primary_release_year=${year}`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const discoverSeries = async (page: number = 1, genreId?: number, sortBy: string = 'popularity.desc', year?: number): Promise<TMDBResponse> => {
  let url = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=${sortBy}&page=${page}&include_adult=false&vote_count.gte=10`;
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
  const url = `${BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=primary_release_date.desc&primary_release_date.lte=${today}&vote_count.gte=3&include_adult=false&page=${page}`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const getSeriesReleases = async (page: number = 1): Promise<TMDBResponse> => {
  const today = new Date().toISOString().split('T')[0];
  const url = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=first_air_date.desc&first_air_date.lte=${today}&vote_count.gte=3&include_adult=false&page=${page}`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const getAnimes = async (page: number = 1): Promise<TMDBResponse> => {
  const url = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=popularity.desc&page=${page}&with_genres=16&with_original_language=ja&vote_count.gte=5&include_adult=false`;
  return fetchTmdbSafe<TMDBResponse>(url, DEFAULT_EMPTY_RESPONSE);
};

export const getDoramas = async (page: number = 1): Promise<TMDBResponse> => {
  const url = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=popularity.desc&page=${page}&with_origin_country=KR&vote_count.gte=5&include_adult=false`;
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
    const ptUrl = `${BASE_URL}/${type}/${id}/videos?api_key=${TMDB_API_KEY}&language=pt-BR`;
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
      const fallbackUrl = `${BASE_URL}/${type}/${id}/videos?api_key=${TMDB_API_KEY}&language=en-US`;
      const fallbackRes = await fetch(fallbackUrl, options);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        candidates = filterYouTube(fallbackData?.results || []);
      }
    }

    // 3. Fallback extra sem filtro de idioma se ainda vazio
    if (candidates.length === 0) {
      const allUrl = `${BASE_URL}/${type}/${id}/videos?api_key=${TMDB_API_KEY}`;
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



