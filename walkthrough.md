## 20/10/2026 - Atualização dos Botões do Painel ADM para 'Recarregar Serviços (Zero-Downtime)'

**Contexto e Motivação:**
Com a transição da infraestrutura de deploy e PM2 para Cluster Mode e Graceful Shutdown, os botões manuais do Painel Administrativo ainda executavam \pm2 restart\. A interface e as rotas de backend foram atualizadas para refletir o novo comportamento de recarregamento suave.

**Modificações Realizadas:**
1. **\server/routes/adminOps.ts\:** Endpoints \estart-all\ e \estart-app\ agora executam \sudo pm2 reload ecosystem.config.cjs --update-env\, mantendo o processo com Zero-Downtime mesmo quando acionado manualmente pelo admin.
2. **\src/components/AdminDeployMonitor.tsx\:** Botões de ação atualizados para **'Recarregar Serviços (Zero-Downtime)'** com descrições e tooltips claras.

---
## 20/10/2026 - Correção de Replay do Episódio Anterior ao Clicar em Próximo Episódio

**Contexto e Motivação:**
Ao clicar em "Assistir Agora" no card de próximo episódio (ex: Temp 2 Ep 6), a interface atualizava a nomenclatura para o episódio 6, porém o player reiniciava a reprodução do episódio 5 anterior.

**Causa Raiz Identificada:**
1. **Frontend (\src/components/VideoPlayerModal.tsx\):** O método \uildUrl\ do StreamTape e MixDrop usava o \streamtapeFileId\ / \mixdropFileId\ da closure do React (que ainda continha o \ileId\ do episódio 5 porque o estado do React ainda não havia re-renderizado de forma assíncrona). Com isso, a URL gerada continha \&fileId=FILEID_DO_EP_5\ mesmo passando \e=6\.
2. **Backend (\server/routes/streamtapeRoutes.ts\):** O endpoint \/api/streamtape-proxy-iframe\ confiava cegamente no \ileId\ recebido na query sem verificar se o catálogo local tinha o episódio correto solicitado em \s\ e \e\.

**Modificações Realizadas:**
1. **\server/routes/streamtapeRoutes.ts\:** Blindagem estrita no backend: se a requisição contém \id\, \season\ e \episode\, o servidor sempre busca o \ileId\ correto do episódio solicitado no catálogo local, impedindo que qualquer cliente repita o episódio anterior.
2. **\src/components/VideoPlayerModal.tsx\:**
   - \uildUrl\ do StreamTape e MixDrop agora verificam se o \s\ e \e\ passados são exatamente iguais ao episódio atual antes de usar qualquer ID de cache, e buscam o \	argetKey\ exato (\	v:id:s:e\).
   - \	Param\ (tempo salvo) só é anexado se for o mesmo episódio, evitando que o próximo episódio inicie com o tempo do anterior.
   - \handleEpisodeChange\ pré-resolve o novo episódio antes de montar a URL.

---
## 20/10/2026 - Pipeline de Sincronização Leve para Google Drive e Gemini Mobile (Opção A)

**Contexto e Motivação:**
Configurada a sincronização automática do código do repositório para o Google Drive para permitir consultas em tempo real pelo app móvel do Gemini (@Google Drive), eliminando o problema anterior de arquivos JSON gigantes de catálogo que estouravam os limites de tokens da IA.

**Modificações Realizadas:**
1. **\scripts/generate-drive-markdown.cjs\:** Gerador que filtra estritamente catálogos, assets e arquivos pesados, agrupando o código em 3 arquivos Markdown leves com sumário:
   - \1_Frontend_Telas_e_Players.md\ (~1.1 MB)
   - \2_Backend_e_Rotas.md\ (~630 KB)
   - \3_Arquitetura_e_Tipos.md\ (~280 KB)
2. **\scripts/sync-to-gdrive.cjs\:** Script que envia os arquivos gerados via Webhook para o Google Apps Script.
3. **\.github/workflows/sync-drive.yml\:** Workflow do GitHub Actions para sincronização automática em push.

---
## 20/10/2026 - Implementação de Deploy Zero-Downtime (PM2 Cluster + Graceful Shutdown)

**Contexto e Motivação:**
Durante os deploys na VPS Oracle, a execução de \pm2 restart\ derrubava a conexão TCP de streams em andamento, gerando \
et::ERR_CONTENT_LENGTH_MISMATCH\ e breves erros \502 Bad Gateway\ no navegador do cliente enquanto a aplicação reiniciava.

**Solução Implementada:**
1. **Modo Cluster PM2 (\ecosystem.config.cjs\):** Configurado para rodar 2 instâncias em paralelo com balanceamento automático. Durante o deploy, o PM2 reinicia uma instância por vez (\pm2 reload\), garantindo que o serviço nunca fique fora do ar.
2. **Graceful Shutdown (\server.ts\):** O servidor agora escuta \SIGTERM\ e \SIGINT\. Ao receber o sinal, para de aceitar novas requisições e drena as requisições ativas por até 10s antes de fechar o processo.
3. **Sinal 'ready' (\server.ts\):** O Node.js envia \process.send('ready')\ após o socket HTTP estar ativo. O PM2 só desliga a instância antiga após a nova estar 100% pronta.
4. **Pipeline CI/CD (\.github/workflows/main.yml\):** Script de deploy atualizado para incluir \ecosystem.config.cjs\ e executar \sudo pm2 reload ecosystem.config.cjs --update-env\.

---
## 20/10/2026 - Correção do Pular Abertura no StreamTape, DoodStream e Redundância Universal

**Contexto e Motivação:**
O botão de Pular Abertura (+75s) funcionava no MixDrop no navegador, mas não pulava no StreamTape ou no aplicativo Android.

**Causa Raiz:**
1. No backend (\server/routes/streamtapeRoutes.ts\ e \server/routes/doodstreamRoutes.ts\), o listener do iframe tratava \SEEK\ e \SEEK_RELATIVE\, mas não tinha o caso \SKIP_INTRO\. Como o StreamTape é o servidor padrão #1, o comando era descartado silenciosamente.
2. A versão instalada no celular (1.1.8) corresponde ao \ersionCode 9\, anterior às melhorias de fullscreen e comunicação de iframe do Capacitor moderno.

**Modificações Realizadas:**
1. **\server/routes/streamtapeRoutes.ts\:** Adicionado suporte nativo ao comando \SKIP_INTRO\ (+75s seguro).
2. **\server/routes/doodstreamRoutes.ts\:** Adicionado suporte ao comando \SKIP_INTRO\.
3. **\src/components/VideoPlayerModal.tsx\:** \handleSkipIntro\ e \handleUndoSkip\ agora disparam tanto \SKIP_INTRO\ quanto \SEEK_RELATIVE\ (+75s / -75s), garantindo redundância universal para qualquer servidor e versão.
4. **\dist/server.cjs\ & Assets:** Servidor recompilado com esbuild e sincronizado com os assets do Android.

---
## 20/10/2026 - Ajuste do Tempo de Pular Abertura para 75 Segundos

**Contexto e MotivaÃ§Ã£o:**
Solicitada a reduÃ§Ã£o do salto do botÃ£o e atalho de "Pular Abertura" de 85 segundos para 75 segundos, permitindo um salto mais seguro sem risco de avanÃ§ar alÃ©m do primeiro segundo de inÃ­cio da histÃ³ria em aberturas mais curtas.

**ModificaÃ§Ãµes Realizadas:**
1. **`src/components/VideoPlayerModal.tsx`:** Valor padrÃ£o do salto e retorno (undo) ajustado para 75 segundos.
2. **`src/components/NetflixPlayerSkin.tsx`:** Tooltip do botÃ£o de pular abertura atualizado para `(+75s) - Tecla S`.
3. **`server/routes/mixdrop.ts`:** Handler `SKIP_INTRO` ajustado com fallback padrÃ£o para 75 segundos.
4. **`server/routes/videoScrapers.ts`:** Script do player bridge atualizado com padrÃ£o de 75 segundos.

---

## 20/10/2026 - CalibraÃ§Ã£o do Watchdog Anti-Engasgo (EliminaÃ§Ã£o de Falsos Positivos com Buffer Alto)

**Contexto e MotivaÃ§Ã£o:**
Durante a reproduÃ§Ã£o no MixDrop, o player piscou trÃªs vezes na tela preta e disparou erro fatal (`buffer_depleted_frequent_stalls`) mesmo quando o vÃ­deo tinha **52.97 segundos de buffer carregado Ã  frente** e o travamento real havia durado apenas 2 segundos.

**Causa Raiz Identificada:**
O watchdog da `NetflixPlayerSkin.tsx` continha uma condiÃ§Ã£o cega: `if (stalls >= 3 || dur >= 6)`. Essa regra acumulava qualquer micro-espera de 0.1s ao longo da sessÃ£o inteira. Ao atingir o 3Âº micro-engasgo (mesmo espaÃ§ado e com quase 1 minuto de vÃ­deo no buffer), a skin emitia `WATCHPLAY_ERROR` e forÃ§ava o fechamento/recarregamento do iframe repetidamente.

**ModificaÃ§Ãµes Realizadas:**
1. **`src/components/NetflixPlayerSkin.tsx`:**
   - Adicionada verificaÃ§Ã£o estrita de buffer seco: se houver buffer (`buf >= 1.5s`), Ã© **proibido** emitir erro fatal ou comutar.
   - SÃ³ aciona fallback automÃ¡tico de emergÃªncia se o vÃ­deo estiver com buffer verdadeiramente zerado (`buf < 0.5s`) **E** travado continuamente por mais de **7 segundos**, ou em caso de 5+ engasgos severos com buffer seco.
   - OscilaÃ§Ãµes curtas de 1 a 3 segundos da CDN agora sÃ£o tratadas com buffer suave, sem derrubar a reproduÃ§Ã£o.

**ValidaÃ§Ã£o Realizada:**
- Teste de calibraÃ§Ã£o automatizado (`scratch/test-watchdog-calibration.mjs`): 4/4 cenÃ¡rios aprovados (rejeiÃ§Ã£o com 53s de buffer, tolerÃ¢ncia a oscilaÃ§Ã£o de 2s, e ativaÃ§Ã£o apenas com congelamento real > 7s).

---

## 20/10/2026 - CorreÃ§Ã£o da Janela de ExibiÃ§Ã£o e AtivaÃ§Ã£o do Card de PrÃ³ximo EpisÃ³dio (120s)

**Contexto e MotivaÃ§Ã£o:**
Ao assistir a episÃ³dios de sÃ©ries (ex: Cyberpunk no MixDrop), o card de prÃ©via do prÃ³ximo episÃ³dio ("PrÃ³ximo em 10s" estilo Netflix/Disney+) nÃ£o apareceu nos crÃ©ditos finais e o vÃ­deo finalizou em tela preta no segundo zero sem disparar o card flutuante nem a transiÃ§Ã£o automÃ¡tica de episÃ³dio.

**Causas RaÃ­zes Identificadas:**
1. **Janela de Tempo IncompatÃ­vel (75s vs 120s):** O cÃ³digo de sÃ©ries estava configurado rÃ­gidamente para `remainingTime <= 75`, enquanto os crÃ©ditos de encerramento duram 90s a 120s. Quem assistia esperando nos Ãºltimos 120 segundos nÃ£o via o card.
2. **Trava `remainingTime > 2` no TÃ©rmino:** O monitoramento continha `remainingTime > 2`, o que desativava o card quando o vÃ­deo chegava ao segundo 0 ou terminava.
3. **Pausa ao Final do Arquivo Congelava Countdown:** Quando o vÃ­deo finalizava e o player entrava em pausa no Ãºltimo segundo, o timer da contagem regressiva era cancelado por causa de `playerStatus.paused`.
4. **MixDrop Faltava `notifyEnded` no `<video>` Nativo:** Em `server/routes/mixdrop.ts`, o listener de evento `ended` do elemento `<video>` nativo nÃ£o chamava `notifyEnded()` para emitir `WATCHPLAY_VIDEO_ENDED`.
5. **TransiÃ§Ã£o de Temporada Bloqueada por TMDB Oficial:** Cyberpunk no TMDB oficial declara apenas 1 temporada (`number_of_seasons = 1`). Ao terminar o episÃ³dio 10, o modal calculava `season < seriesDetails.number_of_seasons` (1 < 1 = falso) e declarava "Fim da sÃ©rie alcanÃ§ado", ignorando a Temporada 2 adicionada pelo catÃ¡logo.

**ModificaÃ§Ãµes Realizadas:**
1. **`src/components/NetflixPlayerSkin.tsx`:**
   - Janela de acionamento do card de sÃ©ries atualizada para **120 segundos** (`remainingTime <= 120`) ou tÃ©rmino (`remainingTime <= 5`).
   - Removida a trava `remainingTime > 2`: o card permanece visÃ­vel e interativo se o vÃ­deo chegar a zero.
   - Na contagem regressiva, se o vÃ­deo pausar por ter chegado ao fim do arquivo (`isVideoAtEnd`), o countdown de 10s continua rodando e avanÃ§a automaticamente.
   - Refatorado `nextEpisode` com coerÃ§Ã£o numÃ©rica e suporte a transiÃ§Ã£o de temporada (`Temporada 2 â€¢ EpisÃ³dio 1`).
2. **`src/components/VideoPlayerModal.tsx`:**
   - Atualizado cÃ¡lculo de `totalSeasons` no evento `isEnded` para usar `Math.max(seriesDetails.number_of_seasons, ...availableSeasons)`, garantindo a transiÃ§Ã£o da T1 para a T2.
3. **`server/routes/mixdrop.ts`:**
   - Adicionada emissÃ£o de `notifyEnded()` no evento nativo `ended` do `<video>`.

**ValidaÃ§Ã£o Realizada:**
- Teste TDD automatizado (`scratch/test-next-episode-card.mjs`): 3/3 testes aprovados (janela de 120s, countdown com vÃ­deo finalizado e transiÃ§Ã£o T1 -> T2).
- CompilaÃ§Ã£o backend com esbuild: 0 erros.

---

## 20/10/2026 - CorreÃ§Ã£o de ExpiraÃ§Ã£o de Token e Retomada no StreamTape (Pausa Longa)

**Contexto e MotivaÃ§Ã£o:**
Quando o usuÃ¡rio pausava a reproduÃ§Ã£o no StreamTape por muito tempo (ex.: 1 hora de pausa) e depois clicava em "Play", o episÃ³dio reiniciava do comeÃ§o (segundo 00:00) em vez de continuar do momento onde havia parado. O mesmo problema jÃ¡ havia sido resolvido com sucesso no MixDrop.

**Causas RaÃ­zes Identificadas:**
1. **Backend sem Auto-Healer:** Ao despausar, o elemento `<video>` solicita novos bytes via Range HTTP 206. Como o token da CDN expira, a CDN do StreamTape retornava HTTP 403 Forbidden. Diferente do MixDrop, o proxy `/api/streamtape-stream` repassava o 403 ao navegador, disparando erro de rede fatal.
2. **Cache em MemÃ³ria Excessivo:** O `streamtapeMemoryCache` retinha URLs por 2 horas (`CACHE_TTL_MS = 2 horas`), re-entregando URLs expiradas mesmo apÃ³s tentativas de reload.
3. **AusÃªncia de `fileId` na URL do Stream:** A URL gerada nÃ£o continha o `fileId`, impedindo a re-resoluÃ§Ã£o imediata do token pelo proxy.
4. **Falta de Cache-Buster e Retomada no Frontend:** No `VideoPlayerModal.tsx`, o servidor `srv_streamtape` nÃ£o possuÃ­a `&cb=${Date.now()}` nem `&t=`, impedindo que o recarregamento proativo pÃ³s-pausa longa (> 3 min) atualizasse o iframe mantendo a posiÃ§Ã£o salva.

**ModificaÃ§Ãµes Realizadas:**
1. **`server/routes/streamtapeRoutes.ts`:**
   - Adicionado **Auto-Healer HTTP 403/404/410** em `/api/streamtape-stream`: intercepta a expiraÃ§Ã£o da CDN, invalida o cache, renova a URL do StreamTape em tempo real com `resolveStreamTapeToken` e repete a requisiÃ§Ã£o mantendo o mesmo cabeÃ§alho `Range` HTTP 206 solicitado pelo navegador.
   - Adicionado mapa reverso `directUrlToFileId` e passagem explÃ­cita de `fileId` nas URLs de streaming.
   - Reduzido `CACHE_TTL_MS` de 2 horas para 20 minutos.
   - No `/api/streamtape-proxy-iframe`, adicionado suporte ao parÃ¢metro `t` (tempo inicial), injeÃ§Ã£o de seek nos eventos `loadedmetadata`/`canplay` e auto-recovery inteligente antes de emitir erro fatal.
2. **`src/components/VideoPlayerModal.tsx`:**
   - Atualizados os construtores de URL (`buildUrl`) do StreamTape para sÃ©ries e filmes com `&cb=${Date.now()}` e `&t=${Math.floor(lastKnownTimeRef.current)}`.
   - Adicionada ativaÃ§Ã£o imediata da skin no `handleServerSwitch` para o StreamTape (`serverKey === "srv_streamtape"`).

**ValidaÃ§Ã£o Realizada:**
- Teste TDD automatizado (`scratch/test-streamtape-autohealer.mjs`): 2/2 testes aprovados com sucesso (Auto-Healer com Range 206 e injeÃ§Ã£o de initialSeek).
- Teste de regressÃ£o de temporadas (`scratch/test-dynamic-seasons.mjs`): aprovado.
- Teste de regressÃ£o de seguranÃ§a (`scratch/test-security-patches.mjs`): aprovado.
- CompilaÃ§Ã£o do servidor backend via esbuild (`dist/server.cjs`): 0 erros gerados.

---

## 20/10/2026 - DetecÃ§Ã£o AutomÃ¡tica e DinÃ¢mica de Novas Temporadas (Sem Cache Stale)

**Contexto e MotivaÃ§Ã£o:**
Quando uma nova temporada de sÃ©rie (ex: Cyberpunk: MercenÃ¡rios Temporada 2) era lanÃ§ada no Encontrei.me via MixDrop ou no TMDB, o cliente precisava forÃ§ar a limpeza de cache (Ctrl+Shift+R) para que a nova aba de temporada aparecesse na tela.

**Causas RaÃ­zes Identificadas:**
1. A funÃ§Ã£o de sondagem de rede (`probeSeason` em `server/routes/encontreiLookup.ts`) verificava VIP Player, WatchPlayer, Vizer e Nixplay, mas **nÃ£o sondava o Encontrei.me ao vivo com o Cookie autenticado**. Portanto, novos lanÃ§amentos exclusivos do Encontrei.me nunca eram aprovados pela VPS no primeiro request.
2. O cache local de temporadas no navegador (`tvSeasonsCache` no `src/services/tmdb.ts`) era persistido no `localStorage` com **TTL infinito (sem expiraÃ§Ã£o)**, travando sÃ©ries visitadas anteriormente nas temporadas antigas.
3. As chamadas em `episodeAvailability.ts` e `encontreiCatalog.ts` usavam rotas relativas sem prepender a URL da VPS Oracle no APK Android nativo (Capacitor).
4. O cabeÃ§alho `Cache-Control` do proxy do TMDB (`server/routes/tmdbProxy.ts`) mantinha 15 minutos de retenÃ§Ã£o rÃ­gida no navegador.

**ModificaÃ§Ãµes Realizadas (5 arquivos):**
1. **`server/routes/encontreiLookup.ts`:**
   - Adicionada sondagem prioritÃ¡ria do Encontrei.me Live (`resolveEncontreiEpisode(tmdbId, season, 1)`) dentro de `probeSeason`. Temporadas novas lanÃ§adas no Encontrei.me agora sÃ£o detectadas e aprovadas instantaneamente pela VPS no primeiro clique.
2. **`src/services/tmdb.ts`:**
   - Adicionado controle de validade (`TV_SEASONS_CACHE_TTL = 15 minutos`) e timestamps no `localStorage` para `tvSeasonsCache`, com compatibilidade reversa para o formato antigo.
3. **`src/services/episodeAvailability.ts`:**
   - Adicionada funÃ§Ã£o `getApiBase()` apontando para a VPS Oracle no APK nativo.
   - Adicionada checagem `hasAllCandidates`: se o TMDB anunciar uma temporada nova que nÃ£o estÃ¡ no cache em memÃ³ria, o cliente ignora o cache antigo e re-consulta a VPS.
4. **`src/services/encontreiCatalog.ts`:**
   - Adicionada funÃ§Ã£o `getApiBase()` nas buscas de filme e episÃ³dio para resoluÃ§Ã£o no APK Android.
5. **`server/routes/tmdbProxy.ts`:**
   - Atualizado cabeÃ§alho HTTP para `public, max-age=120, stale-while-revalidate=300`.

**ValidaÃ§Ã£o Realizada:**
- Teste TDD automatizado (`scratch/test-dynamic-seasons.mjs`): 5/5 asserÃ§Ãµes aprovadas com sucesso.
- Teste TDD de regressÃ£o de seguranÃ§a (`scratch/test-security-patches.mjs`): 6/6 aprovados.
- CompilaÃ§Ã£o do backend via esbuild (`dist/server.cjs`): 0 erros gerados.
- SincronizaÃ§Ã£o do grafo de conhecimento Graphify.

---

## 20/10/2026 - Auditoria de SeguranÃ§a e MitigaÃ§Ã£o Imediata (SEC-01 e SEC-04)

**Contexto e MotivaÃ§Ã£o:**
Auditoria de seguranÃ§a ofensiva/defensiva baseada na metodologia da Cloudflare identificou 7 pontos de atenÃ§Ã£o no repositÃ³rio, com foco crÃ­tico em uma vulnerabilidade de Leitura ArbitrÃ¡ria de Arquivos (LFI/Path Traversal) em legendas e um risco de Stored XSS via upload de imagens de bug report.

