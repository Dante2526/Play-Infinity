#!/usr/bin/env python3
"""
Gera data/encontrei-catalog.db a partir de data/encontrei-catalog.json.

Schema IDÊNTICO ao vizer-catalog.db (schema_version=1):
  - meta(key, value)
  - movies(tmdb_id PK, payload, mixdrop)
  - episodes(tmdb_id, season, episode, payload, mixdrop; PK composta)
  - serie_ids(tmdb_id PK, serie_id)
  - indexes parciais por mixdrop (WHERE NOT NULL) + index por season

Mesma semântica do loop JSON original (server/routes/encontreiLookup.ts):
  - INSERT OR IGNORE mantém o primeiro duplicado (p/ tmdb_id em movies,
    p/ (tmdb_id, season, episode) em episodes, p/ tmdb_id em serie_ids)
  - serie_ids derivado de episodes (tmdb_id -> serie_id), dedupe por tmdb_id

Uso:
  python3 scripts/build_encontrei_sqlite.py [--in path] [--out path]

Performance: PRAGMA journal_mode=OFF + synchronous=OFF durante bulk insert
(reduzido a 1 transação); reativa vacuum opcional (--vacuum).
"""
import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

DEFAULT_IN = "data/encontrei-catalog.json"
DEFAULT_OUT = "data/encontrei-catalog.db"
SCHEMA_VERSION = "1"


