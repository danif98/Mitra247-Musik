import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Edition of this build (MUSIK_EDITION): "personal" (default) or "play" (Google Play). The play
 * build swaps the personal-only code for stubs and uses its own change log, and writes to
 * out/app-play, so the personal build in out/app is never touched.
 */
const edition = process.env.MUSIK_EDITION === 'play' ? 'play' : 'personal';
const isPlay = edition === 'play';
const appName = isPlay ? 'Music Player' : 'Musik Tools';

/** Version from the root package.json (also used for the Android versionName). */
function appVersion(): string {
  const pkg = JSON.parse(readFileSync(path.resolve(here, '../package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

/** Build label shown in the lab page so stale cached builds are easy to spot. */
function buildLabel(): string {
  const git = (args: string[]) => {
    const r = spawnSync('git', args, { cwd: here, encoding: 'utf8', shell: false });
    return r.status === 0 ? r.stdout.trim() : '';
  };
  const commit = git(['rev-parse', '--short', 'HEAD']) || 'nogit';
  const dirty = git(['status', '--porcelain']) ? '-dirty' : '';
  return `${commit}${dirty} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z`;
}

/** Page titles carry the app name of the edition. */
function editionTitles(): Plugin {
  return {
    name: 'musik-edition-titles',
    transformIndexHtml: (html) => html.replace(/Musik Tools/g, appName),
  };
}

/** vite-plugin-pwa injects a root-relative manifest href; fix it for pages in sub folders (lab/). */
function fixManifestHref(): Plugin {
  return {
    name: 'musik-fix-manifest-href',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const depth = ctx.path.split('/').filter(Boolean).length - 1;
        const prefix = depth > 0 ? '../'.repeat(depth) : './';
        return html.replace(
          /href="\.\/manifest\.webmanifest"/,
          `href="${prefix}manifest.webmanifest"`,
        );
      },
    },
  };
}

export default defineConfig({
  root: here,
  // Relative base: the PWA can be hosted under any path on the server.
  base: './',
  resolve: {
    alias: [
      {
        find: /^@personal$/,
        replacement: path.resolve(
          here,
          isPlay ? 'src/personal-stub/index.ts' : 'src/personal/index.ts',
        ),
      },
      {
        find: /^@changelog/,
        replacement: path.resolve(here, isPlay ? '../CHANGELOG-PLAY.md' : '../CHANGELOG.md'),
      },
    ],
  },
  define: {
    __EDITION__: JSON.stringify(edition),
    __AUTH_URL__: JSON.stringify(
      process.env['MUSIK_AUTH_URL'] ?? 'https://mitra247.com/musik-auth/auth.php',
    ),
    __BUILD__: JSON.stringify(buildLabel()),
    __APP_VERSION__: JSON.stringify(appVersion()),
    __BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: appName,
        short_name: isPlay ? 'Music Player' : 'Musik',
        description: 'Player, speed changer dan transpose untuk latihan musik.',
        lang: 'id',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        // Personal edition: the Android share sheet can send a link to the app.
        ...(isPlay
          ? {}
          : {
              share_target: {
                action: './',
                method: 'GET' as const,
                params: { title: 'title', text: 'text', url: 'url' },
              },
            }),
        background_color: '#0f1115',
        theme_color: '#0f1115',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache everything including the Rubber Band WASM and the worklet bundle.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,webmanifest}'],
        navigateFallback: null,
        // Pages are precached once; query strings (?test, Share Target params) must still match.
        ignoreURLParametersMatching: [/.*/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
    fixManifestHref(),
    editionTitles(),
  ],
  build: {
    outDir: path.resolve(here, isPlay ? '../out/app-play' : '../out/app'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: path.resolve(here, 'index.html'),
        lab: path.resolve(here, 'lab/index.html'),
      },
    },
  },
  worker: { format: 'es' },
  server: { port: 5173, fs: { allow: [path.resolve(here, '..')] } },
  preview: { port: 4173 },
});
