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
 * Gera URL de download direto via VPS Oracle para qualquer link MixDrop
 */
export function buildMixdropDownloadUrl(mixdropUrl: string, fileName: string): string {
  return `${ORACLE_PROXY_BASE}/api/download?url=${encodeURIComponent(mixdropUrl)}&filename=${encodeURIComponent(fileName)}`;
}

/**
 * Verifica se um filme possui link MixDrop para download
 */
export async function checkMovieDownloadAvailability(tmdbId: number, title: string, directUrl?: string): Promise<DownloadAvailability> {
  const fileName = sanitizeDownloadFileName(title);

  // Se já tiver uma URL MixDrop direta no objeto
  if (directUrl && (directUrl.includes("mixdrop.") || directUrl.includes("mxdrop."))) {
    return {
      available: true,
      mixdropUrl: directUrl,
      directDownloadUrl: buildMixdropDownloadUrl(directUrl, fileName),
      fileName
    };
  }

  try {
    const data = await findMovieByTmdbId(tmdbId);
    if (data && data.mixdrop) {
      const mixdropUrl = data.mixdrop.startsWith("http") ? data.mixdrop : `https://mxdrop.top/f/${data.mixdrop}`;
      const directDownloadUrl = buildMixdropDownloadUrl(mixdropUrl, fileName);
      return {
        available: true,
        mixdropUrl,
        directDownloadUrl,
        fileName
      };
    }
  } catch (err) {
    console.warn("[DownloadService] Erro ao verificar disponibilidade de filme:", err);
  }
  return { available: false, fileName };
}

/**
 * Verifica se um episódio de série possui link MixDrop para download
 */
export async function checkEpisodeDownloadAvailability(
  tmdbId: number, 
  season: number, 
  episode: number, 
  seriesTitle: string,
  directMixdropUrl?: string
): Promise<DownloadAvailability> {
  const fileName = sanitizeDownloadFileName(seriesTitle, season, episode);

  if (directMixdropUrl && (directMixdropUrl.includes("mixdrop.") || directMixdropUrl.includes("mxdrop."))) {
    return {
      available: true,
      mixdropUrl: directMixdropUrl,
      directDownloadUrl: buildMixdropDownloadUrl(directMixdropUrl, fileName),
      fileName
    };
  }

  try {
    const data = await findEpisode(tmdbId, season, episode);
    if (data && data.mixdrop) {
      const mixdropUrl = data.mixdrop.startsWith("http") ? data.mixdrop : `https://mxdrop.top/f/${data.mixdrop}`;
      const directDownloadUrl = buildMixdropDownloadUrl(mixdropUrl, fileName);
      return {
        available: true,
        mixdropUrl,
        directDownloadUrl,
        fileName
      };
    }
  } catch (err) {
    console.warn("[DownloadService] Erro ao verificar disponibilidade de episódio:", err);
  }
  return { available: false, fileName };
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
