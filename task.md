# Checklist de Execução — Sistema de Auto-Atualização de Tokens Ao Vivo

- [x] **Fase 1: Serviço de Monitoramento de Tokens (`server/services/saimoLiveTokenWatcher.ts`)**
  - [x] 1.1 Criar `server/services/saimoLiveTokenWatcher.ts` com parser de canais/fontes, extração de hashes `s25-cloudfront-net.lat`, cache em memória e sincronização periódica (20 min)
  - [x] 1.2 Implementar método de auto-cura on-demand com debounce (`forceTokenRefresh`)
  - [x] 1.3 Criar testes unitários em `tests/saimo-live-token-watcher.test.cjs` e validar com `node --test` (4/4 passando)

- [x] **Fase 2: Endpoint Dinâmico de Transmissão (`server/routes/saimoLiveRoutes.ts`)**
  - [x] 2.1 Criar rota `GET /api/saimo-source` com validação de parâmetros, resolução de URL dinâmica e redirect 302 assinado
  - [x] 2.2 Registrar rota em `server.ts`
  - [x] 2.3 Validar endpoint com testes unitários e de integração (Status 302 e 200 JSON validados)

- [x] **Fase 3: Auto-Cura no Proxy de Transmissão (`server/routes/videoScrapers.ts`)**
  - [x] 3.1 Adicionar interceptação de 404 em upstream `s25-cloudfront-net.lat` no `/api/live-stream-proxy`
  - [x] 3.2 Conectar re-tentativa transparente com novo token re-sincronizado

- [x] **Fase 4: Migração dos Canais Curados (`src/data/liveChannels.ts`)**
  - [x] 4.1 Atualizar `premiere-1`, `premiere-2`, `sportv-2` para usar o endpoint dinâmico no Servidor 2
  - [x] 4.2 Atualizar badges de visualização no painel admin (`src/components/AdminLiveChannels.tsx`)

- [x] **Fase 5: Verificação e Build**
  - [x] 5.1 Executar suíte completa de testes (`node --test`: 109/109 aprovados)
  - [x] 5.2 Executar checagem TypeScript (`npx tsc --noEmit`: 0 erros)
  - [x] 5.3 Executar build de produção (`npm run build`: sucesso)
  - [x] 5.4 Atualizar `walkthrough.md` e sincronizar grafo (`graphify update .`)
