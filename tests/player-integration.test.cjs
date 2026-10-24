const {test}=require('node:test');
const assert=require('node:assert/strict');
const esbuild=require('esbuild');
const Module=require('node:module');
const path=require('node:path');
const compiled=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/utils/playerIntegration.ts')],bundle:true,platform:'node',format:'cjs',write:false});
const m=new Module(__filename+'.fixture',module);m._compile(compiled.outputFiles[0].text,__filename+'.fixture');
const {isExternalIframePlayer}=m.exports;
test('BYSE wrapper keeps Netflix controls on initial selection and episode transitions',()=>{
 for(const url of ['/api/byse-proxy-iframe?id=213375&s=1&e=1','/api/byse-proxy-iframe?id=213375&s=1&e=2&start=42','https://play-infinity.stream/api/byse-proxy-iframe?fileId=a4cdcik0li1a'])assert.equal(isExternalIframePlayer(url),false);
});
test('existing integrated players keep controls and external players retain pass-through',()=>{
 for(const url of ['/api/streamtape-proxy-iframe?fileId=x','/api/md-stream?url=x','/api/native-player?url=x','/api/watchplayer-stream?id=1'])assert.equal(isExternalIframePlayer(url),false);
 assert.equal(isExternalIframePlayer('https://example.org/embed/1'),true);
 assert.equal(isExternalIframePlayer('/api/byse-proxy-iframe?id=1','https://upns.xyz/embed/1'),true);
});

test('BYSE is primary while explicit choices, saved preferences and admin exclusions are respected',()=>{
 const choose=m.exports.preferredPlaybackServer;
 assert.equal(choose(['srv_streamtape','srv_byse','srv_mixdrop']),'srv_byse');
 assert.equal(choose(['srv_byse','srv_mixdrop'],null,'srv_mixdrop'),'srv_mixdrop');
 assert.equal(choose(['srv_byse','srv_mixdrop'],'srv_byse','srv_mixdrop'),'srv_byse');
 assert.equal(choose(['srv_streamtape','srv_mixdrop'],'blocked'),'srv_streamtape');
});
