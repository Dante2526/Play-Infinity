import React, { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, X, Sparkles, ExternalLink, CheckCircle2, Copy } from "lucide-react";
import { StatusBar } from "../utils/statusBar";
import { safeSessionStorage } from "../utils/safeStorage";

interface AppVersionInfo {
  minNativeVersionCode: number;
  latestVersionCode: number;
  latestVersionName: string;
  apkUrl: string;
  changelog?: string;
}

const EXTERNAL_APK_URL = "https://www.play-infinity.stream/app.apk";
const DIRECT_APK_URL = "https://play-infinity.stream/app.apk";
const ANDROID_INTENT_URL =
  "intent://www.play-infinity.stream/app.apk#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end";

export function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState<AppVersionInfo | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    return safeSessionStorage.getItem("playinfinity_dismiss_update_banner") === "true";
  });

  useEffect(() => {
    // Apenas no App Android Nativo (Capacitor) ou em teste manual via ?test_update=1
    const isTestMode =
      typeof window !== "undefined" && window.location.search.includes("test_update=1");
    if (!Capacitor.isNativePlatform() && !isTestMode) return;

    let isMounted = true;

    async function checkVersion() {
      try {
        if (StatusBar.hideActionBar) {
          StatusBar.hideActionBar().catch(() => {});
        }

        let installedVersionCode = 0;
        if (StatusBar.getInfo) {
          const info = await StatusBar.getInfo().catch(() => null);
          if (info && typeof info.versionCode === "number") {
            installedVersionCode = info.versionCode;
          }
        }

        const res = await fetch("/api/app-version", { cache: "no-store" });
        if (!res.ok) return;
        const data: AppVersionInfo = await res.json();

        if (installedVersionCode < data.latestVersionCode || isTestMode) {
          if (isMounted) {
            setUpdateAvailable(data);
          }
        }
      } catch (err) {
        console.warn("[AppUpdateBanner] Falha ao verificar versão:", err);
      }
    }

    checkVersion();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopyLink = () => {
    const url = DIRECT_APK_URL;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 8000);
        })
        .catch(() => fallbackCopy(url));
      return;
    }
    fallbackCopy(url);
  };

  const fallbackCopy = (text: string) => {
    try {
      const el = document.createElement("input");
      el.value = text;
      el.style.position = "fixed";
      el.style.top = "0";
      el.style.left = "0";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 8000);
    } catch {
      setCopied(false);
    }
  };

  const openExternalDownload = (urlToOpen: string) => {
    // 1. Tenta plugin nativo (se disponível)
    if (StatusBar.openExternalUrl) {
      StatusBar.openExternalUrl({ url: urlToOpen }).catch(() => {});
    }
    // 2. Tenta window.open com target _blank (Capacitor delega domínios com www para o navegador do sistema)
    try {
      window.open(urlToOpen, "_blank");
    } catch {}
    // 3. Fallback navegação direta
    try {
      window.location.href = urlToOpen;
    } catch {}
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    safeSessionStorage.setItem("playinfinity_dismiss_update_banner", "true");
  };

  if (!updateAvailable || isDismissed) return null;

  return (
    <>
      {/* BANNER FIXADO NO TOPO */}
      <div className="fixed top-0 left-0 right-0 z-[120] bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 text-white px-3 sm:px-4 py-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] shadow-2xl flex items-center justify-between gap-2.5 text-xs sm:text-sm animate-in slide-in-from-top-full duration-300">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-black/25 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
          </div>
          <p className="truncate font-medium text-xs sm:text-sm">
            <strong className="font-bold text-amber-100">Atualização ({updateAvailable.latestVersionName})</strong>:
            <span className="hidden md:inline ml-1 text-white/90">Instale a versão direta sem esperar a Play Store.</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 rounded-full bg-white text-orange-700 hover:bg-neutral-100 font-black text-[11px] sm:text-xs uppercase tracking-wider flex items-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer min-h-[36px]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
            title="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* MODAL DE ATUALIZAÇÃO E DOWNLOAD INFALÍVEL */}
      {showModal && (
        <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] relative flex flex-col gap-4 text-white">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-500 shrink-0">
                <Download className="w-6 h-6 animate-bounce" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-white tracking-tight">
                  Atualização do Play Infinity
                </h3>
                <p className="text-xs text-orange-400 font-semibold">
                  Versão {updateAvailable.latestVersionName} (Build {updateAvailable.latestVersionCode})
                </p>
              </div>
            </div>

            {/* FEEDBACK DE LINK COPIADO */}
            {copied ? (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-4 rounded-xl text-center space-y-1.5 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-center gap-1.5 font-bold text-sm text-emerald-200">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>Link Copiado com Sucesso!</span>
                </div>
                <p className="text-xs text-emerald-100/90 leading-relaxed">
                  Agora saia do app, abra o <strong>Google Chrome</strong> (ou seu navegador) no celular e <strong>cole na barra de pesquisa</strong> para iniciar o download do instalador na hora.
                </p>
              </div>
            ) : (
              <button
                onClick={handleCopyLink}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-sm text-center flex items-center justify-center gap-2 shadow-xl active:scale-98 transition-all cursor-pointer min-h-[48px]"
              >
                <Copy className="w-4 h-4" />
                <span>Copiar Link de Download (Recomendado)</span>
              </button>
            )}

            {/* OPÇÕES ADICIONAIS DE ABERTURA DIRETA */}
            <div className="space-y-2 pt-1 border-t border-white/5">
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Ou tente abrir diretamente no navegador:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => openExternalDownload(EXTERNAL_APK_URL)}
                  className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs text-center flex items-center justify-center gap-1.5 border border-white/10 transition-colors cursor-pointer min-h-[42px]"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-orange-400" />
                  <span>Abrir pelo Navegador</span>
                </button>
                <button
                  onClick={() => openExternalDownload(ANDROID_INTENT_URL)}
                  className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 font-semibold text-xs text-center flex items-center justify-center gap-1.5 border border-white/5 transition-colors cursor-pointer min-h-[42px]"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Intent do Android</span>
                </button>
              </div>
            </div>

            {/* LINK VISÍVEL COM SELEÇÃO FÁCIL */}
            <div className="bg-black/50 border border-white/5 rounded-xl p-2.5 flex items-center justify-between text-xs font-mono text-neutral-300 select-all gap-2">
              <span className="truncate select-all text-neutral-300">{DIRECT_APK_URL}</span>
              <button
                onClick={handleCopyLink}
                className="text-orange-400 hover:text-orange-300 font-sans font-bold text-xs shrink-0 px-2 py-1 bg-white/5 rounded-lg active:scale-95 transition-all"
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="text-center text-xs text-neutral-500 hover:text-neutral-400 pt-1 transition-colors cursor-pointer"
            >
              Fechar esta janela
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default AppUpdateBanner;
