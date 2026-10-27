const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const esbuild=require('esbuild');
test('web loads the full catalogue once for concurrent consumers and keeps old list on failure',async()=>{
 const output=await esbuild.build({entryPoints:['src/services/liveCatalogue.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'native-fixture',setup(p){p.onResolve({filter:/^@capacitor\/core$/},()=>({path:'capacitor',namespace:'fixture'}));p.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const Capacitor={isNativePlatform:()=>false};'}))}}]});
 const filename=path.join(process.cwd(),'tests/virtual-live-catalogue.cjs');const m=new Module(filename,module);m.filename=filename;m.paths=module.paths;m._compile(output.outputFiles[0].text,filename);
 const oldFetch=global.fetch,oldNow=Date.now;let calls=0,now=100000;
 const channels=Array.from({length:325},(_,i)=>({id:'saimo-'+i,name:'Canal '+i,servers:[{url:'/api/external-channel?name='+i}]}));
 try{
 Date.now=()=>now;
 global.fetch=async url=>{calls++;assert.equal(url,'/api/live-channels');return Response.json({success:true,channels});};
 const results=await Promise.all([m.exports.fetchLiveCatalogue(),m.exports.fetchLiveCatalogue()]);
 assert.equal(calls,1);assert.equal(results[0].length,325);assert.equal(m.exports.getLiveCatalogue().length,325);
 now+=61000;global.fetch=async()=>{throw Error('network failure')};
 await assert.rejects(m.exports.fetchLiveCatalogue(),/network failure/);
 assert.equal(m.exports.getLiveCatalogue().length,325);
 }finally{global.fetch=oldFetch;Date.now=oldNow}
});
