/**
 * Scraper do catálogo público de canais da Saimo TV (Cloudflare Pages).
 *
 * Baixa APENAS:
 *  - https://canais-saimo.pages.dev/catalogo.txt  → data/external-channels.txt
 *  - https://filmes-saimo.pages.dev/indice.txt    → data/external-bases.txt
 *    (bases Xtream; hoje usadas só por fontes "idx:streamId" — futuras)
 *
 * Escopo deliberadamente REDUZIDO (decisão do cliente): NÃO baixa catálogo de
 * filmes/séries (filmes-*.txt), NÃO toca em TMDB, NÃO mexe em VOD. Somente
 * canais ao vivo.
 *
 * Segurança:
 *  - Allowlist hardcoded de 2 domínios Saimo (assertSaimoHost) + anti-SSRF
 *    (isPrivateOrLocalHost) — o scraper nunca busca em nenhum outro host,
 *    mesmo que uma env var seja manipulada.
 *  - Bases com host .invalid (desativado.invalid — marcador da Saimo para
 *    painel morto) são puladas.
 *  - Escrita atômica: .tmp + fs.renameSync (leitor nunca vê arquivo parcial).
 *  - Falha de formato NÃO sobrescreve o cache anterior em disco.
 *  - external-bases.txt contém credenciais Xtream no path → chmod 600 e
 *    listado no .gitignore.
 *
 * Cron: startSaimoSyncCron() — sync no boot (se arquivo ausente ou stale >6h,
 * com jitter p/ dessincronizar workers do cluster PM2) e depois a cada 6h.
 */
import fs from "fs";
import path from "path";
import { isPrivateOrLocalHost } from "../utils/helpers";
import { clearExternalCatalogCache, externalCatalogDir } from "./externalCatalog";

const SAIMO_ALLOWED_HOSTS = new Set(["filmes-saimo.pages.dev", "canais-saimo.pages.dev"]);
const CHANNELS_URL = "https://canais-saimo.pages.dev/catalogo.txt";
const BASES_URL = "https://filmes-saimo.pages.dev/indice.txt";
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const FETCH_TIMEOUT_MS = 30 * 1000;
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const MIN_CHANNELS_TO_ACCEPT = 10;
const MIN_BASES_TO_ACCEPT = 1;

const FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface SaimoSyncResult {
  success: boolean;
  channelsCount: number;
  fontesCount: number;
  basesCount: number;
  skippedBases: number;
  durationMs: number;
  error?: string;
}

/** Allowlist rígida: o scraper só fala com os 2 domínios Saimo. */
export function assertSaimoHost(url: string): void {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error(`URL malformada recusada pelo scraper: ${url.slice(0, 60)}`);
  }
  if (!SAIMO_ALLOWED_HOSTS.has(host)) {
    throw new Error(`Scraper só pode buscar em domínios Saimo — recusado: ${host}`);
  }
}

function channelsFilePath(): string {
  return path.join(externalCatalogDir(), "external-channels.txt");
}
function basesFilePath(): string {
  return path.join(externalCatalogDir(), "external-bases.txt");
}

async function fetchSaimoText(url: string): Promise<string> {
  assertSaimoHost(url);
  if (await isPrivateOrLocalHost(new URL(url).hostname)) {
    throw new Error("Host Saimo resolveu para endereço privado (Anti-SSRF) — abortando.");
  }
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": FETCH_UA, Accept: "text/plain,*/*" },
  });
  if (!res.ok) {
    throw new Error(`Saimo retornou HTTP ${res.status} para ${new URL(url).pathname}`);
  }
  return res.text();
}

/** Valida conteúdo do catálogo de canais: precisa ter canais e fontes. */
export function validateChannelsText(text: string): { ok: boolean; channels: number; fontes: number } {
  const channels = (text.match(/^canal:/gm) || []).length;
  const fontes = (text.match(/^fonte:/gm) || []).length;
  // fontes >= channels: todo canal precisa de ao menos 1 fonte. (Usar > exigiria
  // ≥2 fontes por canal e rejeitaria catálogos mínimos válidos — bug pego pelo
  // teste de regressão. Lixo/HTML tem 0 "canal:" → rejeitado do mesmo jeito.)
  return { ok: channels >= MIN_CHANNELS_TO_ACCEPT && fontes >= channels, channels, fontes };
}

/**
 * Processa o indice.txt: mantém apenas bases http(s) válidas e não-privadas,
 * pulando hosts .invalid (painéis desativados pela Saimo).
 * Preserva os índices originais (base: 2 continua sendo base: 2).
 */
export function filterBasesText(text: string): { lines: string[]; kept: number; skipped: number } {
  const lines: string[] = [];
  let kept = 0;
  let skipped = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^base:\s*(\d+)\s+(https?:\/\/\S+)$/i);
    if (!match) continue;
    const idx = Number(match[1]);
    const url = match[2];
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      skipped++;
      continue;
    }
    if (host.endsWith(".invalid")) {
      skipped++;
      continue;
    }
    // Checagem estática de IPs privados literais (DNS completo seria caro
    // demais no loop de sync; a defesa completa anti-SSRF acontece na
    // resolução, no externalCatalog.ts, para cada fonte usada).
    if (
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
      host === "localhost" ||
      host === "metadata.google.internal"
    ) {
      skipped++;
      continue;
    }
    lines.push(`base: ${idx} ${url}`);
    kept++;
  }
  return { lines, kept, skipped };
}

