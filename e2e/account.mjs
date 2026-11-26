// E2E for the Google sign-in gate (30-day session, blocked e-mails) and the Drive backup of presets. The sign-in plugin and
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
  if (url.pathname === '/oauth2/v3/userinfo') {
    return json({ email: 'dina@example.com', name: 'Dina', picture: '' });
  }
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

/** Fake of server-auth/auth.php. `blocked` answers 403, `down` fails like no internet. */
const auth = { blocked: false, down: false, calls: [] };
async function authRoute(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (auth.down) return route.abort('failed');
  auth.calls.push(JSON.parse(req.postData() ?? '{}'));
  const json = (body, status = 200) =>
    route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  if (auth.blocked) return json({ error: 'blocked' }, 403);
  return json({ session: 'sess.sig', exp: Math.floor(Date.now() / 1000) + 30 * 86400 });
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
  await context.route('https://musik.mitra247.com/api/auth.php', authRoute);
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
    // Like the real Capacitor plugin: a Proxy whose methods are not own properties. A plain object
    // hid a bug where the reactive state wrapper swallowed the methods on the device.
    const methods = {
      signIn: async () => {
        if (o.fail) throw Object.assign(new Error('x'), { code: o.fail });
        return o.noProfile ? { ...info, email: '', name: '', photoUrl: '' } : info;
      },
      getAccessToken: async () => info,
    };
    window.__musik.account.setProvider(new Proxy({}, { get: (_t, name) => methods[name] }));
  }, opts);
}

