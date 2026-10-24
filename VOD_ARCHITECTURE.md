# Arquitetura e Funcionamento do Sistema de VOD (Filmes, Séries e Animes)

Este documento detalha o funcionamento, decisões arquiteturais e proteções implementadas no fluxo de reprodução de **Vídeo Sob Demanda (VOD)** da aplicação **Play Infinity**.

---

## 1. Visão Geral e Diferença Estrutural (VOD vs. Live TV)

A aplicação possui dois ecossistemas distintos de reprodução:

| Característica | TV ao Vivo (Live TV) | VOD (Filmes, Séries e Animes) |
| :--- | :--- | :--- |
| **Componente Principal** | `LivePlayerModal.tsx` | `VideoPlayerModal.tsx` + `NetflixPlayerSkin.tsx` |
| **Reprodução de Mídia** | Local (`new Hls()`, `<video>` nativo) | Iframe isolado com player HTML5 / Artplayer |
| **Tráfego de Dados** | VPS Dedicada Oracle (`play-infinity.stream`) | **Direto da CDN de origem para o navegador do cliente** |
| **Consumo de Banda** | Proxy dedicado para evitar limite do Render | **Zero tráfego de vídeo pelo servidor principal** |
| **Controle de Interface** | Controles nativos da aplicação | Skin customizada Netflix comunicando via `postMessage` |

---

## 2. Camada de Interface: `NetflixPlayerSkin.tsx`

A `NetflixPlayerSkin` é um overlay visual desacoplado do elemento de vídeo interno, garantindo uma interface uniforme independente do provedor de streaming.

### 2.1. Comunicação Bidirecional via `postMessage`

Toda a interação é feita por mensageria assíncrona com o iframe:
- **Comandos enviados:** `PLAY`, `PAUSE`, `SEEK_ABSOLUTE`, `SEEK_RELATIVE`, `SET_VOLUME`, `SET_MUTED`, `SET_PLAYBACK_RATE`, `REQUEST_STATUS`.
- **Eventos recebidos:** `timeupdate`, `playing`, `waiting`, `ended`, `durationchange`, `error`.

### 2.2. Segurança e Validação de Origem (`isTrustedMessageOrigin`)
Para impedir que scripts de anúncios ou embeds de terceiros injetem comandos ou falsifiquem o estado de reprodução, a skin valida:
1. Se a mensagem provém comprovadamente de `iframeRef.current.contentWindow`.
2. Se a origem faz parte da lista restrita de domínios homologados (`watchplay.shop`, `nixplay.lat`, etc.).

---

## 3. Tratamento de Congelamento e Watchdogs em Dois Níveis

O sistema emprega uma estratégia de resiliência em dois níveis complementares, evitando tanto telas travadas quanto reinicializações desnecessárias de reprodução:

```
[ Usuário inicia reprodução ]
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│  NÍVEL 1 (Macro): VideoPlayerModal.tsx                      │
│  Watchdog de Carregamento Inicial (10s a 14s)               │
└─────────────────────────────────────────────────────────────┘
              │
    ┌─────────┴────────────────────────┐
    │ Pronto dentro do limite?         │ Não (Timeout / Erro Fatal)
    ▼                                  ▼
[ Reprodução Iniciada ]    [ Fallback Silencioso ]
    │                      (Troca para VIP Player / Próximo servidor homologado)
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  NÍVEL 2 (Micro): NetflixPlayerSkin.tsx                     │
│  Watchdog de Buffering Pontual (Stall Detection)            │
└─────────────────────────────────────────────────────────────┘
    │
    ├─► Soluço momentâneo na CDN (< 2s):
    │   Exibe spinner sutil de buffer, mantendo o iframe vivo.
    │   O vídeo continua exatamente de onde parou quando o pacote chega.
    │
    └─► Queda fatal de conexão / Stream desconectado:
        Dispara evento `STREAM_DISCONNECTED` para o Modal acionar
        o fallback transparente de servidor.
```

