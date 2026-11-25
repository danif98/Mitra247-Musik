// Makes the images of the Google Play listing from the Play edition web build:
// phone screenshots (1080x1920), the feature graphic (1024x500) and the store icon (512x512).
//   npm run play:listing        (builds out/app-play first)
// Output: play-store/metadata/android/<locale>/images/ (see play-store/README.md).
// Play wants JPEG or 24-bit PNG without alpha for screenshots and the feature graphic, so those
// are JPEG. The icon must be a 32-bit PNG.
import { chromium } from 'playwright-core';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startStaticServer } from '../e2e/static-server.mjs';
import { root, runNode } from './lib.mjs';

const LOCALES = ['id-ID', 'en-US'];
const meta = (locale) => path.join(root, 'play-store', 'metadata', 'android', locale, 'images');
const tmp = path.join(root, '.scratch', 'play-listing');
mkdirSync(tmp, { recursive: true });

process.env.MUSIK_EDITION = 'play';
runNode(path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), ['build'], {
  cwd: path.join(root, 'app-pwa'),
});

const { server, port } = await startStaticServer(path.join(root, 'out', 'app-play'), 0);
const base = `http://127.0.0.1:${port}`;
const launchArgs = ['--autoplay-policy=no-user-gesture-required'];
let browser;
try {
  browser = await chromium.launch({ args: launchArgs });
} catch {
  browser = await chromium.launch({ channel: 'chrome', args: launchArgs });
}

