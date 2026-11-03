#!/usr/bin/env python3
"""
Scrape do catálogo AnimesDigital via WordPress REST API + match TMDB.

Gera data/anidigital-catalog.json pronto para scripts/build_anidigital_sqlite.py.

Pipeline (cada fase cacheia em /tmp/anidigital_*.json para ser resumível):
  FASE A — paginar /chave/wp/v2/posts (per_page=100, ~687 págs, 68k posts)
           → parse título: (series_title, audio, ep_num, is_movie)
           → agrupa por (series_key, audio)
  FASE B — 1 fetch por série (episódio de menor número) → extrai m3u8 do
           iframe videohls.php?d=<url> → deriva cdn + series_slug + letra
  FASE C — match TMDB (search/tv p/ série, search/movie p/ filme) → tmdb_id
  FASE D — emite catalog JSON: {metadata, movies[], episodes[]}
           episodes: {tmdb_id, season:1, episode:abs_ep, payload:{slug,audio,streamUrl,title}}
           movies:   {tmdb_id, payload:{slug,audio,streamUrl,title}}

Uso:
  python3 scripts/scrape_anidigital_catalog.py --sample          # 3 págs WP + pipeline completo (validação)
  python3 scripts/scrape_anidigital_catalog.py --full            # catálogo completo
  python3 scripts/scrape_anidigital_catalog.py --resume          # retoma de /tmp/anidigital_*.json

Requer rede + TMDB_API_KEY no ambiente. Rode na VPS Oracle (IP passa no WAF).
"""
import argparse, json, os, re, sys, time, urllib.parse, urllib.request

BASE = "https://animesdigital.org"
WP = f"{BASE}/chave/wp/v2/posts"
TMDB = "https://api.themoviedb.org/3"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
CACHE = "/tmp"  # na VPS, /tmp persistente o suficiente durante o build

# ---- HTTP helpers ----
def http_get(url, timeout=20, headers=None):
    h = {"User-Agent": UA, "Accept": "*/*"}
    if headers: h.update(headers)
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            # headers lowercase p/ lookup case-insensitive (x-wp-totalpages etc.)
            hdrs = {k.lower(): v for k, v in r.headers.items()}
            return r.status, r.read().decode("utf-8", "replace"), hdrs
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8","replace")[:500], {}
    except Exception as e:
        return 0, str(e), {}

# ---- FASE A: WP REST pagination + title parsing ----
EP_RE = re.compile(r"epis[oó]dio\s*(\d+)", re.I)
DUB_RE = re.compile(r"\bdublado\b", re.I)
LEG_RE = re.compile(r"\blegendado\b", re.I)

def parse_title(raw):
    """'Assistir Kaguya-sama: Love is War Dublado Episódio 12 Online em HD'
    → ('Kaguya-sama: Love is War', 'dub', 12, False)
    Filme (sem 'Episódio') → (title, audio, None, True)."""
    t = raw.replace("Assistir ", "").replace(" Online em HD", "").replace(" Online HD", "").strip()
    audio = "dub" if DUB_RE.search(t) else ("leg" if LEG_RE.search(t) else "leg")
    t = DUB_RE.sub("", t); t = LEG_RE.sub("", t)
    m = EP_RE.search(t)
    if m:
        ep = int(m.group(1))
        series = EP_RE.sub("", t).replace("Episódio", "").strip(" -:")
        series = re.sub(r"\s+", " ", series).strip(" -:")
        return series, audio, ep, False
    return t.strip(" -:"), audio, None, True

def series_key(title, audio):
    s = title.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return f"{s}|{audio}"

def fetch_wp_page(page):
    url = f"{WP}?per_page=100&page={page}&_fields=id,slug,title,link"
    code, body, headers = http_get(url, timeout=30)
    if code != 200:
        return None, int(headers.get("x-wp-totalpages", "0") or 0)
    posts = json.loads(body)
    total_pages = int(headers.get("x-wp-totalpages", "0") or 0)
    return posts, total_pages

