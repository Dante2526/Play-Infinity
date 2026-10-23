# Recuperação da reprodução MixDrop

O fluxo continua sendo CDN MixDrop → VPS → navegador/aplicativo. A correção não
altera provedores homologados nem permite servidores da lista negra.

## Proxy de vídeo

`/api/md-stream` inclui o `fileId` original no endereço `/api/md-proxy`. Não é
necessário adivinhar esse ID pelo nome do MP4 para renovar um token expirado.
Endereços criados por abas antigas mantêm compatibilidade com o formato anterior.
Renovações simultâneas do mesmo arquivo compartilham a consulta dentro do processo.

O proxy tem limite de 10 segundos para cabeçalhos e de 6 segundos sem novos bytes
da CDN. Há no máximo duas novas tentativas por requisição. A espera de drenagem do
cliente é tratada separadamente, para não confundir um telefone lento com uma CDN
parada. Desconexão/seek do cliente cancela a transferência antiga.

Se parte do vídeo já foi enviada, o proxy só continua quando a CDN responde 206
com o próximo byte exato, o final e o tamanho total esperados e o mesmo validador
forte (`ETag` ou `Last-Modified`), enviado também em `If-Range`. A ausência de um
validador ou uma resposta 200/objeto diferente na retomada encerra a resposta com
erro; nunca se concatenam bytes incompatíveis. O player pode então recarregar a
fonte preservando a posição. URLs e redirecionamentos devem permanecer em HTTPS
na rede `mxcontent.net`. `X-Accel-Buffering: no` solicita passagem imediata dos
bytes pelo Nginx, quando sua configuração respeita esse cabeçalho.

## Player e buffer seco

O iframe informa a duração do travamento a cada segundo, incluindo buffer zero.
Ele também considera readyState: pode faltar mídia decodificável mesmo quando
o navegador declara uma pequena quantidade de tempo em buffer.
A skin continua mostrando a telemetria, mas deixa a sequência de recuperação do
MixDrop terminar antes de aplicar o fallback genérico de outros provedores.

Durante uma espera real por dados, o player pode segurar a reprodução até ter
uma reserva de 5 segundos. Perto do final, aceita o conteúdo restante. Browsers
mobile que suspendem leitura antecipada enquanto pausados podem retomar com 2
segundos de dados quando declaram rede ociosa e `HAVE_ENOUGH_DATA`.

Se a espera persistir por 12 segundos, há uma tentativa de recarregar a fonte,
restaurando a posição. Se nem essa tentativa recuperar dados, o iframe sinaliza
erro para o mecanismo de fallback existente. Sem recarga, o prazo é de 20 segundos. Quando a recarga é iniciada aos 12
segundos, há até 20 segundos para ela concluir (cerca de 32 segundos no total). Não há loop
de recarga; nova tentativa só fica disponível após reprodução estável. Pausa ou
seek explícitos do usuário cancelam a retomada automática. O comando
`SEEK_RELATIVE` agora interpreta `seconds` corretamente.

## Validação e limites

```bash
node --test tests/mixdrop.test.cjs
npm run lint
```

Os testes exercitam HTTP real com reset no meio do corpo, retomada sem duplicação
de bytes, timeouts, Range/suffix, renovação, validação de arquivo, backpressure e
cancelamento. O HTML gerado é executado em VM para testar os comandos, a duração
da telemetria e as transições de reserva/pausa/recarregamento. A skin mostra o
indicador de carregamento durante a reserva de buffer.

Validação adicional local em Chromium 154, ArtPlayer 5.1.7 e MP4 sintético de
35 segundos: três cenários passaram com a entrega da CDN de teste suspensa até
14/20 segundos. Foram verificados retomada por byte e reprodução automática,
pausa manual em viewport mobile e recarga da fonte com restauração da posição.
Não houve erro fatal nem erro JavaScript nos três cenários. Esse ensaio usa
vídeo e servidor locais, não a CDN MixDrop nem um aparelho Android físico.

As mudanças não garantem continuidade quando a CDN, a VPS ou a conexão do usuário
entregam persistentemente menos dados do que o bitrate do vídeo. O MixDrop atual
usa um MP4 de qualidade fixa, sem adaptação automática de bitrate. Testes locais
não comprovam estabilidade contínua na CDN real nem no aparelho Android físico.
Uma validação na VPS com o novo código será necessária após um deploy autorizado.
