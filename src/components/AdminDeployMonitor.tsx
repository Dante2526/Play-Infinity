import React, { useState, useEffect, useCallback } from "react";
import {
  Server,
  Cpu,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  GitCommit,
  GitBranch,
  ExternalLink,
  Wifi,
  WifiOff,
  Radio,
  Terminal,
  Play,
  RotateCw,
  Layers,
  ShieldCheck,
  Check,
  ChevronRight,
  Info
} from "lucide-react";

interface VpsTelemetryData {
  success: boolean;
  timestamp: string;
  queryDurationMs: number;
  proxyStatus: {
    online: boolean;
    latencyMs: number;
    httpStatus: number;
    url: string;
    error: string | null;
  };
  webServerStatus: {
    online: boolean;
    platform: string;
    nodeVersion: string;
    uptimeSeconds: number;
    memoryUsageMb: number;
  };
  vpsHardware: {
    hasSsh: boolean;
    error: string | null;
    ram: {
      totalMb: number;
      usedMb: number;
      freeMb: number;
      buffCacheMb: number;
      availableMb: number;
      usedPercent: number;
    };
    swap: {
      totalMb: number;
      usedMb: number;
      freeMb: number;
      usedPercent: number;
    };
    uptime: string;
    loadAverage: [number, number, number];
    pm2Processes: Array<{
      name: string;
      status: string;
      memoryMb: number;
      cpuPercent: number;
      restarts: number;
    }>;
  };
}

interface GitHubRun {
  id: number;
  name: string;
  display_title: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | null;
  html_url: string;
  head_branch: string;
  head_sha: string;
  created_at: string;
  updated_at: string;
  durationSeconds: number;
  actor: {
    login: string;
    avatar_url: string;
  };
  commit: {
    message: string;
    author: string;
    timestamp: string;
  };
}

interface RunStep {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | "skipped" | null;
}

interface ActiveRunDetails {
  currentStepName: string | null;
  steps: RunStep[];
  estimatedRemainingSeconds: number;
  estimatedProgressPercent: number;
}

interface GitHubRunsResponse {
  success: boolean;
  repo: string;
  total_count: number;
  runs: GitHubRun[];
  latestFailedJobStep?: string | null;
  averageDurationSeconds?: number;
  activeRunDetails?: ActiveRunDetails | null;
  error?: string;
}

