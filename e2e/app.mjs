// E2E for the M1 PWA (library, player, minus one, persistence, offline) in Chromium via Playwright.
// Requires `npm run build`. Usage: node e2e/app.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
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

/** Goertzel magnitude (linear amplitude estimate) at one frequency. */
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
  const power = s1 * s1 + s2 * s2 - c * s1 * s2;
  return (2 * Math.sqrt(Math.max(power, 0))) / (samples.length * 0.5);
}
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

// Test audio: stereo "song": centred vocal 440 Hz, guitar 330 Hz left only, keys 550 Hz right only.
const SR = 44100;
const secs = 20;
const vocal = generateSine(440, SR, secs, 0.3);
const guitar = generateSine(330, SR, secs, 0.25);
const keys = generateSine(550, SR, secs, 0.25);
const left = vocal.map((v, i) => v + guitar[i]);
const right = vocal.map((v, i) => v + keys[i]);
const songPath = path.join(artifacts, 'Lagu_Uji_Stereo.wav');
writeFileSync(songPath, encodeWav([left, right], SR));
const tonePath = path.join(artifacts, 'nada-220.wav');
writeFileSync(tonePath, encodeWav([generateSine(220, SR, 8, 0.5)], SR));

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
console.log('Browser:', browser.version());
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

try {
  await page.goto(`${base}/?test`, { waitUntil: 'load' });
  await ready();
  check('app loads, engine ready', true);

  const emptyText = await page.textContent('.empty');
  check(
    'empty library state shown',
    /masih kosong/.test(emptyText ?? ''),
    emptyText?.trim().slice(0, 60),
  );

  // 1. Add files.
  await page.setInputFiles('#add-files', [songPath, tonePath]);
  await page.waitForFunction(() => document.querySelectorAll('#song-list li').length === 2, null, {
    timeout: 30000,
  });
  const songs = await page.evaluate(() =>
    window.__musik.player.songs.map((s) => ({
      title: s.title,
      duration: s.duration,
      peaks: s.peaks.length,
      size: s.size,
    })),
  );
  console.log('Songs:', JSON.stringify(songs));
  const stereo = songs.find((s) => s.title === 'Lagu Uji Stereo');
  check('files added with title from file name', !!stereo && songs.length === 2);
  check(
    'duration and waveform peaks computed',
    stereo && Math.abs(stereo.duration - secs) < 0.2 && stereo.peaks === 600,
    JSON.stringify(stereo),
  );
  await page.screenshot({ path: path.join(artifacts, 'app-library.png'), fullPage: true });

  // 2. Persistence across reload (OPFS + IndexedDB).
  await page.reload({ waitUntil: 'load' });
  await ready();
  const afterReload = await page.evaluate(() => window.__musik.player.songs.length);
  check('library persists after reload (OPFS + IndexedDB)', afterReload === 2, String(afterReload));
  // App opens on the player tab when songs exist; go to library.
  await page.click('#tab-library');

  // 3. Search.
  await page.fill('input[type=search]', 'nada');
  const filtered = await page.locator('#song-list li').count();
  check('search filters the list', filtered === 1, String(filtered));
  await page.fill('input[type=search]', '');

  // 4. Play a song.
  await page.locator('#song-list li', { hasText: 'Lagu Uji Stereo' }).locator('.open').click();
  await page.waitForSelector('#play');
  await page.waitForFunction(() => window.__musik.player.position > 1.0, null, { timeout: 15000 });
  const playing = await page.evaluate(() => ({
    playing: window.__musik.player.playing,
    ctx: window.__musik.player.engine.context.state,
    title: document.getElementById('song-title')?.textContent,
  }));
  check(
    'tapping a song plays it (context running)',
    playing.playing && playing.ctx === 'running',
    JSON.stringify(playing),
  );
  const ms = await page.evaluate(() => navigator.mediaSession.metadata?.title ?? null);
  check('Media Session metadata set', ms === 'Lagu Uji Stereo', String(ms));
  await page.screenshot({ path: path.join(artifacts, 'app-player.png'), fullPage: true });

  // 5. Pause / seek / skip.
  await page.click('#play');
  const paused = await page
    .waitForFunction(() => !window.__musik.player.playing, null, { timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  check('pause works', paused);
  await page.click('[aria-label="Maju 5 detik"]');
  const posAfterSkip = await page.evaluate(() => window.__musik.player.position);
  check('skip +5 s moves the position', posAfterSkip > 4.5, posAfterSkip.toFixed(1));
  await page.click('#play');

  // 6. Tempo and key via the UI.
  await page.click('button[aria-label="TEMPO −"]');
  await page.click('button[aria-label="TEMPO −"]');
  await page.click('button[aria-label="KUNCI +"]');
  await page.click('button[aria-label="KUNCI +"]');
  await page.click('button[aria-label="KUNCI +"]');
  await page.waitForTimeout(400);
  const ui = await page.evaluate(() => {
    const p = window.__musik.player;
    return {
      tempo: p.tempo,
      semitone: p.semitone,
      rate: p.audio.playbackRate,
      preserves: p.audio.preservesPitch,
      ratio: p.engine.currentPitchRatio,
      path: p.engine.currentPath,
      eng: p.engine.currentEngine,
    };
  });
  check(
    'UI tempo 0.90x / +3 st, path A + R2 defaults',
    Math.abs(ui.tempo - 0.9) < 1e-6 &&
      ui.semitone === 3 &&
      Math.abs(ui.rate - 0.9) < 1e-6 &&
      ui.preserves === false &&
      ui.path === 'A' &&
      ui.eng === 'R2',
    JSON.stringify(ui),
  );
  await page.click('.chip >> text=0.75×');
  await page.waitForTimeout(300);
  const chip = await page.evaluate(() => window.__musik.player.tempo);
  check('tempo preset chip 0.75x', Math.abs(chip - 0.75) < 1e-6, String(chip));

  // 6a. Reset icons (no text buttons)
  await page.click('button[aria-label="TEMPO: Reset"]');
  await page.click('button[aria-label="KUNCI: Reset"]');
  await page.waitForTimeout(300);
  const reset = await page.evaluate(() => ({
    t: window.__musik.player.tempo,
    k: window.__musik.player.semitone,
  }));
  check(
    'reset icons restore tempo 1.00x and key 0',
    reset.t === 1 && reset.k === 0,
    JSON.stringify(reset),
  );
  check(
    'reset icons disabled at default values',
    (await page.isDisabled('button[aria-label="TEMPO: Reset"]')) === true,
  );
  check(
    'no "Tahan untuk reset" text left',
    !(await page.textContent('body')).includes('Tahan untuk reset'),
  );

  // 6b. Info popover for minus one
  await page.click('#mo-info');
  check(
    'minus one info shows the "results vary" note',
    /Hasil bervariasi/.test((await page.textContent('#mo-note')) ?? ''),
  );
  await page.click('#mo-info');

  // 6c. Queue: stop, previous, next, auto-advance
  const title = () => page.textContent('#song-title');
  check('next is disabled on the last track', await page.isDisabled('#next'));
  await page.click('#stop');
  await page.waitForFunction(
    () => !window.__musik.player.playing && window.__musik.player.position < 0.3,
    null,
    { timeout: 5000 },
  );
  check('stop pauses and returns to 0:00', true);
  await page.click('#prev');
  await page.waitForFunction(
    () => document.getElementById('song-title')?.textContent === 'nada-220',
    null,
    { timeout: 8000 },
  );
  check('previous (near the start) goes to the previous track and plays', true);
  check(
    'queue position shown (1 / 2)',
    ((await page.textContent('#queue-pos')) ?? '').trim() === '1 / 2',
  );
  await page.click('#next');
  await page.waitForFunction(
    () => document.getElementById('song-title')?.textContent === 'Lagu Uji Stereo',
    null,
    { timeout: 8000 },
  );
  check('next goes to the next track', true);
  await page.evaluate(() => window.__musik.player.seek(5));
  await page.waitForTimeout(300);
  await page.click('#prev');
  await page.waitForFunction(() => window.__musik.player.audio.currentTime < 1, null, {
    timeout: 5000,
  });
  check('previous after 3 s restarts the current track', (await title()) === 'Lagu Uji Stereo');
  await page.click('#prev');
  await page.waitForFunction(
    () => document.getElementById('song-title')?.textContent === 'nada-220',
    null,
    { timeout: 8000 },
  );
  await page.waitForFunction(() => Number.isFinite(window.__musik.player.audio.duration), null, {
    timeout: 8000,
  });
  await page.evaluate(() => {
    const p = window.__musik.player;
    p.seek(p.audio.duration - 0.8);
  });
  await page.waitForFunction(
    () => document.getElementById('song-title')?.textContent === 'Lagu Uji Stereo',
    null,
    { timeout: 10000 },
  );
  check('track end advances to the next track automatically', true);
  await page.evaluate(() => {
    window.__musik.player.audio.loop = true; // keep the tone going for the numeric checks below
    window.__musik.player.seek(0);
  });

  // 7. Numeric: pitch through the real app pipeline (tempo 1, +12 -> 880 Hz from the 440 vocal).
  const capture = async () => {
    const data = await page.evaluate(async () => {
      const p = window.__musik.player;
      const e = p.engine;
      const an = e.context.createAnalyser();
      an.fftSize = 32768;
      e.output.connect(an);
      await new Promise((r) => setTimeout(r, 1300));
      const buf = new Float32Array(32768);
      an.getFloatTimeDomainData(buf);
      e.output.disconnect(an);
      return { samples: Array.from(buf), sr: e.context.sampleRate };
    });
    return { samples: Float32Array.from(data.samples), sr: data.sr };
  };
  await page.evaluate(() => {
    const p = window.__musik.player;
    p.setTempo(1);
    p.setSemitone(0);
    p.setMinusOne(false);
  });
  await page.waitForTimeout(600);
  const off = await capture();
  const levels = (c) => ({
    v440: toneLevel(c.samples, c.sr, 440),
    g330: toneLevel(c.samples, c.sr, 330),
    k550: toneLevel(c.samples, c.sr, 550),
  });
  const lOff = levels(off);

  // 8. Minus one: centred vocal drops, side instruments stay.
  await page.click('#mo');
  check(
    'minus one toggle shows pressed state',
    (await page.getAttribute('#mo', 'aria-pressed')) === 'true',
  );
  await page.waitForTimeout(500);
  const on = await capture();
  const lOn = levels(on);
  const vocalDrop = db(lOff.v440) - db(lOn.v440);
  const guitarChange = db(lOn.g330) - db(lOff.g330);
  const keysChange = db(lOn.k550) - db(lOff.k550);
  console.log(
    `Minus one levels (dBFS) off: 440=${db(lOff.v440).toFixed(1)} 330=${db(lOff.g330).toFixed(1)} 550=${db(lOff.k550).toFixed(1)}; on: 440=${db(lOn.v440).toFixed(1)} 330=${db(lOn.g330).toFixed(1)} 550=${db(lOn.k550).toFixed(1)}`,
  );
  check(
    'minus one: centred vocal (440 Hz) reduced by > 30 dB',
    vocalDrop > 30,
    `${vocalDrop.toFixed(1)} dB`,
  );
  check(
    'minus one: side instruments kept (330 / 550 Hz within -9..+3 dB)',
    guitarChange > -9 && guitarChange < 3 && keysChange > -9 && keysChange < 3,
    `330: ${guitarChange.toFixed(1)} dB, 550: ${keysChange.toFixed(1)} dB`,
  );
  await page.click('#mo');
  await page.waitForTimeout(500);
  const back = levels(await capture());
  check(
    'minus one off restores the vocal',
    db(back.v440) - db(lOff.v440) > -3,
    `${(db(back.v440) - db(lOff.v440)).toFixed(1)} dB`,
  );

  await page.evaluate(() => window.__musik.player.setSemitone(12));
  await page.waitForTimeout(900);
  const shifted = await capture();
  const f880 = toneLevel(shifted.samples, shifted.sr, 880);
  const f440 = toneLevel(shifted.samples, shifted.sr, 440);
  check(
    'transpose +12 st moves the 440 Hz vocal to 880 Hz',
    db(f880) - db(f440) > 15,
    `880: ${db(f880).toFixed(1)} dBFS, 440: ${db(f440).toFixed(1)} dBFS`,
  );
  await page.evaluate(() => window.__musik.player.setSemitone(0));

  // 8b. Open & play without saving
  await page.click('#tab-library');
  const libBefore = await page.evaluate(() => window.__musik.player.songs.length);
  await page.setInputFiles('#open-play', [tonePath, songPath]);
  await page.waitForSelector('#save-temp');
  await page.waitForFunction(() => window.__musik.player.position > 0.5, null, { timeout: 15000 });
  const opened = await page.evaluate(async () => {
    const p = window.__musik.player;
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('songs');
    let files = 0;
    for await (const _e of dir.keys()) files++;
    return {
      songs: p.songs.length,
      queue: p.queue.length,
      temp: p.currentIsTemp,
      title: p.current.title,
      opfs: files,
    };
  });
  check(
    'open & play: plays the picked file as a temporary queue',
    opened.temp && opened.queue === 2 && opened.title === 'nada-220',
    JSON.stringify(opened),
  );
  check(
    'open & play: nothing is copied to the library or OPFS',
    opened.songs === libBefore && opened.opfs === libBefore,
    JSON.stringify(opened),
  );
  await page.waitForFunction(() => window.__musik.player.current.peaks.length === 600, null, {
    timeout: 15000,
  });
  check('open & play: waveform is computed after playback starts', true);
  await page.click('#next');
  await page.waitForFunction(
    () => document.getElementById('song-title')?.textContent === 'Lagu Uji Stereo',
  );
  await page.click('#save-temp');
  await page.waitForFunction((n) => window.__musik.player.songs.length === n + 1, libBefore, {
    timeout: 15000,
  });
  check(
    'temporary track can be saved to the library',
    (await page.locator('#save-temp').count()) === 0,
  );
  await page.evaluate(async () => {
    const p = window.__musik.player;
    const extra =
      p.songs.find(
        (s) => s.title === 'Lagu Uji Stereo' && s.id !== p.songs[p.songs.length - 1]?.id,
      ) ?? null;
    const saved = p.current;
    void extra;
    await p.remove(saved);
  });
  await page.waitForFunction((n) => window.__musik.player.songs.length === n, libBefore);
  check('library back to its previous size after removing the saved copy', true);

  // 9. Rename + delete.
  await page.click('#tab-library');
  page.once('dialog', (d) => d.accept('Judul Baru'));
  await page
    .locator('#song-list li', { hasText: 'nada-220' })
    .locator('button[aria-label^="Ubah nama"]')
    .click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#song-list .name')].some((n) => n.textContent === 'Judul Baru'),
  );
  check('rename song', true);
  page.once('dialog', (d) => d.accept());
  await page
    .locator('#song-list li', { hasText: 'Judul Baru' })
    .locator('button[aria-label^="Hapus"]')
    .click();
  await page.waitForFunction(() => document.querySelectorAll('#song-list li').length === 1);
  check('delete song (metadata + file)', true);

  // 10. Settings: engine choice persists; storage usage shown.
  await page.click('#tab-settings');
  await page.click('#set-r3');
  await page.waitForTimeout(500);
  const eng = await page.evaluate(() => ({
    kind: window.__musik.player.engineKind,
    ls: localStorage.getItem('musik.engine'),
  }));
  check(
    'settings: engine R3 selectable and remembered',
    eng.kind === 'R3' && eng.ls === 'R3',
    JSON.stringify(eng),
  );
  await page.click('#set-r2');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download-log')]);
  const logFile = path.join(artifacts, 'app-log.json');
  await dl.saveAs(logFile);
  const logJson = JSON.parse(readFileSync(logFile, 'utf8'));
  const kinds = new Set(logJson.events.map((e) => e.kind));
  check(
    'settings: diagnostic log downloads (events, samples, library, storage)',
    logJson.app === 'musik-app-m1' &&
      logJson.samples.length > 0 &&
      kinds.has('song') &&
      kinds.has('minusOne') &&
      kinds.has('semitone') &&
      Array.isArray(logJson.library) &&
      logJson.storage.quota > 0,
    `events=${logJson.events.length} samples=${logJson.samples.length}`,
  );
  const usage = await page.textContent('#usage');
  check('settings: storage usage shown', /\d/.test(usage ?? ''), usage ?? '');
  await page.screenshot({ path: path.join(artifacts, 'app-settings.png'), fullPage: true });

  check('no console errors', errors.length === 0, errors.join(' | '));
  errors.length = 0;

  // 11. Offline: library still lists songs and the player opens.
  await page.waitForFunction(
    () => navigator.serviceWorker.getRegistration().then((r) => !!r?.active),
    null,
    { timeout: 15000 },
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, {
    timeout: 10000,
  });
  await context.setOffline(true);
  const off2 = await context.newPage();
  off2.on('pageerror', (e) => errors.push(`offline: ${e.message}`));
  await off2.goto(`${base}/?test`, { waitUntil: 'load' });
  await off2.waitForFunction(() => window.__musik?.player?.engineState === 'ready', null, {
    timeout: 20000,
  });
  const offlineSongs = await off2.evaluate(() => window.__musik.player.songs.length);
  check('offline: app starts and library is intact', offlineSongs === 1, String(offlineSongs));
  await off2.evaluate(async () => {
    const p = window.__musik.player;
    await p.select(p.songs[0]);
  });
  await off2.waitForFunction(() => window.__musik.player.position > 1, null, { timeout: 15000 });
  check('offline: local song plays', true);
  check('offline: no errors', errors.length === 0, errors.join(' | '));
  await context.setOffline(false);

  // 12. Clear data.
  await page.click('#tab-settings');
  page.once('dialog', (d) => d.accept());
  await page.click('#clear-data');
  await page.waitForFunction(() => window.__musik.player.songs.length === 0);
  check('settings: clear all local data', true);
} catch (err) {
  check('unexpected exception', false, String(err?.stack ?? err));
  try {
    await page.screenshot({ path: path.join(artifacts, 'app-failure.png'), fullPage: true });
  } catch {
    /* ignore */
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
writeFileSync(path.join(artifacts, 'app-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
