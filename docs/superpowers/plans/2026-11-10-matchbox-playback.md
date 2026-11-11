# Matchbox: inicialização e fallback — plano de correção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Iniciar Matchbox (TMDB 1148365) na fonte funcional, limitar tentativas automáticas e explicar falhas sem expor dados de acesso.

**Architecture:** Manter a seleção por catálogo e sondagem, com contrato coerente entre frontend e backend. Preservar uma sessão de tentativas por conteúdo e uma confirmação de reprodução baseada no avanço real da mídia. Usar prazos distintos para resolução e início do vídeo, com limite total explícito.

**Tech Stack:** React/TypeScript, Express, Chromium/Playwright, node:test.

**Spec:** Diagnóstico e critérios de aceitação neste documento, a partir do log enviado pelo usuário e das consultas descritas abaixo.

## Restrições

- Preservar skin Netflix, retomada de posição, PT-BR prioritário e restrições de AGENTS.md/allowlist/blacklist.
- Nenhum provedor novo. Sem segredos, cookies ou URLs assinadas nos relatórios.
- Plano apenas nesta etapa; implementação e push não realizados.
- Graphify: consultado relatório existente de 2026-11-10, que declara origem em 8ec08252 (anterior ao HEAD fd674fb); CLI ausente. Confirmadas relações no código atual.
- Antes de implementação: atualizar main, revisar alterações concorrentes e executar em checkout isolado conforme as regras do projeto.

## Diagnóstico e evidências

Produção responde `/api/health` com release `fd674fbd900b759e519f766c0f2d32c49c43c5bf-42940548688-1`, igual à revisão inspecionada.

| Verificação | Resultado observado |
| --- | --- |
| TMDB | Matchbox - O Filme, 1148365, IMDb tt28498219, status Released |
| playback-candidates | Saimo e Saimo MP4 listados; BYSE, MixDrop e StreamTape não listados |
| saimo-lookup | available=true |
| Saimo MP4 e prefer=hls, Range 0–1023 | Ambos HTTP 206, video/mp4, 1024 bytes |
| playback-health dos dois Saimo | Ambos available/media_verified |
| Chromium direto nos dois iframes Saimo | Ambos reproduziram; readyState=4, duração 7567,296s; relógio >2s após 9609/9779ms desde navegação |
| BYSE resolve | HTTP 502, mensagem genérica de indisponibilidade |
| MixDrop JSON | HTTP 502, nenhuma fonte verificada |
| Vizer iframe | HTTP 502, página silenciosa de indisponibilidade |
| playback-health de srv_vizer | HTTP 400, Servidor inválido |
| encontrei-lookup | Não concluiu dentro do timeout de diagnóstico de 16s |

As respostas foram consultadas com duas requisições simultâneas, corpos limitados e cancelamento de streams. Nenhum filme foi baixado integralmente.

### Defeitos confirmados no contrato/código

1. `src/services/playbackStartup.ts` inclui `srv_vizer` nos probes; `server/routes/playbackHealth.ts` não o aceita nem implementa esse branch. O 400 é um defeito interno reproduzível.
2. O health do Saimo valida bytes, mas não devolve o protocolo efetivo. Neste título, `prefer=hls` entrega MP4. A UI pode tentar a mesma mídia sob dois nomes de servidor. `getPlaybackCataloguePresence` não anuncia HLS para este título, mas a expansão permite incluir a variante depois.
3. `startupMediaLimit()` usa 7500ms com alternativa e 9000ms sem alternativa (BYSE frio tem exceção). O vídeo Saimo funciona, mas o tempo observado até avanço de dois segundos é ~9,6s. Há risco concreto de troca na fronteira do início, não evidência de fonte morta. Este ensaio direto não reproduz o ciclo completo do modal.
4. O fallback contém dois caminhos: startup planejado e recuperação legada. No caminho legado `handleServerSwitch(next.key)` usa `automatic=false`, removendo `startupPlanRef`. Ambos os caminhos têm retry BYSE baseado na presença no seletor, sem exigir resolução nova concluída. O texto “background concluída” não é evidência de conclusão.
5. O histórico é limpo em alguns sinais de reprodução e em ações de reconexão. O log comprova revisitas após esgotamento; a transição exata que reabriu o ciclo ainda precisa ser reproduzida no modal com instrumentação. Não atribuir definitivamente o ciclo a um único reset sem esse teste.
6. BYSE e Vizer escondem a causa interna em respostas genéricas; o log do navegador não permite separar ausência de arquivo, token, timeout, bloqueio e erro de extração. Não afirmar que o provedor inteiro caiu.

