import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../services/firebase';
import { getClientId } from '../utils/clientId';
import { AlertTriangle, X, UploadCloud, Image as ImageIcon, Send } from 'lucide-react';

interface ReportBugModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaId: string;
  mediaTitle: string;
  mediaType: string;
  episodeInfo?: string;
}

export function ReportBugModal({
  isOpen,
  onClose,
  mediaId,
  mediaTitle,
  mediaType,
  episodeInfo
}: ReportBugModalProps) {
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    // Valida tipo: apenas imagens reais
    if (!file.type.startsWith('image/')) {
      setError('Apenas imagens (PNG, JPG, GIF) são aceitas.');
      return;
    }
    // Valida tamanho: máximo 5MB (mesmo limite da UI e do servidor)
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 5MB.');
      return;
    }
    setImageFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('A descrição do problema é obrigatória.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let imageUrl = null;
      let storagePath = null;
      const user = auth.currentUser;
      // ClientId = uid do Firebase quando logado (habilita o loop de feedback:
      // a regra do Firestore permite ler/apagar apenas docs onde clientId == auth.uid).
      // Usuários anônimos usam o identificador de localStorage (sem loop de feedback).
      const clientId = user?.uid || getClientId();

      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop() || 'png';
        const filename = `${clientId}_${Date.now()}.${fileExt}`;
        
        // Converter file para base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(imageFile);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });

        const uploadRes = await fetch('/api/upload-bug-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, filename })
        });

        if (!uploadRes.ok) {
          throw new Error('Falha ao enviar a imagem.');
        }
        
        const data = await uploadRes.json();
        imageUrl = data.url;
        storagePath = `vps/${filename}`;
      }

      await addDoc(collection(db, 'bug_reports'), {
        clientId,
        userName: user?.displayName || user?.email?.split('@')[0] || 'Anônimo',
        userEmail: user?.email || 'N/A',
        mediaId,
        mediaTitle,
        mediaType,
        episodeInfo: episodeInfo || null,
        description: description.trim(),
        imageUrl,
        storagePath,
        status: 'pending',
        adminResponse: null,
        createdAt: serverTimestamp()
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setDescription('');
        setImageFile(null);
        onClose();
      }, 3000);
    } catch (err: any) {
      console.error('Erro ao relatar bug:', err);
      setError('Ocorreu um erro ao enviar o relatório. Tente novamente mais tarde.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-[#0a0a0a]/90 backdrop-blur-3xl border border-white/10 rounded-3xl max-w-md w-full p-6 sm:p-8 relative overflow-hidden shadow-[0_0_50px_-12px_rgba(239,68,68,0.2)] animate-in zoom-in-95 duration-300">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-orange-500"></div>
        
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-5 right-5 text-zinc-500 hover:text-white transition-colors disabled:opacity-50 hover:bg-white/10 p-1.5 rounded-full"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl sm:text-2xl font-black text-white mb-2 flex items-center gap-2.5">
          <AlertTriangle className="text-red-500 w-6 h-6" />
          Reportar Bug
        </h2>
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
          Encontrou algum problema com <strong className="text-white">{mediaTitle}</strong> {episodeInfo ? `- ${episodeInfo}` : ''}? Nos detalhe abaixo.
        </p>

        {success ? (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-5 rounded-2xl text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-green-500" />
            </div>
            <p className="font-medium text-sm">Relatório enviado com sucesso!<br/>Nossa equipe analisará em breve.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
                Descrição do Problema *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: A tela fica preta, o áudio está sem sincronia..."
                className="w-full bg-white/5 text-white border border-white/10 rounded-xl p-3.5 focus:outline-none focus:border-red-500 focus:bg-white/10 transition-colors min-h-[110px] text-sm resize-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
                Anexar Print (Opcional)
              </label>
              <label 
                htmlFor="file-upload"
                className={`mt-1 flex justify-center px-6 py-7 border-2 border-dashed rounded-xl cursor-pointer transition-colors relative group ${
                  imageFile 
                    ? 'border-green-500/30 bg-green-500/10 hover:bg-green-500/20' 
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="space-y-2 text-center flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    imageFile ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-zinc-400 group-hover:bg-red-500/10 group-hover:text-red-400'
                  }`}>
                    {imageFile ? <ImageIcon className="w-5 h-5" /> : <UploadCloud className="w-5 h-5" />}
                  </div>
                  <div className="flex text-sm justify-center mt-2">
                    <span className={`font-medium transition-colors truncate max-w-[200px] sm:max-w-[300px] ${
                      imageFile ? 'text-green-400' : 'text-red-500 group-hover:text-red-400'
                    }`}>
                      {imageFile ? imageFile.name : 'Fazer Upload'}
                    </span>
                    <input id="file-upload" name="file-upload" type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
                  </div>
                  {!imageFile ? (
                    <p className="text-xs text-zinc-500 font-medium">
                      PNG, JPG, GIF até 5MB
                    </p>
                  ) : (
                    <p className="text-xs text-green-500/70 font-medium mt-1">
                      Clique para trocar a imagem
                    </p>
                  )}
                </div>
              </label>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="pt-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-5 py-2.5 text-sm font-semibold text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-500 shadow-[0_0_20px_-5px_rgba(239,68,68,0.5)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Enviar Relatório
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
