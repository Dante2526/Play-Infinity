const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
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
export const formatImageUrl = (path: string | null, size: string = 'w500') => {
  if (!path) return 'https://via.placeholder.com/500x750?text=Indispon%C3%ADvel';
  return `https://image.tmdb.org/t/p/${size}${path}`;
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
