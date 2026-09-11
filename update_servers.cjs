const fs = require('fs');
let code = fs.readFileSync('src/components/VideoPlayerModal.tsx', 'utf8');

if (!code.includes('srv_embedplay')) {
  // Inject for Series
  code = code.replace(
    'return [\n        {\n          key: "srv_watchplay",\n          label: "Player 1',
    `return [
        {
          key: "srv_embedplay",
          label: "Player 1 (EmbedPlay)",
          badge: "EmbedPlayAPI • Acervo Completo Dublado/Legendado",
          buildUrl: (id: string, s: number, e: number) => \`https://embedplayapi.top/embed/\${id}/\${s}/\${e}\`,
          isMatch: (u: string) => u.includes("embedplayapi.top"),
          name: "Player 1 (EmbedPlay)"
        },
        {
          key: "srv_watchplay",
          label: "Player 2`
  );
  
  // Inject for Movies (which is in the `else` block)
  code = code.replace(
    'return [\n        {\n          key: "srv_watchplay",\n          label: "Player 1',
    `return [
        {
          key: "srv_embedplay",
          label: "Player 1 (EmbedPlay)",
          badge: "EmbedPlayAPI • Acervo Completo Dublado/Legendado",
          buildUrl: (id: string) => \`https://embedplayapi.top/embed/\${id}\`,
          isMatch: (u: string) => u.includes("embedplayapi.top"),
          name: "Player 1 (EmbedPlay)"
        },
        {
          key: "srv_watchplay",
          label: "Player 2`
  );

  // Fix numbering
  code = code.replace(/Player 1 \(Dublado PT-BR\)/g, 'Player 2 (Dublado PT-BR)');
  code = code.replace(/Player 2 \(Nativo PT-BR\)/g, 'Player 3 (Nativo PT-BR)');
  code = code.replace(/Player 3 \(Videasy Multi\)/g, 'Player 4 (Videasy Multi)');
  code = code.replace(/Player 4 \(VidLink HD\)/g, 'Player 5 (VidLink HD)');
  code = code.replace(/Player 5 \(AutoEmbed\)/g, 'Player 6 (AutoEmbed)');
  
  code = code.replace(/Player 2 \(WatchPlayer Oficial\)/g, 'Player 3 (WatchPlayer Oficial)'); // for anime block maybe?
  // Let's just write and check.
  fs.writeFileSync('src/components/VideoPlayerModal.tsx', code);
  console.log("Injected EmbedPlayAPI!");
} else {
  console.log("Already has it.");
}
