/**
 * Catálogo externo de canais ao vivo (modelo "Saimo-style").
 *
 * Fontes de dados (arquivos texto, populados pelo scraper
 * server/services/saimoCatalogScraper.ts a partir do catálogo público da
 * Saimo TV em canais-saimo.pages.dev/catalogo.txt e filmes-saimo.pages.dev/indice.txt):
 *
 *   data/external-channels.txt  (formato "chave: valor", uma linha por campo)
 *     canal: <nome>                 — inicia um canal novo
 *     categoria: <categoria>        — opcional
 *     logo: <url>                   — opcional
 *     fonte: <url | baseIdx:streamId> — adiciona fonte; a primeira é a preferida
 *     qualidade: <texto>            — opcional, pertence à fonte imediatamente acima
 *     referer: <url>                — opcional, pertence à fonte acima
 *     agente: <user-agent>          — opcional, pertence à fonte acima
 *     chave: <KID:KEY ClearKey>     — fonte DASH; ignorada pelo resolver (player é HLS)
 *     (linhas em branco e iniciadas por # são ignoradas)
 *
 *   data/external-bases.txt  (gitignored — contém credenciais Xtream no path)
 *     base: <idx> <url-prefix>
 *     Usado quando uma fonte é referência "baseIdx:streamId" (futuro). Fontes
 *     de canal do catálogo Saimo atualmente são URLs diretas.
 *
 * Resolução: resolveExternalChannel(name) → busca canal por nome normalizado
 * (case/acento insensível), percorre fontes EM ORDEM, faz probe HLS com cache
 * e retorna a primeira fonte viva.
 *
 * Segurança (protocolo dos relatórios #8/#12):
 *  - Anti-SSRF: TODA fonte é validada com isPrivateOrLocalHost() (resolução
 *    DNS ativa) antes de qualquer fetch do servidor (probe).
 *  - Hosts com TLD .invalid (ex: desativado.invalid usado pela Saimo para
 *    marcar painéis mortos) são pulados sem fetch.
 *  - Somente protocolo http(s) é aceito.
 */
import fs from "fs";
import path from "path";
import { isPrivateOrLocalHost } from "../utils/helpers";

// ---------------------------------------------------------------------------
// Caminhos — EXTERNAL_CATALOG_DIR na VPS aponta para o deploy real; em dev o
// default é o data/ do working directory (mesmo padrão do nixplayCatalog.ts).
// ---------------------------------------------------------------------------
export function externalCatalogDir(): string {
  return process.env.EXTERNAL_CATALOG_DIR || path.join(process.cwd(), "data");
}
function channelsFilePath(): string {
  return path.join(externalCatalogDir(), "external-channels.txt");
}
function basesFilePath(): string {
  return path.join(externalCatalogDir(), "external-bases.txt");
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface ExternalFonte {
  /** URL direta (http/https) OU referência de base "idx:streamId" (bruta). */
  raw: string;
  /** URL absoluta resolvida (fontes diretas já nascem resolvidas). */
  url: string | null;
  qualidade?: string;
  referer?: string;
  agente?: string;
  /** ClearKey DASH — fonte incompatível com player HLS. */
  chave?: string;
}

export interface ExternalChannel {
  name: string;
  category?: string;
  logo?: string;
  fontes: ExternalFonte[];
}

export interface ResolvedExternalChannel {
  channelName: string;
  fonteIndex: number;
  url: string;
  qualidade?: string;
  referer?: string;
  agente?: string;
}

// ---------------------------------------------------------------------------
// Parser (puro, testável em node sem disco/rede)
// ---------------------------------------------------------------------------
export function parseExternalChannels(text: string): ExternalChannel[] {
  const channels: ExternalChannel[] = [];
  let current: ExternalChannel | null = null;
  let currentFonte: ExternalFonte | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (!value) continue;

    switch (key) {
      case "canal":
        current = { name: value, fontes: [] };
        channels.push(current);
        currentFonte = null;
        break;
      case "categoria":
        if (current) current.category = value;
        break;
      case "logo":
        if (current) current.logo = value;
        break;
      case "fonte":
        if (current) {
          currentFonte = { raw: value, url: resolveFonteUrlValue(value) };
          current.fontes.push(currentFonte);
        }
        break;
      case "qualidade":
        if (currentFonte) currentFonte.qualidade = value;
        break;
      case "referer":
        if (currentFonte) currentFonte.referer = value;
        break;
      case "agente":
        if (currentFonte) currentFonte.agente = value;
        break;
      case "chave":
        if (currentFonte) currentFonte.chave = value;
        break;
      // "nome:" (rótulo da fonte) e chaves desconhecidas: ignoradas
      default:
        break;
    }
  }

  return channels.filter((c) => c.fontes.length > 0);
}