### Nível 1: Watchdog Macro (`VideoPlayerModal.tsx`)
- Monitora se o player informou prontidão (`playerSkinReady`) dentro do tempo limite.
- **WatchPlayer Oficial:** 10 segundos de tolerância.
- **VIP Player Dublado:** 14 segundos de tolerância.
- **Ação:** Se o servidor não responder, executa `handleSilentFallback()`, comutando o iframe para a próxima fonte homologada sem exibir erros técnicos ao usuário.

### Nível 2: Watchdog Micro (`NetflixPlayerSkin.tsx`)
- Monitora o fluxo de status de vídeo enquanto o player deveria estar rodando (`!playerStatus.paused`).
- Se houver uma micro-interrupção na rede do usuário ou da CDN, ele **não destrói o player nem troca de servidor abruptamente**.
- Em vez disso, exibe um indicador sutil de buffer por breves segundos para permitir o preenchimento do buffer do navegador.
- Somente em caso de erro fatal (`PLAYER_ERROR`, `WATCHPLAY_ERROR`, `VIP_UNAVAILABLE`), o evento escala para a troca de servidor.

---

## 4. Otimização do Endpoint `/api/watchplayer-stream`

Localizado em `server.ts`, este endpoint entrega o player do WatchPlayer com autoplay imediato.

### 4.1. Sondagem Concorrente em Paralelo (`Promise.any`)
Algumas séries no WatchPlayer usam a rota `/tvshow/`, outras `/series/`, e outras `/serie/`. 
- **Como era antes:** O servidor tentava uma rota por vez em um loop sequencial. Se a primeira falhasse e a segunda desse timeout, o usuário esperava até 10 segundos para o vídeo abrir.
- **Implementação atual:** Todas as rotas variantes são disparadas **simultaneamente em paralelo**. A primeira que responder com status 200 e conteúdo válido é aceita na hora (`Promise.any`), reduzindo o tempo de abertura de ~10s para **menos de 2s**.

### 4.2. Cache de Prefixo por Série (`watchPlayerWorkingPrefixCache`)
Quando o servidor descobre que determinada série funciona no formato `/series/` (ex: `serie_id_123`), ele salva essa informação em memória:
```typescript
watchPlayerWorkingPrefixCache.set(seriesId, matchedPrefix);
```
Ao reproduzir o episódio 2, 3 ou temporadas seguintes, a requisição já é montada com o prefixo correto na primeiríssima tentativa, com **zero atraso de fallback**.

### 4.3. Timeouts e Cancelamento de Requisições Zumbis
- Cada probe possui um `AbortController` com limite estrito de **4.5 segundos**.
- Possui o ouvinte `req.on("close", () => controller.abort())`: se o usuário fechar o modal ou trocar de filme antes do carregamento terminar, o Node.js cancela a requisição upstream imediatamente.

---

## 5. Otimização do Endpoint `/api/anime/hls-proxy`

Localizado em `server.ts`, este proxy contorna restrições de CORS e cabeçalhos Referer para manifests HLS (`.m3u8`) e segmentos (`.ts`/`.m4s`).

### 5.1. Timeouts Segmentados
- **Manifests `.m3u8`:** Timeout de **8 segundos**. Por serem arquivos leves de texto com a lista de segmentos, devem responder imediatamente.
- **Segmentos de mídia (`.ts`/`.m4s`):** Timeout de **15 segundos** para acomodar downloads de blocos de vídeo maiores.

### 5.2. Prevenção de Sockets Pendurados
- O ouvinte `req.on("close", () => controller.abort())` garante que, se o player pausar, der seek ou fechar, o download em andamento da CDN de origem é cancelado na hora.
- Se a CDN upstream demorar mais que o tempo limite, o proxy responde imediatamente com **`504 Gateway Timeout`**, liberando a conexão sem travar o event loop do Node.js.

---

## 6. Checklist de Conformidade Técnica

