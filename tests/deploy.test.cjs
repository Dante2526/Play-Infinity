const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, fork, spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const pm2 = process.env.PM2_BIN;
let temporary, appRoot, env, port, probePort, fixture;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, timeout: 60000, ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}
async function freePort() {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const result = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return result;
}
async function health() {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200);
  return response.json();
}
async function archive(id, broken = false, failMainHealth = false) {
  const source = path.join(temporary, `source-${id}`);
  await fs.mkdir(path.join(source, 'dist', 'assets'), { recursive: true });
  await fs.mkdir(path.join(source, 'data'));
  await fs.cp(path.join(root, 'scripts'), path.join(source, 'scripts'), { recursive: true });
  await fs.copyFile(path.join(root, 'ecosystem.config.cjs'), path.join(source, 'ecosystem.config.cjs'));
  await fs.writeFile(path.join(source, 'dist', 'server.cjs'), broken ? 'process.exit(1)' :
    (failMainHealth ? `if (process.env.APP_PROBE !== '1') process.env.APP_RELEASE_ID = 'unexpected-version';\n` : '') + fixture);
  await fs.writeFile(path.join(source, 'dist', 'index.html'), `<div>${id}</div>`);
  await fs.writeFile(path.join(source, 'dist', 'assets', `${id}-hash.js`), `// ${id}`);
  await fs.writeFile(path.join(source, 'data', 'catalog.json'), `seed-${id}`);
  await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'deploy-fixture', version: '1.0.0' }));
  await fs.writeFile(path.join(source, 'package-lock.json'), JSON.stringify({
    name: 'deploy-fixture', version: '1.0.0', lockfileVersion: 3,
    packages: { '': { name: 'deploy-fixture', version: '1.0.0' } },
  }));
  const target = path.join(temporary, `${id}.tar.gz`);
  const tar = await run('tar', ['-czf', target, '-C', source, '.']);
  assert.equal(tar.code, 0, tar.stderr);
  return target;
}
async function deploy(id, broken = false, options = {}) {
  const tar = await archive(id, broken, options.failMainHealth);
  // The workflow copies only this bootstrap into /tmp, not its sibling tools.
  const bootstrap = path.join(temporary, 'remote-deploy.sh');
  await fs.copyFile(path.join(root, 'scripts', 'deploy-release.sh'), bootstrap);
  return run('bash', [bootstrap, tar, id, appRoot], { env: options.env || env });
}

before(async () => {
  assert.ok(pm2, 'Set PM2_BIN to an installed PM2 CLI (tests use an isolated PM2_HOME).');
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'play-infinity-deploy-test-'));
  appRoot = path.join(temporary, 'app');
  port = await freePort();
  probePort = await freePort();
  env = {
    ...process.env, PM2_HOME: path.join(temporary, 'pm2'),
    PATH: `${path.dirname(pm2)}:${process.env.PATH}`,
    PLAY_INFINITY_PORT: String(port), PLAY_INFINITY_PROBE_PORT: String(probePort),
    PLAY_INFINITY_PUBLIC_URL: `http://127.0.0.1:${port}`,
    APP_DRAIN_TIMEOUT_MS: '20000',
  };
  const compiled = await esbuild.build({
    stdin: { contents: `
      import http from 'node:http';
      import fs from 'node:fs';
      import path from 'node:path';
      import { configureServerLifecycle } from './server/utils/serverLifecycle';
      const server = http.createServer((req, res) => {
        if (req.url === '/stream') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          let count = 0;
          res.write('start\\n');
          const timer = setInterval(() => {
            res.write('chunk\\n');
            if (++count === 12) { clearInterval(timer); res.end('done\\n'); }
          }, 1000);
          res.on('close', () => clearInterval(timer));
        } else if (req.url === '/' || req.url.startsWith('/?')) {
          res.setHeader('Content-Type','text/html');
          res.end(fs.readFileSync(path.join(process.cwd(),'dist/index.html')));
        } else if (req.url.startsWith('/assets/')) {
          const asset = path.join(process.env.APP_ASSET_DIR, path.basename(req.url));
          if (!fs.existsSync(asset)) { res.writeHead(404); res.end(); }
          else res.end(fs.readFileSync(asset));
        } else {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({status:'ok',release:process.env.APP_RELEASE_ID,
            codeRelease:path.basename(path.resolve(__dirname,'..')),
            legacySecretPreserved:process.env.PROXY_SECRET==='migration-fixture-secret',
            legacySettingPreserved:process.env.LEGACY_ONLY==='fixture-only'}));
        }
      });
      configureServerLifecycle(server);
      server.listen(Number(process.env.PORT), '127.0.0.1');
    `, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false,
  });
  fixture = compiled.outputFiles[0].text;
  await fs.mkdir(path.join(appRoot, 'data'), { recursive: true });
  await fs.writeFile(path.join(appRoot, 'data', 'catalog.json'), 'existing-live-data');
  await fs.mkdir(path.join(appRoot, 'dist', 'assets'), { recursive: true });
  await fs.writeFile(path.join(appRoot, 'dist', 'assets', 'legacy-hash.js'), '// legacy');
  const daemon = await run(pm2, ['ping']);
  assert.equal(daemon.code, 0, daemon.stderr);
});

