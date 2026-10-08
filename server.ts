import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import v8 from "v8";
import { Readable } from "stream";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import crypto from "crypto";
import { isServerBlacklisted } from "./src/data/serverBlacklist";
import { WatchedItem, mostWatchedMemoryCache, scheduleAsyncSaveMostWatched, INITIAL_MOST_WATCHED } from "./server/services/mostWatched";
import { animeDirectStreamCache, vixsrcStreamCache, liveChunkCache, liveVariantRefreshCache, seasonAvailabilityCache } from "./server/utils/caches";
import { sanitizeString, checkTrackPlayRateLimit, isSuperflixDetected, isPrivateOrLocalIp, isPrivateOrLocalHost, validateSafeUrl, validateSafeUrlAsync, ALLOWED_STREAMING_DOMAINS, isAllowedLiveStreamingDomain, timingSafeCompare, signProxyUrl, verifyProxySignature } from "./server/utils/helpers";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { verifyFirebaseUserToken } from "./server/middlewares/requireAdminAuth";
import { checkVidsrcSeason } from "./server/routes/vidsrcRoutes";
import { checkVipSeason, checkVizerSeason } from "./server/routes/encontreiLookup";
import { startCatalogWatcher } from "./server/services/catalogWatcher";
if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
}
dotenv.config();

// In-memory store for episodes received via webhook/endpoint
// Interface e armazenamento dos Mais Assistidos pelos usuários

/**
 * Utilitário de sanitização para strings de entrada da API
 */


import { subtitlesRouter } from "./server/routes/subtitlesRoutes";
import paymentsRouter from "./server/routes/payments";
import videoScrapersRouter from "./server/routes/videoScrapers";

import catalogRouter from "./server/routes/catalog";
import diagnosticsRouter from "./server/routes/diagnostics";
import mixdropRouter from "./server/routes/mixdrop";
import castRouter from "./server/routes/cast";

export const app = express();
app.use(subtitlesRouter);
const PORT = 3000;

// Configuração Firebase (Backend JS SDK bypass para Firestore)
export let db: any = null;
try {
  const fbConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyAvv3XgTuTfUHUH8pRdRJ8XiH98uCUcSAs",
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "play-infinity-63eaa.firebaseapp.com",
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || "play-infinity-63eaa",
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "play-infinity-63eaa.firebasestorage.app",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "341774996820",
    appId: process.env.VITE_FIREBASE_APP_ID || "1:341774996820:web:871c91206a157cce6ce4c1",
  };
  const fbApp = initializeApp(fbConfig);
  db = getFirestore(fbApp);
  console.log("[Firebase] Backend conectado ao Firestore.");
} catch (e) {
  console.warn("[Firebase] Aviso: Falha ao inicializar no backend.", e);
}

process.on("unhandledRejection", (reason) => {
  console.log("[Process Warning] Background promise rejection:", reason?.toString().substring(0, 50));
});

