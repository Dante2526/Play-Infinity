/**
 * Lógica de decisão do gate de notificações push — PURA (sem Firebase/DOM).
 *
 * Extraída para um módulo separado para permitir teste direto sem importar o
 * módulo client completo (que depende de Firebase/Capacitor e tem side effects
 * de inicialização). O NotificationPermissionGate consome via pushNotifications.ts
 * (re-export).
 *
 * Modelagem de 3 estados no Firestore (notifPermission em usuarios/{uid}):
 *  - 'granted'   → usuário aceitou (em qualquer dispositivo).
 *  - 'dismissed' → dispensou o modal educativo ("Agora não" / X) sem decidir
 *                  no nível do navegador — pode ser re-promptado nativo após
 *                  cooldown crescente (7 → 14 → 30 dias por repeat).
 *  - 'denied'    → navegador/app BLOQUEOU no nível do sistema. O navegador
 *                  não permite re-prompt nativo — só mostrando um modal de
 *                  instruções (como desbloquear nas settings do navegador).
 *                  Reexibido a cada 30 dias.
 *
 * Extras (campos no mesmo doc):
 *  - notifDecidedAt: timestamp da última decisão (para calcular cooldown).
 *  - notifPromptCount: nº de vezes que o modal foi exibido (backoff do dismiss).
 */

export type NotifGateAction = "hidden" | "prompt" | "instructions" | "register-silent";

/**
 * Permissão reportada pelo ambiente:
 *  - 'granted' / 'denied' / 'default' → Notification.permission do navegador.
 *  - 'native'                          → app Capacitor/Android (plugin do FCM).
 */
export type BrowserPermission = "default" | "granted" | "denied" | "native";

/**
 * Backoff crescente para quem dispensou o modal: 7 → 14 → 30 dias.
 * promptCount é o nº de vezes que o modal já foi exibido (e dispensado).
 *   - 0 (ainda não exibido) ou 1 (1ª vez) → 7 dias
 *   - 2 (2ª vez)                          → 14 dias
 *   - 3+                                  → 30 dias
 */
export function dismissedCooldownMs(promptCount: number): number {
  if (promptCount <= 1) return 7 * 24 * 60 * 60 * 1000;   // 7 dias
  if (promptCount === 2) return 14 * 24 * 60 * 60 * 1000; // 14 dias
  return 30 * 24 * 60 * 60 * 1000;                          // 30 dias+
}

const DENIED_INSTRUCTIONS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

/**
 * Decide o que o NotificationPermissionGate deve fazer para este usuário.
 *
 * @param userDoc      Documento do Firestore (usuarios/{uid}) ou null. Lê:
 *                     notifPermission, notifDecidedAt, notifPromptCount.
 * @param browserPerm  Resultado de Notification.permission OU 'native' (app).
 * @param now          Timestamp atual (injetável para testes).
 * @returns Ação:
 *   - 'hidden': não mostra nada (cooldown ativo, ou desativou explicitamente).
 *   - 'prompt': mostra modal educativo → botão "Ativar" dispara prompt nativo.
 *   - 'instructions': mostra modal explicando como desbloquear nas settings do
 *                     navegador (browser bloqueou, não dá pra re-promptar nativo).
 *   - 'register-silent': browser já concedeu neste aparelho — só registra o
 *                        token FCM silenciosamente e marca 'granted'.
 */
export function decideNotifGate(
  userDoc: any,
  browserPerm: BrowserPermission,
  now: number = Date.now()
): NotifGateAction {
  // App nativo (Capacitor/Android): o plugin FirebaseMessaging.requestPermissions
  // abre o diálogo do sistema. Não há "dismissed" persistente aqui — ou concede
  // ou nega. Quem negou só reativa pelo toggle do perfil (abre settings do app).
  if (browserPerm === "native") {
    const stored = userDoc?.notifPermission;
    if (stored === "granted") return "register-silent";
    if (stored === "denied" || stored === "dismissed") return "hidden";
    return "prompt";
  }

  const perm = browserPerm;
  const stored = userDoc?.notifPermission;
  const decidedAt = Number(userDoc?.notifDecidedAt) || 0;
  const promptCount = Number(userDoc?.notifPromptCount) || 0;

  // Caso A: browser já concedeu neste aparelho.
  if (perm === "granted") {
    // Exceção: se o usuário DESATIVOU explicitamente pelo toggle do perfil
    // (notifPermission='denied' mas browser continua granted), respeitamos a
    // decisão — não re-registra token sozinho. Só reativa via toggle.
    if (stored === "denied") return "hidden";
    // Caso contrário: registra token silenciosamente e marca 'granted' no
    // Firestore (caller faz isso) — consistência entre dispositivos.
    return "register-silent";
  }

  // Caso B: browser BLOQUEOU (denied). Não dá pra re-promptar nativo.
  // Mostra modal de instruções periodicamente (cooldown 30 dias).
  if (perm === "denied") {
    if (stored === "denied" && now - decidedAt < DENIED_INSTRUCTIONS_COOLDOWN_MS) {
      return "hidden";
    }
    return "instructions";
  }

  // perm === 'default' (ainda não decidido neste browser).
  if (stored === "granted") {
    // Concedeu em outro dispositivo; neste browser ainda não decidiu.
    // Pode chamar o prompt nativo direto — modal educativo + "Ativar".
    return "prompt";
  }

  if (stored === "dismissed") {
    const cooldown = dismissedCooldownMs(promptCount);
    if (now - decidedAt < cooldown) return "hidden";
    return "prompt"; // re-prompt nativo após cooldown
  }

  if (stored === "denied") {
    // Browser 'default' mas Firestore 'denied' — outro dispositivo bloqueou,
    // OU o browser resetou permissões. Re-promptar nativo após 30 dias
    // (trata como cooldown máximo do 'dismissed').
    if (now - decidedAt < DENIED_INSTRUCTIONS_COOLDOWN_MS) return "hidden";
    return "prompt";
  }

  // Sem decisão registrada → primeira vez → mostra o modal educativo.
  return "prompt";
}
