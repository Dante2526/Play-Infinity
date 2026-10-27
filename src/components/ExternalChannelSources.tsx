import React, { useState } from 'react';
import { adminFetch } from '../services/adminApi';

interface Source {
  index: number; host: string; quality: string | null; state: string;
  cached: boolean; latencyMs?: number; checkedAt?: number; lastSelectedAt?: number | null;
}
const labels: Record<string, string> = {
  untested: 'Não testada', available: 'Sinal detectado', failed: 'Falhou no teste',
  unavailable: 'Base indisponível', unsupported: 'Formato incompatível', blocked: 'Fonte bloqueada',
};

export function ExternalChannelSources({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [error, setError] = useState('');
  async function load() {
    setBusy(true); setError('');
    try {
      const response = await adminFetch(`/api/admin/external-sources?name=${encodeURIComponent(name)}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw Error(data.error || 'Falha ao consultar fontes');
      setSources(data.sources);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao consultar fontes'); }
    finally { setBusy(false); }
  }
  async function test(index: number) {
    setTesting(index); setError('');
    try {
      const response = await adminFetch('/api/admin/external-source-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, index }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw Error(data.error || 'Falha ao testar fonte');
      setSources(previous => previous?.map(source => source.index === index ? { ...source, ...data } : source) || null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao testar fonte'); }
    finally { setTesting(null); }
  }
  return <div className="border-t border-white/10 pt-2 text-xs">
    <button type="button" aria-expanded={open} className="min-h-[44px] text-orange-400 font-bold"
      onClick={() => { setOpen(!open); if (!open && !sources && !busy) void load(); }}>
      {open ? 'Ocultar' : 'Ver'} fontes individuais · {name}
    </button>
    {open && <div className="space-y-2">
      <p className="text-white/50">Fontes do catálogo Saimo. O automático escolhe a fonte ao abrir o canal. Os testes abaixo são verificações pontuais, não reprodução contínua.</p>
      <button type="button" disabled={busy || testing !== null} onClick={() => void load()} className="min-h-[44px] disabled:opacity-50">{busy ? 'Carregando fontes…' : 'Atualizar lista'}</button>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {sources?.length === 0 && <p>Este canal não possui fontes.</p>}
      {sources?.map(source => <div key={source.index} className="rounded-lg bg-white/5 p-2 space-y-1">
        <div className="break-all font-semibold">Fonte {source.index + 1} · {source.host || 'Base não resolvida'} {source.quality && `· ${source.quality}`}</div>
        {source.lastSelectedAt && <p className="text-orange-300">Última escolhida pelo automático neste processo às {new Date(source.lastSelectedAt).toLocaleTimeString('pt-BR')} (não confirma espectadores ativos)</p>}
        <div className={source.state === 'available' ? 'text-emerald-300' : 'text-white/60'}>
          {labels[source.state] || source.state}{source.cached ? ' (cache deste processo)' : ''}
          {source.latencyMs !== undefined && ` · ${source.latencyMs} ms`}
          {source.checkedAt && ` · ${new Date(source.checkedAt).toLocaleTimeString('pt-BR')}`}
        </div>
        <button type="button" className="min-h-[44px] text-orange-400 disabled:opacity-40" disabled={testing !== null || busy || ['unsupported', 'unavailable'].includes(source.state)}
          onClick={() => void test(source.index)}>{testing === source.index ? 'Testando…' : 'Testar esta fonte'}</button>
      </div>)}
    </div>}
  </div>;
}