def build(in_path: Path, out_path: Path, do_vacuum: bool = False) -> None:
    if not in_path.exists():
        sys.exit(f"[build_encontrei_sqlite] input não encontrado: {in_path}")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    print(f"[build_encontrei_sqlite] lendo {in_path} ...", flush=True)
    with in_path.open("r", encoding="utf-8") as f:
        catalog = json.load(f)
    t_read = time.time() - t0
    md = catalog.get("metadata", {}) or {}
    movies = catalog.get("movies", []) or []
    episodes = catalog.get("episodes", []) or []
    print(f"[build_encontrei_sqlite] lido em {t_read:.2f}s — "
          f"{len(movies)} filmes, {len(episodes)} episódios (antes da dedupe)", flush=True)

    # Apaga .db anterior (se existir) pra garantir estado limpo
    if out_path.exists():
        out_path.unlink()

    conn = sqlite3.connect(str(out_path))
    try:
        # Performance: desligar journal/sync durante bulk insert
        conn.execute("PRAGMA journal_mode=OFF")
        conn.execute("PRAGMA synchronous=OFF")

        # ---- Schema ----
        conn.executescript(f"""
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS movies (
                tmdb_id INTEGER PRIMARY KEY,
                payload TEXT NOT NULL,
                mixdrop TEXT
            );
            CREATE TABLE IF NOT EXISTS episodes (
                tmdb_id INTEGER NOT NULL,
                season  INTEGER NOT NULL,
                episode INTEGER NOT NULL,
                payload TEXT NOT NULL,
                mixdrop TEXT,
                PRIMARY KEY (tmdb_id, season, episode)
            );
            CREATE TABLE IF NOT EXISTS serie_ids (
                tmdb_id INTEGER PRIMARY KEY,
                serie_id INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_movies_mixdrop
                ON movies(mixdrop) WHERE mixdrop IS NOT NULL AND mixdrop <> '';
            CREATE INDEX IF NOT EXISTS idx_episodes_mixdrop
                ON episodes(mixdrop) WHERE mixdrop IS NOT NULL AND mixdrop <> '';
            CREATE INDEX IF NOT EXISTS idx_episodes_season
                ON episodes(tmdb_id, season);
        """)

        # ---- Bulk insert movies ----
        t1 = time.time()
        # INSERT OR IGNORE: mantém o primeiro tmdb_id (mesma semântica do Map.has() check).
        movie_rows = []
        for m in movies:
            tmdb_id = m.get("tmdb_id")
            if not tmdb_id or not isinstance(tmdb_id, int):
                continue
            mixdrop = (m.get("servers") or {}).get("mixdrop") or ""
            payload = json.dumps(m, ensure_ascii=False, separators=(",", ":"))
            movie_rows.append((tmdb_id, payload, mixdrop or None))
        conn.executemany(
            "INSERT OR IGNORE INTO movies(tmdb_id, payload, mixdrop) VALUES(?, ?, ?)",
            movie_rows,
        )
        movies_db = conn.execute("SELECT COUNT(*) FROM movies").fetchone()[0]
        movies_dupes = len(movie_rows) - movies_db
        t_movies = time.time() - t1
        print(f"[build_encontrei_sqlite] movies: {movies_db} inseridos "
              f"({movies_dupes} dupes descartados) em {t_movies:.2f}s", flush=True)

        # ---- Bulk insert episodes ----
        t2 = time.time()
        ep_rows = []
        serie_id_rows = []  # (tmdb_id, serie_id) — derivado de episodes
        seen_tmdb_for_serie = set()  # dedupe por tmdb_id (mantém o primeiro)
        for ep in episodes:
            tmdb_id = ep.get("tmdb_id")
            season = ep.get("season")
            episode = ep.get("episode")
            if not (tmdb_id and season and episode
                    and isinstance(tmdb_id, int)
                    and isinstance(season, int)
                    and isinstance(episode, int)):
                continue
            mixdrop = (ep.get("servers") or {}).get("mixdrop") or ""
            payload = json.dumps(ep, ensure_ascii=False, separators=(",", ":"))
            ep_rows.append((tmdb_id, season, episode, payload, mixdrop or None))
            # Deriva serie_ids (dedupe por tmdb_id — primeira ocorrência vence)
            serie_id = ep.get("serie_id")
            if serie_id and tmdb_id not in seen_tmdb_for_serie:
                seen_tmdb_for_serie.add(tmdb_id)
                serie_id_rows.append((tmdb_id, int(serie_id)))
        conn.executemany(
            "INSERT OR IGNORE INTO episodes(tmdb_id, season, episode, payload, mixdrop) "
            "VALUES(?, ?, ?, ?, ?)",
            ep_rows,
        )
        eps_db = conn.execute("SELECT COUNT(*) FROM episodes").fetchone()[0]
        eps_dupes = len(ep_rows) - eps_db
        t_eps = time.time() - t2
        print(f"[build_encontrei_sqlite] episodes: {eps_db} inseridos "
              f"({eps_dupes} dupes descartados) em {t_eps:.2f}s", flush=True)

        # ---- Bulk insert serie_ids (derivado) ----
        t3 = time.time()
        conn.executemany(
            "INSERT OR IGNORE INTO serie_ids(tmdb_id, serie_id) VALUES(?, ?)",
            serie_id_rows,
        )
        series_db = conn.execute("SELECT COUNT(*) FROM serie_ids").fetchone()[0]
        t_series = time.time() - t3
        print(f"[build_encontrei_sqlite] serie_ids: {series_db} inseridos "
              f"em {t_series:.2f}s", flush=True)

        # ---- Meta (gravado DEPOIS dos inserts; stats refletem contagem real) ----
        stats_input = md.get("stats", {}) or {}
        meta_rows = [
            ("schema_version", SCHEMA_VERSION),
            ("source", md.get("source", "encontrei.me")),
            ("scraped_at", md.get("scraped_at", "")),
            ("content_version", md.get("scraped_at", "")),  # espelha vizer
            ("stats_movies_input", str(stats_input.get("movies_total", len(movie_rows)))),
            ("stats_episodes_input", str(stats_input.get("episodes_total", len(ep_rows)))),
            ("stats_movies_db", str(movies_db)),
            ("stats_episodes_db", str(eps_db)),
            ("stats_series_db", str(series_db)),
            ("stats_movies_dupes_ignored", str(movies_dupes)),
            ("stats_episodes_dupes_ignored", str(eps_dupes)),
            ("built_at", time.strftime("%Y-%m-%d %H:%M:%S")),
        ]
        conn.executemany(
            "INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)",
            meta_rows,
        )

        # ---- Commit + (opcional) vacuum ----
        conn.commit()
        if do_vacuum:
            t_v = time.time()
            # vacuum precisa de journal_mode default pra funcionar
            conn.execute("PRAGMA journal_mode=DELETE")
            conn.execute("VACUUM")
            print(f"[build_encontrei_sqlite] vacuum em {time.time() - t_v:.2f}s", flush=True)
    finally:
        conn.close()

    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"\n[build_encontrei_sqlite] OK — {out_path} ({size_mb:.2f} MB)", flush=True)
    print(f"  filmes:   {movies_db:>6}  (input: {len(movie_rows)}, dupes: {movies_dupes})", flush=True)
    print(f"  episodes: {eps_db:>6}  (input: {len(ep_rows)}, dupes: {eps_dupes})", flush=True)
    print(f"  series:   {series_db:>6}  (derived from episodes, deduped by tmdb_id)", flush=True)
    print(f"  tempo total: {time.time() - t0:.2f}s", flush=True)


def main() -> None:
    p = argparse.ArgumentParser(description="Gera encontrei-catalog.db (SQLite) a partir do JSON.")
    p.add_argument("--in", dest="in_path", default=DEFAULT_IN,
                   help=f"input JSON path (default: {DEFAULT_IN})")
    p.add_argument("--out", dest="out_path", default=DEFAULT_OUT,
                   help=f"output .db path (default: {DEFAULT_OUT})")
    p.add_argument("--vacuum", action="store_true",
                   help="roda VACUUM no final (mais lento, .db menor)")
    args = p.parse_args()
    build(Path(args.in_path).resolve(), Path(args.out_path).resolve(), args.vacuum)


if __name__ == "__main__":
    main()
