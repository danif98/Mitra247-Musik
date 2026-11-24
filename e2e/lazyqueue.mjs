// E2E for playLazy (queue of on-demand files, used for music on the phone): next/previous follow
// the list, only the playing file is read, and a failing file does not break the player.
// Requires `npm run build`. Usage: node e2e/lazyqueue.mjs
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

try {
  await page.goto(`${base}/?test`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__musik?.player?.engineState === 'ready', null, {
    timeout: 60000,
  });

  const setup = await page.evaluate(async () => {
    const { player } = window.__musik;
    const calls = [];
    const wav = (seconds) => {
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
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 8000, true);
      return buf;
    };
    const track = (name, fail = false) => ({
      title: name,
      fileName: `${name}.wav`,
      size: 100,
      duration: 20,
      mime: 'audio/wav',
      open: async () => {
        calls.push(name);
        if (fail) throw new Error('read');
        return new File([wav(20)], `${name}.wav`, { type: 'audio/wav' });
      },
    });
    window.__calls = calls;
    const ok = await player.playLazy([track('A'), track('B'), track('C')], 1);
    return { ok };
  });
  check('playLazy starts', setup.ok === true);

  const s1 = await page.evaluate(() => {
    const p = window.__musik.player;
    return {
      title: p.current?.title,
      index: p.queueIndex,
      size: p.queue.length,
      hasNext: p.hasNext,
      calls: [...window.__calls],
    };
  });
  check(
    'starts at the tapped track with the whole list queued',
    s1.title === 'B' && s1.index === 1 && s1.size === 3 && s1.hasNext,
    JSON.stringify(s1),
  );
  check('only the playing file was read', s1.calls.join() === 'B', s1.calls.join());

  await page.evaluate(() => window.__musik.player.next());
  const s2 = await page.evaluate(() => {
    const p = window.__musik.player;
    return { title: p.current?.title, hasNext: p.hasNext, calls: [...window.__calls] };
  });
  check(
    'next plays the following track and ends the queue',
    s2.title === 'C' && s2.hasNext === false && s2.calls.join() === 'B,C',
    JSON.stringify(s2),
  );

  await page.evaluate(() => window.__musik.player.prev());
  const s3 = await page.evaluate(() => ({
    title: window.__musik.player.current?.title,
    calls: [...window.__calls],
  }));
  check(
    'previous goes back (the file is read again, it was not kept in memory)',
    s3.title === 'B' && s3.calls.join() === 'B,C,B',
    JSON.stringify(s3),
  );

  // a failing file: the error is reported and the player keeps working
  const s4 = await page.evaluate(async () => {
    const p = window.__musik.player;
    await p.playLazy(
      [
        {
          title: 'X',
          fileName: 'x.wav',
          size: 1,
          duration: 1,
          mime: 'audio/wav',
          open: async () => {
            throw new Error('read');
          },
        },
      ],
      0,
    );
    return { error: p.error, current: p.current?.title ?? null };
  });
  check(
    'a file that cannot be read sets an error and does not throw',
    s4.error !== '',
    JSON.stringify(s4),
  );

  // ------------------------------------------------------------------ play modes
  const modes = await page.evaluate(async () => {
    const p = window.__musik.player;
    const mk = (n) => ({
      title: n,
      fileName: `${n}.wav`,
      size: 1,
      duration: 20,
      mime: 'audio/wav',
      open: async () => {
        const rate = 8000;
        const len = rate * 20;
        const buf = new ArrayBuffer(44 + len * 2);
        const v = new DataView(buf);
        const w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF');
        v.setUint32(4, 36 + len * 2, true);
        w(8, 'WAVEfmt ');
        v.setUint32(16, 16, true);
        v.setUint16(20, 1, true);
        v.setUint16(22, 1, true);
        v.setUint32(24, rate, true);
        v.setUint32(28, rate * 2, true);
        v.setUint16(32, 2, true);
        v.setUint16(34, 16, true);
        w(36, 'data');
        v.setUint32(40, len * 2, true);
        return new File([buf], `${n}.wav`, { type: 'audio/wav' });
      },
    });
    const five = ['T0', 'T1', 'T2', 'T3', 'T4'].map(mk);
    const out = {};
    const cur = () => p.current?.title;

    // default: auto next on, repeat off, shuffle off
    out.defaults = { a: p.autoNext, r: p.repeat, s: p.shuffle };
    await p.playLazy(five, 3);
    await p.onEnded();
    out.endedAdvances = cur();
    await p.onEnded();
    out.endedAtLast = { title: cur(), playing: p.playing };

    // auto next off: the track ends and nothing follows, Next still works
    p.toggleAutoNext();
    await p.playLazy(five, 0);
    await p.onEnded();
    out.autoNextOff = { title: cur(), playing: p.playing };
    await p.next();
    out.nextStillWorks = cur();
    p.toggleAutoNext();

    // repeat one: same track again, even when it is the last
    p.cycleRepeat(); // all
    p.cycleRepeat(); // one
    out.repeatState = p.repeat;
    await p.playLazy(five, 4);
    p.seek(5);
    await p.onEnded();
    out.repeatOne = { title: cur(), position: Math.round(p.position) };
    await p.next();
    out.repeatOneNext = { title: cur(), hasNext: p.hasNext };

    // repeat all: the last track wraps to the first, previous wraps back
    p.cycleRepeat(); // off
    p.cycleRepeat(); // all
    await p.playLazy(five, 4);
    out.allHasNext = p.hasNext;
    await p.onEnded();
    out.wrapped = cur();
    p.seek(0);
    await p.prev();
    out.prevWraps = cur();

    // shuffle: every track exactly once per round, current first, new round differs at the start
    p.cycleRepeat(); // one -> would be 'one'; set explicitly below
    while (p.repeat !== 'off') p.cycleRepeat();
    p.toggleShuffle();
    await p.playLazy(five, 2);
    const seen = [cur()];
    for (let i = 0; i < 4; i++) {
      await p.next();
      seen.push(cur());
    }
    out.shuffleRound = seen;
    out.shuffleEnds = p.hasNext;
    while (p.repeat !== 'all') p.cycleRepeat();
    const last = cur();
    await p.next();
    out.newRound = { title: cur(), differsFromLast: cur() !== last };
    out.stored = JSON.parse(localStorage.getItem('musik.playmode') ?? '{}');
    return out;
  });
  check(
    'defaults: auto next on, repeat off, shuffle off',
    modes.defaults.a === true && modes.defaults.r === 'off' && modes.defaults.s === false,
    JSON.stringify(modes.defaults),
  );
  check('track end goes to the next track', modes.endedAdvances === 'T4', modes.endedAdvances);
  check(
    'track end at the last track stops',
    modes.endedAtLast.title === 'T4' && modes.endedAtLast.playing === false,
    JSON.stringify(modes.endedAtLast),
  );
  check(
    'auto next off: track end stops, the Next button still works',
    modes.autoNextOff.title === 'T0' &&
      modes.autoNextOff.playing === false &&
      modes.nextStillWorks === 'T1',
    JSON.stringify([modes.autoNextOff, modes.nextStillWorks]),
  );
  check(
    'repeat one restarts the ended track (Next at the last track stays)',
    modes.repeatState === 'one' &&
      modes.repeatOne.title === 'T4' &&
      modes.repeatOne.position <= 1 &&
      modes.repeatOneNext.title === 'T4' &&
      modes.repeatOneNext.hasNext === false,
    JSON.stringify([modes.repeatState, modes.repeatOne, modes.repeatOneNext]),
  );
  check(
    'repeat all wraps at the end and Previous wraps back',
    modes.allHasNext === true && modes.wrapped === 'T0' && modes.prevWraps === 'T4',
    JSON.stringify([modes.allHasNext, modes.wrapped, modes.prevWraps]),
  );
  check(
    'shuffle plays every track once per round, starting with the chosen one',
    modes.shuffleRound[0] === 'T2' &&
      new Set(modes.shuffleRound).size === 5 &&
      modes.shuffleEnds === false,
    JSON.stringify(modes.shuffleRound),
  );
  check(
    'shuffle + repeat all starts a new round that does not begin with the last track',
    modes.newRound.differsFromLast === true,
    JSON.stringify(modes.newRound),
  );
  check(
    'the modes are remembered',
    modes.stored.shuffle === true &&
      modes.stored.repeat === 'all' &&
      modes.stored.autoNext === true,
    JSON.stringify(modes.stored),
  );

  // buttons on the player screen
  await page.click('#tab-play');
  await page.waitForSelector('#mode-shuffle');
  const pressed = async (sel) => page.locator(sel).getAttribute('aria-pressed');
  const before = [await pressed('#mode-shuffle'), await pressed('#mode-repeat')];
  await page.click('#mode-shuffle');
  await page.click('#mode-repeat');
  await page.click('#mode-autonext');
  const after = await page.evaluate(() => {
    const p = window.__musik.player;
    return [p.shuffle, p.repeat, p.autoNext];
  });
  check(
    'player screen buttons switch shuffle, repeat and auto next',
    before.join() === 'true,true' && after.join() === 'false,one,false',
    JSON.stringify([before, after]),
  );
  await page.screenshot({ path: path.join(artifacts, 'playmodes.png'), fullPage: true });

  check('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('unexpected exception', false, String(err?.stack ?? err));
  try {
    await page.screenshot({ path: path.join(artifacts, 'lazyqueue-failure.png'), fullPage: true });
  } catch {
    /* ignore */
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
writeFileSync(path.join(artifacts, 'lazyqueue-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
