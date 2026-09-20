/**
 * Utilitário para tradução e padronização de erros do Firebase e da aplicação
 * Garante que nenhuma mensagem técnica em inglês ou com códigos brutos apareça na tela do usuário.
 */

export function getFriendlyErrorMessage(err: any, defaultMessage = "Ocorreu um erro inesperado. Tente novamente."): string {
  if (!err) return defaultMessage;

  // Extrai o código de erro caso exista
  const code = (err.code || "").toLowerCase();
  const rawMsg = typeof err === "string" ? err : (err.message || "");

  // 1. Mapeamento direto por código do Firebase Auth / Firestore
  switch (code) {
    case "auth/invalid-email":
      return "Formato de e-mail inválido. Verifique se não há espaços, pontos antes do '@' (como '01.@') ou caracteres inválidos.";

    case "auth/email-already-in-use":
      return "Este e-mail já está cadastrado no sistema. Por favor, utilize outro e-mail.";

    case "auth/weak-password":
      return "A senha é muito fraca. Ela deve conter no mínimo 6 caracteres.";

    case "auth/wrong-password":
      return "Senha incorreta. Por favor, confira a senha digitada.";

    case "auth/user-not-found":
      return "Nenhuma conta foi encontrada com este e-mail. Verifique se digitou corretamente.";

    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "E-mail ou senha incorretos. Por favor, verifique os dados digitados.";

    case "auth/user-disabled":
      return "Esta conta foi suspensa ou desativada. Entre em contato com o suporte.";

    case "auth/too-many-requests":
      return "Muitas tentativas sem sucesso seguidas. Por segurança, aguarde alguns minutos antes de tentar novamente.";

    case "auth/network-request-failed":
      return "Falha de conexão com a internet. Verifique sua rede e tente novamente.";

    case "auth/requires-recent-login":
      return "Por motivos de segurança, saia da sua conta e faça login novamente para realizar esta alteração.";

    case "auth/popup-closed-by-user":
      return "A janela de login foi fechada antes de concluir o acesso.";

    case "permission-denied":
      return "Permissão negada. Você não tem autorização para realizar esta ação no banco de dados.";

    case "unavailable":
      return "O serviço está temporariamente indisponível. Aguarde alguns instantes e tente novamente.";

    case "not-found":
      return "O registro ou usuário solicitado não foi encontrado.";
  }

  // 2. Detecção por substrings em mensagens brutas (ex: "Firebase: Error (auth/invalid-email)")
  const lowerMsg = rawMsg.toLowerCase();

  if (lowerMsg.includes("auth/invalid-email") || lowerMsg.includes("invalid-email")) {
    return "Formato de e-mail inválido. Verifique se não há espaços, pontos antes do '@' (como '01.@') ou caracteres inválidos.";
  }
  if (lowerMsg.includes("auth/email-already-in-use") || lowerMsg.includes("email-already-in-use")) {
    return "Este e-mail já está cadastrado no sistema. Por favor, utilize outro e-mail.";
  }
  if (lowerMsg.includes("auth/weak-password") || lowerMsg.includes("weak-password")) {
    return "A senha é muito fraca. Ela deve conter no mínimo 6 caracteres.";
  }
  if (lowerMsg.includes("auth/wrong-password") || lowerMsg.includes("auth/invalid-credential") || lowerMsg.includes("invalid-login-credentials")) {
    return "E-mail ou senha incorretos. Por favor, confira os dados digitados.";
  }
  if (lowerMsg.includes("auth/user-not-found")) {
    return "Nenhuma conta foi encontrada com este e-mail.";
  }
  if (lowerMsg.includes("auth/too-many-requests")) {
    return "Muitas tentativas sem sucesso seguidas. Aguarde alguns minutos antes de tentar novamente.";
  }
  if (lowerMsg.includes("auth/network-request-failed") || lowerMsg.includes("network error") || lowerMsg.includes("failed to fetch")) {
    return "Falha na conexão de internet. Verifique sua rede e tente novamente.";
  }
  if (lowerMsg.includes("permission-denied")) {
    return "Acesso negado. Você não tem permissão para realizar esta operação.";
  }

  // 3. Limpeza de prefixos técnicos comuns caso não se enquadre
  const cleaned = rawMsg
    .replace(/^Firebase:\s*Error\s*\(([^)]+)\)\.?/i, "$1")
    .replace(/^FirebaseError:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();

  // Se a mensagem limpa for puramente código técnico (ex: auth/...)
  if (cleaned.startsWith("auth/")) {
    return `Não foi possível concluir a ação (${cleaned}). Verifique os dados e tente novamente.`;
  }

  return cleaned || defaultMessage;
}
