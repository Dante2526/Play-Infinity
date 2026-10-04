var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/firebaseAdmin.ts
var firebaseAdmin_exports = {};
__export(firebaseAdmin_exports, {
  getAdminDb: () => getAdminDb
});
function getAdminDb() {
  if (adminDb) return adminDb;
  try {
    const apps = getApps();
    let defaultApp = apps.find((a) => a.name === "[DEFAULT]") || null;
    if (!defaultApp) {
      const possiblePaths = [
        import_path2.default.join(process.cwd(), "secrets", "firebase-service-account.json"),
        import_path2.default.join(process.cwd(), "firebase-service-account.json")
      ];
      let serviceAccountPath = null;
      for (const p of possiblePaths) {
        if (import_fs2.default.existsSync(p)) {
          serviceAccountPath = p;
          break;
        }
      }
      if (serviceAccountPath) {
        const serviceAccount = JSON.parse(import_fs2.default.readFileSync(serviceAccountPath, "utf-8"));
        defaultApp = initializeApp({
          credential: cert(serviceAccount)
        });
        console.log("[Firebase Admin] Inicializado com sucesso usando arquivo de credencial.");
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        defaultApp = initializeApp({
          credential: cert(serviceAccount)
        });
        console.log("[Firebase Admin] Inicializado usando vari\xE1vel de ambiente.");
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
var import_fs2, import_path2, import_module, import_meta, req, initializeApp, cert, getApps, getFirestore, adminDb;
var init_firebaseAdmin = __esm({
  "server/firebaseAdmin.ts"() {
    import_fs2 = __toESM(require("fs"), 1);
    import_path2 = __toESM(require("path"), 1);
    import_module = require("module");
    import_meta = {};
    req = typeof require !== "undefined" ? require : (0, import_module.createRequire)(import_meta.url);
    ({ initializeApp, cert, getApps } = req("firebase-admin/app"));
    ({ getFirestore } = req("firebase-admin/firestore"));
    adminDb = null;
  }
});

// server/middlewares/requireAdminAuth.ts
var requireAdminAuth_exports = {};
__export(requireAdminAuth_exports, {
  requireAdminAuth: () => requireAdminAuth,
  verifyFirebaseUserToken: () => verifyFirebaseUserToken
});
function getFirebaseAuth() {
  if (adminAuth) return adminAuth;
  try {
    const admin = req2("firebase-admin");
    const { getAuth } = req2("firebase-admin/auth");
    let app2 = null;
    try {
      app2 = admin.app("admin-auth");
    } catch {
      const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "play-infinity-63eaa";
      app2 = admin.initializeApp({ projectId }, "admin-auth");
    }
    adminAuth = getAuth(app2);
    return adminAuth;
  } catch (err) {
    console.warn("[requireAdminAuth] Aviso: Falha ao inicializar Firebase Admin Auth:", err);
    return null;
  }
}
async function verifyFirebaseUserToken(token) {
  if (!token) return null;
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
  } catch (err) {
  }
  if (token.split(".").length === 3) {
    try {
      const apiKey = process.env.VITE_FIREBASE_API_KEY || "AIzaSyAvv3XgTuTfUHUH8pRdRJ8XiH98uCUcSAs";
      const lookupResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
        {
          signal: AbortSignal.timeout(15e3),
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
async function requireAdminAuth(req3, res, next) {
  const authHeader = req3.header("authorization") || req3.header("Authorization");
  const xAdminToken = req3.header("x-admin-token") || req3.header("X-Admin-Token");
  let token = "";
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (xAdminToken) {
    token = xAdminToken.trim();
  }
  if (!token) {
    res.status(401).json({
      success: false,
      error: "Acesso n\xE3o autorizado: Token de autentica\xE7\xE3o ausente."
    });
    return;
  }
  let decodedUser = await verifyFirebaseUserToken(token);
  if (!decodedUser) {
    res.status(401).json({
      success: false,
      error: "Token de autentica\xE7\xE3o inv\xE1lido ou expirado."
    });
    return;
  }
  const masterAdmins = ["naylanmoreira350@gmail.com", "cbeth761@gmail.com"];
  const isMasterAdmin = decodedUser.email && masterAdmins.includes(decodedUser.email.toLowerCase());
  if (!isMasterAdmin && (!decodedUser.emailVerified || !decodedUser.isAdmin)) {
    res.status(403).json({
      success: false,
      error: "Acesso negado: Requer e-mail verificado e privil\xE9gios de administrador."
    });
    return;
  }
  req3.adminUser = decodedUser;
  next();
}
var import_module2, import_meta2, req2, adminAuth;
var init_requireAdminAuth = __esm({
  "server/middlewares/requireAdminAuth.ts"() {
    import_module2 = require("module");
    import_meta2 = {};
    req2 = typeof require !== "undefined" ? require : (0, import_module2.createRequire)(import_meta2.url);
    adminAuth = null;
  }
});

// server.ts
var server_exports = {};
__export(server_exports, {
  app: () => app,
  db: () => db
});
module.exports = __toCommonJS(server_exports);
var import_express16 = __toESM(require("express"), 1);
var import_path7 = __toESM(require("path"), 1);
var import_fs7 = __toESM(require("fs"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_express_rate_limit2 = __toESM(require("express-rate-limit"), 1);
var import_helmet = __toESM(require("helmet"), 1);
var import_app = require("firebase/app");
var import_firestore = require("firebase/firestore");

// server/routes/subtitlesRoutes.ts
var import_express = require("express");
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var cheerio = __toESM(require("cheerio"), 1);
var subtitlesRouter = (0, import_express.Router)();
var CACHE_DIR = import_path.default.join(process.cwd(), "data", "subtitles-cache");
if (!import_fs.default.existsSync(CACHE_DIR)) {
  import_fs.default.mkdirSync(CACHE_DIR, { recursive: true });
}
var MIN_VALID_CUES = 20;
function srtToVtt(srt) {
  let vtt = "WEBVTT\n\n";
  const lines = srt.replace(/\r\n|\r/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    let line = lines[i];
    if (line.match(/^\d+$/)) {
      i++;
      continue;
    }
    if (line.match(/\d{2}:\d{2}:\d{2},\d{3}/)) {
      line = line.replace(/,/g, ".");
      vtt += line + "\n";
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        vtt += lines[i] + "\n";
        i++;
      }
      vtt += "\n";
    } else {
      i++;
    }
  }
  return vtt;
}
function countVttCues(vtt) {
  return (vtt.match(/\d{2}:\d{2}:\d{2}\.\d{3}\s+-->/g) || []).length;
}
var CREDIT_PATTERNS = [
  /opensubtitles/i,
  /legendas?\s+por\s+/i,
  /traduz?[aã][oã]o?\s*:/i,
  /traduz?ido\s+por\s+/i,
  /synced\s+by\s+/i,
  /sync[e]?\s*:\s*/i,
  /corrected\s+by\s+/i,
  /subtitles?\s+by\s+/i,
  /encoded\s+by\s+/i,
  /rip\s+by\s+/i,
  /www\.[a-z0-9-]+\.(com|org|net|tv|io)/i,
  /https?:\/\//i,
  /\bsubscene\b/i,
  /\baddic7ed\b/i,
  /\bsubdb\b/i,
  /\btvsubtitles\b/i,
  /\[legendas?\]/i,
  /suporte\s+em\s+/i,
  /produced\s+by\s+/i,
  /copyright\s*©?/i
];
function stripCreditCues(vtt) {
  const blocks = vtt.split(/\n\n+/);
  const filtered = blocks.filter((block) => {
    if (block.trim().startsWith("WEBVTT")) return true;
    if (!block.includes("-->")) return true;
    const lines = block.trim().split("\n");
    const arrowIdx = lines.findIndex((l) => l.includes("-->"));
    if (arrowIdx === -1) return true;
    const textLines = lines.slice(arrowIdx + 1).filter((l) => l.trim() !== "");
    if (textLines.length === 0) return false;
    const allCredits = textLines.every(
      (line) => CREDIT_PATTERNS.some((pattern) => pattern.test(line.trim()))
    );
    return !allCredits;
  });
  return filtered.join("\n\n");
}
async function tryFetchSubtitleFromResult(resultHref) {
  try {
    const detailUrl = `https://www.subtitlecat.com/${resultHref}`;
    const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(8e3) });
    if (!detailRes.ok) return null;
    const detailHtml = await detailRes.text();
    const $detail = cheerio.load(detailHtml);
    let downloadHref = "";
    $detail("a").each((_, el) => {
      const href = $detail(el).attr("href");
      if (href && !href.startsWith("javascript:") && href.endsWith(".srt") && (href.includes("-pt-BR") || href.includes("-pt") || href.toLowerCase().includes("portuguese") || href.toLowerCase().includes("brasil"))) {
        if (!downloadHref) downloadHref = href;
      }
    });
    if (!downloadHref) return null;
    const downloadUrl = `https://www.subtitlecat.com/${downloadHref}`;
    const srtRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(1e4) });
    if (!srtRes.ok) return null;
    const srtBuffer = await srtRes.arrayBuffer();
    const srtText = new TextDecoder("utf-8").decode(srtBuffer);
    const vttText = stripCreditCues(srtToVtt(srtText));
    if (countVttCues(vttText) < MIN_VALID_CUES) return null;
    return vttText;
  } catch {
    return null;
  }
}
subtitlesRouter.get("/api/subtitles", async (req3, res) => {
  try {
    const { tmdb, type, season, episode, lang } = req3.query;
    if (!tmdb || !type || !lang) {
      return res.status(400).json({ error: "Par\xE2metros tmdb, type e lang s\xE3o obrigat\xF3rios." });
    }
    const tmdbId = String(tmdb);
    const mediaType = String(type);
    const s = season ? String(season) : "1";
    const e = episode ? String(episode) : "1";
    const cacheKey = `${mediaType}_${tmdbId}_s${s}_e${e}_${lang}.vtt`;
    const cachePath = import_path.default.join(CACHE_DIR, cacheKey);
    if (import_fs.default.existsSync(cachePath)) {
      const stat = import_fs.default.statSync(cachePath);
      const isExpired = Date.now() - stat.mtimeMs > 30 * 24 * 60 * 60 * 1e3;
      if (!isExpired) {
        const cached = import_fs.default.readFileSync(cachePath, "utf-8");
        if (countVttCues(cached) >= MIN_VALID_CUES) {
          const b642 = Buffer.from(cachePath).toString("base64");
          return res.json({ success: true, url: `/api/subtitle-file?path=${b642}` });
        }
        console.warn(`[Subtitles] Cache inv\xE1lido para ${cacheKey} (${countVttCues(cached)} cues < ${MIN_VALID_CUES}), rebuscando...`);
        import_fs.default.unlinkSync(cachePath);
      }
    }
    const TMDB_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}?api_key=${TMDB_KEY}&language=en-US`;
    const tmdbRes = await fetch(tmdbUrl, { signal: AbortSignal.timeout(8e3) });
    if (!tmdbRes.ok) throw new Error(`TMDB failed: ${tmdbRes.status}`);
    const tmdbData = await tmdbRes.json();
    let searchTitle = tmdbData.original_title || tmdbData.original_name || tmdbData.title || tmdbData.name;
    searchTitle = searchTitle.replace(/[:,\.\(\)\[\]\-]/g, " ").replace(/\s+/g, " ").trim();
    if (mediaType === "tv") {
      const sStr = s.padStart(2, "0");
      const eStr = e.padStart(2, "0");
      searchTitle += ` S${sStr}E${eStr}`;
    }
    console.log(`[Subtitles] Buscando: "${searchTitle}" (TMDB ${tmdbId})`);
    const query = encodeURIComponent(searchTitle);
    const searchUrl = `https://www.subtitlecat.com/index.php?search=${query}`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(1e4) });
    const searchHtml = await searchRes.text();
    const $ = cheerio.load(searchHtml);
    const resultLinks = [];
    $("tbody tr td a").each((_, el) => {
      const href = $(el).attr("href");
      if (href && resultLinks.length < 5) resultLinks.push(href);
    });
    if (resultLinks.length === 0) {
      return res.status(404).json({ error: "Nenhum resultado encontrado no SubtitleCat." });
    }
    let vttText = null;
    for (const link of resultLinks) {
      vttText = await tryFetchSubtitleFromResult(link);
      if (vttText) {
        console.log(`[Subtitles] Legenda v\xE1lida (${countVttCues(vttText)} cues): ${link}`);
        break;
      }
    }
    if (!vttText) {
      return res.status(404).json({ error: "Legenda PT-BR com conte\xFAdo suficiente n\xE3o encontrada." });
    }
    import_fs.default.writeFileSync(cachePath, vttText, "utf-8");
    const b64 = Buffer.from(cachePath).toString("base64");
    return res.json({ success: true, url: `/api/subtitle-file?path=${b64}` });
  } catch (err) {
    console.error("[Subtitles] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
subtitlesRouter.get("/api/subtitle-file", (req3, res) => {
  const b64Path = req3.query.path;
  if (!b64Path) return res.status(400).send("Path missing");
  try {
    const filePath = Buffer.from(b64Path, "base64").toString("utf-8");
    if (!import_fs.default.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }
    res.setHeader("Content-Type", "text/vtt");
    res.setHeader("Access-Control-Allow-Origin", "*");
    import_fs.default.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.status(500).send("Error reading file");
  }
});

// server/routes/payments.ts
var import_express2 = require("express");
init_firebaseAdmin();
init_requireAdminAuth();

// server/utils/helpers.ts
var import_crypto = __toESM(require("crypto"), 1);
var import_dns = __toESM(require("dns"), 1);
var import_net = __toESM(require("net"), 1);
function sanitizeString(val, maxLength = 100) {
  if (typeof val !== "string") return "";
  return val.replace(/<[^>]*>?/gm, "").replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim().slice(0, maxLength);
}
var trackPlayRateLimits = /* @__PURE__ */ new Map();
function checkTrackPlayRateLimit(ip, titleKey) {
  const now = Date.now();
  let record = trackPlayRateLimits.get(ip);
  if (!record) {
    record = { timestamps: [], titleCooldown: /* @__PURE__ */ new Map() };
    trackPlayRateLimits.set(ip, record);
  }
  record.timestamps = record.timestamps.filter((ts) => now - ts < 6e4);
  if (record.timestamps.length >= 15) {
    return { allowed: false, shouldIncrement: false, error: "Muitas requisi\xE7\xF5es de reprodu\xE7\xE3o. Aguarde um momento." };
  }
  record.timestamps.push(now);
  const lastPlayForTitle = record.titleCooldown.get(titleKey) || 0;
  if (now - lastPlayForTitle < 45e3) {
    return { allowed: true, shouldIncrement: false };
  }
  record.titleCooldown.set(titleKey, now);
  if (record.titleCooldown.size > 100) {
    for (const [key, ts] of record.titleCooldown.entries()) {
      if (now - ts > 12e4) record.titleCooldown.delete(key);
    }
  }
  return { allowed: true, shouldIncrement: true };
}
function isSuperflixDetected(content, url = "") {
  if (!content && !url) return false;
  const superflixDomainRegex = /superflix[a-z0-9-]*\.(top|net|org|com|shop|site|app|api|online|link|xyz|cc|to|vip|pro)/i;
  if (url && superflixDomainRegex.test(url)) return true;
  if (superflixDomainRegex.test(content)) return true;
  const lower = content.toLowerCase();
  const keywords = ["superflixapi", "superflix", "sfapi", "super-flix", "superflix.player"];
  for (const kw of keywords) {
    if (lower.includes(kw) && !lower.includes("superflix-ad-filter")) {
      return true;
    }
  }
  const metaRefresh = content.match(/<meta\s+http-equiv=["']refresh["']\s+content=["'][^"']*url=([^"']+)["']/i);
  if (metaRefresh && metaRefresh[1]) {
    const target = metaRefresh[1].toLowerCase();
    if (target.includes("superflix") || superflixDomainRegex.test(target)) {
      return true;
    }
  }
  return false;
}
var ALLOWED_STREAMING_DOMAINS = [
  "watchplay.shop",
  "v1.watchplay.shop",
  "playerflix.ink",
  "playerflix.biz",
  "myembed.biz",
  "superflixapi.top",
  "embedder.net",
  "warezcdn.net",
  "warezcdn.com",
  "encontrei.info",
  "themoviedb.org",
  "tmdb.org",
  "youtube.com",
  "youtu.be",
  "unsplash.com",
  "image.tmdb.org",
  "vixsrc.to",
  "vix-content.net",
  "videasy.to",
  "videasy.net",
  "vidlink.pro",
  "2embed.cc",
  "autoembed.cc",
  "player.autoembed.cc",
  "speedracelight.com",
  "animesonlinecc.to",
  "blogger.com",
  "mixdrop.co",
  "mixdrop.to",
  "mixdrop.ch",
  "mixdrop.bz",
  "mixdrop.vc",
  "mixdrop.ag",
  "mxdrop.to",
  "mxdrop.top",
  "mxcontent.net",
  "pomfy.stream",
  "pomfy.top",
  "pomfy.vip",
  "nixplay.lat",
  "nixplay.com",
  "nixplay.net"
];
var ALLOWED_LIVE_STREAMING_DOMAINS = [
  "up.kiwi",
  "wurl.com",
  "jmp2.uk",
  "amagi.tv",
  "otteravision.com",
  "jmvstream.com",
  "cdntvms.com.br",
  "pluto.tv",
  "bolodechocolate.fit",
  "akamaihd.net",
  "cloudfront.net",
  "fastly.net",
  "qzz.io",
  "up.kiwi",
  "watchplay.shop",
  "v1.watchplay.shop",
  "vixsrc.to",
  "vixsrc.net",
  "vix-content.net",
  "embedplayer2.xyz",
  "embedplayer.site",
  "playerflix.ink",
  "playerflix.biz",
  "myembed.biz",
  "embedder.net",
  "warezcdn.net",
  "warezcdn.com",
  "186.233.184.65",
  "186.233.118.171",
  "198.13.16.163",
  "186.233.118.163",
  ...ALLOWED_STREAMING_DOMAINS
];
if (!process.env.PROXY_SECRET && process.env.NODE_ENV === "production") {
  console.error("CRITICAL ERROR: PROXY_SECRET n\xE3o est\xE1 definido nas vari\xE1veis de ambiente em produ\xE7\xE3o. O servidor ser\xE1 encerrado por quest\xF5es de seguran\xE7a.");
  process.exit(1);
}
var PROXY_SECRET = process.env.PROXY_SECRET || "play-infinity-live-proxy-secret-key-fixed-2026";
function signProxyUrl(targetUrl) {
  const hmac = import_crypto.default.createHmac("sha256", PROXY_SECRET);
  hmac.update(targetUrl);
  return hmac.digest("hex");
}
function verifyProxySignature(targetUrl, sig) {
  if (!targetUrl || !sig) return false;
  const expected = signProxyUrl(targetUrl);
  try {
    return import_crypto.default.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}
function isAllowedLiveStreamingDomain(hostname) {
  if (!hostname || typeof hostname !== "string") return false;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").trim();
  if (isSuperflixDetected(host)) return false;
  if (/superflix|sfapi|byse|streamberry|embedplay(?!er)|videasy|vidlink|autoembed|consumet|animefire|starflix|startflix|painel-aso/i.test(host)) {
    return false;
  }
  if (process.env.XTREAM_HOST) {
    try {
      const xtreamHost = new URL(process.env.XTREAM_HOST).hostname.toLowerCase();
      if (host === xtreamHost || host.endsWith("." + xtreamHost)) return true;
    } catch {
    }
  }
  const isAllowed = ALLOWED_LIVE_STREAMING_DOMAINS.some((domain) => {
    const d = domain.toLowerCase();
    return host === d || host.endsWith("." + d);
  });
  if (isAllowed) return true;
  if (/embedplayer[a-z0-9-]*\.(xyz|site|top|biz|org|net|online|link|cc|to|me|com)$/i.test(host) || /playerflix\.(ink|biz|to|net)$/i.test(host) || /myembed\.(biz|me|to)$/i.test(host) || /warezcdn\.(net|com)$/i.test(host) || /embedder\.(net|com)$/i.test(host) || /pomfy\.(stream|top|vip)$/i.test(host) || /nixplay\.(lat|net|com)$/i.test(host) || /eloialu[a-z0-9-]*\.(xyz|site|top|biz|online|net|com)$/i.test(host)) {
    return true;
  }
  if (/\.(qzz\.io|akamaihd\.net|cloudfront\.net|fastly\.net|amagi\.tv|wurl\.com|otteravision\.com|streamlock\.net)$/i.test(host)) {
    return true;
  }
  return false;
}
var dnsResolutionCache = /* @__PURE__ */ new Map();
function isPrivateOrLocalIpAddress(ip) {
  if (!ip || typeof ip !== "string") return true;
  let cleanIp = ip.toLowerCase().replace(/^[\[\s]+|[\]\s]+$/g, "").trim();
  if (cleanIp.startsWith("::ffff:")) {
    const rest = cleanIp.slice(7);
    if (rest.includes(".")) {
      cleanIp = rest;
    } else if (rest.includes(":")) {
      const parts = rest.split(":");
      if (parts.length === 2) {
        const p1 = parseInt(parts[0], 16);
        const p2 = parseInt(parts[1], 16);
        cleanIp = `${p1 >> 8 & 255}.${p1 & 255}.${p2 >> 8 & 255}.${p2 & 255}`;
      }
    }
  }
  if (import_net.default.isIPv4(cleanIp)) {
    const parts = cleanIp.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b, c, d] = parts;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 192 && b === 88 && c === 99) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return false;
  }
  if (import_net.default.isIPv6(cleanIp)) {
    if (cleanIp === "::" || cleanIp === "::1") return true;
    if (/^fc[0-9a-f]{2}:|^fd[0-9a-f]{2}:/i.test(cleanIp) || cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true;
    if (/^fe[89ab][0-9a-f]:/i.test(cleanIp) || cleanIp.startsWith("fe80:")) return true;
    if (/^ff[0-9a-f]{2}:/i.test(cleanIp) || cleanIp.startsWith("ff")) return true;
    if (cleanIp.startsWith("64:ff9b::") || cleanIp.startsWith("100::") || cleanIp.startsWith("2001:db8:") || cleanIp.startsWith("2002:")) return true;
    return false;
  }
  return false;
}
async function isPrivateOrLocalHost(hostname) {
  if (!hostname || typeof hostname !== "string") return true;
  const host = hostname.toLowerCase().replace(/^[\[\s]+|[\]\s]+$/g, "").trim();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  if (!host.includes(".")) return true;
  if (/\.(local|internal|lan|corp|home|onion|test|example|invalid)$/i.test(host)) return true;
  if (/^169\.254\./.test(host) || host.includes("metadata.google") || host.includes("metadata.aws") || host.includes("metadata.azure")) return true;
  if (/^0x[0-9a-f]+(\.[0-9a-f]+)*$/i.test(host) || /^[0-9]+$/.test(host) || /^0[0-7]+(\.[0-7]+)*$/.test(host)) {
    return true;
  }
  if (import_net.default.isIP(host)) {
    return isPrivateOrLocalIpAddress(host);
  }
  const cached = dnsResolutionCache.get(host);
  if (cached && cached.expires > Date.now()) {
    return cached.isPrivate;
  }
  try {
    const addresses = await import_dns.default.promises.lookup(host, { all: true, verbatim: true });
    if (!addresses || addresses.length === 0) {
      dnsResolutionCache.set(host, { isPrivate: true, expires: Date.now() + 6e4 });
      return true;
    }
    for (const record of addresses) {
      if (isPrivateOrLocalIpAddress(record.address)) {
        dnsResolutionCache.set(host, { isPrivate: true, expires: Date.now() + 6e4 });
        return true;
      }
    }
    dnsResolutionCache.set(host, { isPrivate: false, expires: Date.now() + 6e4 });
    return false;
  } catch (err) {
    dnsResolutionCache.set(host, { isPrivate: true, expires: Date.now() + 6e4 });
    return true;
  }
}
function isPrivateOrLocalIp(hostname) {
  if (!hostname || typeof hostname !== "string") return true;
  const host = hostname.toLowerCase().replace(/^[\[\s]+|[\]\s]+$/g, "").trim();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  if (!host.includes(".")) return true;
  if (/\.(local|internal|lan|corp|home|onion|test|example|invalid)$/i.test(host)) return true;
  if (/^169\.254\./.test(host) || host.includes("metadata.google") || host.includes("metadata.aws") || host.includes("metadata.azure")) return true;
  if (/^0x[0-9a-f]+(\.[0-9a-f]+)*$/i.test(host) || /^[0-9]+$/.test(host) || /^0[0-7]+(\.[0-7]+)*$/.test(host)) {
    return true;
  }
  if (import_net.default.isIP(host)) {
    return isPrivateOrLocalIpAddress(host);
  }
  const cached = dnsResolutionCache.get(host);
  if (cached && cached.expires > Date.now()) {
    return cached.isPrivate;
  }
  return false;
}
function validateSafeUrl(rawUrl, customAllowed = ALLOWED_STREAMING_DOMAINS) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "A URL \xE9 obrigat\xF3ria e deve ser uma string." };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (e) {
    return { valid: false, error: "Formato de URL inv\xE1lido." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Protocolo inv\xE1lido. Apenas HTTP e HTTPS s\xE3o permitidos." };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateOrLocalIp(hostname)) {
    return { valid: false, error: "Acesso a endere\xE7o IP privado ou interno bloqueado por seguran\xE7a (Anti-SSRF)." };
  }
  if (customAllowed && customAllowed.length > 0) {
    const isDomainAllowed = customAllowed.some((domain) => {
      const d = domain.toLowerCase();
      return hostname === d || hostname.endsWith("." + d);
    });
    if (!isDomainAllowed) {
      const isKnownVideoCdn = /\.(qzz\.io|akamaihd\.net|cloudfront\.net|fastly\.net|m3u8)$/i.test(hostname);
      if (!isKnownVideoCdn) {
        return { valid: false, error: `Dom\xEDnio '${hostname}' n\xE3o autorizado na lista segura.` };
      }
    }
  }
  return { valid: true, parsedUrl: parsed };
}
function timingSafeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return import_crypto.default.timingSafeEqual(bufA, bufB);
}

// server/routes/payments.ts
var router = (0, import_express2.Router)();
var getAsaasHeaders = () => ({
  "access_token": process.env.ASAAS_API_KEY || "",
  "Content-Type": "application/json"
});
var getAsaasBaseUrl = () => process.env.ASAAS_ENVIRONMENT === "sandbox" ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3";
router.post("/api/create-subscription", async (req3, res) => {
  try {
    const authHeader = req3.header("authorization") || req3.header("Authorization");
    let token = "";
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (req3.body.idToken && typeof req3.body.idToken === "string") {
      token = req3.body.idToken.trim();
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
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Acesso n\xE3o autorizado: Voc\xEA precisa estar logado com sua conta para assinar."
      });
    }
    const email = userEmail || (req3.body.email || "").trim();
    const { name, cpfCnpj, creditCard, creditCardHolderInfo, billingType = "UNDEFINED" } = req3.body;
    if (!email) return res.status(400).json({ error: "E-mail obrigat\xF3rio para emiss\xE3o da cobran\xE7a." });
    const baseUrl = getAsaasBaseUrl();
    const headers = getAsaasHeaders();
    let customerId = "";
    const cusRes = await fetch(`${baseUrl}/customers?email=${encodeURIComponent(email)}`, { signal: AbortSignal.timeout(15e3), headers });
    if (cusRes.status === 401) throw new Error("Chave da API do Asaas inv\xE1lida ou expirada. Verifique o arquivo .env");
    const cusText = await cusRes.text();
    const cusData = cusText ? JSON.parse(cusText) : {};
    if (cusData.data && cusData.data.length > 0) {
      customerId = cusData.data[0].id;
    } else {
      const newCusRes = await fetch(`${baseUrl}/customers`, {
        signal: AbortSignal.timeout(15e3),
        method: "POST",
        headers,
        body: JSON.stringify({ name: name || email, email, cpfCnpj })
      });
      const newCusData = await newCusRes.json();
      customerId = newCusData.id;
    }
    if (!customerId) throw new Error("Falha ao resolver o cliente no Asaas.");
    const requestedPlan = (req3.body.plan || "standard").toLowerCase().trim();
    const isPlusPlan = requestedPlan === "plus" || req3.body.description && String(req3.body.description).toLowerCase().includes("plus");
    let finalPrice = 13;
    let externalReference = userId;
    let description = "Play Infinity Premium";
    try {
      const db2 = getAdminDb();
      if (db2 && userId) {
        let userSnap = await db2.collection("usuarios").doc(userId).get();
        if (!userSnap.exists) {
          userSnap = await db2.collection("users").doc(userId).get();
        }
        const uData = userSnap.exists ? userSnap.data() : null;
        if (isPlusPlan) {
          const plusFee = 17;
          let currentFee = 0;
          if (uData && uData.assinatura === "ATIVA") {
            const rawVal = uData.valorMensalidade ?? uData.valor ?? uData.monthlyFee;
            if (rawVal !== void 0 && rawVal !== null && rawVal !== "") {
              currentFee = typeof rawVal === "number" ? rawVal : String(rawVal).includes("13") ? 13 : 9.9;
            } else {
              currentFee = 9.9;
            }
          }
          const diff = Math.max(0, plusFee - currentFee);
          if (currentFee > 0 && diff > 0 && diff < plusFee) {
            finalPrice = diff;
          } else {
            finalPrice = plusFee;
          }
          externalReference = `${userId}|PLUS`;
          description = `Play Infinity Plus (R$ ${finalPrice.toFixed(2).replace(".", ",")})`;
        } else {
          if (uData) {
            const rawVal = uData.valorMensalidade ?? uData.valor ?? uData.monthlyFee;
            if (rawVal !== void 0 && rawVal !== null && rawVal !== "") {
              finalPrice = rawVal === 13 || String(rawVal).includes("13") ? 13 : 9.9;
            } else {
              const createdDate = uData.criadoEm || uData.createdAt;
              if (createdDate && new Date(createdDate) < /* @__PURE__ */ new Date("2026-09-19T00:00:00-03:00")) {
                finalPrice = 9.9;
              } else {
                finalPrice = 13;
              }
            }
          } else {
            finalPrice = 13;
          }
          externalReference = userId;
          description = `Play Infinity Premium (R$ ${finalPrice.toFixed(2).replace(".", ",")})`;
        }
      } else {
        finalPrice = isPlusPlan ? 17 : 13;
        externalReference = isPlusPlan ? `${userId}|PLUS` : userId;
        description = isPlusPlan ? `Play Infinity Plus (R$ 17,00)` : `Play Infinity Premium (R$ 13,00)`;
      }
    } catch (dbErr) {
      console.warn("[Asaas] Erro ao consultar regras de pre\xE7o no Firestore, aplicando pre\xE7o oficial padr\xE3o:", dbErr);
      finalPrice = isPlusPlan ? 17 : 13;
      externalReference = isPlusPlan ? `${userId}|PLUS` : userId;
      description = isPlusPlan ? `Play Infinity Plus (R$ 17,00)` : `Play Infinity Premium (R$ 13,00)`;
    }
    const nextDueDate = /* @__PURE__ */ new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);
    const subPayload = {
      customer: customerId,
      billingType,
      // "CREDIT_CARD" ou "UNDEFINED"
      value: finalPrice,
      nextDueDate: nextDueDate.toISOString().split("T")[0],
      cycle: "MONTHLY",
      description,
      externalReference
      // MANDATÓRIO: Definido pelo servidor a partir do UID autenticado!
    };
    if (billingType === "CREDIT_CARD") {
      if (!creditCard || !creditCardHolderInfo) {
        throw new Error("Dados do cart\xE3o e do titular s\xE3o obrigat\xF3rios para pagamento via cart\xE3o de cr\xE9dito.");
      }
      subPayload.creditCard = creditCard;
      subPayload.creditCardHolderInfo = creditCardHolderInfo;
      delete subPayload.nextDueDate;
    }
    const subRes = await fetch(`${baseUrl}/subscriptions`, {
      signal: AbortSignal.timeout(15e3),
      method: "POST",
      headers,
      body: JSON.stringify(subPayload)
    });
    const subData = await subRes.json();
    if (subData.errors) {
      throw new Error(subData.errors[0].description);
    }
    let invoiceUrl;
    let pixQrCode;
    if (billingType !== "CREDIT_CARD") {
      const payRes = await fetch(`${baseUrl}/payments?subscription=${subData.id}`, { signal: AbortSignal.timeout(15e3), headers });
      const payData = await payRes.json();
      const firstPayment = payData.data?.[0];
      if (!firstPayment) throw new Error("Cobran\xE7a inicial n\xE3o foi gerada.");
      invoiceUrl = firstPayment.invoiceUrl;
      if (billingType === "PIX") {
        const qrRes = await fetch(`${baseUrl}/payments/${firstPayment.id}/pixQrCode`, { signal: AbortSignal.timeout(15e3), headers });
        const qrData = await qrRes.json();
        if (qrData.success !== false) {
          pixQrCode = qrData;
        }
      }
    }
    res.json({ success: true, invoiceUrl, subscriptionId: subData.id, pixQrCode });
  } catch (err) {
    console.error("[Asaas] Erro ao criar assinatura:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
router.post("/api/webhook/asaas", async (req3, res) => {
  try {
    const configuredToken = process.env.ASAAS_WEBHOOK_TOKEN;
    const receivedToken = (req3.header("asaas-access-token") || "").trim();
    if (configuredToken) {
      if (!receivedToken || !timingSafeCompare(receivedToken, configuredToken.trim())) {
        console.warn("[Webhook Asaas] Rejeitado: asaas-access-token ausente ou inv\xE1lido.");
        return res.status(401).json({ success: false, error: "Acesso n\xE3o autorizado: Token de webhook inv\xE1lido." });
      }
    } else {
      console.warn("[Webhook Asaas] ALERTA DE SEGURAN\xC7A: ASAAS_WEBHOOK_TOKEN n\xE3o configurado no .env! Exigindo verifica\xE7\xE3o estrita via API do Asaas.");
    }
    const { event, payment } = req3.body || {};
    if (!event || !payment || typeof payment !== "object") {
      return res.status(400).json({ success: false, error: "Payload do webhook incompleto ou inv\xE1lido." });
    }
    if (!payment.externalReference) {
      return res.json({ received: true, ignored: "Sem externalReference" });
    }
    const paymentId = payment.id;
    const asaasApiKey = process.env.ASAAS_API_KEY;
    if (asaasApiKey && paymentId) {
      try {
        const baseUrl = getAsaasBaseUrl();
        const verifyRes = await fetch(`${baseUrl}/payments/${paymentId}`, {
          signal: AbortSignal.timeout(15e3),
          headers: getAsaasHeaders()
        });
        if (!verifyRes.ok) {
          console.warn(`[Webhook Asaas] Cobran\xE7a ${paymentId} n\xE3o encontrada na API do Asaas (HTTP ${verifyRes.status}). Rejeitando webhook.`);
          return res.status(400).json({ success: false, error: "Cobran\xE7a n\xE3o localizada ou inv\xE1lida na API do Asaas." });
        }
        const realPayment = await verifyRes.json();
        if (realPayment.externalReference !== payment.externalReference) {
          console.warn(`[Webhook Asaas] Inconsist\xEAncia de externalReference: webhook=${payment.externalReference}, API=${realPayment.externalReference}`);
          return res.status(400).json({ success: false, error: "Inconsist\xEAncia cadastral na cobran\xE7a." });
        }
        if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
          const validReceivedStatuses = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"];
          if (!validReceivedStatuses.includes(realPayment.status)) {
            console.warn(`[Webhook Asaas] Evento ${event} incompat\xEDvel com o status real ${realPayment.status} no Asaas.`);
            return res.status(400).json({ success: false, error: "Status da cobran\xE7a n\xE3o confirmado pela API." });
          }
        }
      } catch (apiErr) {
        console.error("[Webhook Asaas] Falha ao consultar API do Asaas:", apiErr);
        if (!configuredToken) {
          return res.status(500).json({ success: false, error: "Falha na verifica\xE7\xE3o de autenticidade do pagamento." });
        }
      }
    } else if (!configuredToken) {
      return res.status(401).json({ success: false, error: "Webhook rejeitado: aus\xEAncia de credenciais de valida\xE7\xE3o." });
    }
    const db2 = getAdminDb();
    if (db2) {
      let userId = String(payment.externalReference).trim();
      let isPlusUpgrade = false;
      if (userId.includes("|PLUS")) {
        userId = userId.split("|")[0];
        isPlusUpgrade = true;
      }
      userId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!userId) {
        return res.status(400).json({ success: false, error: "ID de usu\xE1rio inv\xE1lido." });
      }
      const userRef = db2.collection("usuarios").doc(userId);
      if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
        const now = /* @__PURE__ */ new Date();
        const nextMonth = new Date(now);
        nextMonth.setMonth(now.getMonth() + 1);
        const updateData = {
          assinatura: "ATIVA",
          subscriptionId: payment.subscription || "",
          dataPagamento: now.toISOString(),
          dataExpiracao: nextMonth.toISOString(),
          ultimoAcesso: now.toISOString()
        };
        if (isPlusUpgrade) {
          updateData.plano = "plus";
          updateData.valorMensalidade = 20;
        }
        await userRef.set(updateData, { merge: true });
        console.log(`[Webhook Asaas] Assinatura ATIVADA para o user: ${userId} (Plus: ${isPlusUpgrade})`);
      } else if (event === "PAYMENT_OVERDUE" || event === "PAYMENT_REFUNDED" || event === "PAYMENT_DELETED") {
        await userRef.set({
          assinatura: "INATIVA",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        }, { merge: true });
        console.log(`[Webhook Asaas] Assinatura INATIVADA para o user: ${userId}`);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error("[Webhook Asaas] Erro:", err);
    res.status(500).json({ error: err.message });
  }
});
var payments_default = router;

// server/routes/videoScrapers.ts
var import_express6 = require("express");

// server/routes/diagnostics.ts
var import_express3 = require("express");
var cheerio2 = __toESM(require("cheerio"), 1);

// src/data/serverBlacklist.ts
var SERVER_BLACKLIST = [
  {
    id: "superflix",
    name: "Superflix / SFAPI",
    keys: ["srv_superflix", "superflix", "sfapi"],
    patterns: [
      /superflix[a-z0-9-]*\.(top|net|org|com|shop|site|app|api|online|link|xyz|cc|to|vip|pro)/i,
      /sfapi/i,
      "superflix"
    ],
    reason: "Redirecionamentos for\xE7ados, popups invasivos e instabilidade de streaming",
    blockedAt: "2026-09"
  },
  {
    id: "byse",
    name: "BYSE / Streamberry",
    keys: ["srv_byse", "byse", "streamberry"],
    patterns: [
      /streamberry\.com\.br/i,
      /byse/i,
      "/api/byse-stream"
    ],
    reason: "Tentativas de redirecionamento do parent window (top.location) e falhas frequentes",
    blockedAt: "2026-09"
  },
  {
    id: "embedplay",
    name: "EmbedPlay",
    keys: ["srv_embedplay", "embedplay"],
    patterns: [
      /embedplay(?!er)/i,
      "/api/embedplay-direct"
    ],
    reason: "Instabilidade e servidores frequentemente fora do ar",
    blockedAt: "2026-09"
  },
  {
    id: "videasy",
    name: "Videasy",
    keys: ["srv_videasy", "videasy"],
    patterns: [
      /videasy\.(net|to|org|cc)/i,
      "player.videasy.net",
      "player.videasy.to"
    ],
    reason: "Bloqueio de CORS, instabilidade de carregamento e \xE1udio n\xE3o correspondente",
    blockedAt: "2026-09"
  },
  {
    id: "vidlink",
    name: "VidLink HD",
    keys: ["srv_vidlink", "vidlink"],
    patterns: [
      /vidlink\.pro/i,
      "vidlink"
    ],
    reason: "Lentid\xE3o excessiva e falha na sincroniza\xE7\xE3o de legendas/\xE1udio em portugu\xEAs",
    blockedAt: "2026-09"
  },
  {
    id: "autoembed",
    name: "AutoEmbed",
    keys: ["srv_autoembed", "autoembed"],
    patterns: [
      /autoembed\.cc/i,
      "autoembed"
    ],
    reason: "An\xFAncios intrusivos e quebra de sandbox",
    blockedAt: "2026-09"
  },
  {
    id: "consumet",
    name: "Consumet / AnimeFire Iframe",
    keys: ["srv_consumet", "consumet"],
    patterns: [
      /anime-stream\?provider=consumet/i,
      "consumet"
    ],
    reason: "Servidores externos de animes inst\xE1veis e bloqueios de cloudflare",
    blockedAt: "2026-09"
  },
  {
    id: "embedmovies",
    name: "EmbedMovies / Fake Embeds",
    keys: ["embedmovies", "srv_embedmovies"],
    patterns: [
      /embedmovies\.(org|net|com|top|cc)/i,
      "embedmovies.org",
      "embedmovies"
    ],
    reason: "Player fantasma sem stream de v\xEDdeo real, exibindo apenas imagem est\xE1tica e marca d'\xE1gua",
    blockedAt: "2026-09"
  },
  {
    id: "generic_scrapers",
    name: "Scrapers / Iframe Hubs Gen\xE9ricos",
    keys: ["multiembed", "embed.su"],
    patterns: [
      /multiembed/i,
      /embed\.su/i
    ],
    reason: "Invas\xE3o de popups, rastreadores terceiros e quebra de pol\xEDtica de privacidade",
    blockedAt: "2026-09"
  },
  {
    id: "starflix",
    name: "Starflix / Startflix",
    keys: ["srv_starflix", "starflix", "srv_startflix", "startflix"],
    patterns: [
      /starflix/i,
      /startflix/i,
      /painel-aso\.sbs/i,
      "starflix",
      "startflix"
    ],
    reason: "Removido por solicita\xE7\xE3o do usu\xE1rio e incompatibilidade com os reprodutores homologados",
    blockedAt: "2026-09"
  },
  {
    id: "seriesflix_vidsrc",
    name: "Seriesflix HD (Vidsrc)",
    keys: ["srv_vidsrc", "vidsrc"],
    patterns: [
      /vidsrc/i,
      /opalescentoblivion/i
    ],
    reason: "A infraestrutura original ativou prote\xE7\xE3o Cloudflare severa (Turnstile) bloqueando nosso proxy (403), e tamb\xE9m est\xE1 retornando 522 Connection Timed Out. O player est\xE1 morto no momento.",
    blockedAt: "2026-09"
  }
];
function isServerBlacklisted(urlOrKey) {
  if (!urlOrKey) return false;
  const target = String(urlOrKey).trim().toLowerCase();
  for (const entry of SERVER_BLACKLIST) {
    if (entry.keys.some((k) => target === k.toLowerCase() || target.includes(k.toLowerCase()))) {
      return true;
    }
    for (const pattern of entry.patterns) {
      if (typeof pattern === "string") {
        if (target.includes(pattern.toLowerCase())) {
          return true;
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(target)) {
          return true;
        }
      }
    }
  }
  return false;
}

// server/utils/caches.ts
var import_lru_cache = require("lru-cache");
var animeDirectStreamCache = new import_lru_cache.LRUCache({
  max: 100,
  ttl: 1e3 * 60 * 30
  // 30 mins
});
var vixsrcStreamCache = new import_lru_cache.LRUCache({
  max: 50,
  ttl: 1e3 * 60 * 15
  // 15 mins
});
var liveChunkCache = new import_lru_cache.LRUCache({
  max: 30,
  ttl: 1e3 * 10
  // 10 seconds
});
var liveVariantRefreshCache = new import_lru_cache.LRUCache({
  max: 50,
  ttl: 1e3 * 60 * 5
  // 5 mins
});
var searchCache = new import_lru_cache.LRUCache({
  max: 50,
  ttl: 1e3 * 60 * 5
});
var seasonAvailabilityCache = new import_lru_cache.LRUCache({
  max: 200,
  ttl: 1e3 * 60 * 20
  // 20 minutos
});
var tmdbCache = new import_lru_cache.LRUCache({
  max: 400,
  ttl: 1e3 * 60 * 15
  // 15 minutos
});

// server/routes/diagnostics.ts
var router2 = (0, import_express3.Router)();
router2.get("/api/extract-player", async (req3, res) => {
  const targetUrl = req3.query.url;
  const validation = validateSafeUrl(targetUrl);
  if (!validation.valid) {
    return res.status(403).json({ success: false, error: validation.error });
  }
  if (isServerBlacklisted(targetUrl)) {
    return res.status(403).json({ success: false, error: "Servidor bloqueado na blacklist permanente do Play Infinity." });
  }
  try {
    console.log(`[Extrator] Buscando player de: ${targetUrl}`);
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(15e3),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: new URL(targetUrl).origin
      },
      redirect: "follow"
    });
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Erro ao acessar o site: status ${response.status}`
      });
    }
    const html = await response.text();
    const $ = cheerio2.load(html);
    let playerUrl;
    $("iframe").each((_, el) => {
      if (playerUrl) return;
      const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
      if (src && !src.includes("googletagmanager") && !src.includes("ads") && !src.includes("recaptcha") && !src.includes("cloudflare")) {
        playerUrl = src;
      }
    });
    if (!playerUrl) {
      const potentialContainers = ["#playex", "#dooplay_player_response", ".playex", ".embed-container", "#playerframe"];
      for (const selector of potentialContainers) {
        const container = $(selector);
        if (container.length) {
          const ifr = container.find("iframe");
          if (ifr.length) {
            playerUrl = ifr.attr("src") || ifr.attr("data-src");
            if (playerUrl) break;
          }
        }
      }
    }
    if (!playerUrl) {
      const scriptTags = $("script").map((_, el) => $(el).html() || "").get();
      for (const script of scriptTags) {
        const match = script.match(/https?:\/\/[^\s"'<>]+\/(?:embed|player|video|v)\/[^\s"'<>]+/i);
        if (match) {
          playerUrl = match[0];
          break;
        }
      }
    }
    if (playerUrl && playerUrl.startsWith("//")) {
      playerUrl = "https:" + playerUrl;
    } else if (playerUrl && playerUrl.startsWith("/")) {
      playerUrl = new URL(playerUrl, targetUrl).toString();
    }
    let availablePlayers = [];
    const isPlayerFlixOrMyEmbed = playerUrl && playerUrl.includes("playerflix") || targetUrl.includes("myembed") || targetUrl.includes("playerflix");
    if (isPlayerFlixOrMyEmbed) {
      const tvMatch = (playerUrl || targetUrl).match(/(?:serie|tv)\/([a-zA-Z0-9_-]+)\/(\d+)\/(\d+)/i);
      const movieMatch = (playerUrl || targetUrl).match(/(?:filme|movie)\/([a-zA-Z0-9_-]+)/i) || (playerUrl || targetUrl).match(/(tt\d+)/i);
      try {
        let ajaxUrl = "";
        let refererUrl = "";
        if (tvMatch) {
          const [, tvId, seasonNum, epNum] = tvMatch;
          ajaxUrl = `https://playerflix.ink/inc/Ajax.php?type=tv&id=${tvId}&season=${seasonNum}&episode=${epNum}`;
          refererUrl = `https://playerflix.ink/serie/${tvId}/${seasonNum}/${epNum}`;
        } else if (movieMatch) {
          const movieId = movieMatch[1];
          ajaxUrl = `https://playerflix.ink/inc/Ajax.php?type=movie&id=${movieId}`;
          refererUrl = `https://playerflix.ink/filme/${movieId}`;
        }
        if (ajaxUrl) {
          const ajaxRes = await fetch(ajaxUrl, {
            signal: AbortSignal.timeout(15e3),
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Referer": refererUrl,
              "X-Requested-With": "XMLHttpRequest"
            }
          });
          if (ajaxRes.ok) {
            const ajaxData = await ajaxRes.json();
            if (ajaxData?.status && Array.isArray(ajaxData?.data?.options) && ajaxData.data.options.length > 0) {
              const options = ajaxData.data.options;
              const sortedOptions = [...options].sort((a, b) => {
                const aIsClean = (a.embed || "").includes("watchplay") ? -1 : 0;
                const bIsClean = (b.embed || "").includes("watchplay") ? -1 : 0;
                if (aIsClean !== bIsClean) return aIsClean - bIsClean;
                const aIsPt = a.lang === "pt-br" ? -1 : 1;
                const bIsPt = b.lang === "pt-br" ? -1 : 1;
                return aIsPt - bIsPt;
              });
              availablePlayers = sortedOptions.map((opt, idx) => {
                const isClean = (opt.embed || "").includes("watchplay");
                const audioLabel = opt.lang === "pt-br" ? "Dublado" : "Legendado";
                const cleanBadge = isClean ? " \u2022 Sem Popups" : "";
                return {
                  id: String(idx + 1),
                  label: `Servidor ${idx + 1} (${opt.label || "Player"} - ${audioLabel}${cleanBadge})`,
                  url: opt.embed,
                  lang: opt.lang,
                  isClean
                };
              });
              const bestPlayer = sortedOptions[0];
              if (bestPlayer?.embed) {
                console.log(`[Extrator] Selecionado 1\xBA player: ${bestPlayer.embed}`);
                playerUrl = bestPlayer.embed;
              }
            }
          }
        }
      } catch (ajaxErr) {
        console.warn("[Extrator] Falha ao consultar Ajax do playerflix:", ajaxErr);
      }
    }
    const pageTitle = $("title").text() || $("h1").first().text() || "Player";
    if (playerUrl) {
      return res.json({
        success: true,
        playerUrl,
        title: pageTitle.trim(),
        sourceUrl: targetUrl,
        availablePlayers
      });
    } else {
      return res.status(404).json({
        success: false,
        error: "Nenhum iframe ou player de v\xEDdeo direto foi localizado nesta p\xE1gina.",
        sourceUrl: targetUrl,
        pageTitle: pageTitle.trim()
      });
    }
  } catch (err) {
    console.error("[Extrator Error]:", err);
    return res.status(500).json({
      success: false,
      error: "Falha ao processar a p\xE1gina: " + (err.message || String(err))
    });
  }
});
router2.get("/api/player-diagnostics", async (req3, res) => {
  const testUrl = req3.query.url || "https://v1.watchplay.shop/tvshow/66732/1/1";
  const validation = validateSafeUrl(testUrl);
  if (!validation.valid) {
    return res.status(403).json({ success: false, url: testUrl, error: validation.error });
  }
  try {
    const startTime = Date.now();
    const headRes = await fetch(testUrl, {
      signal: AbortSignal.timeout(15e3),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": new URL(testUrl).origin
      }
    });
    const responseTime = Date.now() - startTime;
    const xFrameOptions = headRes.headers.get("x-frame-options");
    const csp = headRes.headers.get("content-security-policy");
    const iframeEmbeddable = !xFrameOptions || !["deny", "sameorigin"].includes(xFrameOptions.toLowerCase());
    const sandboxSafe = !csp || !csp.includes("frame-ancestors 'none'");
    return res.json({
      success: true,
      url: testUrl,
      status: headRes.status,
      statusText: headRes.statusText,
      responseTimeMs: responseTime,
      iframeEmbeddable,
      sandboxSafe,
      xFrameOptions: xFrameOptions || "None (Embed allowed)",
      details: {
        supportsAutoplay: true,
        antiAdShieldSupported: true,
        noPopupVerified: true
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      url: testUrl,
      error: err.message
    });
  }
});
async function resolveAnimesOnline(title, episode = 1) {
  if (!title) return null;
  try {
    let baseTitle = title.split(" - ")[0].replace(/\(.*?\)/g, "").trim();
    baseTitle = baseTitle.replace(/dublado/i, "").replace(/legendado/i, "").trim();
    const cleanTitle = baseTitle.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (!cleanTitle) return null;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Referer": "https://animesonlinecc.to/",
      "X-Forwarded-For": "177.100.100.1"
    };
    let searchTitle = cleanTitle;
    const titleMap = {
      "attack on titan": "shingeki no kyojin",
      "demon slayer": "kimetsu no yaiba",
      "my hero academia": "boku no hero academia",
      "the seven deadly sins": "nanatsu no taizai",
      "sword art online": "sword art online",
      "fullmetal alchemist": "fullmetal alchemist",
      "dragon ball z": "dragon ball z"
      // Força busca exata
    };
    for (const [en, jp] of Object.entries(titleMap)) {
      if (cleanTitle.includes(en)) {
        searchTitle = cleanTitle.replace(en, jp);
        break;
      }
    }
    const searchSlug = encodeURIComponent(searchTitle.replace(/\s+/g, "+"));
    const searchUrl = `https://animesonlinecc.to/search/${searchSlug}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4e3);
    const searchRes = await fetch(searchUrl, {
      signal: controller.signal,
      headers
    });
    clearTimeout(timeout);
    if (!searchRes.ok) return null;
    const searchHtml = await searchRes.text();
    const animeMatches = [...searchHtml.matchAll(/href=["'](https:\/\/animesonlinecc\.to\/anime\/[^"']+)["']/g)].map((m) => m[1]);
    const uniqueAnimes = [...new Set(animeMatches)];
    if (uniqueAnimes.length === 0) return null;
    const dubladoMatches = uniqueAnimes.filter((u) => u.includes("dublado"));
    let targetAnime = dubladoMatches.length > 0 ? dubladoMatches[0] : uniqueAnimes[0];
    if (cleanTitle === "naruto") {
      const exact = uniqueAnimes.find((u) => u.includes("naruto-dublado") || u.endsWith("/anime/naruto/"));
      if (exact) targetAnime = exact;
    } else if (cleanTitle.includes("shippuden")) {
      const exact = uniqueAnimes.find((u) => u.includes("naruto-shippuden-dublado") || u.includes("naruto-shippuden"));
      if (exact) targetAnime = exact;
    } else if (cleanTitle === "dragon ball") {
      const exact = uniqueAnimes.find((u) => u.includes("dragon-ball-dublado") || u.endsWith("/anime/dragon-ball/"));
      if (exact) targetAnime = exact;
    } else if (cleanTitle.includes("dragon ball z")) {
      const exact = uniqueAnimes.find((u) => u.includes("dragon-ball-z-dublado") || u.includes("dragon-ball-z"));
      if (exact) targetAnime = exact;
    } else if (cleanTitle.includes("dragon ball super")) {
      const exact = uniqueAnimes.find((u) => u.includes("dragon-ball-super-dublado") || u.includes("dragon-ball-super"));
      if (exact) targetAnime = exact;
    }
    const animePageRes = await fetch(targetAnime, {
      signal: AbortSignal.timeout(15e3),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://animesonlinecc.to/"
      }
    });
    if (!animePageRes.ok) return null;
    const animeHtml = await animePageRes.text();
    const epMatches = [...animeHtml.matchAll(/href=["'](https:\/\/animesonlinecc\.to\/episodio\/[^"']+)["']/g)].map((m) => m[1]);
    const uniqueEps = [...new Set(epMatches)];
    if (uniqueEps.length === 0) return null;
    const epNum = Number(episode) || 1;
    const targetEp = uniqueEps.find(
      (u) => u.includes(`-episodio-${epNum}/`) || u.includes(`-ep-${epNum}/`) || u.endsWith(`-${epNum}/`) || u.endsWith(`/${epNum}/`)
    ) || uniqueEps[0];
    const epPageRes = await fetch(targetEp, {
      signal: AbortSignal.timeout(15e3),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": targetAnime
      }
    });
    if (!epPageRes.ok) return null;
    const epHtml = await epPageRes.text();
    const iframeMatch = epHtml.match(/<iframe[^>]*src=["'](https:\/\/www\.blogger\.com\/video\.g\?token=[^"']+)["']/i);
    if (iframeMatch) {
      return iframeMatch[1];
    }
    return null;
  } catch (err) {
    console.warn("[AnimesOnline Resolver] Falha na busca alternativa:", err.message);
    return null;
  }
}
async function resolveDirectAnimeStream(tmdbId, season, episode, isMovie = false, animeTitle = "") {
  const cacheKey = `${tmdbId}:${season}:${episode}:${isMovie}:${animeTitle}`;
  const cached = animeDirectStreamCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 10 * 60 * 1e3) {
    return { streamUrl: cached.streamUrl, subtitleUrl: cached.subtitleUrl, isBlogger: cached.isBlogger };
  }
  try {
    const pageUrl = isMovie ? `https://v1.watchplay.shop/movie/${tmdbId}` : `https://v1.watchplay.shop/tvshow/${tmdbId}/${season}/${episode}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const pageRes = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://v1.watchplay.shop/"
      }
    });
    clearTimeout(timeout);
    if (!pageRes.ok || pageRes.url.includes("404")) {
      if (animeTitle) {
        const bloggerUrl = await resolveAnimesOnline(animeTitle, episode);
        if (bloggerUrl) {
          const resBlogger = { streamUrl: bloggerUrl, isBlogger: true };
          animeDirectStreamCache.set(cacheKey, { ...resBlogger, timestamp: Date.now() });
          return resBlogger;
        }
      }
      return null;
    }
    const html = await pageRes.text();
    if (isSuperflixDetected(html, pageUrl)) return null;
    let contentId = null;
    if (isMovie) {
      const match = html.match(/data-contentid=["'](\d+)["']/i) || html.match(/contentid\s*:\s*['"]?(\d+)['"]?/i);
      if (match) contentId = match[1];
    } else {
      const regex = new RegExp(`class=["'][^"']*episodeOption[^"']*["'][^>]*data-contentid=["'](\\d+)["'][^>]*data-season=["']${season}["'][^>]*data-episode=["']${episode}["']`, "i");
      const match = html.match(regex) || html.match(new RegExp(`data-season=["']${season}["'][^>]*data-episode=["']${episode}["'][^>]*data-contentid=["'](\\d+)["']`, "i"));
      if (match) {
        contentId = match[1];
      } else {
        const activeMatch = html.match(/class=["'][^"']*episodeOption\\s+active[^"']*["'][^>]*data-contentid=["'](\\d+)["']/i);
        if (activeMatch) contentId = activeMatch[1];
      }
    }
    if (!contentId && animeTitle) {
      const bloggerUrl = await resolveAnimesOnline(animeTitle, episode);
      if (bloggerUrl) {
        const resBlogger = { streamUrl: bloggerUrl, isBlogger: true };
        animeDirectStreamCache.set(cacheKey, { ...resBlogger, timestamp: Date.now() });
        return resBlogger;
      }
    }
    let optionId = null;
    if (contentId) {
      const optRes = await fetch("https://v1.watchplay.shop/api", {
        signal: AbortSignal.timeout(15e3),
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": pageUrl,
          "X-Requested-With": "XMLHttpRequest"
        },
        body: new URLSearchParams({ action: "getOptions", contentid: contentId }).toString()
      });
      const optJson = await optRes.json().catch(() => null);
      if (optJson?.data?.options?.length > 0) {
        const dubOpt = optJson.data.options.find((o) => String(o.target) === "1" || /dub/i.test(o.type || ""));
        optionId = String((dubOpt || optJson.data.options[0]).ID);
      }
    }
    if (!optionId) {
      const idMatch = html.match(/player_select_item["'][^>]*data-id=["'](\d+)["']/i);
      const regexOptions = /player_select_item["'][^>]*data-id=["'](\d+)["'][^>]*>[\s\S]*?<div[^>]*player_select_name[^>]*>([^<]+)<\/div>/gi;
      let match;
      const options = [];
      while ((match = regexOptions.exec(html)) !== null) {
        options.push({ id: match[1], name: match[2].trim() });
      }
      if (options.length > 0) {
        const upnsOpt = options.find((o) => o.name.includes("UPNS"));
        optionId = upnsOpt ? upnsOpt.id : options[0].id;
      }
    }
    if (!optionId) {
      if (animeTitle) {
        const bloggerUrl = await resolveAnimesOnline(animeTitle, episode);
        if (bloggerUrl) {
          const resBlogger = { streamUrl: bloggerUrl, isBlogger: true };
          animeDirectStreamCache.set(cacheKey, { ...resBlogger, timestamp: Date.now() });
          return resBlogger;
        }
      }
      return null;
    }
    const playerRes = await fetch("https://v1.watchplay.shop/api", {
      signal: AbortSignal.timeout(15e3),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": pageUrl,
        "X-Requested-With": "XMLHttpRequest"
      },
      body: new URLSearchParams({ action: "getPlayer", video_id: optionId }).toString()
    });
    const playerJson = await playerRes.json().catch(() => null);
    const rawVideoUrl = playerJson?.data?.video_url;
    if (!rawVideoUrl) return null;
    let finalStreamUrl = rawVideoUrl;
    if (rawVideoUrl.includes("vid7102402.hclod.qzz.io") && !rawVideoUrl.includes("md5=")) {
      const signTarget = new URL(pageUrl);
      signTarget.searchParams.set("action_secure_sign", "1");
      signTarget.searchParams.set("raw_url", rawVideoUrl);
      const signRes = await fetch(signTarget.toString(), {
        signal: AbortSignal.timeout(15e3),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": pageUrl,
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      const signJson = await signRes.json().catch(() => null);
      if (signJson?.signed_url) {
        finalStreamUrl = signJson.signed_url;
      }
    }
    let subtitleUrl = playerJson?.data?.video_caption_url;
    if (!subtitleUrl && !isMovie) {
      subtitleUrl = `https://v1.watchplay.shop/app/caption/tvshow/${tmdbId}/leg/s${season}e${episode}.vtt`;
    }
    const result = { streamUrl: finalStreamUrl, subtitleUrl, isBlogger: false };
    animeDirectStreamCache.set(cacheKey, { ...result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.warn("[Anime Resolver] Falha ao extrair stream direto:", err.message);
    if (animeTitle) {
      const bloggerUrl = await resolveAnimesOnline(animeTitle, episode);
      if (bloggerUrl) {
        const resBlogger = { streamUrl: bloggerUrl, isBlogger: true };
        animeDirectStreamCache.set(cacheKey, { ...resBlogger, timestamp: Date.now() });
        return resBlogger;
      }
    }
    return null;
  }
}
async function resolveVixsrcStream(tmdbId, type, season = 1, episode = 1) {
  const cacheKey = `${tmdbId}:${type}:${season}:${episode}`;
  const cached = vixsrcStreamCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 15 * 60 * 1e3) {
    return cached;
  }
  try {
    const BASE_URL = "https://vixsrc.to";
    const VIXSRC_HEADERS = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Referer": BASE_URL,
      "Origin": BASE_URL
    };
    const apiUrl = type === "movie" ? `${BASE_URL}/api/movie/${tmdbId}` : `${BASE_URL}/api/tv/${tmdbId}/${season}/${episode}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6e3);
    const apiRes = await fetch(apiUrl, {
      headers: VIXSRC_HEADERS,
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!apiRes.ok) return null;
    const apiData = await apiRes.json().catch(() => null);
    if (!apiData?.src) return null;
    const embedPageRes = await fetch(BASE_URL + apiData.src, {
      signal: AbortSignal.timeout(15e3),
      headers: { ...VIXSRC_HEADERS, Accept: "text/html" }
    });
    if (!embedPageRes.ok) return null;
    const html = await embedPageRes.text();
    const token = html.match(/token["']\s*:\s*["']([^"']+)/)?.[1];
    const expires = html.match(/expires["']\s*:\s*["']([^"']+)/)?.[1];
    const playlist = html.match(/url\s*:\s*["']([^"']+)/)?.[1];
    if (!token || !expires || !playlist) return null;
    const sep = playlist.includes("?") ? "&" : "?";
    const masterUrl = `${playlist}${sep}token=${token}&expires=${expires}&h=1`;
    const result = { masterUrl, embedUrl: BASE_URL + apiData.src, timestamp: Date.now() };
    vixsrcStreamCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`[Vixsrc] Resolver warning: ${err.message}`);
    return null;
  }
}
router2.get("/api/speedtest-down", (req3, res) => {
  try {
    const bytesRaw = Number(req3.query.bytes);
    const bytesToDownload = !isNaN(bytesRaw) && bytesRaw > 0 ? Math.min(bytesRaw, 200 * 1024 * 1024) : 25 * 1024 * 1024;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", bytesToDownload.toString());
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    const chunkSize = 64 * 1024;
    const chunk = Buffer.alloc(chunkSize, 0);
    let bytesSent = 0;
    const sendChunk = () => {
      let canContinue = true;
      while (bytesSent < bytesToDownload && canContinue) {
        const toSend = Math.min(chunkSize, bytesToDownload - bytesSent);
        if (toSend < chunkSize) {
          canContinue = res.write(chunk.subarray(0, toSend));
        } else {
          canContinue = res.write(chunk);
        }
        bytesSent += toSend;
      }
      if (bytesSent >= bytesToDownload) {
        res.end();
      } else if (!canContinue) {
        res.once("drain", sendChunk);
      }
    };
    req3.on("close", () => {
      bytesSent = bytesToDownload;
    });
    sendChunk();
  } catch (err) {
    console.error("[SpeedTest Down Error]:", err);
    if (!res.headersSent) res.status(500).send("Erro");
  }
});
router2.post("/api/speedtest-up", (req3, res) => {
  req3.on("data", () => {
  });
  req3.on("end", () => {
    res.status(200).send("OK");
  });
  req3.on("error", () => {
    if (!res.headersSent) res.status(500).send("Error");
  });
});
var diagnostics_default = router2;

// server/routes/videoScrapers.ts
var import_stream = require("stream");

// server/routes/vidsrcRoutes.ts
var import_express4 = require("express");
var router3 = (0, import_express4.Router)();
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Origin, Accept, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges"
};
var allowedHostsSet = /* @__PURE__ */ new Set([
  "comityofcognomen.site",
  "data.vidsrc.sh",
  "vidsrc.sh",
  "cloudorchestranova.com"
]);
function isAllowedVidsrcHost(hostname) {
  if (allowedHostsSet.has(hostname)) return true;
  if (hostname === "localhost" || hostname.startsWith("127.") || hostname.startsWith("10.") || hostname.startsWith("192.168.") || hostname.startsWith("172.16.") || hostname.startsWith("169.254.")) {
    return false;
  }
  return hostname.endsWith(".site") || hostname.endsWith(".space") || hostname.endsWith(".online") || hostname.endsWith(".top") || hostname.endsWith(".sh") || hostname.endsWith("cloudorchestranova.com") || hostname.endsWith("vidsrc.sh");
}
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var streamCache = /* @__PURE__ */ new Map();
var STREAM_CACHE_TTL = 5 * 60 * 1e3;
var tokenCache = /* @__PURE__ */ new Map();
async function getOriginToken(origin) {
  const cached = tokenCache.get(origin);
  if (cached && cached.expires > Date.now()) {
    return cached.token;
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetch(`${origin}/generate.php`, {
        signal: AbortSignal.timeout(15e3),
        headers: { "User-Agent": UA }
      });
      const text = (await resp.text()).trim();
      if (resp.ok && text.startsWith("eyJ")) {
        tokenCache.set(origin, {
          token: text,
          expires: Date.now() + 2 * 60 * 60 * 1e3
        });
        return text;
      }
      if (resp.status === 429 && cached?.token) {
        console.warn(`[vidsrc] 429 Too Many Requests em ${origin}/generate.php. Reutilizando token em cache.`);
        return cached.token;
      }
    } catch (err) {
      console.warn(`[vidsrc] Falha ao obter token de ${origin} (tentativa ${attempt}):`, err.message);
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  if (cached?.token) {
    return cached.token;
  }
  throw new Error(`Falha ao obter token de autoriza\xE7\xE3o de ${origin}`);
}
async function getRewrittenM3u8(tmdb, season, episode) {
  const cacheKey = `${tmdb}:${season}:${episode}`;
  const cached = streamCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.m3u8;
  const r1 = await fetch(`https://vidsrc.sh/vs_src.php?type=tv&id=${tmdb}&season=${season}&episode=${episode}`, { signal: AbortSignal.timeout(15e3), headers: { "User-Agent": UA, Referer: "https://vidsrc.sh/" } });
  const d1 = await r1.json();
  const cloudUrl = d1.src;
  const r2 = await fetch(cloudUrl, { signal: AbortSignal.timeout(15e3), headers: { "User-Agent": UA, Referer: "https://vidsrc.sh/" } });
  const h2 = await r2.text();
  const pm = h2.match(/"playerUrl":"([^"]+)"/);
  if (!pm) throw new Error("playerUrl not found");
  const playerUrl = "https://cloudorchestranova.com" + pm[1].replace(/\\u0026/g, "&");
  const r3 = await fetch(playerUrl, { signal: AbortSignal.timeout(15e3), headers: { "User-Agent": UA, Referer: cloudUrl } });
  const h3 = await r3.text();
  const sbm = h3.match(/"streamBase":"([^"]+)"/);
  if (!sbm) throw new Error("streamBase not found");
  const streamBase = sbm[1].replace(/\\u0026/g, "&");
  const streamApiUrl = `${streamBase}&season=${season}&episode=${episode}&stream_urls`;
  const r4 = await fetch(streamApiUrl, {
    signal: AbortSignal.timeout(15e3),
    headers: { "User-Agent": UA, Accept: "application/json" }
  });
  const d4 = await r4.json();
  if (!d4.data?.stream_urls || !d4.vs?.wasm_url) throw new Error("no stream_urls");
  const enc = Buffer.from(d4.data.stream_urls, "base64");
  const wasmResp = await fetch(d4.vs.wasm_url, { signal: AbortSignal.timeout(15e3), headers: { "User-Agent": UA } });
  const wasmBuf = await wasmResp.arrayBuffer();
  const mod = await WebAssembly.compile(wasmBuf);
  const inst = await WebAssembly.instantiate(mod, {});
  const ptr = inst.exports.alloc(enc.length);
  new Uint8Array(inst.exports.memory.buffer, ptr, enc.length).set(enc);
  const outLen = inst.exports.decrypt(ptr, enc.length);
  const txt = new TextDecoder().decode(
    new Uint8Array(inst.exports.memory.buffer, ptr + 12, outLen)
  );
  const urls = txt.split("\n").filter((s) => s.trim());
  if (!urls.length) throw new Error("no decrypted URLs");
  for (const u of urls) {
    try {
      allowedHostsSet.add(new URL(u).hostname);
    } catch {
    }
  }
  const origin = new URL(urls[0]).origin;
  const token = await getOriginToken(origin);
  const masterUrl = urls[0] + (urls[0].includes("?") ? "&" : "?") + "token=" + token;
  const r5 = await fetch(masterUrl, { signal: AbortSignal.timeout(15e3), headers: { "User-Agent": UA, Referer: "https://cloudorchestranova.com/" } });
  const masterM3u8 = await r5.text();
  const baseUrl = new URL(masterUrl);
  const rewritten = rewriteM3u8(masterM3u8, baseUrl.origin, token);
  streamCache.set(cacheKey, { m3u8: rewritten, expires: Date.now() + STREAM_CACHE_TTL });
  console.log(`[vidsrc] OK: tmdb=${tmdb} s${season}e${episode} \u2192 ${urls.length} URLs, token OK`);
  return rewritten;
}
function rewriteM3u8(m3u8Text, origin, token) {
  const lines = m3u8Text.split("\n");
  const result = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) {
      result.push(line);
      continue;
    }
    let fullUrl;
    if (line.startsWith("http")) {
      fullUrl = line;
    } else if (line.startsWith("/")) {
      fullUrl = origin + line;
    } else {
      fullUrl = origin + "/" + line;
    }
    if (!fullUrl.includes("token=") && token) {
      fullUrl += (fullUrl.includes("?") ? "&" : "?") + "token=" + token;
    }
    const proxyUrl = `/api/vidsrc-proxy?url=${encodeURIComponent(Buffer.from(fullUrl).toString("base64"))}`;
    result.push(proxyUrl);
  }
  return result.join("\n");
}
router3.get("/api/vidsrc-stream", async (req3, res) => {
  try {
    res.setHeader(CORS["Access-Control-Allow-Origin"], "*");
    const tmdb = req3.query.tmdb || "126027";
    const season = req3.query.season || "1";
    const episode = req3.query.episode || "1";
    console.log(`[vidsrc-stream] tmdb=${tmdb} s${season}e${episode}`);
    const m3u8 = await getRewrittenM3u8(tmdb, season, episode);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    return res.send(m3u8);
  } catch (err) {
    console.error("[vidsrc-stream] Error:", err.message);
    return res.status(502).json({ error: err.message });
  }
});
router3.get("/api/vidsrc-proxy", async (req3, res) => {
  try {
    const encodedUrl = req3.query.url;
    if (!encodedUrl) return res.status(400).json({ error: "url parameter required" });
    const targetUrl = Buffer.from(encodedUrl, "base64").toString("utf-8");
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return res.status(400).json({ error: "invalid url" });
    }
    if (!isAllowedVidsrcHost(parsed.hostname)) {
      console.warn(`[vidsrc-proxy] Host n\xE3o permitido: ${parsed.hostname}`);
      return res.status(403).json({ error: "host not allowed" });
    }
    const headers = {
      "User-Agent": UA,
      Referer: "https://cloudorchestranova.com/"
    };
    if (req3.headers.range) {
      headers["Range"] = req3.headers.range;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15e3);
    req3.on("close", () => controller.abort());
    const upstream = await fetch(targetUrl, { signal: controller.signal, headers });
    clearTimeout(timeoutId);
    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).json({ error: `upstream ${upstream.status}` });
    }
    const contentType = upstream.headers.get("content-type") || "";
    for (const [k, v] of Object.entries(CORS)) {
      res.setHeader(k, v);
    }
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }
    if (contentType.includes("mpegurl") || contentType.includes("m3u8") || targetUrl.includes(".m3u8")) {
      const text = await upstream.text();
      const origin = parsed.protocol + "//" + parsed.host;
      const token = parsed.searchParams.get("token") || "";
      const rewritten = rewriteM3u8(text, origin, token);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store");
      return res.send(rewritten);
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > 0 && buf[0] === 71) {
      res.setHeader("Content-Type", "video/mp2t");
    }
    return res.send(buf);
  } catch (err) {
    console.error("[vidsrc-proxy] Error:", err.message);
    return res.status(502).json({ error: err.message });
  }
});
router3.get("/api/vidsrc-player", async (req3, res) => {
  const tmdb = req3.query.tmdb || "126027";
  const season = req3.query.season || "1";
  const episode = req3.query.episode || "1";
  const streamUrl = `/api/vidsrc-stream?tmdb=${tmdb}&season=${season}&episode=${episode}`;
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="referrer" content="no-referrer">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:100%; height:100%; background:#000; overflow:hidden; }
  video { width:100%; height:100%; object-fit:contain; background:#000; outline:none; }
  #loader { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:#000; }
  .spinner { width:50px; height:50px; border:4px solid rgba(255,255,255,0.1); border-left-color:#E50914; border-radius:50%; animation:spin 1s linear infinite; }
  @keyframes spin { 100% { transform:rotate(360deg); } }
</style>
</head>
<body>
<div id="loader"><div class="spinner"></div></div>
<video id="v" playsinline></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
<script>
var video=document.getElementById('v'),loader=document.getElementById('loader');
function sendStatus(){
  if(!video)return;
  window.parent.postMessage({
    type:'WATCHPLAY_STATUS',
    data:{
      currentTime:video.currentTime||0,
      duration:video.duration||0,
      paused:video.paused,
      muted:video.muted,
      volume:video.volume,
      buffered:video.buffered&&video.buffered.length>0?(video.buffered.end(video.buffered.length-1)/Math.max(video.duration||1,1))*100:0,
      readyState:video.readyState
    }
  },'*');
}
function initHls(url){
  loader.style.display='none';
  video.addEventListener('play',sendStatus);
  video.addEventListener('pause',sendStatus);
  video.addEventListener('timeupdate',sendStatus);
  video.addEventListener('durationchange',sendStatus);
  video.addEventListener('volumechange',sendStatus);
  video.addEventListener('progress',sendStatus);
  video.addEventListener('playing',sendStatus);
  video.addEventListener('waiting',sendStatus);
  video.addEventListener('ended',function(){window.parent.postMessage({type:'WATCHPLAY_VIDEO_ENDED'},'*');});
  video.addEventListener('error',function(){window.parent.postMessage({type:'WATCHPLAY_ERROR',reason:'video_error'},'*');});
  setInterval(sendStatus,1000);

  if(Hls.isSupported()){
    var hls=new Hls({
      maxBufferLength:60,
      maxMaxBufferLength:120,
      maxBufferHole:0.5,
      maxSeekHole:2,
      nudgeOffset:0.2,
      backBufferLength:90,
      enableWorker:true,
      lowLatencyMode:false
    });
    var seekPending=false;
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED,function(){
      video.play().then(function(){
        window.parent.postMessage({type:'WATCHPLAY_AUTOPLAY_MUTED'},'*');
      }).catch(function(){
        // Autoplay blocked \u2014 skin shows play button
      });
    });
    hls.on(Hls.Events.ERROR,function(e,data){
      if(data.fatal){
        if(data.type===Hls.ErrorTypes.NETWORK_ERROR){hls.startLoad();}
        else if(data.type===Hls.ErrorTypes.MEDIA_ERROR){hls.recoverMediaError();}
        else{window.parent.postMessage({type:'WATCHPLAY_ERROR',reason:'hls_fatal:'+data.type},'*');}
      }
    });
    // Fix audio/video desync ap\xF3s seek
    hls.on(Hls.Events.BUFFER_APPENDED,function(){
      if(seekPending){
        seekPending=false;
        try{
          // Sincroniza audio com video ap\xF3s fragmento carregado
          if(video.audioTracks && video.audioTracks.length>0){
            video.currentTime=video.currentTime+0.001; // micro-nudge
          }
        }catch(e){}
      }
    });
  }else if(video.canPlayType('application/vnd.apple.mpegurl')){
    video.src=url;
    video.addEventListener('loadedmetadata',function(){
      video.play().then(function(){
        window.parent.postMessage({type:'WATCHPLAY_AUTOPLAY_MUTED'},'*');
      }).catch(function(){});
    });
  }
}
initHls('${streamUrl}');

// Receber comandos da NetflixPlayerSkin
window.addEventListener('message',function(e){
                  if (e.data && e.data.type === 'SET_SUBTITLE_URL') {
                      var vid = window.artInstance ? window.artInstance.video : (typeof art !== 'undefined' && art.video ? art.video : document.querySelector('video'));
                      if (!vid) vid = document.querySelector('video');
                      if (vid) {
                          var oldTrack = document.getElementById('playinfinity-subtitle');
                          if (oldTrack) { oldTrack.remove(); }
                          if (e.data.url) {
                              var track = document.createElement('track');
                              track.id = 'playinfinity-subtitle';
                              track.kind = 'captions';
                              track.label = e.data.label || 'Portugu\xEAs (Brasil)';
                              track.srclang = 'pt-BR';
                              track.src = e.data.url;
                              track.default = true;
                              vid.appendChild(track);
                              // Espera carregar para for\xE7ar o modo showing
                              if (e.data.show !== false) { track.addEventListener('load', function() { this.mode = 'showing'; }); }
                          }
                      }
                      return;
                  }
                  if (e.data && e.data.type === 'SHOW_SUBTITLE') {
                      var tr = document.getElementById('playinfinity-subtitle');
                      if (tr) {
                          tr.mode = e.data.show ? 'showing' : 'hidden';
                      }
                      return;
                  }

  if(!video)return;
  var cmd=e.data;
  if(!cmd||!cmd.type)return;
  try{
    if(cmd.type==='PLAY'||cmd.type==='play'){video.play();}
    else if(cmd.type==='PAUSE'||cmd.type==='pause'){video.pause();}
    else if(cmd.type==='SEEK'&&typeof cmd.targetTime==='number'){seekPending=true;video.currentTime=cmd.targetTime;if(typeof hls!=='undefined'&&hls){hls.startLoad();}}
    else if(cmd.type==='seek'&&typeof cmd.time==='number'){seekPending=true;video.currentTime=cmd.time;if(typeof hls!=='undefined'&&hls){hls.startLoad();}}
    else if(cmd.type==='SET_VOLUME'&&typeof cmd.volume==='number'){video.volume=cmd.volume;video.muted=(cmd.volume===0);}
    else if(cmd.type==='setMuted'){video.muted=!!cmd.muted;}
    else if(cmd.type==='SKIP_INTRO'&&typeof cmd.seconds==='number'){video.currentTime+=cmd.seconds;}
    sendStatus();
  }catch(err){}
});
</script>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.send(html);
});
var vidsrcSeasonCache = /* @__PURE__ */ new Map();
var VIDSRC_SEASON_TTL = 30 * 60 * 1e3;
async function checkVidsrcSeason(tmdb, season) {
  const key = `${tmdb}:${season}`;
  const cached = vidsrcSeasonCache.get(key);
  if (cached && Date.now() - cached.timestamp < VIDSRC_SEASON_TTL) {
    return cached.ok;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4e3);
    const r1 = await fetch(
      `https://vidsrc.sh/vs_src.php?type=tv&id=${tmdb}&season=${season}&episode=1`,
      {
        headers: { "User-Agent": UA, Referer: "https://vidsrc.sh/" },
        signal: controller.signal
      }
    );
    const d1 = await r1.json();
    if (!d1.src) {
      clearTimeout(timeout);
      vidsrcSeasonCache.set(key, { ok: false, timestamp: Date.now() });
      return false;
    }
    const r2 = await fetch(d1.src, {
      headers: { "User-Agent": UA, Referer: "https://vidsrc.sh/" },
      signal: controller.signal
    });
    const h2 = await r2.text();
    const pm = h2.match(/"playerUrl":"([^"]+)"/);
    if (!pm) {
      clearTimeout(timeout);
      vidsrcSeasonCache.set(key, { ok: false, timestamp: Date.now() });
      return false;
    }
    const playerUrl = "https://cloudorchestranova.com" + pm[1].replace(/\\u0026/g, "&");
    const r3 = await fetch(playerUrl, {
      headers: { "User-Agent": UA, Referer: d1.src },
      signal: controller.signal
    });
    const h3 = await r3.text();
    const sbm = h3.match(/"streamBase":"([^"]+)"/);
    if (!sbm) {
      clearTimeout(timeout);
      vidsrcSeasonCache.set(key, { ok: false, timestamp: Date.now() });
      return false;
    }
    const streamBase = sbm[1].replace(/\\u0026/g, "&");
    const streamApiUrl = `${streamBase}&season=${season}&episode=1&stream_urls`;
    const r4 = await fetch(streamApiUrl, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const d4 = await r4.json();
    const hasStreams = Boolean(d4.data?.stream_urls);
    vidsrcSeasonCache.set(key, { ok: hasStreams, timestamp: Date.now() });
    return hasStreams;
  } catch {
    return false;
  }
}
var vidsrcRoutes_default = router3;

// server/routes/encontreiLookup.ts
var import_express5 = require("express");
var import_fs3 = __toESM(require("fs"), 1);
var import_path3 = __toESM(require("path"), 1);
var router4 = (0, import_express5.Router)();
var vipSeasonCache = /* @__PURE__ */ new Map();
var vipMovieCache = /* @__PURE__ */ new Map();
var watchPlayerMovieCache = /* @__PURE__ */ new Map();
var VIP_SEASON_TTL = 30 * 60 * 1e3;
async function checkVipSeason(tmdb, season) {
  const key = `${tmdb}:${season}`;
  const cached = vipSeasonCache.get(key);
  if (cached && Date.now() - cached.timestamp < (cached.ok ? VIP_SEASON_TTL : 15e3)) {
    return cached.ok;
  }
  try {
    const port = process.env.PORT || 3e3;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6e3);
    const res = await fetch(`http://localhost:${port}/api/myembed-stream?id=${tmdb}&type=tv&s=${season}&e=1`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      vipSeasonCache.set(key, { ok: false, timestamp: Date.now() });
      return false;
    }
    const html = await res.text();
    const ok = html.includes("var hlsUrl =") || html.includes("embedplayer") || html.includes("master.m3u8");
    vipSeasonCache.set(key, { ok, timestamp: Date.now() });
    return ok;
  } catch {
    vipSeasonCache.set(key, { ok: false, timestamp: Date.now() });
    return false;
  }
}
async function checkVipMovie(tmdb) {
  const key = String(tmdb);
  const cached = vipMovieCache.get(key);
  if (cached && Date.now() - cached.timestamp < (cached.ok ? VIP_SEASON_TTL : 15e3)) {
    return cached.ok;
  }
  try {
    const port = process.env.PORT || 3e3;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`http://localhost:${port}/api/myembed-stream?id=${tmdb}&type=movie`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      vipMovieCache.set(key, { ok: false, timestamp: Date.now() });
      return false;
    }
    const html = await res.text();
    const ok = html.includes("var hlsUrl =") || html.includes("embedplayer") || html.includes("master.m3u8");
    vipMovieCache.set(key, { ok, timestamp: Date.now() });
    return ok;
  } catch {
    vipMovieCache.set(key, { ok: false, timestamp: Date.now() });
    return false;
  }
}
async function checkWatchPlayerMovie(tmdb) {
  const key = String(tmdb);
  const cached = watchPlayerMovieCache.get(key);
  if (cached && Date.now() - cached.timestamp < VIP_SEASON_TTL) {
    return cached.ok;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://v1.watchplay.shop/movie/${tmdb}`, {
      headers: {
        "Referer": "https://v1.watchplay.shop/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: controller.signal,
      redirect: "follow"
    });
    clearTimeout(timeout);
    if (res.status === 200) {
      const text = await res.text();
      const lower = text.toLowerCase();
      const isBad = lower.includes("404") || lower.includes("login-card") || lower.includes("login-page") || lower.includes("n\xE3o encontrado") || lower.includes("filme n\xE3o encontrado") || text.length < 300;
      const ok = !isBad;
      watchPlayerMovieCache.set(key, { ok, timestamp: Date.now() });
      return ok;
    }
    watchPlayerMovieCache.set(key, { ok: false, timestamp: Date.now() });
    return false;
  } catch {
    return false;
  }
}
var _tmdbToSerieIdMap = /* @__PURE__ */ new Map();
var _tmdbToVizerMovieIdMap = /* @__PURE__ */ new Map();
var _vizerMovieIdsLoaded = false;
var _vizerMovieIdsMtime = 0;
function loadVizerMovieIds() {
  const possiblePaths = [
    import_path3.default.join(process.cwd(), "public", "data", "vizer-movie-ids.json"),
    import_path3.default.join(process.cwd(), "data", "vizer-movie-ids.json")
  ];
  for (const p of possiblePaths) {
    if (import_fs3.default.existsSync(p)) {
      try {
        const stat = import_fs3.default.statSync(p);
        const mtime = stat.mtimeMs;
        if (_vizerMovieIdsLoaded && mtime <= _vizerMovieIdsMtime) return;
        const raw = import_fs3.default.readFileSync(p, "utf-8");
        const map = JSON.parse(raw);
        _tmdbToVizerMovieIdMap.clear();
        for (const [k, v] of Object.entries(map)) {
          const tmdb = parseInt(k, 10);
          const vid = parseInt(String(v), 10);
          if (!isNaN(tmdb) && !isNaN(vid)) {
            _tmdbToVizerMovieIdMap.set(tmdb, vid);
          }
        }
        _vizerMovieIdsLoaded = true;
        _vizerMovieIdsMtime = mtime;
        console.log(`[vizer-movie-ids] ${_tmdbToVizerMovieIdMap.size} mapeamentos TMDB\u2192vizer_movie_id carregados`);
        return;
      } catch (err) {
        console.warn("[vizer-movie-ids] Erro ao carregar:", err);
        return;
      }
    }
  }
}
var vizerSeasonCache = /* @__PURE__ */ new Map();
var VIZER_SEASON_TTL = 30 * 60 * 1e3;
async function checkVizerSeason(tmdb, season) {
  const numericTmdb = typeof tmdb === "number" ? tmdb : parseInt(String(tmdb), 10);
  const numericSeason = typeof season === "number" ? season : parseInt(String(season), 10);
  if (!numericTmdb || isNaN(numericTmdb)) return false;
  loadCatalogs();
  const serieId = _tmdbToSerieIdMap.get(numericTmdb);
  if (!serieId) return false;
  const key = `${numericTmdb}:${numericSeason}`;
  const cached = vizerSeasonCache.get(key);
  if (cached && Date.now() - cached.timestamp < VIZER_SEASON_TTL) {
    return cached.ok;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3e3);
    const url = `https://www.vizer.website/index.php?app=videobox&module=video&controller=view&do=episodesList&id=${serieId}&season=${numericSeason}&audio=Dublado`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json"
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      vizerSeasonCache.set(key, { ok: false, timestamp: Date.now() });
      return false;
    }
    const data = await res.json();
    const ok = Array.isArray(data.episodes) && data.episodes.length > 0;
    vizerSeasonCache.set(key, { ok, timestamp: Date.now() });
    return ok;
  } catch {
    return false;
  }
}
async function resolveVizerEpisode(tmdbId, season, episode) {
  loadCatalogs();
  const serieId = _tmdbToSerieIdMap.get(tmdbId);
  if (!serieId) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4e3);
    const listUrl = `https://www.vizer.website/index.php?app=videobox&module=video&controller=view&do=episodesList&id=${serieId}&season=${season}&audio=Dublado`;
    const res = await fetch(listUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json"
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const eps = data.episodes || [];
    if (!eps.length) return null;
    const target = eps.find((e) => parseInt(e.number, 10) === episode) || eps[episode - 1];
    if (!target) return null;
    const vidMatch = target.url.match(/-(\d+)\/?$/);
    if (!vidMatch) return null;
    const vid = vidMatch[1];
    const pController = new AbortController();
    const pTimeout = setTimeout(() => pController.abort(), 3500);
    const pUrl = `https://www.vizer.website/index.php?app=videobox&module=video&controller=view&do=playerData&id=${vid}`;
    const pRes = await fetch(pUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json"
      },
      signal: pController.signal
    });
    clearTimeout(pTimeout);
    if (!pRes.ok) return null;
    const pData = await pRes.json();
    const sStr = ((pData.servers_dub || "") + "&" + (pData.servers_leg || "")).replace(/&amp;/g, "&");
    let mixdrop = null;
    let streamtape = null;
    let byse = null;
    let doodstream = null;
    for (const match of sStr.matchAll(/([a-z]+)=([^&]+)/g)) {
      const [, k, v] = match;
      if (k === "mixdrop") mixdrop = v;
      else if (k === "streamtape") streamtape = v;
      else if (k === "byse") byse = v;
      else if (k === "doodstream") doodstream = v;
    }
    if (!mixdrop) return null;
    const epObj = {
      episode_id: parseInt(vid, 10),
      serie_id: serieId,
      season,
      episode,
      tmdb_id: tmdbId,
      audio: pData.current_audio || "Dublado",
      servers: { mixdrop, streamtape, byse, doodstream },
      source_url: target.url,
      _fetchedAt: Date.now()
    };
    const key = `${tmdbId}:${season}:${episode}`;
    _encontreiEpisodeIndex.set(key, epObj);
    const curSeasons = _encontreiSeriesSeasonsIndex.get(tmdbId) || [];
    if (!curSeasons.includes(season)) {
      _encontreiSeriesSeasonsIndex.set(tmdbId, [...curSeasons, season].sort((a, b) => a - b));
    }
    return {
      mixdrop,
      streamtape,
      byse,
      doodstream,
      audio: epObj.audio,
      server_name: "MixDrop",
      season,
      episode,
      source: "vizer-live"
    };
  } catch {
    return null;
  }
}
async function resolveVizerMovie(tmdbId) {
  loadVizerMovieIds();
  const vizerMovieId = _tmdbToVizerMovieIdMap.get(tmdbId);
  if (!vizerMovieId) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const pUrl = `https://www.vizer.website/index.php?app=videobox&module=video&controller=view&do=playerData&id=${vizerMovieId}`;
    const pRes = await fetch(pUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json",
        "Referer": `https://www.vizer.website/filmes/online/x-${vizerMovieId}/`
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!pRes.ok) return null;
    const pData = await pRes.json();
    const sStr = ((pData.servers_dub || "") + "&" + (pData.servers_leg || "")).replace(/&amp;/g, "&");
    let mixdrop = null;
    let streamtape = null;
    let byse = null;
    let doodstream = null;
    for (const match of sStr.matchAll(/([a-z]+)=([^&]+)/g)) {
      const [, k, v] = match;
      if (k === "mixdrop") mixdrop = v;
      else if (k === "streamtape") streamtape = v;
      else if (k === "byse") byse = v;
      else if (k === "doodstream") doodstream = v;
    }
    if (!mixdrop) return null;
    const movieObj = {
      video_id: vizerMovieId,
      tmdb_id: tmdbId,
      audio: pData.current_audio || "Dublado",
      servers: { mixdrop, streamtape, byse, doodstream },
      _fetchedAt: Date.now()
    };
    _vizerMovieIndex.set(tmdbId, movieObj);
    return {
      mixdrop,
      streamtape,
      byse,
      doodstream,
      audio: movieObj.audio,
      server_name: "MixDrop",
      source: "vizer-live"
    };
  } catch {
    return null;
  }
}
var _encontreiCatalog = null;
var _encontreiMovieIndex = /* @__PURE__ */ new Map();
var _encontreiEpisodeIndex = /* @__PURE__ */ new Map();
var _encontreiSeriesSeasonsIndex = /* @__PURE__ */ new Map();
var _encontreiLastMtime = 0;
var _vizerCatalog = null;
var _vizerMovieIndex = /* @__PURE__ */ new Map();
var _vizerEpisodeIndex = /* @__PURE__ */ new Map();
var _vizerSeriesSeasonsIndex = /* @__PURE__ */ new Map();
var _vizerLastMtime = 0;
function tryLoadCatalog(filename, catalogRef, movieIndexRef, episodeIndexRef, seasonsIndexRef, mtimeRef, logName) {
  const possiblePaths = [
    import_path3.default.join(process.cwd(), "public", "data", filename),
    import_path3.default.join(process.cwd(), "data", filename)
  ];
  let raw = "";
  let currentMtime = 0;
  for (const p of possiblePaths) {
    if (import_fs3.default.existsSync(p)) {
      try {
        const stat = import_fs3.default.statSync(p);
        currentMtime = stat.mtimeMs;
        if (catalogRef.value && (movieIndexRef.size > 0 || episodeIndexRef.size > 0) && currentMtime <= mtimeRef.value) {
          return true;
        }
        raw = import_fs3.default.readFileSync(p, "utf-8");
        break;
      } catch (_) {
      }
    }
  }
  if (!raw) {
    return false;
  }
  try {
    catalogRef.value = JSON.parse(raw);
    mtimeRef.value = currentMtime;
    movieIndexRef.clear();
    episodeIndexRef.clear();
    seasonsIndexRef.clear();
    for (const movie of catalogRef.value.movies || []) {
      if (movie.tmdb_id) {
        if (!movieIndexRef.has(movie.tmdb_id)) {
          movieIndexRef.set(movie.tmdb_id, movie);
        }
      }
    }
    const seriesSeasonsMap = /* @__PURE__ */ new Map();
    for (const ep of catalogRef.value.episodes || []) {
      if (ep.tmdb_id && ep.serie_id && !_tmdbToSerieIdMap.has(ep.tmdb_id)) {
        _tmdbToSerieIdMap.set(ep.tmdb_id, ep.serie_id);
      }
      if (ep.tmdb_id && ep.season && ep.episode) {
        const key = `${ep.tmdb_id}:${ep.season}:${ep.episode}`;
        if (!episodeIndexRef.has(key)) {
          episodeIndexRef.set(key, ep);
        }
        if (!seriesSeasonsMap.has(ep.tmdb_id)) {
          seriesSeasonsMap.set(ep.tmdb_id, /* @__PURE__ */ new Set());
        }
        seriesSeasonsMap.get(ep.tmdb_id).add(ep.season);
      }
    }
    for (const [id, seasonsSet] of seriesSeasonsMap.entries()) {
      seasonsIndexRef.set(id, Array.from(seasonsSet).sort((a, b) => a - b));
    }
    _verifiedSeasonsCache.clear();
    console.log(`[${logName}] Cat\xE1logo carregado: ${movieIndexRef.size} filmes, ${episodeIndexRef.size} epis\xF3dios, ${seasonsIndexRef.size} s\xE9ries (cache de temporadas invalidado)`);
    return true;
  } catch (err) {
    console.warn(`[${logName}] Erro ao processar:`, err);
    return false;
  }
}
function loadCatalogs() {
  tryLoadCatalog(
    "vizer-catalog.json",
    { get value() {
      return _vizerCatalog;
    }, set value(v) {
      _vizerCatalog = v;
    } },
    _vizerMovieIndex,
    _vizerEpisodeIndex,
    _vizerSeriesSeasonsIndex,
    { get value() {
      return _vizerLastMtime;
    }, set value(v) {
      _vizerLastMtime = v;
    } },
    "vizer-lookup"
  );
  tryLoadCatalog(
    "encontrei-catalog.json",
    { get value() {
      return _encontreiCatalog;
    }, set value(v) {
      _encontreiCatalog = v;
    } },
    _encontreiMovieIndex,
    _encontreiEpisodeIndex,
    _encontreiSeriesSeasonsIndex,
    { get value() {
      return _encontreiLastMtime;
    }, set value(v) {
      _encontreiLastMtime = v;
    } },
    "encontrei-lookup"
  );
}
function getEncontreiSeasonEpisodes(tmdbId, season) {
  loadCatalogs();
  const prefix = `${tmdbId}:${season}:`;
  const eps = [];
  for (const [key, ep] of _encontreiEpisodeIndex) {
    if (key.startsWith(prefix) && typeof ep.episode === "number") {
      eps.push(ep.episode);
    }
  }
  return eps;
}
var _verifiedSeasonsCache = /* @__PURE__ */ new Map();
var VERIFIED_SEASONS_CACHE_TTL = 5 * 60 * 1e3;
router4.get("/api/series-seasons-available", async (req3, res) => {
  try {
    const forceRefresh = req3.query.force_refresh === "true" || req3.query.force_refresh === "1";
    if (forceRefresh) {
      const keysToDelete = [];
      for (const key of _verifiedSeasonsCache.keys()) {
        if (key.startsWith(`${parseInt(req3.query.tmdb_id, 10)}:probe:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((k) => _verifiedSeasonsCache.delete(k));
    }
    loadCatalogs();
    const tmdbId = parseInt(req3.query.tmdb_id, 10);
    if (!tmdbId) {
      return res.status(400).json({ error: "tmdb_id \xE9 obrigat\xF3rio" });
    }
    let candidateSeasons = [];
    if (req3.query.candidate_seasons) {
      candidateSeasons = String(req3.query.candidate_seasons).split(",").map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
    }
    if (candidateSeasons.length === 0) {
      candidateSeasons = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    }
    const vizerSeasons = _vizerSeriesSeasonsIndex.get(tmdbId) || [];
    const encontreiSeasons = _encontreiSeriesSeasonsIndex.get(tmdbId) || [];
    const catalogSeasons = Array.from(
      /* @__PURE__ */ new Set([...vizerSeasons, ...encontreiSeasons])
    ).sort((a, b) => a - b);
    const seasonsToProbe = candidateSeasons.filter(
      (s) => !catalogSeasons.includes(s)
    );
    const probeCacheKey = `${tmdbId}:probe:${seasonsToProbe.join(",")}`;
    let probedSeasons = [];
    let probeCached = false;
    const cached = _verifiedSeasonsCache.get(probeCacheKey);
    if (cached && Date.now() - cached.timestamp < VERIFIED_SEASONS_CACHE_TTL) {
      probedSeasons = cached.seasons;
      probeCached = true;
    }
    if (!probeCached && seasonsToProbe.length > 0) {
      const probeSeason = async (season) => {
        try {
          const vipOk = await checkVipSeason(tmdbId, season);
          if (vipOk) return true;
        } catch {
        }
        try {
          const wpUrl = `https://v1.watchplay.shop/tvshow/${tmdbId}/${season}/1`;
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 2500);
          const wpRes = await fetch(wpUrl, {
            headers: {
              "Referer": "https://v1.watchplay.shop/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            signal: controller.signal
          });
          clearTimeout(t);
          if (wpRes.status === 200) {
            const text = await wpRes.text();
            const lower = text.toLowerCase();
            const isBad = lower.includes("404") || lower.includes("login-card") || lower.includes("login-page") || lower.includes("n\xE3o encontrado") || lower.includes("s\xE9rie n\xE3o encontrada") || text.length < 300;
            if (!isBad) return true;
          }
        } catch {
        }
        try {
          const vizerOk = await checkVizerSeason(tmdbId, season);
          if (vizerOk) return true;
        } catch {
        }
        try {
          const ss = String(season).padStart(3, "0");
          const streamId = `${tmdbId}${ss}001`;
          const nixUrl = `https://nixplay.lat/series/testelogado-vods/GwXanZ3Dj/${streamId}.mp4`;
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 2e3);
          const nixRes = await fetch(nixUrl, {
            headers: { Range: "bytes=0-100" },
            signal: controller.signal
          });
          clearTimeout(t);
          if (nixRes.status === 206 && nixRes.headers.get("content-type") === "video/mp4") {
            return true;
          }
        } catch {
        }
        try {
          const vsOk = await checkVidsrcSeason(tmdbId, season);
          if (vsOk) return true;
        } catch {
        }
        return false;
      };
      const probes = await Promise.all(
        seasonsToProbe.map(async (s) => ({
          season: s,
          available: await probeSeason(s)
        }))
      );
      probedSeasons = probes.filter((p) => p.available).map((p) => p.season);
      _verifiedSeasonsCache.set(probeCacheKey, {
        timestamp: Date.now(),
        seasons: probedSeasons
      });
    }
    const verified = Array.from(
      /* @__PURE__ */ new Set([...catalogSeasons, ...probedSeasons])
    ).sort((a, b) => a - b);
    const finalSeasons = verified.length > 0 ? verified : [1];
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.json({
      success: true,
      hasCatalog: catalogSeasons.length > 0 || probedSeasons.length > 0,
      tmdbId,
      seasons: finalSeasons,
      // Debug info (opcional — pode ajudar a diagnosticar futuros problemas)
      _debug: {
        catalogSeasons,
        probedSeasons,
        probeCached,
        seasonsToProbe
      }
    });
  } catch (err) {
    console.error("[series-seasons-available] Erro:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});
var _playableProbeCache = /* @__PURE__ */ new Map();
var PLAYABLE_PROBE_TTL = 30 * 60 * 1e3;
router4.all("/api/check-playable-batch", async (req3, res) => {
  try {
    loadCatalogs();
    let items = [];
    if (req3.method === "POST" && req3.body) {
      if (Array.isArray(req3.body.items)) {
        items = req3.body.items.map((i) => ({
          id: Number(i.id || i),
          type: i.type ? i.type === "series" ? "tv" : i.type : void 0
        })).filter((i) => Boolean(i.id));
      } else if (Array.isArray(req3.body.ids)) {
        items = req3.body.ids.map(Number).filter(Boolean).map((id) => ({ id }));
      }
    } else if (req3.query.ids) {
      const rawIds = String(req3.query.ids).split(",").map(Number).filter(Boolean);
      items = rawIds.map((id) => ({ id }));
    }
    const playableMovieIds = [];
    const playableSeriesIds = [];
    const unverifiedItems = [];
    const now = Date.now();
    for (const item of items) {
      const id = item.id;
      let found = false;
      if (_vizerMovieIndex.has(id) || _encontreiMovieIndex.has(id)) {
        playableMovieIds.push(id);
        found = true;
      }
      if (_vizerSeriesSeasonsIndex.has(id) || _encontreiSeriesSeasonsIndex.has(id)) {
        playableSeriesIds.push(id);
        found = true;
      }
      if (found) continue;
      const cached = _playableProbeCache.get(id);
      if (cached && now - cached.timestamp < PLAYABLE_PROBE_TTL) {
        if (cached.playable) {
          if (cached.type === "movie") playableMovieIds.push(id);
          else playableSeriesIds.push(id);
        }
        continue;
      }
      unverifiedItems.push(item);
    }
    const itemsToProbe = unverifiedItems.slice(0, 15);
    if (itemsToProbe.length > 0) {
      await Promise.all(
        itemsToProbe.map(async (item) => {
          const id = item.id;
          const isExplicitMovie = item.type === "movie";
          const isExplicitTv = item.type === "tv" || item.type === "series";
          let isPlayable = false;
          let verifiedType = isExplicitTv ? "tv" : "movie";
          if (isExplicitTv) {
            const vipOk = await checkVipSeason(id, 1);
            if (vipOk) {
              isPlayable = true;
              verifiedType = "tv";
            }
          } else if (isExplicitMovie) {
            const vipOk = await checkVipMovie(id);
            if (vipOk) {
              isPlayable = true;
              verifiedType = "movie";
            } else {
              const wpOk = await checkWatchPlayerMovie(id);
              if (wpOk) {
                isPlayable = true;
                verifiedType = "movie";
              }
            }
          } else {
            const vipTv = await checkVipSeason(id, 1);
            if (vipTv) {
              isPlayable = true;
              verifiedType = "tv";
            } else {
              const vipMovie = await checkVipMovie(id);
              if (vipMovie) {
                isPlayable = true;
                verifiedType = "movie";
              } else {
                const wpMovie = await checkWatchPlayerMovie(id);
                if (wpMovie) {
                  isPlayable = true;
                  verifiedType = "movie";
                }
              }
            }
          }
          _playableProbeCache.set(id, {
            playable: isPlayable,
            type: verifiedType,
            timestamp: now
          });
          if (isPlayable) {
            if (verifiedType === "movie") playableMovieIds.push(id);
            else playableSeriesIds.push(id);
          }
        })
      );
    }
    res.setHeader("Cache-Control", "public, max-age=1800");
    return res.json({
      success: true,
      playableMovieIds: [...new Set(playableMovieIds)],
      playableSeriesIds: [...new Set(playableSeriesIds)],
      playableIds: [.../* @__PURE__ */ new Set([...playableMovieIds, ...playableSeriesIds])]
    });
  } catch (err) {
    console.error("[check-playable-batch] Erro:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});
router4.get("/api/encontrei-lookup", async (req3, res) => {
  try {
    loadCatalogs();
    const tmdbId = parseInt(req3.query.tmdb_id, 10);
    const type = req3.query.type || "movie";
    const season = parseInt(req3.query.season, 10) || 1;
    const episode = parseInt(req3.query.episode, 10) || 1;
    if (!tmdbId) {
      return res.status(400).json({ error: "tmdb_id \xE9 obrigat\xF3rio" });
    }
    let result = null;
    if (type === "tv" || type === "series") {
      const key = `${tmdbId}:${season}:${episode}`;
      const VIZER_ON_DEMAND_TTL = 24 * 60 * 60 * 1e3;
      const now = Date.now();
      let vizerEp = _vizerEpisodeIndex.get(key);
      if (vizerEp && vizerEp._fetchedAt && now - vizerEp._fetchedAt > VIZER_ON_DEMAND_TTL) {
        _vizerEpisodeIndex.delete(key);
        vizerEp = void 0;
      }
      let encontreiEp = _encontreiEpisodeIndex.get(key);
      if (encontreiEp && encontreiEp._fetchedAt && now - encontreiEp._fetchedAt > VIZER_ON_DEMAND_TTL) {
        _encontreiEpisodeIndex.delete(key);
        encontreiEp = void 0;
      }
      let bestEp = null;
      let bestSource = "";
      if (vizerEp && vizerEp.servers?.mixdrop && encontreiEp && encontreiEp.servers?.mixdrop) {
        if (vizerEp.audio !== "Dublado" && encontreiEp.audio === "Dublado") {
          bestEp = encontreiEp;
          bestSource = "encontrei";
        } else {
          bestEp = vizerEp;
          bestSource = "vizer";
        }
      } else if (vizerEp && vizerEp.servers?.mixdrop) {
        bestEp = vizerEp;
        bestSource = "vizer";
      } else if (encontreiEp && encontreiEp.servers?.mixdrop) {
        bestEp = encontreiEp;
        bestSource = "encontrei";
      }
      if (bestEp) {
        const mixdrop_encontrei = encontreiEp?.servers?.mixdrop || null;
        const mixdrop_vizer = vizerEp?.servers?.mixdrop || null;
        result = {
          mixdrop: bestEp.servers.mixdrop,
          mixdrop_encontrei,
          mixdrop_vizer,
          streamtape: bestEp.servers.streamtape || null,
          byse: bestEp.servers.byse || null,
          doodstream: bestEp.servers.doodstream || null,
          audio: bestEp.audio || "Dublado",
          server_name: "MixDrop",
          season: bestEp.season,
          episode: bestEp.episode,
          source: bestSource
        };
      } else {
        const live = await resolveVizerEpisode(tmdbId, season, episode);
        if (live) {
          result = live;
        }
      }
    } else {
      const VIZER_ON_DEMAND_TTL = 24 * 60 * 60 * 1e3;
      const now = Date.now();
      let vizerMovie = _vizerMovieIndex.get(tmdbId);
      if (vizerMovie && vizerMovie._fetchedAt && now - vizerMovie._fetchedAt > VIZER_ON_DEMAND_TTL) {
        _vizerMovieIndex.delete(tmdbId);
        vizerMovie = void 0;
      }
      let encontreiMovie = _encontreiMovieIndex.get(tmdbId);
      if (encontreiMovie && encontreiMovie._fetchedAt && now - encontreiMovie._fetchedAt > VIZER_ON_DEMAND_TTL) {
        _encontreiMovieIndex.delete(tmdbId);
        encontreiMovie = void 0;
      }
      let bestMovie = null;
      let bestSource = "";
      if (vizerMovie && vizerMovie.servers?.mixdrop && encontreiMovie && encontreiMovie.servers?.mixdrop) {
        if (vizerMovie.audio !== "Dublado" && encontreiMovie.audio === "Dublado") {
          bestMovie = encontreiMovie;
          bestSource = "encontrei";
        } else {
          bestMovie = vizerMovie;
          bestSource = "vizer";
        }
      } else if (vizerMovie && vizerMovie.servers?.mixdrop) {
        bestMovie = vizerMovie;
        bestSource = "vizer";
      } else if (encontreiMovie && encontreiMovie.servers?.mixdrop) {
        bestMovie = encontreiMovie;
        bestSource = "encontrei";
      }
      if (bestMovie) {
        const mixdrop_encontrei = encontreiMovie?.servers?.mixdrop || null;
        const mixdrop_vizer = vizerMovie?.servers?.mixdrop || null;
        result = {
          mixdrop: bestMovie.servers.mixdrop,
          mixdrop_encontrei,
          mixdrop_vizer,
          streamtape: bestMovie.servers.streamtape || null,
          byse: bestMovie.servers.byse || null,
          doodstream: bestMovie.servers.doodstream || null,
          audio: bestMovie.audio || "Dublado",
          server_name: "MixDrop",
          source: bestSource
        };
      } else {
        const live = await resolveVizerMovie(tmdbId);
        if (live) {
          result = live;
        }
      }
    }
    if (!result) {
      return res.status(200).json({ error: "N\xE3o encontrado nos cat\xE1logos (vizer + encontrei)", tmdb_id: tmdbId });
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json(result);
  } catch (err) {
    console.error("[encontrei-lookup] Erro:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});
router4.get("/api/downloads-catalog", (req3, res) => {
  try {
    loadCatalogs();
    const type = req3.query.type || "all";
    const limit = Math.min(Math.max(parseInt(req3.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req3.query.offset, 10) || 0, 0);
    const movieMap = /* @__PURE__ */ new Map();
    if (type === "all" || type === "movie") {
      if (_vizerCatalog) {
        for (const m of _vizerCatalog.movies || []) {
          if (m.tmdb_id && m.servers?.mixdrop && !movieMap.has(m.tmdb_id)) {
            movieMap.set(m.tmdb_id, {
              tmdbId: m.tmdb_id,
              type: "movie",
              mixdrop: m.servers.mixdrop,
              audio: m.audio || "Dublado"
            });
          }
        }
      }
      if (_encontreiCatalog) {
        for (const m of _encontreiCatalog.movies || []) {
          if (m.tmdb_id && m.servers?.mixdrop && !movieMap.has(m.tmdb_id)) {
            movieMap.set(m.tmdb_id, {
              tmdbId: m.tmdb_id,
              type: "movie",
              mixdrop: m.servers.mixdrop,
              audio: m.audio || "Dublado"
            });
          }
        }
      }
    }
    const seriesMap = /* @__PURE__ */ new Map();
    if (type === "all" || type === "tv" || type === "series") {
      if (_vizerCatalog) {
        for (const ep of _vizerCatalog.episodes || []) {
          if (ep.tmdb_id && ep.servers?.mixdrop) {
            const current = seriesMap.get(ep.tmdb_id) || {
              tmdbId: ep.tmdb_id,
              type: "series",
              totalEpisodes: 0,
              seasons: [],
              audio: ep.audio || "Dublado"
            };
            current.totalEpisodes += 1;
            if (ep.season && !current.seasons.includes(ep.season)) {
              current.seasons.push(ep.season);
            }
            seriesMap.set(ep.tmdb_id, current);
          }
        }
      }
      if (_encontreiCatalog) {
        for (const ep of _encontreiCatalog.episodes || []) {
          if (ep.tmdb_id && ep.servers?.mixdrop) {
            const existing = seriesMap.get(ep.tmdb_id);
            if (existing) {
              const key = `${ep.tmdb_id}:${ep.season}:${ep.episode}`;
              const inVizer = _vizerEpisodeIndex.has(key);
              if (!inVizer) {
                existing.totalEpisodes += 1;
                if (ep.season && !existing.seasons.includes(ep.season)) {
                  existing.seasons.push(ep.season);
                }
              }
            } else {
              seriesMap.set(ep.tmdb_id, {
                tmdbId: ep.tmdb_id,
                type: "series",
                totalEpisodes: 1,
                seasons: ep.season ? [ep.season] : [],
                audio: ep.audio || "Dublado"
              });
            }
          }
        }
      }
    }
    const movieItems = Array.from(movieMap.values());
    const seriesItems = Array.from(seriesMap.values());
    const allItems = [...movieItems, ...seriesItems];
    const total = allItems.length;
    const paginated = allItems.slice(offset, offset + limit);
    res.setHeader("Cache-Control", "public, max-age=1800");
    return res.json({
      total,
      totalMovies: movieItems.length,
      totalSeries: seriesItems.length,
      limit,
      offset,
      items: paginated
    });
  } catch (err) {
    console.error("[downloads-catalog] Erro:", err);
    return res.status(500).json({ error: "Erro interno ao carregar cat\xE1logo de downloads" });
  }
});
var encontreiLookup_default = router4;

// server/routes/videoScrapers.ts
var router5 = (0, import_express6.Router)();
router5.get("/api/anime/hls-proxy", async (req3, res) => {
  try {
    const rawUrl = req3.query.url;
    if (!rawUrl) return res.status(400).send("URL ausente");
    const validation = validateSafeUrl(rawUrl);
    if (!validation.valid) {
      let isAllowedException = false;
      try {
        const parsedHost = new URL(rawUrl).hostname.toLowerCase();
        if (parsedHost === "hclod.qzz.io" || parsedHost.endsWith(".hclod.qzz.io") || parsedHost === "watchplay.shop" || parsedHost.endsWith(".watchplay.shop") || parsedHost === "vixsrc.to" || parsedHost.endsWith(".vixsrc.to") || parsedHost === "vixsrc.net" || parsedHost.endsWith(".vixsrc.net") || parsedHost === "vix-content.net" || parsedHost.endsWith(".vix-content.net")) {
          isAllowedException = true;
        }
      } catch (e) {
      }
      if (!isAllowedException) {
        return res.status(403).send("URL n\xE3o permitida");
      }
    }
    if (req3.method === "OPTIONS") {
      return res.status(204).end();
    }
    const referer = req3.query.referer || (rawUrl.includes("vixsrc") || rawUrl.includes("vix-content") ? "https://vixsrc.to/" : "https://v1.watchplay.shop/");
    let originHeader = "https://v1.watchplay.shop";
    try {
      if (referer.startsWith("http")) originHeader = new URL(referer).origin;
    } catch {
    }
    const isSegment = req3.query.is_segment === "true" || rawUrl.includes(".ts") || rawUrl.includes(".m4s");
    const timeoutMs = isSegment ? 15e3 : 8e3;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    req3.on("close", () => {
      controller.abort();
    });
    let upstreamRes;
    try {
      upstreamRes = await fetch(rawUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": referer,
          "Origin": originHeader
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send(`Upstream status: ${upstreamRes.status}`);
    }
    const contentType = upstreamRes.headers.get("content-type") || "";
    const isM3U8 = rawUrl.includes(".m3u8") || contentType.includes("mpegurl") || contentType.includes("application/x-mpegURL");
    if (isM3U8) {
      const text = await upstreamRes.text();
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      const basePath = rawUrl.substring(0, rawUrl.lastIndexOf("/") + 1);
      const rewritten = text.split("\n").map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.includes('URI="')) {
          return trimmed.replace(/URI="([^"]+)"/, (_, uri) => {
            const fullUri = uri.startsWith("http") ? uri : new URL(uri, basePath).toString();
            return `URI="/api/anime/hls-proxy?url=${encodeURIComponent(fullUri)}&referer=${encodeURIComponent(referer)}&is_segment=true"`;
          });
        }
        if (trimmed.startsWith("#")) return trimmed;
        const fullSegUrl = trimmed.startsWith("http") ? trimmed : new URL(trimmed, basePath).toString();
        return `/api/anime/hls-proxy?url=${encodeURIComponent(fullSegUrl)}&referer=${encodeURIComponent(referer)}&is_segment=true`;
      }).join("\n");
      return res.send(rewritten);
    }
    let finalContentType = contentType || "video/MP2T";
    if (req3.query.is_segment === "true") {
      finalContentType = "video/MP2T";
    }
    res.setHeader("Content-Type", finalContentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (upstreamRes.body) {
      return import_stream.Readable.fromWeb(upstreamRes.body).pipe(res);
    } else {
      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      return res.send(buffer);
    }
  } catch (err) {
    if (err.name === "AbortError") {
      if (!res.headersSent) {
        return res.status(504).send("Gateway Timeout: CDN upstream demorou para responder");
      }
      return;
    }
    if (!res.headersSent) {
      console.error("[HLS Proxy Error]:", err.message);
      return res.status(500).send("Proxy error");
    }
  }
});
router5.get("/api/vixsrc-stream", async (req3, res) => {
  const { id, type = "movie", s = "1", e = "1" } = req3.query;
  const tmdbId = String(id || "");
  const mediaType = type === "tv" ? "tv" : "movie";
  const seasonNum = parseInt(String(s || "1"), 10) || 1;
  const episodeNum = parseInt(String(e || "1"), 10) || 1;
  const wpTarget = mediaType === "tv" ? `https://v1.watchplay.shop/tvshow/${tmdbId}/${seasonNum}/${episodeNum}` : `https://v1.watchplay.shop/movie/${tmdbId}`;
  try {
    const vixData = await resolveVixsrcStream(tmdbId, mediaType, seasonNum, episodeNum);
    if (vixData?.masterUrl) {
      const proxiedStreamUrl = `/api/anime/hls-proxy?url=${encodeURIComponent(vixData.masterUrl)}&referer=${encodeURIComponent(vixData.embedUrl)}`;
      return res.send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
              html, body {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
                background: #000;
                overflow: hidden;
              }
              #artplayer-container {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #000;
              }
              video {
                object-fit: contain !important;
                width: 100% !important;
                height: 100% !important;
              }
              .art-mask,
              .art-top,
              .art-bottom,
              .art-controls,
              .art-controls-left,
              .art-controls-center,
              .art-controls-right,
              .art-state,
              .art-loading,
              .art-notice,
              .art-settings,
              .art-contextmenu,
              .art-progress,
              .btn, .button, a[href*="player"], a[href*="server"], div[class*="player_select"],
              div[class*="server_select"], div[class*="choose"], .escolher-player,
              .button-escolher-player, [class*="escolh"], [class*="server_"],
              .servers-list, .server-buttons, .player-selector,
              [id*="server"], [id*="player_select"], .btn-player, .player-options,
              #player > div:first-child, button[onclick*="backOptions"],
              .alert, .notice, .warning, .message, [class*="msg"], [class*="aviso"],
              h1, h2, h3, h4, #options h2, #options p {
                display: none !important;
                opacity: 0 !important;
                visibility: hidden !important;
                pointer-events: none !important;
              }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/artplayer@5.1.7/dist/artplayer.js"></script>
          </head>
          <body>
            <div id="artplayer-container"></div>
            <script>
              (function() {
                var hlsUrl = "${proxiedStreamUrl}";

                var art = new Artplayer({
                  container: "#artplayer-container",
                  url: hlsUrl,
                  type: "m3u8",
                  customType: {
                    m3u8: function(video, url, artInstance) {
                      if (Hls.isSupported()) {
                        if (artInstance.hls) artInstance.hls.destroy();
                        var hls = new Hls({
                          enableWorker: true,
                          maxBufferLength: 60,
                          maxMaxBufferLength: 120,
                          backBufferLength: 90
                        });
                        hls.loadSource(url);
                        hls.attachMedia(video);
                        artInstance.hls = hls;
                      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                        video.src = url;
                      }
                    }
                  },
                  autoplay: true,
                  muted: false,
                  playsInline: true,
                  controls: [],
                  theme: "#e50914"
                });

                window.artInstance = art;

                function sendStatus() {
                  var v = art.video || document.querySelector("video");
                  if (!v) return;
                  var dur = v.duration || art.duration || 0;
                  var cur = v.currentTime || 0;
                  var bufferedEnd = 0;
                  if (v.buffered && v.buffered.length > 0) {
                    bufferedEnd = v.buffered.end(v.buffered.length - 1);
                  }

                  try {
                    window.parent.postMessage({
                      type: "WATCHPLAY_STATUS",
                      currentTime: cur,
                      duration: dur,
                      paused: !!v.paused,
                      muted: !!v.muted,
                      volume: typeof v.volume === "number" ? v.volume : 1,
                      buffered: bufferedEnd,
                      playbackRate: v.playbackRate || 1,
                      readyState: v.readyState || 0
                    }, "*");
                  } catch(e) {}
                }

                function notifyEnded() {
                  try {
                    window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
                  } catch(e) {}
                }

                setInterval(sendStatus, 300);

                // Auto-Healer A/V Sync para Artplayer HLS
                (function initAVSyncArtHls() {
                  var lastFrameCallbackTime = Date.now();
                  var lastCheckedCurrentTime = 0;
                  var lastTotalFrames = 0;
                  var stallTicks = 0;
                  var isHealing = false;
                  var lastHealAt = 0;

                  function trackFrameRender(v) {
                    if (!v) return;
                    if (typeof v.requestVideoFrameCallback === 'function' && !v._rvfcActive) {
                      v._rvfcActive = true;
                      function onFrame() {
                        lastFrameCallbackTime = Date.now();
                        if (v && !v.paused) {
                          v.requestVideoFrameCallback(onFrame);
                        } else if (v) {
                          v._rvfcActive = false;
                        }
                      }
                      try { v.requestVideoFrameCallback(onFrame); } catch(e) { v._rvfcActive = false; }
                    }
                  }

                  setInterval(function() {
                    var v = art.video || document.querySelector("video");
                    if (!v) return;
                    trackFrameRender(v);

                    if (v.paused || v.ended || v.seeking || v.readyState < 2) {
                      stallTicks = 0;
                      lastCheckedCurrentTime = v.currentTime || 0;
                      return;
                    }

                    var now = Date.now();
                    var cur = v.currentTime || 0;
                    var audioMoving = cur > (lastCheckedCurrentTime + 0.35);
                    lastCheckedCurrentTime = cur;

                    if (audioMoving) {
                      var frameFresh = false;
                      if (typeof v.requestVideoFrameCallback === 'function') {
                        if ((now - lastFrameCallbackTime) < 1800) frameFresh = true;
                      }
                      if (typeof v.getVideoPlaybackQuality === 'function') {
                        try {
                          var q = v.getVideoPlaybackQuality();
                          if (q && typeof q.totalVideoFrames === 'number') {
                            if (q.totalVideoFrames > lastTotalFrames) {
                              frameFresh = true;
                              lastTotalFrames = q.totalVideoFrames;
                            }
                          }
                        } catch(e) {}
                      }

                      if (!frameFresh && (typeof v.requestVideoFrameCallback === 'function' || typeof v.getVideoPlaybackQuality === 'function')) {
                        stallTicks++;
                        if (stallTicks >= 2 && (now - lastHealAt > 3500) && !isHealing) {
                          isHealing = true;
                          lastHealAt = now;
                          stallTicks = 0;
                          try {
                            if (art && art.hls && typeof art.hls.recoverMediaError === 'function') {
                              art.hls.recoverMediaError();
                            }
                            var nowP = v.currentTime;
                            v.currentTime = nowP + 0.005;
                            v._rvfcActive = false;
                            trackFrameRender(v);
                          } catch(err) {}
                          finally { setTimeout(function() { isHealing = false; }, 800); }
                        }
                      } else {
                        stallTicks = 0;
                      }
                    }
                  }, 800);
                })();

                window.addEventListener("message", function(e) {
                  if (e.data && e.data.type === 'SET_SUBTITLE_URL') {
                      var vid = window.artInstance ? window.artInstance.video : (typeof art !== 'undefined' && art.video ? art.video : document.querySelector('video'));
                      if (!vid) vid = document.querySelector('video');
                      if (vid) {
                          var oldTrack = document.getElementById('playinfinity-subtitle');
                          if (oldTrack) { oldTrack.remove(); }
                          if (e.data.url) {
                              var track = document.createElement('track');
                              track.id = 'playinfinity-subtitle';
                              track.kind = 'captions';
                              track.label = e.data.label || 'Portugu\xEAs (Brasil)';
                              track.srclang = 'pt-BR';
                              track.src = e.data.url;
                              track.default = true;
                              vid.appendChild(track);
                              // Espera carregar para for\xE7ar o modo showing
                              if (e.data.show !== false) { track.addEventListener('load', function() { this.mode = 'showing'; }); }
                          }
                      }
                      return;
                  }
                  if (e.data && e.data.type === 'SHOW_SUBTITLE') {
                      var tr = document.getElementById('playinfinity-subtitle');
                      if (tr) {
                          tr.mode = e.data.show ? 'showing' : 'hidden';
                      }
                      return;
                  }

                  if (!e.data) return;
                  var v = art.video || document.querySelector("video");

                  switch (e.data.type) {
                    case "PLAY":
                      if (art) art.play().catch(function() {});
                      else if (v) v.play().catch(function() {});
                      sendStatus();
                      break;
                    case "PAUSE":
                      if (art) art.pause();
                      else if (v) v.pause();
                      sendStatus();
                      break;
                    case "TOGGLE_PLAY":
                      if (art) art.toggle();
                      else if (v) { v.paused ? v.play().catch(function() {}) : v.pause(); }
                      sendStatus();
                      break;
                    case "SEEK":
                    case "SEEK_ABSOLUTE":
                  case "SEEK_RELATIVE":
                    var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                      if (typeof t === "number" && !isNaN(t)) {
                        if (art) art.currentTime = t;
                        else if (v) v.currentTime = t;
                        sendStatus();
                      }
                      break;
                    case "SKIP_INTRO":
                      var sec = Number(e.data.seconds) || 85;
                      var cur = (v ? v.currentTime : 0) || 0;
                      var maxD = (v && v.duration > 0 ? v.duration : 99999);
                      var target = Math.max(0, Math.min(cur + sec, maxD - 5));
                      if (art) art.currentTime = target;
                      else if (v) v.currentTime = target;
                      sendStatus();
                      break;
                    case "SET_VOLUME":
                      if (typeof e.data.volume === "number") {
                        if (art) art.volume = e.data.volume;
                        else if (v) v.volume = e.data.volume;
                        sendStatus();
                      }
                      break;
                    case "SET_MUTED":
                    case "setMuted":
                      if (art) art.muted = !!e.data.muted;
                      else if (v) v.muted = !!e.data.muted;
                      sendStatus();
                      break;
                    case "REQUEST_STATUS":
                      sendStatus();
                      break;
                  }
                });

                art.on("video:ended", notifyEnded);
              })();
            </script>
          </body>
          </html>
        `);
    }
    return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
  } catch (err) {
    console.error("[Vixsrc Stream Route Error]:", err.message);
    return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
  }
});
router5.get("/api/anime-stream", async (req3, res) => {
  const { provider = "consumet", id, s = "1", e = "1", title = "", type = "tv" } = req3.query;
  const isMovie = type === "movie";
  const tmdbId = String(id || "");
  let animeTitle = String(title || "");
  if (!animeTitle) {
    if (tmdbId === "46260") animeTitle = "Naruto";
    else if (tmdbId === "31910") animeTitle = "Naruto Shippuden";
    else if (tmdbId === "12971") animeTitle = "Dragon Ball";
    else if (tmdbId === "12609") animeTitle = "Dragon Ball Z";
    else if (tmdbId === "60625") animeTitle = "Dragon Ball Super";
  }
  const wpTarget = isMovie ? `https://v1.watchplay.shop/movie/${tmdbId}` : `https://v1.watchplay.shop/tvshow/${tmdbId}/${s}/${e}`;
  try {
    if (provider === "consumet" || provider === "native") {
      const directStream = await resolveDirectAnimeStream(tmdbId, s, e, isMovie, animeTitle);
      if (directStream?.isBlogger) {
        return res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                * { box-sizing: border-box; }
                html, body {
                  margin: 0;
                  padding: 0;
                  background: #000;
                  overflow: hidden;
                  width: 100vw;
                  height: 100vh;
                  position: relative;
                }
                #blogger-container {
                  position: absolute;
                  inset: 0;
                  width: 100%;
                  height: 100%;
                  overflow: hidden;
                  background: #000;
                }
                iframe {
                  position: absolute;
                  top: -2px;
                  left: 0;
                  width: 100%;
                  height: calc(100% + 50px);
                  border: none;
                  display: block;
                }
              </style>
            </head>
            <body>
              <div id="blogger-container">
                <iframe id="blogger-frame" src="${directStream.streamUrl}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
              </div>
              <script>
                (function() {
                  var curTime = 0;
                  var isPaused = true;
                  var dur = 1440; // 24 minutos (dura\xE7\xE3o de epis\xF3dio padr\xE3o)
                  var frame = document.getElementById("blogger-frame");

                  function sendStatus() {
                    try {
                      window.parent.postMessage({
                        type: "WATCHPLAY_STATUS",
                        currentTime: curTime,
                        duration: dur,
                        paused: isPaused,
                        muted: false,
                        volume: 1,
                        buffered: curTime + 60,
                        playbackRate: 1,
                        readyState: 4
                      }, "*");
                    } catch(e) {}
                  }

                  // Detecta quando o usu\xE1rio clica diretamente no player do iframe
                  window.addEventListener("blur", function() {
                    if (isPaused) {
                      isPaused = false;
                      sendStatus();
                    }
                  });

                  // Incrementa o tempo segundo a segundo quando n\xE3o pausado
                  setInterval(function() {
                    if (!isPaused && curTime < dur) {
                      curTime += 1;
                    }
                    sendStatus();
                  }, 1000);

                  setTimeout(sendStatus, 100);
                  setTimeout(sendStatus, 400);

                  // Escuta comandos vindos da Skin Netflix
                  window.addEventListener("message", function(e) {
                  if (e.data && e.data.type === 'SET_SUBTITLE_URL') {
                      var vid = window.artInstance ? window.artInstance.video : (typeof art !== 'undefined' && art.video ? art.video : document.querySelector('video'));
                      if (!vid) vid = document.querySelector('video');
                      if (vid) {
                          var oldTrack = document.getElementById('playinfinity-subtitle');
                          if (oldTrack) { oldTrack.remove(); }
                          if (e.data.url) {
                              var track = document.createElement('track');
                              track.id = 'playinfinity-subtitle';
                              track.kind = 'captions';
                              track.label = e.data.label || 'Portugu\xEAs (Brasil)';
                              track.srclang = 'pt-BR';
                              track.src = e.data.url;
                              track.default = true;
                              vid.appendChild(track);
                              // Espera carregar para for\xE7ar o modo showing
                              if (e.data.show !== false) { track.addEventListener('load', function() { this.mode = 'showing'; }); }
                          }
                      }
                      return;
                  }
                  if (e.data && e.data.type === 'SHOW_SUBTITLE') {
                      var tr = document.getElementById('playinfinity-subtitle');
                      if (tr) {
                          tr.mode = e.data.show ? 'showing' : 'hidden';
                      }
                      return;
                  }

                    if (!e.data) return;
                    switch(e.data.type) {
                      case "PLAY":
                        isPaused = false;
                        sendStatus();
                        break;
                      case "PAUSE":
                        isPaused = true;
                        sendStatus();
                        break;
                      case "TOGGLE_PLAY":
                        isPaused = !isPaused;
                        sendStatus();
                        break;
                      case "SEEK":
                      case "SEEK_ABSOLUTE":
                  case "SEEK_RELATIVE":
                    var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                        if (typeof t === "number" && !isNaN(t)) {
                          curTime = Math.max(0, Math.min(t, dur));
                          sendStatus();
                        }
                        break;
                      case "SKIP_INTRO":
                        curTime = Math.min(curTime + 85, dur - 5);
                        sendStatus();
                        break;
                      case "REQUEST_STATUS":
                        sendStatus();
                        break;
                    }
                  });
                })();
              </script>
            </body>
            </html>
          `);
      }
      if (directStream?.streamUrl) {
        const proxiedStreamUrl = `/api/anime/hls-proxy?url=${encodeURIComponent(directStream.streamUrl)}`;
        const proxiedSubUrl = directStream.subtitleUrl ? `/api/anime/hls-proxy?url=${encodeURIComponent(directStream.subtitleUrl)}` : "";
        return res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
              <style>
                html, body {
                  margin: 0;
                  padding: 0;
                  width: 100%;
                  height: 100%;
                  background: #000;
                  overflow: hidden;
                }
                #artplayer-container {
                  position: absolute;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  background: #000;
                }
                video {
                  object-fit: contain !important;
                  width: 100% !important;
                  height: 100% !important;
                }
                .art-mask,
                .art-top,
                .art-bottom,
                .art-controls,
                .art-controls-left,
                .art-controls-center,
                .art-controls-right,
                .art-state,
                .art-loading,
                .art-notice,
                .art-settings,
                .art-contextmenu,
                .art-progress,
                .btn, .button, a[href*="player"], a[href*="server"], div[class*="player_select"],
                div[class*="server_select"], div[class*="choose"], .escolher-player,
                .button-escolher-player, [class*="escolh"], [class*="server_"],
                .servers-list, .server-buttons, .player-selector,
                [id*="server"], [id*="player_select"], .btn-player, .player-options,
                #player > div:first-child, button[onclick*="backOptions"],
                .alert, .notice, .warning, .message, [class*="msg"], [class*="aviso"],
                h1, h2, h3, h4, #options h2, #options p {
                  display: none !important;
                  opacity: 0 !important;
                  visibility: hidden !important;
                  pointer-events: none !important;
                }
              </style>
              <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
              <script src="https://cdn.jsdelivr.net/npm/artplayer@5.1.7/dist/artplayer.js"></script>
            </head>
            <body>
              <div id="artplayer-container"></div>
              <script>
                (function() {
                  var hlsUrl = "${proxiedStreamUrl}";
                  var subUrl = "${proxiedSubUrl}";
                  
                  var subtitles = [];
                  if (subUrl) {
                    subtitles.push({
                      url: subUrl,
                      name: "Portugu\xEAs",
                      default: true,
                      type: "vtt"
                    });
                  }

                  var art = new Artplayer({
                    container: "#artplayer-container",
                    url: hlsUrl,
                    type: "m3u8",
                    customType: {
                      m3u8: function(video, url, artInstance) {
                        if (Hls.isSupported()) {
                          if (artInstance.hls) artInstance.hls.destroy();
                          var hls = new Hls({
                            enableWorker: true,
                            maxBufferLength: 60,
                            maxMaxBufferLength: 120,
                            backBufferLength: 90
                          });
                          hls.loadSource(url);
                          hls.attachMedia(video);
                          artInstance.hls = hls;
                        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                          video.src = url;
                        }
                      }
                    },
                    autoplay: true,
                    muted: false,
                    playsInline: true,
                    controls: [],
                    subtitle: subtitles.length > 0 ? subtitles[0] : undefined,
                    theme: "#e50914"
                  });

                  window.artInstance = art;

                  function sendStatus() {
                    var v = art.video || document.querySelector("video");
                    if (!v) return;
                    var dur = v.duration || art.duration || 0;
                    var cur = v.currentTime || 0;
                    var bufferedEnd = 0;
                    if (v.buffered && v.buffered.length > 0) {
                      bufferedEnd = v.buffered.end(v.buffered.length - 1);
                    }

                    try {
                      window.parent.postMessage({
                        type: "WATCHPLAY_STATUS",
                        currentTime: cur,
                        duration: dur,
                        paused: !!v.paused,
                        muted: !!v.muted,
                        volume: typeof v.volume === "number" ? v.volume : 1,
                        buffered: bufferedEnd,
                        playbackRate: v.playbackRate || 1,
                        readyState: v.readyState || 0
                      }, "*");
                    } catch(e) {}
                  }

                  function notifyEnded() {
                    try {
                      window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
                    } catch(e) {}
                  }

                  setInterval(sendStatus, 300);

                  // Auto-Healer A/V Sync
                  (function initAVSyncArt2() {
                    var lastFrameCallbackTime = Date.now();
                    var lastCheckedCurrentTime = 0;
                    var lastTotalFrames = 0;
                    var stallTicks = 0;
                    var isHealing = false;
                    var lastHealAt = 0;

                    function trackFrameRender(v) {
                      if (!v) return;
                      if (typeof v.requestVideoFrameCallback === 'function' && !v._rvfcActive) {
                        v._rvfcActive = true;
                        function onFrame() {
                          lastFrameCallbackTime = Date.now();
                          if (v && !v.paused) {
                            v.requestVideoFrameCallback(onFrame);
                          } else if (v) {
                            v._rvfcActive = false;
                          }
                        }
                        try { v.requestVideoFrameCallback(onFrame); } catch(e) { v._rvfcActive = false; }
                      }
                    }

                    setInterval(function() {
                      var v = art.video || document.querySelector("video");
                      if (!v) return;
                      trackFrameRender(v);

                      if (v.paused || v.ended || v.seeking || v.readyState < 2) {
                        stallTicks = 0;
                        lastCheckedCurrentTime = v.currentTime || 0;
                        return;
                      }

                      var now = Date.now();
                      var cur = v.currentTime || 0;
                      var audioMoving = cur > (lastCheckedCurrentTime + 0.35);
                      lastCheckedCurrentTime = cur;

                      if (audioMoving) {
                        var frameFresh = false;
                        if (typeof v.requestVideoFrameCallback === 'function') {
                          if ((now - lastFrameCallbackTime) < 1800) frameFresh = true;
                        }
                        if (typeof v.getVideoPlaybackQuality === 'function') {
                          try {
                            var q = v.getVideoPlaybackQuality();
                            if (q && typeof q.totalVideoFrames === 'number') {
                              if (q.totalVideoFrames > lastTotalFrames) {
                                frameFresh = true;
                                lastTotalFrames = q.totalVideoFrames;
                              }
                            }
                          } catch(e) {}
                        }

                        if (!frameFresh && (typeof v.requestVideoFrameCallback === 'function' || typeof v.getVideoPlaybackQuality === 'function')) {
                          stallTicks++;
                          if (stallTicks >= 2 && (now - lastHealAt > 3500) && !isHealing) {
                            isHealing = true;
                            lastHealAt = now;
                            stallTicks = 0;
                            try {
                              if (art && art.hls && typeof art.hls.recoverMediaError === 'function') {
                                art.hls.recoverMediaError();
                              }
                              var nowP = v.currentTime;
                              v.currentTime = nowP + 0.005;
                              v._rvfcActive = false;
                              trackFrameRender(v);
                            } catch(err) {}
                            finally { setTimeout(function() { isHealing = false; }, 800); }
                          }
                        } else {
                          stallTicks = 0;
                        }
                      }
                    }, 800);
                  })();

                  window.addEventListener("message", function(e) {
                  if (e.data && e.data.type === 'SET_SUBTITLE_URL') {
                      var vid = window.artInstance ? window.artInstance.video : (typeof art !== 'undefined' && art.video ? art.video : document.querySelector('video'));
                      if (!vid) vid = document.querySelector('video');
                      if (vid) {
                          var oldTrack = document.getElementById('playinfinity-subtitle');
                          if (oldTrack) { oldTrack.remove(); }
                          if (e.data.url) {
                              var track = document.createElement('track');
                              track.id = 'playinfinity-subtitle';
                              track.kind = 'captions';
                              track.label = e.data.label || 'Portugu\xEAs (Brasil)';
                              track.srclang = 'pt-BR';
                              track.src = e.data.url;
                              track.default = true;
                              vid.appendChild(track);
                              // Espera carregar para for\xE7ar o modo showing
                              if (e.data.show !== false) { track.addEventListener('load', function() { this.mode = 'showing'; }); }
                          }
                      }
                      return;
                  }
                  if (e.data && e.data.type === 'SHOW_SUBTITLE') {
                      var tr = document.getElementById('playinfinity-subtitle');
                      if (tr) {
                          tr.mode = e.data.show ? 'showing' : 'hidden';
                      }
                      return;
                  }

                    if (!e.data) return;
                    var v = art.video || document.querySelector("video");

                    switch (e.data.type) {
                      case "PLAY":
                        if (art) art.play().catch(function() {});
                        else if (v) v.play().catch(function() {});
                        sendStatus();
                        break;
                      case "PAUSE":
                        if (art) art.pause();
                        else if (v) v.pause();
                        sendStatus();
                        break;
                      case "TOGGLE_PLAY":
                        if (art) art.toggle();
                        else if (v) { v.paused ? v.play().catch(function() {}) : v.pause(); }
                        sendStatus();
                        break;
                      case "SEEK":
                      case "SEEK_ABSOLUTE":
                  case "SEEK_RELATIVE":
                    var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                        if (typeof t === "number" && !isNaN(t)) {
                          if (art) art.currentTime = t;
                          else if (v) v.currentTime = t;
                          sendStatus();
                        }
                        break;
                      case "SKIP_INTRO":
                        var sec = Number(e.data.seconds) || 85;
                        var cur = (v ? v.currentTime : 0) || 0;
                        var maxD = (v && v.duration > 0 ? v.duration : 99999);
                        var target = Math.max(0, Math.min(cur + sec, maxD - 5));
                        if (art) art.currentTime = target;
                        else if (v) v.currentTime = target;
                        sendStatus();
                        break;
                      case "SET_VOLUME":
                        if (typeof e.data.volume === "number") {
                          if (art) art.volume = e.data.volume;
                          else if (v) v.volume = e.data.volume;
                          sendStatus();
                        }
                        break;
                      case "SET_MUTED":
                        if (art) art.muted = !!e.data.muted;
                        else if (v) v.muted = !!e.data.muted;
                        sendStatus();
                        break;
                      case "SET_PLAYBACK_RATE":
                        if (typeof e.data.rate === "number") {
                          if (art) art.playbackRate = e.data.rate;
                          else if (v) v.playbackRate = e.data.rate;
                          sendStatus();
                        }
                        break;
                      case "REQUEST_STATUS":
                        sendStatus();
                        break;
                    }
                  });

                  art.on("video:ended", notifyEnded);
                })();
              </script>
            </body>
            </html>
          `);
      }
      return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
    }
    return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
  } catch (err) {
    console.error("[Anime Stream Error]:", err.message);
    return res.redirect(`/api/watchplayer-stream?url=${encodeURIComponent(wpTarget)}`);
  }
});
var watchPlayerWorkingPrefixCache = /* @__PURE__ */ new Map();
var PREFIX_CACHE_TTL = 24 * 60 * 60 * 1e3;
router5.get("/api/watchplayer-stream", async (req3, res) => {
  try {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const targetUrl = req3.query.url;
    const validation = validateSafeUrl(targetUrl);
    if (!validation.valid) {
      return res.status(403).send(`Acesso bloqueado por seguran\xE7a: ${validation.error}`);
    }
    if (req3.query.action_secure_sign) {
      const rawUrl = req3.query.raw_url;
      const signTarget = new URL(targetUrl);
      signTarget.searchParams.set("action_secure_sign", "1");
      if (rawUrl) signTarget.searchParams.set("raw_url", rawUrl);
      const signRes = await fetch(signTarget.toString(), {
        signal: AbortSignal.timeout(15e3),
        headers: {
          "Referer": targetUrl,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      const signData = await signRes.json();
      return res.json(signData);
    }
    const isWatchPlayerUnavailable = (content, url, status) => {
      if (status >= 400) return true;
      const lowerUrl = (url || "").toLowerCase();
      if (lowerUrl.includes("/login") || lowerUrl.includes("/admin") || lowerUrl.includes("/painel")) return true;
      const lower = (content || "").toLowerCase();
      if (lower.includes("login-card") || lower.includes("login-page") || lower.includes("entrar \u2022 myplayer") || lower.includes("painel administrativo") || lower.includes("myplayer") && (lower.includes("bem-vindo") || lower.includes("bem vindo")) || lower.includes("s\xE9rie n\xE3o encontrada") || lower.includes("serie n\xE3o encontrada") || lower.includes("filme n\xE3o encontrado") || lower.includes("acesso protegido por sess\xE3o segura")) {
        return true;
      }
      return false;
    };
    const parsedTarget = new URL(targetUrl);
    let effectiveTargetUrl = targetUrl;
    const seriesKeyMatch = parsedTarget.pathname.match(/\/(tvshow|series|serie)\/([^/]+)/);
    const seriesId = seriesKeyMatch ? seriesKeyMatch[2] : null;
    const currentPrefix = seriesKeyMatch ? seriesKeyMatch[1] : null;
    const cached = seriesId ? watchPlayerWorkingPrefixCache.get(seriesId) : null;
    if (seriesId && currentPrefix && cached && Date.now() - cached.timestamp < PREFIX_CACHE_TTL) {
      const cachedPrefix = cached.prefix;
      if (cachedPrefix !== currentPrefix) {
        effectiveTargetUrl = effectiveTargetUrl.replace(`/${currentPrefix}/`, `/${cachedPrefix}/`);
      }
    }
    const initialController = new AbortController();
    const initialTimeout = setTimeout(() => initialController.abort(), 4500);
    req3.on("close", () => initialController.abort());
    let html = "";
    let isUnavailable = false;
    let upstreamRes = null;
    try {
      let resAttempt = await fetch(effectiveTargetUrl, {
        headers: {
          "Referer": parsedTarget.origin + "/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        redirect: "manual",
        signal: initialController.signal
      });
      if (resAttempt.status >= 300 && resAttempt.status < 400) {
        const loc = resAttempt.headers.get("location") || "";
        if (loc.includes("/login") || loc.includes("/admin") || loc.includes("/painel")) {
          isUnavailable = true;
        } else {
          try {
            const redirectedUrl = new URL(loc, effectiveTargetUrl).toString();
            effectiveTargetUrl = redirectedUrl;
            resAttempt = await fetch(effectiveTargetUrl, {
              headers: {
                "Referer": parsedTarget.origin + "/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              },
              redirect: "manual",
              signal: initialController.signal
            });
          } catch (e) {
            isUnavailable = true;
          }
        }
      }
      upstreamRes = resAttempt;
      if (upstreamRes.status === 200) {
        html = await upstreamRes.text();
        if (isWatchPlayerUnavailable(html, effectiveTargetUrl, upstreamRes.status)) {
          isUnavailable = true;
        }
      } else {
        isUnavailable = true;
      }
    } catch (err) {
      isUnavailable = true;
    } finally {
      clearTimeout(initialTimeout);
    }
    if (isUnavailable) {
      const alternateVariants = [];
      if (effectiveTargetUrl.includes("/tvshow/")) {
        alternateVariants.push(effectiveTargetUrl.replace("/tvshow/", "/series/"));
        alternateVariants.push(effectiveTargetUrl.replace("/tvshow/", "/serie/"));
      } else if (effectiveTargetUrl.includes("/series/")) {
        alternateVariants.push(effectiveTargetUrl.replace("/series/", "/tvshow/"));
        alternateVariants.push(effectiveTargetUrl.replace("/series/", "/serie/"));
      } else if (effectiveTargetUrl.includes("/serie/")) {
        alternateVariants.push(effectiveTargetUrl.replace("/serie/", "/series/"));
        alternateVariants.push(effectiveTargetUrl.replace("/serie/", "/tvshow/"));
      }
      if (alternateVariants.length > 0) {
        const probeVariant = async (altUrl) => {
          const probeCtrl = new AbortController();
          const probeTimer = setTimeout(() => probeCtrl.abort(), 4e3);
          req3.on("close", () => probeCtrl.abort());
          try {
            let currentUrl = altUrl;
            let altRes = await fetch(currentUrl, {
              headers: {
                "Referer": new URL(altUrl).origin + "/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              },
              redirect: "manual",
              signal: probeCtrl.signal
            });
            if (altRes.status >= 300 && altRes.status < 400) {
              const loc = altRes.headers.get("location") || "";
              if (!loc.includes("/login") && !loc.includes("/admin") && !loc.includes("/painel")) {
                currentUrl = new URL(loc, currentUrl).toString();
                altRes = await fetch(currentUrl, {
                  headers: {
                    "Referer": new URL(altUrl).origin + "/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                  },
                  redirect: "manual",
                  signal: probeCtrl.signal
                });
              }
            }
            if (altRes.status === 200) {
              const altText = await altRes.text();
              if (!isWatchPlayerUnavailable(altText, currentUrl, altRes.status)) {
                return { url: currentUrl, res: altRes, html: altText };
              }
            }
            throw new Error("Unavailable");
          } finally {
            clearTimeout(probeTimer);
          }
        };
        try {
          const winner = await Promise.any(alternateVariants.map(probeVariant));
          effectiveTargetUrl = winner.url;
          upstreamRes = winner.res;
          html = winner.html;
          isUnavailable = false;
          if (seriesId) {
            const matchedWinner = winner.url.match(/\/(tvshow|series|serie)\//);
            if (matchedWinner) {
              watchPlayerWorkingPrefixCache.set(seriesId, { prefix: matchedWinner[1], timestamp: Date.now() });
            }
          }
        } catch (e) {
        }
      }
    }
    if (isUnavailable) {
      console.warn(`[WatchPlayer Stream Status ${upstreamRes.status}]: Epis\xF3dio n\xE3o encontrado ou tela de login no WatchPlayer (${effectiveTargetUrl}). Acionando fallback.`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <style>
              html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
            </style>
          </head>
          <body>
            <script>
              try {
                window.parent.postMessage({ 
                  type: "WATCHPLAY_UNAVAILABLE", 
                  reason: "content_not_found"
                }, "*");
              } catch(e) {}
            </script>
          </body>
          </html>
        `);
    }
    const isLegendado = html.includes('MyPlayerAudio="Legendado"') || html.includes("MyPlayerAudio='Legendado'") || html.includes('MyPlayerAudio="Ingl\xEAs"') || html.includes("MyPlayerAudio='Ingl\xEAs'");
    if (isLegendado) {
      console.warn(`[WatchPlayer Stream]: Vers\xE3o Legendada/Ingl\xEAs detectada (${effectiveTargetUrl}). Acionando fallback para buscar vers\xE3o PT-BR.`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <style>
              html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
            </style>
          </head>
          <body>
            <script>
              try {
                window.parent.postMessage({ 
                  type: "WATCHPLAY_UNAVAILABLE", 
                  reason: "english_language"
                }, "*");
              } catch(e) {}
            </script>
          </body>
          </html>
        `);
    }
    if (html.includes("player-choice") || html.includes("player-choice-option") || html.includes("player-choice-title") || /Escolha uma op[çc][ãa]o/i.test(html)) {
      const optionMatches = [
        ...html.matchAll(/<a[^>]*class=["'][^"']*player-choice-option[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)
      ];
      let selectedHref = "";
      for (const match of optionMatches) {
        const href = match[1];
        const text = match[2];
        if (/dublado|pt-br|nacional|portugu/i.test(text)) {
          selectedHref = href;
          break;
        }
      }
      if (!selectedHref && optionMatches.length > 0) {
        selectedHref = optionMatches[0][1];
      }
      if (!selectedHref && !effectiveTargetUrl.includes("player=")) {
        selectedHref = "?player=0";
      }
      if (selectedHref) {
        const choiceUrl = new URL(selectedHref, effectiveTargetUrl).toString();
        console.log(`[WatchPlayer Stream] Auto-resolvendo tela de op\xE7\xF5es para o player direto: ${choiceUrl}`);
        effectiveTargetUrl = choiceUrl;
        try {
          const choiceRes = await fetch(effectiveTargetUrl, {
            signal: AbortSignal.timeout(15e3),
            headers: {
              "Referer": parsedTarget.origin + "/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            redirect: "manual"
          });
          if (choiceRes.status === 200) {
            const choiceHtml = await choiceRes.text();
            if (!isWatchPlayerUnavailable(choiceHtml, effectiveTargetUrl, choiceRes.status)) {
              html = choiceHtml;
            } else {
              isUnavailable = true;
            }
          } else {
            isUnavailable = true;
          }
        } catch (err) {
          console.warn("[WatchPlayer Choice Resolution Error]:", err.message);
          isUnavailable = true;
        }
        if (isUnavailable) {
          console.warn(`[WatchPlayer Stream]: Op\xE7\xE3o de player inv\xE1lida ou inacess\xEDvel (${effectiveTargetUrl}). Acionando fallback.`);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.status(404).send(`
              <!DOCTYPE html>
              <html lang="pt-BR">
              <head>
                <meta charset="utf-8">
                <style>
                  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
                </style>
              </head>
              <body>
                <script>
                  try {
                    window.parent.postMessage({ 
                      type: "WATCHPLAY_UNAVAILABLE", 
                      reason: "choice_unavailable"
                    }, "*");
                  } catch(e) {}
                </script>
              </body>
              </html>
            `);
        }
      }
    }
    const isFallbackMode = isSuperflixDetected(html, effectiveTargetUrl) || (upstreamRes.url ? isSuperflixDetected("", upstreamRes.url) : false);
    if (isFallbackMode) {
      console.warn(`[Superflix Banido]: WatchPlayer tentou redirecionar para Superflix (${effectiveTargetUrl}). Bloqueando e acionando fallback.`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <style>
              html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
            </style>
          </head>
          <body>
            <script>
              try {
                window.parent.postMessage({ 
                  type: "WATCHPLAY_UNAVAILABLE", 
                  reason: "superflix_banned" 
                }, "*");
              } catch(e) {}
            </script>
          </body>
          </html>
        `);
    }
    html = html.replace(/<script[^>]*devtools[^>]*><\/script>/gi, "");
    html = html.replace(/<script[^>]*analytics\.js[^>]*><\/script>/gi, "");
    html = html.replace(/<script[^>]*>[\s\S]*?devtoolsDetector[\s\S]*?<\/script>/gi, "");
    html = html.replace(/var AUTO_PLAY_ENABLED = false;/g, "var AUTO_PLAY_ENABLED = true;");
    html = html.replace(/AUTO_PLAY_ENABLED && options\.length == 1/g, "true");
    html = html.replace(/var HOME_URL = ['"]https:\/\/v1\.watchplay\.shop['"];/g, "var HOME_URL = '/api/watchplay-proxy';");
    html = html.replace(/\$\{HOME_URL\}\/api/g, "/api/watchplay-proxy-api");
    html = html.replace(/src=["']\/assets\//g, 'src="https://v1.watchplay.shop/assets/');
    html = html.replace(/href=["']\/assets\//g, 'href="https://v1.watchplay.shop/assets/');
    html = html.replace(/_wau\.push\([^)]*\);?/g, "");
    html = html.replace(/<main[^>]*class=["'][^"']*player-choice[^"']*["'][^>]*>[\s\S]*?<\/main>/gi, "");
    html = html.replace(/<a[^>]*class=["'][^"']*player-back-options[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "");
    html = html.replace(/<div[^>]*class=["'][^"']*changeOptions[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");
    html = html.replace(/Mostrar\s*Op[çc][õo]es/gi, "");
    html = html.replace(/\$\('body'\)\.append\(`<div class="player_loading">[\s\S]*?<\/div>`\);/g, "/* player_loading bloqueado */");
    html = html.replace(/\$\('body'\)\.append\(textoContexto\);/g, "/* notify bloqueado */");
    html = html.replace(/setting:\s*true,/g, "setting: false,");
    html = html.replace(/pip:\s*true,/g, "pip: false,");
    html = html.replace(/playbackRate:\s*true,/g, "playbackRate: false,");
    html = html.replace(/aspectRatio:\s*true,/g, "aspectRatio: false,");
    html = html.replace(/lock:\s*true,/g, "lock: false,");
    html = html.replace(/fastForward:\s*true,/g, "fastForward: false,");
    html = html.replace(/autoOrientation:\s*true,/g, "autoOrientation: false,");
    html = html.replace(/fullscreen:\s*true,/g, "fullscreen: false,");
    html = html.replace(/fullscreenWeb:\s*true,/g, "fullscreenWeb: false,");
    html = html.replace(/createMyPlayer\(\s*\{/g, "window.artInstance = createMyPlayer({ autoplay: true, ");
    html = html.replace(/autoplay:\s*false/g, "autoplay: true");
    html = html.replace(
      /artInstance = new Artplayer\(\{/g,
      `artInstance = new Artplayer({
            controls: [],
            hotkey: false,
            gesture: false,
            miniProgressBar: false,
            backdrop: false,
            playsInline: true,
            autoPlayback: false,
            icons: { state: '' },`
    );
    html = html.replace(
      /maxBufferLength:\s*10,\s*maxMaxBufferLength:\s*20/g,
      `enableWorker: true,
         lowLatencyMode: false,
         maxBufferLength: 60,
         maxMaxBufferLength: 120,
         maxBufferSize: 100 * 1000 * 1000,
         maxBufferHole: 0.5,
         backBufferLength: 90,
         abrEwmaDefaultEstimate: 4000000,
         abrBandWidthFactor: 0.85,
         abrBandWidthUpFactor: 0.7,
         fragLoadingMaxRetry: 6,
         manifestLoadingMaxRetry: 6,
         levelLoadingMaxRetry: 6,
         fragLoadingRetryDelay: 500`
    );
    html = html.replace(
      /<div class="players_select_container">/g,
      '<div class="players_select_container" style="display:none !important; opacity:0 !important; visibility:hidden !important; pointer-events:none !important;">'
    );
    html = html.replace(
      /<div class="player_container">/g,
      '<div class="player_container visible" style="position:absolute !important; top:0 !important; left:0 !important; width:100% !important; height:100% !important; transition:none !important;">'
    );
    html = html.replace(/(src|href)=["']\/assets\/([^"']+)["']/gi, '$1="https://v1.watchplay.shop/assets/$2"');
    html = html.replace(/<head>/i, '<head><base href="https://v1.watchplay.shop/">');
    const autoPlayInjection = `
        <style>
          * {
            -webkit-tap-highlight-color: transparent !important;
          }

          html, body {
            background: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            overflow: hidden !important;
          }

          /* Oculta tudo que n\xE3o for o v\xEDdeo: seletores de op\xE7\xF5es, carrossel, banners, toasts e loaders nativos */
          .players_select_container,
          .player-choice,
          .player-choice-card,
          .player-choice-options,
          .player-choice-option,
          .player-back-options,
          #player-choice-title,
          [class*="player-choice"],
          [class*="player-back"],
          .seasonepisodeSelector,
          .seasonSelector,
          .episodeSelector,
          .player_select_item,
          .player_loading,
          .changeOptions,
          .changeEpisode,
          .btn-opcoes,
          .mostrar_opcoes,
          #mostrar_opcoes,
          .embedder_especial,
          .embedder_info,
          .shion_native_notify_system,
          #_wau_container,
          [class*="player_loading"],
          [class*="seasonepisode"],
          [class*="select_language"],
          [class*="languages_selector"],
          [class*="changeOptions"],
          [class*="players_select"],
          [class*="option"],
          [id*="option"],
          .art-poster {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            z-index: -9999 !important;
          }

          /* Container do player e raiz do Artplayer: SEMPRE vis\xEDveis e em tela cheia */
          .player_container,
          .player_container.visible,
          .player_container .infra,
          #artplayer-container,
          #tv-player,
          .art-video-player {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            opacity: 1 !important;
            visibility: visible !important;
            transition: none !important;
            transform: none !important;
            background: #000 !important;
            pointer-events: auto !important;
          }

          /* O v\xEDdeo original \xE9 a \xFAnica coisa exibida com foco total */
          video,
          .art-video,
          .art-video-player video {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
            opacity: 1 !important;
            visibility: visible !important;
            background: #000 !important;
            z-index: 5 !important;
          }

          /* BLINDAGEM COMPLETA DOS CONTROLES NATIVOS DO ARTPLAYER:
             Oculta a barra de controles e menus nativos para a Skin Netflix assumir,
             mas NUNCA destr\xF3i a camada de v\xEDdeo nem impede o funcionamento do player. */
          .art-top,
          .art-bottom,
          .art-controls,
          .art-controls-left,
          .art-controls-center,
          .art-controls-right,
          .art-settings,
          .art-setting,
          .art-subtitle-setting,
          .art-contextmenu,
          .art-danmuku,
          .art-fast-forward,
          .art-lock,
          .art-poster,
          .art-notice,
          .art-notice-inner,
          .art-info,
          .art-info-panel,
          .art-progress,
          .art-progress-loaded,
          .art-progress-played,
          .art-progress-highlight,
          .art-progress-tip,
          .art-control,
          .art-control-fullscreen,
          .art-control-volume,
          .art-control-play,
          .art-control-time,
          [class*="art-control"],
          .art-volume-panel,
          .art-icon-state,
          .wp-seek-10,
          .wp-seek-back,
          .wp-seek-forward,
          [class*="wp-seek"],
          #pip-skip-intro-btn,
          #pip-skip-toast,
          #tv-player .art-bottom,
          #tv-player .art-controls,
          #tv-player [class*="art-control"],
          #tv-player .art-progress {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            animation: none !important;
          }

          /* Ocultar elementos de estado sem usar display: none para n\xE3o quebrar o Artplayer */
          .art-state,
          .art-layer-state,
          .art-loading,
          .art-layer-loading,
          .art-mask {
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            animation: none !important;
          }
        </style>

        <script>
          (function() {
            // 0. Otimiza\xE7\xE3o Agressiva de Buffer e Fast-Seek no Hls.js
            function applyHlsFastSeekConfig(cfg) {
              if (!cfg) return;
              try {
                cfg.enableWorker = true;
                cfg.lowLatencyMode = false;
                cfg.maxBufferLength = 60; // 60s de buffer \xE0 frente para busca \xE1gil
                cfg.maxMaxBufferLength = 120; // 120s mantidos conforme requisitado
                cfg.backBufferLength = 90; // Libera imediatamente segmentos passados da mem\xF3ria
                cfg.maxBufferSize = 100 * 1000 * 1000;
                cfg.maxBufferHole = 0.5;
                cfg.nudgeOffset = 0.15; // Nudge autom\xE1tico para transpor gaps de keyframe
                cfg.nudgeMaxRetry = 6;
                cfg.maxFragLookUpTolerance = 0.25;
                cfg.highBufferWatchdogPeriod = 1.5;
                cfg.startFragPrefetch = true; // Pr\xE9-busca o pr\xF3ximo segmento ao avan\xE7ar
                cfg.progressive = true; // Decodifica\xE7\xE3o progressiva imediata
                cfg.fragLoadingTimeOut = 20000;
                cfg.fragLoadingMaxRetry = 6;
                cfg.fragLoadingRetryDelay = 500;
                cfg.levelLoadingTimeOut = 20000;
                cfg.levelLoadingMaxRetry = 6;
                cfg.manifestLoadingTimeOut = 20000;
                cfg.manifestLoadingMaxRetry = 6;
              } catch(err) {}
            }

            function patchHlsConstructor(HlsClass) {
              if (!HlsClass || HlsClass.__patchedFastSeek) return HlsClass;
              var OrigHls = HlsClass;
              function PatchedHls(config) {
                config = config || {};
                applyHlsFastSeekConfig(config);
                var inst = new OrigHls(config);
                window.__lastHlsInstance = inst;
                return inst;
              }
              PatchedHls.prototype = OrigHls.prototype;
              Object.keys(OrigHls).forEach(function(k) {
                try { PatchedHls[k] = OrigHls[k]; } catch(e) {}
              });
              if (OrigHls.DefaultConfig) {
                applyHlsFastSeekConfig(OrigHls.DefaultConfig);
                PatchedHls.DefaultConfig = OrigHls.DefaultConfig;
              }
              PatchedHls.__patchedFastSeek = true;
              return PatchedHls;
            }

            if (window.Hls) {
              window.Hls = patchHlsConstructor(window.Hls);
            }
            try {
              var _Hls = window.Hls;
              Object.defineProperty(window, 'Hls', {
                configurable: true,
                enumerable: true,
                get: function() { return _Hls; },
                set: function(val) {
                  _Hls = patchHlsConstructor(val);
                }
              });
            } catch(e) {}

            // 1. MutationObserver que oculta overlays nativos adicionados dinamicamente
            // CUIDADO: n\xE3o ocultar 'art-video-player' (container raiz) nem elementos de v\xEDdeo
            var observer = new MutationObserver(function(mutations) {
              for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                  var node = added[j];
                  if (node.nodeType !== 1) continue;
                  var cls = typeof node.className === 'string' ? node.className : '';
                  var tag = (node.tagName || '').toUpperCase();
                  // Remove poster padrao para evitar imagem de fundo (fundo cinza piscando)
                  if (tag === 'VIDEO') {
                    node.setAttribute('poster', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
                  }
                  // Nunca tocar no container raiz do Artplayer nem nos elementos de v\xEDdeo para outras propriedades
                  if (cls.indexOf('art-video-player') !== -1 || tag === 'VIDEO') continue;
                  // Ocultar apenas elementos de overlay nativos desnecess\xE1rios
                  if (
                    cls.indexOf('player_loading') !== -1 ||
                    cls.indexOf('shion_native') !== -1 ||
                    cls === 'art-state' ||
                    cls === 'art-mask' ||
                    cls === 'art-loading' ||
                    cls === 'art-notice' ||
                    cls === 'art-notice-inner'
                  ) {
                    if (cls !== 'art-state' && cls !== 'art-mask' && cls !== 'art-loading') {
                      node.style.setProperty('display', 'none', 'important');
                    }
                    node.style.setProperty('opacity', '0', 'important');
                    node.style.setProperty('visibility', 'hidden', 'important');
                    node.style.setProperty('pointer-events', 'none', 'important');
                  }
                }
              }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });

            // 2. Auto-Start r\xE1pido e resiliente para filmes e s\xE9ries
            var tries = 0;
            var optionClicked = false;
            var autoStartTimer = setInterval(function() {
              tries++;

              // D) Detec\xE7\xE3o proativa do v\xEDdeo (Filmes via #tv-player e S\xE9ries)
              var v = getVideoElement();
              if (v) {
                // Se o v\xEDdeo estiver pausado mas j\xE1 com metadados ou pronto, tenta dar play
                if (v.paused && (v.readyState >= 1 || v.currentTime > 0)) {
                  v.play().catch(function() {
                    v.muted = true;
                    v.play().then(function() {
                      try { window.parent.postMessage({ type: "WATCHPLAY_AUTOPLAY_MUTED" }, "*"); } catch(e) {}
                    }).catch(function() {});
                  });
                }
                // Se j\xE1 possui dura\xE7\xE3o v\xE1lida ou est\xE1 reproduzindo, envia status e estabiliza
                if ((v.duration > 0 && !isNaN(v.duration)) || v.currentTime > 0 || !v.paused) {
                  sendPlayerStatus(v);
                  if (!v.paused) {
                    clearInterval(autoStartTimer);
                    return;
                  }
                }
              }

              // A) S\xE9ries: aciona getepi imediatamente no epis\xF3dio selecionado sem esperar dezenas de miniaturas
              var ep = document.querySelector('.episodeOption.active') || document.querySelector('.episodeOption');
              if (ep && window.$ && typeof window.getepi === 'function' && !window._epAutoTriggered) {
                window._epAutoTriggered = true;
                window.$(ep).removeClass('active');
                window.getepi(window.$(ep));
              }

              // B) Seletor de \xE1udio (Dublado preferencialmente)
              var dublado = document.querySelector('.select_language[data-target="1"]');
              if (dublado && !dublado.classList.contains('active')) {
                dublado.click();
              }

              // C) Clica na op\xE7\xE3o de player assim que surgir (preferindo sempre vers\xF5es com qualidade normal HD/FHD)
              if (!optionClicked) {
                var choiceOptions = Array.prototype.slice.call(document.querySelectorAll('.player-choice-option, a[href*="player="]'));
                if (choiceOptions.length > 0) {
                  // Filtra priorizando op\xE7\xF5es que N\xC3O sejam CAM/Cinema
                  var bestChoice = null;
                  var bestScore = -999;
                  for (var c = 0; c < choiceOptions.length; c++) {
                    var txt = (choiceOptions[c].textContent || '').toLowerCase();
                    var href = choiceOptions[c].getAttribute('href') || '';
                    var score = 0;
                    if (txt.includes('cam') || txt.includes('cinema') || txt.includes('ts') || href.includes('cam')) score -= 100;
                    if (txt.includes('dublado') || txt.includes('pt-br')) score += 10;
                    if (txt.includes('hd') || txt.includes('fhd') || txt.includes('1080')) score += 50;
                    
                    score += (c * 0.1); // Desempate preferindo as \xFAltimas op\xE7\xF5es (frequentemente as em HD)
                    
                    if (score > bestScore) {
                      bestScore = score;
                      bestChoice = choiceOptions[c];
                    }
                  }

                  if (!bestChoice) {
                    bestChoice = choiceOptions[choiceOptions.length - 1];
                  }

                  if (bestChoice && bestChoice.getAttribute('href')) {
                    optionClicked = true;
                    var optHref = bestChoice.getAttribute('href');
                    if (optHref) window.location.href = optHref;
                    return;
                  }
                }

                var selectItems = Array.prototype.slice.call(document.querySelectorAll('.players_select_items.visible .player_select_item, .player_select_item'));
                if (selectItems.length > 0) {
                  var bestItem = null;
                  var bestItemScore = -999;
                  for (var s = 0; s < selectItems.length; s++) {
                    var sTxt = (selectItems[s].textContent || '').toLowerCase();
                    var score = 0;
                    if (sTxt.includes('cam') || sTxt.includes('cinema') || sTxt.includes('ts')) score -= 100;
                    if (sTxt.includes('dublado') || sTxt.includes('pt-br')) score += 10;
                    if (sTxt.includes('hd') || sTxt.includes('fhd') || sTxt.includes('1080')) score += 50;
                    
                    score += (s * 0.1);
                    
                    if (score > bestItemScore) {
                      bestItemScore = score;
                      bestItem = selectItems[s];
                    }
                  }
                  if (!bestItem) {
                    bestItem = selectItems[selectItems.length - 1];
                  }
                  optionClicked = true;
                  bestItem.click();
                } else if (!document.querySelector('#tv-player') && !document.querySelector('video') && !window.artInstance) {
                  // S\xF3 aciona indisponibilidade se N\xC3O for um player direto de filme (#tv-player) e n\xE3o houver v\xEDdeo ap\xF3s tempo razo\xE1vel
                  if (tries > 40 && document.querySelectorAll(".player_select_item").length === 0) {
                    clearInterval(autoStartTimer);
                    try { window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "no_sources" }, "*"); } catch(e){}
                    return;
                  }
                }
              }

              // Timeout ap\xF3s 100 ticks (6.0 segundos sem stream v\xE1lido)
              if (tries > 100) {
                clearInterval(autoStartTimer);
                if (!v || (!v.duration && v.currentTime === 0 && v.paused)) {
                  try {
                    window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "timeout_no_stream" }, "*");
                  } catch(e) {}
                }
              }
            }, 60);

            // 3. Fun\xE7\xF5es de controle de v\xEDdeo e telemetria para o NetflixPlayerSkin
            var introSkippedForCurrentVideo = false;
            var skipDurationSeconds = 85;
            try {
              skipDurationSeconds = parseInt(localStorage.getItem("playinfinity_skip_duration") || "85", 10);
            } catch(e) {}

            function getVideoElement() {
              if (window.artInstance && window.artInstance.video) {
                return window.artInstance.video;
              }
              return document.querySelector("video");
            }

            function triggerPlay() {
              if (window.artInstance && typeof window.artInstance.play === "function") {
                try { window.artInstance.play(); } catch(e) {}
              }
              var v = getVideoElement();
              if (v) {
                v.play().catch(function() {
                  v.muted = true;
                  v.play().then(function() {
                    try { window.parent.postMessage({ type: "WATCHPLAY_AUTOPLAY_MUTED" }, "*"); } catch(e) {}
                  }).catch(function() {});
                });
                sendPlayerStatus(v);
              }
            }

            function triggerPause() {
              if (window.artInstance && typeof window.artInstance.pause === "function") {
                try { window.artInstance.pause(); } catch(e) {}
              }
              var v = getVideoElement();
              if (v) {
                v.pause();
                sendPlayerStatus(v);
              }
            }

            function triggerTogglePlay() {
              if (window.artInstance && typeof window.artInstance.toggle === "function") {
                try {
                  window.artInstance.toggle();
                  var v = getVideoElement();
                  if (v) sendPlayerStatus(v);
                  return;
                } catch(e) {}
              }
              var v = getVideoElement();
              if (v) {
                if (v.paused) {
                  triggerPlay();
                } else {
                  triggerPause();
                }
              }
            }

            function doSkipIntro(seconds) {
              var sec = Number(seconds) !== undefined && !isNaN(Number(seconds)) ? Number(seconds) : (skipDurationSeconds || 85);
              var video = getVideoElement();
              if (video) {
                var current = video.currentTime || 0;
                var duration = video.duration || 3600;
                var targetTime = Math.max(0, Math.min(current + sec, duration - 10));
                
                try {
                  video.currentTime = targetTime;
                } catch(e) {}

                if (window.artInstance) {
                  try {
                    window.artInstance.currentTime = targetTime;
                  } catch(e) {}
                }

                if (sec > 0) {
                  introSkippedForCurrentVideo = true;
                }

                try {
                  window.parent.postMessage({ 
                    type: "WATCHPLAY_INTRO_SKIPPED", 
                    seconds: sec, 
                    newTime: targetTime 
                  }, "*");
                } catch(e) {}
              }
            }

            var seekStallWatchdog = null;
            function monitorSeekProgress(targetTime) {
              if (seekStallWatchdog) clearInterval(seekStallWatchdog);
              var checkCount = 0;
              var lastPos = targetTime;
              seekStallWatchdog = setInterval(function() {
                checkCount++;
                var v = getVideoElement();
                if (!v) {
                  if (checkCount > 10) clearInterval(seekStallWatchdog);
                  return;
                }
                // Se o v\xEDdeo j\xE1 est\xE1 avan\xE7ando normalmente
                if (Math.abs(v.currentTime - lastPos) > 0.15) {
                  clearInterval(seekStallWatchdog);
                  return;
                }
                // Verifica se a posi\xE7\xE3o j\xE1 est\xE1 em buffer na mem\xF3ria
                var isBuffered = false;
                if (v.buffered && v.buffered.length > 0) {
                  for (var b = 0; b < v.buffered.length; b++) {
                    if (v.currentTime >= v.buffered.start(b) - 0.2 && v.currentTime <= v.buffered.end(b) + 0.2) {
                      isBuffered = true;
                      break;
                    }
                  }
                }
                // Se j\xE1 baixou no buffer mas travou em gap de keyframe
                if (isBuffered && checkCount >= 3) {
                  try {
                    v.currentTime = v.currentTime + 0.12;
                  } catch(err) {}
                  v.play().catch(function() {});
                  clearInterval(seekStallWatchdog);
                  return;
                }
                // Se ainda est\xE1 baixando da rede, apenas garante que o HLS est\xE1 carregando
                var activeHls = (window.artInstance && window.artInstance.hls) || window.__lastHlsInstance;
                if (activeHls && typeof activeHls.startLoad === "function") {
                  try { activeHls.startLoad(targetTime); } catch(err) {}
                }
                if (!v.paused) {
                  v.play().catch(function() {});
                }
                lastPos = v.currentTime;
                if (checkCount > 10) clearInterval(seekStallWatchdog);
              }, 400);
            }

            // Tecla S manual
            window.addEventListener("keydown", function(e) {
              if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
              if (e.key === "s" || e.key === "S") {
                e.preventDefault();
                doSkipIntro(skipDurationSeconds);
              }
            });

            // Mensagens enviadas pela Skin Netflix VIP
            window.addEventListener("message", function(e) {
                  if (e.data && e.data.type === 'SET_SUBTITLE_URL') {
                      var vid = window.artInstance ? window.artInstance.video : (typeof art !== 'undefined' && art.video ? art.video : document.querySelector('video'));
                      if (!vid) vid = document.querySelector('video');
                      if (vid) {
                          var oldTrack = document.getElementById('playinfinity-subtitle');
                          if (oldTrack) { oldTrack.remove(); }
                          if (e.data.url) {
                              var track = document.createElement('track');
                              track.id = 'playinfinity-subtitle';
                              track.kind = 'captions';
                              track.label = e.data.label || 'Portugu\xEAs (Brasil)';
                              track.srclang = 'pt-BR';
                              track.src = e.data.url;
                              track.default = true;
                              vid.appendChild(track);
                              // Espera carregar para for\xE7ar o modo showing
                              if (e.data.show !== false) { track.addEventListener('load', function() { this.mode = 'showing'; }); }
                          }
                      }
                      return;
                  }
                  if (e.data && e.data.type === 'SHOW_SUBTITLE') {
                      var tr = document.getElementById('playinfinity-subtitle');
                      if (tr) {
                          tr.mode = e.data.show ? 'showing' : 'hidden';
                      }
                      return;
                  }

              if (!e.data) return;
              var v = getVideoElement();

              switch (e.data.type) {
                case "SKIP_INTRO":
                  doSkipIntro(e.data.seconds || skipDurationSeconds);
                  break;

                case "PLAY":
                  triggerPlay();
                  break;

                case "PAUSE":
                  triggerPause();
                  break;

                case "TOGGLE_PLAY":
                  triggerTogglePlay();
                  break;

                case "SEEK":
                case "SEEK_ABSOLUTE":
                  case "SEEK_RELATIVE":
                    var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                  if (typeof t === "number" && !isNaN(t)) {
                    var maxDur = (v && v.duration > 0) ? v.duration : ((window.artInstance && window.artInstance.duration > 0) ? window.artInstance.duration : 99999);
                    var targetTime = Math.max(0, Math.min(t, maxDur - 0.5));
                    var activeHls = (window.artInstance && window.artInstance.hls) || window.__lastHlsInstance;
                    if (activeHls && typeof activeHls.startLoad === "function") {
                      try { activeHls.startLoad(targetTime); } catch(err) {}
                    }
                    if (window.artInstance) {
                      try { window.artInstance.seek = targetTime; } catch(err) {}
                      try { window.artInstance.currentTime = targetTime; } catch(err) {}
                    }
                    if (v) {
                      try { v.currentTime = targetTime; } catch(err) {}
                      sendPlayerStatus(v);
                      if (e.data.resumePlay || (e.data.wasPlaying !== false && !v.paused)) {
                        v.play().catch(function() {});
                      }
                    }
                    monitorSeekProgress(targetTime);
                  }
                  break;

                case "SEEK_RELATIVE":
                  if (typeof e.data.seconds === "number" && !isNaN(e.data.seconds)) {
                    var curT = (v && typeof v.currentTime === "number") ? v.currentTime : ((window.artInstance && window.artInstance.currentTime) || 0);
                    var maxD = (v && v.duration > 0) ? v.duration : ((window.artInstance && window.artInstance.duration > 0) ? window.artInstance.duration : 99999);
                    var newTime = typeof e.data.time === "number" && !isNaN(e.data.time)
                      ? Math.max(0, Math.min(e.data.time, maxD - 0.5))
                      : Math.max(0, Math.min(curT + e.data.seconds, maxD - 0.5));
                    var activeHlsRel = (window.artInstance && window.artInstance.hls) || window.__lastHlsInstance;
                    if (activeHlsRel && typeof activeHlsRel.startLoad === "function") {
                      try { activeHlsRel.startLoad(newTime); } catch(err) {}
                    }
                    if (window.artInstance) {
                      try { window.artInstance.seek = newTime; } catch(err) {}
                      try { window.artInstance.currentTime = newTime; } catch(err) {}
                    }
                    if (v) {
                      try { v.currentTime = newTime; } catch(err) {}
                      sendPlayerStatus(v);
                      if (e.data.resumePlay || (e.data.wasPlaying !== false && !v.paused)) {
                        v.play().catch(function() {});
                      }
                    }
                    monitorSeekProgress(newTime);
                  }
                  break;

                case "SET_VOLUME":
                  if (v && typeof e.data.volume === "number") {
                    var vol = Math.max(0, Math.min(1, e.data.volume));
                    v.volume = vol;
                    v.muted = (vol === 0);
                    sendPlayerStatus(v);
                  }
                  break;

                case "SET_MUTED":
                  if (v) {
                    v.muted = !!e.data.muted;
                    sendPlayerStatus(v);
                  }
                  break;

                case "SET_PLAYBACK_RATE":
                  if (v && typeof e.data.rate === "number") {
                    v.playbackRate = e.data.rate;
                    sendPlayerStatus(v);
                  }
                  break;

                case "SET_SKIP_DURATION":
                  if (e.data.seconds) {
                    skipDurationSeconds = Number(e.data.seconds);
                    try {
                      localStorage.setItem("playinfinity_skip_duration", String(skipDurationSeconds));
                    } catch(err) {}
                  }
                  break;

                case "TOGGLE_PIP":
                case "REQUEST_PIP":
                  if (v) {
                    try {
                      if (document.pictureInPictureElement) {
                        document.exitPictureInPicture().catch(function() {});
                      } else if (v.requestPictureInPicture) {
                        v.requestPictureInPicture().catch(function() {});
                      }
                    } catch(err) {}
                  }
                  break;

                case "REQUEST_STATUS":
                  sendPlayerStatus(v);
                  break;
              }
            });

            // Envia telemetria limpa para a Skin Netflix do aplicativo principal
            function sendPlayerStatus(v) {
              if (!v) v = getVideoElement();
              if (!v) return;
              try {
                var bufferedEnd = 0;
                if (v.buffered && v.buffered.length > 0) {
                  bufferedEnd = v.buffered.end(v.buffered.length - 1);
                }
                var dur = v.duration;
                if ((!dur || isNaN(dur) || dur === Infinity) && window.artInstance && window.artInstance.duration) {
                  dur = window.artInstance.duration;
                }
                if (!dur || isNaN(dur) || dur === Infinity) {
                  dur = 0;
                }
                window.parent.postMessage({
                  type: "WATCHPLAY_STATUS",
                  currentTime: v.currentTime || 0,
                  duration: dur,
                  paused: !!v.paused,
                  muted: !!v.muted,
                  volume: typeof v.volume === "number" ? v.volume : 1,
                  buffered: bufferedEnd,
                  playbackRate: v.playbackRate || 1,
                  readyState: v.readyState || 0
                }, "*");
              } catch(e) {}
            }

            var hasNotifiedEnded = false;
            function notifyEpisodeEnded() {
              if (hasNotifiedEnded) return;
              hasNotifiedEnded = true;
              try {
                window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
              } catch(e) {}
            }

            document.addEventListener('ended', function(e) {
              if (e.target && (e.target.tagName === 'VIDEO' || e.target.nodeName === 'VIDEO')) {
                notifyEpisodeEnded();
              }
            }, true);

            function handleVideoTimeUpdate(v) {
              if (!v) return;
              var cur = v.currentTime || 0;
              var dur = v.duration || 0;

              if (cur < 2 && introSkippedForCurrentVideo) {
                introSkippedForCurrentVideo = false;
              }

              if (cur >= 5 && cur <= 130 && !introSkippedForCurrentVideo) {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_INTRO_ACTIVE", active: true, currentTime: cur }, "*");
                } catch(e) {}
              } else {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_INTRO_ACTIVE", active: false, currentTime: cur }, "*");
                } catch(e) {}
              }

              if (dur > 30 && cur >= (dur - 1.5)) {
                notifyEpisodeEnded();
              }

              sendPlayerStatus(v);
            }

            setInterval(function() {
              var v = getVideoElement();
              if (v) {
                sendPlayerStatus(v);
                if (!v.paused) {
                  handleVideoTimeUpdate(v);
                }
              }
            }, 250);

            ['play', 'pause', 'playing', 'timeupdate', 'waiting', 'stalled', 'seeking', 'seeked', 'volumechange', 'ratechange', 'loadedmetadata', 'canplay'].forEach(function(evtName) {
              document.addEventListener(evtName, function(e) {
                if (e.target && (e.target.tagName === 'VIDEO' || e.target.nodeName === 'VIDEO')) {
                  sendPlayerStatus(e.target);
                }
              }, true);
            });

            // Detec\xE7\xE3o de erros no stream de v\xEDdeo ou perda de conex\xE3o para acionar fallback autom\xE1tico
            document.addEventListener('error', function(e) {
              if (e.target && (e.target.tagName === 'VIDEO' || e.target.nodeName === 'VIDEO')) {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "video_playback_error" }, "*");
                } catch(err) {}
              }
            }, true);

            window.addEventListener('offline', function() {
              try {
                window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "network_offline" }, "*");
              } catch(err) {}
            });

            // Monitor e Auto-Healer de Integridade \xC1udio/V\xEDdeo (A/V Sync & Frame Freeze Recovery)
            // Corrige automaticamente quando a voz/\xE1udio continua mas a imagem do v\xEDdeo congela no navegador/GPU
            (function initAVSyncAutoHealer() {
              var lastFrameCallbackTime = Date.now();
              var lastCheckedCurrentTime = 0;
              var lastTotalFrames = 0;
              var stallTicks = 0;
              var isHealing = false;
              var lastHealAt = 0;

              function trackFrameRender(v) {
                if (!v) return;
                if (typeof v.requestVideoFrameCallback === 'function' && !v._rvfcActive) {
                  v._rvfcActive = true;
                  function onFrame() {
                    lastFrameCallbackTime = Date.now();
                    if (v && !v.paused) {
                      v.requestVideoFrameCallback(onFrame);
                    } else if (v) {
                      v._rvfcActive = false;
                    }
                  }
                  try {
                    v.requestVideoFrameCallback(onFrame);
                  } catch(e) {
                    v._rvfcActive = false;
                  }
                }
              }

              function checkAVHealth() {
                var v = getVideoElement();
                if (!v) return;

                trackFrameRender(v);

                if (v.paused || v.ended || v.seeking || v.readyState < 2) {
                  stallTicks = 0;
                  lastCheckedCurrentTime = v.currentTime || 0;
                  return;
                }

                var now = Date.now();
                var cur = v.currentTime || 0;
                var audioMovingForward = cur > (lastCheckedCurrentTime + 0.35);
                lastCheckedCurrentTime = cur;

                if (audioMovingForward) {
                  var frameIsFresh = false;

                  if (typeof v.requestVideoFrameCallback === 'function') {
                    if ((now - lastFrameCallbackTime) < 1800) {
                      frameIsFresh = true;
                    }
                  }

                  if (typeof v.getVideoPlaybackQuality === 'function') {
                    try {
                      var q = v.getVideoPlaybackQuality();
                      if (q && typeof q.totalVideoFrames === 'number') {
                        if (q.totalVideoFrames > lastTotalFrames) {
                          frameIsFresh = true;
                          lastTotalFrames = q.totalVideoFrames;
                        }
                      }
                    } catch(e) {}
                  }

                  // Se o \xE1udio est\xE1 avan\xE7ando h\xE1 mais de 1.5s mas NENHUM frame de v\xEDdeo foi apresentado:
                  if (!frameIsFresh && (typeof v.requestVideoFrameCallback === 'function' || typeof v.getVideoPlaybackQuality === 'function')) {
                    stallTicks++;
                    if (stallTicks >= 2 && (now - lastHealAt > 3500) && !isHealing) {
                      console.warn('[Play Infinity A/V Sync] Imagem congelada com \xE1udio em reprodu\xE7\xE3o detectada. Executando auto-healing instant\xE2neo...');
                      isHealing = true;
                      lastHealAt = now;
                      stallTicks = 0;

                      try {
                        var hls = (window.artInstance && window.artInstance.hls) || window.hls;
                        if (hls && typeof hls.recoverMediaError === 'function') {
                          try { hls.recoverMediaError(); } catch(he) {}
                        }

                        // Micro-nudge no decodificador de v\xEDdeo para desobstruir o pipeline da GPU sem perda de posi\xE7\xE3o
                        var nowPos = v.currentTime;
                        v.currentTime = nowPos + 0.005;

                        v._rvfcActive = false;
                        trackFrameRender(v);
                      } catch(err) {
                        console.error('[Play Infinity A/V Recovery Error]:', err);
                      } finally {
                        setTimeout(function() { isHealing = false; }, 800);
                      }
                    }
                  } else {
                    stallTicks = 0;
                  }
                }
              }

              setInterval(checkAVHealth, 800);
            })();

            // Blindagem do Artplayer: oculta controles via style (N\xC3O remove do DOM para n\xE3o quebrar o player)
            var cleanArtNodes = function() {
              if (window.artInstance) {
                try {
                  if (window.artInstance.controls) window.artInstance.controls.show = false;
                } catch(e) {}
                // Ocultar via style apenas barras nativas de controle e avisos, sem bloquear a camada de v\xEDdeo e estado
                if (window.artInstance.template) {
                  ['$bottom', '$top', '$notice', '$controls', '$state', '$mask', '$loading'].forEach(function(k) {
                    try {
                      var el = window.artInstance.template[k];
                      if (el && el.style) {
                        if (k !== '$state' && k !== '$mask' && k !== '$loading') {
                          el.style.setProperty('display', 'none', 'important');
                        }
                        el.style.setProperty('opacity', '0', 'important');
                        el.style.setProperty('visibility', 'hidden', 'important');
                        el.style.setProperty('pointer-events', 'none', 'important');
                      }
                    } catch(e) {}
                  });
                }
              }
            };

            var artCheckInterval = setInterval(function() {
              if (window.artInstance) {
                cleanArtNodes();
                if (!window.artInstance._endedHooked) {
                  window.artInstance._endedHooked = true;
                  cleanArtNodes();
                  window.artInstance.on('ready', cleanArtNodes);
                  window.artInstance.on('video:play', cleanArtNodes);
                  window.artInstance.on('video:pause', cleanArtNodes);
                  window.artInstance.on('video:ended', notifyEpisodeEnded);
                  window.artInstance.on('error', function() {
                    try { window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "art_error" }, "*"); } catch(e) {}
                  });
                  window.artInstance.on('video:timeupdate', function() {
                    var v = window.artInstance.video;
                    if (v) handleVideoTimeUpdate(v);
                  });
                }
              }
            }, 300);
          })();
        </script>
      `;
    html = html.replace("</head>", `${autoPlayInjection}</head>`);
    const m3u8Match = html.match(/url:\s*["']([^"']+\.m3u8[^"']*)["']/i);
    if (m3u8Match) {
      let testUrl = m3u8Match[1].replace(/\\/g, "");
      try {
        const cdnCheck = await fetch(testUrl, {
          method: "HEAD",
          headers: { "Referer": effectiveTargetUrl, "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(1800)
        });
        if (cdnCheck.status === 404) {
          console.warn(`[WatchPlayer Stream]: CDN retornou 404 para o manifesto m3u8 (${testUrl}). Acionando indisponibilidade para fallback imediato.`);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.send(`
              <!DOCTYPE html>
              <html lang="pt-BR">
              <head><meta charset="utf-8"></head>
              <body style="background:#000;">
                <script>
                  try {
                    window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "cdn_404" }, "*");
                  } catch(e) {}
                </script>
              </body>
              </html>
            `);
        }
      } catch (e) {
      }
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.warn("[WatchPlayer Stream Error]:", err.message, "- Acionando fallback seguro.");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
          </style>
        </head>
        <body>
          <script>
            try {
              window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "stream_error" }, "*");
            } catch(e) {}
          </script>
        </body>
        </html>
      `);
  }
});
router5.get("/api/check-season", async (req3, res) => {
  try {
    const tmdbId = String(req3.query.tmdbId || "").trim();
    const season = parseInt(String(req3.query.season || ""), 10);
    const count = Math.min(Math.max(parseInt(String(req3.query.count || "24"), 10) || 24, 1), 100);
    if (!tmdbId || !season || Number.isNaN(season)) {
      return res.status(400).json({ success: false, error: "Par\xE2metros 'tmdbId' e 'season' s\xE3o obrigat\xF3rios." });
    }
    const forceRefresh = req3.query.force_refresh === "true" || req3.query.force_refresh === "1" || Boolean(req3.query._cb);
    const cacheKey = `${tmdbId}_${season}_${count}`;
    const cached = !forceRefresh ? seasonAvailabilityCache.get(cacheKey) : null;
    if (cached) {
      return res.json({
        success: true,
        id: tmdbId,
        season,
        availableEpisodes: cached.episodes,
        totalAvailable: cached.episodes.length,
        cached: true
      });
    }
    const numericId = parseInt(tmdbId, 10);
    const catalogEpisodeNumbers = /* @__PURE__ */ new Set();
    try {
      for (const epNum of getEncontreiSeasonEpisodes(numericId, season)) {
        catalogEpisodeNumbers.add(epNum);
      }
    } catch (err) {
      console.warn("[check-season] Aviso ao checar cat\xE1logos locais:", err);
    }
    if (catalogEpisodeNumbers.size >= count) {
      const sortedEps = Array.from(catalogEpisodeNumbers).sort((a, b) => a - b);
      seasonAvailabilityCache.set(cacheKey, { episodes: sortedEps, timestamp: Date.now() });
      return res.json({
        success: true,
        id: tmdbId,
        season,
        availableEpisodes: sortedEps,
        totalAvailable: sortedEps.length,
        cached: false
      });
    }
    const isCheckUnavailable = (content, url, status) => {
      if (status >= 400) return true;
      const lowerUrl = (url || "").toLowerCase();
      if (lowerUrl.includes("/login") || lowerUrl.includes("/admin") || lowerUrl.includes("/painel")) return true;
      const lower = (content || "").toLowerCase();
      return lower.includes("login-card") || lower.includes("login-page") || lower.includes("entrar \u2022 myplayer") || lower.includes("painel administrativo") || lower.includes("myplayer") && (lower.includes("bem-vindo") || lower.includes("bem vindo")) || lower.includes("s\xE9rie n\xE3o encontrada") || lower.includes("serie n\xE3o encontrada") || lower.includes("filme n\xE3o encontrado") || lower.includes("acesso protegido por sess\xE3o segura");
    };
    const cachedPrefixObj = watchPlayerWorkingPrefixCache.get(tmdbId);
    const prefix = cachedPrefixObj && Date.now() - cachedPrefixObj.timestamp < PREFIX_CACHE_TTL ? cachedPrefixObj.prefix : "tvshow";
    const checkEpisode = async (episode) => {
      const checkNixplay = async () => {
        try {
          const ss = String(season).padStart(3, "0");
          const ee = String(episode).padStart(3, "0");
          const streamId = `${tmdbId}${ss}${ee}`;
          const nixUrl = `https://nixplay.lat/series/testelogado-vods/GwXanZ3Dj/${streamId}.mp4`;
          const nController = new AbortController();
          const nTimeout = setTimeout(() => nController.abort(), 3500);
          const nixRes = await fetch(nixUrl, {
            headers: { Range: "bytes=0-100" },
            signal: nController.signal
          });
          clearTimeout(nTimeout);
          return nixRes.status === 206 && nixRes.headers.get("content-type") === "video/mp4";
        } catch {
          return false;
        }
      };
      const fallbackCheck = async () => {
        const nix = await checkNixplay();
        if (nix) return true;
        try {
          const vizerOk = await checkVizerSeason(numericId, season);
          if (vizerOk) return true;
        } catch {
        }
        try {
          const vipOk = await checkVipSeason(numericId, season);
          if (vipOk) return true;
        } catch {
        }
        try {
          const vsOk = await checkVidsrcSeason(numericId, season);
          if (vsOk) return true;
        } catch {
        }
        return false;
      };
      const url = `https://v1.watchplay.shop/${prefix}/${encodeURIComponent(tmdbId)}/${season}/${episode}`;
      const commonHeaders = {
        "Referer": "https://v1.watchplay.shop/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      };
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8e3);
        let upstream = await fetch(url, {
          headers: commonHeaders,
          redirect: "manual",
          signal: controller.signal
        });
        if (upstream.status >= 300 && upstream.status < 400) {
          const loc = upstream.headers.get("location") || "";
          if (loc.includes("/login") || loc.includes("/admin") || loc.includes("/painel")) {
            clearTimeout(timeoutId);
            return await fallbackCheck();
          }
          try {
            const redirectedUrl = new URL(loc, url).toString();
            upstream = await fetch(redirectedUrl, { headers: commonHeaders, signal: controller.signal });
          } catch {
            clearTimeout(timeoutId);
            return await fallbackCheck();
          }
        }
        if (upstream.status >= 400) {
          clearTimeout(timeoutId);
          return await fallbackCheck();
        }
        const html = await upstream.text();
        clearTimeout(timeoutId);
        const wpAvailable = !isCheckUnavailable(html, upstream.url || url, upstream.status);
        if (wpAvailable) return true;
        return await fallbackCheck();
      } catch {
        return await fallbackCheck();
      }
    };
    const CONCURRENCY = 5;
    const isAvailable = new Array(count).fill(false);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, count) }, async () => {
      while (cursor < count) {
        const idx = cursor++;
        isAvailable[idx] = await checkEpisode(idx + 1);
      }
    });
    await Promise.all(workers);
    const availableEpisodes = Array.from(
      /* @__PURE__ */ new Set([
        ...Array.from(catalogEpisodeNumbers),
        ...isAvailable.map((ok, idx) => ok ? idx + 1 : null).filter((n) => n !== null)
      ])
    ).sort((a, b) => a - b);
    seasonAvailabilityCache.set(cacheKey, { episodes: availableEpisodes, timestamp: Date.now() });
    res.json({
      success: true,
      id: tmdbId,
      season,
      availableEpisodes,
      totalAvailable: availableEpisodes.length,
      cached: false
    });
  } catch (err) {
    console.error("[check-season] Erro ao verificar disponibilidade da temporada:", err);
    res.status(500).json({ success: false, error: "Falha ao verificar disponibilidade da temporada." });
  }
});
router5.get("/api/live-stream-proxy", async (req3, res) => {
  try {
    const origin = req3.headers.origin;
    const isAllowedOrigin = !origin || /^(https?:\/\/)?(localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/i.test(origin) || /^capacitor:\/\/localhost$/i.test(origin) || /^ionic:\/\/localhost$/i.test(origin) || /^(https?:\/\/)?([a-zA-Z0-9-]+\.)*play-infinity\.stream$/i.test(origin) || /^(https?:\/\/)?play-infinity-[a-zA-Z0-9-]+\.run\.app$/i.test(origin);
    if (origin) {
      if (isAllowedOrigin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      } else {
        return res.status(403).send("Acesso negado: Origem n\xE3o autorizada.");
      }
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req3.method === "OPTIONS") {
      return res.status(204).end();
    }
    const rawUrl = req3.query.url;
    if (!rawUrl) return res.status(400).send("URL ausente");
    let parsed;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      return res.status(400).send("Formato de URL inv\xE1lido");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return res.status(403).send("Protocolo inv\xE1lido.");
    }
    if (await isPrivateOrLocalHost(parsed.hostname)) {
      return res.status(403).send("Acesso a IP privado, local ou metadados de nuvem bloqueado (Anti-SSRF).");
    }
    const signature = req3.query.sig;
    const isSignatureValid = signature && verifyProxySignature(rawUrl, signature);
    if (!isSignatureValid && !isAllowedLiveStreamingDomain(parsed.hostname)) {
      return res.status(403).send("Dom\xEDnio n\xE3o autorizado para proxy de streaming.");
    }
    const isSegment = req3.query.is_segment === "true" || rawUrl.includes(".ts") || rawUrl.includes(".m4s") || rawUrl.includes(".mp4");
    const isM3U8Request = rawUrl.includes(".m3u8");
    const cached = isM3U8Request ? liveChunkCache.get(rawUrl) : null;
    if (cached && cached.expires > Date.now()) {
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=2, immutable");
      res.setHeader("X-Cache-Status", "HIT-MEMORY");
      return res.send(cached.buffer);
    }
    const masterUrl = req3.query.master;
    const vidx = req3.query.vidx;
    const masterSig = req3.query.msig;
    if (masterUrl && vidx && masterSig && verifyProxySignature(masterUrl, masterSig)) {
      const variantKey = `${masterUrl}|${vidx}`;
      const freshVariantUrl = liveVariantRefreshCache.get(variantKey);
      if (freshVariantUrl && freshVariantUrl !== rawUrl) {
        req3.query.url = freshVariantUrl;
      }
    }
    let currentUrl = req3.query.url || rawUrl;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*"
    };
    if (req3.query.referer) {
      headers["Referer"] = req3.query.referer;
    }
    let upstreamRes;
    let redirects = 0;
    const MAX_REDIRECTS = 5;
    let upstreamText = null;
    while (redirects < MAX_REDIRECTS) {
      const fetchController = new AbortController();
      const fetchTimeout = setTimeout(() => fetchController.abort(), 12e3);
      upstreamRes = await fetch(currentUrl, {
        headers,
        redirect: "manual",
        signal: fetchController.signal
      });
      clearTimeout(fetchTimeout);
      let isInvalidManifest = false;
      if (upstreamRes.ok && masterUrl && vidx) {
        const cType = upstreamRes.headers.get("content-type") || "";
        const isReqM3U8 = req3.query.is_manifest === "true" || currentUrl.includes(".m3u8") || cType.includes("mpegurl");
        if (isReqM3U8) {
          const text = await upstreamRes.text();
          upstreamText = text;
          if (!text.includes("#EXTM3U")) {
            isInvalidManifest = true;
            console.log(`[Proxy] Upstream 200 mas manifesto inv\xE1lido. Tentando renovar mestre para variante ${vidx}`);
          }
        }
      }
      if ((!upstreamRes.ok || isInvalidManifest) && masterUrl && vidx && masterSig && verifyProxySignature(masterUrl, masterSig)) {
        try {
          const mRes = await fetch(masterUrl, { headers, redirect: "follow", signal: AbortSignal.timeout(8e3) });
          if (mRes.ok) {
            const mTxt = await mRes.text();
            if (mTxt.includes("#EXTM3U")) {
              let vIdxCounter = 0;
              let newVariant = "";
              const mLines = mTxt.split("\n").map((l) => l.trim());
              for (const line of mLines) {
                if (line && !line.startsWith("#")) {
                  if (vIdxCounter.toString() === vidx) {
                    newVariant = line.startsWith("http") ? line : new URL(line, mRes.url || masterUrl).toString();
                    break;
                  }
                  vIdxCounter++;
                }
              }
              if (newVariant && newVariant !== currentUrl) {
                console.log(`[Proxy] Token renovado para a variante ${vidx}: ${newVariant.substring(0, 100)}...`);
                liveVariantRefreshCache.set(`${masterUrl}|${vidx}`, newVariant);
                currentUrl = newVariant;
                upstreamText = null;
                continue;
              }
            }
          }
        } catch (e) {
        }
      }
      if ([301, 302, 303, 307, 308].includes(upstreamRes.status)) {
        const location = upstreamRes.headers.get("location");
        if (!location) break;
        let nextUrl;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          return res.status(502).send("Location de redirecionamento inv\xE1lido");
        }
        if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
          return res.status(403).send("Protocolo inv\xE1lido no redirect.");
        }
        if (await isPrivateOrLocalHost(nextUrl.hostname)) {
          return res.status(403).send("Redirecionamento para IP privado bloqueado (Anti-SSRF).");
        }
        if (!isSignatureValid && !isAllowedLiveStreamingDomain(nextUrl.hostname)) {
          return res.status(403).send("Redirecionamento para dom\xEDnio n\xE3o autorizado.");
        }
        currentUrl = nextUrl.toString();
        redirects++;
      } else {
        break;
      }
    }
    if (redirects >= MAX_REDIRECTS || !upstreamRes) {
      return res.status(502).send("Muitos redirecionamentos ou falha de proxy");
    }
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send(`Upstream status: ${upstreamRes.status}`);
    }
    const finalUrl = upstreamRes.url || currentUrl;
    const contentType = upstreamRes.headers.get("content-type") || "";
    const isExplicitSegment = req3.query.is_segment === "true" || isSegment;
    let isM3U8 = !isExplicitSegment && (req3.query.is_manifest === "true" || rawUrl.includes(".m3u8") || finalUrl.includes(".m3u8") || contentType.includes("mpegurl") || contentType.includes("application/x-mpegURL") || contentType.includes("vnd.apple.mpegurl"));
    if (!isExplicitSegment && upstreamText === null && (isM3U8 || rawUrl.includes("up.kiwi") || !contentType.includes("mp2t"))) {
      try {
        const peekText = await upstreamRes.text();
        if (peekText.includes("#EXTM3U")) {
          isM3U8 = true;
          upstreamText = peekText;
        } else {
          upstreamText = peekText;
        }
      } catch (_) {
      }
    }
    if (isM3U8) {
      const text = upstreamText !== null ? upstreamText : await upstreamRes.text();
      if (!text.includes("#EXTM3U")) {
        return res.status(502).send("Manifesto inv\xE1lido recebido da fonte original");
      }
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=2, immutable");
      let cleanText = text;
      const m3uIdx = cleanText.indexOf("#EXTM3U");
      if (m3uIdx !== -1) {
        cleanText = cleanText.slice(m3uIdx);
      }
      const lines = cleanText.split("\n");
      const filteredLines = [];
      let skipNextLine = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) {
          filteredLines.push(line);
          continue;
        }
        if (trimmed.startsWith("<") || trimmed.includes("</") || trimmed.includes("WARNING")) {
          continue;
        }
        if (skipNextLine && !trimmed.startsWith("#")) {
          skipNextLine = false;
          continue;
        }
        skipNextLine = false;
        if (trimmed.startsWith("#EXT-X-STREAM-INF:")) {
          const resMatch = trimmed.match(/RESOLUTION=\d+x(\d+)/i);
          if (resMatch && parseInt(resMatch[1], 10) < 480) {
            skipNextLine = true;
            continue;
          }
        }
        filteredLines.push(line);
      }
      let baseReferer = req3.query.referer;
      if (!baseReferer) {
        try {
          baseReferer = new URL(finalUrl).origin + "/";
        } catch {
          baseReferer = "";
        }
      }
      const refererParam = baseReferer ? `&referer=${encodeURIComponent(baseReferer)}` : "";
      const isMasterManifest = filteredLines.some((l) => l.startsWith("#EXT-X-STREAM-INF"));
      const masterParam = isMasterManifest ? `&master=${encodeURIComponent(finalUrl)}&msig=${signProxyUrl(finalUrl)}` : "";
      let lastTag = "";
      let variantIndex = 0;
      const rewritten = filteredLines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith("#")) {
          lastTag = trimmed.split(":")[0];
          return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
            try {
              const fullUri = uri.startsWith("http") ? uri : new URL(uri, finalUrl).toString();
              if (fullUri.includes("plutotv.net")) return `URI="${fullUri}"`;
              return `URI="/api/live-stream-proxy?url=${encodeURIComponent(fullUri)}${refererParam}&sig=${signProxyUrl(fullUri)}&is_manifest=true"`;
            } catch {
              return `URI="${uri}"`;
            }
          });
        }
        try {
          const fullSegUrl = trimmed.startsWith("http") ? trimmed : new URL(trimmed, finalUrl).toString();
          if (fullSegUrl.includes("plutotv.net")) return fullSegUrl;
          const isStreamManifest = lastTag === "#EXT-X-STREAM-INF" || isMasterManifest;
          const segParam = isStreamManifest ? `&is_manifest=true${masterParam}&vidx=${variantIndex++}` : "&is_segment=true";
          return `/api/live-stream-proxy?url=${encodeURIComponent(fullSegUrl)}${refererParam}&sig=${signProxyUrl(fullSegUrl)}${segParam}`;
        } catch {
          return trimmed;
        }
      }).join("\n");
      const rewrittenBuffer = Buffer.from(rewritten, "utf-8");
      liveChunkCache.set(rawUrl, {
        buffer: rewrittenBuffer,
        contentType: "application/vnd.apple.mpegurl; charset=utf-8",
        expires: Date.now() + 500
      });
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.send(rewrittenBuffer);
    }
    if (!isExplicitSegment && (rawUrl.includes("up.kiwi") || contentType.includes("mp2t") || finalUrl.endsWith(".ts"))) {
      if (upstreamText === null) {
        try {
          upstreamRes.body?.cancel().catch(() => {
          });
        } catch (_) {
        }
      }
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      const seq = Math.floor(Date.now() / 4e3);
      const manifest = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:6",
        `#EXT-X-MEDIA-SEQUENCE:${seq}`,
        "#EXTINF:6.0,",
        `/api/live-stream-proxy?url=${encodeURIComponent(finalUrl)}&sig=${signProxyUrl(finalUrl)}&is_segment=true&_ts=${Date.now()}`
      ].join("\n");
      return res.send(manifest);
    }
    let finalContentType = contentType || "video/MP2T";
    if (isExplicitSegment && !contentType.includes("mpegurl")) {
      finalContentType = "video/MP2T";
    }
    res.setHeader("Content-Type", finalContentType);
    res.setHeader("Cache-Control", "public, max-age=60, immutable");
    if (upstreamText !== null) {
      return res.send(Buffer.from(upstreamText, "utf-8"));
    } else if (upstreamRes.body) {
      const stream = import_stream.Readable.fromWeb(upstreamRes.body);
      res.on("close", () => {
        try {
          stream.destroy();
        } catch (_) {
        }
      });
      return stream.pipe(res);
    } else {
      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      return res.send(buffer);
    }
  } catch (err) {
    console.warn("[Live Stream Proxy Warning]:", err?.message || err, "URL:", req3.query?.url);
    return res.status(502).send("Upstream stream unavailable");
  }
});
router5.get("/api/myembed-stream", async (req3, res) => {
  try {
    const rawId = req3.query.id || req3.query.url || "tt22084616";
    const idMatch = rawId.match(/(?:filme|movie|serie|series|tvshow|tv)\/([a-zA-Z0-9_-]+)/i) || rawId.match(/(tt\d+|\d+)/);
    const id = idMatch ? idMatch[1] : rawId;
    const type = req3.query.type || (rawId.includes("serie") ? "tv" : "movie");
    const season = req3.query.s ? String(req3.query.s) : "1";
    const episode = req3.query.e ? String(req3.query.e) : "1";
    let resolvedId = id;
    if (id.startsWith("tt")) {
      try {
        const tmdbApiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
        if (!tmdbApiKey) {
          console.warn("[VIP Player] TMDB_API_KEY is not configured.");
        } else {
          const findRes = await fetch(
            `https://api.themoviedb.org/3/find/${id}?api_key=${tmdbApiKey}&external_source=imdb_id`
          );
          if (findRes.ok) {
            const findData = await findRes.json();
            if ((type === "tv" || type === "series") && findData.tv_results?.[0]?.id) {
              resolvedId = String(findData.tv_results[0].id);
            } else if (type === "movie" && findData.movie_results?.[0]?.id) {
              resolvedId = String(findData.movie_results[0].id);
            }
          }
        }
      } catch (findErr) {
        console.warn("[VIP Player TMDB Find Warning]:", findErr);
      }
    }
    let ajaxHadValidSources = false;
    try {
      const ajaxUrl = `https://playerflix.ink/inc/Ajax.php?type=${type}&id=${resolvedId}&season=${season}&episode=${episode}`;
      const ajaxRes = await fetch(ajaxUrl, {
        signal: AbortSignal.timeout(15e3),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://playerflix.ink/",
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      if (ajaxRes.ok) {
        const ajaxData = await ajaxRes.json();
        if (ajaxData && ajaxData.status && Array.isArray(ajaxData.data?.options)) {
          const validOptions = ajaxData.data.options.filter((opt) => {
            const u = (opt.embed || "").toLowerCase();
            return !u.includes("superflix") && !u.includes("sfapi") && !u.includes("byse") && !u.includes("streamberry") && !u.includes("embedmovies") && !u.includes("videasy") && !u.includes("vidlink");
          }).sort((a, b) => {
            const aLang = (a.lang || "").toLowerCase();
            const bLang = (b.lang || "").toLowerCase();
            const aDub = aLang.includes("pt") || aLang.includes("br") || aLang.includes("dub");
            const bDub = bLang.includes("pt") || bLang.includes("br") || bLang.includes("dub");
            if (aDub && !bDub) return -1;
            if (!aDub && bDub) return 1;
            return 0;
          });
          if (validOptions.length > 0) {
            ajaxHadValidSources = true;
          }
          for (const vipOption of validOptions) {
            if (!vipOption || !vipOption.embed) continue;
            try {
              const embedUrl = new URL(vipOption.embed);
              const hash = embedUrl.pathname.split("/").filter(Boolean).pop();
              const host = embedUrl.host;
              if (!hash || !host) continue;
              const getVidRes = await fetch(`https://${host}/player/index.php?data=${hash}&do=getVideo`, {
                signal: AbortSignal.timeout(15e3),
                method: "POST",
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  "Referer": vipOption.embed,
                  "Origin": `https://${host}`,
                  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                  "X-Requested-With": "XMLHttpRequest"
                },
                body: `hash=${hash}&r=${encodeURIComponent("https://playerflix.ink/")}`
              });
              if (!getVidRes.ok) continue;
              const vidText = await getVidRes.text();
              if (!vidText.startsWith("{")) continue;
              const vidData = JSON.parse(vidText);
              const m3u8Source = vidData.securedLink || vidData.videoSource;
              if (!m3u8Source || typeof m3u8Source !== "string" || !m3u8Source.startsWith("http")) continue;
              const proxiedStreamUrl = `/api/live-stream-proxy?url=${encodeURIComponent(m3u8Source)}&referer=${encodeURIComponent(`https://${host}/`)}`;
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
              return res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VIP Player - ${ajaxData.data?.title || "Play Infinity"}</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: #000;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #artplayer-container {
      width: 100%;
      height: 100%;
    }
    /* Oculta totalmente qualquer elemento de interface nativa do Artplayer para dar lugar exclusivo \xE0 Skin Netflix */
    .art-video-player .art-bottom,
    .art-video-player .art-mask,
    .art-video-player .art-state,
    .art-video-player .art-contextmenus,
    .art-video-player .art-loading,
    .art-video-player .art-notice,
    .art-video-player .art-controls,
    .art-video-player .art-layer-state,
    .art-video-player .art-progress,
    .art-video-player .art-control,
    .art-video-player .art-backdrop,
    .art-video-player .art-layers {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/artplayer@5.1.7/dist/artplayer.js"></script>
</head>
<body>
  <div id="artplayer-container"></div>
  <script>
    (function() {
      // Neutraliza popups e janelas secund\xE1rias
      window.open = function() { return null; };
      window.alert = function() {};
      window.confirm = function() { return false; };

      var hlsUrl = "${proxiedStreamUrl}";

      var art = new Artplayer({
        container: "#artplayer-container",
        url: hlsUrl,
        type: "m3u8",
        customType: {
          m3u8: function(video, url, artInstance) {
            if (Hls.isSupported()) {
              if (artInstance.hls) artInstance.hls.destroy();
              var hls = new Hls({
                enableWorker: true,
                maxBufferLength: 20,
                maxMaxBufferLength: 40,
                backBufferLength: 30,
                maxBufferSize: 30 * 1000 * 1000,
                maxBufferHole: 0.5,
                startFragPrefetch: true,
                progressive: true,
                nudgeOffset: 0.15,
                nudgeMaxRetry: 8,
                fragLoadingTimeOut: 30000,
                manifestLoadingTimeOut: 20000,
                fragLoadingMaxRetry: 8
              });
              hls.loadSource(url);
              hls.attachMedia(video);
              hls.on(Hls.Events.MANIFEST_PARSED, function() {
                // Seleciona \xE1udio Dublado / Portugu\xEAs automaticamente se dispon\xEDvel
                if (hls.audioTracks && hls.audioTracks.length > 1) {
                  for (var i = 0; i < hls.audioTracks.length; i++) {
                    var track = hls.audioTracks[i];
                    var lang = (track.lang || track.name || "").toLowerCase();
                    if (lang.includes("pt") || lang.includes("por") || lang.includes("dub")) {
                      hls.audioTrack = i;
                      break;
                    }
                  }
                }
              });
              hls.on(Hls.Events.LEVEL_LOADED, function(event, data) {
                if (data && data.details && data.details.totalduration) {
                  window.__streamDuration = data.details.totalduration;
                  sendStatus();
                }
              });
              var _fatalNetworkRetries = 0;
              hls.on(Hls.Events.ERROR, function(event, data) {
                if (data && data.fatal) {
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      _fatalNetworkRetries++;
                      var v = art.video || document.querySelector("video");
                      var isPlaying = v && v.currentTime > 0 && !v.paused;
                      if (isPlaying) {
                        // V\xEDdeo j\xE1 est\xE1 tocando \u2014 erros de rede s\xE3o de tracks secund\xE1rios (\xE1udio/key)
                        // Tenta recuperar sem acionar fallback
                        try { hls.startLoad(); } catch(e) {}
                        _fatalNetworkRetries = 0;
                      } else if (_fatalNetworkRetries <= 2) {
                        // Ainda n\xE3o iniciou \u2014 tenta recuperar at\xE9 2x
                        hls.startLoad();
                      } else {
                        // 3 falhas fatais sem o v\xEDdeo come\xE7ar \u2192 stream indispon\xEDvel de fato
                        hls.destroy();
                        try {
                          window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "vip_hls_cors_blocked" }, "*");
                        } catch(e) {}
                      }
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      _fatalNetworkRetries = 0;
                      hls.recoverMediaError();
                      break;
                    default:
                      hls.destroy();
                      try {
                        window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "vip_hls_fatal" }, "*");
                      } catch(e) {}
                      break;
                  }
                }
              });
              artInstance.hls = hls;
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
              video.src = url;
              video.addEventListener("error", function() {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "vip_video_error" }, "*");
                } catch(e) {}
              });
            }
          }
        },
        autoplay: true,
        muted: true,  // Inicia mudo para garantir autoplay (pol\xEDtica do browser) \u2014 desmuta ap\xF3s canplay
        playsInline: true,
        hotkey: false,
        gesture: false,
        miniProgressBar: false,
        backdrop: false,
        controls: [],
        icons: { state: '' },
        theme: "#e50914"
      });

      window.artInstance = art;

      function sendStatus() {
        var v = art.video || document.querySelector("video");
        if (!v) return;
        var dur = v.duration || art.duration || window.__streamDuration || 0;
        if ((!dur || isNaN(dur) || dur === Infinity) && window.__streamDuration) {
          dur = window.__streamDuration;
        }
        if (!dur || isNaN(dur) || dur === Infinity) {
          dur = 0;
        }
        var cur = v.currentTime || 0;
        var bufferedEnd = 0;
        if (v.buffered && v.buffered.length > 0) {
          bufferedEnd = v.buffered.end(v.buffered.length - 1);
        }

        try {
          window.parent.postMessage({
            type: "WATCHPLAY_STATUS",
            currentTime: cur,
            duration: dur,
            paused: !!v.paused,
            muted: !!v.muted,
            volume: typeof v.volume === "number" ? v.volume : 1,
            buffered: bufferedEnd,
            playbackRate: v.playbackRate || 1,
            readyState: v.readyState || 0
          }, "*");
        } catch(e) {}
      }

      function notifyEnded() {
        try {
          window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
        } catch(e) {}
      }

      art.on("video:timeupdate", sendStatus);
      art.on("video:loadedmetadata", sendStatus);
      art.on("video:play", sendStatus);
      art.on("video:pause", sendStatus);
      art.on("video:playing", sendStatus);
      art.on("video:progress", sendStatus);
      art.on("video:ended", notifyEnded);

      // \u2500\u2500\u2500 Auto-play com som: estrat\xE9gia multi-evento robusta \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      // O browser bloqueia autoplay com som em iframes sem intera\xE7\xE3o pr\xE9via.
      // Iniciamos muted=true para o autoplay funcionar, e desmutamos assim que
      // o v\xEDdeo come\xE7a a carregar \u2014 o clique do usu\xE1rio no cat\xE1logo conta como
      // gesto e propaga para o iframe dentro de ~1s.

      var _autoUnmuted = false;

      function tryUnmute() {
        var v = art.video || document.querySelector("video");
        if (!v) return;
        try {
          v.muted = false;
          v.volume = 1;
          if (art) { art.muted = false; art.volume = 1; }
          _autoUnmuted = true;
        } catch(e) {}
        sendStatus();
      }

      function tryAutoPlay() {
        var v = art.video || document.querySelector("video");
        if (!v || !v.paused) return;
        try {
          var p = v.play();
          if (p && typeof p.catch === "function") {
            p.catch(function() {
              // Se play() falhou (bloqueio de autoplay), mant\xE9m muted e tenta com muted=true
              try { v.muted = true; v.play().catch(function() {}); } catch(e) {}
            });
          }
        } catch(e) {}
      }

      // Tenta desmutar em m\xFAltiplos momentos para garantir que o som n\xE3o se perca
      art.on("video:loadeddata",    function() { tryUnmute(); tryAutoPlay(); });
      art.on("video:canplay",       function() { tryUnmute(); tryAutoPlay(); });
      art.on("video:canplaythrough",function() { tryUnmute(); });
      art.on("video:playing",       function() { tryUnmute(); });
      art.on("video:play",          function() { tryUnmute(); });

      // Timeouts escalonados \u2014 garante unmute mesmo se os eventos forem lentos
      setTimeout(function() { tryUnmute(); tryAutoPlay(); }, 100);
      setTimeout(function() { tryUnmute(); tryAutoPlay(); }, 500);
      setTimeout(function() { tryUnmute(); }, 1500);
      setTimeout(function() { tryUnmute(); }, 3000);

      // Watchdog: verifica a cada 3s se o volume caiu e restaura
      setInterval(function() {
        var v = art.video || document.querySelector("video");
        if (!v || v.paused) return;
        if (v.muted || v.volume < 0.1) {
          tryUnmute();
        }
      }, 3000);

      setInterval(sendStatus, 250);

      var myembedSeekStallWatchdog = null;
      function monitorMyembedSeekProgress(targetTime) {
        if (myembedSeekStallWatchdog) clearInterval(myembedSeekStallWatchdog);
        var checkCount = 0;
        var lastPos = targetTime;
        myembedSeekStallWatchdog = setInterval(function() {
          checkCount++;
          var v = art.video || document.querySelector("video");
          if (!v) {
            if (checkCount > 10) clearInterval(myembedSeekStallWatchdog);
            return;
          }
          if (Math.abs(v.currentTime - lastPos) > 0.15) {
            clearInterval(myembedSeekStallWatchdog);
            return;
          }
          // Verifica se a posi\xE7\xE3o de seek j\xE1 est\xE1 no buffer de mem\xF3ria
          var isBuffered = false;
          if (v.buffered && v.buffered.length > 0) {
            for (var b = 0; b < v.buffered.length; b++) {
              if (v.currentTime >= v.buffered.start(b) - 0.2 && v.currentTime <= v.buffered.end(b) + 0.2) {
                isBuffered = true;
                break;
              }
            }
          }
          // Se j\xE1 est\xE1 no buffer mas travou em gap de keyframe
          if (isBuffered && checkCount >= 3) {
            try {
              v.currentTime = v.currentTime + 0.12;
            } catch(err) {}
            v.play().catch(function() {});
            clearInterval(myembedSeekStallWatchdog);
            return;
          }
          // Se ainda est\xE1 baixando, apenas garante que o HLS est\xE1 carregando o segmento
          if (art && art.hls && typeof art.hls.startLoad === "function") {
            try { art.hls.startLoad(targetTime); } catch(err) {}
          }
          if (!v.paused) {
            v.play().catch(function() {});
          }
          lastPos = v.currentTime;
          if (checkCount > 10) clearInterval(myembedSeekStallWatchdog);
        }, 400);
      }

      // Ponte de comandos completos para a Skin Netflix
      window.addEventListener("message", function(e) {
                  if (e.data && e.data.type === 'SET_SUBTITLE_URL') {
                      var vid = window.artInstance ? window.artInstance.video : (typeof art !== 'undefined' && art.video ? art.video : document.querySelector('video'));
                      if (!vid) vid = document.querySelector('video');
                      if (vid) {
                          var oldTrack = document.getElementById('playinfinity-subtitle');
                          if (oldTrack) { oldTrack.remove(); }
                          if (e.data.url) {
                              var track = document.createElement('track');
                              track.id = 'playinfinity-subtitle';
                              track.kind = 'captions';
                              track.label = e.data.label || 'Portugu\xEAs (Brasil)';
                              track.srclang = 'pt-BR';
                              track.src = e.data.url;
                              track.default = true;
                              vid.appendChild(track);
                              // Espera carregar para for\xE7ar o modo showing
                              if (e.data.show !== false) { track.addEventListener('load', function() { this.mode = 'showing'; }); }
                          }
                      }
                      return;
                  }
                  if (e.data && e.data.type === 'SHOW_SUBTITLE') {
                      var tr = document.getElementById('playinfinity-subtitle');
                      if (tr) {
                          tr.mode = e.data.show ? 'showing' : 'hidden';
                      }
                      return;
                  }

        if (!e.data) return;
        var v = art.video || document.querySelector("video");
        var msgType = e.data.type || e.data.action;

        switch (msgType) {
          case "PLAY":
          case "play":
            if (art) art.play().catch(function() {});
            else if (v) v.play().catch(function() {});
            sendStatus();
            break;
          case "PAUSE":
          case "pause":
            if (art) art.pause();
            else if (v) v.pause();
            sendStatus();
            break;
          case "TOGGLE_PLAY":
          case "togglePlay":
            if (art) art.toggle();
            else if (v) { v.paused ? v.play().catch(function() {}) : v.pause(); }
            sendStatus();
            break;
          case "SEEK":
          case "seek":
          case "SEEK_ABSOLUTE":
                  case "SEEK_RELATIVE":
                    var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
            if (typeof t === "number" && !isNaN(t)) {
              if (art) {
                try { art.seek = t; } catch(err) {}
                try { art.currentTime = t; } catch(err) {}
                if (art.hls && typeof art.hls.startLoad === "function") {
                  try { art.hls.startLoad(t); } catch(err) {}
                }
              }
              if (v) {
                try { v.currentTime = t; } catch(err) {}
                if (e.data.resumePlay || (e.data.wasPlaying !== false && !v.paused)) {
                  v.play().catch(function() {});
                }
              }
              sendStatus();
              monitorMyembedSeekProgress(t);
            }
            break;
          case "SEEK_RELATIVE":
            var delta = Number(e.data.seconds) || 0;
            var curTime = (v ? v.currentTime : (art ? art.currentTime : 0)) || 0;
            var maxDur = (v && v.duration > 0 ? v.duration : (window.__streamDuration || 99999));
            var newTarget = typeof e.data.time === "number" && !isNaN(e.data.time)
              ? Math.max(0, Math.min(e.data.time, maxDur))
              : Math.max(0, Math.min(curTime + delta, maxDur));
            if (art) {
              if (art.hls && typeof art.hls.startLoad === "function") {
                try { art.hls.startLoad(newTarget); } catch(err) {}
              }
              try { art.seek = newTarget; } catch(err) {}
              try { art.currentTime = newTarget; } catch(err) {}
            }
            if (v) {
              try { v.currentTime = newTarget; } catch(err) {}
              if (e.data.resumePlay || (e.data.wasPlaying !== false && !v.paused)) {
                v.play().catch(function() {});
              }
            }
            sendStatus();
            monitorMyembedSeekProgress(newTarget);
            break;
          case "SET_PLAYBACK_RATE":
          case "setPlaybackRate":
            var rate = Number(e.data.rate) || 1;
            if (art) art.playbackRate = rate;
            if (v) v.playbackRate = rate;
            sendStatus();
            break;
          case "SKIP_INTRO":
            var sec = Number(e.data.seconds) || 85;
            var curIntro = (v ? v.currentTime : (art ? art.currentTime : 0)) || 0;
            var maxD = (v && v.duration > 0 ? v.duration : (window.__streamDuration || 99999));
            var targetIntro = Math.max(0, Math.min(curIntro + sec, maxD - 5));
            if (art) art.currentTime = targetIntro;
            else if (v) v.currentTime = targetIntro;
            sendStatus();
            break;
          case "SET_VOLUME":
          case "setVolume":
            if (typeof e.data.volume === "number") {
              if (art) art.volume = e.data.volume;
              if (v) v.volume = e.data.volume;
              sendStatus();
            }
            break;
          case "SET_MUTED":
          case "setMuted":
            var shouldMute = !!e.data.muted;
            if (art) art.muted = shouldMute;
            if (v) v.muted = shouldMute;
            sendStatus();
            break;
          case "REQUEST_STATUS":
          case "requestStatus":
            sendStatus();
            break;
        }
      });

      window.addEventListener('offline', function() {
        try {
          window.parent.postMessage({ type: "WATCHPLAY_UNAVAILABLE", reason: "vip_network_offline" }, "*");
        } catch(e) {}
      });

      art.on("video:ended", notifyEnded);
    })();
  </script>
</body>
</html>`);
            } catch (optErr) {
              console.warn("[VIP Option Error]:", optErr);
            }
          }
        }
      }
    } catch (directExtractErr) {
      console.warn("[VIP Direct Stream Extraction Error]:", directExtractErr);
    }
    const targetUrl = type === "tv" || type === "series" ? `https://playerflix.ink/serie/${resolvedId}/${season}/${episode}` : `https://playerflix.ink/filme/${resolvedId}`;
    const looksBlocked = (html, status) => {
      if (status === 403 || status === 503 || status === 404) return true;
      const lower = (html || "").toLowerCase();
      if (lower.includes("cf-error-details") || lower.includes("attention required") || lower.includes("checking your browser") || lower.includes("just a moment") || lower.includes("cf-browser-verification") || lower.includes("ray id") || lower.includes("error code") && lower.includes("cloudflare") || lower.includes("investidor.blog") || lower.includes("myplayer") || lower.includes("login-card") || lower.includes("login-page") || lower.includes("painel administrativo") || lower.includes("bem-vindo") || lower.includes("bem vindo") || lower.includes("acesso protegido por sess\xE3o segura") || lower.includes("embedmovies.org") || lower.includes("embedmovies") || lower.includes("superflixapi")) {
        return true;
      }
      if (!lower.includes("base_config") && !lower.includes("<video") && !lower.includes("player")) {
        return true;
      }
      return false;
    };
    const sendVipUnavailablePage = (reason = "no_valid_sources") => {
      console.warn(`[MyEmbed Stream] Provedores VIP sem stream para ${resolvedId}. Emitindo VIP_UNAVAILABLE (${reason}).`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.status(404).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
  </style>
</head>
<body>
  <script>
    try {
      window.parent.postMessage({ 
        type: "VIP_UNAVAILABLE", 
        reason: "${reason}" 
      }, "*");
    } catch(e) {}
  </script>
</body>
</html>`);
    };
    if (!ajaxHadValidSources) {
      return sendVipUnavailablePage("no_valid_sources");
    }
    let myembedRes = await fetch(targetUrl, {
      signal: AbortSignal.timeout(15e3),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://myembed.biz/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
      }
    });
    let playerHtml = await myembedRes.text();
    if (looksBlocked(playerHtml, myembedRes.status)) {
      console.warn(`[MyEmbed Stream] playerflix.ink bloqueado ou sem stream. Tentando myembed.biz...`);
      const fallbackUrl = type === "tv" || type === "series" ? `https://myembed.biz/serie/${resolvedId}/${season}/${episode}` : `https://myembed.biz/filme/${resolvedId}`;
      const fallbackRes = await fetch(fallbackUrl, {
        signal: AbortSignal.timeout(15e3),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://myembed.biz/",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        }
      });
      const fallbackHtml = await fallbackRes.text();
      if (looksBlocked(fallbackHtml, fallbackRes.status)) {
        return sendVipUnavailablePage("no_valid_sources");
      }
      playerHtml = fallbackHtml;
    }
    playerHtml = playerHtml.replace(/<script[^>]*disable-devtool[^>]*><\/script>/gi, "");
    playerHtml = playerHtml.replace(/<script[^>]*src=[\"'][^\"']*(?:mypopads|developersonne|googlesyndication|inmobi|themoneytizer|waust|beacon)[^\"']*[\"'][^>]*><\/script>/gi, "");
    playerHtml = playerHtml.replace(/aHR0cHM6Ly9kZXZlbG9wZXJzb25lLmNvbS5ici9sb2FkLnBocD9yPXBvcA==/g, "");
    playerHtml = playerHtml.replace(/aHR0cHM6Ly9teXBvcGFkcy5jb20vcmVxdWVzdHMvZGlzcGxheS5waHA/g, "");
    playerHtml = playerHtml.replace(/BASE_URL:\s*['"]https:\/\/(playerflix\.ink|myembed\.biz)['"]/gi, `BASE_URL: ''`);
    playerHtml = playerHtml.replace(/<iframe(.*?)>/i, '<iframe$1 sandbox="allow-scripts allow-same-origin allow-presentation">');
    const shieldScript = `
        <style>
          .vast-ad-container, .vast-blocker, [class*="vast"], [id*="vast"],
          [class*="popad"], [id*="popad"], .ad-overlay, .ad-banner, .advertisement,
          div[style*="z-index: 2147483647"], div[style*="z-index: 999999"],
          iframe[src*="pop"], iframe[src*="ad"],
          #options, .options, .seasonepisodeSelector, .btn-opcoes, .mostrar_opcoes,
          .player_select_item, .changeOptions, #header, header,
          .btn, .button, a[href*="player"], a[href*="server"], div[class*="player_select"],
          div[class*="server_select"], div[class*="choose"], .escolher-player,
          .button-escolher-player, [class*="escolh"], [class*="server_"],
          .servers-list, .server-buttons, .player-selector,
          [id*="server"], [id*="player_select"], .btn-player, .player-options,
          #player > div:first-child, button[onclick*="backOptions"],
          .alert, .notice, .warning, .message, [class*="msg"], [class*="aviso"],
          h1, h2, h3, h4, #options h2, #options p {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            width: 0px !important;
            height: 0px !important;
          }
        </style>
        <script>
          window.open = function() {
            console.warn('[Play Infinity Anti-Popup] Popup bloqueado.');
            return null;
          };
          window.alert = function() {};
          window.confirm = function() { return false; };
          window.onbeforeunload = null;

          // Detec\xE7\xE3o de marcas da lista negra e watchdog de in\xEDcio de reprodu\xE7\xE3o
          var vipWatchdogStart = Date.now();
          var vipStreamWatchdog = setInterval(function() {
            var textContent = document.body ? (document.body.innerText || "") : "";
            var isFakeBrand = textContent.includes("embedmovies.org") || textContent.includes("embedmovies");
            var v = (window.artInstance && window.artInstance.video) ? window.artInstance.video : document.querySelector('video');
            var isPlaying = v && !v.paused && (v.currentTime > 0 || (v.readyState && v.readyState >= 2));

            if (isFakeBrand) {
              clearInterval(vipStreamWatchdog);
              console.warn('[Play Infinity VIP] Marca fantasma embedmovies detectada. Emitindo VIP_UNAVAILABLE.');
              try {
                window.parent.postMessage({ type: "VIP_UNAVAILABLE", reason: "embedmovies_detected" }, "*");
              } catch(e) {}
              return;
            }

            // Se ap\xF3s 20 segundos reais ainda n\xE3o houver v\xEDdeo tocando
            if (Date.now() - vipWatchdogStart >= 20000) {
              if (!isPlaying) {
                clearInterval(vipStreamWatchdog);
                console.warn('[Play Infinity VIP] Stream n\xE3o iniciou reprodu\xE7\xE3o real (lentid\xE3o severa). Emitindo VIP_UNAVAILABLE.');
                try {
                  window.parent.postMessage({ type: "VIP_UNAVAILABLE", reason: "no_stream_playing" }, "*");
                } catch(e) {}
              } else {
                clearInterval(vipStreamWatchdog);
              }
            }
          }, 500);

          // Fast-Fail: Detecta erros fatais instantaneamente para n\xE3o prender o usu\xE1rio
          setInterval(function() {
            var v = (window.artInstance && window.artInstance.video) ? window.artInstance.video : document.querySelector('video');
            if (!v) return;
            if (v.error || v.networkState === 3) {
              console.warn('[Play Infinity VIP] Erro fatal nativo detectado (networkState 3 ou v.error). Emitindo VIP_UNAVAILABLE.');
              try { window.parent.postMessage({ type: "VIP_UNAVAILABLE", reason: "video_playback_error" }, "*"); } catch(e) {}
            }
          }, 1000);

          function sendStatus() {
            var v = (window.artInstance && window.artInstance.video) ? window.artInstance.video : document.querySelector('video');
            if (!v) return;
            var dur = v.duration || 0;
            var cur = v.currentTime || 0;
            var buf = (v.buffered && v.buffered.length > 0) ? v.buffered.end(v.buffered.length - 1) : 0;
            try {
              window.parent.postMessage({
                type: 'WATCHPLAY_STATUS',
                currentTime: cur,
                duration: dur,
                paused: !!v.paused,
                muted: !!v.muted,
                volume: typeof v.volume === 'number' ? v.volume : 1,
                buffered: buf,
                playbackRate: v.playbackRate || 1,
                readyState: v.readyState || 0
              }, '*');
            } catch(e) {}
          }

          // Auto-elimina overlay de "Carregando" e seleciona a op\xE7\xE3o automaticamente continuamente
          var optionClicked = false;
          setInterval(function() {
            try {
              var loader = document.getElementById('playerLoader') || document.querySelector('.pro-loader');
              if (loader) {
                loader.style.opacity = '0';
                loader.style.pointerEvents = 'none';
                setTimeout(function() { if (loader) loader.remove(); }, 300);
              }
              
              if (!optionClicked) {
                var opt = document.querySelector('.option') || document.querySelector('[onclick*="player("]') || document.querySelector('.btn-opcoes');
                if (opt && typeof opt.click === 'function') {
                  opt.click();
                  optionClicked = true;
                  console.log('[Play Infinity] Op\xE7\xE3o de player auto-clicada!');
                }
              }

              // Aniquilador agressivo de textos de "Escolher player"
              document.querySelectorAll('h1, h2, h3, h4, span, p, div, button, a').forEach(function(el) {
                if (el.children.length === 0 && el.textContent) {
                  var text = el.textContent.toLowerCase();
                  if (text.includes('escolha uma op\xE7\xE3o') || text.includes('op\xE7\xE3o de player') || text.includes('escolher outro') || text.includes('selecione um')) {
                     el.style.setProperty('display', 'none', 'important');
                     el.style.setProperty('opacity', '0', 'important');
                     el.innerHTML = '';
                  }
                }
              });
            } catch(e) {}
          }, 500);

          setInterval(function() {
            try {
              const skipButtons = document.querySelectorAll('.skip-button, .vast-skip-button, [class*="skip"], [id*="skip"], [class*="close-ad"]');
              skipButtons.forEach(function(btn) { if (typeof btn.click === 'function') btn.click(); });

              const adElements = document.querySelectorAll('.vast-ad-container, .vast-blocker, [class*="vast-ad"], [id*="vast-ad"]');
              adElements.forEach(function(el) { el.remove(); });
              
              const iframes = document.querySelectorAll('iframe:not([sandbox])');
              iframes.forEach(function(ifr) {
                ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
              });
            } catch(e) {}
            sendStatus();
          }, 250);

          // Monitor e Auto-Healer de Integridade \xC1udio/V\xEDdeo para VIP Player (A/V Sync & Frame Freeze Recovery)
          (function initAVSyncAutoHealerVIP() {
            var lastFrameCallbackTime = Date.now();
            var lastCheckedCurrentTime = 0;
            var lastTotalFrames = 0;
            var stallTicks = 0;
            var isHealing = false;
            var lastHealAt = 0;

            function trackFrameRender(v) {
              if (!v) return;
              if (typeof v.requestVideoFrameCallback === 'function' && !v._rvfcActive) {
                v._rvfcActive = true;
                function onFrame() {
                  lastFrameCallbackTime = Date.now();
                  if (v && !v.paused) {
                    v.requestVideoFrameCallback(onFrame);
                  } else if (v) {
                    v._rvfcActive = false;
                  }
                }
                try {
                  v.requestVideoFrameCallback(onFrame);
                } catch(e) {
                  v._rvfcActive = false;
                }
              }
            }

            function checkAVHealth() {
              var v = (window.artInstance && window.artInstance.video) ? window.artInstance.video : document.querySelector('video');
              if (!v) return;

              trackFrameRender(v);

              if (v.paused || v.ended || v.seeking || v.readyState < 2) {
                stallTicks = 0;
                lastCheckedCurrentTime = v.currentTime || 0;
                return;
              }

              var now = Date.now();
              var cur = v.currentTime || 0;
              var audioMovingForward = cur > (lastCheckedCurrentTime + 0.35);
              lastCheckedCurrentTime = cur;

              if (audioMovingForward) {
                var frameIsFresh = false;

                if (typeof v.requestVideoFrameCallback === 'function') {
                  if ((now - lastFrameCallbackTime) < 1800) {
                    frameIsFresh = true;
                  }
                }

                if (typeof v.getVideoPlaybackQuality === 'function') {
                  try {
                    var q = v.getVideoPlaybackQuality();
                    if (q && typeof q.totalVideoFrames === 'number') {
                      if (q.totalVideoFrames > lastTotalFrames) {
                        frameIsFresh = true;
                        lastTotalFrames = q.totalVideoFrames;
                      }
                    }
                  } catch(e) {}
                }

                if (!frameIsFresh && (typeof v.requestVideoFrameCallback === 'function' || typeof v.getVideoPlaybackQuality === 'function')) {
                  stallTicks++;
                  if (stallTicks >= 2 && (now - lastHealAt > 3500) && !isHealing) {
                    console.warn('[Play Infinity VIP Player] Imagem congelada com \xE1udio em reprodu\xE7\xE3o detectada. Executando auto-healing instant\xE2neo...');
                    isHealing = true;
                    lastHealAt = now;
                    stallTicks = 0;

                    try {
                      var hls = (window.artInstance && window.artInstance.hls) || window.hls;
                      if (hls && typeof hls.recoverMediaError === 'function') {
                        try { hls.recoverMediaError(); } catch(he) {}
                      }

                      var nowPos = v.currentTime;
                      v.currentTime = nowPos + 0.005;

                      v._rvfcActive = false;
                      trackFrameRender(v);
                    } catch(err) {
                      console.error('[Play Infinity VIP Player A/V Recovery Error]:', err);
                    } finally {
                      setTimeout(function() { isHealing = false; }, 800);
                    }
                  }
                } else {
                  stallTicks = 0;
                }
              }
            }

            setInterval(checkAVHealth, 800);
          })();

          window.addEventListener('message', function(e) {
                  if (e.data && e.data.type === 'SET_SUBTITLE_URL') {
                      var vid = window.artInstance ? window.artInstance.video : (typeof art !== 'undefined' && art.video ? art.video : document.querySelector('video'));
                      if (!vid) vid = document.querySelector('video');
                      if (vid) {
                          var oldTrack = document.getElementById('playinfinity-subtitle');
                          if (oldTrack) { oldTrack.remove(); }
                          if (e.data.url) {
                              var track = document.createElement('track');
                              track.id = 'playinfinity-subtitle';
                              track.kind = 'captions';
                              track.label = e.data.label || 'Portugu\xEAs (Brasil)';
                              track.srclang = 'pt-BR';
                              track.src = e.data.url;
                              track.default = true;
                              vid.appendChild(track);
                              // Espera carregar para for\xE7ar o modo showing
                              if (e.data.show !== false) { track.addEventListener('load', function() { this.mode = 'showing'; }); }
                          }
                      }
                      return;
                  }
                  if (e.data && e.data.type === 'SHOW_SUBTITLE') {
                      var tr = document.getElementById('playinfinity-subtitle');
                      if (tr) {
                          tr.mode = e.data.show ? 'showing' : 'hidden';
                      }
                      return;
                  }

            if (!e.data) return;
            var v = (window.artInstance && window.artInstance.video) ? window.artInstance.video : document.querySelector('video');
            if (!v) return;
            var msgType = e.data.type || e.data.action;
            switch(msgType) {
              case 'PLAY': case 'play': 
                if (window.artInstance && typeof window.artInstance.play === "function") {
                  try { window.artInstance.play(); } catch(err) {}
                }
                v.play().catch(function(){}); 
                sendStatus(); 
                break;
              case 'PAUSE': case 'pause': 
                if (window.artInstance && typeof window.artInstance.pause === "function") {
                  try { window.artInstance.pause(); } catch(err) {}
                }
                v.pause(); 
                sendStatus(); 
                break;
              case 'TOGGLE_PLAY': case 'togglePlay': 
                if (window.artInstance && typeof window.artInstance.toggle === "function") {
                  try { window.artInstance.toggle(); } catch(err) {}
                } else {
                  v.paused ? v.play().catch(function(){}) : v.pause(); 
                }
                sendStatus(); 
                break;
              case 'SEEK': case 'seek': case 'SEEK_ABSOLUTE':
                var t = typeof e.data.time === 'number' ? e.data.time : e.data.targetTime;
                if (typeof t === 'number' && !isNaN(t)) { v.currentTime = t; sendStatus(); }
                break;
              case 'SEEK_RELATIVE':
                var delta = Number(e.data.seconds) || 0;
                v.currentTime = Math.max(0, Math.min(v.currentTime + delta, (v.duration || 99999)));
                sendStatus();
                break;
              case 'SET_PLAYBACK_RATE': case 'setPlaybackRate':
                v.playbackRate = Number(e.data.rate) || 1;
                sendStatus();
                break;
              case 'SKIP_INTRO':
                var sec = Number(e.data.seconds) || 85;
                v.currentTime = Math.max(0, Math.min(v.currentTime + sec, (v.duration || 99999) - 5));
                sendStatus();
                break;
              case 'SET_VOLUME': case 'setVolume':
                if (typeof e.data.volume === 'number') { v.volume = e.data.volume; sendStatus(); }
                break;
              case 'SET_MUTED': case 'setMuted':
                v.muted = !!e.data.muted;
                sendStatus();
                break;
              case 'REQUEST_STATUS': case 'requestStatus':
                sendStatus();
                break;
            }
          });
        </script>
      `;
    if (playerHtml.includes("<head>")) {
      playerHtml = playerHtml.replace("<head>", "<head>" + shieldScript);
    } else {
      playerHtml = shieldScript + playerHtml;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.send(playerHtml);
  } catch (err) {
    console.error("[MyEmbed Stream Proxy Error]:", err);
    return res.status(500).send("Erro ao processar stream do MyEmbed.");
  }
});
router5.get("/api/pomfy-stream", async (req3, res) => {
  try {
    const { id, type, s, e } = req3.query;
    if (!id) {
      return res.status(400).send("Faltando par\xE2metro 'id'.");
    }
    const baseUrl = type === "tv" ? `https://api.pomfy.stream/serie/${id}/${s || 1}/${e || 1}` : `https://api.pomfy.stream/filme/${id}`;
    const response = await fetch(baseUrl, {
      signal: AbortSignal.timeout(15e3),
      headers: {
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (!response.ok) {
      return res.redirect(302, baseUrl);
    }
    const html = await response.text();
    const tokenMatch = html.match(/statusToken="([^"]+)"/);
    if (tokenMatch && tokenMatch[1]) {
      const token = tokenMatch[1];
      const tokenUrl = `https://api.pomfy.stream/api/play-token?t=${token}`;
      const tokenResp = await fetch(tokenUrl, {
        signal: AbortSignal.timeout(15e3),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": baseUrl
        }
      });
      if (tokenResp.ok) {
        const json = await tokenResp.json();
        const finalUrl = json.byseUrl || json.url || json.flyfileUrl;
        if (finalUrl) {
          return res.redirect(302, finalUrl);
        }
      }
    }
    return res.redirect(302, baseUrl);
  } catch (err) {
    console.error("[Pomfy Proxy Error]:", err);
    const { id, type, s, e } = req3.query;
    const baseUrl = type === "tv" ? `https://api.pomfy.stream/serie/${id}/${s || 1}/${e || 1}` : `https://api.pomfy.stream/filme/${id}`;
    return res.redirect(302, baseUrl);
  }
});
router5.get("/api/embedplay-direct", (_req, res) => {
  return res.status(403).json({
    error: "Servidor EmbedPlay est\xE1 bloqueado na blacklist permanente. Use exclusivamente o WatchPlayer."
  });
});
router5.get("/api/byse-stream", (_req, res) => {
  return res.status(403).json({
    error: "Servidor BYSE/Streamberry est\xE1 bloqueado na blacklist permanente. Use exclusivamente o WatchPlayer."
  });
});
var videoScrapers_default = router5;

// server/routes/catalog.ts
var import_express7 = require("express");
var import_express_rate_limit = __toESM(require("express-rate-limit"), 1);
var import_crypto2 = __toESM(require("crypto"), 1);

// server/services/mostWatched.ts
var import_fs4 = __toESM(require("fs"), 1);
var import_path4 = __toESM(require("path"), 1);
var _dirname = typeof __dirname !== "undefined" ? __dirname : process.cwd();
var INITIAL_MOST_WATCHED = [
  {
    id: 299534,
    tmdbId: 299534,
    title: "VINGADORES: ULTIMATO",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/9fRX8UKlIW7Lb9GqNsJVakWWFCi.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/299534",
    views: 185,
    lastWatched: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: 66732,
    tmdbId: 66732,
    imdbId: "tt4574334",
    title: "STRANGER THINGS",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/twfKp60THrcOIep9sjHODOOfO8d.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/66732/1/1",
    views: 172,
    lastWatched: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: 533535,
    tmdbId: 533535,
    title: "DEADPOOL & WOLVERINE",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/cJFqqiDYprqExaXatu4AaoMzDG2.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/533535",
    views: 164,
    lastWatched: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: 93405,
    tmdbId: 93405,
    title: "ROUND 6 (SQUID GAME)",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/6gcHdboppvplmBWxvROc96NJnmm.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/2meX1nMdScFOoV4370rqHWKmXhY.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/93405/1/1",
    views: 153,
    lastWatched: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: 969681,
    tmdbId: 969681,
    imdbId: "tt22084616",
    title: "HOMEM-ARANHA: UM NOVO DIA",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/x0nvYzQpyJc5pdT9lMnkMuYAg0O.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/qeQJx07rK2xm8SD2sJxFKhE7gs0.jpg",
    quality: "CAM",
    playerUrl: "https://v1.watchplay.shop/movie/tt22084616",
    views: 147,
    lastWatched: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: 119051,
    tmdbId: 119051,
    title: "WANDINHA",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/7rxiQrZjrer0RB9qNA8rHYFo53R.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/119051/1/1",
    views: 138,
    lastWatched: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: 157336,
    tmdbId: 157336,
    title: "INTERESTELAR",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/6ricSDD83BClJsFdGB6x7cM0MFQ.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/5XNQBqnBwPA9yT0jZ0p3s8bbLh0.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/157336",
    views: 129,
    lastWatched: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: 100088,
    tmdbId: 100088,
    title: "THE LAST OF US",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/ieMLFFCwdep90d67kOT0oFtv2yX.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/lY2DhbA7Hy44fAKddr06UrXWWaQ.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/100088/1/1",
    views: 118,
    lastWatched: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: 1022789,
    tmdbId: 1022789,
    title: "DIVERTIDA MENTE 2",
    type: "movie",
    imageUrl: "https://image.tmdb.org/t/p/w500/lHKNS35r4RTa9GO72vdadMLxoiV.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/p5ozvmdgsmbWe0H8Xk7Rc8SCwAB.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/movie/1022789",
    views: 105,
    lastWatched: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: 94997,
    tmdbId: 94997,
    title: "A CASA DO DRAG\xC3O",
    type: "series",
    imageUrl: "https://image.tmdb.org/t/p/w500/oKJDm4QCKbp6mR4FnxXrFlPJP8Y.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/577eXC8wFQT0eUrJcgznSiFPRmk.jpg",
    quality: "HD",
    playerUrl: "https://v1.watchplay.shop/tvshow/94997/1/1",
    views: 95,
    lastWatched: (/* @__PURE__ */ new Date()).toISOString()
  }
];
function getMostWatchedFilePath() {
  return import_path4.default.join(process.cwd(), "data", "most-watched.json");
}
function loadMostWatchedFromDisk() {
  if (process.env.VERCEL) {
    return [...INITIAL_MOST_WATCHED];
  }
  try {
    const filePath = getMostWatchedFilePath();
    if (import_fs4.default.existsSync(filePath)) {
      const raw = import_fs4.default.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("[MostWatched] Erro ao carregar arquivo na inicializa\xE7\xE3o:", err);
  }
  return [...INITIAL_MOST_WATCHED];
}
var mostWatchedMemoryCache = loadMostWatchedFromDisk();
var saveDebounceTimer = null;
var isSavingMostWatched = false;
var hasPendingMostWatchedSave = false;
async function executeAtomicSaveMostWatched() {
  if (isSavingMostWatched) {
    hasPendingMostWatchedSave = true;
    return;
  }
  isSavingMostWatched = true;
  try {
    const dir = import_path4.default.join(process.cwd(), "data");
    await import_fs4.default.promises.mkdir(dir, { recursive: true });
    const filePath = getMostWatchedFilePath();
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    const payload = JSON.stringify(mostWatchedMemoryCache, null, 2);
    await import_fs4.default.promises.writeFile(tempPath, payload, "utf-8");
    try {
      await import_fs4.default.promises.rename(tempPath, filePath);
    } catch {
      await import_fs4.default.promises.copyFile(tempPath, filePath);
      await import_fs4.default.promises.unlink(tempPath).catch(() => {
      });
    }
  } catch (err) {
    console.error("[MostWatched] Falha na persist\xEAncia at\xF4mica da audi\xEAncia:", err);
  } finally {
    isSavingMostWatched = false;
    if (hasPendingMostWatchedSave) {
      hasPendingMostWatchedSave = false;
      executeAtomicSaveMostWatched();
    }
  }
}
function scheduleAsyncSaveMostWatched() {
  if (process.env.VERCEL) return;
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    executeAtomicSaveMostWatched();
  }, 1500);
}

// server/routes/catalog.ts
var customStreams = [];
var episodesAvailabilityCache = /* @__PURE__ */ new Map();
var EPISODES_CACHE_TTL = 30 * 60 * 1e3;
var webhookLimiter = (0, import_express_rate_limit.default)({
  windowMs: 60 * 1e3,
  max: 10,
  message: { success: false, error: "Limite de tentativas excedido para o webhook." },
  standardHeaders: true,
  legacyHeaders: false
});
var router6 = (0, import_express7.Router)();
router6.post("/api/novo-episodio", webhookLimiter, (req3, res) => {
  const webhookSecret = process.env.WEBHOOK_SECRET?.trim() || "playinfinity-webhook-2025";
  const authHeader = req3.headers["authorization"] || "";
  const customHeader = req3.headers["x-webhook-secret"] || "";
  const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const providedKey = (typeof customHeader === "string" ? customHeader.trim() : "") || bearerToken;
  if (!providedKey) {
    return res.status(401).json({
      success: false,
      error: "Acesso n\xE3o autorizado. Chave do webhook inv\xE1lida ou ausente."
    });
  }
  const providedBuf = Buffer.from(providedKey, "utf8");
  const expectedBuf = Buffer.from(webhookSecret, "utf8");
  const sameLength = providedBuf.length === expectedBuf.length;
  const isSafe = sameLength ? import_crypto2.default.timingSafeEqual(providedBuf, expectedBuf) : false;
  if (!sameLength || !isSafe) {
    return res.status(401).json({
      success: false,
      error: "Acesso n\xE3o autorizado. Chave do webhook inv\xE1lida ou ausente (informe via header x-webhook-secret ou Authorization: Bearer)."
    });
  }
  const { title, type = "series", season, episode, playerUrl, imageUrl } = req3.body;
  if (!title || !playerUrl) {
    return res.status(400).json({
      success: false,
      error: "Campos obrigat\xF3rios: title (t\xEDtulo) e playerUrl (URL do player/iframe)"
    });
  }
  const urlValidation = validateSafeUrl(playerUrl);
  if (!urlValidation.valid) {
    return res.status(400).json({
      success: false,
      error: `URL do player inv\xE1lida ou n\xE3o autorizada: ${urlValidation.error}`
    });
  }
  const newItem = {
    id: "custom-" + Date.now(),
    title: String(title).slice(0, 150),
    type: type === "movie" ? "movie" : "series",
    season: season ? Number(season) : void 0,
    episode: episode ? Number(episode) : void 0,
    playerUrl: urlValidation.parsedUrl.toString(),
    imageUrl: imageUrl || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  customStreams.unshift(newItem);
  console.log(`[Webhook] Novo item recebido com sucesso: ${newItem.title} (${newItem.type})`);
  return res.status(201).json({
    success: true,
    message: "Epis\xF3dio adicionado e dispon\xEDvel instantaneamente!",
    item: newItem
  });
});
router6.get("/api/custom-episodes", (_req, res) => {
  res.json({
    success: true,
    items: customStreams
  });
});
router6.get("/api/most-watched", (_req, res) => {
  try {
    const sorted = [...mostWatchedMemoryCache].sort((a, b) => {
      if (b.views !== a.views) return b.views - a.views;
      return new Date(b.lastWatched).getTime() - new Date(a.lastWatched).getTime();
    });
    res.json({
      success: true,
      items: sorted.slice(0, 10)
    });
  } catch (err) {
    console.error("[API most-watched] Erro:", err);
    res.status(500).json({ success: false, error: err.message, items: INITIAL_MOST_WATCHED.slice(0, 10) });
  }
});
router6.post("/api/track-play", (req3, res) => {
  try {
    const clientIp = req3.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req3.socket.remoteAddress || "127.0.0.1";
    const { id, tmdbId, imdbId, title, type, imageUrl, backdropUrl, quality, playerUrl } = req3.body;
    const cleanTitle = sanitizeString(title, 100);
    if (!cleanTitle || cleanTitle.length < 1) {
      return res.status(400).json({ success: false, error: "T\xEDtulo inv\xE1lido ou n\xE3o fornecido." });
    }
    const normTitle = cleanTitle.toUpperCase();
    const dedupeKey = tmdbId ? `tmdb:${tmdbId}` : `title:${normTitle}`;
    const rateCheck = checkTrackPlayRateLimit(clientIp, dedupeKey);
    if (!rateCheck.allowed) {
      return res.status(429).json({ success: false, error: rateCheck.error || "Muitas requisi\xE7\xF5es. Aguarde um momento." });
    }
    const safeType = type === "series" ? "series" : "movie";
    const allowedQualities = ["HD", "FHD", "4K", "CAM", "SD"];
    const safeQuality = allowedQualities.includes(quality) ? quality : "HD";
    const safeImageUrl = sanitizeString(imageUrl, 500) || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80";
    const safeBackdropUrl = sanitizeString(backdropUrl, 500) || safeImageUrl;
    const safePlayerUrl = sanitizeString(playerUrl, 500);
    let existing = mostWatchedMemoryCache.find(
      (it) => tmdbId && it.tmdbId === Number(tmdbId) || id && it.id === id || it.title.toUpperCase() === normTitle
    );
    if (existing) {
      if (rateCheck.shouldIncrement) {
        existing.views += 1;
      }
      existing.lastWatched = (/* @__PURE__ */ new Date()).toISOString();
      if (safePlayerUrl && (!existing.playerUrl || existing.playerUrl.includes("watchplay.shop"))) existing.playerUrl = safePlayerUrl;
      if (safeImageUrl && !existing.imageUrl) existing.imageUrl = safeImageUrl;
      if (safeBackdropUrl && !existing.backdropUrl) existing.backdropUrl = safeBackdropUrl;
      existing.quality = safeQuality;
    } else {
      const newItem = {
        id: id || (tmdbId ? Number(tmdbId) : Date.now()),
        tmdbId: tmdbId ? Number(tmdbId) : void 0,
        imdbId: sanitizeString(imdbId, 20) || void 0,
        title: cleanTitle,
        type: safeType,
        imageUrl: safeImageUrl,
        backdropUrl: safeBackdropUrl,
        quality: safeQuality,
        playerUrl: safePlayerUrl || void 0,
        views: 1,
        lastWatched: (/* @__PURE__ */ new Date()).toISOString()
      };
      mostWatchedMemoryCache.push(newItem);
      existing = newItem;
      if (mostWatchedMemoryCache.length > 100) {
        mostWatchedMemoryCache.sort((a, b) => b.views - a.views);
        mostWatchedMemoryCache.splice(100);
      }
    }
    scheduleAsyncSaveMostWatched();
    res.json({
      success: true,
      message: rateCheck.shouldIncrement ? "Visualiza\xE7\xE3o registrada com sucesso" : "Reprodu\xE7\xE3o j\xE1 contabilizada recentemente",
      item: existing
    });
  } catch (err) {
    console.error("[API track-play] Erro:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
router6.get("/api/series/available-episodes", async (req3, res) => {
  try {
    const rawId = String(req3.query.id || "").trim();
    const season = parseInt(String(req3.query.season || "1"), 10) || 1;
    const total = Math.min(Math.max(parseInt(String(req3.query.total || "24"), 10) || 1, 1), 100);
    if (!rawId) {
      return res.status(400).json({ success: false, error: "ID da s\xE9rie obrigat\xF3rio" });
    }
    let resolvedId = rawId;
    if (rawId.startsWith("tt")) {
      try {
        const tmdbApiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
        if (tmdbApiKey) {
          const findRes = await fetch(
            `https://api.themoviedb.org/3/find/${rawId}?api_key=${tmdbApiKey}&external_source=imdb_id`,
            { signal: AbortSignal.timeout(3e3) }
          );
          if (findRes.ok) {
            const findData = await findRes.json();
            if (findData.tv_results?.[0]?.id) {
              resolvedId = String(findData.tv_results[0].id);
            }
          }
        }
      } catch {
      }
    }
    const cacheKey = `${resolvedId}_${season}`;
    const cached = episodesAvailabilityCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < EPISODES_CACHE_TTL) {
      return res.json({
        success: true,
        id: resolvedId,
        season,
        availableEpisodes: cached.episodes,
        totalAvailable: cached.episodes.length,
        cached: true
      });
    }
    const checkEpisode = async (ep) => {
      try {
        const wpPromise = (async () => {
          try {
            const wpRes = await fetch(`https://v1.watchplay.shop/tvshow/${resolvedId}/${season}/${ep}`, {
              method: "HEAD",
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
              },
              signal: AbortSignal.timeout(3500)
            });
            return wpRes.status === 200 || wpRes.status === 301 || wpRes.status === 302;
          } catch {
            return false;
          }
        })();
        const vipPromise = (async () => {
          try {
            const ajaxUrl = `https://playerflix.ink/inc/Ajax.php?type=tv&id=${resolvedId}&season=${season}&episode=${ep}`;
            const ajaxRes = await fetch(ajaxUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://playerflix.ink/",
                "X-Requested-With": "XMLHttpRequest"
              },
              signal: AbortSignal.timeout(3500)
            });
            if (!ajaxRes.ok) return false;
            const j = await ajaxRes.json();
            if (j && j.status && Array.isArray(j.data?.options)) {
              const valid = j.data.options.filter((opt) => {
                const u = (opt.embed || "").toLowerCase();
                return !u.includes("superflix") && !u.includes("sfapi") && !u.includes("byse") && !u.includes("streamberry");
              });
              return valid.length > 0;
            }
            return false;
          } catch {
            return false;
          }
        })();
        const [hasWp, hasVip] = await Promise.all([wpPromise, vipPromise]);
        return hasWp || hasVip;
      } catch {
        return false;
      }
    };
    const promises = [];
    for (let ep = 1; ep <= total; ep++) {
      promises.push(
        checkEpisode(ep).then((available) => ({ ep, available }))
      );
    }
    const results = await Promise.all(promises);
    const availableEpisodes = results.filter((r) => r.available).map((r) => r.ep);
    if (availableEpisodes.length > 0) {
      episodesAvailabilityCache.set(cacheKey, {
        timestamp: Date.now(),
        episodes: availableEpisodes
      });
    }
    return res.json({
      success: true,
      id: resolvedId,
      season,
      availableEpisodes: availableEpisodes.length > 0 ? availableEpisodes : Array.from({ length: total }, (_, i) => i + 1),
      totalAvailable: availableEpisodes.length > 0 ? availableEpisodes.length : total,
      cached: false
    });
  } catch (err) {
    console.error("[Available Episodes Error]:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
var catalog_default = router6;

// server/routes/mixdrop.ts
var import_express8 = require("express");
var mixdropMemoryCache = /* @__PURE__ */ new Map();
var router7 = (0, import_express8.Router)();
router7.get("/api/mixdrop-stream", async (req3, res) => {
  try {
    const rawUrl = String(req3.query.url || "").trim();
    if (!rawUrl) {
      return res.status(400).send("Par\xE2metro 'url' \xE9 obrigat\xF3rio.");
    }
    const safeCheck = validateSafeUrl(rawUrl);
    if (!safeCheck.valid || !safeCheck.parsedUrl) {
      return res.status(400).send("URL inv\xE1lida ou n\xE3o autorizada.");
    }
    const host = safeCheck.parsedUrl.hostname.toLowerCase();
    const isMixdrop = host.includes("mixdrop.") || host.includes("mxdrop.");
    if (!isMixdrop) {
      return res.status(400).send("Dom\xEDnio fornecido n\xE3o pertence \xE0 rede MixDrop.");
    }
    const sendFallbackHtml = (statusCode, message) => {
      return res.status(statusCode).send(`
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;text-align:center;">
            <script>
              console.error("[MixDrop] Erro:", "${message}");
              if (window.parent !== window) {
                window.parent.postMessage({ type: "WATCHPLAY_ERROR", reason: "${message}" }, "*");
              }
            </script>
            <div>${message}</div>
          </body>
          </html>
        `);
    };
    const fileMatch = safeCheck.parsedUrl.pathname.match(/\/(?:f|e)\/([a-zA-Z0-9_-]+)/);
    const fileId = fileMatch ? fileMatch[1] : "";
    if (!fileId) {
      return res.status(400).send("ID de arquivo do MixDrop n\xE3o encontrado.");
    }
    const cached = mixdropMemoryCache.get(fileId);
    let videoUrl = "";
    let posterUrl = "";
    let pageTitle = "Play Infinity \u2022 MixDrop Stream";
    if (cached && cached.expiresAt > Date.now() + 6e4) {
      videoUrl = cached.videoUrl;
      posterUrl = cached.posterUrl;
      pageTitle = cached.title || pageTitle;
    } else {
      const embedUrl = `https://${host}/e/${fileId}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15e3);
      try {
        const upstream = await fetch(embedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!upstream.ok) {
          return sendFallbackHtml(502, `MixDrop retornou status HTTP ${upstream.status}`);
        }
        const html = await upstream.text();
        const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\}\)\)/);
        if (!packerMatch) {
          return sendFallbackHtml(502, "N\xE3o foi poss\xEDvel desembalar os dados do player do MixDrop. Arquivo possivelmente deletado.");
        }
        const unpacked = new Function("return " + packerMatch[0].slice(4))();
        const wurlMatch = unpacked.match(/MDCore\.wurl\s*=\s*['"]([^'"]+)['"]/);
        const posterMatch = unpacked.match(/MDCore\.poster\s*=\s*['"]([^'"]+)['"]/);
        const titleMatch = html.match(/<title>MixDrop - Watch ([^<]+)<\/title>/i);
        if (!wurlMatch || !wurlMatch[1]) {
          return sendFallbackHtml(502, "URL de v\xEDdeo n\xE3o encontrada no player do MixDrop.");
        }
        videoUrl = wurlMatch[1];
        if (videoUrl.startsWith("//")) videoUrl = "https:" + videoUrl;
        if (posterMatch && posterMatch[1]) {
          posterUrl = posterMatch[1];
          if (posterUrl.startsWith("//")) posterUrl = "https:" + posterUrl;
        }
        if (titleMatch && titleMatch[1]) {
          pageTitle = titleMatch[1].trim();
        }
        mixdropMemoryCache.set(fileId, {
          videoUrl,
          posterUrl,
          title: pageTitle,
          expiresAt: Date.now() + 4 * 60 * 60 * 1e3
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        console.error("[MixDrop Scraper Error]:", fetchErr);
        return sendFallbackHtml(502, "Tempo limite ou erro ao contatar servidor de m\xEDdia MixDrop.");
      }
    }
    const streamUrl = `/api/mixdrop-proxy?url=${encodeURIComponent(videoUrl)}`;
    if (req3.query.format === "json") {
      const isHttps = req3.headers["x-forwarded-proto"] === "https" || req3.protocol === "https";
      const originHost = req3.headers.host;
      const fullProxyUrl = `${isHttps ? "https" : "http"}://${originHost}${streamUrl}`;
      return res.json({ videoUrl: fullProxyUrl });
    }
    return res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <meta name="referrer" content="no-referrer">
          <title>${pageTitle}</title>
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              background: #000;
              overflow: hidden;
            }
            #artplayer-container {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: #000;
            }
            video {
              object-fit: contain !important;
              width: 100% !important;
              height: 100% !important;
            }
            .art-mask,
            .art-top,
            .art-bottom,
            .art-controls,
            .art-controls-left,
            .art-controls-center,
            .art-controls-right,
            .art-state,
            .art-loading,
            .art-notice,
            .art-settings,
            .art-contextmenu,
            .art-progress,
            .btn, .button, [class*="ad"], [id*="ad"] {
              display: none !important;
              opacity: 0 !important;
              visibility: hidden !important;
              pointer-events: none !important;
            }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/artplayer@5.1.7/dist/artplayer.js"></script>
        </head>
        <body>
          <div id="artplayer-container"></div>
          <script>
            (function() {
              var videoUrl = ${JSON.stringify(streamUrl)};
              var posterUrl = ${JSON.stringify(posterUrl)};

              var art = new Artplayer({
                container: "#artplayer-container",
                url: videoUrl,
                type: "mp4",
                poster: posterUrl || "",
                autoplay: true,
                muted: false,
                playsInline: true,
                controls: [],
                theme: "#e50914"
              });

              window.artInstance = art;

              function sendStatus() {
                var v = art.video || document.querySelector("video");
                if (!v) return;
                var dur = v.duration || art.duration || 0;
                var cur = v.currentTime || 0;
                var bufferedEnd = 0;
                if (v.buffered && v.buffered.length > 0) {
                  bufferedEnd = v.buffered.end(v.buffered.length - 1);
                }

                try {
                  window.parent.postMessage({
                    type: "WATCHPLAY_STATUS",
                    currentTime: cur,
                    duration: dur,
                    paused: !!v.paused,
                    muted: !!v.muted,
                    volume: typeof v.volume === "number" ? v.volume : 1,
                    buffered: bufferedEnd,
                    playbackRate: v.playbackRate || 1,
                    readyState: v.readyState || 0
                  }, "*");
                } catch(e) {}
              }

              function notifyReady() {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_READY" }, "*");
                } catch(e) {}
                sendStatus();
              }

              function notifyEnded() {
                try {
                  window.parent.postMessage({ type: "WATCHPLAY_VIDEO_ENDED" }, "*");
                } catch(e) {}
              }

              setInterval(sendStatus, 300);

              // Auto-Healer A/V Sync para MixDrop
              (function initAVSyncMixdrop() {
                var lastFrameCallbackTime = Date.now();
                var lastCheckedCurrentTime = 0;
                var lastTotalFrames = 0;
                var stallTicks = 0;
                var isHealing = false;
                var lastHealAt = 0;

                function trackFrameRender(v) {
                  if (!v) return;
                  if (typeof v.requestVideoFrameCallback === 'function' && !v._rvfcActive) {
                    v._rvfcActive = true;
                    function onFrame() {
                      lastFrameCallbackTime = Date.now();
                      if (v && !v.paused) {
                        v.requestVideoFrameCallback(onFrame);
                      } else if (v) {
                        v._rvfcActive = false;
                      }
                    }
                    try { v.requestVideoFrameCallback(onFrame); } catch(e) { v._rvfcActive = false; }
                  }
                }

                setInterval(function() {
                  var v = art.video || document.querySelector("video");
                  if (!v) return;
                  trackFrameRender(v);

                  if (v.paused || v.ended || v.seeking || v.readyState < 2) {
                    stallTicks = 0;
                    lastCheckedCurrentTime = v.currentTime || 0;
                    return;
                  }

                  var now = Date.now();
                  var cur = v.currentTime || 0;
                  var audioMoving = cur > (lastCheckedCurrentTime + 0.35);
                  lastCheckedCurrentTime = cur;

                  if (audioMoving) {
                    var frameFresh = false;
                    if (typeof v.requestVideoFrameCallback === 'function') {
                      if ((now - lastFrameCallbackTime) < 1800) frameFresh = true;
                    }
                    if (typeof v.getVideoPlaybackQuality === 'function') {
                      try {
                        var q = v.getVideoPlaybackQuality();
                        if (q && typeof q.totalVideoFrames === 'number') {
                          if (q.totalVideoFrames > lastTotalFrames) {
                            frameFresh = true;
                            lastTotalFrames = q.totalVideoFrames;
                          }
                        }
                      } catch(e) {}
                    }

                    if (!frameFresh && (typeof v.requestVideoFrameCallback === 'function' || typeof v.getVideoPlaybackQuality === 'function')) {
                      stallTicks++;
                      if (stallTicks >= 2 && (now - lastHealAt > 3500) && !isHealing) {
                        isHealing = true;
                        lastHealAt = now;
                        stallTicks = 0;
                        try {
                          var nowP = v.currentTime;
                          v.currentTime = nowP + 0.005;
                          v._rvfcActive = false;
                          trackFrameRender(v);
                        } catch(err) {}
                        finally { setTimeout(function() { isHealing = false; }, 800); }
                      }
                    } else {
                      stallTicks = 0;
                    }
                  }
                }, 800);
              })();

              art.on("ready", function() {
                notifyReady();
                var v = art.video || document.querySelector("video");
                if (v) {
                  v.setAttribute("referrerpolicy", "no-referrer");
                  v.setAttribute("playsinline", "true");
                }
                // Autoplay com fallback: tenta com som, se navegador bloquear, tenta mudo
                art.play().catch(function() {
                  console.log("[MixDrop] Autoplay com som bloqueado pelo navegador, tentando mudo...");
                  art.muted = true;
                  art.play().then(function() {
                    console.log("[MixDrop] Autoplay mudo funcionando \u2014 aguardando clique do usu\xE1rio pra ativar som");
                    // Avisa o parent que precisa de intera\xE7\xE3o do usu\xE1rio pra ativar som
                    window.parent.postMessage({ type: "WATCHPLAY_STATUS", muted: true, paused: false, readyState: 4 }, "*");
                    window.parent.postMessage({ type: "WATCHPLAY_AUTOPLAY_MUTED" }, "*");
                  }).catch(function() {
                    console.log("[MixDrop] Autoplay bloqueado mesmo mudo \u2014 esperando intera\xE7\xE3o do usu\xE1rio");
                  });
                });
              });

              art.on("play", sendStatus);
              art.on("pause", sendStatus);
              art.on("timeupdate", sendStatus);
              art.on("video:ended", notifyEnded);

              var _playBlocked = false; // Flag pra evitar loop de retry

              // Overlay de play: quando navegador bloqueia autoplay, mostra bot\xE3o grande.
              // Clique direto no v\xEDdeo = gesto do usu\xE1rio = play permitido.
              function showPlayOverlay() {
                if (document.getElementById("mixdrop-play-overlay")) return;
                var overlay = document.createElement("div");
                overlay.id = "mixdrop-play-overlay";
                overlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;";
                var btn = document.createElement("div");
                btn.style.cssText = "width:80px;height:80px;border-radius:50%;background:#e50914;display:flex;align-items:center;justify-content:center;box-shadow:0 0 30px rgba(229,9,20,0.5);";
                btn.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';
                overlay.appendChild(btn);
                overlay.addEventListener("click", function() {
                  art.muted = false;
                  art.play().then(function() {
                    _playBlocked = false;
                    overlay.remove();
                    sendStatus();
                    console.log("[MixDrop] Play iniciado por clique do usu\xE1rio");
                  }).catch(function() {});
                });
                document.body.appendChild(overlay);
              }

              window.addEventListener("message", function(e) {
                  if (e.data && e.data.type === 'SET_SUBTITLE_URL') {
                      var vid = window.artInstance ? window.artInstance.video : (typeof art !== 'undefined' && art.video ? art.video : document.querySelector('video'));
                      if (!vid) vid = document.querySelector('video');
                      if (vid) {
                          var oldTrack = document.getElementById('playinfinity-subtitle');
                          if (oldTrack) { oldTrack.remove(); }
                          if (e.data.url) {
                              var track = document.createElement('track');
                              track.id = 'playinfinity-subtitle';
                              track.kind = 'captions';
                              track.label = e.data.label || 'Portugu\xEAs (Brasil)';
                              track.srclang = 'pt-BR';
                              track.src = e.data.url;
                              track.default = true;
                              vid.appendChild(track);
                              // Espera carregar para for\xE7ar o modo showing
                              if (e.data.show !== false) { track.addEventListener('load', function() { this.mode = 'showing'; }); }
                          }
                      }
                      return;
                  }
                  if (e.data && e.data.type === 'SHOW_SUBTITLE') {
                      var tr = document.getElementById('playinfinity-subtitle');
                      if (tr) {
                          tr.mode = e.data.show ? 'showing' : 'hidden';
                      }
                      return;
                  }

                if (!e.data) return;
                var v = art.video || document.querySelector("video");

                switch (e.data.type) {
                  case "PLAY":
                    if (_playBlocked) return; // J\xE1 tentou e falhou \u2014 n\xE3o tenta de novo
                    if (art) {
                      art.play().catch(function() {
                        _playBlocked = true;
                        console.log("[MixDrop] Autoplay bloqueado \u2014 mostrando botao de clique");
                        // Mostra overlay de play (clique direto no v\xEDdeo = gesto do usu\xE1rio = permitido)
                        showPlayOverlay();
                        // Reporta UMA vez que est\xE1 pausado (n\xE3o repete)
                        window.parent.postMessage({ type: "WATCHPLAY_STATUS", paused: true, readyState: 4 }, "*");
                      });
                    } else if (v) {
                      v.play().catch(function() { _playBlocked = true; showPlayOverlay(); });
                    }
                    // N\xC3O chama sendStatus() aqui se play falhou \u2014 isso causa loop
                    break;
                  case "PAUSE":
                    if (art) art.pause();
                    else if (v) v.pause();
                    sendStatus();
                    break;
                  case "TOGGLE_PLAY":
                    if (_playBlocked) { showPlayOverlay(); return; }
                    if (art) {
                      if (art.playing) {
                        art.pause();
                        sendStatus();
                      } else {
                        art.play().catch(function() {
                          _playBlocked = true;
                          showPlayOverlay();
                        });
                        sendStatus();
                      }
                    }
                    break;
                  case "SEEK":
                  case "SEEK_ABSOLUTE":
                  case "SEEK_RELATIVE":
                    var t = typeof e.data.time === "number" ? e.data.time : e.data.targetTime;
                    if (typeof t === "number" && !isNaN(t)) {
                      if (art) art.currentTime = t;
                      else if (v) v.currentTime = t;
                      sendStatus();
                    }
                    break;
                  case "SKIP_INTRO":
                    var sec = Number(e.data.seconds) || 85;
                    var cur = (v ? v.currentTime : 0) || 0;
                    var maxD = (v && v.duration > 0 ? v.duration : 99999);
                    var target = Math.max(0, Math.min(cur + sec, maxD - 5));
                    if (art) art.currentTime = target;
                    else if (v) v.currentTime = target;
                    sendStatus();
                    break;
                  case "SET_VOLUME":
                    if (typeof e.data.volume === "number") {
                      if (art) art.volume = e.data.volume;
                      else if (v) v.volume = e.data.volume;
                      sendStatus();
                    }
                    break;
                  case "SET_MUTED":
                  case "setMuted":
                    if (art) art.muted = !!e.data.muted;
                    else if (v) v.muted = !!e.data.muted;
                    sendStatus();
                    break;
                  case "SET_PLAYBACK_RATE":
                    if (typeof e.data.rate === "number") {
                      if (art) art.playbackRate = e.data.rate;
                      else if (v) v.playbackRate = e.data.rate;
                      sendStatus();
                    }
                    break;
                  case "REQUEST_STATUS":
                    sendStatus();
                    break;
                }
              });
            })();
          </script>
        </body>
        </html>
      `);
  } catch (err) {
    console.error("[MixDrop Stream Error]:", err);
    return res.status(500).send("Erro interno ao processar stream do MixDrop.");
  }
});
router7.get("/api/mixdrop-proxy", async (req3, res) => {
  try {
    const videoUrl = String(req3.query.url || "").trim();
    if (!videoUrl || !videoUrl.includes("mxcontent.net")) {
      return res.status(400).send("URL de v\xEDdeo inv\xE1lida.");
    }
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    if (req3.headers.range) {
      headers["Range"] = req3.headers.range;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15e3);
    req3.on("close", () => controller.abort());
    const upstream = await fetch(videoUrl, { signal: controller.signal, headers });
    clearTimeout(timeoutId);
    res.status(upstream.status);
    for (const [key, value] of upstream.headers.entries()) {
      if (["content-type", "content-length", "content-range", "accept-ranges"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (!upstream.body) {
      return res.end();
    }
    const { Readable: Readable2 } = await import("stream");
    Readable2.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error("[MixDrop Proxy Error]:", err);
    res.status(500).send("Erro no proxy do MixDrop");
  }
});
var mixdrop_default = router7;

// server/routes/cast.ts
var import_express9 = require("express");
var router8 = (0, import_express9.Router)();
router8.get("/api/find-cast-source", async (req3, res) => {
  try {
    const tmdbId = req3.query.tmdbId;
    const mediaType = req3.query.mediaType;
    const season = req3.query.season;
    const episode = req3.query.episode;
    if (!tmdbId || !mediaType) {
      return res.status(400).json({ success: false, error: "Par\xE2metros obrigat\xF3rios faltando" });
    }
    const isCheckUnavailable = (content, url, status) => {
      if (status >= 400) return true;
      const lowerUrl = (url || "").toLowerCase();
      if (lowerUrl.includes("/login") || lowerUrl.includes("/admin") || lowerUrl.includes("/painel")) return true;
      const lower = (content || "").toLowerCase();
      return lower.includes("login-card") || lower.includes("login-page") || lower.includes("entrar | myplayer") || lower.includes("painel administrativo") || lower.includes("myplayer") && (lower.includes("bem-vindo") || lower.includes("bem vindo")) || lower.includes("s\xE9rie n\xE3o encontrada") || lower.includes("serie n\xE3o encontrada") || lower.includes("filme n\xE3o encontrado") || lower.includes("acesso protegido");
    };
    const checkUrl = async (url) => {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 4e3);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": new URL(url).origin
          }
        });
        clearTimeout(id);
        const text = await response.text();
        return !isCheckUnavailable(text, url, response.status);
      } catch (e) {
        return false;
      }
    };
    const movieId = req3.query.imdbId ? req3.query.imdbId : tmdbId;
    const wpUrl = `https://v1.watchplay.shop/${mediaType === "movie" ? "movie" : "tvshow"}/${mediaType === "movie" ? movieId : tmdbId}${mediaType === "series" ? `/${season}/${episode}` : ""}`;
    const isWpOk = await checkUrl(wpUrl);
    if (isWpOk) {
      return res.json({ success: true, url: wpUrl, source: "watchplayer" });
    }
    const vipId = mediaType === "series" ? `${tmdbId}-${season}-${episode}` : tmdbId;
    const vipUrl = `https://myfilmes.vip/api/player?id=${vipId}`;
    const isVipOk = await checkUrl(vipUrl);
    if (isVipOk) {
      return res.json({ success: true, url: vipUrl, source: "vip" });
    }
    return res.json({ success: false, error: "Nenhum servidor direto retornou player v\xE1lido" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
var cast_default = router8;

// server/routes/iptv.ts
var import_express10 = require("express");
var router9 = (0, import_express10.Router)();
var cachedToken = null;
async function getFreshXtreamToken() {
  if (cachedToken && cachedToken.expires > Date.now()) {
    return cachedToken.url;
  }
  const user = process.env.XTREAM_USER || "351921603109";
  const pass = process.env.XTREAM_PASS || "34939156";
  const host = process.env.XTREAM_HOST || "http://up.kiwi";
  if (!user || !pass || !host) {
    throw new Error("Credenciais Xtream n\xE3o configuradas no .env e fallbacks falharam");
  }
  const authUrl = `${host}/player_api.php?username=${user}&password=${pass}`;
  const res = await fetch(authUrl, { signal: AbortSignal.timeout(15e3) });
  const data = await res.json();
  if (!data?.user_info?.auth) {
    throw new Error("Credenciais Xtream invalidas");
  }
  const isUpKiwi = host.includes("up.kiwi");
  const base = isUpKiwi ? `${host}/${user}/${pass}` : `${host}/live/${user}/${pass}`;
  cachedToken = {
    url: base,
    expires: Date.now() + 3600 * 1e3
    // refresh a cada 1h
  };
  return base;
}
router9.get("/api/iptv/:channelId", async (req3, res) => {
  try {
    const channelId = req3.params.channelId;
    const base = await getFreshXtreamToken();
    const streamUrl = `${base}/${channelId}.m3u8`;
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const host = req3.get("host") || "localhost:3000";
    res.redirect(`${protocol}://${host}/api/live-stream-proxy?url=${encodeURIComponent(streamUrl)}`);
  } catch (e) {
    res.status(500).send("Erro obtendo token Xtream: " + e.message);
  }
});
router9.post("/api/parse-m3u-playlist", async (req3, res) => {
  try {
    let { url, content } = req3.body || {};
    if (!url && !content) {
      return res.status(400).json({ success: false, error: "Informe a URL ou o texto da lista M3U." });
    }
    let m3uText = content || "";
    if (url) {
      let fetchUrl = String(url).trim();
      if (fetchUrl.includes("github.com")) {
        if (fetchUrl.includes("/blob/")) {
          fetchUrl = fetchUrl.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
        } else if (fetchUrl.includes("/raw/")) {
          fetchUrl = fetchUrl.replace("github.com", "raw.githubusercontent.com").replace("/raw/", "/");
        } else if (!fetchUrl.endsWith(".m3u") && !fetchUrl.endsWith(".m3u8") && !fetchUrl.endsWith(".txt")) {
          const repoMatch = fetchUrl.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
          if (repoMatch) {
            const owner = repoMatch[1];
            const repo = repoMatch[2];
            fetchUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/CanaisBR01.m3u8`;
          }
        }
      }
      let parsedUrl;
      try {
        parsedUrl = new URL(fetchUrl);
      } catch {
        return res.status(400).json({ success: false, error: "Formato de URL inv\xE1lido." });
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return res.status(403).json({ success: false, error: "Protocolo n\xE3o permitido." });
      }
      if (await isPrivateOrLocalHost(parsedUrl.hostname)) {
        return res.status(403).json({ success: false, error: "Acesso a endere\xE7os locais/privados bloqueado por seguran\xE7a (Anti-SSRF)." });
      }
      const pathname = parsedUrl.pathname.toLowerCase();
      const isTrustedHost = parsedUrl.hostname.includes("githubusercontent.com") || parsedUrl.hostname.includes("github.com") || parsedUrl.hostname.includes("pastebin.com") || parsedUrl.hostname.includes("gitlab.com");
      if (!pathname.endsWith(".m3u") && !pathname.endsWith(".m3u8") && !pathname.endsWith(".txt") && !isTrustedHost) {
        return res.status(403).json({ success: false, error: "URL n\xE3o aponta para um formato de lista suportado (.m3u, .m3u8, .txt) ou provedor compat\xEDvel." });
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1e4);
      let resp = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "*/*"
        }
      });
      clearTimeout(timeout);
      if (!resp.ok && fetchUrl.includes("raw.githubusercontent.com") && fetchUrl.includes("/master/")) {
        const fallbackUrl = fetchUrl.replace("/master/", "/main/");
        try {
          const fbController = new AbortController();
          const fbTimeout = setTimeout(() => fbController.abort(), 8e3);
          const fbResp = await fetch(fallbackUrl, {
            signal: fbController.signal,
            headers: { "User-Agent": "Mozilla/5.0", "Accept": "*/*" }
          });
          clearTimeout(fbTimeout);
          if (fbResp.ok) {
            resp = fbResp;
          }
        } catch {
        }
      }
      if (!resp.ok) {
        return res.status(400).json({ success: false, error: `N\xE3o foi poss\xEDvel carregar a lista (HTTP ${resp.status}). Verifique se o link est\xE1 p\xFAblico ou use a op\xE7\xE3o 'Anexar Arquivo'.` });
      }
      const contentLength = parseInt(resp.headers.get("content-length") || "0", 10);
      if (contentLength > 5 * 1024 * 1024) {
        return res.status(413).json({ success: false, error: "A lista M3U excede o tamanho m\xE1ximo permitido de 5MB." });
      }
      m3uText = await resp.text();
    }
    if (!m3uText || typeof m3uText !== "string") {
      return res.status(400).json({ success: false, error: "Conte\xFAdo da lista vazio ou inv\xE1lido." });
    }
    const trimmedText = m3uText.trim();
    if (trimmedText.startsWith("<!DOCTYPE") || trimmedText.startsWith("<html") || trimmedText.startsWith("<!doctype")) {
      return res.status(400).json({
        success: false,
        error: "O link informado retornou uma p\xE1gina web (HTML) e n\xE3o o arquivo de texto M3U. No GitHub, clique no bot\xE3o 'Raw' para obter o link direto, ou baixe o arquivo .m3u8 e use a op\xE7\xE3o 'Anexar Arquivo'."
      });
    }
    const lines = m3uText.split(/\r?\n/);
    const parsedChannels = [];
    let currentInfo = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith("#EXTINF:")) {
        const nameMatch = line.match(/,(.+)$/);
        const name = nameMatch ? nameMatch[1].trim() : "Canal " + (parsedChannels.length + 1);
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const groupMatch = line.match(/group-title="([^"]+)"/);
        const group = (groupMatch ? groupMatch[1] : "").toLowerCase();
        const nameLower = name.toLowerCase();
        let category = "Variedades";
        if (group.includes("sport") || group.includes("esporte") || nameLower.includes("premiere") || nameLower.includes("sport") || nameLower.includes("espn") || nameLower.includes("futebol") || nameLower.includes("combate") || nameLower.includes("dazn")) {
          category = "Esportes";
        } else if (group.includes("aberta") || group.includes("aberto") || nameLower.includes("globo") || nameLower.includes("sbt") || nameLower.includes("record") || nameLower.includes("band") || nameLower.includes("redetv") || nameLower.includes("cultura")) {
          category = "TV Aberta";
        } else if (group.includes("news") || group.includes("noticia") || nameLower.includes("jornal") || nameLower.includes("cnn") || nameLower.includes("globonews") || nameLower.includes("record news")) {
          category = "Not\xEDcias";
        } else if (group.includes("filme") || group.includes("cinema") || group.includes("serie") || nameLower.includes("telecine") || nameLower.includes("hbo") || nameLower.includes("megapix") || nameLower.includes("warner") || nameLower.includes("paramount") || nameLower.includes("universal")) {
          category = "Filmes & S\xE9ries";
        } else if (group.includes("infantil") || group.includes("kids") || group.includes("anime") || group.includes("desenho") || nameLower.includes("cartoon") || nameLower.includes("disney") || nameLower.includes("nickelodeon") || nameLower.includes("gloob")) {
          category = "Infantil";
        }
        currentInfo = {
          name,
          category,
          logo: logoMatch ? logoMatch[1] : "",
          quality: nameLower.includes("1080") || nameLower.includes("fhd") ? "1080p" : nameLower.includes("720") || nameLower.includes("hd") ? "720p" : "HD"
        };
      } else if ((line.startsWith("http://") || line.startsWith("https://")) && currentInfo) {
        const id = "custom-" + Math.random().toString(36).substring(2, 9) + "-" + Date.now().toString(36);
        parsedChannels.push({
          id,
          name: currentInfo.name,
          category: currentInfo.category,
          quality: currentInfo.quality,
          logo: currentInfo.logo || "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=320&auto=format&fit=crop&q=80",
          currentProgram: "Transmiss\xE3o Ao Vivo \u2022 " + currentInfo.name,
          isCustom: true,
          servers: [
            {
              name: "Servidor Proxy Play Infinity (Recomendado)",
              url: line,
              isProxy: true
            },
            {
              name: "Servidor Direto",
              url: line,
              isProxy: false
            }
          ]
        });
        currentInfo = null;
      }
    }
    const categoryCounts = {};
    parsedChannels.forEach((c) => {
      categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
    });
    const validateStreams = req3.body?.validateStreams === true;
    let onlineCount = 0;
    let offlineCount = 0;
    if (validateStreams && parsedChannels.length > 0) {
      const BATCH_SIZE = 12;
      for (let i = 0; i < parsedChannels.length; i += BATCH_SIZE) {
        const batch = parsedChannels.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (channel) => {
          const streamUrl = channel.servers?.[0]?.url;
          if (!streamUrl) {
            channel.isOnline = false;
            channel.status = "offline";
            offlineCount++;
            return;
          }
          try {
            const parsedStream = new URL(streamUrl);
            if (parsedStream.protocol !== "http:" && parsedStream.protocol !== "https:") throw new Error();
            if (await isPrivateOrLocalHost(parsedStream.hostname)) {
              channel.isOnline = false;
              channel.status = "offline";
              channel.error = "IP privado ou n\xE3o autorizado (Anti-SSRF)";
              offlineCount++;
              return;
            }
          } catch (e) {
            channel.isOnline = false;
            channel.status = "offline";
            channel.error = "URL inv\xE1lida";
            offlineCount++;
            return;
          }
          const startTime = Date.now();
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3500);
            const checkRes = await fetch(streamUrl, {
              method: "GET",
              signal: controller.signal,
              headers: {
                "Range": "bytes=0-1024",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "*/*"
              }
            });
            clearTimeout(timeout);
            const elapsed = Date.now() - startTime;
            const contentType = checkRes.headers.get("content-type") || "";
            const isOk = checkRes.status >= 200 && checkRes.status < 400 || contentType.includes("mpeg") || contentType.includes("video");
            if (isOk) {
              channel.isOnline = true;
              channel.status = "online";
              channel.responseTimeMs = elapsed;
              onlineCount++;
            } else {
              channel.isOnline = false;
              channel.status = "offline";
              channel.statusCode = checkRes.status;
              offlineCount++;
            }
          } catch (err) {
            channel.isOnline = false;
            channel.status = "offline";
            channel.error = err.name === "AbortError" ? "Tempo limite esgotado (timeout)" : "Link inacess\xEDvel";
            offlineCount++;
          }
        }));
      }
    } else {
      parsedChannels.forEach((c) => {
        c.isOnline = true;
        c.status = "untested";
      });
      onlineCount = parsedChannels.length;
    }
    return res.json({
      success: true,
      total: parsedChannels.length,
      onlineCount,
      offlineCount,
      validated: validateStreams,
      categories: categoryCounts,
      channels: parsedChannels,
      sample: parsedChannels.slice(0, 10)
    });
  } catch (err) {
    console.error("[M3U Parser API Error]:", err.message);
    return res.status(500).json({ success: false, error: err.message || "Erro ao processar lista M3U" });
  }
});
router9.all(["/api/watchplay-proxy-api", "/api/watchplay-proxy-api/api", "/api/watchplay-proxy", "/api/watchplay-proxy/api"], async (req3, res) => {
  try {
    const upstreamRes = await fetch("https://v1.watchplay.shop/api", {
      signal: AbortSignal.timeout(15e3),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://v1.watchplay.shop/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: new URLSearchParams(req3.body)
    });
    const data = await upstreamRes.json();
    return res.json(data);
  } catch (err) {
    console.error("[WatchPlay Proxy API Error]:", err.message);
    return res.status(500).json({ errors: "1", message: err.message });
  }
});
var iptv_default = router9;

// server/routes/bolodechocolate.ts
var import_express11 = require("express");
var router10 = (0, import_express11.Router)();
var BREADCRUMB_BASE = 17890309;
var cache = null;
function decodeDCI(html) {
  const match = html.match(/var DCI = \[([\s\S]*?)\]/);
  if (!match) return null;
  const items = match[1].match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, "")) || [];
  let trg = "";
  for (const item of items) {
    try {
      const decoded = Buffer.from(item, "base64").toString("utf-8");
      const digits = decoded.replace(/\D/g, "");
      if (digits) {
        const charCode = parseInt(digits) - BREADCRUMB_BASE;
        if (charCode >= 0 && charCode <= 1114111) {
          trg += String.fromCharCode(charCode);
        }
      }
    } catch {
    }
  }
  const urlMatch = trg.match(/window\.url\s*=\s*"([^"]+)"/);
  const ckIdMatch = trg.match(/window\.ck_id\s*=\s*"([^"]+)"/);
  const ckKeyMatch = trg.match(/window\.ck_key\s*=\s*"([^"]+)"/);
  if (!urlMatch || !ckIdMatch || !ckKeyMatch) return null;
  return {
    url: urlMatch[1],
    ck_id: ckIdMatch[1],
    ck_key: ckKeyMatch[1]
  };
}
router10.get("/api/bolodechocolate", async (req3, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=60");
    const canal = req3.query.canal || "premiereclubes";
    if (cache && cache.expires > Date.now()) {
      return res.json({ mpd_url: cache.url, ck_id: cache.ck_id, ck_key: cache.ck_key, cached: true });
    }
    const embedUrl = `https://bolodechocolate.fit/embed/${canal}.html`;
    const upstream = await fetch(embedUrl, {
      signal: AbortSignal.timeout(15e3),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,*/*",
        "Referer": "https://piratatvs.com/"
      }
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: `bolodechocolate.fit retornou ${upstream.status}` });
    }
    const html = await upstream.text();
    const decoded = decodeDCI(html);
    if (!decoded) {
      return res.status(502).json({ error: "N\xE3o foi poss\xEDvel decodificar o stream (DCI array)" });
    }
    cache = {
      url: decoded.url,
      ck_id: decoded.ck_id,
      ck_key: decoded.ck_key,
      expires: Date.now() + 5 * 60 * 1e3
    };
    console.log(`[bolodechocolate] Canal: ${canal} | URL: ${decoded.url.substring(0, 80)}...`);
    return res.json({
      mpd_url: decoded.url,
      ck_id: decoded.ck_id,
      ck_key: decoded.ck_key,
      cached: false
    });
  } catch (err) {
    console.error("[bolodechocolate] Erro:", err?.message || err);
    return res.status(500).json({ error: "Erro interno" });
  }
});
var bolodechocolate_default = router10;

// server/routes/nixplayRoutes.ts
var import_express12 = require("express");

// server/services/nixplayCatalog.ts
var nixplayMovies = /* @__PURE__ */ new Set();
var nixplaySeries = /* @__PURE__ */ new Set();
var isCatalogLoaded = false;
function isNixplayAvailable(tmdbId, isSeries) {
  if (!isCatalogLoaded) return false;
  const idStr = String(tmdbId);
  return isSeries ? nixplaySeries.has(idStr) : nixplayMovies.has(idStr);
}

// server/routes/nixplayRoutes.ts
var router11 = (0, import_express12.Router)();
router11.get("/api/nixplay-check", (req3, res) => {
  const { tmdb_id, type } = req3.query;
  if (!tmdb_id || !type) return res.status(400).json({ error: "Missing tmdb_id or type" });
  const isSeries = type === "series";
  const available = isNixplayAvailable(String(tmdb_id), isSeries);
  return res.json({ available });
});
router11.get("/api/nixplay-resolve", async (req3, res) => {
  const nixUrl = req3.query.url;
  if (!nixUrl) return res.status(400).json({ error: "Missing url" });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8e3);
    const upstream = await fetch(nixUrl, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal
    });
    clearTimeout(timeout);
    const location = upstream.headers.get("location");
    if ((upstream.status === 302 || upstream.status === 301) && location) {
      return res.json({ url: location });
    }
    if (upstream.ok) {
      return res.json({ url: nixUrl });
    }
    return res.status(upstream.status).json({ error: `Nixplay retornou ${upstream.status}` });
  } catch (err) {
    console.error("[nixplay-resolve] Erro:", err?.message);
    return res.status(502).json({ error: err?.message || "Erro ao resolver URL" });
  }
});
router11.get("/api/native-player", (req3, res) => {
  const videoUrl = req3.query.url;
  if (!videoUrl) return res.status(400).send("Missing url parameter");
  const encodedUrl = encodeURIComponent(videoUrl);
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; } 
    html,body { width:100%; height:100%; background:#000; overflow:hidden; } 
    video { width:100%; height:100%; object-fit:contain; background:#000; outline:none; }
    #loader { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:#000; }
    .spinner { width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.1); border-left-color: #E50914; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="loader"><div class="spinner"></div></div>
  <video id="native-video" playsinline autoplay></video>
  <script>
    var video = document.getElementById('native-video');
    var loader = document.getElementById('loader');

    function sendStatus() {
      if (!video) return;
      window.parent.postMessage({
        type: 'WATCHPLAY_STATUS',
        data: {
          currentTime: video.currentTime || 0,
          duration: video.duration || 0,
          paused: video.paused,
          muted: video.muted,
          volume: video.volume,
          buffered: video.buffered && video.buffered.length > 0 ? (video.buffered.end(video.buffered.length - 1) / Math.max(video.duration || 1, 1)) * 100 : 0,
          readyState: video.readyState
        }
      }, '*');
    }

    function initVideo(src) {
      loader.style.display = 'none';
      video.src = src;
      video.addEventListener('play', sendStatus);
      video.addEventListener('pause', sendStatus);
      video.addEventListener('timeupdate', sendStatus);
      video.addEventListener('durationchange', sendStatus);
      video.addEventListener('volumechange', sendStatus);
      video.addEventListener('progress', sendStatus);
      video.addEventListener('error', function() {
        window.parent.postMessage({ type: 'WATCHPLAY_ERROR', reason: 'native_src_error' }, '*');
      });
      setInterval(sendStatus, 1000);
      sendStatus();
    }

    var rawUrl = decodeURIComponent('${encodedUrl}');
    var needsResolve = rawUrl.indexOf('nixplay.lat') !== -1;

    if (needsResolve) {
      fetch('/api/nixplay-resolve?url=' + encodeURIComponent(rawUrl, { signal: AbortSignal.timeout(15000) }))
        .then(function(r) { return r.json(); })
        .then(function(data) { initVideo(data.url || rawUrl); })
        .catch(function() { initVideo(rawUrl); });
    } else {
      initVideo(rawUrl);
    }
    window.addEventListener('message', function(e) {
                  if (e.data && e.data.type === 'SET_SUBTITLE_URL') {
                      var vid = window.artInstance ? window.artInstance.video : (typeof art !== 'undefined' && art.video ? art.video : document.querySelector('video'));
                      if (!vid) vid = document.querySelector('video');
                      if (vid) {
                          var oldTrack = document.getElementById('playinfinity-subtitle');
                          if (oldTrack) { oldTrack.remove(); }
                          if (e.data.url) {
                              var track = document.createElement('track');
                              track.id = 'playinfinity-subtitle';
                              track.kind = 'captions';
                              track.label = e.data.label || 'Portugu\xEAs (Brasil)';
                              track.srclang = 'pt-BR';
                              track.src = e.data.url;
                              track.default = true;
                              vid.appendChild(track);
                              // Espera carregar para for\xE7ar o modo showing
                              if (e.data.show !== false) { track.addEventListener('load', function() { this.mode = 'showing'; }); }
                          }
                      }
                      return;
                  }
                  if (e.data && e.data.type === 'SHOW_SUBTITLE') {
                      var tr = document.getElementById('playinfinity-subtitle');
                      if (tr) {
                          tr.mode = e.data.show ? 'showing' : 'hidden';
                      }
                      return;
                  }

      if (!video) return;
      var cmd = e.data;
      if (!cmd || !cmd.type) return;
      try {
        if (cmd.type === 'PLAY' || cmd.type === 'play') { video.play(); }
        else if (cmd.type === 'PAUSE' || cmd.type === 'pause') { video.pause(); }
        else if (cmd.type === 'SEEK' && typeof cmd.targetTime === 'number') { video.currentTime = cmd.targetTime; }
        else if (cmd.type === 'seek' && typeof cmd.time === 'number') { video.currentTime = cmd.time; }
        else if (cmd.type === 'SET_VOLUME' && typeof cmd.volume === 'number') { video.volume = cmd.volume; video.muted = (cmd.volume === 0); }
        else if (cmd.type === 'setMuted') { video.muted = !!cmd.muted; }
        sendStatus();
      } catch(err) {}
    });
  </script>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});
router11.get("/api/proxy-test", async (req3, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const targetUrl = String(req3.query.url || "").trim();
  if (!targetUrl) {
    return res.status(400).json({ error: "Par\xE2metro 'url' \xE9 obrigat\xF3rio" });
  }
  const workerProxyUrl = process.env.WORKER_PROXY_URL;
  const useWorker = !!workerProxyUrl;
  const fetchUrl = useWorker ? `${workerProxyUrl}?url=${encodeURIComponent(targetUrl)}` : targetUrl;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15e3);
    const upstream = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const body = await upstream.text();
    const isCFBlocked = body.includes("Attention Required") || body.includes("Just a moment");
    const titleMatch = body.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;
    return res.json({
      target_url: targetUrl,
      via_worker: useWorker,
      worker_url: workerProxyUrl || null,
      status: upstream.status,
      body_size: body.length,
      title,
      cloudflare_blocked: isCFBlocked,
      sample: body.substring(0, 500)
    });
  } catch (err) {
    return res.status(502).json({
      error: "Erro ao fetchar URL",
      detail: err.message,
      target_url: targetUrl,
      via_worker: useWorker
    });
  }
});
var nixplayRoutes_default = router11;

// server/routes/serverBlocks.ts
var import_express13 = require("express");
var import_fs5 = __toESM(require("fs"), 1);
var import_path5 = __toESM(require("path"), 1);
var router12 = (0, import_express13.Router)();
var BLOCKS_FILE = import_path5.default.join(process.cwd(), "data", "server-blocks.json");
var BLOCKS_DIR = import_path5.default.dirname(BLOCKS_FILE);
var _blocks = [];
var _blocksByTmdb = /* @__PURE__ */ new Map();
var _loaded = false;
var ADMIN_TOKEN_HEADER = "x-admin-token";
function loadBlocks() {
  try {
    if (!import_fs5.default.existsSync(BLOCKS_FILE)) {
      if (!import_fs5.default.existsSync(BLOCKS_DIR)) {
        import_fs5.default.mkdirSync(BLOCKS_DIR, { recursive: true });
      }
      const seed = [
        {
          id: "911430_srv_watchplay",
          tmdbId: 911430,
          serverKey: "srv_watchplay",
          contentType: "movie",
          title: "F1: O Filme",
          reason: "Vers\xE3o WatchPlayer estava em ingl\xEAs; outras fontes t\xEAm PT-BR",
          blockedAt: (/* @__PURE__ */ new Date()).toISOString(),
          blockedBy: "system-seed"
        },
        {
          id: "969681_srv_watchplay",
          tmdbId: 969681,
          serverKey: "srv_watchplay",
          contentType: "movie",
          title: "Homem-Aranha: Um Novo Dia",
          reason: "Vers\xE3o WatchPlayer estava em ingl\xEAs; outras fontes t\xEAm PT-BR",
          blockedAt: (/* @__PURE__ */ new Date()).toISOString(),
          blockedBy: "system-seed"
        }
      ];
      import_fs5.default.writeFileSync(BLOCKS_FILE, JSON.stringify(seed, null, 2), "utf-8");
      _blocks = seed;
    } else {
      const raw = import_fs5.default.readFileSync(BLOCKS_FILE, "utf-8");
      _blocks = JSON.parse(raw || "[]");
    }
  } catch (err) {
    console.warn("[server-blocks] Falha ao carregar:", err);
    _blocks = [];
  }
  _blocksByTmdb.clear();
  for (const b of _blocks) {
    if (!_blocksByTmdb.has(b.tmdbId)) {
      _blocksByTmdb.set(b.tmdbId, /* @__PURE__ */ new Set());
    }
    _blocksByTmdb.get(b.tmdbId).add(b.serverKey);
  }
  _loaded = true;
}
function ensureLoaded() {
  if (!_loaded) {
    loadBlocks();
  }
}
function persistBlocks() {
  try {
    if (!import_fs5.default.existsSync(BLOCKS_DIR)) {
      import_fs5.default.mkdirSync(BLOCKS_DIR, { recursive: true });
    }
    import_fs5.default.writeFileSync(BLOCKS_FILE, JSON.stringify(_blocks, null, 2), "utf-8");
  } catch (err) {
    console.error("[server-blocks] Falha ao persistir:", err);
  }
}
async function isAdminToken(req3) {
  const authHeader = req3.header("authorization") || req3.header("Authorization");
  const xAdminToken = req3.header(ADMIN_TOKEN_HEADER) || req3.header("X-Admin-Token");
  let token = "";
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (xAdminToken) {
    token = xAdminToken.trim();
  }
  if (!token) {
    console.warn("[server-blocks] Auth falhou: token ausente");
    return false;
  }
  if (token === "system-seed" && process.env.NODE_ENV !== "production") {
    return true;
  }
  if (token.includes("@")) {
    console.warn("[server-blocks] Auth bloqueada: tentativa de usar e-mail como token de admin.");
    return false;
  }
  try {
    const { verifyFirebaseUserToken: verifyFirebaseUserToken2 } = await Promise.resolve().then(() => (init_requireAdminAuth(), requireAdminAuth_exports));
    const verifiedUser = await verifyFirebaseUserToken2(token);
    if (verifiedUser && verifiedUser.uid) {
      const adminEmails = [
        "naylanmoreira350@gmail.com",
        "cbeth761@gmail.com",
        ...(process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
      ];
      const userEmail = (verifiedUser.email || "").toLowerCase().trim();
      if (adminEmails.includes(userEmail)) {
        return true;
      }
    }
    const { getAdminDb: getAdminDb2 } = await Promise.resolve().then(() => (init_firebaseAdmin(), firebaseAdmin_exports));
    const adminDb2 = getAdminDb2();
    if (adminDb2 && token.length > 10 && !token.includes("@")) {
      const docSnap = await adminDb2.collection("administradores").doc(token).get();
      if (docSnap.exists) {
        return true;
      }
    }
    console.warn("[server-blocks] Auth falhou: token n\xE3o autorizado.");
    return false;
  } catch (err) {
    console.warn("[server-blocks] Auth check falhou com erro:", err);
    return false;
  }
}
var VALID_SERVER_KEYS = /* @__PURE__ */ new Set([
  "srv_watchplay",
  "srv_mixdrop",
  "srv_vip",
  "srv_nixplay",
  "srv_vidsrc"
  // Nuvix HD
]);
router12.get("/api/server-blocks", async (req3, res) => {
  try {
    ensureLoaded();
    const tmdbIdParam = req3.query.tmdb_id;
    if (tmdbIdParam) {
      const tmdbId = parseInt(tmdbIdParam, 10);
      if (isNaN(tmdbId)) {
        return res.status(400).json({ error: "tmdb_id inv\xE1lido" });
      }
      const blocked = _blocksByTmdb.get(tmdbId) || /* @__PURE__ */ new Set();
      return res.json({
        success: true,
        tmdbId,
        blockedServerKeys: Array.from(blocked)
      });
    }
    return res.json({
      success: true,
      blocks: _blocks
    });
  } catch (err) {
    console.error("[server-blocks] GET error:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});
router12.post("/api/admin/server-blocks", async (req3, res) => {
  try {
    if (!await isAdminToken(req3)) {
      return res.status(401).json({ error: "N\xE3o autorizado" });
    }
    const { tmdbId, serverKey, contentType, title, reason } = req3.body || {};
    if (typeof tmdbId !== "number" || isNaN(tmdbId)) {
      return res.status(400).json({ error: "tmdbId deve ser n\xFAmero" });
    }
    if (typeof serverKey !== "string" || !VALID_SERVER_KEYS.has(serverKey)) {
      return res.status(400).json({
        error: `serverKey inv\xE1lido. V\xE1lidos: ${Array.from(VALID_SERVER_KEYS).join(", ")}`
      });
    }
    if (contentType && !["movie", "series"].includes(contentType)) {
      return res.status(400).json({ error: "contentType deve ser 'movie' ou 'series'" });
    }
    ensureLoaded();
    const id = `${tmdbId}_${serverKey}`;
    const newBlock = {
      id,
      tmdbId,
      serverKey,
      contentType: contentType || "movie",
      title: String(title || "").slice(0, 200),
      reason: String(reason || "").slice(0, 500),
      blockedAt: (/* @__PURE__ */ new Date()).toISOString(),
      blockedBy: req3.header(ADMIN_TOKEN_HEADER) || "unknown"
    };
    _blocks = _blocks.filter((b) => b.id !== id);
    _blocks.push(newBlock);
    if (!_blocksByTmdb.has(tmdbId)) {
      _blocksByTmdb.set(tmdbId, /* @__PURE__ */ new Set());
    }
    _blocksByTmdb.get(tmdbId).add(serverKey);
    persistBlocks();
    return res.json({
      success: true,
      block: newBlock,
      totalBlocks: _blocks.length
    });
  } catch (err) {
    console.error("[server-blocks] POST error:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});
router12.delete("/api/admin/server-blocks/:id", async (req3, res) => {
  try {
    if (!await isAdminToken(req3)) {
      return res.status(401).json({ error: "N\xE3o autorizado" });
    }
    const id = req3.params.id;
    if (!id) {
      return res.status(400).json({ error: "id obrigat\xF3rio" });
    }
    ensureLoaded();
    const before = _blocks.length;
    const removed = _blocks.find((b) => b.id === id);
    _blocks = _blocks.filter((b) => b.id !== id);
    if (_blocks.length === before) {
      return res.status(404).json({ error: "Block n\xE3o encontrado" });
    }
    _blocksByTmdb.clear();
    for (const b of _blocks) {
      if (!_blocksByTmdb.has(b.tmdbId)) {
        _blocksByTmdb.set(b.tmdbId, /* @__PURE__ */ new Set());
      }
      _blocksByTmdb.get(b.tmdbId).add(b.serverKey);
    }
    persistBlocks();
    return res.json({
      success: true,
      removed,
      totalBlocks: _blocks.length
    });
  } catch (err) {
    console.error("[server-blocks] DELETE error:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});
router12.patch("/api/admin/server-blocks/:id", async (req3, res) => {
  try {
    if (!await isAdminToken(req3)) {
      return res.status(401).json({ error: "N\xE3o autorizado" });
    }
    const id = req3.params.id;
    if (!id) {
      return res.status(400).json({ error: "id obrigat\xF3rio" });
    }
    const { reason } = req3.body || {};
    ensureLoaded();
    const block = _blocks.find((b) => b.id === id);
    if (!block) {
      return res.status(404).json({ error: "Block n\xE3o encontrado" });
    }
    block.reason = typeof reason === "string" ? reason.trim() : "";
    persistBlocks();
    return res.json({
      success: true,
      block
    });
  } catch (err) {
    console.error("[server-blocks] PATCH error:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});
var serverBlocks_default = router12;

// server/routes/adminOps.ts
var import_express14 = require("express");
var import_fs6 = __toESM(require("fs"), 1);
var import_path6 = __toESM(require("path"), 1);
var import_child_process = require("child_process");
var import_ssh2 = require("ssh2");
var adminOpsRouter = (0, import_express14.Router)();
var ORACLE_VPS_HOST = process.env.ORACLE_VPS_HOST || "147.15.57.146";
var ORACLE_VPS_PORT = parseInt(process.env.ORACLE_VPS_PORT || "22", 10);
var ORACLE_VPS_USER = process.env.ORACLE_VPS_USER || "ubuntu";
var ORACLE_HEALTH_URL = process.env.ORACLE_HEALTH_URL || "https://play-infinity.stream/api/health";
function getSshPrivateKey() {
  const possiblePaths = [
    import_path6.default.join(process.cwd(), "oracle-vps.key"),
    import_path6.default.join(process.cwd(), "secrets", "oracle-vps.key"),
    "/home/ubuntu/play-infinity/secrets/oracle-vps.key",
    "/home/ubuntu/.ssh/id_rsa",
    "/home/ubuntu/.ssh/id_ed25519",
    "/etc/secrets/oracle-vps.key"
  ];
  for (const p of possiblePaths) {
    if (import_fs6.default.existsSync(p)) {
      try {
        return import_fs6.default.readFileSync(p, "utf-8");
      } catch (err) {
        console.warn(`[AdminOps] Falha ao ler chave em ${p}:`, err);
      }
    }
  }
  if (process.env.ORACLE_SSH_KEY) {
    return process.env.ORACLE_SSH_KEY;
  }
  return null;
}
async function executeSystemOrSshCommand(command, timeoutMs = 25e3) {
  const isDirectOnVps = process.platform === "linux" && (import_fs6.default.existsSync("/home/ubuntu/play-infinity") || import_fs6.default.existsSync("/home/ubuntu/.pm2") || process.cwd().includes("/home/ubuntu"));
  if (isDirectOnVps) {
    try {
      return await new Promise((resolve) => {
        (0, import_child_process.exec)(command, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
          resolve({
            stdout: stdout ? stdout.toString() : "",
            stderr: stderr ? stderr.toString() : "",
            code: err ? typeof err.code === "number" ? err.code : 1 : 0
          });
        });
      });
    } catch (localErr) {
      console.warn("[AdminOps] Execu\xE7\xE3o local falhou, tentando fallback SSH:", localErr?.message);
    }
  }
  return executeSshCommand(command, timeoutMs);
}
function executeSshCommand(command, timeoutMs = 25e3) {
  return new Promise((resolve, reject) => {
    const privateKey = getSshPrivateKey();
    if (!privateKey) {
      return reject(new Error("Chave SSH (oracle-vps.key) n\xE3o encontrada no servidor."));
    }
    const conn = new import_ssh2.Client();
    const timer = setTimeout(() => {
      try {
        conn.end();
      } catch {
      }
      reject(new Error(`Comando SSH expirou ap\xF3s ${timeoutMs / 1e3}s`));
    }, timeoutMs);
    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          try {
            conn.end();
          } catch {
          }
          return reject(err);
        }
        let stdout = "";
        let stderr = "";
        stream.on("data", (data) => {
          stdout += data.toString();
        });
        stream.stderr.on("data", (data) => {
          stderr += data.toString();
        });
        stream.on("close", (code) => {
          clearTimeout(timer);
          try {
            conn.end();
          } catch {
          }
          resolve({ stdout, stderr, code: code || 0 });
        });
      });
    });
    conn.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    try {
      conn.connect({
        host: ORACLE_VPS_HOST,
        port: ORACLE_VPS_PORT,
        username: ORACLE_VPS_USER,
        privateKey,
        readyTimeout: 8e3,
        keepaliveInterval: 2e3
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}
adminOpsRouter.get("/health-check", async (req3, res) => {
  const tmdbApiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
  const targets = [
    { name: "Cat\xE1logo Vizer", url: "https://vizer.website", type: "html" },
    { name: "Cat\xE1logo Encontrei.me", url: "https://encontrei.me", type: "html" },
    { name: "TMDB API", url: `https://api.themoviedb.org/3/configuration?api_key=${tmdbApiKey}`, type: "json" },
    { name: "VIP Player", url: "https://myembed.biz", type: "html" },
    { name: "Watchplayer", url: "https://v1.watchplay.shop", type: "html" },
    { name: "MixDrop", url: "https://mxdrop.top", type: "html" }
  ];
  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        const start = Date.now();
        const response = await fetch(target.url, {
          signal: AbortSignal.timeout(8e3),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const latency = Date.now() - start;
        return {
          name: target.name,
          url: target.url,
          status: response.status >= 200 && response.status < 400 ? "ONLINE" : "OFFLINE",
          latencyMs: latency,
          statusCode: response.status
        };
      } catch (error) {
        return {
          name: target.name,
          url: target.url,
          status: "OFFLINE",
          latencyMs: null,
          statusCode: error.response?.status || 0,
          error: error.message
        };
      }
    })
  );
  res.json({ success: true, timestamp: Date.now(), results });
});
adminOpsRouter.get("/vps-telemetry", async (_req, res) => {
  const startTime = Date.now();
  let proxyStatus = {
    online: false,
    latencyMs: 0,
    httpStatus: 0,
    url: ORACLE_HEALTH_URL,
    error: null
  };
  try {
    const probeStart = Date.now();
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6e3);
    const resp = await fetch(ORACLE_HEALTH_URL, { signal: ctrl.signal });
    clearTimeout(to);
    proxyStatus.latencyMs = Date.now() - probeStart;
    proxyStatus.httpStatus = resp.status;
    proxyStatus.online = resp.ok;
  } catch (err) {
    proxyStatus.online = false;
    proxyStatus.error = err?.name === "AbortError" ? "Timeout (6s)" : err?.message || "Inacess\xEDvel";
  }
  const webServerStatus = {
    online: true,
    platform: process.platform,
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
  };
  let vpsHardware = {
    hasSsh: false,
    error: null,
    ram: {
      totalMb: 0,
      usedMb: 0,
      freeMb: 0,
      buffCacheMb: 0,
      availableMb: 0,
      usedPercent: 0
    },
    swap: {
      totalMb: 0,
      usedMb: 0,
      freeMb: 0,
      usedPercent: 0
    },
    uptime: "",
    loadAverage: [0, 0, 0],
    pm2Processes: []
  };
  try {
    const sshCmd = `free -m && echo "===DELIM_UPTIME===" && uptime && echo "===DELIM_PM2===" && pm2 jlist && echo "===DELIM_PM2_ROOT===" && sudo pm2 jlist`;
    const sshResult = await executeSystemOrSshCommand(sshCmd, 12e3);
    vpsHardware.hasSsh = true;
    const parts = sshResult.stdout.split("===DELIM_UPTIME===");
    if (parts.length >= 2) {
      const freeLines = parts[0].trim().split("\n");
      const nextParts = parts[1].split("===DELIM_PM2===");
      const uptimeRaw = (nextParts[0] || "").trim();
      const pm2Parts = (nextParts[1] || "").split("===DELIM_PM2_ROOT===");
      const pm2RawUbuntu = (pm2Parts[0] || "").trim();
      const pm2RawRoot = (pm2Parts[1] || "").trim();
      for (const line of freeLines) {
        if (line.startsWith("Mem:")) {
          const cols = line.replace(/Mem:\s+/, "").trim().split(/\s+/).map(Number);
          if (cols.length >= 6) {
            vpsHardware.ram.totalMb = cols[0];
            vpsHardware.ram.usedMb = cols[1];
            vpsHardware.ram.freeMb = cols[2];
            vpsHardware.ram.buffCacheMb = cols[4];
            vpsHardware.ram.availableMb = cols[5];
            vpsHardware.ram.usedPercent = Math.round(cols[1] / (cols[0] || 1) * 100);
          }
        } else if (line.startsWith("Swap:")) {
          const cols = line.replace(/Swap:\s+/, "").trim().split(/\s+/).map(Number);
          if (cols.length >= 3) {
            vpsHardware.swap.totalMb = cols[0];
            vpsHardware.swap.usedMb = cols[1];
            vpsHardware.swap.freeMb = cols[2];
            vpsHardware.swap.usedPercent = cols[0] > 0 ? Math.round(cols[1] / cols[0] * 100) : 0;
          }
        }
      }
      vpsHardware.uptime = uptimeRaw;
      const loadMatch = uptimeRaw.match(/load average:\s*([0-9\.]+),\s*([0-9\.]+),\s*([0-9\.]+)/i);
      if (loadMatch) {
        vpsHardware.loadAverage = [
          parseFloat(loadMatch[1]) || 0,
          parseFloat(loadMatch[2]) || 0,
          parseFloat(loadMatch[3]) || 0
        ];
      }
      try {
        let pm2List = [];
        try {
          const uList = JSON.parse(pm2RawUbuntu);
          if (Array.isArray(uList)) pm2List = pm2List.concat(uList);
        } catch (e) {
        }
        try {
          const rList = JSON.parse(pm2RawRoot);
          if (Array.isArray(rList)) pm2List = pm2List.concat(rList);
        } catch (e) {
        }
        if (pm2List.length > 0) {
          const seen = /* @__PURE__ */ new Set();
          pm2List = pm2List.filter((app2) => {
            const isDuplicate = seen.has(app2.name);
            seen.add(app2.name);
            return !isDuplicate;
          });
          vpsHardware.pm2Processes = pm2List.map((app2) => ({
            name: app2.name || "desconhecido",
            status: app2.pm2_env?.status || "offline",
            memoryMb: Math.round((app2.monit?.memory || 0) / 1024 / 1024),
            cpuPercent: parseFloat((app2.monit?.cpu || 0).toFixed(1)),
            restarts: app2.pm2_env?.restart_time || 0
          }));
        }
      } catch (jsonErr) {
        console.warn("[AdminOps] Falha geral ao fazer parse do PM2 JSON:", jsonErr.message);
      }
    }
  } catch (sshErr) {
    vpsHardware.hasSsh = false;
    vpsHardware.error = sshErr?.message || "Falha na conex\xE3o SSH com a VPS";
  }
  res.json({
    success: true,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    queryDurationMs: Date.now() - startTime,
    proxyStatus,
    webServerStatus,
    vpsHardware
  });
});
adminOpsRouter.get("/vps-bot-logs", async (_req, res) => {
  try {
    const command = "tail -n 30 /home/ubuntu/.pm2/logs/ampere-creator-out.log";
    const result = await executeSystemOrSshCommand(command, 15e3);
    if (result.code !== 0 && !result.stdout) {
      throw new Error(result.stderr || `Comando retornou c\xF3digo ${result.code}`);
    }
    res.json({
      success: true,
      logs: result.stdout || "Log vazio ou n\xE3o encontrado."
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err?.message || "Falha ao obter logs do rob\xF4 na VPS"
    });
  }
});
adminOpsRouter.post("/vps-action", async (req3, res) => {
  const { action } = req3.body || {};
  let commandToRun = "";
  let actionDescription = "";
  switch (action) {
    case "restart-all":
      commandToRun = "(sleep 1 && sudo pm2 restart all) > /dev/null 2>&1 & echo 'Comando de reinicializa\xE7\xE3o enviado (PM2 restart all agendado).'";
      actionDescription = "Reiniciar todos os processos PM2 na VPS";
      break;
    case "restart-proxy":
      commandToRun = "sudo fuser -k 8080/tcp || true; sudo pm2 restart video-proxy";
      actionDescription = "Reiniciar servi\xE7o do Proxy de TV (e eliminar processos fantasmas)";
      break;
    case "restart-app":
      commandToRun = "(sleep 1 && sudo pm2 restart play-infinity-app) > /dev/null 2>&1 & echo 'Comando de reinicializa\xE7\xE3o enviado (play-infinity-app agendado).'";
      actionDescription = "Reiniciar aplica\xE7\xE3o web (play-infinity-app)";
      break;
    case "git-pull-build":
      commandToRun = `
        set -e
        echo "\u{1F680} Localizando diret\xF3rio do projeto..."
        if [ -d "/home/ubuntu/Play-Infinity" ]; then
          cd /home/ubuntu/Play-Infinity
        elif [ -d "/home/ubuntu/play-infinity" ]; then
          cd /home/ubuntu/play-infinity
        else
          cd /home/ubuntu
        fi
        
        echo "\u{1F4E5} Executando git pull..."
        git pull origin main || git pull origin master || true
        
        echo "\u{1F4E6} Instalando depend\xEAncias e gerando build..."
        npm run build || echo "Aviso no build"
        
        echo "\u{1F504} Agendando reinicializa\xE7\xE3o dos servi\xE7os PM2..."
        (sleep 1 && sudo pm2 restart all) > /dev/null 2>&1 &
        
        echo "\u2705 A\xE7\xE3o conclu\xEDda com sucesso! Os servi\xE7os est\xE3o sendo atualizados."
      `;
      actionDescription = "Atualiza\xE7\xE3o manual via Git Pull e Build na VPS";
      break;
    default:
      return res.status(400).json({
        success: false,
        error: "A\xE7\xE3o inv\xE1lida. A\xE7\xF5es permitidas: restart-all, restart-proxy, restart-app, git-pull-build."
      });
  }
  try {
    const result = await executeSystemOrSshCommand(commandToRun, 6e4);
    return res.json({
      success: result.code === 0,
      action,
      actionDescription,
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      action,
      actionDescription,
      error: err?.message || "Falha ao executar comando na VPS via SSH"
    });
  }
});
adminOpsRouter.get("/github-runs", async (req3, res) => {
  const repo = req3.query.repo || process.env.GITHUB_REPOSITORY || "Dante2526/Play-Infinity";
  const token = req3.query.token || process.env.GITHUB_TOKEN || "";
  const cleanRepo = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
  const parts = cleanRepo.split("/");
  if (parts.length < 2) {
    return res.status(400).json({
      success: false,
      error: "Formato de reposit\xF3rio inv\xE1lido. Utilize o formato: usuario/nome-do-repositorio (ex: Dante2526/Play-Infinity)"
    });
  }
  const [owner, repoName] = parts;
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs?per_page=8`;
  try {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "PlayInfinity-Admin-Monitor",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (token && token.trim()) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(15e3), headers });
    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `GitHub API retornou status ${response.status}`;
      try {
        const parsed = JSON.parse(errText);
        errorMsg = parsed.message || errorMsg;
      } catch {
      }
      if (response.status === 404) {
        errorMsg = `Reposit\xF3rio '${cleanRepo}' n\xE3o encontrado ou \xE9 privado. Se for privado, informe um Token de Acesso Pessoal (PAT) do GitHub nas configura\xE7\xF5es.`;
      } else if (response.status === 401 || response.status === 403) {
        errorMsg = `Acesso negado ou limite de requisi\xE7\xF5es do GitHub atingido. Adicione um Token do GitHub nas configura\xE7\xF5es.`;
      }
      return res.status(response.status).json({
        success: false,
        error: errorMsg,
        repo: cleanRepo
      });
    }
    const data = await response.json();
    const runs = (data.workflow_runs || []).map((run) => {
      const createdAt = new Date(run.created_at).getTime();
      const updatedAt = new Date(run.updated_at).getTime();
      const isCompleted = run.status === "completed";
      const durationSeconds = isCompleted ? Math.max(0, Math.floor((updatedAt - createdAt) / 1e3)) : Math.max(0, Math.floor((Date.now() - createdAt) / 1e3));
      return {
        id: run.id,
        name: run.name,
        display_title: run.display_title || run.head_commit?.message || "Deploy",
        status: run.status,
        // queued, in_progress, completed
        conclusion: run.conclusion,
        // success, failure, cancelled, null
        html_url: run.html_url,
        head_branch: run.head_branch,
        head_sha: (run.head_sha || "").substring(0, 7),
        created_at: run.created_at,
        updated_at: run.updated_at,
        durationSeconds,
        actor: {
          login: run.actor?.login || "desconhecido",
          avatar_url: run.actor?.avatar_url || ""
        },
        commit: {
          message: run.head_commit?.message || "Sem mensagem de commit",
          author: run.head_commit?.author?.name || run.actor?.login || "Autor",
          timestamp: run.head_commit?.timestamp || run.created_at
        }
      };
    });
    let activeRunDetails = null;
    if (runs.length > 0 && (runs[0].status === "in_progress" || runs[0].status === "queued")) {
      try {
        const jobsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs/${runs[0].id}/jobs`;
        const jobsRes = await fetch(jobsUrl, { signal: AbortSignal.timeout(15e3), headers });
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          for (const job of jobsData.jobs || []) {
            if (job.status === "in_progress" || job.status === "queued" || job.steps && job.steps.length > 0) {
              const mappedSteps = (job.steps || []).map((s) => ({
                name: s.name,
                status: s.status,
                // "queued", "in_progress", "completed"
                conclusion: s.conclusion
                // "success", "failure", null
              }));
              const runningStep = mappedSteps.find((s) => s.status === "in_progress");
              activeRunDetails = {
                currentStepName: runningStep?.name || (job.status === "queued" ? "Aguardando runner do GitHub..." : null),
                steps: mappedSteps,
                estimatedRemainingSeconds: 0,
                estimatedProgressPercent: 0
              };
              break;
            }
          }
        }
      } catch (jobErr) {
        console.warn("[AdminOps] Falha ao consultar steps do run em progresso:", jobErr);
      }
    }
    let latestFailedJobStep = null;
    if (runs.length > 0 && runs[0].conclusion === "failure") {
      try {
        const jobsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs/${runs[0].id}/jobs`;
        const jobsRes = await fetch(jobsUrl, { signal: AbortSignal.timeout(15e3), headers });
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          for (const job of jobsData.jobs || []) {
            if (job.conclusion === "failure") {
              const failedStep = (job.steps || []).find((s) => s.conclusion === "failure");
              if (failedStep) {
                latestFailedJobStep = `Etapa com falha: "${failedStep.name}" (Job: ${job.name})`;
              }
            }
          }
        }
      } catch (jobErr) {
        console.warn("[AdminOps] Falha ao consultar jobs do run:", jobErr);
      }
    }
    const successfulRuns = runs.filter((r) => r.status === "completed" && r.conclusion === "success" && r.durationSeconds >= 20);
    const averageDurationSeconds = successfulRuns.length > 0 ? Math.round(successfulRuns.reduce((acc, r) => acc + r.durationSeconds, 0) / successfulRuns.length) : 85;
    if (activeRunDetails && runs.length > 0) {
      const elapsed = runs[0].durationSeconds;
      activeRunDetails.estimatedRemainingSeconds = Math.max(5, averageDurationSeconds - elapsed);
      activeRunDetails.estimatedProgressPercent = runs[0].status === "queued" ? 5 : Math.min(95, Math.max(8, Math.round(elapsed / averageDurationSeconds * 100)));
    }
    return res.json({
      success: true,
      repo: cleanRepo,
      total_count: data.total_count || runs.length,
      runs,
      latestFailedJobStep,
      averageDurationSeconds,
      activeRunDetails
    });
  } catch (fetchErr) {
    return res.status(500).json({
      success: false,
      error: `Falha ao conectar na API do GitHub: ${fetchErr?.message || "Erro desconhecido"}`
    });
  }
});
adminOpsRouter.post("/github-trigger", async (req3, res) => {
  const { repo, branch = "main", workflow = "main.yml" } = req3.body || {};
  const token = req3.body?.token || process.env.GITHUB_TOKEN || "";
  if (!token || !token.trim()) {
    return res.status(400).json({
      success: false,
      error: "\xC9 necess\xE1rio fornecer um Token de Acesso Pessoal (PAT) do GitHub com permiss\xE3o 'actions:write' ou 'repo' para disparar deploys automaticamente."
    });
  }
  const cleanRepo = (repo || process.env.GITHUB_REPO || "Dante2526/Play-Infinity").replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
  const [owner, repoName] = cleanRepo.split("/");
  if (!owner || !repoName) {
    return res.status(400).json({
      success: false,
      error: "Reposit\xF3rio inv\xE1lido. Formato: usuario/repositorio"
    });
  }
  const candidates = [workflow, "main.yml", "deploy.yml"];
  let lastError = "";
  for (const wf of Array.from(new Set(candidates))) {
    const triggerUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/workflows/${encodeURIComponent(wf)}/dispatches`;
    try {
      const response = await fetch(triggerUrl, {
        signal: AbortSignal.timeout(15e3),
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token.trim()}`,
          "User-Agent": "PlayInfinity-Admin-Monitor",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ref: branch })
      });
      if (response.status === 204) {
        return res.json({
          success: true,
          message: `Deploy disparado com sucesso via workflow '${wf}' na branch '${branch}'!`
        });
      }
      const txt = await response.text();
      lastError = `Status ${response.status}: ${txt}`;
    } catch (e) {
      lastError = e?.message || "Erro ao conectar com GitHub";
    }
  }
  return res.status(500).json({
    success: false,
    error: `N\xE3o foi poss\xEDvel disparar o workflow no GitHub: ${lastError}`
  });
});

// server.ts
init_requireAdminAuth();

// server/routes/userOps.ts
var import_express15 = require("express");
init_firebaseAdmin();
init_requireAdminAuth();
var userOpsRouter = (0, import_express15.Router)();
userOpsRouter.post("/api/start-trial", async (req3, res) => {
  const authHeader = req3.header("authorization") || req3.header("Authorization");
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
      return res.status(401).json({ success: false, error: "Token inv\xE1lido ou expirado" });
    }
    const db2 = getAdminDb();
    if (!db2) {
      return res.status(500).json({ success: false, error: "Banco de dados indispon\xEDvel" });
    }
    const userRef = db2.collection("usuarios").doc(decodedUser.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data() || {};
    if (userData.trialUsado) {
      return res.status(400).json({ success: false, error: "Teste de 30 minutos j\xE1 foi utilizado." });
    }
    const untilIso = new Date(Date.now() + 30 * 60 * 1e3).toISOString();
    await userRef.set({
      testeExpiracao: untilIso,
      trialUntil: untilIso,
      trialUsado: true
    }, { merge: true });
    return res.json({ success: true, trialUntil: untilIso });
  } catch (err) {
    console.error("[startTrial] Erro:", err);
    return res.status(500).json({ success: false, error: "Erro interno ao ativar teste." });
  }
});

// server.ts
if (import_fs7.default.existsSync(".env.local")) {
  import_dotenv.default.config({ path: ".env.local" });
}
import_dotenv.default.config();
var app = (0, import_express16.default)();
app.use(subtitlesRouter);
var PORT = 3e3;
var db = null;
try {
  const fbConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyAvv3XgTuTfUHUH8pRdRJ8XiH98uCUcSAs",
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "play-infinity-63eaa.firebaseapp.com",
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || "play-infinity-63eaa",
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "play-infinity-63eaa.firebasestorage.app",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "341774996820",
    appId: process.env.VITE_FIREBASE_APP_ID || "1:341774996820:web:871c91206a157cce6ce4c1"
  };
  const fbApp = (0, import_app.initializeApp)(fbConfig);
  db = (0, import_firestore.getFirestore)(fbApp);
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
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
app.set("trust proxy", 1);
app.use((req3, res, next) => {
  const host = req3.headers.host || "";
  if (host.includes("onrender.com")) {
    const canonicalHost = "play-infinity.stream";
    return res.redirect(301, `https://${canonicalHost}${req3.originalUrl || "/"}`);
  }
  next();
});
var isProd = process.env.NODE_ENV === "production";
var commonHelmet = {
  frameguard: { action: "sameorigin" },
  hsts: isProd ? { maxAge: 31536e3, includeSubDomains: true, preload: true } : false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false
};
var appHelmet = (0, import_helmet.default)({
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
      ...isProd ? { upgradeInsecureRequests: [] } : {}
    }
  }
});
var playerHelmet = (0, import_helmet.default)({ ...commonHelmet, contentSecurityPolicy: false });
app.use(
  (req3, res, next) => req3.path.startsWith("/api/") ? playerHelmet(req3, res, next) : appHelmet(req3, res, next)
);
app.use(import_express16.default.json({ limit: "10kb" }));
app.use(import_express16.default.urlencoded({ extended: true, limit: "10kb" }));
var globalLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 1 * 60 * 1e3,
  // 1 minuto
  max: 600,
  // Reduzido de 3000 para 600 (protege melhor a RAM sem quebrar assets)
  message: "Muitas requisi\xE7\xF5es deste IP, tente novamente em um minuto.",
  standardHeaders: true,
  legacyHeaders: false
});
var apiLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 1 * 60 * 1e3,
  // 1 minuto
  max: 150,
  // Reduzido de 1200 para 150
  message: { success: false, error: "Limite de requisi\xE7\xF5es excedido. A prote\xE7\xE3o anti-DDoS bloqueou este endere\xE7o temporariamente." },
  standardHeaders: true,
  legacyHeaders: false
});
var scraperLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 1 * 60 * 1e3,
  // 1 minuto
  max: 30,
  // Apenas 30 requisições por minuto para endpoints de scraping
  message: { success: false, error: "Limite de scraping excedido. Aguarde um instante." },
  standardHeaders: true,
  legacyHeaders: false
});
var liveStreamLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 1 * 60 * 1e3,
  // 1 minuto
  max: 360,
  message: "Limite de taxa para streaming ao vivo excedido. Aguarde um instante.",
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);
if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  const distPath = import_path7.default.join(process.cwd(), "dist");
  if (import_fs7.default.existsSync(distPath)) {
    app.use(import_express16.default.static(distPath, {
      maxAge: "30d",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html") || filePath.endsWith("metadata.json")) {
          res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        } else if (filePath.includes("/assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      }
    }));
  }
}
var scrapingPrefixes = [
  "/watchplayer-stream",
  "/myembed-stream",
  "/mixdrop-stream",
  "/bolodechocolate",
  "/stream-proxy",
  "/vidsrc",
  "/nixplay"
];
app.use("/api", (req3, res, next) => {
  if (req3.path.startsWith("/live-stream-proxy") || req3.path.startsWith("/anime/hls-proxy")) {
    return liveStreamLimiter(req3, res, next);
  }
  if (scrapingPrefixes.some((prefix) => req3.path.startsWith(prefix))) {
    return scraperLimiter(req3, res, next);
  }
  return apiLimiter(req3, res, next);
});
app.get(["/privacy", "/privacidade"], (req3, res, next) => {
  const distPath = import_path7.default.join(process.cwd(), "dist");
  if (import_fs7.default.existsSync(distPath)) {
    res.sendFile(import_path7.default.join(distPath, "index.html"));
  } else {
    next();
  }
});
app.use(iptv_default);
app.use(encontreiLookup_default);
app.use(bolodechocolate_default);
app.use(nixplayRoutes_default);
app.use(vidsrcRoutes_default);
app.use("/api/admin", requireAdminAuth);
app.use(serverBlocks_default);
app.use("/api/admin", adminOpsRouter);
app.use(userOpsRouter);
app.use(payments_default);
app.use(videoScrapers_default);
app.use(catalog_default);
app.use(diagnostics_default);
app.use(mixdrop_default);
app.use(cast_default);
if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  app.get("/assets/:file", async (req3, res, next) => {
    const file = req3.params.file;
    if (file && (file.endsWith(".js") || file.endsWith(".css") || file.endsWith(".svg") || file.endsWith(".png"))) {
      try {
        const upstreamRes = await fetch(`https://v1.watchplay.shop/assets/${file}`, {
          headers: {
            "Referer": "https://v1.watchplay.shop/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        if (upstreamRes.ok) {
          const contentType = upstreamRes.headers.get("content-type") || (file.endsWith(".css") ? "text/css" : "text/javascript");
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=86400");
          const buffer = Buffer.from(await upstreamRes.arrayBuffer());
          return res.send(buffer);
        }
      } catch (e) {
      }
    }
    return next();
  });
}
app.get(["/serie/:id/:season/:episode", "/filme/:id"], async (req3, res) => {
  const { id, season, episode } = req3.params;
  const type = req3.path.startsWith("/serie") ? "tv" : "movie";
  return res.redirect(`/api/myembed-stream?id=${id}&type=${type}&s=${season || 1}&e=${episode || 1}`);
});
app.get(["/inc/Ajax.php", "/api/playerflix-ajax"], async (req3, res) => {
  try {
    const queryParams = new URLSearchParams(req3.query).toString();
    const targetUrl = `https://playerflix.ink/inc/Ajax.php?${queryParams}`;
    const ajaxRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://playerflix.ink/",
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    const data = await ajaxRes.json();
    if (data && data.data && Array.isArray(data.data.options)) {
      data.data.options = data.data.options.filter((opt) => {
        const embedUrl = (opt.embed || "").toLowerCase();
        return !embedUrl.includes("superflix") && !embedUrl.includes("sfapi") && !embedUrl.includes("byse");
      });
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.json(data);
  } catch (err) {
    console.error("[VIP Player Ajax Proxy Error]:", err);
    return res.status(500).json({ status: false, error: "Erro ao buscar op\xE7\xF5es do player VIP" });
  }
});
app.get(["/api/tmdb", "/api/tmdb/*"], async (req3, res) => {
  try {
    const tmdbPath = req3.params[0] || req3.query.path || "";
    const query = new URLSearchParams(req3.query);
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
          ignored: ["**/data/**", "**/scratch/**", "**/*.tmp*", "**/*.log", "**/.system_generated/**", "**/*.md"]
        }
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path7.default.join(process.cwd(), "dist");
    if (import_fs7.default.existsSync(distPath)) {
      app.get("*", (_req, res) => {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.sendFile(import_path7.default.join(distPath, "index.html"));
      });
    }
  }
  app.use((err, req3, res, next) => {
    console.error("Global Express Error:", err);
    if (!res.headersSent) {
      res.status(500).send("Global Express Error: " + (err.message || err));
    }
  });
  if (!process.env.VERCEL) {
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`
  \u279C  Local:   http://localhost:${PORT}`);
      try {
        const os = require("os");
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
          for (const iface of interfaces[name]) {
            if ((iface.family === "IPv4" || iface.family === 4) && !iface.internal) {
              console.log(`  \u279C  Network: http://${iface.address}:${PORT}`);
            }
          }
        }
      } catch (e) {
      }
      console.log("");
    });
    server.on("error", (err) => {
      console.error("[Server Listen Error]:", err);
    });
    server.setTimeout(3e4);
  }
}
startServer().catch((err) => console.error("Server start error:", err));
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  app,
  db
});
//# sourceMappingURL=server.cjs.map
