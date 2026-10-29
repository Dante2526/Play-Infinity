const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

describe("Admin Sentinel & Guardião Byte Tests", () => {
  test("1. Verifica existência e exportações do serviço adminSentinel.ts", () => {
    const sentinelFile = path.join(__dirname, "..", "server", "services", "adminSentinel.ts");
    assert.ok(fs.existsSync(sentinelFile), "adminSentinel.ts deve existir");

    const content = fs.readFileSync(sentinelFile, "utf-8");
    assert.match(content, /export function getSentinelStatus/, "Deve exportar getSentinelStatus");
    assert.match(content, /export async function runSentinelCheck/, "Deve exportar runSentinelCheck");
    assert.match(content, /export async function registerAdminPushToken/, "Deve exportar registerAdminPushToken");
    assert.match(content, /export async function sendPushToAdmins/, "Deve exportar sendPushToAdmins");
    assert.match(content, /export function startAdminSentinel/, "Deve exportar startAdminSentinel");
  });

  test("2. Lógica de cálculo de humor do Mascote Byte (Happy, Warning, Alert)", () => {
    // Simulação pura da função de humor
    function calculateMood(alerts) {
      if (alerts.some((a) => a.level === "error")) return "alert";
      if (alerts.length > 0) return "warning";
      return "happy";
    }

    assert.strictEqual(calculateMood([]), "happy", "Sem alertas deve retornar happy");
    assert.strictEqual(
      calculateMood([{ id: "1", level: "warning" }]),
      "warning",
      "Alerta de warning deve retornar warning"
    );
    assert.strictEqual(
      calculateMood([{ id: "1", level: "warning" }, { id: "2", level: "error" }]),
      "alert",
      "Qualquer erro deve priorizar humor alert"
    );
  });

  test("3. Prevenção de duplicidade e anti-spam (Cooldown de 2 horas)", () => {
    const COOLDOWN_MS = 2 * 60 * 60 * 1000;
    const history = new Map();

    function shouldNotify(alertId, now, force = false) {
      if (force) return true;
      if (!history.has(alertId)) {
        history.set(alertId, now);
        return true;
      }
      const last = history.get(alertId) || 0;
      if (now - last > COOLDOWN_MS) {
        history.set(alertId, now);
        return true;
      }
      return false;
    }

    const t0 = 1000000;
    assert.strictEqual(shouldNotify("channel:premiere-1", t0), true, "Primeira notificação deve disparar");
    assert.strictEqual(shouldNotify("channel:premiere-1", t0 + 1000 * 60 * 20), false, "Após 20 min (próxima bateria) deve bloquear anti-spam");
    assert.strictEqual(shouldNotify("channel:premiere-1", t0 + 1000 * 60 * 60), false, "Após 1h deve bloquear anti-spam");
    assert.strictEqual(shouldNotify("channel:premiere-1", t0 + 1000 * 60 * 121 * 1000), true, "Após 2h1min deve liberar novo push");
    assert.strictEqual(shouldNotify("channel:premiere-1", t0 + 1000 * 60 * 122 * 1000, true), true, "Com forcePush deve liberar imediatamente");
  });

  test("4. Service Worker possui tratador de clique para abrir o painel admin na aba certa", () => {
    const swFile = path.join(__dirname, "..", "public", "firebase-messaging-sw.js");
    assert.ok(fs.existsSync(swFile), "firebase-messaging-sw.js deve existir");

    const content = fs.readFileSync(swFile, "utf-8");
    assert.match(content, /notificationclick/, "Deve registrar o evento notificationclick");
    assert.match(content, /urlToOpen/, "Deve extrair a URL de destino da notificação");
    assert.match(content, /clients\.openWindow/, "Deve abrir a janela com openWindow caso o browser esteja em segundo plano");
    assert.match(content, /\/logo\.png/, "Deve usar o logotipo oficial do Play Infinity");
  });

  test("5. Componente AdminMascotWidget renderiza estados e botões de ação Mobile-First", () => {
    const widgetFile = path.join(__dirname, "..", "src", "components", "AdminMascotWidget.tsx");
    assert.ok(fs.existsSync(widgetFile), "AdminMascotWidget.tsx deve existir");

    const content = fs.readFileSync(widgetFile, "utf-8");
    assert.match(content, /AdminMascotWidget/, "Deve exportar o componente AdminMascotWidget");
    assert.match(content, /onSelectSection/, "Deve receber a prop onSelectSection");
    assert.match(content, /\/api\/admin\/sentinel\/status/, "Deve consultar o status do Sentinela");
    assert.match(content, /\/api\/admin\/sentinel\/check-now/, "Deve permitir checagem manual imediata");
    assert.match(content, /ShieldCheck/, "Deve renderizar o ícone de guardião ShieldCheck");
    assert.match(content, /Testar Agora/, "Deve conter o botão centralizado de teste manual");
    assert.strictEqual(content.includes("Testar Push"), false, "Botão Testar Push deve ser removido da UI");
    assert.match(content, /viewBox="0 0 100 100"/, "Deve renderizar o SVG oficial do mascote Byte");
  });

  test("6. Rotas de Sentinela integradas no adminOpsRouter", () => {
    const opsFile = path.join(__dirname, "..", "server", "routes", "adminOps.ts");
    assert.ok(fs.existsSync(opsFile), "adminOps.ts deve existir");

    const content = fs.readFileSync(opsFile, "utf-8");
    assert.match(content, /\/sentinel\/status/, "Deve expor a rota /sentinel/status");
    assert.match(content, /\/sentinel\/check-now/, "Deve expor a rota /sentinel/check-now");
    assert.match(content, /\/sentinel\/register-token/, "Deve expor a rota /sentinel/register-token");
    assert.match(content, /\/sentinel\/test-push/, "Deve expor a rota /sentinel/test-push");
  });

  test("7. Inicialização do Sentinela integrada no boot do server.ts", () => {
    const serverFile = path.join(__dirname, "..", "server.ts");
    assert.ok(fs.existsSync(serverFile), "server.ts deve existir");

    const content = fs.readFileSync(serverFile, "utf-8");
    assert.match(content, /startAdminSentinel/, "server.ts deve importar e inicializar startAdminSentinel");
  });

  test("8. Monitoramento e alerta de mudança de domínio do Vizer", () => {
    const vizerFile = path.join(__dirname, "..", "server", "services", "vizerDomains.ts");
    assert.ok(fs.existsSync(vizerFile), "vizerDomains.ts deve existir");
    const vizerContent = fs.readFileSync(vizerFile, "utf-8");
    assert.match(vizerContent, /detectedNewDomain/, "Deve capturar o novo domínio ao detectar redirecionamento");

    const sentinelFile = path.join(__dirname, "..", "server", "services", "adminSentinel.ts");
    const sentinelContent = fs.readFileSync(sentinelFile, "utf-8");
    assert.match(sentinelContent, /checkVizerHealth/, "Sentinela deve invocar checkVizerHealth");
    assert.match(sentinelContent, /scraper:vizer_domain/, "Sentinela deve gerar alerta scraper:vizer_domain");
    assert.match(sentinelContent, /Vizer mudou de domínio/, "Mensagem deve alertar sobre mudança de domínio do Vizer");
  });

  test("9. Reteste de confirmação anti-falso-positivo e delay de boot de 45s", () => {
    const sentinelFile = path.join(__dirname, "..", "server", "services", "adminSentinel.ts");
    const content = fs.readFileSync(sentinelFile, "utf-8");
    assert.match(content, /recuperado na retentativa \(falso alarme evitado\)/, "Sentinela deve executar retentativa antes de disparar alerta");
    assert.match(content, /(45000|45\s*\*\s*1000)/, "Boot deve aguardar 45s para estabilização de caches e SQLite");
  });

  test("10. Suporte a Pluto TV / AES-128 e atualização de catálogo de TV", () => {
    const extCatFile = path.join(__dirname, "..", "server", "services", "externalCatalog.ts");
    const content = fs.readFileSync(extCatFile, "utf-8");
    assert.match(content, /pluto\.tv/, "RELIABLE_CDN_PATTERNS deve incluir pluto.tv");
    assert.match(content, /METHOD=AES-128/, "Deve aceitar streams com criptografia AES-128 sem falha de magic bytes");

    const channelsTxt = fs.readFileSync(path.join(__dirname, "..", "data", "external-channels.txt"), "utf-8");
    assert.match(channelsTxt, /1168940\.m3u8/, "Globo MG deve conter novo stream ativo 1168940");
    assert.strictEqual(/canal:\s*DreamWorks/i.test(channelsTxt), false, "DreamWorks descontinuado deve estar removido do catalogo");
  });

  test("11. Trava anti-duplicação em cluster PM2 e supressão de push no boot frio", () => {
    const sentinelFile = path.join(__dirname, "..", "server", "services", "adminSentinel.ts");
    const content = fs.readFileSync(sentinelFile, "utf-8");
    assert.match(content, /NODE_APP_INSTANCE/, "Sentinela deve verificar NODE_APP_INSTANCE para prevenir duplicidade no cluster PM2");
    assert.match(content, /runSentinelCheck\(false,\s*true\)/, "Boot inicial deve executar com skipPush=true para evitar falsos alarmes no reinício");
    assert.match(content, /setTimeout\(resolve,\s*2500\)/, "Reteste deve aguardar janela ampliada de 2500ms");
  });

  test("12. Push de canal só após 2 rodadas consecutivas de falha", () => {
    const content = fs.readFileSync(path.join(__dirname, "..", "server", "services", "adminSentinel.ts"), "utf-8");
    assert.match(content, /CHANNEL_FAILS_BEFORE_PUSH = 2/, "Deve exigir 2 falhas seguidas");
    assert.match(content, /confirmedDown/, "Push deve depender da confirmação de queda");
    assert.match(content, /channelConsecutiveFails\.delete\(alertId\)/, "Contador deve zerar quando o canal volta");
  });

  test("13. Trava anti-flood: agrupamento em 1 único resumo quando > 3 canais caem", () => {
    const content = fs.readFileSync(path.join(__dirname, "..", "server", "services", "adminSentinel.ts"), "utf-8");
    assert.match(content, /channelAlerts.length > 3/, "Deve detectar queda em massa");
    assert.match(content, /mass_outage/, "Deve criar notificação resumo");
  });

  test("14. Bateria de verificação a cada 20 minutos (aumentado de 15)", () => {
    const content = fs.readFileSync(path.join(__dirname, "..", "server", "services", "adminSentinel.ts"), "utf-8");
    assert.match(content, /CHECK_INTERVAL_MS = 20 \* 60 \* 1000/, "Intervalo entre baterias deve ser de 20 minutos");
    assert.strictEqual(/CHECK_INTERVAL_MS = 15/.test(content), false, "Intervalo antigo de 15 minutos deve ter sido removido");
    // A dupla verificação continua exigindo 2 baterias com erro (20 min entre elas)
    assert.match(content, /CHANNEL_FAILS_BEFORE_PUSH = 2/, "Confirmação de queda continua exigindo 2 rodadas seguidas");
  });

  test("15. Abrir/recarregar/fechar o painel NÃO dispara verificação e NÃO reseta o ciclo", () => {
    const opsFile = path.join(__dirname, "..", "server", "routes", "adminOps.ts");
    const ops = fs.readFileSync(opsFile, "utf-8");

    // Handler da rota de status é SOMENTE LEITURA: nunca chama runSentinelCheck
    const statusBlock = ops.slice(ops.indexOf('"/sentinel/status"'), ops.indexOf('"/sentinel/check-now"'));
    assert.match(statusBlock, /getSentinelStatus/, "GET /sentinel/status deve ler o status");
    assert.strictEqual(
      statusBlock.includes("runSentinelCheck"),
      false,
      "GET /sentinel/status deve ser leitura pura (sem rodar bateria)"
    );

    // Widget: no mount e no polling de 30s consulta apenas o status; check-now
    // só existe no handler do botão manual "Testar Agora"
    const widgetFile = path.join(__dirname, "..", "src", "components", "AdminMascotWidget.tsx");
    const widget = fs.readFileSync(widgetFile, "utf-8");
    // Bloco do useEffect de mount/polling (o que contém o interval de 30s)
    const pollStart = widget.lastIndexOf("useEffect(() => {", widget.indexOf("30000"));
    const mountBlock = widget.slice(pollStart, widget.indexOf("30000"));
    assert.strictEqual(
      mountBlock.includes("check-now"),
      false,
      "Carregar a página NÃO deve chamar check-now (nenhuma verificação no load)"
    );
    assert.match(mountBlock, /fetchStatus/, "Mount/polling deve apenas ler o status (leitura pura)");
    const checkNowCalls = (widget.match(/check-now/g) || []).length;
    assert.strictEqual(checkNowCalls, 1, "check-now deve existir apenas no botão manual Testar Agora");
    // A única ocorrência de check-now está dentro do handler do botão manual
    const hIdx = widget.indexOf("const handleCheckNow");
    const cnIdx = widget.indexOf("check-now");
    assert.ok(
      hIdx > -1 && cnIdx > hIdx && cnIdx < hIdx + 1500,
      "check-now deve estar dentro de handleCheckNow (botão manual), não no load"
    );

    // A checagem manual é silenciosa: não conta rodada nem dispara push
    assert.match(ops, /runSentinelCheck\(forcePush,\s*!forcePush,\s*true\)/, "check-now deve rodar em modo manual sem push");
    const sentinel = fs.readFileSync(path.join(__dirname, "..", "server", "services", "adminSentinel.ts"), "utf-8");
    assert.match(sentinel, /manual[^]{0,600}não conta para o ciclo de 20 min/s, "Bateria manual não deve contar para o ciclo");
  });

  test("16. Ciclo persistido no Firestore: sobrevive a restarts e mantém cluster coerente", () => {
    const sentinelFile = path.join(__dirname, "..", "server", "services", "adminSentinel.ts");
    const content = fs.readFileSync(sentinelFile, "utf-8");

    assert.match(content, /async function persistCycleState/, "Deve exportar persistência do ciclo");
    assert.match(content, /async function restoreCycleState/, "Deve exportar restauração do ciclo");
    assert.match(content, /sentinel_cycle/, "Deve usar o doc system_settings/sentinel_cycle");

    // Restaura no início da bateria (antes de qualquer decisão de push)
    assert.match(content, /await restoreCycleState\(\)/, "Toda bateria deve restaurar o ciclo antes de decidir push");
    // Persiste no fim (fire-and-forget, sem derrubar a bateria em caso de falha)
    assert.match(content, /persistCycleState\(\)\.catch/, "Fim da bateria deve persistir o ciclo em fire-and-forget");
    // Mescla conservadora entre instâncias/restarts: maior streak e anti-spam mais recente
    assert.match(content, /channelFails/, "Streaks de falha devem ser persistidos");
    assert.match(content, /notifiedAt/, "Histórico anti-spam deve ser persistido");
    assert.match(content, /lastBatteryAt/, "Hora da última bateria deve ser persistida");
  });
});
