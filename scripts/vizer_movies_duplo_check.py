#!/usr/bin/env python3
"""
Duplo-check TMDB IDs pra filmes do vizer-catalog que não têm TMDB ID.

Método 1 (PRINCIPAL): Scrapear a página do filme no vizer.beauty
  → extrair data-tmdb-id do HTML
  → atualizar o filme com esse TMDB ID

Método 2 (FALLBACK): Se não achar no HTML, faz search TMDB API pelo nome
  → usa o slug como query

Atualiza public/data/vizer-catalog.json in-place.
"""
import json
import re
import sys
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

VIZER_CATALOG = '/home/z/my-project/repos/Play-Infinity/public/data/vizer-catalog.json'
TIMEOUT = 10
WORKERS = 10
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

def fetch_tmdb_id_from_movie_page(video_id, slug, audio):
    """Scrapeia a página do filme no vizer e extrai data-tmdb-id."""
    audio_lower = 'dublado' if 'dub' in audio.lower() else 'legendado' if 'leg' in audio.lower() else audio.lower()
    url = f"https://www.vizer.beauty/filmes/online/{slug}-{audio_lower}-{video_id}/"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            html = r.read().decode('utf-8', errors='replace')
        # Procura data-tmdb-id="XXXX"
        m = re.search(r'data-tmdb-id="(\d+)"', html)
        if m:
            return {
                'video_id': video_id,
                'tmdb_id': int(m.group(1)),
                'method': 'movie_page',
                'source': url,
            }
        # Fallback: procurar em JSON-LD
        m2 = re.search(r'"tmdb_id":\s*(\d+)', html)
        if m2:
            return {
                'video_id': video_id,
                'tmdb_id': int(m2.group(1)),
                'method': 'json_ld',
                'source': url,
            }
        # Fallback 2: procurar meta property="og:image" que tem URL image.tmdb.org
        # e tentar extrair de outro lugar
        # Tentar link canônico pra themoviedb
        m3 = re.search(r'themoviedb\.org/(?:movie|tv)/(\d+)', html)
        if m3:
            return {
                'video_id': video_id,
                'tmdb_id': int(m3.group(1)),
                'method': 'tmdb_link',
                'source': url,
            }
        return {'video_id': video_id, 'tmdb_id': None, 'method': 'not_found', 'source': url}
    except Exception as e:
        return {'video_id': video_id, 'tmdb_id': None, 'method': 'error', 'error': str(e)[:100]}

def slug_to_title(slug):
    """Converte slug (kebab-case) em título limpo."""
    title = slug.replace('-', ' ').title()
    # Casos especiais (números como '1883')
    if re.match(r'^\d', slug) and not re.match(r'^\d+\s', title):
        title = slug  # mantém números juntos
    return title

