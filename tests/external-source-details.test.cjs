const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const esbuild=require('esbuild');
test('admin source details preserve indices and never disclose credentials or URLs',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tv-details-'));
 const old=process.env.EXTERNAL_CATALOG_DIR;process.env.EXTERNAL_CATALOG_DIR=dir;
 try{
 fs.writeFileSync(path.join(dir,'external-channels.txt'),'canal: N SPORTS\nfonte: https://cdn.example/live/SECRET/PASSWORD/1.m3u8\nqualidade: HD\nfonte: 9:123\nfonte: https://cdn.example/dash.mpd\nchave: secret-key\n');
 const built=await esbuild.build({entryPoints:['server/services/externalCatalog.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
 const filename=path.join(process.cwd(),'tests/virtual-source-details.cjs');
 const m=new Module(filename,module);m.filename=filename;m.paths=module.paths;m._compile(built.outputFiles[0].text,filename);
 assert.equal(typeof m.exports.getExternalSourceDetails,'function');
 const result=m.exports.getExternalSourceDetails('N SPORTS');
 assert.equal(result.sources.length,3);
 assert.deepEqual(result.sources.map(s=>s.index),[0,1,2]);
 assert.equal(result.sources[0].host,'cdn.example');
 assert.equal(result.sources[0].state,'untested');
 assert.equal(result.sources[1].state,'unavailable');
 assert.equal(result.sources[2].state,'unsupported');
 assert.doesNotMatch(JSON.stringify(result),/SECRET|PASSWORD|secret-key|https:|\.m3u8/);
 assert.equal(m.exports.getExternalSourceDetails('Not listed'),null);
 m.exports.recordExternalSelection('N SPORTS','https://cdn.example/live/SECRET/PASSWORD/1.m3u8');
 assert.ok(m.exports.getExternalSourceDetails('N SPORTS').sources[0].lastSelectedAt);
 assert.equal(await m.exports.testExternalSource('N SPORTS',99),null);
 const unsupported=await m.exports.testExternalSource('N SPORTS',2);
 assert.equal(unsupported.state,'unsupported');
 fs.writeFileSync(path.join(dir,'external-channels.txt'),'canal: Private\nfonte: http://127.0.0.1/secret\n');
 m.exports.clearExternalCatalogCache();
 const blocked=await m.exports.testExternalSource('Private',0);
 assert.equal(blocked.state,'blocked');
 // A large upstream catalogue must not be capped at the 40 bundled entries.
 fs.writeFileSync(path.join(dir,'external-channels.txt'),Array.from({length:325},(_,i)=>`canal: Canal Extra ${i}\nfonte: https://cdn.example/SECRET/PASSWORD/${i}.m3u8\n`).join(''));
 m.exports.clearExternalCatalogCache();
 assert.equal(typeof m.exports.getPublicLiveChannels,'function');
 const full=m.exports.getPublicLiveChannels();
 assert.equal(full.filter(c=>c.id.startsWith('saimo-')).length,325);
 assert.equal(new Set(full.map(c=>c.id)).size,full.length);
 assert.ok(full.some(c=>c.id==='premiere-1'));
 assert.doesNotMatch(JSON.stringify(full),/SECRET|PASSWORD/);
 const identity=full.find(c=>c.name==='Canal Extra 2').id;
 fs.appendFileSync(path.join(dir,'external-channels.txt'),'canal: Novo Canal\nfonte: https://cdn.example/live.m3u8\n');
 m.exports.clearExternalCatalogCache();
 assert.equal(m.exports.getPublicLiveChannels().find(c=>c.name==='Canal Extra 2').id,identity);
 }finally{if(old===undefined)delete process.env.EXTERNAL_CATALOG_DIR;else process.env.EXTERNAL_CATALOG_DIR=old;fs.rmSync(dir,{recursive:true,force:true})}
});
