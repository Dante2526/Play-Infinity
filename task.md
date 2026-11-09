# Checklist de Execução — Blindagem do Capacitor + APK Direto via VPS (Anti-Demora da Play Store)

- [x] **Fase 1: Ponte Nativa e Anti-Cache Android (`StatusBarPlugin.java` e `MainActivity.java`)**
  - [x] 1.1 Adicionar em `StatusBarPlugin.java`: `hideActionBar`, `setWindowPadding`, `clearWebViewCache`, `openExternalUrl` e retornar `versionCode` / `versionName` no `getInfo`
  - [x] 1.2 Atualizar `MainActivity.java`: ocultar programmaticamente qualquer ActionBar nativa, configurar `WebSettings.LOAD_DEFAULT`, anexar `PlayInfinityApp/<ver>` no User-Agent e suportar override de insets
  - [x] 1.3 Atualizar interface JS e mocks em `src/utils/statusBar.ts`

- [x] **Fase 2: Distribuição Direta de APK na VPS (`server.ts` e `build-android.yml`)**
  - [x] 2.1 Adicionar rotas no `server.ts`: `GET /api/app-version` e `GET /app.apk`
  - [x] 2.2 Atualizar `.github/workflows/build-android.yml` para compilar também o `assembleRelease` (APK) e enviar para a VPS via SCP / artifact

- [x] **Fase 3: Detecção de Versão Antiga e Banner de Atualização no App**
  - [x] 3.1 Criar componente `src/components/AppUpdateBanner.tsx`
  - [x] 3.2 Integrar no `src/App.tsx` chamando `StatusBar.hideActionBar()` no boot e exibindo o aviso caso o APK nativo esteja desatualizado (< 87 com barra preta)

- [x] **Fase 4: Versionamento Android (`android/app/build.gradle`)**
  - [x] 4.1 Incrementar `versionCode` para 99 e `versionName` para "1.4.67"

- [x] **Fase 5: Verificação Síncrona e Documentação**
  - [x] 5.1 Validar tipagem com `npx tsc --noEmit` (0 erros)
  - [x] 5.2 Testes automatizados (`node --test tests/public-frontend.test.cjs`: 4/4 aprovados)
  - [x] 5.3 Atualizar `walkthrough.md`
