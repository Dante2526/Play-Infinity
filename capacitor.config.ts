import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.playinfinity.app',
  appName: 'Play Infinity',
  webDir: 'dist',
  server: {
    url: 'https://play-infinity.stream',
    cleartext: true
  }
};

export default config;
