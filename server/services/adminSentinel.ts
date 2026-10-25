import { getAdminDb, getAdminMessaging, getAdminFieldValue } from "../firebaseAdmin";
import { probeLiveStreamUrl } from "../routes/iptv";
import { getEncontreiResolverStatus } from "../routes/encontreiLookup";
import { INITIAL_LIVE_CHANNELS } from "../../src/data/liveChannels";

export interface SentinelAlert {
  id: string;
  category: "tv" | "bug" | "scraper" | "deploy" | "system";
  title: string;
  message: string;
  level: "info" | "warning" | "error";
  actionTab: "channels" | "bugs" | "health" | "deploy" | "users";
  actionUrl: string;
  detectedAt: number;
  metadata?: Record<string, any>;
}

export interface SentinelStatus {
  mood: "happy" | "warning" | "alert";
  activeAlerts: SentinelAlert[];
  lastCheckTime: number;
  monitoredCounts: {
    channelsTotal: number;
    channelsDown: number;
    pendingBugs: number;
    cookieOk: boolean;
    activeAdmins: number;
  };
  isProbing: boolean;
}

// Estado em memória do Sentinela
const activeAlerts = new Map<string, SentinelAlert>();
const notifiedHistory = new Map<string, number>(); // alertId -> timestamp do último push enviado
const PUSH_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 horas de intervalo anti-spam para o mesmo alerta

let isProbing = false;
let lastCheckTime = 0;
let lastMonitoredCounts = {
  channelsTotal: INITIAL_LIVE_CHANNELS.length,
  channelsDown: 0,
  pendingBugs: 0,
  cookieOk: true,
  activeAdmins: 0,
};

const MASTER_ADMIN_EMAILS = ["naylanmoreira350@gmail.com", "cbeth761@gmail.com"];

/**
 * Retorna o status atual e humor do mascote Guardião
 */
export function getSentinelStatus(): SentinelStatus {
  const alertsList = Array.from(activeAlerts.values()).sort((a, b) => {
    // Erros têm prioridade sobre avisos
    if (a.level === "error" && b.level !== "error") return -1;
    if (a.level !== "error" && b.level === "error") return 1;
    return b.detectedAt - a.detectedAt;
  });

  let mood: "happy" | "warning" | "alert" = "happy";
  if (alertsList.some((a) => a.level === "error")) {
    mood = "alert";
  } else if (alertsList.length > 0) {
    mood = "warning";
  }

  return {
    mood,
    activeAlerts: alertsList,
    lastCheckTime,
    monitoredCounts: { ...lastMonitoredCounts },
    isProbing,
  };
}

/**
 * Registra o token FCM de um dispositivo administrador para push do mascote
 */
export async function registerAdminPushToken(token: string, userEmail?: string): Promise<boolean> {
  if (!token || typeof token !== "string" || !token.trim()) return false;
  const cleanToken = token.trim();
  const db = getAdminDb();
  if (!db) return false;

  try {
    const FieldValue = getAdminFieldValue();
    const arrayUnion = FieldValue ? FieldValue.arrayUnion : (val: any) => [val];

    // 1. Salva no documento global de tokens administrativos
    const settingsRef = db.collection("system_settings").doc("admin_push_tokens");
    await settingsRef.set(
      {
        tokens: arrayUnion(cleanToken),
        updatedAt: Date.now(),
        lastAdminEmail: userEmail || "unknown",
      },
      { merge: true }
    );

    // 2. Se temos o e-mail do admin, marca também no documento do usuário
    if (userEmail) {
      const snap = await db.collection("usuarios").where("email", "==", userEmail.toLowerCase().trim()).limit(1).get();
      if (!snap.empty) {
        await snap.docs[0].ref.update({
          isAdminDevice: true,
          fcmTokens: arrayUnion(cleanToken),
          fcmToken: cleanToken,
          fcmTokenUpdatedAt: Date.now(),
        });
      }
    }

    console.log(`[AdminSentinel] Token de push do administrador registrado com sucesso (${cleanToken.slice(0, 15)}...)`);
    return true;
  } catch (err: any) {
    console.warn("[AdminSentinel] Falha ao registrar token push de admin:", err?.message || err);
    return false;
  }
}

