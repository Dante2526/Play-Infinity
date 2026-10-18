# Checklist de Tarefas — Otimização de Performance Geral do App (18/10/2026)

- [x] **Fase 2.3 (TDD - RED):** Criar teste automatizado `scratch/test-app-performance.mjs` validando os 5 pontos de performance e confirmar falha inicial (RED)
- [x] **Tarefa 1:** Ativar `tmdbCache` + deduplicação em `server/routes/tmdbProxy.ts` e cache em memória + deduplicação em `src/services/tmdb.ts`
- [x] **Tarefa 2:** Remover `refresh: '1'` forçado de `checkLiveAvailability` em `src/utils/mediaUtils.ts`
- [x] **Tarefa 3:** Desacoplar `viewState.type` dos `useEffect` do Firestore (`onSnapshot` e `updatePresence`) em `src/App.tsx` via `useRef`
- [x] **Tarefa 4:** Cachear lista consolidada em `/api/downloads-catalog` (`server/routes/encontreiLookup.ts`) com TTL de 10 minutos
- [x] **Tarefa 5:** Criar `getCatalogByIdMap` O(1) em `src/services/favorites.ts` e utilizar em `src/pages/HomePage.tsx`
- [x] **Fase 3 (Verificação & Code Review):** Rodar teste GREEN (`scratch/test-app-performance.mjs`), `npx tsc --noEmit`, `graphify update .`, e executar Code Review estruturado
- [x] **Fase 4 (Conclusão):** Atualizar `walkthrough.md` com resultados e evidências
