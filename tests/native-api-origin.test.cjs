const {test}=require('node:test');
const assert=require('node:assert/strict');
const esbuild=require('esbuild');
const vm=require('node:vm');
test('Lupin Android uses public API despite localhost build configuration',async()=>{
 const build=await esbuild.build({entryPoints:['src/services/episodeAvailability.ts'],bundle:true,platform:'browser',format:'cjs',write:false,define:{'import.meta.env.VITE_PROXY_URL':'"http://localhost:3000"'}});
 for(const native of [true,false]) {
  const calls=[];const exports={}; const mod={exports};
  vm.runInNewContext(build.outputFiles[0].text,{module:mod,exports,window:{Capacitor:{isNativePlatform:()=>native},location:{protocol:'https:'}},console,Date,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:async url=>{calls.push(url);return {ok:true,json:async()=>({success:true,seasons:[1,2,3,4]})}}});
  const result=await mod.exports.getAvailableSeasonsForSeries(96677,[1,2,3]);
  assert.deepEqual(Array.from(result),[1,2,3,4]);
  assert.ok(calls[0].startsWith(native?'https://play-infinity.stream/api/':'/api/'));
  assert.ok(!calls[0].includes('localhost'));
 }
});
