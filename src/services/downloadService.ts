import { findMovieByTmdbId, findEpisode } from "./encontreiCatalog";

// Base da VPS Oracle (Always Free até 10 TB de tráfego)
const ORACLE_PROXY_BASE = (import.meta.env.VITE_PROXY_URL as string) || "https://play-infinity-app.duckdns.org";

export interface DownloadAvailability {
  available: boolean;
  mixdropUrl?: string;
  directDownloadUrl?: string;
  fileName?: string;
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

/**
 * Dispara o download direto sem sair da página
 */
export function triggerDirectDownload(url: string, fileName?: string) {
  const link = document.createElement("a");
  link.href = url;
  if (fileName) {
    link.download = fileName;
  }
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    try {
      document.body.removeChild(link);
    } catch (_) {}
  }, 1000);
}
