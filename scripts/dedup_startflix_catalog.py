#!/usr/bin/env python3
"""Deduplica o catálogo startflix pra ter o número correto de episódios por temporada.

 Problema: o painel-aso.sbs lista CADA episódio 2x — uma versão com player
 playembedapi.site (não-funcional, X-Frame bloqueia) e outra com player
 embedplayapiupn.upns.xyz (funcional ✅). Isso dobra a contagem.
 
 Solução: pra cada temporada, pegar só a SEGUNDA metade (que tem upns),
 renomear pra E1..N, descartar a primeira metade.
"""
import json
from pathlib import Path
from collections import Counter

CATALOG_PATH = Path('/home/z/my-project/repos/Play-Infinity/public/data/startflix-catalog.json')

# Contagem oficial que o user confirmou
EXPECTED = {
    1: 18,  # S1
    2: 22,  # S2
    3: 10,  # S3 (curta devido à greve)
    4: 22,  # S4
    5: 22,  # S5
}

def pick_better_episode(ep_pair):
    """Entre 2 versões do mesmo episódio (playembedapi + upns), escolhe a melhor."""
    # Prioridade: upns > apiblogger > streamtape > playembedapi
    priority = lambda url: (
        0 if 'upns.xyz' in url else
        1 if 'apiblogger' in url else
        2 if 'streamtape' in url else
        3 if 'playembedapi' in url else
        4
    )
    return min(ep_pair, key=lambda ep: priority(ep['embed_url']))

def main():
    with open(CATALOG_PATH) as f:
        catalog = json.load(f)
    
    print("=" * 60)
    print("DEDUPLICAÇÃO DO CATÁLOGO STARTFLIX")
    print("=" * 60)
    
    for series in catalog['series']:
        print(f"\n━━━ {series['title']} (TMDB {series['tmdb_id']}) ━━━")
        
        for season_data in series['seasons']:
            snum = season_data['season']
            expected = EXPECTED.get(snum)
            if not expected:
                print(f"  S{snum}: sem expectativa definida, mantendo {len(season_data['episodes'])} eps")
                continue
            
            current_eps = season_data['episodes']
            current_count = len(current_eps)
            
            print(f"\n  S{snum}: esperado={expected}, atual={current_count}")
            
            # Conta players atuais
            before_pc = Counter()
            for ep in current_eps:
                url = ep['embed_url']
                if 'upns.xyz' in url: before_pc['✅ upns'] += 1
                elif 'playembedapi' in url: before_pc['❌ playembedapi'] += 1
                elif 'streamtape' in url: before_pc['❌ streamtape'] += 1
                elif 'apiblogger' in url: before_pc['⚠️ apiblogger'] += 1
            print(f"    Antes: {dict(before_pc)}")
            
            if current_count == expected:
                # Já tá certo, talvez precise renumber
                if current_eps:
                    for i, ep in enumerate(current_eps, 1):
                        ep['episode'] = i
                print(f"    ✅ Contagem correta, manteve")
                continue
            
            if current_count > expected:
                # Tem duplicatas — fazer pairing
                # Assumir que a 2a metade (últimos N eps) tem os upns
                # Pegar últimos N eps e renomear pra 1..N
                # MAS também checar se a 1a metade tem algum ep melhor (apiblogger MP4)
                
                # Pair: E1 ↔ E(1+N), E2 ↔ E(2+N), etc.
                first_half = current_eps[:expected]
                second_half = current_eps[expected:2*expected]
                
                # Se first_half + second_half = 2N, tudo certo
                # Se current_count < 2*expected (algum faltou), faz o melhor que dá
                
                new_eps = []
                for i in range(expected):
                    ep1 = first_half[i] if i < len(first_half) else None
                    ep2 = second_half[i] if i < len(second_half) else None
                    
                    if ep1 and ep2:
                        # Tem ambas versões — escolher a melhor
                        chosen = pick_better_episode([ep1, ep2])
                    elif ep2:
                        chosen = ep2
                    elif ep1:
                        chosen = ep1
                    else:
                        continue
                    
                    # Renomear
                    chosen['episode'] = i + 1
                    new_eps.append(chosen)
                
                season_data['episodes'] = new_eps
                print(f"    ✅ Deduplicado: {len(new_eps)} eps")
                
                # Stats depois
                after_pc = Counter()
                for ep in new_eps:
                    url = ep['embed_url']
                    if 'upns.xyz' in url: after_pc['✅ upns'] += 1
                    elif 'playembedapi' in url: after_pc['❌ playembedapi'] += 1
                    elif 'streamtape' in url: after_pc['❌ streamtape'] += 1
                    elif 'apiblogger' in url: after_pc['⚠️ apiblogger'] += 1
                print(f"    Depois: {dict(after_pc)}")
            
            elif current_count < expected:
                # Tem menos que o esperado (CF bloqueou)
                # Manter o que tem, renumber pra 1..N
                # Mas primeiro verificar se tem duplicatas (precisaria de 2x expected)
                # Pra agora, só renumera
                for i, ep in enumerate(current_eps, 1):
                    ep['episode'] = i
                print(f"    ⚠️ Menos que esperado ({current_count}<{expected}), manteve o que tem")
    
    # Atualizar metadados
    total_eps = sum(len(s['episodes']) for series in catalog['series'] for s in series['seasons'])
    catalog['metadata']['episodes_total'] = total_eps
    catalog['metadata']['note'] = "Deduplicado: cada ep tem 1 versão só (preferida: upns > apiblogger > streamtape > playembedapi)"
    
    # Salvar
    with open(CATALOG_PATH, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    
    print()
    print("=" * 60)
    print(f"✅ Catálogo atualizado: {total_eps} episódios total")
    print(f"💾 Salvo em: {CATALOG_PATH}")
    print("=" * 60)
    
    # Resumo final
    print()
    print("RESUMO FINAL:")
    for series in catalog['series']:
        for s in series['seasons']:
            pc = Counter()
            for ep in s['episodes']:
                url = ep['embed_url']
                if 'upns.xyz' in url: pc['✅ upns'] += 1
                elif 'playembedapi' in url: pc['❌ playembedapi'] += 1
                elif 'streamtape' in url: pc['❌ streamtape'] += 1
                elif 'apiblogger' in url: pc['⚠️ apiblogger'] += 1
            functional = pc.get('✅ upns', 0)
            total = len(s['episodes'])
            expected = EXPECTED.get(s['season'], '?')
            print(f"  S{s['season']}: {total}/{expected} eps | {functional} funcionais | {dict(pc)}")

if __name__ == '__main__':
    main()