**Vulnerabilidades Corrigidas:**
1. **SEC-01 (CRÃTICA): Leitura ArbitrÃ¡ria de Arquivos (LFI) em `/api/subtitle-file`:**
   - **Arquivo:** `server/routes/subtitlesRoutes.ts`
   - **Causa:** O parÃ¢metro base64 `path` era decodificado e lido diretamente do disco via `fs.createReadStream(filePath)` sem conferir se pertencia Ã  pasta permitida.
   - **CorreÃ§Ã£o:** Implementada validaÃ§Ã£o canÃ´nica com `path.resolve` e verificaÃ§Ã£o estrita de fronteira (`resolvedPath.startsWith(resolvedCacheDir + path.sep)`). Tentativas de navegaÃ§Ã£o arbitrÃ¡ria fora do cache sÃ£o bloqueadas com `403 Forbidden`. Adicionado cabeÃ§alho `X-Content-Type-Options: nosniff`.
2. **SEC-04 (ALTA): Stored XSS e Path Traversal em `/api/upload-bug-image`:**
   - **Arquivo:** `server.ts`
   - **Causa:** ConcluÃ­a upload usando o nome fornecido pelo usuÃ¡rio e validava apenas cabeÃ§alho de string data URL, permitindo extensÃ£o `.html` ou payload malicioso.
   - **CorreÃ§Ã£o:**
     - Adicionado validador de *magic bytes* em memÃ³ria para arquivos PNG, JPEG, GIF e WEBP.
     - Ignorado qualquer nome vindo do cliente; arquivos salvos com `crypto.randomUUID()` e extensÃ£o fixa pelo tipo MIME autÃªntico.
     - Configurado `express.static('/uploads')` com cabeÃ§alhos de seguranÃ§a `Content-Security-Policy: default-src 'none'; sandbox` e `X-Content-Type-Options: nosniff`.

**ValidaÃ§Ã£o Realizada:**
- Teste TDD automatizado (`scratch/test-security-patches.mjs`): 6/6 asserÃ§Ãµes de seguranÃ§a passando com 100% de sucesso.
- CompilaÃ§Ã£o do backend via esbuild (`dist/server.cjs`): 0 erros gerados.
- Grafo de conhecimento Graphify atualizado (`graphify update .`).

---

## 20/10/2026 - CorreÃ§Ã£o das Miniaturas DinÃ¢micas na Barra de Progresso (Timeline Scrubber)

**Contexto e MotivaÃ§Ã£o:**
Ao arrastar ou passar o dedo na barra de progresso do player, a imagem de prÃ©via permanecia fixa/estÃ¡tica em uma Ãºnica foto em vez de alternar suavemente entre as diferentes cenas do filme ou episÃ³dio de acordo com a posiÃ§Ã£o da agulha.

**Causa Raiz Identificada:**
1. No APK nativo do Android (Capacitor), chamadas relativas ao proxy `/api/tmdb` falhavam por tentarem resolver em `capacitor://localhost/api/tmdb`, fazendo a busca de cenas retornar vazia.
2. No `VideoPlayerModal.tsx`, a prop `tmdbId` ficava `undefined` quando a mÃ­dia era aberta via `resolvedId` numÃ©rico.
3. Quando a lista de miniaturas ficava vazia, o player caÃ­a em um fallback de foto Ãºnica (`nextEpisode?.still_path` estÃ¡tico).

**AlteraÃ§Ãµes Realizadas (4 arquivos):**
1. **`src/services/tmdb.ts`:**
   - Adicionada funÃ§Ã£o `getTmdbApiBase()` garantindo que no APK Android todas as requisiÃ§Ãµes ao proxy TMDB usem o domÃ­nio seguro da VPS Oracle (`https://play-infinity.stream`).
   - Implementado enriquecimento de cenas em 3 nÃ­veis em `getTimelinePreviewImages`: stills especÃ­ficos do episÃ³dio -> stills de episÃ³dios da temporada -> backdrops da sÃ©rie / filme, garantindo sempre entre 10 e 30 cenas reais espalhadas pela timeline.
2. **`src/components/VideoPlayerModal.tsx`:**
   - Definido `effectiveTmdbId` garantindo que tanto `tmdbId` explÃ­cito quanto IDs numÃ©ricos resolvidos sejam repassados corretamente para o player skin.
3. **`src/components/NetflixPlayerSkin.tsx`:**
   - Criada galeria instantÃ¢nea em memÃ³ria `seasonEpisodeStills` a partir de `episodesList`.
   - `previewThumbnail` agora alterna proporcionalmente na `activeGallery` (`timelinePreviews` ou `seasonEpisodeStills`), mudando de cena a cada avanÃ§o percentual da barra.
4. **`android/app/build.gradle`:**
   - `versionCode` incrementado para `34` e `versionName` para `"1.4.2"`.

**ValidaÃ§Ã£o:**
- Teste TDD Automatizado (`scratch/test-dynamic-timeline-preview.mjs`): 7/7 PASS.
- ValidaÃ§Ã£o de tipos TypeScript (`tsc --noEmit`): 0 erros nos arquivos alterados.
- Grafo de conhecimento Graphify sincronizado (`graphify update .`).

---

## 19/10/2026 - CorreÃ§Ã£o do Mini Player (Picture-in-Picture) no APK Android

**Contexto e MotivaÃ§Ã£o:**
No aplicativo APK para Android, ao ativar o modo Picture-in-Picture (PiP) flutuante pelo sistema ou botÃ£o do reprodutor, o modal exibia a interface inteira da pÃ¡gina encolhida em miniatura (cabeÃ§alho com tÃ­tulo, botÃ£o fechar, seletor de temporadas e botÃµes de episÃ³dios da sÃ©rie) com bordas arredondadas e margens, em vez de isolar 100% o vÃ­deo de borda a borda na janela flutuante.

**AlteraÃ§Ãµes Realizadas (5 arquivos):**
1. **`android/app/src/main/java/com/playinfinity/app/PiPPlugin.java`:**
   - Implementado mÃ©todo `@PluginMethod public void enter(PluginCall call)` com `enterPictureInPictureMode(params)` e aspect ratio 16:9, permitindo que a interface web acione o Picture-in-Picture nativo do Android via ponte Capacitor.
2. **`src/components/NetflixPlayerSkin.tsx`:**
   - `handleTogglePiP`: aciona `PiP.enter()` nativo no APK (`Capacitor.isNativePlatform()`), mantendo o mini-player in-app como fallback suave para navegadores desktop.
   - Corrigida a ordem de declaraÃ§Ã£o de `nextEpisode` para uso anterior Ã  inicializaÃ§Ã£o da miniatura da timeline (`previewThumbnail`).
3. **`src/components/VideoPlayerModal.tsx`:**
   - **Isolamento de Janela 100%:** Quando `isNativePiP === true`, o container do modal e o card interno passam para `fixed inset-0 z-[999999] w-full h-full bg-black p-0 m-0 overflow-hidden`.
   - **SupressÃ£o de Elementos Visuais:** Ocultados cabeÃ§alho padrÃ£o, seletor rÃ¡pido de temporadas/episÃ³dios, mini player header e avisos flutuantes durante o PiP.
   - **Stage de VÃ­deo Borda a Borda:** `#player-stage-container` expande em tela cheia (`isExpanded || isNativePiP`) e previne rotaÃ§Ãµes acidentais de paisagem (`isRotated && !isNativePiP`).
   - **RestauraÃ§Ã£o de Estado:** Armazena `wasExpandedBeforePiPRef` para restaurar automaticamente o modo widescreen se o usuÃ¡rio estava em tela cheia ao sair do PiP.
4. **`src/components/LivePlayerModal.tsx`:**
   - Adicionado listener de `pipModeChanged` e integraÃ§Ã£o com `PiP.enter()` e `PiP.setVideoPlaying`.
   - Isolamento total de vÃ­deo na TV ao vivo, suprimindo barras superior/inferior e gaveta de canais no PiP nativo.
5. **`android/app/build.gradle`:**
   - `versionCode` incrementado para `33` e `versionName` para `"1.4.1"`.

**ValidaÃ§Ã£o:**
- Teste TDD Automatizado (`scratch/test-native-pip-isolation.mjs`): 12/12 PASS.
- ValidaÃ§Ã£o de tipos TypeScript (`tsc --noEmit`): 0 erros em todos os arquivos alterados.
- Grafo de conhecimento Graphify sincronizado (`graphify update .`).

---

## 19/10/2026 - Miniatura de PrÃ©via na Barra de Progresso / Timeline Scrubber (Estilo Netflix & Disney+)

**Contexto e MotivaÃ§Ã£o:**
ImplementaÃ§Ã£o da miniatura flutuante de cenas durante o arrasto ou passagem do mouse/toque na barra de progresso (scrubber). Ao navegar pelo filme ou episÃ³dio, surge suavemente acima da agulha um card cinematogrÃ¡fico 16:9 exibindo a cena correspondente Ã quele timestamp, o tempo formatado em destaque e proteÃ§Ã£o dinÃ¢mica de bordas para nunca vazar das laterais da tela (Mobile-First).

**AlteraÃ§Ãµes Realizadas (3 arquivos):**
1. **`src/services/tmdb.ts`:**
   - Implementada a funÃ§Ã£o `getTimelinePreviewImages(tmdbId, mediaType, season, episode)` que extrai galerias de cenas reais (backdrops para filmes e stills para episÃ³dios de sÃ©ries) utilizando a camada resiliente de cache em memÃ³ria `fetchTmdbRaw`.
2. **`src/components/NetflixPlayerSkin.tsx`:**
   - **Busca e PrÃ©-Carregamento em Background:** Carrega antecipadamente as fotos de cenas ao abrir o vÃ­deo e realiza prÃ©-cache no navegador via `new Image().src`, garantindo alternÃ¢ncia instantÃ¢nea sem engasgos.
   - **Touch Scrubbing Mobile:** Habilitada a atualizaÃ§Ã£o contÃ­nua de `hoverTime` e `hoverPosPercent` durante eventos de toque (`touchstart`, `touchmove`, `touchend`) no celular.
   - **Card Flutuante 16:9:** RenderizaÃ§Ã£o responsiva (`w-32 sm:w-44`) com proporÃ§Ã£o 16:9, cantos arredondados, backdrop blur, anel de brilho Laranja Play Infinity, tag de cena/episÃ³dio e indicador apontando para a agulha da barra.
   - **ProteÃ§Ã£o de Borda (Clamp):** PosiÃ§Ã£o horizontal calculada matematicamente (`clampedPosPercent`) para manter o card sempre dentro do viewport, mesmo nos extremos (0% e 100%).
3. **`android/app/build.gradle`:**
   - `versionCode` incrementado para `32` e `versionName` para `"1.4.0"`.

**ValidaÃ§Ã£o:**
- Teste TDD Automatizado (`scratch/test-timeline-preview.mjs`): 23/23 PASS.
- ValidaÃ§Ã£o sintÃ¡tica AST TypeScript (`tmdb.ts`, `NetflixPlayerSkin.tsx`): 0 erros.
- Grafo de conhecimento Graphify sincronizado (`graphify update .`).

---

## 19/10/2026 - Card de PrÃ³ximo Filme da Saga / ContinuaÃ§Ã£o (Estilo Netflix & Disney+)

**Contexto e MotivaÃ§Ã£o:**
ExtensÃ£o do sistema de continuidade inteligente do reprodutor para filmes que possuem continuaÃ§Ã£o ou pertencem a franquias/sagas (ex.: *Velozes & Furiosos 1 âž” 2*, *John Wick 1 âž” 2*, *Avatar 1 âž” 2*, *Duna 1 âž” 2*, *Harry Potter*, etc.). Ao alcanÃ§ar os crÃ©ditos finais do filme (~120s restantes ou 90%+ assistido em longa-metragens), o player exibe suavemente um card flutuante premium com miniatura 16:9, ano de lanÃ§amento, nome da saga, tÃ­tulo da sequÃªncia, sinopse, contagem regressiva de 10s e botÃ£o direto para assistir a continuaÃ§Ã£o.

**AlteraÃ§Ãµes Realizadas (4 arquivos):**
1. **`src/App.tsx`:**
   - Adicionada a propriedade `onPlayMovie={openPlayer}` no `<VideoPlayerModal ... />`, permitindo a transiÃ§Ã£o direta entre o filme assistido e sua sequÃªncia dentro do mesmo modal em tela cheia.
2. **`src/components/VideoPlayerModal.tsx`:**
   - Implementado resolvedor em 2 nÃ­veis (`detectNextMovieInFranchise`):
     - **1Âº NÃ­vel (CatÃ¡logo Local):** Consulta `sagas.ts` e identifica se o filme atual faz parte de uma franquia com sequÃªncia imediata.
     - **2Âº NÃ­vel (TMDB Collections):** Para filmes fora do catÃ¡logo local, consulta `belongs_to_collection` e busca a lista de partes ordenadas por `release_date`.
   - Adicionado callback `handlePlayNextMovie` acionando `onPlayMovie` com o prÃ³ximo tÃ­tulo e metadata de vÃ­deo.
   - Repassados `nextMovieInfo` e `onPlayNextMovie` para `NetflixPlayerSkin`.
3. **`src/components/NetflixPlayerSkin.tsx`:**
   - Exportada a interface `NextMovieInfo` e adicionada aos props do componente.
   - HeurÃ­stica de disparo de filmes: `duration >= 600 && remainingTime <= 120 && remainingTime > 2 && playedPercent >= 90`.
   - Card flutuante adaptativo: exibe tag da saga, ano, tÃ­tulo do prÃ³ximo filme, thumbnail 16:9, barra de progresso regressiva Laranja/Ã‚mbar e botÃ£o **[ â–¶ Assistir PrÃ³ximo Filme ]**.
   - Handler de clique unificado (`handlePlayNext`) com timer sincronizado ao estado de pausa do reprodutor.
4. **`android/app/build.gradle`:**
   - `versionCode` incrementado para `31` e `versionName` para `"1.3.9"`.

**ValidaÃ§Ã£o:**
- Teste TDD Automatizado (`scratch/test-next-movie-sequel.mjs`): 20/20 PASS.
- ValidaÃ§Ã£o sintÃ¡tica AST TypeScript (`App.tsx`, `VideoPlayerModal.tsx`, `NetflixPlayerSkin.tsx`): 0 erros.
- Grafo de conhecimento Graphify sincronizado (`graphify update .`).

---

## 19/10/2026 - Card de PrÃ³ximo EpisÃ³dio Flutuante (Estilo Netflix & Disney+)

**Contexto e MotivaÃ§Ã£o:**
ImplementaÃ§Ã£o do recurso de reproduÃ§Ã£o contÃ­nua inteligente para sÃ©ries. Quando o episÃ³dio atinge os crÃ©ditos finais (Ãºltimos ~75 segundos ou 85%+ assistido), surge suavemente um card flutuante premium no estilo Netflix e Disney+ com contagem regressiva de 10s e prÃ©via da cena do prÃ³ximo capÃ­tulo, permitindo que o usuÃ¡rio avance instantaneamente sem precisar assistir aos crÃ©ditos ou aguardar o fim da tela preta.

**AlteraÃ§Ãµes Realizadas (2 arquivos):**
1. **`src/components/NetflixPlayerSkin.tsx`:**
   - **ResoluÃ§Ã£o AutomÃ¡tica de EpisÃ³dio (`nextEpisode`):** Localiza o prÃ³ximo episÃ³dio na mesma temporada (`episodesList.find`) ou, caso seja o episÃ³dio final da temporada, prepara o primeiro episÃ³dio da temporada seguinte (`availableSeasons`).
   - **HeurÃ­stica de DetecÃ§Ã£o:** Disparo automÃ¡tico aos 75s restantes (`remainingTime <= 75 && playedPercent >= 85` com duraÃ§Ã£o mÃ­nima de 120s). Se o usuÃ¡rio rebobinar para antes dos crÃ©ditos (> 90s), o card se oculta automaticamente.
   - **Contagem Regressiva de 10s:** CronÃ´metro regressivo que pausa quando o vÃ­deo Ã© pausado (`playerStatus.paused`) e avanÃ§a automaticamente para o prÃ³ximo episÃ³dio ao zerar (`handlePlayNextEpisode`).
   - **AÃ§Ã£o de Cancelamento:** BotÃ£o `âœ•` que dispensa a contagem e permite assistir aos crÃ©ditos inteiros sem interrupÃ§Ã£o (`isPromptDismissed`).
   - **Visual Mobile-First & Glassmorphism:**
     - Layout adaptativo: `left-3 right-3 sm:left-auto sm:right-6 sm:w-[390px]`, sem qualquer overflow horizontal.
     - Miniatura real 16:9 (`still_path` TMDB `w300`) com overlay de play.
     - Destaque oficial Play Infinity: Tag `T{season} â€¢ E{episode}` e cronÃ´metro em Laranja (`orange-500` / `amber-500`).
     - Barra de progresso regressiva animada diminuindo de 100% a 0% ao longo dos 10 segundos.
     - BotÃ£o ergonÃ´mico de toque **[ â–¶ Assistir Agora ]** (`active:scale-95`).
2. **`android/app/build.gradle`:**
   - `versionCode` incrementado para `30` e `versionName` para `"1.3.8"`.

**ValidaÃ§Ã£o:**
- Teste TDD Automatizado (`scratch/test-next-episode-card.mjs`): 10/10 PASS.
- ValidaÃ§Ã£o sintÃ¡tica AST TypeScript: 0 erros.
- Grafo de conhecimento Graphify sincronizado (`graphify update .`).

---

## 19/10/2026 - CorreÃ§Ã£o Mobile-First da PÃ¡gina de Sagas e RestauraÃ§Ã£o da Franquia James Bond 007

**Contexto e DiagnÃ³stico (Imagem mobile enviada pelo usuÃ¡rio):**
1. **SobreposiÃ§Ã£o do botÃ£o "Assistir Parte 1" (`src/components/SagasPage.tsx`):** O banner possuÃ­a altura fixa de `h-[50vh]` com o conteÃºdo ancorado em `absolute bottom-0` (`p-4`). Logo abaixo, o container do seletor de sagas aplicava `-mt-8` (`margin-top: -2rem`) com `z-20`, puxando o carrossel 32px para cima e sobrepondo a metade inferior do botÃ£o branco no celular.
2. **Filmes AleatÃ³rios na Saga 007 (`src/data/sagas.ts`):** O catÃ¡logo de `james-bond-007-cole-o` continha IDs TMDB nÃ£o relacionados ao agente secreto, exibindo filmes como *Monstros S.A.* (`585`), *The Matrix Revolutions* (`605`), *Men in Black* (`607`), *Interview with the Vampire* (`628`), *Central do Brasil* (`666`), *Harry Potter e a Pedra Filosofal* (`671`), *Harry Potter e a Ordem da FÃªnix* (`675`), *Waitress* (`10758`) e *Griet* (`605662`).

**AlteraÃ§Ãµes Realizadas (3 arquivos):**
1. **`src/components/SagasPage.tsx`:**
   - Banner com altura mÃ­nima responsiva: `min-h-[480px] sm:min-h-[540px] md:h-[65vh] lg:h-[75vh] flex flex-col justify-end pt-20 sm:pt-24`.
   - ConteÃºdo relativo com padding inferior seguro: `relative w-full p-4 sm:p-8 lg:p-12 pb-16 sm:pb-20 lg:pb-24 z-10`. Com `pb-16` (64px) no banner e `-mt-8` (-32px) no seletor, resta uma folga limpa de 32px, eliminando qualquer colisÃ£o ou sobreposiÃ§Ã£o no celular.
   - Sinopse com `line-clamp-3 sm:line-clamp-none` para evitar deslocamento vertical em sinopses longas (ex.: *O Senhor dos AnÃ©is*).
   - BotÃ£o "Assistir Parte 1" com `disabled={isLoading || !sagaMovies[0]}` e `active:scale-95`.
2. **`src/data/sagas.ts`:**
   - Inseridos os 26 filmes oficiais da franquia James Bond 007 (ColeÃ§Ã£o TMDB ID 645) em rigorosa ordem cronolÃ³gica (1962â€“2021), de *Dr. No* (`646`) a *No Time to Die* (`370172`).
   - Atualizado o backdrop para a arte oficial da coleÃ§Ã£o: `/dOSECZImeyZldoq0ObieBE0lwie.jpg`.
3. **`android/app/build.gradle`:**
   - `versionCode` incrementado para `29` e `versionName` para `"1.3.7"`.

**ValidaÃ§Ã£o:**
- Teste TDD Automatizado (`scratch/test-sagas-page.mjs`): 10/10 PASS.
- ValidaÃ§Ã£o sintÃ¡tica AST TypeScript: 0 erros.
- Grafo de conhecimento Graphify sincronizado (`graphify update .`).

---

## 19/10/2026 - OtimizaÃ§Ã£o Mobile-First e RotaÃ§Ã£o FÃ­sica do Player de TV ao Vivo (LivePlayerModal)

**Contexto e DiagnÃ³stico (Imagens 1 e 2 enviadas pelo usuÃ¡rio):**
O usuÃ¡rio comparou o visual do site em paisagem (Imagem 1, layout expandido e harmÃ´nico) com o app Android instalado na versÃ£o 1.1.8 em modo retrato (Imagem 2, controles cortados Ã  direita e vÃ­deo distorcido/girado isoladamente):
1. **AusÃªncia do plugin `@capacitor/screen-orientation` em `LivePlayerModal.tsx`:** O player de TV chamava `(screen.orientation).lock()`, que Ã© ignorado pela WebView do Android sem o plugin nativo do Capacitor.
2. **Hack CSS `rotate(90deg)` isolado no vÃ­deo:** Como a Activity nÃ£o girava para paisagem, o cÃ³digo aplicava rotaÃ§Ã£o de 90Â° apenas no elemento de vÃ­deo, mantendo a barra de controles na horizontal dentro da largura restrita do celular em pÃ© (380px).
3. **Overflow horizontal na barra inferior de controles:** A barra de controles tentava exibir o slider de volume (140px), botÃµes e seletores em linha Ãºnica sem compactaÃ§Ã£o, empurrando o seletor de servidores, o PiP e o botÃ£o de tela cheia para fora da tela.

