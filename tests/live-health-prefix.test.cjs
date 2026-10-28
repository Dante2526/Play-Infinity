const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const transpile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
test('live health probe cancels continuous HLS, binary and error responses',async()=>{
 const health=fs.readFileSync('server/services/playbackHealth.ts','utf8');
 const prefix=health.slice(health.indexOf('export async function readHealthPrefix'),health.indexOf('export async function probeHealthMedia'));
 const source=fs.readFileSync('server/routes/iptv.ts','utf8');
 const probe=source.slice(source.indexOf('export async function probeLiveStreamUrl'),source.indexOf('// GET /api/admin/probe-channel'));
 for(const [status,body,online] of [[200,'#EXTM3U\n',true],[200,'binary',false],[502,'error',false]]) {
  let cancelled=false,reads=0;
  const response=new Response(new ReadableStream({pull(c){reads++;c.enqueue(new TextEncoder().encode(body+'x'.repeat(4096)));},cancel(){cancelled=true;}}),{status});
  const exports={};
  vm.runInNewContext(transpile(prefix+'\n'+probe),{exports,process,TextDecoder,Uint8Array,AbortSignal,fetch:async()=>response});
  const result=await exports.probeLiveStreamUrl('/api/external-channel?name=TV');
  assert.equal(result.online,online);
  assert.equal(cancelled,true);
  assert.ok(reads<=2);
 }
});
