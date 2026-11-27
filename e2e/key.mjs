// E2E for key detection: a synthetic C major song is analysed in the app and the key is shown.
// Requires `npm run build`. Usage: node e2e/key.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.mjs';

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

const { server, port } = await startStaticServer(outDir, 0);
const base = `http://127.0.0.1:${port}`;
const args = ['--autoplay-policy=no-user-gesture-required'];
let browser;
try {
  browser = await chromium.launch({ args });
} catch {
  browser = await chromium.launch({ channel: 'chrome', args });
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
  await page.waitForFunction(() => window.__musik?.player?.engineState === 'ready', null, {
    timeout: 60000,
  });

  // 24 s of I - IV - V - I in C major (chords of 1.5 s, notes with 4 harmonics)
  await page.evaluate(async () => {
    const rate = 22050;
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const prog = [
      [48, 52, 55],
      [53, 57, 60],
      [55, 59, 62],
      [48, 52, 55],
    ];
    const n = rate * 24;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const chord = prog[Math.floor(i / (rate * 1.5)) % 4];
      let v = 0;
      for (const m of chord)
        for (let h = 1; h <= 4; h++)
          v += (0.12 / h) * Math.sin((2 * Math.PI * hz(m) * h * i) / rate);
      x[i] = v;
    }
    const buf = new ArrayBuffer(44 + n * 2);
    const d = new DataView(buf);
    const w = (o, t) => [...t].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF');
    d.setUint32(4, 36 + n * 2, true);
    w(8, 'WAVEfmt ');
    d.setUint32(16, 16, true);
    d.setUint16(20, 1, true);
    d.setUint16(22, 1, true);
    d.setUint32(24, rate, true);
    d.setUint32(28, rate * 2, true);
    d.setUint16(32, 2, true);
    d.setUint16(34, 16, true);
    w(36, 'data');
    d.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++)
      d.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
    await window.__musik.player.addFiles([
      new File([buf], 'Lagu C Mayor.wav', { type: 'audio/wav' }),
    ]);
    const p = window.__musik.player;
    await p.select(p.songs[0], false);
  });

  await page.waitForFunction(() => window.__musik.player.detectedKey !== null, null, {
    timeout: 30000,
  });
  const key = await page.evaluate(() => window.__musik.player.detectedKey);
  check(
    'the key is detected as C major',
    key.tonic === 0 && key.mode === 'major',
    JSON.stringify(key),
  );

  await page.click('#tab-play');
  const badge = (await page.textContent('#key-badge'))?.replace(/\s+/g, ' ').trim() ?? '';
  check('the Play screen shows the key', /Kunci lagu: C mayor/.test(badge), badge);

  await page.click('#ptab-practice');
  const label = async () =>
    (await page.locator('.stepper h3').nth(1).textContent())?.replace(/\s+/g, ' ').trim() ?? '';
  check('the key stepper shows the song key', /· C$/.test(await label()), await label());
  await page.evaluate(() => window.__musik.player.setSemitone(2));
  await page.waitForTimeout(100);
  check('after +2 it shows C -> D', /· C → D$/.test(await label()), await label());
  await page.evaluate(() => window.__musik.player.setSemitone(-3));
  await page.waitForTimeout(100);
  check('after -3 it shows C -> A', /· C → A$/.test(await label()), await label());

  // it is remembered: reload and select again, no waiting for a new analysis
  const cached = await page.evaluate(
    () => Object.keys(JSON.parse(localStorage.getItem('musik.keys') ?? '{}')).length,
  );
  check('the result is remembered', cached === 1, String(cached));
  await page.screenshot({ path: path.join(artifacts, 'key.png') });
  check('no console errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
