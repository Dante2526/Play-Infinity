import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Copy, Check, X, RefreshCw, Terminal, ChevronDown, ChevronUp } from 'lucide-react';

export interface AppErrorInfo {
  id: string;
  message: string;
  stack?: string;
  type: 'Runtime Error' | 'Promise Rejection' | 'React Render Error' | 'Erro no Sistema';
  timestamp: string;
  url: string;
  userAgent: string;
  context?: string;
  componentStack?: string;
}

// Helper global para disparar erros manualmente de qualquer parte do app
declare global {
  interface Window {
    reportAppError?: (error: any, context?: string) => void;
  }
}

// Filtra mensagens inofensivas e ruídos de browser
function isIgnorableError(message?: string, stack?: string): boolean {
  const combined = `${message || ''} ${stack || ''}`.toLowerCase();
  if (!combined.trim()) return false;

  // Ruídos de WebSocket e Vite HMR (normais no ambiente Cloud Run / Dev)
  if (combined.includes('websocket closed without opened')) return true;
  if (combined.includes('[vite] failed to connect to websocket')) return true;
  if (combined.includes('@vite/client')) return true;
  if (combined.includes('vite/client')) return true;

  // Ruídos do ciclo de vida de mídia HTML5 / Browser
  if (combined.includes('the play() request was interrupted')) return true;
  if (combined.includes('resizeobserver loop completed')) return true;
  if (combined.includes('resizeobserver loop limit exceeded')) return true;
  if (combined.includes('the user aborted a request')) return true;
  if (combined.includes('aborterror')) return true;
  if (combined.includes('permissions check failed')) return true;
  if (combined.includes('requestfullscreen')) return true;
  if (combined.includes('fullscreen request was denied')) return true;
  if (combined.includes('orientation lock failed')) return true;
  if (combined.includes('screen.orientation')) return true;

  return false;
}

export function reportAppError(error: any, context?: string) {
  if (typeof window === 'undefined') return;
  const customEvent = new CustomEvent('app-error-event', {
    detail: { error, context }
  });
  window.dispatchEvent(customEvent);
}

if (typeof window !== 'undefined') {
  window.reportAppError = reportAppError;
}

interface GlobalErrorModalProps {
  // Propriedades opcionais caso queira controlar externamente
  forcedError?: AppErrorInfo | null;
  onCloseForced?: () => void;
}

