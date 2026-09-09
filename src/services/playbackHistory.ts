/**
 * Serviço de Histórico e Progresso de Reprodução (Continuar Assistindo)
 * Armazena localmente o tempo exato onde o usuário parou em filmes e episódios de séries.
 */

export interface PlaybackHistoryItem {
  id: string | number;
  tmdbId?: number;
  imdbId?: string;
  title: string;
  type: 'movie' | 'series';
  mediaType?: 'movie' | 'series';
  season?: number;
  episode?: number;
  currentTime: number;
  duration: number;
  progressPercent: number;
  imageUrl?: string;
  backdropUrl?: string;
  posterUrl?: string;
  playerUrl?: string;
  quality?: string;
  isCam?: boolean;
  updatedAt: number;
}

const STORAGE_KEY = "playinfinity_playback_history";
const MAX_HISTORY_ITEMS = 25;

function makeHistoryKey(id: string | number, type: 'movie' | 'series', season?: number, episode?: number): string {
  if (type === 'series') {
    return `${id}_s${season || 1}_e${episode || 1}`;
  }
  return String(id);
}

function getStore(): Record<string, PlaybackHistoryItem> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, PlaybackHistoryItem>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent("playinfinity:history_updated", { detail: store }));
  } catch (e) {
    console.error("Erro ao salvar histórico de reprodução:", e);
  }
}

/**
 * Salva ou atualiza o progresso de reprodução atual de um título
 */
export function savePlaybackProgress(item: {
  id: string | number;
  tmdbId?: number;
  imdbId?: string;
  title: string;
  type?: 'movie' | 'series';
  mediaType?: 'movie' | 'series';
  season?: number;
  episode?: number;
  currentTime: number;
  duration: number;
  imageUrl?: string;
  backdropUrl?: string;
  posterUrl?: string;
  playerUrl?: string;
  quality?: string;
  isCam?: boolean;
}): void {
  if (!item.id || !item.duration || item.duration <= 0 || item.currentTime < 2) {
    return;
  }

  const effectiveType = item.type || item.mediaType || 'movie';
  const store = getStore();
  const key = makeHistoryKey(item.id, effectiveType, item.season, item.episode);
  const progressPercent = Math.min(100, Math.max(0, Math.round((item.currentTime / item.duration) * 100)));

  // Se o usuário assistiu mais de 96% do vídeo, removemos do "Continuar Assistindo" para não ficar travado no final
  if (progressPercent >= 96) {
    if (store[key]) {
      delete store[key];
      saveStore(store);
    }
    return;
  }

  const existing = store[key];

  store[key] = {
    id: item.id,
    tmdbId: item.tmdbId ?? existing?.tmdbId,
    imdbId: item.imdbId ?? existing?.imdbId,
    title: item.title,
    type: effectiveType,
    mediaType: effectiveType,
    season: item.season,
    episode: item.episode,
    currentTime: Math.round(item.currentTime),
    duration: Math.round(item.duration),
    progressPercent,
    imageUrl: item.imageUrl || existing?.imageUrl || item.backdropUrl || item.posterUrl,
    backdropUrl: item.backdropUrl || existing?.backdropUrl,
    posterUrl: item.posterUrl || existing?.posterUrl,
    playerUrl: item.playerUrl || existing?.playerUrl,
    quality: item.quality || existing?.quality,
    isCam: item.isCam ?? existing?.isCam,
    updatedAt: Date.now(),
  };

  // Mantém apenas os MAX_HISTORY_ITEMS mais recentes
  const entries = Object.entries(store);
  if (entries.length > MAX_HISTORY_ITEMS) {
    entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    const pruned: Record<string, PlaybackHistoryItem> = {};
    for (let i = 0; i < MAX_HISTORY_ITEMS; i++) {
      pruned[entries[i][0]] = entries[i][1];
    }
    saveStore(pruned);
    return;
  }

  saveStore(store);
}

/**
 * Retorna todos os itens salvos em ordem decrescente de atualização
 */
export function getPlaybackHistory(): PlaybackHistoryItem[] {
  const store = getStore();
  return Object.values(store).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Retorna o progresso salvo de um item específico
 */
export function getItemPlayback(id: string | number, type: 'movie' | 'series', season?: number, episode?: number): PlaybackHistoryItem | null {
  if (!id) return null;
  const store = getStore();
  const key = makeHistoryKey(id, type, season, episode);
  return store[key] || null;
}

/**
 * Remove um item do histórico
 */
export function removePlaybackItem(id: string | number, type: 'movie' | 'series', season?: number, episode?: number): void {
  if (!id) return;
  const store = getStore();
  const key = makeHistoryKey(id, type, season, episode);
  if (store[key]) {
    delete store[key];
    saveStore(store);
  }
}
