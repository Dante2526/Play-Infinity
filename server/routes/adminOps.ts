import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { getAdminMessaging, getAdminDb, getAdminFieldValue } from "../firebaseAdmin";
import { exec as cpExec } from "child_process";
// @ts-ignore - ssh2 é um pacote CJS sem types instalados no projeto
import { Client as SshClient } from "ssh2";
import { getEncontreiResolverStatus } from "./encontreiLookup";

export const adminOpsRouter = Router();

const ORACLE_VPS_HOST = process.env.ORACLE_VPS_HOST || "147.15.57.146";
const ORACLE_VPS_PORT = parseInt(process.env.ORACLE_VPS_PORT || "22", 10);
const ORACLE_VPS_USER = process.env.ORACLE_VPS_USER || "ubuntu";
const ORACLE_HEALTH_URL = process.env.ORACLE_HEALTH_URL || "https://play-infinity.stream/api/health";

/**
 * Lê a chave privada SSH da VPS localmente
 */
function getSshPrivateKey(): string | null {
  const possiblePaths = [
    path.join(process.cwd(), "oracle-vps.key"),
    path.join(process.cwd(), "secrets", "oracle-vps.key"),
    "/home/ubuntu/play-infinity/secrets/oracle-vps.key",
    "/home/ubuntu/.ssh/id_rsa",
    "/home/ubuntu/.ssh/id_ed25519",
    "/etc/secrets/oracle-vps.key"
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p, "utf-8");
      } catch (err) {
        console.warn(`[AdminOps] Falha ao ler chave em ${p}:`, err);
      }
    }
  }

  // Fallback para variável de ambiente
  if (process.env.ORACLE_SSH_KEY) {
    return process.env.ORACLE_SSH_KEY;
  }

  return null;
}

/**
 * Executa comandos localmente se estiver rodando dentro da VPS Ubuntu,
 * ou via SSH se estiver rodando em ambiente externo (dev/staging).
 */
async function executeSystemOrSshCommand(command: string, timeoutMs = 25000): Promise<{ stdout: string; stderr: string; code: number }> {
  // Detecta se estamos rodando diretamente no Linux da VPS Oracle
  const isDirectOnVps = process.platform === "linux" && (
    fs.existsSync("/home/ubuntu/play-infinity") ||
    fs.existsSync("/home/ubuntu/.pm2") ||
    process.cwd().includes("/home/ubuntu")
  );

  if (isDirectOnVps) {
    try {
      return await new Promise((resolve) => {
        cpExec(command, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
          resolve({
            stdout: stdout ? stdout.toString() : "",
            stderr: stderr ? stderr.toString() : "",
            code: err ? (typeof err.code === "number" ? err.code : 1) : 0
          });
        });
      });
    } catch (localErr: any) {
      console.warn("[AdminOps] Execução local falhou, tentando fallback SSH:", localErr?.message);
    }
  }

  return executeSshCommand(command, timeoutMs);
}

/**
 * Executa um comando via SSH na VPS Oracle
 */