export function GlobalErrorModal({ forcedError, onCloseForced }: GlobalErrorModalProps) {
  const [errorList, setErrorList] = useState<AppErrorInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFullStack, setShowFullStack] = useState(false);

  const activeError = forcedError || errorList[errorList.length - 1] || null;

  const pushNewError = (newErr: AppErrorInfo) => {
    if (isIgnorableError(newErr.message, newErr.stack || newErr.context)) return;
    setErrorList(prev => {
      // Evita duplicar exatamente o mesmo erro em curto intervalo
      const last = prev[prev.length - 1];
      if (last && last.message === newErr.message && Date.now() - new Date(last.timestamp).getTime() < 3000) {
        return prev;
      }
      return [...prev, newErr];
    });
    setIsOpen(true);
    setCopied(false);
  };

  useEffect(() => {
    if (forcedError) {
      if (isIgnorableError(forcedError.message, forcedError.stack)) return;
      setIsOpen(true);
    }
  }, [forcedError]);

  useEffect(() => {
    // 1. Escuta erros globais de runtime (JavaScript)
    const handleError = (event: ErrorEvent) => {
      const msg = event.message || (event.error && event.error.message) || 'Erro de execução desconhecido';
      const stack = event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`;
      if (isIgnorableError(msg, stack)) return;

      const info: AppErrorInfo = {
        id: Math.random().toString(36).substring(2, 9),
        message: msg,
        stack,
        type: 'Runtime Error',
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        context: event.filename ? `Arquivo: ${event.filename} (linha ${event.lineno}, coluna ${event.colno})` : undefined
      };
      pushNewError(info);
    };

    // 2. Escuta Promises rejeitadas não capturadas
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      let msg = 'Falha em operação assíncrona (Promise Rejection)';
      let stack: string | undefined;

      if (typeof reason === 'string') {
        msg = reason;
      } else if (reason instanceof Error) {
        msg = reason.message;
        stack = reason.stack;
      } else if (reason && typeof reason === 'object') {
        msg = reason.message || reason.description || JSON.stringify(reason);
      }

      if (isIgnorableError(msg, stack)) return;

      const info: AppErrorInfo = {
        id: Math.random().toString(36).substring(2, 9),
        message: msg,
        stack: stack || (reason && typeof reason === 'object' ? JSON.stringify(reason, null, 2) : undefined),
        type: 'Promise Rejection',
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
      };
      pushNewError(info);
    };

    // 3. Escuta eventos customizados de erro disparados pelo app
    const handleCustomAppError = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { error, context } = customEvent.detail || {};
      let msg = 'Erro reportado pelo aplicativo';
      let stack: string | undefined;

      if (typeof error === 'string') {
        msg = error;
      } else if (error instanceof Error) {
        msg = error.message;
        stack = error.stack;
      } else if (error && typeof error === 'object') {
        msg = error.message || error.description || JSON.stringify(error);
      }

      if (isIgnorableError(msg, stack)) return;

      const info: AppErrorInfo = {
        id: Math.random().toString(36).substring(2, 9),
        message: msg,
        stack: stack,
        type: 'Erro no Sistema',
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        context
      };
      pushNewError(info);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('app-error-event', handleCustomAppError);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('app-error-event', handleCustomAppError);
    };
  }, []);

  const formatErrorForClipboard = (err: AppErrorInfo): string => {
    return [
      '========================================',
      '🚨 RELATÓRIO DE ERRO - PLAY INFINITY',
      '========================================',
      `Data/Hora: ${new Date(err.timestamp).toLocaleString('pt-BR')}`,
      `Tipo: ${err.type}`,
      `Página/URL: ${err.url}`,
      err.context ? `Contexto: ${err.context}` : null,
      '----------------------------------------',
      'MENSAGEM DO ERRO:',
      err.message,
      '----------------------------------------',
      err.stack ? `STACK TRACE (PILHA TÉCNICA):\n${err.stack}` : null,
      err.componentStack ? `COMPONENT STACK (REACT):\n${err.componentStack}` : null,
      '----------------------------------------',
      `Dispositivo / Navegador: ${err.userAgent}`,
      '========================================'
    ].filter(Boolean).join('\n');
  };

  const handleCopy = () => {
    if (!activeError) return;
    const text = formatErrorForClipboard(activeError);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Falha ao copiar:', e);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    if (onCloseForced) onCloseForced();
  };

  return (
    <>
      {/* Botão flutuante discreto caso haja erro recente e o modal tenha sido fechado */}
      {!isOpen && activeError && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 left-4 z-[99999] flex items-center gap-2 px-3 py-2 bg-red-600/90 hover:bg-red-500 text-white rounded-xl shadow-lg shadow-red-600/30 text-xs font-semibold backdrop-blur-md border border-red-400/40 transition-all hover:scale-105"
          title="Clique para ver os detalhes do erro registrado"
        >
          <AlertTriangle size={15} className="animate-pulse text-yellow-300" />
          <span>Ver Erro Detectado ({errorList.length})</span>
        </button>
      )}

      {/* Modal Principal de Exibição do Erro */}
      <AnimatePresence>
        {isOpen && activeError && (
          <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            {/* Backdrop com desfoque */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="fixed inset-0 bg-black/85 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 15 }}
              className="relative w-full max-w-xl my-auto rounded-2xl bg-zinc-950 border border-red-500/40 shadow-[0_0_50px_rgba(239,68,68,0.25)] flex flex-col max-h-[92vh] overflow-hidden text-left z-10"
            >
              {/* Header do Modal */}
              <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-red-950/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0">
                    <AlertTriangle className="text-red-400 w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                      Erro Detectado no Aplicativo
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                        {activeError.type}
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      {new Date(activeError.timestamp).toLocaleTimeString('pt-BR')} • Copie o erro abaixo para enviar ao suporte
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Corpo com a Mensagem e a Caixa de Código */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 text-xs">
                {/* Mensagem Principal */}
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25">
                  <span className="text-[11px] font-semibold text-red-300 block mb-1 uppercase tracking-wider">
                    Mensagem da Falha:
                  </span>
                  <p className="text-white font-mono text-xs sm:text-sm break-words whitespace-pre-wrap leading-relaxed select-all">
                    {activeError.message}
                  </p>
                </div>

                {activeError.context && (
                  <div className="p-2.5 rounded-lg bg-zinc-900 border border-white/10 text-zinc-300 font-mono text-[11px] break-words">
                    <strong className="text-zinc-400">Contexto:</strong> {activeError.context}
                  </div>
                )}

                {/* Bloco de Detalhes Técnicos / Stack Trace */}
                {(activeError.stack || activeError.componentStack) && (
                  <div className="border border-white/10 rounded-xl overflow-hidden bg-black/60">
                    <button
                      type="button"
                      onClick={() => setShowFullStack(!showFullStack)}
                      className="w-full px-3 py-2 bg-zinc-900/80 hover:bg-zinc-800/80 flex items-center justify-between text-zinc-300 font-medium text-xs transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Terminal size={14} className="text-purple-400" /> Detalhes Técnicos (Stack Trace)
                      </span>
                      {showFullStack ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {showFullStack && (
                      <div className="p-3 max-h-48 overflow-y-auto text-[11px] font-mono text-zinc-400 whitespace-pre-wrap leading-relaxed break-all select-all">
                        {activeError.stack || activeError.componentStack}
                      </div>
                    )}
                  </div>
                )}

                {/* Informações adicionais do sistema */}
                <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-white/5 text-[10px] text-zinc-500 space-y-0.5">
                  <div className="truncate"><strong className="text-zinc-400">URL:</strong> {activeError.url}</div>
                  <div className="truncate"><strong className="text-zinc-400">Navegador:</strong> {activeError.userAgent}</div>
                </div>
              </div>

              {/* Ações do Rodapé */}
              <div className="p-4 sm:p-5 border-t border-white/10 bg-zinc-950 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RefreshCw size={14} /> Recarregar Página
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-medium text-xs transition-colors"
                  >
                    Fechar
                  </button>

                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${
                      copied
                        ? 'bg-green-600 text-white shadow-green-600/30'
                        : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 hover:scale-[1.02]'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check size={16} className="text-white" />
                        <span>Copiado com Sucesso!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        <span>Copiar Erro Completo</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// React Error Boundary para capturar falhas críticas de renderização do React
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: AppErrorInfo | null;
}

export class AppErrorBoundary extends (React.Component as any) {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(_: Error): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    const info: AppErrorInfo = {
      id: Math.random().toString(36).substring(2, 9),
      message: error.message || 'Falha crítica no componente da interface',
      stack: error.stack,
      componentStack: errorInfo?.componentStack || undefined,
      type: 'React Render Error',
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
    };
    this.setState({ errorInfo: info });

    // Auto-reload automático pra erros de "Failed to fetch dynamically imported module"
    // (cache stale de chunks do Vite após deploy — resolve sozinho com reload)
    const errMsg = (error.message || '').toLowerCase();
    if (
      errMsg.includes('failed to fetch dynamically imported module') ||
      errMsg.includes('importing a module script') ||
      errMsg.includes('loading chunk') ||
      errMsg.includes('loading script') ||
      (errMsg.includes('dynamic') && errMsg.includes('import'))
    ) {
      console.warn('[AppErrorBoundary] Chunk loading error detected — auto-reloading with cache-bust...');
      // Pequeno delay pra não relodar em loop (backoff exponencial)
      const lastReload = parseInt(sessionStorage.getItem('__chunkReloadAt') || '0', 10);
      const now = Date.now();
      if (now - lastReload > 10000) { // 10s cooldown
        sessionStorage.setItem('__chunkReloadAt', String(now));
        // Tenta limpar service worker caches (se tiver)
        if ('caches' in window) {
          caches.keys().then((keys) => {
            keys.forEach((k) => caches.delete(k));
            // Reload com cache-bust na URL pra forçar navegador refazer index.html
            const sep = window.location.href.includes('?') ? '&' : '?';
            const newUrl = window.location.href.split(sep)[0] + sep + 'nocache=' + now;
            window.location.replace(newUrl);
          }).catch(() => {
            const sep = window.location.href.includes('?') ? '&' : '?';
            const newUrl = window.location.href.split(sep)[0] + sep + 'nocache=' + now;
            window.location.replace(newUrl);
          });
        } else {
          const sep = window.location.href.includes('?') ? '&' : '?';
          const newUrl = window.location.href.split(sep)[0] + sep + 'nocache=' + now;
          window.location.replace(newUrl);
        }
      }
    }
  }

  render() {
    if (this.state.hasError && this.state.errorInfo) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
          <GlobalErrorModal
            forcedError={this.state.errorInfo}
            onCloseForced={() => {
              this.setState({ hasError: false, errorInfo: null });
              window.location.reload();
            }}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
