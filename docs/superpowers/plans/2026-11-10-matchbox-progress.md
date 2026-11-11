# Execução — Matchbox

Plano: `2026-11-10-matchbox-playback.md`. Base: fd674fb. Alterações locais, sem deploy.

## Decisões

- Executado inline no checkout solicitado pelo usuário. Não houve push.
- Prazo de mídia fixo de 12s após anexação em lugar da extensão por progresso: o ensaio real chegou a dois segundos de reprodução em ~9,6s. O relógio mantém o prazo por frame, sem renovação em renders. Fontes mais lentas ainda podem precisar de política posterior.
- Removido retry BYSE externo após esgotamento: o contrato não comprova resolução nova. Renovação interna preservada. Sem anúncio falso de background concluído.
- Histórico de falhas preservado durante a sessão; ações explícitas/novo conteúdo continuam usando os resets existentes.
- O parser reconhece CONTENT_INFO e FsPlay dublado. Abyss não é selecionado. O destino FsPlay deste filme respondeu 404/Vídeo Offline em host novo com caminho `/bounce/...`, fora do formato HLS suportado. Não adicionar player/domínio automaticamente nem afirmar recuperação desse arquivo externo.

## Implementado

- Health Vizer aceita a chave, resolve filme/série corretamente, verifica mídia e prepara iframe same-origin. Falha do resolver vira `unknown/vizer_resolve_STATUS`, não erro 400 de chave inválida.
- Vizer reconhece HTML atual e escolhe FsPlay PT-BR; preserva caminho legado. Cancelamento do health interrompe fetches do resolver. JSON retorna 502 com reason estável em falha de resolução, em vez de 404 genérico.
- Health informa mediaKind pelos bytes e normaliza prefer do iframe Saimo. Seleção elimina alias legado/variante ausente e não repete variantes confirmadas como mesmo protocolo efetivo.
- Trocas automáticas preservam o plano. Prontidão sem avanço não marca healthPlaybackStarted; sinais curtos não limpam histórico.
- Revisão independente apontou deduplicação efetiva, retry BYSE e cancelamento de Vizer; ajustes aplicados e testes direcionados aprovados.

## Validação e limites

- 58 testes direcionados aprovados: startup, health, parser/cancelamento Vizer, integração, retomada e Saimo. TypeScript aprovado.
- Build Vite/backend repetido e aprovado após os ajustes finais; seis avisos de bundling, sem erro de compilação.
- Suíte ampla na primeira rodada: 699 testes, 668 aprovados, 21 pulados, 10 falhas. Cinco embed-probe-guard, dois guards de canais, um guard de iframe e dois testes Vizer com rede real sem proxy. Seis reproduzidas na base HEAD (embed/iframe); demais não corrigidas neste escopo. Não declarar suíte toda verde.
- Produção: Saimo reproduziu nos iframes em Chromium; FsPlay retornou 404 Vídeo Offline. Código local ainda não implantado.
- Validação adicional do modal real e NetflixPlayerSkin com APIs/fontes simuladas no limite HTTP, Firebase sem conta: fonte lenta aos 8500ms permanece selecionada; falha Saimo avança a StreamTape; falha total encerra sete provedores sem repetição. Em viewport mobile emulada, pausa/retomada funcionam pelos botões reais. Script reproduzível: `scripts/matchbox-playback-smoke.cjs` (requer build CSS em dist e Playwright/Chromium disponíveis; PLAYWRIGHT_MODULE/CHROMIUM_PATH configuráveis). Não equivale a teste autenticado em produção nem aparelho Android físico.
- Sem logs internos/VPS para identificar causa específica dos 502 BYSE/MixDrop/StreamTape.
- Formato novo `/bounce/...` e indisponibilidade externa continuam não resolvidos. Saimo é a fonte funcional do filme; não garantir disponibilidade permanente de terceiros.
