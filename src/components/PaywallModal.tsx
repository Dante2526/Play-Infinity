import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Crown, ShieldCheck, Zap, Lock, CreditCard, ArrowLeft, QrCode, Copy } from 'lucide-react';
import { auth, db } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useSubscription } from '../hooks/useSubscription';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PaywallModal({ isOpen, onClose }: PaywallModalProps) {
  const [step, setStep] = useState<'intro' | 'checkout'>('intro');
  const [activeTab, setActiveTab] = useState<'CREDIT_CARD' | 'PIX'>('CREDIT_CARD');
  const [loading, setLoading] = useState(false);
  const [monthlyFeeText, setMonthlyFeeText] = useState<string>("13,00");
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState<{ encodedImage: string, payload: string } | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    cpfCnpj: '',
    postalCode: '',
    addressNumber: '',
    mobilePhone: '',
    holderName: '',
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    ccv: ''
  });

  const { isPremium } = useSubscription();

  useEffect(() => {
    if (isOpen && isPremium) {
      alert("Pagamento reconhecido automaticamente pelo sistema! Seu Premium foi liberado.");
      window.location.reload();
    }
  }, [isOpen, isPremium]);

  useEffect(() => {
    if (isOpen && auth.currentUser) {
      const user = auth.currentUser;
      setFormData((prev) => ({
        ...prev,
        name: prev.name || user.displayName || user.email?.split('@')[0] || '',
        email: prev.email || user.email || ''
      }));

      // Carrega o valor configurado para este usuário (9,90 para clientes antigos ou 13,00 para novos)
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
            if (typeof rawVal === "number") {
              setMonthlyFeeText(rawVal === 13 ? "13,00" : "9,90");
            } else {
              setMonthlyFeeText(String(rawVal).includes("13") ? "13,00" : "9,90");
            }
          } else {
            // Cliente antigo sem valor explicitamente cadastrado:
            const createdDate = data.criadoEm || data.createdAt;
            const isLegacy = !createdDate || new Date(createdDate) < new Date("2026-09-19T00:00:00-03:00");
            const assignedNum = isLegacy ? 9.90 : 13.00;
            const assignedTxt = isLegacy ? "9,90" : "13,00";
            setMonthlyFeeText(assignedTxt);

            // Grava silenciosamente no Firestore para que fique registrado no cadastro dele
            setDoc(doc(db, "usuarios", user.uid), {
              valorMensalidade: assignedNum,
              valor: assignedTxt
            }, { merge: true }).catch(() => {});
          }
        }
      }).catch((err) => {
        console.warn("[Paywall] Erro ao buscar valor do cliente:", err);
      });
    } else if (isOpen) {
      // Visitante não logado vê o novo preço padrão de R$ 13,00
      setMonthlyFeeText("13,00");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubscribe = async (method: 'CREDIT_CARD' | 'PIX') => {
    const user = auth.currentUser;
    if (!user) {
      setError('Você precisa estar logado para assinar.');
      return;
    }

    if (method === 'CREDIT_CARD') {
      // Basic validation
      if (!formData.cpfCnpj || !formData.postalCode || !formData.addressNumber || !formData.holderName || !formData.cardNumber || !formData.expiryMonth || !formData.expiryYear || !formData.ccv || !formData.mobilePhone) {
        setError('Preencha todos os campos do cartão e endereço.');
        return;
      }
    } else if (method === 'PIX') {
      // Validações estritas do PIX: Nome completo, E-mail e CPF
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
    }

    setLoading(true);
    setError('');

    try {
      const payload: any = {
        userId: user.uid,
        billingType: method,
      };

      if (method === 'CREDIT_CARD') {
        if (!formData.cpfCnpj) {
           setError('Preencha o CPF/CNPJ.');
           setLoading(false);
           return;
        }
        payload.email = formData.email?.trim() || user.email;
        payload.name = formData.name?.trim() || user.displayName || user.email?.split('@')[0];
        payload.cpfCnpj = formData.cpfCnpj.replace(/\D/g, '');
        payload.creditCard = {
          holderName: formData.holderName,
          number: formData.cardNumber.replace(/\D/g, ''),
          expiryMonth: formData.expiryMonth,
          expiryYear: formData.expiryYear,
          ccv: formData.ccv
        };
        payload.creditCardHolderInfo = {
          name: payload.name,
          email: payload.email,
          cpfCnpj: payload.cpfCnpj,
          postalCode: formData.postalCode.replace(/\D/g, ''),
          addressNumber: formData.addressNumber,
          mobilePhone: formData.mobilePhone.replace(/\D/g, '')
        };
      } else if (method === 'PIX') {
        const trimmedName = formData.name.trim();
        const trimmedEmail = formData.email.trim();
        const cpfDigits = formData.cpfCnpj.replace(/\D/g, '');

        payload.name = trimmedName;
        payload.email = trimmedEmail;
        payload.cpfCnpj = cpfDigits;
      }

      const res = await fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const textData = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(textData);
      } catch (err) {
        // Ignora erro de JSON se for texto puro
      }

      if (!data) {
        throw new Error(`Resposta do servidor não é um JSON válido. Status: ${res.status}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Erro ao processar assinatura.');
      }

      if (method === 'CREDIT_CARD') {
        alert("Assinatura confirmada com sucesso! Bem-vindo(a) ao Premium.");
        window.location.reload();
      } else if (method === 'PIX') {
        if (data.pixQrCode && data.pixQrCode.encodedImage) {
          setPixData({
            encodedImage: data.pixQrCode.encodedImage,
            payload: data.pixQrCode.payload
          });
        } else {
          throw new Error("O servidor respondeu com sucesso, mas 'pixQrCode' veio ausente ou sem imagem.");
        }
      }
    } catch (err: any) {
      setError(err.message);
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

  const benefits = [
    { icon: <Zap size={20} className="text-yellow-400" />, text: "Sem popups, sem redirecionamentos chatos" },
    { icon: <ShieldCheck size={20} className="text-green-400" />, text: "Servidores ultrarrápidos e seguros" },
    { icon: <Crown size={20} className="text-purple-400" />, text: "Catálogo (Filmes, Séries, Animes e TV)" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative w-full max-w-lg my-auto rounded-2xl sm:rounded-3xl bg-zinc-900 border border-purple-500/30 shadow-[0_0_50px_rgba(168,85,247,0.15)] max-h-[92vh] flex flex-col overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full"
          >
            {/* Background Glows */}
            <div className="absolute -top-32 -left-32 w-64 h-64 bg-purple-600/30 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-blue-600/30 rounded-full blur-[80px] pointer-events-none" />

            <button
              onClick={onClose}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 p-2 rounded-full bg-black/40 text-zinc-400 hover:text-white hover:bg-black/60 transition-colors"
              aria-label="Fechar"
            >
              <X size={20} className="sm:w-5 sm:h-5" />
            </button>

            {step === 'intro' ? (
              <div className="relative p-5 sm:p-8 text-center flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 p-[2px] mb-4 sm:mb-6 shadow-lg shadow-purple-500/20">
                  <div className="w-full h-full rounded-xl sm:rounded-2xl bg-zinc-900 flex items-center justify-center">
                    <Lock className="text-purple-400 w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                </div>

                <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">
                  Acesso <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">Premium</span>
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mb-5 sm:mb-7 max-w-sm">
                  Este conteúdo é exclusivo para assinantes. Libere seu acesso e assista sem interrupções.
                </p>

                <div className="w-full bg-black/40 border border-white/5 rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-5 sm:mb-7 text-left space-y-3 sm:space-y-4">
                  {benefits.map((b, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="p-1.5 sm:p-2 rounded-lg bg-white/5 border border-white/10 shrink-0">
                        {b.icon}
                      </div>
                      <span className="text-zinc-300 text-xs sm:text-sm font-medium">{b.text}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setStep('checkout')}
                  className="group relative w-full py-3.5 sm:py-4 rounded-xl font-bold text-base sm:text-lg overflow-hidden transition-all shadow-lg shadow-purple-600/20"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 transition-all group-hover:scale-[1.02]" />
                  <span className="relative flex items-center justify-center gap-2 text-white">
                    Assinar agora por R$ {monthlyFeeText} <Crown size={18} className="sm:w-5 sm:h-5" />
                  </span>
                </button>
              </div>
            ) : (
              <div className="relative p-4 sm:p-8 flex flex-col">
                <button 
                  onClick={() => {
                    if (pixData) setPixData(null);
                    else setStep('intro');
                  }}
                  className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors mb-3 sm:mb-5 w-fit text-xs sm:text-sm"
                >
                  <ArrowLeft size={16} className="sm:w-4 sm:h-4" /> Voltar
                </button>
                
                <h2 className="text-lg sm:text-2xl font-black text-white mb-4 sm:mb-6 flex items-center gap-2">
                  <Lock className="text-purple-400 w-5 h-5 sm:w-6 sm:h-6" /> Pagamento Seguro
                </h2>

                {error && (
                  <div className="mb-4 sm:mb-5 p-3 sm:p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm w-full leading-relaxed">
                    {error}
                  </div>
                )}

                {/* Se já gerou o PIX, mostra apenas a tela do QR Code */}
                {pixData ? (
                  <div className="flex flex-col items-center">
                    <div className="bg-white p-3 sm:p-4 rounded-2xl mb-4 sm:mb-6 shadow-md">
                      <img src={`data:image/jpeg;base64,${pixData.encodedImage}`} alt="QR Code Pix" className="w-36 h-36 sm:w-44 sm:h-44 object-contain" />
                    </div>
                    
                    <button 
                      onClick={handleCopyPix}
                      className="w-full py-2.5 sm:py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors mb-3 sm:mb-4 border border-white/5"
                    >
                      {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                      {copied ? "Código Copiado!" : "Copiar código Pix"}
                    </button>

                    <button 
                      onClick={() => window.location.reload()}
                      className="w-full py-3 sm:py-3.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-bold text-sm sm:text-base transition-all shadow-md shadow-purple-600/30"
                    >
                      Já paguei / Atualizar
                    </button>
                    
                    <p className="text-zinc-400 text-[11px] sm:text-xs mt-3 sm:mt-4 text-center leading-relaxed">
                      Assim que pagar no app do seu banco, clique no botão acima para liberar seu acesso.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Tabs de Seleção de Método */}
                    <div className="flex bg-black/40 rounded-xl p-1 mb-4 sm:mb-6 border border-white/10">
                      <button
                        onClick={() => setActiveTab('CREDIT_CARD')}
                        className={`flex-1 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 sm:gap-2 transition-colors ${activeTab === 'CREDIT_CARD' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                      >
                        <CreditCard size={16} className="sm:w-4 sm:h-4" /> Cartão
                      </button>
                      <button
                        onClick={() => setActiveTab('PIX')}
                        className={`flex-1 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 sm:gap-2 transition-colors ${activeTab === 'PIX' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                      >
                        <QrCode size={16} className="sm:w-4 sm:h-4" /> Pix Nativo
                      </button>
                    </div>

                    {activeTab === 'CREDIT_CARD' && (
                      <div className="space-y-3 sm:space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">CPF/CNPJ *</label>
                            <input 
                              type="text" name="cpfCnpj" value={formData.cpfCnpj} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-white text-xs sm:text-sm outline-none focus:border-purple-500 transition-colors"
                              placeholder="000.000.000-00"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">Celular (com DDD) *</label>
                            <input 
                              type="text" name="mobilePhone" value={formData.mobilePhone} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-white text-xs sm:text-sm outline-none focus:border-purple-500 transition-colors"
                              placeholder="(11) 99999-9999"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                          <div className="col-span-2">
                            <label className="text-xs text-zinc-400 mb-1 block">CEP *</label>
                            <input 
                              type="text" name="postalCode" value={formData.postalCode} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-white text-xs sm:text-sm outline-none focus:border-purple-500 transition-colors"
                              placeholder="00000-000"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">Número *</label>
                            <input 
                              type="text" name="addressNumber" value={formData.addressNumber} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-white text-xs sm:text-sm outline-none focus:border-purple-500 transition-colors"
                              placeholder="Ex: 123"
                            />
                          </div>
                        </div>

                        <div className="h-px w-full bg-white/10 my-1 sm:my-2" />

                        <div>
                          <label className="text-xs text-zinc-400 mb-1 block">Nome impresso no cartão *</label>
                          <input 
                            type="text" name="holderName" value={formData.holderName} onChange={handleChange}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-white text-xs sm:text-sm outline-none focus:border-purple-500 transition-colors uppercase"
                            placeholder="NOME COMO ESTÁ NO CARTÃO"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400 mb-1 block">Número do Cartão *</label>
                          <input 
                            type="text" name="cardNumber" value={formData.cardNumber} onChange={handleChange}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-white text-xs sm:text-sm outline-none focus:border-purple-500 transition-colors"
                            placeholder="0000 0000 0000 0000"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:gap-4">
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">Mês (MM) *</label>
                            <input 
                              type="text" name="expiryMonth" value={formData.expiryMonth} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-2 sm:px-3 py-2.5 sm:py-3 text-white text-xs sm:text-sm outline-none focus:border-purple-500 transition-colors text-center"
                              placeholder="12" maxLength={2}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">Ano (AAAA) *</label>
                            <input 
                              type="text" name="expiryYear" value={formData.expiryYear} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-2 sm:px-3 py-2.5 sm:py-3 text-white text-xs sm:text-sm outline-none focus:border-purple-500 transition-colors text-center"
                              placeholder="2030" maxLength={4}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">CVV *</label>
                            <input 
                              type="text" name="ccv" value={formData.ccv} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-2 sm:px-3 py-2.5 sm:py-3 text-white text-xs sm:text-sm outline-none focus:border-purple-500 transition-colors text-center"
                              placeholder="123" maxLength={4}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'PIX' && (
                      <div className="space-y-3 sm:space-y-4 py-1">
                        <div className="flex items-center gap-2.5 sm:gap-3 bg-purple-500/10 border border-purple-500/20 p-2.5 sm:p-3 rounded-xl mb-2 sm:mb-4">
                          <QrCode size={20} className="text-purple-400 shrink-0 sm:w-6 sm:h-6" />
                          <div className="text-left">
                            <p className="text-white text-xs font-semibold">Pagamento Instantâneo via Pix</p>
                            <p className="text-zinc-400 text-[11px]">Preencha os dados abaixo para gerar o QR Code.</p>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="pix-input-name" className="text-xs text-zinc-400 mb-1 block">Nome Completo *</label>
                          <input 
                            id="pix-input-name"
                            type="text" 
                            name="name" 
                            value={formData.name} 
                            onChange={handleChange}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-white outline-none focus:border-purple-500 transition-colors text-xs sm:text-sm"
                            placeholder="Nome completo do titular"
                          />
                        </div>

                        <div>
                          <label htmlFor="pix-input-email" className="text-xs text-zinc-400 mb-1 block">E-mail *</label>
                          <input 
                            id="pix-input-email"
                            type="email" 
                            name="email" 
                            value={formData.email} 
                            onChange={handleChange}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-white outline-none focus:border-purple-500 transition-colors text-xs sm:text-sm"
                            placeholder="seuemail@exemplo.com"
                          />
                        </div>

                        <div>
                          <label htmlFor="pix-input-cpf" className="text-xs text-zinc-400 mb-1 block">CPF (11 números) *</label>
                          <input 
                            id="pix-input-cpf"
                            type="text" 
                            name="cpfCnpj" 
                            value={formData.cpfCnpj} 
                            onChange={handleChange}
                            maxLength={14}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-white outline-none focus:border-purple-500 transition-colors text-xs sm:text-sm"
                            placeholder="000.000.000-00"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => handleSubscribe(activeTab)}
                      disabled={loading}
                      className="mt-5 sm:mt-7 group relative w-full py-3.5 sm:py-4 rounded-xl font-bold text-base sm:text-lg overflow-hidden transition-all disabled:opacity-70 shadow-lg shadow-purple-600/20"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 transition-all group-hover:scale-[1.02]" />
                      <span className="relative flex items-center justify-center gap-2 text-white">
                        {loading ? (
                          <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            {activeTab === 'PIX' ? `Gerar PIX de R$ ${monthlyFeeText}` : `Pagar R$ ${monthlyFeeText}`} <Check size={18} className="sm:w-5 sm:h-5" />
                          </>
                        )}
                      </span>
                    </button>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
