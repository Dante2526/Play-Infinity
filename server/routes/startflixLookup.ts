/**
 * Endpoint: GET /api/startflix-lookup?tmdb_id=126027&season=4&episode=23
 *
 * LIVE FETCH ARCHITECTURE:
 * Em vez de cachear embed_url no JSON (token expira em dias/semanas no UPNS),
 * guardamos SÓ o episode_id (estável) no catálogo. Na hora que o user clica play,
 * fazemos LIVE FETCH em painel-aso.sbs/episodio/{episode_id} → pegamos o
 * embed_url ATUAL (token fresco). Cache em memória 5min pra evitar spam.
 *
 * Vantagens:
 * - Sempre usa o token MAIS RECENTE do painel
 * - Se painel re-add video com novo token, funciona automático
 * - Não precisa re-scrapar catálogo quando UPNS remove
 *
 * Catálogo: public/data/startflix-catalog.json (só episode_id, sem embed_url)
 */
import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

// Cache do catálogo em memória (carrega 1x)
let _catalog: any = null;
let _episodeIndex: Map<string, any> = new Map(); // key: "tmdbId:season:episode"

// Cache de embed_urls fresh (5 min TTL)
const _embedCache: Map<string, {
  embed_url: string;
  player_type: string;
  functional: boolean;
  expires: number;
}> = new Map();

const EMBED_CACHE_TTL = 5 * 60 * 1000; // 5 min

function loadCatalog() {
  if (_catalog) return;

  const catalogPath = path.join(process.cwd(), "public", "data", "startflix-catalog.json");
  try {
    const raw = fs.readFileSync(catalogPath, "utf-8");
    _catalog = JSON.parse(raw);

    // Constrói índice pra lookup O(1) por (tmdb_id, season, episode)
    for (const series of _catalog.series || []) {
      const tmdbId = series.tmdb_id;
      for (const season of series.seasons || []) {
        const seasonNum = season.season;
        for (const ep of season.episodes || []) {
          const key = `${tmdbId}:${seasonNum}:${ep.episode}`;
          _episodeIndex.set(key, {
            ...ep,
            series_title: series.title,
            audio: series.audio,
          });
        }
      }
    }

    console.log(`[startflix-lookup] Catálogo carregado: ${_episodeIndex.size} episódios indexados`);
  } catch (err) {
    console.error("[startflix-lookup] Erro ao carregar catálogo:", err);
  }
}

// Extrai players do HTML retornado por painel-aso.sbs/episodio/{id}
function extractPlayers(html: string): Array<{ source: string; type: string; id: string }> {
  const players: Array<{ source: string; type: string; id: string }> = [];

  // Pattern: <button ... data-source="..." ... data-type="..." ... data-id="...">
  const buttonPattern = /<button\b[^>]*\bdata-source="([^"]+)"[^>]*>/g;
  let match;
  while ((match = buttonPattern.exec(html)) !== null) {
    const buttonHtml = match[0];
    const source = match[1];
    const typeMatch = buttonHtml.match(/data-type="([^"]+)"/);
    const idMatch = buttonHtml.match(/data-id="([^"]+)"/);
    players.push({
      source,
      type: typeMatch?.[1] || 'iframe',
      id: idMatch?.[1] || '',
    });
  }

  return players;
}

// Escolhe o melhor player: prefere upns.xyz (sem X-Frame-Options)
function pickBestPlayer(players: Array<{ source: string; type: string; id: string }>) {
  if (players.length === 0) return null;

  // Prioridade 1: UPNS (testado sem X-Frame-Options)
  const upns = players.find(p =>
    p.source.includes('upns.xyz') || p.source.includes('embedplayapiupn')
  );
  if (upns) return { ...upns, functional: true };

  // Prioridade 2: iframe genérico (pode ou não funcionar)
  const iframe = players.find(p => p.type === 'iframe');
  if (iframe) return { ...iframe, functional: false };

  // Última opção
  return { ...players[0], functional: false };
}

