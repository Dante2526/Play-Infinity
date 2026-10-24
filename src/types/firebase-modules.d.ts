declare module "firebase/app" {
  export function initializeApp(options?: any, name?: string): any;
  export function getApp(name?: string): any;
  export function getApps(): any[];
  export function deleteApp(app: any): Promise<void>;
  export interface FirebaseApp {
    name: string;
    options: any;
  }
}

declare module "firebase/messaging" {
  export function getMessaging(app?: any): any;
  export function getToken(messaging: any, options?: any): Promise<string>;
  export function isSupported(): Promise<boolean>;
  export function onMessage(messaging: any, nextOrObserver: any): () => void;
}