- [x] **Zero consumo da franquia do servidor com VOD:** Vídeos trafegam diretamente CDN → Navegador.
- [x] **Timeouts com `AbortController` em todas as rotas VOD:** Sem requisições eternas no Node.js.
- [x] **Tratamento de fechamento prematuro (`req.on('close')`):** Evita sockets zumbis consumindo CPU.
- [x] **Sondagem paralela (`Promise.any`) nas variantes do WatchPlayer:** Abertura rápida de séries.
- [x] **Cache em memória de rotas funcionais por ID:** Acelera reprodução contínua de episódios.
- [x] **Dois níveis de watchdog:** Buffering suave durante o filme e fallback transparente se a fonte morrer.
- [x] **Respeito estrito à Política de Servidores Homologados:** Bloqueio ativo de qualquer fonte na lista negra.

## StreamTape: escolha entre cópias dos catálogos (23/10/2026)

O iframe e o health check passam a usar a identidade exata do filme ou do episódio para consultar os candidatos StreamTape do Encontrei e do Vizer. `server/services/streamtapeSources.ts` deduplica por fileId, prioriza áudio declarado Dublado/PT-BR e verifica um prefixo MP4 de até1024bytes antes de selecionar uma cópia. Não baixa o vídeo inteiro durante a sondagem. Se o snapshot contiver arquivos substituídos, tenta uma atualização dos dois catálogos antes de desistir.

O critério considera tempo de resposta observado, falhas recentes e requisições de mídia ativas no proxy deste worker. Não representa a carga interna da CDN nem uma contagem global de espectadores: cada processo PM2 tem suas próprias métricas em memória, que reiniciam no deploy. As sondagens concorrentes do mesmo arquivo são compartilhadas, acertos duram30s e falhas5s. Há admissão limitada a6 sondagens e6 descobertas simultâneas por worker, sem fila ilimitada. Arquivos idênticos nos dois catálogos são uma única fonte.

A recuperação do iframe renova o token uma vez por arquivo e, se necessário, solicita outra cópia excluindo os fileIds já tentados. Mantém posição, seek solicitado e intenção de pausa. Buffer seco persistente por8s também pode acionar outra cópia; pausas ou buffer recuperado não provocam troca. O ciclo é limitado e não alterna indefinidamente entre os mesmos arquivos. Só depois de esgotar as cópias disponíveis informa falha ao modal para usar os demais provedores homologados. O verificador em segundo plano não antecipa essa mudança de provedor.

Limites: descoberta por catálogo4s, sondagem de arquivo8s, seleção total18s e recuperação no iframe18s. Watchdog externo de45s cobre seleção inicial e recuperação; falhas explícitas encerram antes. A disponibilidade é pontual: um prefixo MP4 válido não garante banda sustentada ou reprodução integral. O transporte StreamTape continua usando `/api/streamtape-stream` na VPS, com Range e renovação; portanto o comentário geral de tráfego VOD direto acima não descreve este proxy específico.

## MixDrop: seleção e recuperação entre catálogos (23/10/2026)

MixDrop e StreamTape compartilham o algoritmo em `server/services/mediaSourcePool.ts`, com instâncias e métricas separadas por provedor. A descoberta de catálogos também é comum, com chaves que distinguem provedor, filme/série, temporada e episódio. `/api/md-stream?id=...&s=...&e=...` verifica as cópias MixDrop de ambos catálogos, mede o prefixo MP4, escolhe uma fonte e atualiza os IDs ao vivo uma vez se o snapshot falhar. `format=json` informa fileId/source/proxyUrl além do videoUrl legado. URLs antigas contendo apenas o embed continuam aceitas.

O iframe informa `WATCHPLAY_SOURCE` com o arquivo realmente escolhido. O modal usa esse ID, não o ID preferido antes da seleção, para excluir cópias falhas. O controlador `mixdropSourceRouting.ts` evita tentativas duplicadas e resultados de outro episódio, preserva IDs já tentados, pausa e seek solicitado durante a consulta. Só após esgotar fontes ou o prazo inicia outro provedor. IDs iguais não são uma segunda cópia. Escolha inicial, troca manual, temporada e episódio usam contexto numérico quando disponível; casts/URLs legadas sem esse contexto mantêm resolução direta do fileId.