function executeSshCommand(command: string, timeoutMs = 25000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const privateKey = getSshPrivateKey();
    if (!privateKey) {
      return reject(new Error("Chave SSH (oracle-vps.key) não encontrada no servidor."));
    }

    const conn = new SshClient();
    const timer = setTimeout(() => {
      try { conn.end(); } catch {}
      reject(new Error(`Comando SSH expirou após ${timeoutMs / 1000}s`));
    }, timeoutMs);

    conn.on("ready", () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) {
          clearTimeout(timer);
          try { conn.end(); } catch {}
          return reject(err);
        }

        let stdout = "";
        let stderr = "";

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timer);
          try { conn.end(); } catch {}
          resolve({ stdout, stderr, code: code || 0 });
        });
      });
    });

    conn.on("error", (err: any) => {
      clearTimeout(timer);
      reject(err);
    });

    try {
      conn.connect({
        host: ORACLE_VPS_HOST,
        port: ORACLE_VPS_PORT,
        username: ORACLE_VPS_USER,
        privateKey,
        readyTimeout: 8000,
        keepaliveInterval: 2000
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

/**
 * GET /api/admin/health-check
 * Checa a saúde dos domínios homologados de forma autenticada
 */
adminOpsRouter.get("/health-check", async (req: Request, res: Response) => {
  const tmdbApiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;

  // Cookie de sessão do encontrei.me (fórum IPS exige login desde out/2026).
  // Sem esse cookie o site redireciona tudo para /login/ — o health check
  // precisa enviá-lo para validar o estado REAL (sessão logada vs login).
  const encontreiCookie = process.env.ENCONTREI_COOKIE || "";

  /**
   * Validação dedicada do encontrei.me:
   * - Envia o cookie de sessão (se configurado via ENCONTREI_COOKIE)
   * - Detecta se caiu na página de login (sessão expirada) mesmo com HTTP 200
   * - Retorna ONLINE apenas se o conteúdo carregou de verdade
   */
  const checkEncontrei = async () => {
    const start = Date.now();
    try {
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      };
      if (encontreiCookie) {
        headers["Cookie"] = encontreiCookie;
      }

      const response = await fetch("https://encontrei.me", {
        signal: AbortSignal.timeout(8000),
        headers,
        redirect: "follow",
      });
      const latency = Date.now() - start;
      const statusCode = response.status;

      // HTTP OK não basta: sem sessão válida o site redireciona pra /login/
      // e responde 200 com a página de login (falso positivo de "ONLINE").
      const finalUrl = response.url || "";
      const body = await response.text();
      const pageTitle = (body.match(/<title>([^<]*)<\/title>/) || [""])[1] || "";
      const isLoginPage =
        finalUrl.includes("/login") ||
        body.includes("elUser_login") ||
        /^\s*login\b/i.test(pageTitle);

      if (statusCode >= 200 && statusCode < 400 && !isLoginPage) {
        return {
          name: "Catálogo Encontrei.me",
          url: "https://encontrei.me",
          status: "ONLINE" as const,
          latencyMs: latency,
          statusCode,
        };
      }

      return {
        name: "Catálogo Encontrei.me",
        url: "https://encontrei.me",
        status: "OFFLINE" as const,
        latencyMs: latency,
                statusCode,
        error: isLoginPage
          ? (encontreiCookie
              ? "Sessão expirada/inválida: recapturar ENCONTREI_COOKIE (logar no site com \"Manter-me conectado\" + F12 > Network > Cookie)."
              : "ENCONTREI_COOKIE não configurado: site exige login e redireciona para /login/.")
          : `Resposta inválida HTTP ${statusCode}`,
      };
    } catch (error: any) {
      return {
        name: "Catálogo Encontrei.me",
        url: "https://encontrei.me",
        status: "OFFLINE" as const,
        latencyMs: null,
        statusCode: 0,
        error: `Possível bloqueio Cloudflare ao IP da VPS: ${error?.message || "fetch falhou"}`,
      };
    }
  };

  // Vizer usa validação dedicada: com fetch simples + redirect:follow, um 30x
  // (migração silenciosa de domínio, ex: vizer.beauty → vizer.website → vizer.reisen)
  // retornava 200 no domínio novo e o painel marcava ONLINE sem avisar nada.
  const checkVizer = async () => {
    const start = Date.now();
    const primaryBase = "https://www.vizer.reisen";
    try {
      const res = await fetch(primaryBase, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      const latency = Date.now() - start;
      return {
        name: "Catálogo Vizer",
        url: primaryBase,
        status: res.ok ? ("ONLINE" as const) : ("OFFLINE" as const),
        latencyMs: latency,
        statusCode: res.status
      };
    } catch (error: any) {
      return {
        name: "Catálogo Vizer",
        url: primaryBase,
        status: "OFFLINE" as const,
        latencyMs: null,
        statusCode: 0,
        error: `Falha ao conectar no Vizer: ${error?.message || "fetch falhou"}`
      };
    }
  };

  const staticTargets = [
    { name: "Catálogo Vizer (novo domínio)", url: "https://www.vizer.reisen", type: "html" },
    { name: "TMDB API", url: `https://api.themoviedb.org/3/configuration?api_key=${tmdbApiKey}`, type: "json" },
    { name: "VIP Player", url: "https://myembed.biz", type: "html" },
    { name: "Watchplayer", url: "https://v1.watchplay.shop", type: "html" },
    { name: "MixDrop", url: "https://mxdrop.top", type: "html" }
  ];

  // Encontrei e Vizer usam validação dedicada (cookie de sessão e detecção de
  // migração de domínio, respectivamente); os demais alvos seguem com fetch simples.
  const [encontreiResult, vizerResult, ...staticResults] = await Promise.all([
    checkEncontrei(),
    checkVizer(),
    ...staticTargets.map(async (target) => {
      try {
        const start = Date.now();
        const response = await fetch(target.url, {
          signal: AbortSignal.timeout(8000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          }
        });
        const latency = Date.now() - start;
        return {
          name: target.name,
          url: target.url,
          status: response.status >= 200 && response.status < 400 ? ("ONLINE" as const) : ("OFFLINE" as const),
          latencyMs: latency,
          statusCode: response.status
        };
      } catch (error: any) {
        return {
          name: target.name,
          url: target.url,
          status: "OFFLINE" as const,
          latencyMs: null,
          statusCode: error.response?.status || 0,
          error: error.message
        };
      }
    })
  ]);

  const results = [encontreiResult, vizerResult, ...staticResults];
  res.json({ success: true, timestamp: Date.now(), results });
});

/**
 * GET /api/admin/vps-telemetry
 * Retorna telemetria em tempo real da VPS Oracle e health probes dos serviços
 */
adminOpsRouter.get("/vps-telemetry", async (_req: Request, res: Response) => {
  const startTime = Date.now();

  // 1. Probe HTTP do Proxy de TV (HTTPS)
  let proxyStatus = {
    online: false,
    latencyMs: 0,
    httpStatus: 0,
    url: ORACLE_HEALTH_URL,
    error: null as string | null
  };

  try {
    const probeStart = Date.now();
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6000);
    const resp = await fetch(ORACLE_HEALTH_URL, { signal: ctrl.signal });
    clearTimeout(to);
    proxyStatus.latencyMs = Date.now() - probeStart;
    proxyStatus.httpStatus = resp.status;
    proxyStatus.online = resp.ok;
  } catch (err: any) {
    proxyStatus.online = false;
    proxyStatus.error = err?.name === "AbortError" ? "Timeout (6s)" : (err?.message || "Inacessível");
  }

  // 2. Probe HTTP do Servidor Web local / público
  const webServerStatus = {
    online: true,
    platform: process.platform,
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
  };

  // 3. Telemetria profunda via SSH na VPS da Oracle
  let vpsHardware = {
    hasSsh: false,
    error: null as string | null,
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
    loadAverage: [0, 0, 0] as [number, number, number],
    pm2Processes: [] as Array<{
      name: string;
      status: string;
      memoryMb: number;
      cpuPercent: number;
      restarts: number;
      uptimeString?: string;
    }>
  };

  try {
    const sshCmd = `free -m && echo "===DELIM_UPTIME===" && uptime && echo "===DELIM_PM2===" && sudo -u ubuntu pm2 jlist && echo "===DELIM_PM2_ROOT===" && sudo pm2 jlist`;
    const sshResult = await executeSystemOrSshCommand(sshCmd, 12000);
    vpsHardware.hasSsh = true;

    const parts = sshResult.stdout.split("===DELIM_UPTIME===");
    if (parts.length >= 2) {
      const freeLines = parts[0].trim().split("\n");
      const nextParts = parts[1].split("===DELIM_PM2===");
      const uptimeRaw = (nextParts[0] || "").trim();
      
      const pm2Parts = (nextParts[1] || "").split("===DELIM_PM2_ROOT===");
      const pm2RawUbuntu = (pm2Parts[0] || "").trim();
      const pm2RawRoot = (pm2Parts[1] || "").trim();

      // Parse free -m
      // Mem: total used free shared buff/cache available
      for (const line of freeLines) {
        if (line.startsWith("Mem:")) {
          const cols = line.replace(/Mem:\s+/, "").trim().split(/\s+/).map(Number);
          if (cols.length >= 6) {
            vpsHardware.ram.totalMb = cols[0];
            vpsHardware.ram.usedMb = cols[1];
            vpsHardware.ram.freeMb = cols[2];
            vpsHardware.ram.buffCacheMb = cols[4];
            vpsHardware.ram.availableMb = cols[5];
            vpsHardware.ram.usedPercent = Math.round((cols[1] / (cols[0] || 1)) * 100);
          }
        } else if (line.startsWith("Swap:")) {
          const cols = line.replace(/Swap:\s+/, "").trim().split(/\s+/).map(Number);
          if (cols.length >= 3) {
            vpsHardware.swap.totalMb = cols[0];
            vpsHardware.swap.usedMb = cols[1];
            vpsHardware.swap.freeMb = cols[2];
            vpsHardware.swap.usedPercent = cols[0] > 0 ? Math.round((cols[1] / cols[0]) * 100) : 0;
          }
        }
      }

      // Parse uptime
      vpsHardware.uptime = uptimeRaw;
      const loadMatch = uptimeRaw.match(/load average:\s*([0-9\.]+),\s*([0-9\.]+),\s*([0-9\.]+)/i);
      if (loadMatch) {
        vpsHardware.loadAverage = [
          parseFloat(loadMatch[1]) || 0,
          parseFloat(loadMatch[2]) || 0,
          parseFloat(loadMatch[3]) || 0
        ];
      }

      // Parse PM2
      try {
        let pm2List: any[] = [];
        try {
          const uList = JSON.parse(pm2RawUbuntu);
          if (Array.isArray(uList)) pm2List = pm2List.concat(uList);
        } catch (e) { /* ignore */ }
        
        try {
          const rList = JSON.parse(pm2RawRoot);
          if (Array.isArray(rList)) pm2List = pm2List.concat(rList);
        } catch (e) { /* ignore */ }

        if (pm2List.length > 0) {
          // Remove duplicatas se existirem (pelo nome)
          const seen = new Set();
          pm2List = pm2List.filter(app => {
            const isDuplicate = seen.has(app.name);
            seen.add(app.name);
            return !isDuplicate;
          });

          vpsHardware.pm2Processes = pm2List.map((app: any) => ({
            name: app.name || "desconhecido",
            status: app.pm2_env?.status || "offline",
            memoryMb: Math.round((app.monit?.memory || 0) / 1024 / 1024),
            cpuPercent: parseFloat((app.monit?.cpu || 0).toFixed(1)),
            restarts: app.pm2_env?.restart_time || 0
          }));
        }
      } catch (jsonErr: any) {
        console.warn("[AdminOps] Falha geral ao fazer parse do PM2 JSON:", jsonErr.message);
      }
    }
  } catch (sshErr: any) {
    vpsHardware.hasSsh = false;
    vpsHardware.error = sshErr?.message || "Falha na conexão SSH com a VPS";
  }

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    queryDurationMs: Date.now() - startTime,
    proxyStatus,
    webServerStatus,
    vpsHardware
  });
});

