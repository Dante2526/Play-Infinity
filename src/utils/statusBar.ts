import { registerPlugin } from "@capacitor/core";

export interface StatusBarPluginInterface {
  hide(): Promise<void>;
  show(): Promise<void>;
  setStyle?(options: any): Promise<void>;
  setBackgroundColor?(options: any): Promise<void>;
  getInfo?(): Promise<any>;
}

export const StatusBar = registerPlugin<StatusBarPluginInterface>("StatusBar", {
  web: () => ({
    hide: async () => {},
    show: async () => {},
    setStyle: async () => {},
    setBackgroundColor: async () => {},
    getInfo: async () => ({ visible: true, style: "DARK", color: "#000000", overlays: true }),
  }),
});