A recuperação de buffer do MixDrop continua aguardando reserva antes de retomar. Em contexto com alternativas, tenta recarregar após4s e permite fallback após10s com janela de6s para essa tentativa; reprodução legada conserva seus limites anteriores. A troca abre um novo vídeo/iframe no mesmo ponto e respeita pausa explícita. Nunca troca de arquivo dentro de uma resposta HTTP parcialmente entregue: a retomada por bytes do proxy continua exigindo offset, tamanho e validador do mesmo objeto.

Contadores de conexões, cache e desempenho são locais de cada processo PM2. Não há consulta à carga interna do MixDrop, nem garantia de banda sustentada pela verificação de1024bytes. A seleção e o pedido de alternativa têm prazo18s, sondagens8s e watchdog externo45s. Dados reais de produção e a distribuição entre workers ainda precisam de validação após deploy autorizado.

## BYSE integrado ao player próprio

Integração autorizada especificamente pelo dono: BYSE removido da blacklist global, seletor `srv_byse` com a NetflixPlayerSkin existente e bloqueio por título no painel administrativo. O iframe é gerado pelo app; não carrega a página ou os scripts de publicidade do provedor. hls.js é servido localmente em `/api/byse-hls.js`.

`/api/byse-proxy-iframe?id=TMDB&s=1&e=4` consulta as fontes dos dois catálogos com prioridade de áudio declarada em português. Conteúdo apenas BYSE também pode ser confirmado na busca. Não há fallback posicional para o número do episódio no lookup BYSE. `/api/byse-resolve` devolve referências locais, sem URL assinada direta. `/api/byse-stream?ticket=...` reescreve variantes, chaves e init por tickets AES-GCM, valida cada redirect, rejeita recursos fora dos hosts autorizados e suporta Range. A chave privada de proxy `data/byse-proxy.key` é criada com permissão0600, ignorada pelo git e mantida no data compartilhado da VPS para funcionar entre workers/releases.

Núcleo adaptado do material fornecido: fingerprint estável por sessão, attest compartilhado, cache limitado, PoW em worker com fila limitada4 e prazo total30s incluindo espera. Nunca executa o PoW como fallback síncrono. O resolvedor rejeita origens embed inesperadas e payloads inválidos. A seleção da rota é limitada45s. O wrapper renova uma vez após falha de manifesto/mídia, mantém posição e sinaliza esgotamento para fallback a outro provedor. Watchdog externo BYSE95s cobre seleção + renovação; demais provedores mantêm seus prazos anteriores. O verificador em segundo plano não inicia PoW em massa; a disponibilidade BYSE é resolvida ao escolher o servidor.

Validação local: cadeia criptográfica simulada, rotas HTTP e testes de regressão; reprodução efetivamente decodificada no Chromium com H264/HLS sintético e NetflixPlayerSkin real em desktop e perfil Android emulado. Play/pause/seek/resume e renovação de manifesto passaram, sem popups ou tráfego externo nessas sessões. Isso não confirma reprodução de conteúdo real na CDN BYSE, aparelho físico Android ou ausência de anúncios inseridos no próprio vídeo upstream. Script reproduzível: `BYSE_TEST_CSS=/caminho/do/build/dist/assets/index-....css node scripts/test-byse-browser.cjs` (requer ffmpeg, Chromium e Playwright no ambiente de teste).

Validação real adicional após liberação de rede: LokiS01E01 foi resolvido em ambiente local para edge1-waw-sprintcdn.r66nv9ed.com e reproduziu trechos reais no Chromium com NetflixPlayerSkin (desktop e Android emulado). Quadros foram decodificados e pausa/seek/retomada passaram. Zero popups e zero requests externos no navegador durante as sessões. Expiração natural, episódio integral e Android físico continuam sem validação; nenhum deploy BYSE foi realizado.

Teste real ampliado: Loki S01E01 reproduziu por180s no desktop,4317quadros decodificados, sem erro de mídia; uma espera de66ms foi registrada. Filme jou9rze9bien e episódio5cqowqbfd09n tiveram manifesto, variante e primeiro trecho de segmento206 válidos, sem prova de reprodução integral. Renovação com falha503 injetada localmente no manifesto recuperou reprodução da CDN real em desktop/Android emulado; não representa expiração natural. Zero popups/requisições externas no browser nessas sessões. Ainda requer aparelho Android físico e verificação na VPS após publicação autorizada.

