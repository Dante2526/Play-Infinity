/**
 * Serviço de Monitoramento e Auto-Atualização Contínua de Tokens de TV Ao Vivo da Saimo.
 *
 * Responsável por:
 *  - Fazer polling a cada 20 min no catálogo público da Saimo (canais-saimo.pages.dev/catalogo.txt).
 *  - Extrair os hashes dinâmicos mais recentes de streams s25-cloudfront-net.lat (embedTV)
 *    e URLs fixas dos CDNs Saimo.
 *  - Manter cache em memória com persistência em disco (data/saimo-live-tokens-cache.json).
 *  - Prover auto-cura reativa com forceTokenRefresh() sob demanda (quando 404 é detectado).
 */
import fs from "fs";
import path from "path";
import { isPrivateOrLocalHost } from "../utils/helpers";

const SAIMO_CATALOG_URL = "https://canais-saimo.pages.dev/catalogo.txt";
const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutos
const DEBOUNCE_WINDOW_MS = 30 * 1000; // 30 segundos entre refetches forçados
const FETCH_TIMEOUT_MS = 15 * 1000; // 15 segundos

const FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface SaimoLiveSource {
  url: string;
  referer?: string;
  agente?: string;
  qualidade?: string;
}

export interface SaimoChannelEntry {
  name: string;
  category?: string;
  logo?: string;
  sources: SaimoLiveSource[];
}

/** Mapeamento de IDs do Play Infinity para o nome/chave normalizada no Saimo */
export const CHANNEL_ID_ALIAS_MAP: Record<string, string> = {
  "premiere-1": "premiereclubes",
  "premiere-clubes": "premiereclubes",
  "premiere-2": "premiere2",
  "premiere-3": "premiere3",
  "premiere-4": "premiere4",
  "premiere-5": "premiere5",
  "premiere-6": "premiere6",
  "premiere-7": "premiere7",
  "premiere-8": "premiere8",
  "sportv": "sportv",
  "sportv-2": "sportv2",
  "sportv-3": "sportv3",
  "combate": "combate",
  "cazetv": "cazetv1",
  "caze-tv": "cazetv1",
  "cazetv-1": "cazetv1",
  "caze-tv-1": "cazetv1",
  "cazetv-2": "cazetv2",
  "caze-tv-2": "cazetv2",
  "espn-brasil": "espnbrasil",
  "espn-2": "espn2",
  "espn-3": "espn3",
  "espn-4": "espn4",
  "espn-5": "espn5",
  "band": "band",
  "history": "history",
  "discovery-channel": "discoverychannel",
  "discovery-id": "discoveryid",
  "animal-planet": "animalplanet",
  "sbt": "sbt",
  "record": "record",
  "globo-rj": "globorj",
  "globo-sp": "globosp"
};

/** Normaliza strings de canal removendo acentos, pontuação e sufixos de qualidade */
export function normalizeKey(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(hd|fhd|sd|ao vivo|4k)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Estado em memória dos tokens */
let memoryCatalog = new Map<string, SaimoChannelEntry>();
let lastRefreshTime = 0;
let ongoingRefreshPromise: Promise<boolean> | null = null;
let watcherStarted = false;

function getCacheFilePath(): string {
  return path.join(process.cwd(), "data", "saimo-live-tokens-cache.json");
}

/** Parser do catálogo de texto da Saimo */
export function parseSaimoCatalog(content: string): Map<string, SaimoChannelEntry> {
  const map = new Map<string, SaimoChannelEntry>();
  const lines = content.split("\n");

  let currentChannel: SaimoChannelEntry | null = null;
  let currentKey = "";
  let currentSource: Partial<SaimoLiveSource> | null = null;

  const flushSource = () => {
    if (currentChannel && currentSource && currentSource.url) {
      currentChannel.sources.push({
        url: currentSource.url,
        referer: currentSource.referer,
        agente: currentSource.agente,
        qualidade: currentSource.qualidade
      });
      currentSource = null;
    }
  };

  const flushChannel = () => {
    flushSource();
    if (currentChannel && currentKey && currentChannel.sources.length > 0) {
      map.set(currentKey, currentChannel);
    }
    currentChannel = null;
    currentKey = "";
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("canal:")) {
      flushChannel();
      const name = line.substring(6).trim();
      currentKey = normalizeKey(name);
      currentChannel = {
        name,
        sources: []
      };
    } else if (line.startsWith("categoria:") && currentChannel) {
      currentChannel.category = line.substring(10).trim();
    } else if (line.startsWith("logo:") && currentChannel) {
      currentChannel.logo = line.substring(5).trim();
    } else if (line.startsWith("fonte:") && currentChannel) {
      flushSource();
      currentSource = {
        url: line.substring(6).trim()
      };
    } else if (line.startsWith("qualidade:") && currentSource) {
      currentSource.qualidade = line.substring(10).trim();
    } else if (line.startsWith("referer:") && currentSource) {
      currentSource.referer = line.substring(8).trim();
    } else if (line.startsWith("agente:") && currentSource) {
      currentSource.agente = line.substring(7).trim();
    }
  }

  flushChannel();
  return map;
}

/** Permite injetar catálogo em memória (útil para testes unitários) */
export function setSaimoCatalogMemoryCache(newMap: Map<string, SaimoChannelEntry>): void {
  memoryCatalog = newMap;
}

/** Salva cache em disco de forma atômica */
function saveCacheToDisk(map: Map<string, SaimoChannelEntry>): void {
  try {
    const filePath = getCacheFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const plain: Record<string, SaimoChannelEntry> = {};
    for (const [k, v] of map.entries()) {
      plain[k] = v;
    }
    const tmp = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(plain, null, 2), "utf8");
    fs.renameSync(tmp, filePath);
  } catch (err: any) {
    console.warn("[saimo-live-watcher] Aviso ao persistir cache em disco:", err?.message);
  }
}

