import { Capacitor } from "@capacitor/core";

/**
 * True quando rodando dentro do app nativo (Capacitor) OU dentro de qualquer
 * Android WebView (user-agent com "; wv)").
 *
 * Motivação: WebViews bloqueiam cookies de terceiros por padrão, o que deixa
 * o desafio do Cloudflare Turnstile travado em "Verificando..." infinitamente
 * na tela de login. Também servem para desligar efeitos de backdrop-filter,
 * que "derretem" elementos em WebViews com bug de rasterização de GPU.
 *
 * A checagem de UA é um belt-and-suspenders: cobre o caso do objeto de ponte
 * do Capacitor ainda não ter sido injeccionado no momento da renderização.
 */
export function isNativeAppOrWebView(): boolean {
  try {
    if (Capacitor.isNativePlatform()) return true;
    const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    return /;\s*wv\)/.test(ua);
  } catch {
    return false;
  }
}
