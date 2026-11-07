# Graph Report - Play-Infinity  (2026-11-06)

## Corpus Check
- 264 files · ~1,769,987 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2166 nodes · 4455 edges · 154 communities (128 shown, 26 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c63f8d22`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- encontreiLookup.ts
- firebaseAdmin.ts
- dependencies
- devDependencies
- VideoPlayerModal.tsx
- HomePage.tsx
- GlobalSearchPage.tsx
- downloadService.ts
- App.tsx
- LiveTvPage.tsx
- tmdb.ts
- adminApi.ts
- playbackHistory.ts
- mediaUtils.ts
- DetailsPage.tsx
- compilerOptions
- server.ts
- catalog.ts
- videoScrapers.ts
- helpers.ts
- firebase.ts
- GlobalErrorModal.tsx
- RokuDiscoveryPlugin
- encontreiCatalog.ts
- nixplayCatalog.ts
- PaywallModal.tsx
- manifest.json
- Walkthrough: AnotaÃ§Ãµes e Descontos no Admin
- react
- vidsrcRoutes.ts
- remote-package.json
- MainActivity
- DetailsPage.tsx
- vizer_movies_duplo_check.py
- vizer_tmdb_duplo_check.py
- subtitlesRoutes.ts
- vizer_bulk_scraper.py
- ExampleInstrumentedTest.java
- remote-proxy.mjs
- smoke-routes.mjs
- react
- superflix-proxy.js
- ExampleUnitTest.java
- gradlew
- patch_channels.js
- watchdog.sh
- WebhookPanelModal.tsx
- capacitor.config.ts
- check.js
- firebase-messaging-sw.js
- build_vizer_catalog.py
- test_isAvailable.js
- ensureVizerFreshContent
- PrivacyPolicyPage.tsx
- time-test.js
- build.gradle
- capacitor.build.gradle
- build.gradle
- capacitor.settings.gradle
- settings.gradle
- variables.gradle
- postcss.config.js
- test_dotenv.js
- tailwind.config.js
- test-local-endpoint.js
- vite.config.ts
- Diretrizes e Regras do Repositório (Play Infinity)
- 🚀 Infraestrutura Play Infinity: Migração para Oracle VPS & Configuração de DNS na Cloudflare
- App
- AdminPage.tsx
- Cloudflare Worker — Proxy Universal (Play-Infinity)
- ContentRow.tsx
- ContentRow.tsx
- SqliteEpisodeIndex
- 03/10/2026 (Noite) - Refinamento de Watchdog, Fallback e Cache
- playbackHealth.ts
- Design de Sistema: Notificações Push (Web e Android)
- Global Constraints
- Global Constraints
- Global Constraints
- Plano Plus (Download Paywall) Design Spec
- Registro de Ciência de Risco de Segurança
- task.md
- AppErrorBoundary
- serverBlocks.ts
- @capacitor/status-bar
- doodstreamRoutes.ts
- streamtapeRoutes.ts
- @caprockapps/capacitor-chromecast
- cheerio
- StatusBarPluginInterface
- express-rate-limit
- firebase
- firebase-admin
- playbackHealth.ts
- motion
- helmet
- react-dom
- mediaSourcePool.ts
- ADR-0003: Smoke tests de produção para integrações de streaming
- byseRoutes.ts
- pow.ts
- doodstreamRoutes.ts
- episodeAvailability.ts
- react
- CustomDatePicker.tsx
- tmdbProxy.ts
- getByseSources
- serverBlacklist.ts
- scrape_anidigital_catalog.py
- getApiBaseUrl
- Diretrizes e Regras do Repositório (Play Infinity)
- catalogWatcher.ts
- serverBlocks.ts
- saimoSqliteStore.ts
- externalRoutes.ts
- episodeAvailability.ts
- Documentação da Infraestrutura de Streaming (Oracle Cloud VPS)
- getAdminDb
- adminOps.ts
- encontreiSqliteStore.ts
- dunningWatcher.ts
- playbackStartup.ts
- ADR-0001: Saimo VOD — HLS com ABR como padrão, MP4 como Turbo/fallback
- ADR-0004: Provedor de anime AnimesDigital (HLS direto da CDN, sem proxy de segmento)
- ADR-NNNN: <título curto e imperativo>
- StatusBarPluginInterface
- ADR-0002: Hierarquia allowlist vs blacklist de domínios
- build
- main
- Masonry Channel Grid Implementation Plan
- build_anidigital_sqlite.py
- @caprockapps/capacitor-chromecast
- lru-cache
- playbackHistory.ts
- tmdb.ts
- firebase-modules.d.ts

## God Nodes (most connected - your core abstractions)
1. `Walkthrough: AnotaÃƒÂ§ÃƒÂµes e Descontos no Admin` - 107 edges
2. `VideoPlayerModal()` - 40 edges
3. `DetailsPage()` - 31 edges
4. `checkIsCam()` - 24 edges
5. `HomePage()` - 23 edges
6. `getAdminDb()` - 21 edges
7. `isPrivateOrLocalHost()` - 20 edges
8. `getFavoriteIds()` - 20 edges
9. `db` - 20 edges
10. `formatImageUrl()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `ContentRowInner()` --references--> `react`  [EXTRACTED]
  src/components/ContentRow.tsx → package.json
- `lazyWithRetry()` --references--> `react`  [EXTRACTED]
  src/components/LoadingStates.tsx → package.json
- `NavItem()` --references--> `react`  [EXTRACTED]
  src/components/NavItem.tsx → package.json
- `AdminPage()` --references--> `react`  [EXTRACTED]
  src/pages/AdminPage.tsx → package.json
- `DetailsPage()` --references--> `react`  [EXTRACTED]
  src/pages/DetailsPage.tsx → package.json

## Import Cycles
- None detected.

## Communities (154 total, 26 thin omitted)

### Community 0 - "encontreiLookup.ts"
Cohesion: 0.02
Nodes (118): 01/11/2026 — Correção de Espaço Excessivo (Vácuo Preto) nos Cards de Canais no Painel Admin, 01/11/2026 — Correção do Bloqueio de Sandbox nos Servidores Embed (MinhaTela.xyz), 01/11/2026 — Correção do Limite de 3 Servidores em Canais com Múltiplas Fontes Externas, 01/11/2026 — Correção do Áudio no Servidor 1 (Dolby AC-3) e Numeração Sequencial de Servidores, 01/11/2026 — Engenharia Reversa, Catálogo SQLite e Player Oficial Saimo TV VOD (Android 75/1.4.43), 01/11/2026 — Layout Masonry de 2 Colunas Independentes nos Cards de Canais no Painel Admin, 01/11/2026 — Otimização de Performance com React.memo e Remoção da Auto-Expansão Forçada, 01/11/2026 — Remoção da Mensagem Divisória de Servidores nos Cards de Canais (+110 more)

### Community 1 - "firebaseAdmin.ts"
Cohesion: 0.02
Nodes (105): 01/10/2026 - Monitoramento do RobÃƒÂ´ Ampere, 01/11/2026 — Embeds MinhaTela: pop-ups mortos e layout adaptado (proxy sanitizador), 01/11/2026 — Varredura de vida dos canais MinhaTela + fix do áudio Dolby AC-3 (Servidor 1 do Premiere), 02/11/2026 — Saimo VOD: HLS antes de MP4, dois botões (Play HD/Turbo) e escolha automática por rede, 03/10/2026 - CorreÃ¯Â¿Â½Ã¯Â¿Â½es de VideoPlayer e Monitoramento, 03/10/2026 - OtimizaÃ¯Â¿Â½Ã¯Â¿Â½o de Busca no CatÃ¯Â¿Â½logo, 06/10/2026 - Auto-correÃ§Ã£o de identidade de cards + memo de 404 (HxH/Nixplay encerrado), 07/10/2026 - CorreÃ§Ã£o O Dia do Chacal (MixDrop) & Asaas 401 & UI (+97 more)

### Community 2 - "dependencies"
Cohesion: 0.09
Nodes (51): AdminChannelCard, AdminChannelCardProps, AdminLiveChannels(), getChannelExternalSources(), getSmartSearchTerm(), StreamSearchResult, useIsDesktop(), ChannelLogo() (+43 more)

### Community 3 - "devDependencies"
Cohesion: 0.06
Nodes (53): applyCatalogPatches(), catalogueMediaSourceCache, catalogueMediaSourcePending, checkVipSeason(), checkVizerSeason(), _encFreshTmdbCache, _encInflight, _encKnownMovieIds (+45 more)

### Community 4 - "VideoPlayerModal.tsx"
Cohesion: 0.06
Nodes (51): UNAVAILABLE_SEASONS, HomePage(), allowed(), availability, confirmNewRelease(), lastAttempt, loadHomeReleases(), pending (+43 more)

### Community 5 - "HomePage.tsx"
Cohesion: 0.20
Nodes (21): App(), NotificationModal(), NotificationModalProps, ReleaseCalendarPage(), ReleaseCalendarPageProps, fetchDynamicScheduleForFavorites(), fetchFavoritesFromCloud(), getDayOfWeekFromDate() (+13 more)

### Community 6 - "GlobalSearchPage.tsx"
Cohesion: 0.08
Nodes (22): MainActivity, CapacitorPlugin, PluginCall, PluginMethod, OpenNotificationSettingsPlugin, CapacitorPlugin, PluginCall, PluginMethod (+14 more)

### Community 7 - "downloadService.ts"
Cohesion: 0.15
Nodes (19): resolveAnimesOnline(), resolveDirectAnimeStream(), resolveVixsrcStream(), router, speedtestLimiter, router, _tmdbProxyInflight, router (+11 more)

### Community 8 - "App.tsx"
Cohesion: 0.05
Nodes (63): getAdminDb(), getAdminFieldValue(), getAdminMessaging(), { getFirestore }, { getMessaging }, { initializeApp, cert, getApps }, getEncontreiResolverStatus(), getVizerCatalogStatus() (+55 more)

### Community 9 - "LiveTvPage.tsx"
Cohesion: 0.17
Nodes (20): attach(), BoxWriter(), buildFragment(), buildInitSegment(), buildMime(), candidateChildOffsets(), extractCodec(), firstSampleAtOrAfter() (+12 more)

### Community 10 - "tmdb.ts"
Cohesion: 0.15
Nodes (30): main(), basesFilePath(), buildFonteUrl(), channelsFilePath(), externalCatalogStats(), ExternalChannel, ExternalFonte, fetchAllowedFonte() (+22 more)

### Community 11 - "adminApi.ts"
Cohesion: 0.08
Nodes (6): findSaimoDb(), getSaimoCatalogStatus(), openSaimoSqlite(), SaimoSqliteStore, SqliteMovieIndex, SqliteSeriesSeasonsIndex

### Community 12 - "playbackHistory.ts"
Cohesion: 0.16
Nodes (17): AuthModal(), AuthModalProps, TurnstileProps, TurnstileWidget(), Window, captureAcquisitionSourceFromUrl(), captureReferralFromUrl(), clearStoredReferralCode() (+9 more)

### Community 13 - "mediaUtils.ts"
Cohesion: 0.12
Nodes (31): b64u(), b64uToBuf(), buildClientFingerprint(), BYSE_CACHE_TTL, BYSE_SHARED_CACHE_FILE, byseJsonFetch(), byseResolveCache, ByseResolved (+23 more)

### Community 14 - "DetailsPage.tsx"
Cohesion: 0.06
Nodes (31): autoprefixer, browserslist, @capacitor/android, @capacitor/assets, @capacitor/cli, esbuild, glob, lightningcss (+23 more)

### Community 15 - "compilerOptions"
Cohesion: 0.10
Nodes (35): ContinueWatchingItem, ContinueWatchingRow(), ContinueWatchingRowProps, animes, continueWatching, doramas, featured, featuredCarousel (+27 more)

### Community 16 - "server.ts"
Cohesion: 0.13
Nodes (30): BidirectionalProgressBar(), BidirectionalProgressBarProps, FloatingDownloadWidget(), FloatingDownloadWidgetProps, DownloadsPage(), ActiveDownload, clearDownloadHistory(), dismissActiveDownload() (+22 more)

### Community 17 - "catalog.ts"
Cohesion: 0.14
Nodes (23): extractSrcFromInput(), fetchBlockedServers(), isAnidigitalServerKey(), isSaimoServerKey(), isSkinSupportedServerKey(), isSuperflixUrl(), parseMediaFromUrl(), _serverBlocksCache (+15 more)

### Community 18 - "videoScrapers.ts"
Cohesion: 0.20
Nodes (21): ANIDIGITAL_CDN_HOST_PATTERNS, AnidigitalResolution, AnidigitalResolveOptions, AnidigitalSearchResult, extractM3u8FromEpisodeHtml(), extractSeriesLinkFromEpisodeHtml(), fetchEpisodeStreamUrl(), fetchWithTimeout() (+13 more)

### Community 19 - "helpers.ts"
Cohesion: 0.14
Nodes (26): browserInstructions(), BrowserKind, detectBrowser(), InstructionsContent(), NotificationPermissionGate(), BrowserPermission, decideNotifGate(), dismissedCooldownMs() (+18 more)

### Community 20 - "firebase.ts"
Cohesion: 0.07
Nodes (27): @capacitor-firebase/messaging, @capacitor/screen-orientation, @capacitor/splash-screen, cheerio, express-rate-limit, firebase, firebase-admin, hls.js (+19 more)

### Community 21 - "GlobalErrorModal.tsx"
Cohesion: 0.09
Nodes (23): AdminPage, DetailsPage, DownloadsPage, FavoritesPage, GlobalCatalogPage, GlobalSearchPage, HomePage, LivePlayerModal (+15 more)

### Community 22 - "RokuDiscoveryPlugin"
Cohesion: 0.16
Nodes (24): buildDeniedHtml(), buildEmbedFallbackHtml(), cacheGet(), cacheSet(), DEAD_OR_BROKEN_EMBED_HOSTS, discoveredHosts, EmbedProbeResult, extractRedirectUrl() (+16 more)

### Community 23 - "encontreiCatalog.ts"
Cohesion: 0.12
Nodes (23): BLOCKED_EXTERNAL_CHANNELS, getPublicLiveChannels(), bestQuality(), EmbedServer, ensureFresh(), findMinhaTelaChannel(), getMinhaTelaEmbedHosts(), getMinhaTelaNewChannels() (+15 more)

### Community 24 - "nixplayCatalog.ts"
Cohesion: 0.09
Nodes (37): react, react, ContentCard, ContentCardInner(), ContentRow, ContentRowInner(), handlePosterError(), FilterChip() (+29 more)

### Community 25 - "PaywallModal.tsx"
Cohesion: 0.19
Nodes (18): reportAppError(), PaywallModal(), PaywallModalProps, startTrial(), useSubscription(), isAiStudioOrDevEnvironment(), getFriendlyErrorMessage(), ADMIN_EMAILS (+10 more)

### Community 26 - "manifest.json"
Cohesion: 0.11
Nodes (21): EP, iframeParams, qs, SERVERS, formatTime(), NetflixPlayerSkin(), NetflixPlayerSkinProps, NetflixPlayerStatus (+13 more)

### Community 27 - "Walkthrough: AnotaÃ§Ãµes e Descontos no Admin"
Cohesion: 0.17
Nodes (14): adminOpsRouter, executeSshCommand(), executeSystemOrSshCommand(), FetchResponse, getSshPrivateKey(), ORACLE_VPS_PORT, readBodyWithSpeed(), AnidigitalSqliteStore (+6 more)

### Community 28 - "react"
Cohesion: 0.12
Nodes (17): getStreamtapeSources(), directUrlToFileId, resolveStreamTapeDetails(), resolveStreamTapeToken(), selectIdentitySource(), sourcePool, streamtapeRouter, tokenResolver (+9 more)

### Community 29 - "vidsrcRoutes.ts"
Cohesion: 0.09
Nodes (21): dist, DOM, DOM.Iterable, ES2022, node_modules, scratch, compilerOptions, allowJs (+13 more)

### Community 30 - "remote-package.json"
Cohesion: 0.16
Nodes (14): customStreams, episodesAvailabilityCache, router, StreamItem, webhookLimiter, executeAtomicSaveMostWatched(), getMostWatchedFilePath(), INITIAL_MOST_WATCHED (+6 more)

### Community 31 - "MainActivity"
Cohesion: 0.22
Nodes (23): fetchHistoryFromCloud(), fetchSeriesFinale(), flushPendingHistorySync(), getDeletedStore(), getItemPlayback(), getPlaybackHistory(), getStore(), GHOST_HISTORY_IDS (+15 more)

### Community 32 - "DetailsPage.tsx"
Cohesion: 0.19
Nodes (18): CastMediaDetails, CastModal(), CastModalProps, RokuDiscovery, buildMixdropStreamUrl(), _cache, EncontreiEpisode, EncontreiMovie (+10 more)

### Community 33 - "vizer_movies_duplo_check.py"
Cohesion: 0.14
Nodes (18): ADULT_ANIMATION_BLOCKLIST, availableTmdbIds, checkLiveAvailability(), checkTimestamps, cleanupExpiredLiveChecks(), getGenreName(), isKidsSafe(), liveCheckedAvailable (+10 more)

### Community 34 - "vizer_tmdb_duplo_check.py"
Cohesion: 0.11
Nodes (18): 📌 1. Por que migramos para a VPS da Oracle Cloud?, 🖥️ 2. Dados do Servidor VPS (Oracle Cloud Infrastructure), ⚙️ 3. Tudo o que foi Feito e Otimizado no Sistema, 🌐 4. Como Configurar o DNS na Cloudflare (Passo a Passo), 🔍 5. Como Testar e Validar a Conexão, 🤖 6. Deploy 100% Automático via GitHub Actions (CI/CD), A. Proxy de Streaming HLS em Tempo Real (`proxy.mjs`), B. Otimização Avançada do Nginx (`/etc/nginx/sites-available/play-infinity`) (+10 more)

### Community 35 - "subtitlesRoutes.ts"
Cohesion: 0.18
Nodes (16): applyViewerCors(), isAllowedViewerOrigin(), router, CHANNEL_ID_ALIAS_MAP, fetchAndRefreshCatalog(), forceTokenRefresh(), getCacheFilePath(), getSaimoLiveSource() (+8 more)

### Community 36 - "vizer_bulk_scraper.py"
Cohesion: 0.16
Nodes (14): mixdropMemoryCache, mixdropPool, mixdropResolutions, refreshMixdropUrl(), resolveFreshMixdropToken(), resolveMixdropToken(), router, tokenRefreshes (+6 more)

### Community 37 - "ExampleInstrumentedTest.java"
Cohesion: 0.22
Nodes (12): getFreshXtreamToken(), probeLiveStreamUrl(), ProbeResult, router, dnsResolutionCache, isPrivateOrLocalHost(), isPrivateOrLocalIp(), isPrivateOrLocalIpAddress() (+4 more)

### Community 38 - "remote-proxy.mjs"
Cohesion: 0.24
Nodes (9): BugFeedbackListener(), ResolvedBug, ReportBugModal(), ReportBugModalProps, auth, db, firebaseConfig, storage (+1 more)

### Community 39 - "smoke-routes.mjs"
Cohesion: 0.22
Nodes (11): VirtualRemote(), GEEK_AVATARS, handlePosterError(), LiveTvPage, NotificationModal, ReleaseCalendarPage, UserProfilePage(), WebhookPanelModal (+3 more)

### Community 40 - "react"
Cohesion: 0.15
Nodes (6): tryLoadVizerSqlite(), findVizerDb(), isSqliteAvailable(), LruCache, openVizerSqlite(), VizerSqliteStore

### Community 41 - "superflix-proxy.js"
Cohesion: 0.20
Nodes (14): assertServerAllowed(), BlacklistedServerEntry, escapeRegExpLiteral(), extractHostnameFromTarget(), filterAllowedServers(), isServerBlacklisted(), matchesOnWordBoundary(), SERVER_BLACKLIST (+6 more)

### Community 42 - "ExampleUnitTest.java"
Cohesion: 0.20
Nodes (16): anidigitalRouter, SIM_DIR, ADR-0004, handleSaimoHlsSegment(), handleSaimoProxyIframe(), handleSaimoStream(), isHlsSourceUrl(), isSaimoUrlAllowed() (+8 more)

### Community 43 - "gradlew"
Cohesion: 0.13
Nodes (20): SpeechRecognitionErrorEvent, SpeechRecognitionEvent, SpeechRecognitionInstance, useVoiceSearch(), UseVoiceSearchOptions, Window, GlobalSearchPage(), handlePosterError() (+12 more)

### Community 44 - "patch_channels.js"
Cohesion: 0.28
Nodes (8): ActiveRunDetails, AdminDeployMonitor(), getWorkflowBadge(), GitHubRun, GitHubRunsResponse, parseCommitMessage(), RunStep, VpsTelemetryData

### Community 45 - "watchdog.sh"
Cohesion: 0.15
Nodes (9): AppErrorBoundary, AppErrorInfo, ErrorBoundaryProps, ErrorBoundaryState, GlobalErrorModal(), GlobalErrorModalProps, isIgnorableError(), Window (+1 more)

### Community 46 - "WebhookPanelModal.tsx"
Cohesion: 0.31
Nodes (8): AdminMascotWidget(), AdminMascotWidgetProps, BytePosition, clampToViewport(), persistPosition(), readSavedPosition(), SentinelAlertItem, SentinelStatusData

### Community 47 - "capacitor.config.ts"
Cohesion: 0.27
Nodes (14): clearExternalCatalogCache(), externalCatalogDir(), assertSaimoHost(), atomicWrite(), basesFilePath(), channelsFilePath(), fetchSaimoText(), filterBasesText() (+6 more)

### Community 48 - "check.js"
Cohesion: 0.13
Nodes (14): "Cloudflare bloqueou mesmo dentro da rede CF", Cloudflare Worker — Proxy Universal (Play-Infinity), Como o backend usa, Configurar no Render, Custos e limites, Deploy (5 min, grátis, sem cartão), "Erro ao fetchar URL", "Hostname não permitido pelo whitelist" (+6 more)

### Community 49 - "firebase-messaging-sw.js"
Cohesion: 0.29
Nodes (13): extract_m3u8(), fetch_wp_page(), http_get(), main(), parse_title(), phase_a(), phase_b(), phase_c() (+5 more)

### Community 50 - "build_vizer_catalog.py"
Cohesion: 0.21
Nodes (11): check, discovery, providers, router, createByseTickets(), getByseTickets(), createPlaybackHealthCache(), PlaybackHealthResult (+3 more)

### Community 51 - "test_isAvailable.js"
Cohesion: 0.15
Nodes (24): DetailsPage(), handlePosterError(), LiveTvPage, NotificationModal, ReleaseCalendarPage, WebhookPanelModal, cancelBysePrewarm(), addComment() (+16 more)

### Community 52 - "ensureVizerFreshContent"
Cohesion: 0.27
Nodes (11): ensureVizerFreshContent(), ensureVizerFreshListing(), loadVizerMovieIds(), resolveVizerMovie(), vizerFetchHtml(), vizerFetchJson(), vizerKnownSetsLoad(), checkVizerHealth() (+3 more)

### Community 53 - "PrivacyPolicyPage.tsx"
Cohesion: 0.15
Nodes (13): 10. Protocolo de Sincronização Entre Sessões/Agentes Paralelos, 11. Operação: Smoke Test de Produção e ADRs, 12. Memória e Estado das Tarefas (Evitando Amnésia), 1. Política Estrita de Servidores de Vídeo (VOD: Filmes, Séries e Animes), 2. Estabilidade do Localhost e Observador de Arquivos (Vite), 3. Conformidade e Verificação Obrigatória, 4. Infraestrutura Geral e Hosting (VPS Oracle Cloud), 5. Arquitetura de Streaming de VOD (Filmes, Séries e Animes) (+5 more)

### Community 54 - "time-test.js"
Cohesion: 0.15
Nodes (12): background_color, categories, description, display, icons, name, orientation, short_name (+4 more)

### Community 55 - "build.gradle"
Cohesion: 0.22
Nodes (11): CACHE_DIR, countVttCues(), CREDIT_PATTERNS, srtToVtt(), stripCreditCues(), subtitlesRouter, tryFetchSubtitleFromResult(), SubtitleMediaType (+3 more)

### Community 56 - "capacitor.build.gradle"
Cohesion: 0.10
Nodes (25): AdminHealthMonitor(), CATEGORY_META, EncontreiStatus, formatSpeed(), HealthResult, AdminPushNotifications(), NotifStats, NotifUserRow (+17 more)

### Community 57 - "build.gradle"
Cohesion: 0.15
Nodes (13): 1. Visão Geral e Diferença Estrutural (VOD vs. Live TV), 3. Tratamento de Congelamento e Watchdogs em Dois Níveis, 5.1. Timeouts Segmentados, 5.2. Prevenção de Sockets Pendurados, 5. Otimização do Endpoint `/api/anime/hls-proxy`, 6. Checklist de Conformidade Técnica, Arquitetura e Funcionamento do Sistema de VOD (Filmes, Séries e Animes), BYSE integrado ao player próprio (+5 more)

### Community 58 - "capacitor.settings.gradle"
Cohesion: 0.26
Nodes (9): BLACKLISTED_HOSTS, checkMagicBytes(), fetchBufferWithTimeout(), fetchTextWithTimeout(), main(), parseExternalBases(), parseExternalChannels(), probeFonteStability() (+1 more)

### Community 59 - "settings.gradle"
Cohesion: 0.08
Nodes (23): apiLimiter, app, appHelmet, bugUploadLimiter, commonHelmet, globalLimiter, liveStreamLimiter, getFirebaseAuth() (+15 more)

### Community 60 - "variables.gradle"
Cohesion: 0.18
Nodes (10): _blocks, BLOCKS_DIR, BLOCKS_FILE, _blocksByTmdb, ensureLoaded(), isAdminToken(), loadBlocks(), router (+2 more)

### Community 61 - "postcss.config.js"
Cohesion: 0.20
Nodes (10): allowedHostsSet, checkVidsrcSeason(), CORS, getOriginToken(), getRewrittenM3u8(), rewriteM3u8(), router, streamCache (+2 more)

### Community 62 - "test_dotenv.js"
Cohesion: 0.19
Nodes (15): isAllowedNixplayProxyHost(), NIXPLAY_PROXY_ALLOWED_HOSTS, nixplayEpisodeCache, router, CACHE_PATH, isNixplayAvailable(), loadDiskCache(), loadNixplayCatalog() (+7 more)

### Community 63 - "tailwind.config.js"
Cohesion: 0.20
Nodes (11): AvailableEpisodesResponse, checkPlayableBatch(), clientAvailabilityCache, clientPlayableCache, clientSeasonsCache, EpisodeAvailabilityInfo, fullRange(), getAvailableEpisodes() (+3 more)

### Community 64 - "test-local-endpoint.js"
Cohesion: 0.22
Nodes (10): SLIDES, WhatsNewModal(), buildDeviceSessionPayload(), detectDeviceMetadata(), DeviceType, getOrCreateDeviceId(), registerDeviceSession(), memoryStorage (+2 more)

### Community 65 - "vite.config.ts"
Cohesion: 0.18
Nodes (11): scripts, build, build:sqlite, check:catalog, clean, dev, extract:ids, lint (+3 more)

### Community 66 - "Diretrizes e Regras do Repositório (Play Infinity)"
Cohesion: 0.38
Nodes (8): createByseRouter(), allowedByseMediaUrl(), buildByseWrapperHtml(), BYSE_USER_AGENT, rewriteM3u8(), createByseSourcePool(), buildSilentPlayerErrorPage(), PlayerErrorExhaustedKey

### Community 67 - "🚀 Infraestrutura Play Infinity: Migração para Oracle VPS & Configuração de DNS na Cloudflare"
Cohesion: 0.20
Nodes (7): 1. Dados do Servidor VPS (Oracle Cloud), 2. Como Funciona o Proxy Remoto (`proxy.mjs` + Nginx), 3. Conexão com o Frontend da Aplicação, 4. Configuração Otimizada do Nginx na VPS (`/etc/nginx/sites-available/play-infinity`), 5. Automação de Estabilidade (Watchdog), 6. Causa Raiz do Erro 502 / `EADDRINUSE :8080` (03/10/2026), Documentação da Infraestrutura de Streaming (Oracle Cloud VPS)

### Community 68 - "App"
Cohesion: 0.27
Nodes (8): RFC-7231, applyViewerCors(), isAllowedViewerOrigin(), recordExternalSelection(), ExternalChannelNameValidation, ExternalFormatValidation, validateExternalChannelName(), validateExternalFormatParam()

### Community 69 - "AdminPage.tsx"
Cohesion: 0.24
Nodes (8): RFC-9110, DOODSTREAM_HOST_SUFFIXES, DoodstreamCacheEntry, doodstreamMemoryCache, doodstreamRouter, findDoodstreamInCatalog(), getLocalCatalog(), isAllowedDoodstreamHost()

### Community 70 - "Cloudflare Worker — Proxy Universal (Play-Infinity)"
Cohesion: 0.20
Nodes (9): dependencies, express, helmet, express, helmet, main, name, type (+1 more)

### Community 71 - "ContentRow.tsx"
Cohesion: 0.27
Nodes (5): tryLoadEncontreiSqlite(), EncontreiSqliteStore, findEncontreiDb(), isEncontreiSqliteAvailable(), openEncontreiSqlite()

### Community 72 - "ContentRow.tsx"
Cohesion: 0.22
Nodes (8): Atualizar o Node da aplicação para 24 LTS, Dependências e identificação do código executado, Deploy da aplicação na VPS Oracle, Falha de pré-verificação PM2, Limites e operação, Migração única de uma instância fork, Requisitos e ativação, Validação local

### Community 74 - "03/10/2026 (Noite) - Refinamento de Watchdog, Fallback e Cache"
Cohesion: 0.18
Nodes (11): AdminBugReports(), BugReport, PREDEFINED_RESPONSES, ConfirmModal(), ConfirmModalProps, HOMOLOGATED_SERVERS, SelectedMedia, SERVER_LABELS (+3 more)

### Community 76 - "playbackHealth.ts"
Cohesion: 0.25
Nodes (7): 1. Visão Geral, 2. Passo a Passo Técnico, 3. Riscos e Mitigações, Etapa 1: Backend - Rota de Extração (Scraper), Etapa 2: Backend - Sistema de Cache (Anti-Bloqueio), Etapa 3: Frontend - Integração no Player, Plano de Implementação: Extrator Vizer (Mixdrop)

### Community 77 - "Design de Sistema: Notificações Push (Web e Android)"
Cohesion: 0.36
Nodes (7): fetch_tmdb_id_from_movie_page(), main(), Scrapeia a página do filme no vizer e extrai data-tmdb-id., Converte slug (kebab-case) em título limpo., Tenta achar TMDB ID via busca web do themoviedb.org (sem key)., search_tmdb_web(), slug_to_title()

### Community 78 - "Global Constraints"
Cohesion: 0.36
Nodes (7): fetch_tmdb_id_from_episode_page(), main(), Scrapeia 1 episódio do vizer e extrai data-tmdb-id., Converte slug (kebab-case) em título limpo., Tenta achar TMDB ID via API de search pública do themoviedb.org (sem key, busca, search_tmdb_by_slug(), slug_to_title()

### Community 79 - "Global Constraints"
Cohesion: 0.36
Nodes (5): CatalogueMediaSource, createMediaSourcePool(), Measurement, Stats, createStreamtapeSourcePool()

### Community 80 - "Global Constraints"
Cohesion: 0.22
Nodes (18): LiveTvPage, NotificationModal, ReleaseCalendarPage, WebhookPanelModal, PlaybackHistoryItem, fetchWatchedFromCloud(), flushPendingWatchedSync(), getAllWatchedEpisodes() (+10 more)

### Community 82 - "Registro de Ciência de Risco de Segurança"
Cohesion: 0.18
Nodes (8): ADR-0003: Smoke tests de produção para integrações de streaming, Alternativas descartadas, Consequências, Contexto, Decisão, ADRs — Architecture Decision Records, Como escrever um novo ADR, Index

### Community 83 - "task.md"
Cohesion: 0.29
Nodes (6): Global Constraints, Notificações Push (Web e Android) Implementation Plan, Task 1: Instalação e Geração de Token FCM (Frontend), Task 2: Firebase Admin e Rota de Disparo Manual (Backend), Task 3: Interface no Painel ADM, Task 4: Cron Job de Lançamentos (Backend)

### Community 84 - "AppErrorBoundary"
Cohesion: 0.43
Nodes (6): fetch_player_data(), load_checkpoint(), main(), Pega playerData de um video_id do Vizer., Carrega checkpoint (video_ids já processados)., save_checkpoint()

### Community 87 - "doodstreamRoutes.ts"
Cohesion: 0.19
Nodes (11): triggerBysePrewarm(), createMixdropSourceRouting(), Identity, chooseHealthStartupServer(), fetchPlaybackHealth(), playbackHealthState(), rankPlaybackServers(), ServerHealth (+3 more)

### Community 89 - "@caprockapps/capacitor-chromecast"
Cohesion: 0.33
Nodes (5): ADR-0004: Provedor de anime AnimesDigital (HLS direto da CDN, sem proxy de segmento), Alternativas consideradas, Consequências, Contexto, Decisão

### Community 90 - "cheerio"
Cohesion: 0.33
Nodes (5): ADR-NNNN: <título curto e imperativo>, Alternativas descartadas, Consequências, Contexto, Decisão

### Community 91 - "StatusBarPluginInterface"
Cohesion: 0.33
Nodes (5): Decisões Arquiteturais, Design de Sistema: Notificações Push (Web e Android), Funcionalidades Principais, Objetivo, Roteiro de Implementação (Fases)

### Community 92 - "express-rate-limit"
Cohesion: 0.33
Nodes (5): Global Constraints, Plano Plus (Download) Implementation Plan, Task 1: Update useSubscription hook, Task 2: Create DownloadPlusModal component, Task 3: Integrate Modal in DetailsPage

### Community 93 - "firebase"
Cohesion: 0.33
Nodes (5): Correção de Bugs e Lista Negra Implementation Plan, Global Constraints, Task 1: Corrigir Cache Poisoning no Catálogo, Task 2: Remover Mapeamento de BYSE (Lista Negra), Task 3: Registrar Logs ao Invés de Ignorar Erros (Empty Catch)

### Community 94 - "firebase-admin"
Cohesion: 0.47
Nodes (4): build(), fetch_text(), normalize_title(), Path

### Community 95 - "playbackHealth.ts"
Cohesion: 0.40
Nodes (5): Job, pump(), queue, solveBysePowAsync(), WORKER_SOURCE

### Community 98 - "helmet"
Cohesion: 0.60
Nodes (3): ExampleInstrumentedTest, Test, RunWith

### Community 99 - "react-dom"
Cohesion: 0.33
Nodes (5): ADR-0001: Saimo VOD — HLS com ABR como padrão, MP4 como Turbo/fallback, Alternativas descartadas, Consequências, Contexto, Decisão

### Community 100 - "mediaSourcePool.ts"
Cohesion: 0.40
Nodes (5): ADR-0002: Hierarquia allowlist vs blacklist de domínios, Alternativas descartadas, Consequências, Contexto, Decisão

### Community 102 - "byseRoutes.ts"
Cohesion: 0.40
Nodes (4): Black Clover — auditoria de 30/10/2026, Correção local, Reprodução real no navegador, Validação de código

### Community 103 - "pow.ts"
Cohesion: 0.40
Nodes (4): Player e buffer seco, Proxy de vídeo, Recuperação da reprodução MixDrop, Validação e limites

### Community 104 - "doodstreamRoutes.ts"
Cohesion: 0.40
Nodes (4): Global Constraints, Substituição de Empty Catches em Massa, Task 1: Criar Script de Substituição, Task 2: Executar e Verificar

### Community 105 - "episodeAvailability.ts"
Cohesion: 0.40
Nodes (4): Architecture & Data Flow, Edge Cases & Error Handling, Overview, Plano Plus (Download Paywall) Design Spec

### Community 106 - "react"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 107 - "CustomDatePicker.tsx"
Cohesion: 0.40
Nodes (3): app, liveChunkCache, mixdropDownloadCache

### Community 108 - "tmdbProxy.ts"
Cohesion: 0.40
Nodes (4): Descrição da Vulnerabilidade, Parecer e Justificativa do Produto, Registro de Ciência de Risco de Segurança, Riscos Associados

### Community 109 - "getByseSources"
Cohesion: 0.50
Nodes (4): endpoints, request(), runSmokeTest(), signature

### Community 110 - "serverBlacklist.ts"
Cohesion: 0.80
Nodes (4): check_runtime(), cleanup(), upgrade-node24.sh script, wait_runtime()

### Community 112 - "scrape_anidigital_catalog.py"
Cohesion: 0.60
Nodes (4): ALLOWED_HOSTNAMES, _cache, fetch(), isAllowed()

### Community 114 - "Diretrizes e Regras do Repositório (Play Infinity)"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 115 - "catalogWatcher.ts"
Cohesion: 0.50
Nodes (3): channelsToUpdate, content, fs

### Community 116 - "serverBlocks.ts"
Cohesion: 0.83
Nodes (3): build(), main(), Path

### Community 118 - "externalRoutes.ts"
Cohesion: 0.83
Nodes (3): main(), Path, simplify()

### Community 121 - "episodeAvailability.ts"
Cohesion: 0.50
Nodes (4): 4.1. Sondagem Concorrente em Paralelo (`Promise.any`), 4.2. Cache de Prefixo por Série (`watchPlayerWorkingPrefixCache`), 4.3. Timeouts e Cancelamento de Requisições Zumbis, 4. Otimização do Endpoint `/api/watchplayer-stream`

### Community 122 - "Documentação da Infraestrutura de Streaming (Oracle Cloud VPS)"
Cohesion: 0.50
Nodes (3): NVM_DIR, PATH, watchdog.sh script

### Community 127 - "playbackStartup.ts"
Cohesion: 0.67
Nodes (3): 2.1. Comunicação Bidirecional via `postMessage`, 2.2. Segurança e Validação de Origem (`isTrustedMessageOrigin`), 2. Camada de Interface: `NetflixPlayerSkin.tsx`

### Community 128 - "ADR-0001: Saimo VOD — HLS com ABR como padrão, MP4 como Turbo/fallback"
Cohesion: 0.67
Nodes (3): 03/10/2026 (Noite) - Refinamento de Watchdog, Fallback e Cache, 04/10/2026 15:20:12 - Estabilidade e UX de Fallback de Servidores VOD, 04/10/2026 15:24:09 - Estabilidade e UX de Fallback de Servidores VOD

## Knowledge Gaps
- **793 isolated node(s):** `config`, `name`, `private`, `version`, `type` (+788 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `isServerBlacklisted()` connect `superflix-proxy.js` to `ExampleInstrumentedTest.java`, `downloadService.ts`, `ExampleUnitTest.java`, `catalog.ts`, `videoScrapers.ts`, `build_vizer_catalog.py`, `settings.gradle`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `react` connect `nixplayCatalog.ts` to `VideoPlayerModal.tsx`, `gradlew`, `test_isAvailable.js`, `firebase.ts`, `GlobalErrorModal.tsx`, `capacitor.build.gradle`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `dependencies` connect `firebase.ts` to `motion`, `ADR-NNNN: <título curto e imperativo>`, `StatusBarPluginInterface`, `build`, `react`, `main`, `Masonry Channel Grid Implementation Plan`, `serverBlocks.ts`, `@capacitor/status-bar`, `streamtapeRoutes.ts`, `nixplayCatalog.ts`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **What connects `config`, `name`, `private` to the rest of the system?**
  _793 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `encontreiLookup.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.01680672268907563 - nodes in this community are weakly interconnected._
- **Should `firebaseAdmin.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.01904761904761905 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08755760368663594 - nodes in this community are weakly interconnected._