Avisos de WebGPU/Windows e logs de inicialização do ArtPlayer não explicam a falha. As pilhas React repetidas amplificam visualmente poucos eventos reais.

## Review Focus

- Status de iframe antigo/seek não podem confirmar a reprodução da fonte nova.
- MP4 retornado ao pedir HLS não pode ser tratado como uma segunda fonte independente.
- Autoplay bloqueado precisa pedir interação, sem declarar o arquivo indisponível.
- Falha de sessão/probe não pode apagar uma fonte já reproduzindo nem alterar sua posição.
- Catálogo ausente/timeout significa informação incompleta; ausência de sinal não autoriza loop infinito nem indisponibilidade definitiva global.

## Tarefa 1 — Reproduzir o ciclo completo e registrar decisões

**Arquivos:** criar `scripts/matchbox-playback-smoke.cjs`; inspecionar `VideoPlayerModal.tsx`, `playbackStartup.ts`, `playbackHealth.ts`, `saimoRoutes.ts`, `vizerRoutes.ts`, `byseRoutes.ts`.

**Interfaces:** relatório `{contentId, provider, stage, elapsedMs, outcome, reason, attempt, generation}` sem URLs de mídia. Estágios: discovery, resolve, probe, iframe, metadata, playing, exhausted.

- [ ] Criar fixture de iframe que só chega a playing aos 8500ms e outro que emite metadados/play antes de falhar; simular erro tardio do iframe descartado.
- [ ] Reproduzir o modal completo com esses fixtures e capturar a sequência de servidores, resets e geração do conteúdo. O teste deve demonstrar a troca prematura ou revisita antes da correção.
- [ ] Executar Matchbox em Chromium desktop e viewport mobile: capturar mensagens e relógio, encerrando cada ensaio em 60s. Comparar com iframe direto e respeitar autenticação; não contornar login.
- [ ] Classificar causas internas de cada 502 na VPS se houver acesso a logs; sem acesso, registrar explicitamente a pendência. Acrescentar códigos internos seguros (not_listed, timeout, upstream_denied, extraction_failed, no_source), preservando mensagem simples ao usuário.
- [ ] Commit separado de diagnóstico/testes, sem alterar a política de troca ainda.

## Tarefa 2 — Corrigir health do Vizer e protocolo efetivo do Saimo

**Arquivos:** `server/routes/playbackHealth.ts`, `server/routes/vizerRoutes.ts`, `server/routes/saimoRoutes.ts`, `src/services/playbackHealth.ts`, `src/services/playbackStartup.ts`; testes `tests/playback-health.test.cjs`, `tests/playback-startup.test.cjs`, `tests/saimo-hls-priority.test.cjs`.

**Interfaces:** health mantém `{state, reason, checkedAt, iframeUrl?}` e ganha `mediaKind?: 'hls'|'mp4'`; Vizer reutiliza `resolveVizerHls(tmdbId, season?, episode?, isSeries?, refresh?)` com timeout/cancelamento propagado ao trabalho upstream. URLs preparadas devem continuar same-origin e validadas por rota.

- [ ] Escrever testes que falhem: srv_vizer recebe health válido em vez de 400; manifesto válido, HTML/login, timeout e 404 produzem classificações distintas; um provedor válido não cai no branch genérico WatchPlayer.
- [ ] Testar Saimo com apenas MP4: pedido HLS informa MP4 efetivo e não cria duas tentativas da mesma mídia; testar título com HLS real e duas mídias distintas para preservar alternativas legítimas.
- [ ] Implementar Vizer no contrato compartilhado de chaves sondáveis; validar mídia além de HTTP 200 e cancelar leitura limitada. Implementar protocolo efetivo no resolvedor/health Saimo usando a mesma classificação das rotas de reprodução.
- [ ] Validar e usar iframeUrl preparado do Vizer/Saimo na inicialização. Não transmitir URLs upstream assinadas ao seletor.
- [ ] Executar os três arquivos de teste; exigir zero falhas e commit por contrato.

