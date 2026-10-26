/**
 * [relatorio #10] Troca de conta no mesmo navegador não pode vazar dados
 * da conta anterior pra conta nova.
 *
 * Bug original: AuthModal (login) e UserProfilePage (logout) removiam a
 * chave MORTA "playinfinity_favorites" — a chave real de favoritos é
 * "playinfinity_user_favorites" (favorites.ts). fetchFavoritesFromCloud()
 * mescla localStorage + Firestore no login e sincroniza o resultado pra
 * nuvem da conta nova (syncFavoritesToCloud), contaminando-a
 * permanentemente com os favoritos da conta anterior.
 *
 * Chaves que NÃO estavam em nenhuma lista de limpeza (vazavam em TODA
 * troca de conta): playinfinity_favorite_timestamps (ordem dos favoritos)
 * e playinfinity_deleted_history (tombstones filtrando o histórico da
 * conta nova).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function makeLocalStorage(initial) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    key: i => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; }
  };
}

async function loadSafeStorage() {
  const output = await esbuild.build({
    stdin: { contents: "export {clearLocalUserData, safeLocalStorage} from './src/utils/safeStorage';", resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  const filename = path.join(root, 'tests/virtual-account-switch.cjs');
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

// Todas as chaves REAIS escritas pelos serviços (ver grep em src/services/*)
const ACCOUNT_KEYS = {
  playinfinity_logged_in: 'true',
  playinfinity_playback_history: '{"1":{}}',
  playinfinity_deleted_history: '{"1101412":1}',
  playinfinity_user_favorites: '[1,2,3]',
  playinfinity_favorite_timestamps: '{"1":1}',
  playinfinity_watched_episodes: '{"84958:1:1":true}',
  playinfinity_read_notifications: '["ep-1","ep-2"]',
  playinfinity_schedule_cache_v2: '[]',
  playinfinity_download_history: '[]',
  playinfinity_comments_512195: '[]',
};

test('clearLocalUserData remove todas as chaves reais de dados de conta (incl. timestamps e deleted_history)', async () => {
  const api = await loadSafeStorage();
  const ls = makeLocalStorage({ ...ACCOUNT_KEYS });
  global.window = { localStorage: ls };
  try {
    api.clearLocalUserData();
    for (const key of Object.keys(ACCOUNT_KEYS)) {
      assert.equal(ls.getItem(key), null, `${key} deveria ter sido removida`);
    }
  } finally {
    delete global.window;
  }
});

test('clearLocalUserData preserva chaves que NÃO sao de conta (prefill de e-mail, codigo de indicacao, configs de dispositivo)', async () => {
  const api = await loadSafeStorage();
  const keep = {
    playinfinity_last_email: 'a@b.c',        // prefill do AuthModal
    playinfinity_ref_code: 'XYZ123',         // indicacao capturada antes do signup
    playinfinity_fcm_token: 'tok',           // token de dispositivo (re-registrado no login)
    playinfinity_autoskip_intro: 'true',     // preferencia de dispositivo
    umacoisaquqlquer: 'nao-playinfinity',    // chave de terceiros no mesmo origin
  };
  const ls = makeLocalStorage({ ...ACCOUNT_KEYS, ...keep });
  global.window = { localStorage: ls };
  try {
    api.clearLocalUserData();
    for (const key of Object.keys(keep)) {
      assert.notEqual(ls.getItem(key), null, `${key} nao e dado de conta e deveria sobreviver`);
    }
  } finally {
    delete global.window;
  }
});

test('fallback Smart TV: clearLocalUserData limpa tambem o memoryStorage quando localStorage lanca', async () => {
  const api = await loadSafeStorage();
  // Sem window -> safeLocalStorage cai no memoryStorage interno do modulo
  global.window = undefined;
  try {
    api.safeLocalStorage.setItem('playinfinity_user_favorites', '[9]');
    api.clearLocalUserData();
    assert.equal(api.safeLocalStorage.getItem('playinfinity_user_favorites'), null,
      'memoryStorage deveria ter sido limpo tambem');
  } finally {
    delete global.window;
  }
});

test('guarda de fonte: login do AuthModal usa clearLocalUserData e nao remove chave morta', () => {
  const src = read('src/components/AuthModal.tsx');
  // Slice do branch de login: do if (isLogin) ate o signup (await desloca pro uso, nao pro import)
  const loginBlock = src.slice(src.indexOf('if (isLogin)'), src.indexOf('await createUserWithEmailAndPassword'));
  assert.ok(loginBlock.includes('clearLocalUserData()'), 'login deve chamar clearLocalUserData()');
  assert.ok(!loginBlock.includes('removeItem("playinfinity_favorites")'),
    'chave morta playinfinity_favorites proibida no cleanup do login');
});

test('guarda de fonte: logout do UserProfilePage usa clearLocalUserData antes do signOut', () => {
  const src = read('src/pages/UserProfilePage.tsx');
  const logoutBlock = src.slice(src.indexOf('const handleLogout'), src.indexOf('const handlePasswordSubmit'));
  assert.ok(logoutBlock.includes('clearLocalUserData()'), 'logout deve chamar clearLocalUserData()');
  assert.ok(!logoutBlock.includes('removeItem("playinfinity_favorites")'),
    'chave morta playinfinity_favorites proibida no cleanup do logout');
  assert.ok(logoutBlock.indexOf('clearLocalUserData()') < logoutBlock.indexOf('signOut(auth)'),
    'limpeza deve rodar ANTES do signOut (cobre signOut com falha)');
});

test('guarda de fonte: lista do clearLocalUserData contem as chaves reais dos servicos', () => {
  const src = read('src/utils/safeStorage.ts');
  const listBlock = src.slice(src.indexOf('keysToRemove = ['), src.indexOf('];', src.indexOf('keysToRemove = [')) + 2);
  for (const key of [
    'playinfinity_user_favorites',       // favoritos reais (favorites.ts)
    'playinfinity_favorite_timestamps',   // ordem dos favoritos (favorites.ts)
    'playinfinity_deleted_history',       // tombstones de historico (playbackHistory.ts)
    'playinfinity_read_notifications',    // notificacoes lidas (notifications.ts)
    'playinfinity_schedule_cache_v2',     // cache de agenda (notifications.ts)
    'playinfinity_download_history',      // historico de downloads (downloadService.ts)
    'playinfinity_watched_episodes',      // episodios assistidos (watchedEpisodes.ts)
    'playinfinity_playback_history',      // historico de reproducao (playbackHistory.ts)
  ]) {
    assert.ok(listBlock.includes(`"${key}"`), `keysToRemove deve incluir ${key}`);
  }
});

test('guarda de fonte: servicos continuam usando as chaves reais (nao regredir reader/writer)', () => {
  const fav = read('src/services/favorites.ts');
  assert.ok(fav.includes('FAVORITES_STORAGE_KEY = "playinfinity_user_favorites"'));
  assert.ok(fav.includes('FAVORITE_TIMESTAMPS_KEY = "playinfinity_favorite_timestamps"'));
  const notif = read('src/services/notifications.ts');
  assert.ok(notif.includes('READ_NOTIFICATIONS_STORAGE_KEY = "playinfinity_read_notifications"'));
  const hist = read('src/services/playbackHistory.ts');
  assert.ok(hist.includes('DELETED_STORAGE_KEY = "playinfinity_deleted_history"'));
});

test('guarda de fonte: nenhuma chave real de conta pode ser limpa com nome errado em nenhum lugar', () => {
  // A chave morta so pode aparecer dentro da propria lista do clearLocalUserData
  // (limpeza defensiva de legado). Fora dela, removeItem("playinfinity_favorites")
  // nao pode existir em component/page algum.
  const offenders = [];
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(p); continue; }
      if (!/\.(tsx?|cjs)$/.test(entry.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      if (src.includes('removeItem("playinfinity_favorites")')) offenders.push(path.relative(root, p));
    }
  };
  scan(path.join(root, 'src'));
  assert.deepEqual(offenders, [], 'nenhum componente pode remover a chave morta playinfinity_favorites diretamente');
});
