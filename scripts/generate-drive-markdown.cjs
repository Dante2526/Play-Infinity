const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, ".tmp", "drive-docs");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Extensões de código aceitas
const VALID_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".md"]);

// Arquivos ou diretórios que NUNCA devem entrar
const IGNORED_PATHS = [
  "node_modules",
  "dist",
  ".git",
  ".tmp",
  "scratch",
  "android",
  "data",
  "public",
  "brain",
  "package-lock.json"
];

function isIgnored(relPath) {
  const norm = relPath.replace(/\\/g, "/");
  for (const ign of IGNORED_PATHS) {
    if (norm === ign || norm.startsWith(ign + "/")) return true;
  }
  // Bloquear arquivos de dados gigantes
  if (norm.endsWith(".json") && !norm.includes("package.json") && !norm.includes("tsconfig")) {
    return true;
  }
  return false;
}

function collectFiles(dir, baseDir = ROOT_DIR) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);

    if (isIgnored(relPath)) continue;

    if (entry.isDirectory()) {
      results = results.concat(collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (VALID_EXTENSIONS.has(ext)) {
        results.push({ fullPath, relPath });
      }
    }
  }

  return results;
}

function buildMarkdownBundle(title, description, files) {
  let md = `# ${title}\n\n`;
  md += `> **Descrição:** ${description}\n`;
  md += `> **Gerado em:** ${new Date().toISOString()}\n`;
  md += `> **Total de Arquivos:** ${files.length}\n\n`;

  md += `## 📑 Sumário de Arquivos\n`;
  for (const f of files) {
    md += `- \`${f.relPath.replace(/\\/g, "/")}\`\n`;
  }
  md += `\n---\n\n`;

  for (const f of files) {
    const norm = f.relPath.replace(/\\/g, "/");
    try {
      const content = fs.readFileSync(f.fullPath, "utf8");
      const ext = path.extname(f.relPath).replace(".", "") || "txt";
      md += `## 📄 Arquivo: \`${norm}\`\n\n`;
      md += "```" + ext + "\n";
      md += content.trim();
      md += "\n```\n\n---\n\n";
    } catch (err) {
      console.warn(`Erro ao ler arquivo ${norm}:`, err.message);
    }
  }

  return md;
}

// 1. Coleta todos os arquivos do projeto
const allFiles = collectFiles(ROOT_DIR);

// Categorização em 3 arquivos objetivos
const frontendFiles = allFiles.filter(f => {
  const norm = f.relPath.replace(/\\/g, "/");
  return norm.startsWith("src/components") || norm.startsWith("src/pages") || norm.startsWith("src/hooks") || norm.startsWith("src/styles");
});

const backendFiles = allFiles.filter(f => {
  const norm = f.relPath.replace(/\\/g, "/");
  return norm.startsWith("server") || norm === "server.ts" || norm === "proxy.mjs" || norm === "ecosystem.config.cjs";
});

const architectureFiles = allFiles.filter(f => {
  const norm = f.relPath.replace(/\\/g, "/");
  return (
    norm.startsWith("src/services") ||
    norm.startsWith("src/types") ||
    norm.startsWith("src/data") ||
    norm === "capacitor.config.ts" ||
    norm === "package.json" ||
    norm === "AGENTS.md" ||
    norm === "VOD_ARCHITECTURE.md"
  );
});

console.log(`Frontend: ${frontendFiles.length} arquivos`);
console.log(`Backend: ${backendFiles.length} arquivos`);
console.log(`Arquitetura: ${architectureFiles.length} arquivos`);

// Gera os 3 markdowns
const frontendMd = buildMarkdownBundle(
  "Play Infinity - Frontend, Telas e Players",
  "Todos os componentes React, skins de player de vídeo, modais, páginas e hooks do aplicativo.",
  frontendFiles
);

const backendMd = buildMarkdownBundle(
  "Play Infinity - Backend, Rotas e Servidores",
  "Servidor Express, rotas de vídeo (StreamTape, MixDrop, VIP, DoodStream, NixPlay), resolvers e proxies de streaming.",
  backendFiles
);

const architectureMd = buildMarkdownBundle(
  "Play Infinity - Arquitetura, Serviços e Tipos",
  "Configurações gerais, serviços Firebase, tipos TypeScript, listas de servidores homologados e regras do app.",
  architectureFiles
);

fs.writeFileSync(path.join(OUTPUT_DIR, "1_Frontend_Telas_e_Players.md"), frontendMd, "utf8");
fs.writeFileSync(path.join(OUTPUT_DIR, "2_Backend_e_Rotas.md"), backendMd, "utf8");
fs.writeFileSync(path.join(OUTPUT_DIR, "3_Arquitetura_e_Tipos.md"), architectureMd, "utf8");

const size1 = (Buffer.byteLength(frontendMd) / 1024).toFixed(1);
const size2 = (Buffer.byteLength(backendMd) / 1024).toFixed(1);
const size3 = (Buffer.byteLength(architectureMd) / 1024).toFixed(1);

console.log(`✅ 1_Frontend_Telas_e_Players.md gerado com sucesso (${size1} KB)`);
console.log(`✅ 2_Backend_e_Rotas.md gerado com sucesso (${size2} KB)`);
console.log(`✅ 3_Arquitetura_e_Tipos.md gerado com sucesso (${size3} KB)`);
