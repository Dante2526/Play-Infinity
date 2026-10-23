const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let temp, app, env, calls;
function run(release, extra = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(root, 'scripts/install-release-deps.cjs'), app, release], {
      env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
    });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => stdout += d); p.stderr.on('data', d => stderr += d);
    p.on('error', reject); p.on('exit', code => resolve({ code, stdout, stderr }));
  });
}
async function release(name, pkg = {}, lockExtra = {}) {
  const dir = path.join(app, 'releases', name); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', ...pkg }));
  await fs.writeFile(path.join(dir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {}, ...lockExtra }));
  return dir;
}
async function installs() { try { return (await fs.readFile(calls, 'utf8')).trim().split('\n').filter(Boolean).length; } catch { return 0; } }
before(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'deploy-dependency-sets-'));
  app = path.join(temp, 'app'); const bin = path.join(temp, 'bin'); calls = path.join(temp, 'calls');
  await fs.mkdir(bin); await fs.mkdir(app);
  await fs.writeFile(path.join(bin, 'npm'), `#!/bin/sh
if [ "$1" = "--version" ]; then echo "\${TEST_NPM_VERSION:-11.9.0}"; exit 0; fi
echo ci >> "$TEST_INSTALL_CALLS"
if [ "$TEST_FAIL_CI" = 1 ]; then exit 1; fi
mkdir -p node_modules/fixture-dep
echo "module.exports = 'intact';" > node_modules/fixture-dep/index.js
`, { mode: 0o755 });
  env = { ...process.env, PATH: bin + ':' + process.env.PATH, TEST_INSTALL_CALLS: calls };
});
after(async () => { await fs.rm(temp, { recursive: true, force: true }); });
test('identical packages/runtime skip npm ci and leave old release modules intact', async () => {
  const a = await release('a'); assert.equal((await run(a)).code, 0);
  const count = await installs(); const first = await fs.realpath(path.join(a, 'node_modules'));
  const b = await release('b'); const result = await run(b);
  assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /npm ci dispensado/);
  assert.equal(await installs(), count);
  assert.equal(await fs.realpath(path.join(b, 'node_modules')), first);
  assert.equal(require(path.join(a, 'node_modules/fixture-dep')), 'intact');
  assert.equal(require(path.join(b, 'node_modules/fixture-dep')), 'intact');
});
test('manifest, lockfile and npm changes each create a separate dependency set', async () => {
  const before = await installs();
  for (const [name, pkg, lock, override] of [
    ['manifest', { version: '2.0.0' }, {}, {}],
    ['lock', {}, { lockfileVersion: 2 }, {}],
    ['npm', {}, {}, { TEST_NPM_VERSION: 'different-version' }],
  ]) {
    const dir = await release(name, pkg, lock);
    assert.equal((await run(dir, override)).code, 0);
    assert.notEqual(await fs.realpath(path.join(dir, 'node_modules')), await fs.realpath(path.join(app, 'releases/a/node_modules')));
  }
  assert.equal(await installs(), before + 3);
});
test('failed install publishes no cache entry and next attempt still runs npm ci', async () => {
  const count = await installs();
  const a = await release('failed', { version: '3.0.0' }); const b = await release('recovered', { version: '3.0.0' });
  assert.notEqual((await run(a, { TEST_FAIL_CI: '1' })).code, 0);
  assert.equal((await run(b)).code, 0);
  assert.equal(await installs(), count + 2);
});
test('root install hooks and workspace links run independently for each release', async () => {
  const count = await installs();
  for (const name of ['hook1', 'hook2']) {
    const d = await release(name, { scripts: { postinstall: 'generate-release-files' } });
    assert.equal((await run(d)).code, 0); assert.equal((await fs.lstat(path.join(d, 'node_modules'))).isSymbolicLink(), false);
  }
  for (const name of ['link1', 'link2']) {
    const d = await release(name, {}, { packages: { 'node_modules/local': { link: true } } });
    assert.equal((await run(d)).code, 0); assert.equal((await fs.lstat(path.join(d, 'node_modules'))).isSymbolicLink(), false);
  }
  assert.equal(await installs(), count + 4);
});
