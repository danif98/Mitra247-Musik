// E2E: with a long queue (18 songs) the last songs are reachable and not hidden behind the bottom bar.
// Requires `npm run build`. Usage: node e2e/queuefit.mjs
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { server, port } = await startStaticServer(path.join(root, 'out', 'app'), 0);
let browser;
try {
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
} catch {
  browser = await chromium.launch({
    channel: 'chrome',
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
}
const page = await (
  await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 })
).newPage();
await page.goto(`http://127.0.0.1:${port}/?test`);
await page.waitForFunction(() => window.__musik?.player?.engineState === 'ready', null, {
  timeout: 60000,
});
await page.evaluate(async () => {
  const mk = (i) => {
    const rate = 8000,
      n = rate * 2;
    const b = new ArrayBuffer(44 + n * 2);
    const v = new DataView(b);
    const w = (o, t) => [...t].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
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
    return new File([b], `Lagu ${String(i).padStart(2, '0')}.wav`, { type: 'audio/wav' });
  };
  const files = Array.from({ length: 18 }, (_, i) => mk(i + 1));
  await window.__musik.player.playFiles(files);
  await window.__musik.player.playAt(11);
});
await page.click('#tab-play');
await page.waitForTimeout(800);
const info = async () =>
  page.evaluate(() => {
    const list = document.querySelector('#queue-list');
    const nav = document.querySelector('nav').getBoundingClientRect();
    const rows = [...document.querySelectorAll('#queue-list .row')];
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.top)}-${Math.round(r.bottom)}`;
    };
    const l = list.getBoundingClientRect();
    return {
      vh: innerHeight,
      navTop: Math.round(nav.top),
      listRect: `${Math.round(l.top)}-${Math.round(l.bottom)}`,
      listScrollH: list.scrollHeight,
      listClientH: list.clientHeight,
      listScrollTop: list.scrollTop,
      pageScrollY: scrollY,
      docH: document.documentElement.scrollHeight,
      rows: rows.length,
      last: rect(rows[rows.length - 1]),
      r13: rect(rows[12]),
    };
  });
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}
const first = await info();
check('all 18 songs are rendered in the queue list', first.rows === 18, String(first.rows));
check('the list is at least 300 px tall', first.listClientH >= 300, String(first.listClientH));
// Swipe over the list to its very end, then keep going: the page follows, like a finger would.
for (let i = 0; i < 14; i++) {
  const box = await page.locator('#queue-list').boundingBox();
  await page.mouse.move(box.x + box.width / 2, Math.min(box.y + 150, 700));
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(80);
}
const end = await info();
const lastBottom = Number(end.last.split('-')[1]);
check(
  'the last song ends above the bottom bar after scrolling to the end',
  lastBottom <= end.navTop,
  `last bottom ${lastBottom}, bar top ${end.navTop}`,
);
await page.screenshot({ path: path.join(root, 'e2e', 'artifacts', 'queue.png') });
// search inside the queue
await page.evaluate(() => window.scrollTo(0, 0));
check(
  'the search box is shown for a long queue',
  (await page.locator('#queue-search').count()) === 1,
);
await page.fill('#queue-search', 'lagu 1');
await page.waitForTimeout(150);
const titles = await page.$$eval('#queue-list .name', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(
  'the list shows only the matching songs (Lagu 01, 10-18)',
  titles.length === 10 && titles.every((t) => /^Lagu (01|1\d)$/.test(t)),
  titles.join(', '),
);
check(
  'the count shows matches of the queue',
  (await page.textContent('#queue-count')).replace(/\s/g, '') === '10/18',
);
const idx = await page.$$eval('#queue-list .row', (els) =>
  els.map((e) => e.getAttribute('data-index')),
);
check('matching rows keep their queue positions', idx[1] === '9' && idx[9] === '17', idx.join());
await page.click('#queue-list .row[data-index="14"]');
await page.waitForTimeout(300);
check(
  'tapping a result plays that song',
  (await page.evaluate(() => window.__musik.player.queueIndex)) === 14,
);
await page.fill('#queue-search', 'zzz');
await page.waitForTimeout(150);
check('no match shows a message', (await page.locator('#queue-noresult').count()) === 1);
await page.fill('#queue-search', 'lagu 05');
await page.press('#queue-search', 'Enter');
await page.waitForTimeout(300);
check(
  'Enter plays the first match',
  (await page.evaluate(() => window.__musik.player.queueIndex)) === 4,
);
await page.fill('#queue-search', '');
await page.waitForTimeout(150);
check(
  'clearing the search brings back all songs',
  (await page.locator('#queue-list .row').count()) === 18,
);
await page.screenshot({ path: path.join(root, 'e2e', 'artifacts', 'queue.png') });
await browser.close();
server.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`
${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
