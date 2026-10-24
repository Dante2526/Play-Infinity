## 24/10/2026 - Sistema de Rastreamento de Indicações em Cadeia (Rede de Amigos até 31+ Níveis)

**Contexto e Motivação:**
Implementação do sistema de afiliados / indicações em rede solicitado pelo usuário: quando um amigo compartilha seu link exclusivo (`play-infinity.stream?ref=CODIGO`), qualquer novo amigo que se cadastrar por ele (e os amigos desse amigo, sucessivamente até 31+ níveis) mantém o vínculo com o Amigo Original (raiz da rede), permitindo ao administrador rastrear toda a linhagem, o teste grátis de 30 minutos e a conversão em assinante ativo no Painel ADM.

**Modificações Realizadas (7 arquivos):**
1. **`src/services/referralLogic.cjs` (Novo):**
   - Módulo com lógica pura de extração de parâmetros de URL (`?ref=`, `?ind=`, `?r=`), geração de slugs alfanuméricos amigáveis (`generateReferralCode`), cálculo de herança de raiz (`computeReferralLineage`) e classificação de ciclo de vida (`classifyReferralStatus`).
2. **`src/services/referralService.ts` (Novo):**
   - Camada TypeScript com captura global e armazenamento resiliente (`localStorage`, `sessionStorage` e Cookie de 30 dias para evitar perdas se o cliente fechar a aba ou navegar antes de cadastrar).
   - Resolução assíncrona de linhagem no Firestore (`resolveReferrerData`) e construtor de links oficiais (`buildReferralLink`).
3. **`src/App.tsx`:**
   - Inserida captura automática de parâmetros de indicação (`captureReferralFromUrl()`) no primeiro ciclo de renderização.
4. **`src/components/AuthModal.tsx`:**
   - No fluxo de registro de nova conta (`createUserWithEmailAndPassword`), o sistema recupera o código de indicação, resolve o indicador e herda a raiz original (`rootReferrer`, `referredBy`, `referralLevel`, `referralChain`, `referralStatus: "registered"`), gerando também o código único do novo usuário.
5. **`server/routes/userOps.ts`:**
   - Na ativação do teste de 30 minutos (`/api/start-trial`), o status do indicado é atualizado para `referralStatus: "trial"` com timestamp `trialActivatedAt`.
6. **`src/pages/AdminPage.tsx`:**
   - Adicionada barra de "Redes de Amigos & Indicações" no topo da lista com chips filtráveis por rede (ex.: "Rede de Carlos: 31 amigos • X ativos • Y teste").
   - Adicionados badges no card de cada cliente indicando quem o indicou diretamente (`Indicado por: ...`) e a qual rede pertence (`Rede de: ... (Nível N)`).
   - Adicionada contagem de indicados diretos e na rede para clientes promotores.
   - Adicionado botão de ação `[Link]` para o Admin copiar o link de indicação de qualquer amigo/cliente em 1 clique.
7. **`src/pages/UserProfilePage.tsx`:**
   - Adicionado card Mobile-First "Indique um Amigo & Acompanhe sua Rede" com exibição do link personalizado, botão de cópia com feedback animado, botão para compartilhamento direto no WhatsApp e contador de amigos indicados.
8. **`tests/referral.test.cjs` (Novo):**
   - 4 testes unitários automatizados validando a captura insensível a maiúsculas/minúsculas, geração de código, herança da raiz por 31 níveis consecutivos sem perda do amigo original e classificação de ciclo de vida.

**Validação Realizada:**
- Testes unitários de indicação e core: 29/29 testes aprovados com 100% de sucesso.
- Compilação de produção (`npm run build`): Vite transformou 2.198 módulos e esbuild gerou o bundle do servidor sem erros em 9.98s.
- Responsividade Mobile-First validada (360px a 430px sem overflow lateral).

---

## 24/10/2026 - Implementação de Skeleton Loaders no Painel ADM (/admin)

**Contexto e Motivação:**
Ao alternar entre abas no Painel Administrativo (`/admin`), a interface realizava chamadas assíncronas ao Firestore ou à VPS. Durante o carregamento, estados padrão eram exibidos temporariamente (ex: "🔴 Offline / Inacessível" no monitor de Deploy, contadores "0" e aviso de "Nenhum cliente cadastrado" no painel de usuários, spinners solitários e textos "Carregando..."). Foi implementada uma experiência de Skeleton Loading suave e dinâmica idêntica à Home.

**Modificações Realizadas (5 arquivos):**
1. **`src/components/AdminDeployMonitor.tsx`:**
   - Adicionado skeleton animado com `animate-pulse` para o card de CI/CD do GitHub Actions enquanto `githubLoading && !githubData`.
   - Adicionados cards esqueleto para Proxy e WebServer quando `vpsLoading && !vpsData`, eliminando o falso alarme "🔴 Offline".
   - Adicionado esqueleto para as métricas de hardware da VPS (CPU, Memória, Disco, Conexões) durante a sondagem inicial.
2. **`src/components/AdminHealthMonitor.tsx`:**
   - Substituído o placeholder simples por um grid de 6 cards esqueleto elegantes durante a sondagem de status dos domínios (`loading && results.length === 0`).
3. **`src/pages/AdminPage.tsx`:**
   - Adicionado estado `loadingUsers` (iniciado em `true` e finalizado no bloco `finally` de `loadStats`).
   - Nos 4 cards de topo (Total, Ativas, Inativas, Assistindo Agora), inseridos placeholders pulsantes com as cores correspondentes (branco, verde, vermelho e laranja).
   - Na lista de clientes, renderizados 4 itens em esqueleto com avatares e barras pulsantes enquanto o Firestore busca os dados, evitando a mensagem prematura de catálogo vazio.
4. **`src/components/ServerBlocksAdmin.tsx`:**
   - Substituído o spinner isolado por 3 cartões skeleton completos (ícone, título, servidor e divisores) durante o carregamento inicial dos bloqueios.
5. **`src/components/AdminBugReports.tsx`:**
   - Substituído o texto central "Carregando relatórios..." por 2 cartões skeleton estruturados em grid com badges e botões de ação simulados.

**Validação Realizada:**
- Compilação de produção (`npm run build`): Vite transformou 2.195 módulos e gerou bundles de produção sem erros em 14s.
- Validação de suíte unitária: 25/25 testes passando (100% de sucesso).
- Responsividade Mobile-First: sem overflow horizontal e adaptável de 360px a 430px.

---

## 24/10/2026 - Embutimento de Símbolos Nativos (NDK debugSymbolLevel) e Versão 53 (1.4.21)

**Contexto e Motivação:**
Após a aprovação das correções de Edge-to-Edge e R8 no código 52, a Google Play Console sugeriu a inclusão dos símbolos de depuração nativos (`.so`) para depuração aprofundada de ANRs e crashes.

**Modificações Realizadas (1 arquivo):**
1. **`android/app/build.gradle`:**
   - Adicionada a instrução `ndk { debugSymbolLevel 'SYMBOL_TABLE' }` no bloco `buildTypes.release`, fazendo o Android Gradle Plugin gerar e embutir os símbolos de depuração nativos diretamente no arquivo `.aab`.
   - Incrementado `versionCode` para **`53`** e `versionName` para **`"1.4.21"`**.

**Validação:**
- Sincronização Capacitor (`npx cap copy android`) executada com sucesso.
- Sintaxe Gradle validada.

---

## 24/10/2026 - Correção das 3 Recomendações da Google Play Console (Android 15/16, Edge-to-Edge e R8)

**Contexto e Diagnóstico:**
A Google Play Console emitiu 3 alertas no painel de lançamento:
1. **Exibição de ponta a ponta (Edge-to-Edge):** Usuários de Android 14 e anteriores não recebiam a interface edge-to-edge obrigatória pela Play Store.
2. **APIs e Parâmetros Descontinuados:** O pacote `@capacitor/status-bar` continha chamadas a `Window.setStatusBarColor`, `Window.getStatusBarColor`, `FLAG_TRANSLUCENT_STATUS` e `setSystemUiVisibility` (depreciados no Android 15/16).
3. **Otimização do R8:** `minifyEnabled` usava `proguard-android.txt` (que continha `-dontoptimize`) e faltava `shrinkResources true`.

**Modificações Realizadas (7 arquivos):**
1. **`android/app/build.gradle`:**
   - Adicionada dependência `androidx.activity:activity:$androidxActivityVersion`.
   - Atualizado para `proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'` (ativando otimização do R8).
   - Ativado `shrinkResources true` em `buildTypes.release`.
   - Versionamento Android incrementado para **`versionCode 52`** e **`versionName "1.4.20"`**.
2. **`android/app/src/main/java/com/playinfinity/app/MainActivity.java`:**
   - Invocado `EdgeToEdge.enable(this)` no `onCreate` para compatibilidade retroativa com todos os dispositivos.
   - Configurado `ViewCompat.setOnApplyWindowInsetsListener` para aplicar safe-area insets no container de conteúdo e zerar os insets em tela cheia/PiP.
   - Registrado o novo `StatusBarPlugin.class`.
3. **`android/app/src/main/java/com/playinfinity/app/StatusBarPlugin.java` (Novo):**
   - Implementado plugin local moderno usando exclusivamente `WindowCompat.getInsetsController()` (`WindowInsetsControllerCompat`) sem nenhuma API depreciada do Android 15.
4. **`android/app/proguard-rules.pro`:**
   - Adicionadas regras `-keep` abrangentes para Capacitor, WebView, BridgeActivity, Firebase e plugins locais.
5. **`package.json` & `package-lock.json`:**
   - Removida dependência nativa desnecessária `@capacitor/status-bar`.
6. **`src/utils/statusBar.ts` (Novo), `src/App.tsx` e `src/components/VideoPlayerModal.tsx`:**
   - Migrado o import de StatusBar para o wrapper local via `registerPlugin('StatusBar')`.
7. **`capacitor.config.ts`:**
   - Removidas configurações legadas `splashFullScreen` e `splashImmersive` em favor da API nativa do Android 12+.

**Validação Realizada:**
- `npx cap sync android`: Sincronização executada com sucesso, removendo `:capacitor-status-bar` dos plugins nativos.
- `npm run build`: Vite e esbuild compilaram com 0 erros.
- Testes automatizados do frontend e reprodutor: 192 testes aprovados.

---

## 24/10/2026 - Correção do Health Monitor: Vizer (vizer.press) e Resolução DNS IPv4 First no Node 24

**Contexto e Diagnóstico:**
No Painel Administrativo (`/admin`), quatro serviços constavam como `OFFLINE`:
1. **Catálogo Vizer:** Falhava com `HTTP 301 - Vizer redirecionou para um domínio não configurado` porque o Vizer migrou de `vizer.uno` para `https://www.vizer.press`.
2. **VIP Player (`myembed.biz`) e Watchplayer (`v1.watchplay.shop`):** Apresentavam `HTTP 0 - The operation was aborted due to timeout`. A VPS Oracle não possui rota de saída IPv6, e o Node 24 por padrão tentava os registros AAAA (IPv6) da Cloudflare primeiro, gerando timeout de 8 segundos em chamadas HTTP do backend.
3. **Redirecionamentos em Probes:** Alvos estáticos que redirecionavam (ex: `v1.watchplay.shop` para `v2.watchplay.shop`) tentavam seguir toda a cadeia de redirects.

**Modificações Realizadas (4 arquivos):**
1. **`server/services/vizerDomains.ts`:**
   - Adicionado `https://www.vizer.press` no topo da lista `VIZER_DOMAINS` como primário, com fallback transparente para os domínios legados.
2. **`server/utils/loadEnvironment.ts`:**
   - Inserida configuração global `dns.setDefaultResultOrder("ipv4first")`, garantindo que todas as requisições `fetch` e HTTP de saída do Node 24 na VPS Oracle priorizem IPv4 e resolvam em < 100ms.
3. **`server/routes/adminOps.ts`:**
   - Adicionada opção `redirect: "manual"` para os reprodutores homologados (`VIP Player`, `Watchplayer`, `MixDrop`), permitindo validar a resposta de borda imediatamente sem seguir cadeias de redirecionamento.
4. **`tests/vizer.test.cjs`:**
   - Atualizados testes automatizados para validar a precedência de `https://www.vizer.press` e o comportamento de fallback.

**Validação Realizada:**
- Testes automatizados executados: 25/25 testes passando (100% de sucesso).
- Compilação de produção (`npm run build`): Vite e esbuild concluídos com sucesso (código de saída 0).

---

## 24/10/2026 - Priorização do BYSE como Titular #1 na Abertura com Janela de 12s para PoW

**Contexto e Diagnóstico:**
Na lógica inicial de seleção de servidores (`src/services/playbackStartup.ts`), quando o BYSE ainda não estava em cache quente (`warm: false`), ele recebia uma penalidade `+10` em `startupOrder` e era jogado para o último lugar, abrindo StreamTape ou MixDrop no 1º clique e impedindo que o cache do BYSE aquecesse.

**Modificações Realizadas (2 arquivos):**
1. **`src/services/playbackStartup.ts`:**
   - Removida a penalidade do BYSE frio em `startupOrder`, mantendo o **BYSE sempre em 1º lugar** quando listado na prioridade máxima de áudio (Dublado PT-BR).
   - Em `preparePlaybackStartup`, quando o BYSE frio é o candidato titular (`coldByseLead`), o player seleciona `'srv_byse'` imediatamente (sem esperar probes de outros servidores antes de montar o iframe) e dispara a verificação do 2º servidor em background para fallback instantâneo se necessário.
   - Em `startupMediaLimit`, ajustada a janela de resolução do BYSE frio de 8s para **12s (`12000ms`)** quando há servidor alternativo (e `45000ms` quando único).
2. **`tests/playback-startup.test.cjs`:**
   - Atualizados os testes automatizados validando a titularidade do BYSE frio/quente e o limite de 12s para resolução do PoW.

---

## 24/10/2026 - Correção de Lentidão no Deploy Zero-Downtime (Destravamento de Workers e Assets Legados)

**Contexto e Diagnóstico:**
Ao investigar por que novas atualizações estavam levando até 17 minutos para entrar no ar na VPS Oracle, identificamos dois gargalos críticos no pipeline de deploy Zero-Downtime criado pelo Codex:
1. **Bloqueio Sequencial de até 2 Horas no `reload-release.cjs`:** O script configurava `APP_DRAIN_TIMEOUT_MS = 2 horas` e usava `await` no callback final do `reloadProcessId` da instância `0` antes de recarregar a instância `1`. Como o PM2 só dispara o callback quando o processo antigo morre completamente, qualquer stream pausado ou em `rwnd_limited` no Worker 0 antigo impedia o Worker 1 de ser atualizado, deixando 50% do site na versão velha por longos períodos.
2. **Recópia Individual de 1.221 Assets Legados (`deploy-release.sh`):** Em todo deploy, um loop em Bash copiava os 1.221 arquivos antigos de `/home/ubuntu/play-infinity/dist/assets` um por um (`dirname` + `mkdir` + `cp` + `mv`), gastando quase 2 minutos extras antes mesmo de iniciar o reload.

