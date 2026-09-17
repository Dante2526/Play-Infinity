import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Crown, ShieldCheck, Zap, Lock, CreditCard, ArrowLeft, QrCode, Copy } from 'lucide-react';
import { auth } from '../services/firebase';
import { useSubscription } from '../hooks/useSubscription';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PaywallModal({ isOpen, onClose }: PaywallModalProps) {
  const [step, setStep] = useState<'intro' | 'checkout'>('intro');
  const [activeTab, setActiveTab] = useState<'CREDIT_CARD' | 'PIX'>('CREDIT_CARD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState<{ encodedImage: string, payload: string } | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [formData, setFormData] = useState({
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
    }

    setLoading(true);
    setError('');

    try {
      const payload: any = {
        userId: user.uid,
        email: user.email,
        name: user.displayName || user.email?.split('@')[0],
        billingType: method,
      };

      if (method === 'CREDIT_CARD') {
        if (!formData.cpfCnpj) {
           setError('Preencha o CPF/CNPJ.');
           setLoading(false);
           return;
        }
        payload.cpfCnpj = formData.cpfCnpj.replace(/\D/g, '');
        payload.creditCard = {
          holderName: formData.holderName,
          number: formData.cardNumber.replace(/\D/g, ''),
          expiryMonth: formData.expiryMonth,
          expiryYear: formData.expiryYear,
          ccv: formData.ccv
        };
        payload.creditCardHolderInfo = {
          name: user.displayName || user.email?.split('@')[0],
          email: user.email,
          cpfCnpj: payload.cpfCnpj,
          postalCode: formData.postalCode.replace(/\D/g, ''),
          addressNumber: formData.addressNumber,
          mobilePhone: formData.mobilePhone.replace(/\D/g, '')
        };
      } else if (method === 'PIX') {
        if (!formData.cpfCnpj) {
           setError('Preencha o CPF/CNPJ para gerar o PIX.');
           setLoading(false);
           return;
        }
        payload.cpfCnpj = formData.cpfCnpj.replace(/\D/g, '');
      }

      const res = await fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Trata caso a resposta do servidor seja vazia ou erro 500 html
      let data;
      try {
        const textData = await res.text();
        data = JSON.parse(textData);
      } catch (err) {
        throw new Error('Erro ao processar resposta do servidor. Tente novamente mais tarde.');
      }
      if (!data.success) throw new Error(data.error || 'Erro ao processar assinatura.');

      if (method === 'CREDIT_CARD') {
        alert("Assinatura confirmada com sucesso! Bem-vindo(a) ao Premium.");
        window.location.reload();
      } else if (method === 'PIX') {
        if (data.pixQrCode) {
          setPixData({
            encodedImage: data.pixQrCode.encodedImage,
            payload: data.pixQrCode.payload
          });
        } else {
          throw new Error("Erro ao gerar QR Code do Pix.");
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
            className={`relative w-full max-w-lg rounded-3xl bg-zinc-900 border border-purple-500/30 shadow-[0_0_50px_rgba(168,85,247,0.15)] max-h-[95vh] ${step === 'checkout' ? 'overflow-y-auto' : 'overflow-hidden'} [&::-webkit-scrollbar]:hidden [scrollbar-width:none]`}
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

            {step === 'intro' ? (
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

                <button
                  onClick={() => setStep('checkout')}
                  className="group relative w-full py-4 rounded-xl font-bold text-lg overflow-hidden transition-all"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 transition-all group-hover:scale-[1.02]" />
                  <span className="relative flex items-center justify-center gap-2 text-white">
                    Assinar agora por R$ 9,90 <Crown size={20} />
                  </span>
                </button>
              </div>
            ) : (
              <div className="relative p-8 flex flex-col">
                <button 
                  onClick={() => {
                    if (pixData) setPixData(null);
                    else setStep('intro');
                  }}
                  className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6 w-fit"
                >
                  <ArrowLeft size={20} /> Voltar
                </button>
                
                <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
                  <Lock className="text-purple-400" /> Pagamento Seguro
                </h2>

                {error && (
                  <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm w-full">
                    {error}
                  </div>
                )}

                {/* Se já gerou o PIX, mostra apenas a tela do QR Code */}
                {pixData ? (
                  <div className="flex flex-col items-center">
                    <div className="bg-white p-4 rounded-2xl mb-6">
                      <img src={`data:image/jpeg;base64,${pixData.encodedImage}`} alt="QR Code Pix" className="w-48 h-48" />
                    </div>
                    
                    <button 
                      onClick={handleCopyPix}
                      className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-colors mb-6"
                    >
                      {copied ? <Check size={20} className="text-green-400" /> : <Copy size={20} />}
                      {copied ? "Código Copiado!" : "Copiar código Pix"}
                    </button>

                    <button 
                      onClick={() => window.location.reload()}
                      className="w-full py-4 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-bold text-lg transition-all"
                    >
                      Já paguei / Atualizar
                    </button>
                    
                    <p className="text-zinc-500 text-xs mt-4 text-center">
                      Assim que pagar no app do seu banco, clique no botão acima para liberar seu acesso.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Tabs de Seleção de Método */}
                    <div className="flex bg-black/40 rounded-xl p-1 mb-6 border border-white/10">
                      <button
                        onClick={() => setActiveTab('CREDIT_CARD')}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'CREDIT_CARD' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}
                      >
                        <CreditCard size={18} /> Cartão
                      </button>
                      <button
                        onClick={() => setActiveTab('PIX')}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'PIX' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}
                      >
                        <QrCode size={18} /> Pix Nativo
                      </button>
                    </div>

                    {activeTab === 'CREDIT_CARD' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">CPF/CNPJ *</label>
                            <input 
                              type="text" name="cpfCnpj" value={formData.cpfCnpj} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500 transition-colors"
                              placeholder="000.000.000-00"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">Celular (com DDD) *</label>
                            <input 
                              type="text" name="mobilePhone" value={formData.mobilePhone} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500 transition-colors"
                              placeholder="(11) 99999-9999"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div className="col-span-2">
                            <label className="text-xs text-zinc-400 mb-1 block">CEP *</label>
                            <input 
                              type="text" name="postalCode" value={formData.postalCode} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500 transition-colors"
                              placeholder="00000-000"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">Número *</label>
                            <input 
                              type="text" name="addressNumber" value={formData.addressNumber} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500 transition-colors"
                              placeholder="Ex: 123"
                            />
                          </div>
                        </div>

                        <div className="h-px w-full bg-white/10 my-2" />

                        <div>
                          <label className="text-xs text-zinc-400 mb-1 block">Nome impresso no cartão *</label>
                          <input 
                            type="text" name="holderName" value={formData.holderName} onChange={handleChange}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500 transition-colors uppercase"
                            placeholder="NOME COMO ESTÁ NO CARTÃO"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400 mb-1 block">Número do Cartão *</label>
                          <input 
                            type="text" name="cardNumber" value={formData.cardNumber} onChange={handleChange}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500 transition-colors"
                            placeholder="0000 0000 0000 0000"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">Mês (MM) *</label>
                            <input 
                              type="text" name="expiryMonth" value={formData.expiryMonth} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500 transition-colors"
                              placeholder="12" maxLength={2}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">Ano (AAAA) *</label>
                            <input 
                              type="text" name="expiryYear" value={formData.expiryYear} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500 transition-colors"
                              placeholder="2030" maxLength={4}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-400 mb-1 block">CVV *</label>
                            <input 
                              type="text" name="ccv" value={formData.ccv} onChange={handleChange}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500 transition-colors"
                              placeholder="123" maxLength={4}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'PIX' && (
                      <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                        <QrCode size={48} className="text-purple-400 opacity-50" />
                        <p className="text-zinc-300">Pagamento instantâneo via Pix.</p>
                        <p className="text-zinc-500 text-sm">O acesso é liberado em poucos segundos após a confirmação do pagamento.</p>
                        <div className="w-full text-left mt-4">
                          <label className="text-xs text-zinc-400 mb-1 block">CPF/CNPJ (Obrigatório para gerar o PIX) *</label>
                          <input 
                            type="text" name="cpfCnpj" value={formData.cpfCnpj} onChange={handleChange}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500 transition-colors"
                            placeholder="000.000.000-00"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => handleSubscribe(activeTab)}
                      disabled={loading}
                      className="mt-8 group relative w-full py-4 rounded-xl font-bold text-lg overflow-hidden transition-all disabled:opacity-70"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 transition-all group-hover:scale-[1.02]" />
                      <span className="relative flex items-center justify-center gap-2 text-white">
                        {loading ? (
                          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            {activeTab === 'PIX' ? 'Gerar PIX de R$ 9,90' : 'Pagar R$ 9,90'} <Check size={20} />
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
