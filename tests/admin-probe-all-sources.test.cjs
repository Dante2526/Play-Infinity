const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('backend: probeAllSourcesForExternalChannel está declarada e exportada', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server/services/externalCatalog.ts'), 'utf8');
  assert.match(
    code,
    /export\s+async\s+function\s+probeAllSourcesForExternalChannel\s*\(/,
    'probeAllSourcesForExternalChannel DEVE estar exportada em externalCatalog.ts'
  );
});

test('backend: rota /api/admin/external-channel-probe-all está registrada', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server/routes/externalRoutes.ts'), 'utf8');
  assert.match(
    code,
    /router\.post\(\s*['"]\/api\/admin\/external-channel-probe-all['"]/,
    'Rota /api/admin/external-channel-probe-all DEVE estar registrada em externalRoutes.ts'
  );
});

test('frontend: handleProbeAll no AdminLiveChannels sonda canais externos e atualiza fontes', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/components/AdminLiveChannels.tsx'), 'utf8');
  assert.match(
    code,
    /external-channel-probe-all/,
    'handleProbeAll DEVE invocar a sondagem de fontes externas'
  );
});
