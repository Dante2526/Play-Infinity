# Checklist de Execução — Download Web (MP4 no dispositivo) vs App Android (Offline no app)

- [x] **Fase 1: Ajuste no serviço de Download (`src/services/downloadService.ts`)**
  - [x] 1.1 Importar `Capacitor` de `@capacitor/core`
  - [x] 1.2 No Web (`!Capacitor.isNativePlatform()`): disparar download real do `.mp4` via browser (`<a download>` para `/api/download?url=...&filename=...`), registrando em `recordDownload` e barra visual
  - [x] 1.3 No Android (`Capacitor.isNativePlatform()`): manter stream `fetch` por chunks e armazenamento privado em `Directory.Data` via `saveBlob`

- [x] **Fase 2: Ajuste na interface de Downloads (`src/pages/DownloadsPage.tsx`)**
  - [x] 2.1 Importar `Capacitor` de `@capacitor/core`
  - [x] 2.2 Adaptar badges e botões: "MP4 Baixado no Dispositivo" / "Baixar MP4" no Web vs "Offline pronto" / "Baixar no App" no Android

- [x] **Fase 3: Versionamento Android (`android/app/build.gradle`)**
  - [x] 3.1 Incrementar `versionCode` para 98 e `versionName` para "1.4.66"

- [x] **Fase 4: Verificação Síncrona e Documentação**
  - [x] 4.1 Validar tipagem com `npx tsc --noEmit` (0 erros)
  - [x] 4.2 Atualizar `walkthrough.md`
