/**
 * offlineStorage.ts — Armazena blobs de vídeos baixados pra reprodução offline.
 *
 * Dois modos:
 * - WEB (browser): usa IndexedDB (persiste entre sessões, suporta blobs grandes)
 * - CAPACITOR (mobile nativo): usa @capacitor/filesystem pra salvar o arquivo
 *   no diretório Data do app, e converte o caminho pra URL acessível no webview
 *   via Capacitor.convertFileSrc().
 *
 * Em ambos os modos, o "Reproduzir" na DownloadsPage lê do storage offline
 * e toca o vídeo sem re-fetch do backend.
 */

import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";

// IndexedDB só roda no browser; no Capacitor nativo usamos Filesystem
const DB_NAME = "playinfinity_offline";
const STORE_NAME = "video_blobs";
const DB_VERSION = 1;

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

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
  // NOVO: no Capacitor nativo, guardamos o URI do arquivo em vez do blob
  fileUri?: string;
  webviewUrl?: string;
}

/**
 * Salva um blob offline.
 * - Em Capacitor nativo: escreve o arquivo no diretório Data do app
 *   e retorna o webviewUrl (acessível via <video src=...>)
 * - Em web: salva o blob direto no IndexedDB
 */
export async function saveBlob(
  id: string,
  blob: Blob,
  fileName: string
): Promise<void> {
  if (isNative()) {
    return saveBlobNative(id, blob, fileName);
  }
  return saveBlobWeb(id, blob, fileName);
}

async function saveBlobWeb(
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
    console.warn("[offlineStorage] Erro ao salvar blob (web):", err);
    throw err;
  }
}

/**
 * Em Capacitor nativo: escreve o arquivo no Filesystem.
 * Caminho: Directory.Data/downloads/<id>.mp4
 * Converte o caminho pra webviewUrl usando Capacitor.convertFileSrc.
 */
async function saveBlobNative(
  id: string,
  blob: Blob,
  fileName: string
): Promise<void> {
  try {
    // Converte blob pra base64 (Filesystem.writeFile exige base64 em mobile)
    const base64 = await blobToBase64(blob);
    const safeFileName = (fileName || `${id}.mp4`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `downloads/${id}_${safeFileName}`;

    await Filesystem.writeFile({
      path: filePath,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    });

    // Pega o URI do arquivo e converte pra URL acessível no webview
    const uriResult = await Filesystem.getUri({
      directory: Directory.Data,
      path: filePath,
    });

    const fileUri = uriResult.uri;
    const webviewUrl = Capacitor.convertFileSrc(fileUri);

    // Salva um registro leve no IndexedDB também (sem o blob, só metadados)
    // pra poder listar/excluir como os outros blobs
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const item: StoredBlob = {
          id,
          blob: new Blob(), // placeholder vazio — o conteúdo tá no filesystem
          fileName,
          timestamp: Date.now(),
          size: blob.size,
          type: blob.type || "video/mp4",
          fileUri,
          webviewUrl,
        };
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      });
    } catch (e) {
      console.warn("[offlineStorage] IndexedDB fallback falhou (ok em mobile):", e);
    }

    console.log(`[offlineStorage] Blob salvo no filesystem nativo: ${fileUri}`);
    console.log(`[offlineStorage] WebView URL: ${webviewUrl}`);
  } catch (err) {
    console.warn("[offlineStorage] Erro ao salvar blob (native):", err);
    throw err;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // remove o prefixo "data:video/mp4;base64,"
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Lê um blob/registro salvo.
 * - Em Capacitor nativo: retorna registro com webviewUrl (não o blob em si)
 *   porque o conteúdo tá no filesystem; o VideoPlayer usa webviewUrl direto
 * - Em web: retorna o registro completo com blob
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
 * Remove um blob salvo.
 * - Em Capacitor nativo: deleta o arquivo do filesystem E o registro do IndexedDB
 * - Em web: deleta só do IndexedDB (o blob tava lá)
 */
export async function deleteBlob(id: string): Promise<void> {
  // Primeiro lê o registro pra saber o filePath (se for native)
  const stored = await getBlob(id);
  if (stored?.fileUri) {
    try {
      // Extrai o path do fileUri (formato: file:///data/user/0/.../downloads/...)
      // Filesystem.delete usa o path relativo, então precisamos recriar do fileName
      const safeFileName = (stored.fileName || `${id}.mp4`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `downloads/${id}_${safeFileName}`;
      await Filesystem.deleteFile({
        path: filePath,
        directory: Directory.Data,
      });
      console.log(`[offlineStorage] Arquivo deletado do filesystem: ${filePath}`);
    } catch (err: any) {
      console.warn("[offlineStorage] Erro ao deletar arquivo do filesystem:", err?.message || err);
    }
  }

  // Deleta o registro do IndexedDB (tanto web quanto native)
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
 * Lista todos os IDs de blobs armazenados.
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

// Re-exporta o Capacitor.isNativePlatform pra conveniência
export { isNative };

