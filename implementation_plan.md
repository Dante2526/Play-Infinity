# Plano de Implementação: Afinidade de Servidor

## 1. Diagnóstico do Problema
O usuário relatou que ao passar para o próximo episódio, o player não mantém o servidor que funcionou (ex: MixDrop) e tenta os primeiros novamente. Isso ocorre por dois motivos:
1. **Stale Closure no React:** O evento de listener message do iframe está em um useEffect que não possui selectedServerKey nas dependências. Assim, quando a skin dispara NEXT_EPISODE, a função enxerga o servidor inicial (WatchPlayer) em vez do servidor atual (MixDrop).
2. **Falta de Persistência:** Se o usuário fecha o player e abre de novo, o estado reseta para WatchPlayer.

## 2. Ações Planejadas
1. **Corrigir Stale Closure:** Adicionar selectedServerKey ao array de dependências do useEffect que gerencia as mensagens do player (linha 1524).
2. **Persistência via LocalStorage:** 
   - No momento em que playbackConfirmedRef.current se torna 	rue (linha 1425), salvar o selectedServerKey no localStorage sob a chave preferred_server_.
   - Na função setupInitialServer, ler essa chave. Se existir e o servidor for válido/não-bloqueado, usá-lo como fallback prioritário em vez do srv_watchplay padrão.

## 3. Arquivos Modificados
- src/components/VideoPlayerModal.tsx
