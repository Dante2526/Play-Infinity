# Checklist de Execução — Curadoria Oficial do Premiere 7 HD

- [x] **Fase 1: Configuração do Canal e Proxy**
  - [x] 1.1 Testar e validar a Fonte 1 FHD do Premiere 7 (`cdn13embed.xyz/premiere7/index.m3u8`) com referer `embedcanaisdetv.xyz`
  - [x] 1.2 Gerar URL assinada HMAC-SHA256 para `/api/live-stream-proxy`
  - [x] 1.3 Configurar `lockServers: true` e a fonte oficial única no canal `premiere-7` em `src/data/liveChannels.ts`

- [x] **Fase 2: Testes e Guardas**
  - [x] 2.1 Atualizar `tests/external-catalog.test.cjs` para refletir `premiere-7` curado
  - [x] 2.2 Executar suíte de testes (`node --test`) e checagem TypeScript (`npx tsc --noEmit`)

- [x] **Fase 3: Verificação e Build**
  - [x] 3.1 Executar `npm run build`
  - [x] 3.2 Atualizar `walkthrough.md`
  - [x] 3.3 Atualizar grafo de conhecimento (`graphify update .`)
