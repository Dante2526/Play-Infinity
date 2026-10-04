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

export async function verifyFirebaseUserToken(token: string): Promise<{ uid: string; email?: string; emailVerified?: boolean; isAdmin?: boolean } | null> {
  if (!token) return null;

  // Tentativa A: Firebase Admin SDK verifyIdToken
  try {
    const authInstance = getFirebaseAuth();
    if (authInstance && token.split(".").length === 3) {
      const decoded = await authInstance.verifyIdToken(token);
      if (decoded && decoded.uid) {
        return {
          uid: decoded.uid,
          email: decoded.email,
          emailVerified: decoded.email_verified,
          isAdmin: decoded.admin === true
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
      const lookupResp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, { signal: AbortSignal.timeout(15000),
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: token })
        }
      );
      if (lookupResp.ok) {
        const data = await lookupResp.json();
        if (data.users && data.users[0]) {
          const u = data.users[0];
          const customClaims = u.customAttributes ? JSON.parse(u.customAttributes) : {};
          return {
            uid: u.localId,
            email: u.email,
            emailVerified: u.emailVerified,
            isAdmin: customClaims.admin === true
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
  }

  if (!token) {
    res.status(401).json({
      success: false,
      error: "Acesso não autorizado: Token de autenticação ausente."
    });
    return;
  }

  // 2. Verificar ID Token
  let decodedUser = await verifyFirebaseUserToken(token);

  if (!decodedUser) {
    res.status(401).json({
      success: false,
      error: "Token de autenticação inválido ou expirado."
    });
    return;
  }

  const masterAdmins = ["naylanmoreira350@gmail.com", "cbeth761@gmail.com"];
  const isMasterAdmin = decodedUser.email && masterAdmins.includes(decodedUser.email.toLowerCase());

  // 3. Validar se o usuário possui email verificado e a claim de administrador
  if (!isMasterAdmin && (!decodedUser.emailVerified || !decodedUser.isAdmin)) {
    res.status(403).json({
      success: false,
      error: "Acesso negado: Requer e-mail verificado e privilégios de administrador."
    });
    return;
  }

  // Anexa usuário autenticado à requisição e segue
  (req as any).adminUser = decodedUser;
  next();
}
