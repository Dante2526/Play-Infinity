const {test}=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),Module=require('node:module'),path=require('node:path');
const build=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/services/playbackStartup.ts')],bundle:true,platform:'node',format:'cjs',write:false,define:{'import.meta.env.VITE_PROXY_URL':'""'}});const m=new Module(__filename,module);m._compile(build.outputFiles[0].text,__filename);const api=m.exports;
const input={id:'84958',type:'tv',season:1,episode:4,keys:['srv_byse','srv_streamtape','srv_mixdrop','srv_watchplay'],preferred:'srv_byse'};
const identity='tv:84958:1:4';
const hint=(listed,warm=true)=>({listed,warm});
function fixture(hints,responses){const calls=[];return {calls,fetch:async(raw,{signal})=>{const url=new URL(raw,'https://test');calls.push(url);if(url.pathname.endsWith('candidates'))return Response.json({identity,servers:hints});const key=url.searchParams.get('servers');const item=responses[key];if(item?.wait)await new Promise((r,j)=>{const t=setTimeout(r,item.wait);signal.addEventListener('abort',()=>{clearTimeout(t);j(Error('aborted'))},{once:true})});return Response.json({identity,servers:{[key]:{state:item?.state||'available',checkedAt:Date.now(),reason:'fixture'}}})}}}

test('content exists on 3 and 4: skip 1 and 2, probe only listed and open fastest',async()=>{
 const f=fixture({srv_byse:hint(false,false),srv_streamtape:hint(false),srv_mixdrop:hint(true),srv_watchplay:hint(true)},{srv_mixdrop:{wait:30},srv_watchplay:{wait:1}});const results=[];
 const plan=await api.preparePlaybackStartup(input,new AbortController().signal,h=>results.push(h),f.fetch);
 assert.equal(plan.selected,'srv_watchplay');assert.deepEqual(new Set(plan.candidates),new Set(['srv_mixdrop','srv_watchplay']));assert.equal(f.calls.length,3);assert.ok(f.calls.slice(1).every(x=>['srv_mixdrop','srv_watchplay'].includes(x.searchParams.get('servers'))));
 await new Promise(r=>setTimeout(r,40));assert.equal(results.at(-1).srv_mixdrop.state,'available');
});
test('cold BYSE does not spawn a PoW probe; both cold and warm BYSE stay preferred #1',async()=>{
 const cold=fixture({srv_byse:hint(true,false),srv_streamtape:hint(true),srv_mixdrop:hint(true)},{});
 const p=await api.preparePlaybackStartup(input,new AbortController().signal,()=>{},cold.fetch);assert.equal(p.selected,'srv_byse');assert.equal(p.candidates[0],'srv_byse');assert.ok(!cold.calls.slice(1).some(x=>x.searchParams.get('servers')==='srv_byse'));
 const warm=fixture({srv_byse:hint(true,true),srv_streamtape:hint(true)},{});assert.equal((await api.preparePlaybackStartup(input,new AbortController().signal,()=>{},warm.fetch)).selected,'srv_byse');
});
test('empty stale catalogue remains eligible, failures are not proof of missing content',async()=>{
 const f=fixture({}, {srv_streamtape:{state:'unknown'},srv_mixdrop:{state:'unknown'}});const p=await api.preparePlaybackStartup(input,new AbortController().signal,()=>{},f.fetch);assert.ok(p.candidates.length);assert.ok(f.calls.length<=3);
});
test('cancelled old episode never publishes health or selects an old source',async()=>{
 const c=new AbortController(),f=fixture({srv_mixdrop:hint(true)}, {srv_mixdrop:{wait:30}});let published=0;const pending=api.preparePlaybackStartup(input,c.signal,()=>published++,f.fetch);setTimeout(()=>c.abort(),3);await assert.rejects(pending,{name:'AbortError'});assert.equal(published,0);
});
test('wrong episode identity cannot confirm media for this episode',async()=>{
 const f=fixture({srv_mixdrop:hint(true)},{});const fetcher=async(...args)=>{const r=await f.fetch(...args),d=await r.json();d.identity='tv:84958:1:3';return Response.json(d)};let valid=false;await api.preparePlaybackStartup(input,new AbortController().signal,()=>valid=true,fetcher);assert.equal(valid,false);
});


test('fallback tries only the prepared alternatives once, keeping unlisted servers out of this phase',()=>{
 const health={srv_mixdrop:{state:'available'},srv_watchplay:{state:'available'}};const tried=new Set(['srv_watchplay']);assert.equal(api.nextStartupKey(['srv_watchplay','srv_mixdrop'],tried,health),'srv_mixdrop');tried.add('srv_mixdrop');assert.equal(api.nextStartupKey(['srv_watchplay','srv_mixdrop'],tried,health),undefined);
});

test('a ready subtitled copy does not outrank an available dubbed provider',()=>{
 const keys=api.startupOrder(['srv_byse','srv_streamtape'],{srv_byse:{listed:true,warm:true,audioPriority:2},srv_streamtape:{listed:true,warm:true,audioPriority:0}},'srv_byse');assert.deepEqual(keys,['srv_streamtape']);
});

test('definitive probe failures never open an already unavailable provider',async()=>{
 const f=fixture({srv_streamtape:hint(true),srv_mixdrop:hint(true)},{srv_streamtape:{state:'unavailable'},srv_mixdrop:{state:'unavailable'}});
 const p=await api.preparePlaybackStartup(input,new AbortController().signal,()=>{},f.fetch);assert.equal(p.selected,undefined);
});

test('five seconds of discovery still leaves a full eight seconds after iframe attachment',()=>{
 const clock=api.createStartupMediaClock();assert.equal(clock.remaining('mixdrop-frame',8000,5000),8000);assert.equal(clock.remaining('mixdrop-frame',8000,6000),7000);assert.equal(clock.remaining('mixdrop-frame',8000,13001),100);assert.equal(clock.remaining('next-frame',8000,14000),8000);
});
test('content-routed MixDrop is never reloaded by a late catalogue file ID',()=>{
 assert.equal(api.shouldReloadMixdropFrame('/api/md-stream?id=674&t=4',false),false);assert.equal(api.shouldReloadMixdropFrame('/api/md-stream?id=674&url=https%3A%2F%2Fmxdrop.top%2Fe%2Fmknjxedxixxo8l3',true),false);assert.equal(api.shouldReloadMixdropFrame(null,false),false);assert.equal(api.shouldReloadMixdropFrame('/api/md-stream?url=legacy',false),true);assert.equal(api.shouldReloadMixdropFrame('/api/md-stream?url=legacy',true),false);
});
test('cold BYSE gets 12s with alternatives and 45s as final listed source, without slowing ready alternatives',()=>{
 assert.equal(api.startupMediaLimit('srv_byse',false,false),45000);assert.equal(api.startupMediaLimit('srv_byse',true,false),12000);assert.equal(api.startupMediaLimit('srv_byse',false,true),8000);assert.equal(api.startupMediaLimit('srv_mixdrop',false,false),8000);
});