const shots = [];
try {
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(`${base}/?test`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__musik?.player?.engineState === 'ready', null, {
    timeout: 60000,
  });

  // Original practice pieces made on the spot (no copyrighted music in the screenshots).
  await page.evaluate(async () => {
    const rate = 11025;
    const hz = (n) => 220 * 2 ** (n / 12);
    const piece = (seconds, notes, beat) => {
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
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        const step = Math.floor(t / beat);
        const local = t - step * beat;
        const env = Math.exp(-local * 3.2) * (0.35 + 0.65 * Math.min(1, local * 60));
        const f = hz(notes[step % notes.length]);
        // a plucked tone with a few overtones, plus a soft bass note on every fourth beat
        let s = Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t);
        s += 0.25 * Math.sin(6 * Math.PI * f * t);
        s *= env;
        if (step % 4 === 0) s += 0.6 * Math.sin(Math.PI * f * t) * Math.exp(-local * 1.6);
        v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * 0.5)) * 30000, true);
      }
      return buf;
    };
    const defs = [
      ['Etude Pagi', [0, 4, 7, 12, 7, 4], 0.34],
      ['Balada Senja', [0, 3, 7, 10, 7, 3], 0.48],
      ['Blues Santai', [0, 3, 5, 6, 7, 10], 0.4],
      ['Waltz Malam', [0, 7, 12, 7, 4, 7], 0.3],
      ['Latihan Tangga Nada', [0, 2, 4, 5, 7, 9, 11, 12], 0.28],
    ];
    const files = defs.map(
      ([name, notes, beat]) =>
        new File([piece(48, notes, beat)], `${name}.wav`, { type: 'audio/wav' }),
    );
    await window.__musik.player.addFiles(files);
  });
  await page.waitForFunction(() => window.__musik.player.songs.length >= 5);

  /** @param {string} file @param {string} what */
  async function shot(file, what) {
    await page.waitForTimeout(900);
    const out = path.join(tmp, file);
    await page.screenshot({ path: out, type: 'jpeg', quality: 92 });
    shots.push({ file, what, out });
    console.log(`screenshot: ${file} (${what})`);
  }

  // 1. Library
  await page.click('#tab-library');
  await shot('1_library.jpg', 'Library');

  // 2. Play screen, queue
  await page.evaluate(async () => {
    const p = window.__musik.player;
    await p.select(
      p.songs.find((s) => s.title === 'Balada Senja'),
      false,
    );
    p.seek(14);
  });
  await page.click('#tab-play');
  await page.waitForSelector('#song-title');
  await shot('2_play_queue.jpg', 'Putar: antrean');

  // 3. Practice: slower tempo, higher key, loop A-B, Minus One
  await page.click('#ptab-practice');
  await page.evaluate(() => {
    const p = window.__musik.player;
    p.setTempo(0.8);
    p.setSemitone(2);
    p.seek(10);
    p.setLoopA();
    p.seek(22);
    p.setLoopB();
    p.seek(12);
    p.setMinusOne(true);
  });
  await shot('3_practice.jpg', 'Putar: latihan (tempo, kunci, loop, Minus One)');

  // 4. Search for legal music
  await page.click('#tab-search');
  await shot('4_search.jpg', 'Cari musik legal');

  // 5. Settings / About
  await page.click('#tab-settings');
  await shot('5_settings.jpg', 'Setelan');
  await context.close();

  // Feature graphic: icon, name, tagline and the practice screen in a phone frame.
  const uri = (file, mime) => `data:${mime};base64,${readFileSync(file).toString('base64')}`;
  const icon = uri(path.join(root, 'app-pwa', 'public', 'icon-512.png'), 'image/png');
  const phone = uri(shots[2].out, 'image/jpeg');
  const html = `<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0}
    body{width:1024px;height:500px;overflow:hidden;position:relative;color:#fff;
      font-family:'Segoe UI',system-ui,sans-serif;
      background:radial-gradient(circle at 15% 20%,#16324a 0,#0f1115 62%)}
    .copy{position:absolute;left:56px;top:70px;width:560px}
    .brand{display:flex;align-items:center;gap:18px;margin-bottom:26px}
    .brand img{width:76px;height:76px;border-radius:18px}
    .brand b{font-size:46px;letter-spacing:-.5px}
    h1{font-size:40px;line-height:1.18;font-weight:700;margin-bottom:22px}
    h1 span{color:#4fc3ff}
    ul{list-style:none;padding:0;font-size:22px;color:#c9d6e2;line-height:1.55}
    li:before{content:'';display:inline-block;width:9px;height:9px;border-radius:50%;
      background:#4fc3ff;margin-right:12px;vertical-align:middle}
    .phone{position:absolute;right:70px;top:34px;width:236px;height:420px;border-radius:30px;
      border:7px solid #2a3340;background:#000;overflow:hidden;box-shadow:0 18px 50px #0008;
      transform:rotate(4deg)}
    .phone img{width:100%;height:100%;object-fit:cover;object-position:top}
    </style>
    <div class="copy">
      <div class="brand"><img src="${icon}"><b>Music Player</b></div>
      <h1>Perlambat lagu. <span>Ganti kunci.</span><br>Berlatih lebih cepat.</h1>
      <ul><li>Tempo tanpa mengubah nada</li><li>Minus One, loop A-B, metronom</li>
      <li>Tanpa akun, tanpa iklan</li></ul>
    </div>
    <div class="phone"><img src="${phone}"></div>`;
  const gfx = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await gfx.setContent(html);
  await gfx.waitForTimeout(400);
  const featurePath = path.join(tmp, 'featureGraphic.jpg');
  await gfx.screenshot({ path: featurePath, type: 'jpeg', quality: 95 });
  await gfx.close();

  for (const locale of LOCALES) {
    const dir = meta(locale);
    rmSync(path.join(dir, 'phoneScreenshots'), { recursive: true, force: true });
    mkdirSync(path.join(dir, 'phoneScreenshots'), { recursive: true });
    for (const s of shots) copyFileSync(s.out, path.join(dir, 'phoneScreenshots', s.file));
    copyFileSync(featurePath, path.join(dir, 'featureGraphic.jpg'));
    copyFileSync(path.join(root, 'app-pwa', 'public', 'icon-512.png'), path.join(dir, 'icon.png'));
  }
  writeFileSync(
    path.join(tmp, 'shots.json'),
    JSON.stringify(
      shots.map(({ file, what }) => ({ file, what })),
      null,
      2,
    ),
  );
  console.log(
    `\nDone: ${shots.length} screenshots, feature graphic and icon for ${LOCALES.join(', ')}.`,
  );
} finally {
  await browser.close();
  server.close();
}
