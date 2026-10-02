# Design de Sistema: Notificações Push (Web e Android)

**Data:** 01/10/2026
**Status:** Aguardando implementação futura (Brainstorming concluído)

## Objetivo
Criar uma plataforma de notificações push integrada ao Play Infinity. O sistema deve permitir o disparo manual de mensagens (via painel Admin) e envios automatizados (ex: quando sair episódio de série), alcançando usuários pelo navegador web e pelo aplicativo Android (Capacitor).

## Decisões Arquiteturais

1. **Provedor de Push: Firebase Cloud Messaging (FCM)**
   - Escolhido por ser a solução nativa e oficial do ecossistema Android, gratuito e de baixa sobrecarga no aplicativo.
   - Será implementado usando o plugin do Firebase para Capacitor no frontend/app.

2. **Orquestrador/Disparador: Backend da VPS (Oracle)**
   - Rejeitou-se o GitHub Actions devido à altíssima latência (segundos/minutos) para disparos manuais e pela falta de confiabilidade do agendador (`cron`) em filas públicas.
   - O backend Node.js existente rodando sob PM2 na VPS será responsável por receber comandos do Admin e acionar a API do Firebase (Firebase Admin SDK).
   - As tarefas automáticas (agendadas) serão rodadas diretamente por um script/cron interno (ex: `node-cron`) no mesmo servidor Node.js.

## Roteiro de Implementação (Futuro)

1. **Configuração Firebase:**
   - Criar projeto no Firebase Console.
   - Configurar o aplicativo Android (gerar e incluir `google-services.json`).
   - Gerar Chave de Conta de Serviço (Service Account JSON) para o backend.

2. **Frontend e App (Capacitor + React):**
   - Instalar dependências (`@capacitor-firebase/messaging` ou similar).
   - Solicitar permissão de notificação nativa/web ao usuário após o login.
   - Resgatar o token do FCM do dispositivo/navegador e enviá-lo para o backend (salvar no perfil do usuário no BD).

3. **Backend (VPS):**
   - Configurar Firebase Admin SDK no Node.js.
   - Criar rota protegida no `adminOps.ts` ou arquivo novo `notifications.ts` para receber a mensagem digitada pelo Admin e disparar.
   - Criar serviço interno (`cron`) varrendo atualizações do catálogo para disparos automáticos.

4. **Painel Admin:**
   - Adicionar interface no `AdminPage.tsx` com campo de texto e botão para enviar notificação em massa ou para usuários específicos.
