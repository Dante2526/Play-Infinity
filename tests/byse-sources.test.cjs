const {test}=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),Module=require('node:module'),path=require('node:path');
const out=esbuild.buildSync({entryPoints:[path.join(__dirname,'../server/services/byse/sources.ts')],bundle:true,platform:'node',format:'cjs',write:false});const m=new Module(__filename+'.compiled',module);m._compile(out.outputFiles[0].text,__filename);const {createByseSourcePool}=m.exports;
const sources=[{fileId:'slow',source:'encontrei',audio:'Dublado'},{fileId:'fast',source:'vizer',audio:'Dublado'}];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('BYSE selects faster valid manifest, counts active requests and excludes failed copies',async()=>{
 const pool=createByseSourcePool({resolve:async id=>'https://r66nv9ed.com/'+id+'.m3u8',fetch:async url=>{await delay(String(url).includes('slow')?50:1);return new Response('#EXTM3U\n#EXTINF:6,\nsegment.ts')}});
 assert.equal((await pool.select(sources)).fileId,'fast');const done=pool.begin('fast');assert.equal((await pool.select(sources)).fileId,'slow');done();done();assert.equal((await pool.select(sources)).fileId,'fast');assert.equal((await pool.select(sources,['fast'])).fileId,'slow');
});
test('BYSE shares probes, prioritizes PT-BR, refreshes invalid manifests and rejects foreign redirects',async()=>{
 let resolves=0,probes=0;
 const pool=createByseSourcePool({resolve:async(id,refresh)=>{resolves++;return 'https://r66nv9ed.com/'+(refresh?'fresh':id)+'.m3u8'},fetch:async url=>{probes++;return String(url).includes('bad')?new Response('HTML'):new Response('#EXTM3U\nvariant.m3u8')}});
 const dubbed=[{fileId:'bad',source:'encontrei',audio:'Dublado'},{fileId:'other',source:'vizer',audio:'Legendado'}];
 const picks=await Promise.all(Array.from({length:5},()=>pool.select(dubbed)));assert.ok(picks.every(x=>x.fileId==='bad'));assert.equal(resolves,2);assert.equal(probes,2);
 pool.refresh('bad');await pool.select(dubbed);assert.equal(resolves,3);
 const foreign=createByseSourcePool({resolve:async()=> 'https://r66nv9ed.com/x.m3u8',fetch:async()=>new Response(null,{status:302,headers:{location:'https://evil.invalid/x'}})});assert.equal(await foreign.select(sources),null);
});
test('BYSE bounds slow probes and deduplicates identical catalogue IDs',async()=>{
 let probes=0;const pool=createByseSourcePool({timeoutMs:30,resolve:async()=> 'https://r66nv9ed.com/x.m3u8',fetch:async(_,options)=>{probes++;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))))}});
 assert.equal(await pool.select([sources[0],{...sources[0],source:'vizer'}]),null);assert.equal(probes,1);
});