/** Carrega cache do disco no boot */
function loadCacheFromDisk(): void {
  try {
    const filePath = getCacheFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(data);
      const newMap = new Map<string, SaimoChannelEntry>();
      for (const [k, v] of Object.entries(parsed)) {
        newMap.set(k, v as SaimoChannelEntry);
      }
      if (newMap.size > 0) {
        memoryCatalog = newMap;
        console.log(`[saimo-live-watcher] Cache em disco carregado: ${newMap.size} canais.`);
      }
    }
  } catch (err: any) {
    console.warn("[saimo-live-watcher] Não foi possível carregar cache prévio do disco:", err?.message);
  }
}

/** Busca o catálogo atualizado da Saimo */
async function fetchAndRefreshCatalog(): Promise<boolean> {
  try {
    const parsedUrl = new URL(SAIMO_CATALOG_URL);
    if (await isPrivateOrLocalHost(parsedUrl.hostname)) {
      throw new Error("Host Saimo resolveu para endereço privado (Anti-SSRF)");
    }

    const res = await fetch(SAIMO_CATALOG_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": FETCH_UA,
        Accept: "text/plain,*/*"
      }
    });

    if (!res.ok) {
      console.warn(`[saimo-live-watcher] Falha HTTP ${res.status} ao buscar catalogo.txt`);
      return false;
    }

    const text = await res.text();
    const newMap = parseSaimoCatalog(text);
    if (newMap.size < 5) {
      console.warn("[saimo-live-watcher] Catálogo retornado parece corrompido ou incompleto; ignorando.");
      return false;
    }

    // Detectar rotação de hashes em canais monitorados
    let changes = 0;
    for (const [k, newVal] of newMap.entries()) {
      const oldVal = memoryCatalog.get(k);
      if (!oldVal) continue;
      for (let s = 0; s < newVal.sources.length; s++) {
        const oldSrc = oldVal.sources[s];
        const newSrc = newVal.sources[s];
        if (oldSrc && newSrc && oldSrc.url !== newSrc.url) {
          if (newSrc.url.includes("s25-cloudfront-net.lat") || oldSrc.url.includes("s25-cloudfront-net.lat")) {
            changes++;
            console.log(`[saimo-live-watcher] 🔄 Token rotacionado no canal "${newVal.name}" (Fonte ${s + 1}):`);
            console.log(`   De:   ${oldSrc.url}`);
            console.log(`   Para: ${newSrc.url}`);
          }
        }
      }
    }

    memoryCatalog = newMap;
    lastRefreshTime = Date.now();
    saveCacheToDisk(newMap);

    console.log(`[saimo-live-watcher] Catálogo atualizado com sucesso (${newMap.size} canais, ${changes} rotações detectadas).`);
    return true;
  } catch (err: any) {
    console.error("[saimo-live-watcher] Erro ao sincronizar catálogo:", err?.message);
    return false;
  }
}

/**
 * Gatilho de re-sync forçado sob demanda (com debounce de 30s).
 * Chamado quando um canal retorna 404 em runtime.
 */
export async function forceTokenRefresh(channelId?: string): Promise<boolean> {
  const now = Date.now();
  if (now - lastRefreshTime < DEBOUNCE_WINDOW_MS && memoryCatalog.size > 0) {
    // Se sincronizou há menos de 30s, retorna true evitando spam
    return true;
  }

  if (ongoingRefreshPromise) {
    return ongoingRefreshPromise;
  }

  ongoingRefreshPromise = fetchAndRefreshCatalog().finally(() => {
    ongoingRefreshPromise = null;
  });

  return ongoingRefreshPromise;
}

/**
 * Resolve uma fonte de transmissão pelo ID ou nome do canal (sourceIndex 1-based: 1, 2, 3...)
 */
export function getSaimoLiveSource(channelIdOrName: string, sourceIndex: number): SaimoLiveSource | null {
  if (!channelIdOrName || sourceIndex < 1) return null;

  // 1. Tenta resolver via mapa de aliases conhecidos
  const rawLower = channelIdOrName.toLowerCase().trim();
  const aliasKey = CHANNEL_ID_ALIAS_MAP[rawLower];

  let entry: SaimoChannelEntry | undefined;

  if (aliasKey) {
    entry = memoryCatalog.get(aliasKey);
  }

  // 2. Tenta por normalização do nome/ID
  if (!entry) {
    const normKey = normalizeKey(channelIdOrName);
    entry = memoryCatalog.get(normKey);
  }

  // 3. Fallback: contenção parcial de chave
  if (!entry) {
    const normKey = normalizeKey(channelIdOrName);
    for (const [k, v] of memoryCatalog.entries()) {
      if (k.includes(normKey) || normKey.includes(k)) {
        entry = v;
        break;
      }
    }
  }

  if (!entry || !entry.sources || entry.sources.length === 0) {
    return null;
  }

  const idx = sourceIndex - 1;
  return entry.sources[idx] || null;
}

/**
 * Inicia o daemon do monitor de tokens em segundo plano.
 */
export function startSaimoLiveTokenWatcher(): void {
  if (watcherStarted) return;
  watcherStarted = true;

  loadCacheFromDisk();

  // Sync assíncrono no boot com pequeno atraso para não engasgar o startup
  setTimeout(() => {
    fetchAndRefreshCatalog();
  }, 2000);

  // Intervalo a cada 20 minutos
  const interval = setInterval(() => {
    fetchAndRefreshCatalog();
  }, REFRESH_INTERVAL_MS);

  if (typeof interval.unref === "function") {
    interval.unref();
  }

  console.log(`[saimo-live-watcher] Watcher iniciado (sync periódico a cada 20 min).`);
}
