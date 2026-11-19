/**
 * Regression tests for bugs discovered via Graphify knowledge graph traversal:
 *  1. probeEmbedPlayer router branch slicing guard on meuplayeronlinehd.com
 *  2. favorites.ts: kidsContent included in getAllCatalogItems, flags preserved,
 *     resolveFavoriteItems indexed by both id & tmdbId, and season_ended/series_ended
 *     preserved in getScheduleForFavorites
 *  3. ReleaseCalendarPage.tsx: followedSeries resolved from static + dynamic/TMDB favorites
 *     and handleSeriesClick passes full CatalogItem metadata
 *  4. UserProfilePage.tsx: thisWeekEpisodes uses dynamic todayStr..nextWeekStr instead of
 *     hardcoded 2026-09-08..2026-09-15
 *  5. notifications.ts & NotificationModal.tsx: skips synthetic season_ended summary entries
 *     and preserves tmdbId/imdbId across playback, watched toggle, and navigation
 *  6. GlobalCatalogPage.tsx & tmdb.ts: resets currentPage on type change and normalizes
 *     TV discover sort_by (primary_release_date.desc -> first_air_date.desc) and TV genre IDs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8');

test('embedPlayerProxy: probeEmbedPlayer só fatia por branch id === "..." quando !fellBack e HTML é roteador multi-canal', () => {
  const src = read('server/services/embedPlayerProxy.ts');
  assert.ok(
    src.includes('!fellBack &&') &&
    src.includes('/\\bid\\s*===?\\s*["\'][a-z0-9_-]+["\']/i.test(probeHtml)'),
    'probeEmbedPlayer valida !fellBack e presença de tabela roteadora antes de exigir match de chId'
  );
});

test('favorites.ts: getAllCatalogItems inclui kidsContent e preserva flags isAnime/isDorama/isLgbt/tmdbId', () => {
  const src = read('src/services/favorites.ts');
  assert.ok(src.includes('kidsContent') && src.includes('addItems(kidsContent)'), 'inclui kidsContent no catálogo unificado');
  assert.ok(
    src.includes('isAnime: Boolean(item.isAnime || prev?.isAnime)') &&
    src.includes('isDorama: Boolean(item.isDorama || prev?.isDorama)') &&
    src.includes('isLgbt: Boolean(item.isLgbt || prev?.isLgbt)'),
    'preserva flags de categoria ao mesclar listas com providerCatalogs'
  );
  assert.ok(
    src.includes("if (status !== 'season_ended' && status !== 'series_ended')"),
    'getScheduleForFavorites preserva status season_ended e series_ended do cache dinâmico'
  );
});

test('ReleaseCalendarPage.tsx: resolve followedSeries com getStaticFavoriteItems + resolveFavoriteItems + scheduledEpisodes', () => {
  const src = read('src/components/ReleaseCalendarPage.tsx');
  assert.ok(src.includes('getStaticFavoriteItems'), 'usa getStaticFavoriteItems para séries dinâmicas');
  assert.ok(src.includes('resolveFavoriteItems'), 'resolve séries favoritas fora do catálogo estático via TMDB');
  assert.ok(src.includes('handleSeriesClick(ep)'), 'passa CatalogItem completo ao clicar na série no calendário');
});

test('UserProfilePage.tsx: thisWeekEpisodes calcula janela dinâmica de 7 dias em vez de data fixa expirada', () => {
  const src = read('src/pages/UserProfilePage.tsx');
  assert.ok(!src.includes('2026-09-08'), 'removeu range hardcoded expirado 2026-09-08..2026-09-15');
  assert.ok(
    src.includes('e.airDate >= todayStr && e.airDate <= nextWeekStr'),
    'calcula lançamentos da semana dinamicamente com todayStr e nextWeekStr'
  );
});

test('notifications.ts & NotificationModal.tsx: ignora resumo sintético season_ended e preserva tmdbId', () => {
  const notifSrc = read('src/services/notifications.ts');
  const modalSrc = read('src/components/NotificationModal.tsx');
  assert.ok(
    notifSrc.includes("ep.status === 'series_ended' || ep.status === 'season_ended'"),
    'getFavoriteEpisodeNotifications não emite notificação falsa para resumo sintético season_ended'
  );
  assert.ok(
    notifSrc.includes('tmdbId: resolvedTmdbId') &&
    modalSrc.includes('notif.tmdbId || notif.seriesId'),
    'preserva e utiliza tmdbId real da série nas notificações'
  );
});

test('GlobalCatalogPage.tsx & tmdb.ts: reseta página ao trocar tipo e normaliza sort_by/genres de TV', () => {
  const pageSrc = read('src/pages/GlobalCatalogPage.tsx');
  const tmdbSrc = read('src/services/tmdb.ts');
  assert.ok(
    /useEffect\(\(\)\s*=>\s*\{\s*setCurrentPage\(1\);\s*\},\s*\[type\]\)/.test(pageSrc),
    'GlobalCatalogPage reseta currentPage para 1 ao alternar entre Filmes e Séries'
  );
  assert.ok(
    tmdbSrc.includes("sortBy === 'primary_release_date.desc' ? 'first_air_date.desc' : sortBy") &&
    tmdbSrc.includes('TV_GENRE_REMAP'),
    'discoverSeries traduz primary_release_date.desc para first_air_date.desc e remapeia gêneros exclusivos de filmes para TV'
  );
});

test('Capacitor PiP: PiPPlugin.java expõe setPlayingStatus e setVideoPlaying, e LivePlayerModal/VideoPlayerModal sincronizam status e StatusBar', () => {
  const pipJava = read('android/app/src/main/java/com/playinfinity/app/PiPPlugin.java');
  const liveSrc = read('src/components/LivePlayerModal.tsx');
  const vodSrc = read('src/components/VideoPlayerModal.tsx');
  assert.ok(
    pipJava.includes('public void setPlayingStatus(PluginCall call)') &&
    pipJava.includes('public void setVideoPlaying(PluginCall call)'),
    'PiPPlugin.java aceita tanto setPlayingStatus quanto setVideoPlaying'
  );
  assert.ok(
    liveSrc.includes('PiP.setPlayingStatus({ isPlaying: Boolean(isPlaying && !hasError) })') &&
    liveSrc.includes('PiP.setPlayingStatus({ isPlaying: false })') &&
    liveSrc.includes('StatusBar.hide()') &&
    liveSrc.includes('StatusBar.show()'),
    'LivePlayerModal sincroniza PiP.setPlayingStatus e StatusBar.hide/show no Android'
  );
  assert.ok(
    vodSrc.includes('PiP.setPlayingStatus({ isPlaying: false })'),
    'VideoPlayerModal reseta PiP.setPlayingStatus({ isPlaying: false }) ao fechar'
  );
});

test('Capacitor CastModal: handleNativeCast carrega mídia VOD (streamType buffered) além de canais ao vivo no Android nativo', () => {
  const castSrc = read('src/components/CastModal.tsx');
  assert.ok(
    castSrc.includes("streamType: 'live'") &&
    castSrc.includes("streamType: 'buffered'") &&
    castSrc.includes('const directUrl = await resolveCastStreamUrl();'),
    'CastModal.tsx chama anyCast.loadMedia tanto para isLive quanto para VOD (!isLive) no Capacitor'
  );
});

test('Capacitor Plugins & OfflineStorage: @capacitor/filesystem registrado em capacitor.plugins.json e gravação em chunks de 3MB sem dois-pontos no path', () => {
  const pluginsJson = read('android/app/src/main/assets/capacitor.plugins.json');
  const offlineSrc = read('src/services/offlineStorage.ts');
  const updateBannerSrc = read('src/components/AppUpdateBanner.tsx');
  assert.ok(
    pluginsJson.includes('"@capacitor/filesystem"') &&
    pluginsJson.includes('"com.capacitorjs.plugins.filesystem.FilesystemPlugin"'),
    'capacitor.plugins.json registra @capacitor/filesystem para o Android nativo'
  );
  assert.ok(
    offlineSrc.includes("const safeId = id.replace(/[^a-zA-Z0-9._-]/g, '_');") &&
    offlineSrc.includes('Filesystem.appendFile'),
    'offlineStorage sanitiza id e grava blobs grandes em chunks com Filesystem.appendFile'
  );
  assert.ok(
    updateBannerSrc.includes('if (Capacitor.isNativePlatform() && StatusBar.openExternalUrl)') &&
    updateBannerSrc.includes('e.preventDefault()') &&
    updateBannerSrc.includes('market://details?id=com.playinfinity.app') &&
    updateBannerSrc.includes('https://play.google.com/store/apps/details?id=com.playinfinity.app') &&
    !updateBannerSrc.includes('tinyurl.com') &&
    !updateBannerSrc.includes('is.gd') &&
    !updateBannerSrc.includes('/app.apk'),
    'AppUpdateBanner abre a Google Play Store via Intent nativo sem navegar o WebView e sem links de APK externo'
  );
  const serverSrc = read('server.ts');
  assert.ok(
    serverSrc.includes('playStoreUrl: PLAY_STORE_APP_URL') &&
    serverSrc.includes('return res.redirect(302, PLAY_STORE_APP_URL);') &&
    !serverSrc.includes('PlayInfinity.apk'),
    'server.ts aponta /api/app-version para Play Store e redireciona /app.apk legado para a Play Store'
  );
});

test('AndroidManifest: recursos de hardware implícitos (wifi, microphone, touchscreen) declarados como required="false" para Play Store', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  for (const feature of [
    'android.hardware.wifi',
    'android.hardware.microphone',
    'android.hardware.touchscreen',
  ]) {
    assert.ok(
      manifest.includes(`<uses-feature android:name="${feature}" android:required="false" />`),
      `AndroidManifest.xml deve declarar ${feature} como android:required="false"`
    );
  }
});

test('Play In-App Updates: detecção automática via com.google.android.play:app-update no StatusBarPlugin e AppUpdateBanner', () => {
  const gradle = read('android/app/build.gradle');
  const statusBarJava = read('android/app/src/main/java/com/playinfinity/app/StatusBarPlugin.java');
  const updateBannerSrc = read('src/components/AppUpdateBanner.tsx');

  assert.ok(
    gradle.includes('com.google.android.play:app-update:2.1.0'),
    'android/app/build.gradle deve incluir a biblioteca oficial com.google.android.play:app-update:2.1.0'
  );
  assert.ok(
    statusBarJava.includes('public void checkPlayStoreUpdate(PluginCall call)') &&
    statusBarJava.includes('public void startPlayStoreUpdate(PluginCall call)') &&
    statusBarJava.includes('AppUpdateManagerFactory.create') &&
    statusBarJava.includes('UpdateAvailability.UPDATE_AVAILABLE') &&
    statusBarJava.includes('availableVersionCode > installedVersionCode'),
    'StatusBarPlugin.java deve expor checkPlayStoreUpdate e startPlayStoreUpdate via AppUpdateManagerFactory'
  );
  assert.ok(
    updateBannerSrc.includes('StatusBar.checkPlayStoreUpdate') &&
    updateBannerSrc.includes('StatusBar.startPlayStoreUpdate') &&
    updateBannerSrc.includes('if (playInfo && playInfo.supported)'),
    'AppUpdateBanner.tsx deve consultar a Google Play Store automaticamente antes de recorrer ao fallback do servidor'
  );
});