try {
  // ---- phone 1: browser without the plugin (no gate), then a fake plugin (gate)
  const one = await newPhone();
  const p1 = one.page;
  await p1.click('#tab-settings');
  await p1.waitForSelector('#about-version');
  check(
    'no account section and no gate without the Android plugin',
    (await p1.locator('#account-panel').count()) === 0 && (await p1.locator('#gate').count()) === 0,
  );

  await installPlugin(p1, { fail: 'config' });
  await p1.waitForSelector('#gate-signin');
  check(
    'with the plugin the app is locked until sign in',
    (await p1.locator('#tab-settings').count()) === 0 && (await p1.locator('#gate').count()) === 1,
  );
  await p1.click('#gate-signin');
  await p1.waitForSelector('#gate-msg');
  const cfg = await p1.locator('#gate-msg').innerText();
  check('a missing OAuth setup is explained', /belum dikonfigurasi/.test(cfg), cfg);
  check('still locked after the failure', (await p1.locator('#tab-settings').count()) === 0);
  check('the server was not asked after a failed Google sign in', auth.calls.length === 0);

  await installPlugin(p1);
  await addSong(p1);
  await p1.evaluate(async () => {
    const p = window.__musik.player;
    await p.select(p.songs[0], false);
    p.setTempo(0.8);
    p.setSemitone(3);
  });
  await p1.waitForTimeout(1200); // the preset is saved a moment after the change
  await p1.click('#gate-signin');
  await p1.waitForSelector('#tab-settings');
  check(
    'a signed in user passes the gate',
    (await p1.locator('#gate').count()) === 0 && auth.calls.length === 1,
  );
  check(
    'the server got the Google token and the edition',
    auth.calls[0]?.accessToken === 'tok-1' && auth.calls[0]?.edition === 'personal',
    JSON.stringify(auth.calls[0]),
  );
  check(
    'the session is saved on the phone',
    (await p1.evaluate(
      () => JSON.parse(localStorage.getItem('musik.session') ?? 'null')?.token,
    )) === 'sess.sig',
  );
  await p1.click('#tab-settings');
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
  await p2.waitForSelector('#gate-signin');
  await p2.click('#gate-signin');
  await p2.waitForSelector('#tab-settings');
  await p2.click('#tab-settings');
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

  // ---- the plugin returns a token without profile (as on the device): the profile comes from Google
  await p1.click('#account-signout');
  await p1.waitForSelector('#gate-signin');
  check('signing out locks the app again', (await p1.locator('#tab-settings').count()) === 0);
  await installPlugin(p1, { noProfile: true });
  await p1.click('#gate-signin');
  await p1.waitForSelector('#tab-settings');
  await p1.click('#tab-settings');
  await p1.waitForSelector('#account-name');
  check(
    'a token without profile is completed from the userinfo endpoint',
    (await p1.locator('#account-name').innerText()) === 'Dina',
  );

  // ---- sign out keeps the backup; delete removes it
  await p1.click('#account-signout');
  await p1.waitForSelector('#gate-signin');
  check('signing out keeps the backup in Drive', drive.files.size === 1);
  check(
    'and forgets the account and the session on the phone',
    (await p1.evaluate(() => localStorage.getItem('musik.account'))) === null &&
      (await p1.evaluate(() => localStorage.getItem('musik.session'))) === null,
  );
  await p1.click('#gate-signin');
  await p1.waitForSelector('#tab-settings');
  await p1.click('#tab-settings');
  await p1.waitForSelector('#account-delete');
  p1.once('dialog', (d) => d.accept());
  await p1.click('#account-delete');
  await p1.waitForFunction(() =>
    /dihapus/.test(document.querySelector('#account-msg')?.textContent ?? ''),
  );
  check('deleting the backup empties the Drive app folder', drive.files.size === 0);

  // ---- the gate: blocked e-mail, no internet, 30 days offline, re-check
  await p1.click('#account-signout');
  await p1.waitForSelector('#gate-signin');
  auth.blocked = true;
  await p1.click('#gate-signin');
  await p1.waitForFunction(() =>
    /diblokir/.test(document.querySelector('#gate-msg')?.textContent ?? ''),
  );
  check(
    'a blocked e-mail stays locked and is not remembered',
    (await p1.locator('#tab-settings').count()) === 0 &&
      (await p1.evaluate(() => localStorage.getItem('musik.session'))) === null,
  );
  auth.blocked = false;
  auth.down = true;
  await p1.click('#gate-signin');
  await p1.waitForFunction(() =>
    /Tidak ada koneksi/.test(document.querySelector('#gate-msg')?.textContent ?? ''),
  );
  check(
    'without internet the first sign in cannot pass',
    (await p1.locator('#tab-settings').count()) === 0,
  );
  auth.down = false;
  await p1.click('#gate-signin');
  await p1.waitForSelector('#tab-settings');

  // saved check is two days old but still valid, no internet: the app stays open
  auth.down = true;
  await p1.evaluate(async () => {
    const a = window.__musik.account;
    a.session = { ...a.session, at: Date.now() - 2 * 86400_000 };
    await a.guard();
  });
  check(
    'offline within the 30 days the app stays open',
    (await p1.locator('#gate').count()) === 0 && (await p1.locator('#tab-settings').count()) === 1,
  );

  // saved check ran out and there is no internet: locked with the explanation
  await p1.evaluate(async () => {
    const a = window.__musik.account;
    a.session = { ...a.session, exp: Date.now() - 1000, at: Date.now() - 31 * 86400_000 };
    await a.guard();
  });
  await p1.waitForSelector('#gate-expired');
  check(
    'after 30 days without a check the app locks and explains',
    /Masa berlaku/.test(await p1.locator('#gate-expired').innerText()) &&
      (await p1.locator('#tab-settings').count()) === 0,
  );
  auth.down = false;
  await p1.click('#gate-signin');
  await p1.waitForSelector('#tab-settings');
  check('signing in again re-opens the app', (await p1.locator('#gate').count()) === 0);

  // the user is blocked on the server: the daily check locks the app
  auth.blocked = true;
  await p1.evaluate(async () => {
    const a = window.__musik.account;
    a.session = { ...a.session, at: Date.now() - 2 * 86400_000 };
    await a.guard();
  });
  await p1.waitForSelector('#gate-signin');
  check(
    'a user blocked on the server is locked at the next check',
    /diblokir/.test(await p1.locator('#gate-msg').innerText()) &&
      (await p1.evaluate(() => localStorage.getItem('musik.account'))) === null,
  );
  auth.blocked = false;

  check('no console errors on phone 2', two.errors.length === 0, two.errors.join(' | '));
  await one.context.close();
  await two.context.close();
} finally {
  await browser.close();
  server.close();
}
console.log(failed === 0 ? '\nAll account checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
