import { db, auth } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const STORAGE_KEY = "playinfinity_watched_episodes";

function getStore(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Timer para evitar spam de writes no Firestore (Debounce de 5s)
let syncTimeout: any = null;

function syncWatchedToCloud(store: Record<string, boolean>) {
  if (syncTimeout) clearTimeout(syncTimeout);
  
  syncTimeout = setTimeout(async () => {
    const user = auth.currentUser;
    if (!user) return; // Só sincroniza se estiver logado
    
    try {
      const userRef = doc(db, "usuarios", user.uid);
      await setDoc(userRef, { episodiosAssistidos: store }, { merge: true });
    } catch (e) {
      console.warn("[Firestore Sync] Falha ao sincronizar episódios:", e);
    }
  }, 5000);
}

export async function fetchWatchedFromCloud(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    let snap = await getDoc(doc(db, "usuarios", user.uid));
    if (!snap.exists()) {
      snap = await getDoc(doc(db, "users", user.uid));
    }
    if (snap.exists()) {
      const data = snap.data();
      const remoteWatched = data.episodiosAssistidos || data.watchedEpisodes;
      if (remoteWatched) {
        // Mescla episódios da nuvem com os locais
        const local = getStore();
        const merged = { ...local, ...remoteWatched };
        saveStore(merged);
      }
    }
  } catch (e) {
    console.warn("[Firestore Fetch] Erro ao baixar episódios:", e);
  }
}

function saveStore(store: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent("playinfinity:watched_updated", { detail: store }));
    syncWatchedToCloud(store);
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
