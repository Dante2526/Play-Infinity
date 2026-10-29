/**
 * Adaptador SQLite para o catálogo Encontrei (Map-like).
 *
 * Mesma mecânica do vizerSqliteStore, mas com a correção ESM: usa
 * `createRequire(import.meta.url)` pra carregar `node:sqlite` (em vez do
 * `require()` cru do vizerSqliteStore, que quebra em `npx tsx` + "type":"module").
 * Funciona nos 2 contextos:
 *   - Dev server (npx tsx, ESM): createRequire resolve node:sqlite em runtime
 *   - Bundle de produção (esbuild --format=cjs): import.meta.url é shimmed,
 *     createRequire continua funcionando
 *
 * Reutiliza as classes SqliteMovieIndex / SqliteEpisodeIndex / SqliteSeriesSeasonsIndex
 * do vizerSqliteStore — são genéricas, só precisam de um DatabaseSync handle.
 *
 * Semântica fiel aos Maps originais (encontreiLookup.ts):
 *   - get/has → SELECT no DB (com cache LRU quente em memória)
 *   - set → override em memória (entries memoizadas em runtime, ex.: filme
 *     resolvido ao vivo preenchido com servers)
 *   - delete → tombstone em memória (fileId morto — não re-testa a cada request)
 *   - clear() → zera overrides+tombstones+LRU (usado no reload por mtime)
 *
 * Mutações em runtime NÃO tocam o .db (perdem-se no restart, exatamente como
 * os Maps hoje). O .db só é reescrito pela pipeline build_encontrei_sqlite.py.
 *
 * Fallback automático: se node:sqlite indisponível ou .db ausente, o caller
 * (loadCatalogs) cai pro caminho JSON existente.
 *
 * Schema: ver scripts/build_encontrei_sqlite.py (schema_version=1, idêntico ao vizer).
 */
import path from "path";
import fs from "fs";
import { createRequire } from "node:module";
import {
  SqliteMovieIndex,
  SqliteEpisodeIndex,
  SqliteSeriesSeasonsIndex,
} from "./vizerSqliteStore";

// ---- Detecção de node:sqlite (Node >= 22.5; estável no 24+) ----
// Padrão dual-contexto (mesmo do firebaseAdmin.ts / requireAdminAuth.ts):
//   - ESM (npx tsx dev server): `require` não existe → createRequire(import.meta.url)
//   - Bundle CJS (esbuild --format=cjs, produção e testes virtuais): `require`
//     nativo existe → usa direto. NÃO usar createRequire(import.meta.url) cru
//     em CJS — o esbuild substitui import.meta por {} e createRequire(undefined)
//     lança TypeError no carregamento do módulo (bug real, pego pelo CI).
const _moduleRequire: NodeRequire =
  typeof require !== "undefined"
    ? require
    : createRequire(import.meta.url);
let _DatabaseSync: any = null;
let _sqliteOk = false;
let _loadError: string | null = null;
try {
  const mod = _moduleRequire("node:sqlite");
  if (mod && typeof mod.DatabaseSync === "function") {
    _DatabaseSync = mod.DatabaseSync;
    _sqliteOk = true;
  } else {
    _loadError = "node:sqlite carregado sem DatabaseSync";
  }
} catch (e) {
  _loadError = `node:sqlite indisponível: ${e instanceof Error ? e.message : String(e)}`;
}

export function isEncontreiSqliteAvailable(): boolean {
  return _sqliteOk;
}

export function getEncontreiSqliteLoadError(): string | null {
  return _loadError;
}

/** Procura encontrei-catalog.db nos mesmos 2 dirs que o caminho JSON usa. */
export function findEncontreiDb(): string | null {
  const cands = [
    path.join(process.cwd(), "public", "data", "encontrei-catalog.db"),
    path.join(process.cwd(), "data", "encontrei-catalog.db"),
  ];
  for (const p of cands) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Loja: abre o DB read-only e instancia os 3 índices. Falha gracefully.
// ──────────────────────────────────────────────────────────────────────────
export interface EncontreiSqliteStore {
  movieIndex: SqliteMovieIndex;
  episodeIndex: SqliteEpisodeIndex;
  seriesSeasonsIndex: SqliteSeriesSeasonsIndex;
  /** Hidrata _tmdbToSerieIdMap (Map<number, number>) com tmdb→serie_id da base.
   *  NÃO sobrescreve o que o vizer já populou (mantém paridade com tryLoadCatalog
   *  que faz `if (!_tmdbToSerieIdMap.has(ep.tmdb_id))` antes de setar). */
  hydrateSerieIds(target: Map<number, number>): number;
  meta(key: string): string | null;
  close(): void;
}

export function openEncontreiSqlite(dbPath: string): EncontreiSqliteStore | null {
  if (!_sqliteOk) {
    console.warn("[encontrei-sqlite] indisponível:", _loadError, "— voltando pro JSON");
    return null;
  }
  if (!dbPath) return null;
  try {
    const db = new _DatabaseSync(dbPath, { readOnly: true });
    // Sanity: schema check (mesma lógica do vizerSqliteStore)
    const v = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
    if (!v || v.value !== "1") {
      _loadError = `schema_version inesperado: ${v?.value ?? "(ausente)"}`;
      console.warn("[encontrei-sqlite] schema_version inesperado:", v?.value, "— voltando pro JSON");
      db.close();
      return null;
    }
    const movieIndex = new SqliteMovieIndex(db);
    const episodeIndex = new SqliteEpisodeIndex(db);
    const seriesSeasonsIndex = new SqliteSeriesSeasonsIndex(db);
    return {
      movieIndex,
      episodeIndex,
      seriesSeasonsIndex,
      hydrateSerieIds(target: Map<number, number>): number {
        let n = 0;
        const stmt = db.prepare("SELECT tmdb_id, serie_id FROM serie_ids");
        for (const row of stmt.iterate()) {
          if (row.tmdb_id != null && row.serie_id != null && !target.has(row.tmdb_id)) {
            target.set(row.tmdb_id, row.serie_id);
            n += 1;
          }
        }
        return n;
      },
      meta(key: string): string | null {
        const r = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
        return r ? r.value : null;
      },
      close() { try { db.close(); } catch { /* */ } },
    };
  } catch (e) {
    _loadError = e instanceof Error ? e.message : String(e);
    console.warn("[encontrei-sqlite] falha ao abrir:", _loadError);
    return null;
  }
}
