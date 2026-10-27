const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

test('externalCatalog rejects vaiagora.vip and vivlar.me in isFonteAllowed', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server/services/externalCatalog.ts'), 'utf8');
  assert.match(code, /vaiagora\.vip/);
  assert.match(code, /vivlar\.me/);
});

test('externalCatalog checks probeCache positive entry before probe loop for instant 0ms resolve', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server/services/externalCatalog.ts'), 'utf8');
  assert.match(code, /const cached = probeCache\.get\(cacheKey\);/);
  assert.match(code, /if \(cached && cached\.expires > Date\.now\(\) && cached\.ok\)/);
});

test('externalRoutes uses expanded deadline and batch concurrency to reach active IPTV sources', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server/routes/externalRoutes.ts'), 'utf8');
  assert.match(code, /deadlineMs: 7000/);
  assert.match(code, /batch: 6/);
  assert.match(code, /probeTimeoutMs: 2000/);
});
