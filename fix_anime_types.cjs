const fs = require('fs');
let caches = fs.readFileSync('server/utils/caches.ts', 'utf-8');
caches = caches.replace(/export interface AnimeDirectStreamItem \{[\s\S]*?\}/, `export interface AnimeDirectStreamItem {
  url?: string;
  quality?: string;
  source?: string;
  streamUrl?: string;
  subtitleUrl?: string;
  isBlogger?: boolean;
  timestamp: number;
}`);
fs.writeFileSync('server/utils/caches.ts', caches);
