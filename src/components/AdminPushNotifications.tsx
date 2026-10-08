import React, { useState } from "react";
import { Send, Bell, Users, Loader2, MessageSquare } from "lucide-react";

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
  const [targetEmails, setTargetEmails] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const t = TEMPLATES[Number(e.target.value)];
    if (t) {
      setTitle(t.title);
      setBody(t.body);
    }
  };

  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("Título e mensagem são obrigatórios.");
      return;
    }
    
    let emailsArray: string[] = [];
    if (targetType === "specific") {
      emailsArray = targetEmails.split(",").map(e => e.trim()).filter(e => e);
      if (emailsArray.length === 0) {
        setError("Digite pelo menos um e-mail válido.");
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

      const res = await fetch("/api/admin/push", {
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
              <Users className="w-4 h-4" /> Global (Todos)
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
                E-mails dos Usuários (separados por vírgula)
              </label>
              <textarea
                value={targetEmails}
                onChange={(e) => setTargetEmails(e.target.value)}
                placeholder="exemplo1@gmail.com, exemplo2@gmail.com"
                rows={2}
                className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 py-3 px-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium text-sm rounded-[20px] resize-none"
                required={targetType === "specific"}
              />
            </div>
          )}

          <div className="h-px bg-white/10 my-6"></div>

          <div>
            <label className="block text-white/60 text-xs font-bold mb-1.5 uppercase tracking-wider ml-1">
              Mensagem Pré-configurada
            </label>
            <div className="relative">
              <select 
                onChange={handleTemplateChange}
                className="w-full appearance-none bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 py-3 pl-4 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium text-sm rounded-[20px]"
              >
                {TEMPLATES.map((t, idx) => (
                  <option key={idx} value={idx} className="bg-[#1c1c1e] text-white">{t.label}</option>
                ))}
              </select>
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
