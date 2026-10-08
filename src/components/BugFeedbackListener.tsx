import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../services/firebase';
import { ShieldCheck, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ResolvedBug {
  id: string;
  adminResponse: string;
  mediaTitle: string;
}

export function BugFeedbackListener() {
  const [resolvedBugs, setResolvedBugs] = useState<ResolvedBug[]>([]);
  const [authUid, setAuthUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  // Reage a login/logout (o feedback só existe para usuários logados)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setAuthUid(user?.uid ?? null));
    return () => unsub();
  }, []);

  // Ouve bugs marcados como "resolved" pelo admin — apenas para usuários logados.
  // O modal grava clientId = auth.uid; as regras do Firestore permitem ler
  // apenas os documentos onde clientId == request.auth.uid.
  useEffect(() => {
    if (!authUid) {
      setResolvedBugs([]);
      return;
    }

    const q = query(
      collection(db, 'bug_reports'),
      where('clientId', '==', authUid),
      where('status', '==', 'resolved')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bugs: ResolvedBug[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        bugs.push({
          id: d.id,
          adminResponse: data.adminResponse || 'Seu relatório foi resolvido!',
          mediaTitle: data.mediaTitle || 'Conteúdo'
        });
      });
      setResolvedBugs(bugs);
    }, (error) => {
      // Sem falha silenciosa: qualquer problema (ex: regras do Firestore) aparece no console
      console.warn('[BugFeedback] Não foi possível escutar feedback de bugs:', error?.message || error);
    });

    return () => unsubscribe();
  }, [authUid]);

  const handleDismiss = async (bug: ResolvedBug) => {
    // Remove da UI imediatamente
    setResolvedBugs(prev => prev.filter(b => b.id !== bug.id));

    // Deleta o registro do Firestore (permitido pela regra: dono do documento).
    // A imagem anexa (na VPS) é removida pelo painel admin via /api/admin/delete-bug-image —
    // o delete antigo via Firebase Storage nunca funcionava (o arquivo vive no disco da VPS).
    try {
      await deleteDoc(doc(db, 'bug_reports', bug.id));
    } catch (err) {
      console.error('Erro ao remover bug resolvido:', err);
    }
  };

  if (resolvedBugs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-3">
      <AnimatePresence>
        {resolvedBugs.map(bug => (
          <motion.div
            key={bug.id}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className="bg-[#1a1a1a] border-l-4 border-green-500 rounded-lg shadow-2xl p-4 w-[320px] relative flex flex-col gap-2"
          >
            <button 
              onClick={() => handleDismiss(bug)}
              className="absolute top-2 right-2 text-gray-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-green-400 font-bold mb-1 pr-6">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <h3 className="text-sm">Feedback de Relatório</h3>
            </div>
            <p className="text-xs text-gray-400">Referente a: <strong className="text-gray-200">{bug.mediaTitle}</strong></p>
            <div className="bg-[#2a2a2a] p-2.5 rounded border border-gray-800 mt-1">
              <p className="text-sm text-gray-300">"{bug.adminResponse}"</p>
            </div>
            <button 
              onClick={() => handleDismiss(bug)}
              className="mt-2 text-xs font-bold text-center bg-gray-800 hover:bg-gray-700 text-white py-1.5 rounded transition-colors"
            >
              Ok, vou testar
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
