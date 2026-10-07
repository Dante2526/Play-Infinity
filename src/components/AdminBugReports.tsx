import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { ShieldAlert, CheckCircle2, MessageSquare, ExternalLink, ChevronDown } from 'lucide-react';

interface BugReport {
  id: string;
  clientId: string;
  userName?: string;
  userEmail?: string;
  mediaId: string;
  mediaTitle: string;
  mediaType: string;
  episodeInfo?: string;
  description: string;
  imageUrl?: string;
  status: 'pending' | 'resolved';
  adminResponse?: string;
  createdAt: any;
}

const PREDEFINED_RESPONSES = [
  "Recebido e resolvido. Pode testar.",
  "Recebido, mas não conseguimos reproduzir o erro.",
  "Estamos analisando, correção na próxima atualização.",
  "Problema temporário no servidor"
];

export function AdminBugReports() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<Record<string, string>>({});
  const [customResponse, setCustomResponse] = useState<Record<string, string>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'bug_reports'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: BugReport[] = [];
      snapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() } as BugReport);
      });
      setReports(logs);
      setLoading(false);
    }, (error) => {
      console.error('Erro ao buscar bugs:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleResolve = async (reportId: string) => {
    const resp = customResponse[reportId] || selectedResponse[reportId] || PREDEFINED_RESPONSES[0];
    try {
      setResolvingId(reportId);
      await updateDoc(doc(db, 'bug_reports', reportId), {
        status: 'resolved',
        adminResponse: resp
      });
    } catch (err) {
      console.error('Erro ao resolver bug:', err);
      alert('Falha ao atualizar o bug.');
    } finally {
      setResolvingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-white">
        Carregando relatórios...
      </div>
    );
  }

  const pending = reports.filter(r => r.status === 'pending');
  const resolved = reports.filter(r => r.status === 'resolved');

  return (
    <div className="space-y-6">
      <div className="bg-[#1c1c1e]/60 border border-white/5 backdrop-blur-xl rounded-[28px] p-6 sm:p-8 shadow-xl">
        <h2 className="text-2xl font-black text-white flex items-center gap-3 mb-6">
          <ShieldAlert className="w-7 h-7 text-red-500" />
          Bugs Pendentes ({pending.length})
        </h2>

        {pending.length === 0 ? (
          <p className="text-gray-400">Nenhum bug pendente no momento.</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {pending.map(report => (
              <div key={report.id} className="bg-[#141414] border border-red-900/30 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg font-bold text-white leading-tight">
                      {report.mediaTitle}
                    </h3>
                    <span className="text-xs font-semibold px-2 py-1 bg-red-600/20 text-red-400 rounded-md">
                      Pendente
                    </span>
                  </div>
                  {report.episodeInfo && (
                    <p className="text-sm text-gray-400 font-medium mb-3">{report.episodeInfo}</p>
                  )}
                  
                  <div className="flex flex-col gap-0.5 mb-3 text-xs text-gray-500">
                    <span><strong>Por:</strong> {report.userName || 'Anônimo'}</span>
                    {report.userEmail && <span><strong>Email:</strong> {report.userEmail}</span>}
                    <span><strong>Data:</strong> {report.createdAt ? new Date(report.createdAt.toMillis()).toLocaleString() : 'Recente'}</span>
                  </div>
                  
                  <div className="bg-[#222] p-3 rounded-xl mb-4">
                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{report.description}</p>
                  </div>

                  {report.imageUrl && (
                    <div className="mb-4">
                      <a href={report.imageUrl} target="_blank" rel="noreferrer" className="block w-32 h-32 rounded-lg overflow-hidden border border-gray-700 hover:border-red-500 transition-colors">
                        <img src={report.imageUrl} alt="Print do Bug" className="w-full h-full object-cover" />
                        <div className="bg-black/60 text-xs text-white text-center py-1 flex items-center justify-center gap-1">
                          <ExternalLink className="w-3 h-3" /> Ampliar
                        </div>
                      </a>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-800">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Resposta para o cliente:
                  </label>
                  <div className="relative mb-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdownId(openDropdownId === report.id ? null : report.id);
                      }}
                      className="w-full bg-[#2a2a2a] text-white border border-gray-700 hover:border-red-500 rounded-lg p-2.5 text-sm flex justify-between items-center transition-colors focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      <span className="truncate pr-2">
                        {selectedResponse[report.id] === 'custom' 
                          ? '-- Mensagem Personalizada --' 
                          : (selectedResponse[report.id] || PREDEFINED_RESPONSES[0])}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openDropdownId === report.id ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {openDropdownId === report.id && (
                      <div className="absolute top-full left-0 w-full mt-1 bg-[#2a2a2a] border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                        {PREDEFINED_RESPONSES.map((resp, i) => (
                          <div 
                            key={i} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedResponse({...selectedResponse, [report.id]: resp});
                              setOpenDropdownId(null);
                            }}
                            className="p-2.5 text-sm text-gray-300 hover:text-white hover:bg-red-600/20 cursor-pointer border-b border-gray-800 last:border-0 transition-colors truncate"
                          >
                            {resp}
                          </div>
                        ))}
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedResponse({...selectedResponse, [report.id]: 'custom'});
                            setOpenDropdownId(null);
                          }}
                          className="p-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-600/20 cursor-pointer transition-colors truncate"
                        >
                          -- Mensagem Personalizada --
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedResponse[report.id] === 'custom' && (
                    <input 
                      type="text"
                      placeholder="Digite sua mensagem personalizada..."
                      value={customResponse[report.id] || ''}
                      onChange={(e) => setCustomResponse({...customResponse, [report.id]: e.target.value})}
                      className="w-full bg-[#2a2a2a] text-white border border-gray-700 rounded-lg p-2.5 text-sm mb-3 focus:outline-none focus:border-red-500"
                    />
                  )}

                  <button
                    onClick={() => handleResolve(report.id)}
                    disabled={resolvingId === report.id || (selectedResponse[report.id] === 'custom' && !customResponse[report.id])}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    {resolvingId === report.id ? 'Marcando...' : (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Marcar como Resolvido
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[#1c1c1e]/60 border border-white/5 backdrop-blur-xl rounded-[28px] p-6 sm:p-8 shadow-xl mt-6">
        <h2 className="text-2xl font-black text-white flex items-center gap-3 mb-6">
          <MessageSquare className="w-7 h-7 text-green-500" />
          Bugs Resolvidos
        </h2>
        {resolved.length === 0 ? (
          <p className="text-gray-400">Nenhum bug resolvido na fila.</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {resolved.map(report => (
              <div key={report.id} className="bg-[#141414] border border-green-900/30 rounded-2xl p-5 flex flex-col opacity-75">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-bold text-white leading-tight">
                    {report.mediaTitle}
                  </h3>
                  <span className="text-xs font-semibold px-2 py-1 bg-green-600/20 text-green-400 rounded-md">
                    Resolvido
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 mb-3 text-xs text-gray-500">
                  <span><strong>Por:</strong> {report.userName || 'Anônimo'}</span>
                  {report.userEmail && <span><strong>Email:</strong> {report.userEmail}</span>}
                  <span><strong>ID do cliente:</strong> {report.clientId.slice(0, 8)}...</span>
                </div>
                <div className="bg-[#222] p-3 rounded-xl border border-green-900/20">
                  <p className="text-green-400 text-sm font-semibold mb-1">Resposta:</p>
                  <p className="text-gray-300 text-sm">{report.adminResponse}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
