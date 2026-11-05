# Checklist de Execução — Tratamento de Episódios Inéditos ("Em breve")

- [x] **Fase 1: Helpers Puros e TDD em `src/utils/playerIntegration.ts`**
  - [x] 1.1 Adicionar `air_date?: string` na interface `EpisodeItem`
  - [x] 1.2 Implementar `getLocalTodayDateString()`, `isEpisodeUpcoming()` e `formatEpisodeAirDate()`
  - [x] 1.3 Atualizar `computeNextEpisode()` para bloquear episódios inéditos
  - [x] 1.4 Criar suíte de testes `tests/unreleased-episodes-guard.test.cjs` (6/6 aprovados)

- [x] **Fase 2: Grade de Episódios em `src/pages/DetailsPage.tsx`**
  - [x] 2.1 Mapear `airDate: ep.air_date || null` em `currentEpisodes`
  - [x] 2.2 Desativar clique da linha para episódios inéditos (`cursor-default`)
  - [x] 2.3 Ocultar os 5 botões de ação e exibir badge `Em breve • DD/MM`

- [x] **Fase 3: Calendário de Lançamentos em `src/components/ReleaseCalendarPage.tsx`**
  - [x] 3.1 Identificar `isUpcoming` com base no status e data futura
  - [x] 3.2 Substituir botão `▶ Assistir Episódio` por badge `Em breve`

- [x] **Fase 4: Versionamento Android em `android/app/build.gradle`**
  - [x] 4.1 Incrementar `versionCode` para 82 e `versionName` para "1.4.50"

- [x] **Fase 5: Verificação, Build e Documentação**
  - [x] 5.1 Testes unitários (`node --test tests/unreleased-episodes-guard.test.cjs`: 6/6)
  - [x] 5.2 Compilação TypeScript (`npx tsc --noEmit`: 0 erros)
  - [x] 5.3 Reversão dos arquivos auto-gerados (`data/available-tmdb-ids.json`)
  - [x] 5.4 Atualizar `walkthrough.md`