## Tarefa 3 — Impedir abandono prematuro e tentativas repetidas

**Arquivos:** `src/services/playbackStartup.ts`, `src/components/VideoPlayerModal.tsx`, `src/components/NetflixPlayerSkin.tsx`; criar `tests/playback-attempt-session.test.cjs`, ampliar `tests/playback-startup.test.cjs`.

**Interfaces propostas em playbackStartup:** `createPlaybackAttemptSession(identity: string)` retorna `begin(provider: string, sourceKey: string): boolean`, `confirmPlaying(provider: string): void`, `allowRenewal(provider: string, revision: string): boolean`, `exhausted(): boolean`. Histórico por identidade/geração; fonte identificada por chave opaca, sem URL pública. Um teste deve fixar cada transição antes de integrar ao modal.

- [ ] Testar primeira fonte funcional aos 8500ms sem fallback; autoplay bloqueado com mídia pronta deve permanecer esperando gesto; sinal de metadata/play sem avanço não encerra startup.
- [ ] Separar tempo de resolução (limite inicial 12s) e de mídia anexada (12s). Permitir uma extensão de 6s apenas com progresso recente mensurável de carregamento, com teto total de 30s por tentativa; nenhum status repetido renova prazo indefinidamente. Validar valores com o ensaio da tarefa 1 antes de fechar o commit.
- [ ] Testar todos os provedores falhando: cada fonte entra uma vez; no máximo um retry BYSE, autorizado por revisão nova de resolução efetivamente concluída. Sem revisão nova, entrar em exhausted. Somente ação manual/novo conteúdo abre nova sessão.
- [ ] Unificar startup e caminho legado na sessão de tentativas; toda troca automática usa automatic=true. Eventos de iframe anterior devem ser ignorados pela geração e vínculo do frame. Não limpar histórico só porque chegou readyState/play ou um seek para tempo salvo.
- [ ] Manter retomada pós-pausa como renovação distinta, preservando currentTime e intenção paused; recuperar sem reabrir a cadeia inteira de startup.
- [ ] Testar regressões de episódio seguinte, Continuar Assistindo, troca manual, reconexão, pausa longa e erro tardio. Executar os testes novos e os já existentes de startup/resume; commit.

## Tarefa 4 — Validar e liberar

**Arquivos:** workflow principal para testes novos; `walkthrough.md` e relatório do smoke.

- [ ] Rodar TypeScript, build frontend/backend e testes de startup, health, Saimo, Vizer, BYSE, StreamTape, MixDrop, resume e troca de episódio. Executar suíte ampla e relatar nominalmente falhas, sem ocultar baseline.
- [ ] Rodar smoke do modal completo com Matchbox, um filme BYSE confirmado, um HLS real Saimo e uma série; confirmar skin Netflix, pausa, seek e retomada. Desktop Chromium e emulação mobile não equivalem a teste Android físico.
- [ ] Aceitação: fonte Saimo funcional não é abandonada aos 7,5–9s; nenhum 400 de provedor válido; não repetir o mesmo MP4 como HLS; cadeia encerra após fontes/retry permitidos; atualizações não reiniciam vídeo em reprodução.
- [ ] Preparar diff/commits na main conforme fluxo aprovado do projeto; pedir autorização para push deste lote. Depois de autorizado/deploy concluído, conferir release e repetir os smokes da VPS, incluindo `node scripts/saimo-smoke-prod.cjs --ids 1148365 --prefer mp4 --json` e o modal completo.

## Limites atuais

Nenhuma correção de código implementada. Não há sessão/SSH configurado no ambiente para atribuir a causa exata dos 502 internos. A reprodução direta do Saimo foi confirmada em Chromium, mas a corrida do modal e o gatilho preciso das revisitas permanecem itens explícitos da tarefa 1. Não apresentar hipóteses como diagnóstico fechado desses dois pontos.
