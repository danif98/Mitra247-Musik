// E2E for the advanced Minus One modes (M4): numeric DSP checks by rendering the real MinusOne class in an
// OfflineAudioContext inside Chromium, plus the UI and per-song persistence of mode and controls.
// Requires `npm run build`. Usage: node e2e/minusone.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.mjs';
import { encodeWav } from '../core/audio/wav.ts';
import { generateSine } from '../core/audio/analysis.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out', 'app');
const artifacts = path.join(root, 'e2e', 'artifacts');
mkdirSync(artifacts, { recursive: true });
if (!existsSync(path.join(outDir, 'index.html'))) {
  console.error('out/app missing: run `npm run build` first.');
  process.exit(2);
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

const SR = 44100;
const songPath = path.join(artifacts, 'Minus_Satu.wav');
writeFileSync(
  songPath,
  encodeWav([generateSine(440, SR, 20, 0.3), generateSine(440, SR, 20, 0.3)], SR),
);

const { server, port } = await startStaticServer(outDir, 0);
const base = `http://127.0.0.1:${port}`;
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
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const ready = () =>
  page.waitForFunction(() => window.__musik?.player?.engineState === 'ready', null, {
    timeout: 20000,
  });
const sleep = (ms) => page.waitForTimeout(ms);

/**
 * Render a test mix through MinusOne offline. Input per tone: amplitude 0.3 in the named channel(s).
 * Returns, per tone frequency, the output level in dB relative to the input amplitude, for L and R.
 */
const TONES = [
  { f: 80, pan: 'center' },
  { f: 200, pan: 'center' },
  { f: 1000, pan: 'center' },
  { f: 3000, pan: 'center' },
  { f: 8000, pan: 'center' },
  { f: 330, pan: 'left' },
  { f: 550, pan: 'right' },
];
async function render(params, enabled = true, tones = TONES) {
  return page.evaluate(
    async ({ params, enabled, tones }) => {
      const sr = 48000;
      const n = sr * 2;
      const ctx = new OfflineAudioContext(2, n, sr);
      const buf = ctx.createBuffer(2, n, sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const A = 0.3;
      for (const t of tones) {
        const w = (2 * Math.PI * t.f) / sr;
        for (let i = 0; i < n; i++) {
          const v = A * Math.sin(w * i);
          if (t.pan !== 'right') L[i] += v;
          if (t.pan !== 'left') R[i] += v;
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const mo = new window.__musik.MinusOne(ctx);
      src.connect(mo.input);
      mo.output.connect(ctx.destination);
      mo.apply(params);
      mo.setEnabled(enabled);
      src.start();
      const out = await ctx.startRendering();
      // Goertzel on the last second (after the 15 ms parameter smoothing has settled)
      const level = (data, f) => {
        const from = sr;
        const len = n - from;
        const w = (2 * Math.PI * f) / sr;
        const c = 2 * Math.cos(w);
        let s0 = 0,
          s1 = 0,
          s2 = 0;
        for (let i = 0; i < len; i++) {
          const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1));
          s0 = data[from + i] * win + c * s1 - s2;
          s2 = s1;
          s1 = s0;
        }
        const p = Math.max(s1 * s1 + s2 * s2 - c * s1 * s2, 0);
        return (2 * Math.sqrt(p)) / (len * 0.5);
      };
      const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
      const res = { L: {}, R: {} };
      for (const t of tones) {
        res.L[t.f] = db(level(out.getChannelData(0), t.f)) - db(A);
        res.R[t.f] = db(level(out.getChannelData(1), t.f)) - db(A);
      }
      return res;
    },
    { params, enabled, tones },
  );
}
const f1 = (x) => x.toFixed(1);

try {
  await page.goto(`${base}/?test`, { waitUntil: 'load' });
  await ready();

  // ------------------------------------------------------------------ DSP: disabled / basic
  const off = await render({ mode: 'basic' }, false);
  check(
    'disabled: signal passes unchanged (centre 0 dB, left-only only on L)',
    [80, 200, 1000, 3000, 8000].every(
      (f) => Math.abs(off.L[f]) < 0.3 && Math.abs(off.R[f]) < 0.3,
    ) &&
      Math.abs(off.L[330]) < 0.3 &&
      off.R[330] < -60,
    `1k: ${f1(off.L[1000])} dB`,
  );

  const basic = await render({ mode: 'basic', strength: 1 });
  check(
    'Dasar: every centre tone (80, 200, 1k, 3k, 8k Hz) reduced by > 40 dB',
    [80, 200, 1000, 3000, 8000].every((f) => basic.L[f] < -40 && basic.R[f] < -40),
    [80, 200, 1000, 3000, 8000].map((f) => f1(basic.L[f])).join(' / '),
  );
  check(
    'Dasar: panned instruments kept at about -6 dB in both channels',
    Math.abs(basic.L[330] + 6.02) < 0.7 &&
      Math.abs(basic.R[330] + 6.02) < 0.7 &&
      Math.abs(basic.L[550] + 6.02) < 0.7,
    `330 L ${f1(basic.L[330])} R ${f1(basic.R[330])}, 550 L ${f1(basic.L[550])}`,
  );
  const half = await render({ mode: 'basic', strength: 0.5 });
  check(
    'Dasar at 50% strength: centre reduced by about 6 dB',
    Math.abs(half.L[1000] + 6) < 1,
    f1(half.L[1000]),
  );
  const zero = await render({ mode: 'basic', strength: 0 });
  check(
    'Dasar at 0% strength equals the untouched signal',
    Math.abs(zero.L[1000]) < 0.5 && Math.abs(zero.L[330]) < 0.5,
    `${f1(zero.L[1000])} / ${f1(zero.L[330])}`,
  );

  // ------------------------------------------------------------------ DSP: Jaga bass
  const bass = await render({ mode: 'bass', strength: 1, cutoff: 150 });
  check(
    'Jaga bass: centre bass (80 Hz) is kept (within 3 dB)',
    bass.L[80] > -3 && bass.R[80] > -3,
    `${f1(bass.L[80])} dB`,
  );
  check(
    'Jaga bass: centre vocal range (1k, 3k, 8k Hz) reduced by > 40 dB',
    [1000, 3000, 8000].every((f) => bass.L[f] < -40),
    [1000, 3000, 8000].map((f) => f1(bass.L[f])).join(' / '),
  );
  check(
    'Jaga bass: panned instruments above the cutoff kept (about -6 dB)',
    bass.L[330] > -8 && bass.L[330] < -4.5 && bass.L[550] > -8 && bass.L[550] < -4.5,
    `${f1(bass.L[330])} / ${f1(bass.L[550])}`,
  );
  const cut300 = await render({ mode: 'bass', strength: 1, cutoff: 300 });
  const cut100 = await render({ mode: 'bass', strength: 1, cutoff: 100 });
  check(
    'Jaga bass: the cutoff slider moves the split (200 Hz centre kept at 300 Hz, cut at 100 Hz)',
    cut300.L[200] > -4 && cut100.L[200] < -15,
    `cutoff 300: ${f1(cut300.L[200])} dB, cutoff 100: ${f1(cut100.L[200])} dB`,
  );

  // ------------------------------------------------------------------ DSP: Fokus vokal
  const focus = await render({ mode: 'focus', strength: 1, width: 0.5 });
  check(
    'Fokus vokal: centre vocal band (1 kHz) reduced by > 12 dB',
    focus.L[1000] < -12 && focus.R[1000] < -12,
    `${f1(focus.L[1000])} dB`,
  );
  check(
    'Fokus vokal: centre bass (80 Hz) and treble (8 kHz) stay (within 2 dB)',
    Math.abs(focus.L[80]) < 2 && Math.abs(focus.L[8000]) < 2,
    `${f1(focus.L[80])} / ${f1(focus.L[8000])}`,
  );
  check(
    'Fokus vokal keeps the stereo image (left-only tone stays mostly on the left)',
    focus.L[330] > -5 && focus.R[330] < focus.L[330] - 5,
    `L ${f1(focus.L[330])} R ${f1(focus.R[330])}`,
  );
  const fhalf = await render({ mode: 'focus', strength: 0.5, width: 0.5 });
  check(
    'Fokus vokal at 50% strength reduces less than at 100%',
    fhalf.L[1000] > focus.L[1000] + 3 && fhalf.L[1000] < -2,
    `${f1(fhalf.L[1000])} vs ${f1(focus.L[1000])} dB`,
  );
  const fnarrow = await render({ mode: 'focus', strength: 1, width: 0.1 });
  const fwide = await render({ mode: 'focus', strength: 1, width: 1 });
  check(
    'Fokus vokal: the width slider widens the band (3 kHz reduced more when wide)',
    fwide.L[3000] < fnarrow.L[3000] - 3,
    `narrow ${f1(fnarrow.L[3000])} dB, wide ${f1(fwide.L[3000])} dB`,
  );

  // ------------------------------------------------------------------ mode switching on a live node
  const live = await page.evaluate(async () => {
    const ctx = new AudioContext();
    const mo = new window.__musik.MinusOne(ctx);
    const osc = ctx.createOscillator();
    osc.connect(mo.input);
    mo.output.connect(ctx.destination);
    osc.start();
    const states = [];
    for (const mode of ['basic', 'bass', 'focus', 'basic']) {
      mo.setEnabled(true);
      mo.apply({ mode });
      await new Promise((r) => setTimeout(r, 160));
      states.push(mo.current.mode);
    }
    mo.setEnabled(false);
    await new Promise((r) => setTimeout(r, 160));
    await ctx.close();
    return states;
  });
  check(
    'live mode switching does not throw (basic -> bass -> focus -> basic -> off)',
    live.join() === 'basic,bass,focus,basic',
  );

  // ------------------------------------------------------------------ UI + persistence
  await page.click('#tab-library');
  await page.setInputFiles('#add-files', [songPath]);
  await page.waitForFunction(() => document.querySelectorAll('#song-list li').length === 1, null, {
    timeout: 30000,
  });
  await page.locator('#song-list li .open').first().click();
  await page.waitForSelector('#mo');
  check(
    'panel with modes is hidden while Minus One is off',
    (await page.locator('#mo-panel').count()) === 0,
  );
  await page.click('#mo');
  await page.waitForSelector('#mo-panel');
  const modeButtons = await page.locator('#mo-panel [id^=mo-mode-]').count();
  check(
    'turning Minus One on shows 3 mode buttons and the strength slider',
    modeButtons === 3 && (await page.locator('#mo-strength').count()) === 1,
  );
  check(
    'basic mode shows no cutoff or width slider',
    (await page.locator('#mo-cutoff').count()) === 0 &&
      (await page.locator('#mo-width').count()) === 0,
  );
  await page.click('#mo-mode-bass');
  check(
    'Jaga bass shows the cutoff slider and a hint',
    (await page.locator('#mo-cutoff').count()) === 1 &&
      /bass/i.test((await page.textContent('#mo-hint')) ?? ''),
  );
  await page.fill('#mo-cutoff', '200');
  await page.click('#mo-mode-focus');
  check(
    'Fokus vokal shows the width slider',
    (await page.locator('#mo-width').count()) === 1 &&
      (await page.locator('#mo-cutoff').count()) === 0,
  );
  await page.fill('#mo-width', '80');
  await page.fill('#mo-strength', '70');
  const params = await page.evaluate(() => ({ ...window.__musik.player.moParams }));
  check(
    'controls update the player parameters',
    params.mode === 'focus' &&
      Math.abs(params.width - 0.8) < 0.01 &&
      Math.abs(params.strength - 0.7) < 0.01 &&
      params.cutoff === 200,
    JSON.stringify(params),
  );
  const engineParams = await page.evaluate(() => ({
    ...window.__musik.player.engine.minusOne.current,
  }));
  check(
    'engine received the same parameters',
    engineParams.mode === 'focus' && engineParams.cutoff === 200,
    JSON.stringify(engineParams),
  );
  await page.screenshot({ path: path.join(artifacts, 'minusone-panel.png'), fullPage: true });
  await sleep(900); // preset auto-save

  await page.reload({ waitUntil: 'load' });
  await ready();
  await page.locator('#tab-library').click();
  await page.locator('#song-list li .open').first().click();
  await page.waitForSelector('#mo-panel');
  await sleep(300);
  const restored = await page.evaluate(() => ({
    ...window.__musik.player.moParams,
    on: window.__musik.player.minusOne,
  }));
  check(
    'mode and controls are saved with the song and restored after a reload',
    restored.on &&
      restored.mode === 'focus' &&
      Math.abs(restored.width - 0.8) < 0.01 &&
      Math.abs(restored.strength - 0.7) < 0.01 &&
      restored.cutoff === 200,
    JSON.stringify(restored),
  );
  check(
    'restored mode is active in the engine',
    (await page.evaluate(() => window.__musik.player.engine.minusOne.current.mode)) === 'focus',
  );
  check(
    'the info note still carries the "results vary" text',
    await (async () => {
      await page.click('#mo-info');
      return /Hasil bervariasi/.test((await page.textContent('#mo-note')) ?? '');
    })(),
  );

  check('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('unexpected exception', false, String(err?.stack ?? err));
  try {
    await page.screenshot({ path: path.join(artifacts, 'minusone-failure.png'), fullPage: true });
  } catch {
    /* ignore */
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
writeFileSync(path.join(artifacts, 'minusone-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
