import { getByseTickets } from '../services/byse/tickets';
import { getPlaybackCataloguePresence, getByseSources } from './encontreiLookup';
import { hasWarmByseStream, getWarmByseStream, resolveByseStream } from '../services/byse/core';
import { Router } from 'express';
import { isServerBlacklisted } from '../../src/data/serverBlacklist';
import { createPlaybackHealthCache, probeHealthMedia, readHealthPrefix } from '../services/playbackHealth';

const byseWarmups = new Set<string>();
const providers = new Set(['srv_streamtape', 'srv_mixdrop', 'srv_watchplay', 'srv_vip', 'srv_nixplay','srv_byse']);
const check = createPlaybackHealthCache();
const router = Router();

let activeDiscovery=0;
const discovery=new Map<string,{expires:number,promise:Promise<any>}>();
router.get('/api/playback-candidates',async(req,res)=>{
  const id=Number(req.query.id),type=String(req.query.type),s=Number(req.query.s),e=Number(req.query.e);
  if(!Number.isInteger(id)||id<1||!['movie','tv'].includes(type)||(type==='tv'&&(!Number.isInteger(s)||s<1||s>999||!Number.isInteger(e)||e<1||e>9999)))return res.status(400).json({error:'Invalid content'});
  let hints=getPlaybackCataloguePresence(id,type==='tv'?s:undefined,type==='tv'?e:undefined);
  const name=String(req.query.name||'').slice(0,160),key=`${type}:${id}:${s}:${e}`;
  if(name&&(req.query.refresh==='1'||!Object.values(hints).some(v=>v.listed))){
    const cached=discovery.get(key);let task=cached&&cached.expires>Date.now()?cached.promise:undefined;
    if(!task&&discovery.size<500&&activeDiscovery<4){
      activeDiscovery++;
      task=getByseSources(id,type==='tv'?s:undefined,type==='tv'?e:undefined,name,true).catch(()=>[]).finally(()=>{activeDiscovery--});
      discovery.set(key,{expires:Date.now()+30000,promise:task});
    }
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{const sources=await Promise.race([task||Promise.resolve([]),new Promise<any[]>(r=>{timer=setTimeout(()=>r([]),800)})]);
      hints=getPlaybackCataloguePresence(id,type==='tv'?s:undefined,type==='tv'?e:undefined);
      if(sources.length)hints.srv_byse={audioPriority:sources.some((v:any)=>/dublad|pt[-_ ]?br|nacional/i.test(v.audio||''))?0:1,listed:true,fileIds:sources.map((v:any)=>v.fileId)};
    }finally{clearTimeout(timer);}
    for(const [k,v] of discovery)if(v.expires<Date.now())discovery.delete(k);
  }
  res.setHeader('Cache-Control','no-store');
  res.json({identity:`${type}:${id}:${type==='tv'?`${s}:${e}`:''}`,servers:Object.fromEntries(Object.entries(hints).map(([key,value])=>[key,{listed:value.listed,audioPriority:value.audioPriority,warm:key!=='srv_byse'||value.fileIds.some(hasWarmByseStream)}]))});
});

router.get('/api/playback-health' , async (req, res) => {
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
  const selected = req.query.startup === '1' ? requested.slice(0,2) : requested.filter(key=>key!=='srv_byse');
  const entries = await Promise.all(selected.map(async key => [key, await check(identity + ':' + key, async signal => {
    if(key==='srv_byse') {
      const hints=getPlaybackCataloguePresence(Number(id),type==='tv'?season:undefined,type==='tv'?episode:undefined);
      if(!hints.srv_byse.fileIds.some(hasWarmByseStream)) {
        const fileId = hints.srv_byse.fileIds[0];
        if (fileId && byseWarmups.size < 2 && !byseWarmups.has(fileId)) {
          byseWarmups.add(fileId);
          void resolveByseStream(fileId).catch(()=>{}).finally(()=>byseWarmups.delete(fileId));
        }
        return {state:'unknown',reason:'cold_resolution'};
      }
      const cached=hints.srv_byse.fileIds.map(getWarmByseStream).find(Boolean);
      if(!cached)return {state:'unknown',reason:'cold_resolution'};
      const context=`${type}:${id}:${type==='tv'?`${season}:${episode}`:''}`;
      const prepared=getByseTickets().seal(cached.m3u8,cached.fileId,context);
      const result=await probeHealthMedia(origin+'/api/byse-stream?ticket='+encodeURIComponent(prepared),signal);
      const iframeParams=new URLSearchParams({id,name,prepared});if(type==='tv'){iframeParams.set('s',String(season));iframeParams.set('e',String(episode));}
      return {...result,...(result.state==='available'?{iframeUrl:'/api/byse-proxy-iframe?'+iframeParams}: {})};
    }
    if (key === 'srv_mixdrop' || key === 'srv_streamtape') {
      let resolved;
      if (key === 'srv_streamtape') {
        const identity = new URLSearchParams({ id, name });
        if (type === 'tv') { identity.set('s', String(season)); identity.set('e', String(episode)); }
        resolved = await json(origin + '/api/streamtape-resolve?' + identity, signal);
      } else {
        const identity = new URLSearchParams({ id, name, format: 'json' });
        if (type === 'tv') { identity.set('s', String(season)); identity.set('e', String(episode)); }
        resolved = await json(origin + '/api/md-stream?' + identity, signal);
      }
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