/**
 * Coleta todos os tokens FCM exclusivos dos administradores
 */
export async function getAdminPushTokens(): Promise<string[]> {
  const db = getAdminDb();
  if (!db) return [];

  const tokens = new Set<string>();

  try {
    // 1. Documento centralizado de tokens de admin
    const settingsDoc = await db.collection("system_settings").doc("admin_push_tokens").get();
    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      if (Array.isArray(data?.tokens)) {
        for (const t of data.tokens) {
          if (typeof t === "string" && t.trim()) tokens.add(t.trim());
        }
      }
    }
  } catch (err: any) {
    console.warn("[AdminSentinel] Falha ao ler system_settings/admin_push_tokens:", err?.message);
  }

  try {
    // 2. Busca também nos documentos dos usuários administradores cadastrados
    const snap = await db.collection("usuarios")
      .where("email", "in", MASTER_ADMIN_EMAILS)
      .select("fcmToken", "fcmTokens", "isAdminDevice")
      .get();

    snap.forEach((docSnap: any) => {
      const data = docSnap.data();
      if (typeof data?.fcmToken === "string" && data.fcmToken.trim()) {
        tokens.add(data.fcmToken.trim());
      }
      if (Array.isArray(data?.fcmTokens)) {
        for (const t of data.fcmTokens) {
          if (typeof t === "string" && t.trim()) tokens.add(t.trim());
        }
      }
    });
  } catch (err: any) {
    console.warn("[AdminSentinel] Falha ao ler tokens de usuarios admin:", err?.message);
  }

  return Array.from(tokens);
}

/**
 * Dispara uma notificação Web Push aos administradores através do Firebase Cloud Messaging
 */
export async function sendPushToAdmins(alert: SentinelAlert): Promise<number> {
  const messaging = getAdminMessaging();
  if (!messaging) {
    console.warn("[AdminSentinel] Firebase Messaging não inicializado. Notificação não enviada.");
    return 0;
  }

  const tokens = await getAdminPushTokens();
  if (tokens.length === 0) {
    console.info("[AdminSentinel] Nenhum token de administrador registrado para envio de push.");
    return 0;
  }

  try {
    const message = {
      notification: {
        title: alert.title,
        body: alert.message,
      },
      data: {
        url: alert.actionUrl,
        tab: alert.actionTab,
        tag: alert.id,
        level: alert.level,
      },
      webpush: {
        notification: {
          icon: "/logo.png",
          badge: "/favicon.png",
          vibrate: [200, 100, 200],
          tag: alert.id,
        },
        fcmOptions: {
          link: `https://play-infinity.stream${alert.actionUrl}`,
        },
      },
      tokens,
    };

    const response = await messaging.sendEachForMulticast(message);
    console.log(`[AdminSentinel] Push enviado com sucesso: ${response.successCount}/${tokens.length} dispositivos alcançados.`);
    return response.successCount;
  } catch (err: any) {
    console.error("[AdminSentinel] Erro ao disparar push aos administradores:", err);
    return 0;
  }
}

/**
 * Executa uma rodada completa de verificação (TV Ao Vivo, Bugs, Scrapers e Sistema)
 */
