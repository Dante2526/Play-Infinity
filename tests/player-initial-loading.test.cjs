const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('skin keeps loading for empty paused status and permits ready paused media',()=>{
 const src=fs.readFileSync('src/components/NetflixPlayerSkin.tsx','utf8');
 const expression=src.match(/buffering: (data.buffering[^\n]+),/)[1];
 for(const [data,expected] of [[{duration:0,currentTime:0,paused:true,buffering:false,readyState:0},true],[{duration:120,currentTime:0,paused:true,buffering:false,readyState:2},false],[{duration:0,currentTime:0,paused:true,buffering:false,readyState:2},false]]){
 assert.equal(vm.runInNewContext(expression,{data,prev:{duration:0,currentTime:0}}),expected);
 }
});
test('internal status treats unattached paused video as loading',()=>{
 for(const file of ['server/services/byse/core.ts','server/routes/streamtapeRoutes.ts','server/routes/videoScrapers.ts']) {
 const src=fs.readFileSync(file,'utf8');
 const expression=src.match(/buffering: ([^\n\r]+),/)[1];
 assert.equal(vm.runInNewContext(expression,{v:{readyState:0,duration:0,currentTime:0,paused:true}}),true,file);
 assert.equal(vm.runInNewContext(expression,{v:{readyState:4,duration:120,currentTime:30,paused:true}}),false,file);
 }
});
