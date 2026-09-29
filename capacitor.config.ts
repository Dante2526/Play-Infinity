import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.playinfinity.app',
  appName: 'Play Infinity',
  webDir: 'dist',
  server: {
    url: 'https://play-infinity.stream',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#000000",
      showSpinner: true,
      splashFullScreen: true,
      splashImmersive: true,
      spinnerColor: "#E50914"
    }
  }
};

export default config;
