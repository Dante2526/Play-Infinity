const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const Module = require('node:module');

test('BYSE shared cache syncs resolved streams between simulated cluster workers', async () => {
  process.env.TEST_SHARED_CACHE = '1';
  const root = path.resolve(__dirname, '..');
  const cacheFile = path.join(root, 'data', 'byse-resolve-cache.json');
  try { if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile); } catch {}

  const out = await esbuild.build({
    stdin: {
      contents: "export * from './server/services/byse/core';",
      resolveDir: root,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false
  });

  const worker1File = path.join(root, 'tests/worker1.cjs');
  const worker1 = new Module(worker1File, module);
  worker1.filename = worker1File;
  worker1.paths = module.paths;
  worker1._compile(out.outputFiles[0].text, worker1File);

  const worker2File = path.join(root, 'tests/worker2.cjs');
  const worker2 = new Module(worker2File, module);
  worker2.filename = worker2File;
  worker2.paths = module.paths;
  worker2._compile(out.outputFiles[0].text, worker2File);

  // Directly seed an entry into cache file to simulate worker 1 writing it
  const dummyResolved = {
    fileId: 'cluster_test_file_123',
    m3u8: 'https://r66nv9ed.com/test.m3u8',
    resolvedAt: Date.now(),
    expiresAt: Date.now() + 600000
  };
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ [dummyResolved.fileId]: dummyResolved }));

  // Worker 2 should be able to see it via getWarmByseStream
  const warm = worker2.exports.getWarmByseStream(dummyResolved.fileId);
  assert.ok(warm, 'Worker 2 should find warm stream in shared cache');
  assert.equal(warm.fileId, dummyResolved.fileId);
  assert.equal(warm.m3u8, dummyResolved.m3u8);

  // Clean up
  delete process.env.TEST_SHARED_CACHE;
  try { if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile); } catch {}
});
