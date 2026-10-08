import fs from "fs";
import path from "path";
import { createRequire } from "module";

const req = typeof require !== 'undefined' ? require : createRequire(import.meta.url);

const { initializeApp, cert, getApps } = req("firebase-admin/app");
const { getFirestore } = req("firebase-admin/firestore");
const { getMessaging } = req("firebase-admin/messaging");

let adminDb: any = null;

export function getAdminDb(): any {
  if (adminDb) return adminDb;

  try {
    const apps = getApps();
    let defaultApp = apps.find((a: any) => a.name === "[DEFAULT]") || null;

    if (!defaultApp) {
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
        defaultApp = initializeApp({
          credential: cert(serviceAccount)
        });
        console.log("[Firebase Admin] Inicializado com sucesso usando arquivo de credencial.");
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        defaultApp = initializeApp({
          credential: cert(serviceAccount)
        });
        console.log("[Firebase Admin] Inicializado usando variável de ambiente.");
      } else {
        const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "play-infinity-63eaa";
        defaultApp = initializeApp({ projectId });
        console.warn("[Firebase Admin] ATENÇÃO: sem credenciais de service account (arquivo secrets/firebase-service-account.json ou env FIREBASE_SERVICE_ACCOUNT). Leitura do Firestore e envio de Push (FCM) NÃO funcionarão até configurar as credenciais.");
        console.log("[Firebase Admin] Inicializado com projectId:", projectId);
      }
    }
    
    adminDb = getFirestore(defaultApp);
    return adminDb;
  } catch (error) {
    console.error("[Firebase Admin] Erro ao inicializar:", error);
    return null;
  }
}

let adminMessaging: any = null;

export function getAdminMessaging(): any {
  if (adminMessaging) return adminMessaging;
  const db = getAdminDb(); // guarantees initializeApp was called
  if (!db) return null;
  try {
    const apps = getApps();
    const defaultApp = apps.find((a: any) => a.name === "[DEFAULT]") || null;
    if (defaultApp) {
      adminMessaging = getMessaging(defaultApp);
      return adminMessaging;
    }
  } catch (error) {
    console.error("[Firebase Admin] Erro ao inicializar Messaging:", error);
  }
  return null;
}

let adminFieldValue: any = null;

/**
 * Expõe FieldValue do Admin SDK (ex: FieldValue.delete()) para
 * limpeza de campos legados nos documentos do Firestore.
 */
export function getAdminFieldValue(): any {
  if (adminFieldValue) return adminFieldValue;
  try {
    const { FieldValue } = req("firebase-admin/firestore");
    adminFieldValue = FieldValue;
    return adminFieldValue;
  } catch (error) {
    console.error("[Firebase Admin] Erro ao obter FieldValue:", error);
    return null;
  }
}
