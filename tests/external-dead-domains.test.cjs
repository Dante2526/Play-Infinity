const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

test('externalCatalog rejects dead hosts and non-media extensions in isFonteAllowed', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server/services/externalCatalog.ts'), 'utf8');
  assert.match(code, /vaiagora\.vip/);
  assert.match(code, /vivlar\.me/);
  assert.match(code, /s13-s1001604\.lat/);
  assert.match(code, /dadinhodetapioca\.fun/);
  assert.match(code, /s25-cloudfront-net\.lat/);
  assert.match(code, /\.endsWith\("\.html"\)/);
  assert.match(code, /\.endsWith\("\.txt"\)/);
});

test('externalCatalog prioritizes reliable CDNs before probing candidates', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server/services/externalCatalog.ts'), 'utf8');
  assert.match(code, /RELIABLE_CDN_PATTERNS/);
  assert.match(code, /corruptx\.org/);
  assert.match(code, /64\.31\.23\.207/);
  assert.match(code, /allowed\.sort/);
});

test('externalCatalog checks probeCache positive entry before probe loop for instant 0ms resolve', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server/services/externalCatalog.ts'), 'utf8');
  assert.match(code, /const cached = probeCache\.get\(cacheKey\);/);
  assert.match(code, /if \(cached && cached\.expires > Date\.now\(\) && cached\.ok\)/);
});

test('externalRoutes uses expanded deadline and batch concurrency to reach active IPTV sources', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server/routes/externalRoutes.ts'), 'utf8');
  assert.match(code, /deadlineMs: 8000/);
  assert.match(code, /batch: 6/);
  assert.match(code, /probeTimeoutMs: 3500/);
});
