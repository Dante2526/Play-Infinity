import React, { useState, useEffect } from "react";
import { Send, Bell, Users, Loader2, MessageSquare, ChevronDown, BellRing, BellOff, Smartphone, HeartHandshake } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../services/firebase";
import { adminFetch } from "../services/adminApi";

const TEMPLATES = [
  { label: "Nenhum (Personalizado)", title: "", body: "" },
  { label: "Novo Episódio", title: "Novo Episódio Disponível! 🍿", body: "Acabamos de adicionar um novo episódio no catálogo. Venha conferir!" },
  { label: "Novo Filme", title: "Lançamento no Catálogo 🎬", body: "Tem filme novo esperando por você no Play Infinity. Prepare a pipoca!" },
  { label: "Aviso/Manutenção", title: "Aviso de Manutenção ⚠️", body: "Nossos servidores passarão por uma breve manutenção. Voltamos em breve." }
];

interface NotifUserRow {
  email: string | null;
  name: string;
  status: "granted" | "denied" | "not_asked";
  devices: number;
  lastDunningPushAt: number | null;
  isAdminDevice: boolean;
}

interface NotifStats {
  total: number;
  granted: number;
  grantedWithToken: number;
  denied: number;
  notAsked: number;
  totalTokens: number;
  delinquent: number;
}

