import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../services/firebase";

export function useSubscription() {
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Escuta a autenticação para atrelar o snapshot ao usuário logado
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        // Cria um listener em tempo real no documento do usuário
        const userRef = doc(db, "users", user.uid);
        const unsubscribeSnap = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            // Se subscription for 'ACTIVE' ou assinatura for 'ATIVA', é premium
            setIsPremium(data.subscription === "ACTIVE" || data.assinatura === "ATIVA");
          } else {
            setIsPremium(false);
          }
          setLoading(false);
        }, (err) => {
          console.error("Erro ao escutar assinatura do usuário:", err);
          setLoading(false);
        });

        return () => unsubscribeSnap();
      } else {
        setIsPremium(false);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  return { isPremium, loading };
}
