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
    } catch (e) {}
    memoryStorage.delete(`local:${key}`);
  }
};

export const safeSessionStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
    } catch (e) {}
    return memoryStorage.get(`session:${key}`) ?? null;
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
        return;
      }
    } catch (e) {}
    memoryStorage.set(`session:${key}`, value);
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch (e) {}
    memoryStorage.delete(`session:${key}`);
  }
};
