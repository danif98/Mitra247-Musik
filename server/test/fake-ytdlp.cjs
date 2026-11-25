#!/usr/bin/env node
// Stand-in for yt-dlp used by automated tests (no network). Behaviour depends on the video id:
//   FAIL*  private video error (exit 1)      BOTX*  bot check error (exit 1)
//   LONG*  "does not pass filter", no file   NOFL*  exit 0 without output file
//   SLOW*  succeeds after 400 ms             HANG*  never exits
// Writes <id>.mp3 (really a short WAV, which browsers decode regardless of the extension),
// <id>.info.json and argv.json (the received arguments) into the job folder.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('2099.01.01-fake');
  process.exit(0);
}
// Search (a youtube.com/results?search_query=<query> URL): a query containing FAILQ exits 1, BOTQ is a bot check, NONE has no
// results. The received arguments go to search-argv.json in the data dir (parent of --cache-dir).
const searchArg = args.find((a) => a.includes('youtube.com/results?search_query='));
if (searchArg) {
  const q = decodeURIComponent(new URL(searchArg).searchParams.get('search_query') ?? '');
  const cacheDir = args[args.indexOf('--cache-dir') + 1];
  if (cacheDir) {
    fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
    fs.writeFileSync(
      path.join(path.dirname(cacheDir), 'search-argv.json'),
      JSON.stringify({ args }),
    );
  }
  if (q.includes('FAILQ')) {
    console.error('ERROR: something broke');
    process.exit(1);
  }
  if (q.includes('BOTQ')) {
    console.error("ERROR: [youtube] Sign in to confirm you're not a bot");
    process.exit(1);
  }
  if (q.includes('NONE')) process.exit(0);
  const mk = (id, title, duration, extra) => JSON.stringify({ id, title, duration, ...extra });
  console.log(mk('aaaaaaaaaaa', 'Lagu Satu ' + q, 185, { channel: 'Kanal A' }));
  console.log(mk('bbbbbbbbbbb', 'Lagu Dua', 240.4, { uploader: 'Pengunggah B' }));
  console.log(mk('liveliveliv', 'Siaran Langsung', null, {}));
  console.log(mk('longlonglon', 'Terlalu Panjang', 99999, {}));
  console.log(mk('bad id!!', 'Id Rusak', 100, {}));
  console.log(mk('aaaaaaaaaaa', 'Duplikat', 100, {}));
  process.exit(0);
}
const dashdash = args.lastIndexOf('--');
const url = dashdash >= 0 ? args[dashdash + 1] : '';
const id = (/v=([A-Za-z0-9_-]{11})/.exec(url) || [])[1] || 'unknown0000';
const tpl = args[args.indexOf('-o') + 1] || '';
const dir = path.dirname(tpl);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, 'argv.json'),
  JSON.stringify({ args, cwd: process.cwd(), env: Object.keys(process.env) }),
);

function wav(seconds, rate, freq) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 12000), 44 + i * 2);
  }
  return buf;
}

function succeed() {
  console.log('[download] Destination: ' + path.join(dir, id + '.webm'));
  console.log('[ExtractAudio] Destination: ' + path.join(dir, id + '.mp3'));
  fs.writeFileSync(path.join(dir, id + '.mp3'), wav(2, 8000, 440));
  fs.writeFileSync(
    path.join(dir, id + '.info.json'),
    JSON.stringify({ title: 'Judul Uji ' + id, duration: 2 }),
  );
  process.exit(0);
}

if (id.startsWith('FAIL')) {
  console.error(
    'ERROR: [youtube] ' + id + ': Private video. Sign in if you have been granted access',
  );
  process.exit(1);
} else if (id.startsWith('BOTX')) {
  console.error('ERROR: [youtube] ' + id + ": Sign in to confirm you're not a bot");
  process.exit(1);
} else if (id.startsWith('LONG')) {
  console.log('[download] ' + id + ' does not pass filter (duration<=1200), skipping ..');
  process.exit(0);
} else if (id.startsWith('NOFL')) {
  process.exit(0);
} else if (id.startsWith('HANG')) {
  setInterval(() => {}, 1000);
} else if (id.startsWith('SLOW')) {
  setTimeout(succeed, 400);
} else {
  succeed();
}