/** Escrita atômica: .tmp + rename. mode 600 para arquivos com credenciais. */
function atomicWrite(filePath: string, content: string, mode: number): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, { mode });
  fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, filePath);
}

let syncInflight: Promise<SaimoSyncResult> | null = null;

/** Sincroniza catálogo de canais + bases da Saimo. Nunca lança. */
export async function syncSaimoAll(): Promise<SaimoSyncResult> {
  const started = Date.now();
  const empty: SaimoSyncResult = {
    success: false, channelsCount: 0, fontesCount: 0, basesCount: 0, skippedBases: 0, durationMs: 0,
  };
  try {
    const [channelsText, basesText] = await Promise.all([
      fetchSaimoText(CHANNELS_URL),
      fetchSaimoText(BASES_URL),
    ]);

    // 1. Catálogo de canais — validação de formato antes de gravar
    const v = validateChannelsText(channelsText);
    if (!v.ok) {
      console.warn(
        `[saimo-scraper] Formato inesperado de catalogo.txt (canais=${v.channels}, fontes=${v.fontes}) — mantendo cache anterior. Início do conteúdo: ${channelsText.slice(0, 200).replace(/\n/g, "\\n")}`
      );
      return { ...empty, durationMs: Date.now() - started, error: "formato de catalogo.txt não reconhecido" };
    }

    // 2. Bases — filtra desativadas/privadas, preservando índices
    const bases = filterBasesText(basesText);
    if (bases.kept < MIN_BASES_TO_ACCEPT) {
      console.warn(`[saimo-scraper] indice.txt sem bases válidas (mantidas=${bases.kept}) — mantendo cache anterior.`);
      return { ...empty, durationMs: Date.now() - started, error: "indice.txt sem bases válidas" };
    }

    // 3. Escrita atômica (channels 644 — sem credenciais; bases 600 — credenciais no path)
    atomicWrite(channelsFilePath(), channelsText.endsWith("\n") ? channelsText : channelsText + "\n", 0o644);
    atomicWrite(basesFilePath(), bases.lines.join("\n") + "\n", 0o600);

    // 4. Invalida cache em memória do resolver
    clearExternalCatalogCache();

    const result: SaimoSyncResult = {
      success: true,
      channelsCount: v.channels,
      fontesCount: v.fontes,
      basesCount: bases.kept,
      skippedBases: bases.skipped,
      durationMs: Date.now() - started,
    };
    console.log(
      `[saimo-scraper] Sync OK: ${result.channelsCount} canais, ${result.fontesCount} fontes, ${result.basesCount} bases (${result.skippedBases} desativadas puladas) em ${result.durationMs}ms`
    );
    return result;
  } catch (err: any) {
    console.warn("[saimo-scraper] Falha no sync (mantendo cache anterior):", err?.message || err);
    return { ...empty, durationMs: Date.now() - started, error: err?.message || String(err) };
  }
}

/** Sync com dedup de chamadas concorrentes (cron + botão admin). */
export function syncSaimoAllDeduped(): Promise<SaimoSyncResult> {
  if (syncInflight) return syncInflight;
  syncInflight = syncSaimoAll().finally(() => {
    syncInflight = null;
  });
  return syncInflight;
}

let cronStarted = false;

/**
 * Cron interno: sync no boot (se catálogo ausente ou stale >6h, com jitter
 * aleatório de 0-30s para dessincronizar workers do cluster PM2) e depois a
 * cada 6h. Nunca lança; falhas apenas logam (o próximo tick tenta de novo).
 */
export function startSaimoSyncCron(): void {
  if (cronStarted) return;
  cronStarted = true;

  const initialDelayMs = Math.floor(Math.random() * 30 * 1000);
  setTimeout(() => {
    const channelsExists = fs.existsSync(channelsFilePath());
    const channelsStale =
      channelsExists && Date.now() - fs.statSync(channelsFilePath()).mtimeMs > STALE_AFTER_MS;
    if (!channelsExists || channelsStale) {
      syncSaimoAllDeduped().then((r) => {
        if (r.success) {
          console.log(`[saimo-scraper] Sync inicial: ${r.channelsCount} canais, ${r.basesCount} bases.`);
        } else {
          console.warn(`[saimo-scraper] Sync inicial falhou: ${r.error} — nova tentativa no próximo tick (6h).`);
        }
      });
    } else {
      console.log("[saimo-scraper] Catálogo em disco é recente — sync inicial pulado.");
    }
  }, initialDelayMs).unref?.();

  setInterval(() => {
    syncSaimoAllDeduped();
  }, SYNC_INTERVAL_MS).unref?.();

  console.log(`[saimo-scraper] Cron iniciado (intervalo 6h, jitter inicial ${initialDelayMs}ms).`);
}