export function AdminPushNotifications() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState<"global" | "specific">("global");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [usersList, setUsersList] = useState<{email: string, name: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // Stats de notificações (quem ativou / recusou / ainda não perguntado)
  const [notifStats, setNotifStats] = useState<NotifStats | null>(null);
  const [notifUsers, setNotifUsers] = useState<NotifUserRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [showAllUsers, setShowAllUsers] = useState(false);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);

  const fetchNotifStats = async () => {
    try {
      const res = await adminFetch("/api/admin/notif-stats");
      const data = await res.json();
      if (data.success) {
        setNotifStats(data.stats);
        setNotifUsers(data.users || []);
      }
    } catch (e) {
      console.error("Erro ao carregar stats de notificações:", e);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    void fetchNotifStats();
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, "usuarios"));
        const userMap = new Map();
        snap.forEach(doc => {
           const d = doc.data();
           if (d.email) userMap.set(d.email, { email: d.email, name: d.nome || d.name || "Usuário" });
        });
        setUsersList(Array.from(userMap.values()).sort((a,b) => a.name.localeCompare(b.name)));
      } catch(e) {
        console.error("Erro ao carregar usuários para push:", e);
      }
    };
    fetchUsers();
  }, []);

  const handleTemplateSelect = (idx: number) => {
    const t = TEMPLATES[idx];
    if (t) {
      setTitle(t.title);
      setBody(t.body);
      setSelectedTemplateIdx(idx);
    }
    setIsDropdownOpen(false);
  };

  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("Título e mensagem são obrigatórios.");
      return;
    }
    
    let emailsArray: string[] = [];
    if (targetType === "specific") {
      emailsArray = selectedEmails;
      if (emailsArray.length === 0) {
        setError("Selecione pelo menos um usuário.");
        return;
      }
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const payload: any = { title: title.trim(), body: body.trim() };
      if (targetType === "specific") {
        payload.targetEmails = emailsArray;
      }

      const res = await adminFetch("/api/admin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(`Notificação enviada com sucesso para ${data.count} dispositivos.`);
        if (targetType === "global") {
          setTitle("");
          setBody("");
        }
      } else {
        throw new Error(data.error || "Erro ao enviar notificação.");
      }
    } catch (err: any) {
      setError(err.message || "Erro de rede ao enviar push.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#1c1c1e]/60 border border-white/10 backdrop-blur-xl rounded-[28px] p-6 sm:p-8 shadow-xl animate-fade-in flex flex-col items-center">
      <div className="flex flex-col items-center text-center gap-4 mb-8">
        <div className="p-4 bg-purple-500/20 text-purple-400 rounded-2xl">
          <Bell className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Notificações</h2>
          <p className="text-white/50 text-sm mt-2 max-w-md">
            Acompanhe quem ativou as notificações push e dispare mensagens manuais.
          </p>
        </div>
      </div>

      {/* ===== Status das notificações dos usuários ===== */}
      <div className="w-full max-w-4xl mb-10">
        {statsLoading ? (
          <div className="flex flex-col items-center justify-center p-10 text-white/40 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            <span className="text-sm font-medium">Carregando status das notificações...</span>
          </div>
        ) : notifStats ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
              <div className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4">
                <div className="flex items-center justify-between text-white/50 text-[11px] font-bold uppercase tracking-wider mb-1">
                  <span>Ativadas</span>
                  <BellRing className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-emerald-400">{notifStats.grantedWithToken}</div>
                <div className="text-[10px] text-white/35 mt-0.5">{notifStats.granted} aceitaram</div>
              </div>
              <div className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4">
                <div className="flex items-center justify-between text-white/50 text-[11px] font-bold uppercase tracking-wider mb-1">
                  <span>Desativadas</span>
                  <BellOff className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-red-400">{notifStats.denied}</div>
                <div className="text-[10px] text-white/35 mt-0.5">recusaram — não serão perguntadas de novo</div>
              </div>
              <div className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4">
                <div className="flex items-center justify-between text-white/50 text-[11px] font-bold uppercase tracking-wider mb-1">
                  <span>Não Perguntados</span>
                  <Users className="w-3.5 h-3.5 text-white/50" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-white/70">{notifStats.notAsked}</div>
                <div className="text-[10px] text-white/35 mt-0.5">verão o pedido na próxima visita</div>
              </div>
              <div className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4">
                <div className="flex items-center justify-between text-white/50 text-[11px] font-bold uppercase tracking-wider mb-1">
                  <span>Dispositivos</span>
                  <Smartphone className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-purple-400">{notifStats.totalTokens}</div>
                <div className="text-[10px] text-white/35 mt-0.5">aparelhos com push registrado</div>
              </div>
              <div className="bg-black/40 border border-white/10 rounded-2xl p-3 sm:p-4 col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-white/50 text-[11px] font-bold uppercase tracking-wider mb-1">
                  <span>Inadimplentes</span>
                  <HeartHandshake className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-orange-400">{notifStats.delinquent}</div>
                <div className="text-[10px] text-white/35 mt-0.5">recebem saudação a cada 3 dias</div>
              </div>
            </div>

            {/* Lista de usuários por status */}
            <div className="bg-black/30 border border-white/5 rounded-[20px] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-white/60 text-xs font-bold uppercase tracking-wider">
                  Usuários · Status de Notificação
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllUsers(!showAllUsers)}
                  className="text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                >
                  {showAllUsers ? "Mostrar menos" : `Ver todos (${notifUsers.length})`}
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {(showAllUsers ? notifUsers : notifUsers.slice(0, 8)).map((u, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-white block truncate">
                        {u.name}{u.isAdminDevice && <span className="ml-1.5 text-[10px] font-bold text-cyan-400/70 uppercase">admin</span>}
                      </span>
                      <span className="text-xs text-white/40 truncate block">{u.email || "—"}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {u.devices > 0 && (
                        <span className="text-[10px] text-white/35 font-medium flex items-center gap-1">
                          <Smartphone className="w-3 h-3" /> {u.devices}
                        </span>
                      )}
                      {u.status === "granted" && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                          Ativada
                        </span>
                      )}
                      {u.status === "denied" && (
                        <span className="px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/25 text-red-400 text-[10px] font-bold uppercase tracking-wider">
                          Desativada
                        </span>
                      )}
                      {u.status === "not_asked" && (
                        <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/50 text-[10px] font-bold uppercase tracking-wider">
                          Não perguntado
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {!showAllUsers && notifUsers.length === 0 && (
                  <div className="px-4 py-8 text-center text-white/40 text-sm">Nenhum usuário registrado ainda.</div>
                )}
              </div>
            </div>

            <p className="text-white/30 text-[11px] text-center mt-3 leading-relaxed">
              Lançamentos de filmes/séries disparam push automático (a cada 1h, mínimo 3h entre pushes) para todos com notificação ativada.
              Ex-assinantes vencidos recebem a saudação de reativação a cada 3 dias.
            </p>
          </>
        ) : (
          <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-[20px] text-red-400 text-sm text-center">
            Não foi possível carregar o status das notificações.
          </div>
        )}
      </div>

      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px bg-white/10 flex-1"></div>
          <span className="text-white/50 text-xs font-bold uppercase tracking-wider">Disparo Manual</span>
          <div className="h-px bg-white/10 flex-1"></div>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-[20px] text-green-400 text-sm font-medium text-center">
            ✅ {success}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-[20px] text-red-400 text-sm font-medium text-center">
            ❌ {error}
          </div>
        )}

        <form onSubmit={handleSendPush} className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-[20px] p-1 flex relative">
            <button
              type="button"
              onClick={() => setTargetType("global")}
              className={`flex-1 py-2.5 text-sm font-bold rounded-[16px] transition-all flex items-center justify-center gap-2 ${targetType === "global" ? "bg-purple-600 text-white shadow-lg" : "text-white/50 hover:text-white"}`}
            >
              <Users className="w-4 h-4" /> Global
            </button>
            <button
              type="button"
              onClick={() => setTargetType("specific")}
              className={`flex-1 py-2.5 text-sm font-bold rounded-[16px] transition-all flex items-center justify-center gap-2 ${targetType === "specific" ? "bg-purple-600 text-white shadow-lg" : "text-white/50 hover:text-white"}`}
            >
              <MessageSquare className="w-4 h-4" /> Específicos
            </button>
          </div>

          {targetType === "specific" && (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-2 px-1">
                <label className="text-white/60 text-xs font-bold uppercase tracking-wider">
                  Selecione os Usuários ({selectedEmails.length}/{usersList.length})
                </label>
                {usersList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedEmails.length === usersList.length) setSelectedEmails([]);
                      else setSelectedEmails(usersList.map(u => u.email));
                    }}
                    className="text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    {selectedEmails.length === usersList.length ? "Desmarcar Todos" : "Marcar Todos"}
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto bg-[#141414]/80 border border-white/5 rounded-[20px] p-2 custom-scrollbar flex flex-col gap-1 shadow-inner">
                {usersList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-white/40 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    <span className="text-xs font-medium">Carregando usuários...</span>
                  </div>
                ) : (
                  usersList.map((u, i) => {
                    const isSelected = selectedEmails.includes(u.email);
                    return (
                      <label 
                        key={i} 
                        className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-200 border ${
                          isSelected 
                            ? "bg-purple-600/10 border-purple-500/30" 
                            : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
                        }`}
                      >
                        <div className="relative flex items-center justify-center">
                          <input 
                            type="checkbox" 
                            className="peer sr-only"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedEmails([...selectedEmails, u.email]);
                              else setSelectedEmails(selectedEmails.filter(email => email !== u.email));
                            }}
                          />
                          <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                            isSelected 
                              ? "bg-purple-600 shadow-[0_0_10px_rgba(147,51,234,0.5)]" 
                              : "bg-[#2a2a2a] border border-white/20 peer-hover:border-purple-500/50"
                          }`}>
                            <svg className={`w-3.5 h-3.5 text-white transition-transform duration-200 ${isSelected ? "scale-100 opacity-100" : "scale-50 opacity-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className={`text-sm font-bold transition-colors ${isSelected ? "text-purple-300" : "text-white"}`}>{u.name}</span>
                          <span className="text-xs text-white/40 font-medium">{u.email}</span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="h-px bg-white/10 my-6"></div>

          <div>
            <label className="block text-white/60 text-xs font-bold mb-1.5 uppercase tracking-wider ml-1">
              Mensagem Pré-configurada
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 py-3 px-4 text-white focus:outline-none transition-all font-medium text-sm rounded-[20px]"
              >
                <span>{TEMPLATES[selectedTemplateIdx].label}</span>
                <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              
              {isDropdownOpen && (
                <div className="absolute z-50 mt-2 w-full bg-[#1c1c1e] border border-white/10 rounded-[20px] shadow-2xl overflow-hidden py-2 animate-in fade-in zoom-in-95 duration-200">
                  {TEMPLATES.map((t, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleTemplateSelect(idx)}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors ${selectedTemplateIdx === idx ? "bg-purple-500/20 text-purple-400 font-bold" : "text-white/80 hover:bg-white/5 hover:text-white"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-white/60 text-xs font-bold mb-1.5 uppercase tracking-wider ml-1">
              Título da Notificação
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Novo Episódio Disponível!"
              className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 py-3 px-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium text-sm rounded-[20px]"
              required
            />
          </div>

          <div>
            <label className="block text-white/60 text-xs font-bold mb-1.5 uppercase tracking-wider ml-1">
              Mensagem (Corpo)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ex: O episódio 5 de The Last of Us já está no catálogo."
              rows={4}
              className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 py-3 px-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium text-sm rounded-[20px] resize-none"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-8 py-3.5 bg-purple-600 hover:bg-purple-500 active:scale-[0.98] text-white font-bold text-sm rounded-[20px] transition-all disabled:opacity-50 shadow-[0_4px_14px_rgba(147,51,234,0.4)] flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {loading ? "Enviando..." : targetType === "global" ? "Disparar Push Global" : "Disparar Push Específico"}
          </button>
        </form>
      </div>
    </div>
  );
}
