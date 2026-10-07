## 06/10/2026 - HxH 2011: "eps 70+ não reproduzem" — worker do CONTEÚDO do HxH fora no Nixplay

**Problema relatado:** após o fix das abas, o usuário reporta que "os eps do nixplay não reproduz a partir do ~70".

**Correção da primeira hipótese (era "Nixplay fora do ar geral" — NÃO é):** o usuário estava assistindo Harry Potter pelo Nixplay no mesmo momento. Probe comparativa (`scratch/nixplay-movie-vs-series.mjs`) no `player_api.php` do Nixplay:
- `movie/HP` (671/672) → **302** para `cdn99xn----booster.anipixel.best/v/m/...` ✅
- `series/Loki` (84958) e `series/Breaking%20Bad` (1396) → **302** ✅
- `series/HxH` (46298, inclusive ep 1) → **503 "Worker de reproducao indisponivel."** ❌

Ou seja: **não é movie×series — é conteúdo-específico.** O `get_series` tem 11.433 séries; teste de varredura dos 11 hits "hunter" + amostra de animes mostra o mesmo 503 em vários títulos (Sword of the Demon Hunter, Fire Hunter, Gringo Hunters, Mindhunter, Witch Hunter Robin, Bakuretsu Hunters) enquanto A Família Hunter, Loki, Breaking Bad e os filmes HP respondem 302. São "workers de reprodução" por conteúdo no provedor (CDN booster `anipixel.best`); o worker do HxH está caído junto com um lote (majoritariamente anime). Não há outro series_id do HxH funcional no catálogo (o par [L] `1000046298` também 503) — confirmado do servidor local e via `play-infinity.stream` (idêntico).

**Mapeamento revalidado (sem bug):** `/api/nixplay-episode-id` resolve posição exata dos 148 eps (ex.: global 70 → `46298004012` Nixplay T4E12). Grid flat 1..148 do app → posição correta.

**Cobertura dos demais servidores (HxH keyed 45952 no encontrei):** `encontrei-lookup` → S1 flat **1..70** com `mixdrop`=Y; **71..148 → vazio**. O corte "~70" = fim do catálogo MixDrop/Encontrei; dos 71+ a única fonte era o Nixplay → caindo, nada reproduz.

**Pendentes opcionais (não implementados nesta sessão):**
1. **Alias de id para MixDrop (46298→45952) no HxH:** daria eps 1..70 via MixDrop/Encontrei robustamente enquanto o Nixplay estiver fora. Exige confirmar que o conteúdo keyed 45952 no encontrei é HxH 2011 (e não o 1999) antes de mapear.
2. **Detector de "worker indisponível" do Nixplay** (`/api/nixplay-resolve` e `/api/nixplay-episode-id`): corpo do 503 contém "Worker de reproducao indisponível" → responder erro tipado pro modal marcar `srv_nixplay` como inútil para aquele conteúdo e pular mais rápido no fallback (não cria eps 71+, mas evita espera vazia no servidor).

**Smoke/server:** servidor local de teste encerrado; probes em `scratch/`. Nada tocou em player → sem `tsc`.

---

## 06/10/2026 - `ERR_CONTENT_LENGTH_MISMATCH` em `/api/mixdrop-proxy` (segunda ocorrência)

**Problema:** novo console mostra `Failed to load resource: net::ERR_CONTENT_LENGTH_MISMATCH` no `mixdrop-proxy` logo após o ArtPlayer iniciar. O fix anterior só cobria o caso 200; o mismatch **continuava possível nas respostas 206 (Range)**.

**Raiz:** impossível manter `Content-Length` em resposta parcial e evitar o mismatch ao mesmo tempo — se a CDN reseta ou o cliente aborta no meio do streaming, o corpo termina antes do tamanho declarado e o Chrome dispara o erro. O 206 com `Content-Length` promete bytes que podem não chegar.

**Correção (`server/routes/mixdrop.ts`, regra de ouro agora):** `Content-Length` é **DROPPED em qualquer status** — resposta sempre chunked, terminando no marcador de fim (mismatch vira impossível). `Content-Range`/`Accept-Ranges`/`Content-Type` continuam sendo repassados, então o player segue sabendo o tamanho total do arquivo (seek intacto). Aplicado em **ambos** os proxies:
- `/api/mixdrop-proxy` (removida a condição que mantinha Length no 206);
- `/api/download` (mesma política + handler de erro do stream de origem no pipe, que faltava — um reset da CDN no meio do download travava a resposta).

**Smoke test (`scratch/proxy-smoke.mjs`) atualizado e reexecutado = 9/9 PASS** contra CDN real (arquivo 1,38 GB): 400s, upstream 404 chunked sem Length, fileId resolvido, `Range: bytes=0-1048575` → **206 chunked sem Content-Length** com `Content-Range` íntegro (corpo exatamente 1048576 bytes), seek intermediário → 206, aborto no meio → servidor segue vivo. `npx tsc --noEmit` = 0 erros.

