#!/usr/bin/env python3
"""
Scraper do catálogo Vizer.beauty — pega TODOS os Mixdrop fileIds via playerData.

Total: 69.363 video IDs (63.850 eps + 5.513 filmes)
Estimativa: ~30-40 min com 10 workers paralelos

Checkpoint: salva progresso a cada 1000 itens, pode retomar.
Output: /tmp/vizer_playerdata.jsonl (JSON lines, um video por linha)
"""
import json
import re
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Config
INPUT_FILE = '/tmp/vizer_episodes.json'  # 63850 eps
MOVIES_FILE = '/tmp/vizer_movies.json'    # 5513 filmes
OUTPUT_FILE = '/home/z/my-project/repos/Play-Infinity/public/data/vizer-raw.jsonl'
CHECKPOINT_FILE = '/tmp/vizer_checkpoint.json'

WORKERS = 10
CHECKPOINT_EVERY = 500
TIMEOUT = 8
RATE_LIMIT_SLEEP = 0.05  # 50ms entre requests (por worker)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*',
    'X-Requested-With': 'XMLHttpRequest',
}

def fetch_player_data(video_id):
    """Pega playerData de um video_id do Vizer."""
    url = f"https://www.vizer.beauty/index.php?app=videobox&module=video&controller=view&do=playerData&id={video_id}"
    req = urllib.request.Request(url, headers={**HEADERS, 'Referer': f'https://www.vizer.beauty/episodios/online/x-{video_id}/'})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = json.loads(r.read().decode('utf-8', errors='replace'))
        # Extrai fileIds
        servers_dub = data.get('servers_dub', '') or ''
        servers_leg = data.get('servers_leg', '') or ''
        servers = servers_dub + '&' + servers_leg
        # Decodifica HTML entities (&amp; → &)
        servers = servers.replace('&amp;', '&')
        # Extrai mixdrop=...
        mixdrop = None
        streamtape = None
        byse = None
        doodstream = None
        for match in re.finditer(r'([a-z]+)=([^&]+)', servers):
            key, val = match.group(1), match.group(2)
            if key == 'mixdrop': mixdrop = val
            elif key == 'streamtape': streamtape = val
            elif key == 'byse': byse = val
            elif key == 'doodstream': doodstream = val
        # Navigation (tem series URL)
        nav = data.get('navigation', {}) or {}
        series_url = nav.get('series', '')
        # Extrai serie_id da series_url
        serie_id_match = re.search(r'-(\d+)/?$', series_url.rstrip('/'))
        serie_id = serie_id_match.group(1) if serie_id_match else None
        
        return {
            'video_id': str(video_id),
            'mixdrop': mixdrop,
            'streamtape': streamtape,
            'byse': byse,
            'doodstream': doodstream,
            'series_url': series_url,
            'serie_id': serie_id,
            'audio': data.get('current_audio', 'Dublado'),
            'is_episode': data.get('is_episode', '0'),
            'status': 'ok',
        }
    except urllib.error.HTTPError as e:
        return {'video_id': str(video_id), 'status': f'http_error_{e.code}'}
    except Exception as e:
        return {'video_id': str(video_id), 'status': f'error: {type(e).__name__}'}

def load_checkpoint():
    """Carrega checkpoint (video_ids já processados)."""
    if not os.path.exists(CHECKPOINT_FILE):
        return set()
    try:
        with open(CHECKPOINT_FILE) as f:
            return set(json.load(f).get('processed', []))
    except:
        return set()

def save_checkpoint(processed_ids, total):
    """Salva checkpoint."""
    try:
        with open(CHECKPOINT_FILE, 'w') as f:
            json.dump({'processed': list(processed_ids), 'total_processed': len(processed_ids), 'total': total, 'ts': time.time()}, f)
    except Exception as e:
        print(f"Erro salvando checkpoint: {e}", file=sys.stderr)

