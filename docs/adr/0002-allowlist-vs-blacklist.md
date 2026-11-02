# ADR-0002: Hierarquia allowlist vs blacklist de domínios

**Status:** Accepted
**Data:** 2026-11-02
**Commits:** fix de `7357d4f` (caso histórico) + hardening estrutural desta sessão

## Contexto

**O incidente (02/11/2026):** a entrada `embedplay` da blacklist
(`src/data/serverBlacklist.ts`) tinha a chave curta `"embedplay"` e o check
fazia `target.includes(k)` — `"embedplayer2.xyz"` (o CDN FirePlayer do
catálogo HLS do Saimo) contém "embedplay" como substring. Resultado: **2.611
fontes HLS (95% do HLS total) bloqueadas** durante uma semana inteira
(26/10 → 02/11), invisível porque "TODO o HLS estava morto" parecia problema
do upstream.

O CDN estava homologado em **três outros lugares** — allowlist
`ALLOWED_LIVE_STREAMING_DOMAINS`, regex `/embedplayer[a-z0-9-]*\.(...)/i` em
`isAllowedLiveStreamingDomain` (helpers.ts) e Referer/Origin dedicado em
`saimoRoutes.ts` — mas as duas listas **não conversavam**: a allowlist vivia
só em `server/utils/helpers.ts` (server-only) e a blacklist em
`src/data/` (compartilhada client+server). Nenhuma hierarquia formal entre
elas. A culpa era da chave curta, mas o sistema permitiu o erro existir.

**Colisões latentes encontradas na auditoria do mesmo dia:** chaves curtas
sem fronteira (`vidlink`→vidlinker.com, `autoembed`→autoembedplayer.com,
`consumet`→consumetion.net) e o caso invertido — `superflixapi.top` **consta
na allowlist VOD** (legado de scraping) mas é domínio do provedor Superflix,
banido permanentemente pelo dono.

## Decisão

1. **Fonte única da allowlist**: extraída para `src/data/streamingAllowlist.ts`
   (compartilhada client+server); `helpers.ts` importa e reexporta para
   compatibilidade.
2. **Casamento de keys e padrões-string por FRONTEIRA DE PALAVRA** (não
   substring crua): fronteira = caractere não-alfanumérico (underscore É
   fronteira — IDs de servidor como `srv_embedplay_hd` continuam casando).
   Regex patterns ficam como estão: são intenção explícita do autor.
3. **Hierarquia em `isServerBlacklisted`**:
   - Host **exatamente** na allowlist → **vence as KEYS** da blacklist
     (colisões acidentais não derrubam homologação).
   - **REGEX/patterns deliberados** da blacklist → **vencem a allowlist**
     (banimento explícito do dono nunca é sobrescrito: superflixapi.top
     segue bloqueado pelo regex de família).
   - Apenas host EXATO é imune; subdomínio de domínio homologado respeita keys.
4. **Regra para banir domínio allowlisted**: adicionar REGEX de família à
   entrada da blacklist E remover da allowlist.
5. Teste de regressão: `tests/blacklist-allowlist-guard.test.cjs` (5 testes,
   incluindo simulação adversária de chave curta reintroduzida).

## Alternativas descartadas

- **"Allowlist vence sempre"**: desbloquearia superflixapi.top — reverte
  banimento explícito do dono (Superflix: popups/redirecionamentos).
- **"Blacklist vence sempre"** (estado pré-incidente): é exatamente o que
  permitiu o bug do embedplay.
- **Migrar o check do helpers.ts:239 (regex duplicado de provedores banidos)
  para usar `isServerBlacklisted`**: esse regex inclui `byse`/`animefire`/
  `streamberry` que NÃO estão na blacklist de src/data — mudar alteraria
  comportamento do proxy live. Mantido como camada independente
  (defense-in-depth), documentado aqui.

## Consequências

- **Bom**: classe inteira de falso-positivo por substring eliminada;
  reintrodução de chave curta não mata CDN homologado (teste garante);
  allowlist e blacklist têm relação formal documentada.
- **Ruim**: `serverBlacklist.ts` agora importa a allowlist → o bundle client
  carrega ~1KB de domínios (strings públicas, sem segredo — aceitável).
- **Dívida conhecida**: `superflixapi.top` na allowlist VOD é divergência
  deliberada e documentada; o regex duplicado em helpers.ts:239 pode driftar
  da blacklist (ninguém o sintetiza automaticamente).
- **Gatilho para revisitar**: se um provedor homologado precisar ser banido
  inteiro (ex.: embedplayer2 deixa de ser confiável) — seguir a regra 4.
