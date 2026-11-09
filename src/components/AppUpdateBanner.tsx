import React, { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, X, Sparkles, ExternalLink, CheckCircle2 } from "lucide-react";
import { StatusBar } from "../utils/statusBar";
import { safeSessionStorage } from "../utils/safeStorage";

interface AppVersionInfo {
  minNativeVersionCode: number;
  latestVersionCode: number;
  latestVersionName: string;
  apkUrl: string;
  changelog?: string;
}

const ANDROID_INTENT_APK_URL =
  "intent://play-infinity.stream/app.apk#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end";

export function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState<AppVersionInfo | null>(null);
  const [showModal, setShowModal] = useState(false);
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
        // Tenta ocultar ActionBar nativa no boot
        if (StatusBar.hideActionBar) {
          StatusBar.hideActionBar().catch(() => {});
        }

        // Obtém informações da versão instalada no aparelho
        let installedVersionCode = 0;
        if (StatusBar.getInfo) {
          const info = await StatusBar.getInfo().catch(() => null);
          if (info && typeof info.versionCode === "number") {
            installedVersionCode = info.versionCode;
          }
        }

        // Busca metadados da versão mais recente da VPS
        const res = await fetch("/api/app-version", { cache: "no-store" });
        if (!res.ok) return;
        const data: AppVersionInfo = await res.json();

        // Se o APK instalado for mais antigo que o mínimo recomendado ou que a última versão
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

  const triggerDownload = (e?: React.MouseEvent) => {
    if (!updateAvailable) return;
    const apkUrl = updateAvailable.apkUrl || "https://play-infinity.stream/app.apk";

    // Abre o modal de auxílio para o usuário ter feedback visual imediato
    setShowModal(true);

    // 1. Tenta plugin nativo (se suportado na versão instalada)
    if (StatusBar.openExternalUrl) {
      StatusBar.openExternalUrl({ url: apkUrl }).catch(() => {});
    }

    // 2. Dispara Intent oficial do Android para o navegador padrão
    try {
      window.location.href = ANDROID_INTENT_APK_URL;
    } catch {}

    // 3. Fallback Capacitor target _system
    try {
      window.open(apkUrl, "_system");
    } catch {}

    // 4. Fallback anchor dinâmico
    try {
      const a = document.createElement("a");
      a.href = apkUrl;
      a.target = "_system";
      a.download = "PlayInfinity.apk";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
          <a
            href={ANDROID_INTENT_APK_URL}
            target="_system"
            rel="noopener noreferrer"
            onClick={triggerDownload}
            className="px-3 py-1.5 rounded-full bg-white text-orange-700 hover:bg-neutral-100 font-black text-[11px] sm:text-xs uppercase tracking-wider flex items-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer no-underline min-h-[36px]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </a>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
            title="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO & AJUDA DE DOWNLOAD */}
      {showModal && (
        <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] relative flex flex-col gap-4 text-white">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-500 shrink-0">
                <Download className="w-6 h-6 animate-bounce" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-white tracking-tight">
                  Atualização do Aplicativo
                </h3>
                <p className="text-xs text-orange-400 font-semibold">
                  Versão {updateAvailable.latestVersionName} (Build {updateAvailable.latestVersionCode})
                </p>
              </div>
            </div>

            <div className="bg-neutral-900/80 border border-white/5 rounded-xl p-3.5 text-xs text-neutral-300 space-y-2">
              <p className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>O download do arquivo <strong>PlayInfinity.apk</strong> foi enviado para o seu navegador.</span>
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Ao terminar o download, puxe a barra de notificações do Android e toque no arquivo para instalar.</span>
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <a
                href={ANDROID_INTENT_APK_URL}
                target="_system"
                rel="noopener noreferrer"
                onClick={() => {
                  try { window.location.href = ANDROID_INTENT_APK_URL; } catch {}
                }}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-sm text-center flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all cursor-pointer no-underline"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir no Navegador (Chrome)</span>
              </a>

              <a
                href={updateAvailable.apkUrl || "https://play-infinity.stream/app.apk"}
                target="_system"
                download="PlayInfinity.apk"
                rel="noopener noreferrer"
                onClick={() => {
                  try { window.open(updateAvailable.apkUrl || "https://play-infinity.stream/app.apk", "_system"); } catch {}
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white font-medium text-xs text-center flex items-center justify-center gap-2 border border-white/5 transition-colors cursor-pointer no-underline"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Link Direto Alternativo</span>
              </a>
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
