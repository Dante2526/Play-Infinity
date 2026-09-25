/**
 * Utilitários para detecção de ambiente.
 * 
 * Identifica se a aplicação está rodando no ambiente de desenvolvimento/preview
 * do Google AI Studio ou localhost.
 * 
 * - No Google AI Studio (Cloud Run preview / dev): Desabilita a tela de bloqueio inicial
 *   de login para permitir testes rápidos e diretos de todas as funcionalidades.
 * - Na versão de Produção: A tela de login permanece 100% ativa e obrigatória.
 */

export function isAiStudioOrDevEnvironment(): boolean {
  if (typeof window === "undefined") return false;

  // Permite forçar o teste da tela de login no dev caso queira testá-la manualmente
  if (localStorage.getItem("playinfinity_force_auth_modal") === "true") {
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();

  // Se estiver em domínio público/oficial de produção, nunca é modo de teste dev
  if (
    hostname.includes("play-infinity") ||
    hostname.includes("duckdns.org")
  ) {
    return false;
  }

  // 1. Google AI Studio (Cloud Run containers ais-dev-*, ais-pre-*, run.app)
  if (
    hostname.includes("run.app") ||
    hostname.includes("google.com") ||
    hostname.includes("googleusercontent.com")
  ) {
    return true;
  }

  // 2. Ambiente local
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local")
  ) {
    return true;
  }

  return false;
}
