// E2E for M2 (YouTube to MP3): the real built server (out/server) with a fake yt-dlp, and the real
// built PWA (out/app) in Chromium on a different origin (so CORS is exercised for real).
// Requires `npm run build`. Usage: node e2e/m2.mjs
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'out', 'app');
const serverJs = path.join(root, 'out', 'server', 'app.js');
const fakeYtdlp = path.join(root, 'server', 'test', 'fake-ytdlp.cjs');
const artifacts = path.join(root, 'e2e', 'artifacts');
mkdirSync(artifacts, { recursive: true });
if (!existsSync(serverJs) || !existsSync(path.join(appDir, 'index.html'))) {
  console.error('out/ missing: run `npm run build` first.');
  process.exit(2);
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

// 1. Servers: PWA static on one port, API on another.
const { server: staticServer, port: appPort } = await startStaticServer(appDir, 0);
const appOrigin = `http://127.0.0.1:${appPort}`;
const require = createRequire(import.meta.url);
const { createApp } = require(path.join(root, 'out', 'server', 'server.js'));
const { loadConfig } = require(path.join(root, 'out', 'server', 'config.js'));
const TOKEN = 'e2e-token-'.repeat(5);
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'musik-e2e-'));
const config = loadConfig({
  MUSIK_TOKEN: TOKEN,
  YTDLP_PATH: process.execPath,
  DATA_DIR: dataDir,
  ALLOWED_ORIGINS: appOrigin,
  TRUST_PROXY: 'false',
  MAX_ACTIVE: '1',
  MAX_QUEUE: '2',
});
const api = createApp(config, undefined, { ytdlpPrefixArgs: [fakeYtdlp] });
await new Promise((r) => api.server.listen(0, '127.0.0.1', r));
const apiOrigin = `http://127.0.0.1:${api.server.address().port}`;
console.log('PWA', appOrigin, 'API', apiOrigin);

