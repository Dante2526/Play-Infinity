import React, { useState } from 'react';
import { Cast, Tv, Smartphone, QrCode, MonitorUp, X, MonitorSmartphone, ChevronLeft, Copy, Check } from 'lucide-react';

interface CastModalProps {
  onClose: () => void;
}

export const CastModal: React.FC<CastModalProps> = ({ onClose }) => {
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => {});
    }
  };

  const handleNativeCast = async () => {
    setStatusMsg(null);
    try {
      // 1. Tentar Remote Playback API nativa nos elementos de vídeo presentes
      const videos = document.querySelectorAll('video');
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i] as any;
        if (video.remote && typeof video.remote.prompt === 'function') {
          try {
            await video.remote.prompt();
            onClose();
            return;
          } catch (err: any) {
            // Se o usuário apenas cancelou o seletor da TV
            if (err?.name === 'NotFoundError' || err?.name === 'AbortError') {
              return;
            }
          }
        }
      }

      // 2. Tentar Presentation API do navegador (Chrome / Edge / TVs)
      if ((navigator as any).presentation && (navigator as any).presentation.defaultRequest) {
        try {
          await (navigator as any).presentation.defaultRequest.start();
          onClose();
          return;
        } catch (err: any) {
          if (err?.name === 'NotFoundError' || err?.name === 'AbortError') {
            return;
          }
        }
      }

      // 3. Fallback informativo caso o navegador/dispositivo não suporte a API
      setStatusMsg("Nenhum receptor compatível com transmissão direta detectado neste navegador. Use o Código QR ou o espelhamento do seu celular (Smart View / AirPlay).");
    } catch (e) {
      setStatusMsg("Dispositivo de transmissão não localizado. Conecte na mesma rede Wi-Fi da Smart TV.");
    }
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 pointer-events-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-[#161616]/95 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-2xl text-white space-y-4 text-center animate-in zoom-in-95 duration-200"
      >
        <div className="w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto text-orange-500">
          <Cast className="w-6 h-6 stroke-[1.8]" />
        </div>

        <div>
          <h3 className="text-base font-bold text-white">Assistir na Smart TV</h3>
          <p className="text-xs text-neutral-400 mt-1 px-2">
            Escolha como prefere transmitir ou abrir na sua TV:
          </p>
        </div>

        {statusMsg && (
          <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-left text-amber-200 text-xs">
            {statusMsg}
          </div>
        )}

        {!showQR ? (
          <div className="space-y-2 mt-3 text-left">
            <button
              onClick={handleNativeCast}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-800/80 hover:bg-neutral-700/80 border border-neutral-700 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center shrink-0">
                <MonitorUp className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-neutral-200">Transmitir (Chromecast / Google Cast)</div>
                <div className="text-[10px] text-neutral-400">Busca TVs na mesma rede Wi-Fi</div>
              </div>
            </button>

            <button
              onClick={() => {
                setStatusMsg(null);
                setShowQR(true);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-800/80 hover:bg-neutral-700/80 border border-neutral-700 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <QrCode className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-neutral-200">Código QR & Link Direto</div>
                <div className="text-[10px] text-neutral-400">Abra instantaneamente no navegador da TV</div>
              </div>
            </button>

            <div className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-800/40 border border-neutral-800 pointer-events-none opacity-85">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                <MonitorSmartphone className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-neutral-300">Smart View / AirPlay</div>
                <div className="text-[10px] text-neutral-500">Arraste a central de atalhos do seu celular</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            <div className="bg-white p-3.5 rounded-xl mx-auto w-fit flex flex-col items-center shadow-lg">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(currentUrl)}`} 
                alt="QR Code" 
                className="w-36 h-36 rounded-lg"
              />
              <p className="text-black text-[10px] font-bold mt-2 text-center max-w-[160px]">
                Aponte a câmera do celular ou da TV
              </p>
            </div>

            <button
              onClick={handleCopyLink}
              className="w-full py-2 px-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-neutral-400" />}
              <span>{copied ? "Link Copiado!" : "Copiar Link para o Navegador da TV"}</span>
            </button>
          </div>
        )}

        <button
          onClick={() => {
            if (showQR) {
              setShowQR(false);
            } else {
              onClose();
            }
          }}
          className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs sm:text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          {showQR ? <ChevronLeft className="w-4 h-4" /> : null}
          {showQR ? 'Voltar' : 'Fechar'}
        </button>
      </div>
    </div>
  );
};
