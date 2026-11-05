# Checklist de Execução — Filtro de Canais com Referer e CazéTV 1

- [x] **Fase 1: Curadoria do CazéTV 1**
  - [x] 1.1 Configurar `lockServers: true` em `src/data/liveChannels.ts` com Servidor 1 (Saimo FHD) e Servidor 2 (`/api/saimo-source?channel=cazetv&source=2`), removendo servidores inoperantes
  - [x] 1.2 Adicionar alias `cazetv` em `server/services/saimoLiveTokenWatcher.ts`

- [x] **Fase 2: Filtro Global de Canais e Fontes com Referer**
  - [x] 2.1 Adicionar filtro em `getPublicLiveChannels()` em `server/services/externalCatalog.ts` para publicar apenas canais com fontes que possuem `referer`
  - [x] 2.2 Adicionar filtro em `resolveExternalChannel()` para considerar apenas fontes com `referer`

- [x] **Fase 3: Sincronização do Catálogo Local**
  - [x] 3.1 Sincronizar `data/external-channels.txt` com a base remota mais recente da Saimo TV

- [x] **Fase 4: Atualização de Testes Automatizados**
  - [x] 4.1 Atualizar `tests/minhatela-catalog.test.cjs` reconhecendo `cazetv` com `lockServers: true` e mantendo cobertura de canais destravados
  - [x] 4.2 Atualizar `tests/external-catalog.test.cjs` com testes do novo filtro de referer

- [x] **Fase 5: Verificação, Build e Conclusão**
  - [x] 5.1 Executar testes unitários automatizados (`node --test`: 82/82 aprovados)
  - [x] 5.2 Executar checagem TypeScript (`npx tsc --noEmit`: 0 erros)
  - [x] 5.3 Executar build de produção (`npm run build`: sucesso)
  - [x] 5.4 Atualizar `walkthrough.md`
