const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');const esbuild=require('esbuild'),express=require('express');
let api,server,base,mode='ok',calls=[];const nativeFetch=global.fetch;
before(async()=>{
 const root=path.resolve(__dirname,'..');const out=await esbuild.build({stdin:{contents:"export * from './server/routes/byseRoutes';export * from './server/services/byse/tickets';export {isServerBlacklisted} from './src/data/serverBlacklist';",loader:'ts',resolveDir:root},bundle:true,platform:'node',packages:'external',format:'cjs',write:false,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/encontreiLookup$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getByseSources=async()=>[];'}))}}]});
 const m=new Module(path.join(root,'tests/virtual-byse-routes.cjs'),module);m.filename=path.join(root,'tests/virtual-byse-routes.cjs');m.paths=module.paths;m._compile(out.outputFiles[0].text,m.filename);api=m.exports;
 const tickets=api.createByseTickets(crypto.randomBytes(32));const app=express();app.use(api.createByseRouter({
  tickets:()=>tickets,
  sources:async(id,s,e)=>{calls.push({id,s,e});return [{fileId:'missing',source:'encontrei',audio:'Dublado'},{fileId:'working',source:'vizer',audio:'Dublado'}]},
  resolve:async fileId=>{if(fileId==='missing')throw Error('removed');return{fileId,m3u8:'https://r66nv9ed.com/master.m3u8?token=secret',resolvedAt:Date.now(),expiresAt:Date.now()+1200000}},
  fetch:async(url,options)=>{
   calls.push({url,range:options.headers.Range});
   if(mode==='redirect')return new Response(null,{status:302,headers:{location:'https://unrelated.invalid/private'}});
   if(mode==='html')return new Response('<html>advertisement</html>',{headers:{'content-type':'text/html'}});
   if(String(url).includes('master.m3u8'))return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1920x1080\nvariant.m3u8?token=secret',{headers:{'content-type':'application/vnd.apple.mpegurl'}});
   if(String(url).includes('variant.m3u8'))return new Response('#EXTM3U\n#EXT-X-MAP:URI="init.mp4?token=secret"\n#EXTINF:6,\nsegment.ts?token=secret\n#EXT-X-ENDLIST');
   return new Response(new Uint8Array([0x47,1,2,3]),{status:206,headers:{'content-type':'video/mp2t','content-range':'bytes 0-3/4','content-length':'4'}});
 } }));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))});
const resolve=async()=>await(await nativeFetch(base+'/api/byse-resolve?id=213375&s=1&e=4')).json();
test('BYSE is unblocked while other prohibited providers remain blocked',()=>{assert.equal(api.isServerBlacklisted('srv_byse'),false);assert.equal(api.isServerBlacklisted('srv_superflix'),true)});
test('JSON route falls back to Vizer for the exact episode and never exposes signed URLs',async()=>{
 calls=[];const data=await resolve();assert.equal(data.fileId,'working');assert.equal(data.source,'vizer');assert.deepEqual(calls[0],{id:213375,s:1,e:4});assert.doesNotMatch(JSON.stringify(data),/secret|r66nv9ed/);
});
test('simulated playback traverses master, 1080p variant, init and segment through opaque same-origin tickets',async()=>{
 const data=await resolve();const master=await(await nativeFetch(base+data.proxyUrl)).text();assert.match(master,/1920x1080/);assert.doesNotMatch(master,/secret|r66nv9ed/);
 const variant=master.split('\n').find(x=>x.startsWith('/api/'));const list=await(await nativeFetch(base+variant)).text();assert.doesNotMatch(list,/secret|r66nv9ed/);
 const init=list.match(/URI="([^"]+)"/)[1];const segment=list.split('\n').find(x=>x.startsWith('/api/'));
 for(const url of [init,segment]){const response=await nativeFetch(base+url,{headers:{Range:'bytes=0-3'}});assert.equal(response.status,206);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[0x47,1,2,3]);}
});
test('player uses local HLS library and Netflix messages, carries resume time and has a bounded renewal',async()=>{
 const html=await(await nativeFetch(base+'/api/byse-proxy-iframe?id=213375&s=1&e=4&t=612')).text();assert.match(html,/initialSeek = 612/);assert.match(html,/WATCHPLAY_STATUS/);assert.match(html,/renewalAttempted/);assert.match(html,/byseExhausted/);assert.doesNotMatch(html,/secret|window\.open|<iframe|jsdelivr/);
 assert.equal((await nativeFetch(base+'/api/byse-hls.js')).status,200);
});
test('forged tickets, raw URLs and invalid episode identities are rejected',async()=>{
 assert.equal((await nativeFetch(base+'/api/byse-stream?url=https://r66nv9ed.com/x.ts')).status,400);assert.equal((await nativeFetch(base+'/api/byse-stream?ticket=forged')).status,400);
 const data=await resolve();assert.equal((await nativeFetch(base+data.proxyUrl+'x')).status,400);
});
test('redirects to unrelated hosts and false HTML playlists are never passed to the player',async()=>{
 const data=await resolve();mode='redirect';let response=await nativeFetch(base+data.proxyUrl);assert.equal(response.status,502);
 mode='html';response=await nativeFetch(base+data.proxyUrl);assert.equal(response.status,502);mode='ok';
});
test('proxy ticket works across worker instances sharing a key and rejects a different key',()=>{
 const key=crypto.randomBytes(32),a=api.createByseTickets(key),b=api.createByseTickets(key),c=api.createByseTickets(crypto.randomBytes(32));const ticket=a.seal('https://r66nv9ed.com/x.ts');assert.equal(b.open(ticket),'https://r66nv9ed.com/x.ts');assert.throws(()=>c.open(ticket));
});
