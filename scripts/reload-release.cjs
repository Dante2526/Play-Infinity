// PM2's CLI reload updates environment variables but filters internal execution
// paths from ecosystem config. Explicitly replace those paths during rolling
// reload; otherwise the old bundle can report a new APP_RELEASE_ID.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = fs.realpathSync(process.argv[2]);
const release = fs.realpathSync(path.join(root, 'current'));
const script = path.join(release, 'dist/server.cjs');
let pm2;
const call = (method, ...args) => new Promise((resolve, reject) => {
  pm2[method](...args, (error, value) => error ? reject(new Error(`PM2 ${method} falhou`)) : resolve(value));
});
(async () => {
  const cli = fs.realpathSync(execFileSync('/bin/sh', ['-c', 'command -v pm2'], { encoding: 'utf8' }).trim());
  pm2 = require(path.resolve(path.dirname(cli), '..'));
  await call('connect');
  const config = require(path.join(root, 'ecosystem.config.cjs')).apps.find(app => app.name === 'play-infinity-app');
  if (!config || config.cwd !== release || config.script !== script || !fs.existsSync(script)) throw new Error('Configuração não aponta para a versão solicitada.');
  const apps = (await call('list')).filter(app => app.name === 'play-infinity-app');
  if (apps.length !== 2 || apps.some(app => app.pm2_env?.status !== 'online' || app.pm2_env?.exec_mode !== 'cluster_mode')) throw new Error('Rolling reload exige duas instâncias saudáveis em cluster.');
  const targetReleaseId = config.env.APP_RELEASE_ID;
  const isInstanceUpdated = (proc, previousPid) =>
    proc && proc.pid && proc.pid !== previousPid &&
    proc.pm2_env?.status === 'online' &&
    proc.pm2_env?.APP_RELEASE_ID === targetReleaseId &&
    proc.pm2_env?.pm_cwd === release &&
    proc.pm2_env?.pm_exec_path === script;

  const waitForNewWorkerOnline = async (pmId, previousPid, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const currentList = await call('list');
      const current = currentList.find(p => p.pm_id === pmId);
      if (isInstanceUpdated(current, previousPid)) return;
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`Timeout aguardando instância ${pmId} ficar online na versão solicitada.`);
  };

  for (const app of apps) {
    const previousPid = app.pid;
    const reloadPromise = new Promise((resolve, reject) => {
      const attemptReload = (retriesLeft) => {
        pm2.Client.executeRemote('reloadProcessId', {
          id: app.pm_id,
          env: {
            ...config.env,
            current_conf: {
              pm_cwd: release, pm_exec_path: script, cwd: release, script,
              wait_ready: true, listen_timeout: config.listen_timeout,
              kill_timeout: config.kill_timeout,
            },
          },
        }, error => {
          if (!error) return resolve();
          if (retriesLeft > 0 && /Reload already in progress/i.test(String(error.message || error))) {
            return setTimeout(() => attemptReload(retriesLeft - 1), 500);
          }
          reject(new Error('PM2 não confirmou o rolling reload da instância.'));
        });
      };
      attemptReload(60);
    });
    await Promise.race([
      reloadPromise,
      waitForNewWorkerOnline(app.pm_id, previousPid, (config.listen_timeout || 30000) + 10000),
    ]);
  }
  console.log('Rolling reload com arquivo e diretório da versão solicitada concluído.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pm2?.disconnect());