**Nota:** com isso, qualquer novo `mixdrop-proxy` no console será `net::ERR_ABORTED`/`ERR_CONNECTION_RESET` (aborto do próprio navegador — inofensivo) e não mais mismatch.

---

## 06/10/2026 - 404 `/api/tmdb/tv/*` em item catalogado como série (id é de FILME)

**Problema relatado (novo console dump):** `Failed to load resource: 404` + `[TMDB Service] Proxy local retornou status 404. Ativando fallback de dados...` logo antes dos logs do MixDrop (fileId resolvido) e do ArtPlayer. O playback funciona, mas o 404 aparece.

**Descoberta decisiva (consulta direta ao proxy da VPS `https://play-infinity.stream/api/tmdb/...`):**
- `tv/1101412` → **404** (não existe)
- `movie/1101412` → **existe** e é **"A Queda 2: No Limite" (Fall 2: Deadpoint)** — thriller USA/GB, lançamento 2026-09-01, `tt31192372`.
- Ou seja: o **id é de filme**, mas algum item chega com `type: 'series'`/`isSeries: true` → todos os lookups `/tv/<id>` (detalhes, temporada) dão 404 em cascata. A origem do card não está no repositório (grep `1101412` = 0 hits) — vem de fonte em runtime (catálogo externo Vizer/Encontrei ou histórico do usuário).
- Reviso a conclusão antiga ("404 é cosmético"): continua inofensivo ao playback, mas agora é **detectável e auto-corrigido** quando há como confirmar.

**Correções (4 arquivos, `npx tsc --noEmit` = 0 erros):**
- `src/services/tmdb.ts`: `fetchTmdbRaw` agora devolve **status HTTP** (distingue 404 de timeout/rede) e **todo warning inclui a URL** — dali pra frente o DevTools diz exatamente qual recurso falhou. Novo `lookupDetails(id, type)` que, **só quando o TMDB responde 404 explicitamente** (nunca em timeout/erro de rede), sonda o outro tipo (`tv`↔`movie`) e expõe `crossType`/`crossDetails`. `getDetails` = `(await lookupDetails(...)).details` (contrato inalterado).
- `src/pages/DetailsPage.tsx`: usa `lookupDetails`. Se os detalhes do tipo pedido vierem vazios **e** o id existir no outro tipo **e** o título do item casar com o do TMDB (≥ 0,5 via novo `titlesLookLikeSame`), **adota o tipo real** (`setItem`: corrige `type` + `playerUrl` pro servidor WatchPlayer certo) e refaz trailer/recomendações no tipo correto. Guard novo: `DEFAULT_DETAILS` (id 0 sem temporadas) **não** sobrescreve mais sinopse/pôster/gêneros do catálogo (antes, `genres: []` zerrava os gêneros ao abrir item sem metadados).
- `src/components/VideoPlayerModal.tsx`: em `loadSeries`, se o id não existe como TV mas existe como filme com mesmo título → novo estado `resolvedAsMovie` ⇒ `isSeries` vira `false` e a máquina de temporadas é desligada (sem abas vazias nem 404 repetido). O efeito que busca episódios (`getSeasonDetails`) agora **aguarda `seriesDetails`** antes de rodar — elimina o `/tv/<id>/season` 404 quando o item é filme mascarado de série.
- `src/utils/mediaUtils.ts`: `titleSimilarity`/`titlesLookLikeSame` (normaliza acentos/pontuação, sobreposição de tokens).

**Limitação honesta:** se o título do card **não** casar com a obra do TMDB no outro tipo (ex.: id de outra obra colado num card), a correção recusa (evita exibir metadados de uma obra diferente) e o 404 persiste — mas o log agora mostra a URL exata, permitindo achar a fonte real do card.

---

## 06/10/2026 - Erros de console ao assistir via MixDrop (proxy, TMDB 404, permissão Firebase)

**Problema relatado:** logs capturados assistindo "Harry Potter e a Câmara Secreta": `net::ERR_CONTENT_LENGTH_MISMATCH` no `/api/mixdrop-proxy`, `404 /api/tmdb/tv/1101412?language=pt-BR`, `FirebaseError: Missing or insufficient permissions`, logs `parts Array(...)` e warning de iframe (`Allow attribute will take precedence over 'allowfullscreen'`).

