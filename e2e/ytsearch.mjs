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
const jobTimes = [];
const jobVideo = new Map();
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
    const offset = Number(url.searchParams.get('offset') ?? 0);
    searches.push(`${url.searchParams.get('q')}@${offset}`);
    if (searchMode === 'fail') return route.fulfill(json(502, { error: 'search_failed' }));
    if (searchMode === 'none') {
      return route.fulfill(json(200, { query: 'x', results: [], hasMore: false }));
    }
    const mk = (videoId, title, channel, duration) => ({
      videoId,
      title,
      channel,
      duration,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    });
    // Page 1: two results and more to come; page 2 (offset 15): one result, the end.
    const results =
      offset === 0
        ? [
            mk('aaaaaaaaaaa', 'Kanal A - Lagu Satu (Official Video)', 'Kanal A', 185),
            mk('bbbbbbbbbbb', 'Lagu Dua', null, 3725),
          ]
        : [mk('ccccccccccc', 'Lagu Tiga', 'Kanal C', 200)];
    return route.fulfill(
      json(200, { query: url.searchParams.get('q'), offset, results, hasMore: offset === 0 }),
    );
  }
  if (url.pathname === '/api/jobs' && req.method() === 'POST') {
    const jobUrl = JSON.parse(req.postData() ?? '{}').url;
    jobUrls.push(jobUrl);
    jobTimes.push(Date.now());
    const vid = /v=([A-Za-z0-9_-]{11})/.exec(jobUrl)?.[1] ?? 'aaaaaaaaaaa';
    jobVideo.set('0'.repeat(31) + String(jobUrls.length), vid);
    return route.fulfill(
      json(202, { id: '0'.repeat(31) + String(jobUrls.length), videoId: vid, status: 'queued' }),
    );
  }
  if (/^\/api\/jobs\/[0-9a-f]{32}$/.test(url.pathname)) {
    const jobId = url.pathname.split('/').pop();
    return route.fulfill(
      json(200, {
        id: jobId,
        videoId: jobVideo.get(jobId) ?? 'aaaaaaaaaaa',
        status: 'done',
        stage: null,
        title: 'Lagu Satu',
        duration: 3,
        size: wav.length,
        error: null,
        downloadUrl: `/api/files/${jobId}.mp3?exp=1&sig=x`,
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
  check('Enter submits the search', searches[0] === 'lagu  nostalgia@0', JSON.stringify(searches));

  // ------------------------------------------------------------------ pagination (infinite scroll)
  await page.waitForSelector('#yt-end');
  check(
    'the next page loads by itself and the list ends',
    searches.length === 2 && searches[1] === 'lagu  nostalgia@15',
    JSON.stringify(searches),
  );
  check(
    'results of both pages are listed once each',
    (await page.locator('#yt-results > li').count()) === 3,
  );
  const first = (await page.locator('#yt-results > li').nth(0).innerText()).replace(/\s+/g, ' ');
  check(
    'title is shortened to "Song - Artist", with channel and duration',
    /Lagu Satu - Kanal A/.test(first) && !/Official/.test(first) && /3:05/.test(first),
    first,
  );
  check(
    'hour-long duration is formatted',
    /1:02:05/.test(await page.locator('#yt-results > li').nth(1).innerText()),
  );
  check('each result has a thumbnail', (await page.locator('#yt-results img').count()) === 3);
  await page.screenshot({ path: path.join(artifacts, 'ytsearch-results.png'), fullPage: true });

  // ------------------------------------------------------------------ preview
  await page.locator('#yt-results li[data-video="bbbbbbbbbbb"] .preview-btn').click();
  await page.waitForSelector('#yt-preview iframe');
  const src = await page.locator('#yt-preview iframe').getAttribute('src');
  check('preview embeds the chosen video', /\/embed\/bbbbbbbbbbb/.test(src ?? ''), String(src));
  check('preview does not convert by itself', jobUrls.length === 0);
  await page.click('#yt-preview-close');
  check('preview can be closed', (await page.locator('#yt-preview').count()) === 0);

  // ------------------------------------------------------------------ convert queue
  await page.locator('#yt-results li[data-video="aaaaaaaaaaa"] .convert-btn').click();
  await page.locator('#yt-results li[data-video="ccccccccccc"] .convert-btn').click();
  await page.locator('#yt-results li[data-video="bbbbbbbbbbb"] .preview-btn').click();
  await page.waitForSelector('#yt-queue li[data-video="aaaaaaaaaaa"][data-status="done"]');
  check(
    'convert puts videos in the queue; the first runs alone',
    (await page.locator('#yt-queue > li').count()) === 2 && jobUrls.length >= 1,
    JSON.stringify(jobUrls),
  );
  check(
    'can still preview another video while the queue runs',
    (await page.locator('#yt-preview iframe').count()) === 1,
  );
  await page.waitForSelector('#yt-pause');
  check('a pause between videos is shown', true);
  await page.waitForSelector('#yt-queue li[data-video="ccccccccccc"][data-status="done"]', {
    timeout: 20000,
  });
  const gap = jobTimes[1] - jobTimes[0];
  check('the second video starts 5-10 s after the first', gap >= 4900 && gap <= 11500, `${gap} ms`);
  check(
    'first job is the first pick (queue order)',
    jobUrls[0] === 'https://www.youtube.com/watch?v=aaaaaaaaaaa' &&
      jobUrls[1] === 'https://www.youtube.com/watch?v=ccccccccccc',
    JSON.stringify(jobUrls),
  );
  const state = await page.evaluate(() => ({
    songs: window.__musik.player.songs.map((s) => ({ title: s.title, source: s.source })),
  }));
  check(
    'both songs are in the Library from source youtube, named "Song - Artist"',
    state.songs.length === 2 &&
      state.songs.every((s) => s.source === 'youtube') &&
      state.songs.some((s) => s.title === 'Lagu Satu - Kanal A'),
    JSON.stringify(state),
  );
  check(
    'finished conversion stays on the YouTube screen and plays nothing',
    (await page.locator('#tab-youtube[aria-current="page"]').count()) === 1 &&
      (await page.evaluate(() => window.__musik.player.playing)) !== true,
  );
  await page.locator('#yt-queue li[data-video="aaaaaaaaaaa"] .yt-play').click();
  await page.waitForSelector('#tab-play[aria-current="page"]');
  check('Play on a finished item opens it in the player', true);

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
