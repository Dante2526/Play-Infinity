import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
// @ts-ignore - ssh2 é um pacote CJS sem types instalados no projeto
import { Client as SshClient } from "ssh2";

export const adminOpsRouter = Router();

const ORACLE_VPS_HOST = process.env.ORACLE_VPS_HOST || "147.15.57.146";
const ORACLE_VPS_PORT = parseInt(process.env.ORACLE_VPS_PORT || "22", 10);
const ORACLE_VPS_USER = process.env.ORACLE_VPS_USER || "ubuntu";
const DUCKDNS_HEALTH_URL = process.env.ORACLE_HEALTH_URL || "https://play-infinity-app.duckdns.org/api/health";

/**
 * Lê a chave privada SSH da VPS localmente
 */
function getSshPrivateKey(): string | null {
  const possiblePaths = [
    path.join(process.cwd(), "oracle-vps.key"),
    path.join(process.cwd(), "secrets", "oracle-vps.key"),
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
 * GET /api/admin/vps-telemetry
 * Retorna telemetria em tempo real da VPS Oracle e health probes dos serviços
 */
adminOpsRouter.get("/vps-telemetry", async (_req: Request, res: Response) => {
  const startTime = Date.now();

  // 1. Probe HTTP do Proxy de TV (DuckDNS / HTTPS)
  let proxyStatus = {
    online: false,
    latencyMs: 0,
    httpStatus: 0,
    url: DUCKDNS_HEALTH_URL,
    error: null as string | null
  };

  try {
    const probeStart = Date.now();
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6000);
    const resp = await fetch(DUCKDNS_HEALTH_URL, { signal: ctrl.signal });
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
    const sshCmd = `free -m && echo "===DELIM_UPTIME===" && uptime && echo "===DELIM_PM2===" && sudo pm2 jlist`;
    const sshResult = await executeSshCommand(sshCmd, 12000);
    vpsHardware.hasSsh = true;

    const parts = sshResult.stdout.split("===DELIM_UPTIME===");
    if (parts.length >= 2) {
      const freeLines = parts[0].trim().split("\n");
      const nextParts = parts[1].split("===DELIM_PM2===");
      const uptimeRaw = (nextParts[0] || "").trim();
      const pm2Raw = (nextParts[1] || "").trim();

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
        const pm2List = JSON.parse(pm2Raw);
        if (Array.isArray(pm2List)) {
          vpsHardware.pm2Processes = pm2List.map((app: any) => ({
            name: app.name || "desconhecido",
            status: app.pm2_env?.status || "offline",
            memoryMb: Math.round((app.monit?.memory || 0) / 1024 / 1024),
            cpuPercent: parseFloat((app.monit?.cpu || 0).toFixed(1)),
            restarts: app.pm2_env?.restart_time || 0
          }));
        }
      } catch (jsonErr: any) {
        console.warn("[AdminOps] Falha ao fazer parse do PM2 JSON:", jsonErr.message);
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
      commandToRun = "sudo pm2 restart video-proxy";
      actionDescription = "Reiniciar serviço do Proxy de TV (video-proxy)";
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
    const result = await executeSshCommand(commandToRun, 60000);
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

    const response = await fetch(apiUrl, { headers });

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
      const durationSeconds = Math.max(0, Math.floor((updatedAt - createdAt) / 1000));

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

    // Se a última execução falhou, buscamos os jobs para descobrir o passo exato do erro
    let latestFailedJobStep: string | null = null;
    if (runs.length > 0 && runs[0].conclusion === "failure") {
      try {
        const jobsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs/${runs[0].id}/jobs`;
        const jobsRes = await fetch(jobsUrl, { headers });
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

    return res.json({
      success: true,
      repo: cleanRepo,
      total_count: data.total_count || runs.length,
      runs,
      latestFailedJobStep
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

  const cleanRepo = (repo || "naylanmoreira/Play-Infinity").replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
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
      const response = await fetch(triggerUrl, {
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