**Modificações Realizadas (4 arquivos):**
1. **`scripts/reload-release.cjs`:**
   - Implementado monitoramento ativo (`waitForNewWorkerOnline`) em conjunto com `Promise.race` e retry para `Reload already in progress`. Assim que o novo worker da instância atinge `status === 'online'` (após emitir `ready`) com o novo `pid` e diretório de release, o script avança imediatamente para atualizar a próxima instância (~2s por worker), enquanto os processos antigos terminam de drenar em background sem derrubar conexões.
2. **`scripts/deploy-release.sh`:**
   - Adicionada verificação `if [[ $assets == "$app_root/dist/assets" && -f $target ]]; then continue; fi` para pular arquivos legados já semeados em `shared-assets`, reduzindo essa etapa de 1m54s para < 0.1s.
3. **`server/utils/serverLifecycle.ts` & `ecosystem.config.cjs`:**
   - Ajustado `DEFAULT_DRAIN_TIMEOUT_MS` padrão de 2 horas para `20000ms` (20 segundos), preservando 100% dos segmentos HLS, chamadas de API e streams ativos sem reter slots `_old_` do PM2 por horas em conexões ociosas.

---

## 24/10/2026 - Otimização de Performance do Servidor BYSE (PoW Concorrente, Cache Compartilhado e Pool Estendido)

**Contexto e Diagnóstico:**
Durante a auditoria de desempenho do novo servidor homologado BYSE em produção (`https://play-infinity.stream`), identificou-se que a resolução inicial de episódios sofria lentidão de 25s a 30s (com risco de 502 Bad Gateway) em cold starts.
1. **Fila Serial de PoW (`server/services/byse/pow.ts`):** O worker de Proof-of-Work utilizava `let active = false` permitindo apenas 1 worker por vez. Quando fontes Encontrei e Vizer eram sondadas em paralelo, uma aguardava a outra terminar, dobrando o tempo de resolução.
2. **Cache Local Isolado no PM2 Cluster (`server/services/byse/core.ts`):** O cache de resoluções residia apenas na memória de cada processo. No PM2 Cluster (2 instâncias), um worker não aproveitava a resolução do outro.
3. **TTL Curto do Pool de Provedores (`server/services/byse/sources.ts` e `server/routes/byseRoutes.ts`):** O pool expirava em 30 segundos, forçando re-sondagens desnecessárias da CDN.

**Modificações Realizadas (5 arquivos):**
1. **`server/services/byse/pow.ts`:**
   - Paralelização de resolução de PoW (`MAX_ACTIVE_WORKERS = 2` e `MAX_QUEUE_LENGTH = 8`), permitindo resolver desafios simultâneos com isolamento de threads e limites de memória de 32MB.
2. **`server/services/byse/core.ts`:**
   - Implementado cache compartilhado atômico em disco (`data/byse-resolve-cache.json`) com sincronização entre processos do cluster PM2, gravação atômica (`.tmp` -> `renameSync`) e guard `isTestEnv` para manter o isolamento de testes unitários.
3. **`server/services/byse/sources.ts`:**
   - Aumentado o TTL padrão do pool de fontes BYSE de 30s para 10 minutos (600.000ms), reduzindo o overhead de sondagem de rede.
4. **`server/routes/byseRoutes.ts`:**
   - Estendido o TTL das entradas do pool para 10 minutos na inicialização do serviço.
5. **`tests/byse-shared-cache.test.cjs`:**
   - Criado teste automatizado validando a sincronização entre dois workers simulados compartilhando o mesmo arquivo de cache sem colisão.

**Validação Realizada:**
- Testes automatizados executados: 53/53 testes passando (100% de sucesso).
- Compilação de produção (`npm run build`): Vite e esbuild compilados com sucesso em 9.52s.

---

## 24/10/2026 - Sincronização Remota do GitHub e Correção do React Error #31 em DetailsPage

**Contexto e Motivação:**
1. **Sincronização com o GitHub:** O repositório local foi atualizado com 11 novos commits do branch remoto `origin/main` (incluindo integrações BYSE, Node 24, recovery do Mixdrop/Streamtape e melhorias no deploy).
2. **Remoção de Botões Duplicados de Zero-Downtime:** Conforme solicitado, removemos os botões excedentes de "Zero-Downtime" do monitor de infraestrutura e do rodapé do `AdminDeployMonitor.tsx`, preservando apenas o botão no card de CI/CD.
3. **Resolução Definitiva do React Render Error #31:** Em produção (`https://play-infinity.stream/`), a página de detalhes quebrava com `Minified React error #31: Objects are not valid as a React child (found: object with keys {id, name})` devido à renderização direta de objetos `{ id, name }` dentro de `<span>` ao processar gêneros vindos do TMDB.

**Modificações Realizadas:**
1. **`src/utils/mediaUtils.ts`:**
   - Adicionadas funções auxiliares `getGenreName(g: any): string` e `normalizeGenres(genres: any): string[]` que sanitizam arrays e garantem apenas strings válidas.
2. **`src/pages/DetailsPage.tsx`:**
   - Normalização aplicada em `details.genres`, `currentGenres`, `catGenres` e chave única `${g}-${idx}` nos `<span>` dos gêneros.
3. **`src/components/AdminDeployMonitor.tsx`:**
   - Botões duplicados de Zero-Downtime removidos.
4. **Build e Testes:**
   - `npm run build` executado com sucesso (Vite + esbuild).
   - Grafo de conhecimento (`graphify update .`) devidamente sincronizado.

---

﻿## 20/10/2026 - Correção de Cold Start ao Clicar em Continuar Assistindo no Android

**Contexto e Motivação:**
Ao abrir o app limpo no Android pela primeira vez (cold start) e clicar em um card de série no 'Continuar Assistindo', o player apresentava erro ('Conteúdo Indisponível / Episódio não encontrado - Tentar novamente') e só começava a reproduzir ao fechar e abrir de novo ou ao clicar no botão de recarregar.

**Causa Raiz Identificada:**
1. **URL Expirada no Histórico:** O item do histórico salvava o \playerUrl\ com o token temporário da CDN de dias atrás. Ao reabrir, o modal tentava reutilizar o \defaultUrl\ antes de gerar um novo link.
2. **Race Condition de Cold Start:** Nos primeiros 300ms de abertura do app, a busca assíncrona dos IDs do catálogo ainda não havia retornado. Na versão 1.1.8, o MixDrop caía em uma URL fabricada (\mxdrop.top/e/id\) que resultava em 404/502. Na segunda tentativa (ou ao clicar em Tentar Novamente), o cache já estava aquecido e funcionava.

**Modificações Realizadas:**
1. **\src/components/VideoPlayerModal.tsx\:** Para séries, o modal agora ignora o \defaultUrl\ antigo salvo no histórico e sempre gera uma URL fresca para o episódio (\s\ e \e\), garantindo resolução instantânea e tokens válidos logo na primeira abertura.

---
## 20/10/2026 - Atualização dos Botões do Painel ADM para 'Recarregar Serviços (Zero-Downtime)'

**Contexto e Motivação:**
Com a transição da infraestrutura de deploy e PM2 para Cluster Mode e Graceful Shutdown, os botões manuais do Painel Administrativo ainda executavam \pm2 restart\. A interface e as rotas de backend foram atualizadas para refletir o novo comportamento de recarregamento suave.

**Modificações Realizadas:**
1. **\server/routes/adminOps.ts\:** Endpoints \
estart-all\ e \
estart-app\ agora executam \sudo pm2 reload ecosystem.config.cjs --update-env\, mantendo o processo com Zero-Downtime mesmo quando acionado manualmente pelo admin.
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

## 03/10/2026 - OtimizaÃ¯Â¿Â½Ã¯Â¿Â½o de Busca no CatÃ¯Â¿Â½logo

**Resumo:**
- **OtimizaÃ¯Â¿Â½Ã¯Â¿Â½o do encontrei-catalog.json:** A rota check-season em ideoScrapers.ts foi refatorada para utilizar a funÃ¯Â¿Â½Ã¯Â¿Â½o getEncontreiSeasonEpisodes do encontreiLookup.ts, acessando o Ã¯Â¿Â½ndice em memÃ¯Â¿Â½ria existente em vez de rodar JSON.parse num arquivo de 14 MB a cada requisiÃ¯Â¿Â½Ã¯Â¿Â½o.



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
## Fix S3E140 (Absolute Episode Indexing) for WatchPlayer/VIP Player

- Identified that TMDB returns absolute episode_numbers (e.g., 140) for Season 3 of Hunter x Hunter.

- Identified that WatchPlayer and VIP Player expect relative, 1-based indices for episodes (S3E4).

- Created backend proxy routes \/api/watchplay-proxy-iframe\ and \/api/vip-proxy-iframe\ in \server/routes/videoScrapers.ts\ to intercept absolute episode requests (e > 50) and convert them to relative 1-based indices via TMDB lookup before redirecting.

- Patched \VideoPlayerModal.tsx\ to route \srv_watchplay\ and \srv_vip\ through the new proxy endpoints.

- Patched \idsrcRoutes.ts\ to intercept absolute episode requests (e > 50) and convert them to relative 1-based indices via TMDB lookup before requesting the stream from vidsrc.


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
- **O Dia do Chacal (MixDrop):** Auto-recovery (Fase 3) em aÃ§Ã£o perfeitamente. O erro 502 Bad Gateway (visto nos logs do usuÃ¡rio) foi o gatilho capturado pelo React. O frontend executou o 
efresh=1 chamando encontreiLookup.ts, ignorou o arquivo JSON obsoleto e usou o scraper ao vivo para capturar a string HD funcional do site encontrei.me correspondente Ã  dublagem em portuguÃªs. 4dnjrxg3aq3wvwk carregou normalmente.
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
- **SoluÃ§Ã£o:** Implementada sincronia com o Firestore (
eadNotifications). markNotificationAsRead e markAllNotificationsAsRead agora fazem debounce de 5s e enviam o array atualizado pro banco. O App.tsx baixa essas flags no login (etchReadNotificationsFromCloud) e o listener onSnapshot captura atualizaÃ§Ãµes em tempo real vindas de outros dispositivos, mesclando e apagando o badge instantaneamente em todas as sessÃµes ativas.



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







## 20/10/2026 - Correcao de Cold Start no Android (403 no StreamTape e Watchdog MixDrop) + UI Zero-Downtime

**Contexto:** Usuario reportou que no app Android, ao abrir pela primeira vez (cold start) e tentar continuar assistindo episodios de series (ex: Cyberpunk T2E6), o player apresentava erro 403 Forbidden no console e falhava em cascata exibindo 'Nao existe esse episodio / Conteudo indisponivel', mas ao recarregar o video comecava a tocar.

**Causas Raizes Identificadas:**
1. A rota interna `/api/streamtape-proxy-iframe` nao constava na whitelist de URLs permitidas de `handleExtract` em `VideoPlayerModal.tsx`. Ao abrir o modal, a rota relativa era enviada indevidamente para `/api/extract-player`, que retornava 403 Forbidden (`validateSafeUrl` bloqueia URLs relativas) em 0ms.
2. O fallback para MixDrop no cold start precisa descompactar o JavaScript e inicializar o ArtPlayer no mobile (~16s), mas o watchdog de timeout do player estava travado em 15s (`timeoutDuration`), abortando a conexao prematuramente antes do primeiro frame. Ao recarregar, o cache em memoria da VPS ja continha o link e tocava em 1s.
3. O clique nos cards de 'Continuar Assistindo' em `HomePage.tsx` nao repassava `item.serverKey` para o handler `onPlay`.

**Alteracoes Realizadas:**
- **`src/components/VideoPlayerModal.tsx`:** Adicionadas as rotas `/api/streamtape-proxy-iframe`, `/api/vidsrc-player`, `/api/vidsrc-stream` e `streamtape` na whitelist do `handleExtract`. O timeout do watchdog para servidores MixDrop (`md-stream`) foi aumentado de 15s para 25s em cold starts.
- **`src/pages/HomePage.tsx`:** Repasse de `item.serverKey` e `isAnime` no callback `onPlay` dos cards de Continue Assistindo.
- **`src/components/AdminDeployMonitor.tsx`:** Botoes renomeados para 'Zero-Downtime' conforme solicitado.
- **`src/pages/AdminPage.tsx`:** Badge `EncontreiCookieBadge` removido do cabecalho ao lado do botao Sair.
- **`server/routes/encontreiLookup.ts`:** Correcao dos tipos de retorno adicionando `streamtape` e `doodstream` em `pickMixdrop`, `resolveEncontreiEpisode` e `resolveEncontreiMovie`.

**Validacao:**
- Teste deterministico validou resposta 200 e tag `<video>` com `WATCHPLAY_STATUS` em `/api/streamtape-proxy-iframe?id=105248&s=2&e=6`.
- Compilacao do backend via esbuild (`dist/server.cjs`) executada com sucesso.
- Sincronizacao dos assets do backend Android (`android/app/src/main/assets/public/server.cjs`).


## 22/10/2026 - Correções de cobrança e processamento de webhooks Asaas

- Firestore: usuários não podem alterar tarifas; cadastros públicos só aceitam os valores padrão de R$ 13,00. Descontos continuam sob controle administrativo.
- Backend: valores arbitrários e datas de cadastro do cliente não concedem descontos. A tarifa legada explícita de R$ 9,90 foi preservada. O Paywall exibe a mesma regra e deixou de gravar tarifas no cadastro.
- Plus: recorrência integral de R$ 17,00; quando há assinatura ativa vinculada no Asaas, o upgrade atualiza essa assinatura em vez de criar uma recorrência paralela. A propriedade da assinatura é verificada antes da alteração.
- Webhooks: consulta obrigatória ao estado atual da cobrança no Asaas, inclusive para eventos assinados. Falhas de API/banco retornam erro para permitir nova entrega. Eventos negativos desatualizados não revogam acesso válido.
- Pagamentos aplicados ficam registrados em usuarios/{uid}/asaasPayments/{paymentId}, com transação Firestore para evitar duplicações concorrentes e entre reinícios. CONFIRMED e RECEIVED concedem um único período.
- Validade calculada a partir da data oficial do pagamento, limitada ao último dia do mês seguinte; reenvios não estendem o prazo. Pagamentos antigos não sobrescrevem uma assinatura mais recente. Estorno do pagamento atual revoga o acesso.

Validação: 18 testes HTTP de regressão em `node --test tests/payments.test.cjs` passaram, com autenticação, Asaas e Firestore simulados. `npm run lint`, `git diff --check` e `npm run build` passaram. Build executado em cópia descartável fora do checkout para preservar índices de catálogo versionados. Avisos preexistentes de chunks/import.meta continuam não fatais.

Limitação: regras revisadas, mas sem execução no emulador Firestore; download oficial bloqueado pelo proxy (CONNECT 403 em storage.googleapis.com). Não foram efetuadas cobranças reais, push, publicação das regras nem deploy. Para produção, publicar as regras do Firestore e atualizar frontend/backend na VPS Oracle; a API Asaas precisa estar configurada para validar os webhooks. Assinaturas e descontos existentes não foram migrados.

Envio para main autorizado pelo usuário nesta conversa. Como o push dispara o workflow Android, versionCode incrementado de 39 para 40 e versionName de 1.4.7 para 1.4.8 antes do envio. A conclusão do workflow e a publicação das regras Firestore devem ser verificadas separadamente.