/**
 * Converte o valor bruto de uma fonte em URL absoluta:
 *  - "idx:streamId" → null (resolvido depois contra external-bases.txt)
 *  - "http(s)://..." → a própria URL
 *  - qualquer outra coisa → null (fonte inválida, pulada na resolução)
 */
function resolveFonteUrlValue(raw: string): string | null {
  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}

export function parseExternalBases(text: string): Map<number, string> {
  const bases = new Map<number, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    // formato: "base: <idx> <url>"
    const match = line.match(/^base:\s*(\d+)\s+(https?:\/\/\S+)$/i);
    if (!match) continue;
    const idx = Number(match[1]);
    const url = match[2];
    if (!url.endsWith("/")) bases.set(idx, url + "/");
    else bases.set(idx, url);
  }
  return bases;
}

/**
 * URL final de uma fonte, considerando referência de base "idx:streamId".
 * Retorna null se a base não existir ou o formato for inválido.
 */
export function buildFonteUrl(fonte: ExternalFonte, bases: Map<number, string>): string | null {
  if (fonte.url) return fonte.url;
  const m = fonte.raw.match(/^(\d+):(\d+)$/);
  if (!m) return null;
  const base = bases.get(Number(m[1]));
  if (!base) return null;
  return `${base}${m[2]}.m3u8`;
}

