// Test of server-auth/public/auth.php against a local MySQL/MariaDB and a fake Google. Needs PHP
// (with pdo_mysql and curl) and a MySQL server on 127.0.0.1 (user root, no password, as in XAMPP);
// when either is missing the test is skipped. Usage: node e2e/auth-server.mjs
import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const authDir = path.join(root, 'server-auth');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

function find(candidates) {
  for (const c of candidates) {
    if (path.isAbsolute(c) ? existsSync(c) : spawnSync(c, ['--version']).status === 0) return c;
  }
  return null;
}
const php = find([process.env.PHP ?? '', 'D:\\xampp\\php\\php.exe', 'php'].filter(Boolean));
const mysql = find(
  [process.env.MYSQL ?? '', 'D:\\xampp\\mysql\\bin\\mysql.exe', 'mysql'].filter(Boolean),
);
const skip = (why) => {
  console.log(`SKIP  ${why}`);
  process.exit(0);
};
if (!php) skip('PHP not found (set PHP=path).');
if (!mysql) skip('mysql client not found (set MYSQL=path).');
const modules = spawnSync(php, ['-m'], { encoding: 'utf8' }).stdout ?? '';
if (!/pdo_mysql/i.test(modules) || !/curl/i.test(modules)) skip('PHP needs pdo_mysql and curl.');
const ping = spawnSync(mysql, ['-u', 'root', '-h', '127.0.0.1', '-e', 'select 1']);
if (ping.status !== 0) skip('no MySQL server on 127.0.0.1 (user root, no password).');

const DB = 'musik_auth_test';
const run = (sql, db = '') =>
  spawnSync(mysql, ['-u', 'root', '-h', '127.0.0.1', ...(db ? [db] : []), '-e', sql], {
    encoding: 'utf8',
  });
run(`DROP DATABASE IF EXISTS ${DB}; CREATE DATABASE ${DB} CHARACTER SET utf8mb4;`);
const schema = readFileSync(path.join(authDir, 'schema.sql'), 'utf8');
const applied = spawnSync(mysql, ['-u', 'root', '-h', '127.0.0.1', DB], {
  input: schema,
  encoding: 'utf8',
});
if (applied.status !== 0) {
  console.error(applied.stderr);
  process.exit(1);
}
const rows = (email) =>
  run(`SELECT status, login_count, edition, name FROM app_users WHERE email='${email}'`, DB)
    .stdout.trim()
    .split('\n')
    .slice(1)
    .map((l) => l.split('\t'));

// ---- fake Google
const CLIENT = '111-app.apps.googleusercontent.com';
const tokens = {
  'good-a': { aud: CLIENT, email: 'a@example.com', email_verified: 'true', expires_in: '3000' },
  'good-mixed': {
    aud: CLIENT,
    email: 'Ann@Example.COM',
    email_verified: 'true',
    expires_in: '3000',
  },
  'via-azp': {
    aud: 'x',
    azp: CLIENT,
    email: 'c@example.com',
    email_verified: 'true',
    expires_in: '3000',
  },
  'other-app': {
    aud: 'evil.apps.googleusercontent.com',
    email: 'a@example.com',
    email_verified: 'true',
    expires_in: '3000',
  },
  unverified: { aud: CLIENT, email: 'u@example.com', email_verified: 'false', expires_in: '3000' },
  'no-email': { aud: CLIENT, expires_in: '3000' },
};
const google = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('content-type', 'application/json');
  if (url.pathname === '/tokeninfo') {
    const t = tokens[url.searchParams.get('access_token')];
    res.statusCode = t ? 200 : 400;
    return res.end(JSON.stringify(t ?? { error: 'invalid_token' }));
  }
  if (url.pathname === '/userinfo') return res.end(JSON.stringify({ name: 'Nama Uji' }));
  res.statusCode = 404;
  res.end('{}');
});
await new Promise((r) => google.listen(0, '127.0.0.1', r));
const gport = google.address().port;

