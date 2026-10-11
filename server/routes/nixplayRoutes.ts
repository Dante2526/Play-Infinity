/**
 * Rotas de suporte ao player Nixplay e Native Player (MP4)
 */
import { Router } from "express";
import { isNixplayAvailable, loadNixplayCatalog, resolveNixplaySeriesId } from "../services/nixplayCatalog";

const router = Router();

// Verifica se um filme/série existe no Nixplay e retorna o series_id correto
// (necessário porque para algumas séries, series_id != tmdb_id, ex: HxH)
router.get("/api/nixplay-check", async (req, res) => {
  const { tmdb_id, type, name } = req.query;
  if (!tmdb_id || !type) return res.status(400).json({ error: "Missing tmdb_id or type" });
  
  await loadNixplayCatalog();
  
  const isSeries = type === "series";
  
  if (isSeries) {
    // Para séries: tenta resolver o series_id do Nixplay
    const seriesName = name ? String(name) : undefined;
    const resolvedId = resolveNixplaySeriesId(String(tmdb_id), seriesName);
    if (resolvedId) {
      // Busca o total de episódios do Nixplay (pra override do TMDB quando Nixplay tem mais)
      let totalEpisodes = 0;
      try {
        const infoUrl = `https://nixplay.lat/player_api.php?username=testelogado-vods&password=GwXanZ3Dj&action=get_series_info&series_id=${resolvedId}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(infoUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          const data = await response.json();
          const eps = data.episodes || {};
          if (Array.isArray(eps)) {
            totalEpisodes = eps.length;
          } else if (typeof eps === 'object') {
            for (const sk of Object.keys(eps)) {
              if (Array.isArray(eps[sk])) totalEpisodes += eps[sk].length;
            }
          }
          // Salva no cache de episódios também
          const flatEps: any[] = [];
          if (Array.isArray(eps)) {
            flatEps.push(...eps);
          } else {
            for (const sk of Object.keys(eps).sort((a,b) => Number(a) - Number(b))) {
              if (Array.isArray(eps[sk])) flatEps.push(...eps[sk]);
            }
          }
          nixplayEpisodeCache.set(resolvedId, { episodes: flatEps, fetchedAt: Date.now() });
        }
      } catch (e) {
        // Não falha o check se não conseguir buscar total de eps
      }
      return res.json({ available: true, seriesId: resolvedId, totalEpisodes });
    }
    return res.json({ available: false });
  } else {
    // Para filmes: checa direto por tmdb_id (a API de filmes retorna tmdb_id)
    const available = isNixplayAvailable(String(tmdb_id), false);
    return res.json({ available });
  }
});

// Resolve o redirect do Nixplay server-side e retorna a URL assinada do R2 para o player
router.get("/api/nixplay-resolve", async (req, res) => {
  const nixUrl = req.query.url as string;
  if (!nixUrl) return res.status(400).json({ error: "Missing url" });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const upstream = await fetch(nixUrl, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://nixplay.lat/",
        "Origin": "https://nixplay.lat",
        "Connection": "keep-alive",
      },
    });

    clearTimeout(timeout);

    const location = upstream.headers.get("location");

    if ((upstream.status === 302 || upstream.status === 301) && location) {
      return res.json({ url: location });
    }

    if (upstream.ok) {
      return res.json({ url: nixUrl });
    }

    return res.status(upstream.status).json({ error: `Nixplay retornou ${upstream.status}` });
  } catch (err: any) {
    console.error("[nixplay-resolve] Erro:", err?.message);
    return res.status(502).json({ error: err?.message || "Erro ao resolver URL" });
  }
});

// NOVO: Resolve o episode ID correto do Nixplay dado seriesId + season + episode (do TMDB)
// Necessário porque TMDB e Nixplay usam estruturas de temporada DIFERENTES.
// Ex: HxH TMDB S1 tem 62 eps, mas Nixplay tem 6 temporadas (26+12+20+17+61+12=148).
// Este endpoint faz o "flatten" dos episódios do Nixplay e encontra o ID correto.
// Cache em memória pra não re-fetchar get_series_info toda vez.
const nixplayEpisodeCache = new Map<string, { episodes: any[]; fetchedAt: number }>();
const NIXPLAY_CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

router.get("/api/nixplay-episode-id", async (req, res) => {
  const seriesId = req.query.seriesId as string;
  const season = parseInt(req.query.season as string, 10) || 1;
  const episode = parseInt(req.query.episode as string, 10) || 1;
  if (!seriesId) return res.status(400).json({ error: "Missing seriesId" });

  try {
    // Calcula o episódio GLOBAL (número contínuo)
    // Para HxH TMDB S1: E1-E62 (global 1-62)
    // Para HxH TMDB S2: E63-E74 (global 63-74) — se TMDB tiver S2
    // Na prática, a maioria dos animes tem S1 com numeração contínua
    // Então globalEpisode = (season-1) * eps_per_season + episode
    // Mas como não sabemos eps_per_season do TMDB aqui, usamos uma abordagem mais simples:
    // Para S1: globalEp = episode (1-62)
    // Para S2+: globalEp = episode + (episode offset da temporada anterior)
    // Como não temos essa info aqui, vamos assumir que S1 cobre tudo e usar o episode direto
    // se season == 1. Para season > 1, tentamos achar pela season do Nixplay.

    // Busca (ou usa cache) do get_series_info
    let cached = nixplayEpisodeCache.get(seriesId);
    if (!cached || (Date.now() - cached.fetchedAt > NIXPLAY_CACHE_TTL)) {
      const infoUrl = `https://nixplay.lat/player_api.php?username=testelogado-vods&password=GwXanZ3Dj&action=get_series_info&series_id=${seriesId}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(infoUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        return res.status(502).json({ error: `Nixplay API retornou ${response.status}` });
      }
      const data = await response.json();
      const episodesData = data.episodes || {};
      // Flatten: cria lista única de todos os episódios em ordem
      const flatEps: any[] = [];
      if (Array.isArray(episodesData)) {
        flatEps.push(...episodesData);
      } else if (typeof episodesData === 'object') {
        // episodes é um dict com seasons como keys
        for (const seasonKey of Object.keys(episodesData).sort((a,b) => Number(a) - Number(b))) {
          const seasonEps = episodesData[seasonKey];
          if (Array.isArray(seasonEps)) {
            flatEps.push(...seasonEps);
          }
        }
      }
      cached = { episodes: flatEps, fetchedAt: Date.now() };
      nixplayEpisodeCache.set(seriesId, cached);
    }

    // Calcula o episódio global
    // Para S1 E1: global 1. Para S1 E62: global 62.
    // Para S2 E1 (se existir): global = (eps em S1) + 1
    // Mas o TMDB pode ter S1 com 62 eps e o app mostra S2 a partir do ep 63
    // Então globalEpisode = (season - 1) * ??? + episode
    // Como não sabemos quantos eps o TMDB tem por season, vamos usar uma heurística:
    // Se season == 1: globalEp = episode
    // Se season > 1: tentamos usar o episode number direto (assume que TMDB usa numeração contínua)
    // Ex: TMDB S2 E63 = global 63 = 63º episódio na lista flatten do Nixplay
    let globalEp;
    if (season === 1) {
      globalEp = episode;
    } else {
      // Para season > 1, assume que o episódio number do TMDB já é o global
      // (ex: TMDB S2 E63 = episódio 63 global)
      globalEp = episode;
    }

    // Pega o episódio na posição globalEp - 1 (0-indexed)
    if (globalEp < 1 || globalEp > cached.episodes.length) {
      return res.status(404).json({
        error: `Episódio ${globalEp} não encontrado (série tem ${cached.episodes.length} eps)`,
        totalEpisodes: cached.episodes.length,
      });
    }

    const ep = cached.episodes[globalEp - 1];
    const epId = ep.id || ep.episode_id;
    if (!epId) {
      return res.status(404).json({ error: "ID do episódio não encontrado" });
    }

    // Monta a URL do Nixplay
    const nixUrl = `https://nixplay.lat/series/testelogado-vods/GwXanZ3Dj/${epId}.mp4`;

    // Resolve o redirect pra pegar a URL final assinada
    const resolveController = new AbortController();
    const resolveTimeout = setTimeout(() => resolveController.abort(), 8000);
    const upstream = await fetch(nixUrl, {
      method: "GET",
      redirect: "manual",
      signal: resolveController.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://nixplay.lat/",
        "Origin": "https://nixplay.lat",
        "Connection": "keep-alive",
      },
    });
    clearTimeout(resolveTimeout);

    let finalUrl = nixUrl;
    if ((upstream.status === 302 || upstream.status === 301) && upstream.headers.get("location")) {
      finalUrl = upstream.headers.get("location")!;
    }

    return res.json({
      success: true,
      episodeId: epId,
      nixplayUrl: nixUrl,
      videoUrl: finalUrl,
      totalEpisodes: cached.episodes.length,
    });
  } catch (err: any) {
    console.error("[nixplay-episode-id] Erro:", err?.message);
    return res.status(500).json({ error: err?.message || "Erro interno" });
  }
});

