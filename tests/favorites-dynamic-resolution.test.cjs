const assert = require('assert');

// Simulação dos módulos para teste de favoritos dinâmicos
console.log('🧪 Iniciando testes de Resolução de Favoritos Dinâmicos...\n');

// 1. Mock do localStorage
const storage = {};
global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};

// 2. Estrutura de Metadados de Favorito Dinâmico
const DYNAMIC_FAVORITES_META_KEY = "playinfinity_dynamic_favorites_meta";

function getStoredDynamicMeta() {
  try {
    const raw = localStorage.getItem(DYNAMIC_FAVORITES_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDynamicMeta(item) {
  if (!item || !item.id) return;
  const current = getStoredDynamicMeta();
  current[Number(item.id)] = {
    id: Number(item.id),
    tmdbId: Number(item.tmdbId || item.id),
    title: item.title || "Sem título",
    posterUrl: item.posterUrl || item.imageUrl || "",
    backdropUrl: item.backdropUrl || item.posterUrl || "",
    imageUrl: item.imageUrl || item.posterUrl || "",
    type: item.type === 'series' ? 'series' : 'movie',
    year: item.year || new Date().getFullYear(),
    rating: item.rating || "8.0 ★",
    genres: item.genres || [],
    duration: item.type === 'series' ? "Série" : "Filme",
    match: item.match || 85,
    playerUrl: item.playerUrl || (item.type === 'series' 
      ? `https://v1.watchplay.shop/tvshow/${item.tmdbId || item.id}/1/1`
      : `https://v1.watchplay.shop/movie/${item.tmdbId || item.id}`),
    imdbId: item.imdbId
  };
  localStorage.setItem(DYNAMIC_FAVORITES_META_KEY, JSON.stringify(current));
}

// 3. Simulação de resolveFavoriteItems com resiliência
async function resolveFavoritesWithMetaFallback(ids, staticCatalog, tmdbFetcher) {
  const idsNum = Array.from(new Set(ids.map(Number).filter(n => Number.isFinite(n) && n > 0)));
  const metaCache = getStoredDynamicMeta();

  // Itens estáticos
  const staticItems = idsNum
    .map(id => staticCatalog.find(i => i.id === id || i.tmdbId === id))
    .filter(Boolean);

  const foundIds = new Set();
  staticItems.forEach(i => {
    foundIds.add(Number(i.id));
    if (i.tmdbId) foundIds.add(Number(i.tmdbId));
  });

  const missing = idsNum.filter(id => !foundIds.has(Number(id)));
  if (missing.length === 0) return staticItems;

  const dynamicItems = await Promise.all(
    missing.map(async (id) => {
      // 1. Tenta metadados locais primeiro (0ms)
      const cached = metaCache[id];
      if (cached) return cached;

      // 2. Se não tem em cache local, tenta buscar via TMDB
      try {
        const fetched = await tmdbFetcher(id);
        if (fetched && fetched.id === id) {
          saveDynamicMeta(fetched);
          return fetched;
        }
      } catch (err) {
        // Erro de rede ou timeout
      }

      // 3. Fallback seguro: nunca descartar o ID favoritado pelo usuário!
      const fallbackItem = {
        id,
        tmdbId: id,
        title: `Conteúdo #${id}`,
        posterUrl: "",
        imageUrl: "",
        type: 'series',
        year: 2024,
        rating: "8.0 ★",
        genres: [],
        playerUrl: `https://v1.watchplay.shop/tvshow/${id}/1/1`
      };
      return fallbackItem;
    })
  );

  return [...staticItems, ...dynamicItems.filter(Boolean)];
}

// Bateria de Testes
async function runTests() {
  const staticCatalog = [
    { id: 101, tmdbId: 101, title: "The Walking Dead", type: "series" },
    { id: 102, tmdbId: 102, title: "Invencível", type: "series" },
    { id: 201, tmdbId: 201, title: "Transformers: O Início", type: "movie" }
  ];

  // Teste 1: Salvar metadados de uma série dinâmica como "Você" (78191)
  console.log('Test 1: Salvar e recuperar metadados de série dinâmica (Você / 78191)...');
  const voceItem = {
    id: 78191,
    tmdbId: 78191,
    title: "VOCÊ",
    posterUrl: "https://image.tmdb.org/t/p/w500/voce.jpg",
    type: "series",
    year: 2018,
    rating: "8.1 ★"
  };
  saveDynamicMeta(voceItem);
  const stored = getStoredDynamicMeta();
  assert.strictEqual(stored[78191]?.title, "VOCÊ");
  assert.strictEqual(stored[78191]?.year, 2018);
  console.log('✓ Test 1 aprovado: Metadados locais salvos e recuperados com sucesso.\n');

  // Teste 2: Resolução instantânea via cache local mesmo se o fetcher falhar
  console.log('Test 2: Resolução com fallback em cache local de 0ms quando rede falhar...');
  const failingFetcher = async () => { throw new Error('Offline ou timeout de rede'); };
  const resolved = await resolveFavoritesWithMetaFallback([101, 78191], staticCatalog, failingFetcher);
  assert.strictEqual(resolved.length, 2);
  const resolvedVoce = resolved.find(i => i.id === 78191);
  assert.ok(resolvedVoce, 'Série Você deve estar presente nos favoritos');
  assert.strictEqual(resolvedVoce.title, "VOCÊ");
  console.log('✓ Test 2 aprovado: Série resolvida via cache local sem ser excluída da lista.\n');

  // Teste 3: Preservação garantida de ID quando cache local está frio e rede falha
  console.log('Test 3: Preservação garantida de item com fallback mínimo quando não há cache...');
  global.localStorage.clear(); // Limpa cache
  const resolvedCold = await resolveFavoritesWithMetaFallback([78191], staticCatalog, failingFetcher);
  assert.strictEqual(resolvedCold.length, 1, 'Item não deve ser excluído nem desaparecer da lista');
  assert.strictEqual(resolvedCold[0].id, 78191);
  console.log('✓ Test 3 aprovado: Favorito nunca é descartado silenciosamente.\n');

  // Teste 4: Busca remota bem sucedida salva automaticamente no cache local
  console.log('Test 4: Sucesso remoto persiste automaticamente no cache local...');
  global.localStorage.clear();
  const successfulFetcher = async (id) => ({
    id,
    tmdbId: id,
    title: "SÉRIE DO TMDB",
    posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
    type: "series",
    year: 2023
  });
  const resolvedRemote = await resolveFavoritesWithMetaFallback([99999], staticCatalog, successfulFetcher);
  assert.strictEqual(resolvedRemote.length, 1);
  assert.strictEqual(resolvedRemote[0].title, "SÉRIE DO TMDB");
  const storedAfter = getStoredDynamicMeta();
  assert.strictEqual(storedAfter[99999]?.title, "SÉRIE DO TMDB");
  console.log('✓ Test 4 aprovado: Fetch remoto salva no cache local para usos futuros.\n');

  console.log('🎉 TODOS OS TESTES DE FAVORITOS DINÂMICOS PASSARAM COM SUCESSO!');
}

runTests().catch(err => {
  console.error('❌ Falha nos testes:', err);
  process.exit(1);
});
