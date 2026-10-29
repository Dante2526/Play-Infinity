import { getAdminDb, getAdminMessaging, getAdminFieldValue } from "../firebaseAdmin";
import { probeLiveStreamUrl } from "../routes/iptv";
import { probeChannelServers } from "./liveChannelProbe";
import { getEncontreiResolverStatus, getVizerCatalogStatus } from "../routes/encontreiLookup";
import { checkVizerHealth } from "./vizerDomains";
import { INITIAL_LIVE_CHANNELS } from "../../src/data/liveChannels";
import { getPublicLiveChannels } from './externalCatalog';

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
    vizerOk: boolean;
    activeAdmins: number;
  };
  isProbing: boolean;
}

// Estado em memória do Sentinela
const activeAlerts = new Map<string, SentinelAlert>();
const notifiedHistory = new Map<string, number>(); // alertId -> timestamp do último push enviado
const PUSH_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 horas de intervalo anti-spam para o mesmo alerta
// Contador de rodadas consecutivas em que cada canal falhou. O push só é
// disparado após CHANNEL_FAILS_BEFORE_PUSH rodadas seguidas fora do ar
// (baterias espaçadas de CHECK_INTERVAL_MS = 20 min), evitando notificar
// oscilações de poucos segundos das fontes externas. Não precisa ser o
// mesmo erro nas duas rodadas — erro é erro, independente do motivo.
const channelConsecutiveFails = new Map<string, number>();
const CHANNEL_FAILS_BEFORE_PUSH = 2;

// Intervalo entre baterias automáticas de verificação de canais (20 min).
// IMPORTANTE: este timer vive no PROCESSO do servidor (daemon PM2 na VPS),
// 100% independente do navegador — fechar aba, fechar navegador ou recarregar
// o painel admin NÃO dispara bateria nenhuma e NÃO reseta o intervalo: a
// página apenas LÊ /api/admin/sentinel/status (leitura pura, sem efeitos
// colaterais). O único gatilho de verificação é o daemon de 20 em 20 min
// (mais o botão "Testar Agora", que é manual e não interfere no ciclo).
const CHECK_INTERVAL_MS = 20 * 60 * 1000;

// Doc do Firestore onde o ciclo é persistido entre restarts/instâncias.
const SENTINEL_CYCLE_DOC = "sentinel_cycle"; // system_settings/sentinel_cycle

let isProbing = false;
let lastCheckTime = 0;
let lastMonitoredCounts = {
  channelsTotal: INITIAL_LIVE_CHANNELS.length,
  channelsDown: 0,
  pendingBugs: 0,
  cookieOk: true,
  vizerOk: true,
  activeAdmins: 0,
};

// =========================================================================
// PERSISTÊNCIA DO CICLO (Firestore)
// O intervalo de 20 min é do processo do servidor e não depende do navegador
// (abrir/fechar/recarregar o painel não interfere em nada). Para o ciclo
// sobreviver também a restarts do processo — deploy, crash, reboot da VPS,
// "o mundo acabar" — e para as 2 instâncias do cluster PM2 (#0/#1, que têm
// memórias separadas) não divergirem, o essencial é gravado no Firestore ao
// fim de cada bateria e restaurado no início da próxima:
//   - channelFails:  streaks de falha consecutiva por canal (dupla verificação)
//   - notifiedAt:    último push por alerta (cooldown anti-spam global de 2h)
//   - lastBatteryAt: hora da última verificação (exibida no painel)
// =========================================================================

async function persistCycleState(): Promise<void> {
  const db = getAdminDb();
  if (!db) return; // Sem Firestore (dev local) o ciclo vive apenas em memória
  try {
    const channelFails: Record<string, number> = {};
    channelConsecutiveFails.forEach((streak, alertId) => {
      if (streak > 0) channelFails[alertId] = streak;
    });
    const notifiedAt: Record<string, number> = {};
    notifiedHistory.forEach((ts, alertId) => {
      notifiedAt[alertId] = ts;
    });
    await db.collection("system_settings").doc(SENTINEL_CYCLE_DOC).set({
      lastBatteryAt: lastCheckTime || Date.now(),
      channelFails,
      notifiedAt,
      savedAt: Date.now(),
    });
  } catch (err: any) {
    console.warn("[AdminSentinel] Falha ao persistir ciclo no Firestore:", err?.message || err);
  }
}