## 22/10/2026 - Deploy gradual com preservação de conexões e versões

- Nova versão preparada em releases/<id>, com dependências próprias e prova HTTP do bundle em porta loopback antes de trocar current atomicamente. Dados, uploads e credenciais persistentes são preservados.
- Duas instâncias PM2 mantidas em cluster; ready emitido apenas após listening. Drenagem configurável de duas horas por padrão; kill_timeout do PM2 30 segundos acima do limite. Processos antigos mantêm seu diretório de versão.
- Assets com hashes de versões anteriores preservados e servidos por processos novos, inclusive na migração da pasta dist antiga. Não há remoção automática de releases/assets.
- Deploys e reloads protegidos por trava; workflow serializado, Node 22 e limite de 300 minutos. Scripts verificam versão no HTTP e duas instâncias online depois do reload; cluster degradado/fork aborta antes da troca.
- Removidos fallbacks automáticos de restart all/restart do app. Proxy de TV não faz parte do deploy. Build dentro da pasta ativa desabilitado; botão do painel passa a disparar GitHub Actions. Reinício explícito do proxy continua manutenção que interrompe conexões.
- Configuração local carregada antes dos módulos que exigem segredos. Prova reutiliza chave de assinatura existente no PM2 em memória quando necessário, sem logar valores.
- Documentação operacional em docs/deploy-vps.md, incluindo migração, limites e recuperação após falha.

Validação: cinco testes com PM2 real (6.0.14) e daemon isolado passaram: primeira instalação; stream de 12 segundos atravessando rolling reload com requisições HTTP contínuas; candidato inválido preserva versão ativa; bind inválido não emite ready; cluster degradado aborta sem restart. Os 18 testes de pagamentos passaram. Bundle de produção validado por HTTP (health/versão, HTML, asset antigo/cache, catálogo) e encerramento gradual, com configuração de teste via arquivo local e via prova/PM2. npm run lint, build completo em cópia descartável, sintaxe Bash, YAML e git diff --check passaram.

Limites: nenhuma alteração foi enviada ao GitHub ou aplicada à VPS nesta etapa. Na primeira ativação, os processos antigos ainda executam seus temporizadores antigos até serem substituídos. A janela padrão não garante continuidade para conexões superiores a duas horas, falhas externas, OOM ou reinício explícito do proxy. O Nginx real e reprodução com provedores reais ainda precisam ser verificados na VPS; regras locais servindo diretamente a antiga dist podem precisar de atualização.

O workflow de deploy também executa a checagem de tipos, os 18 testes de pagamentos e os cinco testes com PM2 6.0.14 antes de compilar/enviar o pacote.


## 22/10/2026 - Diagnóstico de reprodução MixDrop (sem envio)

Usuário relata buffer seco durante reprodução tanto no aplicativo mobile quanto no PC/F12. Revisão do código e reprodução local com CDN/vídeo simulados, sem modificar players ou rotas nesta etapa.

- Range/Content-Range: cenário local retornou 206 e bytes esperados corretamente. O fluxo MixDrop atual passa por /api/md-proxy na VPS, não é entrega direta da CDN ao navegador.
- Falha reproduzida no watchdog de buffer seco: um único waiting emite duração zero; 12 segundos posteriores sem buffer não atualizam stall, pois o timer periódico só cobre frame freeze quando há pelo menos 0,8 segundo de buffer. A condição de recuperação/fallback após 7 segundos na skin fica sem atualização.
- Renovação de token frágil: /api/md-proxy recebe a URL da CDN, mas não recebe o fileId original do embed. Ao simular nome do MP4 diferente do ID original, a renovação buscou o embed errado e terminou em 403.
- Sem recuperação de transferência interrompida por posição de bytes; o timeout de 15 segundos é limpo após os cabeçalhos. Reset de uma resposta 200 sem Content-Length foi reproduzido como resposta truncada encerrada normalmente.
- SEEK_RELATIVE enviado com seconds pela skin é ignorado no iframe MixDrop, que só lê time/targetTime; confirmado no script HTML executado em VM com vídeo simulado.
- Catálogo estático: 6.694 filmes e 27.705 episódios têm ID MixDrop; quase todos também têm StreamTape/Doodstream. Presença de ID não prova disponibilidade nem desempenho atual.

Diagnóstico reproduzível local em /workspace/.onboarding/review-mixdrop.cjs. Requisições diretas à VPS e mxdrop.top foram bloqueadas pelo proxy do ambiente (CONNECT 403). Não houve medição de CDN real, teste de reprodução real no Android/PC, alteração do MixDrop nem push/deploy. As alterações locais anteriores de deploy continuam preservadas.


## 22/10/2026 - Validação remota de VisionQuest após liberação de rede

Rede liberada para a VPS e MixDrop; testes somente de leitura, sem deploy. Usuário forneceu F12 indicando episódio 2, mas o log e o arquivo gjjgvzx9fj0qx8 correspondem a T1E3. Lookup na VPS confirmou T1E2=ellxv310h7j1xq e T1E3=gjjgvzx9fj0qx8 para VisionQuest (TMDB 213375). Isso confirma a divergência de referência, não comprova sozinho troca indevida de episódio pelo aplicativo.

- Log: travamentos de 12,65s e 7,77s em torno de 619-621s com buffer de 0,03-0,04s. A telemetria de início de stall informa sempre duração zero, consistente com a falha local de atualização periódica já reproduzida.
- T1E3: extração HTTP 200; três amostras de 1 MiB em offsets diferentes entregues com HTTP 206 (3,83 / 4,97 / 8,93 Mbps). MP4 de 491.304.593 bytes, 3119,104s, H.264 720p/24fps e AAC; bitrate médio total aproximadamente 1,26 Mbps.
- Trecho próximo de 612s: 2 MiB recebidos com HTTP 206 em 2,83s (~5,93 Mbps). Bitrate do vídeo em 610-620s calculado pela tabela de amostras MP4: ~0,93 Mbps, além do áudio de ~0,13 Mbps. Não houve falha de Range nesses testes curtos.
- O nome MP4 e o ID do embed são iguais neste arquivo. A falha condicional de renovação quando os IDs diferem não foi demonstrada nesse episódio. O log não mostra 403 do vídeo MixDrop nem prova token expirado.
- TMDB de VisionQuest e metadados T1E2/T1E3 responderam 200; o 404 de /tv/1101412 no log usa outro ID. Avisos de notificação, lazy images, fullscreen e 403 do proxy de TV são eventos separados do stream MixDrop.

Limites: medições pontuais pelo caminho VPS -> ambiente, não reprodução contínua no dispositivo do usuário nem medição isolada VPS -> CDN. Os resultados atuais não descartam oscilação intermitente ou problema no último trecho de rede. Não houve alteração no player/rotas MixDrop nem envio ao GitHub.


## 22/10/2026 - Recuperação local de buffer MixDrop (sem envio ao GitHub)

- `/api/md-stream` preserva o fileId original em `/api/md-proxy`; renovações concorrentes compartilham consulta e tokens novos já conhecidos podem ser reutilizados.
- Novo serviço de proxy com timeout de cabeçalhos (10s) e inatividade do corpo (6s), até duas novas tentativas e retomada a partir do primeiro byte faltante. Retomada exige 206, intervalo/tamanho esperados e validador forte compatível em If-Range. Sem garantia de identidade ou com resposta 200 na retomada, encerra com erro em vez de concatenar vídeo incorreto.
- Backpressure de cliente é separado de inatividade da CDN; desconexão/seek cancela o upstream. Erros não são encerrados como vídeos truncados bem-sucedidos. URL e redirects restritos a HTTPS na rede mxcontent.net; X-Accel-Buffering=no.
- Novo controlador no iframe recompõe reserva de até 5s e verifica readyState, pois há stalls com tempo buffered positivo mas sem mídia decodificável. Adapta a reserva a final de vídeo e browsers mobile ociosos. Uma recarga da fonte é permitida aos 12s, restaurando posição; espera limitada antes do fallback existente. Pausa e seek explícitos são respeitados.
- Telemetria atualiza a duração do stall a cada segundo; a skin não interrompe a recuperação própria do MixDrop com o fallback genérico antecipado e mostra carregamento durante rebuffer. SEEK_RELATIVE passa a interpretar seconds.
- Testes de reprodução adicionados ao workflow antes do envio para VPS. Documentação: docs/mixdrop-recovery.md.

Validação: 28 testes MixDrop + 18 testes de pagamentos passaram (46 no total). Cobrem Range/suffix, reset HTTP real, inatividade, renovação com ID original, single-flight, identidade do arquivo, HTTP 200 incorreto na retomada, cancelamento, backpressure, reserva, pause/seek e HTML real executado em VM. npx tsc --noEmit e build completo em cópia descartável passaram, preservando índices de catálogo versionados.

Ensaio adicional em Chromium 154 com ArtPlayer 5.1.7 e MP4 sintético: desktop com retomada automática; viewport mobile com pausa respeitada; recarga da fonte mantendo posição. CDN local suspendeu dados até 14/20s, com retomada por byte comprovada. Posição de pausa ~5,64s, reprodução prosseguiu ~6,65s nos três cenários; sem erros fatais/JavaScript. O ensaio revelou e corrigiu a faixa com buffered~0,73s/readyState=2 que não acionava a recuperação. Runner local em /workspace/.onboarding/mixdrop-browser/run.cjs.

Limites: mudanças ainda locais; nenhuma publicação, push ou alteração na VPS. Ensaios de navegador usaram vídeo/servidor sintéticos; não comprovam reprodução contínua com o código novo na CDN real ou no aplicativo Android físico. Se a entrega sustentada for inferior ao bitrate, ainda será necessário aguardar ou usar o fallback homologado existente.

## 23/10/2026 - StreamTape: tentativa inicial antes do fallback (somente local)

Relato: primeiro clique retorna erro genérico de vídeo e troca para MixDrop; segundo clique no StreamTape reproduz. Inspeção confirmou que a recuperação anterior só acontecia após posição >2s e consultava o resolvedor sem invalidar cache. O log sozinho não identifica a falha inicial específica da CDN.

- Novo controlador self-contained no iframe tenta uma renovação real (`refresh=1`, cache HTTP desativado) também na posição zero. Preserva posição/seek e pausa explícita; limita renovação+recarga a 12s e comunica código de erro se persistir. Erro de decodificação não tenta renovar token.
- Resolvedor permite ignorar/invalida cache anterior; timeout cobre leitura do HTML e HEAD. Resposta de resolução e proxy de mídia passam a no-store.
- Watchdog inicial do modal concede 30s ao StreamTape para comportar resolução inicial e tentativa de recuperação. Fallback para provedores existentes continua após falha persistente.
- Sete testes adicionados para primeira falha, renovação efetiva de cache, posição/seek, pausa, segunda falha, deadline e decodificação. Workflow passa a incluí-los.

Validação concluída: 53 testes (pagamentos, MixDrop e StreamTape) passaram; npx tsc --noEmit e build completo em cópia descartável passaram. Chromium 154 com MP4 sintético e rota real: CDN simulada retornou 502 na primeira requisição; desktop e viewport mobile renovaram o token e reproduziram além de 1s, com duas requisições de mídia, zero WATCHPLAY_ERROR e zero erros JavaScript. Runner local: /workspace/.onboarding/streamtape-browser.cjs. Não houve validação contínua na CDN real ou Android físico, nem push/deploy; alterações anteriores preservadas.

## 23/10/2026 - Health check por filme/episódio (somente local)

Implementado a pedido do usuário para reduzir espera nos servidores sem conteúdo ou sem resposta:

- Novo `/api/playback-health` consulta somente servidores existentes permitidos e selecionáveis (StreamTape, MixDrop, WatchPlayer, VIP e Nixplay), respeitando a blacklist. Identidade inclui tipo, ID, temporada e episódio; não aceita URLs arbitrárias de entrada nem usa Host para construir a origem interna.
- Verifica amostra MP4/HLS real pelos resolvedores/proxies existentes. HTTP 200 com página HTML não comprova disponibilidade. Timeout, catálogo sem confirmação, 403/429/502 e formatos dependentes do navegador ficam desconhecidos. 404/410 explícito ou indisponibilidade explícita do player podem indicar indisponibilidade.
- Deadline de 4,5s, máximo de seis sondagens simultâneas por worker, cache limitado a 2.000 entradas, positivo 60s e demais 15s. Single-flight compartilha sondagens entre espectadores. Amostra Range de 1 KiB cancelada após leitura; limites separados de corpo para JSON/HTML. Resultados não expõem tokens/URLs assinadas.
- Modal consulta em paralelo à abertura e novamente a cada 45s quando visível, também ao retornar à tela. Antes de reprodução efetiva, pode migrar para fonte verificada sem aguardar watchdog inteiro. Após avanço real do relógio do vídeo, monitoramento não interrompe reprodução/pausa. Fallback por erro prioriza verificados, mantém desconhecidos elegíveis e evita indisponíveis recentes.
- Identidade de resposta e cleanup impedem aplicação de resultado de episódio anterior. Seleção assíncrona antiga é invalidada após nova seleção/fechamento. Troca de episódio no StreamTape deixa de aguardar o lookup do MixDrop. Estados vencidos são tratados como desconhecidos, evitando bloqueio permanente após oscilação.
- Seletor sinaliza indisponibilidade sem bloquear tentativa manual. Filmes no StreamTape passam ID TMDB numérico antes do lookup; removido fallback MixDrop com fileId fixo de outro conteúdo. Nenhum provedor bloqueado foi ativado.
- Documentação em docs/playback-health.md; workflow inclui os novos testes.

Validação concluída: 13 testes novos de cache/single-flight, deadline, admissão, conteúdo MP4/HLS, cancelamento, falsos HTTP 200, 403/429/404/410, política de início versus reprodução estabelecida, expiração, identidade de episódio, blacklist e adapters HTTP dos cinco servidores. Total de 66 testes de pagamentos/MixDrop/StreamTape/health passou. npx tsc --noEmit e build completo em cópia descartável passaram (/workspace/.onboarding/playback-health-validation.mw4gn4y8), sem alterar índices versionados do catálogo. git diff --check passou.

Limites: testes de health usam mídia e upstreams simulados; não houve teste do novo fluxo contra CDN real ou aparelho Android físico. Sondagem comprova uma amostra naquele instante, não throughput sustentado nem todos os segmentos HLS. Provedores que exigem execução do navegador podem permanecer sem confirmação. Sem push/deploy ou alterações na VPS; trabalho anterior preservado.

## 23/10/2026 - StreamTape no bloqueio administrativo por conteúdo (somente local)

- Adicionado StreamTape HD (`srv_streamtape`) às opções do formulário em ServerBlocksAdmin e aos rótulos dos bloqueios existentes.
- API de criação de bloqueios passa a aceitar a mesma chave; antes, somente alterar o seletor resultaria em rejeição do POST.
- O player já filtra `blockedServerKeys` pela chave correspondente; nenhuma fonte nova foi adicionada nem regra de blacklist alterada.

Validação concluída: npx tsc --noEmit e git diff --check passaram. Alterações locais, sem push/deploy ou gravação de bloqueios reais.

## 23/10/2026 - Atualização dos lançamentos da home (somente local)

