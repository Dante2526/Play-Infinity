import React, { useState, useEffect } from "react";
import { Send, Bell, Users, Loader2, MessageSquare, ChevronDown } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../services/firebase";
import { adminFetch } from "../services/adminApi";

const TEMPLATES = [
  { label: "Nenhum (Personalizado)", title: "", body: "" },
  { label: "Novo Episódio", title: "Novo Episódio Disponível! 🍿", body: "Acabamos de adicionar um novo episódio no catálogo. Venha conferir!" },
  { label: "Novo Filme", title: "Lançamento no Catálogo 🎬", body: "Tem filme novo esperando por você no Play Infinity. Prepare a pipoca!" },
  { label: "Aviso/Manutenção", title: "Aviso de Manutenção ⚠️", body: "Nossos servidores passarão por uma breve manutenção. Voltamos em breve." }
];

export function AdminPushNotifications() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState<"global" | "specific">("global");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [usersList, setUsersList] = useState<{email: string, name: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, "usuarios"));
        const snap2 = await getDocs(collection(db, "users"));
        const userMap = new Map();
        snap.forEach(doc => {
           const d = doc.data();
           if (d.email) userMap.set(d.email, { email: d.email, name: d.nome || d.name || "Usuário" });
        });
        snap2.forEach(doc => {
           const d = doc.data();
           if (d.email && !userMap.has(d.email)) userMap.set(d.email, { email: d.email, name: d.nome || d.name || "Usuário" });
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
          <h2 className="text-2xl font-bold text-white">Disparar Notificações (Push)</h2>
          <p className="text-white/50 text-sm mt-2 max-w-md">
            Envie mensagens instantâneas para todos os usuários ou para contas específicas.
          </p>
        </div>
      </div>

      <div className="w-full max-w-xl">
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
              <label className="block text-white/60 text-xs font-bold mb-1.5 uppercase tracking-wider ml-1">
                Selecione os Usuários
              </label>
              <div className="max-h-64 overflow-y-auto bg-white/5 border border-white/10 rounded-[20px] p-2 custom-scrollbar flex flex-col gap-1">
                {usersList.length === 0 ? (
                  <p className="text-white/40 text-xs p-4 text-center">Carregando usuários...</p>
                ) : (
                  usersList.map((u, i) => (
                    <label key={i} className="flex items-center gap-3 p-3 hover:bg-white/10 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-white/5">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-[#1c1c1e] border-white/20 transition-all cursor-pointer"
                        checked={selectedEmails.includes(u.email)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedEmails([...selectedEmails, u.email]);
                          else setSelectedEmails(selectedEmails.filter(email => email !== u.email));
                        }}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">{u.name}</span>
                        <span className="text-xs text-white/50">{u.email}</span>
                      </div>
                    </label>
                  ))
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
