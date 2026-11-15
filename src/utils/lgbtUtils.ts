import { CatalogItem, checkIsCam, isMediaAvailable } from './mediaUtils';
import {
  formatImageUrl,
  formatPosterUrl,
  getGenreNames,
  hasTmdbArtwork,
  TMDBDetails,
  TMDBItem,
} from '../services/tmdb';

const UNSPLASH_FALLBACK_HOST = 'images.unsplash.com';

export function getLgbtItemKey(item: {
  id?: number;
  tmdbId?: number;
  type?: string;
  media_type?: string;
}): string {
  const numericId = Number(item.tmdbId || item.id || 0);
  const normalizedType =
    item.type === 'series' || item.media_type === 'tv' ? 'series' : 'movie';
  return `${normalizedType}:${numericId}`;
}

export function buildLgbtPlayerUrl(id: number, type: 'movie' | 'series'): string {
  return type === 'series'
    ? `https://v1.watchplay.shop/tvshow/${id}/1/1`
    : `https://v1.watchplay.shop/movie/${id}`;
}

export function mapTmdbToLgbtCard(
  item: TMDBItem,
  mediaType: 'movie' | 'tv'
): CatalogItem | null {
  if (!item || !item.id || !hasTmdbArtwork(item)) return null;
  const rawTitle = (item.title || item.name || '').trim();
  if (!rawTitle) return null;

  const normalizedType: 'movie' | 'series' =
    mediaType === 'tv' ? 'series' : 'movie';
  const poster = formatPosterUrl(item);
  const dateStr =
    normalizedType === 'movie'
      ? item.release_date || ''
      : item.first_air_date || '';
  const parsedYear = parseInt(dateStr.substring(0, 4), 10);

  return {
    id: item.id,
    tmdbId: item.id,
    title: rawTitle.toUpperCase(),
    imageUrl: poster,
    posterUrl: poster,
    backdropUrl: formatImageUrl(item.backdrop_path || item.poster_path, 'original'),
    type: normalizedType,
    genres: getGenreNames(item.genre_ids || []),
    synopsis: item.overview || undefined,
    year: Number.isFinite(parsedYear) && parsedYear > 1900 ? parsedYear : undefined,
    rating: item.vote_average ? item.vote_average.toFixed(1) : undefined,
    quality:
      normalizedType === 'movie' && checkIsCam(rawTitle) ? 'CAM' : 'HD',
    playerUrl: buildLgbtPlayerUrl(item.id, normalizedType),
  };
}

export function normalizeLgbtFallbackItem(
  item: CatalogItem,
  hydratedDetails?: TMDBDetails | null
): CatalogItem {
  const normalizedType: 'movie' | 'series' =
    item.type === 'series' ? 'series' : 'movie';
  const effectiveId = Number(item.tmdbId || item.id);
  const hasHydratedArtwork = !!hydratedDetails && hasTmdbArtwork(hydratedDetails);

  const hydratedPoster = hasHydratedArtwork
    ? formatPosterUrl(hydratedDetails)
    : item.posterUrl || item.imageUrl;
  const hydratedBackdrop =
    hasHydratedArtwork && (hydratedDetails.backdrop_path || hydratedDetails.poster_path)
      ? formatImageUrl(
          hydratedDetails.backdrop_path || hydratedDetails.poster_path,
          'original'
        )
      : item.backdropUrl;

  return {
    ...item,
    id: item.id,
    tmdbId: effectiveId,
    type: normalizedType,
    imageUrl: hydratedPoster,
    posterUrl: hydratedPoster,
    backdropUrl: hydratedBackdrop,
    playerUrl: buildLgbtPlayerUrl(effectiveId, normalizedType),
  };
}

export function needsLgbtPosterHydration(item: CatalogItem): boolean {
  const url = item.posterUrl || item.imageUrl || '';
  if (!url || url.includes(UNSPLASH_FALLBACK_HOST)) return true;
  // URLs w780 vindas de metadados auxiliares são temporárias até o poster_path oficial w500 carregar
  return !url.includes('/t/p/w500/') && !url.includes('/t/p/w342/');
}

export interface BuildDisplayedLgbtOptions {
  tmdbMovies: CatalogItem[];
  tmdbSeries: CatalogItem[];
  fallbackItems: CatalogItem[];
  hydratedDetailsMap?: Record<string, TMDBDetails>;
  isAvailable?: (item: {
    id?: number;
    tmdbId?: number;
    title?: string;
    name?: string;
  }) => boolean;
  maxItems?: number;
}

export function buildDisplayedLgbtItems(
  opts: BuildDisplayedLgbtOptions
): CatalogItem[] {
  const checkAvailable = opts.isAvailable || isMediaAvailable;
  const maxItems = opts.maxItems ?? 36;
  const hydratedMap = opts.hydratedDetailsMap || {};

  const safeMovies = (opts.tmdbMovies || []).filter(
    (m) => m && checkAvailable(m)
  );
  const safeSeries = (opts.tmdbSeries || []).filter(
    (s) => s && checkAvailable(s)
  );

  // Intercala filmes e séries da busca ao vivo do TMDB sem criar buracos
  const interleavedLive: CatalogItem[] = [];
  const maxLiveLen = Math.max(safeMovies.length, safeSeries.length);
  for (let i = 0; i < maxLiveLen; i++) {
    if (safeMovies[i]) interleavedLive.push(safeMovies[i]);
    if (safeSeries[i]) interleavedLive.push(safeSeries[i]);
  }

  const seen = new Set<string>();
  const result: CatalogItem[] = [];

  for (const item of interleavedLive) {
    const key = getLgbtItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= maxItems) return result;
  }

  // Complementa com o catálogo curado LGBT+ (disponível e dublado PT-BR)
  const availableFallback = (opts.fallbackItems || [])
    .filter((item) => item && checkAvailable(item))
    .map((item) => {
      const key = getLgbtItemKey(item);
      return normalizeLgbtFallbackItem(item, hydratedMap[key]);
    });

  // Prioriza itens com capa real (não-placeholder genérica), mas garante fallback caso offline total
  const withRealArtwork = availableFallback.filter(
    (item) =>
      item.imageUrl && !item.imageUrl.includes(UNSPLASH_FALLBACK_HOST)
  );
  const paddingPool =
    withRealArtwork.length > 0 || result.length > 0
      ? withRealArtwork
      : availableFallback;

  for (const item of paddingPool) {
    const key = getLgbtItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= maxItems) break;
  }

  return result;
}
