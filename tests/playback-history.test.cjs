const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('playbackHistory purges ghost ID 1101412 and prevents tv lookup', () => {
  const file = path.join(process.cwd(), 'src', 'services', 'playbackHistory.ts');
  const content = fs.readFileSync(file, 'utf8');

  assert.ok(content.includes("GHOST_HISTORY_IDS = new Set(['1101412'])"), 'Must declare GHOST_HISTORY_IDS');
  assert.ok(content.includes('GHOST_HISTORY_IDS.has(String(it.id))'), 'Must purge ghost ID in getStore');
  assert.ok(content.includes('purgedGhostFromCloud = true'), 'Must sync ghost removal to cloud in fetchHistoryFromCloud');
  assert.ok(content.includes('if (GHOST_HISTORY_IDS.has(String(tmdbId))) return Promise.resolve(null)'), 'Must bypass series finale lookup for ghost ID');
});
