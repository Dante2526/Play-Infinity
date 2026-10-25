const { test } = require('node:test');
const assert = require('node:assert/strict');

// Implementação pura de teste do algoritmo de merge
function mergeChannelsWithSettings(rawChannels, settings, includeBlocked = false) {
  const blockedSet = new Set(settings.blockedChannelIds || []);
  const customMap = settings.customServers || {};

  return rawChannels
    .filter(ch => includeBlocked || !blockedSet.has(ch.id))
    .map(ch => {
      const custom = customMap[ch.id];
      if (custom && custom.length > 0) {
        return {
          ...ch,
          servers: custom,
          isCustom: true
        };
      }
      return ch;
    });
}

// Funções de manipulação de ordem de servidores (espelhando a lógica do componente)
function moveServerUp(servers, idx) {
  if (idx <= 0 || idx >= servers.length) return servers;
  const copy = [...servers];
  const tmp = copy[idx];
  copy[idx] = copy[idx - 1];
  copy[idx - 1] = tmp;
  return copy;
}

function moveServerDown(servers, idx) {
  if (idx < 0 || idx >= servers.length - 1) return servers;
  const copy = [...servers];
  const tmp = copy[idx];
  copy[idx] = copy[idx + 1];
  copy[idx + 1] = tmp;
  return copy;
}

// Formatação do badge de probe (garante que probing não renderiza como erro)
function getProbePresentation(probe) {
  if (!probe) return null;
  if (probe.probing) {
    return { isProbing: true, label: 'Verificando sinal...', colorClass: 'text-orange-400' };
  }
  if (probe.online) {
    return { isProbing: false, label: '● 200 OK (Sinal Ativo)', colorClass: 'text-emerald-400' };
  }
  return { isProbing: false, label: `● Fora do Ar (${probe.status})`, colorClass: 'text-red-400' };
}

test('mergeChannelsWithSettings filtra canais bloqueados quando includeBlocked=false', () => {
  const raw = [
    { id: 'sportv-1', name: 'SporTV 1', servers: [{ name: 'S1', url: '/api/iptv/1' }] },
    { id: 'fox-sports', name: 'Fox Sports', servers: [{ name: 'S1', url: '/api/iptv/2' }] },
    { id: 'globo', name: 'Globo', servers: [{ name: 'S1', url: '/api/iptv/3' }] }
  ];

  const settings = {
    blockedChannelIds: ['fox-sports'],
    customServers: {}
  };

  const publicResult = mergeChannelsWithSettings(raw, settings, false);
  assert.equal(publicResult.length, 2);
  assert.equal(publicResult.some(c => c.id === 'fox-sports'), false);

  const adminResult = mergeChannelsWithSettings(raw, settings, true);
  assert.equal(adminResult.length, 3);
  assert.equal(adminResult.some(c => c.id === 'fox-sports'), true);
});

test('mergeChannelsWithSettings substitui servidores quando customServers estiver definido', () => {
  const raw = [
    { id: 'sportv-3', name: 'SporTV 3', servers: [{ name: 'Original', url: '/api/iptv/old' }] }
  ];

  const settings = {
    blockedChannelIds: [],
    customServers: {
      'sportv-3': [
        { name: 'Novo Servidor 1', url: '/api/iptv/296212' },
        { name: 'Novo Servidor 2', url: '/api/iptv/1224' }
      ]
    }
  };

  const result = mergeChannelsWithSettings(raw, settings, false);
  assert.equal(result[0].servers.length, 2);
  assert.equal(result[0].servers[0].url, '/api/iptv/296212');
  assert.equal(result[0].isCustom, true);
});

test('moveServerUp move servidor para cima corretamente e respeita limites', () => {
  const list = [
    { name: 'Srv 1', url: '/1' },
    { name: 'Srv 2', url: '/2' },
    { name: 'Srv 3', url: '/3' }
  ];

  // Mover Srv 2 para cima -> vira 1º
  const afterUp = moveServerUp(list, 1);
  assert.equal(afterUp[0].url, '/2');
  assert.equal(afterUp[1].url, '/1');
  assert.equal(afterUp[2].url, '/3');

  // Mover o 1º para cima -> não altera
  const edge = moveServerUp(list, 0);
  assert.deepEqual(edge, list);
});

test('moveServerDown move servidor para baixo corretamente e respeita limites', () => {
  const list = [
    { name: 'Srv 1', url: '/1' },
    { name: 'Srv 2', url: '/2' },
    { name: 'Srv 3', url: '/3' }
  ];

  // Mover Srv 1 para baixo -> vira 2º
  const afterDown = moveServerDown(list, 0);
  assert.equal(afterDown[0].url, '/2');
  assert.equal(afterDown[1].url, '/1');
  assert.equal(afterDown[2].url, '/3');

  // Mover Srv 2 para baixo -> vira 3º
  const afterDown2 = moveServerDown(afterDown, 1);
  assert.equal(afterDown2[2].url, '/1');

  // Mover o último para baixo -> não altera
  const edge = moveServerDown(list, 2);
  assert.deepEqual(edge, list);
});

test('getProbePresentation não emite falso Fora do Ar durante o teste (probing=true)', () => {
  const probingState = { online: false, status: '...', probing: true };
  const pres1 = getProbePresentation(probingState);
  assert.equal(pres1.isProbing, true);
  assert.equal(pres1.label, 'Verificando sinal...');
  assert.equal(pres1.colorClass, 'text-orange-400');

  const onlineState = { online: true, status: 200, probing: false };
  const pres2 = getProbePresentation(onlineState);
  assert.equal(pres2.isProbing, false);
  assert.equal(pres2.label, '● 200 OK (Sinal Ativo)');
  assert.equal(pres2.colorClass, 'text-emerald-400');

  const offlineState = { online: false, status: 404, probing: false };
  const pres3 = getProbePresentation(offlineState);
  assert.equal(pres3.isProbing, false);
  assert.equal(pres3.label, '● Fora do Ar (404)');
  assert.equal(pres3.colorClass, 'text-red-400');
});

test('agregação de múltiplos servidores do canal calcula onlineCount corretamente', () => {
  const channel = {
    id: 'premiere-1',
    name: 'Premiere 1 HD',
    servers: [
      { name: 'S1', url: '/api/iptv/1' },
      { name: 'S2', url: '/api/iptv/2' },
      { name: 'S3', url: '/api/iptv/3' }
    ]
  };

  const probeResults = {
    '/api/iptv/1': { online: true, status: 200, probing: false },
    '/api/iptv/2': { online: false, status: 404, probing: false },
    '/api/iptv/3': { online: true, status: 200, probing: false }
  };

  const probedServers = channel.servers.map(s => probeResults[s.url]).filter(Boolean);
  const onlineCount = probedServers.filter(p => p.online).length;

  assert.equal(probedServers.length, 3);
  assert.equal(onlineCount, 2);
});
