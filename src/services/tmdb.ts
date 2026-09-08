const TMDB_API_KEY = (import.meta as any).env?.VITE_TMDB_API_KEY || 'e0cc43e590a5c5c0d03f920bd4fe9424';
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
export const FALLBACK_POSTER_IMAGE = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=500&q=80';
export const FALLBACK_BACKDROP_IMAGE = 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80';

export const formatImageUrl = (path: string | null | undefined, size: string = 'w500') => {
  if (!path || typeof path !== 'string' || path.trim() === '' || path === 'null' || path === 'undefined') {
    return size === 'original' ? FALLBACK_BACKDROP_IMAGE : FALLBACK_POSTER_IMAGE;
  }
  if (path.startsWith('http')) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `https://image.tmdb.org/t/p/${size}${cleanPath}`;
};

// API Calls
export const getTrending = async (type: 'movie' | 'tv' | 'all' = 'all', timeWindow: 'day' | 'week' = 'week'): Promise<TMDBResponse> => {
  const res = await fetch(`${BASE_URL}/trending/${type}/${timeWindow}?language=pt-BR&api_key=${TMDB_API_KEY}`, options);
  return res.json();
};

export const getPopularMovies = async (): Promise<TMDBResponse> => {
  const res = await fetch(`${BASE_URL}/movie/popular?language=pt-BR&page=1&api_key=${TMDB_API_KEY}`, options);
  return res.json();
};

export const getPopularSeries = async (): Promise<TMDBResponse> => {
  const res = await fetch(`${BASE_URL}/tv/popular?language=pt-BR&page=1&api_key=${TMDB_API_KEY}`, options);
  return res.json();
};

export const getTopRated = async (type: 'movie' | 'tv'): Promise<TMDBResponse> => {
  const res = await fetch(`${BASE_URL}/${type}/top_rated?language=pt-BR&page=1&api_key=${TMDB_API_KEY}`, options);
  return res.json();
};

export const searchMulti = async (query: string): Promise<TMDBResponse> => {
  const res = await fetch(`${BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=pt-BR&page=1&api_key=${TMDB_API_KEY}`, options);
  return res.json();
};

export const getDetails = async (id: number, type: 'movie' | 'tv'): Promise<TMDBDetails> => {
  const res = await fetch(`${BASE_URL}/${type}/${id}?language=pt-BR&api_key=${TMDB_API_KEY}`, options);
  return res.json();
};

export const getSeasonDetails = async (seriesId: number, seasonNumber: number): Promise<Season> => {
  const res = await fetch(`${BASE_URL}/tv/${seriesId}/season/${seasonNumber}?language=pt-BR&api_key=${TMDB_API_KEY}`, options);
  return res.json();
};

// TMDB Network IDs & Watch Provider IDs for streaming brands:
// Netflix: network 213, provider 8
// Disney+: network 2739, provider 337
// HBO / Max: network 49 / 3186, provider 1899 / 384
// Amazon Prime: network 1024, provider 119
// Apple TV+: network 2552, provider 350
export const getProviderSeries = async (provider: string, page: number = 1): Promise<TMDBResponse> => {
  let networkId = 213; // default Netflix
  let providerId = 8;
  const p = provider.toLowerCase();

  if (p.includes('netflix')) {
    networkId = 213;
    providerId = 8;
  } else if (p.includes('disney')) {
    networkId = 2739;
    providerId = 337;
  } else if (p.includes('max') || p.includes('hbo')) {
    networkId = 49;
    providerId = 1899;
  } else if (p.includes('prime') || p.includes('amazon')) {
    networkId = 1024;
    providerId = 119;
  } else if (p.includes('apple')) {
    networkId = 2552;
    providerId = 350;
  }

  const res = await fetch(
    `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=popularity.desc&page=${page}&with_networks=${networkId}&watch_region=BR`,
    options
  );
  return res.json();
};

export const getProviderMovies = async (provider: string, page: number = 1): Promise<TMDBResponse> => {
  let providerId = 8;
  const p = provider.toLowerCase();

  if (p.includes('netflix')) providerId = 8;
  else if (p.includes('disney')) providerId = 337;
  else if (p.includes('max') || p.includes('hbo')) providerId = 1899;
  else if (p.includes('prime') || p.includes('amazon')) providerId = 119;
  else if (p.includes('apple')) providerId = 350;

  const res = await fetch(
    `${BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=popularity.desc&page=${page}&with_watch_providers=${providerId}&watch_region=BR`,
    options
  );
  return res.json();
};

export const discoverMovies = async (page: number = 1, genreId?: number, sortBy: string = 'popularity.desc', year?: number): Promise<TMDBResponse> => {
  let url = `${BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=${sortBy}&page=${page}&include_adult=false&vote_count.gte=10`;
  if (genreId) url += `&with_genres=${genreId}`;
  if (year) url += `&primary_release_year=${year}`;
  const res = await fetch(url, options);
  return res.json();
};

export const discoverSeries = async (page: number = 1, genreId?: number, sortBy: string = 'popularity.desc', year?: number): Promise<TMDBResponse> => {
  let url = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=pt-BR&sort_by=${sortBy}&page=${page}&include_adult=false&vote_count.gte=10`;
  if (genreId) url += `&with_genres=${genreId}`;
  if (year) url += `&first_air_date_year=${year}`;
  const res = await fetch(url, options);
  return res.json();
};

export const getGenreIdByName = (name: string): number | undefined => {
  const entry = Object.entries(genreMap).find(([_, val]) => val.toLowerCase() === name.toLowerCase());
  return entry ? parseInt(entry[0]) : undefined;
};


