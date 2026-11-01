interface SignalResult {
  online: boolean;
  statusCode: number;
  error?: string;
  providerDown?: boolean;
  providerName?: string;
}

/** Check alternatives sequentially, stopping at the first usable signal. */
export async function probeChannelServers(
  servers: { url: string; isEmbed?: boolean }[],
  probe: (url: string, timeout: number) => Promise<SignalResult>,
  skipXtream = false
): Promise<SignalResult> {
  let last: SignalResult = { online: false, statusCode: 0, error: 'Sem sinal HLS verificável' };
  let providerFailure: SignalResult | undefined;
  let probed = 0;
  for (const server of servers) {
    if (!server.url || server.isEmbed) continue;
    if ((skipXtream || providerFailure) && server.url.startsWith('/api/iptv/')) continue;
    probed++;
    try {
      last = await probe(server.url, server.url.startsWith('/api/external-channel') ? 12000 : 7000);
    } catch {
      last = { online: false, statusCode: 0, error: 'Falha ao consultar sinal' };
    }
    if (last.online) return last;
    if (last.providerDown) providerFailure = last;
  }
  // Canal 100% embed (MinhaTela e provedores de iframe): não existe playlist
  // HLS nossa para sondar — o player de terceiros gerencia o sinal dentro do
  // iframe (mesma semântica do LivePlayerModal: embed = online por definição).
  // Sem isso, o Sentinela acusaria "fora do ar" em canal que nunca foi testável.
  if (probed === 0 && servers.length > 0) {
    return { online: true, statusCode: 0, error: 'Embed (sem probe HLS)' };
  }
  return providerFailure || last;
}
