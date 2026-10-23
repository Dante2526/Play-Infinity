// This function is serialized into the iframe. Keep it self-contained (no
// imported helpers/constants); the browser regression tests execute that HTML.
export function createMixdropRecovery(video: HTMLVideoElement, options: {
  sourceUrl: string;
  onFatal: (reason: string) => void;
}) {
  let holding = false;
  let hasPlayed = false;
  let wantsPlay = !video.paused;
  let internalPause = false;
  let stalledAt = 0;
  let reloads = 0;
  let reloadedAt = 0;
  let fatalSent = false;
  let stableSeconds = 0;
  let lastTime = video.currentTime || 0;
  let restore: (() => void) | null = null;
  const listeners: Array<[string, EventListener]> = [];

  function bufferedAhead() {
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) {
        return Math.max(0, video.buffered.end(i) - video.currentTime);
      }
    }
    return 0;
  }
  function target() {
    const remaining = Number.isFinite(video.duration) ? video.duration - video.currentTime : 5;
    return Math.min(5, Math.max(0.1, remaining - 0.05));
  }
  function pauseInternally() {
    internalPause = true;
    try { video.pause(); } finally { internalPause = false; }
  }
  function cancelRestore() {
    if (restore) video.removeEventListener("loadedmetadata", restore);
    restore = null;
  }
  function fail(reason: string) {
    if (fatalSent) return;
    fatalSent = true;
    holding = false;
    wantsPlay = false;
    stalledAt = 0;
    cancelRestore();
    pauseInternally();
    options.onFatal(reason);
  }
  function hold() {
    if (!wantsPlay || video.ended || video.seeking || fatalSent) return;
    holding = true;
    if (!stalledAt) stalledAt = Date.now();
    pauseInternally();
  }
  function reloadSource() {
    if (reloads >= 1 || fatalSent || !wantsPlay) return;
    reloads++;
    reloadedAt = Date.now();
    const position = video.currentTime;
    cancelRestore();
    restore = () => {
      restore = null;
      // The user can pause while metadata is loading; restore position without
      // forcing playback. Explicit seeks cancel this pending restoration.
      try { video.currentTime = Math.max(0, Math.min(position, video.duration || position)); }
      catch { fail("mixdrop_restore_failed"); }
    };
    video.addEventListener("loadedmetadata", restore, { once: true });
    const separator = options.sourceUrl.includes("?") ? "&" : "?";
    video.src = options.sourceUrl + separator + "retry=" + Date.now();
    video.load();
  }
  function waiting() {
    if (!wantsPlay || video.paused && !holding || video.seeking || video.ended) return;
    if ((hasPlayed || video.currentTime > 0) &&
        (bufferedAhead() < 0.5 || video.readyState < 3)) hold();
  }
  function playing() {
    hasPlayed = true;
    wantsPlay = true;
    if (holding && bufferedAhead() < target()) {
      pauseInternally();
      return;
    }
    holding = false;
    stalledAt = 0;
    fatalSent = false;
  }
  function paused() {
    // pause events are queued by browsers, so a synchronous guard alone is not
    // enough. A pause while holding is internal unless a PAUSE command cancels it.
    if (internalPause || holding || video.error) return;
    wantsPlay = false;
    stalledAt = 0;
  }
  function listen(name: string, callback: () => void) {
    const listener: EventListener = callback;
    video.addEventListener(name, listener);
    listeners.push([name, listener]);
  }
  listen("play", () => { wantsPlay = true; });
  listen("playing", playing);
  listen("waiting", waiting);
  listen("stalled", waiting);
  listen("pause", paused);
  listen("error", () => {
    if (!wantsPlay || fatalSent) return;
    if (reloads >= 1) { fail("mixdrop_media_error"); return; }
    holding = true;
    if (!stalledAt) stalledAt = Date.now();
    reloadSource();
  });
  const timer = setInterval(() => {
    if (video.ended) { holding = false; wantsPlay = false; stalledAt = 0; cancelRestore(); return; }
    const current = video.currentTime || 0;
    if (!holding && hasPlayed && wantsPlay && !video.paused && !video.seeking) {
      stableSeconds = current > lastTime + 0.1 ? stableSeconds + 1 : 0;
      if (stableSeconds >= 30) reloads = 0;
      if (current <= lastTime + 0.01 && (bufferedAhead() < 0.5 || video.readyState < 3)) hold();
    }
    lastTime = current;
    if (!holding || !wantsPlay || fatalSent) return;
    const duration = Date.now() - stalledAt;
    if (duration >= 20000 && (!reloadedAt || Date.now() - reloadedAt >= 20000)) {
      fail("mixdrop_buffer_unrecoverable"); return;
    }
    if (video.seeking) return;
    stableSeconds = 0;
    // Some mobile browsers stop reading ahead while paused. If the network is
    // explicitly idle with enough decoded data, accept a smaller reserve.
    const enoughBuffer = bufferedAhead() >= target() ||
      video.networkState === 1 && video.readyState === 4 && bufferedAhead() >= 2;
    if (!restore && enoughBuffer && video.readyState >= 3) {
      holding = false;
      stalledAt = 0;
      video.play().catch(() => fail("mixdrop_resume_blocked"));
      return;
    }
    if (duration >= 12000) reloadSource();
  }, 1000);

  return {
    get holding() { return holding; },
    command(type: string) {
      if (type === "PAUSE" || type === "TOGGLE_PLAY" && (wantsPlay || holding)) {
        wantsPlay = false;
        holding = false;
        stalledAt = 0;
        return;
      }
      if (["SEEK", "SEEK_ABSOLUTE", "SEEK_RELATIVE", "seek", "SKIP_INTRO"].includes(type)) {
        cancelRestore();
        const wasHolding = holding;
        holding = false;
        stalledAt = 0;
        if (wasHolding && wantsPlay) video.play().catch(() => {});
      } else if (type === "PLAY" || type === "TOGGLE_PLAY") {
        wantsPlay = true;
        holding = false;
        stalledAt = 0;
        fatalSent = false;
      }
    },
    destroy() {
      clearInterval(timer);
      cancelRestore();
      for (const [name, listener] of listeners) video.removeEventListener(name, listener);
    }
  };
}
