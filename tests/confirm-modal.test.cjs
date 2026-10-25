const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('ConfirmModal.tsx existe e possui estrutura Mobile-First', () => {
  const modalPath = path.join(__dirname, '../src/components/ConfirmModal.tsx');
  assert.ok(fs.existsSync(modalPath), 'ConfirmModal.tsx deve existir');

  const content = fs.readFileSync(modalPath, 'utf8');
  assert.ok(content.includes('role="dialog"'), 'Deve conter role dialog para acessibilidade');
  assert.ok(content.includes('backdrop-blur'), 'Deve conter backdrop-blur');
  assert.ok(content.includes('min-h-[44px]'), 'Deve possuir touch target mínimo de 44px');
  assert.ok(content.includes('Escape'), 'Deve escutar evento de tecla Escape');
});

test('Nenhum arquivo do Admin contém alert, confirm ou prompt nativos do navegador', () => {
  const adminDir = path.join(__dirname, '../src');
  const files = [];

  function scan(dir) {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        scan(full);
      } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
        if (f.toLowerCase().includes('admin')) {
          files.push(full);
        }
      }
    }
  }

  scan(adminDir);
  assert.ok(files.length >= 7, 'Deve encontrar os arquivos de admin');

  const pattern = /\b(window\.)?(confirm|alert|prompt)\s*\(/;

  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('*')) continue;
      assert.ok(
        !pattern.test(line),
        `Encontrado diálogo nativo em ${path.basename(file)}: linha ${i + 1}: ${line}`
      );
    }
  }
});

test('Tags de servidores no ServerBlocksAdmin informam formato HLS ou MP4 e possuem bordas estilizadas', () => {
  const file = path.join(__dirname, '../src/components/ServerBlocksAdmin.tsx');
  const content = fs.readFileSync(file, 'utf8');

  // Verifica que BYSE usa M3U8 e tem borda roxa
  assert.ok(content.includes('key: "srv_byse"'), 'Deve conter srv_byse');
  assert.ok(content.includes('badge: "HLS"'), 'Deve conter HLS');
  assert.ok(content.includes('border-purple-500/30'), 'Deve conter borda roxa para o BYSE');

  // Verifica que StreamTape e MixDrop usam MP4 direto
  assert.ok(content.includes('badge: "MP4"'), 'Deve conter MP4');
  assert.ok(content.includes('border-cyan-500/30'), 'Deve conter borda ciano para MP4');
});

test('Cards de métricas do AdminPage possuem números e skeletons alinhados ao centro do ícone (48px)', () => {
  const adminPage = path.join(__dirname, '../src/pages/AdminPage.tsx');
  const content = fs.readFileSync(adminPage, 'utf8');

  // Verifica que os 4 números possuem min-w-[48px] w-fit text-center whitespace-nowrap
  const metricNumberMatches = content.match(/min-w-\[48px\] w-fit text-center[^>]*whitespace-nowrap/g);
  assert.ok(metricNumberMatches && metricNumberMatches.length >= 4, 'Os 4 cards de métricas devem possuir min-w-[48px] w-fit text-center whitespace-nowrap');

  // Verifica que os 4 skeletons possuem min-w-[48px] w-12
  const skeletonMatches = content.match(/min-w-\[48px\] w-12/g);
  assert.ok(skeletonMatches && skeletonMatches.length >= 4, 'Os 4 skeletons de métricas devem possuir min-w-[48px] w-12');
});
