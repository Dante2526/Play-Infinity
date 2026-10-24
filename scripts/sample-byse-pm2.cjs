// Run on the VPS while the load test executes. Outputs selected metrics only,
// never pm2_env, secrets or the full jlist. No process restart/config changes.
const {execFile}=require('node:child_process');
const duration=Math.min(600,Math.max(5,Number(process.argv[2])||180));
const started=Date.now();let stopped=false,timer;
process.once('SIGINT',()=>{stopped=true;clearTimeout(timer)});
function sample(){execFile(process.env.PM2_BIN||'pm2',['jlist'],{timeout:5000,maxBuffer:10*1024*1024},(error,stdout)=>{
 if(error){console.error('Could not read PM2 metrics');process.exitCode=1;return;}
 try{const apps=JSON.parse(stdout).filter(x=>x.name==='play-infinity-app');console.log(JSON.stringify({at:new Date().toISOString(),workers:apps.map(x=>({id:x.pm_id,pid:x.pid,status:x.pm2_env?.status,cpuPercent:x.monit?.cpu??null,rssBytes:x.monit?.memory??null}))}));}
 catch{console.error('Invalid PM2 metrics response');process.exitCode=1;return;}
 if(!stopped&&Date.now()-started<duration*1000)timer=setTimeout(sample,1000);
});}sample();
