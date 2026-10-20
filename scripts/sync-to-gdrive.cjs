const fs = require("fs");
const path = require("path");

const DOCS_DIR = path.resolve(__dirname, "..", ".tmp", "drive-docs");
const WEBHOOK_URL = process.env.GDRIVE_WEBHOOK_URL;
const SECRET_TOKEN = process.env.GDRIVE_SECRET_TOKEN || "play-infinity-secret";

async function main() {
  if (!WEBHOOK_URL) {
    console.error("❌ Erro: GDRIVE_WEBHOOK_URL não definida nos secrets do GitHub.");
    process.exit(1);
  }

  const filesToSync = [
    "1_Frontend_Telas_e_Players.md",
    "2_Backend_e_Rotas.md",
    "3_Arquitetura_e_Tipos.md"
  ];

  for (const fileName of filesToSync) {
    const filePath = path.join(DOCS_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`Arquivo não encontrado: ${filePath}`);
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const payload = JSON.stringify({
      token: SECRET_TOKEN,
      fileName,
      content
    });

    console.log(`📤 Enviando ${fileName} (${(Buffer.byteLength(content) / 1024).toFixed(1)} KB) para o Google Drive...`);

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload
      });

      const text = await res.text();
      console.log(`Resposta do Google Drive para ${fileName}: HTTP ${res.status} - ${text.substring(0, 100)}`);
    } catch (err) {
      console.error(`Erro ao enviar ${fileName}:`, err.message);
    }
  }

  console.log("🏁 Sincronização com o Google Drive finalizada!");
}

main().catch(err => {
  console.error("Falha no sync:", err);
  process.exit(1);
});
