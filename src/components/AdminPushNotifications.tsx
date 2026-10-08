import React, { useState } from "react";
import { Send, Bell, Users, Loader2 } from "lucide-react";

export function AdminPushNotifications() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("Título e mensagem são obrigatórios.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/admin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim() })
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(`Notificação enviada com sucesso para ${data.count} dispositivos.`);
        setTitle("");
        setBody("");
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
    <div className="bg-[#1c1c1e]/60 border border-white/10 backdrop-blur-xl rounded-[28px] p-6 sm:p-8 shadow-xl animate-fade-in">
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-purple-500/20 text-purple-400 rounded-xl">
          <Bell className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Disparar Notificações (Push)</h2>
          <p className="text-white/50 text-sm mt-1">
            Envie mensagens instantâneas para todos os usuários que autorizaram notificações no app.
          </p>
        </div>
      </div>

      {success && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-[20px] text-green-400 text-sm font-medium">
          ✅ {success}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-[20px] text-red-400 text-sm font-medium">
          ❌ {error}
        </div>
      )}

      <form onSubmit={handleSendPush} className="space-y-4 max-w-2xl">
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
          className="w-full sm:w-auto px-8 py-3 bg-purple-600 hover:bg-purple-500 active:scale-[0.98] text-white font-bold text-sm rounded-[20px] transition-all disabled:opacity-50 shadow-[0_4px_14px_rgba(147,51,234,0.4)] flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {loading ? "Enviando..." : "Disparar Push Global"}
        </button>
      </form>
    </div>
  );
}
