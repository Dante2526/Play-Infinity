# Plano de Implementação: Extrator Vizer (Mixdrop)

## 1. Visão Geral
Implementar um extrator de vídeo no Backend (Node.js/VPS) que consome silenciosamente a busca do Vizer para obter links diretos do Mixdrop (Dublados PT-BR).

## 2. Passo a Passo Técnico

### Etapa 1: Backend - Rota de Extração (Scraper)
- **Arquivo:** `server/routes/vizerExtractor.ts` (Nova rota no Express)
- **Ação:**
  1. Recebe um GET em `/api/vizer-stream?tmdbId=X&type=movie` (ou series).
  2. Faz requisições HTTP (usando `fetch` ou `axios` instalados na VPS) para o domínio oficial do Vizer.
  3. Realiza parsing do HTML (Regex ou Cheerio) para encontrar o Iframe do Mixdrop correspondente ao ID/Filme.
  4. Retorna um JSON para o Frontend com `{ success: true, url: "https://mixdrop.co/e/..." }`.

### Etapa 2: Backend - Sistema de Cache (Anti-Bloqueio)
- **Arquivo:** `server/routes/vizerExtractor.ts`
- **Ação:**
  1. Adicionar um `Map<string, string>` em memória.
  2. Antes de fazer o scraping no Vizer, checar se a URL já está no cache para o ID solicitado.
  3. Evitar disparos múltiplos se 50 usuários pedirem o mesmo filme ao mesmo tempo.

### Etapa 3: Frontend - Integração no Player
- **Arquivo:** `src/components/VideoPlayerModal.tsx` e `src/services/videoSources.ts`
- **Ação:**
  1. Adicionar o extrator como um fallback/servidor homologado (`srv_mixdrop`).
  2. Quando o player tentar carregar `srv_mixdrop`, o React faz a chamada para o nosso próprio Backend (`/api/vizer-stream`).
  3. Se houver retorno, injeta o link do Mixdrop na `NetflixPlayerSkin`.
  4. Se falhar (ex: filme não existe no Vizer), pula para o próximo provedor suavemente.

## 3. Riscos e Mitigações
- **Mudança de Layout do Vizer:** Se eles alterarem as classes HTML, o scraper quebra. *Mitigação: RegEx flexível e fallback automático para WatchPlayer.*
- **Bloqueio de IP:** *Mitigação: O cache em memória evita spam no servidor deles.*
