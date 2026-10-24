// Shared by the modal and browser regressions: integrated wrappers use our controls.
export function isExternalIframePlayer(activeIframeUrl: string, urlInput = ""): boolean {
    const activeLower = (activeIframeUrl || "").toLowerCase();
    const inputLower = (urlInput || "").toLowerCase();
    if (
      activeLower.includes("upns.xyz") || activeLower.includes("embedplayapiupn") || activeLower.includes("upns") ||
      inputLower.includes("upns.xyz") || inputLower.includes("embedplayapiupn") || inputLower.includes("upns")
    ) {
      return true;
    }
    const isIntegrated =
      activeLower.includes("watchplay") ||
      activeLower.includes("myembed") ||
      activeLower.includes("playerflix") ||
      activeLower.includes("mixdrop") ||
      activeLower.includes("mxdrop") ||
      activeLower.includes("/api/native-player") ||
      activeLower.includes("/api/md-stream") ||
      activeLower.includes("/api/watchplayer-stream") ||
      activeLower.includes("/api/myembed-stream") ||
      activeLower.includes("/api/anime-stream") ||
      activeLower.includes("/api/vixsrc-stream") ||
      activeLower.includes("/api/live-stream-proxy") ||
      activeLower.includes("/api/vidsrc-stream") ||
      activeLower.includes("/api/vidsrc-proxy") ||
      activeLower.includes("/api/vidsrc-player") ||
      activeLower.includes("/api/byse-proxy-iframe") ||
      activeLower.includes("/api/streamtape-proxy-iframe") ||
      activeLower.includes("/api/streamtape-stream");

    return !isIntegrated;
}

export function preferredPlaybackServer(keys: string[], explicit?: string | null, saved?: string | null): string {
  return [explicit,saved,'srv_byse',...keys].find(key=>!!key&&keys.includes(key)) || 'srv_byse';
}
