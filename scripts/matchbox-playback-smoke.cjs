// Local browser regression: REAL VideoPlayerModal + NetflixPlayerSkin,
// controlled API/player boundary. No Firebase account or production writes.
const http = require('node:http');
const esbuild = require('esbuild');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/workspace/.onboarding/browser-tools/node_modules/playwright-core');
  const bundle = await esbuild.build({
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{VideoPlayerModal}from'./src/components/VideoPlayerModal';createRoot(document.getElementById('root')).render(<VideoPlayerModal isOpen onClose={()=>{}} title="Matchbox - O Filme" mediaType="movie" tmdbId={1148365} imdbId="tt28498219" defaultUrl="https://v1.watchplay.shop/movie/tt28498219"/>);`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'import.meta.env.VITE_PROXY_URL': '""', 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false' },
    plugins: [{ name: 'offline-firebase', setup(b) {
      b.onResolve({ filter: /(?:^|\/)firebase$/ }, args => args.path === 'firebase' ? undefined : ({ path: 'offline', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const auth={currentUser:null};export const db=null;export const storage=null;export const app=null;' }));
    } }],
  });
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://local');
    if (u.pathname === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
    if (u.pathname === '/app.css') { res.setHeader('Content-Type','text/css');return res.end(fs.readFileSync(path.join('dist/assets',fs.readdirSync('dist/assets').find(p=>p.endsWith('.css'))))); }
    res.setHeader('Content-Type', 'text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const results = [];
  try {
    for (const scenario of (process.env.SMOKE_SCENARIOS || 'slow,fallback,exhausted').split(',')) {
      const page = await browser.newPage(process.env.SMOKE_MOBILE ? {viewport:{width:390,height:844},isMobile:true,hasTouch:true} : {});const frames = [];const errors=[];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => {window.__statuses=[];window.addEventListener('message',e=>{if(e.data?.type==='WATCHPLAY_STATUS')window.__statuses.push(e.data)});});
      await page.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.origin !== base) return route.abort();
        const json = data => route.fulfill({json:data});
        if (u.pathname === '/api/playback-candidates') return json({identity:'movie:1148365:',servers:{srv_saimo:{listed:true,audioPriority:0},srv_saimo_mp4:{listed:true,audioPriority:0},srv_streamtape:{listed:true,audioPriority:0}}});
        if (u.pathname === '/api/playback-health') return json({identity:'movie:1148365:',servers:Object.fromEntries((u.searchParams.get('servers')||'').split(',').map(k=>[k,{state:['srv_saimo_mp4','srv_streamtape'].includes(k)?'available':'unavailable',checkedAt:Date.now(),reason:'fixture',mediaKind:'mp4'}]))});
        if (u.pathname === '/api/server-blocks') return json({blockedServerKeys:[]});
        if (u.pathname.startsWith('/api/tmdb/')) return json({id:1148365,title:'Matchbox - O Filme',imdb_id:'tt28498219',genres:[],seasons:[],belongs_to_collection:null});
        if (u.pathname.includes('proxy-iframe') || u.pathname === '/api/md-stream' || u.pathname === '/api/watchplayer-stream' || u.pathname === '/api/myembed-stream') {
          frames.push(u.pathname);
          const fail = scenario==='exhausted'||(scenario==='fallback'&&u.pathname.includes('saimo'));
          const delay = scenario==='slow'?8500:200;
          return route.fulfill({contentType:'text/html',body:`<script>
          let t=0,paused=false,ready=false;
          const send=()=>parent.postMessage({type:'WATCHPLAY_STATUS',currentTime:t,duration:ready?120:0,paused:!ready||paused,buffering:!ready,readyState:ready?4:0,buffered:ready?100:0,playerFrameUrl:location.href},'*');
          send();
          ${fail?`setTimeout(()=>parent.postMessage({type:'WATCHPLAY_ERROR',reason:'fixture-unavailable',playerFrameUrl:location.href},'*'),3500);`:`setTimeout(()=>{ready=true;setInterval(()=>{if(!paused)t+=.5;send()},500)},${delay});`}
          addEventListener('message',e=>{if(e.data?.type==='PAUSE')paused=true;if(e.data?.type==='PLAY')paused=false});
          <\/script>`});
        }
        if (u.pathname.startsWith('/api/')) return json({success:false,available:false,episodes:[],results:[]});
        return route.continue();
      });
      try {
        await page.goto(base,{waitUntil:'domcontentloaded'});
        if (scenario==='exhausted') {
          await page.waitForFunction(()=>/Nenhuma fonte|Não foi possível iniciar|Conteúdo indisponível|ainda não está disponível/.test(document.body.innerText),{},{timeout:45000});
          const count=frames.length;await page.waitForTimeout(3000);assert.equal(frames.length,count,'exhausted chain must stay stopped');
          assert.equal(new Set(frames).size,frames.length,'failed providers must not repeat before exhaustion');
        } else {
          await page.waitForFunction(()=>window.__statuses.some(s=>s.currentTime>=2),{},{timeout:25000});
          assert.ok(frames[0]?.includes('saimo'),'starts at listed Saimo');
          if(scenario==='slow')assert.equal(frames.length,1,'must not abandon slow functional source');
          else assert.ok(frames.some(x=>x.includes('streamtape')),'must advance to StreamTape');
          assert.equal(new Set(frames).size,frames.length,'must not revisit failed providers');
          assert.ok(await page.locator('button').count()>0,'real skin has controls');
          await page.mouse.move(100,100);
          await page.getByTitle('Pausar',{exact:true}).click();
          await page.waitForFunction(()=>window.__statuses.at(-1)?.paused===true,{},{timeout:3000});
          await page.getByTitle('Reproduzir',{exact:true}).click();
          await page.waitForFunction(()=>window.__statuses.at(-1)?.paused===false,{},{timeout:3000});
        }
        assert.deepEqual(errors,[]);
        results.push({scenario,passed:true,frames});console.log(JSON.stringify(results.at(-1)));
      } finally {await page.close();}
    }
  } finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
  fs.mkdirSync('scratch',{recursive:true});fs.writeFileSync(process.env.SMOKE_MOBILE?'scratch/matchbox-modal-smoke-mobile.json':'scratch/matchbox-modal-smoke.json',JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
