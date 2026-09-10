import { getAllCatalogItems } from "./favorites";

const CHAIR_PHOTO_ID = "photo-1489599849927-2ee91cede3ba";

export function isInvalidOrChairPhoto(url?: string): boolean {
  if (!url || typeof url !== "string") return true;
  return url.includes(CHAIR_PHOTO_ID);
}

function normalizeTitle(t?: string): string {
  if (!t) return "";
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveMediaCovers(item: {
  id: string | number;
  tmdbId?: number;
  title?: string;
  imageUrl?: string;
  backdropUrl?: string;
  posterUrl?: string;
}): { imageUrl?: string; backdropUrl?: string; posterUrl?: string } {
  let img = !isInvalidOrChairPhoto(item.imageUrl) ? item.imageUrl : undefined;
  let backdrop = !isInvalidOrChairPhoto(item.backdropUrl) ? item.backdropUrl : undefined;
  let poster = !isInvalidOrChairPhoto(item.posterUrl) ? item.posterUrl : undefined;

  // Se estiver faltando backdrop ou imagem de capa, resolve via catálogo global
  if (!img || !backdrop || !poster) {
    try {
      const catalog = getAllCatalogItems();
      const numId = Number(item.id);
      const numTmdb = item.tmdbId ? Number(item.tmdbId) : undefined;
      const normalizedItemTitle = normalizeTitle(item.title);

      // 1. Prioridade máxima: correspondência exata por ID numérico ou TMDB ID
      let found = catalog.find(c => 
        (numId && c.id === numId) ||
        (numTmdb && (c.tmdbId === numTmdb || c.id === numTmdb))
      );

      // 2. Segunda prioridade: correspondência exata de título normalizado
      if (!found && normalizedItemTitle) {
        found = catalog.find(c => normalizeTitle(c.title) === normalizedItemTitle);
      }

      // 3. Terceira prioridade: se houver sufixos de áudio ("Dublado", "Legendado"),
      // compara apenas se o título base for estritamente idêntico (evita colisões como "Alien" vs "Aliens")
      if (!found && normalizedItemTitle) {
        const cleanBase = normalizedItemTitle.replace(/\b(dublado|legendado|dual|audio|completo)\b/g, "").trim();
        if (cleanBase.length >= 3) {
          found = catalog.find(c => {
            const cBase = normalizeTitle(c.title).replace(/\b(dublado|legendado|dual|audio|completo)\b/g, "").trim();
            return cBase === cleanBase;
          });
        }
      }

      if (found) {
        if (!backdrop && !isInvalidOrChairPhoto(found.backdropUrl)) {
          backdrop = found.backdropUrl;
        }
        if (!poster && !isInvalidOrChairPhoto(found.posterUrl)) {
          poster = found.posterUrl;
        }
        if (!img) {
          img = backdrop || poster || found.imageUrl;
        }
      }
    } catch {}
  }

  if (!img) {
    img = backdrop || poster;
  }
  if (!backdrop && img) {
    backdrop = img;
  }
  if (!poster && img) {
    poster = img;
  }

  return { imageUrl: img, backdropUrl: backdrop, posterUrl: poster };
}

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
  const resolvedCovers = resolveMediaCovers({
    id: item.id,
    tmdbId: item.tmdbId ?? existing?.tmdbId,
    title: item.title,
    imageUrl: item.imageUrl || existing?.imageUrl,
    backdropUrl: item.backdropUrl || existing?.backdropUrl,
    posterUrl: item.posterUrl || existing?.posterUrl,
  });

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
    imageUrl: resolvedCovers.imageUrl || existing?.imageUrl,
    backdropUrl: resolvedCovers.backdropUrl || existing?.backdropUrl,
    posterUrl: resolvedCovers.posterUrl || existing?.posterUrl,
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
  let updated = false;

  const rawItems = Object.values(store).map(item => {
    if (isInvalidOrChairPhoto(item.imageUrl) || isInvalidOrChairPhoto(item.backdropUrl) || !item.imageUrl) {
      const fixed = resolveMediaCovers(item);
      if (fixed.imageUrl && fixed.imageUrl !== item.imageUrl) {
        item.imageUrl = fixed.imageUrl;
        item.backdropUrl = fixed.backdropUrl || item.backdropUrl;
        item.posterUrl = fixed.posterUrl || item.posterUrl;
        store[makeHistoryKey(item.id, item.type, item.season, item.episode)] = item;
        updated = true;
      }
    }
    return item;
  });

  // Deduplica por ID da mídia, mantendo apenas o registro mais recente (último episódio assistido)
  const uniqueItemsMap = new Map<string, PlaybackHistoryItem>();
  for (const item of rawItems) {
    const key = String(item.id);
    const existing = uniqueItemsMap.get(key);
    if (!existing || item.updatedAt > existing.updatedAt) {
      uniqueItemsMap.set(key, item);
    }
  }

  const items = Array.from(uniqueItemsMap.values());

  // Se havia duplicatas (chaves antigas com S e E) ou atualizou imagens, limpa o store e salva limpo
  if (updated || items.length < rawItems.length) {
    try {
      const cleanStore: Record<string, PlaybackHistoryItem> = {};
      items.forEach(item => {
        cleanStore[String(item.id)] = item;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanStore));
    } catch {}
  }

  return items.sort((a, b) => b.updatedAt - a.updatedAt);
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
export function removePlaybackItem(id: string | number, type?: 'movie' | 'series', season?: number, episode?: number): void {
  if (!id) return;
  const store = getStore();
  const targetIdStr = String(id);
  let changed = false;

  for (const key of Object.keys(store)) {
    if (key === targetIdStr || store[key]?.id?.toString() === targetIdStr) {
      delete store[key];
      changed = true;
    }
  }

  if (changed) {
    saveStore(store);
  }
}

