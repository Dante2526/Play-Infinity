import { Router } from "express";
import { getAdminDb } from "../firebaseAdmin";
import { verifyFirebaseUserToken } from "../middlewares/requireAdminAuth";
import { timingSafeCompare } from "../utils/helpers";

const router = Router();

export const getAsaasHeaders = () => ({
  "access_token": process.env.ASAAS_API_KEY || "",
  "Content-Type": "application/json"
});

export const getAsaasBaseUrl = () => process.env.ASAAS_ENVIRONMENT === "sandbox" ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3";

// Criar Assinatura e retornar link de pagamento (Seguro: Preço e userId definidos exclusivamente pelo servidor)
router.post("/api/create-subscription", async (req, res) => {
  try {
    // 1. Autenticação mandatória: extrai e valida o token do usuário
    const authHeader = req.header("authorization") || req.header("Authorization");
    let token = "";
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (req.body.idToken && typeof req.body.idToken === "string") {
      token = req.body.idToken.trim();
    }

    let userId = "";
    let userEmail = "";

    if (token) {
      const verifiedUser = await verifyFirebaseUserToken(token);
      if (verifiedUser && verifiedUser.uid) {
        userId = verifiedUser.uid;
        if (verifiedUser.email) {
          userEmail = verifiedUser.email.trim();
        }
      }
    }

    // Se não autenticou via token válido, bloqueia imediatamente
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Acesso não autorizado: Você precisa estar logado com sua conta para assinar."
      });
    }

    // E-mail: prioriza e-mail verificado do token ou fornecido no body com fallback
    const email = userEmail || (req.body.email || "").trim();
    const { name, cpfCnpj, creditCard, creditCardHolderInfo, billingType = "UNDEFINED" } = req.body;
    if (!email) return res.status(400).json({ error: "E-mail obrigatório para emissão da cobrança." });

    const baseUrl = getAsaasBaseUrl();
    const headers = getAsaasHeaders();

    // 2. Busca ou cria cliente no Asaas
    let customerId = "";
    const cusRes = await fetch(`${baseUrl}/customers?email=${encodeURIComponent(email)}`, { headers });
    if (cusRes.status === 401) throw new Error("Chave da API do Asaas inválida ou expirada. Verifique o arquivo .env");
    const cusText = await cusRes.text();
    const cusData = cusText ? JSON.parse(cusText) : {};
    
    if (cusData.data && cusData.data.length > 0) {
      customerId = cusData.data[0].id;
    } else {
      const newCusRes = await fetch(`${baseUrl}/customers`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: name || email, email, cpfCnpj })
      });
      const newCusData = await newCusRes.json();
      customerId = newCusData.id;
    }

    if (!customerId) throw new Error("Falha ao resolver o cliente no Asaas.");

    // 3. O SERVIDOR define o valor do plano e externalReference (IGNORA req.body.value e req.body.externalReference)
    const requestedPlan = (req.body.plan || "standard").toLowerCase().trim();
    const isPlusPlan = requestedPlan === "plus" || (req.body.description && String(req.body.description).toLowerCase().includes("plus"));

    let finalPrice = 13.00;
    let externalReference = userId;
    let description = "Play Infinity Premium";

    try {
      const db = getAdminDb();
      if (db && userId) {
        let userSnap = await db.collection("usuarios").doc(userId).get();
        if (!userSnap.exists) {
          userSnap = await db.collection("users").doc(userId).get();
        }

        const uData = userSnap.exists ? userSnap.data() : null;

        if (isPlusPlan) {
          const plusFee = 17.00;
          let currentFee = 0;

          if (uData && uData.assinatura === "ATIVA") {
            const rawVal = uData.valorMensalidade ?? uData.valor ?? uData.monthlyFee;
            if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
              currentFee = typeof rawVal === "number" ? rawVal : (String(rawVal).includes("13") ? 13.00 : 9.90);
            } else {
              currentFee = 9.90;
            }
          }

          const diff = Math.max(0, plusFee - currentFee);
          if (currentFee > 0 && diff > 0 && diff < plusFee) {
            finalPrice = diff;
          } else {
            finalPrice = plusFee;
          }

          externalReference = `${userId}|PLUS`;
          description = `Play Infinity Plus (R$ ${finalPrice.toFixed(2).replace('.', ',')})`;
        } else {
          if (uData) {
            const rawVal = uData.valorMensalidade ?? uData.valor ?? uData.monthlyFee;
            if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
              finalPrice = (rawVal === 13 || String(rawVal).includes("13")) ? 13.00 : 9.90;
            } else {
              const createdDate = uData.criadoEm || uData.createdAt;
              if (createdDate && new Date(createdDate) < new Date("2026-09-19T00:00:00-03:00")) {
                finalPrice = 9.90;
              } else {
                finalPrice = 13.00;
              }
            }
          } else {
            finalPrice = 13.00;
          }

          externalReference = userId;
          description = `Play Infinity Premium (R$ ${finalPrice.toFixed(2).replace('.', ',')})`;
        }
      } else {
        finalPrice = isPlusPlan ? 17.00 : 13.00;
        externalReference = isPlusPlan ? `${userId}|PLUS` : userId;
        description = isPlusPlan ? `Play Infinity Plus (R$ 17,00)` : `Play Infinity Premium (R$ 13,00)`;
      }
    } catch (dbErr) {
      console.warn("[Asaas] Erro ao consultar regras de preço no Firestore, aplicando preço oficial padrão:", dbErr);
      finalPrice = isPlusPlan ? 17.00 : 13.00;
      externalReference = isPlusPlan ? `${userId}|PLUS` : userId;
      description = isPlusPlan ? `Play Infinity Plus (R$ 17,00)` : `Play Infinity Premium (R$ 13,00)`;
    }

    // 4. Cria Assinatura no Asaas com os dados blindados
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1); // Vence amanhã para evitar bloqueios de compensação no dia atual

    const subPayload: any = {
      customer: customerId,
      billingType, // "CREDIT_CARD" ou "UNDEFINED"
      value: finalPrice,
      nextDueDate: nextDueDate.toISOString().split('T')[0],
      cycle: "MONTHLY",
      description,
      externalReference // MANDATÓRIO: Definido pelo servidor a partir do UID autenticado!
    };

    if (billingType === "CREDIT_CARD") {
      if (!creditCard || !creditCardHolderInfo) {
        throw new Error("Dados do cartão e do titular são obrigatórios para pagamento via cartão de crédito.");
      }
      subPayload.creditCard = creditCard;
      subPayload.creditCardHolderInfo = creditCardHolderInfo;
      
      // No cartão, o pagamento inicial pode ser debitado na hora (hoje)
      delete subPayload.nextDueDate;
    }

    const subRes = await fetch(`${baseUrl}/subscriptions`, {
      method: "POST",
      headers,
      body: JSON.stringify(subPayload)
    });
    
    const subData = await subRes.json();
    if (subData.errors) {
      throw new Error(subData.errors[0].description);
    }

    // 3. Processamento adicional baseado no método
    let invoiceUrl;
    let pixQrCode;
    
    if (billingType !== "CREDIT_CARD") {
      const payRes = await fetch(`${baseUrl}/payments?subscription=${subData.id}`, { headers });
      const payData = await payRes.json();
      
      const firstPayment = payData.data?.[0];
      if (!firstPayment) throw new Error("Cobrança inicial não foi gerada.");
      
      invoiceUrl = firstPayment.invoiceUrl;
      
      // Se for PIX explícito, busca a imagem do QR Code e o copia-e-cola
      if (billingType === "PIX") {
        const qrRes = await fetch(`${baseUrl}/payments/${firstPayment.id}/pixQrCode`, { headers });
        const qrData = await qrRes.json();
        if (qrData.success !== false) {
          pixQrCode = qrData;
        }
      }
    }
    
    res.json({ success: true, invoiceUrl, subscriptionId: subData.id, pixQrCode });
  } catch (err: any) {
    console.error("[Asaas] Erro ao criar assinatura:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Webhook de recebimento de pagamentos com validação estrita (Token + Consulta à API do Asaas)
router.post("/api/webhook/asaas", async (req, res) => {
  try {
    const configuredToken = process.env.ASAAS_WEBHOOK_TOKEN;
    const receivedToken = (req.header("asaas-access-token") || "").trim();

    // 1. Validação do Token de Acesso do Webhook com comparação em tempo constante
    if (configuredToken) {
      if (!receivedToken || !timingSafeCompare(receivedToken, configuredToken.trim())) {
        console.warn("[Webhook Asaas] Rejeitado: asaas-access-token ausente ou inválido.");
        return res.status(401).json({ success: false, error: "Acesso não autorizado: Token de webhook inválido." });
      }
    } else {
      console.warn("[Webhook Asaas] ALERTA DE SEGURANÇA: ASAAS_WEBHOOK_TOKEN não configurado no .env! Exigindo verificação estrita via API do Asaas.");
    }

    const { event, payment } = req.body || {};

    if (!event || !payment || typeof payment !== "object") {
      return res.status(400).json({ success: false, error: "Payload do webhook incompleto ou inválido." });
    }

    // O Asaas envia um 'externalReference' que nós injetamos na assinatura
    if (!payment.externalReference) {
      return res.json({ received: true, ignored: "Sem externalReference" });
    }

    // 2. Consulta de Verificação na API Oficial do Asaas (Zero-Trust)
    const paymentId = payment.id;
    const asaasApiKey = process.env.ASAAS_API_KEY;

    if (asaasApiKey && paymentId) {
      try {
        const baseUrl = getAsaasBaseUrl();
        const verifyRes = await fetch(`${baseUrl}/payments/${paymentId}`, {
          headers: getAsaasHeaders()
        });

        if (!verifyRes.ok) {
          console.warn(`[Webhook Asaas] Cobrança ${paymentId} não encontrada na API do Asaas (HTTP ${verifyRes.status}). Rejeitando webhook.`);
          return res.status(400).json({ success: false, error: "Cobrança não localizada ou inválida na API do Asaas." });
        }

        const realPayment = await verifyRes.json();

        // Valida se a referência externa bate com a cobrança oficial
        if (realPayment.externalReference !== payment.externalReference) {
          console.warn(`[Webhook Asaas] Inconsistência de externalReference: webhook=${payment.externalReference}, API=${realPayment.externalReference}`);
          return res.status(400).json({ success: false, error: "Inconsistência cadastral na cobrança." });
        }

        // Se o evento é de pagamento confirmado, confere se o status na API realmente é de recebido/confirmado
        if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
          const validReceivedStatuses = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"];
          if (!validReceivedStatuses.includes(realPayment.status)) {
            console.warn(`[Webhook Asaas] Evento ${event} incompatível com o status real ${realPayment.status} no Asaas.`);
            return res.status(400).json({ success: false, error: "Status da cobrança não confirmado pela API." });
          }
        }
      } catch (apiErr: any) {
        console.error("[Webhook Asaas] Falha ao consultar API do Asaas:", apiErr);
        if (!configuredToken) {
          return res.status(500).json({ success: false, error: "Falha na verificação de autenticidade do pagamento." });
        }
      }
    } else if (!configuredToken) {
      // Se nem ASAAS_WEBHOOK_TOKEN nem ASAAS_API_KEY estão presentes, não há como garantir autenticidade
      return res.status(401).json({ success: false, error: "Webhook rejeitado: ausência de credenciais de validação." });
    }

    // 3. Atualização Segura no Banco de Dados
    const db = getAdminDb();
    if (db) {
      let userId = String(payment.externalReference).trim();
      let isPlusUpgrade = false;

      if (userId.includes("|PLUS")) {
        userId = userId.split("|")[0];
        isPlusUpgrade = true;
      }

      // Sanitização básica do UID do usuário
      userId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!userId) {
        return res.status(400).json({ success: false, error: "ID de usuário inválido." });
      }

      const userRef = db.collection("usuarios").doc(userId);

      // Se pagou (Pix/Boleto) ou o cartão foi confirmado
      if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
        const now = new Date();
        const nextMonth = new Date(now);
        nextMonth.setMonth(now.getMonth() + 1);

        const updateData: any = {
          assinatura: "ATIVA",
          subscriptionId: payment.subscription || "",
          dataPagamento: now.toISOString(),
          dataExpiracao: nextMonth.toISOString(),
          ultimoAcesso: now.toISOString()
        };

        if (isPlusUpgrade) {
          updateData.plano = "plus";
          updateData.valorMensalidade = 20.00;
        }

        await userRef.set(updateData, { merge: true });
        console.log(`[Webhook Asaas] Assinatura ATIVADA para o user: ${userId} (Plus: ${isPlusUpgrade})`);
      }
      // Se a assinatura atrasou ou o pagamento foi estornado/recusado
      else if (event === "PAYMENT_OVERDUE" || event === "PAYMENT_REFUNDED" || event === "PAYMENT_DELETED") {
        await userRef.set({
          assinatura: "INATIVA",
          updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log(`[Webhook Asaas] Assinatura INATIVADA para o user: ${userId}`);
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error("[Webhook Asaas] Erro:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
