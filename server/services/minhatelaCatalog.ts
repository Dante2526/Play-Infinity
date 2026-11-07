import { BLOCKED_EXTERNAL_CHANNELS } from "./blockedLiveChannels";
import fs from "fs";
import path from "path";

/**
 * Catálogo MinhaTela — provedor de fontes embed para TV ao vivo.
 *
 * API pública reversada do https://minhatela.xyz (SPA React + backend RPC
 * hospedado na plataforma Runable). Todas as chamadas são POST com envelope
 * JSON simétrico {"json": <input>} e respondem {"json": <output>}:
 *
 *   POST https://minhatela.xyz/api/rpc/channels/list  body {"json":{}}
 *     → { channels: [ { id, slug, name, logo, category, ... } ] }   (sem streams)
 *
 *   POST https://minhatela.xyz/api/rpc/channels/get   body {"json":{"slug":...}}
 *     → canal completo com streams: [ { id, label, url, quality, language } ]
 *       + EPG da Claro (now/upcoming/schedules)
 *
 * Cada "stream" deles é uma página de player de terceiros (embed HTML —
 * rdcanais, embedtv, meuplayeronlinehd, redecanaistv etc.) que toca via
 * Bitmovin/jwplayer/hls.js dentro do próprio iframe. Por isso entram no
 * catálogo do Play Infinity como servidores `isEmbed: true` — o
 * LivePlayerModal já abre esses em iframe (allow autoplay/encrypted-media).
 *
 * Fluxo de atualização: watcher em background (20 min) busca a lista e os
 * detalhes de cada slug (batch de 6 paralelos) e mantém um snapshot em
 * memória + cache em disco (data/minhatela-cache.json) que sobrevive a
 * restarts. getPublicLiveChannels() consome o snapshot de forma SÍNCRONA —
 * se a API deles cair, o app simplesmente segue com as fontes que já tem
 * (Saimo/diretas), sem quebrar nada.
 */

const MT_API_BASE = "https://minhatela.xyz/api/rpc";
const MT_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const CACHE_FILE =
  process.env.MINHATELA_CACHE_FILE ||
  path.join(process.cwd(), "data", "minhatela-cache.json");
const REFRESH_MS = 20 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 9000;
const MAX_SERVERS_PER_CHANNEL = 3;
const DETAIL_BATCH_SIZE = 6;

export interface MinhaTelaStream {
  id?: number;
  label?: string;
  url: string;
  quality?: string;
  language?: string;
}

export interface MinhaTelaChannel {
  id?: number;
  slug: string;
  name: string;
  logo?: string;
  category?: string;
  description?: string;
  channelNumber?: number;
  now?: { title?: string } | null;
  streams?: MinhaTelaStream[];
}

export interface EmbedServer {
  name: string;
  url: string;
  isEmbed: true;
}

// ---------------------------------------------------------------------------
// Normalização / matching de canais
// ---------------------------------------------------------------------------

/**
 * Chave de matching entre nomes de canais (Play Infinity ↔ MinhaTela).
 * NFD + lowercase + remove parênteses, "ao vivo", sufixos de qualidade e
 * qualquer caractere que não seja letra/número/+/& (Preserva "Paramount+",
 * "BM&C", "A&E"). Exemplos:
 *   "SporTV HD"        → "sportv"      ↔ "SPORTV"        → "sportv"   ✓
 *   "ESPN 2 HD"        → "espn2"       ↔ "ESPN2"         → "espn2"    ✓
 *   "CazéTV Ao Vivo"   → "cazetv"      ↔ "CazéTV"        → "cazetv"   ✓
 *   "Premiere 1 HD"    → "premiere1"   ↔ "PREMIERE CLUBES HD" ✗ (manual)
 */
export function minhaTelaKey(name: string): string {
  let s = (name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\b(ao vivo|fhd|uhd|hd|sd|beta|sinal)\b/g, " ");
  s = s.replace(/[^a-z0-9+&]/g, "");
  return s.trim();
}

/**
 * Mapeamento manual para canais cujo nome difere entre os catálogos.
 * Chave: id do canal no catálogo estático do Play Infinity
 * (src/data/liveChannels.ts). Valor: slug no MinhaTela.
 */
const MANUAL_SLUG_BY_PLAY_INFINITY_ID: Record<string, string> = {
  "premiere-1": "premiere-clubes-hd", // "Premiere 1 HD" ↔ "PREMIERE CLUBES HD"
  "espn-brasil": "espn", // "ESPN Brasil HD" ↔ "ESPN" (Clarovision ID do ESPN BR)
  "ge-fast": "ge-tv-hd", // "ge Fast (Globo Esporte)" ↔ "GE TV HD"
  "discovery-channel": "discovery-hd", // "Discovery Channel HD" ↔ "DISCOVERY HD"
  "bmc-news": "bm-c-hd", // "BM&C News" ↔ "BM&C HD"
};

