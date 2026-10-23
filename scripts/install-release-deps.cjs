// Called under deploy-release.sh's flock. Published dependency sets are never
// changed in place: old and new workers may use the same compatible set.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

async function main() {
  const appRoot = fs.realpathSync(process.argv[2]);
  const release = fs.realpathSync(process.argv[3]);
  const manifest = fs.readFileSync(path.join(release, 'package.json'));
  const lock = fs.readFileSync(path.join(release, 'package-lock.json'));
  const pkg = JSON.parse(manifest);
  const parsedLock = JSON.parse(lock);
  const runtime = {
    schema: 1, node: process.versions.node, abi: process.versions.modules,
    platform: process.platform, arch: process.arch,
    libc: process.report.getReport().header.glibcVersionRuntime || 'unknown',
    npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
    flags: ['ci', '--omit=dev', '--no-audit', '--no-fund'],
  };
  const key = createHash('sha256').update(manifest).update(lock).update(JSON.stringify(runtime)).digest('hex');
  const cacheRoot = path.join(appRoot, 'dependency-sets');
  const entry = path.join(cacheRoot, key);
  const modules = path.join(release, 'node_modules');
  // Root install hooks and workspace/file links can depend on release paths or
  // generate files outside node_modules. Run them independently for each release.
  const cacheable = !['preinstall', 'install', 'postinstall', 'prepare'].some(k => pkg.scripts?.[k]) &&
    !Object.values(parsedLock.packages || {}).some(p => p.link || /^(file:|link:)/.test(p.resolved || ''));
  let valid = false;
  if (cacheable) {
    try { valid = fs.readFileSync(path.join(entry, 'complete'), 'utf8') === key && fs.statSync(path.join(entry, 'node_modules')).isDirectory(); }
    catch { /* An absent/incomplete entry is never trusted. */ }
  }
  if (valid) {
    fs.symlinkSync(path.join(entry, 'node_modules'), modules, 'dir');
    console.log(`Dependências compatíveis reutilizadas (${key.slice(0, 12)}; Node ${runtime.node}); npm ci dispensado.`);
    return;
  }
  const started = Date.now();
  console.log(`Instalando dependências isoladas (Node ${runtime.node}; cache ${cacheable ? 'ausente' : 'desabilitado por hooks/links'}).`);
  const heartbeat = setInterval(() => {
    console.log(`Dependências: npm ci ainda em execução (${Math.round((Date.now() - started) / 1000)}s).`);
  }, 20000);
  let code;
  try {
    code = await new Promise((resolve, reject) => {
      const child = spawn('npm', [...runtime.flags, '--foreground-scripts', '--timing'], {
        cwd: release, env: { ...process.env, NODE_ENV: 'production' }, stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (status, signal) => resolve(signal ? 1 : status));
    });
  } finally { clearInterval(heartbeat); }
  if (code !== 0) throw new Error('npm ci falhou; nenhum conjunto de dependências foi publicado.');
  console.log(`Instalação de dependências concluída em ${Math.round((Date.now() - started) / 1000)}s.`);
  if (!cacheable || fs.existsSync(entry)) return; // Never overwrite a set already on disk.
  fs.mkdirSync(cacheRoot, { recursive: true });
  const staging = fs.mkdtempSync(path.join(cacheRoot, '.preparing-'));
  // npm creates no node_modules for an empty manifest (also used by PM2 tests).
  fs.mkdirSync(modules, { recursive: true });
  fs.renameSync(modules, path.join(staging, 'node_modules'));
  fs.writeFileSync(path.join(staging, 'runtime.json'), JSON.stringify(runtime));
  fs.writeFileSync(path.join(staging, 'complete'), key);
  fs.renameSync(staging, entry); // Publish completion and modules together.
  fs.symlinkSync(path.join(entry, 'node_modules'), modules, 'dir');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
