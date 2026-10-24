import { Router } from 'express';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { resolveByseStream, allowedByseMediaUrl, buildByseWrapperHtml, rewriteM3u8, BYSE_USER_AGENT } from '../services/byse/core';
import { getByseTickets } from '../services/byse/tickets';
import { getByseSources } from './encontreiLookup';
export function createByseRouter(deps = { resolve: resolveByseStream, sources: getByseSources, tickets: getByseTickets, fetch: (...args: Parameters<typeof fetch>) => fetch(...args) }) {
  const router = Router();
  const proxy = (url: string) => '/api/byse-stream?ticket=' + deps.tickets().seal(url);
  router.get('/api/byse-hls.js', (_req,res) => {
    const require = createRequire(process.cwd() + '/package.json');
    res.type('application/javascript').sendFile(require.resolve('hls.js/dist/hls.min.js'));
  });
  const select = async (query: any) => {
    const id = Number(query.id || 0), season = query.s === undefined ? undefined : Number(query.s), episode = query.e === undefined ? undefined : Number(query.e);
    if (query.id && (!Number.isInteger(id) || id < 1 || (season === undefined) !== (episode === undefined) || (season !== undefined && (!Number.isInteger(season) || season < 1 || season > 999 || !Number.isInteger(episode) || episode! < 1 || episode! > 9999)))) throw new Error('Invalid identity');
    const exclude = String(query.exclude || '').split(',').filter(Boolean);
    const name = String(query.name || '').slice(0,160);
    let sources = id ? await deps.sources(id, season, episode, name) : [{ fileId: String(query.fileId || ''), audio: 'Dublado', source: 'direct' }];
    const tried = new Set<string>();
    for (let pass = 0; pass < (id ? 2 : 1); pass++) {
      for (const source of sources) {
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(source.fileId) || tried.has(source.fileId) || exclude.includes(source.fileId)) continue;
        tried.add(source.fileId);
        try { return { ...(await deps.resolve(source.fileId, query.refresh === '1')), source: source.source }; } catch { /* another copy, then provider fallback */ }
      }
      if (id && pass === 0) sources = await deps.sources(id, season, episode, name, true);
    }
    throw new Error('No available BYSE source');
  };
  router.get(['/api/byse-resolve','/api/byse-proxy-iframe'], async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const resolved = await Promise.race([select(req.query), new Promise<never>((_,reject) => { timer = setTimeout(()=>reject(new Error('timeout')),45000); })]);
      const proxyUrl = proxy(resolved.m3u8);
      const identity = new URLSearchParams();
      for (const field of ['id','s','e','name']) if (req.query[field]) identity.set(field,String(req.query[field]));
      identity.set('fileId',resolved.fileId);
      if (req.path === '/api/byse-resolve') return res.json({success:true,fileId:resolved.fileId,source:resolved.source,proxyUrl,iframeUrl:'/api/byse-proxy-iframe?'+identity,expiresIn:Math.max(0,Math.floor((resolved.expiresAt-Date.now())/1000))});
      let html = buildByseWrapperHtml(proxyUrl, resolved.fileId, Math.max(0, Number(req.query.t) || 0));
      const renewal = '/api/byse-resolve?' + identity;
      // One bounded renewal on manifest failure. The next error reaches the modal.
      html = html.replace('var fatalReported = false;', `var fatalReported = false; var renewalAttempted = false;`);
      html = html.replace('function reportFatal(reason) {', `function reportFatal(reason) {
        if (!renewalAttempted) {
          renewalAttempted = true; var position=v.currentTime||initialSeek||0; var paused=v.paused;
          var ctl=new AbortController();var deadline=setTimeout(function(){ctl.abort()},45000);
          fetch(${JSON.stringify(renewal)}+'&refresh=1',{signal:ctl.signal,cache:'no-store'}).then(function(r){if(!r.ok)throw Error('resolve');return r.json()}).then(function(data){
            if(!data.proxyUrl)throw Error('source'); streamUrl=data.proxyUrl;
            v.addEventListener('loadedmetadata',function(){v.currentTime=position;if(!paused)v.play().catch(function(){})},{once:true});startHls();
          }).catch(function(){reportFatal(reason)}).finally(function(){clearTimeout(deadline)}); return;
        }`);
      html=html.replace(/type: "WATCHPLAY_ERROR",/g, 'type: "WATCHPLAY_ERROR", byseExhausted: true,');
      res.type('html').send(html);
    } catch {
      if (req.path === '/api/byse-resolve') return res.status(502).json({success:false,error:'BYSE indisponível para este conteúdo.'});
      res.status(502).type('html').send('<html><body style="background:#000;color:white"><p>BYSE temporariamente indisponível.</p><script>window.parent.postMessage({type:"WATCHPLAY_ERROR",reason:"BYSE indisponível",byseExhausted:true},"*")</script></body></html>');
    } finally { clearTimeout(timer); }
  });
  router.get('/api/byse-stream', async (req,res) => {
    let url: string;
    try { url = deps.tickets().open(String(req.query.ticket || '')); if (!allowedByseMediaUrl(url)) throw new Error('host'); }
    catch { return res.status(400).end('Recurso BYSE inválido.'); }
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
        return res.type('application/vnd.apple.mpegurl').send(rewriteM3u8(body,url,proxy));
      }
      res.status(upstream.status);
      for(const field of ['content-type','content-length','content-range','accept-ranges']){const value=upstream.headers.get(field);if(value)res.setHeader(field,value)}
      const stream=Readable.fromWeb(upstream.body as any);stream.on('data',()=>arm(20000));arm(20000);
      await new Promise<void>(resolve=>{stream.once('end',resolve);stream.once('error',()=>{res.destroy();resolve()});res.once('close',()=>{stream.destroy();resolve()});stream.pipe(res)});
    } catch {if(res.headersSent)res.destroy();else res.status(502).end('Falha no recurso BYSE.');}
    finally {stop();res.off('close',stop);req.off('aborted',stop)}
  });
  return router;
}
export default createByseRouter();
