/**
 * "Tentang" helpers: split CHANGELOG.md into versions, format its inline markup without HTML, and
 * format a build time. Pure functions (unit-tested).
 */

export interface ChangelogEntry {
  /** "0.3.1" (or the heading text when it has no version/date shape, e.g. "Belum dirilis"). */
  version: string;
  /** "2026-11-24" or "" when the heading has no date. */
  date: string;
  /** One string per bullet, inline markdown not interpreted. */
  items: string[];
}

/** Versions in file order (newest first in CHANGELOG.md). Text before the first "## " is ignored. */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(raw);
    if (heading) {
      const m = /^(\S+)(?:\s+\((.*)\))?$/.exec(heading[1]!);
      current = {
        version: m ? m[1]! : heading[1]!,
        date: m?.[2] ?? '',
        items: [],
      };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const bullet = /^[-*]\s+(.*)$/.exec(raw);
    if (bullet) current.items.push(bullet[1]!.trim());
    else if (/^\s+\S/.test(raw) && current.items.length > 0) {
      // continuation line of the previous bullet
      current.items[current.items.length - 1] += ' ' + raw.trim();
    }
  }
  return entries;
}

export interface InlineSegment {
  text: string;
  kind: 'plain' | 'code' | 'bold';
}

/** Splits `code` and **bold** into segments so the UI can render them without {@html}. */
export function inlineSegments(text: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), kind: 'plain' });
    if (m[1] !== undefined) out.push({ text: m[1], kind: 'code' });
    else out.push({ text: m[2]!, kind: 'bold' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: 'plain' });
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const two = (n: number) => String(n).padStart(2, '0');

/** "24 Nov 2026 09.20" in the device's time zone; "-" for an invalid value. */
export function formatBuildTime(value: string | number | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${two(d.getHours())}.${two(d.getMinutes())}`;
}

/** "2026-11-24" -> "24 Nov 2026"; anything else is returned unchanged. */
export function formatChangelogDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : date;
}
