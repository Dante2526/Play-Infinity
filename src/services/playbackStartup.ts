import type {ServerHealthMap} from './playbackHealth';
export type StartupInput={id:string;type:'movie'|'tv';season:number;episode:number;name?:string;keys:string[];preferred?:string;nixId?:string;refresh?:boolean};
export type CatalogueHint={listed:boolean;warm:boolean;audioPriority?:number};
export function startupOrder(keys:string[],hints:Record<string,CatalogueHint>,preferred?:string) {
  const listed=keys.filter(k=>hints[k]?.listed);
  const eligible=listed.length?listed:keys;
  const usable=eligible.some(k=>hints[k]?.audioPriority===0)?eligible.filter(k=>hints[k]?.audioPriority!==2):eligible;
  return [...usable].sort((a,b)=>{
    const score=(k:string)=>(hints[k]?.audioPriority??1)*100+(k==='srv_byse'&&!hints[k]?.warm?10:0)+(k===preferred?0:1);
    return score(a)-score(b);
  });
}
const apiOrigin=()=>typeof window!=='undefined'&&(window as any).Capacitor?.isNativePlatform?.()?((import.meta.env.VITE_PROXY_URL as string)||'https://play-infinity.stream'):'';
export async function preparePlaybackStartup(input:StartupInput,signal:AbortSignal,onHealth:(value:ServerHealthMap)=>void,fetcher:typeof fetch=fetch) {
  const identity=`${input.type}:${input.id}:${input.type==='tv'?`${input.season}:${input.episode}`:''}`;
  const params=new URLSearchParams({id:input.id,type:input.type,s:String(input.season),e:String(input.episode),name:input.name||'',nixId:input.nixId||'',refresh:input.refresh?'1':'0'});
  let hints:Record<string,CatalogueHint>={};
  const meta=new AbortController();const stop=()=>meta.abort();signal.addEventListener('abort',stop,{once:true});const mt=setTimeout(stop,1200);
  try{const r=await fetcher(apiOrigin()+'/api/playback-candidates?'+params,{signal:meta.signal});const d=await r.json();if(r.ok&&d.identity===identity)hints=d.servers||{};}catch{}finally{clearTimeout(mt);signal.removeEventListener('abort',stop);}
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
  const candidates=startupOrder(input.keys,hints,input.preferred);
  // Cold BYSE is eligible as a last resort, but never runs PoW in this probe.
  const probeKeys=candidates.filter(k=>['srv_byse','srv_streamtape','srv_mixdrop','srv_watchplay','srv_vip','srv_nixplay'].includes(k)&&(k!=='srv_byse'||hints[k]?.warm)).slice(0,2);
  const health:ServerHealthMap={};
  const ctrl=new AbortController();const abort=()=>ctrl.abort();signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,4500);
  const jobs=probeKeys.map(async key=>{
    try{const r=await fetcher(apiOrigin()+'/api/playback-health?'+params+'&startup=1&servers='+encodeURIComponent(key),{signal:ctrl.signal});const d=await r.json();
      const value=d.servers?.[key];if(!signal.aborted&&!ctrl.signal.aborted&&r.ok&&d.identity===identity&&value&&['available','unknown','unavailable'].includes(value.state)&&Number.isFinite(value.checkedAt)){health[key]=value;onHealth({...health});if(value.state==='available')return key;}
    }catch{}
    throw Error('Not verified');
  });
  const settled=Promise.allSettled(jobs).finally(()=>{clearTimeout(timer);signal.removeEventListener('abort',abort)});
  void settled;
  let selected:string|undefined;
  try{selected=await Promise.any(jobs);}catch{}
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
  const ordered=[...candidates].sort((a,b)=>(health[a]?.state==='available'?0:health[a]?.state==='unavailable'?2:1)-(health[b]?.state==='available'?0:health[b]?.state==='unavailable'?2:1));
  const urls:Record<string,string>={};
  for(const [key,value] of Object.entries(health))if(key==='srv_byse'&&value.iframeUrl){try{const url=new URL(value.iframeUrl,'https://local');if(url.origin==='https://local'&&url.pathname==='/api/byse-proxy-iframe')urls[key]=url.pathname+url.search;}catch{}}
  return {selected:selected||ordered.find(k=>health[k]?.state!=='unavailable'),candidates:ordered,hints,urls};
}

export function startupAttemptTimeout(deadline:number,providerTimeout:number,now=Date.now()){
  return Math.min(providerTimeout,Math.max(100,deadline-now));
}

export function nextStartupKey(keys:string[],attempted:Set<string>,health:ServerHealthMap) {
  const score=(key:string)=>health[key]?.state==='available'?0:1;
  return keys.filter(key=>!attempted.has(key)&&health[key]?.state!=='unavailable').sort((a,b)=>score(a)-score(b))[0];
}