after(async () => {
  if (env) {
    await run(pm2, ['delete', 'all']);
    await run(pm2, ['kill']);
  }
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
});

test('first deployment validates the release and preserves live data/legacy assets', async () => {
  const result = await deploy('v1');
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal((await health()).release, 'v1');
  assert.equal(await fs.readFile(path.join(appRoot, 'data', 'catalog.json'), 'utf8'), 'existing-live-data');
  assert.equal(await fs.readFile(path.join(appRoot, 'shared-assets', 'legacy-hash.js'), 'utf8'), '// legacy');
  const apps = JSON.parse((await run(pm2, ['jlist'])).stdout);
  assert.ok(apps.every(p => p.pm2_env.pm_cwd === path.join(appRoot, 'releases/v1')));
});

test('rolling deploy preserves a 12-second stream and serves health/new requests throughout', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/stream`);
  const streamBody = response.text();
  let finished = false;
  const started = Date.now();
  const rollout = deploy('v2').finally(() => { finished = true; });
  let checks = 0;
  while (!finished) {
    await health();
    checks++;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  const result = await rollout;
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const text = await streamBody;
  assert.equal(text, 'start\n' + 'chunk\n'.repeat(12) + 'done\n');
  assert.ok(Date.now() - started >= 11000, 'Stream must outlive the previous 8s kill timeout');
  assert.ok(checks > 5);
  assert.equal((await health()).release, 'v2');
  assert.equal(await fs.readFile(path.join(appRoot, 'releases', 'v1', 'dist', 'index.html'), 'utf8'), '<div>v1</div>');
  const asset = await fetch(`http://127.0.0.1:${port}/assets/v1-hash.js`);
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), '// v1');
  const apps = JSON.parse((await run(pm2, ['jlist'])).stdout);
  assert.ok(apps.every(p => p.pm2_env.pm_cwd === path.join(appRoot, 'releases/v2') && p.pm2_env.pm_exec_path === path.join(appRoot, 'releases/v2/dist/server.cjs')));
  assert.equal((await health()).codeRelease, 'v2');
});

test('a broken candidate never changes current or restarts the running release', async () => {
  const result = await deploy('broken', true);
  assert.notEqual(result.code, 0);
  assert.equal(path.basename(await fs.realpath(path.join(appRoot, 'current'))), 'v2');
  assert.equal((await health()).release, 'v2');
});

