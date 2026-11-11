const {test}=require('node:test'),assert=require('node:assert/strict');
const esbuild=require('esbuild'),Module=require('node:module'),path=require('node:path');
const express=require('express'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const fs=require('node:fs/promises'),os=require('node:os');
const root=process.cwd();
async function load(entry,fixture=false){const out=await esbuild.build({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:fixture?[{name:'no-auth-session',setup(b){b.onResolve({filter:/services\/firebase$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const auth={currentUser:null};'}));}}]:[]});const name=path.join(process.cwd(),'tests/virtual-admin-blocks.cjs');const m=new Module(name,module);m.paths=module.paths;m._compile(out.outputFiles[0].text,name);return m.exports;}
test('admin renders independent Saimo variants and AnimesDigital controls',async()=>{
 const {ServerBlocksAdmin}=await load('src/components/ServerBlocksAdmin.tsx',true);
 const html=renderToStaticMarkup(React.createElement(ServerBlocksAdmin));
 for(const label of ['Saimo Play HD','Saimo Turbo','AnimesDigital'])assert.ok(html.includes(label),label+' must be selectable');
});
test('POST validation accepts new player keys while still rejecting unknown keys',async()=>{
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='test';
 const router=(await load('server/routes/serverBlocks.ts')).default;
 const app=express();app.use(express.json());app.use(router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{for(const key of ['srv_saimo_hls','srv_saimo_mp4','srv_anidigital','srv_vizer','srv_unknown']){
  const r=await fetch(`http://127.0.0.1:${server.address().port}/api/admin/server-blocks`,{method:'POST',headers:{'Content-Type':'application/json','x-admin-token':'system-seed'},body:JSON.stringify({tmdbId:1,serverKey:key,contentType:'invalid'})});
  assert.equal(r.status,400);const d=await r.json();assert.match(d.error,['srv_unknown','srv_vizer'].includes(key)?/serverKey inválido/:/contentType/);
 }}finally{server.closeAllConnections();await new Promise(r=>server.close(r));if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});

test('new servers can be saved, read by the player and individually unblocked',async()=>{
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='test';
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'admin-blocks-test-'));
 process.chdir(dir);
 let server;
 try{
  const router=(await load(path.join(root,'server/routes/serverBlocks.ts'))).default;
  const app=express();app.use(express.json());app.use(router);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const keys=['srv_saimo_hls','srv_saimo_mp4','srv_anidigital'];
  for(const serverKey of keys){const r=await fetch(base+'/api/admin/server-blocks',{method:'POST',headers:{'Content-Type':'application/json','x-admin-token':'system-seed'},body:JSON.stringify({tmdbId:1,serverKey,contentType:'movie',title:'Fixture',reason:'Teste'})});assert.equal(r.status,200);}
  const read=async()=>new Set((await(await fetch(base+'/api/server-blocks?tmdb_id=1')).json()).blockedServerKeys);
  assert.deepEqual(await read(),new Set(keys));
  const removed=await fetch(base+'/api/admin/server-blocks/1_srv_saimo_hls',{method:'DELETE',headers:{'x-admin-token':'system-seed'}});assert.equal(removed.status,200);
  assert.deepEqual(await read(),new Set(['srv_saimo_mp4','srv_anidigital']));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}process.chdir(root);if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});
