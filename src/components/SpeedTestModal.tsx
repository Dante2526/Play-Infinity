import React from 'react';
import { X, Activity } from 'lucide-react';

interface SpeedTestModalProps {
  onClose: () => void;
}

export const SpeedTestModal: React.FC<SpeedTestModalProps> = ({ onClose }) => {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 pointer-events-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[#161616] border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col relative animate-in zoom-in-95 duration-200 h-[80vh] max-h-[600px]"
      >
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors backdrop-blur-md cursor-pointer active:scale-95"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 p-5 border-b border-white/5 bg-[#1a1a1a]">
          <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">Velocidade da Conexão</h2>
            <p className="text-xs text-neutral-400 font-medium">Testando velocidade com servidores globais (Fast.com)</p>
          </div>
        </div>

        <div className="flex-1 w-full h-full bg-white relative">
          <iframe 
            src="https://fast.com/pt/" 
            className="w-full h-full border-0 absolute inset-0"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            title="Speed Test"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      </div>
    </div>
  );
};
