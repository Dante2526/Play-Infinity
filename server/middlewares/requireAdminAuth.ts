import { Request, Response, NextFunction } from "express";
import { createRequire } from "module";
import { getAdminDb } from "../firebaseAdmin";

const req = typeof require !== "undefined" ? require : createRequire(import.meta.url);

// Inicializa Firebase Admin Auth para verificação de ID tokens
let adminAuth: any = null;

function getFirebaseAuth(): any {
  if (adminAuth) return adminAuth;
  try {
    const admin = req("firebase-admin");
    const { getAuth } = req("firebase-admin/auth");
    
    // Tenta obter app default ou criar app dedicado para Auth
    let app: any = null;
    try {
      app = admin.app("admin-auth");
    } catch {
      const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "play-infinity-63eaa";
      app = admin.initializeApp({ projectId }, "admin-auth");
    }
    
    adminAuth = getAuth(app);
    return adminAuth;
  } catch (err) {
    console.warn("[requireAdminAuth] Aviso: Falha ao inicializar Firebase Admin Auth:", err);
    return null;
  }
}

const DEFAULT_ADMIN_EMAILS = [
  "naylanmoreira350@gmail.com",
  "cbeth761@gmail.com"
];

export async function verifyFirebaseUserToken(token: string): Promise<{ uid: string; email?: string } | null> {
  if (!token) return null;

  // Tentativa A: Firebase Admin SDK verifyIdToken
  try {
    const authInstance = getFirebaseAuth();
    if (authInstance && token.split(".").length === 3) {
      const decoded = await authInstance.verifyIdToken(token);
      if (decoded && decoded.uid) {
        return {
          uid: decoded.uid,
          email: decoded.email
        };
      }
    }
  } catch (err: any) {
    // Se falhar (por expiração ou certificados), prossegue para as outras tentativas
  }

  // Tentativa B: Google Identity Toolkit REST API (validação oficial do Google)
  if (token.split(".").length === 3) {
    try {
      const apiKey = process.env.VITE_FIREBASE_API_KEY || "AIzaSyAvv3XgTuTfUHUH8pRdRJ8XiH98uCUcSAs";
      const lookupResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: token })
        }
      );
      if (lookupResp.ok) {
        const data = await lookupResp.json();
        if (data.users && data.users[0]) {
          const u = data.users[0];
          return {
            uid: u.localId,
            email: u.email
          };
        }
      }
    } catch (err) {
      console.warn("[verifyFirebaseUserToken] Erro ao validar token via REST:", err);
    }
  }

  return null;
}

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // 1. Extrair token dos headers
  const authHeader = req.header("authorization") || req.header("Authorization");
  const xAdminToken = req.header("x-admin-token") || req.header("X-Admin-Token");
  
  let token = "";
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (xAdminToken) {
    token = xAdminToken.trim();
  } else if (req.query.admin_token && typeof req.query.admin_token === "string") {
    token = req.query.admin_token.trim();
  }

  if (!token) {
    res.status(401).json({
      success: false,
      error: "Acesso não autorizado: Token de autenticação ausente."
    });
    return;
  }

  // 2. Verificar ID Token
  let decodedUser: { uid: string; email?: string; isFirestoreAdmin?: boolean } | null = await verifyFirebaseUserToken(token);

  // Tentativa C: Consulta direta de sessão/documento na coleção administradores do Firestore
  if (!decodedUser && token.length > 5 && !token.includes(".")) {
    try {
      const adminDb = getAdminDb();
      if (adminDb) {
        // Checa se o token é o próprio ID de documento do administrador
        const docSnap = await adminDb.collection("administradores").doc(token).get();
        if (docSnap.exists) {
          const data = docSnap.data();
          decodedUser = {
            uid: docSnap.id,
            email: data?.email,
            isFirestoreAdmin: true
          };
        }
      }
    } catch {
      // Ignora silenciosamente se o Firestore Admin SDK não tiver credenciais completas
    }
  }

  if (!decodedUser) {
    res.status(401).json({
      success: false,
      error: "Token de autenticação inválido ou expirado."
    });
    return;
  }

  // 3. Validar se o usuário possui privilégios de administrador
  const envAdmins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  const allowedEmails = new Set([
    ...DEFAULT_ADMIN_EMAILS.map(e => e.toLowerCase()),
    ...envAdmins
  ]);

  const userEmail = (decodedUser.email || "").toLowerCase().trim();
  let isAuthorized = allowedEmails.has(userEmail) || !!decodedUser.isFirestoreAdmin;

  // Se o email não estiver na lista padrão, checa se consta na coleção "administradores"
  if (!isAuthorized) {
    try {
      const adminDb = getAdminDb();
      if (adminDb) {
        const uidSnap = await adminDb.collection("administradores").doc(decodedUser.uid).get();
        if (uidSnap.exists) {
          isAuthorized = true;
        } else if (userEmail) {
          const emailSnap = await adminDb.collection("administradores")
            .where("email", "==", userEmail)
            .get();
          if (!emailSnap.empty) {
            isAuthorized = true;
          }
        }
      }
    } catch (err) {
      console.warn("[requireAdminAuth] Erro ao verificar coleção administradores:", err);
    }
  }

  if (!isAuthorized) {
    res.status(403).json({
      success: false,
      error: "Acesso negado: Requer privilégios de administrador."
    });
    return;
  }

  // Anexa usuário autenticado à requisição e segue
  (req as any).adminUser = decodedUser;
  next();
}
