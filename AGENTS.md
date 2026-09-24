# Diretrizes e Regras do Repositório (Play Infinity)

> **ATENÇÃO PARA TODOS OS AGENTES DE IA (Antigravity, Claude, Copilot, Gemini, etc.):**
> Este arquivo define restrições arquiteturais e de produto mandatória para este projeto. Leia com atenção antes de implementar qualquer alteração relacionada a streaming, players ou servidores de vídeo.

---

## 1. Política Estrita de Servidores de Vídeo (VOD: Filmes, Séries e Animes)

1. **Reprodutores Homologados:**
   Qualquer reprodutor de vídeo que **NÃO** constar na lista negra abaixo pode ser utilizado, adicionado ou testado, desde que homologado pelo dono do projeto.
   Atualmente homologados:
   - **WatchPlayer Oficial:** `https://v1.watchplay.shop/...`
   - **VIP Player Dublado PT-BR:** `/api/myembed-stream?id=...`
   - **Pomfy Stream:** `https://api.pomfy.stream/...` (Permitido pois não consta na lista negra).

2. **Proibição Absoluta de Servidores Alternativos (Lista Negra)**
   - **É ESTRITAMENTE PROIBIDO** reintroduzir ou sugerir servidores alternativos como:
     - `Superflix` / `sfapi`
     - `BYSE` / `Streamberry`
     - `EmbedPlay`
     - `Videasy`
     - `VidLink`
     - `AutoEmbed`
     - `Consumet` / `AnimeFire` (iframes externos não-oficiais)
     - `Vidsrc`, `MultiEmbed`, `Embed.su`
     - `Starflix` / `Startflix` / `painel-aso.sbs`
   - **Consulte sempre o arquivo:** [`src/data/serverBlacklist.ts`](file:///c:/Users/nayla/.antigravity/Play-Infinity/src/data/serverBlacklist.ts).
   - Qualquer domínio, rota ou provedor que conste na lista negra **JAMAIS** deve ser reativado ou reintroduzido no catálogo.

3. **Seletor de Servidores Homologados**
   - O seletor de servidores no reprodutor deve conter exclusivamente os provedores homologados que não estão na lista negra.

4. **Prioridade Mandatória para Conteúdo em Português (Dublado PT-BR / Nacional):**
   - Toda lógica de extração, seleção de servidores, resolução de opções e fallbacks de áudio deve priorizar estritamente opções em **Português do Brasil (Dublado PT-BR)** ou conteúdos nacionais.
   - Opções com áudio original/legendado só devem ser utilizadas caso não exista nenhuma fonte dublada PT-BR disponível nos provedores homologados.
   - Qualquer provedor ou fonte que forneça apenas áudio estrangeiro sem versão em português deve receber a menor prioridade ou ser descartado em favor de fontes com dublagem PT-BR.

---

## 2. Estabilidade do Localhost e Observador de Arquivos (Vite)

- Arquivos em tempo de execução (como banco de dados local `data/*.json`, relatórios em `scratch/`, arquivos temporários `.tmp` e logs) **nunca devem ser observados pelo Vite** (`server.watch.ignored`).
- A gravação desses arquivos não pode causar reloads de página (`[vite] page reload`) enquanto o usuário assiste a um conteúdo.

---

## 3. Conformidade e Verificação Obrigatória

- Ao modificar qualquer componente de player (`VideoPlayerModal.tsx`, `NetflixPlayerSkin.tsx`, `LivePlayerModal.tsx`), execute sempre a validação com `npx tsc --noEmit` antes de concluir a tarefa.

---

## 4. Infraestrutura de Streaming de TV ao Vivo (VPS Oracle Cloud)

> **IMPORTANTE PARA TODOS OS AGENTES:**  
> O projeto possui uma VPS dedicada na **Oracle Cloud Infrastructure (OCI - São Paulo)** para hospedar o proxy de streaming de TV ao vivo, evitando estourar a franquia de 100 GB/mês do Render.

1. **Dados da VPS Oracle:**
   - **IP Público:** `147.15.57.146` (Região: São Paulo - AS31898 Oracle)
   - **Domínio Oficial HTTPS:** `https://play-infinity-app.duckdns.org` (SSL Let's Encrypt ativo via Nginx)
   - **Chave SSH:** `oracle-vps.key`
   - **Código do Proxy:** `/home/ubuntu/proxy.mjs` (gerenciado por PM2 como `video-proxy` na porta interna 8080)
   - **Endpoint de Saúde:** `https://play-infinity-app.duckdns.org/api/health`

2. **Como o Frontend consome:**
   - No componente `src/components/LivePlayerModal.tsx`:
     ```ts
     const proxyBase = import.meta.env.VITE_PROXY_URL || 'https://play-infinity-app.duckdns.org';
     ```
   - Todo o tráfego de streaming de canais ao vivo é roteado diretamente para a VPS Oracle com HTTPS.

3. **Status Atual:**
   - A VPS na Oracle está **ONLINE, 100% OPERACIONAL e com certificado SSL HTTPS ativo**.
   - Zero consumo da franquia de 100 GB do Render para TV ao vivo.
   - Veja o documento completo em [`ORACLE_PROXY.md`](./ORACLE_PROXY.md).

---

## 5. Arquitetura de Streaming de VOD (Filmes, Séries e Animes)

- O tráfego de VOD viaja diretamente da **CDN de origem para o navegador do cliente** (não consome banda do Render nem da VPS).
- A interface é controlada via `NetflixPlayerSkin.tsx` comunicando-se por `postMessage`.
- O sistema possui **Watchdog em Dois Níveis** (Macro no modal com fallback automático; Micro na skin para buffer suave sem reiniciar o vídeo).
- Os endpoints de backend (`/api/watchplayer-stream` e `/api/anime/hls-proxy`) possuem **timeouts estritos com `AbortController`**, detecção de cancelamento de conexão (`req.on('close')`), sondagem paralela de variantes via `Promise.any` e cache de prefixos funcionais em memória (`watchPlayerWorkingPrefixCache`).
- Consulte a documentação completa e detalhada em [`VOD_ARCHITECTURE.md`](./VOD_ARCHITECTURE.md).

