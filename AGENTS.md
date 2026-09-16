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
