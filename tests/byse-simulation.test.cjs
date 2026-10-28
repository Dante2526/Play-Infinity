const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm');
const esbuild=require('esbuild');
const nativeFetch=global.fetch;let api;
beforeEach(async()=>{
 const root=path.resolve(__dirname,'..');
 const out=await esbuild.build({stdin:{contents:"export * from './server/services/byse/core'; export * from './server/services/byse/pow';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false});
 const m=new Module(path.join(root,'tests/virtual-byse.cjs'),module);m.filename=path.join(root,'tests/virtual-byse.cjs');m.paths=module.paths;m._compile(out.outputFiles[0].text,m.filename);api=m.exports;
});
afterEach(()=>{global.fetch=nativeFetch});
function chain({tamper=false,foreign=false,alternatives=false}={}){
 const calls=[];let nonce='simulation-nonce';
 global.fetch=async(raw,opts)=>{
  const url=new URL(raw);calls.push(url.pathname);
  if(url.pathname.endsWith('/details'))return Response.json({embed_frame_url:'https://n1mwq.org/e/simulation'});
  if(url.pathname.endsWith('/challenge'))return Response.json({nonce,challenge_id:'challenge'});
  if(url.pathname.endsWith('.m3u8')) return url.pathname.includes('bad') ? new Response('down',{status:503}) : new Response('#EXTM3U\n#EXTINF:6,\npart.ts');
  const data=JSON.parse(opts.body||'{}');
  if(url.pathname.endsWith('/attest')){
   const pub=crypto.createPublicKey({key:data.public_key,format:'jwk'});
   assert.equal(crypto.verify('sha256',Buffer.from(nonce),pub,Buffer.from(data.signature,'base64url')),true);
   return Response.json({token:'attest',device_id:'device',confidence:.55});
  }
  if(url.pathname.endsWith('/captcha'))return Response.json({pow_nonce:'nonce',pow_difficulty:0,pow_token:'pow'});
  if(url.pathname.endsWith('/verify')){assert.equal(data.solution,'0');return Response.json({status:'ok',token:'clearance'})}
  assert.equal(opts.headers['X-Captcha-Token'],'clearance');
  const parts=Array.from({length:32},()=>crypto.randomBytes(16));const key=Buffer.concat([parts[0],parts[29]]);const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const ct=Buffer.concat([cipher.update(JSON.stringify({sources:alternatives?[{h:720,url:'https://r66nv9ed.com/master.m3u8'},{h:1080,url:'https://r66nv9ed.com/bad.m3u8'}]:[{url:foreign?'https://unrelated.invalid/master.m3u8':'https://r66nv9ed.com/master.m3u8'}]})),cipher.final()]);
  const payload=Buffer.concat([ct,cipher.getAuthTag()]);if(tamper)payload[0]^=1;
  return Response.json({playback:{version:1,key_parts:parts.map(b=>b.toString('base64url')),iv:iv.toString('base64url'),payload:payload.toString('base64url')}});
 };return calls;
}
test('simulated full chain verifies a real ECDSA signature, captcha clearance and AES-GCM playback',async()=>{
 const calls=chain();const result=await api.resolveByseStream('episode4');assert.equal(result.m3u8,'https://r66nv9ed.com/master.m3u8');assert.equal(calls.length,7);
});
test('simultaneous viewers share the complete resolution; refresh obtains a new result',async()=>{
 const calls=chain();await Promise.all(Array.from({length:12},()=>api.resolveByseStream('episode4')));assert.equal(calls.length,7);
 await api.resolveByseStream('episode4');assert.equal(calls.length,7);await api.resolveByseStream('episode4',true);assert.equal(calls.length,12);
});
test('tampered encrypted payload cannot become playable media',async()=>{chain({tamper:true});await assert.rejects(api.resolveByseStream('episode4'),/Nenhuma fonte HLS/)});
test('decrypted foreign media URL is rejected',async()=>{chain({foreign:true});await assert.rejects(api.resolveByseStream('episode4'),/Nenhuma fonte HLS/)});
test('JSON errors and removed files do not produce successful playback or permanent failure cache',async()=>{
 global.fetch=async()=>new Response('Unavailable',{status:404});await assert.rejects(api.resolveByseStream('episode4'));
 chain();assert.ok((await api.resolveByseStream('episode4')).m3u8);
});
test('master, relative variant, keys and init segments stay behind the HLS proxy',()=>{
 const text='#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\nvariant/index.m3u8';
 const result=api.rewriteM3u8(text,'https://r66nv9ed.com/path/master.m3u8','/api/byse-stream');assert.equal((result.match(/\/api\/byse-stream\?url=/g)||[]).length,3);
});
test('unknown segment and encryption key hosts are rejected instead of returned to the browser',()=>{
 for(const body of ['#EXTM3U\nhttps://unrelated.invalid/ad.ts','#EXTM3U\n#EXT-X-KEY:URI="https://unrelated.invalid/key"'])assert.throws(()=>api.rewriteM3u8(body,'https://r66nv9ed.com/master.m3u8','/api/byse-stream'),/não autorizado/);
});
test('catalogue contains real BYSE movie and episode mappings without network access',()=>{
 const d=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/encontrei-catalog.json')));const movies=d.movies.filter(x=>x.servers?.byse),eps=d.episodes.filter(x=>x.servers?.byse);
 assert.equal(movies.length,6694);assert.equal(eps.length,27670);assert.ok(eps.every(x=>x.tmdb_id&&x.season&&x.episode));
 const seen=new Map();for(const ep of eps){const key=`${ep.tmdb_id}:${ep.season}:${ep.episode}`;if(!seen.has(key))seen.set(key,ep.servers.byse)}assert.ok(seen.size>20000);
});
test('real PoW vector is solved in a worker while the main event loop remains responsive',async()=>{
 let beats=0;const timer=setInterval(()=>beats++,10);try{assert.equal(await api.solveBysePowAsync('8a955406a383e64aa0c521333dd07fdc',16,10000),'27717');assert.ok(beats>2)}finally{clearInterval(timer)}
});
test('PoW rejects invalid work and expires expensive jobs without inline fallback',async()=>{
 assert.equal(await api.solveBysePowAsync('n',NaN),null);assert.equal(await api.solveBysePowAsync('n',99),null);assert.equal(await api.solveBysePowAsync('n',24,1),null);
});
test('native HLS wrapper responds to Netflix skin commands and emits playback status without provider scripts',()=>{
 const html=api.buildByseWrapperHtml('/api/byse-stream?ticket=opaque','episode4',100);
 assert.doesNotMatch(html,/window\.open|<iframe|https:\/\/.*<script/);assert.match(html,/src="\/api\/byse-hls.js"/);
 const listeners={},messages=[],winListeners={};const parent={postMessage:x=>messages.push(x)};
 const v={currentTime:0,readyState:1,duration:900,paused:true,muted:false,volume:1,buffered:{length:0},addEventListener:(k,f)=>(listeners[k]||=[]).push(f),canPlayType:()=>true,play(){this.paused=false;return Promise.resolve()},pause(){this.paused=true}};
 const window={parent,addEventListener:(k,f)=>winListeners[k]=f};let status;
 const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];vm.runInNewContext(script,{window,document:{getElementById:()=>v},setInterval:f=>status=f});
 listeners.loadedmetadata[0]();assert.equal(v.currentTime,100);
 const command=data=>winListeners.message({source:parent,data});command({type:'PAUSE'});assert.equal(v.paused,true);command({type:'SEEK_ABSOLUTE',time:300});assert.equal(v.currentTime,300);command({type:'SET_MUTED',muted:true});assert.equal(v.muted,true);status();assert.equal(messages.at(-1).type,'WATCHPLAY_STATUS');
});

test('higher-quality HLS failure falls back to the next valid source',async()=>{
 const calls=chain({alternatives:true});const result=await api.resolveByseStream('fallbackVideo');
 assert.equal(result.m3u8,'https://r66nv9ed.com/master.m3u8');
 assert.ok(calls.indexOf('/bad.m3u8')<calls.indexOf('/master.m3u8'));
});
