# ADR-0003: Smoke tests de produção para integrações de streaming

**Status:** Accepted
**Data:** 2026-11-02
**Ferramenta:** `scripts/saimo-smoke-prod.cjs`

## Contexto

O bug do embedplay (ADR-0002) ficou **latente 7 dias**: entrou com a
integração Saimo em 26/10 e só explodiu em 02/11 quando o HLS-first
(ADR-0001) tentou usar as fontes HLS pela primeira vez. Antes disso, "todo o
HLS morto" era indistinguível de "upstream instável".

Causa-raiz: os testes da suíte validam **unidade/integração em sandbox**,
nunca a cadeia real (catálogo → candidatos → fetch upstream → proxy →
bytes). Nada dava sinal de "a taxa de streams reproduzíveis em produção caiu
para X%".

## Decisão

1. **Smoke test de produção** para o Saimo VOD: `node scripts/saimo-smoke-prod.cjs`
   - Amostra N TMDB IDs do catálogo (ordem: `--ids` > `data/saimo-catalog.db`
     local > `fichas.txt` upstream > fallback embutido).
   - Para cada ID: `GET /api/saimo-stream?prefer=<hls|mp4>`, lê **um único
     chunk** do body (não baixa GBs) e classifica:
     - 200 + video/mpegurl → OK HLS
     - 200 + video/* → OK MP4
     - 404 → fora do catálogo (excluído do denominador)
     - 502/5xx/timeout → FALHA (a assinatura exata do incidente: "catálogo
       tem o título, todas as fontes morreram")
   - Exit code 1 se taxa de sucesso < `--min-rate` (default 0.5) — pronto
     para cron/CI.
2. **Baseline registrado na primeira execução (02/11/2026, release bdebb6f)**:
   7/8 reproduzíveis (88%), HLS=2 MP4=5, latência média ~1.7s, 1 título com
   fontes todas mortas (movie:517769).

## Alternativas descartadas

- **Sintético em sandbox com fixtures**: é o que a suíte já faz — não cobre
  a cadeia real (DNS, allowlist de produção, upstream vivo).
- **Monitor passivo de logs (taxa de 502 nos logs do nginx/PM2)**: detecta
  o problema SÓ quando usuários tentam assistir — o usuário vira o canário.
- **Teste E2E com browser headless**: mais realista ainda, porém pesado e
  frágil (seletores do player mudam); o HTTP smoke cobre 90% do valor por
  5% do custo.

## Consequências

- **Bom**: bug de classe "fontes mortas em bloco" é detectável em minutos,
  rodando on-demand ou agendado (o script é idempotente e barato: ~8
  requests por run).
- **Ruim**: depende de rede externa (upstream Saimo + produção) — flaky em
  ambiente sem internet; NÃO faz parte da suíte `node --test tests/*.cjs`
  (é ferramenta operacional, não teste de regressão).
- **Gatilho para revisitar**: se o upstream Saimo exigir autenticação ou
  começar a bloquear requests sem Referer, o smoke test precisará ajustar
  headers; se outras integrações (Encontrei, live channels) quiserem o mesmo
  padrão, generalizar para `scripts/streaming-smoke-prod.cjs`.
