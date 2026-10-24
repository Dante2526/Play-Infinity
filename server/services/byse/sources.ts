import { createMediaSourcePool } from '../mediaSourcePool';
import { readHealthPrefix } from '../playbackHealth';
import { allowedByseMediaUrl, BYSE_USER_AGENT } from './core';
export function createByseSourcePool(options: {
  resolve: (id: string, refresh?: boolean) => Promise<string | null>;
  fetch: typeof fetch;
  timeoutMs?: number;
}) {
  const fresh = new Set<string>();
  const pool = createMediaSourcePool({
    timeoutMs: options.timeoutMs ?? 35000,
    resolve: (id, refresh) => { const force = fresh.delete(id); return options.resolve(id, refresh || force); },
    probe: async (url, signal) => {
      // Never follow a redirect outside the same allowlist enforced by the proxy.
      for(let hop=0;hop<4;hop++) {
        if(!allowedByseMediaUrl(url))return false;
        const r=await options.fetch(url,{signal,redirect:'manual',headers:{'User-Agent':BYSE_USER_AGENT,'Accept-Encoding':'identity'}});
        if(r.status>=300&&r.status<400){const next=r.headers.get('location');await r.body?.cancel();if(!next)return false;url=new URL(next,url).href;continue;}
        const prefix=await readHealthPrefix(r,1024);
        return r.ok&&new TextDecoder().decode(prefix).trimStart().startsWith('#EXTM3U');
      }
      return false;
    },
  });
  return {...pool, refresh(id:string){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))return;if(fresh.size>=1000)fresh.delete(fresh.values().next().value!);fresh.add(id);pool.report(id,false);}};
}
