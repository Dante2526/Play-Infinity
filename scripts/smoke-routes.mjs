import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';
const PROXY_SECRET = 'play-infinity-secret-key-123!@#';

const endpoints = [
  { path: '/api/health' },
  { path: '/api/server-blocks' },
  // Requires params but let's test if the route exists and returns 400/404 or something consistent
  { path: '/api/watchplayer-stream?id=tt123456' },
  { path: '/api/myembed-stream?id=tt123456' },
  { path: '/api/pomfy-stream?id=tt123456' },
  { path: '/api/check-season?tmdbId=123&s=1' },
  { path: '/api/series/available-episodes?tmdbId=123&s=1' },
  { path: '/api/find-cast-source?tmdbId=123&mediaType=movie' },
  { path: '/api/iptv/globo' }
];

// Generate signed URL for proxy
const urlToProxy = 'http://example.com/video.m3u8';
const signature = crypto.createHmac('sha256', PROXY_SECRET).update(urlToProxy).digest('hex');
endpoints.push({
  path: `/api/live-stream-proxy?url=${encodeURIComponent(urlToProxy)}&sig=${signature}`
});
endpoints.push({
  path: `/api/anime/hls-proxy?url=${encodeURIComponent(urlToProxy)}`
});

async function request(urlPath) {
  return new Promise((resolve) => {
    const req = http.get(`${BASE_URL}${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          contentType: res.headers['content-type'] || 'none',
          bodySnippet: data.substring(0, 100).replace(/\n/g, ' ')
        });
      });
    });
    
    req.on('error', (err) => {
      resolve({ status: 'ERROR', error: err.message });
    });
    
    // Set a timeout
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ status: 'TIMEOUT', error: 'Request timed out' });
    });
  });
}

async function runSmokeTest() {
  console.log('Running smoke tests against', BASE_URL);
  const results = {};
  
  for (const ep of endpoints) {
    console.log(`Testing ${ep.path}...`);
    results[ep.path] = await request(ep.path);
  }
  
  const outPath = path.join(process.cwd(), 'scratch', 'smoke-baseline.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  
  console.log(`\nSmoke test baseline saved to ${outPath}`);
  console.table(
    Object.entries(results).map(([p, r]) => ({
      path: p.substring(0, 40) + (p.length > 40 ? '...' : ''),
      status: r.status,
      type: r.contentType
    }))
  );
}

runSmokeTest();
