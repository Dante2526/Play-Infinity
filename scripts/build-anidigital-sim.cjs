/**
 * Build do harness de simulação do AnimesDigital (skin Netflix REAL).
 *
 * Usa o próprio pipeline Vite do projeto (React + Tailwind v3 + PostCSS) com
 * aliases que stubam Firebase/TMDB — o componente NetflixPlayerSkin é o
 * MESMO código de produção. Saída em scratch/anidigital-sim/ (gitignored),
 * servido pelo backend em /sim/anidigital.
 *
 * Uso: node scripts/build-anidigital-sim.cjs
 */
const path = require("node:path");
const fs = require("node:fs");
const { build, createServer } = require("vite");
const react = require("@vitejs/plugin-react").default;

const root = path.resolve(__dirname, "..");
const simDir = path.join(root, "scratch", "anidigital-sim");

(async () => {
  fs.mkdirSync(simDir, { recursive: true });

  await build({
    root: path.join(__dirname, "anidigital-sim"),
    base: "/sim/anidigital/",
    plugins: [react()],
    resolve: {
      alias: [
        // Stubs de dev: skin sem Firebase e sem chamadas TMDB
        {
          find: /^.+\/services\/playbackHistory$/,
          replacement: path.join(__dirname, "anidigital-sim", "stubs", "playbackHistory.ts"),
        },
        {
          find: /^.+\/services\/tmdb$/,
          replacement: path.join(__dirname, "anidigital-sim", "stubs", "tmdb.ts"),
        },
      ],
    },
    css: { postcss: path.join(root, "postcss.config.cjs") || undefined },
    build: {
      outDir: simDir,
      emptyOutDir: true,
      target: "es2022",
      rollupOptions: {
        input: path.join(__dirname, "anidigital-sim", "index.html"),
        output: {
          entryFileNames: "harness.js",
          chunkFileNames: "chunk-[name].js",
          assetFileNames: "harness.[ext]",
        },
      },
    },
    logLevel: "info",
  });

  // Ajusta os caminhos do index.html gerado (base já cuida, mas garante)
  const htmlPath = path.join(simDir, "index.html");
  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, "utf-8");
    html = html.replace(/\/sim\/anidigital\//g, "/sim/anidigital/");
    fs.writeFileSync(htmlPath, html);
  }
  console.log(`\n✔ Harness construído em ${simDir}`);
  console.log("  Sirva com o backend: http://localhost:3000/sim/anidigital");
})().catch((err) => {
  console.error("Falha no build do harness:", err);
  process.exit(1);
});
