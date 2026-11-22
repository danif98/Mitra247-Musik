// E2E for the practice tools (M3-B): loop A-B, equalizer, metronome, count-in and per-song presets,
// in Chromium against the built PWA. Requires `npm run build`. Usage: node e2e/practice.mjs
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
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

// Stereo test song (vocal 440 centre, 330 left, 550 right), 40 s so loops have room.
const SR = 44100;
const vocal = generateSine(440, SR, 40, 0.3);
const guitar = generateSine(330, SR, 40, 0.25);
const keys = generateSine(550, SR, 40, 0.25);
const songPath = path.join(artifacts, 'Latihan_Satu.wav');
writeFileSync(
  songPath,
  encodeWav([vocal.map((v, i) => v + guitar[i]), vocal.map((v, i) => v + keys[i])], SR),
);
const song2Path = path.join(artifacts, 'Latihan_Dua.wav');
writeFileSync(song2Path, encodeWav([generateSine(220, SR, 20, 0.4)], SR));

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

async function capture(frames = 32768) {
  const data = await page.evaluate(async (n) => {
    const e = window.__musik.player.engine;
    const an = e.context.createAnalyser();
    an.fftSize = n;
    e.output.connect(an);
    await new Promise((r) => setTimeout(r, (n / e.context.sampleRate) * 1000 + 400));
    const buf = new Float32Array(n);
    an.getFloatTimeDomainData(buf);
    e.output.disconnect(an);
    return { samples: Array.from(buf), sr: e.context.sampleRate };
  }, frames);
  return { samples: Float32Array.from(data.samples), sr: data.sr };
}

async function openSong(name) {
  await page.click('#tab-library');
  await page.locator('#song-list li', { hasText: name }).locator('.open').click();
  await page.waitForFunction(
    (n) => document.getElementById('song-title')?.textContent === n,
    name,
    { timeout: 10000 },
  );
}

