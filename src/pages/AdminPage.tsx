import React, { useState, useEffect } from "react";
import { Users, CreditCard, Clock, Activity, ShieldAlert, LogOut, ChevronLeft, Check, Copy, Search, Trash2, Key, User, ShieldCheck, Loader2, Pencil, X, Timer, Calendar, Plus, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import { collection, getDocs, query, where, doc, setDoc, deleteDoc, updateDoc, deleteField } from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut, updateProfile, getAuth, signInWithEmailAndPassword, updateEmail, updatePassword } from "firebase/auth";
import { initializeApp, deleteApp } from "firebase/app";
import { auth, db, firebaseConfig } from "../services/firebase";
import { CustomDatePicker } from "../components/CustomDatePicker";
import { getFriendlyErrorMessage } from "../utils/errorTranslator";
import { TurnstileWidget } from "../components/TurnstileWidget";

export interface ClientUser {
  id: string;
  name?: string;
  email: string;
  subscription: string;
  accessType?: "mensal" | "teste" | "vitalicio" | "4horas" | "1dia" | "30min" | "7dias";
  monthlyFee?: string;
  expirationDate?: string;
  initialPassword?: string;
  createdAt?: string;
  lastActive?: string;
}

interface AdminPageProps {
  onBack: () => void;
}

