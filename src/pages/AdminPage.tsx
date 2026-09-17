import React, { useState, useEffect } from "react";
import { Users, CreditCard, Clock, Activity, ShieldAlert, LogOut, ChevronLeft, Check, Copy, Search, Trash2, Key, User, ShieldCheck, Loader2, Pencil, X } from "lucide-react";
import { collection, getDocs, query, where, doc, setDoc, deleteDoc, updateDoc, deleteField } from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut, updateProfile, getAuth, signInWithEmailAndPassword, updateEmail, updatePassword } from "firebase/auth";
import { initializeApp, deleteApp } from "firebase/app";
import { auth, db, firebaseConfig } from "../services/firebase";
import { CustomDatePicker } from "../components/CustomDatePicker";

export interface ClientUser {
  id: string;
  name?: string;
  email: string;
  subscription: string;
  accessType?: "mensal" | "teste" | "vitalicio" | "4horas" | "1dia";
  expirationDate?: string;
  initialPassword?: string;
  createdAt?: string;
  lastActive?: string;
}

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

  // Client List State
  const [usersList, setUsersList] = useState<ClientUser[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // User Creation State
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [accessType, setAccessType] = useState<"mensal" | "teste" | "vitalicio" | "4horas" | "1dia">("mensal");
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccess, setCreateSuccess] = useState("");
  const [createError, setCreateError] = useState("");
  const [lastCreatedUser, setLastCreatedUser] = useState<{name?: string, email: string, password?: string, expirationDate: string} | null>(null);

  // Revoke Access State
  const [revokeEmail, setRevokeEmail] = useState("");
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState("");
  const [revokeError, setRevokeError] = useState("");
  const [confirmRevokeUser, setConfirmRevokeUser] = useState<ClientUser | null>(null);

  // Edit User State
  const [editingUser, setEditingUser] = useState<ClientUser | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

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
        // Tenta autenticar no Auth também, caso as regras do Firestore exijam request.auth
        try {
          const { signInWithEmailAndPassword } = await import("firebase/auth");
          await signInWithEmailAndPassword(auth, email, password);
        } catch (authErr) {
          console.warn("Autenticação secundária no Firebase Auth dispensada:", authErr);
        }
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
      let usersSnap = await getDocs(collection(db, "usuarios"));
      // Se usuarios estiver vazio, busca de users para migração pendente
      if (usersSnap.empty) {
        const legacySnap = await getDocs(collection(db, "users"));
        if (!legacySnap.empty) {
          usersSnap = legacySnap;
        }
      }

      let total = 0;
      let active = 0;
      let inactive = 0;
      let watchingNow = 0;
      const list: ClientUser[] = [];
      
      const fiveMinutesAgo = new Date();
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

      usersSnap.forEach((docSnap) => {
        total++;
        const data = docSnap.data();
        
        const isExplicitlyActive = (data.subscription === "ACTIVE" || data.assinatura === "ATIVA");
        const expDateStr = data.dataExpiracao || data.expirationDate;
        let isExpired = false;

        if (expDateStr) {
          const expDate = new Date(expDateStr);
          if (!isNaN(expDate.getTime()) && expDate.getFullYear() < 2099) {
            isExpired = expDate.getTime() <= Date.now();
          }
        }

        const activeStatus = isExplicitlyActive && !isExpired;

        if (activeStatus) {
          active++;
        } else {
          inactive++;
        }

        if (isExplicitlyActive && isExpired) {
          try {
            updateDoc(doc(db, "usuarios", docSnap.id), {
              assinatura: "EXPIRADA",
              subscription: "INACTIVE"
            });
          } catch(e) {}
        }

        // Pessoas assistindo nos últimos 5 minutos
        if (data.lastActive || data.ultimoAcesso) {
          const lastActiveDate = new Date(data.lastActive || data.ultimoAcesso);
          if (lastActiveDate >= fiveMinutesAgo) {
            watchingNow++;
          }
        }

        list.push({
          id: docSnap.id,
          name: data.nome || data.name || data.displayName || data.nomeExibicao || "",
          email: data.email || "Sem e-mail",
          subscription: activeStatus ? "ACTIVE" : "INACTIVE",
          accessType: data.tipoAcesso || data.accessType || "mensal",
          expirationDate: data.dataExpiracao || data.expirationDate,
          initialPassword: data.senha || data.senhaInicial || data.initialPassword,
          createdAt: data.criadoEm || data.createdAt,
          lastActive: data.ultimoAcesso || data.lastActive
        });
      });

      // Ordenar pelos mais recentes criados
      list.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });

      setUsersList(list);
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
    setCreateError("");
    setCreateSuccess("");

    // Validação estrita de campos obrigatórios
    if (!newName.trim()) {
      setCreateError("O campo Nome do Cliente é obrigatório.");
      return;
    }
    if (!newEmail.trim()) {
      setCreateError("O campo E-mail do Cliente é obrigatório.");
      return;
    }
    if (!newPassword.trim() || newPassword.length < 6) {
      setCreateError("A senha é obrigatória e deve ter pelo menos 6 caracteres.");
      return;
    }
    if (accessType === "mensal" && !paymentDate) {
      setCreateError("A data de pagamento é obrigatória para o plano mensal.");
      return;
    }

    setCreateLoading(true);

    try {
      // 1. Cria a conta no Authentication (isso fará login automaticamente como o usuário)
      const userCredential = await createUserWithEmailAndPassword(auth, newEmail.trim(), newPassword);
      
      // 2. Atualiza nome no perfil do Auth
      try {
        await updateProfile(userCredential.user, {
          displayName: newName.trim()
        });
      } catch (pErr) {
        console.warn("Falha ao atualizar displayName no Auth:", pErr);
      }

      // 3. Calcula data de expiração
      let expirationDate: Date;
      let payDate = new Date();
      let expireStr = "";
      
      if (accessType === "teste") {
        expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + 1);
        expireStr = "Em 1 hora (" + expirationDate.toLocaleTimeString('pt-BR') + ")";
      } else if (accessType === "4horas") {
        expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + 4);
        expireStr = "Em 4 horas (" + expirationDate.toLocaleTimeString('pt-BR') + ")";
      } else if (accessType === "1dia") {
        expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + 24);
        expireStr = "Em 1 dia (" + (expirationDate.toLocaleDateString('pt-BR') + " às " + expirationDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) + ")";
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

      // 4. Salva no banco de dados na coleção 'usuarios' com campos limpos em português
      await setDoc(doc(db, "usuarios", userCredential.user.uid), {
        email: newEmail.trim(),
        nome: newName.trim(),
        assinatura: "ATIVA",
        dataPagamento: payDate.toISOString(),
        dataExpiracao: expirationDate.toISOString(),
        criadoPorAdmin: true,
        tipoAcesso: accessType,
        senha: newPassword
      });

      // 5. Desloga do Auth (para não ficar logado como cliente no navegador do Admin)
      localStorage.removeItem("playinfinity_logged_in");
      localStorage.removeItem("playinfinity_playback_history");
      localStorage.removeItem("playinfinity_favorites");
      localStorage.removeItem("playinfinity_watched_episodes");
      localStorage.removeItem("playinfinity_watched_seasons");
      await signOut(auth);

      setCreateSuccess(`Cliente "${newName.trim()}" criado com sucesso! O acesso expira em: ${expireStr}`);
      setLastCreatedUser({
        name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        expirationDate: expireStr
      });
      
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      await loadStats();
    } catch (err: any) {
      // Se falhar (ex: email já existe), desloga só por garantia
      try { await signOut(auth); } catch(e){}
      setCreateError("Erro: " + err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRevokeDirect = (user: ClientUser) => {
    setConfirmRevokeUser(user);
  };

  const confirmRevokeAction = async () => {
    if (!confirmRevokeUser) return;
    try {
      await deleteDoc(doc(db, "usuarios", confirmRevokeUser.id));
      try { await deleteDoc(doc(db, "users", confirmRevokeUser.id)); } catch(e){}
      setRevokeSuccess(`Acesso de ${confirmRevokeUser.email} revogado com sucesso!`);
      await loadStats();
    } catch (err: any) {
      setRevokeError("Erro ao revogar acesso: " + err.message);
    } finally {
      setConfirmRevokeUser(null);
    }
  };

  const handleRevokeAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setRevokeLoading(true);
    setRevokeError("");
    setRevokeSuccess("");

    try {
      let q = query(collection(db, "usuarios"), where("email", "==", revokeEmail));
      let snap = await getDocs(q);

      if (snap.empty) {
        const qOld = query(collection(db, "users"), where("email", "==", revokeEmail));
        snap = await getDocs(qOld);
      }

      if (snap.empty) {
        setRevokeError("Nenhum cliente ativo encontrado com esse e-mail.");
        setRevokeLoading(false);
        return;
      }

      for (const document of snap.docs) {
        await deleteDoc(document.ref);
        try { await deleteDoc(doc(db, "usuarios", document.id)); } catch(e){}
        try { await deleteDoc(doc(db, "users", document.id)); } catch(e){}
      }

      setRevokeSuccess(`Acesso de ${revokeEmail} revogado com sucesso!`);
      setRevokeEmail("");
      await loadStats();
    } catch (err: any) {
      setRevokeError("Erro ao revogar acesso: " + err.message);
    } finally {
      setRevokeLoading(false);
    }
  };

  const handleOpenEdit = (user: ClientUser) => {
    setEditingUser(user);
    setEditName(user.name || "");
    setEditEmail(user.email || "");
    setEditPassword(user.initialPassword || "");
    setEditError("");
    setEditSuccess("");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditLoading(true);
    setEditError("");
    setEditSuccess("");

    const trimmedName = editName.trim();
    const trimmedEmail = editEmail.trim();
    const trimmedPass = editPassword.trim();

    if (!trimmedEmail) {
      setEditError("O e-mail não pode ficar em branco.");
      setEditLoading(false);
      return;
    }

    if (trimmedPass && trimmedPass.length < 6) {
      setEditError("A senha deve conter no mínimo 6 caracteres.");
      setEditLoading(false);
      return;
    }

    try {
      // 1. Atualiza na coleção 'usuarios' do Firestore
      const updates: any = {
        email: trimmedEmail,
      };
      if (trimmedName !== undefined) {
        updates.nome = trimmedName;
      }
      if (trimmedPass) {
        updates.senha = trimmedPass;
      }

      await updateDoc(doc(db, "usuarios", editingUser.id), updates);

      // 2. Se tiver senha anterior e for conhecida, sincroniza no Firebase Auth via app temporário
      const oldPass = editingUser.initialPassword;
      if (oldPass) {
        let tempApp: any = null;
        try {
          const tempAppName = `editAuth_${Date.now()}`;
          tempApp = initializeApp(firebaseConfig, tempAppName);
          const tempAuth = getAuth(tempApp);

          const userCred = await signInWithEmailAndPassword(tempAuth, editingUser.email, oldPass);
          if (trimmedPass && trimmedPass !== oldPass) {
            await updatePassword(userCred.user, trimmedPass);
          }
          if (trimmedEmail !== editingUser.email) {
            await updateEmail(userCred.user, trimmedEmail);
          }
        } catch (authErr: any) {
          console.warn("[AdminPage] Falha ao sincronizar alteração no Firebase Auth:", authErr);
        } finally {
          if (tempApp) {
            try { await deleteApp(tempApp); } catch(e) {}
          }
        }
      }

      setEditSuccess("Credenciais atualizadas com sucesso!");
      await loadStats();
      setTimeout(() => {
        setEditingUser(null);
        setEditSuccess("");
      }, 1000);
    } catch (err: any) {
      setEditError("Erro ao salvar: " + err.message);
    } finally {
      setEditLoading(false);
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

          <div className="flex items-center gap-2">
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

        {/* Lista de Clientes Cadastrados */}
        <div className="mt-12 bg-[#1c1c1e]/60 border border-white/10 backdrop-blur-xl rounded-[28px] p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-bold text-white">Clientes Cadastrados</h3>
                <span className="px-3 py-1 bg-white/10 text-white/80 rounded-full text-xs font-semibold">
                  {usersList.length} {usersList.length === 1 ? 'cliente' : 'clientes'}
                </span>
              </div>
              <p className="text-white/50 text-sm mt-1 ml-11">
                Visualize todos os acessos criados, credenciais, planos e gerencie assinaturas.
              </p>
            </div>

            {/* Barra de Pesquisa */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-white/40 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome ou e-mail..."
                className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-2.5 pl-11 pr-4 text-white placeholder-white/30 text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
              />
            </div>
          </div>

          {usersList.filter(u => {
            const q = searchTerm.toLowerCase();
            return (
              (u.name && u.name.toLowerCase().includes(q)) ||
              u.email.toLowerCase().includes(q) ||
              (u.accessType && u.accessType.toLowerCase().includes(q))
            );
          }).length === 0 ? (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-[22px] bg-white/[0.02]">
              <Users className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/50 text-sm font-medium">
                {searchTerm ? "Nenhum cliente encontrado com esse termo." : "Nenhum cliente cadastrado no banco de dados."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {usersList
                .filter(u => {
                  const q = searchTerm.toLowerCase();
                  return (
                    (u.name && u.name.toLowerCase().includes(q)) ||
                    u.email.toLowerCase().includes(q) ||
                    (u.accessType && u.accessType.toLowerCase().includes(q))
                  );
                })
                .map((client) => {
                  const initial = (client.name || client.email || 'U').charAt(0).toUpperCase();
                  let expireLabel = "Não definida";
                  if (client.expirationDate) {
                    const d = new Date(client.expirationDate);
                    if (d.getFullYear() >= 2099) {
                      expireLabel = "Vitalício (Permanente)";
                    } else {
                      expireLabel = d.toLocaleDateString('pt-BR') + (client.accessType === 'teste' || client.accessType === '4horas' || client.accessType === '1dia' ? ` às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '');
                    }
                  }

                  const isActive = client.subscription === "ACTIVE";
                  
                  let isExpiredClient = false;
                  if (client.expirationDate) {
                    const d = new Date(client.expirationDate);
                    if (!isNaN(d.getTime()) && d.getFullYear() < 2099 && d.getTime() <= Date.now()) {
                      isExpiredClient = true;
                    }
                  }

                  return (
                    <div
                      key={client.id}
                      className="bg-black/40 hover:bg-black/60 border border-white/5 hover:border-white/15 rounded-[22px] p-4 sm:p-5 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      {/* Perfil & Identificação */}
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-orange-600 to-orange-400 flex items-center justify-center font-black text-lg text-white shadow-[0_0_15px_rgba(234,88,12,0.4)] shrink-0">
                          {initial}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-[15px] truncate">
                              {client.name || "Sem nome informado"}
                            </span>
                            
                            {/* Badge Tipo de Acesso */}
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                              client.accessType === 'vitalicio'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : client.accessType === 'teste'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : client.accessType === '4horas'
                                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                : client.accessType === '1dia'
                                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}>
                              {client.accessType === 'vitalicio' ? 'Vitalício' : client.accessType === 'teste' ? 'Teste 1h' : client.accessType === '4horas' ? '4 Horas' : client.accessType === '1dia' ? '1 Dia' : 'Mensal'}
                            </span>

                            {/* Badge Status */}
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              isActive
                                ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                                : isExpiredClient
                                ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                                : 'bg-red-500/15 text-red-400 border border-red-500/30'
                            }`}>
                              {isActive ? 'Ativo' : isExpiredClient ? 'Expirado' : 'Inativo'}
                            </span>
                          </div>

                          {/* E-mail com cópia */}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-white/60 text-xs font-mono truncate">{client.email}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(client.email, `email-${client.id}`)}
                              title="Copiar e-mail"
                              className="text-white/40 hover:text-white p-1 hover:bg-white/10 rounded transition-colors"
                            >
                              {copiedKey === `email-${client.id}` ? (
                                <Check className="w-3.5 h-3.5 text-green-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Senha, Vencimento & Ações */}
                      <div className="flex flex-wrap items-center gap-3 lg:gap-4 text-xs text-white/70">
                        {/* Senha */}
                        <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 flex items-center gap-2">
                          <Key className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                          <span className="text-white/40">Senha:</span>
                          {client.initialPassword ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-orange-300">{client.initialPassword}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(client.initialPassword!, `pass-${client.id}`)}
                                title="Copiar senha"
                                className="text-white/40 hover:text-white p-0.5 hover:bg-white/10 rounded transition-colors"
                              >
                                {copiedKey === `pass-${client.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-green-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-white/30 italic text-[11px]">(Criptografada no Firebase)</span>
                          )}
                        </div>

                        {/* Vencimento */}
                        <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-white/40 shrink-0" />
                          <span className="text-white/40">Vence:</span>
                          <span className="font-medium text-white/90">{expireLabel}</span>
                        </div>

                        {/* Botão de Editar Credenciais */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(client)}
                          title="Editar e-mail e senha do cliente"
                          className="px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 font-bold"
                        >
                          <Pencil className="w-4 h-4" />
                          <span>Editar</span>
                        </button>

                        {/* Botão de Revogar Acesso */}
                        <button
                          type="button"
                          onClick={() => handleRevokeDirect(client)}
                          title="Revogar acesso do cliente"
                          className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 font-bold"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Revogar</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Último Cliente Cadastrado */}
        {lastCreatedUser && (
          <div className="mt-8 bg-green-500/10 border border-green-500/20 backdrop-blur-xl rounded-[28px] p-8 animate-fade-in">
            <h3 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-green-400" />
              Credenciais do Último Cliente Cadastrado
            </h3>
            <p className="text-white/60 text-sm leading-relaxed mb-4 max-w-3xl">
              Guarde essas informações e envie para o seu cliente (ou use o e-mail caso precise revogar o acesso dele depois).
            </p>
            <div className="bg-black/60 p-5 rounded-xl border border-white/5 inline-block text-sm text-white/90 font-mono tracking-wide">
              {lastCreatedUser.name && (
                <>Nome: <strong className="text-white">{lastCreatedUser.name}</strong><br/></>
              )}
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
                  className={`flex-1 py-3 px-2 rounded-[22px] font-bold text-[11px] sm:text-xs transition-all ${
                    accessType === 'teste' 
                      ? 'bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.4)]' 
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  1 Hora
                </button>
                <button
                  type="button"
                  onClick={() => setAccessType('4horas')}
                  className={`flex-1 py-3 px-2 rounded-[22px] font-bold text-[11px] sm:text-xs transition-all ${
                    accessType === '4horas' 
                      ? 'bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.4)]' 
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  4 Horas
                </button>
                <button
                  type="button"
                  onClick={() => setAccessType('1dia')}
                  className={`flex-1 py-3 px-2 rounded-[22px] font-bold text-[11px] sm:text-xs transition-all ${
                    accessType === '1dia' 
                      ? 'bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.4)]' 
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  1 Dia
                </button>
                <button
                  type="button"
                  onClick={() => setAccessType('mensal')}
                  className={`flex-1 py-3 px-2 rounded-[22px] font-bold text-[11px] sm:text-xs transition-all ${
                    accessType === 'mensal' 
                      ? 'bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.4)]' 
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  Mensal
                </button>
                <button
                  type="button"
                  onClick={() => setAccessType('vitalicio')}
                  className={`flex-1 py-3 px-2 rounded-[22px] font-bold text-[11px] sm:text-xs transition-all ${
                    accessType === 'vitalicio' 
                      ? 'bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.4)]' 
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  Vitalício
                </button>
              </div>
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 ${accessType === 'mensal' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
              <div>
                <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider ml-2">
                  Nome do Cliente <span className="text-orange-500">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-3.5 px-5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px] rounded-[22px]"
                  placeholder="Ex: João Silva"
                  required
                />
              </div>

              <div>
                <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider ml-2">
                  E-mail do Cliente <span className="text-orange-500">*</span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-3.5 px-5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px] rounded-[22px]"
                  placeholder="cliente@email.com"
                  required
                />
              </div>
              
              <div>
                <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider ml-2">
                  Senha Criada <span className="text-orange-500">*</span>
                </label>
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
                <div>
                  <CustomDatePicker 
                    label="Data do Pagamento *"
                    value={paymentDate}
                    onChange={(date) => setPaymentDate(date)}
                  />
                </div>
              )}

              <div className="flex items-end">
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



      </div>

      {/* Modal de Edição de Credenciais */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#1c1c1e] border border-white/10 rounded-[28px] p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="absolute top-5 right-5 p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-orange-500/20 text-orange-500 rounded-2xl">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Editar Acesso</h3>
                <p className="text-xs text-white/50">{editingUser.name || editingUser.email}</p>
              </div>
            </div>

            {editSuccess && (
              <div className="mb-4 p-3.5 bg-green-500/10 border border-green-500/20 rounded-2xl text-green-400 text-sm font-medium">
                ✅ {editSuccess}
              </div>
            )}

            {editError && (
              <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-medium">
                ❌ {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider">Nome</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 py-3 px-4 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-medium"
                  placeholder="Nome do cliente (opcional)"
                />
              </div>

              <div>
                <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider">E-mail</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  className="w-full bg-white/5 border border-white/10 py-3 px-4 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-medium"
                  placeholder="cliente@email.com"
                />
              </div>

              <div>
                <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider">Nova Senha</label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 py-3 px-4 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-medium font-mono"
                  placeholder="Mínimo 6 caracteres"
                />
                <p className="text-[11px] text-white/40 mt-1">Deixe como está ou digite a nova senha desejada.</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold transition-all disabled:opacity-50 shadow-lg shadow-orange-600/30 flex items-center gap-2"
                >
                  {editLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editLoading ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Revogação */}
      {confirmRevokeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#1c1c1e] border border-white/10 rounded-[28px] p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <button
              type="button"
              onClick={() => setConfirmRevokeUser(null)}
              className="absolute top-5 right-5 p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-red-500/20 text-red-500 rounded-2xl">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Revogar Acesso</h3>
                <p className="text-xs text-white/50">{confirmRevokeUser.name || confirmRevokeUser.email}</p>
              </div>
            </div>

            <p className="text-white/80 text-sm mb-6 leading-relaxed">
              Tem certeza que deseja revogar o acesso de <strong className="text-white">{confirmRevokeUser.name ? `${confirmRevokeUser.name} (${confirmRevokeUser.email})` : confirmRevokeUser.email}</strong>?
              <br/><br/>
              <span className="text-red-400">O cliente perderá acesso imediatamente.</span>
            </p>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setConfirmRevokeUser(null)}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRevokeAction}
                className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-all shadow-lg shadow-red-600/30 flex items-center gap-2"
              >
                Sim, Revogar Acesso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
