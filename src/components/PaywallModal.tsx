import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Crown, ShieldCheck, Zap, Lock } from 'lucide-react';
import { auth } from '../services/firebase';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PaywallModal({ isOpen, onClose }: PaywallModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubscribe = async () => {
    const user = auth.currentUser;
    if (!user) {
      setError('Você precisa estar logado para assinar.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          email: user.email,
          name: user.displayName || user.email?.split('@')[0],
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erro ao gerar assinatura.');

      if (data.invoiceUrl) {
        // Redireciona o usuário para o checkout do Asaas
        window.location.href = data.invoiceUrl;
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const benefits = [
    { icon: <Zap size={20} className="text-yellow-400" />, text: "Sem popups, sem redirecionamentos chatos" },
    { icon: <ShieldCheck size={20} className="text-green-400" />, text: "Servidores ultrarrápidos e seguros" },
    { icon: <Crown size={20} className="text-purple-400" />, text: "Catálogo completo (Filmes, Séries, Animes e TV)" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-zinc-900 border border-purple-500/30 shadow-[0_0_50px_rgba(168,85,247,0.15)]"
          >
            {/* Background Glows */}
            <div className="absolute -top-32 -left-32 w-64 h-64 bg-purple-600/30 rounded-full blur-[80px]" />
            <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-blue-600/30 rounded-full blur-[80px]" />

            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/20 text-zinc-400 hover:text-white hover:bg-black/40 transition-colors"
            >
              <X size={24} />
            </button>

            <div className="relative p-8 text-center flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 p-[2px] mb-6 shadow-lg shadow-purple-500/20">
                <div className="w-full h-full rounded-2xl bg-zinc-900 flex items-center justify-center">
                  <Lock size={32} className="text-purple-400" />
                </div>
              </div>

              <h2 className="text-3xl font-black text-white mb-2">
                Acesso <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">Premium</span>
              </h2>
              <p className="text-zinc-400 mb-8">
                Este conteúdo é exclusivo para assinantes. Libere seu acesso e assista sem interrupções.
              </p>

              <div className="w-full bg-black/40 border border-white/5 rounded-2xl p-6 mb-8 text-left space-y-4">
                {benefits.map((b, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                      {b.icon}
                    </div>
                    <span className="text-zinc-300 font-medium">{b.text}</span>
                  </div>
                ))}
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm w-full">
                  {error}
                </div>
              )}

              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="group relative w-full py-4 rounded-xl font-bold text-lg overflow-hidden transition-all disabled:opacity-70"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 transition-all group-hover:scale-[1.02]" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-20 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay transition-opacity" />
                <span className="relative flex items-center justify-center gap-2 text-white">
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Assinar agora por R$ 9,90 <Crown size={20} />
                    </>
                  )}
                </span>
              </button>
              
              <p className="text-zinc-500 text-xs mt-4">
                Cancele quando quiser. Pagamento seguro processado pelo Asaas (Pix, Cartão ou Boleto).
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
