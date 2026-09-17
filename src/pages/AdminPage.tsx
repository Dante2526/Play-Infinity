import React, { useState, useEffect } from "react";
import { Users, CreditCard, Clock, Activity, ShieldAlert, LogOut, ChevronLeft } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../services/firebase";

interface AdminPageProps {
  onBack: () => void;
}

export function AdminPage({ onBack }: AdminPageProps) {
  const [isAdmin, setIsAdmin] = useState(sessionStorage.getItem("isAdmin") === "true");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    watchingNow: 0
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const q = query(
        collection(db, "administradores"),
        where("email", "==", email),
        where("senha", "==", password)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        setIsAdmin(true);
        sessionStorage.setItem("isAdmin", "true");
      } else {
        setError("Credenciais inválidas. Verifique o email e a senha.");
      }
    } catch (err: any) {
      setError("Erro ao autenticar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      let total = 0;
      let active = 0;
      let inactive = 0;
      let watchingNow = 0;
      
      const fiveMinutesAgo = new Date();
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

      usersSnap.forEach((doc) => {
        total++;
        const data = doc.data();
        
        if (data.subscription === "ACTIVE") {
          active++;
        } else {
          inactive++;
        }

        // Pessoas assistindo nos últimos 5 minutos
        if (data.lastActive) {
          const lastActiveDate = new Date(data.lastActive);
          if (lastActiveDate >= fiveMinutesAgo) {
            watchingNow++;
          }
        }
      });

      setStats({ total, active, inactive, watchingNow });
    } catch (err) {
      console.error("Erro ao carregar estatísticas", err);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadStats();
      const interval = setInterval(loadStats, 60000); // Atualiza a cada 1 minuto
      return () => clearInterval(interval);
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-[#1c1c1e]/80 backdrop-blur-3xl border border-white/10 w-full max-w-sm rounded-[28px] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-8 sm:p-10 animate-fade-in">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          <h2 className="text-[24px] font-extrabold text-white text-center mb-2">Painel Admin</h2>
          <p className="text-white/50 text-[14px] text-center mb-8">Acesso restrito à equipe Play Infinity.</p>

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-[20px] text-red-400 text-sm text-center font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-4 px-5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px] rounded-[22px]"
              placeholder="E-mail Administrativo"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-4 px-5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px] rounded-[22px]"
              placeholder="Senha"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-500 active:scale-[0.98] text-white font-bold text-[16px] py-4 rounded-[22px] transition-all mt-4 disabled:opacity-50 shadow-[0_4px_14px_rgba(234,88,12,0.4)]"
            >
              {loading ? "Verificando..." : "Entrar no Painel"}
            </button>
          </form>
          
          <button 
            onClick={onBack}
            className="w-full mt-6 text-white/40 hover:text-white transition-colors text-sm font-medium"
          >
            Voltar para o App
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24 pt-20 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto animate-fade-in">
        
        {/* Header Admin */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-12 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <button onClick={onBack} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
                <ShieldAlert className="w-8 h-8 text-orange-500" />
                Painel Administrativo
              </h1>
            </div>
            <p className="text-white/50 pl-14">Visão geral e métricas em tempo real da plataforma.</p>
          </div>

          <button 
            onClick={() => {
              sessionStorage.removeItem("isAdmin");
              setIsAdmin(false);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-full font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair do Painel
          </button>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Card 1: Total Users */}
          <div className="bg-[#1c1c1e]/60 border border-white/5 backdrop-blur-xl rounded-[28px] p-6 shadow-xl flex flex-col hover:bg-[#1c1c1e]/80 transition-colors">
            <div className="flex items-center gap-4 mb-4 text-white/70">
              <div className="p-3 bg-blue-500/20 text-blue-400 rounded-[18px]">
                <Users className="w-6 h-6" />
              </div>
              <span className="font-semibold">Contas Criadas</span>
            </div>
            <div className="text-4xl font-black text-white">{stats.total}</div>
            <p className="text-white/40 text-sm mt-2 font-medium">Total de registros no banco</p>
          </div>

          {/* Card 2: Active Paid */}
          <div className="bg-[#1c1c1e]/60 border border-white/5 backdrop-blur-xl rounded-[28px] p-6 shadow-xl flex flex-col hover:bg-[#1c1c1e]/80 transition-colors">
            <div className="flex items-center gap-4 mb-4 text-white/70">
              <div className="p-3 bg-green-500/20 text-green-400 rounded-[18px]">
                <CreditCard className="w-6 h-6" />
              </div>
              <span className="font-semibold">Assinaturas Ativas</span>
            </div>
            <div className="text-4xl font-black text-green-400">{stats.active}</div>
            <p className="text-white/40 text-sm mt-2 font-medium">Pagamentos em dia</p>
          </div>

          {/* Card 3: Inactive/Overdue */}
          <div className="bg-[#1c1c1e]/60 border border-white/5 backdrop-blur-xl rounded-[28px] p-6 shadow-xl flex flex-col hover:bg-[#1c1c1e]/80 transition-colors">
            <div className="flex items-center gap-4 mb-4 text-white/70">
              <div className="p-3 bg-red-500/20 text-red-400 rounded-[18px]">
                <Clock className="w-6 h-6" />
              </div>
              <span className="font-semibold">Inativas / Atrasadas</span>
            </div>
            <div className="text-4xl font-black text-red-400">{stats.inactive}</div>
            <p className="text-white/40 text-sm mt-2 font-medium">Requer atenção ou cobrança</p>
          </div>

          {/* Card 4: Watching Now */}
          <div className="bg-gradient-to-br from-orange-600/20 to-orange-900/20 border border-orange-500/20 backdrop-blur-xl rounded-[28px] p-6 shadow-[0_0_30px_rgba(234,88,12,0.15)] flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            <div className="flex items-center gap-4 mb-4 text-white/90">
              <div className="p-3 bg-orange-500 text-white rounded-[18px] shadow-lg animate-pulse">
                <Activity className="w-6 h-6" />
              </div>
              <span className="font-bold">Assistindo Agora</span>
            </div>
            <div className="text-5xl font-black text-white drop-shadow-md">{stats.watchingNow}</div>
            <p className="text-orange-200/60 text-sm mt-2 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping"></span>
              Ativos nos últimos 5 minutos
            </p>
          </div>

        </div>

        {/* Instalação do DB Info */}
        <div className="mt-12 bg-white/5 border border-white/10 rounded-[28px] p-8">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-orange-500" />
            Configuração de Administradores
          </h3>
          <p className="text-white/60 text-sm leading-relaxed mb-4 max-w-3xl">
            Para gerenciar quem tem acesso a este painel, acesse o painel do Firebase, vá em <strong>Firestore Database</strong> e crie uma coleção chamada <code className="bg-black/50 px-2 py-1 rounded text-orange-400">administradores</code>. Dentro dela, adicione documentos com os seguintes campos exatos:
          </p>
          <div className="bg-black/50 p-4 rounded-xl border border-white/5 inline-block text-sm text-white/80 font-mono">
            email: "seu@email.com"<br/>
            senha: "suasenha123"
          </div>
        </div>

      </div>
    </div>
  );
}
