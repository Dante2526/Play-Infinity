# Startflix Integration — Ghosts (e futuras séries)

Implementação completa do player Startflix no app, no estilo Mixdrop.

## O que foi feito

### 1. Catálogo (1 série, 87 episódios, 44 funcionais)
**Arquivo**: `public/data/startflix-catalog.json`

```
Ghosts (TMDB 126027)
├─ S1: 4 eps  (0 funcionais — streamtape links mortos)
├─ S2: 0 eps  (CF bloqueou o scrape; rodar de novo depois)
├─ S3: 17 eps (0 funcionais — só playembedapi)
├─ S4: 44 eps (22 funcionais — E23-E44 com player UPNS ✅)
└─ S5: 22 eps (22 funcionais — todos com UPNS ✅)
```

### 2. Backend (1 arquivo novo + 1 patch)
**Novo**: `server/routes/startflixLookup.ts`
- `GET /api/startflix-lookup?tmdb_id=126027&season=4&episode=23`
- Retorna: `{ embed_url, player_type, player_id, audio, functional, ... }`
- `GET /api/startflix-catalog` — lista séries + seasons (pra admin/debug)

**Patch**: `server.ts` (2 linhas adicionadas)
```ts
import startflixLookupRouter from "./server/routes/startflixLookup";
app.use(startflixLookupRouter);
```

### 3. Frontend service (1 arquivo novo)
**Novo**: `src/services/startflixCatalog.ts`
- `findStartflixEpisode(tmdbId, season, episode)` → retorna `{ embed_url, functional, ... }`
- `isStartflixAvailable(tmdbId)` → check rápido se a série tá no catálogo
- `getStartflixSeasonInfo(tmdbId, season)` → infos da temporada

### 4. VideoPlayerModal (patches)
**Patch**: `src/components/VideoPlayerModal.tsx`
- Import de `findStartflixEpisode` + `isStartflixAvailable`
- Novo state: `startflixEmbedUrl` + `startflixAvailable`
- Novo useEffect: resolve embed_url async (igual mixdropFileId)
- Novo servidor `srv_startflix` adicionado dinamicamente na lista (só se disponível)
- `upns.xyz` adicionado na lista de "integrated players" (não dispara external fallback)

## Como funciona (arquitetura)

```
User clica "Ghosts S4E23" no app
    ↓
VideoPlayerModal useEffect dispara:
    ↓
1. isStartflixAvailable(126027) → true
    ↓
2. findStartflixEpisode(126027, 4, 23) → /api/startflix-lookup
    ↓
3. Backend lê startflix-catalog.json → retorna embed_url
    ↓
4. Frontend adiciona "Startflix HD (Dublado)" na lista de servers
    ↓
5. User clica nesse server → iframe carrega embed_url (UPNS player)
    ↓
6. UPNS player carrega (SPA), executa JS, busca stream via API interna,
   decodifica HLS encrypted e toca. Sem anúncios (gleam.config.ad_enabled = false).
```

**Sem Cloudflare Worker necessário** — diferente do bolodechocolate e do vizer, o `painel-aso.sbs` NÃO tem Cloudflare anti-bot pra scraping (só cache). Já confirmado com testes.

## Pra atualizar o catálogo (rodar de novo)

Quando a Cloudflare liberar meu IP de novo (depois de ~24h) ou quando quiser adicionar mais séries:

```bash
# 1. Re-scrapear Ghosts (atualiza eps que faltam: S1E5+, S2 toda, S3E1-E3)
python3 scripts/scan_startflix_ghosts.py

# 2. Pra adicionar outra série, edite SERIES no script:
SERIES = [
    {"tmdb_id": 126027, "title": "Ghosts", "audio": "Dublado", "painel_url": "..."},
    {"tmdb_id": 1399, "title": "Breaking Bad", "audio": "Dublado", "painel_url": "https://www.painel-aso.sbs/embed/1399"},
]
```

## Limitações atuais

1. ** Só Ghosts está no catálogo** — pra adicionar mais séries, precisa descobrir o `tmdb_id` e o `painel_url` (URL no startflix.biz da série).
2. **S1-S3 parcialmente indisponíveis** — episódios marcados como `playembedapi.site` têm X-Frame-Options SAMEORIGIN, não embedam. Re-scrape pode resolver se a CF liberar.
3. **Skin Netflix**: o iframe mostra os controles do UPNS player (não dá pra controlar cross-origin). O chrome do modal (header, footer, bordas) usa a skin Netflix. Pra ter controles 100% Netflix, precisaria reimplementar o decoder do UPNS (complexo, envolve AES decrypt).
4. **Sem anúncios**: UPNS tem `ad_enabled: false` no gleam.config por padrão. Se mudar, precisa ajustar.

## Pra o agente adicionar

Tudo já está commitado em `b00b26d` + novos arquivos:
- `public/data/startflix-catalog.json` (catálogo)
- `server/routes/startflixLookup.ts` (backend)
- `src/services/startflixCatalog.ts` (frontend service)
- `server.ts` (patch: import + app.use)
- `src/components/VideoPlayerModal.tsx` (patch: state + useEffect + srv_startflix)

Basta fazer `git push origin main` e redeploy no Render.

## Testar depois do deploy

```bash
# 1. Verificar se o endpoint tá no ar
curl https://play-infinity-app.onrender.com/api/startflix-lookup?tmdb_id=126027&season=4&episode=23
# Deve retornar: { embed_url: "https://embedplayapiupn.upns.xyz/#pu53wv", functional: true, ... }

# 2. Ver catálogo completo
curl https://play-infinity-app.onrender.com/api/startflix-catalog

# 3. No app: abrir DetailsPage de "Ghosts" (TMDB 126027) → selecionar S4E23 → deve aparecer "Startflix HD (Dublado)" como servidor
```