def phase_a(max_pages=None):
    cache = f"{CACHE}/anidigital_posts.jsonl"
    # descobre total de paginas COM per_page=100 (o mesmo usado na paginação)
    _, _, h = http_get(f"{WP}?per_page=100&page=1", timeout=20)
    total_pages = int(h.get("x-wp-totalpages", "0") or 0)
    if not total_pages:
        sys.exit("[A] não consegui ler X-WP-TotalPages")
    if max_pages: total_pages = min(total_pages, max_pages)
    print(f"[A] {total_pages} páginas WP (per_page=100)", flush=True)
    # resumível: conta linhas já no cache
    done = 0
    if os.path.exists(cache):
        with open(cache) as f:
            done = sum(1 for _ in f)
    print(f"[A] retomando de página {done+1}" if done else "[A] começando do zero", flush=True)
    with open(cache, "a") as f:
        for p in range(done+1, total_pages+1):
            posts, _ = fetch_wp_page(p)
            if posts is None:
                print(f"[A] pág {p} falhou, retry em 2s", flush=True); time.sleep(2)
                posts, _ = fetch_wp_page(p)
            if posts is None:
                print(f"[A] pág {p} falhou de novo, pulando", flush=True); continue
            for post in posts:
                f.write(json.dumps(post, ensure_ascii=False) + "\n")
            if p % 10 == 0 or p == total_pages:
                print(f"[A] pág {p}/{total_pages} ({p*100//total_pages}%)", flush=True)
            time.sleep(0.2)  # gentil com o servidor
    # carrega tudo em memória e agrupa
    series = {}  # key -> {title, audio, eps:{ep:post_id}, movies:[post_id]}
    movies = []
    n_posts = 0
    with open(cache) as f:
        for line in f:
            post = json.loads(line); n_posts += 1
            title = (post.get("title") or {}).get("rendered","").strip()
            if not title: continue
            st, audio, ep, is_movie = parse_title(title)
            if not st: continue
            if is_movie:
                movies.append({"id": post["id"], "slug": post.get("slug",""), "title": st, "audio": audio})
            else:
                k = series_key(st, audio)
                s = series.get(k)
                if not s:
                    s = {"title": st, "audio": audio, "eps": {}}
                    series[k] = s
                if ep: s["eps"][ep] = post["id"]
    print(f"[A] {n_posts} posts → {len(series)} séries (leg+dub) + {len(movies)} filmes", flush=True)
    json.dump({"series": series, "movies": movies}, open(f"{CACHE}/anidigital_phaseA.json","w"), ensure_ascii=False)
    return series, movies

# ---- FASE B: 1 fetch/série → m3u8 → slug + stream template ----
M3U8_RE = re.compile(r"videohls\.php\?d=([^&\"\\]+)")
# Padrões do m3u8 na CDN animesdigital. Dois formatos coexistem:
#   (1) cdn-sXX.mywallpaper-4k-image.net/stream/sv/<letra>/<slug>/<ep>.mp4/index.m3u8  (antigo)
#   (2) cdn-s[XX|vXX].(mywallpaper-4k-image.net|maximaimg.online)/stream/<letra>/<slug>[-N]/<ep>.mp4/index.m3u8  (novo, sem sv)
# O slug pode ter sufixo -N (indicador de temporada, ex: clevatess-2, honzuki-no-gekokujou-4).
# O grupo `sv/` é opcional; a letra é 1 char; o slug inclui o sufixo de temporada quando houver.
STREAM_RE = re.compile(
    r"https?://(cdn-[a-z0-9-]+\.(?:mywallpaper-4k-image\.net|maximaimg\.online))"
    r"/stream/(?:sv/)?([a-z0-9])/([a-z0-9-]+)/(?:\d+\.mp4)/index\.m3u8",
    re.I,
)

def extract_m3u8(episode_id):
    url = f"{BASE}/video/a/{episode_id}/"
    code, body, _ = http_get(url, timeout=15)
    if code != 200 or not body: return None
    m = M3U8_RE.search(body)
    if not m: return None
    raw = m.group(1)
    try: raw = urllib.parse.unquote(raw)
    except: pass
    raw = raw.replace("&amp;", "&").strip()
    if not raw.startswith("http"): return None
    return raw

