const STORAGE_KEY = "playinfinity_watched_episodes";

function getStore(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent("playinfinity:watched_updated", { detail: store }));
  } catch (e) {
    console.error("Erro ao salvar episódios assistidos:", e);
  }
}

export function makeEpisodeKey(seriesId: number | string, season: number, episode: number): string {
  return `${seriesId}_s${season}_e${episode}`;
}

export function isEpisodeWatched(seriesId: number | string, season: number, episode: number): boolean {
  if (!seriesId) return false;
  const store = getStore();
  return !!store[makeEpisodeKey(seriesId, season, episode)];
}

export function markEpisodeWatched(seriesId: number | string, season: number, episode: number, watched: boolean = true): void {
  if (!seriesId) return;
  const store = getStore();
  const key = makeEpisodeKey(seriesId, season, episode);
  if (watched) {
    store[key] = true;
  } else {
    delete store[key];
  }
  saveStore(store);
}

export function toggleEpisodeWatched(seriesId: number | string, season: number, episode: number): boolean {
  if (!seriesId) return false;
  const current = isEpisodeWatched(seriesId, season, episode);
  markEpisodeWatched(seriesId, season, episode, !current);
  return !current;
}

export function markSeasonWatched(seriesId: number | string, season: number, episodeCount: number, watched: boolean = true): void {
  if (!seriesId) return;
  const store = getStore();
  for (let ep = 1; ep <= episodeCount; ep++) {
    const key = makeEpisodeKey(seriesId, season, ep);
    if (watched) {
      store[key] = true;
    } else {
      delete store[key];
    }
  }
  saveStore(store);
}

export function getSeasonWatchedCount(seriesId: number | string, season: number, episodeCount: number): number {
  if (!seriesId) return 0;
  const store = getStore();
  let count = 0;
  for (let ep = 1; ep <= episodeCount; ep++) {
    if (store[makeEpisodeKey(seriesId, season, ep)]) count++;
  }
  return count;
}

export function isSeasonFullyWatched(seriesId: number | string, season: number, episodeCount: number): boolean {
  if (!seriesId || episodeCount <= 0) return false;
  return getSeasonWatchedCount(seriesId, season, episodeCount) >= episodeCount;
}

export function getAllWatchedEpisodes(): Record<string, boolean> {
  return getStore();
}
