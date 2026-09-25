#!/usr/bin/env python3
"""
Duplo-check TMDB IDs pra séries do vizer-catalog que não têm TMDB ID.

Método 1 (PRINCIPAL): Scrapear 1 episódio da série no vizer.beauty
  → extrair data-tmdb-id do HTML
  → atualizar todos os episódios da série com esse TMDB ID

Método 2 (FALLBACK): Se não achar no HTML, faz search TMDB API pelo nome
  → usa o slug como query (ex: '100-coisas-para-fazer-antes-de-virar-zumbi' → '100 coisas para fazer antes de virar zumbi')

Atualiza public/data/vizer-catalog.json in-place.
"""
import json
import re
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

VIZER_CATALOG = '/home/z/my-project/repos/Play-Infinity/public/data/vizer-catalog.json'
TIMEOUT = 10
WORKERS = 10
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

def fetch_tmdb_id_from_episode_page(serie_id, episode_id, slug, season, episode, audio):
    """Scrapeia 1 episódio do vizer e extrai data-tmdb-id."""
    url = f"https://www.vizer.beauty/episodios/online/{slug}-{season}x{episode}-{audio}-{episode_id}/"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            html = r.read().decode('utf-8', errors='replace')
        # Procura data-tmdb-id="XXXX"
        m = re.search(r'data-tmdb-id="(\d+)"', html)
        if m:
            tmdb_id = int(m.group(1))
            return {
                'serie_id': serie_id,
                'tmdb_id': tmdb_id,
                'method': 'episode_page',
                'source': url,
            }
        # Fallback: procurar no meta ou JSON-LD
        m2 = re.search(r'"tmdb_id":\s*(\d+)', html)
        if m2:
            return {
                'serie_id': serie_id,
                'tmdb_id': int(m2.group(1)),
                'method': 'json_ld',
                'source': url,
            }
        # Sem TMDB ID na página
        return {'serie_id': serie_id, 'tmdb_id': None, 'method': 'not_found', 'source': url}
    except Exception as e:
        return {'serie_id': serie_id, 'tmdb_id': None, 'method': 'error', 'error': str(e)[:100]}

def slug_to_title(slug):
    """Converte slug (kebab-case) em título limpo."""
    # Substitui hifens por espaços, capitaliza primeira letra de cada palavra
    title = slug.replace('-', ' ').title()
    # Casos especiais (números como '1883', '9-1-1', '1923')
    if re.match(r'^\d', title):
        title = title.replace(' ', '-')  # junta números (1883, 1923, 9-1-1)
    return title

