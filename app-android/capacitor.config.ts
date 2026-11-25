import type { CapacitorConfig } from '@capacitor/cli';

// One Android project, two editions (see README-IT.md section 3). scripts/android.mjs sets
// MUSIK_EDITION ("personal" by default, or "play") and builds the matching web app first.
const play = process.env.MUSIK_EDITION === 'play';

const config: CapacitorConfig = {
  appId: play ? 'com.mitra247.musicplayer' : 'com.mitra247.musictools',
  appName: play ? 'Music Player' : 'Musik Tools',
  webDir: play ? '../out/app-play' : '../out/app',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
