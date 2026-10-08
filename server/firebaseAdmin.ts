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
