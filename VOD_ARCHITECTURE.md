# Arquitetura e Funcionamento do Sistema de VOD (Filmes, Séries e Animes)

Este documento detalha o funcionamento, decisões arquiteturais e proteções implementadas no fluxo de reprodução de **Vídeo Sob Demanda (VOD)** da aplicação **Play Infinity**.

---

## 1. Visão Geral e Diferença Estrutural (VOD vs. Live TV)

A aplicação possui dois ecossistemas distintos de reprodução:

| Característica | TV ao Vivo (Live TV) | VOD (Filmes, Séries e Animes) |
| :--- | :--- | :--- |
| **Componente Principal** | `LivePlayerModal.tsx` | `VideoPlayerModal.tsx` + `NetflixPlayerSkin.tsx` |
| **Reprodução de Mídia** | Local (`new Hls()`, `<video>` nativo) | Iframe isolado com player HTML5 / Artplayer |
| **Tráfego de Dados** | VPS Dedicada Oracle (`play-infinity-app.duckdns.org`) | **Direto da CDN de origem para o navegador do cliente** |
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
2. Se a origem faz parte da lista restrita de domínios homologados (`watchplay.shop`, `pomfy.stream`, etc.).

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
