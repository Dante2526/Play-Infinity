# Notificações Push (Web e Android) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar isso tarefa por tarefa. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar sistema de notificações push manuais (Painel ADM) e automáticas (Novos episódios de séries favoritas) usando Firebase Cloud Messaging (FCM).

**Architecture:** Frontend usa `@capacitor-firebase/messaging` para gerar tokens e envia para o Firestore. Backend Node.js roda um cron job a cada 6h que checa o TMDB/Catálogo para séries favoritadas e usa `firebase-admin` para disparar as notificações push.

**Tech Stack:** React, Capacitor, Node.js, Express, Firebase Admin SDK, node-cron.

## Global Constraints
- Usar idioma Português do Brasil.
- A lógica de verificação de catálogos deve reusar os scrapers locais (ex: `encontreiCatalog.ts`).
- Não deletar ou reescrever as funções existentes de notificação em "Sininho".

---

### Task 1: Instalação e Geração de Token FCM (Frontend)

**Files:**
- Modify: `package.json`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: Dispositivo do usuário salva `fcmToken` no banco de dados Firestore (`usuarios/{uid}`).

- [ ] **Step 1: Instalar pacote do Firebase Capacitor**
```bash
npm install @capacitor-firebase/messaging
```

- [ ] **Step 2: Solicitar permissão e pegar o token no App.tsx**
No `src/App.tsx`, logo após o login ser confirmado (no listener de auth), criar a função para pedir permissão e pegar o token:
```typescript
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { updateDoc, doc } from 'firebase/firestore';

const requestPushPermission = async (userId: string) => {
  try {
    const result = await FirebaseMessaging.requestPermissions();
    if (result.receive === 'granted') {
      const tokenResult = await FirebaseMessaging.getToken();
      await updateDoc(doc(db, 'usuarios', userId), { fcmToken: tokenResult.token });
    }
  } catch (error) {
    console.warn("Push bloqueado ou não suportado:", error);
  }
};
```
*(Chamar essa função passando o `uid` do usuário).*

### Task 2: Firebase Admin e Rota de Disparo Manual (Backend)

**Files:**
- Modify: `server/firebaseAdmin.ts`
- Modify: `server/routes/adminOps.ts`

**Interfaces:**
- Consumes: `fcmToken` dos usuários lidos do Firestore.
- Produces: Endpoint `POST /api/admin/push` para disparar mensagens do painel.

- [ ] **Step 1: Exportar o serviço de mensageria**
No `server/firebaseAdmin.ts`:
```typescript
export const messaging = admin.messaging();
```

- [ ] **Step 2: Criar Rota de Envio**
No `server/routes/adminOps.ts`:
```typescript
import { messaging } from "../firebaseAdmin";

adminOpsRouter.post("/push", async (req, res) => {
  const { title, body, targetUids } = req.body;
  // Implementar busca de fcmTokens no Firestore baseado nos targetUids
  // (ou buscar todos se targetUids for vazio/todos)
  const tokens = ["mock-token-1"]; // substituir pela busca real
  
  if (tokens.length > 0) {
    const message = { notification: { title, body }, tokens };
    await messaging.sendEachForMulticast(message);
  }
  res.json({ success: true, count: tokens.length });
});
```

### Task 3: Interface no Painel ADM

**Files:**
- Modify: `src/pages/AdminPage.tsx`

**Interfaces:**
- Consumes: Endpoint `POST /api/admin/push`.

- [ ] **Step 1: Adicionar aba "Push"**
Criar um formulário simples (Título e Mensagem). Adicionar um botão "Disparar Push Global" que chama o endpoint criado no backend.

### Task 4: Cron Job de Lançamentos (Backend)

**Files:**
- Create: `server/jobs/episodeChecker.ts`
- Modify: `server.ts`

**Interfaces:**
- Consumes: Coleção `favoritos` no Firestore, API do TMDB, `getAvailableEpisodes` do `videoScrapers.ts`.
- Produces: Notificações automáticas via FCM.

- [ ] **Step 1: Instalar node-cron**
```bash
npm install node-cron
```

- [ ] **Step 2: Criar o script do robô**
No `server/jobs/episodeChecker.ts`:
```typescript
import cron from "node-cron";
import { db, messaging } from "../firebaseAdmin";
// import TMDB e Scrapers

export const startEpisodeCron = () => {
  cron.schedule("0 */6 * * *", async () => {
    console.log("[Cron] Verificando novos episódios...");
    // 1. Buscar séries com isFavorite == true no Firestore
    // 2. Fazer fetch ao TMDB para checar o último episódio ao ar
    // 3. Confirmar disponibilidade local via getAvailableEpisodes
    // 4. Buscar fcmToken dos usuários que favoritaram
    // 5. messaging.sendEachForMulticast(...)
    // 6. Atualizar a coleção eadNotifications (sininho interno)
  });
};
```

- [ ] **Step 3: Iniciar o cron**
No final do `server.ts`:
```typescript
import { startEpisodeCron } from "./jobs/episodeChecker";
startEpisodeCron();
```
