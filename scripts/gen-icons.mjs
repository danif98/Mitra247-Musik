// Generates placeholder PWA icons (PNG) without external dependencies.
// Usage: node scripts/gen-icons.mjs   (writes to app-pwa/public/)
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'app-pwa', 'public');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Dark background with an accent disc and a bar glyph, content kept inside the maskable safe zone. */
function renderIcon(size) {
  const bg = [0x0f, 0x11, 0x15];
  const accent = [0x4c, 0xc2, 0xff];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.32; // within the 40% radius safe zone
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      let col = bg;
      if (d <= r) {
        col = accent;
        // three vertical "level" bars inside the disc
        const u = (x + 0.5 - cx) / r;
        const v = (y + 0.5 - cy) / r;
        for (const [bx, h] of [
          [-0.42, 0.35],
          [0, 0.6],
          [0.42, 0.45],
        ]) {
          if (Math.abs(u - bx) < 0.12 && Math.abs(v) < h) col = bg;
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = col[0];
      raw[o + 1] = col[1];
      raw[o + 2] = col[2];
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(path.join(outDir, `icon-${size}.png`), renderIcon(size));
  writeFileSync(path.join(outDir, `icon-maskable-${size}.png`), renderIcon(size));
}
writeFileSync(
  path.join(outDir, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0f1115"/><circle cx="256" cy="256" r="164" fill="#4cc2ff"/><g fill="#0f1115"><rect x="176" y="196" width="40" height="120" rx="8"/><rect x="236" y="154" width="40" height="204" rx="8"/><rect x="296" y="182" width="40" height="148" rx="8"/></g></svg>\n`,
);
console.log(`Icons written to ${outDir}`);
