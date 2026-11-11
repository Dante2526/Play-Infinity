const {test}=require('node:test');
const assert=require('node:assert/strict');
const esbuild=require('esbuild');
const Module=require('node:module');
const path=require('node:path');
const build=esbuild.buildSync({entryPoints:['server/routes/vizerRoutes.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
const m=new Module(__filename,module);m.paths=module.paths;m._compile(build.outputFiles[0].text,__filename);
test('current FSHD markup selects dubbed FsPlay instead of the first unrelated player',async()=>{
 const nativeFetch=global.fetch;const calls=[];
 global.fetch=async(raw,opts)=>{
  const u=new URL(raw);calls.push(u.pathname);
  if(u.pathname.startsWith('/filme/'))return new Response(`<script>var CONTENT_INFO = '32260';</script><div class="server-selector" data-id="10" data-lang="2">Abyss</div><div class="server-selector" data-id="20" data-lang="2">FsPlay</div><div class="server-selector" data-id="30" data-lang="1">FsPlay</div>`);
  if(u.pathname==='/api/players'){
   const d=JSON.parse(opts.body);assert.equal(d.content_info,32260);assert.equal(d.video_id,20);assert.equal(d.content_type,'1');
   return Response.json({video_url:'https://fshd.link/player/20'});
  }
  assert.equal(u.pathname,'/player/20');
  return new Response(`<script>window.location.href="https://112234152.xyz/player?data=abcdef1234";</script>`);
 };
 try{const r=await m.exports.resolveVizerHls(1148365,undefined,undefined,false,true);assert.equal(r.masterUrl,'https://112234152.xyz/hls/abcdef1234/master.txt');assert.ok(!calls.includes('/api/options'));}
 finally{global.fetch=nativeFetch;}
});

test('cancelling a health request aborts upstream Vizer resolution',async()=>{
 const nativeFetch=global.fetch;let started;
 const ready=new Promise(r=>started=r);
 global.fetch=async(_,opts)=>new Promise((resolve,reject)=>{
   started();const stop=()=>reject(new DOMException('Cancelled','AbortError'));
   if(opts.signal.aborted)stop();else opts.signal.addEventListener('abort',stop,{once:true});
 });
 const c=new AbortController();
 try{const p=m.exports.resolveVizerHls(1148365,undefined,undefined,false,true,c.signal);await ready;c.abort();await assert.rejects(p,{name:'AbortError'});}
 finally{global.fetch=nativeFetch;}
});