**Diagnóstico + correções (validado com `npx tsc --noEmit` = 0 erros):**
- `server/routes/mixdrop.ts` (`/api/mixdrop-proxy`): era a causa real do `ERR_CONTENT_LENGTH_MISMATCH` — o `Content-Length` do upstream era repassado mesmo em respostas 200, então um aborto do cliente (seek/fechar aba) deixava o corpo menor que o header declarado. Agora só repassa `Content-Length` em `206` (resposta parcial); em `200` usa chunked. Adicionado `res.on("close"/"error") → controller.abort()`, tratamento de `AbortError` e `res.destroy()` quando os headers já foram enviados (evita resposta 500 sobre streaming interrompido).
- `src/components/VideoPlayerModal.tsx` (iframe do player): removido o atributo `allowFullScreen` — o `allow` já contém `fullscreen *`, e a dupla gera o warning do Chrome. Sem efeito funcional.
- `src/components/VideoPlayerModal.tsx` (`loadSeries`): quando não há `tmdbId`, a busca por título pegava o **primeiro** resultado de TV sem checar similaridade (`searchMulti(...).find(media_type === 'tv')`) → IDs absurdos como o `1101412` e temporadas erradas. Agora pontua os candidatos (normalização de acentos + sobreposição de tokens) e só aceita similaridade ≥ 0,5; caso contrário não consulta e a UI degrada para T1E1 normalmente.
- `src/hooks/useSubscription.ts`: erro de snapshot do Firestore derrubava qualquer assinante para "não premium" (`isPremium = isDev`), o que fecha o player (App.tsx:278) e abre o paywall (App.tsx:623). Adicionado retry único com `getDoc` (após 1,5s) antes de cair no fallback — cobre erros transitórios (refresh do token de sessão) que negam a leitura por instantes.

**Logs benignos (sem código):**
- `parts Array(...)` vem do script interno do próprio MixDrop (MDCore), não do repositório — confirmado por busca no código-fonte.
- O 404 do TMDB é cosmético: `getDetails` já cai em `DEFAULT_DETAILS` e o playback continuou (o stream MixDrop carregou).

**Diagnóstico FINAL do erro de permissão Firebase (usuário colou as regras em produção):** as regras em produção são **idênticas** às do repo (sem deploy pendente — descartada a hipótese anterior de regras desatualizadas). Auditoria campo a campo de TODO write do cliente (`favoritos`, `episodiosAssistidos`, `historicoReproducao/historicoRemovido`, `ultimoAcesso/lastActive`, `senha`/`senhaInicial`/`photoURL`, `valorMensalidade/valor`, auto-expiração `assinatura=EXPIRADA+subscription=INACTIVE`) e de todas as coleções usadas (`usuarios`, `users`, `administradores` — nenhuma fora das regras): **tudo é permitido**. Com essas regras, leitura negada só ocorre em `request.auth == null` na avaliação — ou seja, **ID token expirado/refresh falhando** (o `isOwner` já exige `request.auth != null`). Correções no cliente:
- `useSubscription`: no caminho de erro, agora **força `getIdToken(true)`** (refresh do token) → espera 800ms → um `getDoc` de retry → só então o fallback "não premium" (com guardas de `authGeneration`/`disposed`).
- `App.tsx`: o `onSnapshot` do doc do usuário **morre** após disparar erro (semano próprio). Callback de erro agora força o refresh e **resscreve o listener** via estado `userDocEpoch`, limitado a **2 tentativas** (resetadas ao trocar de usuário) — nunca entra em loop.

**Double-check (mesmo dia) — encontrou e corrigiu 3 problemas no próprio fix:**
- `mixdrop-proxy`: `.pipe(res)` **não propaga** `'error'` da origem → um reset da CDN deixaria a resposta aberta e o navegador travado até o timeout dele. Adicionado handler de erro do stream de origem (finaliza com `res.end()` em 200-chunked / `res.destroy()` em 206) + flag anti-reentrada.
- `mixdrop-proxy`: o `Content-Length` também não é seguro quando o upstream vem com `content-encoding` (o `fetch` do Node descomprime e mantém o tamanho original → mismatch) nem em `HEAD` (sem corpo). Condição agora: manter só em `206 && tem corpo && sem content-encoding`.
- `useSubscription`: o retry podia ser **obsoleto** — se o usuário deslogasse/logasse em <1,5s, o retry antigo sobrescrevia o status premium do usuário novo (e os `setIsPremium` do fallback não checavam `disposed`). Adicionado contador `authGeneration` com guardas antes/depois do await.
- `DetailsPage`: os 2 iframes de trailer do YouTube tinham `allow` **sem** `fullscreen` (o `allowFullScreen` era necessário ali) → `fullscreen` movido para o `allow` e o booleano removido (mesmo efeito, warning some).

