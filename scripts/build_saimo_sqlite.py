#!/usr/bin/env python3
"""
Gera data/saimo-catalog.db a partir dos endpoints do Saimo TV (https://filmes-saimo.pages.dev/).

Mapeia:
  1. fichas.txt: mapa de correspondência de (tipo, título) -> TMDB ID oficial.
  2. indice.txt: bases de servidores CDN e partições por letra.
  3. filmes-*.txt: streams de filmes (dub/leg) -> tabela movies (tmdb_id PK).
  4. series-*-*.txt: temporadas, episódios e streams -> tabela episodes (tmdb_id, season, episode PK).
  5. serie_ids: tmdb_id -> total de temporadas / identificador.

Schema 100% compatível com SqliteMovieIndex, SqliteEpisodeIndex e SqliteSeriesSeasonsIndex.
"""
import argparse
import json
import re
import sqlite3
import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen

BASE_URL = "https://filmes-saimo.pages.dev"
DEFAULT_OUT = "data/saimo-catalog.db"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def fetch_text(url: str, timeout: int = 15) -> str:
    req = Request(url, headers=HEADERS)
    try:
        with urlopen(req, timeout=timeout) as res:
            return res.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"[WARN] Falha ao baixar {url}: {e}", file=sys.stderr)
        return ""


def normalize_title(s: str) -> str:
    s = s.strip().lower()
    # Remove acentos
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    # Remove anos no final ex: (2023)
    s = re.sub(r"\s*\(\d{4}\)\s*$", "", s)
    # Remove caracteres especiais
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def resolve_stream_url(raw: str, bases: list) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    if ":" in raw:
        parts = raw.split(":", 1)
        if parts[0].isdigit():
            base_idx = int(parts[0])
            if base_idx < len(bases) and bases[base_idx]:
                path = parts[1]
                base = bases[base_idx]
                if "." in path:
                    return f"{base}{path}"
                else:
                    return f"{base}{path}.mp4"
    return ""