// ---------------------------------------------------------------------------
// Snapshot em memória + cache em disco
// ---------------------------------------------------------------------------

let snapshot = new Map<string, MinhaTelaChannel>();
let snapshotFetchedAt = 0;
let refreshInFlight: Promise<void> | null = null;
let watcherStarted = false;

function persistCache(channels: MinhaTelaChannel[]) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ fetchedAt: Date.now(), channels }, null, 0),
      "utf-8"
    );
  } catch (e: any) {
    console.warn("[MinhaTela] Falha ao gravar cache em disco:", e?.message || e);
  }
}

function loadDiskCache(): boolean {
  try {
    if (!fs.existsSync(CACHE_FILE)) return false;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    if (!raw || !Array.isArray(raw.channels) || raw.channels.length === 0) return false;
    snapshot = new Map(raw.channels.map((c: MinhaTelaChannel) => [c.slug, c]));
    snapshotFetchedAt = raw.fetchedAt || 0;
    const ageMin = Math.round((Date.now() - snapshotFetchedAt) / 60000);
    console.log(
      `[MinhaTela] Cache em disco carregado: ${raw.channels.length} canais (idade ${ageMin} min).`
    );
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cliente RPC
// ---------------------------------------------------------------------------

async function rpcCall<T>(method: string, input: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${MT_API_BASE}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": MT_USER_AGENT,
        origin: "https://minhatela.xyz",
        referer: "https://minhatela.xyz/",
      },
      body: JSON.stringify({ json: input }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || data.json === undefined) throw new Error("resposta sem envelope json");
    return data.json as T;
  } finally {
    clearTimeout(timer);
  }
}


/** Hosts privados/loopback nunca viram servidor embed (defesa anti-SSRF barata). */
function isSafeEmbedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".invalid")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
    if (h === "::1" || h === "[::1]") return false;
    if (!h.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}

/** IDs mortos ou removidos no watch2.html do meuplayeronlinehd.com e embeds quebrados. */
const DEAD_MEUPLAYER_IDS = new Set<string>([
  "bmec",
  "getv-2",
  "premiere8",
  "premiere8-2",
  "cazetv1",
  "cazetv1-2",
  "aee-2",
  "axn-2",
  "bis",
  "canalbrasil",
  "curta",
  "curta-2",
  "paramount1",
  "paramount2",
  "paramount3",
  "paramount4",
  "primevideo1",
  "primevideo2",
  "primevideo4",
  "max1",
  "max1-2",
  "max2",
  "max2-2",
  "max3",
  "max3-2",
  "max4",
  "max4-2",
  "max5",
  "max5-2",
  "ds4",
  "ds5",
  "afazenda1",
  "afazenda2",
  "afazenda3",
  "afazenda4",
  "afazenda5",
  "afazenda6",
  "afazendamosaico",
]);

function isDeadCatalogEmbedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase();
    if (h.endsWith("meuplayeronlinehd.com")) {
      const id = u.searchParams.get("id");
      if (id && DEAD_MEUPLAYER_IDS.has(id)) return true;
    }
    if (h.endsWith("embedcanaisdetv.xyz")) {
      const canal = (u.searchParams.get("canal") || "").replace(/\/+$/, "").toLowerCase();
      if (["arte1", "curta", "canalbrasil", "bis", "discoveryheh", "bloomberg"].includes(canal)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** Converte as fontes MinhaTela em servidores embed do catálogo Play Infinity. */
function streamsToEmbedServers(streams: MinhaTelaStream[], startIndex = 0): EmbedServer[] {
  const seen = new Set<string>();
  const valid: MinhaTelaStream[] = [];
  for (const s of streams || []) {
    if (!s || !s.url || !isSafeEmbedUrl(s.url) || isDeadCatalogEmbedUrl(s.url)) continue;
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    valid.push(s);
  }

  // Priorização de Áudio AAC: fontes com stream direto verificado (ex.: embedcanaisdetv.xyz)
  // tocam nativamente com som no navegador e são ordenadas no topo da lista MinhaTela.
  valid.sort((a, b) => {
    const aAac = /embedcanaisdetv\.xyz/i.test(a.url);
    const bAac = /embedcanaisdetv\.xyz/i.test(b.url);
    if (aAac && !bAac) return -1;
    if (!aAac && bAac) return 1;
    return 0;
  });

  const out: EmbedServer[] = [];
  for (const s of valid) {
    out.push({ name: `Servidor ${startIndex + out.length + 1}`, url: s.url, isEmbed: true });
    if (out.length >= MAX_SERVERS_PER_CHANNEL) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Atualização do snapshot
// ---------------------------------------------------------------------------

async function refreshSnapshot(): Promise<void> {
  const list = await rpcCall<{ channels?: MinhaTelaChannel[] }>("channels/list", {});
  const channels = (list?.channels || []).filter(
    (c) => c && typeof c.slug === "string" && c.slug && typeof c.name === "string" && c.name
  );
  if (channels.length === 0) throw new Error("channels/list retornou 0 canais");

  // A lista vem SEM streams — o detalhe (com fontes + EPG) é por slug.
  // Batch paralelo controlado pra não metralhar a API deles.
  for (let i = 0; i < channels.length; i += DETAIL_BATCH_SIZE) {
    const slice = channels.slice(i, i + DETAIL_BATCH_SIZE);
    await Promise.all(
      slice.map(async (c) => {
        try {
          const detail = await rpcCall<MinhaTelaChannel>("channels/get", { slug: c.slug });
          if (detail) {
            if (Array.isArray(detail.streams)) c.streams = detail.streams;
            if (detail.now) c.now = detail.now;
            if (detail.logo && !c.logo) c.logo = detail.logo;
            if (detail.category && !c.category) c.category = detail.category;
          }
        } catch {
          /* canal fica sem fontes MinhaTela — o restante do catálogo segue */
        }
      })
    );
  }

  const next = new Map<string, MinhaTelaChannel>();
  let totalStreams = 0;
  for (const c of channels) {
    next.set(c.slug, c);
    totalStreams += (c.streams || []).length;
  }
  snapshot = next;
  snapshotFetchedAt = Date.now();
  persistCache(channels);
  console.log(
    `[MinhaTela] Catálogo atualizado: ${channels.length} canais, ${totalStreams} fontes embed.`
  );
}

function ensureFresh(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  if (snapshotFetchedAt && Date.now() - snapshotFetchedAt < REFRESH_MS) {
    return Promise.resolve();
  }
  refreshInFlight = refreshSnapshot()
    .catch((e: any) => {
      console.warn("[MinhaTela] Falha ao atualizar catálogo:", e?.message || e);
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** Inicia o watcher de background (carga inicial + refresh a cada 20 min). */
export function startMinhaTelaWatcher(): void {
  if (watcherStarted) return;
  watcherStarted = true;
  loadDiskCache();
  void ensureFresh();
  setInterval(() => void ensureFresh(), REFRESH_MS).unref?.();
  console.log("[MinhaTela] Watcher iniciado (refresh a cada 20 min).");
}

// ---------------------------------------------------------------------------
// API pública consumida pelo externalCatalog (síncrona — usa snapshot)
// ---------------------------------------------------------------------------

/** Encontra o canal MinhaTela correspondente a um canal do Play Infinity. */
export function findMinhaTelaChannel(
  playInfinityId: string,
  playInfinityName: string
): MinhaTelaChannel | null {
  if (snapshot.size === 0) return null;
  const manualSlug = MANUAL_SLUG_BY_PLAY_INFINITY_ID[playInfinityId];
  if (manualSlug) {
    const found = snapshot.get(manualSlug);
    if (found) return found;
  }
  const key = minhaTelaKey(playInfinityName);
  if (!key) return null;
  for (const ch of snapshot.values()) {
    if (minhaTelaKey(ch.name) === key) return ch;
  }
  return null;
}

/**
 * Fontes embed MinhaTela para um canal JÁ existente no catálogo Play
 * Infinity (anexadas após os servidores Saimo/diretos do canal).
 */
export function getMinhaTelaServersFor(
  playInfinityId: string,
  playInfinityName: string,
  startIndex = 0
): EmbedServer[] {
  const mt = findMinhaTelaChannel(playInfinityId, playInfinityName);
  if (!mt) return [];
  return streamsToEmbedServers(mt.streams || [], startIndex);
}

/** Melhor qualidade das fontes do canal (para o badge do card). */
function bestQuality(streams: MinhaTelaStream[]): "1080p" | "720p" | "HD" {
  const q = (streams || []).map((s) => (s.quality || "").toUpperCase());
  if (q.some((x) => x.includes("FHD") || x.includes("UHD") || x.includes("4K"))) return "1080p";
  if (q.some((x) => x.includes("SD"))) return "720p";
  return "HD";
}

/** Mapeia a categoria do MinhaTela para a taxonomia do Play Infinity. */
function mapCategory(mt: MinhaTelaChannel): "Esportes" | "TV Aberta" | "Notícias" | "Filmes & Séries" | "Infantil" | "Variedades" {
  const cat = (mt.category || "").toLowerCase();
  const name = (mt.name || "").toLowerCase();
  // PPVs esportivos (Premiere 8, SportyNet+) ficam em Esportes como os demais.
  if (/esport|sport/.test(cat) || /\bpremiere|sportynet|combate|cazetv/.test(name)) return "Esportes";
  if (/noticia|news/.test(cat)) return "Notícias";
  if (/infantil|infantis|kids|anime/.test(cat)) return "Infantil";
  if (/filme|serie|cinema|pay ?per ?view/.test(cat)) return "Filmes & Séries";
  return "Variedades"; // DOCUMENTARIOS, MUSICA, VARIEDADES, A FAZENDA 18
}

/** Canal novo montado a partir do catálogo MinhaTela (exclusivos). */
export interface MinhaTelaNewChannel {
  id: string;
  name: string;
  category: "Esportes" | "TV Aberta" | "Notícias" | "Filmes & Séries" | "Infantil" | "Variedades";
  logo: string;
  quality: "1080p" | "720p" | "HD";
  currentProgram?: string;
  description?: string;
  servers: EmbedServer[];
}

/**
 * Canais EXCLUSIVOS do MinhaTela (não existem no catálogo Play Infinity nem
 * no Saimo) prontos para serem anexados ao catálogo público. `represented`
 * deve conter as chaves minhaTelaKey() de todos os nomes já representados.
 */
export function getMinhaTelaNewChannels(represented: Set<string>): MinhaTelaNewChannel[] {
  const out: MinhaTelaNewChannel[] = [];
  if (snapshot.size === 0) return out;
  for (const mt of snapshot.values()) {
    const servers = streamsToEmbedServers(mt.streams || []);
    if (servers.length === 0) continue; // sem fonte não vale canal novo
    const normalized = mt.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ");
    if (BLOCKED_EXTERNAL_CHANNELS.has(normalized)) continue;
    const key = minhaTelaKey(mt.name);
    if (represented.has(key)) continue;
    represented.add(key); // dois slugs distintos não geram canal duplicado
    let logo = "";
    try {
      const u = new URL(mt.logo || "");
      if (u.protocol === "https:") logo = u.href;
    } catch {}
    out.push({
      id: `mt-${mt.slug.replace(/[^a-z0-9-]/gi, "-")}`,
      name: mt.name,
      category: mapCategory(mt),
      logo,
      quality: bestQuality(mt.streams || []),
      currentProgram: mt.now?.title || undefined,
      description: mt.description || undefined,
      servers,
    });
  }
  return out;
}

/** Metadados do snapshot para diagnóstico/admin. */
export function minhaTelaStats(): {
  started: boolean;
  channels: number;
  sources: number;
  fetchedAt: number | null;
  stale: boolean;
} {
  let sources = 0;
  for (const c of snapshot.values()) sources += (c.streams || []).length;
  return {
    started: watcherStarted,
    channels: snapshot.size,
    sources,
    fetchedAt: snapshotFetchedAt || null,
    stale: snapshotFetchedAt ? Date.now() - snapshotFetchedAt > REFRESH_MS * 3 : true,
  };
}

/**
 * Hosts (lowercase) das fontes embed conhecidas no snapshot — allowlist do
 * /api/embed-player. Só entradas https públicas. Se o snapshot estiver
 * vazio (boot frio antes do primeiro refresh), o set fica vazio — ninguém
 * tem fontes embed no catálogo nesse momento, então ninguém chama o proxy.
 */
export function getMinhaTelaEmbedHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const c of snapshot.values()) {
    for (const s of c.streams || []) {
      if (!s || !s.url || !isSafeEmbedUrl(s.url)) continue;
      try {
        hosts.add(new URL(s.url).hostname.toLowerCase());
      } catch {
        /* URL inválida já filtrada acima */
      }
    }
  }
  return hosts;
}

// ---------------------------------------------------------------------------
// Hooks exclusivos de teste (não usar em produção)
// ---------------------------------------------------------------------------

/** [TESTES] Injeta snapshot sintético sem rede. */
export function __setSnapshotForTests(channels: MinhaTelaChannel[] | null): void {
  if (!channels) {
    snapshot = new Map();
    snapshotFetchedAt = 0;
    return;
  }
  snapshot = new Map(channels.map((c) => [c.slug, c]));
  snapshotFetchedAt = Date.now();
}

/** [TESTES] Dispara um refresh único (usa globalThis.fetch — mockável). */
export function __refreshSnapshotForTests(): Promise<void> {
  return refreshSnapshot();
}
