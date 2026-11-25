// E2E for the optional Google account and the Drive backup of presets. The sign-in plugin and
// Google Drive are faked (no real Google). Requires `npm run build`. Usage: node e2e/account.mjs
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out', 'app');
if (!existsSync(path.join(outDir, 'index.html'))) {
  console.error('out/app missing: run `npm run build` first.');
  process.exit(2);
}

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

/** A tiny Google Drive app folder, shared by every browser context of this test. */
const drive = { files: new Map(), next: 1, requests: [] };
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};
async function driveRoute(route) {
  const req = route.request();
  const url = new URL(req.url());
  const method = req.method();
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  drive.requests.push({ method, path: url.pathname, auth: req.headers()['authorization'] ?? '' });
  const json = (body, status = 200) =>
    route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  if (url.pathname === '/drive/v3/files' && method === 'GET') {
    const id = [...drive.files.keys()][0];
    return json({ files: id ? [{ id }] : [] });
  }
  const id = url.pathname.split('/').pop();
  if (url.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
    const text = drive.files.get(id);
    return text === undefined
      ? json({}, 404)
      : route.fulfill({ status: 200, headers: CORS, body: text });
  }
  if (url.pathname.startsWith('/drive/v3/files/') && method === 'DELETE') {
    drive.files.delete(id);
    return route.fulfill({ status: 204, headers: CORS });
  }
  if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
    const body = req.postData() ?? '';
    const text = body.split('Content-Type: application/json\r\n\r\n')[1]?.split('\r\n--')[0] ?? '';
    const newId = `file${drive.next++}`;
    drive.files.set(newId, text);
    return json({ id: newId });
  }
  if (url.pathname.startsWith('/upload/drive/v3/files/') && method === 'PATCH') {
    drive.files.set(id, req.postData() ?? '');
    return json({ id });
  }
  return json({ error: 'unexpected' }, 500);
}

const { server, port } = await startStaticServer(outDir, 0);
const base = `http://127.0.0.1:${port}`;
let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ channel: 'chrome' });
}

