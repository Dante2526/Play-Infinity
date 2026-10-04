import { Router } from "express";
import { getAdminDb } from "../firebaseAdmin.js";
import { verifyFirebaseUserToken } from "../middlewares/requireAdminAuth.js";

export const userOpsRouter = Router();

userOpsRouter.post("/api/start-trial", async (req, res) => {
  const authHeader = req.header("authorization") || req.header("Authorization");
  let token = "";
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    return res.status(401).json({ success: false, error: "Token ausente" });
  }

  try {
    const decodedUser = await verifyFirebaseUserToken(token);
    if (!decodedUser) {
      return res.status(401).json({ success: false, error: "Token inválido ou expirado" });
    }

    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ success: false, error: "Banco de dados indisponível" });
    }

    const userRef = db.collection("usuarios").doc(decodedUser.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data() || {};

    // Verifica se já usou
    if (userData.trialUsado) {
      return res.status(400).json({ success: false, error: "Teste de 30 minutos já foi utilizado." });
    }

    // Calcula expiração: 30 minutos a partir de agora
    const untilIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await userRef.set({
      testeExpiracao: untilIso,
      trialUntil: untilIso,
      trialUsado: true,
    }, { merge: true });

    return res.json({ success: true, trialUntil: untilIso });
  } catch (err) {
    console.error("[startTrial] Erro:", err);
    return res.status(500).json({ success: false, error: "Erro interno ao ativar teste." });
  }
});
