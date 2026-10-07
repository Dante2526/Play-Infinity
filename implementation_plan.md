# Relato de Bugs (Bug Reporting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar um sistema de reporte de bugs onde os clientes podem anexar prints, o administrador gerencia via painel e o cliente recebe feedback visual para validação e descarte do log.

**Architecture:** O sistema utilizará `localStorage` no frontend para gerar/manter um ID único para cada dispositivo (cliente). Os dados textuais irão para o Firestore (coleção `bug_reports`) e o anexo para o Firebase Storage (`bug_reports/{id}.png`). O Painel ADM vai ler/atualizar esses logs. O frontend do cliente fará um polling passivo (ou escuta ativa) de logs "resolvidos" vinculados ao seu ID.

**Tech Stack:** React, TailwindCSS, Firebase Firestore, Firebase Storage.

## Global Constraints
- Usar idioma Português do Brasil.
- A exclusão do arquivo no Firebase Storage deve ocorrer ao mesmo tempo que o log no Firestore.
- Firebase Storage deve estar configurado na exportação.
- Regras de Firestore atualizadas para permitir essas interações (cliente anônimo precisa de permissão de escrita restrita ao seu clientId e leitura).

---

### Task 1: Configuração do Firebase e Utilitário de Cliente
**Files:**
- Modify: `src/services/firebase.ts`
- Create: `src/utils/clientId.ts`
- Modify: `firestore.rules`

**Interfaces:**
- Produces: `storage` exportado do Firebase.
- Produces: `getClientId()` utilitário.

- [ ] **Step 1: Exportar Storage do Firebase**
No `src/services/firebase.ts`:
```typescript
import { getStorage } from "firebase/storage";
export const storage = getStorage(app);
```

- [ ] **Step 2: Criar Utilitário de Identificação**
Criar `src/utils/clientId.ts` para persistir e buscar o ID do cliente.
```typescript
import { v4 as uuidv4 } from "uuid";

export const getClientId = (): string => {
  let clientId = localStorage.getItem("PLAY_INFINITY_CLIENT_ID");
  if (!clientId) {
    clientId = uuidv4();
    localStorage.setItem("PLAY_INFINITY_CLIENT_ID", clientId);
  }
  return clientId;
};
```
*(Certificar que o `uuid` está instalado, ou gerar um hash aleatório usando Math.random se não estiver)*

- [ ] **Step 3: Atualizar firestore.rules**
No `firestore.rules`, adicionar regras para `bug_reports`:
```javascript
    match /bug_reports/{reportId} {
      allow create: if request.resource.data.keys().hasAll(["clientId", "status"]) && request.resource.data.status == "pending";
      allow read, update, delete: if isAdmin() || resource.data.clientId == request.query.clientId || resource.data.clientId == request.auth.uid;
    }
```
*(A regra exata será ajustada para permitir que o cliente leia e delete seu próprio log)*

### Task 2: Componente do Modal de Reporte de Bug
**Files:**
- Create: `src/components/ReportBugModal.tsx`

**Interfaces:**
- Produces: Componente de UI `<ReportBugModal />` que recebe `mediaTitle`, `mediaId`, `episodeInfo` e `isOpen`, `onClose`.

- [ ] **Step 1: Implementar UI e Upload**
No componente, adicionar um formulário com `<textarea>` para a descrição e `<input type="file" accept="image/*">`.
Usar `uploadBytes` e `getDownloadURL` do `firebase/storage` e depois `addDoc` no `firestore`.

### Task 3: Botão de Reportar Bug nas Telas
**Files:**
- Modify: `src/pages/DetailsPage.tsx`
- Modify: `src/components/VideoPlayerModal.tsx`

- [ ] **Step 1: Inserir o botão**
Adicionar o botão de "Reportar Erro/Bug" (com ícone de bug) nessas telas. Quando clicado, abre o `ReportBugModal` passando os dados da mídia atual.

### Task 4: Aba de Relatórios no Painel ADM
**Files:**
- Modify: `src/pages/AdminPage.tsx`

- [ ] **Step 1: Adicionar visualização dos bugs**
Buscar a coleção `bug_reports` ordenada por `createdAt` desc.
Listar em cards os bugs mostrando ID, Filme/Episódio, Descrição e a Imagem.
Adicionar opções de responder com mensagens pré-definidas (ex: "Recebido e resolvido. Pode testar.").
Botão para salvar altera o `status` para `resolved` e preenche `adminResponse`.

### Task 5: Feedback para o Cliente e Limpeza
**Files:**
- Modify: `src/App.tsx` ou componente de Layout central (`src/components/ClientBugFeedback.tsx`)

- [ ] **Step 1: Criar Componente de Escuta**
Criar `ClientBugFeedback.tsx` que usa `onSnapshot` escutando a coleção `bug_reports` com `where("clientId", "==", getClientId())` e `where("status", "==", "resolved")`.
- [ ] **Step 2: Mostrar Cartão de Feedback**
Exibir ao cliente qual foi a resposta do Admin e um botão "OK, vou testar".
- [ ] **Step 3: Ação de Limpeza**
Ao clicar em "OK, vou testar", o sistema deleta o arquivo no Firebase Storage (`ref(storage, imagePath)`) e deleta o documento no Firestore (`deleteDoc`).
