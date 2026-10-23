/** Serialized into the native-video iframe; keep this function self-contained. */
export function createStreamtapeRecovery(video: HTMLVideoElement, options: {
  fileId: string;
  getTime: () => number;
  onFatal: (reason: string) => void;
  timeoutMs?: number;
}) {
  let attempted = false;
  let recovering = false;
  let failed = false;
  let wantsPlay = true;
  let target = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  function fatal() {
    if (failed) return;
    failed = true;
    recovering = false;
    clearTimeout(timer);
    controller?.abort();
    options.onFatal('StreamTape: falha persistente no vídeo (código ' + (video.error?.code || 0) + ')');
  }
  video.addEventListener('error', () => {
    // Decode failures cannot be repaired by minting another CDN token.
    if (attempted || video.error?.code === 3) { fatal(); return; }
    attempted = true;
    recovering = true;
    target = options.getTime();
    controller = new AbortController();
    timer = setTimeout(fatal, options.timeoutMs ?? 12000);
    fetch('/api/streamtape-resolve?fileId=' + encodeURIComponent(options.fileId) + '&refresh=1', {
      signal: controller.signal, cache: 'no-store',
    }).then(response => {
      if (!response.ok) throw new Error('Resolver unavailable');
      return response.json();
    }).then(data => {
      if (!recovering || failed) return;
      if (!data?.proxyUrl) throw new Error('Missing media URL');
      video.addEventListener('loadedmetadata', () => {
        if (failed) return;
        video.currentTime = target;
        if (wantsPlay) video.play().catch(() => {});
        else clearTimeout(timer);
      }, { once: true });
      video.src = data.proxyUrl;
      video.load();
    }).catch(() => { if (!failed) fatal(); });
  });
  video.addEventListener('playing', () => {
    if (!recovering) return;
    recovering = false;
    clearTimeout(timer);
  });
  return {
    setPaused(paused: boolean) {
      wantsPlay = !paused;
    },
    seek(time: number) { if (recovering) target = Math.max(0, time); },
  };
}
