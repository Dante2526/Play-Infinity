#!/usr/bin/env python3
"""
Build do catálogo vizer-catalog.json a partir do JSONL scrapeado.
Faz match com TMDB IDs usando:
- Episodes: serie_id (vizer) → tmdb_id (do encontrei catalog)
- Movies: video_id (vizer) → video_id (encontrei catalog)

Output: public/data/vizer-catalog.json (formato compatível com encontrei-catalog.json)
"""
import json
import re
from collections import defaultdict
from pathlib import Path

VIZER_RAW = '/home/z/my-project/repos/Play-Infinity/public/data/vizer-raw.jsonl'
ENCONTREI_CATALOG = '/home/z/my-project/repos/Play-Infinity/public/data/encontrei-catalog.json'
SERIE_TO_TMDB_MAP = '/tmp/serie_to_tmdb_encontrei.json'
OUTPUT = '/home/z/my-project/repos/Play-Infinity/public/data/vizer-catalog.json'

def main():
    # 1. Carrega mapping serie_id → tmdb_id (do encontrei)
    with open(SERIE_TO_TMDB_MAP) as f:
        serie_to_tmdb = json.load(f)
    print(f"Series mapeadas (encontrei): {len(serie_to_tmdb)}")
    
    # 2. Carrega mapping movie video_id → tmdb_id (do encontrei)
    with open(ENCONTREI_CATALOG) as f:
        encontrei = json.load(f)
    movie_video_to_tmdb = {}
    for m in encontrei.get('movies', []):
        vid = m.get('video_id')
        if vid:
            movie_video_to_tmdb[str(vid)] = m.get('tmdb_id')
    print(f"Filmes mapeados (encontrei): {len(movie_video_to_tmdb)}")
    
    # 3. Processa JSONL do vizer
    episodes = []
    movies = []
    series_dict = {}  # serie_id → {title, source_url, tmdb_id}
    unmatched_series = set()
    unmatched_movies = 0
    matched_episodes = 0
    unmatched_episodes = 0
    matched_movies = 0
    
    with open(VIZER_RAW) as f:
        for line in f:
            item = json.loads(line)
            
            # Extrai audio (dublado/legendado do slug)
            audio = item.get('audio') or item.get('original_audio') or 'Dublado'
            
            # Players (todos que têm fileId)
            servers = {}
            if item.get('mixdrop'):
                servers['mixdrop'] = item['mixdrop']
            if item.get('streamtape'):
                servers['streamtape'] = item['streamtape']
            if item.get('byse'):
                servers['byse'] = item['byse']
            if item.get('doodstream'):
                servers['doodstream'] = item['doodstream']
            
            # Sem servers, skip
            if not servers:
                continue
            
            if item['type'] == 'episode':
                # Episode
                serie_id = item.get('serie_id')
                if not serie_id:
                    continue
                
                # Match TMDB via encontrei
                tmdb_id = serie_to_tmdb.get(serie_id)
                if tmdb_id:
                    matched_episodes += 1
                else:
                    unmatched_episodes += 1
                    unmatched_series.add(serie_id)
                
                # Adiciona/atualiza series_dict
                if serie_id not in series_dict:
                    series_dict[serie_id] = {
                        'serie_id': int(serie_id) if serie_id.isdigit() else serie_id,
                        'slug': item.get('slug', ''),
                        'source_url': item.get('series_url', ''),
                        'tmdb_id': tmdb_id,
                    }
                elif tmdb_id and not series_dict[serie_id].get('tmdb_id'):
                    series_dict[serie_id]['tmdb_id'] = tmdb_id
                
                episodes.append({
                    'episode_id': int(item['video_id']) if item['video_id'].isdigit() else item['video_id'],
                    'serie_id': int(serie_id) if serie_id.isdigit() else serie_id,
                    'season': item.get('season', 1),
                    'episode': item.get('episode', 1),
                    'tmdb_id': tmdb_id,
                    'audio': audio,
                    'servers': servers,
                    'source_url': f"https://www.vizer.beauty/episodios/online/{item.get('slug', '')}-{item.get('season', 1)}x{item.get('episode', 1)}-{item.get('original_audio', 'dublado')}-{item['video_id']}/",
                })
            
            elif item['type'] == 'movie':
                # Movie — match TMDB via video_id
                video_id = str(item['video_id'])
                tmdb_id = movie_video_to_tmdb.get(video_id)
                if tmdb_id:
                    matched_movies += 1
                else:
                    unmatched_movies += 1
                
                movies.append({
                    'video_id': int(item['video_id']) if item['video_id'].isdigit() else item['video_id'],
                    'tmdb_id': tmdb_id,
                    'audio': audio,
                    'servers': servers,
                    'source_url': f"https://www.vizer.beauty/filmes/online/{item.get('slug', '')}-{item.get('original_audio', 'dublado')}-{item['video_id']}/",
                })
    
    # 4. Lista de series (todas as únicas)
    series = list(series_dict.values())
    
    # 5. Stats
    stats = {
        'movies_total': len(movies),
        'movies_with_tmdb': matched_movies,
        'movies_with_mixdrop': sum(1 for m in movies if m['servers'].get('mixdrop')),
        'episodes_total': len(episodes),
        'episodes_with_tmdb': matched_episodes,
        'episodes_with_mixdrop': sum(1 for e in episodes if e['servers'].get('mixdrop')),
        'series_total': len(series),
        'series_with_tmdb': sum(1 for s in series if s.get('tmdb_id')),
    }
    
    catalog = {
        'metadata': {
            'scraped_at': '2026-09-25',
            'source': 'vizer.beauty',
            'note': 'Catálogo extraído do vizer.beauty via endpoint /playerData. Inclui todos players (mixdrop, streamtape, byse, doodstream).',
            'stats': stats,
        },
        'series': series,
        'movies': movies,
        'episodes': episodes,
    }
    
    # Salva
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=1)
    
    print(f"\n{'='*60}")
    print(f"✅ CATÁLOGO VIZER GERADO!")
    print(f"{'='*60}")
    print(f"📂 Arquivo: {OUTPUT}")
    print(f"💾 Tamanho: {Path(OUTPUT).stat().st_size / 1024 / 1024:.2f} MB")
    print()
    print(f"📊 Stats finais:")
    for k, v in stats.items():
        print(f"  {k}: {v:,}")
    print()
    print(f"🎬 Movies: {len(movies):,} (com TMDB: {matched_movies:,}, sem: {unmatched_movies:,})")
    print(f"📺 Episodes: {len(episodes):,} (com TMDB: {matched_episodes:,}, sem: {unmatched_episodes:,})")
    print(f"📚 Series: {len(series):,} (com TMDB: {stats['series_with_tmdb']:,}, sem: {len(series)-stats['series_with_tmdb']:,})")
    print()
    print(f"📚 Series SEM match TMDB no encontrei: {len(unmatched_series)}")
    print(f"   (vão precisar TMDB search API pra descobrir o ID)")

if __name__ == '__main__':
    main()
