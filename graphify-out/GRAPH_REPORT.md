# Graph Report - Play-Infinity  (2026-10-24)

## Corpus Check
- 196 files · ~1,619,266 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1431 nodes · 2893 edges · 100 communities (88 shown, 12 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b78e2005`
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
- react
- nixplayCatalog.ts
- PaywallModal.tsx
- manifest.json
- Walkthrough: AnotaÃ§Ãµes e Descontos no Admin
- react
- vidsrcRoutes.ts
- remote-package.json
- MainActivity
- useSubscription.ts
- vizer_movies_duplo_check.py
- vizer_tmdb_duplo_check.py
- subtitlesRoutes.ts
- vizer_bulk_scraper.py
- ExampleInstrumentedTest.java
- remote-proxy.mjs
- smoke-routes.mjs
- notifications.ts
- superflix-proxy.js
- ExampleUnitTest.java
- gradlew
- patch_channels.js
- watchdog.sh
- WebhookPanelModal.tsx
- capacitor.config.ts
- firebase-messaging-sw.js
- setup-vps.sh
- time-test.js
- Diretrizes e Regras do Repositório (Play Infinity)
- 🚀 Infraestrutura Play Infinity: Migração para Oracle VPS & Configuração de DNS na Cloudflare
- App
- catalogWatcher.ts
- Cloudflare Worker — Proxy Universal (Play-Infinity)
- ContentRow.tsx
- ContentRow.tsx
- 2. Passo a Passo Técnico
- 03/10/2026 (Noite) - Refinamento de Watchdog, Fallback e Cache
- Global Constraints
- 06/10/2026 - VIP Player: retry com series_id do Nixplay quando Ajax só devolve fontes blacklisted
- Design de Sistema: Notificações Push (Web e Android)
- Global Constraints
- Global Constraints
- Global Constraints
- Plano Plus (Download Paywall) Design Spec
- Registro de Ciência de Risco de Segurança
- task.md
- AppErrorBoundary
- @capacitor-firebase/messaging
- @capacitor/status-bar
- doodstreamRoutes.ts
- streamtapeRoutes.ts
- @caprockapps/capacitor-chromecast
- cheerio
- @consumet/extensions
- express-rate-limit
- firebase
- firebase-admin
- lru-cache
- motion
- helmet
- react-dom

## God Nodes (most connected - your core abstractions)
1. `Walkthrough: AnotaÃƒÂ§ÃƒÂµes e Descontos no Admin` - 77 edges
2. `VideoPlayerModal()` - 32 edges
3. `DetailsPage()` - 27 edges
4. `checkIsCam()` - 24 edges
5. `HomePage()` - 23 edges
6. `getFavoriteIds()` - 20 edges
7. `formatImageUrl()` - 20 edges
8. `getAllCatalogItems()` - 19 edges
9. `fetchTmdbSafe()` - 18 edges
10. `getFavoriteEpisodeNotifications()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `ContentRowInner()` --references--> `react`  [EXTRACTED]
  src/components/ContentRow.tsx → package.json
- `lazyWithRetry()` --references--> `react`  [EXTRACTED]
  src/components/LoadingStates.tsx → package.json
- `NavItem()` --references--> `react`  [EXTRACTED]
  src/components/NavItem.tsx → package.json
- `DetailsPage()` --references--> `react`  [EXTRACTED]
  src/pages/DetailsPage.tsx → package.json
- `lazyWithRetry()` --references--> `react`  [EXTRACTED]
  src/pages/DetailsPage.tsx → package.json

## Import Cycles
- None detected.

## Communities (100 total, 12 thin omitted)

### Community 0 - "encontreiLookup.ts"
Cohesion: 0.06
Nodes (28): catalogueMediaSourceCache, catalogueMediaSourcePending, _encFreshTmdbCache, _encInflight, _encKnownMovieIds, _encKnownSerieIds, _encNeg, _encontreiEpisodeIndex (+20 more)

### Community 1 - "firebaseAdmin.ts"
Cohesion: 0.11
Nodes (32): react, react, FilterChip(), SagasPage(), lazyWithRetry(), lazyWithRetry(), GlobalCatalogPage(), handlePosterError() (+24 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (45): @capacitor/core, @capacitor/filesystem, @capacitor-firebase/messaging, @capacitor/screen-orientation, @capacitor/splash-screen, @capacitor/status-bar, @caprockapps/capacitor-chromecast, cheerio (+37 more)

### Community 3 - "devDependencies"
Cohesion: 0.04
Nodes (45): autoprefixer, browserslist, @capacitor/android, @capacitor/assets, @capacitor/cli, esbuild, glob, lightningcss (+37 more)

### Community 4 - "VideoPlayerModal.tsx"
Cohesion: 0.05
Nodes (59): CastMediaDetails, CastModal(), CastModalProps, RokuDiscovery, LivePlayerModal(), LivePlayerModalProps, PiP, SagasPageProps (+51 more)

### Community 5 - "HomePage.tsx"
Cohesion: 0.09
Nodes (30): ContentCard, ContentCardInner(), ContentRow, ContentRowInner(), handlePosterError(), allowed(), availability, confirmNewRelease() (+22 more)

### Community 6 - "GlobalSearchPage.tsx"
Cohesion: 0.12
Nodes (30): NotificationModalProps, ReleaseCalendarPageProps, animes, continueWatching, doramas, featured, featuredCarousel, kidsContent (+22 more)

### Community 7 - "downloadService.ts"
Cohesion: 0.09
Nodes (37): BidirectionalProgressBar(), BidirectionalProgressBarProps, FloatingDownloadWidget(), FloatingDownloadWidgetProps, SLIDES, WhatsNewModal(), DownloadsPage(), ActiveDownload (+29 more)

### Community 8 - "App.tsx"
Cohesion: 0.08
Nodes (24): AdminPage, DetailsPage, DownloadsPage, FavoritesPage, GlobalCatalogPage, GlobalSearchPage, HomePage, LivePlayerModal (+16 more)

### Community 9 - "LiveTvPage.tsx"
Cohesion: 0.21
Nodes (18): ChannelLogo(), ChannelLogoProps, LiveTvPage(), LiveTvPageProps, INITIAL_LIVE_CHANNELS, LiveChannel, clearAllCustomChannels(), deleteCustomChannel() (+10 more)

### Community 10 - "tmdb.ts"
Cohesion: 0.08
Nodes (34): UNAVAILABLE_SEASONS, CachedSeasonEntry, CardIdentity, _clientTmdbCache, _clientTmdbInflight, DEFAULT_DETAILS, DEFAULT_EMPTY_RESPONSE, DEFAULT_SEASON (+26 more)

### Community 11 - "adminApi.ts"
Cohesion: 0.28
Nodes (8): ActiveRunDetails, AdminDeployMonitor(), getWorkflowBadge(), GitHubRun, GitHubRunsResponse, parseCommitMessage(), RunStep, VpsTelemetryData

### Community 12 - "playbackHistory.ts"
Cohesion: 0.13
Nodes (31): formatTime(), NetflixPlayerSkin(), NetflixPlayerSkinProps, NetflixPlayerStatus, NextMovieInfo, parseVtt(), PiP, timeToSeconds() (+23 more)

### Community 13 - "mediaUtils.ts"
Cohesion: 0.06
Nodes (53): createByseRouter(), check, discovery, providers, router, allowedByseMediaUrl(), b64u(), b64uToBuf() (+45 more)

### Community 14 - "DetailsPage.tsx"
Cohesion: 0.10
Nodes (45): ReleaseCalendarPage(), VirtualRemote(), DetailsPage(), handlePosterError(), LiveTvPage, NotificationModal, ReleaseCalendarPage, WebhookPanelModal (+37 more)

### Community 15 - "compilerOptions"
Cohesion: 0.09
Nodes (21): dist, DOM, DOM.Iterable, ES2022, node_modules, scratch, compilerOptions, allowJs (+13 more)

### Community 16 - "server.ts"
Cohesion: 0.10
Nodes (16): apiLimiter, app, appHelmet, bugUploadLimiter, commonHelmet, globalLimiter, liveStreamLimiter, playerHelmet (+8 more)

### Community 17 - "catalog.ts"
Cohesion: 0.17
Nodes (13): customStreams, episodesAvailabilityCache, router, StreamItem, webhookLimiter, executeAtomicSaveMostWatched(), getMostWatchedFilePath(), INITIAL_MOST_WATCHED (+5 more)

### Community 18 - "videoScrapers.ts"
Cohesion: 0.12
Nodes (26): resolveAnimesOnline(), resolveDirectAnimeStream(), resolveVixsrcStream(), router, speedtestLimiter, checkVipSeason(), checkVizerSeason(), router (+18 more)

### Community 19 - "helpers.ts"
Cohesion: 0.18
Nodes (12): router, ALLOWED_LIVE_STREAMING_DOMAINS, ALLOWED_STREAMING_DOMAINS, dnsResolutionCache, isAllowedLiveStreamingDomain(), isPrivateOrLocalHost(), isPrivateOrLocalIpAddress(), signProxyUrl() (+4 more)

### Community 20 - "firebase.ts"
Cohesion: 0.22
Nodes (11): BugFeedbackListener(), ResolvedBug, ReportBugModal(), ReportBugModalProps, auth, db, storage, registerFcmToken() (+3 more)

### Community 21 - "GlobalErrorModal.tsx"
Cohesion: 0.15
Nodes (13): AdminHealthMonitor(), EncontreiStatus, HealthResult, CustomDatePicker(), CustomDatePickerProps, MONTH_NAMES, WEEK_DAYS, EncontreiCookieAlert() (+5 more)

### Community 22 - "RokuDiscoveryPlugin"
Cohesion: 0.24
Nodes (9): CapacitorPlugin, PluginCall, PluginMethod, PiPPlugin, CapacitorPlugin, PluginCall, PluginMethod, RokuDiscoveryPlugin (+1 more)

### Community 23 - "react"
Cohesion: 0.13
Nodes (21): SpeechRecognitionErrorEvent, SpeechRecognitionEvent, SpeechRecognitionInstance, useVoiceSearch(), UseVoiceSearchOptions, Window, GlobalSearchPage(), handlePosterError() (+13 more)

### Community 24 - "nixplayCatalog.ts"
Cohesion: 0.22
Nodes (13): nixplayEpisodeCache, router, CACHE_PATH, isNixplayAvailable(), loadDiskCache(), loadNixplayCatalog(), maybeBackgroundSync(), nixplayMovies (+5 more)

### Community 25 - "PaywallModal.tsx"
Cohesion: 0.36
Nodes (7): DerivedUserStatus, deriveStatus(), NO_TRIAL, parseTrialTimestamp(), TrialStatus, useSubscription(), isAiStudioOrDevEnvironment()

### Community 26 - "manifest.json"
Cohesion: 0.15
Nodes (12): background_color, categories, description, display, icons, name, orientation, short_name (+4 more)

### Community 27 - "Walkthrough: AnotaÃ§Ãµes e Descontos no Admin"
Cohesion: 0.03
Nodes (75): 01/10/2026 - Monitoramento do RobÃƒÂ´ Ampere, 03/10/2026 - CorreÃ¯Â¿Â½Ã¯Â¿Â½es de VideoPlayer e Monitoramento, 06/10/2026 - Auto-correÃ§Ã£o de identidade de cards + memo de 404 (HxH/Nixplay encerrado), 07/10/2026 - CorreÃ§Ã£o O Dia do Chacal (MixDrop) & Asaas 401 & UI, 07/10/2026 - SincronizaÃ§Ã£o de NotificaÃ§Ãµes Lidas (Sininho) na Nuvem, 07/10/2026 - Sistema de Reporte de Bugs, 08/10/2026 (2) - Scan Incremental do Vizer (modelo do encontrei.me) + Fix rate-limiter pÃ³s-rename md-stream, 08/10/2026 - AtivaÃ§Ã£o do Push Web (VAPID Key FCM) + Deploy (+67 more)

### Community 28 - "react"
Cohesion: 0.07
Nodes (34): getAdminDb(), getAdminFieldValue(), getAdminMessaging(), { getFirestore }, { getMessaging }, { initializeApp, cert, getApps }, getFirebaseAuth(), requireAdminAuth() (+26 more)

### Community 29 - "vidsrcRoutes.ts"
Cohesion: 0.20
Nodes (10): allowedHostsSet, checkVidsrcSeason(), CORS, getOriginToken(), getRewrittenM3u8(), rewriteM3u8(), router, streamCache (+2 more)

### Community 30 - "remote-package.json"
Cohesion: 0.20
Nodes (9): dependencies, express, helmet, express, helmet, main, name, type (+1 more)

### Community 31 - "MainActivity"
Cohesion: 0.36
Nodes (5): MainActivity, BridgeActivity, Bundle, Configuration, Override

### Community 32 - "useSubscription.ts"
Cohesion: 0.32
Nodes (8): encNormTitle(), encSlugMatchesTitle(), ensureVizerFreshContent(), ensureVizerFreshListing(), loadVizerMovieIds(), resolveVizerMovie(), vizerFetchHtml(), vizerKnownSetsLoad()

### Community 33 - "vizer_movies_duplo_check.py"
Cohesion: 0.36
Nodes (7): fetch_tmdb_id_from_movie_page(), main(), Scrapeia a página do filme no vizer e extrai data-tmdb-id., Converte slug (kebab-case) em título limpo., Tenta achar TMDB ID via busca web do themoviedb.org (sem key)., search_tmdb_web(), slug_to_title()

### Community 34 - "vizer_tmdb_duplo_check.py"
Cohesion: 0.36
Nodes (7): fetch_tmdb_id_from_episode_page(), main(), Scrapeia 1 episódio do vizer e extrai data-tmdb-id., Converte slug (kebab-case) em título limpo., Tenta achar TMDB ID via API de search pública do themoviedb.org (sem key, busca, search_tmdb_by_slug(), slug_to_title()

### Community 35 - "subtitlesRoutes.ts"
Cohesion: 0.39
Nodes (7): CACHE_DIR, countVttCues(), CREDIT_PATTERNS, srtToVtt(), stripCreditCues(), subtitlesRouter, tryFetchSubtitleFromResult()

### Community 36 - "vizer_bulk_scraper.py"
Cohesion: 0.43
Nodes (6): fetch_player_data(), load_checkpoint(), main(), Pega playerData de um video_id do Vizer., Carrega checkpoint (video_ids já processados)., save_checkpoint()

### Community 37 - "ExampleInstrumentedTest.java"
Cohesion: 0.60
Nodes (3): ExampleInstrumentedTest, Test, RunWith

### Community 38 - "remote-proxy.mjs"
Cohesion: 0.40
Nodes (3): app, liveChunkCache, mixdropDownloadCache

### Community 39 - "smoke-routes.mjs"
Cohesion: 0.50
Nodes (4): endpoints, request(), runSmokeTest(), signature

### Community 40 - "notifications.ts"
Cohesion: 0.25
Nodes (17): App(), NotificationModal(), fetchDynamicScheduleForFavorites(), getDayOfWeekFromDate(), getFavoriteTimestamps(), getScheduleForFavorites(), EpisodeNotification, fetchReadNotificationsFromCloud() (+9 more)

### Community 41 - "superflix-proxy.js"
Cohesion: 0.60
Nodes (4): ALLOWED_HOSTNAMES, _cache, fetch(), isAllowed()

### Community 43 - "gradlew"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 44 - "patch_channels.js"
Cohesion: 0.50
Nodes (3): channelsToUpdate, content, fs

### Community 45 - "watchdog.sh"
Cohesion: 0.50
Nodes (3): NVM_DIR, PATH, watchdog.sh script

### Community 66 - "Diretrizes e Regras do Repositório (Play Infinity)"
Cohesion: 0.05
Nodes (36): 1. Política Estrita de Servidores de Vídeo (VOD: Filmes, Séries e Animes), 2. Estabilidade do Localhost e Observador de Arquivos (Vite), 3. Conformidade e Verificação Obrigatória, 4. Infraestrutura Geral e Hosting (VPS Oracle Cloud), 5. Arquitetura de Streaming de VOD (Filmes, Séries e Animes), 6. Compilação Android (APK / AAB) e Picture-in-Picture, 7. Controle de Versão e Lançamento (Play Store), 8. Memória e Estado das Tarefas (Evitando Amnésia) (+28 more)

### Community 67 - "🚀 Infraestrutura Play Infinity: Migração para Oracle VPS & Configuração de DNS na Cloudflare"
Cohesion: 0.11
Nodes (18): 📌 1. Por que migramos para a VPS da Oracle Cloud?, 🖥️ 2. Dados do Servidor VPS (Oracle Cloud Infrastructure), ⚙️ 3. Tudo o que foi Feito e Otimizado no Sistema, 🌐 4. Como Configurar o DNS na Cloudflare (Passo a Passo), 🔍 5. Como Testar e Validar a Conexão, 🤖 6. Deploy 100% Automático via GitHub Actions (CI/CD), A. Proxy de Streaming HLS em Tempo Real (`proxy.mjs`), B. Otimização Avançada do Nginx (`/etc/nginx/sites-available/play-infinity`) (+10 more)

### Community 68 - "App"
Cohesion: 0.16
Nodes (15): mixdropMemoryCache, mixdropPool, mixdropResolutions, refreshMixdropUrl(), resolveFreshMixdropToken(), resolveMixdropToken(), router, tokenRefreshes (+7 more)

### Community 69 - "catalogWatcher.ts"
Cohesion: 0.18
Nodes (13): AdminBugReports(), BugReport, PREDEFINED_RESPONSES, AdminPushNotifications(), TEMPLATES, HOMOLOGATED_SERVERS, SelectedMedia, SERVER_LABELS (+5 more)

### Community 70 - "Cloudflare Worker — Proxy Universal (Play-Infinity)"
Cohesion: 0.13
Nodes (14): "Cloudflare bloqueou mesmo dentro da rede CF", Cloudflare Worker — Proxy Universal (Play-Infinity), Como o backend usa, Configurar no Render, Custos e limites, Deploy (5 min, grátis, sem cartão), "Erro ao fetchar URL", "Hostname não permitido pelo whitelist" (+6 more)

### Community 71 - "ContentRow.tsx"
Cohesion: 0.29
Nodes (12): encKnownSetsLoad(), encontreiEpisodeId(), encontreiGetHtml(), encontreiPlayerData(), ensureEncontreiFreshContent(), ensureEncontreiFreshListing(), fetchWithTimeout(), getByseSources() (+4 more)

### Community 72 - "ContentRow.tsx"
Cohesion: 0.05
Nodes (41): 03/10/2026 - CorreÃƒÂ§ÃƒÂµes Live TV e OtimizaÃƒÂ§ÃƒÂµes de Performance, 03/10/2026 - Mega RefatoraÃƒÂ§ÃƒÂ£o de Rotas (server.ts modularizado), 05/10/2026 - Health Check Autenticado do encontrei.me (Cookie de Sessao), 06/10/2026 - 404 `/api/tmdb/tv/*` em item catalogado como sÃ©rie (id Ã© de FILME), 06/10/2026 - `ERR_CONTENT_LENGTH_MISMATCH` em `/api/mixdrop-proxy` (segunda ocorrÃªncia), 06/10/2026 - Erros de console ao assistir via MixDrop (proxy, TMDB 404, permissÃ£o Firebase), 06/10/2026 - Fix HxH 2011 (aba T3 sumindo + episÃ³dios ocultos), 06/10/2026 - HxH 2011: "eps 70+ nÃ£o reproduzem" â€” worker do CONTEÃšDO do HxH fora no Nixplay (+33 more)

### Community 73 - "2. Passo a Passo Técnico"
Cohesion: 0.25
Nodes (7): 1. Visão Geral, 2. Passo a Passo Técnico, 3. Riscos e Mitigações, Etapa 1: Backend - Rota de Extração (Scraper), Etapa 2: Backend - Sistema de Cache (Anti-Bloqueio), Etapa 3: Frontend - Integração no Player, Plano de Implementação: Extrator Vizer (Mixdrop)

### Community 74 - "03/10/2026 (Noite) - Refinamento de Watchdog, Fallback e Cache"
Cohesion: 0.67
Nodes (3): 03/10/2026 (Noite) - Refinamento de Watchdog, Fallback e Cache, 04/10/2026 15:20:12 - Estabilidade e UX de Fallback de Servidores VOD, 04/10/2026 15:24:09 - Estabilidade e UX de Fallback de Servidores VOD

### Community 75 - "Global Constraints"
Cohesion: 0.29
Nodes (6): Global Constraints, Notificações Push (Web e Android) Implementation Plan, Task 1: Instalação e Geração de Token FCM (Frontend), Task 2: Firebase Admin e Rota de Disparo Manual (Backend), Task 3: Interface no Painel ADM, Task 4: Cron Job de Lançamentos (Backend)

### Community 76 - "06/10/2026 - VIP Player: retry com series_id do Nixplay quando Ajax só devolve fontes blacklisted"
Cohesion: 0.22
Nodes (11): AuthModal(), AuthModalProps, reportAppError(), PaywallModal(), PaywallModalProps, TurnstileProps, TurnstileWidget(), Window (+3 more)

### Community 77 - "Design de Sistema: Notificações Push (Web e Android)"
Cohesion: 0.33
Nodes (5): Decisões Arquiteturais, Design de Sistema: Notificações Push (Web e Android), Funcionalidades Principais, Objetivo, Roteiro de Implementação (Fases)

### Community 78 - "Global Constraints"
Cohesion: 0.33
Nodes (5): Global Constraints, Plano Plus (Download) Implementation Plan, Task 1: Update useSubscription hook, Task 2: Create DownloadPlusModal component, Task 3: Integrate Modal in DetailsPage

### Community 79 - "Global Constraints"
Cohesion: 0.33
Nodes (5): Correção de Bugs e Lista Negra Implementation Plan, Global Constraints, Task 1: Corrigir Cache Poisoning no Catálogo, Task 2: Remover Mapeamento de BYSE (Lista Negra), Task 3: Registrar Logs ao Invés de Ignorar Erros (Empty Catch)

### Community 80 - "Global Constraints"
Cohesion: 0.40
Nodes (4): Global Constraints, Substituição de Empty Catches em Massa, Task 1: Criar Script de Substituição, Task 2: Executar e Verificar

### Community 81 - "Plano Plus (Download Paywall) Design Spec"
Cohesion: 0.40
Nodes (4): Architecture & Data Flow, Edge Cases & Error Handling, Overview, Plano Plus (Download Paywall) Design Spec

### Community 82 - "Registro de Ciência de Risco de Segurança"
Cohesion: 0.40
Nodes (4): Descrição da Vulnerabilidade, Parecer e Justificativa do Produto, Registro de Ciência de Risco de Segurança, Riscos Associados

### Community 84 - "AppErrorBoundary"
Cohesion: 0.15
Nodes (9): AppErrorBoundary, AppErrorInfo, ErrorBoundaryProps, ErrorBoundaryState, GlobalErrorModal(), GlobalErrorModalProps, isIgnorableError(), Window (+1 more)

### Community 85 - "@capacitor-firebase/messaging"
Cohesion: 0.38
Nodes (11): fetchWatchedFromCloud(), flushPendingWatchedSync(), getAllWatchedEpisodes(), getSeasonWatchedCount(), getStore(), isSeasonFullyWatched(), makeEpisodeKey(), markEpisodeWatched() (+3 more)

### Community 86 - "@capacitor/status-bar"
Cohesion: 0.22
Nodes (8): Atualizar o Node da aplicação para 24 LTS, Dependências e identificação do código executado, Deploy da aplicação na VPS Oracle, Falha de pré-verificação PM2, Limites e operação, Migração única de uma instância fork, Requisitos e ativação, Validação local

### Community 87 - "doodstreamRoutes.ts"
Cohesion: 0.29
Nodes (6): RFC-9110, DoodstreamCacheEntry, doodstreamMemoryCache, doodstreamRouter, findDoodstreamInCatalog(), getLocalCatalog()

### Community 88 - "streamtapeRoutes.ts"
Cohesion: 0.12
Nodes (17): getStreamtapeSources(), directUrlToFileId, resolveStreamTapeDetails(), resolveStreamTapeToken(), selectIdentitySource(), sourcePool, streamtapeRouter, tokenResolver (+9 more)

### Community 89 - "@caprockapps/capacitor-chromecast"
Cohesion: 0.32
Nodes (7): adminOpsRouter, executeSshCommand(), executeSystemOrSshCommand(), getSshPrivateKey(), ORACLE_VPS_PORT, getEncontreiResolverStatus(), getVizerCatalogStatus()

### Community 90 - "cheerio"
Cohesion: 0.29
Nodes (8): applyCatalogPatches(), getCatalogueMediaSources(), getEncontreiSeasonEpisodes(), getMixdropSources(), getPlaybackCataloguePresence(), loadCatalogs(), resolveVizerEpisode(), tryLoadCatalog()

### Community 91 - "@consumet/extensions"
Cohesion: 0.52
Nodes (5): vizerFetchJson(), checkVizerHealth(), getVizerDomainOrder(), rememberVizerDomain(), VIZER_DOMAINS

### Community 92 - "express-rate-limit"
Cohesion: 0.40
Nodes (4): Player e buffer seco, Proxy de vídeo, Recuperação da reprodução MixDrop, Validação e limites

### Community 93 - "firebase"
Cohesion: 0.80
Nodes (4): check_runtime(), cleanup(), upgrade-node24.sh script, wait_runtime()

## Knowledge Gaps
- **567 isolated node(s):** `config`, `name`, `private`, `version`, `type` (+562 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `isServerBlacklisted()` connect `videoScrapers.ts` to `server.ts`, `helpers.ts`, `VideoPlayerModal.tsx`, `mediaUtils.ts`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Why does `react` connect `firebaseAdmin.ts` to `dependencies`, `HomePage.tsx`, `App.tsx`, `DetailsPage.tsx`, `react`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `firebaseAdmin.ts`, `devDependencies`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **What connects `config`, `name`, `private` to the rest of the system?**
  _567 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `encontreiLookup.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `firebaseAdmin.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11092436974789915 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._