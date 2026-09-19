import React, { useState } from "react";
import { X, Lock, Mail, AlertCircle, User } from "lucide-react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDismissible?: boolean;
}

export function AuthModal({ isOpen, onClose, isDismissible = true }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState(() => {
    return localStorage.getItem("playinfinity_last_email") || "";
  });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validação estrita de campos obrigatórios
    if (!isLogin) {
      if (!name.trim()) {
        setError("Por favor, preencha o seu nome.");
        return;
      }
      if (!email.trim()) {
        setError("Por favor, informe o seu e-mail.");
        return;
      }
      if (!password.trim() || password.length < 6) {
        setError("A senha é obrigatória e deve ter pelo menos 6 caracteres.");
        return;
      }
    } else {
      if (!email.trim()) {
        setError("Por favor, informe o seu e-mail.");
        return;
      }
      if (!password.trim()) {
        setError("Por favor, informe a sua senha.");
        return;
      }
    }

    setLoading(true);

    try {
      if (isLogin) {
        // Limpa resquícios locais de contas anteriores antes de logar
        localStorage.removeItem("playinfinity_playback_history");
        localStorage.removeItem("playinfinity_favorites");
        localStorage.removeItem("playinfinity_watched_episodes");
        localStorage.removeItem("playinfinity_watched_seasons");

        const userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
        // Verifica se a conta ainda existe no Firestore (não foi revogada/excluída)
        let userSnap = await getDoc(doc(db, "usuarios", userCred.user.uid));
        if (!userSnap.exists()) {
          userSnap = await getDoc(doc(db, "users", userCred.user.uid));
        }
        if (!userSnap.exists()) {
          userSnap = await getDoc(doc(db, "administradores", userCred.user.uid));
        }
        if (!userSnap.exists()) {
          await signOut(auth);
          localStorage.removeItem("playinfinity_logged_in");
          throw new Error("Sua conta foi desativada ou removida. Entre em contato com o suporte.");
        }
      } else {
        const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (userCred.user) {
          await setDoc(doc(db, "usuarios", userCred.user.uid), {
            nome: name.trim(),
            email: email.trim(),
            senha: password,
            assinatura: "INATIVA",
            tipoAcesso: "mensal",
            valorMensalidade: 13.00,
            valor: "13,00",
            criadoEm: new Date().toISOString()
          }, { merge: true });
        }
      }

      // Salva no localStorage que este navegador tem um usuário conectado
      localStorage.setItem("playinfinity_logged_in", "true");
      localStorage.setItem("playinfinity_last_email", email.trim());

      // Notifica o gerenciador nativo de senhas do navegador se disponível
      if (typeof window !== "undefined" && 'credentials' in navigator && (window as any).PasswordCredential) {
        try {
          const cred = new (window as any).PasswordCredential({
            id: email.trim(),
            password: password,
            name: (!isLogin && name.trim()) ? name.trim() : email.split('@')[0]
          });
          navigator.credentials.store(cred).catch(() => {});
        } catch (credErr) {}
      }

      onClose(); // Autenticação com sucesso
    } catch (err: any) {
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        setError("E-mail ou senha incorretos.");
      } else if (err.code === "auth/email-already-in-use") {
        setError("Este e-mail já está cadastrado.");
      } else {
        setError(err.message || "Erro na autenticação. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6">
      <div className="bg-[#1c1c1e]/80 backdrop-blur-3xl border border-white/10 w-full max-w-sm sm:max-w-md overflow-hidden relative shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-fade-in" style={{ borderRadius: '28px' }}>
        {isDismissible && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="p-8 sm:p-10">
          <div className="text-center mb-10 mt-2">
            <h2 className="text-[28px] leading-tight font-extrabold text-white tracking-tight mb-2">
              {isLogin ? "Entrar" : "Criar Conta"}
            </h2>
            <p className="text-white/50 text-[15px] font-medium px-4">
              {isLogin 
                ? "Acesse sua conta para continuar assistindo de onde parou." 
                : "Crie sua conta para sincronizar seus favoritos em qualquer tela."}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400 text-sm" style={{ borderRadius: '20px' }}>
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} method="post" action="#" autoComplete="on" className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-white/70 text-xs font-bold mb-1.5 ml-2 uppercase tracking-wider">
                  Seu Nome <span className="text-orange-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-orange-500 text-white/30">
                    <User className="h-[18px] w-[18px]" />
                  </div>
                  <input
                    id="auth-name"
                    name="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-4 pl-11 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px]"
                    style={{ borderRadius: '22px' }}
                    placeholder="Nome Completo"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              {!isLogin && (
                <label className="block text-white/70 text-xs font-bold mb-1.5 ml-2 uppercase tracking-wider">
                  Seu E-mail <span className="text-orange-500">*</span>
                </label>
              )}
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-orange-500 text-white/30">
                  <Mail className="h-[18px] w-[18px]" />
                </div>
                <input
                  id="auth-email"
                  name="username"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-4 pl-11 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px]"
                  style={{ borderRadius: '22px' }}
                  placeholder="Seu E-mail"
                  required
                />
              </div>
            </div>

            <div>
              {!isLogin && (
                <label className="block text-white/70 text-xs font-bold mb-1.5 ml-2 uppercase tracking-wider">
                  Sua Senha <span className="text-orange-500">*</span>
                </label>
              )}
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-orange-500 text-white/30">
                  <Lock className="h-[18px] w-[18px]" />
                </div>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/10 border-0 py-4 pl-11 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-[15px]"
                  style={{ borderRadius: '22px' }}
                  placeholder={isLogin ? "Senha" : "Senha (mínimo 6 caracteres)"}
                  minLength={6}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-500 active:scale-[0.98] text-white font-bold text-[16px] py-4 transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(234,88,12,0.4)] cursor-pointer"
              style={{ borderRadius: '22px' }}
            >
              {loading ? "Aguarde..." : (isLogin ? "Entrar" : "Criar Conta")}
            </button>
          </form>

          <div className="mt-8 text-center text-[15px] text-white/50 font-medium">
            {isLogin ? "Novo por aqui? " : "Já tem uma conta? "}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
              }}
              className="text-orange-500 hover:text-orange-400 font-bold transition-colors ml-1"
            >
              {isLogin ? "Assine agora" : "Entre agora"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
