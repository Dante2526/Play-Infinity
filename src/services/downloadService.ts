import { findMovieByTmdbId, findEpisode } from "./encontreiCatalog";
import { safeLocalStorage } from "../utils/safeStorage";

// Base da VPS Oracle (Always Free até 10 TB de tráfego)
const ORACLE_PROXY_BASE = (import.meta.env.VITE_PROXY_URL as string) || "https://play-infinity-app.duckdns.org";

export interface DownloadAvailability {
  available: boolean;
  mixdropUrl?: string;
  directDownloadUrl?: string;
  fileName?: string;
}

export interface DownloadHistoryItem {
  id: string; // único, ex: movie:512195 ou tv:84958:1:1
  tmdbId: number;
  title: string;
  type: "movie" | "series";
  season?: number;
  episode?: number;
  directDownloadUrl: string;
  fileName: string;
  timestamp: number;
  posterUrl?: string;
  backdropUrl?: string;
  quality?: string;
}

const DOWNLOAD_HISTORY_STORAGE_KEY = "playinfinity_download_history";

/**
 * Retorna os itens baixados salvos localmente
 */
export function getDownloadHistory(): DownloadHistoryItem[] {
  try {
    const raw = safeLocalStorage.getItem(DOWNLOAD_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("[DownloadService] Erro ao obter histórico:", err);
    return [];
  }
}

/**
 * Salva um download no histórico
 */
export function recordDownload(item: Omit<DownloadHistoryItem, "timestamp">): void {
  try {
    const history = getDownloadHistory();
    const updatedItem: DownloadHistoryItem = {
      ...item,
      timestamp: Date.now()
    };
    // Remove duplicata prévia pelo ID
    const filtered = history.filter(h => h.id !== item.id);
    const newHistory = [updatedItem, ...filtered].slice(0, 100); // guarda até 100
    safeLocalStorage.setItem(DOWNLOAD_HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
    window.dispatchEvent(new CustomEvent("playinfinity:downloads_updated", { detail: newHistory }));
  } catch (err) {
    console.warn("[DownloadService] Erro ao registrar download:", err);
  }
}

/**
 * Remove um item do histórico de downloads
 */
export function removeDownloadFromHistory(id: string): void {
  try {
    const history = getDownloadHistory();
    const filtered = history.filter(h => h.id !== id);
    safeLocalStorage.setItem(DOWNLOAD_HISTORY_STORAGE_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent("playinfinity:downloads_updated", { detail: filtered }));
  } catch (err) {
    console.warn("[DownloadService] Erro ao remover do histórico:", err);
  }
}

/**
 * Limpa todo o histórico de downloads
 */
export function clearDownloadHistory(): void {
  try {
    safeLocalStorage.removeItem(DOWNLOAD_HISTORY_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("playinfinity:downloads_updated", { detail: [] }));
  } catch (err) {
    console.warn("[DownloadService] Erro ao limpar histórico:", err);
  }
}

/**
 * Sanitiza o nome do arquivo para downloads locais
 */
export function sanitizeDownloadFileName(title: string, season?: number, episode?: number): string {
  let cleanTitle = title.replace(/[<>:"/\\|?*]+/g, "").trim().replace(/\s+/g, ".");
  if (typeof season === "number" && typeof episode === "number") {
    const s = String(season).padStart(2, "0");
    const e = String(episode).padStart(2, "0");
    return `${cleanTitle}.S${s}E${e}.1080p.Dublado.mp4`;
  }
  return `${cleanTitle}.1080p.Dublado.mp4`;
}

/**
 * Verifica se um filme possui link MixDrop para download
 */
export async function checkMovieDownloadAvailability(tmdbId: number, title: string): Promise<DownloadAvailability> {
  try {
    const data = await findMovieByTmdbId(tmdbId);
    if (data && data.mixdrop) {
      const fileName = sanitizeDownloadFileName(title);
      const directDownloadUrl = `${ORACLE_PROXY_BASE}/api/download?url=${encodeURIComponent(data.mixdrop)}&filename=${encodeURIComponent(fileName)}`;
      return {
        available: true,
        mixdropUrl: data.mixdrop,
        directDownloadUrl,
        fileName
      };
    }
  } catch (err) {
    console.warn("[DownloadService] Erro ao verificar disponibilidade de filme:", err);
  }
  return { available: false };
}

/**
 * Verifica se um episódio de série possui link MixDrop para download
 */
export async function checkEpisodeDownloadAvailability(
  tmdbId: number, 
  season: number, 
  episode: number, 
  seriesTitle: string
): Promise<DownloadAvailability> {
  try {
    const data = await findEpisode(tmdbId, season, episode);
    if (data && data.mixdrop) {
      const fileName = sanitizeDownloadFileName(seriesTitle, season, episode);
      const directDownloadUrl = `${ORACLE_PROXY_BASE}/api/download?url=${encodeURIComponent(data.mixdrop)}&filename=${encodeURIComponent(fileName)}`;
      return {
        available: true,
        mixdropUrl: data.mixdrop,
        directDownloadUrl,
        fileName
      };
    }
  } catch (err) {
    console.warn("[DownloadService] Erro ao verificar disponibilidade de episódio:", err);
  }
  return { available: false };
}

export interface ActiveDownload {
  id: string;
  tmdbId: number;
  title: string;
  type: "movie" | "series";
  season?: number;
  episode?: number;
  fileName: string;
  posterUrl?: string;
  backdropUrl?: string;
  quality?: string;
  progress: number;
  speed: string;
  status: "starting" | "downloading" | "completed";
}

let currentActiveDownload: ActiveDownload | null = null;
let activeDownloadTimer: any = null;

export function getActiveDownload(): ActiveDownload | null {
  return currentActiveDownload;
}

export function dismissActiveDownload(): void {
  if (activeDownloadTimer) {
    clearInterval(activeDownloadTimer);
    activeDownloadTimer = null;
  }
  currentActiveDownload = null;
  window.dispatchEvent(new CustomEvent("playinfinity:active_download_update", { detail: null }));
}

/**
 * Inicia a simulação acelerada de download paralelo para acionar a barra bidirecional
 */
export function startActiveDownloadProgress(item: Omit<ActiveDownload, "progress" | "speed" | "status">) {
  if (activeDownloadTimer) {
    clearInterval(activeDownloadTimer);
    activeDownloadTimer = null;
  }

  currentActiveDownload = {
    ...item,
    progress: 0,
    speed: "21.4 MB/s",
    status: "starting"
  };

  window.dispatchEvent(new CustomEvent("playinfinity:active_download_update", { detail: currentActiveDownload }));

  const startTime = Date.now();
  const totalDuration = 4200; // 4.2 segundos para completar a animação perceptiva

  activeDownloadTimer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const rawProgress = Math.min(100, (elapsed / totalDuration) * 100);

    // Variação orgânica na velocidade
    const speeds = ["28.5 MB/s", "34.2 MB/s", "41.8 MB/s", "37.1 MB/s", "45.0 MB/s"];
    const currentSpeed = speeds[Math.floor((elapsed / 600) % speeds.length)];

    if (rawProgress >= 100) {
      clearInterval(activeDownloadTimer);
      activeDownloadTimer = null;
      if (currentActiveDownload) {
        currentActiveDownload = {
          ...currentActiveDownload,
          progress: 100,
          speed: "Concluído",
          status: "completed"
        };
        window.dispatchEvent(new CustomEvent("playinfinity:active_download_update", { detail: currentActiveDownload }));
      }
      // Limpa após 4.5 segundos
      setTimeout(() => {
        if (currentActiveDownload && currentActiveDownload.progress >= 100) {
          dismissActiveDownload();
        }
      }, 4500);
      return;
    }

    if (currentActiveDownload) {
      currentActiveDownload = {
        ...currentActiveDownload,
        progress: rawProgress,
        speed: currentSpeed,
        status: "downloading"
      };
      window.dispatchEvent(new CustomEvent("playinfinity:active_download_update", { detail: currentActiveDownload }));
    }
  }, 60);
}

/**
 * Dispara o download direto sem sair da página e opcionalmente registra no histórico
 */
export function triggerDirectDownload(
  url: string, 
  fileName?: string,
  meta?: {
    tmdbId: number;
    title: string;
    type: "movie" | "series";
    season?: number;
    episode?: number;
    posterUrl?: string;
    backdropUrl?: string;
    quality?: string;
  }
) {
  const link = document.createElement("a");
  link.href = url;
  if (fileName) {
    link.download = fileName;
  }
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
  document.body.appendChild(link);
  link.click();

  if (meta) {
    const id = meta.type === "movie" 
      ? `movie:${meta.tmdbId}` 
      : `tv:${meta.tmdbId}:${meta.season || 1}:${meta.episode || 1}`;
    
    recordDownload({
      id,
      tmdbId: meta.tmdbId,
      title: meta.title,
      type: meta.type,
      season: meta.season,
      episode: meta.episode,
      directDownloadUrl: url,
      fileName: fileName || `${meta.title}.mp4`,
      posterUrl: meta.posterUrl,
      backdropUrl: meta.backdropUrl,
      quality: meta.quality
    });

    // Dispara a barra de progresso bidirecional ativa!
    startActiveDownloadProgress({
      id,
      tmdbId: meta.tmdbId,
      title: meta.title,
      type: meta.type,
      season: meta.season,
      episode: meta.episode,
      fileName: fileName || `${meta.title}.mp4`,
      posterUrl: meta.posterUrl,
      backdropUrl: meta.backdropUrl,
      quality: meta.quality
    });
  }

  setTimeout(() => {
    try {
      document.body.removeChild(link);
    } catch (_) {}
  }, 1000);
}
