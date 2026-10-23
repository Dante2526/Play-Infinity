const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
let temp, server, url, staleHtml = false, staleAsset = false, codeRelease = 'old';
const html = '<html><script src="/assets/app-new.js"></script></html>';
before(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-public-frontend-'));
  await fs.mkdir(path.join(temp, 'dist/assets'), { recursive: true });
  await fs.writeFile(path.join(temp, 'dist/index.html'), html);
  await fs.writeFile(path.join(temp, 'dist/assets/app-new.js'), 'new-code');
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/health')) { res.end(JSON.stringify({ status: 'ok', release: 'new', codeRelease })); return; }
    if (req.url.startsWith('/assets/')) res.end(staleAsset ? 'old-code' : 'new-code');
    else res.end(staleHtml ? '<html>old</html>' : html);
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await fs.rm(temp, { recursive: true, force: true }); });
function verify(script = 'verify-public-frontend.cjs', args = [temp, url]) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.resolve(__dirname, '../scripts', script), ...args], { timeout: 10000 });
    let stderr = ''; p.stderr.on('data', d => stderr += d); p.stdout.resume();
    p.on('error', reject); p.on('exit', code => resolve({ code, stderr }));
  });
}
test('public verification requires current HTML and matching asset bytes', async () => {
  assert.equal((await verify()).code, 0);
});
test('healthy backend cannot make stale public HTML pass verification', async () => {
  staleHtml = true;
  try { const r = await verify(); assert.equal(r.code, 1); assert.match(r.stderr, /HTML público difere/); }
  finally { staleHtml = false; }
});
test('current HTML with an outdated public asset still fails verification', async () => {
  staleAsset = true;
  try { assert.equal((await verify()).code, 1); }
  finally { staleAsset = false; }
});
test('release environment cannot masquerade as a different executed bundle', async () => {
  const args = [url + '/api/health', 'new'];
  assert.equal((await verify('verify-release.cjs', args)).code, 1);
  codeRelease = 'new';
  assert.equal((await verify('verify-release.cjs', args)).code, 0);
});
