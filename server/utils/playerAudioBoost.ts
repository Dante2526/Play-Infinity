/**
 * Utilitários compartilhados de áudio para wrappers same-origin de VOD
 * (BYSE, Saimo, MixDrop, StreamTape, WatchPlay/VIP).
 *
 * 1. ARTPLAYER_VOLUME_FIX_SNIPPET:
 *    Corrige o padrão 0.7 (70%) da biblioteca Artplayer e limpa qualquer volume
 *    0.7 antigo salvo em localStorage.artplayer_settings para iniciar em 100%.
 *
 * 2. buildPlayerAudioNormalizerScript:
 *    Conecta uma cadeia WebAudio broadcast (Presence + DynamicsCompressor +
 *    Makeup Gain + Brickwall Limiter) apenas quando:
 *      - A fonte do <video> é same-origin ou blob: MSE (nunca muta cross-origin)
 *      - O AudioContext está confirmado em state === 'running' (nunca silencia autoplay)
 *    Eleva diálogos baixos (-24 LKFS / downmix 5.1) para alto-falantes de celular
 *    sem distorcer picos ou explosões.
 */

export const ARTPLAYER_VOLUME_FIX_SNIPPET = `
try {
  var __ls = typeof window !== "undefined" && window.localStorage ? window.localStorage : (typeof localStorage !== "undefined" ? localStorage : null);
  var __artCfgRaw = __ls ? __ls.getItem("artplayer_settings") : null;
  if (__artCfgRaw) {
    var __artCfg = JSON.parse(__artCfgRaw);
    if (__artCfg && typeof __artCfg.volume === "number" && __artCfg.volume < 0.95) {
      __artCfg.volume = 1;
      __ls.setItem("artplayer_settings", JSON.stringify(__artCfg));
    }
  }
} catch (e) {}
`.trim();

export function buildPlayerAudioNormalizerScript(videoExpr = "v"): string {
  return `
(function initPlayInfinityAudioBoost() {
  try {
    if (typeof window === "undefined") return;
    var attached = false;
    var audioCtx = null;
    function getVideoEl() {
      try { return ${videoExpr}; } catch (e) { return null; }
    }
    function isSafeSameOriginSrc(el) {
      try {
        var src = (el && (el.currentSrc || el.src)) || "";
        if (!src) return false;
        if (src.indexOf("blob:") === 0) return true;
        if (!window.location || !window.location.origin) return false;
        if (src.charAt(0) === "/" && src.charAt(1) !== "/") return true;
        if (typeof URL === "function") {
          var parsed = new URL(src, window.location.href);
          return parsed.origin === window.location.origin;
        }
        return false;
      } catch (e) {
        return false;
      }
    }
    function attachBoost() {
      if (attached) return;
      var el = getVideoEl();
      if (!el || el.__piAudioBoosted || !isSafeSameOriginSrc(el)) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        if (!audioCtx) {
        try { audioCtx = new AC({ latencyHint: "playback" }); } catch (e) { audioCtx = new AC(); }
      }
        if (audioCtx.state === "closed") return;
        var connectGraph = function () {
          if (attached || !audioCtx || audioCtx.state !== "running") return;
          var target = getVideoEl();
          if (!target || target.__piAudioBoosted || !isSafeSameOriginSrc(target)) return;
          try {
            var srcNode = audioCtx.createMediaElementSource(target);

            var comp = audioCtx.createDynamicsCompressor();
            comp.threshold.value = -20;
            comp.knee.value = 24;
            comp.ratio.value = 2.6;
            comp.attack.value = 0.008;
            comp.release.value = 0.2;

            var makeup = audioCtx.createGain();
            makeup.gain.value = 1.4;

            var limiter = audioCtx.createDynamicsCompressor();
            limiter.threshold.value = -1.2;
            limiter.knee.value = 0;
            limiter.ratio.value = 20;
            limiter.attack.value = 0.001;
            limiter.release.value = 0.05;

            srcNode.connect(comp);
            comp.connect(makeup);
            makeup.connect(limiter);
            limiter.connect(audioCtx.destination);
            target.__piAudioBoosted = true;
            attached = true;
          } catch (e) {}
        };
        if (audioCtx.state === "running") {
          connectGraph();
        } else if (typeof audioCtx.resume === "function") {
          audioCtx.resume().then(connectGraph).catch(function () {});
        }
      } catch (e) {}
    }
    var bindVideo = function () {
      var el = getVideoEl();
      if (!el || el.__piAudioBound || typeof el.addEventListener !== "function") return;
      el.__piAudioBound = true;
      el.addEventListener("play", attachBoost);
      el.addEventListener("playing", attachBoost);
      el.addEventListener("volumechange", function () {
        if (audioCtx && audioCtx.state !== "running" && audioCtx.state !== "closed" && typeof audioCtx.resume === "function") {
          audioCtx.resume().catch(function () {});
        }
      });
    };
    bindVideo();
    if (typeof window.setTimeout === "function") {
      window.setTimeout(bindVideo, 400);
    }
    if (typeof window.addEventListener === "function") {
      window.addEventListener("pointerdown", attachBoost, { passive: true });
      window.addEventListener("touchstart", attachBoost, { passive: true });
      window.addEventListener("click", attachBoost, { passive: true });
      window.addEventListener("pagehide", function () {
        try { if (audioCtx && audioCtx.state !== "closed") audioCtx.close(); } catch (e) {}
      });
    }
  } catch (e) {}
})();
`.trim();
}
