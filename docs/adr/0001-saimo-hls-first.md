# ADR-0001: Saimo VOD — HLS com ABR como padrão, MP4 como Turbo/fallback

**Status:** Accepted
**Data:** 2026-11-02
**Commits:** `7357d4f`, `1ebed40`, `bdebb6f` (Android 77 / 1.4.45)

## Contexto

A integração Saimo TV (catálogo SQLite de ~52k títulos, commit `26d0101`)
ordenava **MP4 antes do HLS** no `sort()` de candidatos do
`/api/saimo-stream` e nem tentava HLS quando existia MP4
(`isHlsCandidate = hls && !mp4`).

O motivo provável da escolha original: MP4 tem menos latência inicial
(1 round-trip vs 3+ do HLS), proxy mais simples (sem reescrever segmentos)
e seek instantâneo.

O custo invisível: os manifestos FirePlayer (embedplayer2.xyz) são **ABR de
verdade** — master com `#EXT-X-STREAM-INF` multi-bitrate (360p BANDWIDTH=276000
até 720p BANDWIDTH=2048000), faixas de áudio separadas (`TYPE=AUDIO,
LANGUAGE="por"/"eng"/"hin"`) e legendas embutidas (`TYPE=SUBTITLES`). Jogar
isso fora entregava qualidade fixa e sem multi-áudio em redes oscilantes.

## Decisão

1. **HLS-first**: `/api/saimo-stream?prefer=hls|mp4` (default `hls`) — a
   ordenação é de PRIORIDADE, não filtro: se as fontes preferidas morrerem,
   o loop cai na outra família.
2. **Dois botões** no menu de servidores do player:
   - "Saimo Play HD" (`srv_saimo_hls`) — Auto-qualidade • Multi-áudio
   - "Saimo Turbo" (`srv_saimo_mp4`) — Início rápido • MP4
3. **Escolha por rede** (Network Information API): 4G estável (≥5Mbps, sem
   saveData) → MP4 primeiro; fraca/saveData/API ausente → HLS.
4. **Escada de retry no iframe**: hls.js → MP4 (manifest error) e
   video.src → hls.js (fonte direta falhou), cada modo uma vez.
5. **Seletor de faixas por idioma**: dub→pt, leg→en+legenda pt nos eventos
   MANIFEST_PARSED + AUDIO_TRACKS_UPDATED.

## Alternativas descartadas

- **"Só MP4 sempre"** (estado anterior): perde ABR/multi-áudio/legendas;
  playback quebra em rede oscilante — era a reclamação latente.
- **"Só HLS sempre"**: piora a latência inicial (primeiro frame) e o seek em
  MP4 progressivo é instantâneo; títulos só-MP4 ficariam sem fonte.
- **Deixar o usuário escolher sem default inteligente**: a maioria dos
  usuários não sabe o que é ABR; o default por rede cobre o caso comum.

## Consequências

- **Bom**: qualidade adaptativa e multi-áudio por padrão; MP4 continua
  disponível para início rápido.
- **Ruim**: proxy HLS precisa reescrever playlists e assinar segmentos
  (HMAC) — superfície maior de bugs (dois foram corrigidos em `1ebed40`:
  media playlists FirePlayer vêm SEM extensão com CT text/plain; e o
  `/api/saimo-hls-segment` precisou de assinatura para não virar proxy aberto).
- **Gatilho para revisitar**: se o upstream Saimo abandonar HLS/ABR, ou se
  a latência do primeiro frame HLS em produção incomodar os usuários.