def search_tmdb_by_slug(slug):
    """Tenta achar TMDB ID via API de search pública do themoviedb.org (sem key, busca web)."""
    title = slug_to_title(slug)
    # Constrói URL da busca do TMDB
    search_url = f"https://www.themoviedb.org/search/tv?query={urllib.request.quote(title)}"
    req = urllib.request.Request(search_url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            html = r.read().decode('utf-8', errors='replace')
        # Procura por links como /tv/123456-...
        matches = re.findall(r'/tv/(\d{3,8})(?:-|$)', html)
        if matches:
            # Pega o primeiro (mais relevante)
            return int(matches[0])
    except:
        pass
    return None

def main():
    # Carrega catálogo vizer
    with open(VIZER_CATALOG) as f:
        catalog = json.load(f)
    
    # Achar séries sem TMDB ID
    no_tmdb_series = [s for s in catalog['series'] if not s.get('tmdb_id')]
    print(f"📊 Séries sem TMDB ID no catálogo: {len(no_tmdb_series)}")
    
    if not no_tmdb_series:
        print("✅ Tudo tem TMDB ID, nada pra fazer")
        return
    
    # Pra cada série sem TMDB, achar 1 sample episode (depreferência S1E1)
    serie_to_sample_ep = {}
    for s in no_tmdb_series:
        serie_id = s['serie_id']
        slug = s['slug']
        # Achar S1E1 primeiro, senão qualquer um
        sample = None
        for e in catalog['episodes']:
            if e['serie_id'] == serie_id:
                if e.get('season') == 1 and e.get('episode') == 1:
                    sample = e
                    break
                if not sample:
                    sample = e
        if sample:
            # Determinar audio
            audio = sample.get('audio', 'dublado').lower()
            serie_to_sample_ep[serie_id] = {
                'episode_id': sample['episode_id'],
                'slug': slug,
                'season': sample.get('season', 1),
                'episode': sample.get('episode', 1),
                'audio': 'dublado' if 'dub' in audio else 'legendado' if 'leg' in audio else audio,
            }
    
    print(f"📈 Sample episodes encontrados: {len(serie_to_sample_ep)}/{len(no_tmdb_series)}")
    
    # Lista de tasks
    tasks = []
    for s in no_tmdb_series:
        serie_id = s['serie_id']
        if serie_id in serie_to_sample_ep:
            sample = serie_to_sample_ep[serie_id]
            tasks.append((
                serie_id,
                sample['episode_id'],
                sample['slug'],
                sample['season'],
                sample['episode'],
                sample['audio'],
            ))
    
    print(f"🚀 Iniciando scrape de {len(tasks)} episódios com {WORKERS} workers...")
    
    # Resultados
    results = {}
    success = 0
    fallback_search = 0
    not_found = 0
    errors = 0
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {executor.submit(fetch_tmdb_id_from_episode_page, *task): task[0] for task in tasks}
        for future in as_completed(futures):
            serie_id = futures[future]
            try:
                result = future.result()
                results[serie_id] = result
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
    
    print(f"\n--- Check 1 (scrape episódio): {success}/{len(tasks)} TMDB IDs achados ---")
    
    # Pra séries que Check 1 falhou, tentar Check 2 (TMDB search web)
    missing_after_check1 = []
    for serie_id, result in results.items():
        if not result['tmdb_id']:
            missing_after_check1.append(serie_id)
    
    if missing_after_check1:
        print(f"\n--- Check 2 (TMDB web search): tentando {len(missing_after_check1)} séries que Check 1 falhou ---")
        check2_results = {}
        check2_success = 0
        for serie_id in missing_after_check1:
            # Achar slug dessa serie
            slug = None
            for s in no_tmdb_series:
                if s['serie_id'] == serie_id:
                    slug = s['slug']
                    break
            if not slug:
                continue
            tmdb_id = search_tmdb_by_slug(slug)
            check2_results[serie_id] = tmdb_id
            if tmdb_id:
                check2_success += 1
            time.sleep(0.3)
        print(f"  Check 2: {check2_success}/{len(missing_after_check1)} TMDB IDs via TMDB search")
    
    # Agora ATUALIZAR o catálogo com os TMDB IDs encontrados
    print(f"\n--- Atualizando catálogo ---")
    
    # Build mapping serie_id → tmdb_id (de Check 1 primeiro, depois Check 2)
    final_mapping = {}
    for serie_id, result in results.items():
        if result.get('tmdb_id'):
            final_mapping[serie_id] = {
                'tmdb_id': result['tmdb_id'],
                'method': result.get('method'),
            }
    if missing_after_check1:
        for serie_id, tmdb_id in check2_results.items():
            if tmdb_id and serie_id not in final_mapping:
                final_mapping[serie_id] = {
                    'tmdb_id': tmdb_id,
                    'method': 'tmdb_search',
                }
    
    print(f"  Total séries com TMDB ID agora: {len(final_mapping)}")
    
    # Atualizar series
    updated_series = 0
    for s in catalog['series']:
        if not s.get('tmdb_id') and s['serie_id'] in final_mapping:
            s['tmdb_id'] = final_mapping[s['serie_id']]['tmdb_id']
            updated_series += 1
    
    # Atualizar TODOS os episódios dessas séries
    updated_episodes = 0
    for e in catalog['episodes']:
        if not e.get('tmdb_id') and e['serie_id'] in final_mapping:
            e['tmdb_id'] = final_mapping[e['serie_id']]['tmdb_id']
            updated_episodes += 1
    
    # Atualizar stats
    stats = catalog['metadata']['stats']
    stats['episodes_with_tmdb'] = sum(1 for e in catalog['episodes'] if e.get('tmdb_id'))
    stats['series_with_tmdb'] = sum(1 for s in catalog['series'] if s.get('tmdb_id'))
    stats['series_tmdb_method_episode_page'] = sum(1 for r in results.values() if r.get('method') == 'episode_page')
    stats['series_tmdb_method_tmdb_search'] = sum(1 for r in final_mapping.values() if r.get('method') == 'tmdb_search')
    stats['series_tmdb_not_found'] = sum(1 for r in results.values() if not r.get('tmdb_id')) - sum(1 for r in final_mapping.values() if r.get('method') == 'tmdb_search')
    
    # Salvar catálogo atualizado
    with open(VIZER_CATALOG, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=1)
    
    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"✅ DUPLO CHECK COMPLETO!")
    print(f"{'='*60}")
    print(f"⏱️  Tempo: {elapsed:.1f}s")
    print(f"\n📊 Resultados:")
    print(f"  Check 1 (scrape episódio): {success}/{len(tasks)}")
    print(f"  Check 2 (TMDB search):     {check2_success if missing_after_check1 else 0}/{len(missing_after_check1) if missing_after_check1 else 0}")
    print(f"\n📈 Catálogo atualizado:")
    print(f"  Series com TMDB ID agora: {stats['series_with_tmdb']:,}")
    print(f"  Episodes com TMDB ID agora: {stats['episodes_with_tmdb']:,}")
    print(f"  Series atualizadas: {updated_series}")
    print(f"  Episodes atualizados: {updated_episodes:,}")
    print(f"  Series ainda SEM TMDB: {stats['series_tmdb_not_found']}")
    
    # Lista de series que ainda ficaram sem TMDB ID
    still_missing = [s for s in catalog['series'] if not s.get('tmdb_id')]
    if still_missing:
        print(f"\n❌ {len(still_missing)} series ainda SEM TMDB ID (provavelmente animes/cat peculiares):")
        for s in still_missing[:10]:
            print(f"  serie_id={s['serie_id']} | slug={s['slug']}")

if __name__ == '__main__':
    main()
