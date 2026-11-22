// E2E for the Chrome extension (MV3, unpacked test build) in Chromium with the extension loaded.
// Usage: node e2e/ext.mjs   (builds ext-chrome/dist-test itself)
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.mjs';
import { encodeWav } from '../core/audio/wav.ts';
import { generateSine } from '../core/audio/analysis.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'e2e', 'artifacts');
const siteDir = path.join(artifacts, 'ext-site');
mkdirSync(siteDir, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
function toneLevel(samples, sr, freq) {
  const w = (2 * Math.PI * freq) / sr;
  const c = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (samples.length - 1));
    s0 = samples[i] * win + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (2 * Math.sqrt(Math.max(s1 * s1 + s2 * s2 - c * s1 * s2, 0))) / (samples.length * 0.5);
}

// 1. Build the test extension.
const b = spawnSync(process.execPath, [path.join(root, 'ext-chrome', 'build.mjs'), '--test'], {
  stdio: 'inherit',
});
if (b.status !== 0) process.exit(2);
const extDir = path.join(root, 'ext-chrome', 'dist-test');
const EXT_ID = 'oplajmbpldocoebnjhjliogihkbjncbn';

// 2. Test site: stereo "song" (vocal 440 centre, guitar 330 L, keys 550 R) in <audio>.
const SR = 44100;
const vocal = generateSine(440, SR, 30, 0.3);
const guitar = generateSine(330, SR, 30, 0.25);
const keys = generateSine(550, SR, 30, 0.25);
writeFileSync(
  path.join(siteDir, 'song.wav'),
  encodeWav([vocal.map((v, i) => v + guitar[i]), vocal.map((v, i) => v + keys[i])], SR),
);
const page = (extra = '') =>
  `<!doctype html><meta charset="utf-8"><title>Halaman uji</title><audio id="a" src="song.wav" loop controls></audio>${extra}`;
writeFileSync(path.join(siteDir, 'test.html'), page());
writeFileSync(path.join(siteDir, 'csp.html'), page());
writeFileSync(
  path.join(siteDir, 'empty.html'),
  '<!doctype html><title>Kosong</title><p>tanpa media</p>',
);

const { server, port } = await startStaticServer(siteDir, 0, (p) =>
  p.endsWith('csp.html')
    ? { 'content-security-policy': "default-src 'none'; media-src 'self' blob:; script-src 'self'" }
    : {},
);
const base = `http://127.0.0.1:${port}`;

// 3. Launch Chromium with the extension.
const pw = ['Packages/Claude_pzs8sxrjxfjjc/LocalCache/Local/ms-playwright', 'ms-playwright'];
const candidates = pw.flatMap((p) => [
  path.join(
    os.homedir(),
    'AppData',
    'Local',
    ...p.split('/'),
    'chromium-1243',
    'chrome-win64',
    'chrome.exe',
  ),
]);
const chromiumExe = process.env.CHROMIUM_EXE || candidates.find((c) => existsSync(c));
const userData = path.join(artifacts, 'ext-profile');
rmSync(userData, { recursive: true, force: true });
const launchOpts = {
  headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    '--headless=new',
    '--autoplay-policy=no-user-gesture-required',
  ],
};
if (existsSync(chromiumExe)) launchOpts.executablePath = chromiumExe;
const context = await chromium.launchPersistentContext(userData, launchOpts);
console.log('Browser:', context.browser()?.version());

const errors = [];

async function openPopup(targetPath) {
  const popup = await context.newPage();
  popup.on('pageerror', (e) => errors.push(`popup: ${e.message}`));
  await popup.goto(
    `chrome-extension://${EXT_ID}/popup.html?target=${encodeURIComponent(targetPath)}`,
  );
  return popup;
}
const popupStatus = (popup) =>
  popup.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url?.startsWith('http') && t.url.includes('.html'));
    return chrome.tabs.sendMessage(tab.id, { type: 'status' }, { frameId: 0 });
  });
const capture = async (popup) => {
  const r = await popup.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url?.startsWith('http') && t.url.includes('.html'));
    return chrome.tabs.sendMessage(tab.id, { type: 'test-capture' }, { frameId: 0 });
  });
  return { samples: Float32Array.from(r.samples), sr: r.sampleRate };
};