def search_tmdb_web(slug):
    """Tenta achar TMDB ID via busca web do themoviedb.org (sem key)."""
    title = slug_to_title(slug)
    search_url = f"https://www.themoviedb.org/search/movie?query={urllib.parse.quote(title)}"
    req = urllib.request.Request(search_url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            html = r.read().decode('utf-8', errors='replace')
        # Procura por links como /movie/123456-...
        matches = re.findall(r'/movie/(\d{3,8})(?:-|$)', html)
        if matches:
            return int(matches[0])
    except:
        pass
    return None

def main():
    with open(VIZER_CATALOG) as f:
        catalog = json.load(f)
    
    no_tmdb_movies = [m for m in catalog['movies'] if not m.get('tmdb_id')]
    print(f"📊 Filmes sem TMDB ID no catálogo: {len(no_tmdb_movies)}")
    
    if not no_tmdb_movies:
        print("✅ Todos os filmes têm TMDB ID, nada pra fazer")
        return
    
    # Pra cada filme, montar a task
    tasks = []
    for m in no_tmdb_movies:
        video_id = m['video_id']
        # Slug está na source_url
        source_url = m.get('source_url', '')
        # Extrair slug + audio da source_url: /filmes/online/{slug}-{audio}-{video_id}/
        match = re.search(r'/filmes/online/([a-z0-9-]+?)-(dublado|legendado)-' + re.escape(str(video_id)) + r'/', source_url)
        if match:
            slug = match.group(1)
            audio = match.group(2)
        else:
            slug = ''
            audio = 'dublado'
        tasks.append((video_id, slug, audio))
    
    print(f"🚀 Iniciando scrape de {len(tasks)} páginas de filmes com {WORKERS} workers...")
    
    results = {}
    success = 0
    not_found = 0
    errors = 0
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {executor.submit(fetch_tmdb_id_from_movie_page, *task): task[0] for task in tasks}
        for future in as_completed(futures):
            video_id = futures[future]
            try:
                result = future.result()
                results[video_id] = result
                if result['tmdb_id']:
                    success += 1
                elif result.get('method') == 'not_found':
                    not_found += 1
                else:
                    errors += 1
            except Exception as e:
                errors += 1
            
            done = success + not_found + errors
            if done % 50 == 0:
                print(f"  Progress: {done}/{len(tasks)} | ok={success} not_found={not_found} errors={errors}")
    
    print(f"\n--- Check 1 (scrape movie page): {success}/{len(tasks)} TMDB IDs achados ---")
    
    # Pra filmes que Check 1 falhou, tentar Check 2 (TMDB search web)
    missing_after_check1 = []
    for vid_id, result in results.items():
        if not result['tmdb_id']:
            missing_after_check1.append(vid_id)
    
    check2_results = {}
    check2_success = 0
    if missing_after_check1:
        print(f"\n--- Check 2 (TMDB web search): tentando {len(missing_after_check1)} filmes que Check 1 falhou ---")
        for video_id in missing_after_check1:
            # Achar slug desse filme
            slug = ''
            for m in no_tmdb_movies:
                if m['video_id'] == video_id:
                    source_url = m.get('source_url', '')
                    match = re.search(r'/filmes/online/([a-z0-9-]+?)-(?:dublado|legendado)-', source_url)
                    if match:
                        slug = match.group(1)
                    break
            if not slug:
                continue
            tmdb_id = search_tmdb_web(slug)
            check2_results[video_id] = tmdb_id
            if tmdb_id:
                check2_success += 1
            time.sleep(0.3)
        print(f"  Check 2: {check2_success}/{len(missing_after_check1)} TMDB IDs via TMDB search")
    
    # Build mapping video_id → tmdb_id
    final_mapping = {}
    for vid_id, result in results.items():
        if result.get('tmdb_id'):
            final_mapping[vid_id] = {
                'tmdb_id': result['tmdb_id'],
                'method': result.get('method'),
            }
    if missing_after_check1:
        for vid_id, tmdb_id in check2_results.items():
            if tmdb_id and vid_id not in final_mapping:
                final_mapping[vid_id] = {
                    'tmdb_id': tmdb_id,
                    'method': 'tmdb_search',
                }
    
    print(f"\n--- Atualizando catálogo ---")
    print(f"  Total filmes com TMDB ID agora: {len(final_mapping)}")
    
    updated_movies = 0
    for m in catalog['movies']:
        if not m.get('tmdb_id') and m['video_id'] in final_mapping:
            m['tmdb_id'] = final_mapping[m['video_id']]['tmdb_id']
            updated_movies += 1
    
    # Atualizar stats
    stats = catalog['metadata']['stats']
    stats['movies_with_tmdb'] = sum(1 for m in catalog['movies'] if m.get('tmdb_id'))
    stats['movies_tmdb_method_movie_page'] = sum(1 for r in results.values() if r.get('method') == 'movie_page')
    stats['movies_tmdb_method_tmdb_search'] = sum(1 for r in final_mapping.values() if r.get('method') == 'tmdb_search')
    stats['movies_tmdb_not_found'] = sum(1 for m in catalog['movies'] if not m.get('tmdb_id'))
    
    # Salvar
    with open(VIZER_CATALOG, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=1)
    
    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"✅ DUPLO CHECK DE FILMES COMPLETO!")
    print(f"{'='*60}")
    print(f"⏱️  Tempo: {elapsed:.1f}s")
    print(f"\n📊 Resultados:")
    print(f"  Check 1 (scrape filme page): {success}/{len(tasks)}")
    print(f"  Check 2 (TMDB search):       {check2_success}/{len(missing_after_check1)}")
    print(f"\n📈 Catálogo atualizado:")
    print(f"  Movies com TMDB ID agora: {stats['movies_with_tmdb']:,}")
    print(f"  Movies atualizados: {updated_movies}")
    print(f"  Movies ainda SEM TMDB: {stats['movies_tmdb_not_found']}")

if __name__ == '__main__':
    main()
