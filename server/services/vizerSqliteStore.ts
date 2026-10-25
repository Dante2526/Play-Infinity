/**
 * Adaptador SQLite para o catálogo Vizer (Map-like).
 *
 * Substitui os 3 Maps em memória (_vizerMovieIndex, _vizerEpisodeIndex,
 * _vizerSeriesSeasonsIndex) por consultas a vizer-catalog.db — aberto
 * READ-ONLY (zero risco de corrupção por bugs do app).
 *
 * Semântica fiel aos Maps originais:
 *   - get/has → SELECT no DB (com cache LRU quente em memória)
 *   - set → override em memória (entries memoizadas em runtime, ex.: filme
 *     resolvido ao vivo preenchido com servers)
 *   - delete → tombstone em memória (fileId morto — não re-testa a cada request)
 *   - clear() → zera overrides+tombstones+LRU (usado no reload por mtime)
 *
 * Mutações em runtime NÃO tocam o .db (perdem-se no restart, exatamente como
 * os Maps hoje). O .db só é reescrito pela pipeline de regeneração.
 *
 * Fallback automático: se node:sqlite indisponível ou .db ausente, o caller
 * (loadCatalogs) cai pro caminho JSON existente.
 *
 * Schema: ver scripts/build_vizer_sqlite.py (schema_version=1).
 */
import path from "node:path";
import fs from "node:fs";

// ---- Detecção de node:sqlite (Node >= 22.5; estável no 24+) ----
let _DatabaseSync: any = null;
let _sqliteOk = false;
try {
  // require() em vez de import para permitir try/catch (esbuild --packages=external
  // mantém este builtin externo; Node 24+ resolve em runtime).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("node:sqlite");
  if (mod && typeof mod.DatabaseSync === "function") {
    _DatabaseSync = mod.DatabaseSync;
    _sqliteOk = true;
  }
} catch {
  /* Node antigo ou node:sqlite desativado */
}

export function isSqliteAvailable(): boolean {
  return _sqliteOk;
}