**AlteraÃ§Ãµes Realizadas (2 arquivos):**
1. **`src/components/LivePlayerModal.tsx`:**
   - Importado e integrado `ScreenOrientation` e `Capacitor` do ecossistema nativo.
   - Ativado `ScreenOrientation.lock({ orientation: 'landscape' })` ao abrir a TV no app Android, girando a tela fÃ­sica por completo em modo paisagem Full HD (idÃªntico ao site).
   - `ScreenOrientation.unlock()` adicionado no fechamento (`handleClose`), no mini player e no unmount.
   - Removido o hack de `rotate(90deg)` isolado no elemento de vÃ­deo.
   - **Mobile-First na barra inferior:** Slider de volume protegido com `hidden sm:flex` (em celulares o volume Ã© controlado fisicamente pelos botÃµes do aparelho), garantindo que todos os botÃµes essenciais (Play, Prev, Next, Mute, Reload, Seletor de Servidor, PiP e Tela Cheia) caibam com folga mesmo em viewports estreitos (360px a 430px) sem qualquer overflow horizontal.
   - **Mobile-First na barra superior:** TÃ­tulo e subtÃ­tulo do canal com `truncate` e badge de sinal estÃ¡vel limpo em telas pequenas.
2. **`android/app/build.gradle`:**
   - `versionCode` incrementado para `28` e `versionName` para `"1.3.6"`.

**ValidaÃ§Ã£o:**
- Teste TDD Responsivo & OrientaÃ§Ã£o (`scratch/test-live-player-responsive.mjs`): 7/7 PASS.
- Teste TDD Ordem dos Servidores (`scratch/test-server-order.mjs`): 8/8 PASS.
- Zero erros de compilaÃ§Ã£o em `LivePlayerModal.tsx`.
- Grafo Graphify sincronizado.

---

## 19/10/2026 - UnificaÃ§Ã£o Universal de Servidores: RemoÃ§Ã£o de Overrides Residuais e Sequenciamento Rigoroso

**Contexto e MotivaÃ§Ã£o:**
ApÃ³s diagnÃ³stico minucioso que comprovou que o arquivo do episÃ³dio Fantasmas T5:E8 (`xwwe4pvxsvj37d`) foi deletado na origem do MixDrop (mesmo retornando HTTP 200 da pÃ¡gina), identificamos que o player possuÃ­a duas regras condicionais hardcoded (`targetSeason >= 5 && tmdbId === 126027`) forÃ§ando a abertura pelo MixDrop em vez de respeitar a ordem padrÃ£o.
Conforme solicitaÃ§Ã£o do usuÃ¡rio, todos os overrides especÃ­ficos foram removidos para que 100% das sÃ©ries e filmes sigam estritamente a linha padrÃ£o unificada: **1Âº StreamTape HD -> 2Âº MixDrop HD -> 3Âº WatchPlayer Oficial -> 4Âº VIP Player Dublado -> 5Âº Nixplay -> 6Âº Seriesflix HD**.

**AlteraÃ§Ãµes Realizadas (2 arquivos):**
1. **`src/components/VideoPlayerModal.tsx`:**
   - Removido o bypass residual de Fantasmas T5 em `setupInitialServer` (linhas ~1503-1513) que forÃ§ava `targetServerKey = "srv_mixdrop"`.
   - Removido o override em `handleSeasonChange` (linhas ~2118-2121) que forÃ§ava a troca para `srv_mixdrop`.
   - Toda inicializaÃ§Ã£o e troca de temporada agora respeita rigorosamente a cadeia unificada.
2. **`android/app/build.gradle`:**
   - `versionCode` incrementado para `27` e `versionName` para `"1.3.5"`.

**ValidaÃ§Ã£o:**
- Teste TDD de ReordenaÃ§Ã£o e UnificaÃ§Ã£o (`scratch/test-server-order.mjs`): 8/8 PASS.
- Teste TDD StreamTape (`scratch/test-streamtape.mjs`): 6/6 PASS.
- Teste TDD MixDrop Buffer (`scratch/test-mixdrop-stability.mjs`): 5/5 PASS.
- Grafo de conhecimento Graphify atualizado e sincronizado (`graphify update .`).

---

## 19/10/2026 - ReordenaÃ§Ã£o de Servidores: StreamTape 1Âº PrimÃ¡rio, MixDrop 2Âº Fallback e DesativaÃ§Ã£o do DoodStream da Cadeia Ativa

**Contexto e MotivaÃ§Ã£o:**
ApÃ³s diagnÃ³stico em lote que evidenciou bloqueio do DoodStream pela Cloudflare (`HTTP 403` e `x-frame-options: SAMEORIGIN`), o reprodutor foi reorganizado conforme solicitaÃ§Ã£o do usuÃ¡rio:
1. **StreamTape HD** assume o posto de **1Âº servidor primÃ¡rio padrÃ£o** para filmes e sÃ©ries (MP4 direto de alta performance, sem iframes externos).
2. **MixDrop HD** assume o posto de **2Âº servidor de fallback imediato**.
3. **DoodStream HD** foi **removido da cadeia de reproduÃ§Ã£o ativa** e do seletor da skin, evitando qualquer travamento ou tela branca (seu cÃ³digo e endpoints permanecem preservados no backend, e o status falso simulado foi desarmado com retorno de erro 502 imediato com `WATCHPLAY_ERROR`).
4. **WatchPlayer Oficial** (3Âº) e **VIP Player** (4Âº) seguem como retaguarda.

**AlteraÃ§Ãµes Realizadas (4 arquivos):**
1. **`src/components/VideoPlayerModal.tsx`:**
   - Reordenado `servers`: `srv_streamtape` no topo (1Âº lugar), `srv_mixdrop` em 2Âº lugar (sÃ©ries e filmes).
   - Removido `srv_doodstream` da lista ativa de `servers`.
   - `initialServerKey || "srv_streamtape"` e `targetServerKey = ... || "srv_streamtape"` como padrÃ£o de abertura.
   - Atualizado `skinSupported` para remover `srv_doodstream`.
2. **`src/components/NetflixPlayerSkin.tsx`:**
   - Reordenada a lista `displayAudioServers`: `StreamTape HD` 1Âº, `MixDrop HD` 2Âº, omitindo DoodStream do menu visual.
3. **`server/routes/doodstreamRoutes.ts`:**
   - Desarmado o loop de `setInterval` com status simulado no modo embed.
   - Retorno imediato de HTTP 502 com postMessage `WATCHPLAY_ERROR` se chamado sem direct stream MP4.
4. **`android/app/build.gradle`:**
   - `versionCode` incrementado para `26` e `versionName` para `"1.3.4"`.

**ValidaÃ§Ã£o:**
- Teste TDD de ReordenaÃ§Ã£o (`scratch/test-server-order.mjs`): 7/7 PASS.
- Teste TDD StreamTape (`scratch/test-streamtape.mjs`): 6/6 PASS.
- Teste TDD MixDrop Buffer (`scratch/test-mixdrop-stability.mjs`): 5/5 PASS.
- Grafo de conhecimento Graphify sincronizado (`graphify update .`).

---

## 19/10/2026 - IntegraÃ§Ã£o do Servidor DoodStream HD (3Âº Fallback VOD, Busca Live e Escudo Anti-Popup)

**Contexto e MotivaÃ§Ã£o:**
IntegraÃ§Ã£o completa do **DoodStream HD** como 3Âº servidor de fallback para Filmes e SÃ©ries (MixDrop 1Âº -> StreamTape 2Âº -> DoodStream 3Âº -> WatchPlayer 4Âº), aproveitando 34.391 fileIds jÃ¡ catalogados em `data/encontrei-catalog.json` e busca ao vivo (Live Mode: Encontrei.me primeiro, Vizer como fallback).

**AlteraÃ§Ãµes Realizadas (7 arquivos + 1 novo router):**
1. **Allowlist de SeguranÃ§a (`server/utils/helpers.ts`):** Adicionados domÃ­nios do ecossistema DoodStream (`doodstream.com`, `dood.to`, `dood.so`, `dood.ws`, `dood.pm`, `dood.wf`, `dood.la`, `dood.sh`, `doodcdn.co`, `doods.pro`, `playmogo.com`, `cloudatacdn.com`, `ds2play.com`, `do0od.com`, `dood.watch`) em `ALLOWED_STREAMING_DOMAINS` e herdados por `ALLOWED_LIVE_STREAMING_DOMAINS`.
2. **ExtraÃ§Ã£o do CatÃ¡logo e Busca Live (`server/routes/encontreiLookup.ts` & `src/services/encontreiCatalog.ts`):**
   - Habilitada captura da flag `doodstream` nas interfaces TypeScript e rotas do backend e frontend (`findMovieByTmdbId`, `findEpisode` e `EncontreiResult`).
   - `resolveEncontreiEpisode`, `resolveEncontreiMovie`, `resolveVizerEpisode` e `resolveVizerMovie` capturam e retornam `doodstream` ao vivo.
3. **Router Dedicado com Escudo Anti-Popup (`server/routes/doodstreamRoutes.ts`):**
   - Endpoint `/api/doodstream-proxy-iframe` com sandbox anti-popup (`sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"`), supressÃ£o de popups (`window.open = null`) e fallback imediato (< 50ms) com `WATCHPLAY_ERROR` se o vÃ­deo estiver deletado/inexistente.
   - Endpoint `/api/doodstream-resolve` com cache LRU em memÃ³ria (TTL 2h) para extraÃ§Ã£o de direct streaming url.
   - Endpoint `/api/doodstream-stream` (Proxy de vÃ­deo HTTP 206 RFC 9110 com `Content-Length` correto e cancelamento com AbortController).
4. **ProteÃ§Ã£o Anti-DDoS e Buffer Ilimitado (`server.ts`):** Rotas `/api/doodstream-stream` e `/api/doodstream-proxy-iframe` protegidas pelo `liveStreamLimiter` (600 req/min).
5. **Ordem de Prioridade e Fallback (`VideoPlayerModal.tsx` & `NetflixPlayerSkin.tsx`):**
   - **1Âº Player Principal:** MixDrop HD (`srv_mixdrop`).
   - **2Âº Fallback:** StreamTape HD (`srv_streamtape`).
   - **3Âº Fallback:** DoodStream HD (`srv_doodstream`).
   - **4Âº em diante:** WatchPlayer (`srv_watchplay`), VIP Player (`srv_vip`), Nixplay (`srv_nixplay`).
6. **SeÃ§Ã£o "Ãudio / Servidor" na Skin Netflix (`src/components/NetflixPlayerSkin.tsx`):** Mapeado `srv_doodstream` em `selectedAudio` e posicionado como 3Âª opÃ§Ã£o no menu de Ã¡udio/servidores.
7. **Versionamento Android (`android/app/build.gradle`):** Incrementado `versionCode` para `25` e `versionName` para `"1.3.3"`.

**ValidaÃ§Ã£o:**
- Teste TDD automatizado (`scratch/test-doodstream.mjs`): 7/7 PASS.
- Teste TDD StreamTape (`scratch/test-streamtape.mjs`): 6/6 PASS.
- Teste TDD MixDrop Buffer (`scratch/test-mixdrop-stability.mjs`): 5/5 PASS.
- AnÃ¡lise sintÃ¡tica AST TypeScript: 0 erros (`npx tsc --noEmit`).
- Grafo de conhecimento Graphify sincronizado (`graphify update .`).

---

## 19/10/2026 - Fix de Fallback Imediato do StreamTape (Zero Espera no Watchdog) e AtualizaÃ§Ã£o de DomÃ­nio do Vizer

**Contexto e DiagnÃ³stico do Bug (Fantasmas S5E8):**
1. **Espera de 10s no Watchdog Eliminada (`server/routes/streamtapeRoutes.ts`):** Quando o StreamTape retornava erro (404 arquivo inexistente, 502 vÃ­deo expirado ou erro no elemento `<video>`), o backend devolvia HTML estÃ¡tico sem script de postMessage. O frontend ficava travado esperando os 10s do watchdog para entÃ£o trocar de servidor. Adicionada a emissÃ£o imediata de `window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "..." })` para todos os fluxos de erro (404, 502, 500 e erro do `<video>`), garantindo comutaÃ§Ã£o silenciosa em < 50ms.
2. **AtualizaÃ§Ã£o de DomÃ­nio do Vizer (`server/routes/encontreiLookup.ts`):** O Vizer migrou seu domÃ­nio ativo para `https://www.vizer.uno`. A lista `VIZER_DOMAINS` foi atualizada adicionando `https://www.vizer.uno` como primÃ¡rio, eliminando atrasos e redirecionamentos intermediÃ¡rios.
3. **SanitizaÃ§Ã£o de TÃ­tulo na Busca Live (`VideoPlayerModal.tsx` & `encontreiLookup.ts`):** O tÃ­tulo enviado pelo frontend continha o nome completo do episÃ³dio (ex: `"Fantasmas - T5:E8 A Vida e a Ã‰poca de Esther Greene"`), o que quebrava o matching de slugs com a sÃ©rie base `"fantasmas"`. Adicionada sanitizaÃ§Ã£o (`split(/\s*-\s*(?:T\d|Temporada|\d+Âª\s*Temp)/i)[0].trim()`) tanto no frontend (`lookupMixdropFileId`, `srv_streamtape`, `srv_vip`) quanto no backend (`encSlugMatchesTitle`).
4. **Ajuste de TolerÃ¢ncia do Watchdog (`VideoPlayerModal.tsx` & `streamtapeRoutes.ts`):** O watchdog de seguranÃ§a para inÃ­cio da reproduÃ§Ã£o foi elevado de 10s para **no mÃ­nimo 15 segundos** (e 18s para o WatchPlayer). Isso evita quedas ou trocas prematuras em conexÃµes oscilantes ou com buffering inicial mais longo, mantendo a comutaÃ§Ã£o instantÃ¢nea (< 50ms) caso o servidor emita erro real. O timeout de resoluÃ§Ã£o HEAD do StreamTape tambÃ©m subiu para 15s.
5. **Fix do Honeypot Anti-Scraping do StreamTape (`server/routes/streamtapeRoutes.ts`):** O StreamTape coloca divs ocultos com tokens falsos (`ideoolink` com `idb=`) para enganar scrapers estÃ¡ticos. A regex antiga caÃ­a nesse honeypot e falhava com 502 em vÃ­deos vivos (ex: VisionQuest S1E2 `z6yr690jWAtYO6b`). O resolver foi corrigido para executar a decodificaÃ§Ã£o dinÃ¢mica estritamente dos elementos `botlink` e `robotlink` com `&stream=1`, retornando HTTP 302 direto da CDN (`tapecontent.net`).
6. **Estabilidade de Buffer do MixDrop & RFC 9110 (`server/routes/mixdrop.ts` & `streamtapeRoutes.ts`):**
   - O proxy `/api/md-proxy` e `/api/streamtape-stream` dropavam indevidamente o header `Content-Length`, gerando streams parciais chunked indeterminados. No Chrome/Android WebView, isso causava esgotamento do buffer aos 20-24s de vÃ­deo e encerramento prematuro da conexÃ£o por timeout na CDN da origem. Agora repassa `Content-Length` em conformidade com HTTP 206 RFC 9110.
   - Adicionado `moreVideoAttr: { preload: "auto" }` no ArtPlayer para assegurar prÃ©-carregamento contÃ­nuo.
   - O Auto-Healer de A/V sync e o vigia de congelamento foram protegidos para ignorar o buffer inicial de rede e sÃ³ aplicar micro-ajustes se houver buffer local abastecido (`>= 2.0s`), eliminando seeks repetitivos que esvaziavam o pipeline.
7. **Versionamento Android (`android/app/build.gradle`):** Incrementado `versionCode` para `24` e `versionName` para `"1.3.2"`.

**ValidaÃ§Ã£o:**
- Teste TDD StreamTape (`scratch/test-streamtape.mjs`): 6/6 PASS.
- Teste TDD MixDrop Buffer (`scratch/test-mixdrop-stability.mjs`): 5/5 PASS.
- SincronizaÃ§Ã£o do grafo Graphify (`graphify update .`).

---

## 19/10/2026 - IntegraÃ§Ã£o do Servidor StreamTape HD (Fallback VOD, Busca Live e Skin Netflix 100%)

**Contexto e MotivaÃ§Ã£o:**
ReativaÃ§Ã£o e integraÃ§Ã£o completa do **StreamTape HD** como servidor secundÃ¡rio/fallback de alta velocidade para Filmes e SÃ©ries, aproveitando 34.395 fileIds jÃ¡ catalogados em `data/encontrei-catalog.json`. Conforme determinaÃ§Ã£o do usuÃ¡rio, o DoodStream foi descartado e a implementaÃ§Ã£o focou exclusivamente no StreamTape via bypass pÃºblico ilimitado (sem limite de 25 downloads/dia da API) com suporte a busca ao vivo (Live Mode: Encontrei.me primeiro, Vizer como fallback).

**AlteraÃ§Ãµes Realizadas (7 arquivos):**
1. **Allowlist de SeguranÃ§a (`server/utils/helpers.ts`):** Adicionados domÃ­nios `streamtape.com`, `tapecontent.net`, `strtape.tech`, `streamtape.net`, `streamtape.cc`, `streamtape.site`, `tapenation.com` e `tape.xxx` em `ALLOWED_STREAMING_DOMAINS` e herdados por `ALLOWED_LIVE_STREAMING_DOMAINS`.
2. **ExtraÃ§Ã£o do CatÃ¡logo e Busca Live (`server/routes/encontreiLookup.ts` & `src/services/encontreiCatalog.ts`):**
   - Habilitada a captura da flag `streamtape` nas rotas do backend e no frontend (`findMovieByTmdbId`, `findEpisode` e `EncontreiResult`).
   - `resolveEncontreiEpisode` e `resolveEncontreiMovie` agora capturam e retornam `streamtape` ao vivo (com prioridade no Encontrei.me e fallback no Vizer).
3. **Router Dedicado e Auto-RecuperaÃ§Ã£o (`server/routes/streamtapeRoutes.ts`):**
   - FunÃ§Ã£o `resolveStreamTapeToken(fileId)` com cache LRU em memÃ³ria (TTL 2h) e bypass de token pÃºblico via script regex/eval seguro.
   - Endpoint `/api/streamtape-proxy-iframe` com resoluÃ§Ã£o ao vivo sob demanda: se o `fileId` nÃ£o estiver no catÃ¡logo ou se o link expirar, re-sonda automaticamente o Encontrei.me e o Vizer em tempo real para obter um novo fileId funcional.
   - Endpoint `/api/streamtape-stream` (Proxy de vÃ­deo com suporte a Range HTTP 206, remoÃ§Ã£o de `Content-Length` anti-mismatch e propagaÃ§Ã£o de aborts).
4. **ProteÃ§Ã£o Anti-DDoS e Buffer Ilimitado (`server.ts`):** Rotas `/api/streamtape-stream` e `/api/streamtape-proxy-iframe` protegidas pelo `liveStreamLimiter` (600 req/min) â€” a mesma configuraÃ§Ã£o que eliminou travamentos e garantiu buffer no MixDrop.
5. **Ordem de Prioridade e Fallback (`VideoPlayerModal.tsx` & `NetflixPlayerSkin.tsx`):**
   - **1Âº Player Principal:** MixDrop HD (`srv_mixdrop`) com ciclo completo (Vizer/Encontrei e auto-recuperaÃ§Ã£o).
   - **2Âº Fallback Imediato:** StreamTape HD (`srv_streamtape`) acionado assim que o fluxo do MixDrop esgota suas tentativas.
   - **3Âº em diante:** WatchPlayer (`srv_watchplay`), VIP Player (`srv_vip`), Nixplay (`srv_nixplay`) e Seriesflix HD (`srv_vidsrc`).
6. **SeÃ§Ã£o "Ãudio / Servidor" na Skin Netflix (`src/components/NetflixPlayerSkin.tsx`):** Mapeado `srv_streamtape` em `selectedAudio` e posicionado como 2Âª opÃ§Ã£o logo abaixo do MixDrop no menu do player.
7. **Versionamento Android (`android/app/build.gradle`):** Incrementado `versionCode` para `23` e `versionName` para `"1.3.1"`.

**ValidaÃ§Ã£o:**
- Teste TDD automatizado (`scratch/test-streamtape.mjs`): 7/7 PASS.
- AnÃ¡lise sintÃ¡tica AST TypeScript: 0 erros nos 7 arquivos modificados.
- Grafo de conhecimento Graphify atualizado (`graphify update .`).

---

## 19/10/2026 - Fix "Ver SÃ©rie" nas NotificaÃ§Ãµes, Badges de Workflows e RemoÃ§Ã£o do Google Drive

**Contexto e DiagnÃ³stico via Graphify:**
1. **Bug do "Ver SÃ©rie" abrindo Homem-Aranha (`DetailsPage.tsx`, `NotificationModal.tsx`, `App.tsx`):**
   - Ao clicar em "Ver sÃ©rie" no modal de notificaÃ§Ãµes para uma sÃ©rie que nÃ£o constava na lista estÃ¡tica inicial da home (`src/data.ts`), `DetailsPage` executava `allCatalogs.find(...) || allCatalogs[0]`.
   - O item no Ã­ndice 0 Ã© "HOMEM-ARANHA: UM NOVO DIA". `DetailsPage` assumia Homem-Aranha como item ativo e carregava seus dados do TMDB, substituindo a sÃ©rie real (ex: "Stuart NÃ£o Consegue Salvar o Universo").
   - SoluÃ§Ã£o: Eliminado o fallback cego `|| allCatalogs[0]`, criado objeto casca dinÃ¢mico para `itemId` e repassado o `itemData` completo a partir de `NotificationModal.tsx` e `App.tsx`.
2. **IdentificaÃ§Ã£o Visual dos Workflows no Painel Admin (`AdminDeployMonitor.tsx`):**
   - Adicionada funÃ§Ã£o `getWorkflowBadge()` para exibir etiquetas coloridas (`[Deploy VPS]` em laranja e `[Build Android]` em azul) tanto no card de deploy ativo quanto na lista do histÃ³rico recente, eliminando a impressÃ£o de "commits duplicados".
3. **RemoÃ§Ã£o do Workflow do Google Drive (`.github/workflows/sync-drive.yml`):**
   - Removido o arquivo de sincronizaÃ§Ã£o com o Google Drive para cessar execuÃ§Ãµes desnecessÃ¡rias no push.
4. **Versionamento Android (`android/app/build.gradle`):**
   - Incrementado `versionCode` para 21 (`versionName "1.2.9"`).

