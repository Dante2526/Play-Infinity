# Resumo da Correção: MixDrop 502 Bad Gateway

## Diagnóstico
O problema reportado pelo usuário era um erro `502 Bad Gateway` na rota `/api/mixdrop-stream` quando o MixDrop removia um arquivo e retornava "We can't find the video you are looking for". Isso causava um travamento no reprodutor porque:
1. O MixDrop era selecionado e o `playerSkinReady` era forçado imediatamente como `true`.
2. Como o `playerSkinReady` era `true`, o watchdog do `VideoPlayerModal.tsx` desativava, nunca detectando que o iframe falhou em carregar.
3. O usuário ficava vendo a tela de erro dentro do Iframe sem ocorrer a transição automática de servidor (Silent Fallback).

## Solução Implementada
No arquivo `server.ts`, modificamos a tratativa de erros do bloco `mixdrop-stream`. Em vez de apenas responder um erro HTTP puro que o iframe não consegue ler:

- Implementamos a função auxiliar `sendFallbackHtml(statusCode, message)`.
- Quando ocorre um erro no carregamento da URL no scraper, a rota retorna um mini-documento HTML válido que aciona a API `postMessage` (`{ type: "WATCHPLAY_ERROR", reason: ... }`).
- O `VideoPlayerModal.tsx` já possui escuta (`window.addEventListener("message", ...)`) que monitora esse erro exato.
- O Silent Fallback passa a ser disparado **instantaneamente** pela mensagem, transferindo o usuário sem engasgos de tempo para o próximo servidor homologado (Ex: VIP Player Dublado PT-BR) no segundo em que o MixDrop nega o arquivo.

## Testes Realizados
O arquivo TypeScript do servidor local foi verificado via `npx tsc --noEmit` para garantir ausência de erros sintáticos (especialmente sobre escapes da RegEx do Packer).
