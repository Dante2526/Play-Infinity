const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const Module = require('node:module');

// Compila deviceSessionService usando esbuild para execução rápida e isolada em Node.js CJS
const servicePath = path.join(__dirname, '../src/services/deviceSessionService.ts');
const compiled = esbuild.buildSync({
  entryPoints: [servicePath],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  define: {
    'import.meta.env.VITE_PROXY_URL': '""'
  }
});

const m = new Module(__filename, module);
m._compile(compiled.outputFiles[0].text, __filename);
const {
  detectDeviceMetadata,
  resolveUserDevices,
  getOrCreateDeviceId
} = m.exports;

test('detectDeviceMetadata classifica corretamente diferentes plataformas', () => {
  // Smart TV Tizen
  const tizen = detectDeviceMetadata('Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36');
  assert.equal(tizen.type, 'tv');
  assert.equal(tizen.name, 'Samsung Smart TV');

  // Smart TV LG WebOS
  const lg = detectDeviceMetadata('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36');
  assert.equal(lg.type, 'tv');
  assert.equal(lg.name, 'LG Smart TV');

  // Desktop Windows Chrome
  const win = detectDeviceMetadata('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  assert.equal(win.type, 'desktop');
  assert.equal(win.name, 'Chrome (Windows)');

  // Desktop Mac Safari
  const mac = detectDeviceMetadata('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15');
  assert.equal(mac.type, 'desktop');
  assert.equal(mac.name, 'Safari (Mac)');

  // iPhone Mobile Web
  const iphone = detectDeviceMetadata('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
  assert.equal(iphone.type, 'mobile');
  assert.equal(iphone.name, 'iPhone (Safari / Web)');

  // Celular Android Chrome
  const android = detectDeviceMetadata('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36');
  assert.equal(android.type, 'mobile');
  assert.equal(android.name, 'Celular Android (Chrome)');
});

test('getOrCreateDeviceId gera e preserva id consistente', () => {
  const id1 = getOrCreateDeviceId();
  assert.ok(id1.startsWith('dev_'), 'deve começar com dev_');
  const id2 = getOrCreateDeviceId();
  assert.equal(id1, id2, 'deve reutilizar o mesmo id do storage');
});

test('resolveUserDevices conta dispositivos ativos e descarta inativos > 30 dias', () => {
  const now = Date.now();
  const mockDevices = {
    dev_1: {
      id: 'dev_1',
      name: 'App Android',
      type: 'mobile',
      lastActive: new Date(now - 1000 * 60 * 10).toISOString() // 10 min atrás
    },
    dev_2: {
      id: 'dev_2',
      name: 'Samsung Smart TV',
      type: 'tv',
      lastActive: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString() // 5 dias atrás
    },
    dev_3: {
      id: 'dev_3',
      name: 'Chrome Windows',
      type: 'desktop',
      lastActive: new Date(now - 1000 * 60 * 60 * 24 * 45).toISOString() // 45 dias atrás (expirado)
    }
  };

  const res = resolveUserDevices(mockDevices, 0, undefined, 30);
  assert.equal(res.count, 2, 'deve contabilizar apenas os 2 dispositivos recentes');
  assert.equal(res.activeDevices.length, 2);
  assert.equal(res.activeDevices[0].id, 'dev_1', 'mais recente deve vir primeiro');
  assert.equal(res.activeDevices[1].id, 'dev_2');
  assert.equal(res.isEstimated, false);
});

test('resolveUserDevices ativa fallback inteligente para contas antigas sem mapa devices', () => {
  // Caso 1: Sem devices, mas com 3 tokens FCM cadastrados
  const resFcm = resolveUserDevices(null, 3, undefined);
  assert.equal(resFcm.count, 3);
  assert.equal(resFcm.isEstimated, true);

  // Caso 2: Sem devices e sem FCM, mas com lastActive recente (2 dias atrás)
  const recentDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString();
  const resRecent = resolveUserDevices({}, 0, recentDate);
  assert.equal(resRecent.count, 1);
  assert.equal(resRecent.isEstimated, true);

  // Caso 3: Conta inativa há mais de 30 dias e sem dispositivos
  const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString();
  const resOld = resolveUserDevices({}, 0, oldDate);
  assert.equal(resOld.count, 0);
  assert.equal(resOld.isEstimated, false);
});
