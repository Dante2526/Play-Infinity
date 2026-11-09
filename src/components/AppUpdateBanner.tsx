import React, { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, X, Sparkles } from "lucide-react";
import { StatusBar } from "../utils/statusBar";
import { safeSessionStorage } from "../utils/safeStorage";

interface AppVersionInfo {
  minNativeVersionCode: number;
  latestVersionCode: number;
  latestVersionName: string;
  apkUrl: string;
  changelog?: string;
}

export function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState<AppVersionInfo | null>(null);
  const [isDismissed, setIsDismissed] = useState(() => {
    return safeSessionStorage.getItem("playinfinity_dismiss_update_banner") === "true";
  });

  useEffect(() => {
    // Apenas no App Android Nativo (Capacitor)
    if (!Capacitor.isNativePlatform()) return;

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
        if (installedVersionCode < data.latestVersionCode) {
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

  const handleUpdate = () => {
    if (!updateAvailable) return;
    try {
      if (StatusBar.openExternalUrl) {
        StatusBar.openExternalUrl({ url: updateAvailable.apkUrl }).catch(() => {
          window.open(updateAvailable.apkUrl, "_blank");
        });
      } else {
        window.open(updateAvailable.apkUrl, "_blank");
      }
    } catch {
      window.open(updateAvailable.apkUrl, "_blank");
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    safeSessionStorage.setItem("playinfinity_dismiss_update_banner", "true");
  };

  if (!updateAvailable || isDismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[120] bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 text-white px-4 py-2.5 shadow-2xl flex items-center justify-between gap-3 text-xs sm:text-sm animate-in slide-in-from-top-full duration-300">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-black/25 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
        </div>
        <p className="truncate font-medium">
          <strong className="font-bold text-amber-100">Atualização do App ({updateAvailable.latestVersionName})</strong>:
          <span className="hidden sm:inline ml-1 text-white/90">Instale a versão direta sem esperar a Play Store.</span>
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleUpdate}
          className="px-3.5 py-1.5 rounded-full bg-white text-orange-700 hover:bg-neutral-100 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Atualizar Agora</span>
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Fechar aviso"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default AppUpdateBanner;
