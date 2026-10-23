/** Serialized into the native-video iframe; keep this function self-contained. */
export function createStreamtapeRecovery(video: HTMLVideoElement, options: {
  fileId: string;
  context?: { id: number; season?: number; episode?: number; name?: string } | null;
  getTime: () => number;
  onFatal: (reason: string) => void;
  timeoutMs?: number;
}) {
  let fileId = options.fileId;
  const tried = new Set([fileId]), renewed = new Set<string>();
  let recovering = false, resolving = false, failed = false, wantsPlay = true;
  let target = 0, epoch = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  function fatal() {
    if (failed) return;
    failed = true; recovering = false; resolving = false; epoch++;
    clearTimeout(timer); clearTimeout(stallTimer); controller?.abort();
    options.onFatal('StreamTape: falha persistente no vídeo (código ' + (video.error?.code || 0) + ')');
  }
  async function recover(alternate = false) {
    if (failed || resolving) return;
    clearTimeout(stallTimer);
    if (!recovering) {
      target = options.getTime();
      timer = setTimeout(fatal, options.timeoutMs ?? (options.context ? 18000 : 12000));
    }
    recovering = true; resolving = true;
    const ticket = ++epoch;
    controller?.abort(); controller = new AbortController();
    const current = () => !failed && ticket === epoch;
    async function get(url: string) {
      const response = await fetch(url, { signal: controller!.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Resolver unavailable');
      const data = await response.json();
      if (!data?.proxyUrl) throw new Error('Missing media URL');
      return data;
    }
    try {
      let data: any;
      if (!alternate && video.error?.code !== 3 && !renewed.has(fileId)) {
        renewed.add(fileId);
        try { data = await get('/api/streamtape-resolve?fileId=' + encodeURIComponent(fileId) + '&refresh=1'); }
        catch { /* Try the other distinct catalogue file before leaving StreamTape. */ }
      }
      if (!current()) return;
      if (!data) {
        const context = options.context;
        if (!context || tried.size >= 3) { fatal(); return; }
        let url = '/api/streamtape-resolve?id=' + context.id + '&exclude=' + encodeURIComponent(Array.from(tried).join(','));
        if (context.season !== undefined && context.episode !== undefined) url += '&s=' + context.season + '&e=' + context.episode;
        if (context.name) url += '&name=' + encodeURIComponent(context.name);
        data = await get(url);
        if (!current()) return;
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(data.fileId || '') || tried.has(data.fileId)) throw new Error('No distinct source');
        fileId = data.fileId; tried.add(fileId);
      }
      if (!current()) return;
      video.addEventListener('loadedmetadata', () => {
        if (!current()) return;
        video.currentTime = target;
        if (wantsPlay) video.play().catch(() => {});
        else { clearTimeout(timer); recovering = false; }
      }, { once: true });
      resolving = false;
      video.src = data.proxyUrl; video.load();
    } catch { if (current()) fatal(); }
  }
  video.addEventListener('error', () => {
    if (!options.context && (renewed.has(fileId) || video.error?.code === 3)) { fatal(); return; }
    void recover();
  });
  // Long buffer exhaustion can occur without a media error. Allow a short
  // network dip, then try another file, preserving position and pause intent.
  const stalled = () => {
    if (!options.context || failed || video.paused || recovering || stallTimer) return;
    const position = options.getTime();
    stallTimer = setTimeout(() => {
      stallTimer = undefined;
      if (!video.paused && options.getTime() <= position + .5) void recover(true);
    }, 8000);
  };
  video.addEventListener('waiting', stalled); video.addEventListener('stalled', stalled);
  video.addEventListener('playing', () => {
    clearTimeout(stallTimer); stallTimer = undefined;
    if (!recovering || resolving) return;
    recovering = false; clearTimeout(timer);
  });
  return {
    setPaused(paused: boolean) { wantsPlay = !paused; if (paused) { clearTimeout(stallTimer); stallTimer = undefined; } },
    seek(time: number) { if (recovering) target = Math.max(0, time); },
  };
}
