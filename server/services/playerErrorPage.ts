/**
 * Página de erro INVISÍVEL para os iframes de player.
 *
 * Contrato de UI: a falha de um provedor de vídeo é um sinal INTERNO
 * (postMessage WATCHPLAY_ERROR para o VideoPlayerModal), nunca conteúdo
 * visível. O usuário final nunca deve ver o nome do servidor/host interno
 * (StreamTape, MixDrop, Byse, Saimo, DoodStream, AnimesDigital…) nem uma
 * página "Vídeo Indisponível" crua: a troca de servidor é silenciosa
 * (fallback automático) e o estado visual permanece o spinner de carregamento
 * do modal até o próximo servidor confirmar playback.
 *
 * Dois reforços no sinal interno:
 *
 * 1. playerFrameUrl — a URL do frame que reportou. O VideoPlayerModal usa
 *    isso para aceitar NA HORA erros do frame recém-commitado mesmo dentro
 *    da janela de transição (< 3s pós-troca), distinguindo-o do iframe
 *    antigo em descarte (cujos erros de agonia devem continuar ignorados).
 *
 * 2. Reenvios (0ms / 800ms / 2000ms / 3500ms) — o modal ignora erros que
 *    chegam na janela de transição; pelo menos uma tentativa cai fora dela
 *    e o fallback dispara sem esperar o watchdog de startup (que para
 *    streamtape/byse pode levar 45–95s). Reenvios são idempotentes: o
 *    modal deduplica por servidor (fallbackAttempts) e o frame é descartado
 *    assim que a troca commita.
 */
export type PlayerErrorExhaustedKey =
  | "streamtapeExhausted"
  | "byseExhausted"
  | "mixdropExhausted"
  | "saimoExhausted";

export function buildSilentPlayerErrorPage(message: {
  reason: string;
  exhaustedKey?: PlayerErrorExhaustedKey;
  extra?: Record<string, unknown>;
}): string {
  // Payload estático serializado com escape de "<" para não quebrar o
  // </script> do wrapper; playerFrameUrl é resolvido no cliente.
  const staticPayload = JSON.stringify({
    type: "WATCHPLAY_ERROR",
    reason: message.reason,
    ...(message.exhaustedKey ? { [message.exhaustedKey]: true } : {}),
    ...(message.extra || {}),
  })
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>html,body{background:#000;margin:0;padding:0;width:100%;height:100%;overflow:hidden}</style></head>
<body><script>
(function() {
  var payload = ${staticPayload};
  try { payload.playerFrameUrl = window.location.href; } catch (e) {}
  function report() {
    try {
      if (window.parent !== window) window.parent.postMessage(payload, "*");
    } catch (e) {}
  }
  report();
  setTimeout(report, 800);
  setTimeout(report, 2000);
  setTimeout(report, 3500);
})();
</script></body></html>`;
}
