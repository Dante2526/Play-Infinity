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
        // Cria um listener em tempo real no documento do usuário na coleção 'usuarios'
        const userRef = doc(db, "usuarios", user.uid);
        const unsubscribeSnap = onSnapshot(userRef, async (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const isExplicitlyActive = (data.subscription === "ACTIVE" || data.assinatura === "ATIVA");
            const expDateStr = data.dataExpiracao || data.expirationDate;
            let isExpired = false;

            if (expDateStr) {
              const expDate = new Date(expDateStr);
              if (!isNaN(expDate.getTime()) && expDate.getFullYear() < 2099) {
                isExpired = expDate.getTime() <= Date.now();
              }
            }

            const active = isExplicitlyActive && !isExpired;
            setIsPremium(active);

            // Se o documento estava como ATIVA mas já expirou, atualiza no Firestore
            if (isExplicitlyActive && isExpired) {
              try {
                const { updateDoc } = await import("firebase/firestore");
                await updateDoc(userRef, {
                  assinatura: "EXPIRADA",
                  subscription: "INACTIVE"
                });
              } catch (e) {}
            }

            setLoading(false);
          } else {
            try {
              const { getDoc } = await import("firebase/firestore");
              const legacySnap = await getDoc(doc(db, "users", user.uid));
              if (legacySnap.exists()) {
                const data = legacySnap.data();
                const isExplicitlyActive = (data.subscription === "ACTIVE" || data.assinatura === "ATIVA");
                const expDateStr = data.dataExpiracao || data.expirationDate;
                let isExpired = false;

                if (expDateStr) {
                  const expDate = new Date(expDateStr);
                  if (!isNaN(expDate.getTime()) && expDate.getFullYear() < 2099) {
                    isExpired = expDate.getTime() <= Date.now();
                  }
                }

                const active = isExplicitlyActive && !isExpired;
                setIsPremium(active);
                setLoading(false);
                return;
              }
            } catch (e) {}
            setIsPremium(false);
            setLoading(false);
          }
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
