import { safeLocalStorage } from "../utils/safeStorage";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { db } from "./firebase";
import { Capacitor } from "@capacitor/core";

export type DeviceType = "mobile" | "desktop" | "tv" | "tablet";

export interface DeviceSession {
  id: string;
  name: string;
  type: DeviceType;
  lastActive: string;
  userAgent?: string;
  createdAt?: string;
}

const DEVICE_ID_KEY = "playinfinity_device_id";

/**
 * Retorna ou gera um identificador único e persistente para este aparelho.
 */
export function getOrCreateDeviceId(): string {
  let deviceId = safeLocalStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId || typeof deviceId !== "string" || !deviceId.startsWith("dev_")) {
    const timestamp = Date.now().toString(36);
    const randomHex = Math.random().toString(36).substring(2, 10);
    deviceId = `dev_${timestamp}_${randomHex}`;
    safeLocalStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Analisa o ambiente e User-Agent para gerar rótulo e tipo amigáveis.
 */
export function detectDeviceMetadata(uaString?: string): { name: string; type: DeviceType; userAgent: string } {
  const ua = (uaString || (typeof navigator !== "undefined" ? navigator.userAgent : "")).toLowerCase();
  
  // Smart TVs e Sticks
  if (
    ua.includes("tizen") ||
    ua.includes("web0s") ||
    ua.includes("webos") ||
    ua.includes("smart-tv") ||
    ua.includes("smarttv") ||
    ua.includes("googletv") ||
    ua.includes("appletv") ||
    ua.includes("crkey") ||
    ua.includes("aftt") ||
    ua.includes("aftm")
  ) {
    let tvBrand = "Smart TV";
    if (ua.includes("tizen") || ua.includes("samsung")) tvBrand = "Samsung Smart TV";
    else if (ua.includes("webos") || ua.includes("web0s") || ua.includes("lg")) tvBrand = "LG Smart TV";
    else if (ua.includes("googletv") || ua.includes("android tv")) tvBrand = "Android TV";
    else if (ua.includes("appletv")) tvBrand = "Apple TV";
    else if (ua.includes("crkey")) tvBrand = "Chromecast";
    else if (ua.includes("aftt") || ua.includes("aftm") || ua.includes("firetv")) tvBrand = "Fire TV Stick";
    return { name: tvBrand, type: "tv", userAgent: (uaString || "").slice(0, 150) };
  }

  // App nativo Android (Capacitor)
  const isCapacitor = typeof Capacitor !== "undefined" && typeof Capacitor.isNativePlatform === "function" && Capacitor.isNativePlatform();
  if (isCapacitor || ua.includes("capacitor") || ua.includes("wv") || ua.includes("; wv")) {
    return { name: "App Android (Nativo)", type: "mobile", userAgent: (uaString || "").slice(0, 150) };
  }

  // Tablets
  if (ua.includes("ipad") || (ua.includes("android") && !ua.includes("mobile"))) {
    const tabletName = ua.includes("ipad") ? "iPad (Apple)" : "Tablet Android";
    return { name: tabletName, type: "tablet", userAgent: (uaString || "").slice(0, 150) };
  }

  // Smartphones Mobile Web
  if (ua.includes("iphone")) {
    return { name: "iPhone (Safari / Web)", type: "mobile", userAgent: (uaString || "").slice(0, 150) };
  }
  if (ua.includes("android") && ua.includes("mobile")) {
    let browser = "Chrome";
    if (ua.includes("samsungbrowser")) browser = "Samsung Internet";
    else if (ua.includes("firefox")) browser = "Firefox";
    else if (ua.includes("opera") || ua.includes("opr")) browser = "Opera";
    else if (ua.includes("edg")) browser = "Edge";
    return { name: `Celular Android (${browser})`, type: "mobile", userAgent: (uaString || "").slice(0, 150) };
  }

  // Desktop (Windows, Mac, Linux)
  let os = "PC";
  if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("macintosh") || ua.includes("mac os")) os = "Mac";
  else if (ua.includes("linux")) os = "Linux";

  let browser = "Navegador Web";
  if (ua.includes("edg/")) browser = "Edge";
  else if (ua.includes("chrome/") && !ua.includes("chromium/")) browser = "Chrome";
  else if (ua.includes("firefox/")) browser = "Firefox";
  else if (ua.includes("safari/") && !ua.includes("chrome/")) browser = "Safari";
  else if (ua.includes("opera") || ua.includes("opr/")) browser = "Opera";

  return { name: `${browser} (${os})`, type: "desktop", userAgent: (uaString || "").slice(0, 150) };
}