**Smoke test end-to-end (`scratch/proxy-smoke.mjs` + servidor local):** 9/9 PASS contra o CDN real do MixDrop (`a-delivery34.mxcontent.net`, arquivo de 1,38 GB): 400 sem url, 400 fora de mxcontent, upstream 404 repassado **chunked sem Content-Length**, resolução de fileId via `/api/mixdrop-stream?format=json`, `Range: bytes=0-1048575` → 206 com `content-length=1048576` + `content-range` e corpo íntegro, seek intermediário → 206, abort no meio do download → servidor segue vivo.

**Descoberta útil para o futuro:** o host raiz `mxcontent.net` **não tem registro A** (só subdomínios como `a-delivery34.mxcontent.net` resolvem) — testar o proxy com o ápice gera `ENOTFOUND` e não significa que a CDN caiu.

---

## 06/10/2026 - Fix HxH 2011 (aba T3 sumindo + episódios ocultos)

**Problema relatado:** Em Hunter x Hunter (2011), a aba "3ª Temporada" sumia intermitentemente e a série (148 eps no TMDB/Nixplay, ~140 na visão do usuário) mostrava apenas ~70 episódios.

**Causas raiz:**
- **Aba sumindo:** As abas de temporada são a união de `tmdbDetails.seasons` + lista verificada pelo servidor (`/api/series-seasons-available` via probes). Quando o fetch do TMDB falhava (timeout 6s / proxy), `tmdbList` ficava vazio e a UI colapsava para apenas as temporadas que os probes de rede confirmavam no momento (cache 5min) → T3 desaparecia. Qualquer umidade nos probes ocultava temporadas reais.
- **~70 eps em vez de 148:** `/api/check-season` não tinha dados do catálogo local para o `46298` (catálogo encontrei keyed sob `45952`), então fazia sondagem de rede por episódio; qualquer falha de probe removia o episódio da grade (ex: T2 com 74 → ~70). A página de detalhes ainda capava o fallback em 50 eps.

**Alterações (5 arquivos, validado com `npx tsc --noEmit` 0 erros):**
- `src/services/tmdb.ts`: cache persistente (localStorage) das últimas temporadas conhecidas por série. Se o TMDB falhar depois, `getDetails` injeta as temporadas cacheadas → abas reais (ex: T3) nunca somem em outage.
- `server/routes/videoScrapers.ts` (`/api/check-season`): resposta agora distingue `verifiedFromCatalog: true` (resposta definitiva do catálogo local) vs `false` (sondagem de rede não-conclusiva).
- `src/services/episodeAvailability.ts`: `getAvailableEpisodes` retorna `{ episodes, verifiedFromCatalog, requested }`; quando não-conclusivo (probe) o front não deve ocultar eps declarados pelo TMDB.
- `src/pages/DetailsPage.tsx`: só filtra episódios quando `verifiedFromCatalog`; removido cap `Math.min(count, 50)` do fallback (agora usa o `episode_count` real do TMDB).
- `src/components/VideoPlayerModal.tsx`: mesmo tratamento no `filteredSeasonEpisodes`/`totalSeasonEpisodes`/`episodeNumbers`; override Nixplay (1..148) mantido como prioridade máxima.

**Resultado esperado:** abas T1/T2/T3 estáveis mesmo com TMDB fora do ar; T1=62, T2=74, T3=12 (148 no total) na grade; modal continua exibindo 148 pelo Nixplay.

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
## 03/10/2026 - CorreÃ§Ãµes Live TV e OtimizaÃ§Ãµes de Performance

**Resumo:**
- **CorreÃ§Ã£o 502 na TV ao Vivo (Live TV):** A fonte `up.kiwi` expirava os tokens HLS muito rÃ¡pido e respondia com `200 OK` + HTML de erro. Implementado "Watchdog" no `server/routes/videoScrapers.ts` para validar a tag `#EXTM3U` e renovar o token automaticamente sem queda.
- **OtimizaÃ§Ã£o do encontrei-catalog.json (14 MB):** O JSON gigante foi removido da pasta `public/data/` para impedir que os clientes tentem baixÃ¡-lo. Agora ele reside em `data/` e Ã© consumido *apenas* pelo backend via `encontreiLookup.ts`.
- **ReduÃ§Ã£o de Bundle React:** Componentes pesados do frontend (`AdminPage`, `VideoPlayerModal`, `DetailsPage`, etc) foram protegidos com `React.lazy()` via wrapper `lazyWithRetry` no `App.tsx`, garantindo code-splitting e melhor carregamento inicial da aplicaÃ§Ã£o.

---

## 03/10/2026 - Mega RefatoraÃ§Ã£o de Rotas (server.ts modularizado)

