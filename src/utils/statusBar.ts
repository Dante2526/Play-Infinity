import { registerPlugin } from "@capacitor/core";

export interface StatusBarInfo {
  visible: boolean;
  style: string;
  color: string;
  overlays: boolean;
  versionCode?: number;
  versionName?: string;
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
}

export const StatusBar = registerPlugin<StatusBarPluginInterface>("StatusBar", {
  web: () => ({
    hide: async () => {},
    show: async () => {},
    setStyle: async () => {},
    setBackgroundColor: async () => {},
    getInfo: async () => ({ visible: true, style: "DARK", color: "#000000", overlays: true, versionCode: 99, versionName: "1.4.67" }),
    hideActionBar: async () => {},
    setWindowPadding: async () => {},
    clearWebViewCache: async () => {},
    openExternalUrl: async ({ url }) => {
      window.open(url, "_blank");
    },
  }),
});
