// E2E + numeric tests for the lab page in Chromium (Playwright). Requires `npm run build` first.
// Usage: node e2e/run.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.mjs';
import { encodeWav } from '../core/audio/wav.ts';
import { dominantFrequency, generateSine, rms } from '../core/audio/analysis.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out', 'app');
const artifacts = path.join(root, 'e2e', 'artifacts');
mkdirSync(artifacts, { recursive: true });
if (!existsSync(path.join(outDir, 'lab', 'index.html'))) {
  console.error('out/app missing: run `npm run build` first.');
  process.exit(2);
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

// 1. Test audio: 440 Hz sine, 20 s, 44.1 kHz mono WAV.
const SR = 44100;
const wavPath = path.join(artifacts, 'sine-440.wav');
writeFileSync(wavPath, encodeWav([generateSine(440, SR, 20, 0.5)], SR));

const { server, port } = await startStaticServer(outDir, 0);
const base = `http://127.0.0.1:${port}`;

let browser;
try {
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
} catch (err) {
  console.warn(
    'Bundled Chromium unavailable, falling back to system Chrome:',
    String(err).split('\n')[0],
  );
  browser = await chromium.launch({
    channel: 'chrome',
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
}
console.log('Browser:', browser.version());

const context = await browser.newContext({
  viewport: { width: 412, height: 915 }, // ~Galaxy A23 CSS viewport
  deviceScaleFactor: 2.625,
  acceptDownloads: true,
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

try {
  await page.goto(`${base}/lab/?test`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.getElementById('status')?.textContent?.includes('siap'),
    null,
    {
      timeout: 20000,
    },
  );
  check('lab page loads and engine becomes ready (WASM + worklet)', true);

  await page.setInputFiles('input[type=file]', wavPath);
  await page.waitForFunction(() =>
    document.getElementById('filename')?.textContent?.includes('sine-440'),
  );
  await page.click('#play');
  await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 1.0, null, {
    timeout: 15000,
  });
  check('plays a local audio file (currentTime advances)', true);

  const state = await page.evaluate(() => window.__musik.engine().context.state);
  check('AudioContext running', state === 'running', state);

  // 2. Numeric tests: dominant frequency of the real output tap.
  async function measure(path_, engine_, tempo, semitone, expectHz) {
    await page.evaluate(
      ([p, e, t, s]) => {
        const eng = window.__musik.engine();
        eng.setPath(p);
        eng.setEngine(e);
        eng.setTempo(t);
        eng.setSemitone(s);
      },
      [path_, engine_, tempo, semitone],
    );
    await page.waitForTimeout(engine_ === 'R3' ? 1500 : 800); // ramp + engine rebuild + settle
    const samples = Float32Array.from(await page.evaluate(() => window.__musik.capture(32768)));
    const sr = await page.evaluate(() => window.__musik.engine().context.sampleRate);
    const f = dominantFrequency(samples, sr);
    const level = rms(samples);
    const tol = engine_ === 'R3' ? 0.01 : 0.02;
    const err = f / expectHz - 1;
    check(
      `numeric: path ${path_} ${engine_} tempo ${tempo} st ${semitone >= 0 ? '+' : ''}${semitone} -> ~${expectHz} Hz`,
      Math.abs(err) < tol && level > 0.05,
      `${f.toFixed(2)} Hz (err ${(err * 100).toFixed(2)}%, rms ${level.toFixed(3)})`,
    );
  }

  await measure('A', 'R2', 1, 0, 440);
  await measure('A', 'R2', 1, 12, 880);
  await measure('B', 'R2', 1, 12, 880);
  await measure('A', 'R2', 0.5, 12, 880);
  await measure('B', 'R2', 0.5, 12, 880);
  await measure('A', 'R2', 0.75, -12, 220);
  await measure('A', 'R2', 1.25, 4, 554.37);
  await measure('A', 'R3', 1, 12, 880);
  await measure('B', 'R3', 1, 12, 880);

  // 3. UI interaction: steppers change tempo and key without console errors.
  await page.evaluate(() => {
    const eng = window.__musik.engine();
    eng.setEngine('R2');
    eng.setPath('A');
    eng.setTempo(1);
    eng.setSemitone(0);
  });
  await page.click('#eng-r2');
  await page.click('#path-a');
  await page.click('button[aria-label="Tempo −"]');
  await page.click('button[aria-label="Tempo −"]');
  await page.click('button[aria-label="Kunci (semitone) +"]');
  await page.click('button[aria-label="Kunci (semitone) +"]');
  await page.waitForTimeout(500);
  const ui = await page.evaluate(() => {
    const outs = [...document.querySelectorAll('output.value')].map((o) => o.textContent);
    const eng = window.__musik.engine();
    return {
      outs,
      rate: eng.media.playbackRate,
      preserves: eng.media.preservesPitch,
      ratio: eng.currentPitchRatio,
    };
  });
  check(
    'UI steppers: tempo 0.90x and +2 semitone applied',
    ui.outs[0] === '0.90×' && ui.outs[1] === '+2' && Math.abs(ui.rate - 0.9) < 1e-6,
    JSON.stringify(ui),
  );

  // 4. Diagnostics panel + log.
  await page.waitForTimeout(2200);
  const diagText = await page.textContent('#diag');
  check(
    'diagnostics panel shows sample rate and latency',
    /Sample rate/.test(diagText) && /baseLatency/.test(diagText),
  );
  const snap = await page.evaluate(() => window.__musik.engine().snapshot());
  console.log(
    'Diagnostics snapshot:',
    JSON.stringify({
      sampleRate: snap.sampleRate,
      baseLatencyMs: snap.baseLatency * 1000,
      outputLatencyMs: snap.outputLatency == null ? null : snap.outputLatency * 1000,
      workletUnderruns: snap.worklet?.underruns,
      workletLoadPct: snap.worklet?.loadPct?.toFixed(2),
      workletBlocks: snap.worklet?.blocks,
      renderCapacity: snap.renderCapacity,
    }),
  );
  check(
    'worklet reports stats',
    !!snap.worklet && snap.worklet.blocks > 100,
    `blocks=${snap.worklet?.blocks}`,
  );

  // visibilitychange logging (simulated hide/show)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  const logFile = path.join(artifacts, 'diag-log.json');
  await download.saveAs(logFile);
  const logJson = JSON.parse(readFileSync(logFile, 'utf8'));
  const kinds = new Set(logJson.events.map((e) => e.kind));
  check(
    'diagnostic log downloads as JSON with events + samples',
    logJson.samples.length > 0 &&
      kinds.has('visibilitychange') &&
      kinds.has('tempo') &&
      kinds.has('media:play'),
    `events=${logJson.events.length} samples=${logJson.samples.length}`,
  );

  // 5. Media Session
  const ms = await page.evaluate(() => navigator.mediaSession.metadata?.title ?? null);
  check('Media Session metadata set', ms === 'sine-440.wav', String(ms));

  await page.screenshot({ path: path.join(artifacts, 'lab-mobile.png'), fullPage: true });
  check('no console errors during the run', consoleErrors.length === 0, consoleErrors.join(' | '));
  consoleErrors.length = 0;

  // 6. PWA: manifest installability + offline.
  const cdp = await context.newCDPSession(page);
  const inst = await cdp.send('Page.getInstallabilityErrors');
  // 'in-incognito' is expected: Playwright contexts are incognito-like and cannot be installed.
  const instErrors = inst.installabilityErrors.filter((e) => e.errorId !== 'in-incognito');
  check(
    'PWA installability: no errors other than the incognito one (manifest, icons, SW ok)',
    instErrors.length === 0,
    JSON.stringify(inst.installabilityErrors),
  );
  await page.waitForFunction(
    async () =>
      (await navigator.serviceWorker.getRegistration('../'))?.active != null ||
      (await navigator.serviceWorker.getRegistration())?.active != null,
    null,
    { timeout: 15000 },
  );
  await page.reload({ waitUntil: 'load' }); // let the SW take control
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, {
    timeout: 10000,
  });
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const n of names)
      for (const r of await (await caches.open(n)).keys()) urls.push(new URL(r.url).pathname);
    return urls;
  });
  check(
    'service worker precaches the WASM',
    cached.some((u) => u.endsWith('.wasm')),
    `${cached.length} entries`,
  );
  await context.setOffline(true);
  const offlinePage = await context.newPage();
  offlinePage.on('pageerror', (e) => consoleErrors.push(`offline pageerror: ${e.message}`));
  await offlinePage.goto(`${base}/lab/`, { waitUntil: 'load' });
  await offlinePage.waitForFunction(
    () => document.getElementById('status')?.textContent?.includes('siap'),
    null,
    { timeout: 20000 },
  );
  check('lab works fully offline (page + worklet + WASM from cache)', true);
  await offlinePage.setInputFiles('input[type=file]', wavPath);
  await offlinePage.click('#play');
  await offlinePage.waitForFunction(
    () => document.querySelector('audio')?.currentTime > 0.5,
    null,
    { timeout: 15000 },
  );
  check('plays audio offline', true);
  check('no errors while offline', consoleErrors.length === 0, consoleErrors.join(' | '));
  await context.setOffline(false);
} catch (err) {
  check('unexpected exception', false, String(err?.stack ?? err));
  try {
    await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true });
  } catch {
    /* ignore */
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