process.on("uncaughtException", (err) => {
  console.log("[Process Guard] Suppressed background assertion:", err?.message);
});

  // Immediate healthcheck endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Configuração necessária para ambientes atrás de proxy/Load Balancer (como Cloud Run)
  // Isso diz ao Express para confiar no cabeçalho X-Forwarded-For fornecido pelo proxy
  // para identificar o IP real do usuário. Fixes express-rate-limit warnings.
  app.set('trust proxy', 1);

  // Redirecionamento canônico automático: caso o usuário acesse pelo subdomínio onrender.com
  app.use((req, res, next) => {
    const host = req.headers.host || '';
    if (host.includes('onrender.com')) {
      const canonicalHost = 'play-infinity.stream';
      return res.redirect(301, `https://${canonicalHost}${req.originalUrl || '/'}`);
    }
    next();
  });

  // Hardening de Segurança via HTTP Headers
  // Frameguard 'sameorigin' previne clickjacking na UI, mas não afeta os iframes (players) injetados
  // CSP permissiva libera players e imagens, mas barra XSS externo
  const isProd = process.env.NODE_ENV === 'production';

  // Cabeçalhos comuns às duas políticas
  const commonHelmet = {
    frameguard: { action: 'sameorigin' as const },
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    crossOriginResourcePolicy: { policy: "cross-origin" as const },
    crossOriginEmbedderPolicy: false as const,
    crossOriginOpenerPolicy: false as const
  };

  // 1) CSP restritiva: apenas para o app (HTML/JS próprios) fora de /api
  const appHelmet = helmet({
    ...commonHelmet,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.googletagmanager.com", "https://challenges.cloudflare.com", "https://turnstile.cloudflare.com", "https://apis.google.com", "https://www.gstatic.com", "https://*.firebaseapp.com", "https://cdn.jsdelivr.net"],
        workerSrc: ["'self'", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: ["'self'", "ws:", "wss:", "https:", "http:"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        frameSrc: ["'self'", "https:", "http:"],
        mediaSrc: ["'self'", "blob:", "https:", "http:"],
        objectSrc: ["'none'"],
        ...(isProd ? { upgradeInsecureRequests: [] } : {})
      }
    }
  });

  // 2) Páginas de player em /api/* (watchplayer-stream, myembed-stream, vidsrc, mixdrop...)
  //    carregam <base>, CSS e scripts de terceiros: uma CSP restritiva as quebra por completo.
  const playerHelmet = helmet({ ...commonHelmet, contentSecurityPolicy: false });

  app.use((req, res, next) =>
    req.path.startsWith("/api/") ? playerHelmet(req, res, next) : appHelmet(req, res, next)
  );

  // Upload Route (Deve vir antes do limitador de 10kb)
  app.use('/api/upload-bug-image', express.json({ limit: '10mb' }));

  // Rate limit anti-spam: 5 uploads de print por hora por IP
  const bugUploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitos envios de imagem em pouco tempo. Tente novamente mais tarde.' }
  });

  app.post('/api/upload-bug-image', bugUploadLimiter, (req, res) => {
    try {
      const { imageBase64, filename } = req.body;
      if (!imageBase64 || !filename) {
        return res.status(400).json({ error: 'Dados da imagem incompletos.' });
      }

      // Valida: precisa ser data URL de imagem (PNG/JPG/GIF/WEBP) —
      // impede salvar conteúdo arbitrário (executáveis, scripts etc.)
      if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(imageBase64)) {
        return res.status(400).json({ error: 'Formato inválido. Apenas imagens PNG, JPG, GIF ou WEBP.' });
      }

      // Criar a pasta se não existir
      const uploadDir = path.join(process.cwd(), 'uploads', 'bug_reports');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Converter o base64
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');

      // Valida tamanho real pós-decode: máximo 5MB (mesmo limite prometido na UI)
      if (buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'A imagem excede o limite de 5MB.' });
      }

      const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = path.join(uploadDir, safeFilename);

      fs.writeFileSync(filePath, buffer);

      res.json({ success: true, url: `/uploads/bug_reports/${safeFilename}` });
    } catch (err: any) {
      console.error('[Upload API] Erro:', err);
      res.status(500).json({ error: 'Erro ao processar imagem no servidor.' });
    }
  });

  // Limite rigoroso de payload para as outras rotas para mitigar ataques de exaustão de memória
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Pasta estática para uploads
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // ========================================================
  // PROTEÇÃO CONTRA DDOS (Camada de Aplicação)
  // ========================================================
  
  // Limite Global: Protege a renderização estática e recursos sem travar o usuário
  const globalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 600, // Reduzido de 3000 para 600 (protege melhor a RAM sem quebrar assets)
    message: "Muitas requisições deste IP, tente novamente em um minuto.",
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Limite para API geral (busca, metadados)
  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 150, // Reduzido de 1200 para 150
    message: { success: false, error: "Limite de requisições excedido. A proteção anti-DDoS bloqueou este endereço temporariamente." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Limite restrito para rotas de scraping (evita abuso e drenagem do proxy/backend)
  const scraperLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 30, // Apenas 30 requisições por minuto para endpoints de scraping
    message: { success: false, error: "Limite de scraping excedido. Aguarde um instante." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Limite dedicado por IP para streaming de TV ao vivo (/api/live-stream-proxy)
  // Permite até 360 requisições por minuto por IP (suficiente para zapping rápido e múltiplos chunks HLS,
  // mas impede drenagem massiva de banda e uso abusivo por terceiros).
  const liveStreamLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 360,
    message: "Limite de taxa para streaming ao vivo excedido. Aguarde um instante.",
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Aplica limitação global a todo o servidor
  app.use(globalLimiter);
  
  // Serve arquivos estáticos do frontend (precisa vir ANTES dos proxies para evitar interceptação do /assets)
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath, {
        maxAge: "30d",
        setHeaders: (res, filePath) => {
          // Arquivos HTML e manifestos nunca devem ser cacheados permanentemente para refletir atualizações na hora.
          // NOVO: usar no-store em vez de max-age=0 pra evitar browsers mobile
          // que reusam index.html antigo e quebram com assets novos (hash mudou).
          if (filePath.endsWith(".html") || filePath.endsWith("metadata.json")) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
          } else if (filePath.includes("/assets/")) {
            // Assets do Vite com hash de versão (ex: index-CCLh_Jfm.js) têm cache longo e imutável
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        }
      }));
    }
  }

  // Prefixos de scraping que fazem requisições pesadas e devem ter limite restrito
  const scrapingPrefixes = [
    "/watchplayer-stream",
    "/myembed-stream",
    "/mixdrop-stream",
    
    
    "/bolodechocolate",
    "/stream-proxy",
    
    "/vidsrc",
    "/nixplay"
  ];

  app.use("/api", (req, res, next) => {
    // Rotas de proxy de vídeo/hls precisam de limite mais alto para suportar buffer rápido
    if (req.path.startsWith("/live-stream-proxy") || req.path.startsWith("/anime/hls-proxy")) {
      return liveStreamLimiter(req, res, next);
    }
    
    // Aplica o limite baixo (30 req/min) nas rotas de scraping pesadas
    if (scrapingPrefixes.some(prefix => req.path.startsWith(prefix))) {
      return scraperLimiter(req, res, next);
    }

    // Restante da API (catalog, admin, health, metadados) cai no limite normal da API (150 req/min)
    return apiLimiter(req, res, next);
  });

  // Rota explícita para a página de privacidade (SPA Fallback imediato)
  app.get(["/privacy", "/privacidade"], (req, res, next) => {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      res.sendFile(path.join(distPath, "index.html"));
    } else {
      next(); // Passa para o Vite em dev mode
    }
  });

  // ========================================================

  // API 1: Extract player from external page URL (e.g. encontrei.info, etc.)
  import iptvRouter from "./server/routes/iptv";
