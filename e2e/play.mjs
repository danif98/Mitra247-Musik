// E2E for the Google Play edition: no personal tab or settings, app name "Music Player", the play
// change log. Requires `npm run build:play`. Usage: node e2e/play.mjs
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out', 'app-play');
if (!existsSync(path.join(outDir, 'index.html'))) {
  console.error('out/app-play missing: run `npm run build:play` first.');
  process.exit(2);
}
const playLog = readFileSync(path.join(root, 'CHANGELOG-PLAY.md'), 'utf8');
const versionsInFile = [...playLog.matchAll(/^## (\S+)/gm)].map((m) => m[1]);

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

const { server, port } = await startStaticServer(outDir, 0);
const base = `http://127.0.0.1:${port}`;
let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ channel: 'chrome' });
}
const page = await (await browser.newContext({ viewport: { width: 412, height: 915 } })).newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) {
    errors.push(m.text());
  }
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

try {
  await page.goto(`${base}/?test`, { waitUntil: 'load' });
  await page.waitForSelector('nav button');
  const tabs = await page.locator('nav button').allInnerTexts();
  check(
    'four tabs: Putar, Library, Cari, Setelan',
    tabs.join(',') === 'Putar,Library,Cari,Setelan',
    tabs.join(','),
  );
  check('title is Music Player', (await page.title()) === 'Music Player', await page.title());
  const manifest = await (await page.request.get(`${base}/manifest.webmanifest`)).json();
  check('manifest name is Music Player', manifest.name === 'Music Player', manifest.name);
  check('manifest has no share target', manifest.share_target === undefined);

  await page.click('#tab-settings');
  await page.waitForSelector('#about-version');
  check(
    'no converter or server panel in Setelan',
    (await page.locator('#srv-url, #yt-update, #save-folder-pick').count()) === 0,
  );
  const app = (await page.locator('.about dd').first().innerText()).trim();
  check('About shows the app name Music Player', app === 'Music Player', app);
  await page.click('#changelog-toggle');
  await page.waitForSelector('#changelog details');
  const shown = await page
    .locator('#changelog details')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-version')));
  check(
    'the change log is the Play one',
    shown.join(',') === versionsInFile.join(','),
    `${shown.join(',')} vs ${versionsInFile.join(',')}`,
  );
  const text = (await page.locator('#changelog').innerText()).toLowerCase();
  check(
    'the change log does not mention the personal features',
    !/youtube|yt-dlp|mp3 hasil/.test(text),
  );
  check('no console errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}
console.log(failed === 0 ? '\nAll Play checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
