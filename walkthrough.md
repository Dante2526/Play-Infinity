## 03/10/2026 - Correções Live TV e Otimizações de Performance

**Resumo:**
- **Correção 502 na TV ao Vivo (Live TV):** A fonte `up.kiwi` expirava os tokens HLS muito rápido e respondia com `200 OK` + HTML de erro. Implementado "Watchdog" no `server/routes/videoScrapers.ts` para validar a tag `#EXTM3U` e renovar o token automaticamente sem queda.
- **Otimização do encontrei-catalog.json (14 MB):** O JSON gigante foi removido da pasta `public/data/` para impedir que os clientes tentem baixá-lo. Agora ele reside em `data/` e é consumido *apenas* pelo backend via `encontreiLookup.ts`.
- **Redução de Bundle React:** Componentes pesados do frontend (`AdminPage`, `VideoPlayerModal`, `DetailsPage`, etc) foram protegidos com `React.lazy()` via wrapper `lazyWithRetry` no `App.tsx`, garantindo code-splitting e melhor carregamento inicial da aplicação.

---

## 03/10/2026 - Mega Refatoração de Rotas (server.ts modularizado)

**Resumo:**
- O monolito `server.ts` possuía ~6.700 linhas, misturando lógicas de proxy, pagamentos, scrapers (VOD) e serviços (TMDB, catálogo).
- Ele foi dividido em múltiplos roteadores dedicados na pasta `server/routes/`.
- **Fase 1:** Fix do bypass de segurança no `live-stream-proxy` (HMAC enforced, bypass por *referer* removido). Feita a proteção da backdoor REST do `requireAdminAuth.ts` via enforce de JWT.
- **Fase 2:** 
  - Pagamentos e webhooks do ASAAS extraídos para `payments.ts`.
  - Rotas pesadas de streaming de VOD (`watchplayer-stream`, `anime-stream`, `vixsrc-stream`, `myembed-stream`, `pomfy-stream`) enviadas para `videoScrapers.ts`.
  - HLS e Proxy CORS Anti-bloqueios transferidos sem perder o mecanismo de bypass.
- **Fase 3 & 4:** 
  - Criados `catalog.ts` para endpoints de visualização, rastreamento e disponibilidade.
  - Criados `diagnostics.ts` para o medidor de speedtest, player info.
  - Criados `mixdrop.ts` para scraping de streams.
  - Criados `cast.ts` (integração Chromecast source info).
- **Resultado:** O `server.ts` caiu drasticamente para ~380 linhas. O bundle principal de CJS em produção foi reduzido de ~475KB para ~380KB. Tudo homologado através do conjunto de testes (smoke tests), garantindo que os clientes e o HLS na Oracle VPS não tenham indisponibilidade.

---
# Walkthrough: Anotações e Descontos no Admin

## Tarefas Realizadas

1. **Atualização do Modelo (`ClientUser`)**
   - Adicionados os campos opcionais `notes`, `fixedDiscount` e `oneTimeDiscount`.

2. **Estados de Edição e Salvamento**
   - Estados criados para o modal (`editNotes`, `editFixedDiscount`, `editOneTimeDiscount`).
   - `handleOpenEdit` atualizado para carregar os valores atuais ou os padrões vazios/zeros.
   - `handleSaveEdit` atualizado para consolidar os novos dados no objeto de `updates` que é gravado no Firestore (`usuarios` e `users`).

3. **UI do Modal de Edição**
   - Criado um `<textarea>` para a digitação de comentários/notas internas do usuário.
   - Criada uma condicional que exibe os `inputs` de Desconto Fixo e Desconto Único caso o `editAccessType` seja "mensal".

4. **UI do Card do Usuário**
   - Inserido um botão "Notas" ao lado de "Editar", que só aparece se o `client.notes` não for vazio.
   - Criada uma área expansível (`div`) abaixo dos dados do usuário, garantindo a exibição do texto com quebras de linha respeitadas (`whitespace-pre-wrap`).
   - Toda a estrutura do Card foi envolvida num Fragmento/Container `flex-col` para suportar o componente sanfona (accordion) do texto.

## Verificação Pós-Código

- Verificação TypeScript `npx tsc --noEmit` executada.
- Código exit: `0` (Zero erros na compilação).

## Relatório de Code Review (Self)

- **Strengths:** 
  - UI reutiliza os componentes visuais já adotados, mantendo o fundo *glassmorphism*.
  - A renderização condicional otimiza a listagem (notas só renderizam no DOM se estiverem ativas e se existirem).
  - Nenhuma quebra no layout de grid nativo.
- **Issues:**
  - Nenhuma (Minor/Important/Critical issue encontrada). O design está de acordo com as restrições globais.
- **Assessment:** Pronto e Implementado com sucesso.

## 01/10/2026 - Monitoramento do Robô Ampere

**Resumo:**
- **Integração do Bot Ampere (Oracle VPS):** Criado endpoint `/api/admin/vps-bot-logs` via SSH que lê em tempo real as últimas 30 linhas de log do bot `ampere-creator` (via PM2).
- **Monitor do Robô Ampere:** Adicionada uma nova seção "Robô de Criação VPS (Ampere)" no componente `AdminDeployMonitor.tsx` do painel de administrador, renderizando um terminal ao vivo que acompanha as tentativas de criação da instância na Oracle Cloud.
- **Precificação:** O valor da assinatura do **Plano Plus** foi reduzido de R$ 20,00 para R$ 17,00 no `DownloadPlusModal.tsx`.
