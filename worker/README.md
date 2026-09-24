# Cloudflare Worker — Proxy Universal (Play-Infinity)

Worker que resolve **TODOS** os sites Cloudflare-protected de uma vez. Cloudflare Worker roda **dentro** da própria rede Cloudflare → fetch intra-rede passa no anti-bot (IP reputation é da própria CF).

## Sites desbloqueados (whitelist)

- ✅ `superflix48.lol` (filmes e séries)
- ✅ `bolodechocolate.fit` (Premiere TV sem ads)
- ✅ `vizer.autos` (filmes/séries)
- ✅ `encontrei.me` (catálogo Mixdrop)
- ✅ `redecanais.in` / `redecanais.to` (filmes/séries)

## Deploy (5 min, grátis, sem cartão)

### Opção A — Wrangler CLI (recomendado, no PC)

```bash
# 1. Instalar wrangler
npm install -g wrangler

# 2. Login na Cloudflare (abre browser)
wrangler login

# 3. Deploy do Worker
cd /home/z/my-project/repos/Play-Infinity/worker/
wrangler deploy

# Output esperado:
# Published play-infinity-proxy
#   https://play-infinity-proxy.<seu-subdominio>.workers.dev
```

### Opção B — Dashboard Web (no celular também)

1. Acessa https://dash.cloudflare.com → Workers & Pages → **Create application** → **Create Worker**
2. Nome: `play-infinity-proxy`
3. Clica em **Deploy**
4. Depois clica em **Edit code**
5. Apaga o código template → cola o conteúdo de `worker/superflix-proxy.js`
6. Clica em **Save and deploy**
7. Copia a URL do Worker (aparece no topo)

## Testar o Worker

```bash
# 1. Health check
curl "https://play-infinity-proxy.<seu-subdominio>.workers.dev/api/health"
# Esperado: {"ok":true,"service":"cloudflare-proxy","allowed_hosts":13}

# 2. Testar fetch do superflix48 (Cloudflare-protected)
curl "https://play-infinity-proxy.<seu-subdominio>.workers.dev/api/proxy?url=https%3A%2F%2Fsuperflix48.lol%2Fserie%2Ffantasmas-2021" | head -c 500

# 3. Testar fetch do bolodechocolate
curl "https://play-infinity-proxy.<seu-subdominio>.workers.dev/api/proxy?url=https%3A%2F%2Fbolodechocolate.fit%2Fembed%2Fpremiereclubes.html" | head -c 500
```

Se o teste 2 retornar HTML grande (>10KB com `<title>` de "Fantasmas" e não "Attention Required"), o Worker tá funcionando.

## Configurar no Render

No painel do Render → play-infinity → Environment:

```
WORKER_PROXY_URL=https://play-infinity-proxy.<seu-subdominio>.workers.dev/api/proxy
```

Salva → Render faz redeploy automático. Pronto!

## Como o backend usa

O backend (`server.ts`) verifica `process.env.WORKER_PROXY_URL`:
- Se setada → faz fetch via Worker (passa em Cloudflare)
- Se vazia → tenta fetch direto (vai falhar pra sites CF, mas funciona pra não-CF)

## Custos e limites

| Recurso | Free tier |
|---|---|
| Requests/dia | 100.000 |
| CPU por request | 10ms (suficiente pra fetch + parse) |
| Cache em memória | 5min, 50 entries LRU |
| Banda | Ilimitada (intra-CF) |

Para o app Play-Infinity (mesmo com 1000 users ativos), isso é mais que suficiente.

## Pra adicionar mais sites no whitelist

Edita `worker/superflix-proxy.js` → array `ALLOWED_HOSTNAMES` → adicione o hostname → `wrangler deploy` de novo.

## Troubleshooting

### "Hostname não permitido pelo whitelist"
- Verifica se o hostname tá em `ALLOWED_HOSTNAMES`
- Se for domínio novo, adicionar no array e re-deploy

### "Erro ao fetchar URL"
- Verifica se a URL tá correta (use URL encoding)
- Tenta sem `https://` no início (não, sempre precisa)
- Testa com curl direto (sem Worker) pra confirmar que o site tá online

### "Cloudflare bloqueou mesmo dentro da rede CF"
- Pode acontecer em sites com WAF mais agressivo (Turnstile interativo)
- Worker consegue passar de WAF básico, mas Turnstile interativo precisa de interação humana
- Casos: `vizer.autos` com Turnstile pode falhar; `bolodechocolate.fit` (WAF básico) deve passar
