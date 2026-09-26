import React, { useState, useEffect, useRef } from 'react';
import { X, Activity, Wifi, RefreshCcw, Loader2, AlertCircle, CheckCircle2, Zap, Gauge } from 'lucide-react';

interface SpeedTestModalProps {
  onClose: () => void;
}

export const SpeedTestModal: React.FC<SpeedTestModalProps> = ({ onClose }) => {
  const [speedMbps, setSpeedMbps] = useState<number>(0);
  const [status, setStatus] = useState<'idle' | 'testing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const testInternetSpeed = () => {
    setStatus('testing');
    setSpeedMbps(0);
    setMessage('Medindo velocidade de download...');

    // 100MB de payload direto do servidor local (evita problemas de CORS no WebView)
    const bytesToDownload = 100 * 1024 * 1024; 
    const url = `${window.location.origin}/api/speedtest-down?bytes=${bytesToDownload}&v=${Date.now()}`;
    
    const xhr = new XMLHttpRequest();
    const startTime = performance.now();
    let receivedBytes = 0;
    
    // Teste rodará por 8 segundos ou até baixar os 100MB
    let timerId = setTimeout(() => {
        xhr.abort();
    }, 8000);

    xhr.open('GET', url, true);
    
    // Header para tentar evitar bloqueios de CORS em alguns WebViews mais antigos
    xhr.setRequestHeader("Accept", "application/octet-stream");

    xhr.onprogress = (event) => {
        receivedBytes = event.loaded;
        const now = performance.now();
        const duration = (now - startTime) / 1000;
        if (duration > 0.3) {
            const mbps = (receivedBytes * 8 / (1000 * 1000)) / duration;
            setSpeedMbps(Math.round(mbps));
        }
    };

    xhr.onloadend = () => {
        clearTimeout(timerId);
        
        if (receivedBytes === 0) {
            setStatus('error');
            setMessage("Erro ao medir a velocidade. Verifique sua conexão.");
            return;
        }

        const endTime = performance.now();
        let durationSeconds = (endTime - startTime) / 1000;
        if (durationSeconds < 0.1) durationSeconds = 0.1;
        
        const bitsLoaded = receivedBytes * 8;
        const mbps = (bitsLoaded / (1000 * 1000)) / durationSeconds;
        const finalSpeed = Math.round(mbps);

        setSpeedMbps(finalSpeed);
        
        if (finalSpeed < 5) {
           setMessage("Sua internet não tá legal para streaming. Pode haver travamentos.");
        } else if (finalSpeed < 25) {
           setMessage("Sua internet está boa para streaming em Alta Qualidade.");
        } else {
           setMessage("Sua internet tá super veloz para streaming!");
        }
        setStatus('done');
    };

    xhr.onerror = () => {
        clearTimeout(timerId);
        setStatus('error');
        setMessage("Erro de rede. Verifique sua conexão.");
    };

    xhr.send();
  };


  useEffect(() => {
    testInternetSpeed();
  }, []);

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
        className="w-full max-w-sm bg-[#161616] border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col relative animate-in zoom-in-95 duration-200"
      >
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors backdrop-blur-md cursor-pointer active:scale-95"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-500">
            {status === 'testing' ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : status === 'error' ? (
              <AlertCircle className="w-8 h-8 text-red-500" />
            ) : status === 'done' && speedMbps >= 25 ? (
              <Zap className="w-8 h-8 text-yellow-400" />
            ) : status === 'done' && speedMbps >= 5 ? (
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            ) : (
              <Gauge className="w-8 h-8 text-yellow-500" />
            )}
          </div>

          <div>
            <h2 className="text-white font-bold text-xl mb-1">Medidor de Velocidade</h2>
            <p className="text-sm text-neutral-400 font-medium">Conexão com os servidores</p>
          </div>

          <div className="py-4">
            <div className="flex items-baseline justify-center gap-1">
              <span className={`text-6xl font-black tracking-tighter ${status === 'error' ? 'text-neutral-600' : 'text-white'}`}>
                {speedMbps}
              </span>
              <span className="text-lg font-bold text-neutral-500">Mbps</span>
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded-2xl text-sm font-semibold transition-colors ${
               status === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
               status === 'done' && speedMbps < 5 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
               status === 'done' && speedMbps < 25 ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
               status === 'done' && speedMbps >= 25 ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
               'bg-neutral-800/50 text-neutral-300'
            }`}>
              {message}
            </div>
          )}

          <button
            onClick={testInternetSpeed}
            disabled={status === 'testing'}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full bg-white/5 hover:bg-white/10 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCcw className={`w-4 h-4 ${status === 'testing' ? 'animate-spin' : ''}`} />
            Refazer Teste
          </button>
        </div>
      </div>
    </div>
  );
};
