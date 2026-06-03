import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vpsmanager.app',
  appName: 'VPS Manager',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    Preferences: { group: 'VPSManager' },
  },
};

export default config;
