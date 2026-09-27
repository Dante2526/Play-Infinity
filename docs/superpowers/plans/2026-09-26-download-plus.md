# Plano Plus (Download) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "Plano Plus" (R$ 20,00) paywall modal for downloads with math to charge only the upgrade difference for existing Premium users.

**Architecture:** Modifies `useSubscription` to expose `isPlus` and `isVitalicio`. Modifies `DetailsPage` download button to trigger `<DownloadPlusModal />`. The modal handles PIX logic and calculates `20 - userCurrentPrice`.

**Tech Stack:** React, TailwindCSS, Firebase

## Global Constraints
- React components use TailwindCSS.
- Target files: `src/hooks/useSubscription.ts`, `src/components/DownloadPlusModal.tsx`, `src/pages/DetailsPage.tsx`.

---

### Task 1: Update useSubscription hook

**Files:**
- Modify: `src/hooks/useSubscription.ts`

**Interfaces:**
- Produces: `isPlus` (boolean), `isVitalicio` (boolean) exported from `useSubscription()`

- [ ] **Step 1: Expand interface and derive status**
Modify `DerivedUserStatus` and `deriveStatus` function to include `isPlus` and `isVitalicio`.

```typescript
// Inside src/hooks/useSubscription.ts
interface DerivedUserStatus {
  isPremium: boolean;
  trial: TrialStatus;
  isPlus: boolean;
  isVitalicio: boolean;
}
```

- [ ] **Step 2: Update deriveStatus function logic**
Read `data.plano` and `data.tipoAcesso` from the Firestore data.

```typescript
// Add inside deriveStatus(data: any): DerivedUserStatus
  const isPlus = data.plano === "plus";
  const isVitalicio = data.tipoAcesso === "vitalicio" || data.tipoAcesso === "vitalício";

  return {
    isPremium,
    trial: { ... },
    isPlus,
    isVitalicio,
  };
```

- [ ] **Step 3: Expose new states in hook**
Add `isPlus` and `isVitalicio` states to `useSubscription`.

```typescript
  const [isPlus, setIsPlus] = useState<boolean>(false);
  const [isVitalicio, setIsVitalicio] = useState<boolean>(false);

  // inside applyStatus:
  setIsPlus(status.isPlus);
  setIsVitalicio(status.isVitalicio);

  // returned object:
  return { isPremium, trial, isPlus, isVitalicio, loading, startTrial };
```

---

### Task 2: Create DownloadPlusModal component

**Files:**
- Create: `src/components/DownloadPlusModal.tsx`

**Interfaces:**
- Consumes: `useSubscription`

- [ ] **Step 1: Scaffold component**
Create the new modal with purple/indigo branding to distinguish from standard Premium.

```tsx
// src/components/DownloadPlusModal.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Download, Zap, Crown } from 'lucide-react';
import { auth, db } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useSubscription } from '../hooks/useSubscription';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function DownloadPlusModal({ isOpen, onClose }: Props) {
  const [step, setStep] = useState<'intro' | 'checkout'>('intro');
  const [currentFee, setCurrentFee] = useState<number>(0);
  const { isPremium, isPlus, isVitalicio } = useSubscription();

  const plusFee = 20.00;
  const diff = Math.max(0, plusFee - currentFee);
  const isUpgrade = isPremium && diff > 0 && diff < plusFee;
  const displayPrice = isUpgrade ? diff : plusFee;

  useEffect(() => {
    if (isOpen && (isPlus || isVitalicio)) {
      onClose(); // Já tem acesso
    }
  }, [isOpen, isPlus, isVitalicio]);

  useEffect(() => {
    if (isOpen && auth.currentUser) {
      getDoc(doc(db, "usuarios", auth.currentUser.uid)).then((d) => {
        if (d.exists()) {
          const val = d.data().valorMensalidade;
          setCurrentFee(typeof val === 'number' ? val : (String(val).includes("13") ? 13 : 9.90));
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-gradient-to-br from-indigo-950 to-purple-900 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-indigo-500/30">
          
          <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white"><X className="w-6 h-6" /></button>
          
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-500/50">
              <Download className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Desbloqueie o Plano Plus</h2>
            <p className="text-indigo-200 mb-6 text-sm">Baixe filmes e séries para assistir offline, sem limites.</p>

            <div className="bg-black/40 rounded-xl p-4 mb-6 border border-white/5 text-left">
              {isUpgrade ? (
                <>
                  <p className="text-sm text-neutral-400">Você já é Premium (R$ {currentFee.toFixed(2).replace('.', ',')})</p>
                  <div className="text-2xl font-bold text-white mt-1">
                    Upgrade por apenas <span className="text-green-400">R$ {displayPrice.toFixed(2).replace('.', ',')}</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">Nos próximos meses, sua assinatura passará a ser R$ 20,00.</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-neutral-400">Assinatura Plus Completa</p>
                  <div className="text-3xl font-bold text-white mt-1">R$ 20,00<span className="text-lg text-neutral-500 font-normal">/mês</span></div>
                </>
              )}
            </div>

            <button onClick={() => setStep('checkout')} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2">
              <Zap className="w-5 h-5" /> Quero o Plano Plus
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
```
*(Note: Full Pix logic replication omitted here for brevity, to be added during Task execution by copying from PaywallModal)*

---

### Task 3: Integrate Modal in DetailsPage

**Files:**
- Modify: `src/pages/DetailsPage.tsx`

**Interfaces:**
- Consumes: `<DownloadPlusModal />` and `useSubscription()`

- [ ] **Step 1: Import new dependencies**

```tsx
// src/pages/DetailsPage.tsx
import { useSubscription } from "../hooks/useSubscription";
import { DownloadPlusModal } from "../components/DownloadPlusModal";
```

- [ ] **Step 2: Add state and hook call**

```tsx
// Inside DetailsPage component
  const { isPlus, isVitalicio } = useSubscription();
  const [isPlusModalOpen, setIsPlusModalOpen] = useState(false);
```

- [ ] **Step 3: Update download button logic**
Change the `onClick` handler of the Download button around line 687.

```tsx
                      onClick={() => {
                        if (!movieDownloadInfo.directDownloadUrl) return;
                        if (!isPlus && !isVitalicio) {
                          setIsPlusModalOpen(true);
                          return;
                        }
                        setIsDownloading(true);
                        // ... triggerDirectDownload logic remains exactly the same ...
```

- [ ] **Step 4: Render modal**
Add `<DownloadPlusModal />` at the end of the `DetailsPage` return block.

```tsx
      {/* Modais */}
      <DownloadPlusModal isOpen={isPlusModalOpen} onClose={() => setIsPlusModalOpen(false)} />
      <VideoPlayerModal ... />
```
