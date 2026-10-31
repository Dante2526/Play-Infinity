import { getAdminDb, getAdminMessaging } from "../firebaseAdmin";

/**
 * Watcher de INADIMPLENTES (retenção) — push de "saudação" convidando o
 * usuário com assinatura vencida a voltar e reativar.
 *
 * Critério de inadimplente (espelha deriveStatus de subscriptionStatus.ts):
 *  - Já foi assinante (tem dataExpiracao OU assinatura INATIVA/EXPIRADA), E
 *  - hoje está sem acesso premium (vencida/inativa), E
 *  - não é vitalício (tipoAcesso vitalicio nunca expira).
 *  Nunca assinou (trial/free sem histórico) → fora do público.
 *
 * Anti-spam: cooldown de 3 DIAS por usuário (lastDunningPushAt no Firestore),
 * máximo de 200 usuários por ciclo (ordenados pelos que fazem mais tempo que
 * não recebem). Ciclo a cada 12h.
 *
 * Público: apenas quem tem notifPermission === 'granted' com tokens FCM —
 * quem recusou notificações nunca é incomodado.
 */
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h
const PER_USER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias
const MAX_USERS_PER_CYCLE = 200;

export interface DunningCandidate {
  docId: string;
  tokens: string[];
  firstName: string | null;
  lastDunningPushAt: number;
}

/**
 * Função pura: o usuário deste doc Firestore é inadimplente (ex-assinante
 * vencido, não vitalício)? Testável sem Firebase.
 */
export function isDelinquentUser(data: any, now = Date.now()): boolean {
  if (!data) return false;

  // Vitalício nunca expira — nunca é cobrado.
  const tipoAcesso = String(data.tipoAcesso || data.accessType || "").toLowerCase();
  if (tipoAcesso === "vitalicio" || tipoAcesso === "vitalício") return false;

  // Explicitamente ativo E dentro da validade → em dia.
  const isExplicitlyActive = data.subscription === "ACTIVE" || data.assinatura === "ATIVA";
  const expDateStr = data.dataExpiracao || data.expirationDate;
  let isExpired = false;
  if (expDateStr) {
    const expDate = new Date(expDateStr);
    if (!isNaN(expDate.getTime()) && expDate.getFullYear() < 2099) {
      isExpired = expDate.getTime() <= now;
    }
  }
  if (isExplicitlyActive && !isExpired) return false;

  // Precisa ter histórico de assinatura (ex-assinante):
  const hasExpirationHistory = Boolean(expDateStr);
  const inactiveSubscription =
    data.assinatura === "INATIVA" || data.assinatura === "EXPIRADA" ||
    data.subscription === "INACTIVE" || data.subscription === "EXPIRED";
  if (!hasExpirationHistory && !inactiveSubscription) return false;

  // Sem data de expiração e com assinatura inativa → inadimplente
  // (cancelado/revogado). Com data → só conta se já venceu.
  if (!hasExpirationHistory) return true;
  return isExpired;
}

/**
 * Função pura: monta a mensagem de retenção. Nome (primeiro nome) quando
 * disponível deixa a saudação mais pessoal.
 */
export function buildDunningMessage(firstName: string | null): { title: string; body: string } {
  const saudacao = firstName ? `Sentimos sua falta, ${firstName}!` : "Sentimos sua falta!";
  return {
    title: `👋 ${saudacao}`,
    body: "Sua assinatura do Play Infinity está inativa, mas o seu lugar aqui continua guardado — filmes, séries e TV ao vivo esperando por você. Toque para voltar e reativar seu acesso!",
  };
}

function extractTokens(data: any): string[] {
  const tokens = new Set<string>();
  if (typeof data.fcmToken === "string" && data.fcmToken.trim()) tokens.add(data.fcmToken.trim());
  if (Array.isArray(data.fcmTokens)) {
    for (const t of data.fcmTokens) {
      if (typeof t === "string" && t.trim()) tokens.add(t.trim());
    }
  }
  return [...tokens];
}

function extractFirstName(data: any): string | null {
  const name = data.nome || data.name || (typeof data.email === "string" ? data.email.split("@")[0] : "");
  const first = String(name || "").trim().split(/\s+/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export async function checkDunningUsers(): Promise<void> {
  try {
    const db = getAdminDb();
    const messaging = getAdminMessaging();
    if (!db || !messaging) {
      console.warn("[Dunning] Firebase Admin indisponível: watcher de inadimplentes pulado.");
      return;
    }

    const now = Date.now();
    const snapshot = await db.collection("usuarios").get();

    const candidates: DunningCandidate[] = [];
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (data.notifPermission !== "granted") continue; // só quem aceitou push
      if (!isDelinquentUser(data, now)) continue;       // só ex-assinantes vencidos
      const tokens = extractTokens(data);
      if (tokens.length === 0) continue;                 // precisa de dispositivo

      const lastDunningPushAt = Number(data.lastDunningPushAt) || 0;
      if (now - lastDunningPushAt < PER_USER_COOLDOWN_MS) continue; // respeita cooldown

      candidates.push({
        docId: docSnap.id,
        tokens,
        firstName: extractFirstName(data),
        lastDunningPushAt,
      });
    }

    if (candidates.length === 0) {
      console.log("[Dunning] Nenhum inadimplente elegível para push de retenção neste ciclo.");
      return;
    }

    // Prioriza quem faz mais tempo sem receber (ordenado pelo último push).
    candidates.sort((a, b) => a.lastDunningPushAt - b.lastDunningPushAt);
    const batch = candidates.slice(0, MAX_USERS_PER_CYCLE);

    console.log(`[Dunning] Enviando push de retenção para ${batch.length} inadimplente(s) (${candidates.length - batch.length} aguardam próximos ciclos).`);

    let sent = 0;
    for (const candidate of batch) {
      try {
        const message = buildDunningMessage(candidate.firstName);
        const payload = {
          notification: { title: message.title, body: message.body },
          webpush: {
            notification: { icon: "/logo.png", badge: "/favicon.png" },
            fcmOptions: { link: "https://play-infinity.stream" },
          },
          tokens: candidate.tokens,
        };
        const response = await messaging.sendEachForMulticast(payload as any);
        sent += response.successCount;
        // Registra o envio (cooldown de 3 dias) mesmo que parcial — evita
        // martelar quem tem só token morto a cada ciclo.
        await db.collection("usuarios").doc(candidate.docId).update({
          lastDunningPushAt: now,
        }).catch(() => undefined);
      } catch (err) {
        console.warn(`[Dunning] Falha no push para ${candidate.docId}:`, (err as Error).message);
      }
    }

    console.log(`[Dunning] Pushes de retenção enviados: ${sent} dispositivos alcançados.`);
  } catch (err) {
    console.error("[Dunning] Erro no watcher de inadimplentes:", err);
  }
}

export function startDunningWatcher(): void {
  console.log("[Dunning] Iniciando watcher de inadimplentes (push de saudação/retenção a cada 3 dias por usuário)...");
  setTimeout(() => void checkDunningUsers(), 90000); // 90s após boot
  setInterval(() => void checkDunningUsers(), CHECK_INTERVAL_MS);
}
