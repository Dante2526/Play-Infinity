import { Router } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as cheerio from "cheerio";
import { isServerBlacklisted } from "../../src/data/serverBlacklist";
import { validateSafeUrl, sanitizeString } from "../utils/helpers";
import { animeDirectStreamCache, vixsrcStreamCache, liveChunkCache } from "../utils/caches";
import { Readable } from "stream";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { db, getAsaasBaseUrl, getAsaasHeaders } from "../../server";

const router = Router();

// Criar Assinatura e retornar link de pagamento
  router.post("/api/create-subscription", async (req, res) => {
    try {
      const { userId, email, name, cpfCnpj, creditCard, creditCardHolderInfo, billingType = "UNDEFINED" } = req.body;
      if (!userId || !email) return res.status(400).json({ error: "Faltam parâmetros obrigatórios." });

      const baseUrl = getAsaasBaseUrl();
      const headers = getAsaasHeaders();

      // 1. Busca ou cria cliente no Asaas
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

      // 2. Cria Assinatura
      const nextDueDate = new Date();
      nextDueDate.setDate(nextDueDate.getDate() + 1); // Vence amanhã para evitar bloqueios de compensação no dia atual

      const subPayload: any = {
        customer: customerId,
        billingType, // "CREDIT_CARD" ou "UNDEFINED"
        value: 9.90,
        nextDueDate: nextDueDate.toISOString().split('T')[0],
        cycle: "MONTHLY",
        description: "Play Infinity Premium",
        externalReference: userId // MANDATÓRIO: Identifica o usuário no webhook!
      };

      if (billingType === "CREDIT_CARD") {
        if (!creditCard || !creditCardHolderInfo) {
          throw new Error("Dados do cartão e do titular são obrigatórios para pagamento via cartão de crédito.");
        }
        subPayload.creditCard = creditCard;
        subPayload.creditCardHolderInfo = creditCardHolderInfo;
        
        // No cartão, o pagamento inicial pode ser debitado na hora (hoje)
        // O Asaas recomenda não setar nextDueDate para amanhã no cartão se quiser cobrança instantânea,
        // mas setar para amanhã no billingType UNDEFINED (boleto/pix) evita bloqueio compensatório.
        // Vamos manter nextDueDate para cobrança imediata do cartão.
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

// Criar Assinatura e retornar link de pagamento
  // Webhook de recebimento de pagamentos
  router.post("/api/webhook/asaas", async (req, res) => {
    try {
      const { event, payment } = req.body;

      // O Asaas envia um 'externalReference' que nós injetamos na assinatura
      if (payment && payment.externalReference && db) {
        const userId = payment.externalReference;
        const userRef = doc(db, "usuarios", userId);
        
        // Se pagou (Pix/Boleto) ou o cartão foi confirmado
        if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
          const now = new Date();
          const nextMonth = new Date(now);
          nextMonth.setMonth(now.getMonth() + 1);
          
          await setDoc(userRef, { 
            assinatura: "ATIVA",
            subscriptionId: payment.subscription || "",
            dataPagamento: now.toISOString(),
            dataExpiracao: nextMonth.toISOString(),
            ultimoAcesso: now.toISOString()
          }, { merge: true });
          console.log(`[Webhook Asaas] Assinatura ATIVADA para o user: ${userId}`);
        } 
        // Se a assinatura atrasou ou o pagamento foi estornado/recusado
        else if (event === "PAYMENT_OVERDUE" || event === "PAYMENT_REFUNDED" || event === "PAYMENT_DELETED") {
          await setDoc(userRef, { 
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
