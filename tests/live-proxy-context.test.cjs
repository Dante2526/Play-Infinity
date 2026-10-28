const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('server/routes/videoScrapers.ts','utf8').split('router.get("/api/live-stream-proxy"')[1].split('// Healthcheck')[0];
test('only explicit segment requests bypass initial TS manifest',()=>{
 const expression=source.match(/const isExplicitSegment = ([^;]+);/)[1];
 for(const query of [{},{is_segment:'false'},{is_manifest:'true'}]) {
  assert.equal(vm.runInNewContext(expression,{req:{query},rawUrl:'https://cdn.example/live.ts?token=1'}),false);
 }
 assert.equal(vm.runInNewContext(expression,{req:{query:{is_segment:'true'}}}),true);
});
test('rewritten variants, segments and tag URIs retain agent and referer',()=>{
 const block=source.slice(source.indexOf('const isMasterManifest ='),source.indexOf('const rewrittenBuffer ='));
 for(const lines of [['#EXTM3U','#EXT-X-STREAM-INF:BANDWIDTH=100','child.m3u8'],['#EXTM3U','#EXT-X-KEY:METHOD=AES-128,URI="key"','#EXTINF:6,','part.ts']]) {
  const out=vm.runInNewContext(block+';rewritten',{filteredLines:lines,finalUrl:'https://cdn.example/live/index.m3u8',refererParam:'&referer=https%3A%2F%2Fsite.example',agenteParam:'&agente=Custom%2F1',signProxyUrl:()=> 'signature',URL,encodeURIComponent});
  for(const match of out.matchAll(/\/api\/live-stream-proxy[^"\n]+/g)) {
   const url=new URL(match[0],'https://app.example');
   assert.equal(url.searchParams.get('agente'),'Custom/1');
   assert.equal(url.searchParams.get('referer'),'https://site.example');
  }
 }
});
test('external redirect preserves provider agent',()=>{
 const s=fs.readFileSync('server/routes/externalRoutes.ts','utf8');
 const block=s.slice(s.indexOf('const params = new URLSearchParams();'),s.indexOf('} else {',s.indexOf('const params = new URLSearchParams();')));
 const result=vm.runInNewContext('let target;'+block+';target',{URLSearchParams,resolved:{url:'http://cdn.example/live.ts',agente:'Custom/1',referer:'https://site.example'},signProxyUrl:()=> 'signature'});
 assert.equal(new URL(result,'https://app.example').searchParams.get('agente'),'Custom/1');
});
test('synthetic TS playlist retains headers and marks its child as segment',()=>{
 const block=source.slice(source.indexOf('const seq = Math.floor'),source.indexOf('return res.send(manifest);'));
 const out=vm.runInNewContext(block+';manifest',{Date,finalUrl:'https://cdn.example/live.ts?token=1',agenteParam:'&agente=Custom%2F1',req:{query:{referer:'https://site.example'}},signProxyUrl:()=> 'signature',encodeURIComponent});
 const child=new URL(out.split('\n').at(-1),'https://app.example');
 assert.equal(child.searchParams.get('is_segment'),'true');
 assert.equal(child.searchParams.get('agente'),'Custom/1');
 assert.equal(child.searchParams.get('referer'),'https://site.example');
});
