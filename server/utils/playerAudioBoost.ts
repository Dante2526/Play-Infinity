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
  var __artCfgRaw = localStorage.getItem("artplayer_settings");
  if (__artCfgRaw) {
    var __artCfg = JSON.parse(__artCfgRaw);
    if (__artCfg && typeof __artCfg.volume === "number" && __artCfg.volume < 0.95) {
      __artCfg.volume = 1;
      localStorage.setItem("artplayer_settings", JSON.stringify(__artCfg));
    }
  }
} catch (e) {}
`.trim();

export function buildPlayerAudioNormalizerScript(videoExpr = "v"): string {
  return `
(function initPlayInfinityAudioBoost() {
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
      var parsed = new URL(src, window.location.href);
      return parsed.origin === window.location.origin;
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
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "closed") return;
      var connectGraph = function () {
        if (attached || !audioCtx || audioCtx.state !== "running") return;
        var target = getVideoEl();
        if (!target || target.__piAudioBoosted || !isSafeSameOriginSrc(target)) return;
        try {
          var srcNode = audioCtx.createMediaElementSource(target);
          var voiceEq = audioCtx.createBiquadFilter();
          voiceEq.type = "peaking";
          voiceEq.frequency.value = 2300;
          voiceEq.Q.value = 0.8;
          voiceEq.gain.value = 2.2;

          var comp = audioCtx.createDynamicsCompressor();
          comp.threshold.value = -24;
          comp.knee.value = 20;
          comp.ratio.value = 3.8;
          comp.attack.value = 0.005;
          comp.release.value = 0.18;

          var makeup = audioCtx.createGain();
          makeup.gain.value = 1.45;

          var limiter = audioCtx.createDynamicsCompressor();
          limiter.threshold.value = -1.5;
          limiter.knee.value = 0;
          limiter.ratio.value = 20;
          limiter.attack.value = 0.001;
          limiter.release.value = 0.05;

          srcNode.connect(voiceEq);
          voiceEq.connect(comp);
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
    if (!el || el.__piAudioBound) return;
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
  setTimeout(bindVideo, 400);
  window.addEventListener("pointerdown", attachBoost, { passive: true });
  window.addEventListener("touchstart", attachBoost, { passive: true });
  window.addEventListener("click", attachBoost, { passive: true });
  window.addEventListener("pagehide", function () {
    try { if (audioCtx && audioCtx.state !== "closed") audioCtx.close(); } catch (e) {}
  });
})();
`.trim();
}