export async function runSentinelCheck(forcePush = false): Promise<SentinelStatus> {
  if (isProbing) {
    return getSentinelStatus();
  }

  isProbing = true;
  const now = Date.now();
  const alertsToNotify: SentinelAlert[] = [];

  try {
    const db = getAdminDb();

    // =========================================================================
    // 1. VERIFICAÇÃO DE CANAIS DE TV AO VIVO
    // =========================================================================
    let blockedIds: string[] = [];
    let customServersMap: Record<string, Array<{ name: string; url: string }>> = {};

    if (db) {
      try {
        const settingsSnap = await db.collection("system_settings").doc("live_channels").get();
        if (settingsSnap.exists) {
          const sData = settingsSnap.data();
          if (Array.isArray(sData?.blockedChannelIds)) blockedIds = sData.blockedChannelIds;
          if (sData?.customServers && typeof sData.customServers === "object") {
            customServersMap = sData.customServers;
          }
        }
      } catch (e: any) {
        console.warn("[AdminSentinel] Falha ao carregar configurações de canais no Firestore:", e?.message);
      }
    }

    const visibleChannels = INITIAL_LIVE_CHANNELS.filter((ch) => !blockedIds.includes(ch.id));
    let downCount = 0;

    // Testa os canais com pool de 3 workers concorrentes
    const CONCURRENCY = 3;
    const queue = [...visibleChannels];

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
          const ch = queue.shift();
          if (!ch) break;

          const servers = customServersMap[ch.id] && customServersMap[ch.id].length > 0
            ? customServersMap[ch.id]
            : ch.servers;

          const titularServer = servers && servers[0] ? servers[0].url : "";
          if (!titularServer) continue;

          const probeRes = await probeLiveStreamUrl(titularServer, 5000);
          const alertId = `channel:${ch.id}`;

          if (!probeRes.online) {
            downCount++;
            const alertObj: SentinelAlert = {
              id: alertId,
              category: "tv",
              title: `🚨 Canal ${ch.name} Fora do Ar!`,
              message: `O servidor titular falhou (${probeRes.statusCode || probeRes.error || "Sem Sinal"}). Toque para trocar o sinal no painel.`,
              level: "error",
              actionTab: "channels",
              actionUrl: "/admin?tab=channels",
              detectedAt: now,
              metadata: { channelId: ch.id, channelName: ch.name, statusCode: probeRes.statusCode },
            };
            activeAlerts.set(alertId, alertObj);

            // Verifica se deve notificar via push (anti-spam 2h)
            const lastNotified = notifiedHistory.get(alertId) || 0;
            if (forcePush || !notifiedHistory.has(alertId) || now - lastNotified > PUSH_COOLDOWN_MS) {
              alertsToNotify.push(alertObj);
              notifiedHistory.set(alertId, now);
            }
          } else {
            // Se voltou a ficar online, limpa o alerta ativo e histórico para renotificar se cair de novo
            if (activeAlerts.has(alertId)) {
              activeAlerts.delete(alertId);
              notifiedHistory.delete(alertId);
              console.log(`[AdminSentinel] Canal ${ch.name} recuperado e online novamente.`);
            }
          }
        }
      })
    );

    lastMonitoredCounts.channelsTotal = visibleChannels.length;
    lastMonitoredCounts.channelsDown = downCount;

    // =========================================================================
    // 2. VERIFICAÇÃO DE RELATÓRIOS DE BUGS PENDENTES
    // =========================================================================
    let pendingBugsCount = 0;
    if (db) {
      try {
        const bugSnap = await db.collection("bug_reports").where("status", "==", "pending").get();
        pendingBugsCount = bugSnap.size;

        const bugAlertId = "bug:pending_reports";
        if (pendingBugsCount > 0) {
          let firstMediaTitle = "";
          bugSnap.forEach((doc: any) => {
            if (!firstMediaTitle && doc.data()?.mediaTitle) {
              firstMediaTitle = doc.data().mediaTitle;
            }
          });

          const bugAlert: SentinelAlert = {
            id: bugAlertId,
            category: "bug",
            title: `🐞 ${pendingBugsCount === 1 ? "Novo bug reportado por usuário!" : `${pendingBugsCount} bugs reportados aguardando análise!`}`,
            message: firstMediaTitle
              ? `Problema reportado em "${firstMediaTitle}". Toque para analisar no painel.`
              : `${pendingBugsCount} relatos de usuários aguardando resposta.`,
            level: "warning",
            actionTab: "bugs",
            actionUrl: "/admin?tab=bugs",
            detectedAt: now,
            metadata: { count: pendingBugsCount },
          };
          activeAlerts.set(bugAlertId, bugAlert);

          const lastNotified = notifiedHistory.get(bugAlertId) || 0;
          if (forcePush || !notifiedHistory.has(bugAlertId) || now - lastNotified > PUSH_COOLDOWN_MS) {
            alertsToNotify.push(bugAlert);
            notifiedHistory.set(bugAlertId, now);
          }
        } else {
          activeAlerts.delete(bugAlertId);
          notifiedHistory.delete(bugAlertId);
        }
      } catch (err: any) {
        console.warn("[AdminSentinel] Falha ao consultar bug_reports no Firestore:", err?.message);
      }
    }
    lastMonitoredCounts.pendingBugs = pendingBugsCount;

    // =========================================================================
    // 3. VERIFICAÇÃO DO COOKIE DO ENCONTREI / SCRAPERS
    // =========================================================================
    try {
      const resolverStatus = getEncontreiResolverStatus();
      const cookieAlertId = "scraper:encontrei_cookie";
      const isCookieOk = resolverStatus.cookieConfigured && !resolverStatus.breakerActive;

      lastMonitoredCounts.cookieOk = isCookieOk;

      if (!isCookieOk) {
        const cookieAlert: SentinelAlert = {
          id: cookieAlertId,
          category: "scraper",
          title: "🍪 Atenção: Cookie do Encontrei Expirado!",
          message: "O catálogo e links do Encontrei não estão respondendo. Atualize o cookie na aba Scrapers.",
          level: "error",
          actionTab: "health",
          actionUrl: "/admin?tab=health",
          detectedAt: now,
        };
        activeAlerts.set(cookieAlertId, cookieAlert);

        const lastNotified = notifiedHistory.get(cookieAlertId) || 0;
        if (forcePush || !notifiedHistory.has(cookieAlertId) || now - lastNotified > PUSH_COOLDOWN_MS) {
          alertsToNotify.push(cookieAlert);
          notifiedHistory.set(cookieAlertId, now);
        }
      } else {
        activeAlerts.delete(cookieAlertId);
        notifiedHistory.delete(cookieAlertId);
      }
    } catch (err: any) {
      console.warn("[AdminSentinel] Falha ao verificar status do Encontrei resolver:", err?.message);
    }

    // =========================================================================
    // 4. DISPARO DE NOTIFICAÇÕES PUSH PARA O ADMINISTRADOR
    // =========================================================================
    if (alertsToNotify.length > 0) {
      console.log(`[AdminSentinel] Disparando ${alertsToNotify.length} notificações prioritárias aos administradores...`);
      for (const alert of alertsToNotify) {
        await sendPushToAdmins(alert);
      }
    }

    const adminTokens = await getAdminPushTokens();
    lastMonitoredCounts.activeAdmins = adminTokens.length;
    lastCheckTime = now;
  } catch (err: any) {
    console.error("[AdminSentinel] Erro inesperado durante verificação do Sentinela:", err);
  } finally {
    isProbing = false;
  }

  return getSentinelStatus();
}

/**
 * Inicializa o daemon Sentinela na inicialização do servidor (executa a cada 15 min)
 */
export function startAdminSentinel(): void {
  console.log("[AdminSentinel] Iniciando daemon do Guardião de Alertas e Monitoramento...");

  // Primeira verificação após 15 segundos para dar tempo ao servidor e caches subirem
  setTimeout(() => {
    runSentinelCheck().catch((err) => console.warn("[AdminSentinel] Falha na verificação inicial:", err));
  }, 15000);

  // Verificações periódicas a cada 15 minutos
  const CHECK_INTERVAL_MS = 15 * 60 * 1000;
  setInterval(() => {
    runSentinelCheck().catch((err) => console.warn("[AdminSentinel] Falha na verificação periódica:", err));
  }, CHECK_INTERVAL_MS);
}