Relato: Lançamentos Filmes e Lançamentos Séries ficaram sem atualização. Diagnóstico remoto somente de leitura: discover/movie e discover/tv na VPS retornaram HTTP 200 em 1,14s/1,44s, com 20 resultados cada e datas de outubro de 2026. Nenhum dos 20 IDs de filmes nem dos 20 IDs de séries estava no snapshot importado pelo frontend (9.107 IDs; arquivo generated_at=2026-10-20T18:18:16.135Z). Isso fazia as duas listas dinâmicas ficarem vazias após o filtro e manterem os cards estáticos antigos. A sincronização anterior rodava apenas na montagem da home e não tentava recuperar automaticamente os timeouts relatados no F12.

- Novo serviço homeReleaseFeed consulta três páginas recentes de cada tipo, deduplica e mantém ordem de lançamento. IDs conhecidos continuam imediatos; títulos novos fora do snapshot podem entrar após confirmação de MixDrop/StreamTape no lookup atual, com nome do título e tipo/episódio corretos. Exclusões manuais continuam aplicadas. Metadados TMDB sozinhos não tornam título novo disponível.
- Limite de oito candidatos novos por tipo/ciclo, dois lookups simultâneos por tipo, deadline de 4,5s e cache/single-flight por tipo/ID. Ciclos seguintes priorizam candidatos ainda não examinados para não ficar consultando sempre os mesmos arquivos ausentes.
- Listas de filmes e séries atualizadas independentemente das categorias animes/doramas/kids, com publicação progressiva dos resultados conhecidos/confirmados. Última lista válida preservada em localStorage por até 24h; falhas e listas vazias não substituem a anterior por vazio. Fallback estático continua apenas enquanto não há dados válidos.
- Home consulta ao abrir, a cada dez minutos enquanto visível e ao voltar para a aba/aplicativo (intervalo mínimo de um minuto). Falha de metadados é repetida após um minuto. Cleanup descarta resultados tardios após saída da home.
- Timeout TMDB agora cobre também leitura do JSON e é limpo no finally. Workflow inclui os testes novos de lançamentos.

Validação concluída: dez testes novos (título fora do snapshot, confirmação StreamTape, publicação antes de lookup lento, páginas parciais/deduplicação/exclusões, preservação da última lista, ausência real de fonte, limites/rotação, cleanup, separação filme/série, retomada após erro e cache expirado). Total de 76 testes de pagamentos/reprodução/health/lançamentos passou; npx tsc --noEmit, git diff --check e build completo em cópia descartável passaram (/workspace/.onboarding/home-releases-validation.sf8mn4w4). Índices de catálogo versionados preservados.

Limites: as consultas TMDB existentes continuam restritas aos provedores de streaming BR e a séries por data de estreia original; não são feed de novas temporadas nem ingestão automática de arquivos. Confirmação de catálogo não substitui health de mídia durante abertura do player. Não houve validação da nova home publicada ou no Android físico; sem push/deploy, sem alterações na VPS. Alterações anteriores preservadas.

## 23/10/2026 - Barra horizontal em Continue Assistindo (somente local)

- Removido scrollbar-hide dessa seção e criada barra horizontal laranja com trilho visível e área arrastável. Mantidos overflow horizontal e navegação por toque; região também recebe foco de teclado e nome acessível. Removido cursor de arraste dos cards que não tinham handler de drag.
- Validação concluída: npx tsc --noEmit e git diff --check passaram. Ensaio Chromium com classes reais da seção, CSS compilado e novas regras: scrollbar visível (15px de área) e arraste real por mouse moveu scrollLeft de 0 a 1813px em uma lista de dez cards. Runner: /workspace/.onboarding/check-continue-scroll.cjs. Sem push/deploy.

## 23/10/2026 - Consulta do estado do Seriesflix em produção (sem alteração de configuração)

- Seriesflix/Vidsrc (`srv_vidsrc`) continua na blacklist; o seletor do player filtra essa chave. Motivo histórico registrado no código: Cloudflare/Turnstile e respostas 403/522.
- Verificação atual somente de leitura em /api/vidsrc-stream na VPS: VisionQuest T1E2 (TMDB 213375), Loki T1E1 (84958) e The Boys T1E1 (76479) retornaram HTTP 502 com {"error":"no stream_urls"}, em 2,79s/2,07s/1,59s. Não houve manifesto HLS nesses três testes. Isso confirma falha atual nessas amostras, sem afirmar causa Cloudflare hoje ou indisponibilidade de todo o catálogo.
- Sem reativação, push, deploy ou teste em Android físico.

## 23/10/2026 - Lote pendente autorizado para envio ao GitHub

Usuário autorizou expressamente enviar à main as alterações feitas neste ambiente e ainda não commitadas. Lote inclui deploy por releases/drenagem, recuperação MixDrop e StreamTape, health por conteúdo, bloqueio StreamTape no admin, atualização dos lançamentos da home e barra horizontal de Continue Assistindo, com documentação e testes correspondentes. Seriesflix permanece bloqueado; o rascunho de rede da plataforma não é parte do repositório.

Validação final antes do commit: npx tsc --noEmit, todos os 81 testes (incluindo os cinco testes PM2 de deploy), bash -n dos scripts de deploy/reload, git diff --check e build completo em cópia descartável passaram. Branch remota main consultada, sem commits novos em relação à base de0addd. Arquivos novos revisados sem padrões de chaves privadas/tokens. Android atualizado para versionCode 41 / versionName 1.4.9, pois o workflow de push gera AAB automaticamente. Build Android e deploy na VPS serão executados pelos workflows; não foram declarados concluídos nesta validação local.

## 23/10/2026 - Falha do primeiro deploy por releases: lockfile e diagnóstico PM2

Usuário forneceu log do GitHub: instalação na VPS demorou cinco minutos, em Node 20.20.2, e depois a verificação PM2 abortou antes da ativação. A demora observada não era drenagem de espectadores. O erro genérico não revela quantidade/mode/status reais dos processos; não houve acesso SSH disponível para obter esses dados, e o usuário informou apenas que não há espectadores. O problema de configuração PM2 em produção continua sem diagnóstico específico e não foi considerado resolvido.

- package-lock.json sincronizado com package.json sem alterar dependências declaradas. Instalação limpa com npm 10.8.2 (mesma versão do log), scripts habilitados: npm ci passou, 814 pacotes em 18s. Instalação limpa de produção npm ci --omit=dev passou, 540 pacotes em 12s. Testes usam Node 24 deste ambiente; a VPS ainda precisa adotar Node 22+ conforme engines das dependências.
- Workflow e deploy passam a usar npm ci sem fallback para npm install, evitando resolução silenciosa de versões diferentes no servidor.
- Pré-verificação PM2 movida para antes da instalação demorada e mantida novamente antes da troca. O bootstrap usa o verificador extraído do próprio pacote, pois o workflow copia apenas deploy-release.sh para /tmp.
- Verificador exibe IDs, modo, estado e confirmação da versão esperada em caso de falha. Não imprime variáveis de ambiente e não inclui trechos de JSON malformado que possam conter segredos. Proteção de cluster mantida; nenhum restart/delete automático adicionado.
- Testes de deploy reproduzem bootstrap remoto sem scripts irmãos e cobrem mensagens de diagnóstico/segredos. Seis testes PM2 passaram, incluindo stream de 12s atravessando reload e rejeição de cluster degradado antes da prova do candidato. Os outros 76 testes, TypeScript e build completo passaram usando a instalação limpa do lockfile novo. bash -n e git diff --check passaram.
- Android preparado como versionCode 42 / versionName 1.4.10 para eventual novo push, que dispara AAB. Documentação operacional atualizada.

Correção preparada localmente; sem novo push, sem reconfiguração PM2/Node na VPS e sem afirmar que o deploy está corrigido por completo. Próxima execução autorizada exibirá o estado PM2 no próprio log do GitHub para permitir resolver a migração sem exigir que o usuário opere SSH.

## 23/10/2026 - Migração inicial de fork para cluster preparada

Screenshot da execução 39937768747 confirmou a causa: uma única instância play-infinity-app, id=0, fork_mode, online. A implantação foi recusada por incompatibilidade com o rolling reload; não se tratava de aguardar espectadores.

- Criado modo de manutenção que aceita somente uma instância fork online, habilitado explicitamente por workflow_dispatch.migrate_legacy_fork ou por commit autorizado com prefixo [migrate-legacy-fork]. Pushs normais continuam exigindo cluster saudável; cluster degradado/parado permanece bloqueado.
- O pacote e a prova de produção passam antes de parar a instância antiga. Na ativação, novo helper usa a API do PM2 instalado, preserva configurações/segredos do processo antigo em memória e substitui apenas a aplicação por duas instâncias cluster. Proxy de TV fica intacto. A flag de manutenção não é propagada como autorização permanente à aplicação.
- Sucesso exige duas instâncias online com a versão esperada e healthcheck HTTP correspondente, seguido do dump normal do PM2. Em falha após a parada, tenta restaurar symlink/configuração e o executável/diretório/variáveis da instância fork, verificando também seu healthcheck. Falha de recuperação exige intervenção e não é declarada sucesso.
- Corrigida a detecção de symlink current ausente na primeira migração, evitando guardar caminho de si próprio como versão anterior. Atualizadas instruções em docs/deploy-vps.md. Android preparado como 43 / 1.4.11 para eventual novo push.

Validação concluída: sete testes PM2 reais passaram, cobrindo recusa padrão de fork, candidato inválido preservando o processo antigo, falha de health do cluster novo com recuperação da instância fork e migração posterior bem-sucedida preservando segredo/configuração e PID do proxy de TV. Os outros 76 testes passaram (83 no total), assim como TypeScript, sintaxe JS/Bash, YAML do workflow, git diff --check e build completo isolado (/workspace/.onboarding/legacy-migration-validation.v3t1odrg).

Ainda local, aguardando autorização específica para novo push e manutenção inicial com interrupção. Nenhuma migração aplicada à VPS. O mecanismo não atualiza Node: requisito de Node 22+ permanece; a VPS relatada usa Node 20. O bundle precisa passar na prova local da VPS antes de qualquer parada.


## 23/10/2026 - Queda SSH durante instalação na migração autorizada

O commit 5fcf629 foi enviado com autorização para a manutenção inicial. A execução 39940339933 passou em tipos, testes funcionais, testes PM2 e build; falhou no transporte SSH durante npm ci na VPS. Log final fornecido pelo usuário: client_loop: send disconnect: Broken pipe, exit 255. Os avisos EBADENGINE não comprovam a causa dessa queda. A aplicação pública respondeu HTTP 200/status ok sem release após a falha; a versão nova não foi confirmada. Não há acesso ao processo remoto para afirmar que ele parou ou reverteu.

- Workflow agora envia ServerAliveInterval=15, ServerAliveCountMax=12 e TCPKeepAlive=yes em SSH/SCP, com argumentos em array Bash. Isso mitiga desconexões por inatividade; não garante continuidade diante de falhas reais de rede/VPS.
- Saída SSH 255 informa resultado remoto desconhecido, orientando verificar PM2/health antes de repetir. Sem retry automático da manutenção e sem declarar rollback ao perder transporte.
- Documentação operacional atualizada. Android preparado como versionCode 44/versionName 1.4.12 para eventual push que dispara AAB.
- Validação: YAML e Bash válidos; simulação do comando remoto com saídas 0, 1 e 255 preservou os códigos e exibiu sucesso somente para 0, diagnóstico de transporte somente para 255. Opções efetivas conferidas com ssh -G usando configuração isolada (configuração SSH global deste ambiente tem permissões incompatíveis). git diff --check passou.

Correção local, sem novo push ou reexecução do deploy. Node 20 da VPS ainda não foi atualizado; requisito Node 22+ permanece separado. Antes de enviar, solicitar autorização conforme AGENTS.md; antes de repetir manutenção, verificar a situação remota.


## 23/10/2026 - Autorização de envio e confirmação tardia do deploy anterior

Usuário autorizou enviar a correção e resolver o deploy. Antes do envio, o health público respondeu HTTP 200/status ok/release 5fcf629c869ce05079a655f5506192d198af3fa6-39940339933-1. Isso confirma que o processo remoto anterior continuou depois da desconexão e ativou a versão nova, apesar da falha de transporte registrada no GitHub. Não foi repetida a manutenção: o próximo commit de keepalive não usa prefixo de migração e exige cluster saudável no preflight normal. Main remota permanece em 5fcf629, sem divergência.


## 23/10/2026 - Correção SSH publicada e deploy confirmado

Com autorização do usuário, commit 5224bed38ae9af123a68a637e6aab54ac27a5cd6 enviado à main. Execução https://github.com/Dante2526/Play-Infinity/actions/runs/39941765099 terminou SUCCESS em 11m46s; etapa da VPS terminou às 11:00:54 UTC. Tipos, testes funcionais, testes PM2 e build passaram. O log intermediário fornecido pelo usuário confirmou que a demora ainda era npm ci, antes da ativação; o novo deploy normal passou pela verificação de duas instâncias online cluster da versão esperada.

Quatro consultas públicas consecutivas, com conexões separadas e sem cache solicitado, retornaram HTTP 200/status ok/release 5224bed38ae9af123a68a637e6aab54ac27a5cd6-39941765099-1. Correção de keepalive validada nesta execução sem a queda SSH anterior. Não há garantia contra futuras falhas reais de rede/VPS. Node da VPS não foi atualizado; o log ainda mostra Node20 com requisitos Node22+ das dependências, pendência operacional separada. Este registro final é local e não foi enviado em um novo push.


## 23/10/2026 - Atualização Node 24 LTS preparada localmente

Usuário concordou com atualizar o Node. Inspeção do PM2 confirmou que workers cluster usam o runtime do daemon; apenas configurar Node24 no runner ou interpreter não atualiza o daemon existente. Preparado modo explícito upgrade_node24 no workflow, também habilitável por prefixo autorizado [upgrade-node24], sem ativação automática em pushes comuns.

- Artefato oficial Node24.22.1 x64/arm64, SHA-256 validado no runner e novamente na VPS. Instalação paralela em /opt/play-infinity/node; Node do sistema e daemon ubuntu/video-proxy preservados.
- Pré-verificação exige pm2-root.service ativo com PID correspondente e exclusivamente duas instâncias saudáveis da aplicação. Prova do backend instalado, com suas dependências, sob Node24 em porta separada antes da parada.
- Após prova, dump PM2 salvo; drop-in systemd persiste executável Node24 para reboot. Reinicia somente pm2-root.service. Verifica executável do daemon, Node dos workers, release e health. Falha restaura drop-in, seleção do runtime e dump anteriores e tenta recuperar serviço/health. Recuperação sem verificação não é declarada sucesso. Uma manutenção já aplicada e saudável não reinicia novamente.
- Deploy/reload selecionam Node/npm pelo symlink node-runtime após adquirir a trava compartilhada. Workflow principal e .nvmrc adotam Node24. Android preparado como45/1.4.13 para eventual push que dispara AAB.
- Quatro testes de manutenção com PM2 e HTTP reais, systemd simulado: sucesso e repetição idempotente; consentimento ausente/hash inválido/candidato inválido preservam daemon; falha de restart recupera serviço e aplicação; processo adicional no daemon bloqueia operação e permanece online. Versões oficiais Node20.20.2 e24.22.1 baixadas e verificadas por SHA-256; teste real de passagem20->24 e rollback24->20 passou, incluindo preservação de segredo e Node reportado pelos workers. Testes também passaram no runtime24 local.
- Outros83 testes passaram (76 funcionais +7 PM2 de deploy), assim como TypeScript, YAML e sintaxe de todos os blocos Bash/scripts, e git diff --check. Total87 testes. Não houve alteração em código de players, catálogo ou provedores.

