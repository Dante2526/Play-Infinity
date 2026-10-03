# Plano de Migração do Catálogo para SQLite (REVISADO)

> **Status:** ⏸️ **ADIADO.** Não executar agora.
> **Gatilho para executar:** RAM da VPS Oracle acima de ~80% de forma recorrente no painel Admin.
> (Hoje está em ~63%, sem risco imediato.)

**Contexto:** O backend carrega os catálogos JSON inteiros na RAM:
- `encontrei-catalog.json` (~14 MB em disco, ~80 MB na V8)
- `vizer-catalog.json` (PRIMÁRIO, ~65 mil eps + ~5,6 mil filmes, **também em RAM**)

Objetivo: ler de um **SQLite local** e reduzir a RAM do Node, sem serviço externo.

> [!IMPORTANT]
> A economia real pode ser **maior que 80 MB**, porque são **dois** catálogos.
> Medir a RAM antes e depois (Fase 0), sem confiar na estimativa de ~54-55%.

---

## Mapa de consumidores (o que precisa mudar)

| Arquivo | Uso atual | Ação |
|---|---|---|
| `server/routes/encontreiLookup.ts` | `tryLoadCatalog` carrega vizer + encontrei em 3 índices cada: filmes, episódios, temporadas | Trocar por queries SQLite |
| `server/routes/videoScrapers.ts` (~L2485) | Rota de check-season faz `JSON.parse` do encontrei **a cada request** (14 MB) e itera todos os episódios | Trocar por 1 query indexada. **É o ganho mais barato e pode ser feito antes do resto.** |
| `_tmdbToSerieIdMap` (global em `encontreiLookup.ts`) | Mapa `tmdb_id → serie_id` populado durante o load | Virar query na tabela `episodes` ou tabela `series` |
| `_verifiedSeasonsCache` | Invalidado quando o catálogo recarrega | Manter a invalidação, disparada pela mudança de mtime do `.sqlite` |

---

## Fase 0 — Baseline e Mapeamento (obrigatória antes de tocar em código)

1. **Medir RAM atual** do processo `video-proxy` (PM2) e do `server.ts`. Anotar o valor.
2. **Mapear TODOS os campos usados** pelos consumidores acima. Listar os acessos a `movie.*` e `ep.*` com `grep_search`. O esquema da Fase 2 só vale depois disso, sem "etc.".
3. **Checar a arquitetura da VPS** (`uname -m`). Se for ARM (Oracle Ampere), confirmar que existe prebuild do `better-sqlite3` ou que o build nativo funciona (`build-essential`, `python3`).
4. **Descobrir quem escreve os JSONs** em tempo de execução (scrapers, scripts de atualização). O `.sqlite` precisa ser regenerado sempre que eles mudarem.

## Fase 1 — Dependências

1. `npm install better-sqlite3` e `npm install -D @types/better-sqlite3`.
2. Testar `npm ci` em uma pasta limpa na VPS para confirmar que o módulo nativo compila ou baixa o prebuild.
3. Confirmar que o `Dockerfile` ou os scripts de deploy não usam `--ignore-scripts`, que quebraria o binário nativo.

## Fase 2 — Script de Conversão (JSON → SQLite)

1. Criar `scripts/convertCatalogToSqlite.ts` com script npm `build:catalog`.
2. **Um único arquivo `data/catalog.sqlite`**, com a coluna `source` (`'vizer'` ou `'encontrei'`) para preservar a prioridade vizer → encontrei:
   - `movies` (`source`, `tmdb_id`, + campos mapeados na Fase 0)
   - `episodes` (`source`, `tmdb_id`, `serie_id`, `season`, `episode`, + campos mapeados na Fase 0)
   - `meta` (`source`, `mtime`, `built_at`), usada para detectar mudança de catálogo.
3. **Índices:**
   - `movies(tmdb_id, source)`
   - `episodes(tmdb_id, season, episode, source)`: lookup principal
   - `episodes(tmdb_id)`: lista de temporadas, `_tmdbToSerieIdMap`
