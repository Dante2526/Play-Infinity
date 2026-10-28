const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const esbuild=require('esbuild');
const dns=require('node:dns');
test('probe validates nested targets and redirects and reads complete long URIs',async()=>{
 const build=await esbuild.build({entryPoints:['server/services/externalCatalog.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
 const m=new Module(__filename,module);m.filename=__filename;m.paths=module.paths;m._compile(build.outputFiles[0].text,__filename);
 const originalFetch=global.fetch,lookup=dns.promises.lookup;
 dns.promises.lookup=async()=>[{address:'93.184.216.34',family:4}];
 try {
  for(const kind of ['master','media','redirect']) {
   const calls=[];
   global.fetch=async(url,opts)=>{calls.push(url);assert.equal(opts.redirect,'manual');return kind==='redirect'?new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}):new Response(`#EXTM3U\n${kind==='master'?'#EXT-X-STREAM-INF:BANDWIDTH=100':'#EXTINF:6,'}\nhttp://127.0.0.1/private\n`);};
   assert.equal(await m.exports.probeExternalFonte(`https://93.184.216.34/${kind}.m3u8`),false);
   assert.equal(calls.length,1);
  }
  const uri='https://93.184.216.34/segment.ts?token='+'a'.repeat(4000);
  const calls=[];
  global.fetch=async(url,opts)=>{calls.push(url);if(url===uri)return new Response(new Uint8Array([0x47,0,0]));assert.equal(opts.headers.Range,undefined);return new Response('#EXTM3U\n#EXTINF:6,\n'+uri+'\n');};
  assert.equal(await m.exports.probeExternalFonte('https://93.184.216.34/long.m3u8'),true);
  assert.equal(calls[1],uri);
  let count=0;
  global.fetch=async()=>{count++;return new Response('#EXTM3U\n#EXTINF:6,\nhttps://93.184.216.34/'+'a'.repeat(70000));};
  assert.equal(await m.exports.probeExternalFonte('https://93.184.216.34/oversize.m3u8'),false);
  assert.equal(count,1);
  global.fetch=async()=>new Response(null,{status:302,headers:{location:'http://169.254.169.254/latest'}});
  assert.equal(await m.exports.probeSegmentMagicBytes('https://93.184.216.34/redirect.ts'),false);
 } finally {global.fetch=originalFetch;dns.promises.lookup=lookup;}
});