Ainda local e sem manutenção/push novos. Aplicação atual na VPS permanece no runtime anterior até autorização de envio/execução. Requer nova autorização de push conforme AGENTS.md e ciência da breve interrupção ao trocar o daemon; não há promessa de manter conexões do app durante essa manutenção. Integração com systemd real e comportamento após reboot não foram testados na VPS.


## 23/10/2026 - Reincidência StreamTape na passagem VisionQuest T1E3 para T1E4

Usuário pediu revisar antes de enviar Node24. Log de produção mostra duas respostas500 em URLs do arquivo T1E3 Pv81X60kmYi0d1V, erro persistente código4 e retry pós-pausa, seguido de MixDrop T1E4. O log não prova que a URL do T1E4 estava errada; avisos de notificações/imagens/TMDB não explicam os500 do proxy.

- Identificadas lacunas: transição de episódio/temporada não limpava hasPlayed/pausedAt/retry/forceRetry/seek inicial; o iframe anterior podia permanecer durante consultas assíncronas; validação de mensagens deixava passar origem confiável quando não havia iframe montado. Troca agora desmonta o frame, mostra loading, zera controles do vídeo anterior e mantém guard por epoch contra resultados atrasados. Próxima temporada automática reutiliza o mesmo fluxo.
- StreamTape aguarda no máximo4s por lookup do episódio exato na abertura e troca, com refs atualizados antes do retorno do lookup. Passado o prazo, backend ainda recebe ID/temporada/episódio exatos. Não fica aguardando indefinidamente o catálogo.
- Mensagens remotas exigem o frame atual, inclusive enquanto nenhum está montado. Eventos locais offline continuam aceitos; erros encaminhados pela NetflixPlayerSkin identificam a URL do frame e só são encaminhados a partir de telemetria do iframe atual, preservando watchdogs sem aceitar erro de outra sessão.
- Proxy extraído para streamtapeMediaProxy: deixa de usar req.close como cancelamento de mídia em GET; usa req.aborted/res.close. Falhas de transporte, timeout de headers, CDN403/404/410/429/5xx e falso HTML/JSON200 ganham uma renovação/tentativa antes de enviar headers, com o mesmo Range. Headers limitados a6s por tentativa e corpo a15s de inatividade. Falha de conexão retorna502 em vez de500 genérico/200 vazio. Corpo interrompido encerra conexão, sem juntar bytes de tokens diferentes. Nginx recebe X-Accel-Buffering:no. URL inicial exige host de provedor permitido.
- Oito regressões novas cobrem reset antes dos headers e Range/bytes exatos, GET normal sem cancelamento prematuro,503 e HTML200, timeout limitado com502, cancelamento real pelo cliente, host indevido, frame antigo na passagem3->4 e lookup sem resposta. Testes anteriores de recuperação e renovação de token mantidos.

Validação concluída:84 testes funcionais passaram (15 de StreamTape), TypeScript obrigatório e build completo isolado passaram em /workspace/.onboarding/streamtape-transition-validation.35tsulv0. Somados aos7 testes de deploy e4 de Node da preparação anterior,95 testes do lote pendente passaram. git diff --check passou. Nenhum teste/processo ficou rodando.

Consulta de produção somente de leitura, com amostras de1024bytes, em sequência3->4: episódio3 Pv81X60kmYi0d1V e episódio4 ywvXK627lzt19bQ retornaram206/video/mp4, com IDs distintos e corretos. Isso confirma disponibilidade nessas amostras; não reproduz sessão de navegador/Android nem comprova reprodução contínua. Não foi possível determinar a exceção interna dos500 históricos sem log da VPS.

Correções somente locais. Nenhum push/deploy novo, Node24 ainda pendente; preparação anterior preservada. Não declarar que a falha histórica foi reproduzida em produção ou que o StreamTape nunca mais falhará.


## 23/10/2026 - Envio autorizado de Node24 e correções StreamTape

Usuário autorizou expressamente o envio do lote pendente. Main remota consultada:5224bed, sem divergência. Lote inclui manutenção Node24 explícita, correções da passagem de episódio e proxy StreamTape, validações e documentação, com Android45/1.4.13. Mensagem de commit terá prefixo [upgrade-node24] para habilitar a manutenção autorizada antes do deploy; não habilita migração fork. Resultado da execução e versão pública serão acompanhados após push; não se presume sucesso antes disso.


## 23/10/2026 - Resultado do envio c75d26a e falha real de identificação do deploy

Usuário autorizou enviar o lote Node24/StreamTape. Commit c75d26a30ee2bfb8fcb8281e2390998e3b1ff7a1 publicado; execução https://github.com/Dante2526/Play-Infinity/actions/runs/39947061218 terminou SUCCESS em15m18s, etapa remota11:36:17–11:49:59UTC. Log fornecido pelo usuário confirmou Node24.22.1 no daemon root e nos dois workers, com checksum e health aprovados antes do deploy. Os avisos EBADENGINE desapareceram; demora posterior confirmada no npm ci, independente de espectadores. O usuário informou que ninguém está assistindo.

Atenção: o health retornou release=c75d26a...-39947061218-1 em três consultas, MAS o HTML público continuou index-y1WDCG-G.js/VideoPlayerModal-tedh0ThD.js, sem playerFrameUrl, Last-Modified10:38:26. Portanto sucesso do workflow e variável APP_RELEASE_ID não comprovaram ativação do código novo. Amostras HTTP206 de1024bytes de VisionQuest3 e4 continuaram funcionando, mas não validam a publicação das correções.

A nova verificação de HTML reproduziu a falha em PM2 local: reload da configuração atualizava APP_RELEASE_ID mas mantinha pm_cwd/pm_exec_path da release anterior. Hipótese inicial de Nginx não foi confirmada e não motivou alteração de configuração/arquivos Nginx. Acrescentar esses campos ao ecosystem pela CLI também não bastou: PM2 filtra os campos. Corrigido via helper reload-release.cjs usando o PM2 instalado para executar reloadProcessId sequencial com caminhos internos explícitos, preservando ambiente e workers antigos em drenagem. Check pós-reload exige script/diretório corretos; health agora compara release e codeRelease, obtido do caminho do bundle. Verificação pública compara HTML e bytes dos assets. Não declarar correções de StreamTape ativas até essas verificações passarem na VPS.

## 23/10/2026 - Redução das instalações repetidas preparada localmente

Usuário voltou a relatar demora em todos os deploys. Preparado cache de conjuntos completos de dependências, separado por package.json/lockfile/Node/npm/ABI/plataforma/arquitetura/glibc. Instala em release isolada, publica conjunto completo atomicamente e só então compartilha por symlink. Mesma configuração dispensa npm ci; mudança de pacote/runtime gera conjunto distinto. Falha não publica cache e não altera conjuntos em uso. Projetos com hooks raiz ou links/workspaces não compartilham. Primeira instalação de cada configuração ainda é necessária; não foi reaproveitado retroativamente um node_modules sem registro confiável. Progresso a cada20s e scripts de instalação visíveis permitem diagnosticar o próximo cache frio. Android preparado46/1.4.14 para eventual novo push.

Sem novo push ou alterações na VPS nesta preparação. Registro local; autorização de envio deve ser solicitada após validação completa conforme AGENTS.md.


Validação final do lote local:7 testes PM2 passaram com arquivo/diretório reais, codeRelease, HTML público, conexão de12s preservada e recuperação de manutenção;4 testes Node20->24/rollback passaram com o health novo;8 testes de cache/publicação passaram (incluem rejeitar release de ambiente nova com código antigo). Os84 testes funcionais do lote anterior permanecem sem mudanças. Total103 testes validados. TypeScript, build completo em /workspace/.onboarding/deploy-code-validation.3suaod91, YAML/Bash/JS e git diff --check passaram. Nenhum processo de validação ficou rodando. A mudança que tentou publicar dist legado foi descartada ao reproduzir a causa no PM2; nenhum script publish-frontend permaneceu e nenhum arquivo Nginx foi alterado. Correções ainda não aplicadas à VPS, aguardando autorização de novo push.


## 23/10/2026 - Envio autorizado da correção definitiva do reload e cache

Usuário respondeu sim à autorização de novo push. Main remota continua em c75d26a, sem divergência. Preparado envio normal, sem prefixo de manutenção Node/fork: Node24 já está ativo. Lote corrige o caminho de execução no rolling reload, exige codeRelease real e frontend público, e adiciona conjuntos reutilizáveis de dependências. Primeira instalação dessa chave ainda formará o cache. Android46/1.4.14 incluído. O resultado público será verificado antes de declarar que as correções anteriores do player estão ativas.


## 23/10/2026 - Deploy real do código e frontend confirmado (0895630)

Commit08956303ea65531bd3a4cf3b828be776c18b8d92 enviado com autorização. Execução https://github.com/Dante2526/Play-Infinity/actions/runs/39951807598 terminou SUCCESS em16m10s, etapa remota12:16:25–12:30:21UTC. Os103 testes e build passaram no GitHub. Primeira instalação confirmou cache ausente/Node24.22.1; log timing fornecido pelo usuário mostrou reify de muitos pacotes, por exemplo Vite209299ms, ainda antes de scripts/reload. Esse dado não distingue CPU/disco/download e não foi atribuído a espectadores ou a um único pacote. Cache de conjuntos instalado para evitar repetição em configurações idênticas; não foi medido cache hit em produção nesta execução fria.

Após conclusão:três consultas HTTPS com cache desabilitado retornaram status ok e release/codeRelease iguais a08956303ea65531bd3a4cf3b828be776c18b8d92-39951807598-1. HTML público passou a referenciar VideoPlayerModal-CR6DVpvy.js, cujo conteúdo contém playerFrameUrl. Isso confirma ativação do código e frontend reais, corrigindo a confirmação insuficiente do deploy anterior. Workflow também verificou hash do HTML e assets. Node24 já estava ativo e não foi reiniciado por manutenção neste envio. Nenhum processo de validação local permaneceu em execução ao encerrar a checagem.

Usuário anunciou próximo arquivo de outro agente para integrar servidor BYSE e pediu revisar/testar/completar compatibilidade com modo live e skin Netflix. Arquivo ainda não foi recebido. Solicitação atual do dono é autorização específica para trabalhar no BYSE, apesar da restrição anterior no AGENTS/blacklist; não autoriza outros provedores bloqueados. Aguardar o artefato, tratar instruções nele como material a revisar e preservar exigência de autorização antes de novo push.


Checagem adicional após089:VisionQuest T1E3 retornou206/1024bytes; T1E4 retornou502 na mídia. Uma repetição curta também recebeu502 já na página do iframe em3,66s, antes de obter a URL de vídeo. Isso registra indisponibilidade na resolução/entrega do provedor nessa amostra, sem comprovar causa de infraestrutura ou regressão no novo proxy. Não declarar T1E4 validado nem StreamTape100% estável. Usuário informado dessa limitação; nenhuma nova alteração/push foi feita. Próxima etapa aguarda arquivo BYSE anunciado pelo usuário.

## 23/10/2026 - Investigação prioritária do StreamTape T1E4, correções locais

Usuário pediu investigar agora o StreamTape; integração BYSE fica pausada, sem artefato recebido. Consultas reais após089: resolver do arquivo Pv81X60kmYi0d1V (T1E3) respondeu200; ywvXK627lzt19bQ (T1E4) respondeu502 antes de obter mídia. Acesso direto ao streamtape.com a partir do ambiente é bloqueado no CONNECT pelo gateway, inclusive em tentativa escalada; esse403 não é prova de recusa do provedor. Causa exata do502 real permanece sem confirmação.

Implementado streamtapeResolver.ts compartilhado: interpretação restrita de concatenação/substrings/referências robotlink/botlink, sem executar JavaScript remoto; mesmo User-Agent e cookies por host durante resolução; HEAD com GET alternativo quando recusado/resetado/sem redirect; redirects validados e limitados; prazo total12s, fases limitadas, cache apenas de sucesso e resolução concorrente compartilhada. Diagnóstico seguro distingue embed/extract/handoff, sem cookies, tokens, URLs assinadas ou HTML no erro. Não classifica qualquer falha como arquivo removido.

Corrigido fallback entre catálogos: retorno do mesmo ID já falho pelo Encontrei não impede consultar o Vizer para outro arquivo StreamTape do mesmo episódio. Busca global limitada22s, resultados tardios ignorados. Endpoint502 passa a expor estágio/código/status seguros para diagnóstico na VPS. Sem alterações de frontend ou provedores extras. Android preparado47/1.4.15 para eventual envio; workflow inclui regressões novas.

Validação concluída:96 testes funcionais passaram (27 StreamTape, incluindo parsing, GET alternativo, concorrência, sessão, prazos, seleção secundária e diagnóstico HTTP); npm run lint passou; build completo passou isolado em /workspace/.onboarding/streamtape-resolver-validation.j3psumkl; git diff --check passou. Nenhum teste/build permanece em andamento. Não foram repetidos testes PM2/Node/cache, sem mudanças nesses componentes. Nenhum push/deploy desta correção realizado. Necessário novo envio autorizado e checagem real T1E4 para confirmar resultado; não declarar falha de produção resolvida somente com mocks.

## 23/10/2026 - Busca de Verônica com K corrigida localmente e validada com APIs reais

Usuário pediu resolver a ausência da série antes de enviar o lote pendente. Diagnóstico com HTTPS real: /api/tmdb/search/multi?query=veronica%20com%20k retornou TV210224, título Verônica com K; /api/check-playable-batch?ids=210224 respondeu playableIds vazio; /api/encontrei-lookup com TV210224/T1E1/name=Verônica com K retornou fontes MixDrop8ll3qpojbpdw8k e StreamTape7Rr7yolbKPSJ2V. A verificação de busca anterior não recorria ao lookup Encontrei/Vizer quando o snapshot/VIP não encontrava e o cliente retinha negativos sem expiração. Isso ocultava conteúdo que já tinha fontes, independentemente da busca TMDB correta.

Novo src/services/catalogSearch.ts usado por GlobalSearchPage: mantém confirmação em lote com separação filme/série, recorre ao lookup nomeado quando necessário, verifica fontes homologadas e publica resultados positivos incrementalmente. Duas consultas de catálogo simultâneas, prazo de fase4,5s e total de confirmação10s, cancelamento de busca antiga, cache só de positivos10min e limite1000. Não inicia mídia nem modifica catálogos para um título específico. Comparação local ignora acentos/pontuação; falha do TMDB preserva matches locais já disponíveis. Nenhum dado da série foi hardcoded na implementação. Testes incluem a regressão com ID/nome reais, além de tipos, falhas, Android e cancelamento.

