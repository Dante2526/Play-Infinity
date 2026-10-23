// One-time, explicitly requested maintenance. No temporary credential files;
// successful recovery/deployment uses PM2's normal protected dump persistence.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(process.argv[2] || '.');
const previousRelease = process.argv[3] || '';
let pm2, old, oldDeleted = false, newRelease;

const call = (method, ...args) => new Promise((resolve, reject) => {
  pm2[method](...args, (error, result) => error ? reject(new Error(`PM2 ${method} falhou`)) : resolve(result));
});
const appEnv = source => {
  const result = {};
  for (const sourceEnv of [source.env || {}, source]) {
    for (const [key, value] of Object.entries(sourceEnv)) {
      if (/^[A-Z_][A-Z0-9_]*$/.test(key) && ['string', 'number', 'boolean'].includes(typeof value)) result[key] = String(value);
    }
  }
  for (const key of ['NODE_APP_INSTANCE', 'NODE_UNIQUE_ID', 'APP_PROBE', 'APP_BIND_HOST']) delete result[key];
  // The maintenance opt-in belongs to this deploy, never to future app actions.
  result.PLAY_INFINITY_MIGRATE_LEGACY_FORK = '0';
  return result;
};
async function waitForRelease(release) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const apps = (await call('list')).filter(app => app.name === 'play-infinity-app');
    const healthy = apps.length === 2 && apps.every(app => app.pm2_env?.exec_mode === 'cluster_mode' &&
      app.pm2_env?.status === 'online' && app.pm2_env?.APP_RELEASE_ID === release);
    if (healthy) {
      try {
        const response = await fetch(`http://127.0.0.1:${process.env.PLAY_INFINITY_PORT || 3000}/api/health`, { signal: AbortSignal.timeout(1500) });
        const data = await response.json();
        if (response.ok && data.status === 'ok' && data.release === release) return;
      } catch { /* Keep the maintenance deadline bounded. */ }
    }
    if (apps.some(app => app.pm2_env?.status === 'errored')) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('O cluster novo não confirmou duas instâncias e healthcheck da versão.');
}
async function rollback() {
  const apps = (await call('list')).filter(app => app.name === 'play-infinity-app' && app.pm2_env?.APP_RELEASE_ID === newRelease);
  for (const app of apps) await call('delete', app.pm_id);
  const current = path.join(root, 'current');
  if (previousRelease) {
    const restore = path.join(root, '.restore-current');
    try { fs.unlinkSync(restore); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    fs.symlinkSync(previousRelease, restore); fs.renameSync(restore, current);
  } else { try { fs.unlinkSync(current); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  const backup = path.join(root, 'releases', newRelease, 'previous-ecosystem.config.cjs');
  if (fs.existsSync(backup)) fs.copyFileSync(backup, path.join(root, 'ecosystem.config.cjs'));
  const env = old.pm2_env;
  await call('start', {
    name: old.name, script: env.pm_exec_path, cwd: env.pm_cwd,
    args: env.args, node_args: env.node_args, interpreter: env.exec_interpreter,
    exec_mode: 'fork', instances: 1, env: appEnv(env),
    autorestart: env.autorestart !== false, wait_ready: !!env.wait_ready,
    listen_timeout: env.listen_timeout || 30000, kill_timeout: env.kill_timeout || 10000,
    ...(env.uid !== undefined ? { uid: env.uid } : {}),
    ...(env.gid !== undefined ? { gid: env.gid } : {}),
  });
  const restored = (await call('list')).filter(app => app.name === 'play-infinity-app');
  if (restored.length !== 1 || restored[0].pm2_env?.status !== 'online' || restored[0].pm2_env?.exec_mode !== 'fork_mode') throw new Error('A instância antiga não confirmou recuperação.');
  let healthy = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${process.env.PLAY_INFINITY_PORT || 3000}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok && (await response.json()).status === 'ok') { healthy = true; break; }
    } catch { /* The restored legacy app may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!healthy) throw new Error('Healthcheck da instância restaurada falhou.');
  await call('dump');
  console.error('Migração falhou; instância legada restaurada.');
}

(async () => {
  if (process.env.PLAY_INFINITY_MIGRATE_LEGACY_FORK !== '1') throw new Error('Migração requer opção explícita de manutenção.');
  const cli = fs.realpathSync(execFileSync('/bin/sh', ['-c', 'command -v pm2'], { encoding: 'utf8' }).trim());
  pm2 = require(path.resolve(path.dirname(cli), '..'));
  await call('connect');
  const apps = (await call('list')).filter(app => app.name === 'play-infinity-app');
  if (apps.length !== 1 || apps[0].pm2_env?.exec_mode !== 'fork_mode' || apps[0].pm2_env?.status !== 'online') throw new Error('Migração exige exatamente uma instância legada fork online.');
  old = apps[0];
  if (!fs.existsSync(old.pm2_env.pm_exec_path) || !fs.existsSync(old.pm2_env.pm_cwd)) throw new Error('Arquivos da aplicação legada indisponíveis para recuperação.');
  const config = require(path.join(root, 'ecosystem.config.cjs')).apps.find(app => app.name === 'play-infinity-app');
  newRelease = config.env.APP_RELEASE_ID;
  if (!fs.existsSync(config.script)) throw new Error('Bundle da versão nova não encontrado.');
  config.env = { ...appEnv(old.pm2_env), ...config.env };
  if (old.pm2_env.uid !== undefined) config.uid = old.pm2_env.uid;
  if (old.pm2_env.gid !== undefined) config.gid = old.pm2_env.gid;
  // Freeze the snapshot before deletion; the PM2 client may mutate objects.
  old = JSON.parse(JSON.stringify(old));
  console.log('Manutenção: substituindo somente a instância fork da aplicação por duas em cluster.');
  await call('delete', old.pm_id);
  oldDeleted = true;
  await call('start', config);
  await waitForRelease(newRelease);
  await call('dump');
  console.log(`Migração verificada: duas instâncias online da versão ${newRelease}.`);
})().catch(async error => {
  console.error(error.message);
  if (oldDeleted) {
    try { await rollback(); }
    catch { console.error('Recuperação automática falhou; intervenção na VPS necessária.'); }
  }
  process.exitCode = 1;
}).finally(() => { pm2?.disconnect(); });
