# Plano Plus (Download Paywall) Design Spec

## Overview
A new premium tier ("Plano Plus") costing R$ 20,00/month is being introduced to monetize the Download feature. Currently, users are either on Free or Premium (R$ 9,90 or R$ 13,00). When a user clicks "Baixar" on a movie/series, they will be prompted to upgrade to the Plus plan if they aren't already subscribed. "Vitalício" users bypass this paywall and get the feature for free.

## Architecture & Data Flow

1. **State Modifications (`useSubscription.ts`)**:
   - Add `isPlus` and `isVitalicio` boolean flags to the derived state.
   - `isPlus`: True if `data.plano === "plus"`.
   - `isVitalicio`: True if `data.tipoAcesso === "vitalicio"`.

2. **Trigger (`DetailsPage.tsx`)**:
   - The "Baixar" button will check: `if (!isPlus && !isVitalicio)`.
   - If true, instead of starting the download, it opens `<DownloadPlusModal />`.

3. **New Component (`DownloadPlusModal.tsx`)**:
   - Visual: Must be distinctly different from the standard `PaywallModal` (e.g., Purple/Blue styling to indicate a higher tier).
   - Logic:
     - Check current plan price (`user.valorMensalidade`).
     - If user is Premium, calculate the upgrade difference (`20 - currentPrice`). Display: "Pague apenas a diferença de R$ X agora".
     - If user is Free, display standard R$ 20,00.
   - Checkout Flow: Re-use the existing PIX generation logic (from `PaywallModal`) but pass the dynamically calculated difference value for the current checkout. Next month's recurrence value is updated to 20 in the database.

4. **Firebase Updates**:
   - Upon successful payment simulation/generation, the user's document must update:
     - `plano: "plus"`
     - `valorMensalidade: 20`

## Edge Cases & Error Handling
- Legacy users without a defined `valorMensalidade` default to 9.90.
- Pix generation must use the exact difference to avoid overcharging.
