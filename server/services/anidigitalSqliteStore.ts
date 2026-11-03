/**
 * Adaptador SQLite para o catálogo AnimesDigital (Map-like).
 *
 * Espelho do encontreiSqliteStore.ts — reusa SqliteMovieIndex /
 * SqliteEpisodeIndex / SqliteSeriesSeasonsIndex do vizerSqliteStore.
 *
 * DB: data/anidigital-catalog.db (gerado por scripts/build_anidigital_sqlite.py
 * a partir do JSON de scripts/scrape_anidigital_catalog.py). Schema idêntico
 * ao vizer/encontrei (schema_version=1).
 *
 * Payload de cada episódio (JSON): {title, slug, leg?:{slug,streamUrl},
 * dub?:{slug,streamUrl}}. O resolver consulta por (tmdb_id, season=1, episode)
 * e usa streamUrl direto — sem buscar no site ao vivo (lookup instantâneo).
 *
 * Fallback: se node:sqlite indisponível ou .db ausente, o resolver cai pro
 * caminho live search existente (searchAnidigital → /func/listanime).
 */
import path from "path";
import fs from "fs";
import { createRequire } from "node:module";
import {
  SqliteMovieIndex,
  SqliteEpisodeIndex,
  SqliteSeriesSeasonsIndex,
} from "./vizerSqliteStore";

const _moduleRequire: NodeRequire =
  typeof require !== "undefined" ? require : createRequire(import.meta.url);
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

export function isAnidigitalSqliteAvailable(): boolean {
  return _sqliteOk;
}

export function getAnidigitalSqliteLoadError(): string | null {
  return _loadError;
}

/** Procura anidigital-catalog.db nos mesmos dirs que os outros catálogos. */
export function findAnidigitalDb(): string | null {
  const cands = [
    path.join(process.cwd(), "public", "data", "anidigital-catalog.db"),
    path.join(process.cwd(), "data", "anidigital-catalog.db"),
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

export interface AnidigitalSqliteStore {
  movieIndex: SqliteMovieIndex;
  episodeIndex: SqliteEpisodeIndex;
  seriesSeasonsIndex: SqliteSeriesSeasonsIndex;
  meta(key: string): string | null;
  close(): void;
}

let _cached: { path: string; store: AnidigitalSqliteStore } | null = null;

export function openAnidigitalSqlite(dbPath: string): AnidigitalSqliteStore | null {
  if (!_sqliteOk) {
    console.warn("[anidigital-sqlite] indisponível:", _loadError, "— voltando pro live search");
    return null;
  }
  if (!dbPath) return null;
  if (_cached && _cached.path === dbPath) return _cached.store;
  try {
    const db = new _DatabaseSync(dbPath, { readOnly: true });
    const v = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
    if (!v || v.value !== "1") {
      _loadError = `schema_version inesperado: ${v?.value ?? "(ausente)"}`;
      console.warn("[anidigital-sqlite] schema_version inesperado:", v?.value);
      db.close();
      return null;
    }
    const store: AnidigitalSqliteStore = {
      movieIndex: new SqliteMovieIndex(db),
      episodeIndex: new SqliteEpisodeIndex(db),
      seriesSeasonsIndex: new SqliteSeriesSeasonsIndex(db),
      meta(key: string): string | null {
        const r = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
        return r ? r.value : null;
      },
      close() { try { db.close(); } catch { /* */ } if (_cached && _cached.path === dbPath) _cached = null; },
    };
    _cached = { path: dbPath, store };
    console.log("[anidigital-sqlite] DB aberto:", dbPath,
      "| eps:", db.prepare("SELECT COUNT(*) AS c FROM episodes").get().c,
      "| series:", db.prepare("SELECT COUNT(*) AS c FROM serie_ids").get().c);
    return store;
  } catch (e) {
    _loadError = e instanceof Error ? e.message : String(e);
    console.warn("[anidigital-sqlite] falha ao abrir:", _loadError);
    return null;
  }
}

/** Helper: abre (com cache) o DB default (findAnidigitalDb) ou retorna null. */
export function getAnidigitalStore(): AnidigitalSqliteStore | null {
  const p = findAnidigitalDb();
  return p ? openAnidigitalSqlite(p) : null;
}

/**
 * Stats do catálogo local pro health check do painel admin (mesmo contrato
 * do getSaimoCatalogStatus). Zeros quando node:sqlite indisponível ou .db
 * ausente — o health check sinaliza a causa no campo `note`.
 */
export function getAnidigitalCatalogStatus(): { movies: number; episodes: number; series: number } {
  const store = getAnidigitalStore();
  if (!store) return { movies: 0, episodes: 0, series: 0 };
  return {
    movies: store.movieIndex.size,
    episodes: store.episodeIndex.size,
    series: store.seriesSeasonsIndex.size,
  };
}
