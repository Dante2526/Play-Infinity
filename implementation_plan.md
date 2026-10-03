# Plano de Refatoração: server.ts (REVISADO)

**Contexto:** `server.ts` tem **6.689 linhas / 291 KB**. Objetivo: modularizar sem quebrar streaming (VOD/Live), uma fatia por commit.

---

## ⚠️ Correção da premissa do plano anterior

O plano antigo dizia: *"o proxy foi movido para `videoScrapers.ts`, então apague a cópia do `server.ts`"*. **Isso está invertido e quebraria a TV ao vivo.**

Evidência (grep em todo o repo, sem `node_modules`/`dist`):

| Arquivo | Montado no `server.ts`? | Situação real |
|---|---|---|
| `server/routes/videoScrapers.ts` (142 KB) | ❌ Nenhum import | **Código morto** — cópia órfã |
| `server/routes/payments.ts` | ❌ Nenhum import | **Código morto** — rotas vivem no `server.ts` (L626, L828) |
| `server/routes/tmdbProxy.ts` | ❌ Nenhum import | **Código morto** |
| Rotas inline no `server.ts` | ✅ | **Versão que roda em produção** |

Rotas duplicadas entre `server.ts` (viva) e `videoScrapers.ts` (morta): `anime/hls-proxy`, `vixsrc-stream`, `anime-stream`, `watchplayer-stream`, `check-season`, `live-stream-proxy`, `myembed-stream`, `pomfy-stream`, `embedplay-direct`, `byse-stream`.

**Direção correta:** o router é que deve passar a ser a fonte da verdade, mas só depois de um `diff` provar que ele está igual (ou mais novo) que o bloco inline.

---

## Bugs encontrados na revisão (corrigir antes de mover código)

1. **`/api/find-cast-source` é inalcançável em produção** (L6587): está registrada *depois* do `app.get("*")` (L6577), que devolve o `index.html`.
2. **`/api/health` registrado duas vezes** (L79 e L4633). Só o primeiro responde; o segundo é morto.
3. **`import` no meio do arquivo** (L47, L222-230): funcionam por hoisting, mas escondem dependências. Subir para o topo.

---

## Fase 0 — Rede de segurança (pré-requisito)

Não há testes automatizados. Sem isso, "tsc passou" **não** prova que o streaming funciona.

- Criar `scripts/smoke-routes.mjs`: chama ~15 rotas críticas no servidor local e grava **status HTTP + content-type** em `scratch/smoke-baseline.json`.
- Rotas mínimas: `health`, `watchplayer-stream`, `myembed-stream`, `pomfy-stream`, `live-stream-proxy` (URL assinada), `anime/hls-proxy`, `check-season`, `series/available-episodes`, `find-cast-source`, `server-blocks`, `iptv/:id`.
- Após **cada** fase: rodar de novo e comparar com o baseline.

## Fase 1 — Bugs de roteamento + código morto (risco baixo)

- Mover `find-cast-source` para antes do bloco Vite/`dist` (catch-all sempre por último).
- Remover o `/api/health` duplicado (L4633).
- Subir os `import` soltos para o topo.
- **Não apagar ainda** `videoScrapers.ts`/`payments.ts`: só gerar `diff` de cada rota contra o inline e anotar divergências (ex.: HMAC, CORS, timeouts).

## Fase 2 — Trocar inline pelos routers existentes (uma rota por commit)

Ordem do menos para o mais crítico:

| # | Grupo | Destino | Risco |
|---|---|---|---|
| 2.1 | ~~Pagamentos (`create-subscription`, `webhook/asaas`)~~ | `payments.ts` | **FEITO** |
| 2.2 | ~~Stubs da blacklist + `pomfy-stream`~~ | `videoScrapers.ts` | **FEITO** |
| 2.3 | ~~`check-season`, `anime-stream`, `vixsrc-stream`~~ | `videoScrapers.ts` | **FEITO** |
| 2.4 | ~~`watchplayer-stream`, `myembed-stream`~~ | `videoScrapers.ts` | **FEITO** |
| 2.5 | ~~`live-stream-proxy`, `anime/hls-proxy`~~ | `videoScrapers.ts` | **FEITO** |

Em cada item: sincronizar o router com a versão inline (a inline vence em caso de divergência) → montar `app.use(router)` → apagar o bloco inline → `tsc` + smoke test.

> [!NOTE]
> `videoScrapers.ts` já tem 142 KB. Depois da Fase 2, dividir em `streams/watchplayer.ts`, `streams/myembed.ts`, `streams/liveProxy.ts`, `streams/anime.ts`.

## Fase 3 — Rotas que ainda não têm módulo

| Destino novo | Rotas |
|---|---|
| ~~`server/routes/catalog.ts`~~ | ~~`custom-episodes`, `novo-episodio`, `most-watched`, `track-play`, `series/available-episodes`~~ |
| ~~`server/routes/diagnostics.ts`~~ | ~~`player-diagnostics`, `speedtest-down`, `speedtest-up`, `extract-player`~~ |
| ~~`server/routes/mixdrop.ts`~~ | ~~`mixdrop-stream`, `mixdrop-proxy`~~ |
| ~~`server/routes/iptv.ts` (existente)~~ | ~~`parse-m3u-playlist`~~ |
| ~~`server/routes/cast.ts`~~ | ~~`find-cast-source`~~ |

> [!WARNING]
> A Fase 3 do plano antigo ("criar `adminRoutes.ts`") já está feita: `adminOps.ts` existe e cobre `vps-action`, `vps-telemetry`, `github-*`. Removida do plano.

## Fase 4 — Montagem final

`server.ts` alvo: **< 500 linhas** (**FEITO**, atualmente com 379 linhas), só com: dotenv → Helmet/CORS/body parser → rate limiters → `app.use(routers)` → Vite/`dist` + catch-all → `listen`.

Também: decidir se `tmdbProxy.ts` é montado ou apagado (hoje não é usado).

---

## Verificação por fase

1. `npx tsc --noEmit` sem erros.
2. Smoke test igual ao baseline.
3. Teste manual: 1 filme dublado, 1 episódio de série, 1 canal ao vivo (Sport TV).

**Risco geral:** alto nas Fases 2.4/2.5, baixo no resto. Cada item é um commit separado para permitir `git revert` pontual.

---
> Aguardando aprovação para iniciar a **Fase 0 + Fase 1**.
