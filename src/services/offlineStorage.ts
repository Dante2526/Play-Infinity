/**
 * offlineStorage.ts — Armazena blobs de vídeos baixados no IndexedDB
 * pra reprodução offline real (sem re-fetch do backend).
 *
 * IndexedDB persiste entre sessões e suporta blobs grandes (centenas de MBs).
 * Cada item é identificado por um ID único (mesmo ID do DownloadHistoryItem).
 *
 * Limite de storage: varia por browser (Chrome ~80% do disco livre, Firefox ~50%).
 * Quando enche, o `evictOldestBlobs` remove os mais antigos.
 */

const DB_NAME = "playinfinity_offline";
const STORE_NAME = "video_blobs";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

export interface StoredBlob {
  id: string;
  blob: Blob;
  timestamp: number;
  size: number;
  type: string;
  fileName: string;
}

/**
 * Salva um blob no IndexedDB. Se já existe (mesmo ID), substitui.
 */
export async function saveBlob(
  id: string,
  blob: Blob,
  fileName: string
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const item: StoredBlob = {
        id,
        blob,
        fileName,
        timestamp: Date.now(),
        size: blob.size,
        type: blob.type || "video/mp4",
      };
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn("[offlineStorage] Erro ao salvar blob:", err);
    throw err;
  }
}

/**
 * Lê um blob do IndexedDB. Retorna null se não existir.
 */
export async function getBlob(id: string): Promise<StoredBlob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn("[offlineStorage] Erro ao ler blob:", err);
    return null;
  }
}

/**
 * Remove um blob do IndexedDB.
 */
export async function deleteBlob(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn("[offlineStorage] Erro ao deletar blob:", err);
  }
}

/**
 * Lista todos os IDs de blobs armazenados (pra debug/limpeza).
 */
export async function listBlobIds(): Promise<string[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    return [];
  }
}

/**
 * Estima uso total do storage (em bytes). Retorna 0 se não suportado.
 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number }> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return { usage: est.usage || 0, quota: est.quota || 0 };
    }
  } catch {}
  return { usage: 0, quota: 0 };
}
