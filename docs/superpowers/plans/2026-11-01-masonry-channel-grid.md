# Masonry Channel Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o layout em colunas independentes estilo Masonry para os cards de canais em `AdminLiveChannels.tsx`, eliminando espaços verticais vazios entre cards no desktop e mantendo layout coluna única no mobile.

**Architecture:** Hook reativo de detecção de viewport (`useIsDesktop`), particionamento sequencial intercalado dos canais filtrados em duas colunas (`colLeft` e `colRight`) e renderização em dois containers verticais independentes (`space-y-3`) dentro de um grid de duas colunas.

**Tech Stack:** React 18, TypeScript, Tailwind CSS.

---

### Task 1: Hook responsivo e particionamento em 2 colunas

**Files:**
- Modify: `src/components/AdminLiveChannels.tsx`

- [ ] **Step 1: Criar hook `useIsDesktop` e divisão dos canais em `colLeft` e `colRight`**
- [ ] **Step 2: Extrair função de renderização `renderChannelCard(channel)`**
- [ ] **Step 3: Ajustar o bloco de exibição para alternar entre lista mobile e colunas desktop**
- [ ] **Step 4: Validar TypeScript com `npx tsc --noEmit`**
- [ ] **Step 5: Validar build com `npm run build`**
