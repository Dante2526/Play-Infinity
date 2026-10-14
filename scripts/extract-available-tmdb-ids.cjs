/**
 * Extrai todos os tmdb_ids disponíveis do encontrei-catalog.json
 * e salva em data/available-tmdb-ids.json (array de números).
 *
 * Esse arquivo é importado pelo frontend (mediaUtils.ts) pra fazer
 * lookup O(1) com Set<number> — verificar se um tmdb_id tem
 * servidor de vídeo disponível (mixdrop/streamtape/doodstream).
 *
 * Roda antes do `vite build` (script "prebuild" no package.json).
 */
const fs = require('fs');
const path = require('path');

const CATALOG_PATHS = [
  path.join(__dirname, '..', 'data', 'encontrei-catalog.json'),
  path.join(__dirname, '..', 'public', 'data', 'encontrei-catalog.json'),
  path.join(__dirname, '..', 'dist', 'data', 'encontrei-catalog.json'),
];

let CATALOG_PATH = null;
for (const p of CATALOG_PATHS) {
  if (fs.existsSync(p)) {
    CATALOG_PATH = p;
    break;
  }
}
if (!CATALOG_PATH) {
  console.error('[extract-ids] ❌ encontrei-catalog.json não encontrado em nenhum dos paths:');
  CATALOG_PATHS.forEach(p => console.error(`  - ${p}`));
  process.exit(1);
}
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'available-tmdb-ids.json');

console.log(`[extract-ids] Lendo ${CATALOG_PATH}...`);
const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

// Coletar tmdb_ids únicos de movies e episodes
const ids = new Set();

if (Array.isArray(raw.movies)) {
  for (const m of raw.movies) {
    if (m && typeof m.tmdb_id === 'number' && m.tmdb_id > 0) {
      ids.add(m.tmdb_id);
    }
  }
}
if (Array.isArray(raw.episodes)) {
  for (const e of raw.episodes) {
    if (e && typeof e.tmdb_id === 'number' && e.tmdb_id > 0) {
      ids.add(e.tmdb_id);
    }
  }
}

const sortedIds = Array.from(ids).sort((a, b) => a - b);
console.log(`[extract-ids] Coletados ${sortedIds.length} tmdb_ids únicos`);

// Estatísticas
const moviesCount = Array.isArray(raw.movies) ? raw.movies.length : 0;
const episodesCount = Array.isArray(raw.episodes) ? raw.episodes.length : 0;
const seriesCount = Array.isArray(raw.series) ? raw.series.length : 0;

const output = {
  generated_at: new Date().toISOString(),
  source: 'encontrei-catalog.json',
  stats: {
    movies: moviesCount,
    episodes: episodesCount,
    series: seriesCount,
    unique_tmdb_ids: sortedIds.length,
  },
  ids: sortedIds,
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));
const sizeKB = Math.round(fs.statSync(OUTPUT_PATH).size / 1024);
console.log(`[extract-ids] ✅ Salvo em ${OUTPUT_PATH} (${sizeKB} KB)`);
console.log(`[extract-ids]    movies: ${moviesCount}`);
console.log(`[extract-ids]    episodes: ${episodesCount}`);
console.log(`[extract-ids]    series: ${seriesCount}`);
console.log(`[extract-ids]    unique tmdb_ids: ${sortedIds.length}`);
