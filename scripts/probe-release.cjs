const { spawn } = require('node:child_process');

// Consume PM2 metadata through stdin, without writing credentials to files or
// exposing them as command-line arguments. Only reuse the signing key required
// to boot this health probe; application files load their other configuration.
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  let existing;
  try {
    existing = JSON.parse(input).find(app => app.name === 'play-infinity-app')?.pm2_env;
  } catch {
    console.error('Não foi possível ler a configuração PM2 da aplicação.');
    process.exit(1);
  }
  const env = { ...process.env };
  const signingKey = existing?.PROXY_SECRET || existing?.env?.PROXY_SECRET;
  if (!env.PROXY_SECRET && signingKey) env.PROXY_SECRET = signingKey;
  const child = spawn(process.execPath, ['dist/server.cjs'], {
    cwd: process.cwd(), env, stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('error', () => { console.error('Falha ao iniciar a prova de produção.'); process.exit(1); });
  child.on('exit', code => process.exit(code ?? 1));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  process.on('SIGINT', () => child.kill('SIGINT'));
});
