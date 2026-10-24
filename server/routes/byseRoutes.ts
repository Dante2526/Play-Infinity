import { createByseSourcePool } from '../services/byse/sources';
import { Router } from 'express';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { resolveByseStream, allowedByseMediaUrl, buildByseWrapperHtml, rewriteM3u8, BYSE_USER_AGENT } from '../services/byse/core';
import { getByseTickets } from '../services/byse/tickets';
import { getByseSources } from './encontreiLookup';
export function createByseRouter(deps = { resolve: resolveByseStream, sources: getByseSources, tickets: getByseTickets, fetch: (...args: Parameters<typeof fetch>) => fetch(...args) }) {
  const router = Router();
  const pool = createByseSourcePool({resolve:async(id,refresh)=>(await deps.resolve(id,refresh)).m3u8,fetch:deps.fetch});
  const proxy = (url: string, fileId = '') => '/api/byse-stream?ticket=' + deps.tickets().seal(url,fileId);
  router.get('/api/byse-hls.js', (_req,res) => {
    const require = createRequire(process.cwd() + '/package.json');
    res.type('application/javascript').sendFile(require.resolve('hls.js/dist/hls.min.js'));
  });
  const select = async (query: any) => {
    const id = Number(query.id || 0), season = query.s === undefined ? undefined : Number(query.s), episode = query.e === undefined ? undefined : Number(query.e);
    if (query.id && (!Number.isInteger(id) || id < 1 || (season === undefined) !== (episode === undefined) || (season !== undefined && (!Number.isInteger(season) || season < 1 || season > 999 || !Number.isInteger(episode) || episode! < 1 || episode! > 9999)))) throw new Error('Invalid identity');
    if(query.prepared) {
      const media=deps.tickets().openMedia(String(query.prepared));
      const identity=`${season===undefined?'movie':'tv'}:${id}:${season===undefined?'':`${season}:${episode}`}`;
      if(!id||media.context!==identity||!allowedByseMediaUrl(media.url)||!media.fileId)throw Error('Invalid prepared source');
      return {fileId:media.fileId,m3u8:media.url,expiresAt:Date.now()+30000,source:'prepared'};
    }
    const exclude = String(query.exclude || '').split(',').filter(Boolean);
    const name = String(query.name || '').slice(0,160);
    let sources = id ? await deps.sources(id, season, episode, name) : [{ fileId: String(query.fileId || ''), audio: 'Dublado', source: 'direct' as const }];
    const tried = new Set<string>();
    for (let pass=0;pass<(id?2:1);pass++) {
      if(query.refresh==='1')pool.refresh(String(query.fileId||''));
      let selected=await pool.select(sources,exclude);
      if(!selected&&exclude.length&&query.refresh==='1')selected=await pool.select(sources,[]);
      if(selected)return {...selected,m3u8:selected.directUrl,expiresAt:Date.now()+30000};
      for(const source of sources)tried.add(source.fileId);
      if(id&&pass===0)sources=(await deps.sources(id,season,episode,name,true)).filter(source=>!tried.has(source.fileId));
    }
    throw new Error('No available BYSE source');
  };
  router.get(['/api/byse-resolve','/api/byse-proxy-iframe'], async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const resolved = await Promise.race([select(req.query), new Promise<never>((_,reject) => { timer = setTimeout(()=>reject(new Error('timeout')),45000); })]);
      const proxyUrl = proxy(resolved.m3u8,resolved.fileId);
      const identity = new URLSearchParams();
      for (const field of ['id','s','e','name']) if (req.query[field]) identity.set(field,String(req.query[field]));
      identity.set('fileId',resolved.fileId);
      if (req.path === '/api/byse-resolve') return res.json({success:true,fileId:resolved.fileId,source:resolved.source,proxyUrl,iframeUrl:'/api/byse-proxy-iframe?'+identity,expiresIn:Math.max(0,Math.floor((resolved.expiresAt-Date.now())/1000))});
      let html = buildByseWrapperHtml(proxyUrl, resolved.fileId, Math.max(0, Number(req.query.t) || 0));
      const renewalIdentity=new URLSearchParams(identity);renewalIdentity.delete('fileId');
      const renewal = '/api/byse-resolve?' + renewalIdentity;
      // One bounded renewal on manifest failure. The next error reaches the modal.
      html = html.replace('var fatalReported = false;', `var fatalReported = false; var renewalAttempted = false; var currentFileId = ${JSON.stringify(resolved.fileId)};`);
      html = html.replace('function reportFatal(reason, resume) {', `function reportFatal(reason, resume) {
        if (renewing) return;
        if (resume) renewalAttempted = false;
        if (!renewalAttempted) {
          renewalAttempted = true;
          var position=resume ? pausedPosition : (v.currentTime||pausedPosition||initialSeek||0);
          desiredPaused = resume ? false : v.paused; renewing=true;
          var ctl=new AbortController();var deadline=setTimeout(function(){ctl.abort()},45000);
          fetch(${JSON.stringify(renewal)}+'&refresh=1&fileId='+encodeURIComponent(currentFileId)+(resume?'':'&exclude='+encodeURIComponent(currentFileId)),{signal:ctl.signal,cache:'no-store'}).then(function(r){if(!r.ok)throw Error('resolve');return r.json()}).then(function(data){
            if(!data.proxyUrl)throw Error('source'); streamUrl=data.proxyUrl;if(data.fileId)currentFileId=data.fileId;
            initialSeek=position;appliedInitial=false;
            v.addEventListener('loadedmetadata',function(){
              v.currentTime=position;renewing=false;pausedAt=null;
              if(!desiredPaused)v.play().catch(function(){});else v.pause();
            },{once:true});startHls();
          }).catch(function(){renewing=false;reportFatal(reason)}).finally(function(){clearTimeout(deadline)}); return;
        }`);
      html=html.replace(/type: "WATCHPLAY_ERROR",/g, 'type: "WATCHPLAY_ERROR", byseExhausted: true,');
      res.type('html').send(html);
    } catch {
      if (req.path === '/api/byse-resolve') return res.status(502).json({success:false,error:'BYSE indisponível para este conteúdo.'});
      res.status(502).type('html').send('<html><body style="background:#000;color:white"><p>BYSE temporariamente indisponível.</p><script>window.parent.postMessage({type:"WATCHPLAY_ERROR",reason:"BYSE indisponível",byseExhausted:true},"*")</script></body></html>');
    } finally { clearTimeout(timer); }
  });
  router.get('/api/byse-stream', async (req,res) => {
    let url: string, fileId = "";
    try { const media=deps.tickets().openMedia(String(req.query.ticket || '')); url=media.url;fileId=media.fileId; if (!allowedByseMediaUrl(url)) throw new Error('host'); }
    catch { return res.status(400).end('Recurso BYSE inválido.'); }
    const done=pool.begin(fileId);
    const ctl = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (ms: number) => {clearTimeout(timer);timer=setTimeout(()=>ctl.abort(),ms)};
    const stop = () => {clearTimeout(timer);ctl.abort()}; res.once('close',stop);req.once('aborted',stop);
    try {
      let upstream: globalThis.Response | undefined;
      const range = req.headers.range;
      if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return res.status(416).end();
      arm(8000);
      for (let hop=0;hop<4;hop++) {
        if (!allowedByseMediaUrl(url)) throw new Error('redirect');
        upstream = await deps.fetch(url,{redirect:'manual',signal:ctl.signal,headers:{'User-Agent':BYSE_USER_AGENT,'Accept-Encoding':'identity',...(range?{Range:range}:{})}});
        if (upstream.status<300 || upstream.status>=400) break;
        const location=upstream.headers.get('location');await upstream.body?.cancel();if(!location||hop===3)throw new Error('redirect');url=new URL(location,url).href;
      }
      if (!upstream?.ok || !upstream.body || /text\/html|application\/json/i.test(upstream.headers.get('content-type')||'')) throw new Error('upstream');
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Accel-Buffering','no');
      if (/\.m3u8(?:\?|$)/i.test(url) || /mpegurl/i.test(upstream.headers.get('content-type')||'')) {
        const reader=upstream.body.getReader();const chunks:Uint8Array[]=[];let size=0;
        try {while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>512*1024)throw new Error('size');chunks.push(part.value);arm(8000)}}finally{await reader.cancel().catch(()=>{})}
        const body=Buffer.concat(chunks).toString();if(!body.trimStart().startsWith('#EXTM3U'))throw new Error('playlist');
        return res.type('application/vnd.apple.mpegurl').send(rewriteM3u8(body,url,target=>proxy(target,fileId)));
      }
      res.status(upstream.status);
      for(const field of ['content-type','content-length','content-range','accept-ranges']){const value=upstream.headers.get(field);if(value)res.setHeader(field,value)}
      const stream=Readable.fromWeb(upstream.body as any);stream.on('data',()=>arm(20000));arm(20000);
      await new Promise<void>(resolve=>{stream.once('end',resolve);stream.once('error',()=>{res.destroy();resolve()});res.once('close',()=>{stream.destroy();resolve()});stream.pipe(res)});
    } catch {pool.report(fileId,false);if(res.headersSent)res.destroy();else res.status(502).end('Falha no recurso BYSE.');}
    finally {done();stop();res.off('close',stop);req.off('aborted',stop)}
  });
  return router;
}
export default createByseRouter();