/** Procura vizer-catalog.db nos mesmos 2 dirs que o caminho JSON usa. */
export function findVizerDb(): string | null {
  const cands = [
    path.join(process.cwd(), "public", "data", "vizer-catalog.db"),
    path.join(process.cwd(), "data", "vizer-catalog.db"),
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
// LRU simples (Map já é insertion-ordered; remoção por evicção FIFO p/ simplicidade)
// ──────────────────────────────────────────────────────────────────────────
const LRU_CAP = 2000;

class LruCache<K, V> {
  private m = new Map<K, V>();
  readonly cap = LRU_CAP;
  has(k: K): boolean { return this.m.has(k); }
  get(k: K): V | undefined { return this.m.get(k); }
  set(k: K, v: V): void {
    if (this.m.size >= this.cap && !this.m.has(k)) {
      // evict oldest (FIFO). Map.keys().next().value é o primeiro inserido.
      const oldest = this.m.keys().next().value as K;
      this.m.delete(oldest);
    }
    this.m.set(k, v);
  }
  delete(k: K): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
  get size(): number { return this.m.size; }
}

// ──────────────────────────────────────────────────────────────────────────
// Índice de FILMES (chave: tmdb_id)
// ──────────────────────────────────────────────────────────────────────────
export class SqliteMovieIndex {
  private db: any;
  private stmtGet: any;
  private stmtHas: any;
  private stmtCount: any;
  private overrides = new Map<number, any>();
  private tombstones = new Set<number>();
  private inBaseCache = new Map<number, boolean>();
  private lru = new LruCache<number, any>();

  constructor(db: any) {
    this.db = db;
    this.stmtGet = db.prepare("SELECT payload FROM movies WHERE tmdb_id = ?");
    this.stmtHas = db.prepare("SELECT 1 AS hit FROM movies WHERE tmdb_id = ? LIMIT 1");
    this.stmtCount = db.prepare("SELECT COUNT(*) AS c FROM movies");
  }

  get(k: number): any | undefined {
    if (this.tombstones.has(k)) return undefined;
    if (this.overrides.has(k)) return this.overrides.get(k);
    if (this.lru.has(k)) return this.lru.get(k);
    const row = this.stmtGet.get(k);
    if (!row) return undefined;
    let obj: any;
    try { obj = JSON.parse(row.payload); } catch { return undefined; }
    this.lru.set(k, obj);
    return obj;
  }

  has(k: number): boolean {
    if (this.tombstones.has(k)) return false;
    if (this.overrides.has(k)) return true;
    if (this.lru.has(k)) return true;
    return this.stmtHas.get(k) !== undefined;
  }

  set(k: number, v: any): this {
    this.tombstones.delete(k);
    this.overrides.set(k, v);
    return this;
  }

  delete(k: number): boolean {
    const had = this.has(k);
    this.overrides.delete(k);
    this.lru.delete(k);
    this.tombstones.add(k);
    return had;
  }

  get size(): number {
    const base: number = this.stmtCount.get().c;
    let adj = 0;
    for (const k of this.overrides.keys()) if (!this._baseHas(k)) adj += 1;
    for (const k of this.tombstones) if (this._baseHas(k)) adj -= 1;
    return base + adj;
  }

  clear(): void {
    this.overrides.clear();
    this.tombstones.clear();
    this.inBaseCache.clear();
    this.lru.clear();
  }

  private _baseHas(k: number): boolean {
    const cached = this.inBaseCache.get(k);
    if (cached !== undefined) return cached;
    const v = this.stmtHas.get(k) !== undefined;
    this.inBaseCache.set(k, v);
    return v;
  }

  /** Itera APENAS entradas da base (sem overrides) que têm mixdrop. Usado por /api/downloads-catalog. */
  forEachBaseWithMixdrop(cb: (m: any) => void): void {
    const stmt = this.db.prepare(
      "SELECT payload FROM movies WHERE mixdrop IS NOT NULL AND mixdrop <> ''",
    );
    for (const row of stmt.iterate()) {
      try { cb(JSON.parse(row.payload)); } catch { /* skip */ }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Índice de EPISÓDIOS (chave: string "tmdbId:season:episode")
// ──────────────────────────────────────────────────────────────────────────
export class SqliteEpisodeIndex {
  private db: any;
  private stmtGet: any;
  private stmtHas: any;
  private stmtCount: any;
  private stmtSeason: any;
  private overrides = new Map<string, any>();
  private tombstones = new Set<string>();
  private inBaseCache = new Map<string, boolean>();
  private lru = new LruCache<string, any>();

  constructor(db: any) {
    this.db = db;
    this.stmtGet = db.prepare(
      "SELECT payload FROM episodes WHERE tmdb_id = ? AND season = ? AND episode = ?",
    );
    this.stmtHas = db.prepare(
      "SELECT 1 AS hit FROM episodes WHERE tmdb_id = ? AND season = ? AND episode = ? LIMIT 1",
    );
    this.stmtCount = db.prepare("SELECT COUNT(*) AS c FROM episodes");
    this.stmtSeason = db.prepare(
      "SELECT episode FROM episodes WHERE tmdb_id = ? AND season = ? ORDER BY episode",
    );
  }

  /** Parse da chave "tmdbId:season:episode". Retorna null se inválida. */
  private _parse(key: string): [number, number, number] | null {
    const parts = String(key).split(":");
    if (parts.length !== 3) return null;
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    const c = Number(parts[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null;
    return [a, b, c];
  }

  get(key: string): any | undefined {
    if (this.tombstones.has(key)) return undefined;
    if (this.overrides.has(key)) return this.overrides.get(key);
    if (this.lru.has(key)) return this.lru.get(key);
    const k = this._parse(key);
    if (!k) return undefined;
    const row = this.stmtGet.get(...k);
    if (!row) return undefined;
    let obj: any;
    try { obj = JSON.parse(row.payload); } catch { return undefined; }
    this.lru.set(key, obj);
    return obj;
  }

  has(key: string): boolean {
    if (this.tombstones.has(key)) return false;
    if (this.overrides.has(key)) return true;
    if (this.lru.has(key)) return true;
    const k = this._parse(key);
    if (!k) return false;
    return this.stmtHas.get(...k) !== undefined;
  }

  set(key: string, v: any): this {
    this.tombstones.delete(key);
    this.overrides.set(key, v);
    return this;
  }

  delete(key: string): boolean {
    const had = this.has(key);
    this.overrides.delete(key);
    this.lru.delete(key);
    this.tombstones.add(key);
    return had;
  }

  get size(): number {
    const base: number = this.stmtCount.get().c;
    let adj = 0;
    for (const k of this.overrides.keys()) if (!this._baseHas(k)) adj += 1;
    for (const k of this.tombstones) if (this._baseHas(k)) adj -= 1;
    return base + adj;
  }

  clear(): void {
    this.overrides.clear();
    this.tombstones.clear();
    this.inBaseCache.clear();
    this.lru.clear();
  }

  private _baseHas(key: string): boolean {
    const cached = this.inBaseCache.get(key);
    if (cached !== undefined) return cached;
    const k = this._parse(key);
    const v = k ? this.stmtHas.get(...k) !== undefined : false;
    this.inBaseCache.set(key, v);
    return v;
  }

  /** Episódios de uma temporada (substitui o scan linear do Map). */
  seasonEpisodes(tmdbId: number, season: number): number[] {
    const out: number[] = [];
    for (const row of this.stmtSeason.iterate(tmdbId, season)) {
      out.push(row.episode);
    }
    // Inclui overrides desta temporada (patches Carrie, etc.)
    const prefix = `${tmdbId}:${season}:`;
    for (const [k, ep] of this.overrides) {
      if (k.startsWith(prefix) && typeof ep?.episode === "number") {
        if (!out.includes(ep.episode)) out.push(ep.episode);
      }
    }
    out.sort((a, b) => a - b);
    return out;
  }

  /** Itera APENAS entradas da base que têm mixdrop. Usado por /api/downloads-catalog. */
  forEachBaseWithMixdrop(cb: (ep: any) => void): void {
    const stmt = this.db.prepare(
      "SELECT payload FROM episodes WHERE mixdrop IS NOT NULL AND mixdrop <> ''",
    );
    for (const row of stmt.iterate()) {
      try { cb(JSON.parse(row.payload)); } catch { /* skip */ }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Índice de TEMPORADAS por série (chave: tmdb_id, valor: number[] ordenado)
// DERIVADO: seasons vem de SELECT DISTINCT season FROM episodes.
// set() (patches/runtime) grava override; get() mescla override + base.
// ──────────────────────────────────────────────────────────────────────────
export class SqliteSeriesSeasonsIndex {
  private db: any;
  private stmtSeasons: any;
  private stmtHas: any;
  private stmtCountDistinct: any;
  private overrides = new Map<number, number[]>();
  private baseCache = new Map<number, number[]>(); // cache da lista derivada

  constructor(db: any) {
    this.db = db;
    this.stmtSeasons = db.prepare(
      "SELECT DISTINCT season FROM episodes WHERE tmdb_id = ? ORDER BY season",
    );
    this.stmtHas = db.prepare(
      "SELECT 1 AS hit FROM episodes WHERE tmdb_id = ? LIMIT 1",
    );
    this.stmtCountDistinct = db.prepare(
      "SELECT COUNT(DISTINCT tmdb_id) AS c FROM episodes",
    );
  }

  get(k: number): number[] | undefined {
    if (this.overrides.has(k)) return this.overrides.get(k);
    if (this.baseCache.has(k)) {
      const v = this.baseCache.get(k)!;
      return v.length ? v : undefined;
    }
    const seasons: number[] = [];
    for (const row of this.stmtSeasons.iterate(k)) seasons.push(row.season);
    this.baseCache.set(k, seasons);
    return seasons.length ? seasons : undefined;
  }

  has(k: number): boolean {
    if (this.overrides.has(k)) return true;
    return this.stmtHas.get(k) !== undefined;
  }

  set(k: number, v: number[]): this {
    this.overrides.set(k, v);
    return this;
  }

  // Métodos usados APENAS em padrões read-modify-write (patch resolve):
  // get-or-default + add + set. Sem delete neste índice hoje (verificado em grep).
  clear(): void {
    this.overrides.clear();
    this.baseCache.clear();
  }

  get size(): number {
    const base: number = this.stmtCountDistinct.get().c;
    let adj = 0;
    for (const k of this.overrides.keys()) {
      // se o tmdb_id não está na base (ex.: Carrie 288673 não tem eps no snapshot),
      // o override adiciona 1 à contagem de séries
      if (this.stmtHas.get(k) === undefined) adj += 1;
    }
    return base + adj;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Loja: abre o DB read-only e instancia os 3 índices. Falha gracefully.
// ──────────────────────────────────────────────────────────────────────────
export interface VizerSqliteStore {
  movieIndex: SqliteMovieIndex;
  episodeIndex: SqliteEpisodeIndex;
  seriesSeasonsIndex: SqliteSeriesSeasonsIndex;
  /** Hidrata _tmdbToSerieIdMap (Map<number, number>) com tmdb→serie_id da base. */
  hydrateSerieIds(target: Map<number, number>): number;
  meta(key: string): string | null;
  close(): void;
}

export function openVizerSqlite(dbPath: string): VizerSqliteStore | null {
  if (!_sqliteOk || !dbPath) return null;
  try {
    const db = new _DatabaseSync(dbPath, { readOnly: true });
    // Sanity: schema check
    const v = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
    if (!v || v.value !== "1") {
      console.warn("[vizer-sqlite] schema_version inesperado:", v?.value, "— voltando pro JSON");
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
    console.warn("[vizer-sqlite] falha ao abrir:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