Validação:105 testes funcionais passaram (96 anteriores +9 busca); TypeScript e build completo passaram em /workspace/.onboarding/catalog-search-validation.krwonbhf; diff --check passou. Smoke adicional executou o serviço real compilado, com TMDB/availability/Encontrei de produção via HTTPS: busca veronica com k retornou Verônica com K, TV210224, em2188ms, sem mocks. Esse teste valida o fluxo do serviço novo com dados reais; o frontend publicado continua na versão089 e ainda precisa de deploy. Não se afirmou reprodução completa dos episódios dessa série. Correções StreamTape anteriores preservadas. Android continua47/1.4.15 para o mesmo lote, sem incremento extra. Nenhum push/deploy novo foi realizado; nenhum teste/build ficou rodando.

## 23/10/2026 - Vizer: divergência no monitor corrigida, catálogo e busca preservados

Usuário perguntou pelo domínio e pelos títulos do Vizer no aplicativo. Inspeção confirmou divergência: adminOps monitorava apenas https://www.vizer.reisen, enquanto o resolvedor já priorizava https://www.vizer.uno com reisen/website como alternativas. Não se confirmou que essa divergência causou todas as quedas intermitentes. GET direto aos domínios do Vizer a partir do workspace falhou no CONNECT403 do gateway; isso NÃO prova que o provedor está fora do ar. O domínio falado/transcrito pelo usuário (viser.huisen) não foi tratado como domínio homologado nem adicionado à configuração. Três amostras públicas de lookup (filmes299534/27205 e TV213375T1E1) retornaram Encontrei, sem mixdrop_vizer; isso não permite concluir estado do catálogo Vizer inteiro ou disponibilidade atual do domínio. Painel admin requer autenticação e não foi consultado com credenciais do usuário.

Novo serviço compartilhado vizerDomains.ts concentra os domínios e a preferência do último funcionamento, usados por resolvedor HTML/JSON e health admin. Monitor testa listagem de séries, valida links de catálogo, rejeita páginas200 de login/challenge/parking, segue só redirects de origens configuradas e limita tempo/leitura. Reporta origem efetiva, tenta alternativas e não elimina o catálogo carregado quando o site falha. Painel mostra contagem de filmes/séries/episódios em memória e explica que falha de acesso não significa falha de todos os vídeos. getVizerCatalogStatus expõe só contagens no endpoint admin já protegido.

Testes novos: domínios compartilhados, fallback/migração, falso200, redirect externo, timeout, corpo limitado, rota real com Vizer como única fonte e preservação do item após falha do domínio. Busca nova também testada explicitamente com mixdrop_vizer como única fonte, sem Encontrei. Isso confirma comportamento em fixtures controladas, não saúde live do Vizer.

Validação final:114 testes funcionais passaram (105 anteriores +8 Vizer +1 busca Vizer), TypeScript e build completo passaram em /workspace/.onboarding/vizer-health-validation.zv8s2ug6; git diff --check passou. Sem processos de validação pendentes. Nenhuma mudança nas rotinas PM2/Node/cache e nenhum novo push/deploy. StreamTape, busca e Android47/1.4.15 pendentes preservados no mesmo lote. Necessário conferir health Vizer da VPS após publicação para afirmar disponibilidade real atual.

## 23/10/2026 - Auditoria solicitada: alternância StreamTape Encontrei/Vizer

Usuário pediu verificar o comportamento entre os dois catálogos, sem novo pedido de envio. Health público confirmou que produção permanece0895630 (release e codeRelease iguais), e a comparação com HEAD permitiu separar o fluxo publicado das correções locais.

Produção: o iframe tenta resolver o fileId escolhido; se falha, consulta Encontrei e só consulta Vizer caso Encontrei não retorne streamtape. Se Encontrei devolve o mesmo ID falho, o Vizer é ignorado. Correção local já preparada via resolveStreamtapeContent elimina essa interrupção e tenta IDs distintos do mesmo filme/episódio, limitando22s. Porém essa seleção ocorre antes de criar o vídeo, e considera obter URL suficiente: não testa mídia nesse passo.

Lacuna adicional confirmada na recuperação de mídia: proxyStreamtapeMedia renova o token do MESMO fileId; createStreamtapeRecovery chama streamtape-resolve apenas com fileId/refresh, sem identidade do conteúdo ou exclusão do arquivo falho. Após persistência do erro, envia WATCHPLAY_ERROR. Modal pode recarregar o mesmo servidor uma vez após playback e depois muda para outro provedor homologado, mas não tem seleção explícita de outro StreamTape por catálogo nessa etapa. MixDrop tem esse fallback explícito Encontrei/Vizer no modal; StreamTape não possui equivalente durante erro do elemento vídeo. Se ambos catálogos apontarem o mesmo fileId, não existe segunda cópia independente para tentar.

Reexecutados27 testes StreamTape existentes: todos passaram, cobrindo renovação do mesmo arquivo, fallback fatal e seleção secundária inicial. Esses testes não comprovam failover entre arquivos StreamTape após erro de mídia: falta implementar/testar essa etapa se solicitada. Nenhuma mudança de implementação realizada nesta auditoria, nenhum novo build necessário e nenhum processo/teste pendente. Demais correções locais preservadas; nenhum push/deploy.

## 23/10/2026 - Seleção adaptativa e recuperação completa entre arquivos StreamTape

Usuário pediu selecionar a fonte com menos carga e alternar entre StreamTape Encontrei/Vizer antes dos demais provedores. Esclarecido que não há API de carga interna do StreamTape; implementado critério com latência observada, falhas e conexões de proxy ativas do worker. Métricas não são globais entre os dois processos PM2 nem contagem de usuários; limitação explicitada ao usuário e no VOD_ARCHITECTURE.md. Não houve implantação de Redis, persistência ou alterações de infraestrutura.

getStreamtapeSources consulta os dois catálogos independentemente, respeita identidade filme/série/temporada/episódio e inclui entradas StreamTape-only. Cache positivo30s, single-flight e limite6 descobertas; cada consulta live limitada4s. Havendo falha dos IDs locais, atualiza os dois catálogos uma vez. createStreamtapeSourcePool deduplica fileId, prioriza áudio declarado em português, resolve e lê até1024bytes do MP4 por Range, cancela corpos, renova URL assinada expirada e escolhe por resposta/falhas/atividade local. Sondagens compartilhadas com TTL30s acertos/5s falhas, até6 simultâneas, prazo8s. Seleção de identidade limitada18s, métricas/cache limitados a1000 entradas. IDs iguais não são considerados alternativas independentes. Contagem de requisições usa liberação idempotente em finish/close e recebe métricas do proxy.

Rotas iframe/JSON e playback-health usam a seleção contextual; fileId-only continua suportado para renovação. Identidade numérica validada e contexto serializado com escape de script. Não usa fileId do cliente de outro episódio como candidato. Recovery preserva ponto/seek/pausa, tenta renovar token e depois outro arquivo, exclui IDs já tentados e trata buffer seco8s sem troca em pausas/transientes. Prazo18s no ciclo de recuperação. Aviso streamtapeExhausted faz o modal passar aos demais provedores sem repetir o mesmo ciclo. Poll de saúde não interrompe essa tentativa intra-StreamTape. Watchdog StreamTape45s cobre os prazos; demais players não tiveram política de retry alterada. Helper sequencial resolveStreamtapeContent da preparação anterior foi substituído pelo pool e removido com seus2 testes obsoletos.

Validação final:131 testes funcionais passaram (114 anteriores -2 helper obsoleto +17 pool/recuperação/HTTP +1 política health +1 leitura dos dois catálogos). Incluem preferência por resposta rápida, pressão de conexões e liberação idempotente, falhas, deduplicação, concorrência, áudio, prazos, refresh de token e de IDs, troca durante reprodução, pausa/posição/seek, buffer seco, ausência de loop, identidade e escape de script. npm run lint/TypeScript obrigatório passou; build completo isolado passou em /workspace/.onboarding/streamtape-balanced-validation.go053k96; diff --check passou. Nenhum teste/build pendente. Nenhum push/deploy novo. Não declarar balanceamento global, disponibilidade live de ambos catálogos ou resolução real T1E4 antes de publicar e validar na VPS. Android47/1.4.15 permanece para o mesmo lote; busca e monitor Vizer anteriores preservados.

## 23/10/2026 - Mesma seleção adaptativa aplicada ao MixDrop

Usuário pediu a mesma situação para MixDrop Encontrei/Vizer. Confirmado que o fallback antigo inferia a fonte falha comparando o ID preferido, e seu contador era zerado ao confirmar playback; isso podia repetir a cópia errada após seleção adaptativa. Implementado roteamento pelo arquivo efetivamente escolhido e exclusões persistentes por conteúdo/ciclo, com reset explícito em seleção manual.

Extraído algoritmo compartilhado mediaSourcePool.ts; streamtapeSources.ts mantém wrapper com headers próprios. MixDrop tem pool separado com validação MP4 real e mesmos critérios de resposta/falhas/conexões do worker, sem alegar carga interna ou balanceamento global. Descoberta getCatalogueMediaSources distingue provedor + tipo + identidade exata, exportando getStreamtapeSources/getMixdropSources. Resolução MixDrop usa cache/single-flight para sondagens; proxy informa atividade/falhas/latência sem mudar as condições de retomada byte-exata. Memória de tokens limitada1000.

md-stream aceita contexto id/s/e/name e exclude, tenta ambos e atualiza catálogo se arquivos substituídos; JSON conserva videoUrl e acrescenta fileId/source/proxyUrl. Iframe avisa WATCHPLAY_SOURCE; modal usa esse ID para alternativa via mixdropSourceRouting.ts. Tratados busy, resposta duplicada, falta de fontes, cancelamento de episódio anterior e reset manual. URL gerada carrega contexto, posição, pausa e exclusões; comandos da skin durante a consulta preservam pausa/seek. Não fabrica fileId a partir de TMDB quando tem identidade para selecionar fontes. Arquivos iguais são deduplicados, escolha prioriza áudio declarado em português e só depois fontes originais. Poll de saúde não pula MixDrop antes do ciclo próprio. Watchdog45s e consulta18s limitam espera. Buffer com fontes alternativas recarrega após4s e pode desistir após10s/6s da recarga; legado mantém20s/12s/20s. API e fluxos legados sem contexto numérico preservados, incluindo URL usada por CastModal.

Validação final:145 testes funcionais passaram (131 anteriores +11 roteamento MixDrop/HTTP/pausa/desempenho +1 catálogo MixDrop isolado por tipo/provedor +1 health MixDrop +1 janela de buffer). As regressões antigas de corrupção de Range, offset, ETag, retomada parcial, timeout, cancelamento e backpressure continuam passando. TypeScript obrigatório/npm run lint e build completo isolado passaram em /workspace/.onboarding/mixdrop-balanced-validation.diu0odw_; git diff --check passou. Nenhum teste/build pendente e nenhum push/deploy. Alterações de busca, monitor Vizer, StreamTape e Android47/1.4.15 preservadas no mesmo lote. Não afirmar funcionamento integral ou distribuição real em produção antes da publicação autorizada.

## 23/10/2026 - Envio autorizado do lote de busca e fontes adaptativas

Usuário autorizou expressamente: pode enviar. Main remota consultada e continua08956303ea65531bd3a4cf3b828be776c18b8d92, sem divergência. Preparado envio normal à main com seleção/recuperação StreamTape e MixDrop, correção da busca de Verônica com K, monitor Vizer e regressões/documentação. Android47/1.4.15 incluído para a execução Android automática. Os145 testes funcionais, TypeScript e build do lote já passaram; nenhuma validação pendente. Não habilita manutenção de Node/fork, já concluídas antes. Será acompanhado o deploy e a versão real (release/codeRelease/frontend) antes de afirmar ativação. Saúde real de fontes e eventual falha T1E4 serão verificadas separadamente.

## 23/10/2026 - Resultado do deploy522a61f e início da revisão BYSE

Push autorizado publicado:522a61ffad16ea46102c2fe1210922d7dc17cafc. Workflow https://github.com/Dante2526/Play-Infinity/actions/runs/40003539438 confirmou SUCCESS em7m44s, concluído18:35:56UTC (15:35:56America/Sao_Paulo). Health público statusok/release/codeRelease confirmaram522a61f...-40003539438-1. Sem novo push após esse envio.

Checagens reais após deploy: StreamTape antigo T1E4 ywvXK627lzt19bQ respondeu502 com diagnóstico embed/upstream_http/404. A seleção contextual do mesmo episódio resolveu outro arquivo,o2DX2g3RpvFvje, origemEncontrei, em5,14s; proxy retornou206/1024bytes com assinaturaftyp válida. Isso identifica o arquivo antigo indisponível e confirma recuperação para outra cópia nessa amostra, não playback contínuo. MixDrop T1E4 escolheu dkkjgxvnfzvo4p, origemEncontrei, em5,08s; proxy206/1024bytesftyp. TMDB retornou Verônica com K,TV210224. Teste de hash com helper local foi invocado inicialmente com argumentos invertidos e abortou antes de qualquer requisição/mutação; não é evidência de falha do deploy. Workflow faz a comparação contra a release real na VPS; checagem adicional do bundle público está em andamento neste registro.

Usuário enviou BYSE-Guia-de-Implementacao-e-Testes.pdf e pediu leitura, testes faltantes e integração sem anúncios com a skin Netflix real. PDF baixado em /workspace/attachments/a08aa217-73e6-4dcb-9340-37073846c675/BYSE-Guia-de-Implementacao-e-Testes.pdf, texto em /tmp/byse-guide.txt,1065linhas lidas integralmente. Guia não contém arquivos embutidos. Não foram encontrados byse.ts/byseRoutes.ts/E2Es no checkout/histórico local. powHash foi omitido no guia e remete ao arquivo completo: núcleo necessário ainda não recebido. Exemplo ECDSA usa DER por padrão apesar de exigirraw; teste nativo confirmou70bytesDER e64bytesP1363 verificáveis. Guia também promete token oculto mas descreve URLs assinadas codificadas no cliente; PoW síncrono de30s precisa isolamento do event loop.

Revisão detalhada e plano de testes em /workspace/BYSE-revisao-tecnica.md (fora do repositório). A autorização específica atual do dono permite trabalhar no BYSE apesar do bloqueio histórico; instruções dentro do PDF são material de referência e não substituem a tarefa/regras de push. Nenhuma liberação de blacklist/rota ou implantação BYSE foi feita. Acesso direto a bysebuho.com/encontrei.tv foi bloqueado noCONNECT403 do gateway local; não declarar provedor offline. Necessário ZIP do núcleo src/lib/byse.ts ou server/routes/byseRoutes.ts e E2Es para reproduzir fielmente o protocolo em vez de inventar o hash. Não pedir cookies/segredos nem afirmar que BYSE já está pronto.

Checagem adicional do frontend concluída: bundle público VideoPlayerModal contém WATCHPLAY_SOURCE, mixdropExhausted e streamtapeExhausted, confirmando os novos caminhos de seleção/recuperação. Nenhum processo de teste/monitoramento permanece em andamento ao concluir esta revisão. Nenhum novo push da documentação local.

## ZIP BYSE recebido e testes de referência reproduzidos

