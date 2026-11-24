// E2E for Settings -> Tentang: version, build time and the changelog per version.
// Requires `npm run build`. Usage: node e2e/about.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
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
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const versionsInFile = [...changelog.matchAll(/^## (\S+)/gm)].map((m) => m[1]);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

const { server, port } = await startStaticServer(outDir, 0);
const base = `http://127.0.0.1:${port}`;
let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ channel: 'chrome' });
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
  await page.click('#tab-settings');
  await page.waitForSelector('#about-version');

  const v = (await page.locator('#about-version').innerText()).trim();
  check('shows the version as in package.json', v === version, `${v} vs ${version}`);

  const built = (await page.locator('#about-built').innerText()).trim();
  check(
    'shows the build date and time (e.g. 24 Nov 2026 09.20)',
    /^\d{1,2} [A-Z][a-z]{2} \d{4} \d{2}\.\d{2}$/.test(built),
    built,
  );
  check(
    'platform is Web / PWA in a browser',
    /Web/.test(await page.locator('#about-platform').innerText()),
  );

  check('changelog is hidden until asked for', (await page.locator('#changelog').count()) === 0);
  await page.click('#changelog-toggle');
  await page.waitForSelector('#changelog details');
  const shown = await page
    .locator('#changelog details')
    .evaluateAll((els) => els.map((e) => e.dataset.version));
  check(
    'lists every version of CHANGELOG.md, newest first',
    shown.join() === versionsInFile.join(),
    `${shown.length} vs ${versionsInFile.length}`,
  );
  check(
    'only the newest version is open',
    (await page.locator('#changelog details[open]').count()) === 1 &&
      (await page.locator('#changelog details').first().getAttribute('open')) !== null,
  );
  check(
    'inline code and bold are rendered as elements, not as raw markup',
    (await page.locator('#changelog code').count()) > 0 &&
      (await page.locator('#changelog strong').count()) > 0 &&
      !(await page.locator('#changelog').innerText()).includes('`') &&
      !(await page.locator('#changelog').innerText()).includes('**'),
  );
  await page.screenshot({ path: path.join(artifacts, 'about.png'), fullPage: true });

  await page.click('#changelog-toggle');
  check('the changelog can be hidden again', (await page.locator('#changelog').count()) === 0);
  check('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('unexpected exception', false, String(err?.stack ?? err));
  try {
    await page.screenshot({ path: path.join(artifacts, 'about-failure.png'), fullPage: true });
  } catch {
    /* ignore */
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
writeFileSync(path.join(artifacts, 'about-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