// ---------------------------------------------------------------------------
// Normalização e lookup de canal
// ---------------------------------------------------------------------------
export function normalizeChannelName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function findExternalChannel(name: string, channels: ExternalChannel[]): ExternalChannel | null {
  const target = normalizeChannelName(name);
  if (!target) return null;
  // 1. match exato normalizado
  for (const ch of channels) {
    if (normalizeChannelName(ch.name) === target) return ch;
  }
  // 2. match por contenção (ex: "premiere 2 hd" acha "premiere 2").
  //    Guard de tamanho mínimo: sem ele, um canal curto como "X" casaria com
  //    QUALQUER query que contenha a letra x (bug pego pelo teste de regressão
  //    com "Canal Que Nao Existe" — "existe" contém "x").
  if (target.length >= 4) {
    for (const ch of channels) {
      const n = normalizeChannelName(ch.name);
      if (n.length >= 4 && (n.includes(target) || target.includes(n))) return ch;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cache em memória (mesmo padrão do bolodechocolate.ts: TTL curto + clear)
// ---------------------------------------------------------------------------
const FILE_CACHE_TTL_MS = 5 * 60 * 1000;
let channelsCache: { channels: ExternalChannel[]; at: number } | null = null;
let basesCache: { bases: Map<number, string>; at: number } | null = null;

export function clearExternalCatalogCache(): void {
  channelsCache = null;
  basesCache = null;
  probeCache.clear();
}

export function loadExternalChannels(): ExternalChannel[] {
  if (channelsCache && Date.now() - channelsCache.at < FILE_CACHE_TTL_MS) {
    return channelsCache.channels;
  }
  let channels: ExternalChannel[] = [];
  try {
    const file = channelsFilePath();
    if (fs.existsSync(file)) {
      channels = parseExternalChannels(fs.readFileSync(file, "utf-8"));
    }
  } catch (err) {
    console.warn("[externalCatalog] Falha ao ler external-channels.txt:", err);
  }
  channelsCache = { channels, at: Date.now() };
  return channels;
}

export function loadExternalBases(): Map<number, string> {
  if (basesCache && Date.now() - basesCache.at < FILE_CACHE_TTL_MS) {
    return basesCache.bases;
  }
  let bases = new Map<number, string>();
  try {
    const file = basesFilePath();
    if (fs.existsSync(file)) {
      bases = parseExternalBases(fs.readFileSync(file, "utf-8"));
    }
  } catch (err) {
    console.warn("[externalCatalog] Falha ao ler external-bases.txt:", err);
  }
  basesCache = { bases, at: Date.now() };
  return bases;
}

// ---------------------------------------------------------------------------
// Probe HLS profundo (com cache: positivo 3 min, negativo 45 s)
// ---------------------------------------------------------------------------
//
// Histórico (motivação): o probe original aceitava qualquer resposta 2xx cujo
// corpo contivesse "#EXTM3U" ou "#EXT-X". Isso permitia que playlists-isca
// passassem como "vivas": catálogos adversários servem m3u8 sintaticamente
// válido mas com segmentos apontando para .png/.woff (404), ou páginas HTML de
// bloqueio do Cloudflare. O resolver escolhia essas fontes como #1 e o player
// não reproduzia nada. Bug confirmado em produção com SporTV/Premiere.
//
// Validação agora é estratificada e barata:
//   1. Texto deve conter "#EXTM3U".
//   2. Deve haver ≥1 "#EXTINF" (playlist de mídia) OU "#EXT-X-STREAM-INF"
//      (playlist master — variante a ser sondada recursivamente, depth=1).
//   3. A primeira URL de segmento/variante não pode ter extensão em
//      NON_MEDIA_EXTENSIONS (.png/.woff/.txt/.html/.js/...).
//   4. Buscar os primeiros 188 bytes do primeiro segmento e validar magic
//      bytes: TS sync 0x47 / fMP4 ftyp|styp / AAC ADTS 0xFF F0. Rejeita .png
//      de verdade, woff de verdade, HTML, e segmentos 404.
//
// Custo: 1 fetch extra por fonte sondada (~1.5s). Deadline do resolver
// mantido em 7s (Sentinela usa timeout 7s); batch paralelo de 4 fontes
// completa dentro do deadline.
const PROBE_POSITIVE_TTL_MS = 3 * 60 * 1000;
const PROBE_NEGATIVE_TTL_MS = 45 * 1000;
const probeCache = new Map<string, { ok: boolean; expires: number }>();

const PROBE_DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Extensões de caminho que NÃO são segmentos de vídeo HLS legítimos.
// Playlists-isca frequentemente listam URLs .png/.woff que 404 ou retornam
// lixo. Sem extensão (Xtream com query, paths estilo /live/u/p/123.m3u8)
// passa direto — denylist, não allowlist.
export const NON_MEDIA_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "tif", "tiff",
  "woff", "woff2", "ttf", "otf", "eot",
  "txt", "html", "htm", "js", "css", "json", "xml", "md",
]);

/**
 * Valida conteúdo de playlist HLS de forma estrita e barata (puro, síncrono,
 * testável em node sem rede).
 *
 * Retorna:
 *   { ok: true, kind: "media"|"master", firstUrl }
 *     firstUrl é a URL absoluta (resolvida contra baseUrl se relativa) do
 *     primeiro segmento (media) ou primeira variante (master).
 *   { ok: false, reason }
 */
export function validatePlaylistContent(
  text: string,
  baseUrl?: string
): { ok: boolean; kind?: "media" | "master"; firstUrl?: string | null; reason?: string } {
  if (!text || !text.includes("#EXTM3U")) {
    return { ok: false, reason: "sem #EXTM3U" };
  }
  const hasInf = /^#EXTINF:/m.test(text);
  const hasStreamInf = /^#EXT-X-STREAM-INF:/m.test(text);
  if (!hasInf && !hasStreamInf) {
    return { ok: false, reason: "sem #EXTINF ou #EXT-X-STREAM-INF" };
  }
  const kind: "media" | "master" = hasInf ? "media" : "master";

  // Primeira linha não-vazia que não começa com '#' é a URL do segmento
  // (media) ou variante (master). Pode ser relativa.
  let firstRaw: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    firstRaw = line;
    break;
  }
  if (!firstRaw) {
    return { ok: false, reason: "playlist sem URL de segmento/variante" };
  }

  // Resolve URL relativa contra baseUrl (a URL da playlist original)
  let firstUrl: string;
  if (/^https?:\/\//i.test(firstRaw)) {
    firstUrl = firstRaw;
  } else if (baseUrl) {
    try {
      firstUrl = new URL(firstRaw, baseUrl).toString();
    } catch {
      return { ok: false, reason: "URL de segmento inválida/irresolvível" };
    }
  } else {
    // Sem baseUrl não dá pra checar extensão relativa; aceita (não deveria
    // acontecer em produção — probe sempre tem a URL da playlist).
    firstUrl = firstRaw;
  }

  // Denylist de extensão: isca clássica é .png/.woff que 404 ou retorna lixo
  try {
    const u = new URL(firstUrl);
    const pathLower = u.pathname.toLowerCase();
    const dot = pathLower.lastIndexOf(".");
    if (dot >= 0) {
      const ext = pathLower.slice(dot + 1);
      if (NON_MEDIA_EXTENSIONS.has(ext)) {
        return { ok: false, reason: `extensão .${ext} não é mídia (segmento isca)` };
      }
    }
    // Sem extensão: aceita (Xtream, /live/u/p/123 sem .m3u8, etc.)
  } catch {
    // URL inválida — deixa o fetch falhar mais adiante
  }

  return { ok: true, kind, firstUrl };
}

