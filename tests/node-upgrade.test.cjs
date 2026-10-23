const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const fixtures = [];
const pm2 = process.env.PM2_BIN;
function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(command, args, { env, timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => stdout += d); p.stderr.on('data', d => stderr += d);
    p.on('error', reject); p.on('exit', code => resolve({ code, stdout, stderr }));
  });
}
async function port() {
  const server = net.createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const n = server.address().port;
  await new Promise(r => server.close(r)); return n;
}
async function fixture({ brokenProbe = false, badRestart = false } = {}) {
  assert.ok(pm2, 'Set PM2_BIN for isolated maintenance tests');
  assert.equal(process.versions.node.split('.')[0], '24', 'Run maintenance tests on Node 24');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'node-upgrade-'));
  const app = path.join(dir, 'app'), release = path.join(app, 'releases', 'live');
  const mock = path.join(dir, 'mock'), home = path.join(dir, 'pm2');
  const runtime = path.join(dir, 'runtimes'), systemd = path.join(dir, 'systemd');
  const listen = await port(), probe = await port();
  for (const p of [path.join(release, 'dist'), path.join(release, 'scripts'), mock, systemd]) await fs.mkdir(p, { recursive: true });
  await fs.symlink(release, path.join(app, 'current'));
  for (const name of ['probe-release.cjs', 'verify-release.cjs', 'check-app-processes.cjs']) await fs.copyFile(path.join(root, 'scripts', name), path.join(release, 'scripts', name));
  await fs.writeFile(path.join(release, 'dist/server.cjs'), `
    if (${brokenProbe} && process.env.APP_PROBE === '1') process.exit(1);
    const server=require('node:http').createServer((req,res)=>{
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({status:'ok',release:process.env.APP_RELEASE_ID,codeRelease:'live'}));
    });
    server.listen(Number(process.env.PORT),'127.0.0.1',()=>{if(process.send)process.send('ready')});
    process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
    process.on('SIGINT',()=>server.close(()=>process.exit(0)));
  `);
  const env = {
    ...process.env, PM2_HOME: home, PATH: `${mock}:${path.dirname(pm2)}:${process.env.PATH}`,
    PLAY_INFINITY_NODE_ROOT: runtime, PLAY_INFINITY_SYSTEMD_DIR: systemd,
    PLAY_INFINITY_PORT: String(listen), PLAY_INFINITY_PROBE_PORT: String(probe),
    PLAY_INFINITY_UPGRADE_NODE24: '1', TEST_NODE: process.execPath,
    TEST_PM2: await fs.realpath(pm2), TEST_DIR: dir, TEST_BAD_RESTART: badRestart ? '1' : '0',
    TEST_OLD_NODE: process.env.NODE_UPGRADE_TEST_OLD_NODE || process.execPath,
  };
  await fs.symlink(env.TEST_OLD_NODE, path.join(mock, 'node'));
  const config = path.join(dir, 'ecosystem.config.cjs');
  await fs.writeFile(config, `module.exports={apps:[{name:'play-infinity-app',script:${JSON.stringify(path.join(release, 'dist/server.cjs'))},cwd:${JSON.stringify(release)},instances:2,exec_mode:'cluster',wait_ready:true,kill_timeout:1000,env:{PORT:${listen},APP_RELEASE_ID:'live',PROXY_SECRET:'private-fixture-secret'}}]};`);
  // Real PM2 daemon/HTTP workers; simulate only systemd's service control API.
  await fs.writeFile(path.join(mock, 'systemctl'), `#!/usr/bin/env bash
set -e
case "$1" in
 is-active|daemon-reload) exit 0 ;;
 show) if [[ $4 == MainPID ]]; then cat "$PM2_HOME/pm2.pid"; else echo root; fi ;;
 stop) "$TEST_NODE" "$TEST_PM2" kill >/dev/null ;;
 start|restart)
  if [[ $1 == restart ]]; then "$TEST_NODE" "$TEST_PM2" kill >/dev/null; fi
  if [[ $TEST_BAD_RESTART == 1 && -f $PLAY_INFINITY_SYSTEMD_DIR/90-play-infinity-node.conf ]]; then exit 1; fi
  if [[ -f $PLAY_INFINITY_SYSTEMD_DIR/90-play-infinity-node.conf ]]; then
    runtime=$(awk -F= '/^ExecStart=.+/ {split($2,a," ");print a[1]}' "$PLAY_INFINITY_SYSTEMD_DIR/90-play-infinity-node.conf")
  else runtime="$TEST_OLD_NODE"; fi
  "$runtime" "$TEST_PM2" resurrect >/dev/null ;;
 *) exit 1 ;;
esac
`, { mode: 0o755 });
  fixtures.push({ dir, env });
  const start = await run(pm2, ['start', config], env);
  assert.equal(start.code, 0, start.stderr);
  const pid = (await fs.readFile(path.join(home, 'pm2.pid'), 'utf8')).trim();
  const source = path.join(dir, 'node-fixture');
  await fs.mkdir(path.join(source, 'bin'), { recursive: true });
  await fs.mkdir(path.join(source, 'lib/node_modules/npm/bin'), { recursive: true });
  await fs.symlink(process.execPath, path.join(source, 'bin/node'));
  await fs.writeFile(path.join(source, 'lib/node_modules/npm/bin/npm-cli.js'), 'console.log("fixture-npm")');
  const archive = path.join(dir, 'node.tar.xz');
  assert.equal((await run('tar', ['-cJf', archive, '-C', dir, 'node-fixture'], env)).code, 0);
  const checksum = createHash('sha256').update(await fs.readFile(archive)).digest('hex');
  return { dir, env, app, home, runtime, systemd, pid, checksum, archive, listen };
}
async function upgrade(f, extra = {}) {
  return run('bash', [path.join(root, 'scripts/upgrade-node24.sh'), f.archive, f.checksum, process.versions.node, f.app], { ...f.env, ...extra });
}
async function verifyHealthy(f) {
  const r = await fetch(`http://127.0.0.1:${f.listen}/api/health`, { signal: AbortSignal.timeout(3000) });
  assert.deepEqual(await r.json(), { status: 'ok', release: 'live', codeRelease: 'live' });
}
after(async () => {
  for (const f of fixtures) {
    await run(pm2, ['kill'], f.env);
    await fs.rm(f.dir, { recursive: true, force: true });
  }
});
test('explicit maintenance installs runtime, restarts daemon and persists selection without losing release', async () => {
  const f = await fixture();
  assert.equal(await fs.realpath(`/proc/${f.pid}/exe`), await fs.realpath(f.env.TEST_OLD_NODE));
  const result = await upgrade(f);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.notEqual((await fs.readFile(path.join(f.home, 'pm2.pid'), 'utf8')).trim(), f.pid);
  assert.equal(await fs.readlink(path.join(f.app, 'node-runtime')), path.join(f.runtime, `v${process.versions.node}`));
  assert.match(await fs.readFile(path.join(f.systemd, '90-play-infinity-node.conf'), 'utf8'), /ExecStart=.*node .*pm2 resurrect/);
  await verifyHealthy(f);
  const apps = JSON.parse((await run(pm2, ['jlist'], f.env)).stdout);
  assert.ok(apps.every(p => p.pm2_env.node_version === process.versions.node && p.pm2_env.PROXY_SECRET === 'private-fixture-secret'));
  assert.doesNotMatch(result.stdout + result.stderr, /private-fixture-secret/);
  const updatedPid = (await fs.readFile(path.join(f.home, 'pm2.pid'), 'utf8')).trim();
  const again = await upgrade(f);
  assert.equal(again.code, 0, again.stdout + again.stderr);
  assert.match(again.stdout, /nenhum reinício necessário/);
  assert.equal((await fs.readFile(path.join(f.home, 'pm2.pid'), 'utf8')).trim(), updatedPid);
});
test('failed candidate and missing consent preserve existing daemon', async () => {
  const f = await fixture({ brokenProbe: true });
  assert.notEqual((await upgrade(f, { PLAY_INFINITY_UPGRADE_NODE24: '0' })).code, 0);
  assert.notEqual((await upgrade({ ...f, checksum: '0'.repeat(64) })).code, 0);
  const r = await upgrade(f);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /daemon ativo preservado/);
  assert.equal((await fs.readFile(path.join(f.home, 'pm2.pid'), 'utf8')).trim(), f.pid);
  await verifyHealthy(f);
});
test('restart failure restores original service, dump and healthy application', async () => {
  const f = await fixture({ badRestart: true });
  const r = await upgrade(f);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /aplicação recuperados e verificados/);
  await assert.rejects(fs.stat(path.join(f.systemd, '90-play-infinity-node.conf')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(f.app, 'node-runtime')), { code: 'ENOENT' });
  await verifyHealthy(f);
});
test('daemon with another service refuses maintenance before touching it', async () => {
  const f = await fixture();
  const other = path.join(f.dir, 'other.cjs');
  await fs.writeFile(other, 'setInterval(()=>{},1000)');
  await run(pm2, ['start', other, '--name', 'video-proxy'], f.env);
  const r = await upgrade(f);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /somente as duas instâncias/);
  assert.equal((await fs.readFile(path.join(f.home, 'pm2.pid'), 'utf8')).trim(), f.pid);
  const apps = JSON.parse((await run(pm2, ['jlist'], f.env)).stdout);
  assert.equal(apps.find(p => p.name === 'video-proxy').pm2_env.status, 'online');
});