def main():
    # Carrega listas
    with open(INPUT_FILE) as f:
        episodes = json.load(f)
    with open(MOVIES_FILE) as f:
        movies = json.load(f)
    
    # Lista de todos os video_ids para processar
    # Episódios: video_id + info (slug, season, episode, audio)
    # Filmes: video_id + info (slug, audio)
    all_items = []
    for e in episodes:
        all_items.append({
            'video_id': e['video_id'],
            'type': 'episode',
            'slug': e['slug'],
            'season': e['season'],
            'episode': e['episode'],
            'audio': e['audio'],
        })
    for m in movies:
        all_items.append({
            'video_id': m['video_id'],
            'type': 'movie',
            'slug': m['slug'],
            'season': None,
            'episode': None,
            'audio': m['audio'],
        })
    
    print(f"Total itens pra processar: {len(all_items)}")
    
    # Carrega checkpoint
    processed = load_checkpoint()
    print(f"Já processados (checkpoint): {len(processed)}")
    
    # Filtra itens restantes
    remaining = [item for item in all_items if item['video_id'] not in processed]
    print(f"Faltam processar: {len(remaining)}")
    
    if not remaining:
        print("✅ Tudo já processado!")
        return
    
    # Abre arquivo de output (append)
    output_handle = open(OUTPUT_FILE, 'a')
    
    # Processa em paralelo
    success_count = 0
    fail_count = 0
    mixdrop_count = 0
    start_time = time.time()
    last_checkpoint = time.time()
    
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        # Submete em batches pra não estourar memória
        batch_size = 200
        for batch_start in range(0, len(remaining), batch_size):
            batch = remaining[batch_start:batch_start + batch_size]
            futures = {executor.submit(fetch_player_data, item['video_id']): item for item in batch}
            
            for future in as_completed(futures):
                item = futures[future]
                try:
                    result = future.result()
                    # Adiciona info do item original
                    result['type'] = item['type']
                    result['slug'] = item['slug']
                    result['season'] = item['season']
                    result['episode'] = item['episode']
                    result['original_audio'] = item['audio']
                    
                    # Salva no JSONL
                    output_handle.write(json.dumps(result, ensure_ascii=False) + '\n')
                    output_handle.flush()
                    
                    # Atualiza checkpoint
                    processed.add(item['video_id'])
                    
                    if result['status'] == 'ok':
                        success_count += 1
                        if result['mixdrop']:
                            mixdrop_count += 1
                    else:
                        fail_count += 1
                except Exception as e:
                    fail_count += 1
                
                # Progress
                total_done = len(processed)
                elapsed = time.time() - start_time
                rate = (total_done - (len(processed) - 1)) / max(elapsed, 0.1) if elapsed > 0 else 0
                
                if total_done % 100 == 0 or total_done % 1000 == 0:
                    avg_rate = total_done / elapsed if elapsed > 0 else 0
                    remaining_count = len(remaining) - (total_done - (len(processed) - len(remaining)))
                    eta_seconds = (len(remaining) - (success_count + fail_count) - (len(processed) - len(remaining) - (success_count + fail_count))) / avg_rate if avg_rate > 0 else 0
                    print(f"  Progress: {total_done}/{len(all_items)} ({100*total_done/len(all_items):.1f}%) | ok={success_count} mixdrop={mixdrop_count} fail={fail_count} | rate={avg_rate:.1f}/s | ETA={eta_seconds:.0f}s", flush=True)
                
                # Checkpoint a cada 500 ou 30s
                if total_done % CHECKPOINT_EVERY == 0 or (time.time() - last_checkpoint) > 30:
                    save_checkpoint(processed, len(all_items))
                    last_checkpoint = time.time()
    
    # Salva checkpoint final
    save_checkpoint(processed, len(all_items))
    output_handle.close()
    
    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"✅ SCRAPE COMPLETO!")
    print(f"{'='*60}")
    print(f"Total processado: {len(processed)}/{len(all_items)}")
    print(f"  ✅ Success: {success_count}")
    print(f"  ❌ Failed: {fail_count}")
    print(f"  🎬 Com Mixdrop: {mixdrop_count}")
    print(f"Tempo: {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"Rate: {len(processed)/elapsed:.1f}/s")
    print(f"Output: {OUTPUT_FILE}")

if __name__ == '__main__':
    main()