/**
 * Busca os primeiros 188 bytes de um segmento e valida magic bytes.
 * Aceita:
 *   - MPEG-TS: byte 0 == 0x47 (sync byte, presente a cada 188 bytes)
 *   - fMP4 init/media: bytes 4..8 == "ftyp" ou "styp"
 *   - AAC ADTS: byte 0 == 0xFF e byte 1 & 0xF0 == 0xF0 (áudio, raro em TV)
 * Rejeita: PNG (0x89 'PNG'), wOFF ('wOFF'), HTML ('<'), etc.
 * Também rejeita se o fetch falhar (404, timeout, rede).
 */
export async function probeSegmentMagicBytes(
  url: string,
  opts: { referer?: string; agente?: string; timeoutMs?: number } = {}
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 1500),
      redirect: "follow",
      headers: {
        "User-Agent": opts.agente || PROBE_DEFAULT_UA,
        Accept: "*/*",
        Range: "bytes=0-188",
        ...(opts.referer ? { Referer: opts.referer } : {}),
      },
    });
    if (res.status < 200 || res.status >= 400) return false;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0) return false;
    // TS sync byte
    if (buf[0] === 0x47) return true;
    // fMP4 ftyp/styp box (size 4 bytes + tag 4 bytes)
    if (buf.length >= 8) {
      const tag = String.fromCharCode(buf[4], buf[5], buf[6], buf[7]);
      if (tag === "ftyp" || tag === "styp") return true;
    }
    // AAC ADTS sync (áudio)
    if (buf[0] === 0xff && (buf[1] & 0xf0) === 0xf0) return true;
    return false;
  } catch {
    return false;
  }
}

