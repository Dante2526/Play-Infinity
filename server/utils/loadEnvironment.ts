import fs from "node:fs";
import dns from "node:dns";
import dotenv from "dotenv";

// Força o resolvedor DNS do Node (undici/fetch) a tentar IPv4 primeiro em vez
// de esperar timeout em endereços IPv6 sem rota ativa na VPS.
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

// Imported before modules which validate secrets at module initialization.
// Existing injected variables keep precedence over local files.
if (fs.existsSync(".env.local")) dotenv.config({ path: ".env.local" });
dotenv.config();
