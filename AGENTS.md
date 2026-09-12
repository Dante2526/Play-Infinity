# Diretrizes e Regras do Repositório (Play Infinity)

> **ATENÇÃO PARA TODOS OS AGENTES DE IA (Antigravity, Claude, Copilot, Gemini, etc.):**
> Este arquivo define restrições arquiteturais e de produto mandatória para este projeto. Leia com atenção antes de implementar qualquer alteração relacionada a streaming, players ou servidores de vídeo.

---

## 1. Política Estrita de Servidores de Vídeo (VOD: Filmes, Séries e Animes)

1. **Dois Únicos Reprodutores Homologados:**
   - **WatchPlayer Oficial (Padrão 1):**
     - URL Oficial: `https://v1.watchplay.shop/...` e seu proxy seguro `/api/watchplayer-stream`.
     - Suporte nativo à skin Netflix, telemetria em tempo real e controle automático de episódios.
   - **VIP Player Dublado PT-BR (Padrão 2 / Fallback Seguro):**
     - Endpoint Sanitizado: `/api/myembed-stream?id=...&type=movie|tv`.
     - Executado obrigatoriamente através do proxy interno com escudo anti-popup (`window.open` neutralizado e scripts de anúncios removidos).

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
   - O seletor de servidores no reprodutor deve conter exclusivamente os provedores homologados: `WatchPlayer Oficial` e `VIP Player (Dublado PT-BR)`.

---

## 2. Estabilidade do Localhost e Observador de Arquivos (Vite)

- Arquivos em tempo de execução (como banco de dados local `data/*.json`, relatórios em `scratch/`, arquivos temporários `.tmp` e logs) **nunca devem ser observados pelo Vite** (`server.watch.ignored`).
- A gravação desses arquivos não pode causar reloads de página (`[vite] page reload`) enquanto o usuário assiste a um conteúdo.

---

## 3. Conformidade e Verificação Obrigatória

- Ao modificar qualquer componente de player (`VideoPlayerModal.tsx`, `NetflixPlayerSkin.tsx`, `LivePlayerModal.tsx`), execute sempre a validação com `npx tsc --noEmit` antes de concluir a tarefa.