router.get("/api/startflix-lookup", async (req, res) => {
  try {
    loadCatalog();

    if (!_catalog) {
      return res.status(503).json({ error: "Catálogo startflix não disponível" });
    }

    const tmdbId = parseInt(req.query.tmdb_id as string, 10);
    const season = parseInt(req.query.season as string, 10) || 1;
    const episode = parseInt(req.query.episode as string, 10) || 1;

    if (!tmdbId) {
      return res.status(400).json({ error: "tmdb_id é obrigatório" });
    }

    const key = `${tmdbId}:${season}:${episode}`;
    const ep = _episodeIndex.get(key);

    if (!ep) {
      return res.status(404).json({
        error: "Episódio não encontrado no catálogo startflix",
        tmdb_id: tmdbId,
        season,
        episode,
      });
    }

    // Verifica cache em memória (5 min) — evita spam no painel-aso
    const cacheKey = `embed:${ep.episode_id}`;
    const cached = _embedCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return res.json({
        embed_url: cached.embed_url,
        player_type: cached.player_type,
        player_id: ep.episode_id,
        audio: ep.audio || "Dublado",
        series_title: ep.series_title,
        functional: cached.functional,
        cached: true,
      });
    }

    // LIVE FETCH: pega embed_url ATUAL do painel-aso
    const painelUrl = `https://www.painel-aso.sbs/episodio/${ep.episode_id}`;
    const referer = `https://www.painel-aso.sbs/embed/${tmdbId}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const upstream = await fetch(painelUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Referer': referer,
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!upstream.ok) {
        // Fallback: usa embed_url do catálogo (pode estar morto, mas é melhor que nada)
        if (ep.embed_url) {
          return res.json({
            embed_url: ep.embed_url,
            player_type: ep.player_type || 'iframe',
            player_id: ep.episode_id,
            audio: ep.audio || "Dublado",
            series_title: ep.series_title,
            functional: ep.embed_url.includes('upns.xyz'),
            fallback: true,
            fallback_reason: `painel-aso retornou ${upstream.status}`,
          });
        }
        return res.status(502).json({ error: `painel-aso retornou ${upstream.status}` });
      }

      const html = await upstream.text();

      // Verifica se Cloudflare bloqueou
      if (html.includes('Just a moment') || html.includes('cf-mitigated') || html.length < 200) {
        // Fallback: usa embed_url do catálogo
        if (ep.embed_url) {
          return res.json({
            embed_url: ep.embed_url,
            player_type: ep.player_type || 'iframe',
            player_id: ep.episode_id,
            audio: ep.audio || "Dublado",
            series_title: ep.series_title,
            functional: ep.embed_url.includes('upns.xyz'),
            fallback: true,
            fallback_reason: "Cloudflare bloqueou o painel-aso",
          });
        }
        return res.status(502).json({ error: "Cloudflare bloqueou o painel-aso" });
      }

      // Extrai players do HTML
      const players = extractPlayers(html);
      const best = pickBestPlayer(players);

      if (!best) {
        // Fallback: usa embed_url do catálogo
        if (ep.embed_url) {
          return res.json({
            embed_url: ep.embed_url,
            player_type: ep.player_type || 'iframe',
            player_id: ep.episode_id,
            audio: ep.audio || "Dublado",
            series_title: ep.series_title,
            functional: ep.embed_url.includes('upns.xyz'),
            fallback: true,
            fallback_reason: "Painel não retornou players",
          });
        }
        return res.status(404).json({ error: "Nenhum player encontrado no painel" });
      }

      // Atualiza cache em memória (5 min)
      _embedCache.set(cacheKey, {
        embed_url: best.source,
        player_type: best.type,
        functional: best.functional,
        expires: Date.now() + EMBED_CACHE_TTL,
      });

      console.log(`[startflix-lookup] LIVE FETCH: S${season}E${episode} → ${best.source.substring(0, 80)}`);

      return res.json({
        embed_url: best.source,
        player_type: best.type,
        player_id: ep.episode_id,
        audio: ep.audio || "Dublado",
        series_title: ep.series_title,
        functional: best.functional,
        cached: false,
      });
    } catch (fetchErr: any) {
      console.error("[startflix-lookup] Erro no LIVE FETCH:", fetchErr?.message);

      // Fallback: usa embed_url do catálogo
      if (ep.embed_url) {
        return res.json({
          embed_url: ep.embed_url,
          player_type: ep.player_type || 'iframe',
          player_id: ep.episode_id,
          audio: ep.audio || "Dublado",
          series_title: ep.series_title,
          functional: ep.embed_url.includes('upns.xyz'),
          fallback: true,
          fallback_reason: `Erro ao fetchar painel: ${fetchErr?.message || 'unknown'}`,
        });
      }

      return res.status(502).json({ error: "Erro ao contatar painel-aso" });
    }
  } catch (err: any) {
    console.error("[startflix-lookup] Erro fatal absoluto:", err);
    return res.status(500).json({ 
      error: "Erro interno", 
      detail: err?.message || String(err), 
      stack: err?.stack || "No stack",
      name: err?.name,
      type: typeof err
    });
import { isNixplayAvailable } from "../services/nixplayCatalog";

// Verifica instantaneamente se um filme/série existe no catálogo local cacheado do Nixplay
router.get("/api/nixplay-check", (req, res) => {
  const { tmdb_id, type } = req.query;
  if (!tmdb_id || !type) return res.status(400).json({ error: "Missing tmdb_id or type" });
  
  const isSeries = type === "series";
  const available = isNixplayAvailable(String(tmdb_id), isSeries);
  
  return res.json({ available });
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
    });

    clearTimeout(timeout);

    const location = upstream.headers.get("location");

    if ((upstream.status === 302 || upstream.status === 301) && location) {
      return res.json({ url: location });
    }

    if (upstream.ok) {
      // Retornou direto (sem redirect) — improvável mas seguro
      return res.json({ url: nixUrl });
    }

    return res.status(upstream.status).json({ error: `Nixplay retornou ${upstream.status}` });
  } catch (err: any) {
    console.error("[nixplay-resolve] Erro:", err?.message);
    return res.status(502).json({ error: err?.message || "Erro ao resolver URL" });
  }
});

// Página bridge genérica para tocar arquivos .mp4 cru (ex: Nixplay) e emitir eventos para a skin
router.get("/api/native-player", (req, res) => {
  const videoUrl = req.query.url as string;
  if (!videoUrl) return res.status(400).send("Missing url parameter");

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
      video.addEventListener('error', function() {
        window.parent.postMessage({ type: 'WATCHPLAY_ERROR', reason: 'native_src_error' }, '*');
      });
      setInterval(sendStatus, 1000);
      sendStatus();
    }

    var rawUrl = decodeURIComponent('${encodedUrl}');
    var needsResolve = rawUrl.indexOf('nixplay.lat') !== -1;

    if (needsResolve) {
      fetch('/api/nixplay-resolve?url=' + encodeURIComponent(rawUrl))
        .then(function(r) { return r.json(); })
        .then(function(data) { initVideo(data.url || rawUrl); })
        .catch(function() { initVideo(rawUrl); });
    } else {
      initVideo(rawUrl);
    }
    window.addEventListener('message', function(e) {
      if (!video) return;
      var cmd = e.data;
      if (!cmd || !cmd.type) return;
      try {
        if (cmd.type === 'PLAY' || cmd.type === 'play') { video.play(); }
        else if (cmd.type === 'PAUSE' || cmd.type === 'pause') { video.pause(); }
        else if (cmd.type === 'SEEK' && typeof cmd.targetTime === 'number') { video.currentTime = cmd.targetTime; }
        else if (cmd.type === 'seek' && typeof cmd.time === 'number') { video.currentTime = cmd.time; }
        else if (cmd.type === 'SET_VOLUME' && typeof cmd.volume === 'number') { video.volume = cmd.volume; video.muted = (cmd.volume === 0); }
        else if (cmd.type === 'setMuted') { video.muted = !!cmd.muted; }
        sendStatus();
      } catch(err) {}
    });
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

// Endpoint pra listar todas as séries + seasons/ep counts (pra admin/debug)
router.get("/api/startflix-catalog", (req, res) => {
  try {
    loadCatalog();
    if (!_catalog) {
      return res.status(503).json({ error: "Catálogo não disponível" });
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json({
      metadata: _catalog.metadata,
      series: _catalog.series.map((s: any) => ({
        tmdb_id: s.tmdb_id,
        title: s.title,
        audio: s.audio,
        seasons: s.seasons.map((sn: any) => ({
          season: sn.season,
          episode_count: sn.episodes.length,
          functional_count: sn.episodes.filter((e: any) =>
            e.embed_url?.includes("upns.xyz")
          ).length,
        })),
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

// Endpoint de TESTE pra validar Cloudflare Worker
// GET /api/proxy-test?url=<target-url>
// Se WORKER_PROXY_URL estiver setado, fetchar via Worker (passa em CF).
// Caso contrário, tenta fetch direto (vai falhar pra sites CF-protected).
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
    console.log(`[proxy-test] ${useWorker ? 'VIA WORKER' : 'DIRETO'}: ${targetUrl}`);
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

    // Extrai title se tiver
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