test('readiness is sent only after listen; a bind error exits without ready', async () => {
  const file = path.join(temporary, 'bind-test.cjs');
  await fs.writeFile(file, fixture);
  const child = fork(file, [], { env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const messages = [];
  child.on('message', message => messages.push(message));
  const exit = await new Promise(resolve => child.once('exit', code => resolve(code)));
  assert.equal(exit, 1);
  assert.deepEqual(messages, []);
  const available = await freePort();
  const healthyChild = fork(file, [], { env: { ...env, PORT: String(available), APP_RELEASE_ID: 'ready-test' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  try {
    const ready = await new Promise((resolve, reject) => {
      healthyChild.once('message', resolve);
      healthyChild.once('exit', code => reject(new Error(`Exited before ready: ${code}`)));
    });
    assert.equal(ready, 'ready');
    assert.equal((await fetch(`http://127.0.0.1:${available}/api/health`)).status, 200);
  } finally {
    healthyChild.kill('SIGTERM');
    await new Promise(resolve => healthyChild.once('exit', resolve));
  }
});

test('a degraded cluster aborts deployment instead of falling back to restart', async () => {
  const listing = JSON.parse((await run(pm2, ['jlist'])).stdout);
  await run(pm2, ['stop', String(listing[0].pm_id)]);
  const result = await deploy('v3');
  assert.notEqual(result.code, 0);
  assert.equal(path.basename(await fs.realpath(path.join(appRoot, 'current'))), 'v2');
  assert.equal((await health()).release, 'v2');
  await assert.rejects(fs.stat(path.join(appRoot, 'releases', 'v3', 'probe.log')), { code: 'ENOENT' });
});

test('PM2 preflight reports count, modes and state without disclosing environment secrets', () => {
  const processInfo = (id, mode = 'cluster_mode', status = 'online') => ({
    name: 'play-infinity-app', pm_id: id,
    pm2_env: { exec_mode: mode, status, PROXY_SECRET: 'fixture-secret-do-not-log', APP_RELEASE_ID: 'v1' },
  });
  const check = (apps, args = []) => spawnSync(process.execPath, [path.join(root, 'scripts', 'check-app-processes.cjs'), ...args], { input: JSON.stringify(apps), encoding: 'utf8' });
  assert.equal(check([processInfo(1), processInfo(2)]).status, 0);
  assert.equal(check([], ['', '--allow-absent']).status, 3);
  assert.equal(check([processInfo(1, 'fork_mode')], ['', '--allow-legacy-fork']).status, 4);
  assert.equal(check([processInfo(1, 'fork_mode', 'stopped')], ['', '--allow-legacy-fork']).status, 1);
  for (const apps of [[processInfo(1)], [processInfo(1, 'fork_mode'), processInfo(2)], [processInfo(1), processInfo(2, 'cluster_mode', 'stopped')]]) {
    const result = check(apps);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /PM2 da aplicação:/);
    assert.doesNotMatch(result.stderr, /fixture-secret|PROXY_SECRET/);
  }
  const mismatch = check([processInfo(1), processInfo(2)], ['v2']);
  assert.equal(mismatch.status, 1); assert.match(mismatch.stderr, /expectedRelease":false/);
  const malformed = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-app-processes.cjs')], { input: '{"PROXY_SECRET":"fixture-secret-do-not-log"', encoding: 'utf8' });
  assert.equal(malformed.status, 1); assert.doesNotMatch(malformed.stderr, /fixture-secret|PROXY_SECRET/);
});

test('legacy fork migration is explicit, preserves configuration/proxy, and recovers from failed activation', async () => {
  await run(pm2, ['delete', 'play-infinity-app']);
  await fs.unlink(path.join(appRoot, 'current'));
  await fs.writeFile(path.join(appRoot, 'dist', 'server.cjs'), fixture);
  const old = await run(pm2, ['start', path.join(appRoot, 'dist', 'server.cjs'), '--name', 'play-infinity-app', '--cwd', appRoot], {
    env: { ...env, PORT: String(port), APP_RELEASE_ID: 'legacy-fork', PROXY_SECRET: 'migration-fixture-secret', LEGACY_ONLY: 'fixture-only' },
  });
  assert.equal(old.code, 0, old.stderr);
  const sentinel = path.join(temporary, 'proxy-sentinel.cjs');
  await fs.writeFile(sentinel, 'setInterval(() => {}, 1000);');
  assert.equal((await run(pm2, ['start', sentinel, '--name', 'video-proxy'])).code, 0);
  const original = JSON.parse((await run(pm2, ['jlist'])).stdout);
  const oldPid = original.find(p => p.name === 'play-infinity-app').pid;
  const proxyPid = original.find(p => p.name === 'video-proxy').pid;
  const blocked = await deploy('fork-blocked');
  assert.notEqual(blocked.code, 0);
  assert.equal(JSON.parse((await run(pm2, ['jlist'])).stdout).find(p => p.name === 'play-infinity-app').pid, oldPid);
  const migrationEnv = { ...env, PLAY_INFINITY_MIGRATE_LEGACY_FORK: '1' };
  const invalid = await deploy('fork-invalid', true, { env: migrationEnv });
  assert.notEqual(invalid.code, 0);
  assert.equal(JSON.parse((await run(pm2, ['jlist'])).stdout).find(p => p.name === 'play-infinity-app').pid, oldPid);

  const failed = await deploy('fork-bad-health', false, { env: migrationEnv, failMainHealth: true });
  assert.notEqual(failed.code, 0, 'A failed new cluster must not report successful maintenance');
  assert.match(failed.stderr, /instância legada restaurada/);
  assert.equal((await health()).release, 'legacy-fork');
  await assert.rejects(fs.stat(path.join(appRoot, 'current')), { code: 'ENOENT' });

  const result = await deploy('fork-migrated', false, { env: migrationEnv });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /migration-fixture-secret|fixture-only/);
  const current = await health();
  assert.equal(current.release, 'fork-migrated');
  assert.equal(current.legacySecretPreserved, true);
  assert.equal(current.legacySettingPreserved, true);
  const listing = JSON.parse((await run(pm2, ['jlist'])).stdout);
  const apps = listing.filter(p => p.name === 'play-infinity-app');
  assert.equal(apps.length, 2);
  assert.ok(apps.every(p => p.pm2_env.exec_mode === 'cluster_mode' && p.pm2_env.status === 'online'));
  assert.equal(listing.find(p => p.name === 'video-proxy').pid, proxyPid);
});
