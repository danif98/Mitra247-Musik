// E2E for the Play screen: now-playing card, queue list, Antrean / Latihan tabs and "last played"
// (the queue and song come back, paused, after a reload). Requires `npm run build`.
// Usage: node e2e/playscreen.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
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
let browser;
try {
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
} catch {
  browser = await chromium.launch({
    channel: 'chrome',
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
}
const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) {
    errors.push(m.text());
  }
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

/** Elements that stick out of the viewport's width (a layout bug on phones). */
async function overflowing() {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll('main *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > w + 1) {
        out.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ')[0]} right=${Math.round(r.right)}`,
        );
      }
    }
    return { scroll: document.documentElement.scrollWidth, width: w, out: out.slice(0, 8) };
  });
}

async function ready() {
  await page.waitForFunction(() => window.__musik?.player?.engineState === 'ready', null, {
    timeout: 60000,
  });
  await page
    .waitForFunction(() => window.__musik.player.songs.length > 0, null, { timeout: 10000 })
    .catch(() => undefined);
}

try {
  await page.goto(`${base}/?test`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__musik?.player?.engineState === 'ready', null, {
    timeout: 60000,
  });

  // three songs in the library
  await page.evaluate(async () => {
    const wav = (seconds, freq) => {
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
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / freq) * 8000, true);
      return buf;
    };
    const files = ['Lagu Alfa', 'Lagu Beta', 'Lagu Gamma'].map(
      (name, i) => new File([wav(30, 6 + i * 3)], `${name}.wav`, { type: 'audio/wav' }),
    );
    await window.__musik.player.addFiles(files);
  });
  const titles = await page.evaluate(() => window.__musik.player.songs.map((s) => s.title).sort());
  check('three songs in the library', titles.length === 3, titles.join());

  // play the middle one (by title), then look at the Play screen
  await page.evaluate(async () => {
    const p = window.__musik.player;
    const song = p.songs.find((s) => s.title === 'Lagu Beta');
    await p.select(song);
  });
  await page.click('#tab-play');
  await page.waitForSelector('#song-title');
  check(
    'now-playing card shows the title and the list origin',
    (await page.locator('#song-title').innerText()) === 'Lagu Beta' &&
      (await page.locator('#queue-source').innerText()).toLowerCase() === 'library',
  );
  check(
    'the queue tab is open by default and lists the last list',
    (await page.locator('#ptab-queue').getAttribute('aria-selected')) === 'true' &&
      (await page.locator('#queue-list .row').count()) === 3,
  );
  const cur = await page.locator('#queue-list .row[aria-current="true"] .name').innerText();
  check('the playing song is marked in the list', cur === 'Lagu Beta', cur);
  check(
    'queue position is shown',
    (await page.locator('#queue-pos').innerText()).replace(/\s+/g, ' ').match(/\d \/ 3/) !== null,
  );
  const ovQ = await overflowing();
  check(
    'queue tab fits the screen width',
    ovQ.scroll <= ovQ.width && ovQ.out.length === 0,
    JSON.stringify(ovQ),
  );
  await page.screenshot({ path: path.join(artifacts, 'playscreen-queue.png'), fullPage: true });

  // tap another row
  const rows = await page.locator('#queue-list .row .name').allInnerTexts();
  const other = rows.findIndex((r) => r !== 'Lagu Beta');
  await page.locator(`#queue-list .row[data-index="${other}"]`).click();
  await page.waitForFunction(
    (t) => document.querySelector('#song-title')?.textContent === t,
    rows[other],
  );
  check('tapping a row plays that song', true, rows[other]);

  // practice tab
  await page.click('#ptab-practice');
  await page.waitForSelector('#loop-a');
  check(
    'the practice tab has the tempo, key and tools',
    (await page.locator('#loop-a').count()) === 1 &&
      (await page.locator('#queue-list').count()) === 0,
  );
  const ovP = await overflowing();
  check(
    'practice tab fits the screen width',
    ovP.scroll <= ovP.width && ovP.out.length === 0,
    JSON.stringify(ovP),
  );
  await page.screenshot({ path: path.join(artifacts, 'playscreen-practice.png'), fullPage: true });
  await page.click('#ptab-queue');

  // ------------------------------------------------------------------ practice mode (compact)
  await page.setViewportSize({ width: 384, height: 780 }); // about the A23 browser area
  await page.click('#ptab-practice');
  await page.waitForSelector('#loop-a');
  const compact = await page.evaluate(() => {
    const p = window.__musik.player;
    const nav = document.querySelector('nav')?.getBoundingClientRect().height ?? 0;
    const last = [...document.querySelectorAll('main .card')].pop();
    return {
      repeat: p.repeat,
      stored: JSON.parse(localStorage.getItem('musik.playmode') ?? '{}').repeat ?? null,
      bottom: Math.round(last?.getBoundingClientRect().bottom ?? 9999),
      limit: Math.round(window.innerHeight - nav),
      shuffle: document.querySelectorAll('#mode-shuffle').length,
      autonext: document.querySelectorAll('#mode-autonext').length,
      stop: document.querySelectorAll('#stop').length,
      play: Math.round(document.querySelector('#play').getBoundingClientRect().width),
    };
  });
  check(
    'practice mode fits the screen without scrolling (controls end above the nav bar)',
    compact.bottom <= compact.limit,
    JSON.stringify(compact),
  );
  check(
    'practice mode hides shuffle, auto next and stop',
    compact.shuffle === 0 && compact.autonext === 0 && compact.stop === 0,
  );
  check('the play button is smaller in practice mode', compact.play <= 56, String(compact.play));
  check(
    'practice mode repeats the current song by default (without changing the saved setting)',
    compact.repeat === 'one' && compact.stored !== 'one',
    JSON.stringify([compact.repeat, compact.stored]),
  );
  // a temporary (opened, unsaved) song: "save to library" is hidden in practice mode only
  await page.evaluate(async () => {
    const f = new File([new Uint8Array(100)], 'Berkas Uji.wav', { type: 'audio/wav' });
    await window.__musik.player.playFiles([f]);
  });
  await page.waitForTimeout(200);
  check(
    'save-to-library is not shown in practice mode',
    (await page.locator('#save-temp').count()) === 0,
  );
  await page.click('#ptab-queue');
  check(
    'it is shown again in the queue view, with the controls back',
    (await page.locator('#save-temp').count()) === 1 &&
      (await page.locator('#mode-shuffle').count()) === 1 &&
      (await page.locator('#stop').count()) === 1,
  );
  const back = await page.evaluate(() => window.__musik.player.repeat);
  check('leaving practice mode restores the usual repeat setting', back !== 'one', back);
  // a repeat choice made inside practice mode is kept (usual setting: all -> practice: one -> off)
  await page.evaluate(() => window.__musik.player.setRepeat('all'));
  await page.click('#ptab-practice');
  const inPractice = await page.evaluate(() => window.__musik.player.repeat);
  await page.click('#mode-repeat');
  await page.click('#ptab-queue');
  const kept = await page.evaluate(() => window.__musik.player.repeat);
  check(
    'a repeat choice made in practice mode is kept when leaving',
    inPractice === 'one' && kept === 'off',
    `${inPractice} -> ${kept}`,
  );
  // end of the queue with repeat off: back to 0:00, stopped, and the hint says so
  await page.evaluate(() => window.__musik.player.audio.dispatchEvent(new Event('ended')));
  await page.waitForTimeout(200);
  const done = await page.evaluate(() => {
    const p = window.__musik.player;
    return {
      ended: p.queueEnded,
      playing: p.playing,
      position: p.position,
      hint: document.querySelector('#mode-hint')?.textContent?.trim() ?? '',
    };
  });
  check(
    'end of the queue: stopped at 0:00 with "Antrean selesai"',
    done.ended && !done.playing && done.position === 0 && done.hint === 'Antrean selesai',
    JSON.stringify(done),
  );
  await page.setViewportSize({ width: 412, height: 915 });
  await page.evaluate(async () => {
    const p = window.__musik.player;
    await p.select(p.songs.find((s) => s.title === 'Lagu Beta'));
    p.pause();
  });

  // last played: seek, pause, reload
  const playing = await page.evaluate(async () => {
    const p = window.__musik.player;
    p.seek(7);
    p.pause();
    return { title: p.current.title, index: p.queueIndex };
  });
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'load' });
  await ready();
  await page.waitForSelector('#song-title', { timeout: 15000 });
  await page.waitForFunction(() => window.__musik.player.current !== null, null, {
    timeout: 15000,
  });
  const restored = await page.evaluate(() => {
    const p = window.__musik.player;
    return {
      title: p.current?.title,
      index: p.queueIndex,
      queue: p.queue.length,
      playing: p.playing,
      position: Math.round(p.position),
      label: p.queueLabel,
    };
  });
  check(
    'after a reload the last song and list come back',
    restored.title === playing.title && restored.index === playing.index && restored.queue === 3,
    JSON.stringify(restored),
  );
  check('it comes back paused, not playing', restored.playing === false);
  check(
    'it resumes where it stopped',
    restored.position >= 6 && restored.position <= 8,
    String(restored.position),
  );
  check('the list origin is remembered', restored.label === 'Library', restored.label);
  check(
    'the Play screen is shown with the list',
    (await page.locator('#tab-play[aria-current="page"]').count()) === 1 &&
      (await page.locator('#queue-list .row').count()) === 3,
  );

  // a phone list cannot be restored outside the Android app: no crash, no half-state
  await page.evaluate(() => {
    localStorage.setItem(
      'musik.last',
      JSON.stringify({
        v: 1,
        source: 'device',
        label: 'Musik di HP',
        index: 0,
        tracks: [
          {
            uri: 'content://media/external/audio/media/1',
            title: 'X',
            artist: '',
            fileName: 'x.mp3',
            size: 1,
            duration: 5,
            mime: 'audio/mpeg',
          },
        ],
      }),
    );
  });
  await page.reload({ waitUntil: 'load' });
  await ready();
  const dev = await page.evaluate(() => ({
    current: window.__musik.player.current?.title ?? null,
    error: window.__musik.player.error,
  }));
  check(
    'a phone list is ignored in a browser',
    dev.current === null && dev.error === '',
    JSON.stringify(dev),
  );

  // a broken value is ignored too
  await page.evaluate(() => localStorage.setItem('musik.last', '{broken'));
  await page.reload({ waitUntil: 'load' });
  await ready();
  check(
    'broken stored data is ignored',
    (await page.evaluate(() => window.__musik.player.current)) === null,
  );

  check('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('unexpected exception', false, String(err?.stack ?? err));
  try {
    await page.screenshot({ path: path.join(artifacts, 'playscreen-failure.png'), fullPage: true });
  } catch {
    /* ignore */
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
writeFileSync(path.join(artifacts, 'playscreen-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
