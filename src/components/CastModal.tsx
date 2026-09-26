import React, { useState } from 'react';
import { Cast, Tv, Smartphone, QrCode, MonitorUp, X, MonitorSmartphone, ChevronLeft, Copy, Check, Play } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Chromecast } from 'capacitor-chromecast';

import { registerPlugin } from '@capacitor/core';
const RokuDiscovery = registerPlugin<any>('RokuDiscovery');

interface CastModalProps {
  onClose: () => void;
  streamUrl?: string;
  title?: string;
}

export const CastModal: React.FC<CastModalProps> = ({ onClose, streamUrl, title }) => {
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  
  // Roku States
  const [showRoku, setShowRoku] = useState(false);
  const [isSearchingRoku, setIsSearchingRoku] = useState(false);
  const [rokuDevices, setRokuDevices] = useState<string[]>([]);
  
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => {});
    }
  };



  const handleRokuDiscovery = async () => {
    if (!Capacitor.isNativePlatform()) {
      setStatusMsg("A busca por Roku só funciona no aplicativo instalado.");
      return;
    }
    
    setStatusMsg(null);
    setShowQR(false);
    setShowRoku(true);
    setIsSearchingRoku(true);
    setRokuDevices([]);
    
    try {
      const result = await RokuDiscovery.discover();
      if (result && result.devices && result.devices.length > 0) {
        setRokuDevices(result.devices);
      } else {
        setStatusMsg("Nenhuma Roku encontrada na mesma rede Wi-Fi.");
      }
    } catch (e: any) {
      console.error(e);
      setStatusMsg("Erro Roku: " + (e.message || "Verifique o Wi-Fi."));
    } finally {
      setIsSearchingRoku(false);
    }
  };

  const playOnRoku = async (ip: string) => {
    setStatusMsg("Conectando à Roku...");
    try {
      const targetUrl = streamUrl || currentUrl;
      const absoluteUrl = new URL(targetUrl, window.location.origin).href;
      // Chamada ECP para o Roku Media Player (15985)
      const url = `http://${ip}:8060/launch/15985?u=${encodeURIComponent(absoluteUrl)}&t=v`;
      
      await fetch(url, {
        method: 'POST',
        // O Roku geralmente não requer headers especiais para o ECP na rede local
        mode: 'no-cors' 
      });
      
      onClose();
    } catch (e) {
      setStatusMsg("Erro ao iniciar reprodução na Roku.");
    }
  };

  const handleNativeCast = async () => {
    setStatusMsg(null);
    try {
      if (Capacitor.isNativePlatform()) {
        try {
          await Chromecast.initialize({ receiverApplicationId: 'CC1AD845' });
          await Chromecast.show();
          onClose();
          return;
        } catch (err) {
          console.error("Chromecast Native Error", err);
        }
      }

      // 1. Tentar Remote Playback API nativa nos elementos de vídeo presentes (Chrome Android / iOS Safari AirPlay)
      const videos = document.querySelectorAll('video');
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i] as any;
        if (video.remote && typeof video.remote.prompt === 'function') {
          try {
            await video.remote.prompt();
            onClose();
            return;
          } catch (err: any) {
            if (err?.name === 'NotFoundError' || err?.name === 'AbortError') return;
          }
        }
        if (typeof video.webkitShowPlaybackTargetPicker === 'function') {
          video.webkitShowPlaybackTargetPicker();
          onClose();
          return;
        }
      }

      // 2. Tentar Presentation API do navegador (Chrome / Edge / TVs)
      if ((navigator as any).presentation && (navigator as any).presentation.defaultRequest) {
        try {
          await (navigator as any).presentation.defaultRequest.start();
          onClose();
          return;
        } catch (err: any) {
          if (err?.name === 'NotFoundError' || err?.name === 'AbortError') return;
        }
      }

      setStatusMsg("Restrição de Navegador: Para proteger direitos autorais, o Chrome/Safari no celular bloqueia transmissões diretas de players protegidos. Use o Código QR abaixo para abrir direto na TV ou arraste a barra do seu celular e use o 'Smart View'/'Transmitir Tela'.");
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

        {!showQR && !showRoku ? (
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
              onClick={handleRokuDiscovery}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-800/80 hover:bg-neutral-700/80 border border-neutral-700 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                <Tv className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-neutral-200">Transmitir para Roku (Direto)</div>
                <div className="text-[10px] text-neutral-400">Acha a Roku na rede e toca sem app</div>
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

            <div className="w-full flex flex-col items-center gap-1.5 p-3 rounded-xl bg-neutral-800/40 border border-neutral-800 pointer-events-none opacity-85 text-center mt-1">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <MonitorSmartphone className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-neutral-300">AirPlay (iPhone) / Smart View</div>
                <div className="text-[10px] text-neutral-500">Arraste a central de atalhos do seu celular</div>
              </div>
            </div>
          </div>
        ) : showRoku ? (
          <div className="space-y-3 mt-2 text-left">
            {isSearchingRoku ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="ml-3 text-sm text-neutral-300">Buscando Rokus na rede...</span>
              </div>
            ) : rokuDevices.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {rokuDevices.map(ip => (
                  <button
                    key={ip}
                    onClick={() => playOnRoku(ip)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 transition-colors cursor-pointer"
                  >
                    <span className="text-sm text-neutral-200 font-semibold">Roku ({ip})</span>
                    <Play className="w-4 h-4 text-purple-400" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-2 text-neutral-400 text-sm">
                Nenhuma Roku encontrada.
              </div>
            )}
            
            <button
              onClick={handleRokuDiscovery}
              className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-semibold text-white transition-colors"
            >
              Tentar Novamente
            </button>
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
