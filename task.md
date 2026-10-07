# Plano de Implementação Master: Push Notifications (FCM) - Aprovado para Código

Este é o documento final aprovado após a revisão arquitetural Nível Staff, contendo todas as defesas de concorrência e idempotência prontas para o início da codificação.

## Fase 1: Infraestrutura Atômica, Banco e Segurança
- [ ] **Chaves e Logs:** Exportar `getMessaging`. `FIREBASE_SERVICE_ACCOUNT` isolada em ENV. Nenhuma chave em log. Adicionar chave APNs no console para iOS.
- [ ] **Segurança Total (Firestore e Rotas):** Bloquear totalmente acesso cliente a `/users/{uid}/tokens`. Rate Limit estrito em **TODOS** os endpoints (`registerDevice`, `touch`, `syncTopics`, `admin`). Validar JWT via `verifyIdToken(token, true)`.
- [ ] **Claim Admin e Exclusão:** Claim `admin: true` atrelada unicamente por script isolado. Trigger de exclusão de conta (Server-side) desinscreve e apaga todos os devices.

## Fase 2: Registro (`registerDevice`), Cross-Cleanup e Lifecycle
- [ ] **Device ID Inviolável e Setup Nativo:** App gera `deviceId` (UUIDv4). Doc salvo: `token`, `platform`, `updatedAt`, `subscribedTopics: []`. Setup `@capacitor-firebase/messaging`, Web SW/VAPID, Canal Android e PWA iOS.
- [ ] **Limpeza Cruzada Absoluta:** O `registerDevice` busca `token` ou `deviceId` via Collection Group Query e apaga tudo que encontrar, **excluindo apenas** o caminho do documento exato que acabou de gravar. Resolve vazamentos na mesma conta e entre contas.
- [ ] **Logout de Emergência (Risco Aceito):** Bloquear logout offline. Se a API falhar no unregister, aceitamos o risco documentado do token ficar vivo até a próxima limpeza cruzada.
- [ ] **Touch de Segurança (Healing Diário):** Ao abrir o app (1x/dia), rodar touch que recria (Upsert) o documento inteiro (recuperando perdas) e roda `syncTopics`.
- [ ] **Revogação pelo OS:** App checa status real da permissão. Se revogada no OS, chama unregister apagando o device.
- [ ] **Deep Linking Completo:** Tratar Foreground (suporte a block `notification`), Background e Cold Start. Roteamento adiado caso Auth/Router não estejam prontos.

## Fase 3: Sincronia de Tópicos (Server-Authoritative) e Opt-out Global
- [ ] **Opt-out Persistente no Servidor:** Criar campo `globalOptOut` no documento do usuário. O `syncTopics` insere `global_broadcast` no alvo por padrão, exceto se for true. Favoritos silenciados recebem `muted: true`.
- [ ] **`syncTopics` Tolerante (Lease e `syncDirty`):** Transação curta grava lock `syncLockUntil`. Se estiver locado, marca `syncDirty: true`. Ao final do sync, se `syncDirty`, repete o processo. Calcula Delta, inscreve/desinscreve e salva sucesso validando `failureCount`. Gatilho via Cloud Function ao favoritar.
- [ ] **Script Migratório:** Assina todos os usuários atuais nos seus favoritos e no `global_broadcast`.

## Fase 4: Scraper, Idempotência e Self-Healing
- [ ] **Transação Multi-documento Segura:** Lotes ("3 novos episódios de X") travados por Transação (limite 500). `null` -> `sending` (com timestamp `sendingAt`). 
- [ ] **Self-Healing e Ciclo Rigoroso:** Scraper re-reivindica lotes no `sending` > 5min e incrementa o retry count. Erro FCM vira retry com backoff. Se > max_retries vira `failed_permanent` com alerta no log. Sucesso vira `sent`.
- [ ] **Agrupamento e Dedupe Visual:** Tag visual da Série (`android.notification.tag` no block `notification`, `webpush.notification.tag`, `apns-collapse-id` < 64 bytes). Texto do lote: "N novos episódios de X".
- [ ] **Backfill Ordenado:** 1. Deploy API offline. 2. Gravar `"legacy"` ONDE `notifiedAt == null`. 3. Ligar API (alertando só eps postados < 48h avaliado pelo campo *release date*).

## Fase 5: Painel Admin e Testes Isolados
- [ ] **Interface Transparente e Trava Atômica:** Aba "Notificações". Prévia do texto antes de confirmar, alertando que FCM não diz contagem de inscritos em Tópicos. Server checa existência da série `series_<id>`. Trava de servidor com chave de idempotência do cliente salvando o doc do Job *antes* do `send()`.
- [ ] **Histórico e Teste:** Histórico no banco (Quem, Quando, Texto, Público, Resultado amarrado à chave de idempotência). "Testar em mim" confirma JWT vs Token recebido.
- [ ] **Poda CRON (Rate Limited):** Função remove devices inativos > 60 dias via `updatedAt` (que é protegido pelo touch diário). Desinscreve tópicos lendo array local antes do delete.
