import { registerPlugin } from "@capacitor/core";

export interface StatusBarInfo {
  visible: boolean;
  style: string;
  color: string;
  overlays: boolean;
  versionCode?: number;
  versionName?: string;
}

export interface PlayStoreUpdateInfo {
  supported: boolean;
  updateAvailable: boolean;
  availableVersionCode: number;
  installedVersionCode: number;
  installedVersionName?: string;
  immediateAllowed?: boolean;
  flexibleAllowed?: boolean;
  downloaded?: boolean;
  updateAvailability?: number;
  installStatus?: number;
  error?: string;
}

export interface PlayStoreUpdateStartResult {
  started: boolean;
  completed?: boolean;
  accepted?: boolean;
  resultCode?: number;
  fallbackRequired?: boolean;
  error?: string;
}

export interface StatusBarPluginInterface {
  hide(): Promise<void>;
  show(): Promise<void>;
  setStyle?(options: any): Promise<void>;
  setBackgroundColor?(options: any): Promise<void>;
  getInfo?(): Promise<StatusBarInfo>;
  hideActionBar?(): Promise<void>;
  setWindowPadding?(options: { top?: number; bottom?: number; left?: number; right?: number; reset?: boolean }): Promise<void>;
  clearWebViewCache?(options?: { reload?: boolean }): Promise<void>;
  openExternalUrl?(options: { url: string }): Promise<void>;
  checkPlayStoreUpdate?(): Promise<PlayStoreUpdateInfo>;
  startPlayStoreUpdate?(options?: { mode?: "immediate" | "flexible" }): Promise<PlayStoreUpdateStartResult>;
}

export const StatusBar = registerPlugin<StatusBarPluginInterface>("StatusBar", {
  web: () => ({
    hide: async () => {},
    show: async () => {},
    setStyle: async () => {},
    setBackgroundColor: async () => {},
    getInfo: async () => ({ visible: true, style: "DARK", color: "#000000", overlays: true, versionCode: 123, versionName: "1.4.91" }),
    hideActionBar: async () => {},
    setWindowPadding: async () => {},
    clearWebViewCache: async () => {},
    openExternalUrl: async ({ url }) => {
      window.open(url, "_blank");
    },
    checkPlayStoreUpdate: async () => ({
      supported: false,
      updateAvailable: false,
      availableVersionCode: 0,
      installedVersionCode: 123,
      installedVersionName: "1.4.91",
    }),
    startPlayStoreUpdate: async () => ({
      started: false,
      fallbackRequired: true,
    }),
  }),
});
