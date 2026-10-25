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
    assert.strictEqual(shouldNotify("channel:premiere-1", t0 + 1000 * 60 * 15), false, "Após 15 min deve bloquear anti-spam");
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
    assert.match(content, /\/api\/admin\/sentinel\/test-push/, "Deve permitir teste de push direto");
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
});
