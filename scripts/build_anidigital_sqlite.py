#!/usr/bin/env python3
"""
Gera data/anidigital-catalog.db a partir de data/anidigital-catalog.json.

Schema IDÊNTICO ao vizer-catalog.db / encontrei-catalog.db (schema_version=1):
  - meta(key, value)
  - movies(tmdb_id PK, payload, slug)
  - episodes(tmdb_id, season, episode, payload, slug; PK composta)
  - serie_ids(tmdb_id PK, serie_id)
  - indexes parciais por slug + index por season

Mesma semântica do build_encontrei_sqlite.py: INSERT OR IGNORE mantém o
primeiro duplicado; serie_ids derivado de episodes (dedupe por tmdb_id).

Uso:
  python3 scripts/build_anidigital_sqlite.py [--in path] [--out path] [--vacuum]
"""
import argparse, json, sqlite3, sys, time
from pathlib import Path

DEFAULT_IN = "data/anidigital-catalog.json"
DEFAULT_OUT = "data/anidigital-catalog.db"
SCHEMA_VERSION = "1"

def build(in_path, out_path, do_vacuum=False):
    if not in_path.exists():
        sys.exit(f"[build_anidigital_sqlite] input não encontrado: {in_path}")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    catalog = json.load(in_path.open("r", encoding="utf-8"))
    md = catalog.get("metadata", {}) or {}
    movies = catalog.get("movies", []) or []
    episodes = catalog.get("episodes", []) or []
    print(f"[build_anidigital_sqlite] {len(movies)} filmes, {len(episodes)} episódios (input)", flush=True)
    if out_path.exists(): out_path.unlink()
    conn = sqlite3.connect(str(out_path))
    try:
        conn.execute("PRAGMA journal_mode=OFF")
        conn.execute("PRAGMA synchronous=OFF")
        conn.executescript(f"""
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS movies (tmdb_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, slug TEXT);
            CREATE TABLE IF NOT EXISTS episodes (
                tmdb_id INTEGER NOT NULL, season INTEGER NOT NULL, episode INTEGER NOT NULL,
                payload TEXT NOT NULL, slug TEXT,
                PRIMARY KEY (tmdb_id, season, episode)
            );
            CREATE TABLE IF NOT EXISTS serie_ids (tmdb_id INTEGER PRIMARY KEY, serie_id INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS idx_movies_slug ON movies(slug) WHERE slug IS NOT NULL AND slug <> '';
            CREATE INDEX IF NOT EXISTS idx_episodes_slug ON episodes(slug) WHERE slug IS NOT NULL AND slug <> '';
            CREATE INDEX IF NOT EXISTS idx_episodes_season ON episodes(tmdb_id, season);
        """)
        # movies
        movie_rows = []
        for m in movies:
            tid = m.get("tmdb_id")
            if not tid or not isinstance(tid, int): continue
            slug = m.get("slug") or ""
            payload = json.dumps(m, ensure_ascii=False, separators=(",",":"))
            movie_rows.append((tid, payload, slug or None))
        conn.executemany("INSERT OR IGNORE INTO movies(tmdb_id, payload, slug) VALUES(?,?,?)", movie_rows)
        movies_db = conn.execute("SELECT COUNT(*) FROM movies").fetchone()[0]
        # episodes + serie_ids
        ep_rows = []
        serie_id_rows = []
        seen = set()
        for ep in episodes:
            tid = ep.get("tmdb_id"); season = ep.get("season"); episode = ep.get("episode")
            if not (tid and season and episode and isinstance(tid,int) and isinstance(season,int) and isinstance(episode,int)): continue
            slug = ep.get("slug") or ""
            payload = json.dumps(ep, ensure_ascii=False, separators=(",",":"))
            ep_rows.append((tid, season, episode, payload, slug or None))
            sid = ep.get("serie_id")
            if sid and tid not in seen:
                seen.add(tid); serie_id_rows.append((tid, int(sid)))
        conn.executemany("INSERT OR IGNORE INTO episodes(tmdb_id,season,episode,payload,slug) VALUES(?,?,?,?,?)", ep_rows)
        eps_db = conn.execute("SELECT COUNT(*) FROM episodes").fetchone()[0]
        conn.executemany("INSERT OR IGNORE INTO serie_ids(tmdb_id, serie_id) VALUES(?,?)", serie_id_rows)
        series_db = conn.execute("SELECT COUNT(*) FROM serie_ids").fetchone()[0]
        stats = md.get("stats", {}) or {}
        conn.executemany("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)", [
            ("schema_version", SCHEMA_VERSION),
            ("source", md.get("source", "animesdigital.org")),
            ("scraped_at", md.get("scraped_at", "")),
            ("content_version", md.get("scraped_at", "")),
            ("stats_movies_input", str(stats.get("movies_total", len(movie_rows)))),
            ("stats_episodes_input", str(stats.get("episodes_total", len(ep_rows)))),
            ("stats_movies_db", str(movies_db)),
            ("stats_episodes_db", str(eps_db)),
            ("stats_series_db", str(series_db)),
            ("stats_movies_dupes_ignored", str(len(movie_rows) - movies_db)),
            ("stats_episodes_dupes_ignored", str(len(ep_rows) - eps_db)),
            ("built_at", time.strftime("%Y-%m-%d %H:%M:%S")),
        ])
        conn.commit()
        if do_vacuum:
            conn.execute("PRAGMA journal_mode=DELETE"); conn.execute("VACUUM")
    finally:
        conn.close()
    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"[build_anidigital_sqlite] OK — {out_path} ({size_mb:.2f} MB)", flush=True)
    print(f"  filmes:   {movies_db:>6}  (input: {len(movie_rows)})", flush=True)
    print(f"  episodes: {eps_db:>6}  (input: {len(ep_rows)})", flush=True)
    print(f"  series:   {series_db:>6}  (derived)", flush=True)
    print(f"  tempo: {time.time()-t0:.2f}s", flush=True)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="in_path", default=DEFAULT_IN)
    p.add_argument("--out", dest="out_path", default=DEFAULT_OUT)
    p.add_argument("--vacuum", action="store_true")
    a = p.parse_args()
    build(Path(a.in_path).resolve(), Path(a.out_path).resolve(), a.vacuum)

if __name__ == "__main__":
    main()
