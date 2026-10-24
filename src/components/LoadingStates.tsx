import React from 'react';

const block = 'rounded-lg bg-white/10 motion-safe:animate-pulse';
export function PageLoading({ view = 'home' }: { view?: string }) {
  const hero = view === 'home' || view === 'details';
  return <section role="status" aria-label="Carregando conteúdo" aria-busy="true" className="w-full px-5 sm:px-10 py-8 min-h-[60vh]">
    <span className="sr-only">Carregando conteúdo…</span>
    {hero && <div aria-hidden="true" className="rounded-2xl bg-neutral-900 p-6 sm:p-10 mb-8 flex flex-col justify-end" style={{minHeight: '45vh'}}>
      <div className={`${block} h-10 w-3/4 max-w-md mb-4`} /><div className={`${block} h-4 w-full max-w-lg mb-3`} /><div className={`${block} h-4 w-2/3 mb-6`} /><div className={`${block} h-10 w-32`} />
    </div>}
    <div aria-hidden="true"><div className={`${block} h-7 w-48 mb-6`} />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">{Array.from({length:10},(_,i)=><div key={i} className={`${block} aspect-[2/3]`} />)}</div>
    </div>
  </section>;
}
export function PlayerLoading({ title, onClose }: { title?: string; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-label="Abrindo player" onKeyDown={e=>{if(e.key==='Escape')onClose();}} className="fixed inset-0 z-[100] bg-black text-white flex flex-col justify-between p-5 sm:p-8">
    <div className="flex justify-between items-center gap-4"><span className="truncate">{title || 'Preparando reprodução'}</span><button autoFocus type="button" onClick={onClose} className="shrink-0 rounded-lg bg-white/10 px-4 py-3 focus-visible:outline focus-visible:outline-orange-500">Fechar</button></div>
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-lg text-center"><div aria-hidden="true" className={`${block} h-8 w-2/3 mx-auto mb-4`} /><p>Preparando reprodução…</p></div>
    <div aria-hidden="true" className="space-y-4"><div className={`${block} h-1 w-full`} /><div className="flex gap-4"><div className={`${block} h-8 w-24`} /><div className={`${block} h-8 w-16`} /></div></div>
  </div>;
}
export function DialogLoading({onClose}: {onClose:()=>void}) {
  return <div role="dialog" aria-modal="true" aria-label="Carregando janela" className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6"><div className="w-full max-w-md rounded-2xl bg-neutral-900 p-6 text-white"><div role="status">Carregando…<div aria-hidden="true" className={`${block} h-24 mt-4`} /></div><button autoFocus type="button" onClick={onClose} className="mt-6 px-4 py-3 bg-white/10 rounded-lg">Fechar</button></div></div>;
}
class LoadBoundary extends React.Component<{children:React.ReactNode;retry:()=>void;onClose?:()=>void;player?:boolean},{failed:boolean}> {
  declare props: {children:React.ReactNode;retry:()=>void;onClose?:()=>void;player?:boolean};
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(!this.state.failed)return this.props.children;
    return <div role="alert" className={this.props.player?'fixed inset-0 z-[100] bg-black text-white flex flex-col items-center justify-center gap-4 p-6':'min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6 text-white'}>
      <p>Não foi possível abrir este conteúdo.</p>
      <button autoFocus type="button" onClick={this.props.retry} className="rounded-lg bg-orange-600 px-5 py-3">Tentar novamente</button>
      {this.props.onClose && <button type="button" onClick={this.props.onClose} className="rounded-lg bg-white/10 px-5 py-3">Voltar</button>}
    </div>;
  }
}
// Recreate React.lazy on retry: a rejected lazy promise otherwise stays rejected.
// Never reload the whole app or erase caches while another player may be active.
export function lazyWithRetry(componentImport:()=>Promise<any>, options:{player?:boolean}={}) {
  const createLazy=()=>React.lazy(async()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{const m=await Promise.race([componentImport(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Tempo de carregamento excedido')),30000);})]);return {default:m.default||Object.values(m)[0]};}
    finally{clearTimeout(timer);}
  });
  // Keep the first lazy identity outside the suspending tree. React discards
  // state/memo on an initial suspension; recreating it there would loop imports.
  const InitialComponent=createLazy();
  return function RetryableComponent(props:any) {
    const [attempt,setAttempt]=React.useState(0);
    const [Component,setComponent]=React.useState(()=>InitialComponent);
    const retry=()=>{setComponent(()=>createLazy());setAttempt(n=>n+1);};
    return <LoadBoundary key={attempt} retry={retry} onClose={props.onClose||props.onBack} player={options.player}><Component {...props}/></LoadBoundary>;
  };
}
