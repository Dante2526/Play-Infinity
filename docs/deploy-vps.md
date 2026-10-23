# Deploy da aplicação na VPS Oracle

Antes do envio, o workflow executa os testes de pagamentos e a troca com PM2 real,
além da checagem de tipos. O workflow `main.yml` prepara versões em `/home/ubuntu/play-infinity/releases/<id>`.
Ele valida primeiro o cluster PM2 existente, instala dependências próprias, verifica o bundle de produção em uma porta
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
  A migração opcional de uma única instância fork está descrita abaixo.
- O workflow usa Node 22 para compilar. A VPS também precisa de Node 22 ou superior
  (exigido por firebase-admin e outras dependências), npm, PM2, Bash,
  `flock`, GNU tar e GNU coreutils. Dependências são instaladas na versão nova;
  eventual falha preserva a aplicação em execução. O lockfile versionado permite
  instalação determinística via `npm ci`; mantenha o lockfile sincronizado com
  package.json. Não há fallback para resolver versões diferentes na VPS.
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

SSH e SCP enviam keepalive a cada 15 segundos e toleram até 12 respostas ausentes,
para manter a conexão durante instalações sem saída no terminal. Isso não evita
quedas reais da VPS ou da rede. `client_loop: send disconnect: Broken pipe` com
saída 255 indica perda do transporte SSH, não um erro comprovado do npm. Nesse
caso o processo remoto pode ter continuado; confira PM2 e a versão no healthcheck
antes de repetir. O workflow não tenta novamente a manutenção automaticamente
nem declara rollback quando perde a conexão.

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

## Falha de pré-verificação PM2

A verificação roda após extrair o pacote e antes de instalar dependências, e é
repetida antes de ativar a versão. Em caso de erro, o log informa somente IDs,
modo e estado dos processos da aplicação; não imprime variáveis de ambiente.
Uma instância parada, modo fork ou quantidade diferente de duas exige diagnóstico
da instalação existente. Não remova essa proteção nem execute restart/delete all
como correção genérica. `sudo pm2 list` permite conferir a estrutura sem expor
segredos; não cole a saída completa de `pm2 jlist`, que contém credenciais.

## Migração única de uma instância fork

Uma instalação legada com exatamente uma instância `play-infinity-app` online
em `fork_mode` não pode fazer a primeira troca por rolling reload. É necessária
uma manutenção com breve indisponibilidade; conexões existentes podem cair.
Não confundir essa primeira migração com o deploy normal de um cluster saudável.

A manutenção só é habilitada pela opção `migrate_legacy_fork` ao executar o workflow
manualmente, ou por um commit autorizado cuja mensagem comece com
`[migrate-legacy-fork] `. O prefixo torna a intenção explícita e permite executar a
migração pelo push sem SSH manual. Pushs normais mantêm a proteção. Uma vez que
existam duas instâncias saudáveis, até a reexecução desse commit usa reload normal.

O pacote, dependências e bundle de produção são verificados na porta de prova
antes da parada. Na ativação, a estrutura é consultada novamente e somente a
instância fork da aplicação é removida. As variáveis da instância antiga são
preservadas em memória e combinadas com a configuração da versão nova. O proxy
de TV não é parado nem reiniciado.

A migração exige duas instâncias online e um healthcheck da versão esperada antes
de salvar o estado PM2. Se a ativação falhar, tenta remover somente as instâncias
novas dessa versão, restaurar o symlink/configuração anterior e iniciar novamente
a instância fork com o executável, diretório e variáveis anteriores. A recuperação
também exige healthcheck; falha de recuperação é informada como necessidade de
intervenção. Segredos não são escritos em arquivos temporários nem em logs; a
persistência final continua sendo o dump padrão do PM2.

O mecanismo não altera a versão de Node da VPS. O requisito Node 22+ continua
válido; Node 20 produz avisos de incompatibilidade das dependências. A migração
só prossegue se a prova do bundle passar no runtime presente. Não execute essa
manutenção sem uma janela autorizada para a primeira parada.
