// Draws the launcher icons of the Android app from the logo of the web app (a cyan disc with three
// equalizer bars on the dark app colour) and writes the PNGs of every density:
//   mipmap-*/ic_launcher_foreground.png  adaptive icon foreground (transparent, art inside the safe zone)
//   mipmap-*/ic_launcher.png             old square icon (Android 7.x)
//   mipmap-*/ic_launcher_round.png       old round icon (Android 7.x)
// The adaptive background colour is values/ic_launcher_background.xml.
// Usage: node scripts/android-icons.mjs   (needs Chrome or Chromium, like the e2e tests)
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { root } from './lib.mjs';

const BG = '#0f1115';
const DISC = '#4cc2ff';
const res = path.join(root, 'app-android', 'android', 'app', 'src', 'main', 'res');

/** The logo in the 512 x 512 space of app-pwa/public/icon.svg, without its background. */
const art = `<circle cx="256" cy="256" r="164" fill="${DISC}"/>
<g fill="${BG}"><rect x="176" y="196" width="40" height="120" rx="8"/><rect x="236" y="154" width="40" height="204" rx="8"/><rect x="296" y="182" width="40" height="148" rx="8"/></g>`;

/** Adaptive foreground: 108 dp canvas, the disc is 62 dp wide (the safe zone is 66 dp). */
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
<g transform="translate(54 54) scale(${31 / 164}) translate(-256 -256)">${art}</g></svg>`;

/** Old square icon: rounded dark square with the disc. */
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="104" fill="${BG}"/>${art}</svg>`;

/** Old round icon: dark circle with the disc. */
const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<circle cx="256" cy="256" r="256" fill="${BG}"/>${art}</svg>`;

// density -> pixels for 1 dp
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ channel: 'chrome' });
}
const page = await browser.newPage();

async function draw(svg, px) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${px}px;height:${px}px}</style>${svg}`,
  );
  return page.screenshot({ omitBackground: true, type: 'png' });
}

for (const [name, scale] of Object.entries(DENSITY)) {
  const dir = path.join(res, `mipmap-${name}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'ic_launcher_foreground.png'),
    await draw(foreground, Math.round(108 * scale)),
  );
  writeFileSync(path.join(dir, 'ic_launcher.png'), await draw(square, Math.round(48 * scale)));
  writeFileSync(path.join(dir, 'ic_launcher_round.png'), await draw(round, Math.round(48 * scale)));
  console.log(
    `mipmap-${name}: ${Math.round(108 * scale)} px foreground, ${Math.round(48 * scale)} px icons`,
  );
}
await browser.close();
