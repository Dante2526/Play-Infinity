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
  for (const app of apps) {
    await new Promise((resolve, reject) => {
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
      }, error => error ? reject(new Error('PM2 não confirmou o rolling reload da instância.')) : resolve());
    });
  }
  console.log('Rolling reload com arquivo e diretório da versão solicitada concluído.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pm2?.disconnect());
