# Checklist de Execução — Rastreamento de Dispositivos por Usuário no Painel Admin

- [x] **Fase 1: Serviço de Sessões de Dispositivos e Testes**
  - [x] 1.1 Criar `src/services/deviceSessionService.ts` com geração de `deviceId`, detecção de modelo/plataforma e sanitização de mapa
  - [x] 1.2 Criar testes unitários em `tests/device-sessions.test.cjs` e validar comportamento (4/4 aprovados)

- [x] **Fase 2: Integração no Ciclo de Vida da Aplicação**
  - [x] 2.1 Conectar registro de dispositivo no `onAuthStateChanged` e no heartbeat de presença em `src/App.tsx`
  - [x] 2.2 Conectar desregistro limpo do dispositivo no logout em `src/pages/UserProfilePage.tsx` sem violar `clearLocalUserData`

- [x] **Fase 3: Interface no Painel Admin**
  - [x] 3.1 Atualizar `loadStats` e tipagem `ClientUser` em `src/pages/AdminPage.tsx` para carregar `devices` e calcular contagem ativa
  - [x] 3.2 Renderizar badge `Smartphone` com contagem no card de cada usuário e drawer mobile-first com os aparelhos conectados
  - [x] 3.3 Adicionar Card 5 (Aparelhos Conectados) no dashboard executivo de métricas

- [x] **Fase 4: Verificação e Revisão**
  - [x] 4.1 Rodar suíte de testes (`node --test`: 35/35 testes do ecossistema e guards aprovados) e validação TypeScript (`npx tsc --noEmit`: 0 erros)
  - [x] 4.2 Executar Code Review formal
  - [x] 4.3 Atualizar `walkthrough.md` com evidências