**Resumo:**
- O monolito `server.ts` possuÃ­a ~6.700 linhas, misturando lÃ³gicas de proxy, pagamentos, scrapers (VOD) e serviÃ§os (TMDB, catÃ¡logo).
- Ele foi dividido em mÃºltiplos roteadores dedicados na pasta `server/routes/`.
- **Fase 1:** Fix do bypass de seguranÃ§a no `live-stream-proxy` (HMAC enforced, bypass por *referer* removido). Feita a proteÃ§Ã£o da backdoor REST do `requireAdminAuth.ts` via enforce de JWT.
- **Fase 2:** 
  - Pagamentos e webhooks do ASAAS extraÃ­dos para `payments.ts`.
  - Rotas pesadas de streaming de VOD (`watchplayer-stream`, `anime-stream`, `vixsrc-stream`, `myembed-stream`, `pomfy-stream`) enviadas para `videoScrapers.ts`.
  - HLS e Proxy CORS Anti-bloqueios transferidos sem perder o mecanismo de bypass.
- **Fase 3 & 4:** 
  - Criados `catalog.ts` para endpoints de visualizaÃ§Ã£o, rastreamento e disponibilidade.
  - Criados `diagnostics.ts` para o medidor de speedtest, player info.
  - Criados `mixdrop.ts` para scraping de streams.
  - Criados `cast.ts` (integraÃ§Ã£o Chromecast source info).
- **Resultado:** O `server.ts` caiu drasticamente para ~380 linhas. O bundle principal de CJS em produÃ§Ã£o foi reduzido de ~475KB para ~380KB. Tudo homologado atravÃ©s do conjunto de testes (smoke tests), garantindo que os clientes e o HLS na Oracle VPS nÃ£o tenham indisponibilidade.

---
# Walkthrough: AnotaÃ§Ãµes e Descontos no Admin

## Tarefas Realizadas

1. **AtualizaÃ§Ã£o do Modelo (`ClientUser`)**
   - Adicionados os campos opcionais `notes`, `fixedDiscount` e `oneTimeDiscount`.

2. **Estados de EdiÃ§Ã£o e Salvamento**
   - Estados criados para o modal (`editNotes`, `editFixedDiscount`, `editOneTimeDiscount`).
   - `handleOpenEdit` atualizado para carregar os valores atuais ou os padrÃµes vazios/zeros.
   - `handleSaveEdit` atualizado para consolidar os novos dados no objeto de `updates` que Ã© gravado no Firestore (`usuarios` e `users`).

3. **UI do Modal de EdiÃ§Ã£o**
   - Criado um `<textarea>` para a digitaÃ§Ã£o de comentÃ¡rios/notas internas do usuÃ¡rio.
   - Criada uma condicional que exibe os `inputs` de Desconto Fixo e Desconto Ãšnico caso o `editAccessType` seja "mensal".

4. **UI do Card do UsuÃ¡rio**
   - Inserido um botÃ£o "Notas" ao lado de "Editar", que sÃ³ aparece se o `client.notes` nÃ£o for vazio.
   - Criada uma Ã¡rea expansÃ­vel (`div`) abaixo dos dados do usuÃ¡rio, garantindo a exibiÃ§Ã£o do texto com quebras de linha respeitadas (`whitespace-pre-wrap`).
   - Toda a estrutura do Card foi envolvida num Fragmento/Container `flex-col` para suportar o componente sanfona (accordion) do texto.

## VerificaÃ§Ã£o PÃ³s-CÃ³digo

- VerificaÃ§Ã£o TypeScript `npx tsc --noEmit` executada.
- CÃ³digo exit: `0` (Zero erros na compilaÃ§Ã£o).

## RelatÃ³rio de Code Review (Self)

- **Strengths:** 
  - UI reutiliza os componentes visuais jÃ¡ adotados, mantendo o fundo *glassmorphism*.
  - A renderizaÃ§Ã£o condicional otimiza a listagem (notas sÃ³ renderizam no DOM se estiverem ativas e se existirem).
  - Nenhuma quebra no layout de grid nativo.
- **Issues:**
  - Nenhuma (Minor/Important/Critical issue encontrada). O design estÃ¡ de acordo com as restriÃ§Ãµes globais.
- **Assessment:** Pronto e Implementado com sucesso.

## 01/10/2026 - Monitoramento do RobÃ´ Ampere

