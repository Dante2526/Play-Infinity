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
