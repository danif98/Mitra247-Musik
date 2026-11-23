// Smoke test of the built server (out/server) the way Passenger loads it: the startup file is pulled in
// with require() by a wrapper, so it is NOT the main module. Starts it on a free port and checks
// /api/health, including under a sub-path such as /musik-api.
// Usage: node scripts/smoke-server.mjs [dir]   (default: out/server)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { root } from './lib.mjs';

const dir = path.resolve(process.argv[2] ?? path.join(root, 'out', 'server'));
const entry = path.join(dir, 'app.js');
if (!existsSync(entry)) {
  console.error(`Missing ${entry}. Run \`npm run build\` first.`);
  process.exit(2);
}

const port = await new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});

// A wrapper that loads the startup file with require(), like Passenger / CloudLinux do.
const wrapper = `require(${JSON.stringify(entry)}); setInterval(() => {}, 1000);`;
const child = spawn(process.execPath, ['-e', wrapper], {
  cwd: dir,
  env: {
    ...process.env,
    PORT: String(port),
    MUSIK_TOKEN: 'smoke-'.repeat(8),
    DATA_DIR: path.join(dir, '..', 'smoke-data'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));

async function get(p) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

let ok = false;
let detail = '';
try {
  for (let i = 0; i < 50 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const plain = await get('/api/health');
      const sub = await get('/musik-api/api/health');
      ok =
        plain.status === 200 &&
        plain.body?.status === 'ok' &&
        sub.status === 200 &&
        sub.body?.configured === true;
      detail = `/api/health ${plain.status}, /musik-api/api/health ${sub.status}, version ${plain.body?.version}`;
    } catch {
      /* not listening yet */
    }
  }
} finally {
  child.kill();
}
if (ok) {
  console.log(`OK: server started via require() and answers (${detail})`);
} else {
  console.error('FAIL: server did not answer after being loaded via require().');
  console.error(log || '(no output)');
  process.exit(1);
}