def build(out_path: Path, max_letters: int = 0) -> None:
    t0 = time.time()
    print("=== Iniciando Ingestão do Catálogo Saimo TV VOD ===", flush=True)

    # 1. Baixar indice.txt
    print("[1/5] Baixando indice.txt ...", flush=True)
    indice_text = fetch_text(f"{BASE_URL}/indice.txt")
    if not indice_text:
        sys.exit("[ERRO] Não foi possível baixar indice.txt")

    bases = []
    letters_info = []
    for line in indice_text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("base:"):
            parts = line[5:].strip().split()
            if len(parts) >= 2 and parts[0].isdigit():
                idx = int(parts[0])
                while len(bases) <= idx:
                    bases.append("")
                bases[idx] = parts[1]
        elif "\t" in line:
            cols = line.split("\t")
            if len(cols) >= 3:
                letters_info.append({
                    "letra": cols[0],
                    "filmes": int(cols[1]) if cols[1].isdigit() else 0,
                    "series": int(cols[2]) if cols[2].isdigit() else 0,
                })

    print(f"  -> {len(bases)} bases de CDN identificadas.", flush=True)
    print(f"  -> {len(letters_info)} grupos alfabéticos encontrados.", flush=True)

    # 2. Baixar fichas.txt (Mapa TMDB)
    print("[2/5] Baixando fichas.txt (Mapeamento de TMDB IDs) ...", flush=True)
    fichas_text = fetch_text(f"{BASE_URL}/fichas.txt")
    
    # movie_fichas: key = normalized_title -> tmdb_id
    movie_fichas = {}
    series_fichas = {}
    
    for line in fichas_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("capa:"):
            continue
        cols = line.split("\t")
        if len(cols) >= 3:
            tipo = cols[0].strip()
            titulo = cols[1].strip()
            tmdb_id_str = cols[2].strip()
            if tmdb_id_str.isdigit():
                tmdb_id = int(tmdb_id_str)
                norm = normalize_title(titulo)
                if tipo == "f":
                    movie_fichas[norm] = tmdb_id
                    movie_fichas[titulo] = tmdb_id
                elif tipo == "s":
                    series_fichas[norm] = tmdb_id
                    series_fichas[titulo] = tmdb_id

    print(f"  -> {len(movie_fichas)} filmes e {len(series_fichas)} séries mapeados em fichas.txt.", flush=True)

    letters = [item["letra"] for item in letters_info]
    if max_letters > 0:
        letters = letters[:max_letters]

    # 3. Baixar e processar filmes
    print(f"[3/5] Baixando catálogo de Filmes ({len(letters)} letras) ...", flush=True)
    movies_dict = {}  # tmdb_id -> movie_obj

    def fetch_movie_letter(letra: str) -> list:
        encoded_letra = "%23" if letra == "#" else letra
        url = f"{BASE_URL}/filmes-{encoded_letra}.txt"
        txt = fetch_text(url)
        results = []
        for line in txt.splitlines():
            line = line.strip()
            if not line or "\t" not in line:
                continue
            cols = line.split("\t")
            titulo = cols[0].strip()
            dub_urls = []
            leg_urls = []
            extracted_tmdb_id = None

            for part in cols[1:]:
                if part.startswith("dub="):
                    for u in part[4:].split(","):
                        resolved = resolve_stream_url(u, bases)
                        if resolved:
                            dub_urls.append(resolved)
                        m_id = re.search(r"id=(\d+)", u)
                        if m_id and not extracted_tmdb_id:
                            extracted_tmdb_id = int(m_id.group(1))
                elif part.startswith("leg="):
                    for u in part[4:].split(","):
                        resolved = resolve_stream_url(u, bases)
                        if resolved:
                            leg_urls.append(resolved)
                        m_id = re.search(r"id=(\d+)", u)
                        if m_id and not extracted_tmdb_id:
                            extracted_tmdb_id = int(m_id.group(1))

            if not dub_urls and not leg_urls:
                continue

            # Identificar TMDB ID
            tmdb_id = extracted_tmdb_id
            if not tmdb_id:
                norm = normalize_title(titulo)
                tmdb_id = movie_fichas.get(norm) or movie_fichas.get(titulo)

            if not tmdb_id:
                continue

            # Extrai ano se presente no título
            ano_match = re.search(r"\((\d{4})\)", titulo)
            ano = ano_match.group(1) if ano_match else ""

            results.append({
                "tmdb_id": tmdb_id,
                "title": titulo,
                "year": ano,
                "dub": dub_urls,
                "leg": leg_urls,
            })
        return results

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(fetch_movie_letter, l): l for l in letters}
        for f in as_completed(futures):
            res = f.result()
            for m in res:
                tid = m["tmdb_id"]
                if tid not in movies_dict:
                    movies_dict[tid] = m
                else:
                    # Merge streams se já existir
                    existing = movies_dict[tid]
                    for u in m["dub"]:
                        if u not in existing["dub"]:
                            existing["dub"].append(u)
                    for u in m["leg"]:
                        if u not in existing["leg"]:
                            existing["leg"].append(u)

    print(f"  -> Total de {len(movies_dict)} filmes válidos com TMDB ID e streams.", flush=True)

    # 4. Baixar e processar séries
    print(f"[4/5] Baixando catálogo de Séries ({len(letters)} letras) ...", flush=True)
    episodes_dict = {}  # (tmdb_id, season, episode) -> ep_obj
    series_meta = {}    # tmdb_id -> { title, year, seasons: set() }

    def fetch_series_letter(letra: str) -> list:
        encoded_letra = "%23" if letra == "#" else letra
        url = f"{BASE_URL}/series-{encoded_letra}.txt"
        txt = fetch_text(url)
        pieces = []
        for line in txt.splitlines():
            line = line.strip()
            if not line or "\t" not in line:
                continue
            cols = line.split("\t")
            if len(cols) >= 3 and cols[2].isdigit():
                pieces.append(int(cols[2]))

        unique_pieces = sorted(list(set(pieces)))
        episodes_res = []

        for p in unique_pieces:
            p_url = f"{BASE_URL}/series-{encoded_letra}-{p}.txt"
            p_txt = fetch_text(p_url)
            current_title = ""
            current_year = ""
            current_tmdb_id = None

            for line in p_txt.splitlines():
                line = line.strip()
                if not line:
                    continue
                if line.startswith("@"):
                    cols = line[1:].split("\t")
                    current_title = cols[0].strip()
                    current_year = cols[1].strip() if len(cols) > 1 else ""
                    current_tmdb_id = None
                    norm = normalize_title(current_title)
                    current_tmdb_id = series_fichas.get(norm) or series_fichas.get(current_title)
                    continue

                if "\t" in line:
                    cols = line.split("\t")
                    if len(cols) >= 4 and cols[0].isdigit() and cols[1].isdigit():
                        s = int(cols[0])
                        e = int(cols[1])
                        versao = cols[2].strip().lower()
                        raw_urls = cols[3].split(",")
                        resolved_urls = []
                        for u in raw_urls:
                            res = resolve_stream_url(u, bases)
                            if res:
                                resolved_urls.append(res)
                            m_id = re.search(r"id=(\d+)", u)
                            if m_id and not current_tmdb_id:
                                current_tmdb_id = int(m_id.group(1))

                        if not current_tmdb_id:
                            continue

                        if resolved_urls:
                            episodes_res.append({
                                "tmdb_id": current_tmdb_id,
                                "series_title": current_title,
                                "series_year": current_year,
                                "season": s,
                                "episode": e,
                                "versao": versao,
                                "urls": resolved_urls,
                            })
        return episodes_res

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(fetch_series_letter, l): l for l in letters}
        for f in as_completed(futures):
            res = f.result()
            for ep in res:
                key = (ep["tmdb_id"], ep["season"], ep["episode"])
                tid = ep["tmdb_id"]
                s = ep["season"]
                if tid not in series_meta:
                    series_meta[tid] = {
                        "title": ep["series_title"],
                        "year": ep["series_year"],
                        "seasons": set(),
                    }
                series_meta[tid]["seasons"].add(s)

                if key not in episodes_dict:
                    episodes_dict[key] = {
                        "tmdb_id": tid,
                        "season": s,
                        "episode": ep["episode"],
                        "title": f"Episódio {ep['episode']}",
                        "dub": [] if ep["versao"] != "dub" else list(ep["urls"]),
                        "leg": [] if ep["versao"] != "leg" else list(ep["urls"]),
                    }
                else:
                    target = episodes_dict[key]["dub"] if ep["versao"] == "dub" else episodes_dict[key]["leg"]
                    for u in ep["urls"]:
                        if u not in target:
                            target.append(u)

    print(f"  -> Total de {len(episodes_dict)} episódios em {len(series_meta)} séries.", flush=True)

    # 5. Criar e Gravar Banco SQLite
    print(f"[5/5] Gravando banco SQLite em {out_path} ...", flush=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        out_path.unlink()

    conn = sqlite3.connect(str(out_path))
    try:
        conn.execute("PRAGMA journal_mode=OFF")
        conn.execute("PRAGMA synchronous=OFF")

        conn.executescript("""
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS movies (
                tmdb_id INTEGER PRIMARY KEY,
                title TEXT,
                year TEXT,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS episodes (
                tmdb_id INTEGER NOT NULL,
                season INTEGER NOT NULL,
                episode INTEGER NOT NULL,
                title TEXT,
                payload TEXT NOT NULL,
                PRIMARY KEY (tmdb_id, season, episode)
            );
            CREATE TABLE IF NOT EXISTS serie_ids (
                tmdb_id INTEGER PRIMARY KEY,
                serie_id INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_episodes_season
                ON episodes(tmdb_id, season);
        """)

        # Insert meta
        conn.execute("INSERT INTO meta(key, value) VALUES(?, ?)", ("schema_version", "1"))
        conn.execute("INSERT INTO meta(key, value) VALUES(?, ?)", ("created_at", str(int(time.time()))))
        conn.execute("INSERT INTO meta(key, value) VALUES(?, ?)", ("source", "saimo-vod"))

        # Insert movies
        movie_rows = []
        for tid, m in movies_dict.items():
            payload = json.dumps({
                "id": tid,
                "title": m["title"],
                "year": m["year"],
                "servers": {
                    "saimo_dub": m["dub"],
                    "saimo_leg": m["leg"],
                }
            }, ensure_ascii=False, separators=(",", ":"))
            movie_rows.append((tid, m["title"], m["year"], payload))

        conn.executemany("INSERT OR IGNORE INTO movies(tmdb_id, title, year, payload) VALUES(?, ?, ?, ?)", movie_rows)

        # Insert episodes
        ep_rows = []
        for (tid, s, e), ep in episodes_dict.items():
            payload = json.dumps({
                "tmdb_id": tid,
                "season": s,
                "episode": e,
                "title": ep["title"],
                "servers": {
                    "saimo_dub": ep["dub"],
                    "saimo_leg": ep["leg"],
                }
            }, ensure_ascii=False, separators=(",", ":"))
            ep_rows.append((tid, s, e, ep["title"], payload))

        conn.executemany("INSERT OR IGNORE INTO episodes(tmdb_id, season, episode, title, payload) VALUES(?, ?, ?, ?, ?)", ep_rows)

        # Insert serie_ids
        serie_rows = [(tid, tid) for tid in series_meta.keys()]
        conn.executemany("INSERT OR IGNORE INTO serie_ids(tmdb_id, serie_id) VALUES(?, ?)", serie_rows)

        conn.commit()
    finally:
        conn.close()

    elapsed = time.time() - t0
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"\n[OK] Banco SQLite Saimo gerado com sucesso em {elapsed:.1f}s!")
    print(f"   Arquivo: {out_path} ({size_mb:.2f} MB)")
    print(f"   Filmes: {len(movie_rows)} | Episódios: {len(ep_rows)} | Séries: {len(serie_rows)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Gera saimo-catalog.db a partir do Saimo TV VOD")
    parser.add_argument("--out", default=DEFAULT_OUT, help="Caminho de saída do .db")
    parser.add_argument("--max-letters", type=int, default=0, help="Limita letras para teste rápido")
    args = parser.parse_args()
    build(Path(args.out), args.max_letters)
