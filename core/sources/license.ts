/**
 * Only works under a Creative Commons license or in the public domain are offered.
 * Anything else (no license, "all rights reserved", unknown text) is dropped, never guessed.
 */
import type { License } from './types';

const CC_BASE = 'https://creativecommons.org';

function cc(parts: string, version: string): License | null {
  const p = parts.toLowerCase();
  if (!/^by(-nc)?(-sa|-nd)?$/.test(p)) return null;
  const v = /^\d\.\d$/.test(version) ? version : '4.0';
  return {
    label: `CC ${p.toUpperCase()} ${v}`,
    url: `${CC_BASE}/licenses/${p}/${v}/`,
    commercial: !p.includes('-nc'),
    derivatives: !p.includes('-nd'),
  };
}

export const CC0: License = {
  label: 'CC0',
  url: `${CC_BASE}/publicdomain/zero/1.0/`,
  commercial: true,
  derivatives: true,
};

export const PUBLIC_DOMAIN: License = {
  label: 'Domain publik',
  url: `${CC_BASE}/publicdomain/mark/1.0/`,
  commercial: true,
  derivatives: true,
};

/** From a creativecommons.org URL (Internet Archive `licenseurl`, Commons `LicenseUrl`). */
export function licenseFromUrl(url: string | null | undefined): License | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)creativecommons\.org$/i.test(u.hostname)) return null;
  const segs = u.pathname.split('/').filter(Boolean);
  if (segs[0] === 'publicdomain') {
    if (segs[1] === 'zero') return CC0;
    if (segs[1] === 'mark') return PUBLIC_DOMAIN;
    return PUBLIC_DOMAIN; // legacy /licenses/publicdomain/ style
  }
  if (segs[0] !== 'licenses') return null;
  if (segs[1] === 'publicdomain') return PUBLIC_DOMAIN;
  return cc(segs[1] ?? '', segs[2] ?? '');
}

/** Openverse `license` ("by-sa", "cc0", "pdm") and `license_version`. */
export function licenseFromOpenverse(
  license: string | null | undefined,
  version: string | null | undefined,
): License | null {
  const l = (license ?? '').toLowerCase();
  if (l === 'cc0') return CC0;
  if (l === 'pdm') return PUBLIC_DOMAIN;
  return cc(l, version ?? '');
}

/** Wikimedia `LicenseShortName` such as "CC BY-SA 4.0", "CC0", "Public domain". */
export function licenseFromShortName(name: string | null | undefined): License | null {
  const n = (name ?? '').trim();
  if (/^cc0\b/i.test(n)) return CC0;
  if (/^public domain\b/i.test(n) || /^pd\b/i.test(n)) return PUBLIC_DOMAIN;
  const m = /^cc[ -]by((?:-nc)?(?:-sa|-nd)?)(?:[ -](\d\.\d))?/i.exec(n);
  if (!m) return null;
  return cc(`by${m[1] ?? ''}`, m[2] ?? '');
}
