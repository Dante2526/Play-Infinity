# Plano de Implementação: Legendas Automáticas PT-BR (SubtitleCat)

## Visão Geral
Conforme o relatório fornecido, o objetivo é implementar um sistema de extração, conversão e injeção de legendas em português nos players de vídeo nativos do projeto. A fonte de dados principal será o **SubtitleCat**, que permite o download direto de arquivos `.srt` sem bloqueios rígidos.

## Fases da Implementação

### 1. Limpeza do Nuvix (Residual)
- **Alvo:** `server/routes/serverBlocks.ts` e arquivos relacionados.
- **Ação:** Remover qualquer menção ao servidor `srv_nuvix` (já que o site migrou para React Server Components e a extração m3u8 não funciona mais server-side).

### 2. Criação do Backend de Legendas
- **Novo Arquivo:** `server/routes/subtitlesRoutes.ts`
- **Funcionalidades:**
  1. Receber requisição `GET /api/subtitles?tmdb=X&type=movie|tv&season=Y&episode=Z&lang=pt-BR`.
  2. Consultar o TMDB para obter o título original em inglês.
  3. Realizar web scraping no `SubtitleCat` (`https://www.subtitlecat.com/index.php?search={titulo}`) para encontrar a página da legenda.
  4. Extrair a URL direta de download do `.srt`.
  5. Fazer o download do `.srt` e converter em memória para o formato `.vtt` (WebVTT), exigido nativamente pelos navegadores.
  6. Armazenar localmente na pasta `data/subtitles-cache/` com TTL de 30 dias.
  7. Rota auxiliar `GET /api/subtitle-file?path={base64}` para servir o arquivo `.vtt` com o `Content-Type: text/vtt` correto.

### 3. Integração com o Proxy (Express/Vite)
- **Alvo:** `server.ts`
- **Ação:** 
  - Registrar as rotas de legendas.
  - Atualizar os *message handlers* (`SET_SUBTITLE_URL` e `SHOW_SUBTITLE`) para que os iframes consigam interceptar essas mensagens de `postMessage` e injetar dinamicamente um elemento `<track>` na tag `<video>`.

### 4. Integração no Frontend (React)
- **Alvo:** `src/components/VideoPlayerModal.tsx` e `src/components/NetflixPlayerSkin.tsx`
- **Ação:**
  - `VideoPlayerModal` fará o `fetch` para `/api/subtitles` sempre que uma mídia abrir ou trocar de episódio.
  - Passará o resultado (`subtitleUrl`) via prop para o `NetflixPlayerSkin`.
  - O `NetflixPlayerSkin` fará o controle visual do botão "CC", disparando mensagens para o iframe ativar ou desativar a exibição da legenda injetada.
  - **Regra de Negócio (Ativação Padrão):** 
    - Para **Animes**, a legenda deve vir **ativada por padrão**.
    - Para Filmes e outras Séries, a legenda deve vir **desativada por padrão** (o usuário deve clicar no botão CC/Áudio para ativar).

## Riscos e Mitigações
- **Segurança:** O script injetará `<track>` estritamente no elemento `<video>` nativo que for renderizado pela interceptação, sem risco de XSS (o formato WebVTT é seguro e nativo).
- **Desempenho:** Cache em disco (30 dias) garantirá que as legendas não atrasem a abertura da mídia em reproduções subsequentes.
- **Dependências:** Diferente do relatório, tentaremos implementar a conversão `.srt` para `.vtt` de forma **nativa**, evitando adicionar pacotes desnecessários como `adm-zip` a não ser que a API exija downloads compactados.

## Aprovação
Aguardando aprovação para prosseguir com a implementação cuidadosa.
