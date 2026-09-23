#!/usr/bin/env python3
"""Scraper do catálogo Ghosts (5 temporadas) no startflix.biz via painel-aso.sbs."""
import json, re, time, urllib.request
from pathlib import Path

SERIES = [
    {"tmdb_id": 126027, "title": "Ghosts", "audio": "Dublado", "painel_url": "https://www.painel-aso.sbs/embed/126027"},
]
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

def fetch(url, referer=None, extra_headers=None):
    headers = HEADERS.copy()
    if referer: headers['Referer'] = referer
    if extra_headers: headers.update(extra_headers)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.read().decode('utf-8', errors='replace'), r.status
        except: time.sleep(2 * (attempt + 1))
    return None, 0

def get_season_episode_mapping(embed_html):
    header_pattern = re.compile(r'data-season-id="(\d+)"[^>]*data-season-number="(\d+)"', re.DOTALL)
    season_map = {}
    for m in header_pattern.finditer(embed_html):
        season_map[m.group(1)] = int(m.group(2))
    ep_pattern = re.compile(r'data-season-id="(\d+)"\s+data-episode-id="(\d+)"')
    episodes = []
    for m in ep_pattern.finditer(embed_html):
        sid, ep_id = m.group(1), m.group(2)
        snum = season_map.get(sid)
        if snum is not None:
            episodes.append({'season': snum, 'episode': None, 'episode_id': int(ep_id), 'title': ''})
    by_season = {}
    for ep in episodes: by_season.setdefault(ep['season'], []).append(ep)
    final_eps = []
    for season_num, eps_list in by_season.items():
        eps_list.sort(key=lambda x: x['episode_id'])
        for i, ep in enumerate(eps_list, 1):
            ep['episode'] = i
            final_eps.append(ep)
    return final_eps

def get_episode_players(episode_id):
    for attempt in range(4):
        html, _ = fetch(
            f"https://www.painel-aso.sbs/episodio/{episode_id}",
            referer="https://www.painel-aso.sbs/embed/126027",
            extra_headers={'X-Requested-With': 'XMLHttpRequest'}
        )
        if not html: return []
        if 'Just a moment' in html or 'cf-mitigated' in html.lower():
            wait_time = 30 * (attempt + 1)
            print(f"  ⚠️ CF bloqueou {episode_id}, esperando {wait_time}s")
            time.sleep(wait_time); continue
        break
    else: return []
    button_pattern = re.compile(r'<button\b[^>]*\bdata-source="([^"]+)"[^>]*>', re.DOTALL)
    players = []
    for m in button_pattern.finditer(html):
        button_html = m.group(0)
        sub_match = re.search(r'data-subtitles="([^"]*)"', button_html)
        type_match = re.search(r'data-type="([^"]+)"', button_html)
        id_match = re.search(r'data-id="([^"]+)"', button_html)
        players.append({
            'source': m.group(1),
            'subtitles': sub_match.group(1) if sub_match else '',
            'type': type_match.group(1) if type_match else 'iframe',
            'id': id_match.group(1) if id_match else ''
        })
    return players

def pick_best_player(players):
    if not players: return None
    for p in players:
        if 'upns.xyz' in p['source'] or 'embedplayapiupn' in p['source']: return p
    iframe_players = [p for p in players if p['type'] == 'iframe']
    if iframe_players: return iframe_players[0]
    return players[0]

def main():
    catalog = {'metadata': {'scraped_at': time.strftime('%Y-%m-%d %H:%M:%S'), 'source': 'startflix.biz + painel-aso.sbs', 'series_total': 0, 'episodes_total': 0}, 'series': []}
    for series_info in SERIES:
        print(f"\n=== {series_info['title']} (TMDB {series_info['tmdb_id']}) ===")
        embed_html, _ = fetch(series_info['painel_url'])
        all_episodes = get_season_episode_mapping(embed_html)
        by_season = {}
        for ep in all_episodes: by_season.setdefault(ep['season'], []).append(ep)
        seasons_output = []
        for season_num in sorted(by_season.keys()):
            eps = sorted(by_season[season_num], key=lambda x: x['episode'])
            episodes_output = []
            for i, ep in enumerate(eps, 1):
                players = get_episode_players(ep['episode_id'])
                best = pick_best_player(players)
                if not best: continue
                episodes_output.append({'episode': ep['episode'], 'episode_id': ep['episode_id'], 'title': ep.get('title',''), 'embed_url': best['source'], 'player_type': best['type'], 'player_id': best['id']})
                if i % 10 == 0: print(f"  S{season_num}E{ep['episode']} ({i}/{len(eps)})")
                time.sleep(0.3)
            seasons_output.append({'season': season_num, 'episodes': episodes_output})
        series_output = {'tmdb_id': series_info['tmdb_id'], 'title': series_info['title'], 'audio': series_info['audio'], 'seasons': seasons_output}
        catalog['series'].append(series_output)
        catalog['metadata']['series_total'] += 1
        catalog['metadata']['episodes_total'] += sum(len(s['episodes']) for s in seasons_output)
    output_path = Path('public/data/startflix-catalog.json')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    print(f"\n✅ Catálogo: {catalog['metadata']['episodes_total']} episódios")

if __name__ == '__main__': main()