Retomada BYSE após pausa superior a3min: PLAY/TOGGLE renovam a fonte antes de reproduzir, usando a posição salva ao pausar (atualizada por seek em pausa). A renovação não publica posições transitórias zeradas; restaura initialSeek antes do novo manifesto e respeita PAUSE recebido enquanto resolve. Pedidos duplicados não geram resoluções concorrentes. O modal deixa essa retomada para o wrapper BYSE; para MixDrop, retry forçado pós-pausa recarrega primeiro o mesmo provedor sem marcar a cópia atual como falha. StreamTape conserva sua retomada por t/renovação existentes. Teste com relógio simulado de1h, não espera real de1h.

BYSE agora usa createMediaSourcePool através de server/services/byse/sources.ts. Resolve e sonda prefixo de manifesto HLS (até1024bytes, redirect máximo4 restrito à allowlist), compara latência observada, penaliza falhas e conta respostas de mídia ativas neste worker. Prioriza PT-BR, deduplica fileIds e compartilha sondagens concorrentes; cache de sucesso30s/falha5s, admissão6, prazo de sondagem35s e rota45s. Validar manifesto não comprova todos os segmentos nem banda sustentada. Tickets opacos carregam fileId autenticado para atribuir requisições e falhas à cópia correta, com compatibilidade dos tickets antigos. Recuperação de erro tenta outra cópia antes de renovar a mesma quando só restar ela; pausa longa conserva retomada e a intenção do usuário. BYSE é a primeira opção do modal, preservando servidor explícito, preferência salva e bloqueios administrativos. Não há sondagem PoW em massa no healthcheck nem troca de fonte saudável durante reprodução. Métricas são locais do processo, não carga global da CDN.

## Seleção inicial por conteúdo

/api/playback-candidates fornece hints de presença e áudio dos índices Encontrei/Vizer para o filme ou episódio exato. Ausência no snapshot não é prova definitiva de indisponibilidade. Uma descoberta playerData pode atualizar os três hosters numa só consulta, preservando áudio por provedor; atualização limitada800ms na resposta, compartilhada30s e com admissão4 por worker (trabalho subjacente continua sob timeouts existentes). Não envolve PoW. Cliente reserva1200ms para metadados, sonda no máximo2provedores simultaneamente e abre a primeira confirmação de mídia. Probes têm limite4500ms e cache compartilhado existente; não se abre iframe para cada provedor durante a sondagem. Dublado tem prioridade sobre legendado quando há fonte dublada listada.

BYSE frio não inicia PoW por healthcheck. BYSE quente é sondado através de ticket cifrado contendo identidade do conteúdo e fileId; uma URL de iframe preparada reutiliza essa resolução entre processosPM2 sem refazer PoW. Ticket preparado para outro episódio é rejeitado. Se o BYSE só estiver frio/listado e não houver opção confirmada, pode ser tentado com prazo curto; o usuário ainda pode selecioná-lo manualmente para usar o fluxo normal completo.

Plano inicial tem até2provedores, watchdog de8s incluindo a preparação, baseado no avanço efetivo do vídeo (metadados sozinhos não contam). Falha avança diretamente à alternativa sem zerar o ponto salvo. Esgotamento permite uma única redescoberta/replanejamento e no máximo2novos provedores; depois mostra erro recuperável. Esses prazos não garantem início em8s no total com alternativas. Sondagens/clientes antigos são cancelados por época e identidade ao fechar/trocar episódios ou selecionar manualmente. Tentativas não são apagadas só porque chegaram metadados. A sondagem periódica pesada foi removida do modal: não disputa CPU nem muda o servidor enquanto uma reprodução saudável continua. Depois que o vídeo avança, preservam-se os mecanismos próprios de recuperação de cada provedor. Não há medição da carga interna global da CDN.
