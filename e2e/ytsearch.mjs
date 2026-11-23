// E2E for YouTube keyword search in Chromium against the built PWA, with the Musik server mocked
// at network level (no real server, no YouTube). Requires `npm run build`.
// Usage: node e2e/ytsearch.mjs
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

const SR = 22050;
const wav = Buffer.from(encodeWav([generateSine(440, SR, 3, 0.4)], SR));
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
const json = (status, body) => ({
  status,
  headers: { ...CORS, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const SERVER = 'https://musik-srv.example';
const TOKEN = 'e2e-test-token-0123456789';
const searches = [];
const jobUrls = [];
let searchMode = 'ok';

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
await context.addInitScript(
  ([url, token]) => {
    try {
      if (!localStorage.getItem('musik.server.url')) {
        localStorage.setItem('musik.server.url', url);
        localStorage.setItem('musik.server.token', token);
      }
    } catch {
      /* ignore */
    }
  },
  [SERVER, TOKEN],
);

await context.route('https://i.ytimg.com/**', (route) =>
  route.fulfill({ status: 200, headers: { 'content-type': 'image/gif' }, body: Buffer.alloc(0) }),
);
await context.route(`${SERVER}/**`, (route) => {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const url = new URL(req.url());
  // Download links are signed (no Authorization header), like on the real server.
  if (
    !url.pathname.startsWith('/api/files/') &&
    req.headers()['authorization'] !== `Bearer ${TOKEN}`
  ) {
    return route.fulfill(json(401, { error: 'unauthorized' }));
  }
  if (url.pathname === '/api/search') {
    searches.push(url.searchParams.get('q'));
    if (searchMode === 'fail') return route.fulfill(json(502, { error: 'search_failed' }));
    if (searchMode === 'none') return route.fulfill(json(200, { query: 'x', results: [] }));
    return route.fulfill(
      json(200, {
        query: url.searchParams.get('q'),
        results: [
          {
            videoId: 'aaaaaaaaaaa',
            title: 'Lagu Satu',
            channel: 'Kanal A',
            duration: 185,
            thumbnail: 'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg',
          },
          {
            videoId: 'bbbbbbbbbbb',
            title: 'Lagu Dua',
            channel: null,
            duration: 3725,
            thumbnail: 'https://i.ytimg.com/vi/bbbbbbbbbbb/mqdefault.jpg',
          },
        ],
      }),
    );
  }
  if (url.pathname === '/api/jobs' && req.method() === 'POST') {
    jobUrls.push(JSON.parse(req.postData() ?? '{}').url);
    return route.fulfill(
      json(202, { id: '0'.repeat(31) + '1', videoId: 'aaaaaaaaaaa', status: 'queued' }),
    );
  }
  if (/^\/api\/jobs\/[0-9a-f]{32}$/.test(url.pathname)) {
    return route.fulfill(
      json(200, {
        id: '0'.repeat(31) + '1',
        videoId: 'aaaaaaaaaaa',
        status: 'done',
        stage: null,
        title: 'Lagu Satu',
        duration: 3,
        size: wav.length,
        error: null,
        downloadUrl: '/api/files/' + '0'.repeat(31) + '1.mp3?exp=1&sig=x',
      }),
    );
  }
  if (url.pathname.startsWith('/api/files/')) {
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'audio/mpeg' },
      body: wav, // really WAV bytes: browsers decode by content
    });
  }
  return route.fulfill(json(404, { error: 'not_found' }));
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
  await page.click('#tab-youtube');
  check('YouTube tab has the search field', (await page.locator('#yt-query').count()) === 1);
  check('search button disabled for an empty query', await page.locator('#yt-search').isDisabled());

  // ------------------------------------------------------------------ search
  await page.fill('#yt-query', '  lagu  nostalgia ');
  await page.press('#yt-query', 'Enter');
  await page.waitForSelector('#yt-results > li');
  check('Enter submits the search', searches.length === 1, JSON.stringify(searches));
  check(
    'results list shows title, channel and duration',
    (await page.locator('#yt-results > li').count()) === 2 &&
      /Lagu Satu/.test(await page.locator('#yt-results > li').nth(0).innerText()) &&
      /Kanal A/.test(await page.locator('#yt-results > li').nth(0).innerText()) &&
      /3:05/.test(await page.locator('#yt-results > li').nth(0).innerText()),
    (await page.locator('#yt-results > li').nth(0).innerText()).replace(/\s+/g, ' '),
  );
  check(
    'hour-long duration is formatted',
    /1:02:05/.test(await page.locator('#yt-results > li').nth(1).innerText()),
    (await page.locator('#yt-results > li').nth(1).innerText()).replace(/\s+/g, ' '),
  );
  check('each result has a thumbnail', (await page.locator('#yt-results img').count()) === 2);
  await page.screenshot({ path: path.join(artifacts, 'ytsearch-results.png'), fullPage: true });

  // ------------------------------------------------------------------ pick = convert + save + play
  await page.locator('#yt-results button[data-video="aaaaaaaaaaa"]').click();
  await page.waitForSelector('#tab-play[aria-current="page"]');
  check(
    'picking a result sends its watch URL to the job endpoint',
    jobUrls[0] === 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    String(jobUrls[0]),
  );
  const state = await page.evaluate(() => ({
    songs: window.__musik.player.songs.map((s) => ({ title: s.title, source: s.source })),
    current: window.__musik.player.current?.title ?? null,
  }));
  check(
    'song is saved in the Library from source youtube and opened in the player',
    state.songs.length === 1 && state.songs[0].source === 'youtube' && state.current !== null,
    JSON.stringify(state),
  );

  // ------------------------------------------------------------------ empty + error
  await page.click('#tab-youtube');
  searchMode = 'none';
  await page.fill('#yt-query', 'tidak ada');
  await page.click('#yt-search');
  await page.waitForSelector('#yt-empty');
  check('empty result shows a message', (await page.locator('#yt-results').count()) === 0);

  searchMode = 'fail';
  await page.fill('#yt-query', 'gagal');
  await page.click('#yt-search');
  await page.waitForSelector('#yt-search-error');
  check(
    'a failed search shows an error and no stale results',
    (await page.locator('#yt-results').count()) === 0 &&
      (await page.locator('#yt-empty').count()) === 0,
  );

  check('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('unexpected exception', false, String(err?.stack ?? err));
  try {
    await page.screenshot({ path: path.join(artifacts, 'ytsearch-failure.png'), fullPage: true });
  } catch {
    /* ignore */
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
writeFileSync(path.join(artifacts, 'ytsearch-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
