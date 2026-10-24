import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { LiveChannel } from "../data/liveChannels";

export interface LiveChannelServer {
  name: string;
  url: string;
  isProxy?: boolean;
  isEmbed?: boolean;
}

export interface LiveChannelSettings {
  blockedChannelIds: string[];
  customServers: Record<string, LiveChannelServer[]>;
  updatedAt?: string;
  updatedBy?: string;
}

const SETTINGS_DOC_PATH = "system_settings";
const SETTINGS_DOC_ID = "live_channels";
const LOCAL_STORAGE_KEY = "play_infinity_live_channel_settings";

const DEFAULT_SETTINGS: LiveChannelSettings = {
  blockedChannelIds: [],
  customServers: {}
};

/**
 * Lê configurações de canais do localStorage para inicialização síncrona instantânea
 */
export function getLocalChannelSettings(): LiveChannelSettings {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_SETTINGS;
}

/**
 * Salva localmente as configurações
 */
function saveLocalChannelSettings(settings: LiveChannelSettings) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

/**
 * Busca configurações do Firestore com fallback local
 */
export async function fetchLiveChannelSettings(): Promise<LiveChannelSettings> {
  try {
    const ref = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as LiveChannelSettings;
      const merged: LiveChannelSettings = {
        blockedChannelIds: Array.isArray(data.blockedChannelIds) ? data.blockedChannelIds : [],
        customServers: data.customServers || {},
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      };
      saveLocalChannelSettings(merged);
      return merged;
    }
  } catch (e) {
    console.warn("[liveChannelService] Erro ao buscar configurações do Firestore, usando cache:", e);
  }
  return getLocalChannelSettings();
}

/**
 * Assina atualizações em tempo real do Firestore para canais bloqueados e servidores customizados
 */
export function subscribeLiveChannelSettings(callback: (settings: LiveChannelSettings) => void): () => void {
  try {
    const ref = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as LiveChannelSettings;
          const merged: LiveChannelSettings = {
            blockedChannelIds: Array.isArray(data.blockedChannelIds) ? data.blockedChannelIds : [],
            customServers: data.customServers || {},
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy
          };
          saveLocalChannelSettings(merged);
          callback(merged);
        } else {
          callback(DEFAULT_SETTINGS);
        }
      },
      (err) => {
        console.warn("[liveChannelService] Erro no listener do Firestore:", err);
        callback(getLocalChannelSettings());
      }
    );
  } catch (e) {
    console.warn("[liveChannelService] Falha ao criar snapshot listener:", e);
    callback(getLocalChannelSettings());
    return () => {};
  }
}

/**
 * Alterna bloqueio / ocultação de canal no Firestore
 */
export async function toggleChannelBlock(channelId: string, blocked: boolean, adminEmail?: string): Promise<void> {
  const current = await fetchLiveChannelSettings();
  let updatedBlocked = [...current.blockedChannelIds];

  if (blocked) {
    if (!updatedBlocked.includes(channelId)) {
      updatedBlocked.push(channelId);
    }
  } else {
    updatedBlocked = updatedBlocked.filter(id => id !== channelId);
  }

  const newSettings: LiveChannelSettings = {
    ...current,
    blockedChannelIds: updatedBlocked,
    updatedAt: new Date().toISOString(),
    updatedBy: adminEmail || "admin"
  };

  const ref = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
  await setDoc(ref, newSettings, { merge: true });
  saveLocalChannelSettings(newSettings);
}

/**
 * Salva servidores customizados para um canal
 */
export async function saveChannelCustomServers(
  channelId: string,
  servers: LiveChannelServer[],
  adminEmail?: string
): Promise<void> {
  const current = await fetchLiveChannelSettings();
  const updatedCustomServers = { ...current.customServers };

  if (servers && servers.length > 0) {
    updatedCustomServers[channelId] = servers;
  } else {
    delete updatedCustomServers[channelId];
  }

  const newSettings: LiveChannelSettings = {
    ...current,
    customServers: updatedCustomServers,
    updatedAt: new Date().toISOString(),
    updatedBy: adminEmail || "admin"
  };

  const ref = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
  await setDoc(ref, newSettings, { merge: true });
  saveLocalChannelSettings(newSettings);
}

/**
 * Restaura servidores originais de um canal
 */
export async function resetChannelCustomServers(channelId: string, adminEmail?: string): Promise<void> {
  return saveChannelCustomServers(channelId, [], adminEmail);
}

/**
 * Mescla catálogo original de canais com as configurações do admin (bloqueios e substituições)
 */
export function mergeChannelsWithSettings(
  rawChannels: LiveChannel[],
  settings: LiveChannelSettings,
  includeBlocked: boolean = false
): LiveChannel[] {
  const blockedSet = new Set(settings.blockedChannelIds || []);
  const customMap = settings.customServers || {};

  return rawChannels
    .filter(ch => includeBlocked || !blockedSet.has(ch.id))
    .map(ch => {
      const custom = customMap[ch.id];
      if (custom && custom.length > 0) {
        return {
          ...ch,
          servers: custom,
          isCustom: true
        };
      }
      return ch;
    });
}