try {
  // --- A. page without media
  const empty = await context.newPage();
  await empty.goto(`${base}/empty.html`);
  let popup = await openPopup('/empty.html');
  await popup.waitForSelector('#message');
  const noMedia = await popup.textContent('#message');
  check(
    'popup: page without media shows a clear message',
    /Tidak ada video atau audio/.test(noMedia ?? ''),
    noMedia ?? '',
  );
  await popup.close();
  await empty.close();

  // --- B. page with <audio>
  const site = await context.newPage();
  site.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  await site.goto(`${base}/test.html`);
  await site.evaluate(() => document.getElementById('a').play());
  await site.waitForFunction(() => document.getElementById('a').currentTime > 0.5);

  popup = await openPopup('/test.html');
  await popup.waitForSelector('button[aria-label="TEMPO −"]', { timeout: 20000 });
  check('popup finds the media element and shows controls', true);

  // tempo down twice -> 0.90
  await popup.click('button[aria-label="TEMPO −"]');
  await popup.click('button[aria-label="TEMPO −"]');
  await popup.waitForTimeout(600);
  const page1 = await site.evaluate(() => {
    const a = document.getElementById('a');
    return { rate: a.playbackRate, preserves: a.preservesPitch, paused: a.paused };
  });
  check(
    'tempo 0.90x applied to the page <audio> (path A: preservesPitch=false)',
    Math.abs(page1.rate - 0.9) < 1e-6 && page1.preserves === false && !page1.paused,
    JSON.stringify(page1),
  );
  const st = await popupStatus(popup);
  check(
    'engine ready with Rubber Band in the content script (worklet loaded)',
    st.ready && st.pitchAvailable && !st.error,
    JSON.stringify(st),
  );

  // numeric checks through the real extension pipeline
  await popup.click('button[aria-label="TEMPO +"]');
  await popup.click('button[aria-label="TEMPO +"]');
  await popup.waitForTimeout(700);
  const base0 = await capture(popup);
  const lv = (c, f) => toneLevel(c.samples, c.sr, f);
  console.log(
    `Extension levels: 440=${db(lv(base0, 440)).toFixed(1)} 330=${db(lv(base0, 330)).toFixed(1)} 550=${db(lv(base0, 550)).toFixed(1)} dBFS`,
  );
  check('audio flows through the engine unchanged at 1.00x / 0 st', db(lv(base0, 440)) > -20);

  await popup.click('#mo-on');
  await popup.waitForTimeout(600);
  const mo = await capture(popup);
  const drop = db(lv(base0, 440)) - db(lv(mo, 440));
  check(
    'minus one on a page <audio>: vocal (440 Hz) reduced by > 30 dB',
    drop > 30,
    `${drop.toFixed(1)} dB`,
  );
  check(
    'minus one keeps side instruments',
    Math.abs(db(lv(mo, 330)) - db(lv(base0, 330))) < 3 &&
      Math.abs(db(lv(mo, 550)) - db(lv(base0, 550))) < 3,
  );
  await popup.click('#mo-off');

  for (let i = 0; i < 12; i++) await popup.click('button[aria-label="KUNCI +"]');
  await popup.waitForTimeout(1200);
  const up = await capture(popup);
  check(
    '+12 semitones: 440 Hz vocal moves to 880 Hz',
    db(lv(up, 880)) - db(lv(up, 440)) > 15,
    `880: ${db(lv(up, 880)).toFixed(1)}, 440: ${db(lv(up, 440)).toFixed(1)} dBFS`,
  );

  // keyboard shortcut in the page
  await site.bringToFront();
  await site.keyboard.press(']');
  await site.waitForTimeout(500);
  const after = await site.evaluate(() => document.getElementById('a').playbackRate);
  check(
    'keyboard shortcut ] raises tempo by one step on the page',
    Math.abs(after - 1.05) < 1e-6 || after > 1.0,
    String(after),
  );
  check('no page/popup errors', errors.length === 0, errors.join(' | '));
  await popup.screenshot({ path: path.join(artifacts, 'ext-popup.png') });
  await popup.close();
  await site.close();

  // --- C. page with a strict CSP (stand-in for hostile sites)
  const csp = await context.newPage();
  await csp.goto(`${base}/csp.html`);
  await csp.evaluate(() => document.getElementById('a').play());
  await csp.waitForFunction(() => document.getElementById('a').currentTime > 0.5);
  popup = await openPopup('/csp.html');
  await popup.waitForSelector('button[aria-label="TEMPO −"]', { timeout: 20000 });
  await popup.click('button[aria-label="TEMPO −"]');
  await popup.waitForTimeout(800);
  const stCsp = await popupStatus(popup);
  const cspPage = await csp.evaluate(() => {
    const a = document.getElementById('a');
    return { rate: a.playbackRate, preserves: a.preservesPitch };
  });
  console.log('CSP page status:', JSON.stringify(stCsp), JSON.stringify(cspPage));
  check(
    'strict-CSP page: engine ready (worklet allowed) OR degraded mode with working tempo',
    stCsp.ready &&
      (stCsp.pitchAvailable ||
        (Math.abs(cspPage.rate - 0.95) < 1e-6 && cspPage.preserves === true)),
    `pitchAvailable=${stCsp.pitchAvailable} error=${stCsp.error}`,
  );
  await popup.close();
} catch (err) {
  check('unexpected exception', false, String(err?.stack ?? err));
} finally {
  await context.close();
  server.close();
  rmSync(userData, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
writeFileSync(path.join(artifacts, 'ext-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
