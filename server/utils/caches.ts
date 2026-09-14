
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

// 1. Anime Direct Stream Cache - Limit to 500 items, TTL 1 hour
export const animeDirectStreamCache = new LRUCache<string, AnimeDirectStreamItem>({
  max: 500,
  ttl: 1000 * 60 * 60, // 1 hour
});

// 2. Vixsrc Stream Cache - Limit to 200 items, TTL 30 minutes
export const vixsrcStreamCache = new LRUCache<string, { masterUrl: string; embedUrl: string; timestamp: number }>({
  max: 200,
  ttl: 1000 * 60 * 30, // 30 mins
});

// 3. Live Chunk Cache (Buffer-heavy) - Limit to 100 items, TTL 15 seconds
export const liveChunkCache = new LRUCache<string, { buffer: Buffer; contentType: string; expires: number }>({
  max: 100,
  ttl: 1000 * 15, // 15 seconds
});

// 4. Search Cache (Already existed, we will redefine if needed)
export const searchCache = new LRUCache<string, any>({
  max: 100,
  ttl: 1000 * 60 * 10,
});