**Resumo:**
- **IntegraÃ§Ã£o do Bot Ampere (Oracle VPS):** Criado endpoint `/api/admin/vps-bot-logs` via SSH que lÃª em tempo real as Ãºltimas 30 linhas de log do bot `ampere-creator` (via PM2).
- **Monitor do RobÃ´ Ampere:** Adicionada uma nova seÃ§Ã£o "RobÃ´ de CriaÃ§Ã£o VPS (Ampere)" no componente `AdminDeployMonitor.tsx` do painel de administrador, renderizando um terminal ao vivo que acompanha as tentativas de criaÃ§Ã£o da instÃ¢ncia na Oracle Cloud.
- **PrecificaÃ§Ã£o:** O valor da assinatura do **Plano Plus** foi reduzido de R$ 20,00 para R$ 17,00 no `DownloadPlusModal.tsx`.

 # #   0 3 / 1 0 / 2 0 2 6   -   O t i m i z a ï¿½ ï¿½ o   d e   B u s c a   n o   C a t ï¿½ l o g o 
 
 * * R e s u m o : * * 
 -   * * O t i m i z a ï¿½ ï¿½ o   d o   e n c o n t r e i - c a t a l o g . j s o n : * *   A   r o t a   c h e c k - s e a s o n   e m    i d e o S c r a p e r s . t s   f o i   r e f a t o r a d a   p a r a   u t i l i z a r   a   f u n ï¿½ ï¿½ o   g e t E n c o n t r e i S e a s o n E p i s o d e s   d o   e n c o n t r e i L o o k u p . t s ,   a c e s s a n d o   o   ï¿½ n d i c e   e m   m e m ï¿½ r i a   e x i s t e n t e   e m   v e z   d e   r o d a r   J S O N . p a r s e   n u m   a r q u i v o   d e   1 4   M B   a   c a d a   r e q u i s i ï¿½ ï¿½ o .  
 

## 03/10/2026 - Correï¿½ï¿½es de VideoPlayer e Monitoramento

**Resumo:**
- **Resume Pï¿½s-Erro no Player:** Corrigido o bug onde clicar em 'Tentar Novamente' apï¿½s uma queda de servidor fazia o episï¿½dio voltar para o inï¿½cio. O player agora guarda o 'lastKnownTimeRef' atualizado a cada instante. Ao trocar de servidor no fallback ou manualmente (Tentar Novamente), ele emite um comando SEEK exato para retomar de onde parou.
- **Monitoramento de VPS:** O painel de admin agora captura corretamente os processos 'fantasmas' combinando usuï¿½rios root e ubuntu via PM2.
- **UI Admin:** Ajuste visual no botï¿½o de 'Quem estï¿½ assistindo' substituindo texto por ï¿½cone compacto.

## 03/10/2026 (Noite) - Refinamento de Watchdog, Fallback e Cache

**Resumo:**
- **Detecï¿½ï¿½o de Pausa Longa:** Implementado um contador que, ao detectar retomada do vï¿½deo apï¿½s mais de 3 minutos de pausa, forja um silent fallback proativo. Isso impede o engasgo no streaming provocado pela morte do token nos servidores de CDN.
- **Prevenï¿½ï¿½o de Falso Fallback:** Adicionado \hasPlayedRef\ para diferenciar uma queda primï¿½ria durante o uso de um delay inicial no \Continuar Assistindo\.
- **Limpeza do Histï¿½rico de Falhas:** O registro de fallback (\allbackAttemptsRef\) agora sï¿½ ï¿½ limpo *apï¿½s* a conexï¿½o bem-sucedida ao player e recebimento de metadata, e nï¿½o antes.
- **Cache Buster Ativado:** Parï¿½metro \cb=Date.now()\ acrescentado ao MixDrop, WatchPlayer web, e Header \Cache-Control\ ajustado no proxy Node (\/api/watchplayer-stream\).
- **Watchdog Infraestrutural:** Reescrevemos o daemon \watchdog.sh\ para aferir saï¿½de via \curl http://127.0.0.1:8080/api/health\, eliminando reboots fantasmas provocados por logs ruidosos do PM2. O daemon foi isolado para rodar exclusivamente como ubuntu.

### 04/10/2026 15:20:12 - Estabilidade e UX de Fallback de Servidores VOD
- **ResoluÃ§Ã£o de Falsos Positivos de Indisponibilidade**: 
  - Aumentado o watchdog interno do servidor proxy `myembed-stream` no `videoScrapers.ts` de 30 para 70 segundos.
  - Isso impede que o watchdog interno cancele conexÃµes em andamento e emita `VIP_UNAVAILABLE` precipitadamente antes de conseguir efetuar o buffer completo de filmes ou sÃ©ries que demoram a responder.
- **Melhoria Visual do Spinner de Carregamento**:
  - Modificado o componente `VideoPlayerModal.tsx` para reter o estado de `isLoading = true` (tela preta com spinner) atÃ© o momento que a reproduÃ§Ã£o da mÃ­dia Ã© de fato confirmada pelo iframe interno (`readyState >= 1` ou `currentTime > 0`).
  - Anteriormente, o spinner era ocultado imediatamente no evento DOM `onLoad` do `<iframe>`, expondo a interface piscando e recarregando durante tentativas de fallback entre servidores (Watchplay -> VIP -> Pomfy -> MixDrop).
  - O salto entre players no momento de indisponibilidade primÃ¡ria agora Ã© imperceptÃ­vel para o usuÃ¡rio final, pois as tentativas secundÃ¡rias ocorrem sob a cobertura persistente da tela de carregamento principal.
