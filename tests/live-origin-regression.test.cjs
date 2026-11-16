const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
test('published web player ignores a localhost build variable',()=>{
 const text=fs.readFileSync('src/components/LivePlayerModal.tsx','utf8');
 const expression=text.match(/const proxyBase = ([^;]+);/)[1]
   .replaceAll('import.meta.env.DEV','false')
   .replaceAll('import.meta.env.VITE_PROXY_URL','"http://localhost:3000"');
 const result=vm.runInNewContext(expression,{Capacitor:{isNativePlatform:()=>false}});
 assert.equal(result,'');
 const native=vm.runInNewContext(expression,{Capacitor:{isNativePlatform:()=>true}});
 assert.equal(native,'https://play-infinity.stream');
});
test('Byte accepts a working backup and stops checking after success',async()=>{
 const source=fs.readFileSync('server/services/liveChannelProbe.ts','utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={}; vm.runInNewContext(js,{exports});
 const calls=[];
 const result=await exports.probeChannelServers([{url:'dead'},{url:'good'},{url:'unused'}],async url=>{calls.push(url);return {online:url==='good',statusCode:url==='good'?200:502}});
 assert.equal(result.online,true);assert.deepEqual(calls,['dead','good']);
 const dead=await exports.probeChannelServers([{url:'dead'}],async()=>({online:false,statusCode:502}));
 assert.equal(dead.online,false);
 const recovered=await exports.probeChannelServers([{url:'throws'},{url:'good'}],async url=>{
   if(url==='throws')throw Error('timeout');
   return {online:true,statusCode:200};
 });
 assert.equal(recovered.online,true);
});

test('SBT HD uses dynamic /api/saimo-source servers instead of expired hardcoded embedTV hash or 403 source=1',()=>{
 const channelsSrc=fs.readFileSync('src/data/liveChannels.ts','utf8');
 const sbtBlockMatch=channelsSrc.match(/id:\s*'sbt'[\s\S]*?servers:\s*\[([\s\S]*?)\]\s*\}/);
 assert.ok(sbtBlockMatch,'Bloco do canal sbt deve existir em liveChannels.ts');
 const sbtServers=sbtBlockMatch[1];
 assert.ok(!sbtServers.includes('8f246fdcdd11e03e7750ed4f8e050161'),'Hash morto do embedTV não deve voltar para SBT HD');
 assert.ok(!sbtServers.includes('channel=sbt&source=1'),'source=1 (138.204.86.4) retorna 403 na VPS Oracle');
 assert.ok(sbtServers.includes('/api/saimo-source?channel=sbt&source=2'),'Deve incluir sbt oficial via /api/saimo-source');
 assert.ok(sbtServers.includes('/api/saimo-source?channel=sbtsp&source=2'),'Deve incluir sbtsp FHD via /api/saimo-source');
 assert.ok(sbtServers.includes('/api/saimo-source?channel=sbtsp&source=1'),'Deve incluir sbtsp embedTV rotativo via /api/saimo-source');
});
