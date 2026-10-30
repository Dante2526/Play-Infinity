# Black Clover — auditoria de 30/10/2026

TMDB ID: 73223. Testes contra a VPS pública, com duas consultas simultâneas no máximo.

| Temporada da fonte | Episódios consultados | MixDrop: mídia verificada |
| --- | ---: | ---: |
| 1 | 1–51 | 51/51 |
| 2 | 1–51 | 51/51 |
| 3 | 1–52 | 52/52 |
| 4 | 1–16 | 16/16 |
| 5 | 1 | 1/1 |
| Total | 171 | 171/171 |

O endpoint `/api/playback-health` confirmou prefixos de mídia válidos para todos os 171 episódios no MixDrop. No StreamTape, 61 retornaram `available`; os demais não foram confirmados nessa sondagem. `unknown/network` não significa arquivo removido. O lookup dos episódios imediatamente posteriores aos limites acima não encontrou fontes.

## Reprodução real no navegador

Chromium headless, player interno MixDrop servido pela VPS:

- E1 de cada uma das cinco temporadas: `currentTime > 2`, `readyState = 4`, vídeo reproduzindo.
- T1E51, T2E51, T3E52, T4E16 e T5E1: início de reprodução, pausa, seek para 60 segundos, retomada e avanço além de 62 segundos, `readyState = 4`.

São amostras de reprodução e uma auditoria de mídia de todos os arquivos. Não foram assistidos integralmente os 171 episódios, nem testado um aparelho Android físico. Os testes não garantem disponibilidade futura da CDN.

Resultados locais detalhados: `scratch/black-clover-health-audit.json` e `scratch/black-clover-browser-audit.json` (ignorados pelo Git, sem URLs assinadas).

## Correção local

O TMDB agrupa os 170 episódios originais na T1; o catálogo da fonte usa quatro temporadas, além de uma T5 com um episódio. A grade anteriormente usava a contagem e metadados incompatíveis do TMDB. T3–T5 ainda podiam receber os dados da T2 por remapeamento genérico.

Black Clover agora consulta `/api/catalog-season` para obter os números de episódios do Encontrei autenticado na VPS. Em falha temporária, usa os episódios conhecidos nos snapshots Encontrei/Vizer; não inventa a quantidade a partir do TMDB. A listagem live tem cache limitado, timeout de 4 segundos, leitura limitada a 512 KiB e não segue redirects de login. Não devolve cookies, URLs nem IDs privados da fonte.

DetailsPage e VideoPlayerModal preservam essa numeração e não a substituem pelo probe genérico com contagem do TMDB. Os títulos ficam como “Episódio N”, evitando aplicar títulos de outra divisão. Uma lista vazia mostra indisponibilidade temporária na página de detalhes; não gera episódios fictícios. Respostas vazias não ficam presas no cache de dez minutos do cliente.

A rota nova foi validada localmente com fixtures de respostas autenticadas; ainda precisa de validação integrada na VPS após deploy. A reprodução testada acima foi da versão já em produção, não da correção local.

## Validação de código

- 13 testes específicos aprovados, incluindo numeração não contígua, T5 com um episódio, recuperação de listagem vazia, fallback sem sessão e rejeição de redirect de login.
- TypeScript, build Vite e bundle do servidor aprovados.
- Os testes novos foram incluídos no workflow principal.
- A suíte ampla apresentou falhas fora desta alteração, também reproduzidas na revisão HEAD sem os ajustes de Black Clover:
  - `admin-sentinel.test.cjs`: teste 10 exige `data/external-channels.txt`, ausente neste ambiente.
  - `external-catalog.test.cjs`: guard espera N SPORTS na lista estática.
  - `external-dead-domains.test.cjs`: guard exige um padrão textual antigo do cache.
  - `deploy.test.cjs`: testes de rolling deploy, candidato quebrado e cluster degradado observam `v1` quando esperam `v2`.

Sem push ou deploy deste lote.
