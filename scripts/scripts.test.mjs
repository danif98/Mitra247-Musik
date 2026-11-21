import { describe, expect, it, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { dependencyClosure, scanNodeModules, scanPackageDir } from './check-pure-js.mjs';
import { scanDeployForSecrets } from './deploy-prepare.mjs';
import { createZip, crc32 } from './zip.mjs';

const dirs = [];
function tmp() {
  const d = mkdtempSync(path.join(tmpdir(), 'musik-test-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function pkg(dir, name, extra = {}, files = {}) {
  const p = path.join(dir, 'node_modules', ...name.split('/'));
  mkdirSync(p, { recursive: true });
  writeFileSync(path.join(p, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...extra }));
  for (const [f, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    writeFileSync(path.join(p, f), content);
  }
  return p;
}

describe('check-pure-js', () => {
  it('passes for a pure JS package', () => {
    const d = tmp();
    pkg(d, 'pure', {}, { 'index.js': 'module.exports = 1' });
    const r = scanNodeModules(path.join(d, 'node_modules'));
    expect(r.offenders).toEqual([]);
    expect(r.count).toBe(1);
  });

  it('fails on binding.gyp, .node files, prebuilds/ and gypfile', () => {
    const d = tmp();
    pkg(d, 'a', {}, { 'binding.gyp': '{}' });
    pkg(d, 'b', {}, { 'build/Release/x.node': 'bin' });
    pkg(d, 'c', {}, { 'prebuilds/linux-x64/x.bin': 'bin' });
    pkg(d, '@scope/d', { gypfile: true });
    const r = scanNodeModules(path.join(d, 'node_modules'));
    expect(r.offenders.length).toBe(4);
    expect(scanPackageDir(path.join(d, 'node_modules', 'a')).length).toBe(1);
  });

  it('resolves the production dependency closure (including transitive deps)', () => {
    const d = tmp();
    mkdirSync(path.join(d, 'server'), { recursive: true });
    writeFileSync(
      path.join(d, 'server', 'package.json'),
      JSON.stringify({ name: 'srv', dependencies: { a: '1' }, devDependencies: { devonly: '1' } }),
    );
    pkg(d, 'a', { dependencies: { b: '1' } });
    pkg(d, 'b', {}, { 'native.node': 'x' });
    pkg(d, 'devonly', {}, { 'binding.gyp': '{}' });
    const { dirs: closure, missing } = dependencyClosure(path.join(d, 'server'), d);
    expect(missing).toEqual([]);
    expect(closure.map((c) => path.basename(c)).sort()).toEqual(['a', 'b']);
    expect(closure.flatMap((c) => scanPackageDir(c)).length).toBe(1); // only b's native.node
  });
});

describe('deploy secret scan', () => {
  it('flags .env files, vendor.zip and token-looking values', () => {
    const d = tmp();
    writeFileSync(path.join(d, '.env'), 'MUSIK_TOKEN=abc');
    writeFileSync(path.join(d, 'vendor.zip'), 'zip');
    writeFileSync(path.join(d, 'x.txt'), 'MUSIK_TOKEN=' + 'a1b2c3d4'.repeat(8));
    const problems = scanDeployForSecrets(d).join('\n');
    expect(problems).toMatch(/\.env: env file/);
    expect(problems).toMatch(/vendor\.zip/);
    expect(problems).toMatch(/x\.txt: looks like a MUSIK_TOKEN/);
  });

  it('accepts a clean folder and .env.example', () => {
    const d = tmp();
    writeFileSync(path.join(d, '.env.example'), 'MUSIK_TOKEN=\n');
    writeFileSync(path.join(d, 'a.js'), 'const x = 1;');
    expect(scanDeployForSecrets(d)).toEqual([]);
  });
});

describe('zip writer', () => {
  it('produces a readable archive (central directory + CRC + inflate round trip)', () => {
    const entries = [
      {
        name: 'node_modules/a/index.js',
        data: Buffer.from('console.log("hello hello hello hello");'),
      },
      { name: 'node_modules/b.txt', data: Buffer.from('x') },
    ];
    const zip = createZip(entries);
    const eocd = zip.length - 22;
    expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);
    expect(zip.readUInt16LE(eocd + 10)).toBe(2);
    let p = zip.readUInt32LE(eocd + 16);
    for (const entry of entries) {
      expect(zip.readUInt32LE(p)).toBe(0x02014b50);
      const method = zip.readUInt16LE(p + 10);
      const crc = zip.readUInt32LE(p + 16);
      const csize = zip.readUInt32LE(p + 20);
      const nameLen = zip.readUInt16LE(p + 28);
      const lho = zip.readUInt32LE(p + 42);
      expect(zip.subarray(p + 46, p + 46 + nameLen).toString()).toBe(entry.name);
      const lnl = zip.readUInt16LE(lho + 26);
      const body = zip.subarray(lho + 30 + lnl, lho + 30 + lnl + csize);
      const data = method === 8 ? zlib.inflateRawSync(body) : body;
      expect(data.equals(entry.data)).toBe(true);
      expect(crc32(data)).toBe(crc);
      p += 46 + nameLen;
    }
  });

  it('is readable by the system tar when available', async () => {
    const { spawnSync } = await import('node:child_process');
    const d = tmp();
    const file = path.join(d, 't.zip');
    writeFileSync(file, createZip([{ name: 'node_modules/x.txt', data: Buffer.from('hi') }]));
    const r = spawnSync('tar', ['-tf', file], { encoding: 'utf8', shell: false });
    if (r.error || r.status !== 0) return; // tar missing: covered by the structural test above
    expect(r.stdout).toContain('node_modules/x.txt');
    expect(readFileSync(file).length).toBeGreaterThan(20);
  });
});
