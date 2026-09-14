export type OnPlayHandler = (
  title: string, 
  url?: string, 
  mediaType?: 'movie' | 'series',
  tmdbId?: number,
  imdbId?: string,
  season?: number,
  episode?: number,
  quality?: string,
  isCam?: boolean,
  initialTime?: number,
  autoFullscreen?: boolean,
  imageUrl?: string,
  backdropUrl?: string,
  posterUrl?: string,
  isAnime?: boolean
) => void;
