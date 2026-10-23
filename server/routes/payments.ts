import { Router } from "express";
import { getAdminDb } from "../firebaseAdmin";
import { verifyFirebaseUserToken } from "../middlewares/requireAdminAuth";
import { timingSafeCompare } from "../utils/helpers";

const router = Router();

export const getAsaasHeaders = () => ({
  "access_token": process.env.ASAAS_API_KEY || "",
  "Content-Type": "application/json",
  "User-Agent": "PlayInfinity/1.0.0"
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

    // 3. O SERVIDOR define o valor do plano e externalReference (IGNORA req.body.value e req.body.externalReference)
    const requestedPlan = typeof req.body.plan === "string" ? req.body.plan.toLowerCase().trim() : "standard";
    if (!["standard", "plus"].includes(requestedPlan)) {
      return res.status(400).json({ success: false, error: "Plano inválido." });
    }
    const isPlusPlan = requestedPlan === "plus";
    let finalPrice = isPlusPlan ? 17.00 : 13.00;
    const externalReference = isPlusPlan ? `${userId}|PLUS` : userId;

    // A assinatura mensal sempre cobra o plano completo. Valores arbitrários e
    // datas de cadastro fornecidas pelo cliente não concedem descontos.
    let existingSubscriptionId = "";
    try {
      const db = getAdminDb();
      if (!db) return res.status(503).json({ success: false, error: "Banco de dados indisponível." });
      let userSnap = await db.collection("usuarios").doc(userId).get();
      if (!userSnap.exists) userSnap = await db.collection("users").doc(userId).get();
      const userData = userSnap.exists ? userSnap.data() : null;
      existingSubscriptionId = typeof userData?.subscriptionId === "string" ? userData.subscriptionId : "";
      const rawValue = userData?.valorMensalidade ?? userData?.valor ?? userData?.monthlyFee;
      // Tarifa legada explícita, protegida pelas regras do Firestore.
      if (!isPlusPlan && (rawValue === 9.90 || rawValue === "9,90" || rawValue === "9.90")) finalPrice = 9.90;
    } catch (error) {
      return res.status(503).json({ success: false, error: "Não foi possível consultar a assinatura atual." });
    }
    const description = `Play Infinity ${isPlusPlan ? "Plus" : "Premium"} (R$ ${finalPrice.toFixed(2).replace('.', ',')})`;

    // 2. Busca ou cria cliente no Asaas
    let customerId = "";
    const cusRes = await fetch(`${baseUrl}/customers?email=${encodeURIComponent(email)}`, { signal: AbortSignal.timeout(15000), headers });
    if (cusRes.status === 401) throw new Error("Chave da API do Asaas inválida ou expirada. Verifique o arquivo .env");
    const cusText = await cusRes.text();
    const cusData = cusText ? JSON.parse(cusText) : {};
    
    if (cusData.data && cusData.data.length > 0) {
      customerId = cusData.data[0].id;
    } else {
      const newCusRes = await fetch(`${baseUrl}/customers`, { signal: AbortSignal.timeout(15000),
        method: "POST",
        headers,
        body: JSON.stringify({ name: name || email, email, cpfCnpj })
      });
      const newCusData = await newCusRes.json();
      customerId = newCusData.id;
    }

    if (!customerId) throw new Error("Falha ao resolver o cliente no Asaas.");

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

    // Upgrade de uma assinatura existente atualiza a recorrência, sem criar
    // uma segunda cobrança mensal paralela à assinatura Premium.
    let subscriptionUrl = `${baseUrl}/subscriptions`;
    let subscriptionMethod = "POST";
    if (isPlusPlan && existingSubscriptionId) {
      const currentRes = await fetch(`${subscriptionUrl}/${encodeURIComponent(existingSubscriptionId)}`, {
        signal: AbortSignal.timeout(15000), headers
      });
      if (!currentRes.ok) throw new Error("Não foi possível verificar a assinatura atual.");
      const current = await currentRes.json();
      if (![userId, `${userId}|PLUS`].includes(current.externalReference)) {
        return res.status(400).json({ success: false, error: "Assinatura incompatível com o usuário." });
      }
      if (current.status === "ACTIVE" && !current.deleted) {
        subscriptionUrl += `/${encodeURIComponent(existingSubscriptionId)}`;
        subscriptionMethod = "PUT";
        delete subPayload.nextDueDate;
        delete subPayload.customer;
        subPayload.updatePendingPayments = true;
      }
    }
    const subRes = await fetch(subscriptionUrl, {
      signal: AbortSignal.timeout(15000), method: subscriptionMethod,
      headers, body: JSON.stringify(subPayload)
    });

    const subData = await subRes.json();
    if (!subRes.ok || subData.errors) {
      throw new Error(subData.errors?.[0]?.description || "Falha ao salvar assinatura no Asaas.");
    }

    // 3. Processamento adicional baseado no método
    let invoiceUrl;
    let pixQrCode;
    
    if (billingType !== "CREDIT_CARD") {
      const payRes = await fetch(`${baseUrl}/payments?subscription=${subData.id}`, { signal: AbortSignal.timeout(15000), headers });
      const payData = await payRes.json();
      
      const firstPayment = payData.data?.[0];
      if (!firstPayment) throw new Error("Cobrança inicial não foi gerada.");
      
      invoiceUrl = firstPayment.invoiceUrl;
      
      // Se for PIX explícito, busca a imagem do QR Code e o copia-e-cola
      if (billingType === "PIX") {
        const qrRes = await fetch(`${baseUrl}/payments/${firstPayment.id}/pixQrCode`, { signal: AbortSignal.timeout(15000), headers });
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

    if (typeof event !== "string" || !event || !payment || typeof payment !== "object") {
      return res.status(400).json({ success: false, error: "Payload do webhook incompleto ou inválido." });
    }

    // O Asaas envia um 'externalReference' que nós injetamos na assinatura
    if (!payment.externalReference) {
      return res.json({ received: true, ignored: "Sem externalReference" });
    }

    // O estado atual da API é obrigatório, inclusive para eventos autenticados:
    // um webhook legítimo pode chegar atrasado ou fora de ordem.
    if (!process.env.ASAAS_API_KEY) {
      return res.status(503).json({ success: false, error: "Verificação de pagamento indisponível." });
    }
    if (typeof payment.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(payment.id)) {
      return res.status(400).json({ success: false, error: "ID de pagamento inválido." });
    }
    const handledStatuses: Record<string, string[]> = {
      PAYMENT_RECEIVED: ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"],
      PAYMENT_CONFIRMED: ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"],
      PAYMENT_OVERDUE: ["OVERDUE"],
      PAYMENT_REFUNDED: ["REFUNDED"],
      PAYMENT_DELETED: ["DELETED"],
    };
    if (!Object.prototype.hasOwnProperty.call(handledStatuses, event)) {
      return res.json({ received: true, ignored: "Evento não processado" });
    }
    let realPayment: any;
    try {
      const response = await fetch(`${getAsaasBaseUrl()}/payments/${encodeURIComponent(payment.id)}`, {
        signal: AbortSignal.timeout(15000), headers: getAsaasHeaders()
      });
      if (!response.ok) {
        return res.status(503).json({ success: false, error: "Não foi possível verificar a cobrança." });
      }
      realPayment = await response.json();
    } catch (error) {
      return res.status(503).json({ success: false, error: "Falha na verificação de pagamento." });
    }
    if (realPayment.id !== payment.id || realPayment.externalReference !== payment.externalReference) {
      return res.status(400).json({ success: false, error: "Cobrança incompatível com o webhook." });
    }
    const currentStatus = realPayment.deleted ? "DELETED" : realPayment.status;
    if (!handledStatuses[event].includes(currentStatus)) {
      return res.json({ received: true, ignored: "Evento desatualizado" });
    }
    const reference = /^([a-zA-Z0-9_-]+)(\|PLUS)?$/.exec(realPayment.externalReference);
    if (!reference) {
      return res.status(400).json({ success: false, error: "Referência de usuário inválida." });
    }
    const db = getAdminDb();
    if (!db) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponível." });
    }
    const userRef = db.collection("usuarios").doc(reference[1]);
    const paymentRef = userRef.collection("asaasPayments").doc(payment.id);
    const isPaid = event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED";
    const paidDate = new Date(realPayment.paymentDate || realPayment.confirmedDate || realPayment.clientPaymentDate || realPayment.dueDate);
    if (isPaid && !Number.isFinite(paidDate.getTime())) {
      return res.status(400).json({ success: false, error: "Data de pagamento inválida." });
    }
    // Transação garante aplicação única mesmo com entregas simultâneas ou após restart.
    await db.runTransaction(async (transaction: any) => {
      const [userSnap, processedSnap] = await Promise.all([
        transaction.get(userRef), transaction.get(paymentRef)
      ]);
      const user = userSnap.data() || {};
      const processed = processedSnap.data() || {};
      if (isPaid) {
        // CONFIRMED e RECEIVED da mesma cobrança concedem um único período.
        if (processed.paidApplied || processed.revoked) return;
        const previousDate = new Date(user.asaasPaymentDate || 0).getTime();
        if (paidDate.getTime() >= previousDate) {
          // Um mês calendário, limitado ao último dia do mês (31/jan -> 28/fev).
          const expires = new Date(paidDate);
          const day = expires.getUTCDate();
          expires.setUTCDate(1);
          expires.setUTCMonth(expires.getUTCMonth() + 1);
          const lastDay = new Date(Date.UTC(expires.getUTCFullYear(), expires.getUTCMonth() + 1, 0)).getUTCDate();
          expires.setUTCDate(Math.min(day, lastDay));
          const existingExpiry = new Date(user.dataExpiracao || 0).getTime();
          const isPlus = !!reference[2];
          transaction.set(userRef, {
            assinatura: "ATIVA",
            subscriptionId: realPayment.subscription || "",
            asaasPaymentId: payment.id,
            asaasPaymentDate: paidDate.toISOString(),
            dataPagamento: paidDate.toISOString(),
            dataExpiracao: new Date(Math.max(expires.getTime(), Number.isFinite(existingExpiry) ? existingExpiry : 0)).toISOString(),
            plano: isPlus ? "plus" : "standard",
            ...(isPlus ? { valorMensalidade: 17.00, valor: "17,00" } : {}),
            ultimoAcesso: new Date().toISOString()
          }, { merge: true });
        }
        transaction.set(paymentRef, { paidApplied: true, status: currentStatus }, { merge: true });
      } else {
        // Uma cobrança antiga/outra assinatura não pode revogar o pagamento atual.
        const sameSubscription = !!realPayment.subscription && realPayment.subscription === user.subscriptionId;
        const expired = new Date(user.dataExpiracao || 0).getTime() <= Date.now();
        const shouldRevoke = event === "PAYMENT_OVERDUE"
          ? sameSubscription && expired
          : user.asaasPaymentId === payment.id;
        if (shouldRevoke) {
          transaction.set(userRef, { assinatura: "INATIVA", updatedAt: new Date().toISOString() }, { merge: true });
        }
        // Impede que a confirmação atrasada de uma cobrança estornada a reative.
        if (event !== "PAYMENT_OVERDUE") {
          transaction.set(paymentRef, { revoked: true, status: currentStatus }, { merge: true });
        }
      }
    });

    res.json({ received: true });
  } catch (err: any) {
    console.error("[Webhook Asaas] Erro:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
