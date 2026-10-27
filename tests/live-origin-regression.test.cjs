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