async function restoreCycleState(): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  try {
    const snap = await db.collection("system_settings").doc(SENTINEL_CYCLE_DOC).get();
    if (!snap.exists) return;
    const data: any = snap.data() || {};

    // Mescla conservadora: SEMPRE o maior streak e o anti-spam mais recente,
    // tanto para sobreviver a restarts quanto para as instâncias do cluster
    // manterem uma única visão do ciclo.
    let restoredFails = 0;
    if (data.channelFails && typeof data.channelFails === "object") {
      for (const [alertId, streak] of Object.entries(data.channelFails)) {
        if (typeof streak !== "number" || streak <= 0) continue;
        const current = channelConsecutiveFails.get(alertId) || 0;
        if (streak > current) {
          channelConsecutiveFails.set(alertId, streak);
          restoredFails++;
        }
      }
    }

    let restoredNotified = 0;
    if (data.notifiedAt && typeof data.notifiedAt === "object") {
      for (const [alertId, ts] of Object.entries(data.notifiedAt)) {
        if (typeof ts !== "number") continue;
        const current = notifiedHistory.get(alertId) || 0;
        if (ts > current) {
          notifiedHistory.set(alertId, ts);
          restoredNotified++;
        }
      }
    }

    if (typeof data.lastBatteryAt === "number" && data.lastBatteryAt > lastCheckTime) {
      lastCheckTime = data.lastBatteryAt;
    }

    if (restoredFails > 0 || restoredNotified > 0) {
      const mins = lastCheckTime ? Math.max(0, Math.round((Date.now() - lastCheckTime) / 60000)) : "?";
      console.log(`[AdminSentinel] Ciclo restaurado do Firestore: ${restoredFails} streak(s) de falha, ${restoredNotified} registro(s) anti-spam, última verificação há ${mins} min.`);
    }
  } catch (err: any) {
    console.warn("[AdminSentinel] Falha ao restaurar ciclo do Firestore:", err?.message || err);
  }
}

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
export async function runSentinelCheck(forcePush = false, skipPush = false, manual = false): Promise<SentinelStatus> {
  if (isProbing) {
    return getSentinelStatus();
  }

  isProbing = true;
  const now = Date.now();
  const alertsToNotify: SentinelAlert[] = [];

  try {
    // Restaura o ciclo persistido (streaks + anti-spam + última verificação)
    // ANTES de qualquer decisão: garante continuidade através de restarts do
    // processo e coerência entre as instâncias #0/#1 do cluster PM2.
    await restoreCycleState();

    const db = getAdminDb();
    const liveChannels = getPublicLiveChannels();

    // =========================================================================
    // 1. VERIFICAÇÃO DE CANAIS DE TV AO VIVO
    // =========================================================================
    let blockedIds: string[] = [];
    let customServersMap: Record<string, Array<{ name: string; url: string }>> = {};
    let blockedIdsLoaded = false;
    let blockedIdsError: string | null = null;

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
        blockedIdsLoaded = true;
      } catch (e: any) {
        blockedIdsError = e?.message || String(e);
        console.warn("[AdminSentinel] Falha ao carregar configurações de canais no Firestore:", blockedIdsError);
      }
    } else {
      blockedIdsError = "Firebase Admin não inicializado (db = null)";
    }

    // =========================================================================
    // RESOLUÇÃO AUTOMÁTICA DE ALERTAS DE CANAIS OCULTADOS
    // Se um canal antes alertado (channel:<id>) foi adicionado a blockedIds,
    // removemos o alerta ativo e o histórico de push — não faz sentido avisar
    // queda de um canal que o admin já decidiu ocultar.
    // =========================================================================
    if (blockedIds.length > 0) {
      const staleChannelAlerts = Array.from(activeAlerts.keys()).filter((aid) => {
        if (!aid.startsWith("channel:")) return false;
        const chId = aid.substring("channel:".length);
        return blockedIds.includes(chId);
      });
      for (const staleId of staleChannelAlerts) {
        activeAlerts.delete(staleId);
        channelConsecutiveFails.delete(staleId);
        notifiedHistory.delete(staleId);
      }
      if (staleChannelAlerts.length > 0) {
        console.log(`[AdminSentinel] ${staleChannelAlerts.length} alerta(s) de canais ocultos foram resolvidos automaticamente.`);
      }
    }

    // =========================================================================
    // RESOLUÇÃO AUTOMÁTICA DE ALERTAS DE CANAIS REMOVIDOS DO CATÁLOGO
    // Se um canal antes alertado (channel:<id>) não existe mais no catálogo
    // ativo (liveChannels), removemos o alerta ativo e o histórico para
    // não manter alertas fantasmas eternamente.
    // =========================================================================
    const activeChannelIds = new Set(liveChannels.map((c) => c.id));
    const orphanChannelAlerts = Array.from(activeAlerts.keys()).filter((aid) => {
      if (!aid.startsWith("channel:")) return false;
      const chId = aid.substring("channel:".length);
      return !activeChannelIds.has(chId);
    });
    for (const orphanId of orphanChannelAlerts) {
      activeAlerts.delete(orphanId);
      channelConsecutiveFails.delete(orphanId);
      notifiedHistory.delete(orphanId);
    }
    if (orphanChannelAlerts.length > 0) {
      console.log(`[AdminSentinel] ${orphanChannelAlerts.length} alerta(s) de canais removidos do catálogo foram limpos.`);
    }

    // =========================================================================
    // GUARDA DE SEGURANÇA: se não conseguimos ler blockedIds, NÃO testamos
    // canais cegamente — isso evita enxame de alertas falsos quando as regras
    // do Firestore mudam ou quando o Admin SDK falha. Gera um alerta de sistema
    // para o admin saber que algo está errado.
    // =========================================================================
    if (!blockedIdsLoaded) {
      const sysAlertId = "system:sentinel_blocked_ids_unavailable";
      const sysAlert: SentinelAlert = {
        id: sysAlertId,
        category: "system",
        title: "Sentinela não consegue ler canais ocultos",
        message: `Não foi possível ler system_settings/live_channels (${blockedIdsError}). Verifique as regras do Firestore. Verificação de canais de TV pausada até resolver.`,
        level: "warning",
        actionTab: "health",
        actionUrl: "/admin?tab=health",
        detectedAt: now,
        metadata: { error: blockedIdsError },
      };
      activeAlerts.set(sysAlertId, sysAlert);
      const lastNotified = notifiedHistory.get(sysAlertId) || 0;
      if (!skipPush && (forcePush || !notifiedHistory.has(sysAlertId) || now - lastNotified > PUSH_COOLDOWN_MS)) {
        alertsToNotify.push(sysAlert);
        notifiedHistory.set(sysAlertId, now);
      }
      lastMonitoredCounts.channelsTotal = liveChannels.length;
      lastMonitoredCounts.channelsDown = 0;
    } else {
      // Sistema saudável — remove alerta antigo se existir
      if (activeAlerts.has("system:sentinel_blocked_ids_unavailable")) {
        activeAlerts.delete("system:sentinel_blocked_ids_unavailable");
        notifiedHistory.delete("system:sentinel_blocked_ids_unavailable");
        console.log("[AdminSentinel] Leitura de canais ocultos restaurada.");
      }
    }

    const visibleChannels = liveChannels.filter((ch) => !blockedIds.includes(ch.id));
    const skippedCount = liveChannels.length - visibleChannels.length;
    if (skippedCount > 0) {
      console.log(`[AdminSentinel] TV: testando ${visibleChannels.length} canais visíveis (saltando ${skippedCount} oculto(s)).`);
    }
    let downCount = 0;
    // Flag setada quando detectamos que o provedor Xtream (up.kiwi) caiu.
    // Quando isso acontece, todos os 48 canais /api/iptv/<id> dariam o mesmo
    // erro, então não faz sentido testar um por um nem gerar 48 alertas.
    let providerDownDetected = false;
    let providerDownInfo: { name: string; error: string } | null = null;

    // Só testa os canais de TV se conseguimos ler a lista de ocultos do Firestore.
    // Sem isso, o Sentinela testaria cegamente os 40 canais (inclusive os ocultos)
    // e geraria um enxame de alertas falsos de "fora do ar".
    if (blockedIdsLoaded) {
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

            // Otimização: se o provedor Xtream caiu, PULA os outros canais
            // que dependem dele (todos dariam o mesmo erro e gerariam
            // 48 alertas falsos de "canal fora do ar").
            if (providerDownDetected && servers.every(s => s.url.startsWith("/api/iptv/"))) {
              continue;
            }

            // Timeout 12s (era 5s): canais externos (/api/external-channel) têm
            // cadeia mais longa — resolver com probe profundo (playlist + magic
            // bytes do segmento, deadline 4.5s) + redirect 302 + proxy
            // /api/live-stream-proxy que re-busca a playlist upstream (até 8s).
            // 5s estourava no meio da cadeia e o painel acusava "fora do ar"
            // mesmo com canal funcionando. 12s = 4.5s resolver + ~3s proxy +
            // folga para DNS/fila. Canais diretos/amagi continuam rápidos (<1s).
            const probeRes = await probeChannelServers(servers, probeLiveStreamUrl, providerDownDetected);
            const alertId = `channel:${ch.id}`;

            // =========================================================================
            // DETECÇÃO DE QUEDA DO PROVEDOR XTREAM (não de canal individual)
            // =========================================================================
            if (probeRes.providerDown) {
              if (!providerDownDetected) {
                providerDownDetected = true;
                providerDownInfo = {
                  name: probeRes.providerName || "up.kiwi",
                  error: probeRes.error || "Indisponível"
                };

                // Gera 1 ÚNICO alerta de sistema (não 48 alertas de canal)
                const providerAlertId = `system:provider_down_xtream`;
                const providerAlert: SentinelAlert = {
                  id: providerAlertId,
                  category: "system",
                  title: `🌐 Provedor ${providerDownInfo.name} indisponível`,
                  message: `${providerDownInfo.error}. Os canais que dependem deste provedor não podem ser testados até a recuperação automática. Não há ação manual necessária.`,
                  level: "error",
                  actionTab: "health",
                  actionUrl: "/admin?tab=health",
                  detectedAt: now,
                  metadata: {
                    provider: providerDownInfo.name,
                    error: probeRes.error,
                    affectedChannelsCount: visibleChannels.filter(c =>
                      (customServersMap[c.id]?.[0]?.url || c.servers?.[0]?.url || "").startsWith("/api/iptv/")
                    ).length
                  },
                };
                activeAlerts.set(providerAlertId, providerAlert);
                const lastNotified = notifiedHistory.get(providerAlertId) || 0;
                if (!skipPush && (forcePush || !notifiedHistory.has(providerAlertId) || now - lastNotified > PUSH_COOLDOWN_MS)) {
                  alertsToNotify.push(providerAlert);
                  notifiedHistory.set(providerAlertId, now);
                }

                // Limpa alertas antigos de canais que dependem do up.kiwi
                // (eles podem ter sido marcados como "fora do ar" antes por erro falso)
                let clearedChannelAlerts = 0;
                for (const staleId of Array.from(activeAlerts.keys())) {
                  if (!staleId.startsWith("channel:")) continue;
                  const chId = staleId.substring("channel:".length);
                  const chObj = liveChannels.find(c => c.id === chId);
                  if (chObj && (chObj.servers?.[0]?.url || "").startsWith("/api/iptv/")) {
                    activeAlerts.delete(staleId);
                    notifiedHistory.delete(staleId);
                    clearedChannelAlerts++;
                  }
                }
                console.log(`[AdminSentinel] Provedor Xtream (${providerDownInfo.name}) indisponível. Pulando teste dos outros canais /api/iptv/. ${clearedChannelAlerts} alerta(s) de canal antigos foram limpos.`);
              }
              // Não incrementa downCount (não é problema de canal individual)
              continue;
            }

            let finalProbeRes = probeRes;
            if (!finalProbeRes.online && !finalProbeRes.providerDown) {
              await new Promise((resolve) => setTimeout(resolve, 2500));
              const retryRes = await probeChannelServers(servers, probeLiveStreamUrl, providerDownDetected);
              if (retryRes.online) {
                console.log(`[AdminSentinel] Canal ${ch.name} recuperado na retentativa (falso alarme evitado).`);
                finalProbeRes = retryRes;
              } else {
                finalProbeRes = retryRes;
              }
            }

            if (!finalProbeRes.online) {
              downCount++;
              const alertObj: SentinelAlert = {
                id: alertId,
                category: "tv",
                title: `🚨 Canal ${ch.name} Fora do Ar!`,
                message: `Nenhuma das alternativas HLS respondeu ao teste (${finalProbeRes.statusCode || finalProbeRes.error || "Sem Sinal"}). Confira as fontes no painel.`,
                level: "error",
                actionTab: "channels",
                actionUrl: "/admin?tab=channels",
                detectedAt: now,
                metadata: { channelId: ch.id, channelName: ch.name, statusCode: finalProbeRes.statusCode },
              };
              activeAlerts.set(alertId, alertObj);

              if (manual) {
                // Checagem manual ("Testar Agora" do painel): atualiza o painel,
                // mas NÃO conta como rodada do ciclo — a dupla verificação só
                // vale entre baterias automáticas espaçadas de 20 min — e nunca
                // dispara push (skipPush do modo manual).
                console.log(`[AdminSentinel] Canal ${ch.name} fora do ar na checagem manual (não conta para o ciclo de 20 min).`);
              } else {
                // Verifica se deve notificar via push (anti-spam 2h)
                const lastNotified = notifiedHistory.get(alertId) || 0;
                const failStreak = (channelConsecutiveFails.get(alertId) || 0) + 1;
                channelConsecutiveFails.set(alertId, failStreak);
                const confirmedDown = forcePush || failStreak >= CHANNEL_FAILS_BEFORE_PUSH;
                if (!confirmedDown) {
                  console.log(`[AdminSentinel] Canal ${ch.name} falhou (${failStreak}/${CHANNEL_FAILS_BEFORE_PUSH}). Aguardando próxima rodada antes de notificar.`);
                }
                if (!skipPush && confirmedDown && (forcePush || !notifiedHistory.has(alertId) || now - lastNotified > PUSH_COOLDOWN_MS)) {
                  alertsToNotify.push(alertObj);
                  notifiedHistory.set(alertId, now);
                }
              }
            } else {
              // Na bateria manual o ciclo não é tocado (nem zera streak): o
              // painel é atualizado, mas só o daemon de 20 min avalia quedas.
              if (!manual) channelConsecutiveFails.delete(alertId);
              // Se voltou a ficar online, limpa o alerta ativo do painel
              if (activeAlerts.has(alertId)) {
                activeAlerts.delete(alertId);
                if (!manual) notifiedHistory.delete(alertId);
                console.log(`[AdminSentinel] Canal ${ch.name} recuperado e online novamente.`);
              }
            }
          }
        })
      );

      // =========================================================================
      // RECUPERAÇÃO DO PROVEDOR: se nesta rodada o provedor NÃO caiu mas
      // tínhamos um alerta antigo de "provedor indisponível", limpa ele.
      // =========================================================================
      const providerAlertKey = "system:provider_down_xtream";
      if (!providerDownDetected && activeAlerts.has(providerAlertKey)) {
        activeAlerts.delete(providerAlertKey);
        notifiedHistory.delete(providerAlertKey);
        console.log(`[AdminSentinel] Provedor Xtream recuperado e online novamente.`);
      }

      lastMonitoredCounts.channelsTotal = visibleChannels.length;
      lastMonitoredCounts.channelsDown = downCount;
    }

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
          if (!skipPush && (forcePush || !notifiedHistory.has(bugAlertId) || now - lastNotified > PUSH_COOLDOWN_MS)) {
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
        if (!skipPush && (forcePush || !notifiedHistory.has(cookieAlertId) || now - lastNotified > PUSH_COOLDOWN_MS)) {
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
    // 3.2 VERIFICAÇÃO DO DOMÍNIO DO VIZER (Detecção de Mudança de Domínio)
    // =========================================================================
    try {
      const vizerRes: any = await checkVizerHealth({ timeoutMs: 8000, phaseTimeoutMs: 3000 });
      const vizerAlertId = "scraper:vizer_domain";
      const isVizerOk = vizerRes.status === "ONLINE";

      lastMonitoredCounts.vizerOk = isVizerOk;

      if (!isVizerOk) {
        const isDomainChange = Boolean(vizerRes.detectedNewDomain || vizerRes.error?.includes("redirecionou"));
        const newDomain = vizerRes.detectedNewDomain || "";

        const vizerAlert: SentinelAlert = {
          id: vizerAlertId,
          category: "scraper",
          title: isDomainChange
            ? `🌐 Vizer mudou de domínio${newDomain ? ` para ${newDomain}` : ""}!`
            : "⚠️ Catálogo do Vizer Inacessível!",
          message: isDomainChange
            ? `O Vizer redirecionou para um novo domínio (${newDomain || "não homologado"}). Toque para atualizar no painel.`
            : `O catálogo do Vizer não respondeu (${vizerRes.error || "Offline"}). Toque para verificar na aba Scrapers.`,
          level: isDomainChange ? "error" : "warning",
          actionTab: "health",
          actionUrl: "/admin?tab=health",
          detectedAt: now,
          metadata: { detectedNewDomain: newDomain, error: vizerRes.error },
        };
        activeAlerts.set(vizerAlertId, vizerAlert);

        const lastNotified = notifiedHistory.get(vizerAlertId) || 0;
        if (!skipPush && (forcePush || !notifiedHistory.has(vizerAlertId) || now - lastNotified > PUSH_COOLDOWN_MS)) {
          alertsToNotify.push(vizerAlert);
          notifiedHistory.set(vizerAlertId, now);
        }
      } else {
        activeAlerts.delete(vizerAlertId);
        notifiedHistory.delete(vizerAlertId);
      }
    } catch (err: any) {
      console.warn("[AdminSentinel] Falha ao verificar saúde do Vizer:", err?.message);
    }

    // =========================================================================
    // 3.3 VERIFICAÇÃO DO CATÁLOGO VIZER EM MEMÓRIA (Detecção de catálogo vazio)
    // =========================================================================
    // Se o vizer-catalog.db/.json está ausente/corrompido, o loadCatalogs()
    // popula 0 filmes — exatamente o incidente que vivemos (10/2026). O Byte
    // precisa avisar antes que usuários percebam “catálogo sumiu”.
    try {
      const vizerCatAlertId = "system:vizer_catalog_empty";
      const cat = getVizerCatalogStatus();
      const isEmpty = cat.movies === 0 && cat.episodes === 0;

      if (isEmpty) {
        const vizerCatAlert: SentinelAlert = {
          id: vizerCatAlertId,
          category: "system",
          title: "📂 Catálogo do Vizer está vazio na memória!",
          message:
            "O catálogo do Vizer carregou 0 filmes e 0 episódios — provável arquivo .db/.json ausente ou corrompido. Verifique deploy e o data/ da VPS.",
          level: "error",
          actionTab: "health",
          actionUrl: "/admin?tab=health",
          detectedAt: now,
          metadata: { movies: cat.movies, episodes: cat.episodes, series: cat.series },
        };
        activeAlerts.set(vizerCatAlertId, vizerCatAlert);

        const lastNotified = notifiedHistory.get(vizerCatAlertId) || 0;
        if (!skipPush && (forcePush || !notifiedHistory.has(vizerCatAlertId) || now - lastNotified > PUSH_COOLDOWN_MS)) {
          alertsToNotify.push(vizerCatAlert);
          notifiedHistory.set(vizerCatAlertId, now);
        }
      } else {
        activeAlerts.delete(vizerCatAlertId);
        notifiedHistory.delete(vizerCatAlertId);
      }
    } catch (err: any) {
      console.warn("[AdminSentinel] Falha ao checar catálogo do Vizer na memória:", err?.message);
    }

    // =========================================================================
    // 4. DISPARO DE NOTIFICAÇÕES PUSH PARA O ADMINISTRADOR (COM TRAVA ANTI-FLOOD)
    // =========================================================================
    if (!skipPush && alertsToNotify.length > 0) {
      const channelAlerts = alertsToNotify.filter(a => a.category === "tv");
      const otherAlerts = alertsToNotify.filter(a => a.category !== "tv");

      // Se houver mais de 3 canais caindo juntos (ex: oscilação em massa de upstream),
      // NUNCA dispara dezenas de notificações individuais. Agrupa em 1 único resumo urgente!
      if (channelAlerts.length > 3) {
        console.log(`[AdminSentinel] Alerta em massa detectado (${channelAlerts.length} canais). Agrupando em 1 notificação resumo anti-spam.`);
        const summaryAlert: SentinelAlert = {
          id: `channel:mass_outage_${now}`,
          category: "tv",
          title: `🚨 Byte: ${channelAlerts.length} canais com instabilidade!`,
          message: `Foram detectadas ${channelAlerts.length} quedas de canais de TV. Toque para verificar na aba TV Ao Vivo.`,
          level: "error",
          actionTab: "channels",
          actionUrl: "/admin?tab=channels",
          detectedAt: now,
          metadata: { count: channelAlerts.length },
        };
        await sendPushToAdmins(summaryAlert);
        for (const alert of otherAlerts.slice(0, 2)) {
          await sendPushToAdmins(alert);
        }
      } else {
        console.log(`[AdminSentinel] Disparando ${alertsToNotify.length} notificações prioritárias aos administradores...`);
        for (const alert of alertsToNotify) {
          await sendPushToAdmins(alert);
        }
      }
    }

    const adminTokens = await getAdminPushTokens();
    lastMonitoredCounts.activeAdmins = adminTokens.length;
    lastCheckTime = now;
  } catch (err: any) {
    console.error("[AdminSentinel] Erro inesperado durante verificação do Sentinela:", err);
  } finally {
    isProbing = false;
    // Persiste o ciclo (streaks + anti-spam + última verificação) — fire and
    // forget: não atrasa a resposta e falhas aqui nunca derrubam a bateria.
    // Com isso o intervalo de 20 min e a dupla verificação sobrevivem a
    // restarts do processo (deploy, crash, reboot) sem resetar nada.
    persistCycleState().catch(() => undefined);
  }

  return getSentinelStatus();
}