**ValidaÃ§Ã£o:**
- Teste TDD automatizado (`scratch/test-fixes.mjs`): 5/5 PASS.
- SincronizaÃ§Ã£o do Grafo Graphify (`graphify update .`): 0 erros.

---

## 19/10/2026 - OtimizaÃ§Ã£o Integral da ReproduÃ§Ã£o de TV ao Vivo (5 Gargalos Eliminados)

**Contexto e DiagnÃ³stico via Graphify:**
Auditoria completa no fluxo de streaming de canais de TV ao vivo (`liveChannels.ts`, `LivePlayerModal.tsx` e `bolodechocolate.ts`) identificou 5 gargalos crÃ­ticos responsÃ¡veis por telas pretas, atrasos de 10s no buffer e falhas em dispositivos mÃ³veis:
1. **IP Morto `195.178.110.110` (HTTP 403) como Servidor 1:** Mais de 15 canais esportivos primÃ¡rios tentavam este IP morto primeiro, congelando o player por 10 segundos atÃ© o timeout. AlÃ©m disso, `LivePlayerModal.tsx` nÃ£o tratava `MANIFEST_LOAD_ERROR` como irrecuperÃ¡vel, atrasando o failover.
2. **Premiere 5, 6, 7 e outros canais sem servidor IPTV Kiwi ou duplicados (`src/data/liveChannels.ts`):** Premiere 5 a 7 possuÃ­am apenas o IP morto, e havia canais duplicados no catÃ¡logo. Mapeados os IDs reais do provedor Kiwi (`/api/iptv/879`, `/api/iptv/885`, `/api/iptv/891`, ESPN 2-4, Combate e outros).
3. **Incompatibilidade de rotas relativas `/api/` com Android/Capacitor (`src/components/LivePlayerModal.tsx`):** Chamadas para `/api/iptv/...` sem prefixar `proxyBase` quebravam no ambiente Capacitor mobile (`capacitor://localhost/api/...`).
4. **Vazamento de cache global no Bolo de Chocolate e link 404 da Record TV:** `bolodechocolate.ts` utilizava cache global compartilhado para todos os canais, e a Record TV apontava para CDN morta (`cdntvms`). O cache foi isolado em `Map<string, CacheEntry>` indexado por canal e a Record TV migrada para IPTV Kiwi.
5. **AusÃªncia de Seletor Manual de Servidores na Barra de Controles (`src/components/LivePlayerModal.tsx`):** O usuÃ¡rio dependia unicamente de failover automÃ¡tico caso quisesse alternar entre servidores. Foi adicionado um menu dropdown intuitivo na barra de controles com badge de servidor ativo e indicaÃ§Ã£o de qualidade (Full HD / HD).

**AlteraÃ§Ãµes Realizadas:**
- `src/data/liveChannels.ts`: Reordenados os servidores colocando IPTV Kiwi como Servidor 1 em todos os esportivos; mapeados Premiere 1-7, SporTV 1-3, ESPN 1-5, Fox Sports, TNT Sports, Band Sports e Combate; removidos canais duplicados e atualizada Record TV.
- `src/components/LivePlayerModal.tsx`: Adicionado tratamento de `MANIFEST_LOAD_ERROR` e `MANIFEST_LOAD_TIMEOUT` para troca instantÃ¢nea; implementado seletor de servidores no player com toggle `showServerMenu`; prefixado `proxyBase` para rotas `/api/` no app Android.
- `server/routes/bolodechocolate.ts`: Cache global substituÃ­do por `boloCacheMap = new Map<string, CacheEntry>()` por canal.
- `android/app/build.gradle`: `versionCode` incrementado para `20` e `versionName` para `"1.2.9"`.

**ValidaÃ§Ã£o:**
- Teste TDD automatizado (`scratch/test-live-tv.mjs`): 5/5 PASS.
- ValidaÃ§Ã£o TypeScript AST: 0 erros de sintaxe nos arquivos modificados.
- Grafo de conhecimento Graphify atualizado (`graphify update .`).

---

## 18/10/2026 - Auditoria e CorreÃ§Ã£o Integral do Painel Administrativo (4 Bugs Corrigidos)

**Contexto e DiagnÃ³stico via Graphify:**
Auditoria completa das 6 abas e rotas do Painel Administrativo (`AdminPage.tsx`, `ServerBlocksAdmin.tsx`, `AdminHealthMonitor.tsx`, `EncontreiCookieAlert.tsx`, `AdminBugReports.tsx`, `AdminPushNotifications.tsx`, `AdminDeployMonitor.tsx`, `adminOps.ts`, `serverBlocks.ts` e `requireAdminAuth.ts`) revelou 4 bugs funcionais:
1. **Notas e Descontos dos Clientes Ausentes na Lista (`src/pages/AdminPage.tsx`):** `handleSaveEdit` gravava `notes`, `fixedDiscount` e `oneTimeDiscount` no Firestore, mas `loadStats` omitia esses campos no `list.push()`, impedindo a exibiÃ§Ã£o do botÃ£o `"Notas"` e zerando os campos ao abrir o modal de ediÃ§Ã£o.
2. **Sobrescrita Indevida do Token Admin na Aba Bloqueios (`src/components/ServerBlocksAdmin.tsx`):** O componente sobrescrevia manualmente `"x-admin-token"` com `getAdminToken()` (que lia `uid` ou e-mail do `sessionStorage`), substituindo o JWT vÃ¡lido do Firebase (`idToken`) injetado automaticamente pelo `adminFetch`.
3. **AusÃªncia da Flag `isAdmin` no `sessionStorage` (`src/pages/AdminPage.tsx`):** `App.tsx` checava `sessionStorage.getItem("isAdmin") === "true"` para proteger a sessÃ£o do administrador, mas `AdminPage.tsx` nunca gravava nem limpava essa chave.
4. **Alerta/Badge de Cookie Encontrei InvisÃ­veis no Topo e DuplicaÃ§Ã£o no Health-Check (`src/pages/AdminPage.tsx` e `server/routes/adminOps.ts`):** `EncontreiCookieBadge` e `EncontreiCookieAlert` estavam importados em `AdminPage.tsx` sem serem renderizados no cabeÃ§alho/topo, e `adminOps.ts` testava `vizer.reisen` duas vezes seguidas (`staticTargets` + `checkVizer()`).

**AlteraÃ§Ãµes Realizadas:**
- `src/pages/AdminPage.tsx`: Populados `notes`, `fixedDiscount` e `oneTimeDiscount` em `loadStats`; sincronizado `sessionStorage` (`isAdmin = "true"` no login/checkAuth e `removeItem("isAdmin")` no logout); renderizados `<EncontreiCookieBadge />` no cabeÃ§alho e `<EncontreiCookieAlert />` acima das abas (quando fora da aba SaÃºde).
- `src/components/ServerBlocksAdmin.tsx`: Removida `getAdminToken()` e as sobrescritas manuais de `"x-admin-token"`, delegando 100% da autenticaÃ§Ã£o JWT ao `adminFetch`.
- `server/routes/adminOps.ts`: Removida a entrada duplicada de `vizer.reisen` em `staticTargets`, mantendo `checkVizer()`.

**ValidaÃ§Ã£o:**
- Teste automatizado TDD (`scratch/test-admin-panel.mjs`): 5/5 PASS.
- VerificaÃ§Ã£o TypeScript (`npx tsc --noEmit`) sem erros de cÃ³digo nos arquivos modificados e sincronizaÃ§Ã£o do grafo (`graphify update .`).

---

## 18/10/2026 - OtimizaÃ§Ã£o de Performance Geral do App (5 Gargalos Eliminados via Graphify)

**Contexto e DiagnÃ³stico via Graphify:**
Auditoria nos God Nodes do projeto (`DetailsPage`, `HomePage`, `fetchTmdbSafe`, `getAllCatalogItems`, `App`) identificou 5 gargalos de performance afetando o tempo de carregamento inicial, a navegaÃ§Ã£o entre telas e o uso de CPU/rede:
1. **Zero Cache no Proxy e ServiÃ§o TMDB (`server/routes/tmdbProxy.ts` e `src/services/tmdb.ts`):** O `tmdbCache` (LRU 15 min) jÃ¡ existia em `server/utils/caches.ts`, mas nÃ£o estava conectado ao `/api/tmdb`. AlÃ©m disso, `fetchTmdbRaw` no cliente nÃ£o possuÃ­a cache em memÃ³ria, refazendo ~10 chamadas sempre que o usuÃ¡rio voltava dos Detalhes para a Home.
2. **`refresh=1` ForÃ§ado na Home (`src/utils/mediaUtils.ts`):** `checkLiveAvailability` enviava `refresh: '1'` por padrÃ£o, obrigando `/api/encontrei-lookup` a ignorar o cache em memÃ³ria de 24h e os patches (`applyCatalogPatches`) e acionar scrapers externos.
3. **ReconexÃ£o e Escrita no Firestore a Cada Troca de Tela (`src/App.tsx`):** `viewState.type` estava nas dependÃªncias dos `useEffect` do `onSnapshot` e do heartbeat `updatePresence`, causando reconexÃµes e escritas (`updateDoc`) no Firestore a cada clique de navegaÃ§Ã£o.
4. **Loop SÃ­ncrono de ~105 mil Itens em `/api/downloads-catalog` (`server/routes/encontreiLookup.ts`):** A rota reconstruÃ­a os mapas iterando ~92 mil episÃ³dios e ~12 mil filmes na thread principal a cada requisiÃ§Ã£o.
5. **Busca Linear Repetida no HistÃ³rico (`src/pages/HomePage.tsx` e `src/services/favorites.ts`):** `formatHistoryItem` executava `.find()` linear em todo o catÃ¡logo para cada item do "Continue Assistindo".

**AlteraÃ§Ãµes Realizadas:**
- `server/routes/tmdbProxy.ts`: Conectado `tmdbCache` (LRU 15 min) com `Cache-Control: public, max-age=900` e deduplicaÃ§Ã£o de requisiÃ§Ãµes concorrentes (`_tmdbProxyInflight`).
- `src/services/tmdb.ts`: Adicionado `_clientTmdbCache` (TTL 10 min) e `_clientTmdbInflight` em `fetchTmdbRaw`.
- `src/utils/mediaUtils.ts`: Removido `refresh: '1'` de `checkLiveAvailability`, permitindo uso imediato do cache de 24h da VPS.
- `src/App.tsx`: Criado `viewStateTypeRef` e removido `viewState.type` das dependÃªncias dos `useEffect` do Firestore (`onSnapshot` e `updatePresence`).
- `server/routes/encontreiLookup.ts`: Adicionado `_downloadsCatalogCache` (TTL 10 min) em `/api/downloads-catalog`.
- `src/services/favorites.ts` & `src/pages/HomePage.tsx`: Criado e exportado `getCatalogByIdMap()` com complexidade $O(1)$ para consulta instantÃ¢nea por ID/TMDB ID em `formatHistoryItem`.

**ValidaÃ§Ã£o:**
- Teste automatizado TDD (`scratch/test-app-performance.mjs`): 6/6 PASS.
- ValidaÃ§Ã£o TypeScript (`npx tsc --noEmit`) e sincronizaÃ§Ã£o do grafo (`graphify update .`).

---

## 17/10/2026 - OtimizaÃ§Ã£o Estrutural dos 4 Gargalos de ReproduÃ§Ã£o VOD (Filmes e SÃ©ries)

**Contexto e DiagnÃ³stico via Graphify:**
AnÃ¡lise da arquitetura de streaming revelou 4 pontos de atrito responsÃ¡veis por congelamentos, tela preta e atrasos:
1. **Rate Limit Restritivo em Proxies de MÃ­dia (`server.ts`):** O `/api/md-proxy` (MixDrop) e `/api/vidsrc-proxy` (Seriesflix HD) estavam submetidos ao `apiLimiter` (150 req/min) ou `scraperLimiter` (30 req/min), estrangulando requisiÃ§Ãµes com mÃºltiplos `Range` ou seeks frequentes e causando tela preta sÃºbita.
2. **Recarga Dupla do Iframe no MixDrop (`encontreiCatalog.ts`):** `buildMixdropStreamUrl` anexava `&cb=Date.now()`. Quando o modal resolvia o `fileId`, o `useEffect` detectava URL diferente e forÃ§ava uma segunda recarga do iframe.
3. **AlocaÃ§Ã£o Excessiva de RAM no Seriesflix HD (`vidsrcRoutes.ts`):** O proxy de segmentos HLS executava `await upstream.arrayBuffer()`, enchendo a RAM da VPS, e mantinha `content-length` que podia gerar `ERR_CONTENT_LENGTH_MISMATCH`.
4. **LatÃªncia de Abertura no Nixplay SÃ©ries (`nixplayRoutes.ts`):** `/api/nixplay-check` disparava fetch sÃ­ncrono externo a cada checagem em vez de consultar o `nixplayEpisodeCache` em memÃ³ria.

**AlteraÃ§Ãµes Realizadas:**
- `server.ts`: Rotas `/api/md-proxy` e `/api/vidsrc-proxy` movidas para o `liveStreamLimiter` (360 req/min). `scraperLimiter` refinado para focar estritamente em `/vidsrc-stream` e `/vidsrc-player`.
- `src/services/encontreiCatalog.ts`: Removido `&cb=Date.now()` do `buildMixdropStreamUrl`. URLs agora sÃ£o determinÃ­sticas por `fileId`.
- `server/routes/vidsrcRoutes.ts`: SubstituÃ­do `arrayBuffer()` por `Readable.fromWeb().pipe(res)` com propagaÃ§Ã£o de erros e aborts. Header `content-length` removido.
- `server/routes/nixplayRoutes.ts`: Implementada checagem antecipada no `nixplayEpisodeCache.get(resolvedId)` antes de bater na API externa, com timeout reduzido de 15s para 5s.

**ValidaÃ§Ã£o:**
- Teste automatizado de ponta a ponta (`scratch/test-vod-bottlenecks.mjs`): 4/4 PASS.
- AST Tree-Sitter via Graphify: 0 erros de sintaxe nos 4 arquivos alterados.
- Grafo de conhecimento Graphify sincronizado (`graphify update .`).

---

## 11/10/2026 - Ajuste do Timeout do Watchdog do WatchPlayer para 17s

**AlteraÃ§Ã£o Realizada (`src/components/VideoPlayerModal.tsx`):**
- O watchdog de seguranÃ§a que monitora o inÃ­cio da reproduÃ§Ã£o foi atualizado para conceder **17 segundos** de tolerÃ¢ncia quando o player ativo for o WatchPlayer (`selectedServerKey === 'srv_watchplay'` ou URL contendo `watchplay`), mantendo 10 segundos para outros servidores. Isso dÃ¡ tempo suficiente para o WatchPlayer responder a handshake e bufferizaÃ§Ã£o antes de disparar o fallback silencioso automÃ¡tico.

**ValidaÃ§Ã£o:**
- `npx tsc --noEmit`: 0 erros.
- `compile_applet` e `lint_applet`: Aprovados.

---

## 11/10/2026 - Rastreio MixDrop: Encontrei.me como Origem e EliminaÃ§Ã£o do Falso Fallback

**Problema relatado:** Mesmo apÃ³s recarregar com Ctrl+Shift+R, o console exibia `[MixDrop Rastreio] ðŸ”Ž Origem: VIZER | fileId: 4dngnomncd0rq7 (S1E3)` em vez do Encontrei.me. AlÃ©m disso, no momento da inicializaÃ§Ã£o ocorria `MixDrop com URL fabricada detectado -> Scraper nÃ£o encontrou fileId real. Iniciando pelo prÃ³ximo servidor...`, forÃ§ando o modal a tentar o WatchPlayer, esperar 10 segundos atÃ© o timeout e sÃ³ entÃ£o voltar ao MixDrop via fallback.

**Causas Raiz Identificadas:**
1. **AusÃªncia da injeÃ§Ã£o do patch nos Ã­ndices do Encontrei (`server/routes/encontreiLookup.ts`):** `applyCatalogPatches()` injetava os episÃ³dios de Carrie (288673) apenas em `_vizerEpisodeIndex`. Como `_encontreiEpisodeIndex` nÃ£o continha as entradas e `ENCONTREI_COOKIE` nÃ£o estava configurado no ambiente, o backend sempre selecionava o Vizer como melhor fonte (`bestSource = "vizer"`).
2. **Corrida e descarte de requisiÃ§Ã£o inflight no frontend (`src/components/VideoPlayerModal.tsx`):** `mixdropLookupInflightRef` usava um `Set<string>`. Quando o `useEffect` disparava a resoluÃ§Ã£o de episÃ³dio e `setupInitialServer` chamava `lookupMixdropFileId` simultaneamente, a segunda chamada encontrava a chave no `Set` e retornava `null` imediatamente. Isso fazia o `setupInitialServer` acreditar falsamente que o fileId nÃ£o existia ("Scraper nÃ£o encontrou fileId real") e trocar o servidor para WatchPlayer, perdendo 10s no timeout.

**AlteraÃ§Ãµes Realizadas:**
- `server/routes/encontreiLookup.ts`: `applyCatalogPatches()` agora injeta simultaneamente em `_encontreiEpisodeIndex`, `_encontreiSeriesSeasonsIndex` e `_encontreiMovieIndex` com `source: "encontrei"`. Como o resolvedor prioriza o Encontrei quando ambos estÃ£o disponÃ­veis, o endpoint `/api/encontrei-lookup` retorna `source: "encontrei"` e `mixdrop_encontrei`.
- `src/components/VideoPlayerModal.tsx`: `mixdropLookupInflightRef` agora armazena um `Map<string, Promise<string | null>>`. Chamadas simultÃ¢neas aguardam a mesma Promise jÃ¡ em andamento, recebendo o fileId real imediatamente sem cair em `null` nem disparar fallback falso para WatchPlayer.

**ValidaÃ§Ã£o:**
- `npx tsc --noEmit`: 0 erros.
- `compile_applet` e `lint_applet`: CompilaÃ§Ã£o e linting aprovados com sucesso.

---

## 11/10/2026 - Telemetria do MixDrop no F12 (tela preta no meio da reproduÃ§Ã£o)

**Problema relatado:** assistindo Carrie S1E2 no MixDrop, a tela piscou e ficou preta **durante a reproduÃ§Ã£o**. O print do console nÃ£o tinha nenhum log de recarga (`Recarregando iframe...`) nem de fallback (`demorou mais de 10s`) â€” causa ainda NÃƒO confirmada.

**Descobertas (por leitura de cÃ³digo, nÃ£o reproduzidas):**
- `buildMixdropStreamUrl` (`src/services/encontreiCatalog.ts`) coloca `&cb=Date.now()` â†’ o efeito de `VideoPlayerModal.tsx` (~L1167) sempre vÃª URL "nova" e pode recarregar o iframe quando o `mixdropFileId` muda. Defeito real, mas nÃ£o explica sozinho a tela preta do print.
- Todos os players tratam `SEEK_RELATIVE` (auditado). HÃ¡ `case "SEEK_RELATIVE"` duplicado em 3 trechos de `videoScrapers.ts` (segundo ramo Ã© cÃ³digo morto, inofensivo).

**Implementado (`server/routes/mixdrop.ts`, bloco `initMixdropTelemetry`):**
- Linha do tempo (60 eventos) de `waiting/stalled/error/emptied/abort/seeking/pause/aba/online/offline` + erros JS do iframe.
- Detecta: tempo parado (`frame_freeze`), **"tempo andando sem quadros" (tela preta)**, **pausa nÃ£o solicitada** e erro de mÃ­dia com nome do cÃ³digo (rede/decodificaÃ§Ã£o).
- Reaproveita `NIXPLAY_TELEMETRY_EVENT` (a skin jÃ¡ imprime stall/recovered no F12). Comandos: `mixdropStats()` (contexto do iframe) ou `nixplayStats()`.

**ValidaÃ§Ã£o:** 0 erros de sintaxe (TypeScript AST); JS do iframe validado com `new Function`; sem crase/`${}` no bloco (nÃ£o quebra o template). `tsc` completo sÃ³ acusa mÃ³dulos ausentes (`axios`, `cheerio`, `stream`, `react`...) porque o workspace nÃ£o tem `node_modules`.

**Pendente:** reproduzir e ler a linha do tempo; sÃ³ entÃ£o corrigir (candidatas: queda do `/api/md-proxy`, rate limit 150/min da VPS, auto-healer). Deploy na VPS sÃ³ com autorizaÃ§Ã£o.

---

## 11/10/2026 - Telemetria e Monitor de Engasgos do NixPlayer no F12


**Problema relatado:** O usuÃ¡rio solicitou um mecanismo que aparecesse exclusivamente no console de desenvolvedor (F12) para monitorar como o player na fonte (NixPlayer) entrega os dados, detectando "engasgos/travadinhas" em tempo real para permitir diagnÃ³stico e mitigaÃ§Ã£o.

**ImplementaÃ§Ã£o:**
1. **Motor de Telemetria no Bridge (`server/routes/nixplayRoutes.ts` - `/api/native-player`):**
   - Monitora eventos nativos `waiting` (buffer esgotado) e `stalled` (CDN parada sem dados).
   - Watchdog de congelamento de tela (`frame_freeze`): detecta quando o vÃ­deo congela mesmo sem o evento waiting do browser disparar.
   - CÃ¡lculo contÃ­nuo de buffer Ã  frente (`getBufferAhead()` em segundos).
   - Leitura de mÃ©tricas de decodificaÃ§Ã£o (`getVideoPlaybackQuality()` para quadros perdidos / dropped frames).
   - Emite mensagens estruturadas `NIXPLAY_TELEMETRY_EVENT` para a janela principal.
2. **VisualizaÃ§Ã£o no F12 (`src/components/NetflixPlayerSkin.tsx`):**
   - Escuta `NIXPLAY_TELEMETRY_EVENT` e formata alertas visuais coloridos e destacados no console (`console.group` com tags vermelhas/amarelas/verdes) detalhando: posiÃ§Ã£o, duraÃ§Ã£o do travamento, buffer restante, dropped frames e URL da CDN.
   - Exposta a funÃ§Ã£o global `window.nixplayStats()` para visualizaÃ§Ã£o instantÃ¢nea de um raio-x completo do streaming via tabela formatada no console.

