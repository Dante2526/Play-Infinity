
import { LRUCache } from "lru-cache";

export interface AnimeDirectStreamItem {
  url?: string;
  quality?: string;
  source?: string;
  streamUrl?: string;
  subtitleUrl?: string;
  isBlogger?: boolean;
  timestamp: number;
}

// 1. Anime Direct Stream Cache - Limit to 100 items (metadata only, lightweight)
export const animeDirectStreamCache = new LRUCache<string, AnimeDirectStreamItem>({
  max: 100,
  ttl: 1000 * 60 * 30, // 30 mins
});

// 2. Vixsrc Stream Cache - Limit to 50 items (URLs only)
export const vixsrcStreamCache = new LRUCache<string, { masterUrl: string; embedUrl: string; timestamp: number }>({
  max: 50,
  ttl: 1000 * 60 * 15, // 15 mins
});

// 3. Live Chunk Cache (M3U8 text/manifests only, avoid hoarding multi-MB video buffers) - Max 30 items
export const liveChunkCache = new LRUCache<string, { buffer: Buffer; contentType: string; expires: number }>({
  max: 30,
  ttl: 1000 * 10, // 10 seconds
});

// 4. Search Cache - Limit to 50 items
export const searchCache = new LRUCache<string, any>({
  max: 50,
  ttl: 1000 * 60 * 5,
});
