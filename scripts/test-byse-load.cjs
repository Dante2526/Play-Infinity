// Bounded production smoke/load test. No cache deletion, SSH changes or raw tickets in output.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const base=process.env.BYSE_LOAD_BASE||'https://play-infinity.stream';
const output=process.env.BYSE_LOAD_OUTPUT||'/tmp/byse-load-result.json';
const {chromium}=require('playwright-core');
const percentile=(values,q)=>{const v=[...values].sort((a,b)=>a-b);return v[Math.max(0,Math.ceil(v.length*q)-1)]??null};
function safeProxy(raw){const u=new URL(raw,base);assert.equal(u.origin,new URL(base).origin);assert.equal(u.pathname,'/api/byse-stream');return u.href;}
async function resolve(fileId){const start=performance.now();try{
 const r=await fetch(base+'/api/byse-resolve?'+new URLSearchParams({fileId,refresh:'1'}),{signal:AbortSignal.timeout(55000)});
 const d=await r.json().catch(()=>({}));return {fileId,status:r.status,latencyMs:Math.round(performance.now()-start),ok:r.ok&&d.success===true,proxyUrl:r.ok&&d.proxyUrl?safeProxy(d.proxyUrl):undefined,error:r.ok?undefined:(r.status===429?'rate_limited':'upstream_or_resolution_failure')};
}catch(e){return {fileId,status:0,latencyMs:Math.round(performance.now()-start),ok:false,error:e.name==='TimeoutError'?'client_timeout':'transport_failure'}}}
async function decode(browser,item){
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:320,height:180}});let phase='setup';const network=[];page.on('response',r=>{if(r.status()>=400)network.push({status:r.status(),path:new URL(r.url()).pathname});});
 try{
  await page.route(base+'/__byse_load_probe',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><video muted playsinline></video><script src="/api/byse-hls.js"></script></body></html>'}));
  await page.goto(base+'/__byse_load_probe',{timeout:20000,waitUntil:'load'});phase='playback';
  await page.evaluate(url=>{const v=document.querySelector('video');window.errors=[];v.addEventListener('error',()=>window.errors.push('media'));if(window.Hls?.isSupported()){window.hls=new Hls({maxBufferLength:4,maxMaxBufferLength:8,backBufferLength:0,enableWorker:true});hls.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal)window.errors.push({type:d.type,details:d.details,status:d.response?.code||null})});hls.loadSource(url);hls.attachMedia(v);}else v.src=url;v.play().catch(()=>{});},item.proxyUrl);
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v.currentTime>.25&&v.getVideoPlaybackQuality().totalVideoFrames>0},{},{timeout:30000});
  return {decoded:true,...await page.evaluate(()=>{const v=document.querySelector('video');return{frames:v.getVideoPlaybackQuality().totalVideoFrames,seconds:+v.currentTime.toFixed(2)}})};
 }catch{return {decoded:false,error:phase==='setup'?'browser_setup_failed':'no_decoded_frames_within_30s',mediaErrors:await page.evaluate(()=>window.errors||[]).catch(()=>[]),network};}
 finally{await page.evaluate(()=>{window.hls?.destroy();const v=document.querySelector('video');v?.pause();}).catch(()=>{});await page.close();}
}
(async()=>{
 assert.match(base,/^https?:\/\//);const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/encontrei-catalog.json')));
 const unique=[...new Set([...catalog.movies,...catalog.episodes].map(x=>x.servers?.byse).filter(x=>/^[a-zA-Z0-9_-]{1,100}$/.test(x)))].filter(x=>x!=='a4cdcik0li1a');
 // Deterministic spread across the snapshot; do not pre-resolve/warm the selected files.
 const ids=Array.from({length:24},(_,i)=>unique[Math.floor((i+.5)*unique.length/24)]);assert.equal(new Set(ids).size,24);
 const report={startedAt:new Date().toISOString(),base,cacheMode:'refresh=1 per distinct ID; no PM2 restart or global cache flush; attestation may stay warm',pm2Metrics:'unavailable: no VPS credentials/telemetry in this environment',browserTLS:'ignoreHTTPSErrors in test browser only due to execution proxy certificate; no security conclusions',busyRate:'not observable: public 502 conceals internal cause',results:[]};
 const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());report.release=health.codeRelease||health.release;
 const rounds=(process.env.BYSE_LOAD_ROUNDS||'1,8,16').split(',').map(Number);assert.ok(rounds.every(n=>[1,8,16].includes(n))&&rounds.reduce((a,b)=>a+b,0)<=25);
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});let offset=Number(process.env.BYSE_LOAD_OFFSET)||0;assert.ok(offset>=0&&offset+rounds.filter(n=>n!==1).reduce((a,b)=>a+b,0)<=24);
 try{for(const n of rounds){
  const batch=n===1?['a4cdcik0li1a']:ids.slice(offset,offset+n);if(n!==1)offset+=n;
  const started=performance.now();const items=await Promise.all(batch.map(resolve));const successful=items.filter(x=>x.ok);
  console.log(JSON.stringify({phase:'resolved-batch',concurrency:n,resolved:successful.length,failed:n-successful.length}));
  const media=await Promise.all(successful.map(x=>decode(browser,x)));successful.forEach((x,i)=>x.playback=media[i]);
  const metrics={concurrency:n,resolved:successful.length,failed:n-successful.length,rateLimited:items.filter(x=>x.status===429).length,clientTimeouts:items.filter(x=>x.error==='client_timeout').length,decoded:media.filter(x=>x.decoded).length,p50Ms:percentile(items.map(x=>x.latencyMs),.5),p99Ms:percentile(items.map(x=>x.latencyMs),.99),successfulP50Ms:percentile(successful.map(x=>x.latencyMs),.5),successfulP99Ms:percentile(successful.map(x=>x.latencyMs),.99),wallMs:Math.round(performance.now()-started)};
  const publicItems=items.map(({proxyUrl,...rest})=>rest);report.results.push({metrics,items:publicItems});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(metrics));
  // Stop escalation if the smaller burst already has failures, or health degrades.
  const check=await fetch(base+'/api/health',{signal:AbortSignal.timeout(10000)}).catch(()=>null);
  if(!check?.ok||(n===8&&successful.length<4)){report.stoppedEarly='health failure or fewer than half resolved at concurrency 8';break;}
 }}finally{await browser.close();report.finishedAt=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e.name+': '+e.message.replace(/ticket=[^\s]+/g,'ticket=[redacted]'));process.exitCode=1});
