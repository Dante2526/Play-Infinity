// Manual browser regression for first boot, delayed chunks and isolated retry.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const client=await esbuild.build({stdin:{resolveDir:root,loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {PageLoading,PlayerLoading,lazyWithRetry} from './src/components/LoadingStates';
 let attempts=0;const params=new URLSearchParams(location.search);const mode=params.get('mode');
 const Loaded=lazyWithRetry(async()=>{attempts++;if(mode==='timeout'||mode==='player')return new Promise(()=>{});const r=await fetch('/chunk?attempt='+attempts);if(!r.ok)throw Error('chunk failed');return {default:()=> <p>Conteúdo pronto</p>};},{player:mode==='player'});
 function App(){const [open,setOpen]=React.useState(true);return <><input aria-label="Estado preservado" defaultValue="não recarregar"/>{open?<React.Suspense fallback={mode==='player'?<PlayerLoading title="Teste" onClose={()=>setOpen(false)}/>:<PageLoading/>}><Loaded onClose={()=>setOpen(false)}/></React.Suspense>:<p>Fechado</p>}</>};createRoot(document.getElementById('root')).render(<App/>);
 `},bundle:true,platform:'browser',write:false});
 const build=process.env.LOADING_BUILD||'/tmp/play-infinity-loading-build';
 const cssFile=fs.readdirSync(path.join(build,'assets')).find(x=>/^index.*\.css$/.test(x));
 let chunkCalls=0;const server=http.createServer((req,res)=>{
  if(req.url==='/boot'){res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.join(root,'index.html')));}
  else if(req.url.startsWith('/src/main.tsx')){res.writeHead(503);res.end();}
  else if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(client.outputFiles[0].text);}
  else if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join(build,'assets',cssFile)));}
  else if(req.url.startsWith('/chunk')){chunkCalls++;res.writeHead(req.url.includes('attempt=1')?503:200);res.end('chunk');}
  else{res.setHeader('Content-Type','text/html');res.end('<html><link rel="stylesheet" href="/app.css"><body style="background:#0a0a0a"><div id="root"></div><script src="/app.js"></script></body></html>');}
 });server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(url+'/boot');await page.locator('#boot-retry:visible').waitFor();assert.ok(await page.locator('#boot-loading').isVisible());
  assert.equal(await page.locator('#boot-loading .boot-bar').first().evaluate(e=>getComputedStyle(e).animationName),'none');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.goto(url+'/?mode=error');await page.getByRole('alert').waitFor();await page.getByLabel('Estado preservado').fill('preservado');await page.getByRole('button',{name:'Tentar novamente'}).click();await page.getByText('Conteúdo pronto').waitFor();assert.equal(await page.getByLabel('Estado preservado').inputValue(),'preservado');
  await page.goto(url+'/?mode=player');await page.getByRole('dialog',{name:'Abrindo player'}).waitFor();await page.getByRole('button',{name:'Fechar'}).click();await page.getByText('Fechado').waitFor();assert.equal(await page.getByRole('dialog').count(),0);
  await page.clock.install();await page.goto(url+'/?mode=timeout');await page.getByRole('status',{name:'Carregando conteúdo'}).waitFor();await page.clock.fastForward(31000);await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('status').count(),0);
  console.log(JSON.stringify({profile:mobile?'mobile-emulated':'desktop',bootFailureVisible:true,retryPreservesState:true,playerClose:true,timeoutShowsError:true,reducedMotion:true}));await page.close();
 }}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 assert.equal(chunkCalls,4);
})().catch(e=>{console.error(e);process.exitCode=1});
