import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.clubsynq.app',
  appName: 'ClubSynq',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#070b14',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#070b14',
      showSpinner: false,
    },
  },
};

export default config;
