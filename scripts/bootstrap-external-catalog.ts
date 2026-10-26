/** Bootstrap local: roda o scraper Saimo real uma vez e imprime stats + resolve 3 canais de teste. */
import { syncSaimoAll } from "../server/services/saimoCatalogScraper";
import { resolveExternalChannel, externalCatalogStats } from "../server/services/externalCatalog";

async function main() {
  console.log("[bootstrap] rodando syncSaimoAll()...");
  const result = await syncSaimoAll();
  console.log("[bootstrap] sync result:", JSON.stringify(result, null, 2));

  console.log("[bootstrap] stats:", JSON.stringify(externalCatalogStats()));

  for (const name of ["Premiere 2", "SporTV", "ESPN 4"]) {
    const resolved = await resolveExternalChannel(name);
    if (!resolved) {
      console.log(`[bootstrap] ${name}: NÃO RESOLVIDO`);
      continue;
    }
    const needsProxy = resolved.url.toLowerCase().startsWith("http://") || !!resolved.referer || !!resolved.agente;
    // Log sem credenciais
    let host = "";
    try { host = new URL(resolved.url).hostname; } catch {}
    console.log(
      `[bootstrap] ${name} → fonte #${resolved.fonteIndex + 1} host=${host} qualidade="${resolved.qualidade || ""}" referer=${resolved.referer ? "sim" : "não"} agente=${resolved.agente ? "sim" : "não"} needsProxy=${needsProxy}`
    );
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
