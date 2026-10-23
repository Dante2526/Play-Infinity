import { Router } from 'express';
import { isServerBlacklisted } from '../../src/data/serverBlacklist';
import { createPlaybackHealthCache, probeHealthMedia, readHealthPrefix } from '../services/playbackHealth';

const providers = new Set(['srv_streamtape', 'srv_mixdrop', 'srv_watchplay', 'srv_vip', 'srv_nixplay']);
const check = createPlaybackHealthCache();
const router = Router();

router.get('/api/playback-health', async (req, res) => {
  const id = String(req.query.id || '');
  const type = String(req.query.type || '');
  const season = Number(req.query.s || 1), episode = Number(req.query.e || 1);
  if (!/^(?:[1-9]\d{0,9}|tt\d{5,12})$/.test(id) || !['movie', 'tv'].includes(type) ||
      !Number.isInteger(season) || season < 1 || season > 999 || !Number.isInteger(episode) || episode < 1 || episode > 9999) {
    return res.status(400).json({ error: 'Conteúdo inválido' });
  }
  const requested = [...new Set(String(req.query.servers || '').split(','))];
  if (!requested.length || requested.length > 6 || requested.some(key => !providers.has(key) || isServerBlacklisted(key))) {
    return res.status(400).json({ error: 'Servidor inválido' });
  }
  // Origin is constructed locally, never from Host or a client-supplied URL.
  const port = req.socket.localPort;
  const origin = `http://127.0.0.1:${port}`;
  const name = String(req.query.name || '').slice(0, 160);
  const nixId = String(req.query.nixId || '').replace(/[^0-9]/g, '').slice(0, 12);
  const identity = [type, id, type === 'tv' ? season : 0, type === 'tv' ? episode : 0, name, nixId].join(':');
  const params = new URLSearchParams({ id, type, s: String(season), e: String(episode), name });
  let catalog: Promise<any> | undefined;
  const json = async (url: string, signal: AbortSignal) => {
    const response = await fetch(url, { signal });
    const bytes = await readHealthPrefix(response, 64 * 1024);
    if (!response.ok) throw new Error('Resolver unavailable');
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  const localMedia = (raw: string, allowedPaths: string[]) => {
    const parsed = new URL(raw, origin);
    if (!allowedPaths.includes(parsed.pathname) || isServerBlacklisted(raw)) throw new Error('Unexpected media path');
    return origin + parsed.pathname + parsed.search;
  };
  const entries = await Promise.all(requested.map(async key => [key, await check(identity + ':' + key, async signal => {
    if (key === 'srv_mixdrop' || key === 'srv_streamtape') {
      // One lookup per batch, with its own shared deadline (not one provider's abort signal).
      catalog ||= json(origin + '/api/encontrei-lookup?' + new URLSearchParams({ tmdb_id: id, type, season: String(season), episode: String(episode), name }), AbortSignal.timeout(4000));
      const found = await catalog;
      const fileId = found[key === 'srv_mixdrop' ? 'mixdrop' : 'streamtape'];
      if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) return { state: 'unknown', reason: 'catalog_unconfirmed' };
      const resolved = key === 'srv_mixdrop'
        ? await json(origin + '/api/md-stream?' + new URLSearchParams({ url: `https://mxdrop.top/e/${fileId}`, format: 'json' }), signal)
        : await json(origin + '/api/streamtape-resolve?' + new URLSearchParams({ fileId }), signal);
      return probeHealthMedia(localMedia(resolved.proxyUrl || resolved.videoUrl, ['/api/md-proxy', '/api/streamtape-stream']), signal);
    }
    if (key === 'srv_nixplay') {
      let mediaUrl = `https://nixplay.lat/movie/testelogado-vods/GwXanZ3Dj/${id}.mp4`;
      if (type === 'tv') {
        const resolved = await json(origin + '/api/nixplay-episode-id?' + new URLSearchParams({ seriesId: nixId || id, season: String(season), episode: String(episode) }), signal);
        mediaUrl = resolved.nixplayUrl;
      }
      const parsed = new URL(mediaUrl);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'nixplay.lat' || !/^\/(movie|series)\//.test(parsed.pathname)) throw new Error('Unexpected Nixplay source');
      return probeHealthMedia(origin + '/api/nixplay-proxy?' + new URLSearchParams({ url: mediaUrl }), signal);
    }
    const watchUrl = type === 'tv' ? `https://v1.watchplay.shop/tvshow/${id}/${episode > 50 ? 1 : season}/${episode}` : `https://v1.watchplay.shop/movie/${id}`;
    const url = key === 'srv_vip'
      ? origin + '/api/myembed-stream?' + params + (nixId ? '&series_id=' + nixId : '')
      : origin + '/api/watchplayer-stream?' + new URLSearchParams({ url: watchUrl });
    const response = await fetch(url, { signal });
    const html = new TextDecoder().decode(await readHealthPrefix(response, 256 * 1024));
    if (response.status === 404 || response.status === 410) return { state: 'unavailable', reason: 'not_found' };
    if (!response.ok) return { state: 'unknown', reason: 'upstream_' + response.status };
    if (/type:\s*["'](?:WATCHPLAY_UNAVAILABLE|VIP_UNAVAILABLE)["']/.test(html)) return { state: 'unavailable', reason: 'resolver_unavailable' };
    const source = html.match(/var hlsUrl\s*=\s*["']([^"']+)["']/)?.[1];
    if (!source) return { state: 'unknown', reason: 'requires_player' };
    return probeHealthMedia(localMedia(source, ['/api/stream-proxy', '/api/hls-proxy', '/api/watchplayer-proxy', '/api/anime/hls-proxy', '/api/live-stream-proxy']), signal);
  })]));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ identity: `${type}:${id}:${type === 'tv' ? `${season}:${episode}` : ''}`, servers: Object.fromEntries(entries) });
});

export default router;
