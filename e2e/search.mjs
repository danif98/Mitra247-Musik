// E2E for "Cari" (search and download of legal music) in Chromium against the built PWA, with the
// three source APIs and the audio files mocked at network level. Requires `npm run build`.
// Usage: node e2e/search.mjs
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
const CORS = { 'access-control-allow-origin': '*' };
const jsonBody = (body) => ({
  status: 200,
  headers: { ...CORS, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const requested = [];
const openverseRequests = [];
let commonsFails = false;

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

await context.route('https://archive.org/advancedsearch.php**', (route) => {
  requested.push(route.request().url());
  return route.fulfill(
    jsonBody({
      response: {
        numFound: 1,
        docs: [
          {
            identifier: 'album-one',
            title: 'Album Satu',
            creator: 'Ann',
            licenseurl: 'http://creativecommons.org/licenses/by-nc-nd/3.0/',
            item_size: 3000000,
            year: 2001,
          },
          { identifier: 'closed', title: 'Tanpa lisensi' },
        ],
      },
    }),
  );
});
await context.route('https://archive.org/metadata/album-one', (route) =>
  route.fulfill(
    jsonBody({
      files: [
        { name: 'cover.jpg', format: 'JPEG' },
        { name: 'lagu-1.mp3', format: 'VBR MP3', size: '2000', length: '0:03', title: 'Lagu Satu' },
      ],
    }),
  ),
);
await context.route('https://archive.org/download/album-one/lagu-1.mp3', (route) =>
  route.fulfill({
    status: 200,
    headers: { ...CORS, 'content-type': 'audio/mpeg' },
    body: wav, // really WAV bytes: browsers decode by content, the extension does not matter
  }),
);
await context.route('https://api.openverse.org/v1/audio/**', (route) => {
  openverseRequests.push(route.request().url());
  return route.fulfill(
    jsonBody({
      page_count: 1,
      results: [
        {
          id: 'ov-1',
          title: 'Piano Melody',
          creator: 'benpm',
          license: 'by',
          license_version: '4.0',
          url: 'https://cdn.example.org/piano.wav',
          foreign_landing_url: 'https://freesound.org/s/1',
          filetype: 'wav',
          duration: 3000,
        },
      ],
    }),
  );
});
await context.route('https://cdn.example.org/piano.wav', (route) =>
  route.fulfill({
    status: 200,
    headers: { ...CORS, 'content-type': 'audio/wav' },
    body: wav,
  }),
);
await context.route('https://commons.wikimedia.org/w/api.php**', (route) => {
  if (commonsFails) return route.abort('failed');
  return route.fulfill(
    jsonBody({
      query: {
        pages: [
          {
            title: 'File:Blue Danube.ogg',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/blue.ogg',
                mime: 'application/ogg',
                size: 1000,
                extmetadata: {
                  Artist: { value: '<a href="//x">Han</a>' },
                  DateTimeOriginal: { value: 'circa 1935' },
                  LicenseShortName: { value: 'CC BY-SA 4.0' },
                  LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
                },
              },
            ],
          },
        ],
      },
    }),
  );
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
  await page.click('#tab-search');
  check('Cari tab opens', (await page.locator('#search-q').count()) === 1);
  check('search button disabled for an empty query', await page.locator('#search-go').isDisabled());

  // ------------------------------------------------------------------ search
  await page.fill('#search-q', 'piano (live) "x"');
  await page.click('#search-go');
  await page.waitForSelector('#search-results > li[data-source="commons"]');
  const sources = await page
    .locator('#search-results > li')
    .evaluateAll((els) => els.map((e) => e.dataset.source));
  check(
    'one merged list with the three sources (round robin by relevance)',
    sources.join() === 'archive,openverse,commons',
    sources.join(),
  );
  check(
    'items without a license are not shown',
    (await page.locator('#search-results > li[data-source="archive"]').count()) === 1,
  );
  const archiveText = await page.locator('#search-results > li[data-source="archive"]').innerText();
  check(
    'license label and NC / ND flags are visible',
    /CC BY-NC-ND 3\.0/.test(archiveText) &&
      /Non-komersial/.test(archiveText) &&
      /Tanpa turunan/.test(archiveText),
    archiveText.replace(/\s+/g, ' ').slice(0, 160),
  );
  check(
    'Lucene syntax from the user text was cleaned',
    requested.length === 1 &&
      !/%22|%28/.test(new URL(requested[0]).searchParams.get('q').replace(/%/g, '')) &&
      new URL(requested[0]).searchParams.get('q').startsWith('(piano AND live AND x)'),
    requested[0] ? new URL(requested[0]).searchParams.get('q') : 'no request',
  );

  // ------------------------------------------------------------------ album expand + download
  await page.locator('li[data-source="archive"] .expand').click();
  await page.waitForSelector('li[data-source="archive"] .tracks li');
  check(
    'album lists only audio files',
    (await page.locator('li[data-source="archive"] .tracks li').count()) === 1,
  );
  await page.locator('li[data-source="archive"] .tracks .dl').click();
  await page.waitForSelector('li[data-source="archive"] .tracks .ok');
  const songs = await page.evaluate(() =>
    window.__musik.player.songs.map((s) => ({ ...s, peaks: undefined })),
  );
  check(
    'downloaded track is in the library',
    songs.length === 1 && songs[0].title === 'Lagu Satu',
    JSON.stringify(songs.map((s) => s.title)),
  );
  check(
    'song keeps source and credit',
    songs[0]?.source === 'web' &&
      songs[0].credit?.license === 'CC BY-NC-ND 3.0' &&
      songs[0].credit?.creator === 'Ann' &&
      songs[0].credit?.pageUrl.includes('archive.org/details/album-one'),
    JSON.stringify(songs[0]?.credit),
  );
  check(
    'duration was decoded',
    songs[0]?.duration > 2 && songs[0].duration < 4,
    String(songs[0]?.duration),
  );

  // ------------------------------------------------------------------ direct hit download + play
  await page.locator('#search-results > li[data-source="openverse"] .dl').click();
  await page.waitForSelector('#search-results > li[data-source="openverse"] .ok');
  check(
    'second download is added',
    (await page.evaluate(() => window.__musik.player.songs.length)) === 2,
  );
  await page.locator('#search-results > li[data-source="openverse"] button[title="Putar"]').click();
  await page.waitForFunction(
    () => document.getElementById('song-title')?.textContent === 'Piano Melody',
    null,
    { timeout: 15000 },
  );
  check('Putar opens the downloaded song in the player', true);

  // ------------------------------------------------------------------ library shows license
  await page.click('#tab-library');
  const libText = await page.locator('#song-list').innerText();
  check(
    'library line shows the license',
    /CC BY-NC-ND 3\.0/.test(libText) && /CC BY 4\.0/.test(libText),
    libText.replace(/\s+/g, ' '),
  );

  // ------------------------------------------------------------------ search modes
  await page.click('#tab-search');
  await page.fill('#search-q', 'moon river');
  await page.click('#search-go');
  await page.waitForSelector('#search-results > li[data-source="commons"]');
  const settle = (mode) =>
    page.waitForFunction(
      (m) => {
        const f = window.__musik.searchFlow;
        return f.mode === m && f.status === 'done';
      },
      mode,
      { timeout: 10000 },
    );
  const archiveCalls = requested.length;
  const openverseCalls = openverseRequests.length;
  await page.click('.chip.mode[data-mode="title"]');
  await settle('title');
  const titleQ = new URL(requested.at(-1)).searchParams.get('q');
  const ovTitle = new URL(openverseRequests.at(-1)).searchParams;
  check(
    'title mode re-runs the search with title fields',
    requested.length > archiveCalls &&
      openverseRequests.length > openverseCalls &&
      titleQ.startsWith('title:(moon AND river)') &&
      ovTitle.get('title') === 'moon river' &&
      ovTitle.get('q') === null,
    `${titleQ} | ${ovTitle}`,
  );
  check(
    'placeholder follows the mode',
    (await page.locator('#search-q').getAttribute('placeholder')) === 'Judul lagu',
  );
  await page.click('.chip.mode[data-mode="artist"]');
  await settle('artist');
  const artistQ = new URL(requested.at(-1)).searchParams.get('q');
  const ovArtist = new URL(openverseRequests.at(-1)).searchParams;
  check(
    'artist mode uses creator fields',
    artistQ.startsWith('creator:(moon AND river)') && ovArtist.get('creator') === 'moon river',
    `${artistQ} | ${ovArtist}`,
  );
  await page.click('.chip.mode[data-mode="all"]');
  await settle('all');

  // ------------------------------------------------------------------ sorting
  const order = async () =>
    page.locator('#search-results > li .name').evaluateAll((els) => els.map((e) => e.textContent));
  const same = async (expected) => (await order()).join('|') === expected;
  check(
    'default order is by relevance',
    await same('Album Satu|Piano Melody|Blue Danube'),
    (await order()).join('|'),
  );
  await page.selectOption('#search-sort', 'title');
  check(
    'sort by title A-Z',
    await same('Album Satu|Blue Danube|Piano Melody'),
    (await order()).join('|'),
  );
  await page.click('#search-dir');
  check(
    'direction toggle reverses it',
    await same('Piano Melody|Blue Danube|Album Satu'),
    (await order()).join('|'),
  );
  await page.selectOption('#search-sort', 'artist');
  check(
    'sort by artist A-Z (Ann, benpm, Han)',
    await same('Album Satu|Piano Melody|Blue Danube'),
    (await order()).join('|'),
  );
  await page.selectOption('#search-sort', 'size');
  check(
    'sort by size, biggest first; unknown size last',
    await same('Album Satu|Blue Danube|Piano Melody'),
    (await order()).join('|'),
  );
  await page.selectOption('#search-sort', 'year');
  check(
    'sort by year, newest first; unknown year last',
    await same('Album Satu|Blue Danube|Piano Melody'),
    (await order()).join('|'),
  );
  await page.click('#search-dir');
  check(
    'oldest first puts 1935 before 2001, unknown still last',
    await same('Blue Danube|Album Satu|Piano Melody'),
    (await order()).join('|'),
  );
  const metas = await page.locator('#search-results > li .info').allInnerTexts();
  check(
    'release year is shown when known',
    metas.some((t) => /2001/.test(t)) && metas.some((t) => /1935/.test(t)),
    metas.join(' / ').replace(/\s+/g, ' ').slice(0, 200),
  );
  await page.selectOption('#search-sort', 'relevance');
  check(
    'direction button is disabled for relevance',
    await page.locator('#search-dir').isDisabled(),
  );

  // ------------------------------------------------------------------ icon buttons
  const iconInfo = await page
    .locator('#search-results > li')
    .first()
    .evaluate((li) => {
      const b = li.querySelector('button.expand, button.dl');
      return {
        svg: !!b?.querySelector('svg'),
        text: b?.textContent.trim() ?? '',
        label: b?.getAttribute('aria-label') ?? '',
      };
    });
  check(
    'view / download buttons are icons with accessible names',
    iconInfo.svg && iconInfo.text === '' && /Lihat lagu|Unduh/.test(iconInfo.label),
    JSON.stringify(iconInfo),
  );

  // ------------------------------------------------------------------ one source failing
  commonsFails = true;
  await page.click('#tab-search');
  await page.fill('#search-q', 'piano');
  await page.click('#search-go');
  await page.waitForSelector('p.error[data-source="commons"]');
  check(
    'a failing source shows an error while the others still show results',
    (await page.locator('#search-results > li[data-source="openverse"]').count()) >= 1 &&
      /tidak bisa dihubungi/.test(await page.locator('p.error[data-source="commons"]').innerText()),
  );

  // ------------------------------------------------------------------ source chips
  const chip = page.locator('.chip.source', { hasText: 'Openverse' });
  await chip.click();
  check('chip toggles a source', (await chip.getAttribute('aria-pressed')) === 'false');
  await page.locator('.chip.source', { hasText: 'Internet Archive' }).click();
  await page.locator('.chip.source', { hasText: 'Wikimedia Commons' }).click();
  check(
    'at least one source always stays selected',
    (await page.locator('.chip.source[aria-pressed="true"]').count()) === 1,
  );

  await page.screenshot({ path: path.join(artifacts, 'search-end.png'), fullPage: true });
  check('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('unexpected exception', false, String(err?.stack ?? err));
  try {
    await page.screenshot({ path: path.join(artifacts, 'search-failure.png'), fullPage: true });
  } catch {
    /* ignore */
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
writeFileSync(path.join(artifacts, 'search-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
