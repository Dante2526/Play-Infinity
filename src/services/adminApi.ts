import { auth } from "./firebase";

/**
 * Obtém os cabeçalhos de autenticação de administrador com o Firebase ID Token atual
 */
export async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  try {
    if (auth?.currentUser) {
      const idToken = await auth.currentUser.getIdToken();
      headers["Authorization"] = `Bearer ${idToken}`;
      headers["x-admin-token"] = idToken;
    }
  } catch (err) {
    console.warn("[adminApi] Erro ao obter idToken do usuário logado:", err);
  }

  // Fallback para tokens legados em sessionStorage caso o currentUser ainda esteja carregando
  const sessionToken = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("adminSessionToken") : null;
  const sessionEmail = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("adminEmail") : null;

  if (!headers["x-admin-token"]) {
    headers["x-admin-token"] = sessionToken || sessionEmail || "";
  }
  if (!headers["Authorization"] && sessionToken) {
    headers["Authorization"] = `Bearer ${sessionToken}`;
  }

  return headers;
}

/**
 * Wrapper de fetch que injeta automaticamente o token de autorização nas rotas /api/admin/*
 */
export async function adminFetch(url: string, init?: RequestInit): Promise<Response> {
  const authHeaders = await getAdminAuthHeaders();
  const mergedHeaders: Record<string, string> = {
    ...authHeaders,
    ...((init?.headers as Record<string, string>) || {})
  };

  return fetch(url, {
    ...init,
    headers: mergedHeaders
  });
}