**ValidaÃ§Ã£o:**
- AST TypeScript sem erros.
- Teste funcional automatizado (`scratch/test-telemetry.mjs`): 100% PASS.

---

## 11/10/2026 - Fix AvanÃ§ar/Retroceder 10s no NixPlayer (Carrie a Estranha e Skin Netflix)

**Problema relatado:** Ao assistir Carrie, A Estranha (2026) pelo NixPlayer com a Skin Netflix, clicar nos botÃµes de avanÃ§ar 10 segundos fazia o vÃ­deo retornar sozinho ao tempo anterior sem obedecer ao comando.

**Causa Raiz Identificada:**
1. **Frontend (`NetflixPlayerSkin.tsx`):** `handleSeekRelative` calculava o novo tempo alvo e disparava `sendCommand({ type: 'SEEK_RELATIVE', seconds, time: newTarget })`. PorÃ©m, a camada de compatibilidade do `sendCommand` sÃ³ convertia comandos com `type === 'SEEK_ABSOLUTE' || type === 'SEEK'` para as mensagens universais do iframe (`SEEK`, `seek`, `action: 'seek'`). O `SEEK_RELATIVE` era enviado apenas com sua assinatura crua.
2. **Bridge Nixplay (`server/routes/nixplayRoutes.ts` - `/api/native-player`):** O listener de `message` do player HTML5 nativo que roda os vÃ­deos do Nixplay sÃ³ reconhecia `PLAY`, `PAUSE`, `SEEK` (apenas com `targetTime`) e `seek` (apenas com `time`). Ele ignorava totalmente `SEEK_RELATIVE`, `SEEK_ABSOLUTE`, `SKIP_INTRO` e `SET_PLAYBACK_RATE`. O elemento `<video>` real continuava reproduzindo no mesmo segundo. A interface avanÃ§ava otimisticamente por 1,5s (lock de seek), mas assim que o lock expirava, o `timeupdate`/`sendStatus` do vÃ­deo real (ainda inalterado) forÃ§ava o relÃ³gio a voltar sozinho.
3. **Outros players:** O mesmo padrÃ£o de omissÃ£o de `SEEK_RELATIVE` e `SEEK_ABSOLUTE` foi encontrado e corrigido em `server/routes/vidsrcRoutes.ts` (`/api/vidsrc-player`) e em `src/components/VideoPlayerModal.tsx` (`handleLocalCommand` para mÃ­dias locais offline).

**AlteraÃ§Ãµes Realizadas (4 arquivos):**
- `src/components/NetflixPlayerSkin.tsx`: `sendCommand` agora inclui `SEEK_RELATIVE` e despacha `SEEK` (`targetTime`), `SEEK_ABSOLUTE` (`time`), `seek` (`time`) e `action: 'seek'`. A condiÃ§Ã£o de liberaÃ§Ã£o `hasReachedTarget` no listener de `WATCHPLAY_STATUS` foi calibrada para aceitar tanto avanÃ§os (+10s) quanto retrocessos (-10s) com tolerÃ¢ncia de Â±1.2s.
- `server/routes/nixplayRoutes.ts`: `/api/native-player` agora suporta `SEEK_RELATIVE` (via `time` absoluto ou soma com `seconds`), `SEEK_ABSOLUTE`, `SKIP_INTRO`, `SET_PLAYBACK_RATE` e `TOGGLE_PLAY`. Adicionados listeners para os eventos `seeking` e `seeked` no `<video>` para emitir `sendStatus` imediato Ã  skin no momento em que o salto conclui.
- `server/routes/vidsrcRoutes.ts`: Atualizados os handlers do bridge para suportar `SEEK_RELATIVE`, `SEEK_ABSOLUTE`, `SKIP_INTRO`, `SET_PLAYBACK_RATE` e evento `seeked`.
- `src/components/VideoPlayerModal.tsx`: `handleLocalCommand` atualizado com suporte a `SEEK_RELATIVE`, `SKIP_INTRO` e `SET_PLAYBACK_RATE`.

**ValidaÃ§Ã£o:**
- AnÃ¡lise sintÃ¡tica AST TypeScript: 0 erros em todos os 4 arquivos modificados.
- Teste funcional automatizado (`scratch/test-seek-protocol.mjs`): 5/5 testes passaram (validaÃ§Ã£o de postMessages, simulaÃ§Ã£o do player nativo com avanÃ§o +10s, retrocesso -10s e pular abertura +85s).

---

## 06/10/2026 - HxH 2011: "eps 70+ nÃ£o reproduzem" â€” worker do CONTEÃšDO do HxH fora no Nixplay

**Problema relatado:** apÃ³s o fix das abas, o usuÃ¡rio reporta que "os eps do nixplay nÃ£o reproduz a partir do ~70".

**CorreÃ§Ã£o da primeira hipÃ³tese (era "Nixplay fora do ar geral" â€” NÃƒO Ã©):** o usuÃ¡rio estava assistindo Harry Potter pelo Nixplay no mesmo momento. Probe comparativa (`scratch/nixplay-movie-vs-series.mjs`) no `player_api.php` do Nixplay:
- `movie/HP` (671/672) â†’ **302** para `cdn99xn----booster.anipixel.best/v/m/...` âœ…
- `series/Loki` (84958) e `series/Breaking%20Bad` (1396) â†’ **302** âœ…
- `series/HxH` (46298, inclusive ep 1) â†’ **503 "Worker de reproducao indisponivel."** âŒ

Ou seja: **nÃ£o Ã© movieÃ—series â€” Ã© conteÃºdo-especÃ­fico.** O `get_series` tem 11.433 sÃ©ries; teste de varredura dos 11 hits "hunter" + amostra de animes mostra o mesmo 503 em vÃ¡rios tÃ­tulos (Sword of the Demon Hunter, Fire Hunter, Gringo Hunters, Mindhunter, Witch Hunter Robin, Bakuretsu Hunters) enquanto A FamÃ­lia Hunter, Loki, Breaking Bad e os filmes HP respondem 302. SÃ£o "workers de reproduÃ§Ã£o" por conteÃºdo no provedor (CDN booster `anipixel.best`); o worker do HxH estÃ¡ caÃ­do junto com um lote (majoritariamente anime). NÃ£o hÃ¡ outro series_id do HxH funcional no catÃ¡logo (o par [L] `1000046298` tambÃ©m 503) â€” confirmado do servidor local e via `play-infinity.stream` (idÃªntico).

**Mapeamento revalidado (sem bug):** `/api/nixplay-episode-id` resolve posiÃ§Ã£o exata dos 148 eps (ex.: global 70 â†’ `46298004012` Nixplay T4E12). Grid flat 1..148 do app â†’ posiÃ§Ã£o correta.

**Cobertura dos demais servidores (HxH keyed 45952 no encontrei):** `encontrei-lookup` â†’ S1 flat **1..70** com `mixdrop`=Y; **71..148 â†’ vazio**. O corte "~70" = fim do catÃ¡logo MixDrop/Encontrei; dos 71+ a Ãºnica fonte era o Nixplay â†’ caindo, nada reproduz.

**Pendentes opcionais (nÃ£o implementados nesta sessÃ£o):**
1. **Alias de id para MixDrop (46298â†’45952) no HxH:** daria eps 1..70 via MixDrop/Encontrei robustamente enquanto o Nixplay estiver fora. Exige confirmar que o conteÃºdo keyed 45952 no encontrei Ã© HxH 2011 (e nÃ£o o 1999) antes de mapear.
2. **Detector de "worker indisponÃ­vel" do Nixplay** (`/api/nixplay-resolve` e `/api/nixplay-episode-id`): corpo do 503 contÃ©m "Worker de reproducao indisponÃ­vel" â†’ responder erro tipado pro modal marcar `srv_nixplay` como inÃºtil para aquele conteÃºdo e pular mais rÃ¡pido no fallback (nÃ£o cria eps 71+, mas evita espera vazia no servidor).

**Smoke/server:** servidor local de teste encerrado; probes em `scratch/`. Nada tocou em player â†’ sem `tsc`.

---

## 06/10/2026 - `ERR_CONTENT_LENGTH_MISMATCH` em `/api/mixdrop-proxy` (segunda ocorrÃªncia)

**Problema:** novo console mostra `Failed to load resource: net::ERR_CONTENT_LENGTH_MISMATCH` no `mixdrop-proxy` logo apÃ³s o ArtPlayer iniciar. O fix anterior sÃ³ cobria o caso 200; o mismatch **continuava possÃ­vel nas respostas 206 (Range)**.

**Raiz:** impossÃ­vel manter `Content-Length` em resposta parcial e evitar o mismatch ao mesmo tempo â€” se a CDN reseta ou o cliente aborta no meio do streaming, o corpo termina antes do tamanho declarado e o Chrome dispara o erro. O 206 com `Content-Length` promete bytes que podem nÃ£o chegar.

**CorreÃ§Ã£o (`server/routes/mixdrop.ts`, regra de ouro agora):** `Content-Length` Ã© **DROPPED em qualquer status** â€” resposta sempre chunked, terminando no marcador de fim (mismatch vira impossÃ­vel). `Content-Range`/`Accept-Ranges`/`Content-Type` continuam sendo repassados, entÃ£o o player segue sabendo o tamanho total do arquivo (seek intacto). Aplicado em **ambos** os proxies:
- `/api/mixdrop-proxy` (removida a condiÃ§Ã£o que mantinha Length no 206);
- `/api/download` (mesma polÃ­tica + handler de erro do stream de origem no pipe, que faltava â€” um reset da CDN no meio do download travava a resposta).

**Smoke test (`scratch/proxy-smoke.mjs`) atualizado e reexecutado = 9/9 PASS** contra CDN real (arquivo 1,38 GB): 400s, upstream 404 chunked sem Length, fileId resolvido, `Range: bytes=0-1048575` â†’ **206 chunked sem Content-Length** com `Content-Range` Ã­ntegro (corpo exatamente 1048576 bytes), seek intermediÃ¡rio â†’ 206, aborto no meio â†’ servidor segue vivo. `npx tsc --noEmit` = 0 erros.

**Nota:** com isso, qualquer novo `mixdrop-proxy` no console serÃ¡ `net::ERR_ABORTED`/`ERR_CONNECTION_RESET` (aborto do prÃ³prio navegador â€” inofensivo) e nÃ£o mais mismatch.

---

## 06/10/2026 - 404 `/api/tmdb/tv/*` em item catalogado como sÃ©rie (id Ã© de FILME)

**Problema relatado (novo console dump):** `Failed to load resource: 404` + `[TMDB Service] Proxy local retornou status 404. Ativando fallback de dados...` logo antes dos logs do MixDrop (fileId resolvido) e do ArtPlayer. O playback funciona, mas o 404 aparece.

**Descoberta decisiva (consulta direta ao proxy da VPS `https://play-infinity.stream/api/tmdb/...`):**
- `tv/1101412` â†’ **404** (nÃ£o existe)
- `movie/1101412` â†’ **existe** e Ã© **"A Queda 2: No Limite" (Fall 2: Deadpoint)** â€” thriller USA/GB, lanÃ§amento 2026-09-01, `tt31192372`.
- Ou seja: o **id Ã© de filme**, mas algum item chega com `type: 'series'`/`isSeries: true` â†’ todos os lookups `/tv/<id>` (detalhes, temporada) dÃ£o 404 em cascata. A origem do card nÃ£o estÃ¡ no repositÃ³rio (grep `1101412` = 0 hits) â€” vem de fonte em runtime (catÃ¡logo externo Vizer/Encontrei ou histÃ³rico do usuÃ¡rio).
- Reviso a conclusÃ£o antiga ("404 Ã© cosmÃ©tico"): continua inofensivo ao playback, mas agora Ã© **detectÃ¡vel e auto-corrigido** quando hÃ¡ como confirmar.

**CorreÃ§Ãµes (4 arquivos, `npx tsc --noEmit` = 0 erros):**
- `src/services/tmdb.ts`: `fetchTmdbRaw` agora devolve **status HTTP** (distingue 404 de timeout/rede) e **todo warning inclui a URL** â€” dali pra frente o DevTools diz exatamente qual recurso falhou. Novo `lookupDetails(id, type)` que, **sÃ³ quando o TMDB responde 404 explicitamente** (nunca em timeout/erro de rede), sonda o outro tipo (`tv`â†”`movie`) e expÃµe `crossType`/`crossDetails`. `getDetails` = `(await lookupDetails(...)).details` (contrato inalterado).
- `src/pages/DetailsPage.tsx`: usa `lookupDetails`. Se os detalhes do tipo pedido vierem vazios **e** o id existir no outro tipo **e** o tÃ­tulo do item casar com o do TMDB (â‰¥ 0,5 via novo `titlesLookLikeSame`), **adota o tipo real** (`setItem`: corrige `type` + `playerUrl` pro servidor WatchPlayer certo) e refaz trailer/recomendaÃ§Ãµes no tipo correto. Guard novo: `DEFAULT_DETAILS` (id 0 sem temporadas) **nÃ£o** sobrescreve mais sinopse/pÃ´ster/gÃªneros do catÃ¡logo (antes, `genres: []` zerrava os gÃªneros ao abrir item sem metadados).
- `src/components/VideoPlayerModal.tsx`: em `loadSeries`, se o id nÃ£o existe como TV mas existe como filme com mesmo tÃ­tulo â†’ novo estado `resolvedAsMovie` â‡’ `isSeries` vira `false` e a mÃ¡quina de temporadas Ã© desligada (sem abas vazias nem 404 repetido). O efeito que busca episÃ³dios (`getSeasonDetails`) agora **aguarda `seriesDetails`** antes de rodar â€” elimina o `/tv/<id>/season` 404 quando o item Ã© filme mascarado de sÃ©rie.
- `src/utils/mediaUtils.ts`: `titleSimilarity`/`titlesLookLikeSame` (normaliza acentos/pontuaÃ§Ã£o, sobreposiÃ§Ã£o de tokens).

**LimitaÃ§Ã£o honesta:** se o tÃ­tulo do card **nÃ£o** casar com a obra do TMDB no outro tipo (ex.: id de outra obra colado num card), a correÃ§Ã£o recusa (evita exibir metadados de uma obra diferente) e o 404 persiste â€” mas o log agora mostra a URL exata, permitindo achar a fonte real do card.

---

## 06/10/2026 - Erros de console ao assistir via MixDrop (proxy, TMDB 404, permissÃ£o Firebase)

**Problema relatado:** logs capturados assistindo "Harry Potter e a CÃ¢mara Secreta": `net::ERR_CONTENT_LENGTH_MISMATCH` no `/api/mixdrop-proxy`, `404 /api/tmdb/tv/1101412?language=pt-BR`, `FirebaseError: Missing or insufficient permissions`, logs `parts Array(...)` e warning de iframe (`Allow attribute will take precedence over 'allowfullscreen'`).

**DiagnÃ³stico + correÃ§Ãµes (validado com `npx tsc --noEmit` = 0 erros):**
- `server/routes/mixdrop.ts` (`/api/mixdrop-proxy`): era a causa real do `ERR_CONTENT_LENGTH_MISMATCH` â€” o `Content-Length` do upstream era repassado mesmo em respostas 200, entÃ£o um aborto do cliente (seek/fechar aba) deixava o corpo menor que o header declarado. Agora sÃ³ repassa `Content-Length` em `206` (resposta parcial); em `200` usa chunked. Adicionado `res.on("close"/"error") â†’ controller.abort()`, tratamento de `AbortError` e `res.destroy()` quando os headers jÃ¡ foram enviados (evita resposta 500 sobre streaming interrompido).
- `src/components/VideoPlayerModal.tsx` (iframe do player): removido o atributo `allowFullScreen` â€” o `allow` jÃ¡ contÃ©m `fullscreen *`, e a dupla gera o warning do Chrome. Sem efeito funcional.
- `src/components/VideoPlayerModal.tsx` (`loadSeries`): quando nÃ£o hÃ¡ `tmdbId`, a busca por tÃ­tulo pegava o **primeiro** resultado de TV sem checar similaridade (`searchMulti(...).find(media_type === 'tv')`) â†’ IDs absurdos como o `1101412` e temporadas erradas. Agora pontua os candidatos (normalizaÃ§Ã£o de acentos + sobreposiÃ§Ã£o de tokens) e sÃ³ aceita similaridade â‰¥ 0,5; caso contrÃ¡rio nÃ£o consulta e a UI degrada para T1E1 normalmente.
- `src/hooks/useSubscription.ts`: erro de snapshot do Firestore derrubava qualquer assinante para "nÃ£o premium" (`isPremium = isDev`), o que fecha o player (App.tsx:278) e abre o paywall (App.tsx:623). Adicionado retry Ãºnico com `getDoc` (apÃ³s 1,5s) antes de cair no fallback â€” cobre erros transitÃ³rios (refresh do token de sessÃ£o) que negam a leitura por instantes.

**Logs benignos (sem cÃ³digo):**
- `parts Array(...)` vem do script interno do prÃ³prio MixDrop (MDCore), nÃ£o do repositÃ³rio â€” confirmado por busca no cÃ³digo-fonte.
- O 404 do TMDB Ã© cosmÃ©tico: `getDetails` jÃ¡ cai em `DEFAULT_DETAILS` e o playback continuou (o stream MixDrop carregou).

**DiagnÃ³stico FINAL do erro de permissÃ£o Firebase (usuÃ¡rio colou as regras em produÃ§Ã£o):** as regras em produÃ§Ã£o sÃ£o **idÃªnticas** Ã s do repo (sem deploy pendente â€” descartada a hipÃ³tese anterior de regras desatualizadas). Auditoria campo a campo de TODO write do cliente (`favoritos`, `episodiosAssistidos`, `historicoReproducao/historicoRemovido`, `ultimoAcesso/lastActive`, `senha`/`senhaInicial`/`photoURL`, `valorMensalidade/valor`, auto-expiraÃ§Ã£o `assinatura=EXPIRADA+subscription=INACTIVE`) e de todas as coleÃ§Ãµes usadas (`usuarios`, `users`, `administradores` â€” nenhuma fora das regras): **tudo Ã© permitido**. Com essas regras, leitura negada sÃ³ ocorre em `request.auth == null` na avaliaÃ§Ã£o â€” ou seja, **ID token expirado/refresh falhando** (o `isOwner` jÃ¡ exige `request.auth != null`). CorreÃ§Ãµes no cliente:
- `useSubscription`: no caminho de erro, agora **forÃ§a `getIdToken(true)`** (refresh do token) â†’ espera 800ms â†’ um `getDoc` de retry â†’ sÃ³ entÃ£o o fallback "nÃ£o premium" (com guardas de `authGeneration`/`disposed`).
- `App.tsx`: o `onSnapshot` do doc do usuÃ¡rio **morre** apÃ³s disparar erro (semano prÃ³prio). Callback de erro agora forÃ§a o refresh e **resscreve o listener** via estado `userDocEpoch`, limitado a **2 tentativas** (resetadas ao trocar de usuÃ¡rio) â€” nunca entra em loop.

**Double-check (mesmo dia) â€” encontrou e corrigiu 3 problemas no prÃ³prio fix:**
- `mixdrop-proxy`: `.pipe(res)` **nÃ£o propaga** `'error'` da origem â†’ um reset da CDN deixaria a resposta aberta e o navegador travado atÃ© o timeout dele. Adicionado handler de erro do stream de origem (finaliza com `res.end()` em 200-chunked / `res.destroy()` em 206) + flag anti-reentrada.
- `mixdrop-proxy`: o `Content-Length` tambÃ©m nÃ£o Ã© seguro quando o upstream vem com `content-encoding` (o `fetch` do Node descomprime e mantÃ©m o tamanho original â†’ mismatch) nem em `HEAD` (sem corpo). CondiÃ§Ã£o agora: manter sÃ³ em `206 && tem corpo && sem content-encoding`.
- `useSubscription`: o retry podia ser **obsoleto** â€” se o usuÃ¡rio deslogasse/logasse em <1,5s, o retry antigo sobrescrevia o status premium do usuÃ¡rio novo (e os `setIsPremium` do fallback nÃ£o checavam `disposed`). Adicionado contador `authGeneration` com guardas antes/depois do await.
- `DetailsPage`: os 2 iframes de trailer do YouTube tinham `allow` **sem** `fullscreen` (o `allowFullScreen` era necessÃ¡rio ali) â†’ `fullscreen` movido para o `allow` e o booleano removido (mesmo efeito, warning some).

**Smoke test end-to-end (`scratch/proxy-smoke.mjs` + servidor local):** 9/9 PASS contra o CDN real do MixDrop (`a-delivery34.mxcontent.net`, arquivo de 1,38 GB): 400 sem url, 400 fora de mxcontent, upstream 404 repassado **chunked sem Content-Length**, resoluÃ§Ã£o de fileId via `/api/mixdrop-stream?format=json`, `Range: bytes=0-1048575` â†’ 206 com `content-length=1048576` + `content-range` e corpo Ã­ntegro, seek intermediÃ¡rio â†’ 206, abort no meio do download â†’ servidor segue vivo.

**Descoberta Ãºtil para o futuro:** o host raiz `mxcontent.net` **nÃ£o tem registro A** (sÃ³ subdomÃ­nios como `a-delivery34.mxcontent.net` resolvem) â€” testar o proxy com o Ã¡pice gera `ENOTFOUND` e nÃ£o significa que a CDN caiu.

---

## 06/10/2026 - Fix HxH 2011 (aba T3 sumindo + episÃ³dios ocultos)

**Problema relatado:** Em Hunter x Hunter (2011), a aba "3Âª Temporada" sumia intermitentemente e a sÃ©rie (148 eps no TMDB/Nixplay, ~140 na visÃ£o do usuÃ¡rio) mostrava apenas ~70 episÃ³dios.

