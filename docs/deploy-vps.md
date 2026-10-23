# Deploy da aplicação na VPS Oracle

Antes do envio, o workflow executa os testes de pagamentos e a troca com PM2 real,
além da checagem de tipos. O workflow `main.yml` prepara versões em `/home/ubuntu/play-infinity/releases/<id>`.
Ele instala dependências próprias, verifica o bundle de produção em uma porta
local separada e só então troca o symlink `current` atomicamente e executa o reload
das duas instâncias PM2. O deploy e os reloads do painel compartilham uma trava.

O `ready` só é emitido após o evento `listening`. Cada processo resolve seu
diretório de versão ao iniciar; processos antigos continuam com seus arquivos e
dependências até concluírem as respostas abertas. `data`, `uploads`, `secrets`,
`.env` e `.env.local` usam os arquivos persistentes da raiz da aplicação. Os arquivos
de ambiente são carregados antes dos módulos que validam segredos. A prova pode
reutilizar `PROXY_SECRET` do PM2 existente apenas em memória, sem gravá-lo em
arquivos ou argumentos. Dados
existentes não são sobrescritos pelo pacote. Atualizações de catálogo persistente
devem ser feitas pelo fluxo próprio do catálogo, não por substituição no deploy.

Os assets de `dist/assets` de todas as versões ficam em `shared-assets`, servidos
também pelos processos novos. Isso mantém disponíveis os chunks carregados sob
demanda por abas que já estavam abertas. Os assets da instalação anterior ao
layout de releases também são preservados na primeira migração.

## Requisitos e ativação

- O PM2 da aplicação deve ter duas instâncias online em modo cluster. O workflow
  mantém o daemon root já utilizado para a aplicação (`sudo pm2`); não migra o
  processo entre usuários. O `video-proxy`, documentado no daemon de `ubuntu`, não
  faz parte do deploy. Se o cluster estiver degradado/em fork, o deploy falha antes
  da troca. A primeira instalação pode iniciar a aplicação quando ela não existe.
- O workflow usa Node 22 para compilar. A VPS precisa de Node/npm, PM2, Bash,
  `flock`, GNU tar e GNU coreutils. Dependências são instaladas na versão nova;
  eventual falha preserva a aplicação em execução. O lockfile atual ainda exige
  fallback de `npm ci` para `npm install`; essa pendência é independente do deploy.
- A porta de prova padrão é `127.0.0.1:3100`; pode ser alterada por
  `PLAY_INFINITY_PROBE_PORT`. A porta da aplicação permanece 3000 por padrão.
- A ativação é feita pelo próximo envio autorizado para `main`, ou pelo workflow
  manual no GitHub. O botão antigo de build na pasta ativa agora dispara o mesmo
  workflow. Chamadas antigas da API `git-pull-build` recebem orientação para usar
  esse fluxo, em vez de apagar/substituir o build que está em uso.
- A primeira atualização não consegue alterar o temporizador de encerramento
  que já está carregado nos processos antigos. A proteção ampliada vale para
  processos iniciados com o novo código; não prometer ausência de corte na migração.

## Limites e operação

`APP_DRAIN_TIMEOUT_MS` controla a janela de conclusão das conexões, com padrão de
duas horas. O `kill_timeout` do PM2 fica 30 segundos acima dessa janela. Uma conexão
que ultrapasse o limite ainda pode ser encerrada. Aumentar muito o prazo exige
ajustar também o timeout do workflow: duas instâncias podem drenar sequencialmente.
O workflow atual permite até 300 minutos. O limite não substitui os timeouts de
Nginx, CDN, upstream, falhas de rede ou falta de memória.

O deploy não reinicia o proxy de TV nem recarrega Nginx. A ação explícita de
reiniciar o proxy continua sendo manutenção com interrupção de conexões. Os botões
de reload agendam a operação e gravam o resultado em
`/home/ubuntu/play-infinity/reload.log`; o agendamento não significa conclusão.

Após o reload, o script exige duas instâncias online da versão esperada e um
healthcheck HTTP contendo o mesmo identificador. Não há alternativa automática
com `restart all`, `fuser -k` ou restart do app. Se uma falha ocorrer após a troca,
o deploy retorna erro e mantém as versões anteriores para diagnóstico; não afirma
rollback apenas por restaurar um symlink. O operador deve verificar `sudo pm2
jlist`, os logs e o healthcheck antes de decidir a recuperação.

Não há remoção automática de releases/assets: acompanhe o espaço disponível.
Remova versões antigas somente depois de confirmar que nenhum processo as usa.
Assets antigos precisam permanecer enquanto houver sessões que possam solicitá-los.
Se o Nginx tiver regras locais servindo diretamente a antiga pasta `dist`, essas
regras precisam apontar para o novo layout ou encaminhar as requisições ao app;
o workflow não altera configurações Nginx desconhecidas.

## Validação local

```bash
npm run lint
node --test tests/payments.test.cjs
# Instale PM2 em uma pasta de ferramentas separada do projeto, se necessário.
PM2_BIN=/caminho/para/node_modules/.bin/pm2 node --test tests/deploy.test.cjs
```

O teste de deploy usa daemon PM2, diretórios e portas locais isolados. Ele executa
os scripts reais com uma aplicação HTTP de teste e cobre instalação inicial,
conservação dos dados/assets, stream de 12 segundos durante rolling reload,
novas requisições durante a troca, candidato inválido, erro de bind antes de
`ready` e recusa de reload em cluster degradado. Isso não substitui uma validação
de reprodução na VPS com Nginx, CDN e os provedores externos reais.
