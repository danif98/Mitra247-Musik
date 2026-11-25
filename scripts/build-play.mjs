// Build only the web app of the Google Play edition into out/app-play (no server, no Android).
//   npm run build:play
import path from 'node:path';
import { root, runNode } from './lib.mjs';

process.env.MUSIK_EDITION = 'play';
runNode(path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), ['build'], {
  cwd: path.join(root, 'app-pwa'),
});
