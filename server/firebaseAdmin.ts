import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

let adminDb: Firestore | null = null;

export function getAdminDb(): Firestore | null {
  if (adminDb) return adminDb;

  try {
    if (getApps().length === 0) {
      const possiblePaths = [
        path.join(process.cwd(), "secrets", "firebase-service-account.json"),
        path.join(process.cwd(), "firebase-service-account.json")
      ];
      
      let serviceAccountPath: string | null = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          serviceAccountPath = p;
          break;
        }
      }

      if (serviceAccountPath) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
        initializeApp({
          credential: cert(serviceAccount)
        });
        console.log("[Firebase Admin] Inicializado com sucesso usando arquivo de credencial.");
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        initializeApp({
          credential: cert(serviceAccount)
        });
        console.log("[Firebase Admin] Inicializado usando variável de ambiente.");
      } else {
        console.warn("[Firebase Admin] Arquivo de credencial não encontrado. Não será possível usar funções de Admin.");
        return null;
      }
    }
    
    adminDb = getFirestore();
    return adminDb;
  } catch (error) {
    console.error("[Firebase Admin] Erro ao inicializar:", error);
    return null;
  }
}
