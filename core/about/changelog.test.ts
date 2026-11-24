import { describe, expect, it } from 'vitest';
import { formatBuildTime, formatChangelogDate, inlineSegments, parseChangelog } from './changelog';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SAMPLE = `# Changelog

Pengantar yang diabaikan.

## 0.3.1 (2026-11-24)

- Satu **tebal** dan \`kode\`.
- Dua
  lanjutan baris.

## Belum dirilis

- Sesuatu

## 0.1.0 (2026-11-22)

- Awal
`;

describe('parseChangelog', () => {
  it('splits versions, dates and bullets', () => {
    const e = parseChangelog(SAMPLE);
    expect(e.map((x) => [x.version, x.date, x.items.length])).toEqual([
      ['0.3.1', '2026-11-24', 2],
      ['Belum dirilis', '', 1],
      ['0.1.0', '2026-11-22', 1],
    ]);
  });
  it('joins continuation lines and keeps the heading text of unversioned sections', () => {
    const e = parseChangelog(SAMPLE);
    expect(e[0]!.items[1]).toBe('Dua lanjutan baris.');
    expect(e[1]!.items).toEqual(['Sesuatu']);
  });
  it('handles CRLF and an empty file', () => {
    expect(parseChangelog('## 1.0.0 (2026-01-01)\r\n\r\n- a\r\n')[0]!.items).toEqual(['a']);
    expect(parseChangelog('')).toEqual([]);
  });
  it('reads the real CHANGELOG.md: newest version first, every version has notes', () => {
    const md = readFileSync(path.join(__dirname, '..', '..', 'CHANGELOG.md'), 'utf8');
    const e = parseChangelog(md);
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    expect(e.length).toBeGreaterThan(5);
    expect(e[0]!.version).toBe(pkg.version);
    for (const x of e) {
      expect(x.items.length).toBeGreaterThan(0);
      expect(x.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('inlineSegments', () => {
  it('separates code and bold from plain text', () => {
    expect(inlineSegments('a **b** c `d` e')).toEqual([
      { text: 'a ', kind: 'plain' },
      { text: 'b', kind: 'bold' },
      { text: ' c ', kind: 'plain' },
      { text: 'd', kind: 'code' },
      { text: ' e', kind: 'plain' },
    ]);
  });
  it('leaves text without markup, and unmatched markers, alone', () => {
    expect(inlineSegments('polos')).toEqual([{ text: 'polos', kind: 'plain' }]);
    expect(inlineSegments('a ** b')).toEqual([{ text: 'a ** b', kind: 'plain' }]);
    expect(inlineSegments('')).toEqual([]);
  });
});

describe('date formatting', () => {
  it('formats a build time in the local time zone', () => {
    const d = new Date(2026, 10, 24, 9, 5);
    expect(formatBuildTime(d.toISOString())).toBe('24 Nov 2026 09.05');
    expect(formatBuildTime(d.getTime())).toBe('24 Nov 2026 09.05');
    expect(formatBuildTime('bukan tanggal')).toBe('-');
  });
  it('formats changelog dates', () => {
    expect(formatChangelogDate('2026-11-24')).toBe('24 Nov 2026');
    expect(formatChangelogDate('2026-05-03')).toBe('3 Mei 2026');
    expect(formatChangelogDate('besok')).toBe('besok');
    expect(formatChangelogDate('')).toBe('');
  });
});