**Causas raiz:**
- **Aba sumindo:** As abas de temporada sÃ£o a uniÃ£o de `tmdbDetails.seasons` + lista verificada pelo servidor (`/api/series-seasons-available` via probes). Quando o fetch do TMDB falhava (timeout 6s / proxy), `tmdbList` ficava vazio e a UI colapsava para apenas as temporadas que os probes de rede confirmavam no momento (cache 5min) â†’ T3 desaparecia. Qualquer umidade nos probes ocultava temporadas reais.
- **~70 eps em vez de 148:** `/api/check-season` nÃ£o tinha dados do catÃ¡logo local para o `46298` (catÃ¡logo encontrei keyed sob `45952`), entÃ£o fazia sondagem de rede por episÃ³dio; qualquer falha de probe removia o episÃ³dio da grade (ex: T2 com 74 â†’ ~70). A pÃ¡gina de detalhes ainda capava o fallback em 50 eps.

**AlteraÃ§Ãµes (5 arquivos, validado com `npx tsc --noEmit` 0 erros):**
- `src/services/tmdb.ts`: cache persistente (localStorage) das Ãºltimas temporadas conhecidas por sÃ©rie. Se o TMDB falhar depois, `getDetails` injeta as temporadas cacheadas â†’ abas reais (ex: T3) nunca somem em outage.
- `server/routes/videoScrapers.ts` (`/api/check-season`): resposta agora distingue `verifiedFromCatalog: true` (resposta definitiva do catÃ¡logo local) vs `false` (sondagem de rede nÃ£o-conclusiva).
- `src/services/episodeAvailability.ts`: `getAvailableEpisodes` retorna `{ episodes, verifiedFromCatalog, requested }`; quando nÃ£o-conclusivo (probe) o front nÃ£o deve ocultar eps declarados pelo TMDB.
- `src/pages/DetailsPage.tsx`: sÃ³ filtra episÃ³dios quando `verifiedFromCatalog`; removido cap `Math.min(count, 50)` do fallback (agora usa o `episode_count` real do TMDB).
- `src/components/VideoPlayerModal.tsx`: mesmo tratamento no `filteredSeasonEpisodes`/`totalSeasonEpisodes`/`episodeNumbers`; override Nixplay (1..148) mantido como prioridade mÃ¡xima.

**Resultado esperado:** abas T1/T2/T3 estÃ¡veis mesmo com TMDB fora do ar; T1=62, T2=74, T3=12 (148 no total) na grade; modal continua exibindo 148 pelo Nixplay.

---

## 05/10/2026 - Health Check Autenticado do encontrei.me (Cookie de Sessao)

**Resumo:**
- **Problema:** O painel admin marcava o encontrei.me como OFFLINE no health check. Investigacao revelou que o site (forum IPS) passou a exigir login: sem sessao, todo o dominio redireciona para /login/ com HTTP 200 (falso positivo de OFFLINE/ONLINE). O catalogo local (data/encontrei-catalog.json, scrapeado em 22/09/2026) continua funcional para playback MixDrop, porem re-scrapes futuros e o health check exigem sessao valida.
- **Cookie Capturado:** Sessao da conta Dante15 (member_id 177839) capturada via F12 > Network > Request Headers > Cookie, com "Manter-me conectado" marcado (ips4_login_key de longa duracao). Cookie armazenado em .env.local como ENCONTREI_COOKIE (confirmado no .gitignore).
- **Modificacao no backend (server/routes/adminOps.ts):** Rota /api/admin/health-check agora valida o encontrei.me de forma dedicada (checkEncontrei): envia o Cookie de sessao, segue redirects e detecta pagina de login via URL final (/login), form elUser_login e/ou titulo da pagina. Retorna ONLINE somente se o conteudo carregar de verdade; caso contrario retorna erro descritivo (sessao expirada -> recapturar cookie / cookie nao configurado / possivel bloqueio Cloudflare ao IP da VPS).
- **Testes:** Sintaxe validada via esbuild (projeto sem node_modules local). Teste funcional com script scratch/test-healthcheck-encontrei.mjs confirmou: sem cookie -> OFFLINE (redireciona /login/); com cookie -> ONLINE (conteudo ETV carrega, ~159ms).
- **Pendencia VPS Oracle:** Para o health check funcionar em producao, e necessario adicionar ENCONTREI_COOKIE no ambiente da VPS (ecosystem.config / .env na VPS) e reiniciar o PM2. O servidor local (server.ts) ja carrega .env.local via dotenv automaticamente.
- **Validacao de Sessao (referencia futura):** Detector de login = URL final contem /login OU body contem elUser_login OU titulo comeca com "login". Pagina logada tem ~84KB (titulo "ETV - Assistir Filmes e Series Online 1080p"); pagina de login tem ~16KB (titulo "Login - ETV").

---
## 03/10/2026 - CorreÃƒÂ§ÃƒÂµes Live TV e OtimizaÃƒÂ§ÃƒÂµes de Performance

**Resumo:**
- **CorreÃƒÂ§ÃƒÂ£o 502 na TV ao Vivo (Live TV):** A fonte `up.kiwi` expirava os tokens HLS muito rÃƒÂ¡pido e respondia com `200 OK` + HTML de erro. Implementado "Watchdog" no `server/routes/videoScrapers.ts` para validar a tag `#EXTM3U` e renovar o token automaticamente sem queda.
- **OtimizaÃƒÂ§ÃƒÂ£o do encontrei-catalog.json (14 MB):** O JSON gigante foi removido da pasta `public/data/` para impedir que os clientes tentem baixÃƒÂ¡-lo. Agora ele reside em `data/` e ÃƒÂ© consumido *apenas* pelo backend via `encontreiLookup.ts`.
- **ReduÃƒÂ§ÃƒÂ£o de Bundle React:** Componentes pesados do frontend (`AdminPage`, `VideoPlayerModal`, `DetailsPage`, etc) foram protegidos com `React.lazy()` via wrapper `lazyWithRetry` no `App.tsx`, garantindo code-splitting e melhor carregamento inicial da aplicaÃƒÂ§ÃƒÂ£o.

---

## 03/10/2026 - Mega RefatoraÃƒÂ§ÃƒÂ£o de Rotas (server.ts modularizado)

**Resumo:**
- O monolito `server.ts` possuÃƒÂ­a ~6.700 linhas, misturando lÃƒÂ³gicas de proxy, pagamentos, scrapers (VOD) e serviÃƒÂ§os (TMDB, catÃƒÂ¡logo).
- Ele foi dividido em mÃƒÂºltiplos roteadores dedicados na pasta `server/routes/`.
- **Fase 1:** Fix do bypass de seguranÃƒÂ§a no `live-stream-proxy` (HMAC enforced, bypass por *referer* removido). Feita a proteÃƒÂ§ÃƒÂ£o da backdoor REST do `requireAdminAuth.ts` via enforce de JWT.
- **Fase 2:** 
  - Pagamentos e webhooks do ASAAS extraÃƒÂ­dos para `payments.ts`.
  - Rotas pesadas de streaming de VOD (`watchplayer-stream`, `anime-stream`, `vixsrc-stream`, `myembed-stream`, `pomfy-stream`) enviadas para `videoScrapers.ts`.
  - HLS e Proxy CORS Anti-bloqueios transferidos sem perder o mecanismo de bypass.
- **Fase 3 & 4:** 
  - Criados `catalog.ts` para endpoints de visualizaÃƒÂ§ÃƒÂ£o, rastreamento e disponibilidade.
  - Criados `diagnostics.ts` para o medidor de speedtest, player info.
  - Criados `mixdrop.ts` para scraping de streams.
  - Criados `cast.ts` (integraÃƒÂ§ÃƒÂ£o Chromecast source info).
- **Resultado:** O `server.ts` caiu drasticamente para ~380 linhas. O bundle principal de CJS em produÃƒÂ§ÃƒÂ£o foi reduzido de ~475KB para ~380KB. Tudo homologado atravÃƒÂ©s do conjunto de testes (smoke tests), garantindo que os clientes e o HLS na Oracle VPS nÃƒÂ£o tenham indisponibilidade.

---
# Walkthrough: AnotaÃƒÂ§ÃƒÂµes e Descontos no Admin

## Tarefas Realizadas

1. **AtualizaÃƒÂ§ÃƒÂ£o do Modelo (`ClientUser`)**
   - Adicionados os campos opcionais `notes`, `fixedDiscount` e `oneTimeDiscount`.

2. **Estados de EdiÃƒÂ§ÃƒÂ£o e Salvamento**
   - Estados criados para o modal (`editNotes`, `editFixedDiscount`, `editOneTimeDiscount`).
   - `handleOpenEdit` atualizado para carregar os valores atuais ou os padrÃƒÂµes vazios/zeros.
   - `handleSaveEdit` atualizado para consolidar os novos dados no objeto de `updates` que ÃƒÂ© gravado no Firestore (`usuarios` e `users`).

3. **UI do Modal de EdiÃƒÂ§ÃƒÂ£o**
   - Criado um `<textarea>` para a digitaÃƒÂ§ÃƒÂ£o de comentÃƒÂ¡rios/notas internas do usuÃƒÂ¡rio.
   - Criada uma condicional que exibe os `inputs` de Desconto Fixo e Desconto ÃƒÅ¡nico caso o `editAccessType` seja "mensal".

4. **UI do Card do UsuÃƒÂ¡rio**
   - Inserido um botÃƒÂ£o "Notas" ao lado de "Editar", que sÃƒÂ³ aparece se o `client.notes` nÃƒÂ£o for vazio.
   - Criada uma ÃƒÂ¡rea expansÃƒÂ­vel (`div`) abaixo dos dados do usuÃƒÂ¡rio, garantindo a exibiÃƒÂ§ÃƒÂ£o do texto com quebras de linha respeitadas (`whitespace-pre-wrap`).
   - Toda a estrutura do Card foi envolvida num Fragmento/Container `flex-col` para suportar o componente sanfona (accordion) do texto.

## VerificaÃƒÂ§ÃƒÂ£o PÃƒÂ³s-CÃƒÂ³digo

- VerificaÃƒÂ§ÃƒÂ£o TypeScript `npx tsc --noEmit` executada.
- CÃƒÂ³digo exit: `0` (Zero erros na compilaÃƒÂ§ÃƒÂ£o).

## RelatÃƒÂ³rio de Code Review (Self)

- **Strengths:** 
  - UI reutiliza os componentes visuais jÃƒÂ¡ adotados, mantendo o fundo *glassmorphism*.
  - A renderizaÃƒÂ§ÃƒÂ£o condicional otimiza a listagem (notas sÃƒÂ³ renderizam no DOM se estiverem ativas e se existirem).
  - Nenhuma quebra no layout de grid nativo.
- **Issues:**
  - Nenhuma (Minor/Important/Critical issue encontrada). O design estÃƒÂ¡ de acordo com as restriÃƒÂ§ÃƒÂµes globais.
- **Assessment:** Pronto e Implementado com sucesso.

## 01/10/2026 - Monitoramento do RobÃƒÂ´ Ampere

**Resumo:**
- **IntegraÃƒÂ§ÃƒÂ£o do Bot Ampere (Oracle VPS):** Criado endpoint `/api/admin/vps-bot-logs` via SSH que lÃƒÂª em tempo real as ÃƒÂºltimas 30 linhas de log do bot `ampere-creator` (via PM2).
- **Monitor do RobÃƒÂ´ Ampere:** Adicionada uma nova seÃƒÂ§ÃƒÂ£o "RobÃƒÂ´ de CriaÃƒÂ§ÃƒÂ£o VPS (Ampere)" no componente `AdminDeployMonitor.tsx` do painel de administrador, renderizando um terminal ao vivo que acompanha as tentativas de criaÃƒÂ§ÃƒÂ£o da instÃƒÂ¢ncia na Oracle Cloud.
- **PrecificaÃƒÂ§ÃƒÂ£o:** O valor da assinatura do **Plano Plus** foi reduzido de R$ 20,00 para R$ 17,00 no `DownloadPlusModal.tsx`.

 # #   0 3 / 1 0 / 2 0 2 6   -   O t i m i z a Ã¯Â¿Â½ Ã¯Â¿Â½ o   d e   B u s c a   n o   C a t Ã¯Â¿Â½ l o g o 
 
 * * R e s u m o : * * 
 -   * * O t i m i z a Ã¯Â¿Â½ Ã¯Â¿Â½ o   d o   e n c o n t r e i - c a t a l o g . j s o n : * *   A   r o t a   c h e c k - s e a s o n   e m    i d e o S c r a p e r s . t s   f o i   r e f a t o r a d a   p a r a   u t i l i z a r   a   f u n Ã¯Â¿Â½ Ã¯Â¿Â½ o   g e t E n c o n t r e i S e a s o n E p i s o d e s   d o   e n c o n t r e i L o o k u p . t s ,   a c e s s a n d o   o   Ã¯Â¿Â½ n d i c e   e m   m e m Ã¯Â¿Â½ r i a   e x i s t e n t e   e m   v e z   d e   r o d a r   J S O N . p a r s e   n u m   a r q u i v o   d e   1 4   M B   a   c a d a   r e q u i s i Ã¯Â¿Â½ Ã¯Â¿Â½ o .  
 

## 03/10/2026 - CorreÃ¯Â¿Â½Ã¯Â¿Â½es de VideoPlayer e Monitoramento

**Resumo:**
- **Resume PÃ¯Â¿Â½s-Erro no Player:** Corrigido o bug onde clicar em 'Tentar Novamente' apÃ¯Â¿Â½s uma queda de servidor fazia o episÃ¯Â¿Â½dio voltar para o inÃ¯Â¿Â½cio. O player agora guarda o 'lastKnownTimeRef' atualizado a cada instante. Ao trocar de servidor no fallback ou manualmente (Tentar Novamente), ele emite um comando SEEK exato para retomar de onde parou.
- **Monitoramento de VPS:** O painel de admin agora captura corretamente os processos 'fantasmas' combinando usuÃ¯Â¿Â½rios root e ubuntu via PM2.
- **UI Admin:** Ajuste visual no botÃ¯Â¿Â½o de 'Quem estÃ¯Â¿Â½ assistindo' substituindo texto por Ã¯Â¿Â½cone compacto.

## 03/10/2026 (Noite) - Refinamento de Watchdog, Fallback e Cache

**Resumo:**
- **DetecÃ¯Â¿Â½Ã¯Â¿Â½o de Pausa Longa:** Implementado um contador que, ao detectar retomada do vÃ¯Â¿Â½deo apÃ¯Â¿Â½s mais de 3 minutos de pausa, forja um silent fallback proativo. Isso impede o engasgo no streaming provocado pela morte do token nos servidores de CDN.
- **PrevenÃ¯Â¿Â½Ã¯Â¿Â½o de Falso Fallback:** Adicionado \hasPlayedRef\ para diferenciar uma queda primÃ¯Â¿Â½ria durante o uso de um delay inicial no \Continuar Assistindo\.
- **Limpeza do HistÃ¯Â¿Â½rico de Falhas:** O registro de fallback (\allbackAttemptsRef\) agora sÃ¯Â¿Â½ Ã¯Â¿Â½ limpo *apÃ¯Â¿Â½s* a conexÃ¯Â¿Â½o bem-sucedida ao player e recebimento de metadata, e nÃ¯Â¿Â½o antes.
- **Cache Buster Ativado:** ParÃ¯Â¿Â½metro \cb=Date.now()\ acrescentado ao MixDrop, WatchPlayer web, e Header \Cache-Control\ ajustado no proxy Node (\/api/watchplayer-stream\).
- **Watchdog Infraestrutural:** Reescrevemos o daemon \watchdog.sh\ para aferir saÃ¯Â¿Â½de via \curl http://127.0.0.1:8080/api/health\, eliminando reboots fantasmas provocados por logs ruidosos do PM2. O daemon foi isolado para rodar exclusivamente como ubuntu.

### 04/10/2026 15:20:12 - Estabilidade e UX de Fallback de Servidores VOD
- **ResoluÃƒÂ§ÃƒÂ£o de Falsos Positivos de Indisponibilidade**: 
  - Aumentado o watchdog interno do servidor proxy `myembed-stream` no `videoScrapers.ts` de 30 para 70 segundos.
  - Isso impede que o watchdog interno cancele conexÃƒÂµes em andamento e emita `VIP_UNAVAILABLE` precipitadamente antes de conseguir efetuar o buffer completo de filmes ou sÃƒÂ©ries que demoram a responder.
- **Melhoria Visual do Spinner de Carregamento**:
  - Modificado o componente `VideoPlayerModal.tsx` para reter o estado de `isLoading = true` (tela preta com spinner) atÃƒÂ© o momento que a reproduÃƒÂ§ÃƒÂ£o da mÃƒÂ­dia ÃƒÂ© de fato confirmada pelo iframe interno (`readyState >= 1` ou `currentTime > 0`).
  - Anteriormente, o spinner era ocultado imediatamente no evento DOM `onLoad` do `<iframe>`, expondo a interface piscando e recarregando durante tentativas de fallback entre servidores (Watchplay -> VIP -> Pomfy -> MixDrop).
  - O salto entre players no momento de indisponibilidade primÃƒÂ¡ria agora ÃƒÂ© imperceptÃƒÂ­vel para o usuÃƒÂ¡rio final, pois as tentativas secundÃƒÂ¡rias ocorrem sob a cobertura persistente da tela de carregamento principal.
- **CorreÃƒÂ§ÃƒÂµes Menores**:
  - Corrigido um bug cosmÃƒÂ©tico no `VideoPlayerModal.tsx` onde logs de tentativas em Filmes exibiam marcaÃƒÂ§ÃƒÂµes de sÃƒÂ©rie (`S1E1`) incorretamente durante resoluÃƒÂ§ÃƒÂ£o do ID no `encontrei.me`.


### 04/10/2026 15:24:09 - Estabilidade e UX de Fallback de Servidores VOD
- **ResoluÃƒÂ§ÃƒÂ£o de Falsos Positivos de Indisponibilidade**: 
  - Aumentado o watchdog interno do servidor proxy `myembed-stream` no `videoScrapers.ts` de 30 para 70 segundos.
  - Isso impede que o watchdog interno cancele conexÃƒÂµes em andamento e emita `VIP_UNAVAILABLE` precipitadamente antes de conseguir efetuar o buffer completo de filmes ou sÃƒÂ©ries que demoram a responder.
- **Melhoria Visual do Spinner de Carregamento**:
  - Modificado o componente `VideoPlayerModal.tsx` para reter o estado de `isLoading = true` (tela preta com spinner) atÃƒÂ© o momento que a reproduÃƒÂ§ÃƒÂ£o da mÃƒÂ­dia ÃƒÂ© de fato confirmada pelo iframe interno (`readyState >= 1` ou `currentTime > 0`).
  - Anteriormente, o spinner era ocultado imediatamente no evento DOM `onLoad` do `<iframe>`, expondo a interface piscando e recarregando durante tentativas de fallback entre servidores (Watchplay -> VIP -> Pomfy -> MixDrop).
  - O salto entre players no momento de indisponibilidade primÃƒÂ¡ria agora ÃƒÂ© imperceptÃƒÂ­vel para o usuÃƒÂ¡rio final, pois as tentativas secundÃƒÂ¡rias ocorrem sob a cobertura persistente da tela de carregamento principal.
- **CorreÃƒÂ§ÃƒÂµes Menores**:
  - Corrigido um bug cosmÃƒÂ©tico no `VideoPlayerModal.tsx` onde logs de tentativas em Filmes exibiam marcaÃƒÂ§ÃƒÂµes de sÃƒÂ©rie (`S1E1`) incorretamente durante resoluÃƒÂ§ÃƒÂ£o do ID no `encontrei.me`.


