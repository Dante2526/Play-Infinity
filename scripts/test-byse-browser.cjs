// Local integration smoke: generated HLS media + actual NetflixPlayerSkin + Chromium.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),Module=require('node:module');
const {execFileSync}=require('node:child_process');const esbuild=require('esbuild'),express=require('express'),{chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const realId=process.env.BYSE_REAL_FILE_ID; if(realId&&!/^[a-zA-Z0-9_-]{1,100}$/.test(realId))throw Error('Invalid BYSE_REAL_FILE_ID');
 const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'byse-browser-'));
 if(!realId) execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-t','18','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-g','48','-f','hls','-hls_time','2','-hls_list_size','0',path.join(tmp,'master.m3u8')]);
 const output=await esbuild.build({stdin:{contents:"export * from './server/routes/byseRoutes';export * from './server/services/byse/tickets';export {resolveByseStream} from './server/services/byse/core';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'source-fixture',setup(b){b.onResolve({filter:/encontreiLookup$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getByseSources=async()=>[];'}))}}]});
 const m=new Module(path.join(root,'scripts/virtual-browser.cjs'),module);m.filename=path.join(root,'scripts/virtual-browser.cjs');m.paths=module.paths;m._compile(output.outputFiles[0].text,m.filename);const api=m.exports;
 const client=await esbuild.build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {NetflixPlayerSkin} from './src/components/NetflixPlayerSkin';function App(){const ref=React.useRef(null);return <><iframe ref={ref} src=${JSON.stringify('/api/byse-proxy-iframe?fileId='+encodeURIComponent(realId||'fixture'))} style={{position:'fixed',inset:0,width:'100%',height:'100%'}}/><NetflixPlayerSkin title='BYSE — teste sintético' isSeries={false} iframeRef={ref} onClose={()=>{}} onSkipIntro={()=>{}} skipDurationSeconds={75} isIntroActive={false} isFullscreen={false} onToggleFullscreen={()=>{}} activeServerKey='srv_byse' serversList={[{key:'srv_byse',label:'BYSE HD'}]}/></>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},bundle:true,platform:'browser',write:false,define:{'import.meta.env':'{}'},plugins:[{name:'metadata-fixtures',setup(b){b.onResolve({filter:/services\/(playbackHistory|tmdb)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const savePlaybackProgress=()=>{};export const getTimelinePreviewImages=async()=>[];'}))}}]});
 const tickets=api.createByseTickets(crypto.randomBytes(32));let expired=false,first=false,resolves=0;
 const app=express();app.get('/',(_,res)=>res.send('<html><head><link rel="stylesheet" href="/test.css"></head><body style="background:black;color:white"><div id="root"></div><script src="/test.js"></script></body></html>'));const assets=path.join(root,'dist/assets');const css=process.env.BYSE_TEST_CSS||path.join(assets,fs.readdirSync(assets).find(x=>/^index.*\.css$/.test(x)));app.get('/test.css',(_,res)=>res.sendFile(css));app.get('/test.js',(_,res)=>res.type('js').send(client.outputFiles[0].text));
 app.get('/expire',(_,res)=>{expired=true;first=true;res.end('ok')});
 app.use(api.createByseRouter({tickets:()=>tickets,sources:async()=>[],resolve:async (fileId,refresh)=>{resolves++;if(realId){if(refresh)expired=false;try{const value=await api.resolveByseStream(fileId,refresh);console.log(JSON.stringify({phase:'resolved',cdnHost:new URL(value.m3u8).hostname}));return value}catch(error){console.log(JSON.stringify({phase:'resolve-failed',error:String(error.message).slice(0,200)}));throw error}}if(expired){if(first)first=false;else expired=false}return{fileId,m3u8:'https://r66nv9ed.com/master.m3u8',resolvedAt:Date.now(),expiresAt:Date.now()+1200000}},fetch:async (raw,options)=>{
  if(realId){if(expired&&String(raw).includes(".m3u8"))return new Response("Simulated local failure",{status:503});return fetch(raw,options);}
  const name=path.basename(new URL(raw).pathname);if(expired&&name==='master.m3u8')return new Response('',{status:403});
  return new Response(fs.readFileSync(path.join(tmp,name)),{headers:{'content-type':name.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t'}});
 }}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
  for(const profile of ['desktop','android-emulated']) {
  const page=await browser.newPage(profile==='desktop'?{}:{viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'});let popups=0;page.on('popup',()=>popups++);const foreign=[];page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))foreign.push(new URL(r.url()).hostname)});
  await page.goto(base);const frame=()=>page.frames().find(f=>f.url().includes('/api/byse-proxy-iframe'));
  await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('video')?.currentTime>1,{},{timeout:realId?60000:20000});
  const size=page.viewportSize();await page.mouse.move(5,5);await page.mouse.move(size.width/2,size.height/2);
  await page.locator('[title="Pausar"]').click();await frame().waitForFunction(()=>document.querySelector('video').paused);const at=await frame().evaluate(()=>document.querySelector('video').currentTime);
  await page.locator('[title="Avançar 10s"]').click();await frame().waitForFunction(t=>document.querySelector('video').currentTime>t+8,at,{timeout:realId?20000:5000});
  await page.locator('[title="Reproduzir"]').click();await frame().waitForFunction(()=>!document.querySelector('video').paused);
  let soak;
  const soakMs=Math.min(600000,Math.max(0,Number(process.env.BYSE_SOAK_MS)||0));
  if(realId&&profile==='desktop'&&soakMs){
    const began=Date.now();let previous=await frame().evaluate(()=>document.querySelector('video').currentTime);let frozen=0;
    await frame().evaluate(()=>{window.__soak={waits:0,waitingAt:0,waitingMs:0};const v=document.querySelector('video');v.addEventListener('waiting',()=>{window.__soak.waits++;window.__soak.waitingAt=Date.now()});v.addEventListener('playing',()=>{if(window.__soak.waitingAt)window.__soak.waitingMs+=Date.now()-window.__soak.waitingAt;window.__soak.waitingAt=0;});});
    while(Date.now()-began<soakMs){
      await page.waitForTimeout(Math.min(10000,soakMs-(Date.now()-began)));
      const sample=await frame().evaluate(()=>{const v=document.querySelector('video');return {time:v.currentTime,error:v.error?.code||0,frames:v.getVideoPlaybackQuality().totalVideoFrames,paused:v.paused}});
      assert.equal(sample.error,0);frozen=sample.time>previous+.2?0:frozen+1;assert.ok(frozen<3,'Playback stopped advancing for 30s');previous=sample.time;
      console.log(JSON.stringify({phase:'continuous-playback',seconds:Math.round((Date.now()-began)/1000),...sample}));
    }
    soak=await frame().evaluate(()=>window.__soak);delete soak.waitingAt;
  }
  const decoded=await frame().evaluate(()=>document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames);assert.ok(decoded>0);assert.equal(popups,0);assert.deepEqual(foreign,[]);
  if(!realId||process.env.BYSE_FORCE_RENEWAL==='1'){await page.request.get(base+'/expire');await page.goto(base);await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('video')?.currentTime>1,{},{timeout:30000});assert.ok(resolves>=3);}
  console.log(JSON.stringify({profile,skin:'NetflixPlayerSkin real',media:realId?'real BYSE CDN':'synthetic H264 HLS',decodedFrames:decoded,pause:true,seek:true,resume:true,expiredManifestRenewed:realId?(process.env.BYSE_FORCE_RENEWAL==='1'?'renewed after injected local failure':'not exercised'):true,naturalExpiry:'not exercised',popups,foreignRequests:foreign,resolves,soak}));await page.close();
  }
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
