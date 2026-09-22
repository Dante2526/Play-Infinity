/**
 * Catálogo do encontrei.me — 6.694 filmes + 27.629 episódios
 * Extraído via scraper com cookie Dante15 (válido até 21/Dez/2026)
 * 
 * Cada item tem: tmdb_id (pra sync TMDB) + mixdrop fileId (pra /api/mixdrop-stream)
 * 
 * O JSON é carregado lazy (só quando o usuário entra na seção de filmes).
 * Cacheado em memória pra não re-fetch.
 */

export interface EncontreiMovie {
  video_id: number;
  tmdb_id: number | null;
  audio: 'Dublado' | 'Legendado' | null;
  servers: {
    mixdrop?: string;
    streamtape?: string;
    byse?: string;
    doodstream?: string;
  };
}

export interface EncontreiEpisode {
  episode_id: number;
  serie_id: number;
  season: number;
  episode: number;
  tmdb_id: number | null;
  audio: 'Dublado' | 'Legendado' | null;
  servers: {
    mixdrop?: string;
    streamtape?: string;
    byse?: string;
    doodstream?: string;
  };
  source_url?: string;
}

export interface EncontreiSerie {
  serie_id: number;
  slug: string;
  source_url: string;
}

interface EncontreiCatalog {
  metadata: {
    scraped_at: string;
    source: string;
    stats: {
      movies_total: number;
      movies_with_tmdb: number;
      movies_with_mixdrop: number;
      episodes_total: number;
      episodes_with_tmdb: number;
      episodes_with_mixdrop: number;
      series_total: number;
    };
  };
  movies: EncontreiMovie[];
  series: EncontreiSerie[];
  episodes: EncontreiEpisode[];
}

// Cache em memória
let _catalog: EncontreiCatalog | null = null;
let _loadingPromise: Promise<EncontreiCatalog> | null = null;

/**
 * Carrega o catálogo lazy (só na primeira chamada).
 * O JSON está em /public/data/encontrei-catalog.json (~13MB, gzipped ~3MB).
 */
export async function loadCatalog(): Promise<EncontreiCatalog> {
  if (_catalog) return _catalog;
  if (_loadingPromise) return _loadingPromise;
  
  _loadingPromise = fetch('/data/encontrei-catalog.json')
    .then(r => r.json())
    .then((data: EncontreiCatalog) => {
      _catalog = data;
      return data;
    })
    .catch(err => {
      console.error('[encontreiCatalog] Erro ao carregar:', err);
      _loadingPromise = null;
      throw err;
    });
  
  return _loadingPromise;
}

/**
 * Busca um filme por tmdb_id.
 * Retorna o fileId do MixDrop + áudio.
 */
export async function findMovieByTmdbId(tmdbId: number): Promise<EncontreiMovie | null> {
  const cat = await loadCatalog();
  return cat.movies.find(m => m.tmdb_id === tmdbId) || null;
}

/**
 * Busca TODOS os episódios de uma série (por tmdb_id da série).
 * Retorna array de episódios com season/episode/fileId.
 */
export async function findEpisodesBySeriesTmdbId(tmdbId: number): Promise<EncontreiEpisode[]> {
  const cat = await loadCatalog();
  return cat.episodes.filter(e => e.tmdb_id === tmdbId);
}

/**
 * Busca um episódio específico por tmdb_id da série + season + episode.
 */
export async function findEpisode(
  tmdbId: number,
  season: number,
  episode: number
): Promise<EncontreiEpisode | null> {
  const cat = await loadCatalog();
  return cat.episodes.find(
    e => e.tmdb_id === tmdbId && e.season === season && e.episode === episode
  ) || null;
}

/**
 * Constrói a URL do /api/mixdrop-stream pra um fileId.
 * O app passa essa URL pro iframe do VideoPlayerModal.
 */
export function buildMixdropStreamUrl(fileId: string | undefined): string | null {
  if (!fileId) return null;
  return `/api/mixdrop-stream?url=${encodeURIComponent(`https://mxdrop.top/e/${fileId}`)}`;
}

/**
 * Lista todos os filmes (pra popular a home/catalog).
 * Retorna array compacto com só o necessário pra display.
 */
export async function getAllMovies(): Promise<Array<{
  tmdb_id: number;
  mixdrop_url: string;
  audio: string;
}>> {
  const cat = await loadCatalog();
  return cat.movies
    .filter(m => m.tmdb_id && m.servers.mixdrop)
    .map(m => ({
      tmdb_id: m.tmdb_id!,
      mixdrop_url: buildMixdropStreamUrl(m.servers.mixdrop)!,
      audio: m.audio || 'Dublado',
    }));
}

/**
 * Lista todas as séries únicas (por tmdb_id).
 */
export async function getAllSeries(): Promise<Array<{
  tmdb_id: number;
  episodes_count: number;
}>> {
  const cat = await loadCatalog();
  const seriesMap = new Map<number, number>();
  for (const ep of cat.episodes) {
    if (ep.tmdb_id) {
      seriesMap.set(ep.tmdb_id, (seriesMap.get(ep.tmdb_id) || 0) + 1);
    }
  }
  return Array.from(seriesMap.entries()).map(([tmdb_id, count]) => ({
    tmdb_id,
    episodes_count: count,
  }));
}
