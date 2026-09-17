import React, { useState, useEffect } from "react";
import { Users, CreditCard, Clock, Activity, ShieldAlert, LogOut, ChevronLeft, Check } from "lucide-react";
import { collection, getDocs, query, where, doc, setDoc, deleteDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "../services/firebase";
import { CustomDatePicker } from "../components/CustomDatePicker";

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

  // User Creation State
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [accessType, setAccessType] = useState<"mensal" | "teste" | "vitalicio">("mensal");
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccess, setCreateSuccess] = useState("");
  const [createError, setCreateError] = useState("");
  const [lastCreatedUser, setLastCreatedUser] = useState<{email: string, password?: string, expirationDate: string} | null>(null);

  // Revoke Access State
  const [revokeEmail, setRevokeEmail] = useState("");
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState("");
  const [revokeError, setRevokeError] = useState("");

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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError("");
    setCreateSuccess("");

    try {
      // 1. Cria a conta no Authentication (isso fará login automaticamente como o usuário)
      const userCredential = await createUserWithEmailAndPassword(auth, newEmail, newPassword);
      
      // 2. Calcula data de expiração
      let expirationDate: Date;
      let payDate = new Date();
      let expireStr = "";
      
      if (accessType === "teste") {
        expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + 1);
        expireStr = "Em 1 hora (" + expirationDate.toLocaleTimeString('pt-BR') + ")";
      } else if (accessType === "vitalicio") {
        expirationDate = new Date();
        expirationDate.setFullYear(2099);
        expireStr = "Vitalício (Permanente)";
      } else {
        payDate = new Date(paymentDate + "T12:00:00");
        expirationDate = new Date(payDate);
        expirationDate.setMonth(expirationDate.getMonth() + 1);
        expireStr = expirationDate.toLocaleDateString('pt-BR');
      }

      // 3. Salva no banco de dados como ACTIVE e salva as datas
      await setDoc(doc(db, "users", userCredential.user.uid), {
        email: newEmail,
        subscription: "ACTIVE",
        paymentDate: payDate.toISOString(),
        expirationDate: expirationDate.toISOString(),
        createdAt: new Date().toISOString(),
        createdByAdmin: true,
        accessType: accessType
      });

      // 4. Desloga do Auth (para não ficar logado como cliente no navegador do Admin)
      await signOut(auth);

      setCreateSuccess(`Cliente criado! O acesso expira em: ${expireStr}`);
      setLastCreatedUser({
        email: newEmail,
        password: newPassword,
        expirationDate: expireStr
      });
      
      setNewEmail("");
      setNewPassword("");
      loadStats();
    } catch (err: any) {
      // Se falhar (ex: email já existe), desloga só por garantia
      try { await signOut(auth); } catch(e){}
      setCreateError("Erro: " + err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRevokeAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setRevokeLoading(true);
    setRevokeError("");
    setRevokeSuccess("");

    try {
      const q = query(collection(db, "users"), where("email", "==", revokeEmail));
      const snap = await getDocs(q);

      if (snap.empty) {
        setRevokeError("Nenhum cliente ativo encontrado com esse e-mail.");
        setRevokeLoading(false);
        return;
      }

      for (const document of snap.docs) {
        await deleteDoc(doc(db, "users", document.id));
      }

      setRevokeSuccess(`Acesso de ${revokeEmail} revogado com sucesso!`);
      setRevokeEmail("");
      loadStats();
    } catch (err: any) {
      setRevokeError("Erro ao revogar acesso: " + err.message);
    } finally {
      setRevokeLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-[#1c1c1e]/80 backdrop-blur-3xl border border-white/10 w-full max-w-sm rounded-[28px] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-8 sm:p-10 animate-fade-in">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          <h2 className="text-[24px] font-extrabold text-white text-center mb-2">Bem-vindo(a) de volta!</h2>
          <p className="text-white/50 text-[14px] text-center mb-8">Acesso restrito à equipe administrativa.</p>

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

        {/* Último Cliente Cadastrado */}
        {lastCreatedUser && (
          <div className="mt-12 bg-green-500/10 border border-green-500/20 backdrop-blur-xl rounded-[28px] p-8 animate-fade-in">
            <h3 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-green-400" />
              Credenciais do Último Cliente Cadastrado
            </h3>
            <p className="text-white/60 text-sm leading-relaxed mb-4 max-w-3xl">
              Guarde essas informações e envie para o seu cliente (ou use o e-mail caso precise revogar o acesso dele depois).
            </p>
            <div className="bg-black/60 p-5 rounded-xl border border-white/5 inline-block text-sm text-white/90 font-mono tracking-wide">
              E-mail: <strong className="text-orange-400">{lastCreatedUser.email}</strong><br/>
              Senha: <strong className="text-orange-400">{lastCreatedUser.password}</strong><br/>
              Vencimento: <span className="text-white/70">{lastCreatedUser.expirationDate}</span>
            </div>
          </div>
        )}

        {/* Cadastro Manual de Usuário (PIX) */}
        <div className="mt-8 bg-[#1c1c1e]/60 border border-white/10 backdrop-blur-xl rounded-[28px] p-8 mb-12 shadow-xl relative z-10">
          <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 text-orange-500 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            Cadastrar Cliente Manualmente
          </h3>
          <p className="text-white/50 text-sm mb-6 max-w-2xl">
            Crie acessos para seus clientes. Escolha o tipo de acesso desejado e gere as credenciais instantaneamente.
          </p>

          {createSuccess && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-[20px] text-green-400 font-medium">
              ✅ {createSuccess}
            </div>
          )}
          
          {createError && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-[20px] text-red-400 font-medium">
              ❌ {createError}
            </div>
          )}

          <form onSubmit={handleCreateUser} className="space-y-5">
            {/* Tipo de Acesso (Segmented Control) */}
            <div>
              <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider ml-2">Tipo de Acesso</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setAccessType('teste')}
                  className={`flex-1 py-3 px-4 rounded-[22px] font-bold text-sm transition-all ${
                    accessType === 'teste' 
                      ? 'bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.4)]' 
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  Teste (1 Hora)
                </button>
                <button
                  type="button"
                  onClick={() => setAccessType('mensal')}
                  className={`flex-1 py-3 px-4 rounded-[22px] font-bold text-sm transition-all ${
                    accessType === 'mensal' 
                      ? 'bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.4)]' 
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  Mensal (1 Mês)
                </button>
                <button
                  type="button"
                  onClick={() => setAccessType('vitalicio')}
                  className={`flex-1 py-3 px-4 rounded-[22px] font-bold text-sm transition-all ${
                    accessType === 'vitalicio' 
                      ? 'bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.4)]' 
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  Vitalício
                </button>
              </div>
            </div>

            <div className={`grid grid-cols-1 ${accessType === 'mensal' ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
              <div className="md:col-span-1">
                <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider ml-2">E-mail do Cliente</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-3.5 px-5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px] rounded-[22px]"
                  placeholder="cliente@email.com"
                  required
                />
              </div>
              
              <div className="md:col-span-1">
                <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider ml-2">Senha Criada</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-3.5 px-5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px] rounded-[22px]"
                  placeholder="Ex: 123456"
                  minLength={6}
                  required
                />
              </div>

              {accessType === 'mensal' && (
                <div className="md:col-span-1">
                  <CustomDatePicker 
                    label="Data do Pagamento"
                    value={paymentDate}
                    onChange={(date) => setPaymentDate(date)}
                  />
                </div>
              )}

              <div className="md:col-span-1 flex items-end">
                <button
                  type="submit"
                  disabled={createLoading}
                  className="w-full h-[52px] bg-orange-600 hover:bg-orange-500 active:scale-[0.98] text-white font-bold text-[15px] rounded-[22px] transition-all disabled:opacity-50 shadow-[0_4px_14px_rgba(234,88,12,0.4)]"
                >
                  {createLoading ? "Criando..." : "Criar Acesso"}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Revogar Acesso (Deletar Conta) */}
        <div className="mt-8 bg-red-950/20 border border-red-500/20 backdrop-blur-xl rounded-[28px] p-8 shadow-xl">
          <h3 className="text-2xl font-bold text-red-500 mb-2 flex items-center gap-3">
            <div className="p-2 bg-red-500/20 text-red-500 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </div>
            Revogar Acesso (Suspender)
          </h3>
          <p className="text-white/50 text-sm mb-6 max-w-2xl">
            Digite o e-mail do cliente para deletar a assinatura dele do banco de dados. Ele perderá o acesso premium imediatamente e cairá na tela de pagamento caso tente assistir algo.
          </p>

          {revokeSuccess && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-[20px] text-green-400 font-medium">
              ✅ {revokeSuccess}
            </div>
          )}
          
          {revokeError && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-[20px] text-red-400 font-medium">
              ❌ {revokeError}
            </div>
          )}

          <form onSubmit={handleRevokeAccess} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider ml-2">E-mail do Cliente para Excluir</label>
              <input
                type="email"
                value={revokeEmail}
                onChange={(e) => setRevokeEmail(e.target.value)}
                className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-3.5 px-5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all font-medium text-[15px] rounded-[22px]"
                placeholder="cliente@email.com"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={revokeLoading}
              className="w-full md:w-auto h-[52px] px-8 bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-bold text-[15px] rounded-[22px] transition-all disabled:opacity-50 shadow-[0_4px_14px_rgba(220,38,38,0.4)] whitespace-nowrap"
            >
              {revokeLoading ? "Excluindo..." : "Revogar Acesso"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