import encontreiLookupRouter from "./server/routes/encontreiLookup";
import bolodechocolateRouter from "./server/routes/bolodechocolate";
import nixplayRouter from "./server/routes/nixplayRoutes";
import vidsrcRouter from "./server/routes/vidsrcRoutes";
import serverBlocksRouter from "./server/routes/serverBlocks";

import { adminOpsRouter } from "./server/routes/adminOps";
import { requireAdminAuth } from './server/middlewares/requireAdminAuth';
import { userOpsRouter } from './server/routes/userOps.js';

  app.use(iptvRouter);
app.use(encontreiLookupRouter);
app.use(bolodechocolateRouter);
app.use(nixplayRouter);
app.use(vidsrcRouter);

// Middleware de Proteção Estrita: exige autenticação Firebase e privilégios de Admin para qualquer rota /api/admin/*
app.use("/api/admin", requireAdminAuth);
app.use(serverBlocksRouter);
app.use("/api/admin", adminOpsRouter);
app.use(userOpsRouter);

// Routers extraídos do server.ts: montados APÓS helmet, express.json e rate limiters
app.use(paymentsRouter);
app.use(videoScrapersRouter);
app.use(catalogRouter);
app.use(diagnosticsRouter);
app.use(mixdropRouter);
app.use(castRouter);

  // Em produção, isso pode ser útil, mas no ambiente DEV rouba os assets do Vite!
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    app.get("/assets/:file", async (req, res, next) => {
      const file = req.params.file;
      if (file && (file.endsWith(".js") || file.endsWith(".css") || file.endsWith(".svg") || file.endsWith(".png"))) {
        try {
          const upstreamRes = await fetch(`https://v1.watchplay.shop/assets/${file}`, {
            headers: {
              "Referer": "https://v1.watchplay.shop/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          });
          if (upstreamRes.ok) {
            const contentType = upstreamRes.headers.get("content-type") || (file.endsWith(".css") ? "text/css" : "text/javascript");
            res.setHeader("Content-Type", contentType);
            res.setHeader("Cache-Control", "public, max-age=86400");
            const buffer = Buffer.from(await upstreamRes.arrayBuffer());
            return res.send(buffer);
          }
        } catch (e) {}
      }
      return next();
    });
  }
  app.get(["/serie/:id/:season/:episode", "/filme/:id"], async (req, res) => {
    const { id, season, episode } = req.params;
    const type = req.path.startsWith("/serie") ? "tv" : "movie";
    return res.redirect(`/api/myembed-stream?id=${id}&type=${type}&s=${season || 1}&e=${episode || 1}`);
  });

  // Cache em memória para verificação de episódios disponíveis
  // API: Verificador em tempo real de episódios disponíveis nos servidores homologados
  app.get(["/inc/Ajax.php", "/api/playerflix-ajax"], async (req, res) => {
    try {
      const queryParams = new URLSearchParams(req.query as any).toString();
      const targetUrl = `https://playerflix.ink/inc/Ajax.php?${queryParams}`;
      const ajaxRes = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://playerflix.ink/",
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      const data = await ajaxRes.json();

      // Sanitiza opções para garantir apenas servidores permitidos
      if (data && data.data && Array.isArray(data.data.options)) {
        data.data.options = data.data.options.filter((opt: any) => {
          const embedUrl = (opt.embed || "").toLowerCase();
          return !embedUrl.includes("superflix") && !embedUrl.includes("sfapi") && !embedUrl.includes("byse");
        });
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      return res.json(data);
    } catch (err: any) {
      console.error("[VIP Player Ajax Proxy Error]:", err);
      return res.status(500).json({ status: false, error: "Erro ao buscar opções do player VIP" });
    }
  });

  // API: MyEmbed / Playerflix VIP Player com Extração Direta de Stream e Escudo Anti-Popups
  app.get(["/api/tmdb", "/api/tmdb/*"], async (req, res) => {
    try {
      const tmdbPath = (req.params as any)[0] || (req.query.path as string) || "";
      const query = new URLSearchParams(req.query as any);
      query.delete("path");
      
      const apiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;

      query.set("api_key", apiKey);
      
      const cleanPath = tmdbPath.replace(/^\/+/, "");
      const url = `https://api.themoviedb.org/3/${cleanPath}?${query.toString()}`;
      const response = await fetch(url, {
        headers: { "accept": "application/json" }
      });
      
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      console.error("[TMDB Proxy Error]:", err);
      return res.status(500).json({ error: "Erro interno no proxy do TMDB." });
    }
  });

  async function startServer() {
    if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
      const viteName = "vite";
      const { createServer: createViteServer } = await import(viteName);
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          watch: {
            ignored: ['**/data/**','**/scratch/**','**/*.tmp*','**/*.log','**/.system_generated/**','**/*.md','**/uploads/**'],
          },
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      if (fs.existsSync(distPath)) {
        app.get("*", (_req, res) => {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
          res.sendFile(path.join(distPath, "index.html"));
        });
      }
    }
  // API: Extrator Direto da EmbedPlayAPI (Permanentemente desativado - na blacklist)
  app.use((err: any, req: any, res: any, next: any) => { 
    console.error("Global Express Error:", err); 
    if (!res.headersSent) {
      res.status(500).send("Global Express Error: " + (err.message || err)); 
    }
  });

    if (!process.env.VERCEL) {
      const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`\n  ➜  Local:   http://localhost:${PORT}`);
        try {
          const os = require("os");
          const interfaces = os.networkInterfaces();
          for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
              if ((iface.family === "IPv4" || iface.family === 4) && !iface.internal) {
                console.log(`  ➜  Network: http://${iface.address}:${PORT}`);
              }
            }
          }
        } catch (e) { /* ignore */ }
        console.log("");
      });
      server.on("error", (err: any) => {
        console.error("[Server Listen Error]:", err);
      });
      server.setTimeout(30000);
      
      // Inicia a checagem automática de episódios para PUSH Notification
      startCatalogWatcher();
    }
  }

  startServer().catch(err => console.error("Server start error:", err));

