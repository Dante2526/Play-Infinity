/**
 * Utilitário seguro para localStorage e sessionStorage.
 * Smart TVs (Tizen, webOS, Android TV WebViews ou modo anônimo) frequentemente
 * lançam exceções como SecurityError ou QuotaExceededError ao acessar o storage diretamente.
 */

const memoryStorage = new Map<string, string>();

export const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      // Fallback em memória caso o navegador da TV bloqueie o localStorage
    }
    return memoryStorage.get(`local:${key}`) ?? null;
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      // Falha silenciosa com salvamento em memória
    }
    memoryStorage.set(`local:${key}`, value);
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch(e){console.warn("Silenced error:", e);}
    memoryStorage.delete(`local:${key}`);
  }
};

export const safeSessionStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
    } catch(e){console.warn("Silenced error:", e);}
    return memoryStorage.get(`session:${key}`) ?? null;
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
        return;
      }
    } catch(e){console.warn("Silenced error:", e);}
    memoryStorage.set(`session:${key}`, value);
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch(e){console.warn("Silenced error:", e);}
    memoryStorage.delete(`session:${key}`);
  }
};

export function clearLocalUserData() {
  const keysToRemove = [
    "playinfinity_logged_in",
    "playinfinity_playback_history",
    "playinfinity_favorites",
    "playinfinity_user_favorites",
    "playinfinity_watched_episodes",
    "playinfinity_watched_seasons",
    "playinfinity_watched_v2",
    "playinfinity_history_v2",
    "playinfinity_schedule_cache",
    "playinfinity_schedule_cache_v2",
    "playinfinity_read_notifications",
    "playinfinity_download_history"
  ];
  
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      keysToRemove.forEach(k => window.localStorage.removeItem(k));
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith("playinfinity_comments_")) {
          window.localStorage.removeItem(key);
        }
      }
    }
  } catch(e) {
    console.warn("Silenced error during clear:", e);
  }
  
  keysToRemove.forEach(k => memoryStorage.delete(`local:${k}`));
}
