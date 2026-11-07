const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test.skip('externalCatalog: getPublicLiveChannels filtra canais bloqueados do MinhaTela (desativado: MinhaTela desvinculado a pedido do dono)', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server/services/externalCatalog.ts'), 'utf8');
  assert.match(
    code,
    /for\s*\(\s*const\s+mt\s+of\s+getMinhaTelaNewChannels\(representedMt\)\s*\)\s*\{[\s\S]*?BLOCKED_EXTERNAL_CHANNELS\.has\(normalized\)\s*\)\s*continue;/,
    'getMinhaTelaNewChannels DEVE checar BLOCKED_EXTERNAL_CHANNELS antes de adicionar canal'
  );
});

test('blockedLiveChannels: A Fazenda 18 Sinal 4 e Sinal 6 estão bloqueados', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server/services/blockedLiveChannels.ts'), 'utf8');
  assert.match(code, /'a fazenda 18 - sinal 4'/, 'Sinal 4 de A Fazenda deve estar bloqueado');
  assert.match(code, /'a fazenda 18 - sinal 6'/, 'Sinal 6 de A Fazenda deve estar bloqueado');
  assert.match(code, /'agromais'/, 'Agromais deve estar bloqueado');
  assert.match(code, /'c3-tv'/, 'C3-TV deve estar bloqueado');
});