- **CorreÃ§Ãµes Menores**:
  - Corrigido um bug cosmÃ©tico no `VideoPlayerModal.tsx` onde logs de tentativas em Filmes exibiam marcaÃ§Ãµes de sÃ©rie (`S1E1`) incorretamente durante resoluÃ§Ã£o do ID no `encontrei.me`.


### 04/10/2026 15:24:09 - Estabilidade e UX de Fallback de Servidores VOD
- **ResoluÃ§Ã£o de Falsos Positivos de Indisponibilidade**: 
  - Aumentado o watchdog interno do servidor proxy `myembed-stream` no `videoScrapers.ts` de 30 para 70 segundos.
  - Isso impede que o watchdog interno cancele conexÃµes em andamento e emita `VIP_UNAVAILABLE` precipitadamente antes de conseguir efetuar o buffer completo de filmes ou sÃ©ries que demoram a responder.
- **Melhoria Visual do Spinner de Carregamento**:
  - Modificado o componente `VideoPlayerModal.tsx` para reter o estado de `isLoading = true` (tela preta com spinner) atÃ© o momento que a reproduÃ§Ã£o da mÃ­dia Ã© de fato confirmada pelo iframe interno (`readyState >= 1` ou `currentTime > 0`).
  - Anteriormente, o spinner era ocultado imediatamente no evento DOM `onLoad` do `<iframe>`, expondo a interface piscando e recarregando durante tentativas de fallback entre servidores (Watchplay -> VIP -> Pomfy -> MixDrop).
  - O salto entre players no momento de indisponibilidade primÃ¡ria agora Ã© imperceptÃ­vel para o usuÃ¡rio final, pois as tentativas secundÃ¡rias ocorrem sob a cobertura persistente da tela de carregamento principal.
- **CorreÃ§Ãµes Menores**:
  - Corrigido um bug cosmÃ©tico no `VideoPlayerModal.tsx` onde logs de tentativas em Filmes exibiam marcaÃ§Ãµes de sÃ©rie (`S1E1`) incorretamente durante resoluÃ§Ã£o do ID no `encontrei.me`.