/**
 * Inicializa o daemon Sentinela na inicialização do servidor (executa a cada 20 min)
 */
export function startAdminSentinel(): void {
  // Em modo cluster PM2, apenas a instância principal (#0) executa o daemon de monitoramento
  const instance = process.env.NODE_APP_INSTANCE;
  if (instance !== undefined && instance !== "0") {
    console.log(`[AdminSentinel] Instância de cluster secundária (#${instance}). Daemon em segundo plano desativado.`);
    return;
  }

  console.log("[AdminSentinel] Iniciando daemon do Guardião de Alertas e Monitoramento (instância primária)...");

  // Primeira verificação após 45 segundos: caches frios no boot populam o
  // painel mas não disparam push. O restoreCycleState() interno traz de
  // volta do Firestore os streaks/anti-spam salvos antes da última parada,
  // então o restart NÃO reseta o ciclo de 20 min nem a dupla verificação.
  setTimeout(() => {
    runSentinelCheck(false, true).catch((err) => console.warn("[AdminSentinel] Falha na verificação inicial:", err));
  }, 45000);

  // Baterias automáticas a cada 20 minutos (CHECK_INTERVAL_MS do módulo):
  // testam TODOS os canais visíveis e um canal só gera push se falhar em 2
  // baterias seguidas — erro na 1ª + erro na 2ª, 20 min depois (podem ser
  // erros diferentes). Este setInterval vive no processo do servidor: nada
  // do navegador (abrir/fechar/recarregar painel) o reinicia ou adianta.
  setInterval(() => {
    runSentinelCheck(false, false).catch((err) => console.warn("[AdminSentinel] Falha na verificação periódica:", err));
  }, CHECK_INTERVAL_MS);
}