/**
 * GET /api/admin/vps-bot-logs
 * Retorna os logs do robô de criação da VPS (ampere-creator) via SSH
 */
adminOpsRouter.get("/vps-bot-logs", async (_req: Request, res: Response) => {
  try {
    const command = "tail -n 30 /home/ubuntu/.pm2/logs/ampere-creator-out.log";
    const result = await executeSystemOrSshCommand(command, 15000);
    
    if (result.code !== 0 && !result.stdout) {
      throw new Error(result.stderr || `Comando retornou código ${result.code}`);
    }

    res.json({
      success: true,
      logs: result.stdout || "Log vazio ou não encontrado."
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || "Falha ao obter logs do robô na VPS"
    });
  }
});

/**
 * POST /api/admin/vps-action
 * Executa comandos seguros de manutenção e deploy na VPS Oracle
 */
adminOpsRouter.post("/vps-action", async (req: Request, res: Response) => {
  const { action } = req.body || {};

  let commandToRun = "";
  let actionDescription = "";

  switch (action) {
    case "restart-all":
      commandToRun = "(sleep 1 && sudo pm2 restart all) > /dev/null 2>&1 & echo 'Comando de reinicialização enviado (PM2 restart all agendado).'";
      actionDescription = "Reiniciar todos os processos PM2 na VPS";
      break;

    case "restart-proxy":
      commandToRun = "sudo fuser -k 8080/tcp || true; sudo pm2 restart video-proxy";
      actionDescription = "Reiniciar serviço do Proxy de TV (e eliminar processos fantasmas)";
      break;

    case "restart-app":
      commandToRun = "(sleep 1 && sudo pm2 restart play-infinity-app) > /dev/null 2>&1 & echo 'Comando de reinicialização enviado (play-infinity-app agendado).'";
      actionDescription = "Reiniciar aplicação web (play-infinity-app)";
      break;

    case "git-pull-build":
      commandToRun = `
        set -e
        echo "🚀 Localizando diretório do projeto..."
        if [ -d "/home/ubuntu/Play-Infinity" ]; then
          cd /home/ubuntu/Play-Infinity
        elif [ -d "/home/ubuntu/play-infinity" ]; then
          cd /home/ubuntu/play-infinity
        else
          cd /home/ubuntu
        fi
        
        echo "📥 Executando git pull..."
        git pull origin main || git pull origin master || true
        
        echo "📦 Instalando dependências e gerando build..."
        npm run build || echo "Aviso no build"
        
        echo "🔄 Agendando reinicialização dos serviços PM2..."
        (sleep 1 && sudo pm2 restart all) > /dev/null 2>&1 &
        
        echo "✅ Ação concluída com sucesso! Os serviços estão sendo atualizados."
      `;
      actionDescription = "Atualização manual via Git Pull e Build na VPS";
      break;

    default:
      return res.status(400).json({
        success: false,
        error: "Ação inválida. Ações permitidas: restart-all, restart-proxy, restart-app, git-pull-build."
      });
  }

  try {
    const result = await executeSystemOrSshCommand(commandToRun, 60000);
    return res.json({
      success: result.code === 0,
      action,
      actionDescription,
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      action,
      actionDescription,
      error: err?.message || "Falha ao executar comando na VPS via SSH"
    });
  }
});