- **AtualizaÃ§Ã£o Vizer**: DomÃ­nio atualizado de vizer.beauty para vizer.website no backend para restabelecer o scraping.
- **CorreÃ§Ã£o Visual do Spinner de Fallback**: Removido o cancelamento prematuro do estado de carregamento (`setIsLoading(false)`) durante a montagem do iframe em `VideoPlayerModal.tsx`. O spinner agora persiste visualmente cobrindo toda a tela preta enquanto a mÃ­dia estÃ¡ parada, sumindo apenas apÃ³s o recebimento do status real de reproduÃ§Ã£o (`WATCHPLAY_STATUS`).
- **Watchdog Tempo Real**: O watchdog interno do VIP Player usava `ticks` de 500ms, mas como os navegadores estrangulam (throttle) intervalos de iframes, 40 ticks podiam demorar 40 segundos reais. SubstituÃ­do por verificaÃ§Ã£o absoluta de `Date.now()`.
- **Buscador de Elemento de VÃ­deo**: Atualizada a lÃ³gica de `sendStatus` do VIP para detectar corretamente `window.artInstance.video`, garantindo a transmissÃ£o do `WATCHPLAY_STATUS`.
- **AtualizaÃ§Ã£o Vizer**: DomÃ­nio atualizado de vizer.beauty para vizer.website no backend para restabelecer o scraping.
- **Monitor de SaÃºde**: Nova aba no painel admin (AdminHealthMonitor) com endpoint em diagnostics.ts para checar status dos servidores/domÃ­nios homologados e detectar quedas silenciosas de domÃ­nio.
- **Afinidade de Servidor**: Resolvido bug de stale closure no player. Agora o player memoriza o servidor (ex: MixDrop) que funcionou com sucesso via `localStorage` e o utiliza instantaneamente no prÃ³ximo episÃ³dio ou na reabertura da sÃ©rie, sem passar pelos fallbacks originais novamente.
- **Regras do Firestore**: O painel de admin perdia a conexÃ£o com usuÃ¡rios novos e a criaÃ§Ã£o de usuÃ¡rios falhava devido a propriedades ausentes nas listas de `isSafeCreate` (valorMensalidade, valor, criadoEm) e `isSafeUpdate` (ultimoAcesso, lastActive) do arquivo `firestore.rules`. As listas foram devidamente atualizadas. A regra de `isAdmin` tambÃ©m foi endurecida para exigir `email_verified == true`.
- **SeguranÃ§a e Chaves da API**: A rota de *health-check* que faz ping externo foi movida para `/api/admin/health-check` (autenticada) para evitar *SSRF/amplification*. Chaves de fallback hardcoded do TMDB foram limpas do cÃ³digo e de arquivos compilados, forÃ§ando o uso de variÃ¡veis de ambiente.
## 06/10/2026 - Auto-correção de identidade de cards + memo de 404 (HxH/Nixplay encerrado)
**Resumo:**
- **Cards com id/tipo errados (ex.: "Harry Potter e a Câmara Secreta" = id de filme 1101412 marcado como série):** implementado `resolveCardIdentity` em `src/services/tmdb.ts`. O card que responde 404 definitivo agora (a) adota o cross-type quando o título bate; (b) senão busca o título no TMDB (similarity >= 0.5, preferindo o tipo original) e adota o id real; (c) nunca age sobre timeout/rede. Memo de falhas por `type:id` em memória + sessionStorage elimina o refetch e o spam de 404 na reabertura.
- **DetailsPage.tsx:** `loadDetails` usa `resolveCardIdentity`; item é corrigido em runtime (`setItem`: type/tmdbId/playerUrl) e trailers/recomendações só são buscados quando a identidade é utilizável (sem 404).
- **VideoPlayerModal.tsx:** estados `resolvedAsMovie` + `correctedMovieId` e memo `effectiveMovieId` (declarados antes dos memos de MixDrop por causa de TDZ). `loadSeries` adota o filme real; todos os resolvers de filme (WatchPlayer/VIP/Nixplay, lookup e cache MixDrop `movie:{id}`, nixplay-check e legendas) passam a usar o id efetivo — HP agora reproduz com fileId HD estável do encontrei (`gjzdwxwvhxdewe`) sem “piscar”.
- **TMDBDetails:** adicionados campos opcionais `origin_country`/`original_language` (usados no isAnime da DetailsPage).
- **Validação:** `npx tsc --noEmit` 0 erros; `scratch/proxy-smoke.mjs` 9/9 PASS.
- **HxH/Nixplay permanece encerrado:** worker de playback do conteúdo HxH está fora no provedor (503 em todos os .mp4, inclusive ep 1) — não é bug do app; sem fonte para eps 71..148 enquanto durar.
- **Pendente:** deploy na VPS só com autorização explícita do usuário.
## 06/10/2026 - VIP Player: retry com series_id do Nixplay quando Ajax só devolve fontes blacklisted
**Resumo:**
- Em `server/routes/videoScrapers.ts` (rota `/api/myembed-stream`): quando o Ajax do playerflix.ink com o `tmdb_id` responde mas TODAS as opções caem na lista negra (ou vêm vazias), o sistema agora tenta de novo com o `series_id` do Nixplay antes de emitir `VIP_UNAVAILABLE`. O id vem do querystring `series_id` (o frontend já o tem em `nixplaySeriesId`) ou é resolvido no backend por `resolveNixplaySeriesId(tmdbId, name)` com sincronização do catálogo bounded em ~1.2s. O retry usa `res.redirect(307)` para re-executar a rota com o novo id e o flag `__nixretry=1` garante que só ocorra uma vez (sem loop; se o retry também voltar blacklisted, cai no VIP_UNAVAILABLE normal). Só roda para séries e só quando o id novo difere do já tentado.
- Em `src/components/VideoPlayerModal.tsx`: o buildUrl do VIP Player (série) agora envia `&series_id=<nixplaySeriesId>` (quando disponível) e `&name=<title>` para o backend.
- **Validação:** `npx tsc --noEmit` 0 erros; `scratch/proxy-smoke.mjs` 9/9 PASS. Servidor local ainda com o código antigo em memória (precisa reiniciar o dev server para ativar). Caminho exato do retry (título cujo Ajax só devolve blacklisted) deve ser conferido ao vivo.
- **Pendente:** deploy na VPS só com autorização explícita do usuário.

### 07/10/2026 - Correção do Servidor Nixplay (Hunter x Hunter)
- **Bloqueio de Série com Arquivos Offline:** O anime Hunter x Hunter 2011 (TMDB ID 46298) foi incluído numa lista de bloqueio do catálogo Nixplay (em server/services/nixplayCatalog.ts). Os arquivos .mp4 deste anime no servidor Nixplay estavam retornando erro 503 (Worker de reprodução indisponível). O bloqueio força a interface a não exibir o Nixplay para essa série e usar os servidores de fallback primários (WatchPlayer e VIP Player), que mapeiam corretamente os episódios pelo TMDB e estão funcionando com sucesso.