// ---- config + PHP server
const tmp = mkdtempSync(path.join(os.tmpdir(), 'musik-auth-'));
const SECRET = 'test-secret-test-secret-test-secret-123';
writeFileSync(
  path.join(tmp, 'auth-config.php'),
  `<?php return [
  'db_dsn' => 'mysql:host=127.0.0.1;dbname=${DB};charset=utf8mb4',
  'db_user' => 'root', 'db_pass' => '',
  'client_ids' => ['${CLIENT}'],
  'session_secret' => '${SECRET}',
  'session_days' => 30,
  'allowed_origins' => ['https://localhost'],
  'google_tokeninfo_url' => 'http://127.0.0.1:${gport}/tokeninfo',
  'google_userinfo_url' => 'http://127.0.0.1:${gport}/userinfo',
];`,
);
const pport = 18000 + Math.floor(Math.random() * 1000);
const server = spawn(php, ['-S', `127.0.0.1:${pport}`, '-t', path.join(authDir, 'public')], {
  env: { ...process.env, MUSIK_AUTH_CONFIG: path.join(tmp, 'auth-config.php') },
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 1200));
const url = `http://127.0.0.1:${pport}/auth.php`;
const post = async (body, headers = {}) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, headers: res.headers };
};

try {
  const first = await post({ accessToken: 'good-a', edition: 'play' });
  check(
    'a good token returns a session',
    first.status === 200 && !!first.json?.session,
    String(first.status),
  );
  check(
    'the e-mail and the name come from Google',
    first.json?.email === 'a@example.com' && first.json?.name === 'Nama Uji',
  );
  const [payload, sig] = (first.json?.session ?? '.').split('.');
  const expected = createHmac('sha256', SECRET).update(payload).digest('base64url');
  check('the session is signed with the secret', sig === expected);
  const body = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const days = (body.exp - body.iat) / 86400;
  check(
    'the session is valid for 30 days',
    days === 30 && first.json?.exp === body.exp,
    String(days),
  );
  check(
    'the user is recorded once',
    JSON.stringify(rows('a@example.com')) === JSON.stringify([['active', '1', 'play', 'Nama Uji']]),
    JSON.stringify(rows('a@example.com')),
  );

  await post({ accessToken: 'good-a', edition: 'personal' });
  check(
    'a second sign in counts and keeps one row',
    JSON.stringify(rows('a@example.com')) ===
      JSON.stringify([['active', '2', 'personal', 'Nama Uji']]),
    JSON.stringify(rows('a@example.com')),
  );

  const mixed = await post({ accessToken: 'good-mixed' });
  check(
    'e-mail is stored in lower case',
    mixed.json?.email === 'ann@example.com' && rows('ann@example.com').length === 1,
  );
  check(
    'a token issued to our app through azp is accepted',
    (await post({ accessToken: 'via-azp' })).status === 200,
  );

  const other = await post({ accessToken: 'other-app' });
  check(
    'a token of another app is refused',
    other.status === 401 && other.json?.error === 'audience',
    String(other.status),
  );
  check(
    'an unverified e-mail is refused',
    (await post({ accessToken: 'unverified' })).status === 401,
  );
  check(
    'a token without e-mail is refused',
    (await post({ accessToken: 'no-email' })).status === 401,
  );
  check('an unknown token is refused', (await post({ accessToken: 'nope' })).status === 401);
  check('a missing token is a bad request', (await post({})).status === 400);
  check('garbage input is a bad request', (await post('not json')).status === 400);
  const get = await fetch(url);
  check('GET is not allowed', get.status === 405);

  run(`UPDATE app_users SET status='blocked' WHERE email='a@example.com'`, DB);
  const blocked = await post({ accessToken: 'good-a' });
  check(
    'a blocked e-mail gets 403 and no session',
    blocked.status === 403 && blocked.json?.error === 'blocked' && !blocked.json?.session,
    String(blocked.status),
  );
  run(`UPDATE app_users SET status='active' WHERE email='a@example.com'`, DB);
  check(
    'unblocking lets the user in again',
    (await post({ accessToken: 'good-a' })).status === 200,
  );

  const cors = await post({ accessToken: 'good-a' }, { origin: 'https://localhost' });
  check(
    'the app origin is allowed by CORS',
    cors.headers.get('access-control-allow-origin') === 'https://localhost',
  );
  const evil = await post({ accessToken: 'good-a' }, { origin: 'https://evil.example' });
  check(
    'another origin gets no CORS header',
    evil.headers.get('access-control-allow-origin') === null,
  );
  const pre = await fetch(url, { method: 'OPTIONS', headers: { origin: 'https://localhost' } });
  check('the preflight answers 204', pre.status === 204);
  check('responses are not cached', first.headers.get('cache-control') === 'no-store');
} finally {
  server.kill();
  google.close();
  run(`DROP DATABASE IF EXISTS ${DB}`);
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failed === 0 ? '\nAll auth server checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