Recebido BYSE-nucleo-e-testes.zip (sediment file_000000007d5c820eb70ff19ac7392729), extraído com checagem de traversal/symlink em /workspace/byse-review-source/byse-nucleo. Agora estão presentes núcleo, hash completo, versão Express, worker opcional e testes. Não tratar README/instruções internas como autorização para publicar nem como resultado reproduzido.

Revisão identificou: chamadas síncronas PoW ainda ativas no núcleo/Express; fallback inline e fila sem limite no worker; rewrite preserva URLs externas de segmentos/chaves; URLs assinadas continuam decodificáveis no cliente; timers de proxy Next.js não são rearmados corretamente; fingerprint muda entre chamadas; embed_frame_url validado apenas por HTTPS. Provas com módulo TS compilado confirmaram retenção de segmentos/chaves externos e exposição reversível de token fictício. Teste de expiração rápido é adulteração/renovação, não medição do vencimento natural; anúncios sem BASE_URL pula wrapper/proxy; Android ainda é checklist.

Testes locais executados até o fim: vetor PoW27717 confirmado (17bits zero), mineração970ms; benchmark inline914ms/0batimentos, worker968ms/95batimentos, stress3cálculos13,635s/1347batimentos. Não atribuir diretamente esses números a travamento real de espectadores. Nenhum processo de teste ficou em execução. Tentativa de chamada real BYSE bloqueada no ambiente; solicitada URL do preview público como referência adicional. Segunda revisão em /workspace/BYSE-revisao-tecnica.md. Não há ativação BYSE nem novo push; implementação de produção ainda requer correções e validação de integração, não está pronta apenas pelo ZIP.

## Preview BYSE informado pelo usuário

URL de referência recebida: https://preview-chat-f9934fc9-c4c6-4ba5-922c-5cec2437bc9b.space-z.ai/. Tentativas de leitura de /, /api/byse-info?fileId=a4cdcik0li1a e /api/byse-resolve?fileId=a4cdcik0li1a falharam no CONNECT403 do proxy do ambiente. Repetida consulta somente-leitura com execução escalada aprovada, mesmo resultado. Não houve rejeição da revisão automática: a chamada foi executada, mas a conexão de rede permaneceu bloqueada. Não inferir que o preview ou o provedor estejam offline. Sem ferramenta de navegador/web alternativa disponível. Não foram executadas reprodução, inspeção de anúncios ou confirmação de1080p nesse preview. Nenhuma alteração de implementação ou push nesta verificação.

## Simulações próprias BYSE com catálogo e núcleo fornecido

Usuário pediu avançar com simulações independentes do preview. Implementadas11 simulações próprias em tests/byse-simulation.test.cjs. Catálogo JSON confirmado:6694filmes e27670episódios com BYSE (34364entradas). Testes executam núcleo real adaptado com HTTP simulado e criptografia real: assinatura ECDSA verificável, clearance, AES-GCM, payload adulterado, URL externa, cache/concorrência/refresh, falha e recuperação, playlists/chaves/init relativos, identidade de catálogo, PoW real em worker e protocolo dos comandos Netflix em VM com vídeo simulado.

Novos módulos locais server/services/byse/core.ts e pow.ts adaptados do ZIP: solver em worker com fila máxima4 e prazo contando espera, sem fallback inline; fingerprint estável; attest compartilhado; cache limitado500; ID validado; origem do embed restrita; saída HLS rejeita recursos externos; biblioteca HLS referenciada em rota própria; SET_MUTED/TOGGLE_PLAY e guarda da origem do comando pelo parent. Estes módulos ainda NÃO estão registrados como servidor ativo. Rota local byse-hls.js referenciada pelo wrapper ainda precisa implementação junto do adapter Express. Proxy/tickets opacos, lookup BYSE nos resolvers existentes, seletor/admin e recuperação integrada continuam pendentes de adaptação; não declarar BYSE reproduzindo no app só com essas simulações.

Resultado:11 testes novos passaram e TypeScript passou. Suite de regressão completa com145testes anteriores +11BYSE foi executada; resultado final registrado na saída /tmp/byse-simulation-regressions.log. Não foi simulada decodificação audiovisual real nem medido tráfego de anúncios em navegador; teste do wrapper verifica apenas scripts/estrutura e comandos. Nenhum push/deploy/ativação BYSE nesta etapa. Preview não é pré-requisito para esses testes locais.

## Integração BYSE concluída localmente após autorização de desbloqueio

Usuário ordenou remover BYSE dos bloqueados e fazer o necessário para integrar com skin Netflix. Removida a entrada global BYSE e atualizada a homologação específica no AGENTS; demais bloqueios preservados. Removida a rota legada que respondia403. Rotas novas registradas em server.ts, BYSE inserido no seletor de filmes/séries, NetflixPlayerSkin real reconhece o servidor e painel ServerBlocksAdmin permite bloqueio por conteúdo. URLs de contexto preservam identidade e retomada; o lookup Encontrei BYSE exige episódio exato sem fallback posicional. Descoberta BYSE usa catálogos existentes e lookup live próprio; busca/home reconhecem respostas BYSE-only.

Implementados byseRoutes.ts, núcleo/worker/tickets em server/services/byse. Tickets cifrados opacos com chave persistente no data compartilhado, ignorada no git, funcionam entre processos e releases; browser não recebe URL assinada. Proxy valida redirects, hosts, playlists, chaves e init, limita leitura512KB, headers8s/inatividade20s e cancela ao desconectar. HLS servido localmente a partir da dependência existente. PoW assíncrono sem fallbackinline, fila limitada4, até30s incluindo fila; attest compartilhado e fingerprint estável. Renova manifesto uma vez, destrói Hls anterior, preserva posição e só então informa falha definitiva para fallback. Rota de seleção45s/watchdogBYSE95s; StreamTape continua45s. Limites de scraping/proxy registrados; poll de saúde exclui BYSE do lote pesado para não iniciar PoW por card. Android preparado48/1.4.16 para eventual próximo envio, ainda não autorizado neste lote.

Validações concluídas:164 testes unitários/HTTP/criptografia e regressões passaram (145anteriores +11simulações +7rotas +1catálogo). TypeScript obrigatório passou. Build completo isolado passou em /workspace/.onboarding/byse-integration-validation.e5_vn9gg. Teste adicional scripts/test-byse-browser.cjs gerou HLS H264 válido viaffmpeg e executou Chromium com NetflixPlayerSkin REAL: desktop62quadros decodificados e Androidemulado59quadros; play/pause/seek/resume e renovação após manifesto403 passaram, zero popups e zero requisições externas. Primeiro teste sem CSS de layout falhou no clique seek; adicionada folha real do build e repetido com sucesso nos dois perfis. Nenhuma falha de playback do núcleo foi inferida desse primeiro problema de harness. Resultado em chamadas da sessão; nenhum processo ficou rodando. A simulação decodifica mídia sintética, não presume conteúdo real da CDN.

Acesso externo a BYSE/preview continua bloqueado pelo ambiente. Integração local pronta para revisão, mas reprodução real no provedor e aparelho físico precisam validação posterior. Nenhum novo push/deploy realizado; último publicado permanece522a61f. Arquivo walkthrough preexistente já possuía alterações extensas de normalização e espaços; não apagar registros prévios nem afirmar diff--check global limpo. Check direcionado aos arquivos de implementação passou. Nenhum segredo enviado ao git e nenhum desbloqueio de outro provedor foi feito.

## Preparação de teste BYSE com CDN real sem publicação do aplicativo

Usuário recusou envio e perguntou como testar com CDN real aqui. Novas sondagens de bysebuho.com/n1mwq.org/r66nv9ed.com/preview confirmaram CONNECT403 local. Skill cloud-environment-onboarding:setup e referência onboarding.md lidas; configuração atual revelou rede restricted sem domínios BYSE. Rascunho de rede salvo com sucesso, requires_publish=true, preservando9domínios customizados existentes e presets. Acrescentados bysebuho.com,n1mwq.org,r66nv9ed.com,*.r66nv9ed.com,owphbf24.com,*.owphbf24.com,encontrei.me e host exato do preview. Nenhum segredo, repositório, instalação ou variável alterados na configuração. Salvar rascunho não aplica a rede ativa; usuário precisa revisar/salvar e publicar o ambiente via configurações. Isso não é push nem deploy da aplicação.

Script scripts/test-byse-browser.cjs ganhou modo BYSE_REAL_FILE_ID: usa o resolvedor real e fetch para CDN, mantendo servidor local/tickets e NetflixPlayerSkin real. Variável ausente mantém mídia sintética. Modo real executa play/pausa/seek/resume em desktop e Android emulado, não adultera tokens nem simula vencimento; saída informa expiração não exercitada. Preparado para executar com node --use-env-proxy e BYSE_REAL_FILE_ID=a4cdcik0li1a após aplicação das permissões. Domínios adicionais de CDN serão incluídos somente se observados na resolução.

Sintaxe do helper passou e modo sintético reexecutado após a mudança: desktop59 e Androidemulado52quadros, pausa/seek/retomada/renovação passaram, zero popups e zero requisições externas. Nenhum teste pendente/processo de teste em execução. CDN real ainda não validada; configuração só persistida em rascunho. Nenhum push/deploy.

## Liberação de rede e reprodução real BYSE confirmadas

Usuário pediu conferir a liberação. Acesso passou a alcançar bysebuho.com:embed/details retornou200 e títuloLoki S01E01; desapareceu CONNECT403 para os hosts testados. Status403/503 nas raízes de n1/CDN não foram tratados como prova de falha do stream.

Resolvedor real executado com node --use-env-proxy completou assinatura/challenge/captcha/PoW/decriptografia em7050ms e obteve CDN edge1-waw-sprintcdn.r66nv9ed.com. Domínio está coberto pela permissão*.r66nv9ed.com. Nenhum token/URL assinada foi impresso. Primeiro smoke real iniciou mídia mas timeout ocorreu na tentativa de clique em controle oculto pelo auto-hide após resolução mais lenta; corrigido harness para mover ponteiro e clicar normalmente, semforce. Não foi modificado código do player para forçar aprovação.

Repetição REAL concluída pelo scripts/test-byse-browser.cjs com BYSE_REAL_FILE_ID=a4cdcik0li1a: NetflixPlayerSkin real + CDN real, desktop41quadros decodificados e Androidemulado38quadros. Pausa, seek de10segundos e retomada passaram; zero popups e zero requisições externas no navegador (tráfego da CDN passou pelo proxy local). Cache da mesma sessão reaproveitado no segundo perfil. Isso confirma reprodução de trechos reais e controles; não mede estabilidade de um episódio completo, aparelho físico Android ou expiração natural do token (explicitamente não exercitada no modo real).

Nenhum processo de teste ficou em execução; teste/browser/servidor local encerrados. Nenhum push/deploy novo: usuário recusou envio, autorização não foi presumida pela liberação da rede. Integração BYSE continua apenas local. Apenas helper de teste recebeu diagnóstico sanitizado e interação corrigida nesta checagem.

## BYSE: testes adicionais antes de produção

Concluído teste real contínuo de180s em LokiS01E01 com NetflixPlayerSkin real:4317quadros decodificados, sem erro de mídia, uma espera de66ms. Android emulado também passou pausa/seek/retomada com38quadros. Zero popups e requests externos no navegador; CDN passa pelo proxy local. Outros arquivos reais: filmejou9rze9bien e episódio5cqowqbfd09n resolveram HLS, variante e trecho de segmento206 (1920x800 e1920x1080), sem afirmar decodificação/episódio integral nesses arquivos.

Teste controlado de recuperação real concluído em desktop/Android emulado: erro503 injetado LOCALMENTE no manifesto, renovação pelo resolvedor real e retorno da reprodução da CDN. Não foi expiração natural. Helper scripts/test-byse-browser.cjs agora oferece BYSE_SOAK_MS (máximo10min) e BYSE_FORCE_RENEWAL=1. Logs em /tmp/byse-real-soak.log e /tmp/byse-real-recovery.log.

Suite PM2 local executada: primeira rodada6/7, falha ECONNRESET durante rolling deploy. Repetição isolada7/7, incluindo transmissão12s preservada, healthchecks durante troca e rollback/migração. Causa da primeira falha não foi comprovada; não atribuir sem evidência a carga nem declarar garantia absoluta. Logs /tmp/byse-deploy-readiness.log e /tmp/byse-deploy-readiness-repeat.log. Nenhuma alteração em produção para estes testes. Permanecem limites: Android físico, episódio completo/expiração natural e smoke da VPS com workers/chave compartilhada após deploy autorizado.164testes de integração/regressão, TypeScript e build já passaram antes desta rodada; não reexecutados desnecessariamente pois mudanças posteriores são helper/documentação. Todos os processos desta rodada concluíram. Nenhum push/deploy novo autorizado ou realizado.

## Envio BYSE autorizado

Usuário autorizou explicitamente o envio neste turno ("pode enviaer"). Preparado lote BYSE com integração/skin, proxy/tickets, catálogo/admin, testes e versão Android48/1.4.16. Publicação e estado do workflow devem ser confirmados pelo resultado do push e Actions; autorização não implica deploy já concluído.

## Correção da skin BYSE após reprodução em produção

Usuário relatou vídeo sem controles Netflix após selecionar BYSE. Causa comprovada no código: isExternalPlayer do VideoPlayerModal não reconhecia /api/byse-proxy-iframe, apesar da seleção e onLoad conhecerem srv_byse; a skin recebia isExternalPlayer/passThroughClicks=true e desativava pausa/timeline/captura de interação. Extraída a classificação existente para src/utils/playerIntegration.ts, preservando regras anteriores e incluindo o wrapper BYSE. Modal e smoke compartilham a mesma função. O smoke anterior montava somente a skin com os defaults, portanto não cobria esse erro de classificação; agora passa os flags reais calculados e aguarda auto-hide antes de recuperar os controles por mouse/toque.

Validações encerradas: npx tsc --noEmit passou;20testes (classificação+BYSE protocolo/rotas) passaram; git diff--check passou. Smoke H264 sintético desktop110/Androidemulado108quadros e CDN BYSE REAL desktop38/Androidemulado37quadros; ambos recuperaram controles após auto-hide, pausaram, avançaram10s e retomaram, zero popups/requests externos. Recuperação sintética de manifesto também passou; expiração real não foi exercitada nesta rodada. Android físico e modal completo com serviços reais não foram automatizados; teste usa skin real com classificador compartilhado do modal e proxy real. Logs /tmp/byse-skin-fix-browser.log,/tmp/byse-skin-fix-real.log,/tmp/byse-skin-fix-tests.log. Todos os processos concluídos. Correção apenas local, nenhum novo push autorizado neste turno; último envio54974d7 não inclui este conserto.

## Retomada após pausa longa: BYSE + revisão MixDrop/StreamTape

Usuário pediu preservar posição após pausa de cerca de1h, antecipando BYSE como nas correções dos outros provedores. BYSE agora registra posição pausada/seek, intercepta PLAY/TOGGLE após3min e renova antes de reproduzir. Guarda posição independentemente do relógio transitório do vídeo, define initialSeek na nova mídia, não publica zeros durante renovação, serializa pedidos e respeita pausa durante resolução. Nova pausa longa inicia nova tentativa limitada. Modal não faz reload concorrente de BYSE após a retomada; wrapper gerencia a renovação. MixDrop retry forçado pós-pausa agora pula descoberta de cópia alternativa e tenta o mesmo provedor primeiro; antes a rota de pool precedia o retry explícito. StreamTape já inclui t da posição no reload e recuperação própria; preservados caminhos existentes.