def phase_b(series, movies):
    cache = f"{CACHE}/anidigital_phaseB.json"
    done = {}
    if os.path.exists(cache):
        try: done = json.load(open(cache))
        except: done = {}
    # ---- séries ----
    keys = list(series.keys())
    todo = [k for k in keys if k not in done]
    print(f"[B] {len(todo)} séries pra sondar (já {len(done)} no cache)", flush=True)
    for i, k in enumerate(todo, 1):
        s = series[k]
        eps = s["eps"]
        if not eps: done[k] = {"skip": "no-eps"}; continue
        ep_num = min(eps); pid = eps[ep_num]
        m3u8 = extract_m3u8(pid)
        if not m3u8:
            done[k] = {"skip": "no-m3u8", "pid": pid}
        else:
            sm = STREAM_RE.search(m3u8)
            if sm:
                cdn, letra, slug = sm.groups()
                # base = m3u8 sem o <ep>.mp4/index.m3u8 final → constrói outros eps
                base = re.sub(r"/\d+\.mp4/index\.m3u8$", "", m3u8)
                done[k] = {"cdn": cdn, "letra": letra, "slug": slug, "base": base,
                          "ep_sample": ep_num, "m3u8_sample": m3u8}
            else:
                done[k] = {"skip": "stream-pattern-miss", "m3u8": m3u8}
        if i % 25 == 0 or i == len(todo):
            print(f"[B] {i}/{len(todo)} ({i*100//len(todo)}%) — {len([1 for v in done.values() if 'base' in v])} ok", flush=True)
            json.dump(done, open(cache,"w"), ensure_ascii=False)
        time.sleep(0.15)
    # ---- filmes: SKIP no v1 ----
    # A fase A classifica como "filme" todo post sem "Episódio N" no título,
    # mas a maioria é lixo (news, páginas, conteúdo não-anime) — sondar 11k+
    # páginas seria ~30min e poluiria o catálogo. Filmes de anime de verdade
    # têm padrão de título incerto; ficar pra v2 com filtro melhor.
    # (series_b não terá entradas movie:* → phase D pula filmes automaticamente.)
    print(f"[B] {len(movies)} 'filmes' SKIPPADOS no v1 (catálogo focado em séries/episódios)", flush=True)
    json.dump(done, open(cache,"w"), ensure_ascii=False)
    ok = sum(1 for v in done.values() if "base" in v)
    print(f"[B] {ok}/{len(done)} entradas com base extraída", flush=True)
    return done

# ---- FASE C: TMDB match ----
def tmdb_search(title, kind):
    """kind='tv' ou 'movie'. Retorna (tmdb_id, name, year) ou None."""
    key = os.environ.get("TMDB_API_KEY") or os.environ.get("VITE_TMDB_API_KEY")
    if not key: return None
    q = urllib.parse.urlencode({"api_key": key, "query": title, "language": "pt-BR", "page": "1"})
    url = f"{TMDB}/search/{kind}?{q}"
    code, body, _ = http_get(url, timeout=15)
    if code != 200: return None
    try: data = json.loads(body)
    except: return None
    results = data.get("results", [])
    if not results: return None
    # pega o de maior popularidade (TMDB ordena por relevância)
    r = results[0]
    tid = r.get("id")
    name = r.get("name") or r.get("title") or ""
    date = r.get("first_air_date") or r.get("release_date") or ""
    year = date[:4] if date else ""
    return tid, name, year

def phase_c(series, movies, series_b):
    cache = f"{CACHE}/anidigital_phaseC.json"
    done = {}
    if os.path.exists(cache):
        try: done = json.load(open(cache))
        except: done = {}
    # série: chave series_key -> tmdb
    todo = [k for k in series.keys() if k not in done and "slug" in series_b.get(k,{})]
    print(f"[C] {len(todo)} séries pra match TMDB", flush=True)
    for i, k in enumerate(todo, 1):
        s = series[k]
        res = tmdb_search(s["title"], "tv")
        if res:
            done[k] = {"tmdb_id": res[0], "name": res[1], "year": res[2], "title": s["title"], "audio": s["audio"]}
        else:
            done[k] = {"tmdb_id": None, "title": s["title"], "audio": s["audio"]}
        if i % 25 == 0 or i == len(todo):
            matched = sum(1 for v in done.values() if v.get("tmdb_id"))
            print(f"[C] {i}/{len(todo)} — {matched} matched", flush=True)
            json.dump(done, open(cache,"w"), ensure_ascii=False)
        time.sleep(0.05)  # TMDB aguenta ~40/s, gentil
    # filmes
    # Filmes: SKIP no match TMDB (v1) — filmes não foram sondados na fase B
    # (sem base), então seriam pulados na fase D independente do match.
    # Evita ~60min de TMDB calls à toa. Filmes ficam pra v2 com filtro melhor.
    print(f"[C] {len(movies)} 'filmes' SKIPPADOS no match TMDB (v1)", flush=True)
    json.dump(done, open(cache,"w"), ensure_ascii=False)
    matched = sum(1 for v in done.values() if v.get("tmdb_id"))
    print(f"[C] {matched}/{len(done)} matched no TMDB", flush=True)
    return done

