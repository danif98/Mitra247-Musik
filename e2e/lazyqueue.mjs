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
