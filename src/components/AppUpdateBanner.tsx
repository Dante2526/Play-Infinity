import React, { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { X, Sparkles, ExternalLink, CheckCircle2, Copy, Store } from "lucide-react";
import { StatusBar } from "../utils/statusBar";
import { safeSessionStorage } from "../utils/safeStorage";

interface AppVersionInfo {
  minNativeVersionCode: number;
  latestVersionCode: number;
  latestVersionName?: string;
  playStoreUrl?: string;
  changelog?: string;
  source?: "play_store" | "test";
  nativeInAppSupported?: boolean;
  downloaded?: boolean;
}

const PLAY_STORE_MARKET_URL = "market://details?id=com.playinfinity.app";
const PLAY_STORE_WEB_URL = "https://play.google.com/store/apps/details?id=com.playinfinity.app";

export function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState<AppVersionInfo | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isUpdatingInApp, setIsUpdatingInApp] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    return safeSessionStorage.getItem("playinfinity_dismiss_update_banner") === "true";
  });

  useEffect(() => {
    const isTestMode =
      typeof window !== "undefined" && window.location.search.includes("test_update=1");
    if (!Capacitor.isNativePlatform() && !isTestMode) return;

    let isMounted = true;

    async function checkVersion() {
      try {
        if (StatusBar.hideActionBar) {
          StatusBar.hideActionBar().catch(() => {});
        }

        // Consulta exclusivamente a Google Play Store oficial do aparelho (Play In-App Updates API).
        // Se a Play Store não reportar explicitamente que há um versionCode maior publicado e disponível
        // para este dispositivo, nenhum card/banner é exibido (evitando falso positivo quando a versão
        // instalada já é a última disponível na Play Store).
        if (Capacitor.isNativePlatform() && StatusBar.checkPlayStoreUpdate) {
          const playInfo = await StatusBar.checkPlayStoreUpdate().catch(() => null);
          const hasConfirmedStoreUpdate = Boolean(
            playInfo &&
              playInfo.supported &&
              playInfo.updateAvailable &&
              ((playInfo.installedVersionCode > 0 &&
                playInfo.availableVersionCode > playInfo.installedVersionCode) ||
                playInfo.downloaded)
          );

          if (hasConfirmedStoreUpdate && playInfo) {
            let serverMeta: Partial<AppVersionInfo> | null = null;
            try {
              const res = await fetch("/api/app-version", { cache: "no-store" });
              if (res.ok) {
                serverMeta = await res.json();
              }
            } catch {}

            const availableCode = playInfo.availableVersionCode || 0;
            const matchedVersionName =
              serverMeta &&
              availableCode > 0 &&
              serverMeta.latestVersionCode === availableCode
                ? serverMeta.latestVersionName
                : undefined;

            if (isMounted) {
              setUpdateAvailable({
                minNativeVersionCode: serverMeta?.minNativeVersionCode || 0,
                latestVersionCode: availableCode,
                latestVersionName: matchedVersionName,
                playStoreUrl: serverMeta?.playStoreUrl || PLAY_STORE_WEB_URL,
                changelog: serverMeta?.changelog,
                source: "play_store",
                nativeInAppSupported: Boolean(
                  playInfo.immediateAllowed || playInfo.flexibleAllowed || playInfo.downloaded
                ),
                downloaded: Boolean(playInfo.downloaded),
              });
            }
            return;
          }
        }

        // Modo de teste manual explícito via URL (?test_update=1)
        if (isTestMode && isMounted) {
          setUpdateAvailable({
            minNativeVersionCode: 0,
            latestVersionCode: 999,
            latestVersionName: "Teste",
            playStoreUrl: PLAY_STORE_WEB_URL,
            source: "test",
            nativeInAppSupported: false,
          });
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

  const playStoreUrl = updateAvailable?.playStoreUrl || PLAY_STORE_WEB_URL;

  const handleCopyLink = () => {
    const url = playStoreUrl;
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

  const openPlayStore = (e?: React.MouseEvent, forceWeb = false) => {
    if (e) {
      e.preventDefault();
    }
    if (Capacitor.isNativePlatform() && StatusBar.openExternalUrl) {
      const targetUrl = forceWeb ? playStoreUrl : PLAY_STORE_MARKET_URL;
      StatusBar.openExternalUrl({ url: targetUrl }).catch(() => {
        if (!forceWeb) {
          StatusBar.openExternalUrl?.({ url: playStoreUrl }).catch(() => {
            try {
              window.open(playStoreUrl, "_blank");
            } catch {}
          });
          return;
        }
        try {
          window.open(playStoreUrl, "_blank");
        } catch {}
      });
      return;
    }
    try {
      const opened = window.open(playStoreUrl, "_blank");
      if (opened) return;
    } catch {}
    try {
      window.location.href = playStoreUrl;
    } catch {}
  };

  const handlePrimaryUpdateClick = async (e?: React.MouseEvent, openModalOnFallback = false) => {
    if (e) {
      e.preventDefault();
    }

    if (
      Capacitor.isNativePlatform() &&
      updateAvailable?.nativeInAppSupported &&
      StatusBar.startPlayStoreUpdate &&
      !isUpdatingInApp
    ) {
      setIsUpdatingInApp(true);
      try {
        const result = await StatusBar.startPlayStoreUpdate({ mode: "immediate" });
        if (result && result.started && !result.fallbackRequired) {
          return;
        }
      } catch (err) {
        console.warn("[AppUpdateBanner] Falha no fluxo nativo da Play Store, abrindo loja:", err);
      } finally {
        setIsUpdatingInApp(false);
      }
    }

    openPlayStore();
    if (openModalOnFallback) {
      setShowModal(true);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    safeSessionStorage.setItem("playinfinity_dismiss_update_banner", "true");
  };

  if (!updateAvailable || isDismissed) return null;

  const versionLabel = updateAvailable.latestVersionName
    ? `${updateAvailable.latestVersionName}`
    : updateAvailable.latestVersionCode > 0
      ? `Build ${updateAvailable.latestVersionCode}`
      : "Nova versão";

  const versionSubLabel = updateAvailable.latestVersionName
    ? `Versão ${updateAvailable.latestVersionName} (Build ${updateAvailable.latestVersionCode})`
    : updateAvailable.latestVersionCode > 0
      ? `Build ${updateAvailable.latestVersionCode} disponível na loja`
      : "Versão mais recente disponível na loja";

  return (
    <>
      {/* BANNER FIXADO NO TOPO */}
      <div className="fixed top-0 left-0 right-0 z-[120] bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 text-white px-3 sm:px-4 py-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] shadow-2xl flex items-center justify-between gap-2.5 text-xs sm:text-sm animate-in slide-in-from-top-full duration-300">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-black/25 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-emerald-200 animate-pulse" />
          </div>
          <p className="truncate font-medium text-xs sm:text-sm">
            <strong className="font-bold text-emerald-100">
              Nova atualização na Play Store ({versionLabel})
            </strong>
            <span className="hidden md:inline ml-1 text-white/90">
              — Atualize pela Google Play Store para receber as novidades.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={playStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              void handlePrimaryUpdateClick(e, true);
            }}
            className="px-3 py-1.5 rounded-full bg-white text-emerald-700 hover:bg-neutral-100 font-black text-[11px] sm:text-xs uppercase tracking-wider flex items-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer no-underline min-h-[36px]"
          >
            <Store className="w-3.5 h-3.5" />
            <span>{isUpdatingInApp ? "Abrindo..." : updateAvailable.downloaded ? "Instalar" : "Atualizar"}</span>
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

      {/* MODAL DE ATUALIZAÇÃO VIA GOOGLE PLAY STORE */}
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
              <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Store className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-white tracking-tight">
                  Atualização na Google Play Store
                </h3>
                <p className="text-xs text-emerald-400 font-semibold">
                  {versionSubLabel}
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Uma nova versão do Play Infinity já saiu na Google Play Store. Atualize pelo aplicativo oficial para ter todas as correções e melhorias.
            </p>

            {updateAvailable.changelog && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-neutral-300 leading-relaxed">
                <span className="font-semibold text-white block mb-1">Novidades:</span>
                {updateAvailable.changelog}
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {/* BOTÃO PRINCIPAL: INICIA FLUXO NATIVO OU ABRE A GOOGLE PLAY STORE */}
              <a
                href={playStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  void handlePrimaryUpdateClick(e, false);
                }}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm text-center flex items-center justify-center gap-2 shadow-xl active:scale-98 transition-all cursor-pointer no-underline min-h-[48px]"
              >
                <Store className="w-4 h-4" />
                <span>
                  {updateAvailable.nativeInAppSupported
                    ? "Atualizar pela Google Play Store"
                    : "Abrir na Google Play Store"}
                </span>
              </a>

              {/* BOTÃO SECUNDÁRIO: ABRE A PÁGINA DA PLAY STORE NO NAVEGADOR */}
              <a
                href={playStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => openPlayStore(e, true)}
                className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-neutral-200 hover:text-white font-bold text-xs text-center flex items-center justify-center gap-1.5 border border-white/10 transition-colors cursor-pointer no-underline min-h-[42px]"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                <span>Abrir Play Store no Navegador</span>
              </a>
            </div>

            {/* COPIAR LINK DA GOOGLE PLAY STORE */}
            <div className="pt-2 border-t border-white/5 space-y-2">
              {copied ? (
                <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-2.5 rounded-xl text-center text-xs flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Link da Google Play Store copiado!</span>
                </div>
              ) : (
                <button
                  onClick={handleCopyLink}
                  className="w-full py-2 px-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 font-medium text-[11px] flex items-center justify-center gap-1.5 border border-white/5 transition-colors cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Ou copie o link da Google Play Store</span>
                </button>
              )}
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="text-center text-xs text-neutral-500 hover:text-neutral-400 transition-colors cursor-pointer"
            >
              Agora não
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default AppUpdateBanner;
