import React, { useState, useEffect } from 'react';
import { adminFetch } from '../services/adminApi';
import { Loader2 } from 'lucide-react';

export interface ExternalSource {
  index: number;
  host: string;
  quality: string | null;
  state: string;
  cached: boolean;
  latencyMs?: number;
  checkedAt?: number;
  lastSelectedAt?: number | null;
}

let allSourcesCache: Record<string, ExternalSource[]> | null = null;
let allSourcesPromise: Promise<Record<string, ExternalSource[]>> | null = null;

const SOURCES_UPDATED_EVENT = 'external-sources-updated';
let sourcesGeneration = 0;
export const normalizeExternalSourceName = (name: string) => name.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function invalidateExternalSourcesCache() {
  sourcesGeneration++;
  allSourcesCache = null;
  allSourcesPromise = null;
  window.dispatchEvent(new Event(SOURCES_UPDATED_EVENT));
}

export async function fetchAllExternalSources(): Promise<Record<string, ExternalSource[]>> {
  if (allSourcesCache) return allSourcesCache;
  if (allSourcesPromise) return allSourcesPromise;
  const generation = sourcesGeneration;
  allSourcesPromise = (async () => {
    try {
      const response = await adminFetch('/api/admin/external-sources?all=1');
      const data = await response.json();
      if (data.success && data.channels) {
        const mapped: Record<string, ExternalSource[]> = {};
        for (const [key, val] of Object.entries<{ channel: string; sources: ExternalSource[] }>(data.channels)) {
          mapped[key] = val.sources;
          mapped[normalizeExternalSourceName(key)] = val.sources;
        }
        if (generation === sourcesGeneration) allSourcesCache = mapped;
        return mapped;
      }
    } catch {}
    return {};
  })().finally(() => {
    if (generation === sourcesGeneration) allSourcesPromise = null;
  });
  return allSourcesPromise;
}

export interface ExternalChannelSourcesProps {
  name: string;
  key?: React.Key;
}

export function ExternalChannelSources({ name }: ExternalChannelSourcesProps) {
  const [sources, setSources] = useState<ExternalSource[] | null>(() => {
    if (allSourcesCache) {
      return allSourcesCache[name] || allSourcesCache[normalizeExternalSourceName(name)] || null;
    }
    return null;
  });
  const [testing, setTesting] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(SOURCES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(SOURCES_UPDATED_EVENT, refresh);
  }, []);


  useEffect(() => {
    let mounted = true;
    if (allSourcesCache) {
      const cached = allSourcesCache[name] || allSourcesCache[normalizeExternalSourceName(name)];
      if (cached) {
        setSources(cached);
        return () => { mounted = false; };
      }
    }
    void fetchAllExternalSources().then(map => {
      if (!mounted) return;
      const found = map[name] || map[normalizeExternalSourceName(name)];
      if (found) {
        setSources(found);
      } else {
        void adminFetch(`/api/admin/external-sources?name=${encodeURIComponent(name)}`)
          .then(res => res.json())
          .then(data => {
            if (mounted && data.success && Array.isArray(data.sources)) {
              setSources(data.sources);
            }
          })
          .catch(() => {});
      }
    });
    return () => {
      mounted = false;
    };
  }, [name, revision]);

  async function test(index: number) {
    setTesting(index);
    try {
      const response = await adminFetch('/api/admin/external-source-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, index }),
      });
      const data = await response.json();
      if (data.success) {
        setSources(prev => {
          const updated = prev?.map(s => s.index === index ? { ...s, ...data } : s) || null;
          if (updated && allSourcesCache) {
            allSourcesCache[name] = updated;
            allSourcesCache[normalizeExternalSourceName(name)] = updated;
          }
          return updated;
        });
      }
    } catch {}
    finally {
      setTesting(null);
    }
  }

  if (!sources || sources.length === 0) return null;

  return (
    <>
      {sources.map(source => {
        const isTesting = testing === source.index;
        const isDisabled = isTesting || ['unsupported', 'unavailable'].includes(source.state);

        return (
          <div
            key={source.index}
            className="server-row flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white/5 text-[11px]"
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {/* Nome "Servidor N" vem do CSS counter do card (numeração contínua) */}
              <span className="server-name text-white/80 truncate font-medium" />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isTesting ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400 animate-pulse inline-flex items-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  <span>...</span>
                </span>
              ) : source.state === 'available' ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300">
                  200 OK{source.latencyMs !== undefined ? ` (${source.latencyMs}ms)` : ''}
                </span>
              ) : (source.state === 'failed' || source.state === 'blocked') ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-300">
                  OFF
                </span>
              ) : source.state === 'unsupported' ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300">
                  DASH
                </span>
              ) : null}

              <button
                type="button"
                disabled={isDisabled}
                onClick={() => void test(source.index)}
                title="Testar sinal desta fonte"
                className="relative before:absolute before:-inset-2 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white/70 hover:text-white text-[10px] font-bold cursor-pointer transition-colors"
              >
                {isTesting ? '...' : 'Testar'}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