4. **Regra de duplicados:** manter o **primeiro** registro por chave, igual ao comportamento atual (`if (!has) set`). Usar `INSERT OR IGNORE` com `UNIQUE`.
5. **Geração atômica:** escrever em `catalog.sqlite.tmp` e fazer `rename` ao final. Isso evita o leitor pegar um arquivo pela metade.
6. Usar uma única `transaction` para a ingestão em massa.
7. Adicionar `data/catalog.sqlite*` ao `.gitignore` e ao `server.watch.ignored` do Vite (regra 2 do `AGENTS.md`).

## Fase 3 — Geração no Deploy (antes não definida)

O `.sqlite` não vai para o Git, então **precisa existir na VPS**. Sem ele, o catálogo "some" (o fallback retorna `null`).

1. **Deploy:** adicionar `npm run build:catalog` ao fluxo de deploy da VPS, antes do `pm2 restart video-proxy`.
2. **Atualizações em runtime:** se algum scraper ou script reescrever os JSONs, ele deve rodar `build:catalog` no fim.
3. **Rede de segurança:** se o `.sqlite` não existir na inicialização, **cair no loader JSON antigo** e logar um aviso. Não retornar `null` silenciosamente.
4. Manter o loader JSON no código até a migração ser validada em produção.

## Fase 4 — Refatoração do Backend

1. **Conexão única e preguiçosa**, com `readonly: true`, reaberta se o `mtime` do `.sqlite` mudar. Isso substitui o hot-reload por mtime que existe hoje.
2. **Prepared statements** criados uma vez e reutilizados, não `db.prepare()` a cada request.
3. **Substituir em `encontreiLookup.ts`:**
   - `movieIndexRef.get(id)` → `SELECT * FROM movies WHERE tmdb_id=? ORDER BY CASE source WHEN 'vizer' THEN 0 ELSE 1 END LIMIT 1`
   - `episodeIndexRef.get(key)` → query em `episodes (tmdb_id, season, episode)`, com a mesma prioridade
   - `seasonsIndexRef.get(id)` → `SELECT DISTINCT season ... ORDER BY season`
   - `_tmdbToSerieIdMap` → query, com cache LRU pequeno se necessário
4. **Substituir em `videoScrapers.ts`:** `SELECT episode FROM episodes WHERE tmdb_id=? AND season=? AND source='encontrei'`.
5. Preservar `_verifiedSeasonsCache.clear()` quando o catálogo for reaberto.
6. Preservar o comportamento de prioridade **vizer primeiro, encontrei como fallback**.

## Fase 5 — Validação

1. `npx tsc --noEmit`.
2. **Teste de equivalência:** script que compara, para uma amostra grande de `tmdb_id` e `season/episode`, a resposta do loader JSON antigo com a do SQLite. Os resultados devem ser **idênticos**. Cobrir também um filme que só existe no encontrei e um episódio que só existe no vizer.
3. Teste local (`npm run dev`) de filmes e séries, e da rota `check-season`.
4. **Medir RAM de novo** e comparar com o baseline da Fase 0. Registrar o ganho real no `walkthrough.md`.
5. **Deploy:** pedir autorização explícita antes do push para `main` (regra 7 do `AGENTS.md`). Acompanhar a RAM no painel Admin.
6. **Rollback:** se algo falhar, reverter o commit. O loader JSON continua disponível (Fase 3, item 4).

---

> **Instrução para Agentes:** este plano está **ADIADO**. Só implemente se o usuário pedir explicitamente. Ao implementar, comece pela **Fase 0** e siga em ordem estrita. Antes de qualquer coisa, consulte o `walkthrough.md` (regra 8 do `AGENTS.md`).
>
> **Atalho de baixo risco:** corrigir só o item da `videoScrapers.ts` (L2485), que faz `JSON.parse` de 14 MB a cada request, já dá ganho sem migrar tudo. Pode ser feito separadamente, por exemplo reaproveitando o índice de memória do `encontreiLookup.ts`.