# ---- FASE D: emite catalog JSON (merge leg+dub por tmdb_id+ep) ----
def phase_d(series, movies, series_b, tmdb_map, out_path):
    # Agrupa episódios por (tmdb_id, ep_num) fundindo leg+dub num único payload.
    # PK do DB é (tmdb_id, season, episode) — não cabe leg E dub em rows separadas,
    # então o payload carrega ambos: {title, leg?:{slug,streamUrl}, dub?:{slug,streamUrl}}.
    ep_merge = {}  # (tmdb_id, ep) -> {title, leg?, dub?}
    for k, s in series.items():
        b = series_b.get(k, {})
        if "base" not in b: continue
        t = tmdb_map.get(k, {})
        tmdb_id = t.get("tmdb_id")
        if not tmdb_id: continue
        base, slug = b["base"], b["slug"]
        audio = s["audio"]  # "leg" ou "dub"
        for ep_num in s["eps"]:
            stream_url = f"{base}/{ep_num}.mp4/index.m3u8"
            mkey = (int(tmdb_id), ep_num)
            row = ep_merge.get(mkey)
            if not row:
                row = {"tmdb_id": int(tmdb_id), "season": 1, "episode": ep_num,
                       "serie_id": int(tmdb_id), "title": s["title"], "slug": slug}
                ep_merge[mkey] = row
            row[audio] = {"slug": slug, "streamUrl": stream_url}
    episodes = list(ep_merge.values())
    # Movies: mesma ideia (merge leg+dub por tmdb_id)
    mv_merge = {}
    for idx, m in enumerate(movies):
        b = series_b.get(f"movie:{idx}", {})
        if "base" not in b: continue
        t = tmdb_map.get(f"movie:{idx}", {})
        tmdb_id = t.get("tmdb_id")
        if not tmdb_id: continue
        base, slug = b["base"], b["slug"]
        stream_url = f"{base}/01.mp4/index.m3u8"
        audio = m["audio"]
        row = mv_merge.get(int(tmdb_id))
        if not row:
            row = {"tmdb_id": int(tmdb_id), "title": m["title"], "slug": slug}
            mv_merge[int(tmdb_id)] = row
        row[audio] = {"slug": slug, "streamUrl": stream_url}
    movies_out = list(mv_merge.values())
    catalog = {
        "metadata": {
            "source": "animesdigital.org",
            "scraped_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "stats": {"episodes_total": len(episodes), "movies_total": len(movies_out),
                      "series_total": len({e["tmdb_id"] for e in episodes})},
        },
        "episodes": episodes,
        "movies": movies_out,
    }
    json.dump(catalog, open(out_path, "w"), ensure_ascii=False, separators=(",",":"))
    print(f"[D] {out_path}: {len(episodes)} eps, {len(movies_out)} filmes, "
          f"{len({e['tmdb_id'] for e in episodes})} séries", flush=True)

def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--sample", action="store_true", help="3 págs WP + pipeline completo")
    g.add_argument("--full", action="store_true", help="catálogo completo (687 págs)")
    g.add_argument("--resume", action="store_true", help="retoma fases cacheadas")
    ap.add_argument("--out", default="data/anidigital-catalog.json")
    args = ap.parse_args()
    if not (args.sample or args.full or args.resume):
        ap.error("use --sample, --full ou --resume")
    max_pages = 3 if args.sample else None
    series, movies = phase_a(max_pages)
    series_b = phase_b(series, movies)
    tmdb_map = phase_c(series, movies, series_b)
    phase_d(series, movies, series_b, tmdb_map, args.out)

if __name__ == "__main__":
    main()