// Página bridge genérica para tocar arquivos .mp4 cru (ex: Nixplay) e emitir eventos para a skin
router.get("/api/native-player", async (req, res) => {
  let videoUrl = req.query.url as string;
  if (!videoUrl) return res.status(400).send("Missing url parameter");

  // NOVO: Se a URL é do Nixplay (series), resolve o episode ID correto.
  // Necessário porque TMDB e Nixplay usam estruturas de temporada diferentes.
  // Ex: HxH TMDB S1 E27 → URL original: 46298001027 (não existe, S1 só tem 26 eps)
  //     → endpoint resolve pra: 46298002001 (S2 E1 do Nixplay, que é o 27º ep global)
  if (videoUrl.includes("nixplay.lat/series/")) {
    try {
      // Extrai seriesId, season e episode da URL
      // URL pattern: https://nixplay.lat/series/testelogado-vods/GwXanZ3Dj/<seriesId><SSS><EEE>.mp4
      const match = videoUrl.match(/\/(\d+)\.mp4$/);
      if (match) {
        const fullId = match[1];
        // Os últimos 6 dígitos são SSS + EEE (3+3)
        const seriesId = fullId.slice(0, -6);
        const seasonStr = fullId.slice(-6, -3);
        const episodeStr = fullId.slice(-3);
        const tmdbSeason = parseInt(seasonStr, 10);
        const tmdbEpisode = parseInt(episodeStr, 10);

        // Usa o cache pra achar o episódio correto
        let cached = nixplayEpisodeCache.get(seriesId);
        if (!cached || (Date.now() - cached.fetchedAt > NIXPLAY_CACHE_TTL)) {
          const infoUrl = `https://nixplay.lat/player_api.php?username=testelogado-vods&password=GwXanZ3Dj&action=get_series_info&series_id=${seriesId}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const response = await fetch(infoUrl, { signal: controller.signal });
          clearTimeout(timeout);
          if (response.ok) {
            const data = await response.json();
            const episodesData = data.episodes || {};
            const flatEps: any[] = [];
            if (Array.isArray(episodesData)) {
              flatEps.push(...episodesData);
            } else if (typeof episodesData === 'object') {
              for (const sk of Object.keys(episodesData).sort((a,b) => Number(a) - Number(b))) {
                if (Array.isArray(episodesData[sk])) flatEps.push(...episodesData[sk]);
              }
            }
            cached = { episodes: flatEps, fetchedAt: Date.now() };
            nixplayEpisodeCache.set(seriesId, cached);
          }
        }

        if (cached) {
          // Calcula episódio global (assume numeração contínua do TMDB)
          const globalEp = tmdbSeason === 1 ? tmdbEpisode : tmdbEpisode;
          if (globalEp >= 1 && globalEp <= cached.episodes.length) {
            const correctEp = cached.episodes[globalEp - 1];
            const correctId = correctEp.id || correctEp.episode_id;
            if (correctId) {
              // Substitui a URL com o ID correto
              videoUrl = `https://nixplay.lat/series/testelogado-vods/GwXanZ3Dj/${correctId}.mp4`;
              console.log(`[nixplay] Episódio remapeado: TMDB S${tmdbSeason}E${tmdbEpisode} → Nixplay ID ${correctId} (ep global ${globalEp})`);
            }
          }
        }
      }
    } catch (e) {
      // Se falha, usa a URL original (pode funcionar para séries onde tmdb_id == series_id)
      console.warn("[nixplay] Erro ao remapear episódio, usando URL original:", e);
    }
  }

  const encodedUrl = encodeURIComponent(videoUrl);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; } 
    html,body { width:100%; height:100%; background:#000; overflow:hidden; } 
    video { width:100%; height:100%; object-fit:contain; background:#000; outline:none; }
    #loader { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:#000; }
    .spinner { width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.1); border-left-color: #E50914; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="loader"><div class="spinner"></div></div>
  <video id="native-video" playsinline autoplay></video>
  <script>
    var video = document.getElementById('native-video');
    var loader = document.getElementById('loader');

    function sendStatus() {
      if (!video) return;
      window.parent.postMessage({
        type: 'WATCHPLAY_STATUS',
        data: {
          currentTime: video.currentTime || 0,
          duration: video.duration || 0,
          paused: video.paused,
          muted: video.muted,
          volume: video.volume,
          buffered: video.buffered && video.buffered.length > 0 ? (video.buffered.end(video.buffered.length - 1) / Math.max(video.duration || 1, 1)) * 100 : 0,
          readyState: video.readyState
        }
      }, '*');
    }

    function initVideo(src) {
      loader.style.display = 'none';
      video.src = src;
      video.addEventListener('play', sendStatus);
      video.addEventListener('pause', sendStatus);
      video.addEventListener('timeupdate', sendStatus);
      video.addEventListener('durationchange', sendStatus);
      video.addEventListener('volumechange', sendStatus);
      video.addEventListener('progress', sendStatus);
      video.addEventListener('seeking', sendStatus);
      video.addEventListener('seeked', sendStatus);
      video.addEventListener('error', function() {
        window.parent.postMessage({ type: 'WATCHPLAY_ERROR', reason: 'native_src_error' }, '*');
      });
      setInterval(sendStatus, 1000);
      sendStatus();
    }

    var rawUrl = decodeURIComponent('${encodedUrl}');
    var needsResolve = rawUrl.indexOf('nixplay.lat') !== -1;

    function applyNixProxy(url) {
      if (!url) return url;
      if (url.indexOf('/api/nixplay-proxy') !== -1) return url;
      if (url.indexOf('http') === 0 && (url.indexOf('nixplay') !== -1 || url.indexOf('r2') !== -1 || url.indexOf('cloudflare') !== -1)) {
        return '/api/nixplay-proxy?url=' + encodeURIComponent(url);
      }
      return url;
    }

    if (needsResolve) {
      fetch('/api/nixplay-resolve?url=' + encodeURIComponent(rawUrl))
        .then(function(r) { return r.json(); })
        .then(function(data) { initVideo(applyNixProxy(data.url || rawUrl)); })
        .catch(function() { initVideo(applyNixProxy(rawUrl)); });
    } else {
      initVideo(applyNixProxy(rawUrl));
    }
    window.addEventListener('message', function(e) {
                  if (e.data && e.data.type === 'SET_SUBTITLE_URL') {
                      var vid = window.artInstance ? window.artInstance.video : (typeof art !== 'undefined' && art.video ? art.video : document.querySelector('video'));
                      if (!vid) vid = document.querySelector('video');
                      if (vid) {
                          var oldTrack = document.getElementById('playinfinity-subtitle');
                          if (oldTrack) { oldTrack.remove(); }
                          if (e.data.url) {
                              var track = document.createElement('track');
                              track.id = 'playinfinity-subtitle';
                              track.kind = 'captions';
                              track.label = e.data.label || 'Português (Brasil)';
                              track.srclang = 'pt-BR';
                              track.src = e.data.url;
                              track.default = true;
                              vid.appendChild(track);
                              // Espera carregar para forçar o modo showing
                              if (e.data.show !== false) { track.addEventListener('load', function() { this.mode = 'showing'; }); }
                          }
                      }
                      return;
                  }
                  if (e.data && e.data.type === 'SHOW_SUBTITLE') {
                      var tr = document.getElementById('playinfinity-subtitle');
                      if (tr) {
                          tr.mode = e.data.show ? 'showing' : 'hidden';
                      }
                      return;
                  }

      if (!video) return;
      var cmd = e.data;
      if (!cmd || !cmd.type) return;
      try {
        if (cmd.type === 'PLAY' || cmd.type === 'play') {
          video.play().catch(function(){});
        }
        else if (cmd.type === 'PAUSE' || cmd.type === 'pause') {
          video.pause();
        }
        else if (cmd.type === 'TOGGLE_PLAY' || cmd.type === 'togglePlay') {
          if (video.paused) { video.play().catch(function(){}); } else { video.pause(); }
        }
        else if (cmd.type === 'SEEK' || cmd.type === 'seek' || cmd.type === 'SEEK_ABSOLUTE' || cmd.type === 'SEEK_RELATIVE') {
          var target = typeof cmd.time === 'number' ? cmd.time : cmd.targetTime;
          if (typeof target !== 'number' && typeof cmd.seconds === 'number') {
            target = (video.currentTime || 0) + cmd.seconds;
          }
          if (typeof target === 'number' && !isNaN(target)) {
            video.currentTime = Math.max(0, Math.min(target, (video.duration || 99999)));
          }
        }
        else if (cmd.type === 'SKIP_INTRO') {
          var sec = Number(cmd.seconds) || 85;
          video.currentTime = Math.max(0, Math.min((video.currentTime || 0) + sec, (video.duration || 99999) - 5));
        }
        else if (cmd.type === 'SET_PLAYBACK_RATE' || cmd.type === 'setPlaybackRate') {
          video.playbackRate = Number(cmd.rate) || 1;
        }
        else if (cmd.type === 'SET_VOLUME' && typeof cmd.volume === 'number') {
          video.volume = Math.max(0, Math.min(1, cmd.volume));
          video.muted = (cmd.volume === 0);
        }
        else if (cmd.type === 'setMuted' || cmd.type === 'SET_MUTED') {
          video.muted = !!cmd.muted;
        }
        else if (cmd.type === 'REQUEST_NIXPLAY_STATS') {
          if (typeof window.nixplayStats === 'function') window.nixplayStats();
        }
        sendStatus();
      } catch(err) {}
    });

    // ========================================================
    // TELEMETRIA NIXPLAY: DETECTOR DE ENGASGOS, BUFFER E FRAMES
    // ========================================================
    var stallStart = 0;
    var totalStalls = 0;
    var totalStallDuration = 0;

    function getBufferAhead() {
      if (!video || !video.buffered || video.buffered.length === 0) return 0;
      var cur = video.currentTime || 0;
      for (var i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= cur && cur <= video.buffered.end(i)) {
          return +(video.buffered.end(i) - cur).toFixed(2);
        }
      }
      return 0;
    }

    function getQualityStats() {
      if (video && typeof video.getVideoPlaybackQuality === 'function') {
        try {
          var q = video.getVideoPlaybackQuality();
          return {
            totalFrames: q.totalVideoFrames || 0,
            droppedFrames: q.droppedVideoFrames || 0,
            corruptedFrames: q.corruptedVideoFrames || 0
          };
        } catch(e) {}
      }
      return null;
    }

    function reportStall(reason) {
      if (!video || video.paused || video.ended) return;
      var now = Date.now();
      if (stallStart === 0) {
        stallStart = now;
        totalStalls++;
      }
      var duration = +((now - stallStart) / 1000).toFixed(2);
      var bufferSec = getBufferAhead();
      var q = getQualityStats();

      window.parent.postMessage({
        type: 'NIXPLAY_TELEMETRY_EVENT',
        event: 'stall',
        reason: reason,
        duration: duration,
        bufferAhead: bufferSec,
        currentTime: +(video.currentTime || 0).toFixed(1),
        src: video.currentSrc || video.src || '',
        videoWidth: video.videoWidth || 0,
        videoHeight: video.videoHeight || 0,
        networkState: video.networkState,
        readyState: video.readyState,
        quality: q,
        totalStalls: totalStalls
      }, '*');
    }

    function clearStall() {
      if (stallStart > 0) {
        var duration = +((Date.now() - stallStart) / 1000).toFixed(2);
        totalStallDuration += duration;
        window.parent.postMessage({
          type: 'NIXPLAY_TELEMETRY_EVENT',
          event: 'recovered',
          stallDuration: duration,
          bufferAhead: getBufferAhead(),
          currentTime: +(video.currentTime || 0).toFixed(1)
        }, '*');
        stallStart = 0;
      }
    }

    video.addEventListener('waiting', function() { reportStall('waiting (buffer esgotado)'); });
    video.addEventListener('stalled', function() { reportStall('stalled (CDN parou de responder dados)'); });
    video.addEventListener('playing', clearStall);
    video.addEventListener('canplay', clearStall);

    // Watchdog de congelamento de tela (detecta quando o vídeo trava sem evento waiting nativo)
    var lastCheckedTime = 0;
    var lastCheckWallTime = Date.now();
    var frozenTicks = 0;
    setInterval(function() {
      if (!video || video.paused || video.ended || video.seeking) {
        lastCheckedTime = video ? video.currentTime : 0;
        lastCheckWallTime = Date.now();
        frozenTicks = 0;
        return;
      }
      var now = Date.now();
      var wallDelta = (now - lastCheckWallTime) / 1000;
      var timeDelta = (video.currentTime || 0) - lastCheckedTime;
      lastCheckedTime = video.currentTime || 0;
      lastCheckWallTime = now;

      // Se passou ~0.7s no relógio real e o vídeo andou menos de 0.05s
      if (wallDelta >= 0.7 && timeDelta < 0.05) {
        frozenTicks++;
        if (frozenTicks >= 2) {
          reportStall('frame_freeze (áudio/vídeo congelado)');
        }
        if (frozenTicks === 3) {
          try {
            video.currentTime = Math.max(0, (video.currentTime || 0) + 0.01);
            video.play().catch(function(){});
          } catch(e){}
        } else if (frozenTicks === 6) {
          try {
            video.currentTime = Math.max(0, (video.currentTime || 0) - 0.2);
            video.play().catch(function(){});
          } catch(e){}
        } else if (frozenTicks >= 10) {
          try {
            window.parent.postMessage({ type: 'WATCHPLAY_ERROR', reason: 'frame_freeze_unrecoverable' }, '*');
          } catch(e){}
        }
      } else {
        if (frozenTicks >= 2) clearStall();
        frozenTicks = 0;
      }
    }, 600);

    // Comando sob demanda no console: window.nixplayStats()
    window.nixplayStats = function() {
      var q = getQualityStats();
      var stats = {
        'Tempo Atual': +(video.currentTime || 0).toFixed(2) + 's',
        'Duração': +(video.duration || 0).toFixed(2) + 's',
        'Pausado': video.paused,
        'Buffer à Frente': getBufferAhead() + 's',
        'Resolução': (video.videoWidth || 0) + 'x' + (video.videoHeight || 0),
        'Estado de Rede': ['EMPTY (0)', 'IDLE (1)', 'LOADING (2)', 'NO_SOURCE (3)'][video.networkState] || video.networkState,
        'Ready State': ['HAVE_NOTHING (0)', 'HAVE_METADATA (1)', 'HAVE_CURRENT_DATA (2)', 'HAVE_FUTURE_DATA (3)', 'HAVE_ENOUGH_DATA (4)'][video.readyState] || video.readyState,
        'Engasgos Detectados': totalStalls,
        'Tempo Total Travado': +(totalStallDuration).toFixed(2) + 's',
        'Perda de Quadros': q ? (q.droppedFrames + ' drops / ' + q.totalFrames + ' frames total (' + (q.totalFrames ? ((q.droppedFrames / q.totalFrames) * 100).toFixed(2) : 0) + '%)') : 'N/A',
        'URL da Fonte CDN': video.currentSrc || video.src
      };
      console.log('%c[NixPlay Telemetria] 📊 RELATÓRIO DO STREAMING', 'background:#1e293b;color:#38bdf8;font-weight:bold;padding:4px 8px;border-radius:4px;');
      console.table(stats);
      return stats;
    };
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

// Proxy de streaming seguro para Nixplay (evita quedas de conexão do Cloudflare R2 / Nixplay CDN)
router.get("/api/nixplay-proxy", async (req, res) => {
  try {
    const targetUrl = String(req.query.url || "").trim();
    if (!targetUrl) {
      return res.status(400).send("URL de mídia inválida.");
    }

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Encoding": "identity",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Referer": "https://nixplay.lat/",
      "Origin": "https://nixplay.lat",
      "Connection": "keep-alive",
    };

    if (req.headers.range) {
      headers["Range"] = req.headers.range as string;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    req.on("close", () => controller.abort());

    const upstream = await fetch(targetUrl, { signal: controller.signal, headers });
    clearTimeout(timeoutId);

    res.status(upstream.status);

    for (const [key, value] of upstream.headers.entries()) {
      const lk = key.toLowerCase();
      if (lk === "content-length") continue;
      if (["content-type", "content-range", "accept-ranges"].includes(lk)) {
        res.setHeader(key, value);
      }
    }
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (!upstream.body) {
      return res.end();
    }

    const { Readable } = await import("stream");
    // @ts-ignore
    const source = Readable.fromWeb(upstream.body);
    let sourceFailed = false;
    source.on("error", () => {
      if (sourceFailed || res.writableEnded) return;
      sourceFailed = true;
      controller.abort();
      if (upstream.status === 206) res.destroy();
      else res.end();
    });
    source.pipe(res);

    res.on("close", () => controller.abort());
    res.on("error", () => controller.abort());
  } catch (err: any) {
    if ((err as any)?.name === "AbortError") {
      if (!res.headersSent) res.end();
      return;
    }
    console.error("[nixplay-proxy] Erro:", err);
    if (!res.headersSent) res.status(500).send("Erro no proxy do Nixplay");
    else res.destroy();
  }
});

// Endpoint de TESTE pra validar Cloudflare Worker
router.get("/api/proxy-test", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const targetUrl = String(req.query.url || "").trim();
  if (!targetUrl) {
    return res.status(400).json({ error: "Parâmetro 'url' é obrigatório" });
  }

  const workerProxyUrl = process.env.WORKER_PROXY_URL;
  const useWorker = !!workerProxyUrl;

  const fetchUrl = useWorker
    ? `${workerProxyUrl}?url=${encodeURIComponent(targetUrl)}`
    : targetUrl;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const upstream = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const body = await upstream.text();
    const isCFBlocked = body.includes('Attention Required') || body.includes('Just a moment');
    const titleMatch = body.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    return res.json({
      target_url: targetUrl,
      via_worker: useWorker,
      worker_url: workerProxyUrl || null,
      status: upstream.status,
      body_size: body.length,
      title,
      cloudflare_blocked: isCFBlocked,
      sample: body.substring(0, 500),
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Erro ao fetchar URL',
      detail: err.message,
      target_url: targetUrl,
      via_worker: useWorker,
    });
  }
});

export default router;

