# Disponibilidade por conteúdo

`GET /api/playback-health?id=<TMDB>&type=movie|tv&s=1&e=2&servers=srv_streamtape,srv_mixdrop,...`

A consulta aceita somente os provedores existentes e permitidos: StreamTape, MixDrop, WatchPlayer, VIP e Nixplay. A lista negra continua obrigatória. O cliente envia somente os servidores presentes no seletor após os bloqueios administrativos.

Cada resultado informa `state`, `reason` e `checkedAt`, sem expor URLs assinadas. `available` exige uma amostra reconhecível de MP4 ou um manifesto HLS; HTTP 200 com HTML, catálogo sem arquivo confirmado, 403, 429, falha de resolução e timeout retornam `unknown`. Um 404/410 explícito do resolvedor/player ou da mídia pode retornar `unavailable`. Fontes que dependem de JavaScript no navegador podem permanecer sem confirmação.

As sondagens reutilizam os resolvedores/proxies existentes e consultam o episódio solicitado. São limitadas a 4,5 segundos, seis tarefas simultâneas por worker e 2.000 entradas de cache. A amostra de mídia usa Range de 1 KiB e cancela a leitura mesmo se a origem ignorar Range. Respostas de resolução são limitadas a 64 KiB e páginas de player a 256 KiB. O catálogo é compartilhado entre StreamTape/MixDrop no mesmo lote; consultas simultâneas do mesmo conteúdo/provedor compartilham a sondagem. Cache positivo de 60s e demais resultados de 15s. As requisições internas continuam sujeitas aos limitadores existentes; saturação resulta em estado desconhecido.

O modal inicia a checagem em paralelo, sem aguardar para abrir o player. Repete a cada 45s enquanto visível, consulta ao voltar para a tela e cancela a consulta anterior ao fechar ou mudar de conteúdo. Antes de reprodução efetiva, pode trocar para uma fonte verificada se a atual ainda não foi confirmada. Depois que o relógio do vídeo avança, a checagem apenas atualiza disponibilidade: não troca o servidor durante a reprodução/pausa. O fallback por erro de reprodução mantém a lógica existente e prioriza fontes verificadas; fontes desconhecidas continuam elegíveis.

Resultados negativos deixam de ser usados pelo cliente após 20s; positivos após 75s. Resultados de outro filme/episódio são rejeitados. Uma seleção assíncrona antiga não pode sobrescrever uma seleção mais recente de servidor/episódio. O seletor sinaliza indisponibilidade confirmada sem impedir tentativa manual.

O health check comprova apenas uma amostra naquele instante. Não garante largura de banda sustentada, decodificação no aparelho, áudio correto além da seleção existente de fontes PT-BR, nem segmentos futuros de HLS. Não há varredura contínua do catálogo inteiro nem download antecipado de filmes.

Validação: `node --test tests/playback-health.test.cjs` e `npx tsc --noEmit`.
