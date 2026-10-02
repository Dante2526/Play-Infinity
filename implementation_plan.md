# Plano de Implementação: Monitoramento do Robô Ampere

## 1. Modificações no Backend (`server/routes/adminOps.ts`)
- Adicionar uma nova rota `GET /api/admin/vps-bot-logs`.
- Utilizar a função existente `executeSshCommand` para conectar à VPS e ler as últimas 30 linhas do arquivo de log do PM2 correspondente ao bot de criação.
- Comando a ser executado via SSH: `tail -n 30 /home/ubuntu/.pm2/logs/ampere-creator-out.log`.
- Retornar o conteúdo formatado como string dentro de um JSON `{ success: true, logs: "..." }`. Em caso de falha, retornar erro tratado.

## 2. Modificações no Frontend (`src/components/AdminDeployMonitor.tsx`)
- **Estado (State):** Criar `botLogs` (string), `botLoading` (boolean) e `botError` (string | null).
- **Lógica de Fetch:** Criar uma função `fetchBotLogs()` que consome o endpoint `/api/admin/vps-bot-logs`.
- **Integração no Auto-Refresh:** Incluir a chamada a `fetchBotLogs()` dentro do `setInterval` principal do componente, que atualiza a cada 10 segundos (ou 4s durante deploy).
- **Interface Gráfica (UI):** 
  - Adicionar um novo painel/card "Robô de Criação VPS (Ampere)" logo abaixo das seções de Status de Deploy e Status da VPS.
  - O conteúdo dos logs será exibido dentro de uma div estilo "terminal de linha de comando" (`bg-black`, `font-mono`, `text-green-400`), com `overflow-y-auto` para rolagem.
  - O painel incluirá um botão de atualizar manualmente e indicativo de "Auto-refresh".

## 3. Fluxo de Execução
- 1. Modificar o backend (`adminOps.ts`).
- 2. Modificar o frontend (`AdminDeployMonitor.tsx`).
- 3. Executar o TS checker localmente.
- 4. Concluir a task atualizando os arquivos de acompanhamento.