- **AtualizaÃƒÂ§ÃƒÂ£o Vizer**: DomÃƒÂ­nio atualizado de vizer.beauty para vizer.website no backend para restabelecer o scraping.
- **CorreÃƒÂ§ÃƒÂ£o Visual do Spinner de Fallback**: Removido o cancelamento prematuro do estado de carregamento (`setIsLoading(false)`) durante a montagem do iframe em `VideoPlayerModal.tsx`. O spinner agora persiste visualmente cobrindo toda a tela preta enquanto a mÃƒÂ­dia estÃƒÂ¡ parada, sumindo apenas apÃƒÂ³s o recebimento do status real de reproduÃƒÂ§ÃƒÂ£o (`WATCHPLAY_STATUS`).
- **Watchdog Tempo Real**: O watchdog interno do VIP Player usava `ticks` de 500ms, mas como os navegadores estrangulam (throttle) intervalos de iframes, 40 ticks podiam demorar 40 segundos reais. SubstituÃƒÂ­do por verificaÃƒÂ§ÃƒÂ£o absoluta de `Date.now()`.
- **Buscador de Elemento de VÃƒÂ­deo**: Atualizada a lÃƒÂ³gica de `sendStatus` do VIP para detectar corretamente `window.artInstance.video`, garantindo a transmissÃƒÂ£o do `WATCHPLAY_STATUS`.
- **AtualizaÃƒÂ§ÃƒÂ£o Vizer**: DomÃƒÂ­nio atualizado de vizer.beauty para vizer.website no backend para restabelecer o scraping.
- **Monitor de SaÃƒÂºde**: Nova aba no painel admin (AdminHealthMonitor) com endpoint em diagnostics.ts para checar status dos servidores/domÃƒÂ­nios homologados e detectar quedas silenciosas de domÃƒÂ­nio.
- **Afinidade de Servidor**: Resolvido bug de stale closure no player. Agora o player memoriza o servidor (ex: MixDrop) que funcionou com sucesso via `localStorage` e o utiliza instantaneamente no prÃƒÂ³ximo episÃƒÂ³dio ou na reabertura da sÃƒÂ©rie, sem passar pelos fallbacks originais novamente.
- **Regras do Firestore**: O painel de admin perdia a conexÃƒÂ£o com usuÃƒÂ¡rios novos e a criaÃƒÂ§ÃƒÂ£o de usuÃƒÂ¡rios falhava devido a propriedades ausentes nas listas de `isSafeCreate` (valorMensalidade, valor, criadoEm) e `isSafeUpdate` (ultimoAcesso, lastActive) do arquivo `firestore.rules`. As listas foram devidamente atualizadas. A regra de `isAdmin` tambÃƒÂ©m foi endurecida para exigir `email_verified == true`.
- **SeguranÃƒÂ§a e Chaves da API**: A rota de *health-check* que faz ping externo foi movida para `/api/admin/health-check` (autenticada) para evitar *SSRF/amplification*. Chaves de fallback hardcoded do TMDB foram limpas do cÃƒÂ³digo e de arquivos compilados, forÃƒÂ§ando o uso de variÃƒÂ¡veis de ambiente.
## 06/10/2026 - Auto-correÃ§Ã£o de identidade de cards + memo de 404 (HxH/Nixplay encerrado)
**Resumo:**
- **Cards com id/tipo errados (ex.: "Harry Potter e a CÃ¢mara Secreta" = id de filme 1101412 marcado como sÃ©rie):** implementado `resolveCardIdentity` em `src/services/tmdb.ts`. O card que responde 404 definitivo agora (a) adota o cross-type quando o tÃ­tulo bate; (b) senÃ£o busca o tÃ­tulo no TMDB (similarity >= 0.5, preferindo o tipo original) e adota o id real; (c) nunca age sobre timeout/rede. Memo de falhas por `type:id` em memÃ³ria + sessionStorage elimina o refetch e o spam de 404 na reabertura.
- **DetailsPage.tsx:** `loadDetails` usa `resolveCardIdentity`; item Ã© corrigido em runtime (`setItem`: type/tmdbId/playerUrl) e trailers/recomendaÃ§Ãµes sÃ³ sÃ£o buscados quando a identidade Ã© utilizÃ¡vel (sem 404).
- **VideoPlayerModal.tsx:** estados `resolvedAsMovie` + `correctedMovieId` e memo `effectiveMovieId` (declarados antes dos memos de MixDrop por causa de TDZ). `loadSeries` adota o filme real; todos os resolvers de filme (WatchPlayer/VIP/Nixplay, lookup e cache MixDrop `movie:{id}`, nixplay-check e legendas) passam a usar o id efetivo â€” HP agora reproduz com fileId HD estÃ¡vel do encontrei (`gjzdwxwvhxdewe`) sem â€œpiscarâ€.
- **TMDBDetails:** adicionados campos opcionais `origin_country`/`original_language` (usados no isAnime da DetailsPage).
- **ValidaÃ§Ã£o:** `npx tsc --noEmit` 0 erros; `scratch/proxy-smoke.mjs` 9/9 PASS.
- **HxH/Nixplay permanece encerrado:** worker de playback do conteÃºdo HxH estÃ¡ fora no provedor (503 em todos os .mp4, inclusive ep 1) â€” nÃ£o Ã© bug do app; sem fonte para eps 71..148 enquanto durar.
- **Pendente:** deploy na VPS sÃ³ com autorizaÃ§Ã£o explÃ­cita do usuÃ¡rio.
## 06/10/2026 - VIP Player: retry com series_id do Nixplay quando Ajax sÃ³ devolve fontes blacklisted
**Resumo:**
- Em `server/routes/videoScrapers.ts` (rota `/api/myembed-stream`): quando o Ajax do playerflix.ink com o `tmdb_id` responde mas TODAS as opÃ§Ãµes caem na lista negra (ou vÃªm vazias), o sistema agora tenta de novo com o `series_id` do Nixplay antes de emitir `VIP_UNAVAILABLE`. O id vem do querystring `series_id` (o frontend jÃ¡ o tem em `nixplaySeriesId`) ou Ã© resolvido no backend por `resolveNixplaySeriesId(tmdbId, name)` com sincronizaÃ§Ã£o do catÃ¡logo bounded em ~1.2s. O retry usa `res.redirect(307)` para re-executar a rota com o novo id e o flag `__nixretry=1` garante que sÃ³ ocorra uma vez (sem loop; se o retry tambÃ©m voltar blacklisted, cai no VIP_UNAVAILABLE normal). SÃ³ roda para sÃ©ries e sÃ³ quando o id novo difere do jÃ¡ tentado.
- Em `src/components/VideoPlayerModal.tsx`: o buildUrl do VIP Player (sÃ©rie) agora envia `&series_id=<nixplaySeriesId>` (quando disponÃ­vel) e `&name=<title>` para o backend.
- **ValidaÃ§Ã£o:** `npx tsc --noEmit` 0 erros; `scratch/proxy-smoke.mjs` 9/9 PASS. Servidor local ainda com o cÃ³digo antigo em memÃ³ria (precisa reiniciar o dev server para ativar). Caminho exato do retry (tÃ­tulo cujo Ajax sÃ³ devolve blacklisted) deve ser conferido ao vivo.
- **Pendente:** deploy na VPS sÃ³ com autorizaÃ§Ã£o explÃ­cita do usuÃ¡rio.

### 07/10/2026 - CorreÃ§Ã£o do Servidor Nixplay (Hunter x Hunter)
- **Bloqueio de SÃ©rie com Arquivos Offline:** O anime Hunter x Hunter 2011 (TMDB ID 46298) foi incluÃ­do numa lista de bloqueio do catÃ¡logo Nixplay (em server/services/nixplayCatalog.ts). Os arquivos .mp4 deste anime no servidor Nixplay estavam retornando erro 503 (Worker de reproduÃ§Ã£o indisponÃ­vel). O bloqueio forÃ§a a interface a nÃ£o exibir o Nixplay para essa sÃ©rie e usar os servidores de fallback primÃ¡rios (WatchPlayer e VIP Player), que mapeiam corretamente os episÃ³dios pelo TMDB e estÃ£o funcionando com sucesso.
# #   F i x   S 3 E 1 4 0   ( A b s o l u t e   E p i s o d e   I n d e x i n g )   f o r   W a t c h P l a y e r / V I P   P l a y e r  
 -   I d e n t i f i e d   t h a t   T M D B   r e t u r n s   a b s o l u t e   e p i s o d e _ n u m b e r s   ( e . g . ,   1 4 0 )   f o r   S e a s o n   3   o f   H u n t e r   x   H u n t e r .  
 -   I d e n t i f i e d   t h a t   W a t c h P l a y e r   a n d   V I P   P l a y e r   e x p e c t   r e l a t i v e ,   1 - b a s e d   i n d i c e s   f o r   e p i s o d e s   ( S 3 E 4 ) .  
 -   C r e a t e d   b a c k e n d   p r o x y   r o u t e s   \ / a p i / w a t c h p l a y - p r o x y - i f r a m e \   a n d   \ / a p i / v i p - p r o x y - i f r a m e \   i n   \ s e r v e r / r o u t e s / v i d e o S c r a p e r s . t s \   t o   i n t e r c e p t   a b s o l u t e   e p i s o d e   r e q u e s t s   ( e   >   5 0 )   a n d   c o n v e r t   t h e m   t o   r e l a t i v e   1 - b a s e d   i n d i c e s   v i a   T M D B   l o o k u p   b e f o r e   r e d i r e c t i n g .  
 -   P a t c h e d   \ V i d e o P l a y e r M o d a l . t s x \   t o   r o u t e   \ s r v _ w a t c h p l a y \   a n d   \ s r v _ v i p \   t h r o u g h   t h e   n e w   p r o x y   e n d p o i n t s .  
 -   P a t c h e d   \  i d s r c R o u t e s . t s \   t o   i n t e r c e p t   a b s o l u t e   e p i s o d e   r e q u e s t s   ( e   >   5 0 )   a n d   c o n v e r t   t h e m   t o   r e l a t i v e   1 - b a s e d   i n d i c e s   v i a   T M D B   l o o k u p   b e f o r e   r e q u e s t i n g   t h e   s t r e a m   f r o m   v i d s r c .  
 
## CorreÃ§Ã£o de Hunter x Hunter no VIP Player / WatchPlayer (07/10/2026)
- Descobrimos que o site animexhd.xyz roda o VIP Player mas enviava a Temporada 1.
- O PlayerFlix (fonte do VIP Player) aloca **todos** os episÃ³dios de animes contÃ­nuos na Temporada 1.
- A correÃ§Ã£o anterior tentou usar a API do TMDB para converter o nÃºmero absoluto para um Ã­ndice relativo, mas o provedor nÃ£o usa esse Ã­ndice. Ele exige Temporada 1 e o nÃºmero do episÃ³dio absoluto.
- Patcheamos as rotas watchplay-proxy-iframe, ip-proxy-iframe e myembed-stream em server/routes/videoScrapers.ts para forÃ§ar season = 1 caso o episÃ³dio passado seja > 50.
- Testado localmente, a extraÃ§Ã£o passa a achar o iframe do embedplayer2.xyz e o HLS master.m3u8 com sucesso.

## 07/10/2026 - Sistema de Reporte de Bugs
**Resumo:**
- Implementado o sistema de relatÃƒÂ³rios de bugs integrado ao Firebase Firestore e Storage.
- `clientId.ts`: Criado identificador ÃƒÂºnico baseado no localStorage (com fallback em crypto.randomUUID ou gerador randÃƒÂ´mico simples se uuid indisponÃƒÂ­vel).
- `firestore.rules`: Adicionadas regras para a coleÃƒÂ§ÃƒÂ£o `bug_reports` (create livre desde que seja status=pending e possua clientId; leitura restrita ao admin ou para os bugs do prÃƒÂ³prio cliente (limitado a 20)).
- `ReportBugModal.tsx`: Componente criado na raiz dos componentes para o usuÃƒÂ¡rio relatar erros (incluindo anexo de print que sobe no Firebase Storage).
- `AdminBugReports.tsx`: Adicionada nova interface (acessada pela tab Bugs) no `AdminPage.tsx` que lista os reports, separa entre pendentes e resolvidos e permite responder/marcar como resolvido com mensagens em template ou customizadas.
- `BugFeedbackListener.tsx`: Renderizado no final do `App.tsx`. Ouve passivamente ao Firestore por bugs do usuÃƒÂ¡rio (`clientId`) marcados como `resolved` e exibe um feedback flutuante (toast). Ao fechar, deleta o registro do banco de dados e a imagem do Storage.
- `DetailsPage.tsx`: Inserido o botÃƒÂ£o "Reportar Erro" ao lado de Download na pÃƒÂ¡gina principal do filme/sÃƒÂ©rie e um botÃƒÂ£o com ÃƒÂ­cone de bug na listagem para cada episÃƒÂ³dio.
- Os cÃƒÂ³digos TypeScript foram validados com `tsc --noEmit` e nÃƒÂ£o mostraram erros nas mudanÃƒÂ§as recentes.

## 07/10/2026 - CorreÃ§Ã£o O Dia do Chacal (MixDrop) & Asaas 401 & UI
**Resumo:**
- **O Dia do Chacal (MixDrop):** Auto-recovery (Fase 3) em aÃ§Ã£o perfeitamente. O erro 502 Bad Gateway (visto nos logs do usuÃ¡rio) foi o gatilho capturado pelo React. O frontend executou o efresh=1 chamando encontreiLookup.ts, ignorou o arquivo JSON obsoleto e usou o scraper ao vivo para capturar a string HD funcional do site encontrei.me correspondente Ã  dublagem em portuguÃªs. 4dnjrxg3aq3wvwk carregou normalmente.
- **Asaas Payment 401:** Inserido o header User-Agent: PlayInfinity/1.0.0 no arquivo server/routes/payments.ts. Contas raiz criadas a partir de jun/2024 bloqueavam a API com 401 se ausente.
- **Admin UI:** O texto 'Aguardando o cliente visualizar para ser excluÃ­do automaticamente' removido de AdminBugReports.tsx. O scroll vertical do card permanece aguardando clarificaÃ§Ã£o.



## 08/10/2026 - Resolver Ao Vivo pra ConteÃºdo NOVO (Carrie a Estranha / MixDrop)
**Resumo:**
- **Problema:** SÃ©rie nova "Carrie, a Estranha" (tmdb 288673, estreou 07/10/2026) nÃ£o puxava no MixDrop â€” o catÃ¡logo local Ã© um snapshot de 22/09/2026 e o resolver live (`resolveEncontreiEpisode`) retornava null IMEDIATAMENTE quando o `_tmdbToSerieIdMap` nÃ£o tinha o tmdb (nunca buscava no site). AlÃ©m disso o fallback fabricava `mxdrop.top/e/{tmdbId}` (chute que sempre dÃ¡ 502). A busca `/search/` do encontrei.me Ã© 403 ("permission") pra conta Dante15.
- **Descoberta ao vivo (scratch/test-encontrei-search.mjs):** as pÃ¡ginas de listagem (`/series/online/`, `/filmes/online/`) sÃ£o acessÃ­veis com cookie e listam slug+id; a pÃ¡gina de cada item expÃµe `data-tmdb-id`. Cadeia validada: listagem â†’ Carrie serie_id 82940 â†’ episodesList â†’ ep 82941 â†’ playerData â†’ mixdrop dublado `pjkr4deehg7r646`.
- **Refresh Incremental (`encontreiLookup.ts`):** nova infra `ensureEncontreiFreshContent` â€” varre listagens (pgs 1-2, cache 10min), identifica itens com id FORA do snapshot, extrai o `data-tmdb-id` da pÃ¡gina (filtro opcional por tÃ­tulo via slug) e popula `_tmdbToSerieIdMap` (sÃ©ries) e `_encontreiMovieIndex` (filmes com video_id; servers resolvidos depois via playerData). Bounded: mÃ¡x 12 pÃ¡ginas/scan, cache por slug, breaker de cookie compartilhado. `resolveEncontreiEpisode`/`resolveEncontreiMovie` agora escaneiam antes de desistir (parÃ¢metro `name` opcional).
- **Rota `/api/encontrei-lookup`:** aceita `&name=<tÃ­tulo>` e repassa pros resolvers.
- **Frontend:** `encontreiCatalog.ts` (`findEpisode`/`findMovieByTmdbId` ganham `name`) e `VideoPlayerModal.tsx` (`lookupMixdropFileId` passa o `title` do modal).
- **Fim do fallback fantasma (`VideoPlayerModal.tsx`):** `setupInitialServer` detecta URL fabricada `mxdrop.top/e/{imdbId|tmdbId}` (que nunca Ã© fileId real) e inicia direto pelo prÃ³ximo servidor homologado â€” elimina o ciclo 502 â†’ recovery â†’ ~20s perdidos.
- **ValidaÃ§Ã£o:** `npx tsc --noEmit` exit 0; teste ao vivo `scratch/test-fresh-resolver.mjs` (tsx): S1E1 â†’ `pjkr4deehg7r646` Dublado em 3.3s (primeira chamada inclui o scan), S1E2 em 0.3s via cache do mapa.

## 08/10/2026 - Blinda Nixplay: Cache em Disco + Retry do Check (nÃ£o some mais do seletor)
**Resumo:**
- **Problema relatado:** Logo apÃ³s o deploy do fix da Carrie, o Nixplay sumiu do seletor de servidores pra essa sÃ©rie. InvestigaÃ§Ã£o ao vivo: backend respondia `available: true` (Carrie no acervo Nixplay, series_id 288673, 8 eps), sem block do painel admin (sÃ³ o srv_vip de Carrie estava blockado â€” intencional, criado pelo dono com reason "Sem a Skin Netflix"), sem blacklist. Causa raiz: `nixplayCatalog.ts` mantinha o catÃ¡logo SÃ“ em memÃ³ria â€” cada restart de deploy zerava tudo e o primeiro `/api/nixplay-check` dependia do nixplay.lat responder; se estava lento/fora, `available:false` â†’ Nixplay escondido do seletor naquela sessÃ£o.
- **`server/services/nixplayCatalog.ts` (reescrito):** catÃ¡logo agora persiste em `data/nixplay-catalog-cache.json` (gitignored; pasta data/ jÃ¡ fora do Vite watch). No boot, carrega do disco instantaneamente (check funciona em 0ms, independente do nixplay.lat); re-sincroniza ao vivo em background com throttle de 30min e dedupe de syncs concorrentes; sucesso parcial (sÃ³ filmes OU sÃ³ sÃ©ries) nÃ£o zera o catÃ¡logo; sÃ³ substitui listas quando a resposta vem populada. Falha do nixplay.lat nunca mais esconde o servidor â€” usa cache stale atÃ© voltar.
- **`src/components/VideoPlayerModal.tsx`:** o check de disponibilidade do Nixplay ganhou 1 retry automÃ¡tico apÃ³s 2s quando a requisiÃ§Ã£o FALHA por rede (antes: qualquer blip escondia o servidor instantaneamente). Resposta definitiva `available:false` do backend nÃ£o retrata.
- **ValidaÃ§Ã£o:** `npx tsc --noEmit` exit 0; teste de runtime (`scratch/test-nixplay-cache.mjs`): 1Âª execuÃ§Ã£o sync ao vivo 2.3s (23.093 filmes / 11.450 sÃ©ries) + cache salvo; 2Âª execuÃ§Ã£o em processo novo (simula restart da VPS): **96ms do disco, Carrie disponÃ­vel** â€” cenÃ¡rio pÃ³s-deploy blindado. HxH 46298 permanece bloqueado por design.
- **Pendente:** deploy na VPS Oracle â€” sÃ³ com autorizaÃ§Ã£o explÃ­cita do dono.

- **Pendente:** deploy na VPS Oracle (o resolver live da VPS precisa do ENCONTREI_COOKIE no ambiente) â€” sÃ³ com autorizaÃ§Ã£o explÃ­cita. O resolver do Vizer tem o mesmo guard estrutural; mesma tÃ©cnica pode ser aplicada depois se necessÃ¡rio.

## 07/10/2026 - SincronizaÃ§Ã£o de NotificaÃ§Ãµes Lidas (Sininho) na Nuvem
**Resumo:**
- **Problema:** Ao abrir o modal de notificaÃ§Ãµes (sininho) no PC, os itens eram marcados como lidos apenas no localStorage. Ao abrir no celular, o badge continuava aceso.
- **SoluÃ§Ã£o:** Implementada sincronia com o Firestore (eadNotifications). markNotificationAsRead e markAllNotificationsAsRead agora fazem debounce de 5s e enviam o array atualizado pro banco. O App.tsx baixa essas flags no login (etchReadNotificationsFromCloud) e o listener onSnapshot captura atualizaÃ§Ãµes em tempo real vindas de outros dispositivos, mesclando e apagando o badge instantaneamente em todas as sessÃµes ativas.



## 08/10/2026 - ImplementaÃ§Ã£o de Push Notifications (FCM)
**Resumo:**
- **Frontend (`App.tsx`):** Integrado o Firebase Cloud Messaging (FCM). Adicionada lÃ³gica que solicita permissÃ£o do usuÃ¡rio via `requestPermission()` apÃ³s o login. O `fcmToken` obtido Ã© gravado no documento do usuÃ¡rio no Firestore (`usuarios/{uid}` e `users/{email}`).
- **Backend (`server/firebaseAdmin.ts` & `adminOps.ts`):** O backend foi configurado para instanciar tambÃ©m o serviÃ§o `getAdminMessaging()`. Foi criada a rota protegida `POST /api/admin/push` que recebe `title` e `body`. A rota busca todos os usuÃ¡rios com `fcmToken` vÃ¡lido no Firestore (limitado a 500 por lote do `sendEachForMulticast`) e envia os pushes globalmente.
- **Painel Admin (`AdminPage.tsx` & `AdminPushNotifications.tsx`):** Adicionada uma nova aba com o Ã­cone de "Sino" (Push) ao painel administrativo. A nova interface permite compor um TÃ­tulo e Mensagem e disparar um Push Notification em lote com apenas um clique.
- **Capacitor Mobile:** O envio funciona nativamente em dispositivos mÃ³veis caso as dependÃªncias `@capacitor-firebase/messaging` estejam instaladas e configuradas adequadamente.

## 08/10/2026 - RobÃ´ de CriaÃ§Ã£o Ampere (VPS)
**Resumo:**
- Atualizado o script `auto_create_ampere.py` remotamente na VPS Oracle para forÃ§ar `boot_volume_size_in_gbs=150` no `source_details`. Isso garante a manutenÃ§Ã£o no escopo grÃ¡tis de discos, evitando passar do limite grÃ¡tis (junto com a Micro de 50GB). O PM2 foi reiniciado na VPS para aplicar a mudanÃ§a no bot de prospecÃ§Ã£o contÃ­nua da A1.Flex.

## 08/10/2026 - NotificaÃ§Ãµes AutomÃ¡ticas de Novos EpisÃ³dios (Favoritos)
**Resumo:**
- **Catalog Watcher:** Criado serviÃ§o `server/services/catalogWatcher.ts` que monitora o `encontrei-catalog.json`.
- **PersistÃªncia de Estado:** O serviÃ§o salva o tamanho atual das sÃ©ries (nÃºmero de episÃ³dios) em `data/catalog-state.json`.
- **VerificaÃ§Ã£o ContÃ­nua:** Integrado ao `server.ts` para rodar a cada 60 minutos (e 10s apÃ³s inicializaÃ§Ã£o).
- **Push para FÃ£s:** Ao detectar novos episÃ³dios, consulta o Firestore (`usuarios` -> `favoritos`), coleta os `fcmToken` dos usuÃ¡rios afetados, e dispara o Push Notification com a Firebase Admin SDK.
- **Sininho In-App:** Validado que a funcionalidade "Sininho" de lanÃ§amentos diÃ¡rios jÃ¡ operava automaticamente no app (lendo diretamente dos cronogramas do TMDB de forma dinÃ¢mica).