/**
 * GET /api/admin/github-runs
 * Consulta o histórico de execuções do GitHub Actions
 */
adminOpsRouter.get("/github-runs", async (req: Request, res: Response) => {
  const repo = (req.query.repo as string) || process.env.GITHUB_REPOSITORY || "Dante2526/Play-Infinity";
  const token = (req.query.token as string) || process.env.GITHUB_TOKEN || "";

  // Sanitiza repo formato owner/repo
  const cleanRepo = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
  const parts = cleanRepo.split("/");
  if (parts.length < 2) {
    return res.status(400).json({
      success: false,
      error: "Formato de repositório inválido. Utilize o formato: usuario/nome-do-repositorio (ex: Dante2526/Play-Infinity)"
    });
  }

  const [owner, repoName] = parts;
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs?per_page=8`;

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "PlayInfinity-Admin-Monitor",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    if (token && token.trim()) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(15000), headers });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `GitHub API retornou status ${response.status}`;
      try {
        const parsed = JSON.parse(errText);
        errorMsg = parsed.message || errorMsg;
      } catch {}

      if (response.status === 404) {
        errorMsg = `Repositório '${cleanRepo}' não encontrado ou é privado. Se for privado, informe um Token de Acesso Pessoal (PAT) do GitHub nas configurações.`;
      } else if (response.status === 401 || response.status === 403) {
        errorMsg = `Acesso negado ou limite de requisições do GitHub atingido. Adicione um Token do GitHub nas configurações.`;
      }

      return res.status(response.status).json({
        success: false,
        error: errorMsg,
        repo: cleanRepo
      });
    }

    const data: any = await response.json();
    const runs = (data.workflow_runs || []).map((run: any) => {
      const createdAt = new Date(run.created_at).getTime();
      const updatedAt = new Date(run.updated_at).getTime();
      const isCompleted = run.status === "completed";
      const durationSeconds = isCompleted
        ? Math.max(0, Math.floor((updatedAt - createdAt) / 1000))
        : Math.max(0, Math.floor((Date.now() - createdAt) / 1000));

      return {
        id: run.id,
        name: run.name,
        display_title: run.display_title || run.head_commit?.message || "Deploy",
        status: run.status, // queued, in_progress, completed
        conclusion: run.conclusion, // success, failure, cancelled, null
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

    // Se houver deploy em andamento ou na fila, consultamos os jobs e steps em tempo real
    let activeRunDetails: {
      currentStepName: string | null;
      steps: Array<{ name: string; status: string; conclusion: string | null }>;
      estimatedRemainingSeconds: number;
      estimatedProgressPercent: number;
    } | null = null;

    if (runs.length > 0 && (runs[0].status === "in_progress" || runs[0].status === "queued")) {
      try {
        const jobsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs/${runs[0].id}/jobs`;
        const jobsRes = await fetch(jobsUrl, { signal: AbortSignal.timeout(15000), headers });
        if (jobsRes.ok) {
          const jobsData: any = await jobsRes.json();
          for (const job of jobsData.jobs || []) {
            if (job.status === "in_progress" || job.status === "queued" || (job.steps && job.steps.length > 0)) {
              const mappedSteps = (job.steps || []).map((s: any) => ({
                name: s.name,
                status: s.status, // "queued", "in_progress", "completed"
                conclusion: s.conclusion // "success", "failure", null
              }));
              const runningStep = mappedSteps.find((s: any) => s.status === "in_progress");
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

    // Se a última execução falhou, buscamos os jobs para descobrir o passo exato do erro
    let latestFailedJobStep: string | null = null;
    if (runs.length > 0 && runs[0].conclusion === "failure") {
      try {
        const jobsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs/${runs[0].id}/jobs`;
        const jobsRes = await fetch(jobsUrl, { signal: AbortSignal.timeout(15000), headers });
        if (jobsRes.ok) {
          const jobsData: any = await jobsRes.json();
          for (const job of jobsData.jobs || []) {
            if (job.conclusion === "failure") {
              const failedStep = (job.steps || []).find((s: any) => s.conclusion === "failure");
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

    // Calcular média histórica de deploys com sucesso para estimar tempo restante
    const successfulRuns = runs.filter((r: any) => r.status === "completed" && r.conclusion === "success" && r.durationSeconds >= 20);
    const averageDurationSeconds = successfulRuns.length > 0
      ? Math.round(successfulRuns.reduce((acc: number, r: any) => acc + r.durationSeconds, 0) / successfulRuns.length)
      : 85; // Média de ~85 segundos padrão

    if (activeRunDetails && runs.length > 0) {
      const elapsed = runs[0].durationSeconds;
      activeRunDetails.estimatedRemainingSeconds = Math.max(5, averageDurationSeconds - elapsed);
      activeRunDetails.estimatedProgressPercent = runs[0].status === "queued"
        ? 5
        : Math.min(95, Math.max(8, Math.round((elapsed / averageDurationSeconds) * 100)));
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
  } catch (fetchErr: any) {
    return res.status(500).json({
      success: false,
      error: `Falha ao conectar na API do GitHub: ${fetchErr?.message || "Erro desconhecido"}`
    });
  }
});

/**
 * POST /api/admin/github-trigger
 * Dispara um novo workflow_dispatch no GitHub Actions
 */
adminOpsRouter.post("/github-trigger", async (req: Request, res: Response) => {
  const { repo, branch = "main", workflow = "main.yml" } = req.body || {};
  const token = (req.body?.token as string) || process.env.GITHUB_TOKEN || "";

  if (!token || !token.trim()) {
    return res.status(400).json({
      success: false,
      error: "É necessário fornecer um Token de Acesso Pessoal (PAT) do GitHub com permissão 'actions:write' ou 'repo' para disparar deploys automaticamente."
    });
  }

  const cleanRepo = (repo || process.env.GITHUB_REPO || "Dante2526/Play-Infinity").replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
  const [owner, repoName] = cleanRepo.split("/");

  if (!owner || !repoName) {
    return res.status(400).json({
      success: false,
      error: "Repositório inválido. Formato: usuario/repositorio"
    });
  }

  // Tenta primeiro o workflow solicitado (main.yml ou deploy.yml)
  const candidates = [workflow, "main.yml", "deploy.yml"];
  let lastError = "";

  for (const wf of Array.from(new Set(candidates))) {
    const triggerUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/workflows/${encodeURIComponent(wf)}/dispatches`;

    try {
      const response = await fetch(triggerUrl, { signal: AbortSignal.timeout(15000),
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
    } catch (e: any) {
      lastError = e?.message || "Erro ao conectar com GitHub";
    }
  }

  return res.status(500).json({
    success: false,
    error: `Não foi possível disparar o workflow no GitHub: ${lastError}`
  });
});

/**
 * GET /api/admin/encontrei-status
 * Retorna o estado do circuit breaker do encontrei.me live resolver.
 * Usado pelo painel admin pra mostrar banner vermelho automático quando o cookie expira.
 *
 * Body retornado:
 *   {
 *     success: true,
 *     cookieConfigured: boolean,        // ENCONTREI_COOKIE está no .env?
 *     breakerActive: boolean,           // circuit breaker ativo (cookie expirou)?
 *     breakerUntil: number,             // timestamp ms até quando o breaker tá ativo
 *     breakerMsRemaining: number,       // ms restantes pro breaker expirar
 *     inflightCount: number,            // chamadas AJAX em voo (dedup)
 *     negativeCacheCount: number,      // chaves em negative cache (falhas recentes)
 *     cookieSource: string,            // origem do cookie ("ENCONTREI_COOKIE env" ou "not_set")
 *     timestamp: number                // horário da checagem
 *   }
 *
 * Quando breakerActive === true, o cookie do encontrei.me expirou (redirect pra /login/
 * ou resposta non-JSON). O painel admin deve mostrar um banner vermelho alertando.
 */
adminOpsRouter.get("/encontrei-status", (_req: Request, res: Response) => {
  try {
    const status = getEncontreiResolverStatus();
    res.json({
      success: true,
      ...status,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error("[adminOps] erro em /encontrei-status:", err);
    res.status(500).json({
      success: false,
      error: "Erro interno ao obter status do encontrei resolver",
      details: err?.message || String(err),
    });
  }
});

/**
 * POST /api/admin/delete-bug-image
 * Remove do disco da VPS a imagem anexa de um relatório de bug.
 * Body: { imageUrl: "/uploads/bug_reports/<filename>" }
 * Protegido por requireAdminAuth (app.use("/api/admin", requireAdminAuth)).
 */
adminOpsRouter.post("/delete-bug-image", (req: Request, res: Response) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl || typeof imageUrl !== "string") {
      return res.status(400).json({ success: false, error: "imageUrl é obrigatório." });
    }

    // Blindagem: só aceita caminhos dentro de /uploads/bug_reports e sem travessia
    const prefix = "/uploads/bug_reports/";
    if (!imageUrl.startsWith(prefix) || imageUrl.includes("..")) {
      return res.status(400).json({ success: false, error: "Caminho de imagem inválido." });
    }

    const filename = path.basename(imageUrl);
    const filePath = path.join(process.cwd(), "uploads", "bug_reports", filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[adminOps] Imagem de bug removida do disco: ${filePath}`);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[adminOps] Erro ao deletar imagem de bug:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/push
 * Dispara notificação push manual via Firebase Cloud Messaging.
 * Body: { title, body, targetEmails? } — sem targetEmails = push global (todos os dispositivos).
 */
adminOpsRouter.post("/push", async (req: Request, res: Response) => {
  try {
    const { title, body, targetEmails } = req.body;

    if (!title || !body) {
      return res.status(400).json({ success: false, error: "Título e mensagem são obrigatórios." });
    }

    const messaging = getAdminMessaging();
    const db = getAdminDb();
    if (!messaging) {
      return res.status(500).json({ success: false, error: "Firebase Messaging não inicializado" });
    }
    if (!db) {
      return res.status(500).json({ success: false, error: "Firebase Firestore não inicializado" });
    }

    // Mapeia token -> documentos dos donos (para limpeza de tokens inválidos após o envio)
    const tokenOwners = new Map<string, any[]>();
    const seenDocs = new Map<string, string[]>(); // docId -> tokens do doc

    const collectTokensFromSnapshot = (snapshot: any) => {
      snapshot.forEach((docSnap: any) => {
        const data = docSnap.data();
        const tokens: string[] = [];
        // Campo legado (string única) + array multi-dispositivo
        if (typeof data.fcmToken === "string" && data.fcmToken) tokens.push(data.fcmToken);
        if (Array.isArray(data.fcmTokens)) {
          for (const t of data.fcmTokens) {
            if (typeof t === "string" && t) tokens.push(t);
          }
        }
        if (tokens.length === 0) return;
        const unique = [...new Set(tokens)];
        seenDocs.set(docSnap.id, unique);
        for (const token of unique) {
          const owners = tokenOwners.get(token) || [];
          owners.push(docSnap.ref);
          tokenOwners.set(token, owners);
        }
      });
    };

    if (targetEmails && Array.isArray(targetEmails) && targetEmails.length > 0) {
      // Divide emails em chunks de 10 (limite do 'in' no firestore)
      for (let i = 0; i < targetEmails.length; i += 10) {
        const chunk = targetEmails.slice(i, i + 10);
        const snapshot = await db.collection("usuarios").where("email", "in", chunk).get();
        collectTokensFromSnapshot(snapshot);
      }
    } else {
      // Push global: busca TODOS os usuários (projeção leve via select para não
      // carregar campos pesados). O limit(500) antigo cortava a base silenciosamente.
      const snapshot = await db.collection("usuarios").select("fcmToken", "fcmTokens").get();
      collectTokensFromSnapshot(snapshot);
    }

    const allTokens = [...tokenOwners.keys()];
    if (allTokens.length === 0) {
      return res.json({ success: true, count: 0, sent: 0, cleanedInvalid: 0 });
    }

    // Envia em lotes de 500 (limite do sendEachForMulticast)
    let sent = 0;
    const invalidTokens = new Set<string>();
    for (let i = 0; i < allTokens.length; i += 500) {
      const chunk = allTokens.slice(i, i + 500);
      const message = { notification: { title, body }, tokens: chunk };
      const response = await messaging.sendEachForMulticast(message);
      sent += response.successCount;
      response.responses.forEach((r: any, idx: number) => {
        if (!r.success && r.error) {
          const errCode = String((r.error as any)?.code || r.error?.message || "");
          // Token não registrado/inválido -> marcar para limpeza no Firestore
          if (/unregistered|invalid/i.test(errCode)) {
            invalidTokens.add(chunk[idx]);
          }
        }
      });
    }

    // Limpeza: remove tokens inválidos/expirados dos documentos dos donos
    let cleanedInvalid = 0;
    if (invalidTokens.size > 0) {
      for (const [docId, tokens] of seenDocs.entries()) {
        const remaining = tokens.filter((t) => !invalidTokens.has(t));
        if (remaining.length === tokens.length) continue;
        try {
          const update: any = { fcmTokens: remaining };
          if (remaining.length === 0) {
            // Campo legado: apaga de vez quando não sobrou nenhum token
            const FieldValue = getAdminFieldValue();
            if (FieldValue) {
              update.fcmToken = FieldValue.delete();
            } else {
              update.fcmToken = null;
            }
          } else {
            update.fcmToken = remaining[remaining.length - 1];
          }
          await db.collection("usuarios").doc(docId).update(update);
          cleanedInvalid++;
        } catch (err: any) {
          console.warn("[adminOps] Falha ao limpar token FCM inválido do usuário", docId, err?.message || err);
        }
      }
    }

    res.json({ success: true, count: allTokens.length, sent, cleanedInvalid });
  } catch (error: any) {
    console.error("[adminOps] Erro ao disparar push:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