export function AdminPage({ onBack }: AdminPageProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(!!sessionStorage.getItem("adminSessionToken"));

  useEffect(() => {
    const checkAuth = async () => {
      const token = sessionStorage.getItem("adminSessionToken");
      if (!token) {
        setIsCheckingAuth(false);
        return;
      }

      try {
        const { getDoc, doc } = await import("firebase/firestore");
        const docRef = doc(db, "administradores", token);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setIsAdmin(true);
        } else {
          sessionStorage.removeItem("adminSessionToken");
          setIsAdmin(false);
        }
      } catch (err) {
        sessionStorage.removeItem("adminSessionToken");
        setIsAdmin(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };
    
    checkAuth();
  }, []);
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
  const [accessType, setAccessType] = useState<"mensal" | "teste" | "vitalicio" | "4horas" | "1dia" | "30min" | "7dias">("mensal");
  const [monthlyPrice, setMonthlyPrice] = useState<"9.90" | "13.00">("13.00");
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccess, setCreateSuccess] = useState("");
  const [createError, setCreateError] = useState("");
  const [lastCreatedUser, setLastCreatedUser] = useState<{name?: string, email: string, password?: string, expirationDate: string, monthlyFee?: string} | null>(null);

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
  const [editMonthlyPrice, setEditMonthlyPrice] = useState<"9.90" | "13.00">("13.00");
  const [editAccessType, setEditAccessType] = useState<"mensal" | "teste" | "vitalicio" | "4horas" | "1dia">("mensal");
  const [editExpirationDate, setEditExpirationDate] = useState("");
  const [quickExtendLoadingId, setQuickExtendLoadingId] = useState<string | null>(null);
  const [actionSuccessToast, setActionSuccessToast] = useState<string | null>(null);
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
    setError("");
    setLoading(true);

    try {
      const q = query(
        collection(db, "administradores"),
        where("email", "==", email),
        where("senha", "==", password)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const adminDoc = querySnapshot.docs[0];
        setIsAdmin(true);
        sessionStorage.setItem("adminSessionToken", adminDoc.id);
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
      setError(getFriendlyErrorMessage(err, "Erro ao autenticar. Verifique suas credenciais."));
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

        const rawFee = data.valorMensalidade ?? data.valor ?? data.monthlyFee;
        let feeFormatted: string | undefined = undefined;
        if (rawFee !== undefined && rawFee !== null && rawFee !== "") {
          if (typeof rawFee === "number") {
            feeFormatted = rawFee === 13 ? "13,00" : "9,90";
          } else {
            const str = String(rawFee);
            feeFormatted = str.includes("13") ? "13,00" : "9,90";
          }
        } else if ((data.tipoAcesso || data.accessType || "mensal") === "mensal") {
          const createdDate = data.criadoEm || data.createdAt;
          const isLegacy = !createdDate || new Date(createdDate) < new Date("2026-09-19T00:00:00-03:00");
          const assignedNum = isLegacy ? 9.90 : 13.00;
          const assignedTxt = isLegacy ? "9,90" : "13,00";
          feeFormatted = assignedTxt;
          
          // Grava automaticamente o campo no documento do cliente no Firestore
          try {
            updateDoc(doc(db, "usuarios", docSnap.id), {
              valorMensalidade: assignedNum,
              valor: assignedTxt
            }).catch(() => {});
          } catch(e) {}
        }

        list.push({
          id: docSnap.id,
          name: data.nome || data.name || data.displayName || data.nomeExibicao || "",
          email: data.email || "Sem e-mail",
          subscription: activeStatus ? "ACTIVE" : "INACTIVE",
          accessType: data.tipoAcesso || data.accessType || "mensal",
          monthlyFee: feeFormatted,
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

    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setCreateError("O campo E-mail do Cliente é obrigatório.");
      return;
    }

    // Validação preventiva de erros comuns de digitação de e-mail
    if (cleanEmail.includes(".@")) {
      setCreateError("O e-mail contém um ponto '.' antes do '@' (ex: '01.@'). Remova esse ponto para prosseguir.");
      return;
    }
    if (cleanEmail.includes("@.") || cleanEmail.endsWith(".")) {
      setCreateError("O e-mail contém um ponto '.' em posição inválida. Verifique a digitação.");
      return;
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(cleanEmail)) {
      setCreateError("Formato de e-mail inválido. Verifique se digitou corretamente (ex: cliente@hotmail.com).");
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
    let tempApp: any = null;

    try {
      const tempAppName = `createAuth_${Date.now()}`;
      tempApp = initializeApp(firebaseConfig, tempAppName);
      const tempAuth = getAuth(tempApp);

      let userUid = "";

      try {
        // 1. Cria a conta no Authentication usando app secundário isolado
        const userCredential = await createUserWithEmailAndPassword(tempAuth, cleanEmail, newPassword);
        userUid = userCredential.user.uid;
        
        // 2. Atualiza nome no perfil do Auth
        try {
          await updateProfile(userCredential.user, {
            displayName: newName.trim()
          });
        } catch (pErr) {
          console.warn("Falha ao atualizar displayName no Auth:", pErr);
        }
      } catch (authErr: any) {
        if (authErr.code === "auth/email-already-in-use") {
          // Verifica se o usuário já possui cadastro ativo no banco de dados
          const existingSnap = await getDocs(query(collection(db, "usuarios"), where("email", "==", cleanEmail)));
          if (!existingSnap.empty) {
            throw authErr;
          }
          // Caso a conta Auth exista mas estivesse órfã (sem registro em usuarios), tenta recuperar o UID
          try {
            const loginCred = await signInWithEmailAndPassword(tempAuth, cleanEmail, newPassword);
            userUid = loginCred.user.uid;
            try {
              await updateProfile(loginCred.user, { displayName: newName.trim() });
            } catch (e) {}
          } catch (loginErr: any) {
            // Se a senha for diferente da existente no Auth, informa que o e-mail já existe
            throw authErr;
          }
        } else {
          throw authErr;
        }
      }

      // 3. Calcula data de expiração
      let expirationDate: Date;
      let payDate = new Date();
      let expireStr = "";
      
      if (accessType === "teste") {
        expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + 1);
        expireStr = "Em 1 hora (" + expirationDate.toLocaleTimeString('pt-BR') + ")";
      } else if (accessType === "30min") {
        expirationDate = new Date(Date.now() + 30 * 60 * 1000);
        expireStr = "Em 30 minutos (" + expirationDate.toLocaleTimeString('pt-BR') + ")";
      } else if (accessType === "4horas") {
        expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + 4);
        expireStr = "Em 4 horas (" + expirationDate.toLocaleTimeString('pt-BR') + ")";
      } else if (accessType === "1dia") {
        expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + 24);
        expireStr = "Em 1 dia (" + (expirationDate.toLocaleDateString('pt-BR') + " às " + expirationDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) + ")";
      } else if (accessType === "7dias") {
        expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + 168);
        expireStr = "Em 7 dias (" + expirationDate.toLocaleDateString('pt-BR') + " às " + expirationDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ")";
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
      const valorNum = monthlyPrice === "13.00" ? 13.00 : 9.90;
      const valorTxt = monthlyPrice === "13.00" ? "13,00" : "9,90";

      await setDoc(doc(db, "usuarios", userUid), {
        email: cleanEmail,
        nome: newName.trim(),
        assinatura: "ATIVA",
        dataPagamento: payDate.toISOString(),
        dataExpiracao: expirationDate.toISOString(),
        criadoPorAdmin: true,
        tipoAcesso: accessType,
        valorMensalidade: accessType === "mensal" ? valorNum : null,
        valor: accessType === "mensal" ? valorTxt : null,
        senha: newPassword,
        criadoEm: new Date().toISOString()
      });

      setCreateSuccess(`Cliente "${newName.trim()}" criado com sucesso!${accessType === 'mensal' ? ` Mensalidade: R$ ${valorTxt}.` : ''} O acesso expira em: ${expireStr}`);
      setLastCreatedUser({
        name: newName.trim(),
        email: cleanEmail,
        password: newPassword,
        expirationDate: expireStr,
        monthlyFee: accessType === 'mensal' ? `R$ ${valorTxt}` : undefined
      });
      
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setMonthlyPrice("13.00");
      await loadStats();
    } catch (err: any) {
      setCreateError(getFriendlyErrorMessage(err, "Não foi possível criar o acesso do cliente."));
    } finally {
      if (tempApp) {
        try { await deleteApp(tempApp); } catch(e){}
      }
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
      setRevokeError(getFriendlyErrorMessage(err, "Erro ao revogar acesso do cliente."));
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
      setRevokeError(getFriendlyErrorMessage(err, "Erro ao revogar acesso do cliente."));
    } finally {
      setRevokeLoading(false);
    }
  };

  const formatIsoToLocalInput = (isoStr?: string) => {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return "";
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  };

  const handleOpenEdit = (user: ClientUser) => {
    setEditingUser(user);
    setEditName(user.name || "");
    setEditEmail(user.email || "");
    setEditPassword(user.initialPassword || "");
    setEditAccessType(user.accessType || "mensal");
    setEditMonthlyPrice(user.monthlyFee?.includes("9,90") || user.monthlyFee?.includes("9.90") ? "9.90" : "13.00");
    setEditExpirationDate(formatIsoToLocalInput(user.expirationDate));
    setEditError("");
    setEditSuccess("");
  };

  const applyQuickEditDuration = (
    hours: number | "vitalicio",
    type: "teste" | "4horas" | "1dia" | "mensal" | "vitalicio" | "30min" | "7dias"
  ) => {
    setEditAccessType(type);
    if (type === "vitalicio" || hours === "vitalicio") {
      const vit = new Date();
      vit.setFullYear(2099);
      setEditExpirationDate(formatIsoToLocalInput(vit.toISOString()));
      return;
    }

    const now = Date.now();
    let baseTime = now;
    if (editExpirationDate) {
      const parsed = new Date(editExpirationDate).getTime();
      if (!isNaN(parsed) && parsed > now) {
        baseTime = parsed;
      }
    }

    const target = new Date(baseTime + hours * 60 * 60 * 1000);
    setEditExpirationDate(formatIsoToLocalInput(target.toISOString()));
  };

  const applyFromNow = (
    hours: number,
    type: "teste" | "4horas" | "1dia" | "mensal" | "30min" | "7dias"
  ) => {
    setEditAccessType(type);
    const target = new Date(Date.now() + hours * 60 * 60 * 1000);
    setEditExpirationDate(formatIsoToLocalInput(target.toISOString()));
  };

  const handleQuickExtend = async (
    client: ClientUser, 
    hoursToAdd: number, 
    newType: "teste" | "4horas" | "1dia" | "mensal" | "30min" | "7dias"
  ) => {
    setQuickExtendLoadingId(client.id);
    try {
      const now = Date.now();
      let baseTime = now;
      if (client.expirationDate) {
        const prev = new Date(client.expirationDate).getTime();
        // Se ainda não expirou, soma ao tempo restante; se já expirou, renova a partir de agora
        if (!isNaN(prev) && prev > now) {
          baseTime = prev;
        }
      }

      const targetDate = new Date(baseTime + hoursToAdd * 60 * 60 * 1000);
      const updates: any = {
        assinatura: "ATIVA",
        subscription: "ACTIVE",
        dataExpiracao: targetDate.toISOString(),
        expirationDate: targetDate.toISOString(),
        tipoAcesso: newType,
        accessType: newType,
      };

      await updateDoc(doc(db, "usuarios", client.id), updates);
      try {
        await updateDoc(doc(db, "users", client.id), updates);
      } catch(e) {}

      const durationLabel = hoursToAdd === 0.5 ? "30 minutos" : hoursToAdd === 1 ? "1 hora" : hoursToAdd === 4 ? "4 horas" : hoursToAdd === 24 ? "1 dia" : hoursToAdd === 168 ? "7 dias" : `${hoursToAdd} horas`;
      setActionSuccessToast(`Acesso de "${client.name || client.email}" renovado com sucesso por mais ${durationLabel}!`);
      setTimeout(() => setActionSuccessToast(null), 4000);

      await loadStats();
    } catch (err: any) {
      console.error("Erro ao renovar tempo:", err);
      alert(getFriendlyErrorMessage(err, "Erro ao renovar tempo de acesso."));
    } finally {
      setQuickExtendLoadingId(null);
    }
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
        tipoAcesso: editAccessType,
        accessType: editAccessType,
      };
      if (trimmedName !== undefined) {
        updates.nome = trimmedName;
      }
      if (trimmedPass) {
        updates.senha = trimmedPass;
      }

      if (editAccessType === "vitalicio") {
        const vit = new Date();
        vit.setFullYear(2099);
        updates.dataExpiracao = vit.toISOString();
        updates.expirationDate = vit.toISOString();
        updates.assinatura = "ATIVA";
        updates.subscription = "ACTIVE";
      } else if (editExpirationDate) {
        const expDate = new Date(editExpirationDate);
        if (!isNaN(expDate.getTime())) {
          updates.dataExpiracao = expDate.toISOString();
          updates.expirationDate = expDate.toISOString();
          if (expDate.getTime() > Date.now()) {
            updates.assinatura = "ATIVA";
            updates.subscription = "ACTIVE";
          } else {
            updates.assinatura = "EXPIRADA";
            updates.subscription = "INACTIVE";
          }
        }
      }

      if (editAccessType === "mensal") {
        updates.valorMensalidade = editMonthlyPrice === "13.00" ? 13.00 : 9.90;
        updates.valor = editMonthlyPrice === "13.00" ? "13,00" : "9,90";
      } else {
        updates.valorMensalidade = null;
        updates.valor = null;
      }

      await updateDoc(doc(db, "usuarios", editingUser.id), updates);
      try {
        await updateDoc(doc(db, "users", editingUser.id), updates);
      } catch(e) {}

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
          if (trimmedEmail !== editingUser.email) {
            // Avisa o administrador se o Firebase rejeitou a troca de e-mail (ex: e-mail já em uso ou proteção do Firebase)
            const msg = authErr?.code === "auth/email-already-in-use" 
              ? "Este novo e-mail já está cadastrado em outra conta." 
              : authErr?.code === "auth/requires-recent-login"
              ? "O Firebase exigiu recadastro. Recomendado criar um novo usuário com o e-mail oficial."
              : (authErr?.message || "Erro de sincronização de login.");
            setEditError(`Aviso: Os dados foram salvos no painel, mas o login oficial no Firebase Auth falhou: ${msg}`);
            setEditLoading(false);
            return;
          }
        } finally {
          if (tempApp) {
            try { await deleteApp(tempApp); } catch(e) {}
          }
        }
      }

      setEditSuccess("Dados e tempo de acesso atualizados com sucesso!");
      await loadStats();
      setTimeout(() => {
        setEditingUser(null);
        setEditSuccess("");
      }, 1000);
    } catch (err: any) {
      setEditError(getFriendlyErrorMessage(err, "Erro ao atualizar dados do cliente."));
    } finally {
      setEditLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

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

            <TurnstileWidget
              onVerify={() => {}}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-500 active:scale-[0.98] text-white font-bold text-[16px] py-4 rounded-[22px] transition-all mt-3 disabled:opacity-50 shadow-[0_4px_14px_rgba(234,88,12,0.4)]"
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
    <div className="min-h-screen bg-[#0a0a0a] pb-24 pt-20 px-4 sm:px-8 relative">
      {/* Toast de Notificação de Renovação / Ação */}
      {actionSuccessToast && (
        <div className="fixed top-6 right-6 z-50 p-4 bg-emerald-600 text-white font-bold text-sm rounded-2xl shadow-2xl shadow-emerald-500/40 flex items-center gap-3 animate-fade-in border border-emerald-400/30">
          <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
          <span>{actionSuccessToast}</span>
        </div>
      )}

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
                sessionStorage.removeItem("adminSessionToken");
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
                      expireLabel = d.toLocaleDateString('pt-BR') + (client.accessType === 'teste' || client.accessType === '4horas' || client.accessType === '1dia' || client.accessType === '30min' || client.accessType === '7dias' ? ` às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '');
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
                                : client.accessType === '30min'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : client.accessType === 'teste'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : client.accessType === '4horas'
                                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                : client.accessType === '1dia'
                                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                : client.accessType === '7dias'
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}>
                              {client.accessType === 'vitalicio' ? 'Vitalício' : client.accessType === '30min' ? '30 Min' : client.accessType === 'teste' ? 'Teste 1h' : client.accessType === '4horas' ? '4 Horas' : client.accessType === '1dia' ? '1 Dia' : client.accessType === '7dias' ? '7 Dias' : 'Mensal'}
                            </span>

                            {/* Badge Valor Mensalidade */}
                            {client.monthlyFee && (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                R$ {client.monthlyFee}
                              </span>
                            )}

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

                        {/* Ações Rápidas de Extensão de Tempo */}
                        <div className="bg-white/5 border border-white/5 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                          <span className="text-white/40 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 mr-0.5">
                            <Timer className="w-3.5 h-3.5 text-orange-400" />
                            Tempo:
                          </span>
                          <button
                            type="button"
                            disabled={quickExtendLoadingId === client.id}
                            onClick={() => handleQuickExtend(client, 0.5, "30min")}
                            title="Dar +30 minutos de acesso (reativa imediatamente)"
                            className="px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 rounded-lg text-[11px] font-bold border border-emerald-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-1 disabled:opacity-50"
                          >
                            {quickExtendLoadingId === client.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "+30m"}
                          </button>
                          <button
                            type="button"
                            disabled={quickExtendLoadingId === client.id}
                            onClick={() => handleQuickExtend(client, 1, "teste")}
                            title="Dar +1 hora de teste ao usuário (reativa imediatamente)"
                            className="px-2 py-1 bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 rounded-lg text-[11px] font-bold border border-amber-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-1 disabled:opacity-50"
                          >
                            {quickExtendLoadingId === client.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "+1h"}
                          </button>
                          <button
                            type="button"
                            disabled={quickExtendLoadingId === client.id}
                            onClick={() => handleQuickExtend(client, 4, "4horas")}
                            title="Mudar/dar 4 horas de acesso (reativa imediatamente)"
                            className="px-2 py-1 bg-orange-500/15 hover:bg-orange-500/30 text-orange-300 rounded-lg text-[11px] font-bold border border-orange-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-1 disabled:opacity-50"
                          >
                            +4h
                          </button>
                          <button
                            type="button"
                            disabled={quickExtendLoadingId === client.id}
                            onClick={() => handleQuickExtend(client, 24, "1dia")}
                            title="Mudar/dar 1 dia de acesso (reativa imediatamente)"
                            className="px-2 py-1 bg-teal-500/15 hover:bg-teal-500/30 text-teal-300 rounded-lg text-[11px] font-bold border border-teal-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-1 disabled:opacity-50"
                          >
                            +1 Dia
                          </button>
                          <button
                            type="button"
                            disabled={quickExtendLoadingId === client.id}
                            onClick={() => handleQuickExtend(client, 168, "7dias")}
                            title="Mudar/dar 7 dias de acesso (reativa imediatamente)"
                            className="px-2 py-1 bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 rounded-lg text-[11px] font-bold border border-cyan-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-1 disabled:opacity-50"
                          >
                            +7 Dias
                          </button>
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
              {lastCreatedUser.monthlyFee && (
                <>Mensalidade: <strong className="text-emerald-400">{lastCreatedUser.monthlyFee}</strong><br/></>
              )}
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
                  onClick={() => setAccessType('30min')}
                  className={`flex-1 py-3 px-2 rounded-[22px] font-bold text-[11px] sm:text-xs transition-all ${
                    accessType === '30min' 
                      ? 'bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.4)]' 
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  30 Min
                </button>
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
                  onClick={() => setAccessType('7dias')}
                  className={`flex-1 py-3 px-2 rounded-[22px] font-bold text-[11px] sm:text-xs transition-all ${
                    accessType === '7dias' 
                      ? 'bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.4)]' 
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  7 Dias
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

            {/* Campos de Cadastro */}
            {accessType === 'mensal' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <CustomDatePicker 
                      label="Data do Pagamento *"
                      value={paymentDate}
                      onChange={(date) => setPaymentDate(date)}
                    />
                  </div>

                  <div>
                    <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider ml-2">
                      Valor da Mensalidade <span className="text-orange-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMonthlyPrice("13.00")}
                        className={`flex-1 h-[52px] rounded-[22px] font-bold text-sm transition-all flex items-center justify-center gap-1.5 ${
                          monthlyPrice === "13.00"
                            ? "bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.4)] ring-2 ring-orange-400/50"
                            : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span>R$ 13,00 (Padrão)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonthlyPrice("9.90")}
                        className={`flex-1 h-[52px] rounded-[22px] font-bold text-sm transition-all flex items-center justify-center gap-1.5 ${
                          monthlyPrice === "9.90"
                            ? "bg-orange-500 text-white shadow-[0_4px_14px_rgba(234,88,12,0.4)] ring-2 ring-orange-400/50"
                            : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span>R$ 9,90</span>
                      </button>
                    </div>
                  </div>

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
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            )}
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

              {/* Programação de Tempo & Duração do Teste / Acesso */}
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-white/80 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Timer className="w-4 h-4 text-orange-400" />
                    Tempo de Uso / Duração
                  </label>

                  {/* Indicador de Status Atual */}
                  {(() => {
                    if (editAccessType === "vitalicio") {
                      return (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Acesso Vitalício
                        </span>
                      );
                    }
                    if (!editExpirationDate) {
                      return (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white/50">
                          Sem data definida
                        </span>
                      );
                    }
                    const exp = new Date(editExpirationDate).getTime();
                    const isExp = isNaN(exp) ? false : exp <= Date.now();
                    return (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isExp 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse' 
                          : 'bg-green-500/20 text-green-400 border border-green-500/30'
                      }`}>
                        {isExp ? 'Expirado no momento' : 'Válido / Ativo'}
                      </span>
                    );
                  })()}
                </div>

                {/* Seleção do Tipo de Acesso / Duração */}
                <div>
                  <span className="text-white/50 text-[11px] block mb-1.5 font-medium">Plano / Duração:</span>
                  <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyFromNow(0.5, '30min')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                        editAccessType === '30min'
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                          : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      30 Min
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFromNow(1, 'teste')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                        editAccessType === 'teste'
                          ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                          : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      1h Teste
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFromNow(4, '4horas')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                        editAccessType === '4horas'
                          ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                          : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      4 Horas
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFromNow(24, '1dia')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                        editAccessType === '1dia'
                          ? 'bg-teal-500 text-white shadow-md shadow-teal-500/30'
                          : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      1 Dia
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFromNow(168, '7dias')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                        editAccessType === '7dias'
                          ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/30'
                          : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      7 Dias
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFromNow(720, 'mensal')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                        editAccessType === 'mensal'
                          ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                          : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      Mensal
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickEditDuration('vitalicio', 'vitalicio')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                        editAccessType === 'vitalicio'
                          ? 'bg-purple-500 text-white shadow-md shadow-purple-500/30'
                          : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      Vitalício
                    </button>
                  </div>
                </div>

                {/* Ações de Extensão Rápida (Acrescentar mais tempo ao tempo restante/atual) */}
                <div className="pt-2 border-t border-white/5">
                  <span className="text-white/50 text-[11px] block mb-1.5 flex items-center gap-1 font-medium">
                    <Plus className="w-3 h-3 text-orange-400" />
                    Dar mais tempo (soma a partir de agora ou acrescenta):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => applyQuickEditDuration(0.5, '30min')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-xs font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1"
                    >
                      +30 Min
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickEditDuration(1, 'teste')}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-xs font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1"
                    >
                      +1h de Teste
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickEditDuration(4, '4horas')}
                      className="px-3 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/20 text-xs font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1"
                    >
                      +4 Horas
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickEditDuration(24, '1dia')}
                      className="px-3 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/20 text-xs font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1"
                    >
                      +1 Dia (24h)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickEditDuration(168, '7dias')}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 text-xs font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1"
                    >
                      +7 Dias
                    </button>
                  </div>
                </div>

                {/* Campo Data e Hora de Expiração Programada */}
                {editAccessType !== 'vitalicio' && (
                  <div className="pt-2 border-t border-white/5">
                    <label className="text-white/50 text-[11px] block mb-1 font-medium">
                      Data e Horário de Expiração Programados:
                    </label>
                    <input
                      type="datetime-local"
                      value={editExpirationDate}
                      onChange={(e) => setEditExpirationDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 py-2.5 px-3 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs font-mono"
                    />
                    <p className="text-[10px] text-white/40 mt-1">
                      Você pode digitar ou escolher no calendário qualquer data/hora desejada. Ao salvar com data futura, o status do usuário reativa para ATIVO automaticamente.
                    </p>
                  </div>
                )}
              </div>

              {editAccessType === "mensal" && (
                <div>
                  <label className="block text-white/60 text-xs font-bold mb-2 uppercase tracking-wider">Valor da Mensalidade</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditMonthlyPrice("13.00")}
                      className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition-all ${
                        editMonthlyPrice === "13.00"
                          ? "bg-orange-500 text-white shadow-md shadow-orange-500/30"
                          : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      R$ 13,00 (Padrão)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditMonthlyPrice("9.90")}
                      className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition-all ${
                        editMonthlyPrice === "9.90"
                          ? "bg-orange-500 text-white shadow-md shadow-orange-500/30"
                          : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      R$ 9,90
                    </button>
                  </div>
                </div>
              )}

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