try {
  await page.goto(`${base}/?test`, { waitUntil: 'load' });
  await ready();
  await page.click('#tab-library');
  await page.setInputFiles('#add-files', [songPath, song2Path]);
  await page.waitForFunction(() => document.querySelectorAll('#song-list li').length === 2, null, {
    timeout: 30000,
  });
  await openSong('Latihan Satu');
  await page.waitForFunction(() => window.__musik.player.position > 0.5);

  // ---------------------------------------------------------------- loop A-B
  await page.evaluate(() => window.__musik.player.seek(3));
  await sleep(150);
  await page.click('#loop-a');
  await page.evaluate(() => window.__musik.player.seek(6));
  await sleep(150);
  await page.click('#loop-b');
  let lp = await page.evaluate(() => ({
    a: window.__musik.player.loopA,
    b: window.__musik.player.loopB,
  }));
  check(
    'loop: A and B set from the current position',
    Math.abs(lp.a - 3) < 0.4 && Math.abs(lp.b - 6) < 0.4,
    JSON.stringify(lp),
  );
  await page.screenshot({ path: path.join(artifacts, 'practice-loop.png'), fullPage: true });

  const watch = (ms) =>
    page.evaluate(async (ms) => {
      const p = window.__musik.player;
      const seen = [];
      const end = performance.now() + ms;
      while (performance.now() < end) {
        seen.push(p.audio.currentTime);
        await new Promise((r) => setTimeout(r, 20));
      }
      let wraps = 0;
      for (let i = 1; i < seen.length; i++) if (seen[i] < seen[i - 1] - 1) wraps++;
      return { min: Math.min(...seen), max: Math.max(...seen), wraps };
    }, ms);
  await page.evaluate(() => window.__musik.player.seek(5));
  const w1 = await watch(7000);
  check(
    'loop: playback stays within A..B and wraps around (tempo 1x)',
    w1.min > 2.7 && w1.max < 6.2 && w1.wraps >= 1,
    JSON.stringify(w1),
  );
  await page.evaluate(() => window.__musik.player.setTempo(2));
  await sleep(300);
  const w2 = await watch(4000);
  check(
    'loop: still bounded at tempo 2x',
    w2.min > 2.7 && w2.max < 6.3 && w2.wraps >= 2,
    JSON.stringify(w2),
  );
  await page.evaluate(() => window.__musik.player.setTempo(1));
  await page.evaluate(() => window.__musik.player.seek(15));
  await sleep(600);
  const free = await page.evaluate(() => window.__musik.player.audio.currentTime);
  check('loop: seeking outside the loop is allowed (not trapped)', free > 15, free.toFixed(2));
  await page.evaluate(() => window.__musik.player.seek(5));
  await page.click('#loop-clear');
  lp = await page.evaluate(() => ({
    a: window.__musik.player.loopA,
    b: window.__musik.player.loopB,
  }));
  check('loop: clear removes both points', lp.a === null && lp.b === null);
  check('loop: clear button disabled when there is no loop', await page.isDisabled('#loop-clear'));
  await page.evaluate(() => window.__musik.player.seek(10));
  await page.click('#loop-b');
  lp = await page.evaluate(() => ({
    a: window.__musik.player.loopA,
    b: window.__musik.player.loopB,
  }));
  check(
    'loop: B without A starts the loop at 0:00',
    lp.a === 0 && Math.abs(lp.b - 10) < 0.5,
    JSON.stringify(lp),
  );
  await page.click('#loop-clear');

  // ---------------------------------------------------------------- equalizer
  await page.click('#eq-toggle');
  await page.waitForSelector('#eq-panel');
  const flat = await capture();
  const lv = (c, f) => toneLevel(c.samples, c.sr, f);
  const base330 = db(lv(flat, 330));
  const base550 = db(lv(flat, 550));
  // 250 Hz band (index 1, peaking, Q=1)
  await page.evaluate(() => window.__musik.player.setEqBand(1, 12));
  await sleep(300);
  const boost = await capture();
  const up330 = db(lv(boost, 330)) - base330;
  const up550 = db(lv(boost, 550)) - base550;
  console.log(`EQ +12 dB @250 Hz: 330 Hz ${up330.toFixed(1)} dB, 550 Hz ${up550.toFixed(1)} dB`);
  check(
    'EQ: boosting the 250 Hz band lifts 330 Hz clearly (> +5 dB)',
    up330 > 5,
    `${up330.toFixed(1)} dB`,
  );
  check(
    'EQ: the same band affects the distant 550 Hz less',
    up550 < up330 - 2,
    `${up550.toFixed(1)} vs ${up330.toFixed(1)} dB`,
  );
  await page.evaluate(() => window.__musik.player.setEqBand(1, -12));
  await sleep(300);
  const cut = await capture();
  const down330 = db(lv(cut, 330)) - base330;
  check(
    'EQ: cutting the band lowers 330 Hz clearly (< -5 dB)',
    down330 < -5,
    `${down330.toFixed(1)} dB`,
  );
  await page.click('#eq-reset');
  await sleep(300);
  const back = await capture();
  const diff = Math.abs(db(lv(back, 330)) - base330);
  check('EQ: reset returns to flat (within 0.5 dB)', diff < 0.5, `${diff.toFixed(2)} dB`);
  const sliderCount = await page.locator('#eq-panel input[type=range]').count();
  check('EQ panel has 5 band sliders', sliderCount === 5, String(sliderCount));
  await page.click('#eq-toggle');

  // ---------------------------------------------------------------- metronome
  await page.evaluate(() => window.__musik.player.pause());
  await page.click('#metro-toggle');
  await page.waitForSelector('#metro-panel');
  await page.evaluate(() => {
    const p = window.__musik.player;
    p.setBpm(120);
    p.setBeatsPerBar(4);
  });
  await page.click('#metro-on');
  const clicks = await (async () => {
    await page.waitForTimeout(2600);
    return page.evaluate(() =>
      window.__musik.player.engine.metronome.scheduled.map((c) => ({ ...c })),
    );
  })();
  const gaps = clicks.slice(1).map((c, i) => c.time - clicks[i].time);
  check(
    'metronome: clicks scheduled at 120 BPM (0.5 s apart, +-3 ms on the audio clock)',
    clicks.length >= 4 && gaps.every((g) => Math.abs(g - 0.5) < 0.003),
    gaps.map((g) => g.toFixed(4)).join(' '),
  );
  check(
    'metronome: first beat of each bar is accented',
    clicks
      .slice(0, 5)
      .map((c) => c.accent)
      .join() === 'true,false,false,false,true',
    clicks
      .slice(0, 5)
      .map((c) => c.accent)
      .join(),
  );
  const click = await capture(16384);
  const peak = Math.max(...Array.from(click.samples, Math.abs));
  check('metronome: clicks are audible at the output', peak > 0.05, peak.toFixed(3));
  await page.evaluate(() => window.__musik.player.setBpm(60));
  const slowFrom = await page.evaluate(
    () => window.__musik.player.engine.metronome.scheduled.length,
  );
  await page.waitForTimeout(3300);
  const slow = await page.evaluate(
    (n) => window.__musik.player.engine.metronome.scheduled.slice(n).map((c) => c.time),
    slowFrom,
  );
  check(
    'metronome: changing BPM while running changes the click rate',
    slow.length >= 2 && slow.slice(1).some((t, i) => Math.abs(t - slow[i] - 1) < 0.01),
    slow.map((t) => t.toFixed(2)).join(' '),
  );
  await page.click('#metro-on');
  const stopped = await page.evaluate(() => window.__musik.player.engine.metronome.running);
  check('metronome: toggle off stops it', stopped === false);

  // ---------------------------------------------------------------- count-in
  await page.evaluate(() => {
    const p = window.__musik.player;
    p.setBpm(240);
    p.setBeatsPerBar(4);
    p.seek(0);
  });
  await page.click('#count-in');
  const countOn = await page.evaluate(() => window.__musik.player.countIn);
  check('count-in toggle on', countOn === true);
  const delay = await page.evaluate(async () => {
    const p = window.__musik.player;
    const t0 = performance.now();
    const pending = p.play();
    let sawCounting = false;
    while (p.audio.paused && performance.now() - t0 < 4000) {
      if (p.countingIn) sawCounting = true;
      await new Promise((r) => setTimeout(r, 10));
    }
    await pending;
    return { ms: performance.now() - t0, sawCounting, playing: !p.audio.paused };
  });
  check(
    'count-in: one bar at 240 BPM (about 1 s) before the song starts',
    delay.playing && delay.sawCounting && delay.ms > 850 && delay.ms < 1700,
    JSON.stringify(delay),
  );
  await page.evaluate(() => window.__musik.player.stop());
  const cancelled = await page.evaluate(async () => {
    const p = window.__musik.player;
    void p.play();
    await new Promise((r) => setTimeout(r, 300));
    p.stop();
    await new Promise((r) => setTimeout(r, 1800));
    return { paused: p.audio.paused, counting: p.countingIn, pos: p.audio.currentTime };
  });
  check(
    'count-in: stop during the count cancels the start',
    cancelled.paused && !cancelled.counting && cancelled.pos < 0.3,
    JSON.stringify(cancelled),
  );
  await page.click('#count-in');
  await page.click('#metro-toggle');

  // ---------------------------------------------------------------- per-song presets
  await page.evaluate(() => {
    const p = window.__musik.player;
    p.setTempo(0.8);
    p.setSemitone(2);
    p.setMinusOne(true);
    p.setEqBand(1, 6);
    p.seek(7);
  });
  await page.click('#loop-a');
  await page.evaluate(() => window.__musik.player.seek(11));
  await page.click('#loop-b');
  await sleep(900); // auto-save is debounced
  await openSong('Latihan Dua');
  const other = await page.evaluate(() => {
    const p = window.__musik.player;
    return { t: p.tempo, k: p.semitone, mo: p.minusOne, eq: [...p.eq], a: p.loopA, b: p.loopB };
  });
  check(
    'preset: another song without a preset starts from defaults',
    other.t === 1 &&
      other.k === 0 &&
      !other.mo &&
      other.eq.every((g) => g === 0) &&
      other.a === null,
    JSON.stringify(other),
  );
  await openSong('Latihan Satu');
  await sleep(400); // tempo changes are ramped over ~80 ms
  const restored = await page.evaluate(() => {
    const p = window.__musik.player;
    return {
      t: p.tempo,
      k: p.semitone,
      mo: p.minusOne,
      eq: [...p.eq],
      a: p.loopA,
      b: p.loopB,
      rate: p.audio.playbackRate,
    };
  });
  check(
    'preset: switching back restores tempo, key, minus one, EQ and loop',
    restored.t === 0.8 &&
      restored.k === 2 &&
      restored.mo === true &&
      restored.eq[1] === 6 &&
      Math.abs(restored.a - 7) < 0.5 &&
      Math.abs(restored.b - 11) < 0.5 &&
      Math.abs(restored.rate - 0.8) < 1e-6,
    JSON.stringify(restored),
  );
  await page.reload({ waitUntil: 'load' });
  await ready();
  await openSong('Latihan Satu');
  const persisted = await page.evaluate(() => {
    const p = window.__musik.player;
    return { t: p.tempo, k: p.semitone, mo: p.minusOne, eq1: p.eq[1], a: p.loopA };
  });
  check(
    'preset: survives a page reload (IndexedDB)',
    persisted.t === 0.8 &&
      persisted.k === 2 &&
      persisted.mo &&
      persisted.eq1 === 6 &&
      persisted.a !== null,
    JSON.stringify(persisted),
  );

  // back to defaults deletes the preset record
  await page.evaluate(() => {
    const p = window.__musik.player;
    p.setTempo(1);
    p.setSemitone(0);
    p.setMinusOne(false);
    p.resetEq();
    p.clearLoop();
  });
  await sleep(900);
  const gone = await page.evaluate(async () => {
    const p = window.__musik.player;
    return (await p.store.getPreset(p.current.id)) === null;
  });
  check('preset: returning to all defaults removes the saved preset', gone);

  // deleting a song removes its preset
  await page.evaluate(() => window.__musik.player.setTempo(0.9));
  await sleep(900);
  const hadPreset = await page.evaluate(async () => {
    const p = window.__musik.player;
    return (await p.store.getPreset(p.current.id)) !== null;
  });
  const afterDelete = await page.evaluate(async () => {
    const p = window.__musik.player;
    const song = p.current;
    await p.remove(song);
    return (await p.store.getPreset(song.id)) === null;
  });
  check('preset: deleting a song also deletes its preset', hadPreset && afterDelete);

  // ---------------------------------------------------------------- UI hygiene
  await page.screenshot({ path: path.join(artifacts, 'practice-end.png'), fullPage: true });
  check('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('unexpected exception', false, String(err?.stack ?? err));
  try {
    await page.screenshot({ path: path.join(artifacts, 'practice-failure.png'), fullPage: true });
  } catch {
    /* ignore */
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
writeFileSync(path.join(artifacts, 'practice-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