export async function probeExternalFonte(
  url: string,
  opts: { referer?: string; agente?: string; timeoutMs?: number; _depth?: number } = {}
): Promise<boolean> {
  const depth = opts._depth ?? 0;
  // Cache key inclui depth para diferenciar probe direto vs recursão de master
  const cacheKey = `${url}|${opts.referer || ""}|d=${depth}`;
  const cached = probeCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.ok;

  let ok = false;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
      redirect: "follow",
      headers: {
        "User-Agent": opts.agente || PROBE_DEFAULT_UA,
        Accept: "*/*",
        Range: "bytes=0-2048",
        ...(opts.referer ? { Referer: opts.referer } : {}),
      },
    });
    if (res.status >= 200 && res.status < 400) {
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const contentLength = Number(res.headers.get("content-length") || "0");
      // Resposta 2xx grande (MP4 que ignora Range): aceita sem parsear corpo
      // — legado de compat para fontes que são MP4 direto, não HLS.
      if (
        !contentType.includes("mpegurl") &&
        !contentType.includes("vnd.apple") &&
        !contentType.includes("text/") &&
        contentLength > 2 * 1024 * 1024
      ) {
        ok = true;
      } else {
        // Lê texto e valida conteúdo da playlist estritamente
        const text = await res.text();
        const valid = validatePlaylistContent(text, url);
        if (!valid.ok) {
          ok = false;
        } else if (valid.kind === "master" && valid.firstUrl) {
          // Master playlist: sonda recursivamente a primeira variante.
          // Guard de depth impede loop infinito (master → master → ...).
          if (depth < 1) {
            ok = await probeExternalFonte(valid.firstUrl, { ...opts, _depth: depth + 1 });
          } else {
            // Já estamos na recursão: variante era master — suspeito, falha
            ok = false;
          }
        } else if (valid.kind === "media" && valid.firstUrl) {
          // Media playlist: checar magic bytes do primeiro segmento
          ok = await probeSegmentMagicBytes(valid.firstUrl, {
            referer: opts.referer,
            agente: opts.agente,
            timeoutMs: 1500,
          });
        } else {
          ok = false;
        }
      }
    }
  } catch {
    ok = false;
  }

  probeCache.set(cacheKey, {
    ok,
    expires: Date.now() + (ok ? PROBE_POSITIVE_TTL_MS : PROBE_NEGATIVE_TTL_MS),
  });
  if (probeCache.size > 5000) probeCache.clear();
  return ok;
}

