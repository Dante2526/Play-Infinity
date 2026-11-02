/**
 * Adaptador SQLite para o catálogo Saimo TV VOD (Map-like).
 *
 * Mesma mecânica do vizerSqliteStore e encontreiSqliteStore:
 * Usa `createRequire(import.meta.url)` com fallback para `require` nativo
 * para carregar `node:sqlite` (DatabaseSync) em modo READ-ONLY.
 *
 * Reutiliza as classes SqliteMovieIndex, SqliteEpisodeIndex e SqliteSeriesSeasonsIndex
 * do vizerSqliteStore.
 *
 * Consultas instantâneas em O(1) com cache LRU em memória.
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

export function isSaimoSqliteAvailable(): boolean {
  return _sqliteOk;
}

export function getSaimoSqliteLoadError(): string | null {
  return _loadError;
}

/** Procura saimo-catalog.db nos diretórios public/data ou data. */
export function findSaimoDb(): string | null {
  const cands = [
    path.join(process.cwd(), "public", "data", "saimo-catalog.db"),
    path.join(process.cwd(), "data", "saimo-catalog.db"),
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

export interface SaimoSqliteStore {
  movieIndex: SqliteMovieIndex;
  episodeIndex: SqliteEpisodeIndex;
  seriesSeasonsIndex: SqliteSeriesSeasonsIndex;
  meta(key: string): string | null;
  findMovie(tmdbId: number): any | null;
  findEpisode(tmdbId: number, season: number, episode: number): any | null;
  close(): void;
}

let _cachedStore: SaimoSqliteStore | null = null;

export function openSaimoSqlite(dbPath?: string): SaimoSqliteStore | null {
  if (_cachedStore) return _cachedStore;
  if (!_sqliteOk) {
    console.warn("[saimo-sqlite] indisponível:", _loadError);
    return null;
  }
  const targetPath = dbPath || findSaimoDb();
  if (!targetPath) return null;

  try {
    const db = new _DatabaseSync(targetPath, { readOnly: true });
    const v = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
    if (!v || v.value !== "1") {
      _loadError = `schema_version inesperado: ${v?.value ?? "(ausente)"}`;
      console.warn("[saimo-sqlite] schema_version inesperado:", v?.value);
      db.close();
      return null;
    }

    const movieIndex = new SqliteMovieIndex(db);
    const episodeIndex = new SqliteEpisodeIndex(db);
    const seriesSeasonsIndex = new SqliteSeriesSeasonsIndex(db);

    _cachedStore = {
      movieIndex,
      episodeIndex,
      seriesSeasonsIndex,
      meta(key: string): string | null {
        const r = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
        return r ? r.value : null;
      },
      findMovie(tmdbId: number): any | null {
        return movieIndex.get(tmdbId) || null;
      },
      findEpisode(tmdbId: number, season: number, episode: number): any | null {
        return episodeIndex.get(`${tmdbId}:${season}:${episode}`) || null;
      },
      close(): void {
        try {
          db.close();
        } catch {}
        _cachedStore = null;
      },
    };

    return _cachedStore;
  } catch (err: any) {
    console.warn("[saimo-sqlite] falha ao abrir:", err?.message || err);
    return null;
  }
}

/** Retorna a instância ativa da loja Saimo SQLite ou abre automaticamente. */
export function getSaimoStore(): SaimoSqliteStore | null {
  if (_cachedStore) return _cachedStore;
  return openSaimoSqlite();
}

/** Estatísticas do catálogo Saimo SQLite para o monitor de saúde do painel admin. */
export function getSaimoCatalogStatus(): { movies: number; episodes: number; series: number } {
  const store = getSaimoStore();
  if (!store) return { movies: 0, episodes: 0, series: 0 };
  return {
    movies: store.movieIndex.size,
    episodes: store.episodeIndex.size,
    series: store.seriesSeasonsIndex.size,
  };
}
