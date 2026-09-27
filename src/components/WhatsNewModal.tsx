import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Wifi, Tv, PlaySquare, ChevronRight, X, Sparkles, CheckCircle2 } from 'lucide-react';
import { safeLocalStorage } from '../utils/safeStorage';

const WHATS_NEW_VERSION = 'v1.0.0-launch';

const SLIDES = [
  {
    id: 'downloads',
    title: 'Baixe e Assista Offline',
    description: 'Chegou o Plano Plus! Agora você pode fazer o download de seus filmes e séries favoritos para assistir sem precisar de internet, onde e quando quiser.',
    icon: <Download className="w-8 h-8 text-white" />,
    color: 'from-blue-600 to-cyan-500',
    glow: 'shadow-cyan-500/50'
  },
  {
    id: 'cast',
    title: 'Assista na sua TV',
    description: 'A magia do cinema na sua sala. Conecte com o Chromecast ou Smart TVs e assista em tela grande com apenas um toque, de forma automática.',
    icon: <Tv className="w-8 h-8 text-white" />,
    color: 'from-orange-600 to-amber-500',
    glow: 'shadow-orange-500/50'
  },
  {
    id: 'speedtest',
    title: 'Teste de Velocidade',
    description: 'Vídeo travando? Adicionamos uma ferramenta nativa para você testar a velocidade da sua internet direto do aplicativo.',
    icon: <Wifi className="w-8 h-8 text-white" />,
    color: 'from-purple-600 to-pink-500',
    glow: 'shadow-purple-500/50'
  },
  {
    id: 'playstore',
    title: 'Na Play Store em Breve!',
    description: 'É oficial: O Play Infinity está chegando na Google Play Store. Uma experiência muito mais fluida e segura nativa para o seu Android.',
    icon: <PlaySquare className="w-8 h-8 text-white" />,
    color: 'from-emerald-600 to-green-500',
    glow: 'shadow-emerald-500/50'
  }
];

export function WhatsNewModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    // Show only once
    const hasSeen = safeLocalStorage.getItem(`whats_new_${WHATS_NEW_VERSION}`);
    if (!hasSeen) {
      // Small delay to let the app load first
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    safeLocalStorage.setItem(`whats_new_${WHATS_NEW_VERSION}`, 'true');
  };

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(prev => prev + 1);
    } else {
      handleClose();
    }
  };

  if (!isOpen) return null;

  const slide = SLIDES[currentSlide];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
          onClick={handleClose}
        />

        {/* Modal Container */}
        <motion.div
          key="modal-content"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", bounce: 0.4, duration: 0.6 }}
          className="relative w-full max-w-sm bg-neutral-900/90 border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        >
          {/* Close button */}
          <button 
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/70 hover:text-white transition-colors z-10"
          >
            <X size={18} />
          </button>

          {/* Animated Header Background */}
          <div className={`relative h-48 w-full overflow-hidden flex items-center justify-center bg-gradient-to-br ${slide.color}`}>
            <motion.div
              key={slide.id + '-bg'}
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 bg-black/20"
            />
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-30 mix-blend-overlay"></div>
            
            <motion.div
              key={slide.id + '-icon'}
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", bounce: 0.6, duration: 0.8, delay: 0.1 }}
              className={`w-20 h-20 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/30 shadow-2xl ${slide.glow}`}
            >
              {slide.icon}
            </motion.div>

            {/* Sparkles */}
            <Sparkles className="absolute top-6 left-6 text-white/50 w-5 h-5 animate-pulse" />
            <Sparkles className="absolute bottom-8 right-8 text-white/40 w-4 h-4 animate-pulse delay-300" />
          </div>

          {/* Content */}
          <div className="p-6 flex flex-col flex-1">
            <div className="flex justify-center gap-1.5 mb-6">
              {SLIDES.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === currentSlide ? 'w-6 bg-white' : 'w-1.5 bg-white/20'}`} 
                />
              ))}
            </div>

            <motion.div
              key={slide.id + '-text'}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="text-center flex-1"
            >
              <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">{slide.title}</h2>
              <p className="text-neutral-400 text-[15px] leading-relaxed">
                {slide.description}
              </p>
            </motion.div>

            {/* Action Button */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleNext}
              className={`mt-8 w-full py-3.5 rounded-xl flex items-center justify-center gap-2 font-bold text-white transition-all bg-gradient-to-r ${slide.color} shadow-lg ${slide.glow}`}
            >
              {currentSlide === SLIDES.length - 1 ? (
                <>
                  <CheckCircle2 size={20} />
                  <span>Entendido!</span>
                </>
              ) : (
                <>
                  <span>Próximo</span>
                  <ChevronRight size={20} />
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