## 08/10/2026 - CorreÃ§Ã£o Profunda da LÃ³gica de Push Notifications (FCM) â€” Auditoria + Fixes
**Resumo:**
- **Bug crÃ­tico 1 (watcher morto):** O `catalogWatcher.ts` lia um campo `seriesId` que **nÃ£o existe** no `encontrei-catalog.json` (os episÃ³dios usam `serie_id` e `tmdb_id`). Resultado: `currentCounts` sempre vazio â†’ **nenhum push automÃ¡tico jamais disparou**. Corrigido para contar por `tmdb_id`.
- **Bug crÃ­tico 2 (espaÃ§o de IDs):** Mesmo corrigido o campo, a query antiga usava o ID do encontrei (`serie_id`) contra o array `favoritos`, que armazena **TMDB IDs**. Corrigido: query `where("favoritos", "array-contains", tmdbId)`. O nome real da sÃ©rie agora Ã© resolvido via `serie_id -> slug` do catÃ¡logo (ex: "Presidente Curtis") e usado no texto do push.
- **Bug crÃ­tico 3 (painel admin 401):** `AdminPushNotifications.tsx` usava `fetch` puro sem headers de auth â†’ sempre rejeitado pelo `requireAdminAuth`. Corrigido para usar `adminFetch` (injeta `Authorization: Bearer` + `x-admin-token`).
- **Push Web (navegador):** Criado `public/firebase-messaging-sw.js` (service worker FCM v12.19.0). O registro web Ã© feito no novo serviÃ§o `src/services/pushNotifications.ts` e exige a env `VITE_FIREBASE_VAPID_KEY` (chave de par Web Push gerada no Firebase Console â†’ Cloud Messaging). Sem a chave, o push web fica desativado com log informativo (sem crash).
- **Multi-dispositivo:** Token FCM agora gravado no array `fcmTokens` (via `arrayUnion`, nÃ£o sobrescreve outros aparelhos). O campo `fcmToken` (string) Ã© mantido por compatibilidade legada. Backend lÃª ambos.
- **Lifecycle do token:** Adicionado listener `tokenReceived` (rotaÃ§Ã£o de token FCM nativo) em `setupFcmTokenRefreshListener()` (usado no App.tsx) e `removeFcmTokenFromCloud()` no logout (`UserProfilePage.tsx`) â€” usuÃ¡rio deslogado para de receber push naquele aparelho.
- **Push global sem corte:** `POST /api/admin/push` nÃ£o limita mais a 500 usuÃ¡rios silenciosamente â€” busca todos com `.select("fcmToken","fcmTokens")` (projeÃ§Ã£o leve) e envia em lotes de 500. Tokens invÃ¡lidos/nÃ£o-registrados (resposta do `sendEachForMulticast`) sÃ£o removidos dos docs dos donos automaticamente. Resposta agora retorna `{count, sent, cleanedInvalid}`.
- **firebaseAdmin.ts:** Adicionado `getAdminFieldValue()` (para `FieldValue.delete()` na limpeza) e warning claro quando inicializa sem service account (Firestore/FCM nÃ£o funcionarÃ£o).
- **Fix colateral:** `CastModal.tsx` â€” `Chromecast.show()` nÃ£o existe nas typings do `@caprockapps/capacitor-chromecast@7.x` instalado; substituÃ­do por compat (usa `show` se existir em runtime, senÃ£o `requestSession()`).
- **ValidaÃ§Ã£o:** `npx tsc --noEmit` passando com zero erros (node_modules foi completado com `npm install` â€” pacotes `@capacitor-firebase/messaging` e `@caprockapps/capacitor-chromecast` estavam ausentes localmente).
- **Pendente de configuraÃ§Ã£o:** Adicionar `VITE_FIREBASE_VAPID_KEY` no `.env`/`.env.local` e na VPS Oracle para ativar push web; o push nativo Android funciona sem ela. Deploy backend na VPS Oracle necessÃ¡rio para o watcher/correÃ§Ãµes fazerem efeito em produÃ§Ã£o.
- **Deploy/Release:** Versionamento Android incrementado para `versionCode 10` / `versionName 1.1.9` (android/app/build.gradle) e alteraÃ§Ãµes enviadas para a branch `main`, disparando o Deploy AutomÃ¡tico para a VPS Oracle (main.yml) e o Build Android (build-android.yml).

## 08/10/2026 - AtivaÃ§Ã£o do Push Web (VAPID Key FCM) + Deploy
**Resumo:**
- **VAPID Key configurada:** O usuÃ¡rio gerou o par de chaves no Firebase Console (Cloud Messaging â†’ Certificados Push da Web). A chave pÃºblica foi validada criptograficamente (65 bytes, ponto P-256 vÃ¡lido, importaÃ§Ã£o via WebCrypto OK).
- **`.env.production` (novo, versionado):** ContÃ©m apenas a `VITE_FIREBASE_VAPID_KEY` (chave PÃšBLICA por design â€” segura para o repositÃ³rio). O `.gitignore` foi ajustado com `!.env.production` (o `.env.local` com segredos continua ignorado).
- **Teste local end-to-end:** `npx vite build` confirmou a chave embutida no bundle final (`dist/assets/index-*.js`).
- **Deploy:** Versionamento Android incrementado para `versionCode 11` / `versionName 1.2.0` e alteraÃ§Ãµes enviadas para a `main` (Deploy VPS Oracle + Build Android). ApÃ³s o deploy, o push web fica 100% ativo: navegador pede permissÃ£o no login â†’ registra SW `firebase-messaging-sw.js` â†’ token salvo em `usuarios/{uid}.fcmTokens`.


## 08/10/2026 - REGRA DO DONO: Push pro GitHub Exige AutorizaÃ§Ã£o ExplÃ­cita
**Resumo:** Por ordem direta do dono do projeto, regrado na seÃ§Ã£o 7 do `AGENTS.md` (editada localmente): **NENHUM agente de IA pode executar `git push` para o GitHub em NENHUMA branch sem autorizaÃ§Ã£o explÃ­cita e verbal do usuÃ¡rio** ("pode fazer", "executa", "envia"). Sem autorizaÃ§Ã£o, deixar commits prontos localmente â€” o deploy Ã© feito manualmente pelo dono. Esta entrada serve como lembrete permanente para todas as sessÃµes futuras. NOTA: a ediÃ§Ã£o do AGENTS.md com esta regra ainda NÃƒO foi commitada/pushada â€” aguardando decisÃ£o do dono (manualmente ou autorizando um agente).


## 08/10/2026 - Auditoria e CorreÃ§Ã£o do Sistema de Reportar Bugs
**Resumo:**
- **Bug crÃ­tico 1 (regra do Firestore morta):** A regra de `bug_reports` usava `request.query.limit` â€” que NÃƒO existe na linguagem de regras do Firestore (erro de avaliaÃ§Ã£o = deny) â€” e comparava `clientId` (UUID de localStorage) com `request.auth.uid` (nunca igual). Resultado: o `BugFeedbackListener` tomava permission-denied silencioso â†’ **o toast de feedback do admin NUNCA chegou ao usuÃ¡rio final** e o dismiss nÃ£o apagava nada. Regra reescrita: read/delete para admin OU dono (clientId == auth.uid), update sÃ³ admin, create com hasOnly de campos + description 1-2000 chars.
- **Bug crÃ­tico 2 (vazamento de disco na VPS):** O `storagePath: "vps/<file>"` apontava pro Firebase Storage, mas a imagem vive no disco da VPS (`uploads/bug_reports/`) â†’ o `deleteObject` do listener sempre falhava â†’ **imagens jamais eram apagadas**. Corrigido: listener sÃ³ apaga o doc; nova rota `POST /api/admin/delete-bug-image` (protegida por requireAdminAuth, com blindagem de path traversal) remove o arquivo do disco, acionada pelo novo botÃ£o "Excluir" no painel admin (cards pendentes E resolvidos) que tambÃ©m deleta o doc â€” fim da fila infinita de reports resolvidos.
- **clientId = auth.uid:** `ReportBugModal` agora grava `clientId = user.uid` quando logado (habilita o loop de feedback pelas regras); anÃ´nimos mantÃªm o identificador de localStorage (reportam, mas sem feedback â€” limitaÃ§Ã£o aceita).
- **BugFeedbackListener:** reescrito â€” escuta por uid com `onAuthStateChanged` (reativa em login/logout), callback de erro no `onSnapshot` (fim da falha silenciosa), removida a tentativa quebrada de deletar do Storage.
- **Hardening do upload (`/api/upload-bug-image`):** rate limit de 5/hora por IP (express-rate-limit), validaÃ§Ã£o de content-type (sÃ³ data URL de PNG/JPG/GIF/WEBP), validaÃ§Ã£o de 5MB pÃ³s-decode (mesmo limite da UI) e validaÃ§Ã£o de tipo+tamanho no cliente (`handleFileChange`) com mensagens de erro claras.
- **Infra:** `server.watch.ignored` += `'**/uploads/**'` (regra 2 do AGENTS.md â€” uploads nÃ£o causam mais reload no Vite dev) e `.gitignore` += `uploads/` (prints de usuÃ¡rios nÃ£o correm risco de commit).
- **ValidaÃ§Ã£o:** `npx tsc --noEmit` â€” exit 0, zero erros.
- **PENDÃŠNCIA MANUAL CRÃTICA:** As `firestore.rules` sÃ£o deployadas manualmente (nÃ£o hÃ¡ firebase.json/CI no repo) â€” **o usuÃ¡rio DEVE colar as novas regras no Firebase Console â†’ Firestore â†’ Regras** para o loop de feedback funcionar em produÃ§Ã£o. Docs antigos com clientId de localStorage nÃ£o recebem feedback (edge aceita).


## 08/10/2026 - Download 100% In-App + Playback Offline com Skin Netflix
**Resumo:**
- **Download sem arquivo no SO (decisÃ£o de produto do usuÃ¡rio):** `triggerDirectDownload` (`src/services/downloadService.ts`) nÃ£o cria mais o `<a download>` â€” o navegador nÃ£o recebe mais o arquivo bruto. O download agora Ã© sÃ³ dentro da plataforma: fetch com progresso real (velocidade/ETA na barra bidirecional) â†’ blob no IndexedDB (web) ou Capacitor Filesystem (mobile). BÃ´nus: fim do download duplicado (antes baixava 2x â€” uma pro SO e outra pro app), banda reduzida pela metade.
- **DownloadsPage:** botÃ£o "Baixar Novamente" renomeado para "Baixar no App" (re-download offline).
- **Ponte Local (Local Player Bridge) no `VideoPlayerModal.tsx`:** quando a mÃ­dia Ã© `blob:`/`capacitor://`/`file://` (offline), o `<video>` local agora renderiza SEM controls nativos. Um adaptador novo traduz os eventos do `<video>` (timeupdate/play/pause/waiting/ended/error/volumechange) para MessageEvents sintÃ©ticos com o MESMO protocolo postMessage dos players remotos (`WATCHPLAY_STATUS` com currentTime/duration/paused/volume/buffered/playbackRate, `WATCHPLAY_VIDEO_ENDED`, `WATCHPLAY_ERROR`), usando `origin = window.location.origin` (passa nas validaÃ§Ãµes `isTrustedPlayerEvent` do modal e `isTrustedMessageOrigin` da skin). Ticker de 1s espelha o `sendStatus` dos embeds. Resultado: watchdog macro, auto-next de episÃ³dio, overlay anti-flash e skin funcionam idÃªnticos ao streaming.
- **Comandos da skin no offline:** como a `NetflixPlayerSkin` jÃ¡ publica seus comandos na `window` via `window.postMessage` quando nÃ£o hÃ¡ iframe, a ponte intercepta (`e.source === window`) e aplica direto no elemento: PLAY/PAUSE/TOGGLE_PLAY/SEEK/SEEK_ABSOLUTE/SET_VOLUME/SET_MUTED/REQUEST_STATUS. Play/pause, barra de progresso com seek, volume, mute e prÃ³ximo episÃ³dio funcionam 100% offline. Nenhuma alteraÃ§Ã£o foi necessÃ¡ria na skin.
- **Guard da Pausa Blinda:** o reload forÃ§ado apÃ³s 3min de pausa (pensado pra streaming travado) foi desativado no modo offline (`isOfflineMediaRef`) â€” pausar um download por muito tempo e retomar nÃ£o forÃ§a mais fallback pra streaming.
- **LimitaÃ§Ãµes conhecidas do offline:** "Continuar Assistindo" (seek inicial) e pular abertura nÃ£o se aplicam no playback offline (esses comandos vÃ£o direto pro iframe, que nÃ£o existe); auto-next de episÃ³dio volta pro streaming do backend.
- **ValidaÃ§Ã£o:** `npx tsc --noEmit` â€” zero erros.
- **Versionamento:** `versionCode 12` / `versionName 1.2.1`. Deploy na VPS Oracle + AAB pendentes de autorizaÃ§Ã£o explÃ­cita do usuÃ¡rio.
## 08/10/2026 - Fix: Condiï¿½ï¿½o de corrida no MixDrop (Fallback fantasma)
- **Problema:** Ao abrir um vï¿½deo, o React iniciava a sondagem do fileId HD do MixDrop no background, mas o setupInitialServer nï¿½o aguardava o resultado. Com isso, ele gerava a URL fabricada (ex: mxdrop.top/e/tmdbId), detectava imediatamente que era falsa e descartava o MixDrop antes mesmo do scraper de 3 segundos conseguir devolver a URL verdadeira. Isso gerava os erros 'MixDrop sem fileId real' seguidos de pulo pro WatchPlayer/Nixplay.
- **Correï¿½ï¿½o:** No src/components/VideoPlayerModal.tsx, a inicializaï¿½ï¿½o do MixDrop agora faz o await lookupMixdropFileId explicitamente antes de gerar a URL, garantindo que o player utilize o resultado resolvido na primeira tentativa. Validado com base no console dump do usuï¿½rio.

- [x] Corrigido erro de comutaï¿½ï¿½o do servidor MixDrop para WatchPlayer em sï¿½ries. O fallback para \/api/watchplay-proxy-iframe\ nï¿½o estava no whitelist de extraï¿½ï¿½o, resultando em 403 Forbidden pelo \/api/extract-player\. Foram adicionados os prefixos \/api/watchplay-proxy-iframe\ e \/api/vip-proxy-iframe\ ao whitelist em \handleExtract\ no arquivo \VideoPlayerModal.tsx\.

- [x] Corrigido falha instantï¿½nea do MixDrop em navegadores com bloqueadores de anï¿½ncio e Tracking Prevention estrito. A URL do iframe \/api/mixdrop-stream\ estava sendo bloqueada pela palavra 'mixdrop', acionando o evento onError e causando fallback silencioso imediato. Os endpoints foram renomeados para \/api/md-stream\ e \/api/md-proxy\.

- [x] Otimizada lï¿½gica de inicializaï¿½ï¿½o do VideoPlayerModal para resolver fileIds reais do MixDrop imediatamente ao invï¿½s de pular para o prï¿½ximo servidor, evitando tempo de espera desnecessï¿½rio.

- [x] Otimizada e expandida a aba de Sagas (src/data/sagas.ts): gerado um script automatizado que consultou a API do TMDB em busca das sagas mais famosas, adicionando 29 franquias ao sistema. Tambï¿½m foi removido 'Hobbs & Shaw', curtas e 'Better Luck Tomorrow' da saga Velozes e Furiosos para manter a cronologia oficial.

## 08/10/2026 - Carrie 2026 no Vizer + Fallback Duplo de DomÃ­nio (vizer.website â†’ vizer.reisen) + Health Check Anti-MigraÃ§Ã£o

**Contexto:** Sondagem ao vivo revelou que a sÃ©rie **Carrie, a Estranha (2026)** (TMDB **288673**) existe no Vizer (`serie_id=82940`, T1 com 8 eps **DUBLADOS**, todos com MixDrop ativo â€” EP1 `pjkr4deehg7r646` ... EP8 `jd9lqr0es44pj0`), mas nÃ£o constava em nenhum catÃ¡logo local. AlÃ©m disso, o Vizer **migrando de domÃ­nio**: `vizer.website` agora redireciona para `vizer.reisen` (homepage via 302 e endpoints AJAX via HTTP 200 + JSON `{"redirect":"..."}`).

**AlteraÃ§Ãµes:**

- **`server/routes/encontreiLookup.ts`:**
  - Novo helper **`vizerFetchJson()`** com **fallback duplo de domÃ­nio**: `VIZER_DOMAINS = [vizer.reisen (atual), vizer.website (antigo)]`, memoriza o domÃ­nio que funcionou (`_vizerWorkingDomain`), persegue o redirect em nÃ­vel de aplicaÃ§Ã£o (JSON `{"redirect":...}`) e cai pro prÃ³ximo domÃ­nio em timeout/erro. Blindado contra migraÃ§Ãµes silenciosas (histÃ³rico: vizer.beauty â†’ vizer.website â†’ vizer.reisen).
  - `checkVizerSeason`, `resolveVizerEpisode` e `resolveVizerMovie` reescritos para usar `vizerFetchJson` (sem URLs hardcoded). O `Referer` do playerData de filme agora Ã© relativo ao domÃ­nio base.
  - **Patch de catÃ¡logo em memÃ³ria** (`VIZER_CATALOG_PATCH` + `applyCatalogPatches()`, aplicado ao final de cada `loadCatalogs()`): injeta a Carrie 2026 (TMDB 288673 â†’ serie_id 82940, 8 eps com os MixDrop IDs sondados) nos Ã­ndices `_vizerEpisodeIndex`/`_tmdbToSerieIdMap`/`_vizerSeriesSeasonsIndex` sem tocar nos JSONs de 14MB. Idempotente (nunca sobrescreve o catÃ¡logo oficial); se um mixdrop morrer, o `refresh=1` re-resolve ao vivo.
- **`server/routes/adminOps.ts` (`/api/admin/health-check`):** o "CatÃ¡logo Vizer" agora usa validaÃ§Ã£o dedicada **`checkVizer()`** que detecta migraÃ§Ã£o de domÃ­nio por dois sinais: redirect HTTP (comparando o host de `res.url`) e o stub JSON `{"redirect":...}` nos endpoints AJAX (sonda episodesList com Carrie 82940). MigraÃ§Ã£o detectada â†’ marca **OFFLINE** com mensagem explicativa (antes o fetch seguia o redirect, via 200 e o painel marcava ONLINE sem avisar â€” motivo pelo qual a migraÃ§Ã£o atual passou despercebida). Adicionado alvo estÃ¡tico "CatÃ¡logo Vizer (novo domÃ­nio)" = `https://www.vizer.reisen`.

**ObservaÃ§Ã£o operacional:** durante os testes o Vizer apresentou latÃªncia alta intermitente (10s+ por chamada); os timeouts estritos dos resolvers (3â€“4s) retornam `null` nesses casos (proteÃ§Ã£o anti-travamento by design) e o player cai nos fallbacks. 

**ValidaÃ§Ãµes:**
- `npx tsc --noEmit` â€” zero erros.
- `scratch/test-carrie-resolvers.ts`: [1] `checkVizerSeason(288673,1)=true` (patch funcionando); [2]/[3] resolveVizerEpisode EP1/EP8 retornaram os mixdrop corretos `pjkr4deehg7r646`/`jd9lqr0es44pj0` Dublado; [4] resolveVizerMovie(18) OK (`369jx489amz61xl`); [5] teste determinÃ­stico com fetch mockado: reisen "caÃ­do" â†’ fallback pro .website â†’ perseguiÃ§Ã£o do redirect â†’ mixdrop resolvido. **Fallback duplo 100% funcional.**

**Pendente (deploy):** alteraÃ§Ãµes somente no ambiente local â€” `git push`/deploy na VPS Oracle aguardando autorizaÃ§Ã£o explÃ­cita do usuÃ¡rio (regra 7 do AGENTS.md). No app Android, o bundle `android/.../server.cjs` serÃ¡ regenerado no build do GitHub Actions.



## 08/10/2026 (2) - Scan Incremental do Vizer (modelo do encontrei.me) + Fix rate-limiter pÃ³s-rename md-stream

**Contexto:** `git pull` trouxe os commits do agente anterior, incluindo `34aa1dc` (rename `/api/mixdrop-stream` â†’ `/api/md-stream` e `/api/mixdrop-proxy` â†’ `/api/md-proxy` â€” anti-adblocker) e `0993486` (scan incremental de conteÃºdo pÃ³s-snapshot no encontrei.me). Conflito de walkthrough.md resolvido mantendo as duas seÃ§Ãµes.

**AlteraÃ§Ãµes:**
- **`server.ts` (fix pÃ³s-rename):** a lista `scrapingPrefixes` do rate-limiter ainda apontava `/mixdrop-stream` â€” a rota renomeada `/md-stream` ficou SEM o limite restrito de 30 req/min (caÃ­a no genÃ©rico de 150). Corrigido para `"/md-stream"`.
- **`server/routes/encontreiLookup.ts` â€” REFRESH INCREMENTAL DO VIZER** (rÃ©plica do modelo do encontrei.me, pois ambos sÃ£o espelhos IPS com os mesmos ids): `vizerFetchHtml()` (HTML GET com fallback duplo de domÃ­nio VIZER_DOMAINS), `ensureVizerFreshListing()` (varre `/series/online/` + pg/2 e `/filmes/online/` + pg/2, cache 10min), `vizerKnownSetsLoad()` (ids conhecidos dos snapshots) e `ensureVizerFreshContent(kind, title)` (bounded em 12 candidatos, filtro por slug via `encSlugMatchesTitle` reutilizada, extrai `data-tmdb-id` da pÃ¡gina do item e popula `_tmdbToSerieIdMap`/`_tmdbToVizerMovieIdMap` + placeholder em `_vizerMovieIndex`). `resolveVizerEpisode`/`resolveVizerMovie` ganham param `name?` e escaneiam antes de desistir; a rota `/api/encontrei-lookup` repassa `lookupName` aos resolvers do Vizer.
- Vantagens sobre o scan do encontrei: **nÃ£o exige cookie de sessÃ£o** e **sobrevive Ã  migraÃ§Ã£o de domÃ­nio** (.websiteâ†’.reisen) via fallback duplo.

**ValidaÃ§Ãµes:**
- `npx tsc --noEmit` â€” zero erros.
- `scratch/test-vizer-fresh.ts` (conteÃºdo estreiado 07-08/10/2026, ausente de todos os snapshots): [1] sÃ©rie "Dentro do CÃ­rculo" (TMDB 290233) â†’ scan mapeou `serie_id=82931` sozinho â†’ EP1 mixdrop `vknw7gwxul8d9k` Dublado (34s, inclui o scan); [2] 2Âª chamada EP2 em 2.6s (cache do mapeamento); [3] filme "Sobrenatural: Agora Entre NÃ³s" (TMDB 1291595) â†’ `vizer_movie_id=78472` â†’ mixdrop `r6w7l8rpfve7qqz` Dublado em 666ms.
- Log de descoberta: `[vizer-fresh] SÃ©rie nova mapeada: tmdb=290233 â†’ serie_id=82931 (dentro-do-circulo-dublado)`.

**Deploy:** push autorizado pelo usuÃ¡rio â€” `versionCode 15` / `versionName 1.2.4` (APK/AAB via GitHub Actions no push pra main). Deploy na VPS Oracle (PM2) segue manual pelo dono.




