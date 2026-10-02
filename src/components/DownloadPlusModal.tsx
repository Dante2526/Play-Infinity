import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Download, Zap, Lock, ArrowLeft, QrCode, Copy } from 'lucide-react';
import { auth, db } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useSubscription } from '../hooks/useSubscription';
import { reportAppError } from './GlobalErrorModal';
import { getFriendlyErrorMessage } from '../utils/errorTranslator';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function DownloadPlusModal({ isOpen, onClose }: Props) {
  const [step, setStep] = useState<'intro' | 'checkout'>('intro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState<{ encodedImage: string, payload: string } | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [currentFee, setCurrentFee] = useState<number>(0);
  const { isPremium, isPlus, isVitalicio } = useSubscription();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    cpfCnpj: ''
  });

  const plusFee = 17.00;
  const diff = Math.max(0, plusFee - currentFee);
  const isUpgrade = isPremium && diff > 0 && diff < plusFee;
  const displayPrice = isUpgrade ? diff : plusFee;

  useEffect(() => {
    if (isOpen && (isPlus || isVitalicio)) {
      onClose(); // Already has access
      alert("Seu Plano Plus já está ativo! Redirecionando para o download.");
    }
  }, [isOpen, isPlus, isVitalicio]);

  useEffect(() => {
    if (isOpen && auth.currentUser) {
      const user = auth.currentUser;
      setFormData((prev) => ({
        ...prev,
        name: prev.name || user.displayName || user.email?.split('@')[0] || '',
        email: prev.email || user.email || ''
      }));

      getDoc(doc(db, "usuarios", user.uid)).then((docSnap) => {
        if (!docSnap.exists()) {
          return getDoc(doc(db, "users", user.uid));
        }
        return docSnap;
      }).then((docSnap) => {
        if (docSnap && docSnap.exists()) {
          const data = docSnap.data();
          const rawVal = data.valorMensalidade ?? data.valor ?? data.monthlyFee;
          if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
            setCurrentFee(typeof rawVal === "number" ? rawVal : (String(rawVal).includes("13") ? 13 : 9.90));
          } else {
            setCurrentFee(9.90);
          }
        }
      }).catch((err) => {
        console.warn("[PlusPaywall] Erro ao buscar valor do cliente:", err);
      });
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePixPayment = async () => {
    const user = auth.currentUser;
    if (!user) {
      setError('Você precisa estar logado para assinar.');
      return;
    }

    const trimmedName = (formData.name || '').trim();
    if (!trimmedName) {
      setError('Preencha o nome completo.');
      return;
    }

    const rawEmail = formData.email || '';
    const trimmedEmail = rawEmail.trim();
    const hasSpacesOrSlashes = /[\s/\\]/.test(rawEmail);
    const isValidEmailFormat = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmedEmail);

    if (!trimmedEmail || hasSpacesOrSlashes || !isValidEmailFormat) {
      setError('Informe um e-mail válido (com @ e domínio, sem barras nem espaços).');
      return;
    }

    const cpfDigits = (formData.cpfCnpj || '').replace(/\D/g, '');
    if (cpfDigits.length !== 11) {
      setError('O CPF deve conter exatamente 11 números.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload: any = {
        userId: user.uid,
        billingType: 'PIX',
        name: trimmedName,
        email: trimmedEmail,
        cpfCnpj: cpfDigits,
        value: displayPrice,
        description: "Assinatura Play Infinity Plus",
        externalReference: user.uid + "|PLUS" // Important for webhook upgrade
      };

      const res = await fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const textData = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(textData);
      } catch(err){console.warn("Silenced error:", err);}

      if (!data) throw new Error(`Resposta do servidor não é um JSON válido. Status: ${res.status}`);
      if (!data.success) throw new Error(data.error || 'Erro ao processar assinatura.');

      if (data.pixQrCode && data.pixQrCode.encodedImage) {
        setPixData({
          encodedImage: data.pixQrCode.encodedImage,
          payload: data.pixQrCode.payload
        });
      } else {
        throw new Error("O servidor respondeu com sucesso, mas 'pixQrCode' veio ausente ou sem imagem.");
      }
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err, "Não foi possível processar o pagamento. Tente novamente."));
      reportAppError(err, 'Processamento PIX Plus');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPix = () => {
    if (pixData?.payload) {
      navigator.clipboard.writeText(pixData.payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md my-auto rounded-2xl sm:rounded-3xl bg-indigo-950 border border-indigo-500/30 shadow-[0_0_50px_rgba(99,102,241,0.15)] flex flex-col overflow-y-auto"
        >
          {/* Background Glow */}
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-600/10 to-purple-600/10 pointer-events-none" />

          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 p-2 rounded-full bg-black/40 text-indigo-200 hover:text-white hover:bg-black/60 transition-colors"
          >
            <X size={20} className="sm:w-5 sm:h-5" />
          </button>

          {step === 'intro' ? (
            <div className="relative p-6 sm:p-8 text-center flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center mb-5 border border-indigo-500/50">
                <Download className="w-8 h-8 text-indigo-400" />
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">
                Plano <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Plus</span>
              </h2>
              <p className="text-sm text-indigo-200/70 mb-6">
                Baixe filmes e séries para assistir offline, na qualidade máxima.
              </p>

              <div className="w-full bg-black/40 border border-white/5 rounded-xl p-4 mb-6 text-left">
                {isUpgrade ? (
                  <>
                    <p className="text-sm text-indigo-200/60 font-medium">Você já possui o Premium</p>
                    <div className="text-2xl font-black text-white mt-1">
                      Pague só a diferença: <span className="text-green-400">R$ {displayPrice.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <p className="text-xs text-indigo-200/50 mt-2">
                      Nos próximos meses, a renovação será do plano completo (R$ 17,00/mês).
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-indigo-200/60 font-medium">Assinatura Plus Completa</p>
                    <div className="text-3xl font-black text-white mt-1">
                      R$ 17,00<span className="text-lg text-indigo-200/50 font-medium">/mês</span>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => setStep('checkout')}
                className="w-full py-4 rounded-xl font-bold text-lg text-white bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/30"
              >
                <Zap size={20} /> Quero o Plano Plus
              </button>
            </div>
          ) : (
            <div className="relative p-6 sm:p-8 flex flex-col">
              <button 
                onClick={() => {
                  if (pixData) setPixData(null);
                  else setStep('intro');
                }}
                className="flex items-center gap-1.5 text-indigo-300/70 hover:text-white transition-colors mb-4 w-fit text-sm"
              >
                <ArrowLeft size={16} /> Voltar
              </button>
              
              <h2 className="text-xl font-black text-white mb-5 flex items-center gap-2">
                <Lock className="text-indigo-400 w-5 h-5" /> Pagamento Pix
              </h2>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm w-full">
                  {error}
                </div>
              )}

              {pixData ? (
                <div className="flex flex-col items-center">
                  <div className="bg-white p-3 rounded-2xl mb-5 shadow-md">
                    <img src={`data:image/jpeg;base64,${pixData.encodedImage}`} alt="QR Code Pix" className="w-40 h-40 object-contain" />
                  </div>
                  
                  <button 
                    onClick={handleCopyPix}
                    className="w-full py-3 bg-black/40 hover:bg-black/60 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors mb-3 border border-white/10"
                  >
                    {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                    {copied ? "Código Copiado!" : "Copiar código Pix"}
                  </button>

                  <button 
                    onClick={() => window.location.reload()}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold transition-all shadow-md shadow-indigo-600/30"
                  >
                    Já paguei / Atualizar
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="text-xs text-indigo-200/70 mb-1 block">Nome Completo *</label>
                      <input 
                        type="text" name="name" value={formData.name} onChange={handleChange}
                        className="w-full bg-black/30 border border-indigo-500/20 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-400 transition-colors"
                        placeholder="João da Silva"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-indigo-200/70 mb-1 block">E-mail *</label>
                      <input 
                        type="email" name="email" value={formData.email} onChange={handleChange}
                        className="w-full bg-black/30 border border-indigo-500/20 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-400 transition-colors"
                        placeholder="joao@email.com"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-indigo-200/70 mb-1 block">CPF/CNPJ *</label>
                      <input 
                        type="text" name="cpfCnpj" value={formData.cpfCnpj} onChange={handleChange}
                        className="w-full bg-black/30 border border-indigo-500/20 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-400 transition-colors"
                        placeholder="000.000.000-00"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handlePixPayment}
                    disabled={loading}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <QrCode size={20} />
                    )}
                    {loading ? "Gerando Pix..." : "Gerar PIX agora"}
                  </button>
                </>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