/**
 * Cria payload estruturado para a sessão atual deste dispositivo.
 */
export function buildDeviceSessionPayload(): DeviceSession {
  const id = getOrCreateDeviceId();
  const meta = detectDeviceMetadata();
  return {
    id,
    name: meta.name,
    type: meta.type,
    lastActive: new Date().toISOString(),
    userAgent: meta.userAgent
  };
}

/**
 * Registra ou atualiza o batimento do dispositivo no Firestore do usuário.
 */
export async function registerDeviceSession(userId: string, dbInstance = db): Promise<void> {
  if (!userId || !dbInstance) return;
  try {
    const payload = buildDeviceSessionPayload();
    const userRef = doc(dbInstance, "usuarios", userId);
    await updateDoc(userRef, {
      [`devices.${payload.id}`]: payload
    }).catch(async () => {
      // Fallback para coleção legada users se o doc em usuarios não existir
      try {
        await updateDoc(doc(dbInstance, "users", userId), {
          [`devices.${payload.id}`]: payload
        });
      } catch {}
    });
  } catch (err) {
    console.warn("[DeviceSession] Falha silenciosa ao registrar dispositivo:", err);
  }
}

/**
 * Remove o dispositivo atual do mapa de sessões ao realizar logout.
 */
export async function unregisterDeviceSession(userId: string, dbInstance = db): Promise<void> {
  if (!userId || !dbInstance) return;
  try {
    const deviceId = safeLocalStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) return;
    const userRef = doc(dbInstance, "usuarios", userId);
    await updateDoc(userRef, {
      [`devices.${deviceId}`]: deleteField()
    }).catch(async () => {
      try {
        await updateDoc(doc(dbInstance, "users", userId), {
          [`devices.${deviceId}`]: deleteField()
        });
      } catch {}
    });
  } catch (err) {
    console.warn("[DeviceSession] Falha silenciosa ao desregistrar dispositivo:", err);
  }
}

/**
 * Retorna os dispositivos ativos do usuário e a contagem real com fallback inteligente.
 * @param devicesMap Mapa bruto vindo de `usuarios/{uid}.devices`
 * @param fallbackTokensCount Quantidade de tokens FCM (aparelhos push cadastrados)
 * @param lastActive Timestamp do último acesso geral da conta
 * @param maxInactiveDays Dias limite de inatividade para considerar sessão viva (padrão: 30)
 */
export function resolveUserDevices(
  devicesMap: any,
  fallbackTokensCount = 0,
  lastActive?: string,
  maxInactiveDays = 30
): { count: number; activeDevices: DeviceSession[]; isEstimated: boolean } {
  const threshold = Date.now() - maxInactiveDays * 24 * 60 * 60 * 1000;
  const activeDevices: DeviceSession[] = [];

  if (devicesMap && typeof devicesMap === "object") {
    for (const [key, val] of Object.entries(devicesMap)) {
      if (val && typeof val === "object") {
        const item = val as any;
        const time = new Date(item.lastActive || item.criadoEm || 0).getTime();
        // Considera válido se não for nulo e tiver atividade recente dentro da janela de 30 dias
        if (!isNaN(time) && time >= threshold) {
          activeDevices.push({
            id: String(item.id || key),
            name: String(item.name || "Aparelho Desconhecido"),
            type: (item.type as DeviceType) || "mobile",
            lastActive: item.lastActive || new Date().toISOString(),
            userAgent: item.userAgent
          });
        }
      }
    }
  }

  // Se registrou dispositivos explícitos recentemente, usa o número exato apurado
  if (activeDevices.length > 0) {
    activeDevices.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
    return { count: activeDevices.length, activeDevices, isEstimated: false };
  }

  // Fallback inteligente para contas que ainda não abriram o app após esta atualização
  if (fallbackTokensCount > 0) {
    return { count: fallbackTokensCount, activeDevices: [], isEstimated: true };
  }

  // Se tem atividade nos últimos 30 dias, conta pelo menos 1 aparelho
  if (lastActive) {
    const lastActiveTime = new Date(lastActive).getTime();
    if (!isNaN(lastActiveTime) && lastActiveTime >= threshold) {
      return { count: 1, activeDevices: [], isEstimated: true };
    }
  }

  return { count: 0, activeDevices: [], isEstimated: false };
}