// ---------------------------------------------------------------------------
// Validação anti-SSRF de fonte (chamada antes de qualquer fetch do servidor)
// ---------------------------------------------------------------------------
async function isFonteAllowed(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    // Hosts .invalid (marcador de painel desativado da Saimo): pulpar sem DNS
    if (parsed.hostname.toLowerCase().endsWith(".invalid")) return false;
    const host = parsed.hostname.toLowerCase();
    if (host.includes("vaiagora.vip") || host.includes("vivlar.me")) return false;
    if (await isPrivateOrLocalHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Resolver principal
// ---------------------------------------------------------------------------
export interface ResolveOptions {
  /** Deadline total da resolução (default 7000 ms — Sentinela usa timeout 7 s; probe profundo precisa de ~5s por batch de 4). */
  deadlineMs?: number;
  /** Máximo de fontes sondadas em paralelo por batelada. */
  batch?: number;
  /** Timeout de cada probe individual. */
  probeTimeoutMs?: number;
}

export async function resolveExternalChannel(
  name: string,
  opts: ResolveOptions = {}
): Promise<ResolvedExternalChannel | null> {
  const deadline = Date.now() + (opts.deadlineMs ?? 7000);
  const batchSize = opts.batch ?? 4;
  const probeTimeoutMs = opts.probeTimeoutMs ?? 3000;

  const channels = loadExternalChannels();
  if (channels.length === 0) return null;
  const channel = findExternalChannel(name, channels);
  if (!channel || channel.fontes.length === 0) return null;

  const bases = loadExternalBases();

  // Pré-resolve URLs das fontes (diretas ou via base Xtream) e filtra:
  //  - fontes DASH (chave ClearKey) — player é HLS
  //  - fontes com URL inválida/base inexistente
  //  - fontes em hosts não permitidos (anti-SSRF — checagem DNS ativa)
  interface Candidate {
    index: number;
    url: string;
    fonte: ExternalFonte;
    ssrfOk: boolean;
  }
  const candidates: Candidate[] = [];
  for (let i = 0; i < channel.fontes.length; i++) {
    const fonte = channel.fontes[i];
    if (fonte.chave) continue; // DASH ClearKey — incompatível
    const url = buildFonteUrl(fonte, bases);
    if (!url) continue;
    candidates.push({ index: i, url, fonte, ssrfOk: false });
  }
  if (candidates.length === 0) return null;

  // Validação anti-SSRF em paralelo (DNS) — obrigatória antes do probe
  await Promise.all(
    candidates.map(async (c) => {
      c.ssrfOk = await isFonteAllowed(c.url);
    })
  );
  const allowed = candidates.filter((c) => c.ssrfOk);
  if (allowed.length === 0) return null;

  for (const c of allowed) {
    const cacheKey = `${c.url}|${c.fonte.referer || ""}|d=0`;
    const cached = probeCache.get(cacheKey);
    if (cached && cached.expires > Date.now() && cached.ok) {
      return {
        channelName: channel.name,
        fonteIndex: c.index,
        url: c.url,
        qualidade: c.fonte.qualidade,
        referer: c.fonte.referer,
        agente: c.fonte.agente,
      };
    }
  }

  // Probe em bateladas paralelas respeitando o deadline global; ao final,
  // escolhe a primeira fonte viva NA ORDEM ORIGINAL (a preferida da Saimo).
  const probed = new Map<number, boolean>();
  for (let i = 0; i < allowed.length; i += batchSize) {
    if (Date.now() > deadline) break;
    const slice = allowed.slice(i, i + batchSize);
    await Promise.all(
      slice.map(async (c) => {
        probed.set(
          c.index,
          await probeExternalFonte(c.url, {
            referer: c.fonte.referer,
            agente: c.fonte.agente,
            timeoutMs: probeTimeoutMs,
          })
        );
      })
    );
    if (slice.some((c) => probed.get(c.index) === true)) break;
  }

  for (const c of allowed) {
    if (probed.get(c.index) === true) {
      return {
        channelName: channel.name,
        fonteIndex: c.index,
        url: c.url,
        qualidade: c.fonte.qualidade,
        referer: c.fonte.referer,
        agente: c.fonte.agente,
      };
    }
  }

  // Nenhuma fonte sondada como viva. Fallback inteligente:
  //   - Se o deadline cortou antes de sondar todas (batch incompleto),
  //     retorna a primeira fonte PERMITIDA que ainda não foi sondada —
  //     pode estar viva, melhor tentar cego do que falhar.
  //   - Se TODAS foram sondadas e falharam (iscas confirmadas mortas),
  //     retorna null (502) — NUNCA servir fonte sabidamente ruim. O
  //     player tem fallback próprio para outros servers do canal, e o
  //     admin vê no painel que o canal realmente precisa de atenção.
  // Bug observado em produção: SporTV/Premiere 2 tinham iscas em #1
  // que passavam no probe raso antigo; depois do fix do probe profundo,
  // as iscas são corretamente rejeitadas, mas o fallback cego antigo
  // ainda as retornava — player recebia a isca e não reproduzia.
  for (const c of allowed) {
    if (!probed.has(c.index)) {
      return {
        channelName: channel.name,
        fonteIndex: c.index,
        url: c.url,
        qualidade: c.fonte.qualidade,
        referer: c.fonte.referer,
        agente: c.fonte.agente,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Estatísticas (rota admin)
// ---------------------------------------------------------------------------
export function externalCatalogStats(): {
  channelsCount: number;
  fontesCount: number;
  basesCount: number;
  channelsFileExists: boolean;
  basesFileExists: boolean;
} {
  const channels = loadExternalChannels();
  const bases = loadExternalBases();
  return {
    channelsCount: channels.length,
    fontesCount: channels.reduce((acc, c) => acc + c.fontes.length, 0),
    basesCount: bases.size,
    channelsFileExists: fs.existsSync(channelsFilePath()),
    basesFileExists: fs.existsSync(basesFilePath()),
  };
}