/** A fresh browser profile = a "new phone". */
async function newPhone() {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  await context.route('https://www.googleapis.com/**', driveRoute);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) {
      errors.push(m.text());
    }
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${base}/?test`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__musik?.player?.engineState === 'ready', null, {
    timeout: 60000,
  });
  return { context, page, errors };
}

/** The same song on every phone: same title and same size. */
async function addSong(page) {
  await page.evaluate(async () => {
    const rate = 8000;
    const n = 20 * rate;
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
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 9) * 8000, true);
    await window.__musik.player.addFiles([new File([buf], 'Lagu Alfa.wav', { type: 'audio/wav' })]);
  });
}

/** Fake of the Android plugin. `fail` makes sign in reject with that code. */
function installPlugin(page, opts = {}) {
  return page.evaluate((o) => {
    const info = { email: 'dina@example.com', name: 'Dina', photoUrl: '', accessToken: 'tok-1' };
    window.__musik.account.setProvider({
      signIn: async () => {
        if (o.fail) throw Object.assign(new Error('x'), { code: o.fail });
        return info;
      },
      getAccessToken: async () => info,
    });
  }, opts);
}

try {
  // ---- phone 1: browser without the plugin, then a fake plugin
  const one = await newPhone();
  const p1 = one.page;
  await p1.click('#tab-settings');
  await p1.waitForSelector('#about-version');
  check(
    'no account section without the Android plugin',
    (await p1.locator('#account-panel').count()) === 0,
  );

  await installPlugin(p1, { fail: 'config' });
  await p1.waitForSelector('#account-signin');
  await p1.click('#account-signin');
  await p1.waitForSelector('#account-msg');
  const cfg = await p1.locator('#account-msg').innerText();
  check('a missing OAuth setup is explained', /belum dikonfigurasi/.test(cfg), cfg);
  check('still signed out after the failure', (await p1.locator('#account-name').count()) === 0);

  await installPlugin(p1);
  await addSong(p1);
  await p1.evaluate(async () => {
    const p = window.__musik.player;
    await p.select(p.songs[0], false);
    p.setTempo(0.8);
    p.setSemitone(3);
  });
  await p1.waitForTimeout(1200); // the preset is saved a moment after the change
  await p1.click('#account-signin');
  await p1.waitForFunction(() =>
    /Tersinkron/.test(document.querySelector('#account-msg')?.textContent ?? ''),
  );
  check(
    'signed in with name and email',
    (await p1.locator('#account-name').innerText()) === 'Dina' &&
      (await p1.locator('#account-email').innerText()) === 'dina@example.com',
  );
  check(
    'one backup file in the Drive app folder',
    drive.files.size === 1,
    String(drive.files.size),
  );
  const saved = JSON.parse([...drive.files.values()][0]);
  check(
    'the backup holds the preset (tempo, key) and no song data',
    saved.presets.length === 1 &&
      saved.presets[0].preset.tempo === 0.8 &&
      saved.presets[0].preset.semitone === 3 &&
      saved.presets[0].sig === 'lagu alfa|' + saved.presets[0].sig.split('|')[1] &&
      !JSON.stringify(saved).includes('RIFF'),
  );
  check(
    'Drive requests carry the access token',
    drive.requests.length > 0 && drive.requests.every((r) => r.auth === 'Bearer tok-1'),
  );
  check('no console errors on phone 1', one.errors.length === 0, one.errors.join(' | '));

  // ---- phone 2: new profile, same song, takes over the preset
  const two = await newPhone();
  const p2 = two.page;
  await addSong(p2);
  await installPlugin(p2);
  await p2.click('#tab-settings');
  await p2.waitForSelector('#account-signin');
  await p2.click('#account-signin');
  await p2.waitForFunction(() =>
    /Tersinkron/.test(document.querySelector('#account-msg')?.textContent ?? ''),
  );
  const applied = await p2.evaluate(async () => {
    const p = window.__musik.player;
    await p.select(p.songs[0], false);
    return { tempo: p.tempo, semitone: p.semitone };
  });
  check(
    'the new phone takes over tempo and key of the song',
    applied.tempo === 0.8 && applied.semitone === 3,
    JSON.stringify(applied),
  );
  check(
    'syncing again changes nothing in Drive',
    await (async () => {
      const before = [...drive.files.values()][0];
      await p2.click('#tab-settings');
      await p2.click('#account-sync');
      await p2.waitForFunction(() =>
        /Tersinkron/.test(document.querySelector('#account-msg')?.textContent ?? ''),
      );
      return drive.files.size === 1 && [...drive.files.values()][0] === before;
    })(),
  );

  // ---- newer preset on phone 2 wins on phone 1
  await p2.evaluate(async () => {
    const p = window.__musik.player;
    p.setTempo(1.25);
  });
  await p2.waitForTimeout(1200);
  await p2.click('#account-sync');
  await p2.waitForFunction(() =>
    /Tersinkron/.test(document.querySelector('#account-msg')?.textContent ?? ''),
  );
  await p1.click('#account-sync');
  await p1.waitForFunction(() =>
    /Tersinkron/.test(document.querySelector('#account-msg')?.textContent ?? ''),
  );
  const tempo1 = await p1.evaluate(() => window.__musik.player.tempo);
  check('the preset saved last wins on the other phone', tempo1 === 1.25, String(tempo1));

  // ---- sign out keeps the backup; delete removes it
  await p1.click('#account-signout');
  await p1.waitForSelector('#account-signin');
  check('signing out keeps the backup in Drive', drive.files.size === 1);
  check(
    'and forgets the account on the phone',
    (await p1.evaluate(() => localStorage.getItem('musik.account'))) === null,
  );
  await p1.click('#account-signin');
  await p1.waitForSelector('#account-delete');
  p1.once('dialog', (d) => d.accept());
  await p1.click('#account-delete');
  await p1.waitForFunction(() =>
    /dihapus/.test(document.querySelector('#account-msg')?.textContent ?? ''),
  );
  check('deleting the backup empties the Drive app folder', drive.files.size === 0);
  check('no console errors on phone 2', two.errors.length === 0, two.errors.join(' | '));
  await one.context.close();
  await two.context.close();
} finally {
  await browser.close();
  server.close();
}
console.log(failed === 0 ? '\nAll account checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