export function AdminDeployMonitor() {
  const githubRepo = "Dante2526/Play-Infinity";

  // Estados de Telemetria da VPS
  const [vpsData, setVpsData] = useState<VpsTelemetryData | null>(null);
  const [vpsLoading, setVpsLoading] = useState(false);
  const [vpsError, setVpsError] = useState<string | null>(null);
  const [lastVpsRefresh, setLastVpsRefresh] = useState<Date | null>(null);

  // Estados dos Deploys do GitHub Actions
  const [githubData, setGithubData] = useState<GitHubRunsResponse | null>(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [lastGithubRefresh, setLastGithubRefresh] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Ticker de 1 segundo para atualizar o cronômetro e a barra de progresso em tempo real quando houver deploy em andamento
  useEffect(() => {
    const isRunning = githubData?.runs?.[0]?.status === "in_progress" || githubData?.runs?.[0]?.status === "queued";
    if (!isRunning) return;

    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [githubData?.runs]);

  // Ações da VPS e Terminal Modal
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<{ title: string; output: string; code?: number } | null>(null);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [triggerSuccess, setTriggerSuccess] = useState<string | null>(null);

  // Carregar dados da VPS
  const fetchVpsData = useCallback(async () => {
    setVpsLoading(true);
    try {
      const res = await fetch("/api/admin/vps-telemetry");
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        return;
      }
      const rawText = await res.text();
      let data: VpsTelemetryData;
      try {
        data = JSON.parse(rawText);
      } catch {
        return;
      }
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setVpsError(null);
      setVpsData(data);
      setLastVpsRefresh(new Date());
    } catch (err: any) {
      if (!err?.message?.includes("JSON") && !err?.message?.includes("Failed to fetch")) {
        setVpsError(err?.message || "Falha ao carregar telemetria da VPS");
      }
    } finally {
      setVpsLoading(false);
    }
  }, []);

  // Carregar histórico de deploys do GitHub Actions
  const fetchGithubRuns = useCallback(async () => {
    setGithubLoading(true);
    try {
      const params = new URLSearchParams();
      if (githubRepo) params.set("repo", githubRepo);

      const res = await fetch(`/api/admin/github-runs?${params.toString()}`);
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        // Servidor reiniciando durante o deploy no PM2; mantém os dados na tela sem piscar erro
        return;
      }

      const rawText = await res.text();
      let data: GitHubRunsResponse;
      try {
        data = JSON.parse(rawText);
      } catch {
        // Ignora respostas transitórias em HTML do Nginx durante o restart
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Erro ${res.status}`);
      }

      setGithubError(null);
      setGithubData(data);
      setLastGithubRefresh(new Date());
    } catch (err: any) {
      if (!err?.message?.includes("JSON") && !err?.message?.includes("Failed to fetch")) {
        setGithubError(err?.message || "Falha ao consultar GitHub Actions");
      }
    } finally {
      setGithubLoading(false);
    }
  }, [githubRepo]);

  // Carregamento inicial e auto-refresh periódico
  useEffect(() => {
    fetchVpsData();
    fetchGithubRuns();

    // Se o deploy estiver em execução na fila ou rodando, acelera para 4s para acompanhar os steps
    const isRunning = githubData?.runs?.[0]?.status === "in_progress" || githubData?.runs?.[0]?.status === "queued";
    const intervalMs = isRunning ? 4000 : 10000;

    const interval = setInterval(() => {
      fetchVpsData();
      fetchGithubRuns();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [fetchVpsData, fetchGithubRuns, githubData?.runs?.[0]?.status]);

  // Executar ação de manutenção na VPS (Reiniciar, Git pull & build)
  const handleVpsAction = async (action: "restart-all" | "restart-proxy" | "restart-app" | "git-pull-build", title: string) => {
    setActionLoading(action);
    try {
      const res = await fetch("/api/admin/vps-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      
      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        if (!res.ok) {
          throw new Error(`Servidor respondeu com status ${res.status} (${res.statusText || "Serviço reiniciando ou indisponível temporariamente"}).`);
        }
        throw new Error("Resposta em formato inesperado do servidor.");
      }

      setTerminalOutput({
        title,
        output: data.stdout || data.stderr || (data.success ? "Comando executado com sucesso." : data.error || "Falha na execução."),
        code: data.code ?? (data.success ? 0 : 1)
      });

      // Recarrega telemetria após a ação
      setTimeout(fetchVpsData, 2000);
    } catch (err: any) {
      setTerminalOutput({
        title,
        output: `Erro ao enviar comando: ${err.message}`,
        code: 1
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Disparar deploy manual via GitHub Actions
  const handleTriggerDeploy = async () => {
    setTriggerLoading(true);
    setTriggerSuccess(null);
    setGithubError(null);

    try {
      const res = await fetch("/api/admin/github-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: githubRepo,
          branch: "main"
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao disparar workflow");
      }

      setTriggerSuccess("Deploy disparado com sucesso no GitHub Actions!");
      setTimeout(() => {
        setTriggerSuccess(null);
        fetchGithubRuns();
      }, 3500);
    } catch (err: any) {
      setGithubError(err.message);
    } finally {
      setTriggerLoading(false);
    }
  };

  const latestRun = githubData?.runs && githubData.runs.length > 0 ? githubData.runs[0] : null;
  const isDeployActive = latestRun?.status === "in_progress" || latestRun?.status === "queued";

  // Cálculo de duração decorrida ao vivo
  const liveElapsedSeconds = latestRun && isDeployActive
    ? Math.max(0, Math.floor((currentTime - new Date(latestRun.created_at).getTime()) / 1000))
    : (latestRun?.durationSeconds || 0);

  // Média de duração calculada de builds anteriores ou padrão de 85s
  const avgDuration = githubData?.averageDurationSeconds || 85;

  // Tempo restante estimado
  const liveRemainingSeconds = latestRun?.status === "queued"
    ? avgDuration
    : Math.max(5, avgDuration - liveElapsedSeconds);

  // Porcentagem calculada para a barra de progresso (trava em 96% até ser finalizada)
  const liveProgressPercent = latestRun?.status === "queued"
    ? 6
    : Math.min(96, Math.max(8, Math.round((liveElapsedSeconds / avgDuration) * 100)));

  // Formatação de data amigável
  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  // Formatação amigável de duração (segundos -> m s)
  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return "0s";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Barra de Ações do Monitor */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#1c1c1e]/60 border border-white/10 backdrop-blur-xl rounded-[24px] p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-orange-500/20 text-orange-400 rounded-2xl">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Monitor de Infraestrutura & Deploy
            </h2>
            <p className="text-white/50 text-xs">
              Oracle VPS Always Free (São Paulo) & GitHub Actions CI/CD
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            onClick={() => {
              fetchVpsData();
              fetchGithubRuns();
            }}
            disabled={vpsLoading || githubLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 active:scale-95 text-white/80 hover:text-white rounded-xl text-xs font-semibold border border-white/10 transition-all cursor-pointer disabled:opacity-50"
            title="Atualizar métricas agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${vpsLoading || githubLoading ? "animate-spin text-orange-400" : ""}`} />
            Atualizar
          </button>

          <button
            onClick={() => handleVpsAction("restart-all", "Reiniciar Serviços (PM2)")}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-400 rounded-xl text-xs font-semibold border border-red-500/20 transition-all cursor-pointer disabled:opacity-50"
            title="Reiniciar todos os serviços PM2 na VPS imediatamente"
          >
            <RotateCw className={`w-3.5 h-3.5 ${actionLoading === "restart-all" ? "animate-spin text-red-400" : ""}`} />
            Reiniciar Serviços
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SEÇÃO 1: STATUS DE DEPLOY DO GITHUB ACTIONS             */}
      {/* ======================================================== */}
      <div className="bg-[#1c1c1e]/60 border border-white/10 backdrop-blur-xl rounded-[28px] p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-500/20 text-purple-400 rounded-xl">
                <GitBranch className="w-5 h-5" />
              </div>
              <h3 className="text-2xl font-bold text-white">Status de Deploy & CI/CD</h3>
              <span className="px-3 py-1 bg-white/10 text-white/70 rounded-full text-xs font-semibold">
                GitHub Actions
              </span>
            </div>
            <p className="text-white/50 text-sm mt-1 ml-11">
              Acompanhamento contínuo dos builds e atualizações enviadas para a VPS da Oracle.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleTriggerDeploy}
              disabled={triggerLoading}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 active:scale-95 text-white rounded-xl font-bold text-xs shadow-lg shadow-orange-600/20 transition-all cursor-pointer disabled:opacity-50"
              title="Disparar workflow do deploy no GitHub Actions agora"
            >
              <Play className={`w-3.5 h-3.5 fill-current ${triggerLoading ? "animate-pulse" : ""}`} />
              {triggerLoading ? "Disparando..." : "Forçar Novo Deploy"}
            </button>

            <button
              onClick={() => handleVpsAction("restart-all", "Reiniciar Serviços (PM2)")}
              disabled={actionLoading !== null}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              title="Reiniciar todos os processos da VPS imediatamente"
            >
              <RotateCw className={`w-3.5 h-3.5 ${actionLoading === "restart-all" ? "animate-spin text-orange-400" : ""}`} />
              {actionLoading === "restart-all" ? "Reiniciando..." : "Reiniciar Serviços"}
            </button>
          </div>
        </div>

        {triggerSuccess && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 text-sm font-semibold flex items-center gap-2.5 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            {triggerSuccess}
          </div>
        )}

        {githubError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm font-semibold flex items-center gap-2.5 animate-fade-in">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>{githubError}</p>
          </div>
        )}

        {/* Card Destaque: Último Deploy */}
        {latestRun ? (
          <div className="space-y-6">
            <div className={`p-6 rounded-[24px] border transition-all ${
              latestRun.status === "in_progress" || latestRun.status === "queued"
                ? "bg-amber-500/10 border-amber-500/30 shadow-[0_0_25px_rgba(245,158,11,0.1)]"
                : latestRun.conclusion === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.1)]"
                : "bg-red-500/10 border-red-500/30 shadow-[0_0_25px_rgba(239,68,68,0.1)]"
            }`}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  {latestRun.status === "in_progress" || latestRun.status === "queued" ? (
                    <div className="p-2.5 bg-amber-500 text-black rounded-xl animate-spin">
                      <RotateCw className="w-5 h-5" />
                    </div>
                  ) : latestRun.conclusion === "success" ? (
                    <div className="p-2.5 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/30">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="p-2.5 bg-red-500 text-white rounded-xl shadow-lg shadow-red-500/30">
                      <XCircle className="w-5 h-5" />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wider font-extrabold text-white/50">
                        Status do Deploy Atual
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-white/30"></span>
                      <span className="text-xs text-white/70 font-mono">
                        #{latestRun.id}
                      </span>
                    </div>

                    <div className="text-xl sm:text-2xl font-black text-white flex items-center gap-2 mt-0.5">
                      {latestRun.status === "in_progress" ? (
                        <span className="text-amber-400 flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping"></span>
                          🟡 Executando Deploy no Servidor Oracle...
                        </span>
                      ) : latestRun.status === "queued" ? (
                        <span className="text-amber-300">🟡 Deploy na fila do GitHub...</span>
                      ) : latestRun.conclusion === "success" ? (
                        <span className="text-emerald-400">🟢 Sucesso (Deploy Ativo)</span>
                      ) : (
                        <span className="text-red-400">🔴 Falha no Deploy</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={latestRun.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    Ver Logs no GitHub
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Grid de Informações do Último Deploy */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 text-xs">
                {/* Data e Hora */}
                <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                  <span className="text-white/40 block mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-orange-400" />
                    Realizado em
                  </span>
                  <span className="text-white font-bold text-sm">
                    {formatDateTime(latestRun.created_at)}
                  </span>
                </div>

                {/* Duração */}
                <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                  <span className="text-white/40 block mb-1 flex items-center gap-1">
                    <RotateCw className="w-3 h-3 text-blue-400" />
                    {isDeployActive ? "Tempo Decorrido" : "Tempo de Execução"}
                  </span>
                  <span className="text-white font-bold text-sm">
                    {isDeployActive ? (
                      <span className="text-amber-400 flex items-center gap-1.5 font-mono">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                        {formatDuration(liveElapsedSeconds)}
                      </span>
                    ) : (
                      formatDuration(latestRun.durationSeconds)
                    )}
                  </span>
                </div>

                {/* Branch */}
                <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                  <span className="text-white/40 block mb-1 flex items-center gap-1">
                    <GitBranch className="w-3 h-3 text-purple-400" />
                    Branch
                  </span>
                  <span className="text-white font-bold text-sm font-mono">
                    {latestRun.head_branch}
                  </span>
                </div>

                {/* Commit Hash */}
                <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                  <span className="text-white/40 block mb-1 flex items-center gap-1">
                    <GitCommit className="w-3 h-3 text-emerald-400" />
                    Hash Commit
                  </span>
                  <span className="text-white font-bold text-sm font-mono">
                    {latestRun.head_sha}
                  </span>
                </div>
              </div>

              {/* Painel ao Vivo de Progresso e Tempo Restante (quando deploy estiver em andamento) */}
              {isDeployActive && (
                <div className="mt-4 p-4 sm:p-5 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/30 rounded-2xl space-y-3.5 animate-fade-in shadow-[0_0_30px_rgba(245,158,11,0.08)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg animate-spin">
                        <RotateCw className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-extrabold text-amber-400/90 block">
                          Etapa em Execução
                        </span>
                        <span className="text-white font-bold text-sm">
                          {githubData?.activeRunDetails?.currentStepName || (latestRun.status === "queued" ? "Preparando máquina virtual no GitHub..." : "Executando build e deploy na VPS...")}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      <div className="px-3 py-1.5 bg-black/40 rounded-xl border border-white/10 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-orange-400" />
                        <span className="text-white/60 text-[11px]">Previsão restante:</span>
                        <strong className="text-amber-400 font-mono font-bold text-sm">
                          ~{formatDuration(liveRemainingSeconds)}
                        </strong>
                      </div>
                      <div className="px-3 py-1.5 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-500/30 font-bold font-mono text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                        {liveProgressPercent}%
                      </div>
                    </div>
                  </div>

                  {/* Barra de Progresso Visual */}
                  <div className="space-y-1">
                    <div className="relative w-full h-3 bg-black/50 rounded-full overflow-hidden border border-white/10 p-0.5">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-400 rounded-full transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(245,158,11,0.5)]"
                        style={{ width: `${liveProgressPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-white/40 px-1 font-mono">
                      <span>Início (0s)</span>
                      <span>Média histórica: ~{formatDuration(avgDuration)}</span>
                      <span>Conclusão</span>
                    </div>
                  </div>

                  {/* Etapas / Steps do Workflow */}
                  {githubData?.activeRunDetails?.steps && githubData.activeRunDetails.steps.length > 0 && (
                    <div className="pt-1 border-t border-white/10">
                      <span className="text-[10px] uppercase font-bold text-white/40 block mb-2">
                        Passos do Pipeline (GitHub Actions):
                      </span>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {githubData.activeRunDetails.steps.map((st, idx) => {
                          const isDone = st.status === "completed" && st.conclusion === "success";
                          const isRunning = st.status === "in_progress";
                          const isFailed = st.conclusion === "failure";

                          return (
                            <div
                              key={idx}
                              className={`text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium border transition-colors ${
                                isDone
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                  : isRunning
                                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse font-bold shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                                  : isFailed
                                  ? "bg-red-500/20 border-red-500/40 text-red-300 font-bold"
                                  : "bg-white/[0.03] border-white/5 text-white/40"
                              }`}
                            >
                              {isDone ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                              ) : isRunning ? (
                                <RotateCw className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
                              ) : isFailed ? (
                                <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" />
                              )}
                              <span>{st.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Detalhes do Commit */}
              <div className="mt-4 p-3.5 bg-black/30 rounded-xl border border-white/5 flex items-start gap-3">
                <GitCommit className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="text-white/50">Mensagem da alteração enviada:</span>
                  <p className="text-white font-semibold text-sm mt-0.5">
                    "{latestRun.commit.message}"
                  </p>
                  <span className="text-white/40 text-[11px] mt-1 block">
                    Autor: {latestRun.commit.author}
                  </span>
                </div>
              </div>

              {/* Alerta de Erro com Passo Específico */}
              {latestRun.conclusion === "failure" && (
                <div className="mt-4 p-4 bg-red-950/60 border border-red-500/40 rounded-xl text-xs space-y-2">
                  <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    Detalhes da Falha na Execução
                  </div>
                  <p className="text-red-200/80">
                    {githubData?.latestFailedJobStep || "Ocorreu um erro durante uma das etapas do workflow (SSH, npm install, build ou reinicialização do PM2)."}
                  </p>
                  <p className="text-white/60 text-[11px]">
                    Dica: Verifique se a Secret <code className="text-orange-400 font-mono">ORACLE_SSH_KEY</code> está configurada corretamente no repositório GitHub.
                  </p>
                </div>
              )}
            </div>

            {/* Histórico dos Últimos Deploys */}
            <div>
              <h4 className="text-sm font-bold text-white/80 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-400" />
                Histórico Recente de Deploys
              </h4>

              <div className="space-y-2">
                {githubData?.runs.slice(1, 5).map((run) => (
                  <div
                    key={run.id}
                    className="p-3.5 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {run.conclusion === "success" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : run.conclusion === "failure" ? (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      ) : (
                        <RotateCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                      )}

                      <div>
                        <div className="text-white font-medium">
                          {run.commit.message.substring(0, 70)}{run.commit.message.length > 70 ? "..." : ""}
                        </div>
                        <div className="text-white/40 text-[11px] flex items-center gap-2 mt-0.5">
                          <span>{formatDateTime(run.created_at)}</span>
                          <span>•</span>
                          <span>{run.actor.login}</span>
                          <span>•</span>
                          <span className="font-mono">{run.head_sha}</span>
                        </div>
                      </div>
                    </div>

                    <a
                      href={run.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-400 hover:text-orange-300 font-medium flex items-center gap-1 self-start sm:self-center text-[11px]"
                    >
                      Detalhes
                      <ChevronRight className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl">
            <GitBranch className="w-8 h-8 text-white/20 mx-auto mb-2" />
            <p className="text-white/50 text-xs">
              {githubLoading ? "Buscando histórico no GitHub Actions..." : "Nenhum deploy encontrado para este repositório ou acesso não configurado."}
            </p>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* SEÇÃO 2: SAÚDE & TELEMETRIA DA VPS ORACLE (SÃO PAULO)    */}
      {/* ======================================================== */}
      <div className="bg-[#1c1c1e]/60 border border-white/10 backdrop-blur-xl rounded-[28px] p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <Server className="w-5 h-5" />
              </div>
              <h3 className="text-2xl font-bold text-white">Saúde da VPS Oracle</h3>
              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold">
                147.15.57.146 (São Paulo)
              </span>
            </div>
            <p className="text-white/50 text-sm mt-1 ml-11">
              Métricas de hardware em tempo real, consumo de RAM, CPU e status dos processos de streaming.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/40">
              {lastVpsRefresh ? `Atualizado: ${lastVpsRefresh.toLocaleTimeString("pt-BR")}` : ""}
            </span>
          </div>
        </div>

        {/* Grid de Status dos Serviços */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Status Proxy de TV */}
          <div className="p-5 bg-white/[0.02] border border-white/10 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className={`p-3 rounded-2xl ${
                vpsData?.proxyStatus.online ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              }`}>
                {vpsData?.proxyStatus.online ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
              </div>
              <div>
                <span className="text-xs text-white/50 block font-semibold uppercase tracking-wider">
                  Proxy de TV ao Vivo (HLS)
                </span>
                <span className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
                  {vpsData?.proxyStatus.online ? (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                      🟢 Online & Operacional
                    </span>
                  ) : (
                    <span className="text-red-400">🔴 Offline / Inacessível</span>
                  )}
                </span>
                <span className="text-[11px] text-white/40 font-mono block mt-1">
                  https://play-infinity-app.duckdns.org
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-white/40 block">Latência</span>
              <span className="text-sm font-bold text-white font-mono">
                {vpsData?.proxyStatus.latencyMs ? `${vpsData.proxyStatus.latencyMs}ms` : "--"}
              </span>
            </div>
          </div>

          {/* Status Servidor Web */}
          <div className="p-5 bg-white/[0.02] border border-white/10 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-blue-500/20 text-blue-400 rounded-2xl">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-white/50 block font-semibold uppercase tracking-wider">
                  Servidor Web & API
                </span>
                <span className="text-base font-bold text-white flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                  🟢 Online & Respondendo
                </span>
                <span className="text-[11px] text-white/40 font-mono block mt-1">
                  Node.js {vpsData?.webServerStatus.nodeVersion || "v20"} • {vpsData?.webServerStatus.platform || "linux"}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-white/40 block">Uptime App</span>
              <span className="text-sm font-bold text-white font-mono">
                {vpsData?.webServerStatus.uptimeSeconds
                  ? `${Math.floor(vpsData.webServerStatus.uptimeSeconds / 3600)}h ${Math.floor((vpsData.webServerStatus.uptimeSeconds % 3600) / 60)}m`
                  : "--"}
              </span>
            </div>
          </div>
        </div>

        {/* Métricas de Hardware da VPS (RAM e CPU) */}
        {vpsData?.vpsHardware.hasSsh ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* RAM Card */}
              <div className="p-5 bg-black/30 border border-white/10 rounded-2xl">
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="text-white/60 font-semibold flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-orange-400" />
                    Memória RAM da VPS
                  </span>
                  <span className="font-mono font-bold text-white">
                    {vpsData.vpsHardware.ram.usedPercent}% Usado
                  </span>
                </div>

                <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      vpsData.vpsHardware.ram.usedPercent > 85
                        ? "bg-red-500"
                        : vpsData.vpsHardware.ram.usedPercent > 65
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, vpsData.vpsHardware.ram.usedPercent)}%` }}
                  ></div>
                </div>

                <div className="flex justify-between text-[11px] text-white/50 font-mono">
                  <span>Usado: <strong className="text-white">{vpsData.vpsHardware.ram.usedMb} MB</strong></span>
                  <span>Total: <strong className="text-white">{vpsData.vpsHardware.ram.totalMb} MB</strong></span>
                </div>
                <div className="mt-1 text-[11px] text-emerald-400 font-mono">
                  Disponível: {vpsData.vpsHardware.ram.availableMb} MB (com buffer)
                </div>
              </div>

              {/* CPU & Load Average Card */}
              <div className="p-5 bg-black/30 border border-white/10 rounded-2xl">
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="text-white/60 font-semibold flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-blue-400" />
                    CPU & Load Average
                  </span>
                  <span className="text-emerald-400 font-bold text-xs">
                    Estável
                  </span>
                </div>

                <div className="text-2xl font-black text-white font-mono">
                  {vpsData.vpsHardware.loadAverage[0].toFixed(2)}
                </div>
                <p className="text-[11px] text-white/40 mt-1">
                  Médias (1m, 5m, 15m):{" "}
                  <span className="font-mono text-white/80">
                    {vpsData.vpsHardware.loadAverage.map(n => n.toFixed(2)).join(", ")}
                  </span>
                </p>
                <div className="mt-2 text-[11px] text-white/50 truncate" title={vpsData.vpsHardware.uptime}>
                  {vpsData.vpsHardware.uptime.split(",")[0] || "Online"}
                </div>
              </div>

              {/* Memória Swap Card */}
              <div className="p-5 bg-black/30 border border-white/10 rounded-2xl">
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="text-white/60 font-semibold flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-purple-400" />
                    Memória Swap
                  </span>
                  <span className="font-mono font-bold text-white">
                    {vpsData.vpsHardware.swap.usedPercent}%
                  </span>
                </div>

                <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, vpsData.vpsHardware.swap.usedPercent)}%` }}
                  ></div>
                </div>

                <div className="flex justify-between text-[11px] text-white/50 font-mono">
                  <span>Usado: <strong className="text-white">{vpsData.vpsHardware.swap.usedMb} MB</strong></span>
                  <span>Total: <strong className="text-white">{vpsData.vpsHardware.swap.totalMb} MB</strong></span>
                </div>
              </div>
            </div>

            {/* Tabela de Processos PM2 na VPS */}
            <div>
              <h4 className="text-sm font-bold text-white/80 mb-3 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Processos em Execução na VPS (PM2)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {vpsData.vpsHardware.pm2Processes.map((proc) => (
                  <div
                    key={proc.name}
                    className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        proc.status === "online" ? "bg-emerald-400 animate-pulse" : "bg-red-500"
                      }`}></div>
                      <div>
                        <span className="text-white font-bold block">{proc.name}</span>
                        <span className="text-white/40 text-[11px] font-mono">
                          Status: <strong className={proc.status === "online" ? "text-emerald-400" : "text-red-400"}>{proc.status}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <span className="text-white block font-semibold">{proc.memoryMb} MB RAM</span>
                      <span className="text-white/40 text-[11px]">{proc.cpuPercent}% CPU</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ações Rápidas na VPS (Reiniciar, Atualizar) */}
            <div className="pt-4 border-t border-white/10">
              <span className="text-xs font-semibold text-white/50 block mb-3 uppercase tracking-wider">
                Ações Diretas no Servidor VPS (SSH)
              </span>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleVpsAction("restart-all", "Reiniciar Todos os Processos PM2")}
                  disabled={actionLoading !== null}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${actionLoading === "restart-all" ? "animate-spin text-orange-400" : ""}`} />
                  {actionLoading === "restart-all" ? "Reiniciando..." : "Reiniciar Todos os Serviços (PM2)"}
                </button>

                <button
                  onClick={() => handleVpsAction("restart-proxy", "Reiniciar Proxy de TV (video-proxy)")}
                  disabled={actionLoading !== null}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 text-emerald-400 rounded-xl text-xs font-bold border border-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Wifi className={`w-3.5 h-3.5 ${actionLoading === "restart-proxy" ? "animate-spin" : ""}`} />
                  {actionLoading === "restart-proxy" ? "Reiniciando..." : "Reiniciar Apenas Proxy de TV"}
                </button>

                <button
                  onClick={() => handleVpsAction("git-pull-build", "Executar Git Pull & Build na VPS")}
                  disabled={actionLoading !== null}
                  className="flex items-center gap-2 px-4 py-2.5 bg-orange-500/10 hover:bg-orange-500/20 active:scale-95 text-orange-400 rounded-xl text-xs font-bold border border-orange-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Terminal className={`w-3.5 h-3.5 ${actionLoading === "git-pull-build" ? "animate-spin" : ""}`} />
                  {actionLoading === "git-pull-build" ? "Executando..." : "Executar Git Pull & Build na VPS"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl text-xs text-white/60 flex items-center gap-3">
            <Info className="w-5 h-5 text-orange-400 shrink-0" />
            <div>
              <p className="font-semibold text-white">Telemetria SSH Direta</p>
              <p className="text-[11px] text-white/50 mt-0.5">
                {vpsData?.vpsHardware.error || "A chave 'oracle-vps.key' permite telemetria em tempo real e comandos remotos seguros."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Terminal Output Modal */}
      {terminalOutput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#121214] border border-white/10 rounded-[24px] w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-orange-400" />
                <h4 className="text-sm font-bold text-white">{terminalOutput.title}</h4>
                {terminalOutput.code === 0 ? (
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold">
                    Código 0 (Sucesso)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px] font-bold">
                    Concluído
                  </span>
                )}
              </div>
              <button
                onClick={() => setTerminalOutput(null)}
                className="text-white/50 hover:text-white text-xs font-semibold px-2 py-1"
              >
                Fechar [ESC]
              </button>
            </div>

            <div className="p-5 font-mono text-xs text-emerald-400 bg-black/90 max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {terminalOutput.output}
            </div>

            <div className="p-3 bg-white/5 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setTerminalOutput(null)}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