Validações concluídas: npx tsc--noEmit passou;103testes unitários/HTTP/protocolo/recuperação de BYSE, MixDrop e StreamTape passaram. Novo teste VM com1h de relógio simulado, posição612, relógio da mídia zerando durante renovação, PLAY duplicado e PAUSE enquanto resolve confirma retomada612 e intenção de pausa. Smoke Chromium sintético e CDN BYSE REAL desktop/Androidemulado passaram com1h SIMULADA no relógio do iframe: renovação real, pausa/seek/retomada e posição preservada (~11.45s no trecho real),265quadros por perfil, zero popups/requests externos no navegador. Não equivale a1h real de espera nem vencimento natural observado. Logs /tmp/byse-long-pause-real.log,/tmp/byse-long-pause-browser.log,/tmp/pause-final-regressions.log. Sem aparelho físico ou novo teste CDN real MixDrop/StreamTape nesta rodada (regressões automatizadas existentes executadas). Todos os testes/processos desta rodada encerrados; git diff--check passou. Correção da skin anterior e retomada continuam locais, nenhum novo push autorizado/realizado.

## Envio das correções de skin e pausa autorizado

Usuário autorizou explicitamente novo envio. Lote inclui classificação integrada BYSE, recuperação de controles, renovação após pausa longa com posição preservada, retry MixDrop no mesmo provedor, testes e versão Android49/1.4.17. Limites600req/min preservados. TypeScript e103testes já passaram; smoke de CDN real/relógio1h simulado desktop e Android emulado concluído. Estado de deploy depende do Actions.

## BYSE: comparação de fontes e prioridade principal

Usuário pediu mesma comparação Encontrei/Vizer de StreamTape/MixDrop e tornar BYSE principal. Integrado createMediaSourcePool com adapter BYSE em server/services/byse/sources.ts: resolução+sondagem de prefixo HLS, latência, falhas recentes, conexões ativas por arquivo/worker, deduplicação de IDs, prioridade PT-BR, cache30s/5s e admissão6. Sondagem35s compatível com PoW, prazo total da rota45s. Redirects restritos; prova de manifesto não garante banda/segmentos. Tickets incluem fileId cifrado/autenticado para métricas de segmentos; tickets anteriores aceitos, representação base64url não canônica rejeitada. Recuperação exclui cópia atual primeiro, se nenhuma alternativa funcionar renova mesma cópia antes do fallback de provedor; fileId corrente atualizado após troca. Controles/tempo de pausa preservados. BYSE colocado no início da lista e padrão de novos acessos; servidor explícito/preferência salva e admin blocks respeitados. Corrigida correspondência entre chave selecionada e URL nos acessos diretos MixDrop legados. Sem redistribuição durante reprodução saudável nem consulta à carga privada/global da CDN.

TypeScript passou e64testes direcionados passaram, incluindo novos testes de pool (velocidade, ativos, PT-BR, exclusões, dedup, refresh, redirects, prazo) e prioridade inicial. Smoke real CDN BYSE desktop265/Androidemulado264quadros com pausa/seek/retomada1h simulada e zero popups/requests externos. Comparação de duas fontes com latências distintas foi testada com respostas controladas; CDN real exercitou arquivo real único, sem afirmar benchmark de duas cópias reais. Após ajuste de fileId dinâmico na renovação, smoke sintético final passou desktop/Androidemulado também. Logs /tmp/byse-comparison-final.log,/tmp/byse-balanced-real.log,/tmp/byse-balanced-synthetic.log. Todos os testes concluídos. Nenhum push/deploy autorizado para este lote; apenas local.

## Revisão externa: ECDSA DER versus raw

Observação externa confirmou inconsistência entre comentário raw e implementação crypto.sign DER; teste unitário crypto.verify DER sozinho não demonstra compatibilidade upstream. Reexecutado teste REAL em sessões/challenges independentes contra n1mwq.org, com saída sanitizada e sucesso exigindo token E device_id: DER71bytes HTTP200, rawP1363 64bytes HTTP200, DER/base64plain71bytes HTTP200. Script temporário /tmp/byse-ecdsa-live-check.cjs adaptado do teste fornecido, sem imprimir tokens/device/signatures. Não comprovada hipótese de upstream aceitar apenasraw; provedor aceitou ambos nesta rodada. Corrigido comentário de core.ts para documentar DER realmente utilizado, sem mudar assinatura já validada na reprodução real. Teste local não substitui prova remota e resultado não garante contrato futuro. Teste encerrado, nenhum push realizado.

## Auditoria móvel solicitada pelo usuário

Executado Lighthouse12.8.2 contra produção, duas sessões novas mobile/CPU4x/rede simulada padrão:56/100 em ambas, compatível com55 do PageSpeed apresentado. FCP~9,6s/LCP~11s simulados, TBT0,CLS0,total1712KiB. CSS principal~136KiB bloqueante (~700ms economia); Firebase~902KB e JSprincipal~633KB; economia estimada de compressão1210KiB e JSnão utilizado949KiB (estimativas sobrepostas). Tela auditada é login sem autenticação, não APK/player. TLS do proxy do ambiente exigiu exceção no Chromium de teste após primeira tentativa abortada; não inferir certificado público inválido nem nota de segurança. Resultados e limitações em /workspace/performance-reports/resumo-mobile.md, relatórios válidos mobile-performance-{1,2}.report.html/json. Todos os processos encerraram com sucesso nas duas medições válidas; nenhuma alteração funcional/deploy nesta tarefa. Lote BYSE anterior permanece local e pendente de autorização de envio.

## Skeletons complementares e falha recuperável de carregamento

Usuário autorizou executar abordagem de placeholders discutida após auditoria móvel. Adicionado LoadingStates.tsx: PageLoading (hero/cards), PlayerLoading com Fechar/Escape, DialogLoading, estados acessíveis e animação respeitando reduced-motion. App.tsx usa skeleton no Suspense de páginas; VOD, TV, webhook e notificações têm Suspense separados, impedindo que carregar uma janela esconda o player já aberto. Retirado fallbacknull do grupo de modais. Substituído lazyWithRetry antigo (reload automático de app/limpeza de caches) por boundary local com Tentar novamente e Voltar quando houver callback, recriação de React.lazy por tentativa, prazo30s e preservação de estado externo. Primeira identidade lazy fica fora da árvore suspensa: teste detectou loop de imports quando useMemo dentro de componente ainda não montado era descartado pelo React; corrigido e repetido com sucesso. Não desativado AppErrorBoundary global para erros não relacionados.

index.html inclui shell leve com CSS inline escopado, mensagem de preparo, retry manual se módulo falhar ou demorar15s, limpeza do observador/timer ao React substituir o shell e aviso noscript. Isso cobre espera de JavaScript; CSS principal ainda pode bloquear primeiro paint, sem alegação de compressão ou ganho de nota nesta etapa. Não são dados falsos de catálogo, nem substituição de autenticação.

Validações encerradas: TypeScript passou; build Vite final em /tmp/play-infinity-loading-build passou. Manual reproduzível scripts/test-loading-browser.cjs com Playwright-core/Chromium: desktop e celular390x844 confirmaram shell sem JS principal, erro de chunk503, retry preservando input externo sem reload, fechamento de player enquanto import pendente, timeout com relógio controlado e reduced-motion. Primeiro teste falhou no loop de import citado e segundo passou após correção; relógio do teste instalado antes de iniciar timeout. Logs finais /tmp/loading-browser-fixed.log e /tmp/loading-build-final.log. Teste usa componentes reais em fixture; não login autenticado nem aparelho físico. git diff--check passou. Todos os processos de validação encerrados. Nenhum push/deploy realizado. Lote BYSE/comparação anterior preservado no workspace.

## Teste de carga BYSE em produção autorizado

Implementados scripts/test-byse-load.cjs e sample-byse-pm2.cjs. Executadas rajadas reais limitadas na VPS releasebdbf8e2, comrefresh1 e IDs distintos do catálogo (não cacheglobal estritamente frio: attest/sessão/inflight preservados). GrupoA8:3resolveram,5falhas502,p5030,265s,p9931,953s,1/8decodificouquadros. GrupoB8outrosIDs:2resolveram,6falhas502,p5030,569s,p9932,070s,2/8decodificaram. Sem429/timeoutcliente;502não distingue filaocupada/PoW/upstream/timeoutsinternos.16nãofoiexecutado:interrupção automática de escalada por menos50%sucesso com8. Dois IDsfalhos do grupoA resolveram depois isolados em10,494s e7,315s. Saúde respondeu200. Primeiro ensaio de navegador interrompido para ajusteTLSlocal; não usar suas métricas e não afirmar ausência de aquecimento/interferência transitória. Todos os ensaios/processos encerrados ao final.

CPU/RAM não coletados por falta de acesso SSH/adminautenticado nesta sessão; endpoint administrativo protegido não contornado. Coletor PM2somenteleitura pronto e sintaxevalidada, ainda não executado naVPS. Decodificação HLS feita em Chromium simples com hls.jsproxy, não episódio completo/skin/aparelho físico. P99com8observações é máximonearest-rank, não p99populacional. Resultado não homologa atualprodução para rajadas8, mas não identifica causalidade nem justifica subirheap/cluster ou migrarPoWsemtelemetria. ComparaçãoBYSElocal anterior NÃO está na versão medida. Relatório detalhado /workspace/performance-reports/byse-load-summary.md e JSONs adjacentes, semtickets/URLsassinadas. Sem alterações de configuração, restart, push ou deploy. Lotes anteriores preservados.

## Seleção inicial rápida por disponibilidade — implementada localmente

Usuário autorizou implementar consulta por conteúdo antes de percorrer servidores. Criados src/services/playbackStartup.ts e /api/playback-candidates: snapshot dos dois catálogos para filme/episódio exato, presença/áudio e indicação de cache quente BYSE. Descoberta live playerData reaproveita a mesma resposta para atualizar BYSE/MixDrop/StreamTape em memória, com áudio por provedor; chamada compartilhada30s, admissão4, resposta limitada800ms. Ausência não é blacklist permanente. Cliente1200msmetadata+até4500msprobe, máximo2provedores em paralelo; primeira mídia confirmada abre. BYSE frio não faz PoW no healthcheck; BYSEquente usa ticket cifrado vinculado à identidade para iframe preparado e reaproveitamento entrePM2, sem coldresolve acidental no outro worker.

Modal integrado na abertura, episódio e temporada. Fallback inicial tenta apenas alternativas do plano; uma expansão/redescoberta extra de até2provedores permite recuperar catálogo desatualizado, depois mostra erro em vez de varrer tudo. Watchdog8s por tentativa inicial incluindo preparo, confirmado por avanço de relógio e não só metadados; não é garantia de8s total comfallbacks. Mensagens duplicadas não repetem tentativas já marcadas; estado não é limpo só no loadedmetadata. Seleção manual sai do plano automático. Sondagem pesada periódica removida durante reprodução; recuperações internas/posição de pausa mantidas. Épocas/AbortController/identidade impedem retorno de episódios anteriores. BYSE principal continua preferência de prontidão, não força espera por PoW quando há outro provedor pronto.

Validações encerradas: TypeScript passou; build Vite final /tmp/play-infinity-startup-build-final passou;185testes da suíte de workflow passaram (/tmp/startup-full-workflow.log). Teste adicional (13testes do arquivo vizer passaram) confirmou atualização de hints de três provedores numa resposta live e preservação de áudio (/tmp/startup-live-hints-tests.log). Testes específicos de93casos também passaram anteriormente. Browser scripts/test-startup-browser.cjs usa coordenador/NetflixPlayerSkin reais com H264 gerado e respostas controladas: desktop e celular390x844 passaram cenário sóservidores3/4, máximo2probes, quadrosdecodificados, pausa/retomada e cancelamento de episódio antigo em mudança rápida. Logs /tmp/startup-browser-final.log e /tmp/startup-build-final.log. Testes de ticket preparado rejeitam outra identidade e comprovam que resolver não é chamado. Medição de ganho de latência naVPS/carga ainda NÃO realizada com este lote; não é novo teste deCDN real ou aparelho físico. Todos os processos concluídos; git diff--check passou. Nenhum push/deploy neste turno, lotes prévios de comparaçãoBYSE/skeletons/carga preservados.

## Publicação do lote pendente autorizada

Usuário autorizou explicitamente envio das alterações pendentes ao GitHub; proposta futura de reorganização em API não será implementada neste lote. Inclui startup por disponibilidade, comparação BYSE, tickets preparados, skeletons/recuperação de chunks e scripts de carga/telemetria/testes. Android50/1.4.18 preparado para nova compilação. TypeScript/build e testes anteriores passaram; execução real de carga/ganho após este deploy ainda não medida. Resultado do envio/Actions deve ser verificado, sem presumir ativação da VPS.

## Correção de fallback prematuro — Harry Potter e o Cálice de Fogo

Usuário trouxe logs do releasea70767a: MixDrop reiniciado por chegada de fileId e watchdog só3,065s, StreamTape502 e BYSE8s/fallback/502. Causa comprovada: orçamento8s incluía sondagem anterior de~5s; lookup tardio também mudava query da rota adaptativa e recriava iframe sem necessidade. Corrigidos: relógio inicia na conexão do iframe com8scompletos (rerender não renova prazo, novo frame sim); guard ignora chegada de fileId para /api/md-stream comid de conteúdo, para frame ausente e reprodução em andamento. Retirado deadline antigo do plano. BYSE frio como última fonte sem alternativa/preparação tem45slimitados, compatíveis com sua resolução, em vez de8s; BYSE preparado/com alternativa mantém8s. Não foi corrigido nem atribuída causa específica aos502upstream com estes logs.

Checagem real naVPS: presença dos três hosters para movie674; BYSE resolveu fileIdxriiku9vsffa em8,41s; consulta posterior do manifesto proxy retornou200/#EXTM3U em5,33s total. StreamTape resolver retornou502 em0,58s. Não afirmar episódio integral decodificado nesta rodada nem que os502intermitentes desapareceram. Validações locais finais: TypeScript passou;66testes direcionados passaram; buildVite /tmp/play-infinity-startup-fix-build passou; git diff--check passou. Testes reproduzem consulta consumindo5s sem reduzir janela do novoiframe, guards de recarga e prazo da última fonteBYSE. Logs /tmp/startup-premature-fix-tests-final.log e /tmp/startup-premature-fix-build-final.log. Todos os processos concluídos. Correção apenas local; nenhum push autorizado neste turno, última produção permanecea70767a.

## Envio autorizado da correção de prazo inicial

Usuário autorizou explicitamente novo envio. Lote: relógio por iframe, bloqueio de recarga redundante MixDrop, prazo limitado da última fonte BYSE e testes/documentação. Android51/1.4.19. TypeScript/build e66testes direcionados passaram antes do envio; status do Actions e ativação devem ser verificados separadamente.
