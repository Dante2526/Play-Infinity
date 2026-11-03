# ADR-0004: Provedor de anime AnimesDigital (HLS direto da CDN, sem proxy de segmento)

- **Status:** Proposto (implementado na branch `work/anidigital-hls`, aguardando aprovação)
- **Data:** 2026-11-03
- **Contexto:** Engenharia reversa de `animesdigital.org` encomendada pelo dono após a auto-auditoria dos 6 gargalos.

## Contexto

O catálogo do Play-Infinity cobre filmes/séries/novelas (BYSE, Saimo, MixDrop...), mas **anime** depende de
fontes genéricas com qualidade variável. O site animesdigital.org mantém ~19 mil itens de anime FHD
(legendado hardsub PT + dublado) servidos por HLS de CDNs próprias.

## Decisão

Adicionar o provedor `srv_anidigital` ("Anime Digital") com quatro propriedades centrais:

1. **Resolução em 3 saltos com cache** (`server/services/anidigitalResolver.ts`):
   `POST /func/listanime` (token `data-secury` raspado, TTL 45min) → página `/video/a/<id>/` →
   iframe `api.anivideo.net/videohls.php?d=<m3u8>`. Cache positivo 6h / negativo 20min,
   dedupe de resoluções em voo (mesma filosofia do BYSE). Fallback: página da série
   (`/anime/a/<slug>`) com paginação estimada para episódios fora do top-30 da busca.

2. **Só o manifesto passa pelo nosso servidor.** O CDN do animesdigital responde
   `access-control-allow-origin: *` **sem checagem de Referer** — o `/api/anidigital-stream`
   (HMAC + allowlist `cdn-sXX.mywallpaper-4k-image.net` / `cdn-svXX.maximaimg.online`) valida,
   busca o m3u8 e reescreve segmentos relativos (`.webp` disfarçado, na real MPEG-TS) em
   **URLs absolutas da CDN**. O hls.js baixa os segmentos direto do CDN.
   **Contraste com o Saimo (ADR-0001):** o CDN FirePlayer exige Referer, por isso cada segmento
   passa pelo `/api/saimo-hls-segment`. Aqui a banda de vídeo da VPS fica **zero** — o proxy
   de manifesto existe só para assinatura/validação e para esconder a origem do iframe.

3. **Áudio:** legendado é o default (catálogo maior; hardsub PT). `audio=dub` filtra resultados
   "Dublado" com fallback para o que existir. Sem legendas externas — o VTT da skin não se aplica
   (legenda queimada no vídeo).

4. **Mapeamento de episódios:** o site usa numeração **absoluta** por série; TMDB usa temporadas.
   Para `s=1` casa-se o número exato; para `s>1` tentam-se também `e+(s-1)*12`, `e+(s-1)*13` e
   `e+(s-1)*24` (convenções de anime 12/13/24 eps por temporada). Séries longas (One Piece 1100+)
   caem no fallback da página da série. **Limitação conhecida e documentada** — a estimativa de
   página pode falhar em séries com renumeração; nesses casos o título fica indisponível (o
   usuário cai no próximo servidor da escada, sem UX quebrada).

## Alternativas consideradas

- **Proxy de segmento igual ao Saimo:** rejeitado — dobraria a banda da VPS sem ganho (CDN é
  CORS-aberto). Contingência documentada: se o CDN passar a exigir Referer, replicar o
  `/api/saimo-hls-segment` com assinatura HMAC (o rewrite já centraliza o ponto de mudança).
- **SQLite incremental tipo Saimo:** rejeitado por ora (~19k itens mas a busca textual + cache
  de resolução cobre o caso de uso com 3 requests e latência ~2s no primeiro play). Reavaliar
  se a adoção justificar indexação completa.
- **Iframe direto do wrapper `api.anivideo.net`:** rejeitado — JWPlayer de terceiro com
  controles próprios, quebraria a skin Netflix e o protocolo WATCHPLAY.

## Consequências

- **Positivo:** anime FHD com skin Netflix 100% (wrapper próprio, mesmo contrato WATCHPLAY do
  BYSE/Saimo — play/pause/seek/volume/skip-intro testados em `tests/anidigital-resolver.test.cjs`);
  zero banda de vídeo na VPS; botão só aparece quando a busca acha o título (health-probe).
- **Negativo/risco:** dependência da estabilidade do site (Cloudflare pode apertar o scraping —
  mitigação: cache negativo curto + rate limit natural do cache); mapeamento de temporadas
  heurístico; hardsub impede toggle de legenda.
- **Segurança:** `/api/anidigital-stream` não é proxy aberto — exige assinatura HMAC emitida só
  por nós + allowlist de host + bloqueio de hosts privados (mesma hierarquia do Saimo, ADR-0002).
