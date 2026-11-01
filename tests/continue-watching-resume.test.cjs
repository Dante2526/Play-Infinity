const test = require('node:test');
const assert = require('node:assert/strict');

function stripSeriesEpisodeSuffix(title) {
  if (!title || typeof title !== "string") return "";
  return title
    .replace(/\s*-\s*(?:T\d+|S\d+|Temporada\s*\d+|Season\s*\d+|\d+ª\s*Temp(?:orada)?|Epis[óo]dio\s*\d+|Ep\.?\s*\d+).*$/i, "")
    .trim();
}

test('stripSeriesEpisodeSuffix deve remover rótulos de temporadas e episódios de títulos de séries', () => {
  assert.equal(stripSeriesEpisodeSuffix('Lupin - T4:E1 Capítulo 1'), 'Lupin');
  assert.equal(stripSeriesEpisodeSuffix('Lupin - T4:E3'), 'Lupin');
  assert.equal(stripSeriesEpisodeSuffix('Lupin - S04E01'), 'Lupin');
  assert.equal(stripSeriesEpisodeSuffix('Lupin - Temporada 4'), 'Lupin');
  assert.equal(stripSeriesEpisodeSuffix('Lupin - Season 4'), 'Lupin');
  assert.equal(stripSeriesEpisodeSuffix('Lupin - 4ª Temporada'), 'Lupin');
  assert.equal(stripSeriesEpisodeSuffix('Stranger Things - Episódio 1'), 'Stranger Things');
  assert.equal(stripSeriesEpisodeSuffix('Naruto Shippuden - Ep 500'), 'Naruto Shippuden');
  assert.equal(stripSeriesEpisodeSuffix('Breaking Bad'), 'Breaking Bad');
});

test('Simulação de availableSeasons no VideoPlayerModal com Lupin T4', () => {
  // Cenário: TMDB só conhece temporadas [1, 2, 3], mas usuário abriu T4
  const seriesDetails = {
    seasons: [
      { season_number: 1, episode_count: 5 },
      { season_number: 2, episode_count: 5 },
      { season_number: 3, episode_count: 7 },
    ]
  };

  const initialSeason = 4;
  const currentSeason = 4;
  let catalogSeasons = null; // Ainda carregando da API

  function computeAvailableSeasons(catSeasons) {
    const tmdbList = (seriesDetails?.seasons || [])
      .filter(s => s.season_number > 0 && s.episode_count > 0)
      .map(s => s.season_number);

    const requestedSeasons = [
      ...(initialSeason && initialSeason > 0 ? [initialSeason] : []),
      ...(currentSeason && currentSeason > 0 ? [currentSeason] : [])
    ];

    if (catSeasons && catSeasons.length > 0) {
      const combined = Array.from(new Set([...catSeasons, ...tmdbList, ...requestedSeasons])).sort((a, b) => a - b);
      return combined.length > 0 ? combined : [1];
    }

    const baseList = Array.from(new Set([...tmdbList, ...requestedSeasons])).sort((a, b) => a - b);
    return baseList.length > 0 ? baseList : [1];
  }

  // 1. Enquanto o catálogo ainda não respondeu (null)
  const availableWhileLoading = computeAvailableSeasons(catalogSeasons);
  assert.ok(availableWhileLoading.includes(4), 'T4 deve estar incluída em availableSeasons mesmo enquanto catalogSeasons for null');
  assert.deepEqual(availableWhileLoading, [1, 2, 3, 4]);

  // Simulação do guard no useEffect: não deve resetar para season 1 enquanto catalogSeasons for null
  let activeSeason = currentSeason;
  function runSeasonAdjustmentEffect(availSeasons, catSeasons) {
    if (catSeasons === null) return; // Guard implementado!
    if (availSeasons.length > 0 && !availSeasons.includes(activeSeason)) {
      activeSeason = availSeasons[0];
    }
  }

  runSeasonAdjustmentEffect(availableWhileLoading, catalogSeasons);
  assert.equal(activeSeason, 4, 'Temporada ativa não pode ser forçada para 1 durante o carregamento assíncrono');

  // 2. Quando o catálogo local responde com [1, 2, 3, 4]
  catalogSeasons = [1, 2, 3, 4];
  const availableAfterCatalog = computeAvailableSeasons(catalogSeasons);
  assert.deepEqual(availableAfterCatalog, [1, 2, 3, 4]);
  runSeasonAdjustmentEffect(availableAfterCatalog, catalogSeasons);
  assert.equal(activeSeason, 4, 'Temporada ativa deve permanecer 4 após confirmação do catálogo');
});

test('FormatHistoryItem na HomePage deve gerar título limpo e playerUrl correto com season e episode', () => {
  const item = {
    id: 96677,
    title: 'Lupin - T4:E1 Capítulo 1',
    mediaType: 'series',
    season: 4,
    episode: 3,
    currentTime: 1200,
    duration: 3000
  };

  const isSeriesItem = item.mediaType === 'series';
  const cleanTitle = isSeriesItem
    ? (stripSeriesEpisodeSuffix(item.title) || item.title)
    : item.title;

  const resolvedPlayerUrl = isSeriesItem && item.id && item.season && item.episode
    ? `https://v1.watchplay.shop/tvshow/${item.id}/${item.season}/${item.episode}`
    : item.playerUrl;

  assert.equal(cleanTitle, 'Lupin', 'O título no card deve ser puramente "Lupin"');
  assert.equal(resolvedPlayerUrl, 'https://v1.watchplay.shop/tvshow/96677/4/3', 'A URL de retorno deve conter temporada 4 e episódio 3');
});
