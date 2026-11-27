// E2E for "Simpan sebagai MP3": file name, the real render (tempo, key, volume) and the download.
// Requires `npm run build`. Usage: node e2e/export.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
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
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  acceptDownloads: true,
});
// A real save dialog cannot be driven here: use the download fallback.
await context.addInitScript(() => {
  window.showSaveFilePicker = undefined;
});
const page = await context.newPage();
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

  // a 6 s stereo tone of 440 Hz in a library song called "Idol - Yoasobi"
  await page.evaluate(async () => {
    const rate = 44100;
    const seconds = 6;
    const n = seconds * rate;
    const buf = new ArrayBuffer(44 + n * 4);
    const v = new DataView(buf);
    const w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF');
    v.setUint32(4, 36 + n * 4, true);
    w(8, 'WAVEfmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 4, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    w(36, 'data');
    v.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      const x = Math.sin((2 * Math.PI * 440 * i) / rate) * 12000;
      v.setInt16(44 + i * 4, x, true);
      v.setInt16(46 + i * 4, x * 0.9, true);
    }
    await window.__musik.player.addFiles([
      new File([buf], 'Idol - Yoasobi.wav', { type: 'audio/wav' }),
    ]);
    const p = window.__musik.player;
    await p.select(p.songs[0], false);
  });

  await page.click('#tab-play');
  await page.click('#ptab-practice');
  await page.evaluate(() => {
    const p = window.__musik.player;
    p.setTempo(0.5);
    p.setSemitone(12);
    p.setVolume(0.5);
    p.setNormalize(false);
  });
  await page.click('#export-toggle');
  const proposed = await page.inputValue('#export-name');
  check(
    'the proposed name follows the format',
    proposed === 'Idol - Yoasobi [Tempo 50 - Key +12]',
    proposed,
  );

  await page.evaluate(() => window.__musik.player.setSemitone(-3));
  await page.waitForTimeout(100);
  check(
    'the name follows the key until it is edited',
    (await page.inputValue('#export-name')) === 'Idol - Yoasobi [Tempo 50 - Key -3]',
  );
  await page.evaluate(() => window.__musik.player.setSemitone(12));
  await page.waitForTimeout(100);

  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.click('#export-start');
  await page.waitForSelector('#export-progress', { timeout: 5000 });
  check('progress is shown while rendering', true);
  const download = await downloadPromise;
  check(
    'the file is offered with the .mp3 name',
    download.suggestedFilename() === 'Idol - Yoasobi [Tempo 50 - Key +12].mp3',
    download.suggestedFilename(),
  );
  const file = path.join(artifacts, 'export.mp3');
  await download.saveAs(file);
  const bytes = readFileSync(file);
  const isMp3 =
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) || bytes.slice(0, 3).toString() === 'ID3';
  check('the file is an MP3', isMp3 && bytes.length > 10000, `${bytes.length} bytes`);
  await page.waitForSelector('#export-message');
  const msg = await page.textContent('#export-message');
  check('a done message names the file', /Tersimpan/.test(msg ?? ''), msg?.trim() ?? '');

  // decode the MP3 and measure: length, pitch and level
  const info = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const ctx = new OfflineAudioContext(2, 1, 44100);
    const audio = await ctx.decodeAudioData(u8.buffer);
    const ch = audio.getChannelData(0);
    // frequency from zero crossings over a 3 s window in the middle
    const from = Math.floor(audio.sampleRate * 3);
    const to = Math.floor(audio.sampleRate * 6);
    let crossings = 0;
    let peak = 0;
    for (let i = from + 1; i < to; i++) {
      if (ch[i - 1] < 0 && ch[i] >= 0) crossings++;
      peak = Math.max(peak, Math.abs(ch[i]));
    }
    return { seconds: audio.duration, hz: crossings / ((to - from) / audio.sampleRate), peak };
  }, bytes.toString('base64'));
  check(
    'half tempo doubles the length (6 s -> 12 s)',
    Math.abs(info.seconds - 12) < 0.4,
    info.seconds.toFixed(2),
  );
  check(
    '+12 semitones doubles the pitch (440 -> 880 Hz)',
    Math.abs(info.hz / 880 - 1) < 0.04,
    info.hz.toFixed(1),
  );
  check(
    'the volume is applied (0.5 of 0.37 peak)',
    info.peak > 0.12 && info.peak < 0.26,
    info.peak.toFixed(3),
  );

  // a name typed by the user is used as is
  await page.fill('#export-name', 'Latihan:solo');
  const second = page.waitForEvent('download', { timeout: 120000 });
  await page.click('#export-start');
  const d2 = await second;
  check(
    'an edited name is used, with illegal characters removed by the browser or app',
    /^Latihan.?solo\.mp3$/.test(d2.suggestedFilename()),
    d2.suggestedFilename(),
  );

  // cancel
  await page.click('#export-start');
  await page.waitForSelector('#export-cancel', { timeout: 5000 });
  await page.click('#export-cancel');
  await page.waitForFunction(() => !window.__musik.player.exportBusy, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const cancelled = await page.textContent('#export-message');
  check(
    'cancelling stops the export with a message',
    /dibatalkan/i.test(cancelled ?? ''),
    cancelled?.trim() ?? '',
  );

  await page.screenshot({ path: path.join(artifacts, 'export.png') });
  check('no console errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
