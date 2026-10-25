import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, RotateCcw, HelpCircle, X, Loader2 } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  iconType?: 'trash' | 'reset' | 'warning' | 'info';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'warning',
  iconType = 'warning',
  loading = false,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  const renderIcon = () => {
    if (iconType === 'trash') {
      return <Trash2 className="w-5 h-5 text-red-400" />;
    }
    if (iconType === 'reset') {
      return <RotateCcw className="w-5 h-5 text-orange-400" />;
    }
    if (iconType === 'info') {
      return <HelpCircle className="w-5 h-5 text-cyan-400" />;
    }
    return <AlertTriangle className="w-5 h-5 text-amber-400" />;
  };

  const getIconBg = () => {
    if (variant === 'danger' || iconType === 'trash') return 'bg-red-500/10 border-red-500/20';
    if (variant === 'warning' || iconType === 'reset') return 'bg-orange-500/10 border-orange-500/20';
    return 'bg-amber-500/10 border-amber-500/20';
  };

  const getConfirmButtonClasses = () => {
    if (variant === 'danger') {
      return 'bg-red-600 hover:bg-red-500 active:scale-95 text-white shadow-lg shadow-red-600/30';
    }
    if (variant === 'warning') {
      return 'bg-orange-600 hover:bg-orange-500 active:scale-95 text-white shadow-lg shadow-orange-600/30';
    }
    return 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-lg shadow-emerald-600/30';
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-[#1c1c1e] border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-sm sm:max-w-md w-full shadow-2xl relative space-y-4 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${getIconBg()}`}>
              {renderIcon()}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                {title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="p-1.5 text-white/40 hover:text-white rounded-full transition-colors cursor-pointer disabled:opacity-40"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mensagem descritiva */}
        <div className="text-xs sm:text-sm text-white/70 leading-relaxed whitespace-pre-line">
          {message}
        </div>

        {/* Botões de Ação Mobile-First */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-h-[44px] disabled:opacity-40"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px] disabled:opacity-50 ${getConfirmButtonClasses()}`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processando...</span>
              </>
            ) : (
              <span>{confirmText}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
