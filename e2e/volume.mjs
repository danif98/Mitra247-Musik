// E2E for volume above 100% and loudness normalisation (songs of different level are leveled).
// Requires `npm run build`. Usage: node e2e/volume.mjs
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

  await page.evaluate(async () => {
    const wav = (seconds, amp) => {
      const rate = 8000;
      const n = seconds * rate;
      const buf = new ArrayBuffer(44 + n * 2);
      const v = new DataView(buf);
      const w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF');
      v.setUint32(4, 36 + n * 2, true);
      w(8, 'WAVEfmt ');
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 1, true);
      v.setUint32(24, rate, true);
      v.setUint32(28, rate * 2, true);
      v.setUint16(32, 2, true);
      v.setUint16(34, 16, true);
      w(36, 'data');
      v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 32767 * amp, true);
      return buf;
    };
    await window.__musik.player.addFiles([
      new File([wav(5, 0.1)], 'Pelan.wav', { type: 'audio/wav' }),
      new File([wav(5, 0.8)], 'Keras.wav', { type: 'audio/wav' }),
    ]);
  });

  check(
    'normalize is on by default',
    await page.evaluate(() => window.__musik.player.normalize === true),
  );

  async function playAndMeasure(title) {
    await page.evaluate(async (t) => {
      const p = window.__musik.player;
      const s = p.songs.find((x) => x.title === t);
      await p.select(s);
    }, title);
    await page.waitForFunction(
      (t) => {
        const p = window.__musik.player;
        return p.current?.title === t && p.normGainDb !== 0;
      },
      title,
      { timeout: 15000 },
    );
    return page.evaluate(() => ({
      db: window.__musik.player.normGainDb,
      gain: window.__musik.player.engine.norm.gain.value,
    }));
  }
  const quiet = await playAndMeasure('Pelan');
  const loud = await playAndMeasure('Keras');
  check('a quiet song is amplified', quiet.db > 3, JSON.stringify(quiet));
  check('a loud song is lowered', loud.db < 0, JSON.stringify(loud));
  check(
    'the two songs end at the same level',
    Math.abs(quiet.db - loud.db - 20 * Math.log10(0.8 / 0.1)) < 1.5,
    `${quiet.db.toFixed(1)} / ${loud.db.toFixed(1)}`,
  );

  await page.evaluate(() => window.__musik.player.setNormalize(false));
  const off = await page.evaluate(() => window.__musik.player.normGainDb);
  check('normalize off removes the correction', off === 0);
  await page.evaluate(() => window.__musik.player.setNormalize(true));
  await page.waitForFunction(() => window.__musik.player.normGainDb !== 0, null, {
    timeout: 15000,
  });
  check('normalize on again applies it from the cache', true);

  // volume above 100%
  await page.click('#tab-play');
  await page.click('#ptab-practice');
  const max = await page.getAttribute('#volume', 'max');
  check('the volume slider goes up to 200%', max === '2', max ?? '');
  await page.evaluate(() => window.__musik.player.setVolume(1.5));
  await page.waitForTimeout(300);
  const g = await page.evaluate(() => window.__musik.player.engine.output.gain.value);
  check('volume 150% sets the output gain to 1.5', Math.abs(g - 1.5) < 0.05, String(g));
  check('the label shows 150%', (await page.textContent('#volume-pct'))?.trim() === '150%');
  check(
    'the boost warning is hidden, only an info icon shows above 100%',
    (await page.locator('#volume-boost').count()) === 0 &&
      (await page.locator('#volume-info').count()) === 1,
  );
  await page.click('#volume-info');
  check(
    'tapping the info icon shows the warning',
    (await page.locator('#volume-boost').count()) === 1,
  );
  await page.click('#volume-info');
  check('tapping again hides it', (await page.locator('#volume-boost').count()) === 0);
  await page.evaluate(() => window.__musik.player.setVolume(5));
  check(
    'volume is limited to 200%',
    (await page.evaluate(() => window.__musik.player.volume)) === 2,
  );

  // minus one button is labelled
  const moText = (await page.textContent('#mo'))?.replace(/\s+/g, ' ').trim() ?? '';
  check(
    'the minus one button carries its name',
    /Minus One/.test(moText) && /mati/i.test(moText),
    moText,
  );
  await page.screenshot({ path: path.join(artifacts, 'volume.png') });

  // settings toggle
  await page.click('#tab-settings');
  await page.click('#set-norm-off');
  check(
    'settings: normalize can be turned off',
    (await page.evaluate(() => window.__musik.player.normalize)) === false,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__musik?.player?.engineState === 'ready', null, {
    timeout: 60000,
  });
  check(
    'the choice survives a reload',
    (await page.evaluate(() => window.__musik.player.normalize)) === false,
  );

  check('no console errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