let browser;
try {
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
} catch {
  browser = await chromium.launch({
    channel: 'chrome',
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
}
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => {
  // The browser logs failed HTTP statuses (401/400/...) as console errors; those are expected here.
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
let corsHeader = null;
page.on('response', (r) => {
  if (r.url().endsWith('/api/jobs') && r.request().method() === 'POST') {
    corsHeader = r.headers()['access-control-allow-origin'] ?? null;
  }
});

const ready = (p = page) =>
  p.waitForFunction(() => window.__musik?.player?.engineState === 'ready', null, {
    timeout: 20000,
  });
const tab = (name) => page.click(`#tab-${name}`);
const ytUrl = (id) => `https://youtu.be/${id}`;

async function runJob(url) {
  await page.fill('#yt-url', url);
  await page.click('#yt-save');
  await page.waitForFunction(() => ['done', 'error'].includes(window.__musik.flow.phase), null, {
    timeout: 30000,
  });
  return page.evaluate(() => ({
    phase: window.__musik.flow.phase,
    error: window.__musik.flow.error,
    title: window.__musik.flow.title,
  }));
}

try {
  await page.goto(`${appOrigin}/?test`, { waitUntil: 'load' });
  await ready();
  await tab('youtube');
  const need = await page.textContent('#need-server');
  check(
    'without server settings the YouTube screen asks to configure the server',
    /Atur URL server/.test(need ?? ''),
  );
  check('save button disabled while the URL field is empty', await page.isDisabled('#yt-save'));
  await page.fill('#yt-url', ytUrl('OKAYxxxxxxx'));
  await page.click('#yt-save');
  await page.waitForSelector('#yt-error');
  check(
    'starting without server settings gives a clear error',
    /Atur URL server/.test((await page.textContent('#yt-error')) ?? ''),
  );

  // 2. Settings: connection test
  await tab('settings');
  await page.fill('#srv-url', 'not a url');
  await page.click('#srv-save');
  check(
    'settings: invalid server URL is rejected',
    /diawali http/.test((await page.textContent('#srv-msg')) ?? ''),
  );

  await page.fill('#srv-url', 'http://127.0.0.1:9'); // nothing listens here
  await page.fill('#srv-token', TOKEN);
  await page.click('#srv-test');
  await page.waitForFunction(
    () => /Tidak bisa terhubung/.test(document.getElementById('srv-msg')?.textContent ?? ''),
    null,
    { timeout: 15000 },
  );
  check('settings: unreachable server -> clear network message', true);

  await page.fill('#srv-url', apiOrigin + '/');
  await page.fill('#srv-token', 'wrong-token-wrong-token-wrong-token-1234');
  await page.click('#srv-test');
  await page.waitForFunction(
    () => /Token salah/.test(document.getElementById('srv-msg')?.textContent ?? ''),
    null,
    { timeout: 15000 },
  );
  check('settings: wrong token -> "Token salah"', true);

  await page.fill('#srv-token', TOKEN);
  await page.click('#srv-test');
  await page.waitForFunction(
    () => /Terhubung/.test(document.getElementById('srv-msg')?.textContent ?? ''),
    null,
    { timeout: 15000 },
  );
  const info = await page.textContent('#srv-info');
  check(
    'settings: correct token connects and shows server + yt-dlp version',
    /Versi server/.test(info ?? '') && /yt-dlp/.test(info ?? ''),
    info ?? '',
  );
  const body = await page.textContent('body');
  check('token is never shown in full', !body.includes(TOKEN));
  check(
    'server URL saved without trailing slash',
    (await page.evaluate(() => window.__musik.server.url)) === apiOrigin,
  );
  await page.screenshot({ path: path.join(artifacts, 'm2-settings.png'), fullPage: true });

  // 3. Successful conversion
  await tab('youtube');
  const ok = await runJob(ytUrl('SLOWxxxxxxx'));
  check(
    'conversion finishes and the title comes from the server',
    ok.phase === 'done' && /Judul Uji SLOW/.test(ok.title),
    JSON.stringify(ok),
  );
  const stepTexts = await page.$$eval('#yt-steps li', (els) =>
    els.map((e) => ({ step: e.dataset.step, done: e.classList.contains('done') })),
  );
  check(
    'status steps are shown and completed',
    stepTexts.length === 5 && stepTexts.slice(0, 4).every((s) => s.done),
    JSON.stringify(stepTexts),
  );
  const song = await page.evaluate(() => {
    const s = window.__musik.player.songs[0];
    return s
      ? { source: s.source, duration: s.duration, peaks: s.peaks.length, mime: s.mime }
      : null;
  });
  check(
    'MP3 stored in the library as a YouTube song with duration and waveform',
    song?.source === 'youtube' && Math.abs(song.duration - 2) < 0.3 && song.peaks === 600,
    JSON.stringify(song),
  );
  check('CORS header returned for the PWA origin', corsHeader === appOrigin, String(corsHeader));
  await page.screenshot({ path: path.join(artifacts, 'm2-youtube.png'), fullPage: true });
  await page.click('#yt-play');
  await page.waitForFunction(() => window.__musik.player.position > 0.5, null, { timeout: 15000 });
  check('"Putar sekarang" plays the downloaded song', true);
  await page.evaluate(() => window.__musik.player.pause());

  // 4. Error cases
  await tab('youtube');
  await page.click('button:has-text("Simpan lagu lain")').catch(() => undefined);
  const cases = [
    ['FAILxxxxxxx', ytUrl('FAILxxxxxxx'), /tidak bisa diunduh/],
    ['LONGxxxxxxx', ytUrl('LONGxxxxxxx'), /terlalu panjang/],
    ['BOTXxxxxxxx', ytUrl('BOTXxxxxxxx'), /memblokir/],
    ['NOFLxxxxxxx', ytUrl('NOFLxxxxxxx'), /gagal/i],
    ['invalid host', 'https://example.com/watch?v=dQw4w9WgXcQ', /URL tidak valid/],
    ['playlist', 'https://www.youtube.com/playlist?list=PL1234567890', /URL tidak valid/],
  ];
  for (const [name, url, re] of cases) {
    const r = await runJob(url);
    check(`error case ${name} -> clear message`, r.phase === 'error' && re.test(r.error), r.error);
  }
  const songsAfter = await page.evaluate(() => window.__musik.player.songs.length);
  check('failed jobs add nothing to the library', songsAfter === 1, String(songsAfter));

  // 5. Share Target / extension handoff
  const shared = await context.newPage();
  shared.on('pageerror', (e) => errors.push(`shared: ${e.message}`));
  const text = encodeURIComponent('Dengarkan ini https://youtu.be/dQw4w9WgXcQ?si=abc ya');
  await shared.goto(`${appOrigin}/?test&title=Judul&text=${text}`, { waitUntil: 'load' });
  await ready(shared);
  const prefilled = await shared.inputValue('#yt-url');
  check(
    'Share Target: link in shared text prefills the YouTube screen',
    prefilled === 'https://youtu.be/dQw4w9WgXcQ?si=abc',
    prefilled,
  );
  check(
    'Share Target: query string is cleaned from the address bar',
    (await shared.evaluate(() => location.search)) === '?test',
  );
  const noLink = await context.newPage();
  await noLink.goto(
    `${appOrigin}/?test&text=${encodeURIComponent('tidak ada link, https://example.com/x')}`,
    { waitUntil: 'load' },
  );
  await ready(noLink);
  check(
    'Share Target: non-YouTube text is ignored',
    (await noLink.locator('#yt-url').count()) === 0,
  );
  await shared.close();
  await noLink.close();

  // 6. Settings survive a reload; offline gives a network message
  await page.reload({ waitUntil: 'load' });
  await ready();
  check(
    'server settings persist after reload',
    await page.evaluate(() => window.__musik.server.configured),
  );
  await context.setOffline(true);
  await tab('youtube');
  await page.fill('#yt-url', ytUrl('OKAYxxxxxxx'));
  await page.click('#yt-save');
  await page.waitForSelector('#yt-error', { timeout: 15000 });
  check(
    'offline: conversion fails with the network message',
    /Tidak bisa terhubung/.test((await page.textContent('#yt-error')) ?? ''),
  );
  await context.setOffline(false);

  check('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('unexpected exception', false, String(err?.stack ?? err));
  try {
    await page.screenshot({ path: path.join(artifacts, 'm2-failure.png'), fullPage: true });
  } catch {
    /* ignore */
  }
} finally {
  await browser.close();
  await new Promise((r) => api.server.close(() => r()));
  staticServer.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
writeFileSync(path.join(artifacts, 'm2-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
